"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");
const { performance } = require("node:perf_hooks");
const context = new AsyncLocalStorage();
const phases = new Set(["realmContext", "worldValidation", "documentReads", "routePlanning", "transaction"]);

function run(operation) {
  return context.run({ startedAt: performance.now(), phases: {}, transactionAttempts: 0 }, operation);
}

function measure(phase, operation) {
  const timing = context.getStore();
  if (!timing || !phases.has(phase)) return operation();
  const startedAt = performance.now();
  const finish = () => { timing.phases[phase] = (timing.phases[phase] || 0) + performance.now() - startedAt; };
  try {
    const result = operation();
    if (result && typeof result.then === "function") return Promise.resolve(result).finally(finish);
    finish();
    return result;
  } catch (error) {
    finish();
    throw error;
  }
}

function transactionAttempt() {
  const timing = context.getStore();
  if (timing) timing.transactionAttempts += 1;
}

// Only bounded operational dimensions belong in logs, never order/player IDs.
function scout(details = {}) {
  const timing = context.getStore();
  if (!timing) return;
  const dimensions = timing.scout ||= {};
  for (const [key, values] of Object.entries({
    scoutStage: ["launch", "arrival"], scoutSourceType: ["city", "tower"],
    scoutTargetType: ["city", "camp", "tower"],
  })) {
    if (values.includes(details[key])) dimensions[key] = details[key];
  }
  for (const key of ["scoutBatchSize", "scoutOriginCandidates"]) {
    if (Number.isFinite(details[key])) dimensions[key] = Math.min(100000, Math.max(0, Math.floor(details[key])));
  }
}

function routeCache(hit) {
  const timing = context.getStore();
  if (!timing) return;
  const key = hit ? "routeCacheHits" : "routeCacheMisses";
  timing[key] = (timing[key] || 0) + 1;
}

function snapshot() {
  const timing = context.getStore();
  if (!timing) return {};
  return {
    requestDurationMs: Math.round(performance.now() - timing.startedAt),
    transactionAttempts: timing.transactionAttempts,
    phaseDurationMs: Object.fromEntries(Object.entries(timing.phases).map(([phase, duration]) => [phase, Math.round(duration)])),
    ...(timing.scout || {}),
    ...(timing.routeCacheHits || timing.routeCacheMisses ? {
      routeCacheHits: timing.routeCacheHits || 0, routeCacheMisses: timing.routeCacheMisses || 0,
    } : {}),
  };
}

module.exports = { run, measure, transactionAttempt, scout, routeCache, snapshot };
