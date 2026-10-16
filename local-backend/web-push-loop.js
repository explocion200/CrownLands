"use strict";
const crypto = require("node:crypto");
const { FieldValue } = require("./store");
const { deliverNotificationOutbox } = require("../functions/notification-delivery");
const { PREFIX, subscription, failure } = require("./web-push");
const SCOPE_FIELDS = ["schema", "ownerUid", "notBefore", "expiresAt", "attemptLimit", "reservationId", "publicKey"];
function validateScope(scope, now = Date.now()) {
  if (!scope || Object.keys(scope).sort().join() !== [...SCOPE_FIELDS].sort().join()
    || !/^migration_game_preview_[a-f0-9]{12}$/.test(scope.schema || "")
    || !/^[A-Za-z0-9_-]{1,128}$/.test(scope.ownerUid || "") || !/^[a-f0-9]{32}$/.test(scope.reservationId || "")
    || !Number.isSafeInteger(scope.notBefore) || scope.notBefore > now || scope.notBefore < now - 7 * 86400000
    || !Number.isSafeInteger(scope.attemptLimit) || scope.attemptLimit < 1 || scope.attemptLimit > 5
    || !Number.isFinite(Date.parse(scope.expiresAt)) || Date.parse(scope.expiresAt) <= now || Date.parse(scope.expiresAt) > now + 7 * 86400000
    || !/^[A-Za-z0-9_-]{87}$/.test(scope.publicKey || "")) throw failure();
  return Object.freeze({ ...scope });
}
function budgetPath(scope) { return "localPushReservations/" + scope.reservationId; }
class WebPushLoop {
  constructor({ store, sender, scope, now = Date.now }) {
    this.scope = validateScope(scope, now());
    if (store.schema !== scope.schema || sender.keys.publicKey !== scope.publicKey) throw failure();
    this.store = store; this.sender = sender; this.now = now; this.expiry = Date.parse(scope.expiresAt);
    this.stopped = false; this.pending = null; this.timer = null; this.expiryTimer = null;
    this.lastSuccess = 0; this.failures = 0; this.consecutiveFailures = 0; this.controller = new AbortController();
  }
  assertActive() { if (this.stopped || this.now() >= this.expiry) throw failure("push-stopped"); }
  checkBudget(value) {
    if (!value || SCOPE_FIELDS.some(key => value[key] !== this.scope[key]) || !Number.isInteger(value.attempts)
      || value.attempts < 0 || value.attempts > this.scope.attemptLimit) throw failure();
    return value;
  }
  async reserve() {
    await this.store.runTransaction(async tx => {
      this.assertActive(); const ref = this.store.doc(budgetPath(this.scope));
      const budget = this.checkBudget((await tx.get(ref)).data()); this.assertActive();
      if (budget.attempts >= this.scope.attemptLimit) throw failure("push-limit");
      tx.update(ref, { attempts: budget.attempts + 1 });
    });
    this.assertActive();
  }
  async send(notification, completed = []) {
    this.assertActive();
    const result = { deliveredTokenIds: [], completedTokenIds: [], retryError: null };
    if (notification.defenderUid !== this.scope.ownerUid) throw failure();
    const tokens = await this.store.collection(`players/${this.scope.ownerUid}/notificationTokens`).where("enabled", "==", true).limit(100).get();
    for (const document of tokens.docs) {
      this.assertActive(); const value = document.data();
      if (completed.includes(document.id) || !value.token?.startsWith(PREFIX)) continue;
      try { subscription(value.token, this.scope.publicKey); } catch { continue; }
      // Tokens copied from live Firebase are never sent, deleted or interpreted.
      // Require a fresh registration against this preview's key and device ID.
      if (value.uid !== this.scope.ownerUid || !/^[A-Za-z0-9_-]{20,160}$/.test(value.installationId || "")
        || !Number.isFinite(value.lastSeenAtMs) || value.lastSeenAtMs < this.scope.notBefore) continue;
      const current = await document.ref.get(); this.assertActive();
      if (!current.exists || current.data().enabled !== true || current.data().token !== value.token) continue;
      try {
        const topic = crypto.createHash("sha256").update(JSON.stringify([notification.armyId, notification.defenderUid])).digest("base64url").slice(0, 32);
        const response = await this.sender.send(value.token, notification, { reserve: () => this.reserve(), signal: this.controller.signal, topic });
        if (response.accepted) result.deliveredTokenIds.push(document.id);
        if (response.gone) await this.store.runTransaction(async tx => {
          const latest = await tx.get(document.ref);
          if (latest.exists && latest.data().token === value.token) tx.delete(document.ref);
        });
        result.completedTokenIds.push(document.id);
      } catch (error) { result.retryError = failure(error.code); break; }
    }
    return result;
  }
  async tick() {
    if (this.stopped || this.pending) return false;
    if (this.now() >= this.expiry) { this.stop(); return false; }
    this.pending = Promise.resolve().then(async () => {
      try {
        const budget = this.checkBudget((await this.store.doc(budgetPath(this.scope)).get()).data()); this.assertActive();
        if (budget.attempts >= this.scope.attemptLimit) { this.stop(); return false; }
        const queue = await this.store.collection("serverNotificationOutbox")
          .where("type", "==", "incoming_army")
          .where("notification.defenderUid", "==", this.scope.ownerUid).where("createdAtMs", ">=", this.scope.notBefore)
          .where("status", "in", ["pending", "processing"]).orderBy("createdAtMs").limit(20).get();
        this.assertActive();
        const item = queue.docs.find(doc => !(Number(doc.data().deliveryLeaseUntilMs) > this.now()));
        if (item) await deliverNotificationOutbox(item.ref, { db: this.store, send: (...args) => this.send(...args), fieldValue: FieldValue, now: this.now });
        this.lastSuccess = this.now(); this.consecutiveFailures = 0; return true;
      } catch { this.failures++; this.consecutiveFailures++; return false; }
    });
    try { return await this.pending; } finally { this.pending = null; }
  }
  start() {
    if (this.timer || this.stopped) throw failure();
    const cycle = async () => { await this.tick(); if (!this.stopped) this.timer = setTimeout(cycle, Math.min(60000, 2000 * 2 ** Math.min(5, this.consecutiveFailures))); };
    this.expiryTimer = setTimeout(() => this.stop(), this.expiry - this.now());
    this.timer = setTimeout(cycle, 0);
  }
  async status() {
    const budget = this.checkBudget((await this.store.doc(budgetPath(this.scope)).get()).data());
    return { rehearsal: true, stopped: this.stopped, healthy: !this.stopped && this.now() < this.expiry && this.lastSuccess > 0
      && this.now() - this.lastSuccess < 30000 && this.consecutiveFailures === 0,
      expiresAt: this.scope.expiresAt, attempts: budget.attempts, attemptLimit: this.scope.attemptLimit,
      lastSuccessfulTick: this.lastSuccess ? new Date(this.lastSuccess).toISOString() : null, operationalFailures: this.failures };
  }
  stop() { this.stopped = true; clearTimeout(this.timer); clearTimeout(this.expiryTimer); this.controller.abort(); this.sender.stop(); }
  async settle() { await this.pending; }
}
module.exports = { validateScope, budgetPath, WebPushLoop };
