"use strict";

const ANTI_HANDOFF_POLICY_VERSION = 2;
const ANTI_HANDOFF_RAPID_WINDOW_MS = 20 * 60 * 1000;
const ANTI_HANDOFF_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
const ANTI_HANDOFF_SUCCESS_LIMIT = 7;
const ANTI_HANDOFF_NOTICE_START_COUNT = 4;
const ANTI_HANDOFF_COUNTER_RETENTION_MS = 48 * 60 * 60 * 1000;
const ANTI_HANDOFF_AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function cleanString(value, limit = 160) {
  return String(value || "").trim().slice(0, limit);
}

function timestampToMs(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.floor(value) : 0;
  if (typeof value?.toMillis === "function") return Math.floor(value.toMillis());
  if (Number.isFinite(Number(value?._seconds))) return Math.floor(Number(value._seconds) * 1000);
  if (Number.isFinite(Number(value?.seconds))) return Math.floor(Number(value.seconds) * 1000);
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.floor(numeric);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
  }
  return 0;
}

function isRegularCity(target = {}, targetType = "city") {
  const kind = cleanString(target.kind, 32).toLowerCase();
  return targetType === "city"
    && target.isMainCity !== true
    && kind !== "stronghold"
    && !cleanString(target.strongholdType, 48)
    && !cleanString(target.campType, 48)
    && !cleanString(target.targetType, 48);
}

function normalizeEvent(entry = {}) {
  const neutralClaimEventId = cleanString(entry.neutralClaimEventId || entry.eventId, 160);
  const atMs = Math.max(0, timestampToMs(entry.atMs || entry.occurredAtMs));
  const fromUid = cleanString(entry.fromUid || entry.previousOwnerUid, 128);
  const toUid = cleanString(entry.toUid || entry.nextOwnerUid, 128);
  if (!neutralClaimEventId || !atMs || !fromUid || !toUid || fromUid === toUid) return null;
  return {
    neutralClaimEventId,
    atMs,
    fromUid,
    toUid,
    targetKey: cleanString(entry.targetKey, 220),
  };
}

function normalizeEvents(entries = [], atMs = Date.now(), fromUid = "", toUid = "") {
  const cutoffMs = Math.max(0, timestampToMs(atMs) - ANTI_HANDOFF_ROLLING_WINDOW_MS);
  const expectedFromUid = cleanString(fromUid, 128);
  const expectedToUid = cleanString(toUid, 128);
  return (Array.isArray(entries) ? entries : [])
    .map(normalizeEvent)
    .filter(Boolean)
    // Do not discard a just-committed event whose server timestamp is a few
    // milliseconds ahead of an older transaction attempt. Firestore may retry
    // that older attempt after the newer write commits; excluding the newer
    // timestamp would let the retry overwrite the seventh slot.
    .filter(entry => entry.atMs > cutoffMs)
    .filter(entry => !expectedFromUid || entry.fromUid === expectedFromUid)
    .filter(entry => !expectedToUid || entry.toUid === expectedToUid)
    .sort((left, right) => left.atMs - right.atMs)
    .filter((entry, index, all) => (
      all.findIndex(candidate => candidate.neutralClaimEventId === entry.neutralClaimEventId) === index
    ))
    .slice(-ANTI_HANDOFF_SUCCESS_LIMIT);
}

function getNeutralClaimLineage(target = {}) {
  return {
    eventId: cleanString(target.neutralClaimEventId, 160),
    claimedAtMs: Math.max(0, timestampToMs(target.neutralClaimedAtMs)),
    claimantUid: cleanString(target.neutralClaimedByUid, 128),
    source: cleanString(target.neutralClaimSource, 32),
    policyVersion: Math.max(0, Math.floor(Number(target.neutralClaimPolicyVersion) || 0)),
  };
}

function isRapidHandoffCandidate({
  target = {},
  targetType = "city",
  fromUid = "",
  toUid = "",
  atMs = Date.now(),
} = {}) {
  const normalizedFromUid = cleanString(fromUid, 128);
  const normalizedToUid = cleanString(toUid, 128);
  const ownerUid = cleanString(target.ownerUid || (target.ownerKind === "player" ? target.owner : ""), 128);
  const lineage = getNeutralClaimLineage(target);
  const elapsedMs = timestampToMs(atMs) - lineage.claimedAtMs;
  return Boolean(
    isRegularCity(target, targetType)
    && normalizedFromUid
    && normalizedToUid
    && normalizedFromUid !== normalizedToUid
    && ownerUid === normalizedFromUid
    && lineage.policyVersion === ANTI_HANDOFF_POLICY_VERSION
    && lineage.eventId
    && lineage.claimantUid === normalizedFromUid
    && lineage.source === "attack"
    && lineage.claimedAtMs > 0
    && elapsedMs >= 0
    && elapsedMs <= ANTI_HANDOFF_RAPID_WINDOW_MS
  );
}

function evaluateAntiHandoff({
  pairData = {},
  target = {},
  targetType = "city",
  fromUid = "",
  toUid = "",
  atMs = Date.now(),
} = {}) {
  const normalizedAtMs = Math.max(0, timestampToMs(atMs));
  const normalizedFromUid = cleanString(fromUid, 128);
  const normalizedToUid = cleanString(toUid, 128);
  const events = normalizeEvents(pairData.events, normalizedAtMs, normalizedFromUid, normalizedToUid);
  const lineage = getNeutralClaimLineage(target);
  const qualifying = isRapidHandoffCandidate({
    target,
    targetType,
    fromUid: normalizedFromUid,
    toUid: normalizedToUid,
    atMs: normalizedAtMs,
  });
  const duplicate = Boolean(
    qualifying && events.some(entry => entry.neutralClaimEventId === lineage.eventId)
  );
  const wouldCount = qualifying && !duplicate;
  const blocked = wouldCount && events.length >= ANTI_HANDOFF_SUCCESS_LIMIT;
  const count = events.length;
  const nextCount = wouldCount && !blocked ? count + 1 : count;
  const nextSlotAtMs = count >= ANTI_HANDOFF_SUCCESS_LIMIT
    ? events[0].atMs + ANTI_HANDOFF_ROLLING_WINDOW_MS
    : 0;
  return {
    policyVersion: ANTI_HANDOFF_POLICY_VERSION,
    qualifying,
    duplicate,
    wouldCount,
    blocked,
    count,
    nextCount,
    limit: ANTI_HANDOFF_SUCCESS_LIMIT,
    nextSlotAtMs,
    warning: nextCount >= ANTI_HANDOFF_NOTICE_START_COUNT && !blocked,
    finalWarning: nextCount === ANTI_HANDOFF_SUCCESS_LIMIT && !blocked,
    events,
    lineage,
    fromUid: normalizedFromUid,
    toUid: normalizedToUid,
    atMs: normalizedAtMs,
  };
}

function appendSuccessfulEvent(decision = {}, targetKey = "") {
  if (!decision.wouldCount || decision.blocked || !decision.lineage?.eventId) {
    return { recorded: false, events: decision.events || [], count: decision.count || 0 };
  }
  const event = {
    neutralClaimEventId: decision.lineage.eventId,
    atMs: decision.atMs,
    fromUid: decision.fromUid,
    toUid: decision.toUid,
    targetKey: cleanString(targetKey, 220),
  };
  const events = normalizeEvents(
    [...(decision.events || []), event],
    decision.atMs,
    decision.fromUid,
    decision.toUid
  );
  return { recorded: true, event, events, count: events.length };
}

function getLineageCapturePatch({
  target = {},
  targetType = "city",
  nextOwnerUid = "",
  atMs = Date.now(),
  source = "attack",
  neutralClaimEventId = "",
} = {}) {
  if (!isRegularCity(target, targetType)) return {};
  const normalizedAtMs = Math.max(0, timestampToMs(atMs));
  const previousOwnerUid = cleanString(target.ownerUid, 128);
  const normalizedNextOwnerUid = cleanString(nextOwnerUid, 128);
  const existing = getNeutralClaimLineage(target);
  const existingAgeMs = normalizedAtMs - existing.claimedAtMs;
  const preserveExisting = Boolean(
    previousOwnerUid
    && existing.policyVersion === ANTI_HANDOFF_POLICY_VERSION
    && existing.eventId
    && existing.claimedAtMs > 0
    && existingAgeMs >= 0
    && existingAgeMs <= ANTI_HANDOFF_RAPID_WINDOW_MS
  );
  if (!previousOwnerUid) {
    const eventId = cleanString(neutralClaimEventId, 160);
    if (!eventId) throw new Error("A server neutral-claim event ID is required.");
    return {
      neutralClaimOpen: true,
      neutralClaimEventId: eventId,
      neutralClaimedByUid: normalizedNextOwnerUid,
      neutralClaimedAtMs: normalizedAtMs,
      neutralClaimSource: cleanString(source, 32) || "attack",
      neutralClaimCurrentOwnerUid: normalizedNextOwnerUid,
      neutralClaimPreviousOwnerUid: "",
      neutralClaimOwnershipChangedAtMs: normalizedAtMs,
      neutralClaimPolicyVersion: ANTI_HANDOFF_POLICY_VERSION,
      neutralClaimClosedAtMs: 0,
    };
  }
  if (!preserveExisting) {
    return {
      neutralClaimOpen: false,
      neutralClaimEventId: "",
      neutralClaimedByUid: "",
      neutralClaimedAtMs: 0,
      neutralClaimSource: "",
      neutralClaimCurrentOwnerUid: normalizedNextOwnerUid,
      neutralClaimPreviousOwnerUid: previousOwnerUid,
      neutralClaimOwnershipChangedAtMs: normalizedAtMs,
      neutralClaimPolicyVersion: ANTI_HANDOFF_POLICY_VERSION,
      neutralClaimClosedAtMs: normalizedAtMs,
    };
  }
  return {
    neutralClaimOpen: true,
    neutralClaimEventId: existing.eventId,
    neutralClaimedByUid: existing.claimantUid,
    neutralClaimedAtMs: existing.claimedAtMs,
    neutralClaimSource: existing.source,
    neutralClaimCurrentOwnerUid: normalizedNextOwnerUid,
    neutralClaimPreviousOwnerUid: previousOwnerUid,
    neutralClaimOwnershipChangedAtMs: normalizedAtMs,
    neutralClaimPolicyVersion: ANTI_HANDOFF_POLICY_VERSION,
    neutralClaimClosedAtMs: 0,
  };
}

function getClearedLineagePatch(atMs = Date.now()) {
  const normalizedAtMs = Math.max(0, timestampToMs(atMs));
  return {
    neutralClaimOpen: false,
    neutralClaimEventId: "",
    neutralClaimedByUid: "",
    neutralClaimedAtMs: 0,
    neutralClaimSource: "",
    neutralClaimCurrentOwnerUid: "",
    neutralClaimPreviousOwnerUid: "",
    neutralClaimOwnershipChangedAtMs: normalizedAtMs,
    neutralClaimPolicyVersion: ANTI_HANDOFF_POLICY_VERSION,
    neutralClaimClosedAtMs: normalizedAtMs,
  };
}

module.exports = Object.freeze({
  ANTI_HANDOFF_AUDIT_RETENTION_MS,
  ANTI_HANDOFF_COUNTER_RETENTION_MS,
  ANTI_HANDOFF_NOTICE_START_COUNT,
  ANTI_HANDOFF_POLICY_VERSION,
  ANTI_HANDOFF_RAPID_WINDOW_MS,
  ANTI_HANDOFF_ROLLING_WINDOW_MS,
  ANTI_HANDOFF_SUCCESS_LIMIT,
  appendSuccessfulEvent,
  evaluateAntiHandoff,
  getClearedLineagePatch,
  getLineageCapturePatch,
  getNeutralClaimLineage,
  isRapidHandoffCandidate,
  isRegularCity,
  normalizeEvents,
  timestampToMs,
});
