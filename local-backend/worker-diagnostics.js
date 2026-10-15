"use strict";

// Existing game handlers log identifiers and report/error payloads. Only these
// source-defined labels, reviewed codes and numeric outcome counts may escape
// the private worker. Unknown input is counted without retaining any of it.
const labels = new Set([
  "Inactive-player maintenance failed", "Daily mission generation failed",
  "New Lands activation preparation will be retried by maintenance",
  "Daily mission event processing failed", "Seasonal Achievement action event processing failed",
  "Seasonal Achievement Realm event processing failed", "Citadel assault target resolution failed",
  "Scheduled army resolution failed", "Scheduled reward camp payout failed", "Pending Deed city retry failed",
  "Scheduled army resolution finished", "Scheduled reward camp payouts finished",
  "Retrying Crownlands Firestore transaction", "Deed Camp city reserved until an eligible city is available",
]);
const codes = new Set([
  "40001", "40P01", "57014", "23505", "23503", "23514", "22003", "22023", "42501",
  "job-lease-lost", "job-worker-stopping", "job-timeout", "permission-denied", "not-found",
  "failed-precondition", "invalid-argument", "resource-exhausted", "aborted", "already-exists",
  "deadline-exceeded", "unavailable", "internal", "unauthenticated",
]);
const countKeys = ["scanned", "resolved", "skipped", "failed", "paid", "backlogPending"];
const levels = ["log", "warn", "error", "info", "debug"];
const ownValue = (object, key) => object && typeof object === "object"
  ? Object.getOwnPropertyDescriptor(object, key)?.value : undefined;

class WorkerDiagnostics {
  constructor() {
    this.counts = Object.fromEntries(levels.map(level => [level, 0]));
    this.events = new Map();
  }
  record(level, label, details) {
    if (!levels.includes(level)) return;
    this.counts[level]++;
    if (!labels.has(label)) return;
    const key = level + ":" + label;
    let event = this.events.get(key);
    if (!event) { event = { level, label, count: 0, codes: {}, outcomes: {} }; this.events.set(key, event); }
    event.count++;
    const supplied = ownValue(details, "code");
    const code = codes.has(supplied) ? supplied : "unspecified";
    if (level === "warn" || level === "error") event.codes[code] = (event.codes[code] || 0) + 1;
    if (label.endsWith(" finished")) for (const name of countKeys) {
      const value = ownValue(details, name);
      if (Number.isSafeInteger(value) && value >= 0) event.outcomes[name] = (event.outcomes[name] || 0) + value;
    }
  }
  snapshot() { return structuredClone({ counts: this.counts, events: [...this.events.values()] }); }
  capture(target = console) {
    const original = Object.fromEntries(levels.map(level => [level, target[level]]));
    for (const level of levels) target[level] = (...args) => this.record(level, ...args);
    return () => { for (const level of levels) target[level] = original[level]; };
  }
}
module.exports = { WorkerDiagnostics };
