"use strict";
const { AuthMailDispatcher } = require("./auth-mail");

// One send at a time. No timers, queries or provider requests before start/tick.
class AuthMailLoop {
  constructor({ store, sender, expiresAt, now = Date.now }) {
    this.expiry = Date.parse(expiresAt); this.now = now;
    if (!/^migration_auth_preview_[a-f0-9]{12}$/.test(store?.schema || "")
      || !Number.isFinite(this.expiry) || this.expiry <= now() || this.expiry > now() + 7 * 86400000) throw Error("An expiring private account copy is required");
    this.store = store; this.stopped = false; this.pending = null; this.timer = null; this.expiryTimer = null;
    this.lastSuccess = 0; this.failures = 0; this.consecutiveFailures = 0; this.controller = new AbortController();
    this.dispatcher = new AuthMailDispatcher({ store, sender: { send: async mail => {
      // Recheck after the claim commits; a database wait can cross expiry/stop.
      if (this.stopped || this.now() >= this.expiry) throw Object.assign(Error("Delivery stopped"), { code: "network", retryable: true });
      return sender.send({ ...mail, signal: this.controller.signal });
    } } });
  }
  async tick() {
    if (this.stopped || this.pending) return false;
    if (this.now() >= this.expiry) { this.stop(); return false; }
    this.pending = Promise.resolve().then(async () => {
      try {
        await this.dispatcher.deliverOne(); this.lastSuccess = this.now(); this.consecutiveFailures = 0; return true;
      } catch { this.failures++; this.consecutiveFailures++; return false; }
    });
    try { return await this.pending; } finally { this.pending = null; }
  }
  start() {
    if (this.timer || this.stopped) throw Error("Mail loop already started or stopped");
    const cycle = async () => {
      await this.tick();
      if (!this.stopped) this.timer = setTimeout(cycle, 1000);
    };
    this.expiryTimer = setTimeout(() => this.stop(), this.expiry - this.now());
    this.timer = setTimeout(cycle, 0);
  }
  async status() {
    const result = (await this.store.pool.query(`SELECT
      count(*) FILTER (WHERE status='pending')::integer AS pending,
      count(*) FILTER (WHERE status='accepted')::integer AS accepted,
      count(*) FILTER (WHERE status IN ('failed','attempts-exhausted','invalid-message','expired'))::integer AS failed,
      coalesce(extract(epoch FROM clock_timestamp()-min(created_at) FILTER (WHERE status='pending')),0)::integer AS oldest
      FROM ${this.store.schema}.auth_mail`)).rows[0];
    const queue = { pending: result.pending, accepted: result.accepted, failed: result.failed, oldestPendingSeconds: Math.max(0, result.oldest) };
    const healthy = !this.stopped && this.now() < this.expiry && this.lastSuccess > 0 && this.now() - this.lastSuccess < 30000
      && this.consecutiveFailures === 0 && queue.failed === 0 && queue.oldestPendingSeconds < 300;
    return { rehearsal: true, stopped: this.stopped, healthy, expiresAt: new Date(this.expiry).toISOString(),
      recordedAt: new Date(this.now()).toISOString(), lastSuccessfulTick: this.lastSuccess ? new Date(this.lastSuccess).toISOString() : null,
      operationalFailures: this.failures, consecutiveFailures: this.consecutiveFailures, active: this.pending ? 1 : 0, queue };
  }
  stop() { this.stopped = true; clearTimeout(this.timer); clearTimeout(this.expiryTimer); this.controller.abort(); }
  async settle() { await this.pending; }
}
module.exports = { AuthMailLoop };
