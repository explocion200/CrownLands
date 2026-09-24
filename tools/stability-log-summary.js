"use strict";
const PHASES = ["realmContext", "worldValidation", "documentReads", "routePlanning", "transaction"];
// Node console.log(message, object) can arrive as text rather than structured JSON.
// Extract only the allowlisted numeric fields; never evaluate or export the payload.
function operationTiming(entry) {
  const payload = entry.jsonPayload || {};
  if (typeof payload.requestDurationMs === "number") return {
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
  return { requestDurationMs, transactionAttempts: number("transactionAttempts") || 0,
    phaseDurationMs: Object.fromEntries(PHASES.map(key => [key, number(key)]).filter(([, value]) => value !== null)) };
}
module.exports = { operationTiming };
