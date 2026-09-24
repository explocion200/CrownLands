"use strict";
const PHASES = ["realmContext", "worldValidation", "documentReads", "routePlanning", "transaction"];
function scoutTiming(entry) {
  const payload = entry.jsonPayload || {};
  const text = String(entry.textPayload || payload.message || "");
  const result = {};
  for (const [key, values] of Object.entries({
    scoutStage: ["launch", "arrival"], scoutSourceType: ["city", "tower"], scoutTargetType: ["city", "camp", "tower"],
  })) {
    const value = payload[key] || text.match(new RegExp("\\b" + key + "\\s*:\\s*['\"]([^'\"]+)['\"]"))?.[1];
    if (values.includes(value)) result[key] = value;
  }
  for (const key of ["scoutBatchSize", "scoutOriginCandidates", "routeCacheHits", "routeCacheMisses"]) {
    const value = typeof payload[key] === "number" ? payload[key]
      : Number(text.match(new RegExp("\\b" + key + "\\s*:\\s*(\\d+)"))?.[1] ?? NaN);
    if (Number.isFinite(value) && value >= 0) result[key] = Math.min(100000, Math.floor(value));
  }
  return result;
}
// Node console.log(message, object) can arrive as text rather than structured JSON.
// Extract only the allowlisted numeric fields; never evaluate or export the payload.
function operationTiming(entry) {
  const payload = entry.jsonPayload || {};
  if (typeof payload.requestDurationMs === "number") return {
    ...scoutTiming(entry),
    requestDurationMs: payload.requestDurationMs,
    transactionAttempts: Number(payload.transactionAttempts) || 0,
    phaseDurationMs: Object.fromEntries(PHASES.filter(key => typeof payload.phaseDurationMs?.[key] === "number")
      .map(key => [key, payload.phaseDurationMs[key]])),
  };
  const text = String(entry.textPayload || payload.message || "");
  if (!text.includes("crownlands_operation")) return null;
  const number = key => {
    const match = text.match(new RegExp(`(?:^|[\\s,{])['\"]?${key}['\"]?\\s*:\\s*(\\d+(?:\\.\\d+)?)`));
    return match ? Number(match[1]) : null;
  };
  const requestDurationMs = number("requestDurationMs");
  if (requestDurationMs === null) return null;
  return { ...scoutTiming(entry), requestDurationMs, transactionAttempts: number("transactionAttempts") || 0,
    phaseDurationMs: Object.fromEntries(PHASES.map(key => [key, number(key)]).filter(([, value]) => value !== null)) };
}
// Console output may be DEFAULT severity. Only known outcome/code values leave this parser.
function operationOutcome(entry) {
  const payload = entry.jsonPayload || {};
  const text = String(entry.textPayload || payload.message || "");
  if (payload.event !== "crownlands_operation" && !text.includes("crownlands_operation")) return null;
  const string = key => payload[key] || text.match(new RegExp("\\b" + key + "\\s*:\\s*['\"]([^'\"]+)['\"]"))?.[1];
  const outcome = ["ok", "error"].includes(string("outcome")) ? string("outcome") : "unknown";
  const codes = ["cancelled", "unknown", "invalid-argument", "deadline-exceeded", "not-found", "already-exists",
    "permission-denied", "resource-exhausted", "failed-precondition", "aborted", "out-of-range", "unimplemented",
    "internal", "unavailable", "data-loss", "unauthenticated"];
  return { outcome, code: outcome === "ok" ? "ok" : codes.includes(string("code")) ? string("code") : "unknown" };
}
const APPLICATION_ERROR_CLAUSE = '(severity>=ERROR OR (textPayload:"crownlands_operation" AND textPayload:"outcome: \'error\'") OR (jsonPayload.event="crownlands_operation" AND jsonPayload.outcome="error") OR (jsonPayload.message:"crownlands_operation" AND jsonPayload.message:"outcome: \'error\'") OR textPayload:"Daily mission event processing failed" OR jsonPayload.message:"Daily mission event processing failed")';
module.exports = { operationTiming, operationOutcome, APPLICATION_ERROR_CLAUSE };
