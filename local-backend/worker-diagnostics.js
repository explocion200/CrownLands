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
  "PostgreSQL client concurrent-query deprecation",
]);
const codes = new Set([
  "40001", "40P01", "57014", "23505", "23503", "23514", "22003", "22023", "42501",
  "job-lease-lost", "job-worker-stopping", "job-timeout", "permission-denied", "not-found",
  "failed-precondition", "invalid-argument", "resource-exhausted", "aborted", "already-exists",
  "deadline-exceeded", "unavailable", "internal", "unauthenticated",
]);
const countKeys = ["scanned", "resolved", "skipped", "failed", "paid", "backlogPending"];
const levels = ["log", "warn", "error", "info", "debug"];
const timingCounters = ["dbWriteQueries", "dbWriteRows", "transactionAttempts", "dbReadQueries", "dbReadRows", "dbTransactionAttempts", "dbSerializationFailures", "dbDeadlocks", "dbRetries", "dbDocumentCacheHits", "routeCacheHits", "routeCacheMisses"];
const timingPhases = ["realmContext", "worldValidation", "documentReads", "economyPreparation", "routePlanning", "transaction", "dbPoolWait", "dbRead", "dbWrite", "dbCommit", "dbBackoff"];
const arrivalSampleLimit = 32;
const durationBoundsMs = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 1000000];
const total = (a, b) => Math.min(Number.MAX_SAFE_INTEGER, a + b);
function observe(aggregate, value) {
  aggregate.count = total(aggregate.count, 1); aggregate.sum = total(aggregate.sum, value);
  aggregate.max = Math.max(aggregate.max, value);
  const bucket = durationBoundsMs.findIndex(bound => value <= bound);
  aggregate.buckets[bucket] = total(aggregate.buckets[bucket], 1);
}
const distribution = () => ({ count: 0, sum: 0, max: 0, buckets: durationBoundsMs.map(() => 0) });
const pgNotice = "DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.\n(Use `node --trace-deprecation ...` to show where the warning was created)";
const ownValue = (object, key) => object && typeof object === "object"
  ? Object.getOwnPropertyDescriptor(object, key)?.value : undefined;
const boundedNumber = value => typeof value === "number" && Number.isFinite(value) && value >= 0
  ? Math.min(1000000, Math.round(value)) : undefined;

function arrivalSample(details) {
  const operation = ownValue(details, "operation"), outcome = ownValue(details, "outcome");
  const requestDurationMs = boundedNumber(ownValue(details, "requestDurationMs"));
  if (operation !== "scheduledArmyArrival" || !["resolved", "skipped", "error"].includes(outcome) || requestDurationMs === undefined) return null;
  const sample = { operation, outcome, requestDurationMs, phaseDurationMs: {} };
  const queueDelayMs = boundedNumber(ownValue(details, "queueDelayMs"));
  if (queueDelayMs !== undefined) sample.queueDelayMs = queueDelayMs;
  for (const key of timingCounters) {
    const value = boundedNumber(ownValue(details, key));
    if (value !== undefined) sample[key] = value;
  }
  const phases = ownValue(details, "phaseDurationMs");
  for (const key of timingPhases) {
    const value = boundedNumber(ownValue(phases, key));
    if (value !== undefined) sample.phaseDurationMs[key] = value;
  }
  return sample;
}

class WorkerDiagnostics {
  constructor() {
    this.counts = Object.fromEntries(levels.map(level => [level, 0]));
    this.events = new Map();
    this.arrivalTimings = [];
    this.arrivalAggregate = { since: new Date().toISOString(), samples: 0, outcomes: { resolved: 0, skipped: 0, error: 0 },
      durationBoundsMs, request: distribution(), queueDelay: distribution(),
      phases: Object.fromEntries(timingPhases.map(key => [key, distribution()])), counters: Object.fromEntries(timingCounters.map(key => [key, 0])) };
  }
  record(level, label, details) {
    if (!levels.includes(level)) return;
    // Node sends deprecation warnings through console.error. Recognize only
    // the exact installed driver's static notice, never arbitrary substrings.
    if (level === "error" && typeof label === "string" && label.replace(/^\(node:\d+\) /, "") === pgNotice) {
      level = "warn"; label = "PostgreSQL client concurrent-query deprecation";
    }
    this.counts[level]++;
    // Permanent workers intercept console output. Retain only a small numeric
    // window in their private status, without forwarding raw handler payloads.
    if (level === "log" && label === "crownlands_arrival_timing") {
      const sample = arrivalSample(details);
      if (sample) {
        const aggregate = this.arrivalAggregate;
        aggregate.samples = total(aggregate.samples, 1); aggregate.outcomes[sample.outcome] = total(aggregate.outcomes[sample.outcome], 1);
        observe(aggregate.request, sample.requestDurationMs);
        if (sample.queueDelayMs !== undefined) observe(aggregate.queueDelay, sample.queueDelayMs);
        for (const [phase, value] of Object.entries(sample.phaseDurationMs)) observe(aggregate.phases[phase], value);
        for (const key of timingCounters) aggregate.counters[key] = total(aggregate.counters[key], sample[key] || 0);
        this.arrivalTimings.push(sample);
        if (this.arrivalTimings.length > arrivalSampleLimit) this.arrivalTimings.shift();
      }
      return;
    }
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
  snapshot() { return structuredClone({ counts: this.counts, events: [...this.events.values()], ...(this.arrivalTimings.length ? { arrivalTimings: this.arrivalTimings, arrivalAggregate: this.arrivalAggregate } : {}) }); }
  capture(target = console) {
    const original = Object.fromEntries(levels.map(level => [level, target[level]]));
    for (const level of levels) target[level] = (...args) => this.record(level, ...args);
    return () => { for (const level of levels) target[level] = original[level]; };
  }
}
module.exports = { WorkerDiagnostics };
