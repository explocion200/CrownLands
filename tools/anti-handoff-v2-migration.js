"use strict";

const LEGACY_FRESH_HANDOFF_REASON = "repeated-fresh-neutral-handoffs";
const LEGACY_FRESH_HANDOFF_FIELDS = Object.freeze([
  "freshHandoffs",
  "lastFreshHandoffAtMs",
]);
const LEGACY_FRESH_BLOCK_FIELDS = Object.freeze([
  "blockedUntilMs",
  "blockReason",
  "blockedAtMs",
  "blockedAt",
]);

function cleanString(value) {
  return String(value || "").trim();
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

function planLegacyPairCleanup(data = {}, nowMs = Date.now()) {
  const presentFreshFields = LEGACY_FRESH_HANDOFF_FIELDS.filter(field => (
    Object.prototype.hasOwnProperty.call(data, field)
  ));
  const blockReason = cleanString(data.blockReason);
  const blockedUntilMs = Math.max(0, timestampToMs(data.blockedUntilMs));
  const legacyFreshBlock = blockReason === LEGACY_FRESH_HANDOFF_REASON;
  const hasUnknownActiveBlock = blockedUntilMs > nowMs
    && Boolean(blockReason)
    && !legacyFreshBlock
    && blockReason !== "shared-installation";
  const hasUnclassifiedActiveBlock = blockedUntilMs > nowMs && !blockReason;
  if ((hasUnknownActiveBlock || hasUnclassifiedActiveBlock) && presentFreshFields.length) {
    return {
      action: "ambiguous",
      reason: hasUnclassifiedActiveBlock ? "active-block-without-reason" : `active-block-reason:${blockReason}`,
      deleteFields: [],
    };
  }
  const deleteFields = [...presentFreshFields];
  if (legacyFreshBlock) {
    LEGACY_FRESH_BLOCK_FIELDS.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(data, field)) deleteFields.push(field);
    });
  }
  if (!deleteFields.length) return { action: "none", reason: "", deleteFields: [] };
  return {
    action: "update",
    reason: legacyFreshBlock ? "legacy-fresh-history-and-block" : "legacy-fresh-history",
    deleteFields: [...new Set(deleteFields)].sort(),
    preservesSharedInstallation: Boolean(
      timestampToMs(data.sharedInstallationLastSeenAtMs)
      || timestampToMs(data.sharedInstallationExpiresAtMs)
    ),
  };
}

module.exports = Object.freeze({
  LEGACY_FRESH_BLOCK_FIELDS,
  LEGACY_FRESH_HANDOFF_FIELDS,
  LEGACY_FRESH_HANDOFF_REASON,
  planLegacyPairCleanup,
  timestampToMs,
});
