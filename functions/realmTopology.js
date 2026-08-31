"use strict";

const LEGACY_REALM_SHARD_ID = "legacy";
const SHARED_REALM_SHARD_ID = "shard_0001";
const DEFAULT_MONTHLY_GENERATION_PREFIX = "realm";
const DEFAULT_WORLD_ID_PREFIX = "main";
const DEFAULT_SHARED_REALM_STARTING_CITY_CAPACITY = 363;

function safeIdentifier(value = "", fallback = "", maxLength = 120) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return cleaned || fallback;
}

function normalizeRealmShardId(value = LEGACY_REALM_SHARD_ID) {
  const cleaned = safeIdentifier(value, LEGACY_REALM_SHARD_ID, 48);
  if (cleaned === LEGACY_REALM_SHARD_ID) return LEGACY_REALM_SHARD_ID;
  return /^shard_\d{4,10}$/.test(cleaned) ? cleaned : LEGACY_REALM_SHARD_ID;
}

function formatRealmShardId(ordinal = 1) {
  const safeOrdinal = Math.max(1, Math.floor(Number(ordinal) || 1));
  return `shard_${String(safeOrdinal).padStart(4, "0")}`;
}

function parseUtcTimestamp(value, fallback = 0) {
  const parsed = typeof value === "number" ? value : Date.parse(String(value || ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getUtcMonthKey(nowMs = Date.now()) {
  const date = new Date(Number(nowMs) || 0);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid UTC realm time is required.");
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getUtcMonthBounds(nowMs = Date.now()) {
  const date = new Date(Number(nowMs) || 0);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid UTC realm time is required.");
  const startsAtMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const endsAtMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { startsAtMs, endsAtMs };
}

function getRealmIdentity(config = {}, nowMs = Date.now()) {
  const legacyResetGeneration = safeIdentifier(
    config.resetGeneration,
    "fresh-2026-07-26-server-reset"
  );
  const legacyWorldId = safeIdentifier(config.worldId, `main-${legacyResetGeneration}`);
  const monthlyResetStartsAtMs = parseUtcTimestamp(config.monthlyResetStartsAt, Number.MAX_SAFE_INTEGER);
  const configuredMode = String(config.realmMode || "").toLowerCase();
  const monthlyEnabled = configuredMode === "monthly-shared"
    && Number(nowMs) >= monthlyResetStartsAtMs;

  if (!monthlyEnabled) {
    return Object.freeze({
      mode: "legacy",
      resetGeneration: legacyResetGeneration,
      worldId: legacyWorldId,
      monthKey: "",
      startsAtMs: 0,
      endsAtMs: monthlyResetStartsAtMs,
      activatedAtMs: Number(nowMs) || 0,
    });
  }

  const monthKey = getUtcMonthKey(nowMs);
  const bounds = getUtcMonthBounds(nowMs);
  const generationPrefix = safeIdentifier(
    config.monthlyGenerationPrefix,
    DEFAULT_MONTHLY_GENERATION_PREFIX,
    48
  );
  const worldIdPrefix = safeIdentifier(config.worldIdPrefix, DEFAULT_WORLD_ID_PREFIX, 48);
  const resetGeneration = `${generationPrefix}-${monthKey}`;
  return Object.freeze({
    mode: configuredMode,
    resetGeneration,
    worldId: `${worldIdPrefix}-${resetGeneration}`,
    monthKey,
    startsAtMs: bounds.startsAtMs,
    endsAtMs: bounds.endsAtMs,
    activatedAtMs: Number(nowMs) || 0,
  });
}

function getSharedRealmStartingCityCapacity(config = {}) {
  return Math.max(
    1,
    Math.min(
      500,
      Math.floor(
        Number(config.sharedRealmStartingCityCapacity)
        || DEFAULT_SHARED_REALM_STARTING_CITY_CAPACITY
      )
    )
  );
}

function getSharedRealmAssignment(sequence = 0) {
  const safeSequence = Math.max(0, Math.floor(Number(sequence) || 0));
  return Object.freeze({
    realmShardId: SHARED_REALM_SHARD_ID,
    shardOrdinal: 1,
    slotIndex: safeSequence,
    sequence: safeSequence,
  });
}

function buildIslandId(worldId = "", regionId = "", realmShardId = LEGACY_REALM_SHARD_ID) {
  const safeWorldId = safeIdentifier(worldId, "main");
  const safeRegionId = safeIdentifier(regionId, "west", 80);
  const safeShardId = normalizeRealmShardId(realmShardId);
  return safeShardId === LEGACY_REALM_SHARD_ID
    ? `${safeWorldId}-${safeRegionId}`
    : `${safeWorldId}--${safeShardId}--${safeRegionId}`;
}

function parseIslandId(islandId = "", worldId = "") {
  const safeIslandId = String(islandId || "").trim();
  const safeWorldId = safeIdentifier(worldId, "main");
  const shardedPrefix = `${safeWorldId}--`;
  if (safeIslandId.startsWith(shardedPrefix)) {
    const suffix = safeIslandId.slice(shardedPrefix.length);
    const separatorIndex = suffix.indexOf("--");
    if (separatorIndex > 0) {
      const realmShardId = normalizeRealmShardId(suffix.slice(0, separatorIndex));
      const regionId = safeIdentifier(suffix.slice(separatorIndex + 2), "", 80);
      if (realmShardId !== LEGACY_REALM_SHARD_ID && regionId) {
        return Object.freeze({ worldId: safeWorldId, realmShardId, regionId, legacy: false });
      }
    }
  }

  const legacyPrefix = `${safeWorldId}-`;
  if (!safeIslandId.startsWith(legacyPrefix)) return null;
  const regionId = safeIdentifier(safeIslandId.slice(legacyPrefix.length), "", 80);
  return regionId
    ? Object.freeze({
        worldId: safeWorldId,
        realmShardId: LEGACY_REALM_SHARD_ID,
        regionId,
        legacy: true,
      })
    : null;
}

module.exports = Object.freeze({
  LEGACY_REALM_SHARD_ID,
  SHARED_REALM_SHARD_ID,
  DEFAULT_SHARED_REALM_STARTING_CITY_CAPACITY,
  safeIdentifier,
  normalizeRealmShardId,
  formatRealmShardId,
  getUtcMonthKey,
  getUtcMonthBounds,
  getRealmIdentity,
  getSharedRealmStartingCityCapacity,
  getSharedRealmAssignment,
  buildIslandId,
  parseIslandId,
});
