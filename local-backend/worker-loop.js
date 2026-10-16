"use strict";
const { JobQueue } = require("./jobs");

// Provider delivery is intentionally absent from the private copied game.
// A production worker needs a separately reviewed provider/cutover contract.
function privateWorkerRoutes(routes) {
  const background = routes.filter(route => ["created", "written", "schedule"].includes(route.kind));
  const notification = background.filter(route => route.name === "deliverIncomingArmyNotification" && route.kind === "created");
  if (background.length !== 26 || notification.length !== 1) throw Error("Review the changed background-handler inventory");
  return background.filter(route => route !== notification[0]);
}

class WorkerLoop {
  constructor({ queue, expiresAt, deployment, now = Date.now }) {
    const permanent = require("./deployment-policy").isPolicy(deployment, queue?.schema);
    const expiry = permanent ? Infinity : Date.parse(expiresAt);
    if (!(queue instanceof JobQueue) || (deployment && !permanent) || (!permanent && (!Number.isFinite(expiry) || expiry <= now() || expiry > now() + 7 * 86400000))) throw Error("An expiring private worker is required");
    this.deployment = deployment;
    this.queue = queue; this.expiry = expiry; this.now = now;
    queue.stopAt = Math.min(queue.stopAt, expiry);
    this.pending = new Set(); this.stopped = false; this.ticking = false; this.timer = null;
    this.lastSuccess = 0; this.failures = 0;
  }
  async tick() {
    if (this.stopped || this.ticking) return false;
    if (this.now() >= this.expiry) { this.stop(); return false; }
    this.ticking = true;
    try {
      await this.deployment?.assertActive();
      await this.queue.dispatchChanges(200);
      await this.queue.enqueueSchedules(this.now());
      if (this.stopped || this.now() >= this.expiry) { this.stop(); return false; }
      for (let i = this.pending.size; i < this.queue.maxActive; i++) {
        const task = this.drain().catch(() => { this.failures++; });
        this.pending.add(task); task.finally(() => this.pending.delete(task));
      }
      this.lastSuccess = this.now();
      return true;
    } catch { this.failures++; return false; }
    finally { this.ticking = false; }
  }
  async drain() {
    // Refill a finished slot immediately. The polling timer still dispatches
    // new changes/schedules and checks authority once a second. Each lane is
    // bounded, and JobQueue retains its concurrency, handler-order and lease
    // guards, including slots held by handlers that outlive their deadline.
    for (let i = 0; i < 32 && !this.stopped; i++) {
      if (this.now() >= this.expiry) { this.stop(); break; }
      if (!await this.queue.runOne()) break;
    }
  }
  start() {
    if (this.timer || this.stopped) throw Error("Worker loop already started or stopped");
    const cycle = async () => {
      await this.tick();
      if (!this.stopped) this.timer = setTimeout(cycle, 1000);
    };
    this.timer = setTimeout(cycle, 0);
  }
  async status() {
    const s = this.queue.schema;
    const rows = (await this.queue.controlStore.pool.query(`SELECT status,count(*) AS count FROM ${s}.work_jobs GROUP BY status`)).rows;
    const counts = { pending: 0, running: 0, complete: 0, dead: 0 };
    for (const row of rows) counts[row.status] = Number(row.count);
    return { rehearsal: !this.deployment, stopped: this.stopped, expiresAt: Number.isFinite(this.expiry) ? new Date(this.expiry).toISOString() : null,
      lastSuccessfulTick: this.lastSuccess ? new Date(this.lastSuccess).toISOString() : null,
      operationalFailures: this.failures, activeHandlers: this.queue.active, jobs: counts };
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.queue.stop(); }
  async settle() { await Promise.allSettled([...this.pending]); }
}
module.exports = { WorkerLoop, privateWorkerRoutes };
