"use strict";

const crypto = require("node:crypto");

const NEUTRAL_STRONGHOLD_INITIAL_TROOPS = 50_000_000;
const NEUTRAL_CITADEL_INITIAL_TROOPS = 100_000_000;

function cleanString(value) {
  return String(value || "").trim();
}

function positiveTimestamp(value) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed > 0;
  }
  if (typeof value === "object") {
    if (typeof value.toMillis === "function") return value.toMillis() > 0;
    if (Number.isFinite(Number(value._seconds))) return Number(value._seconds) > 0;
    if (Number.isFinite(Number(value.seconds))) return Number(value.seconds) > 0;
  }
  return false;
}

function isCurrentRealmRecord(record = {}, identity = {}) {
  return cleanString(record.worldId) === cleanString(identity.worldId)
    && cleanString(record.resetGeneration) === cleanString(identity.resetGeneration)
    && cleanString(record.realmShardId || "legacy") === cleanString(identity.realmShardId || "legacy");
}

function isNeutralCity(city = {}) {
  if (cleanString(city.ownerUid)) return false;
  const ownerKind = cleanString(city.ownerKind || city.owner || "neutral").toLowerCase();
  return ownerKind === "neutral" || ownerKind === "npc";
}

function isStronghold(city = {}) {
  return cleanString(city.kind).toLowerCase() === "stronghold" || Boolean(cleanString(city.strongholdType));
}

function isCrownCitadel(city = {}) {
  const type = cleanString(city.strongholdType).toLowerCase();
  return type === "crown" || type === "crown_citadel" || cleanString(city.id) === "center_crown_citadel";
}

function hasPlayerControlHistory(city = {}) {
  return positiveTimestamp(city.lastCapturedAtMs)
    || positiveTimestamp(city.lastCapturedAt)
    || positiveTimestamp(city.relinquishedAtMs)
    || positiveTimestamp(city.relinquishedAt);
}

function getNeutralObjectiveInitialTroops(city = {}) {
  if (!isStronghold(city)) return 0;
  return isCrownCitadel(city)
    ? NEUTRAL_CITADEL_INITIAL_TROOPS
    : NEUTRAL_STRONGHOLD_INITIAL_TROOPS;
}

function getCityRepair(city = {}, identity = {}) {
  if (!isCurrentRealmRecord(city, identity) || !isNeutralCity(city)) return null;
  if (!isStronghold(city)) {
    const level = Math.floor(Number(city.level));
    return level === 1 ? null : {
      kind: "npc_city_level",
      patch: { level: 1 },
    };
  }
  if (hasPlayerControlHistory(city)) return null;
  const initialTroops = getNeutralObjectiveInitialTroops(city);
  const troops = Math.max(0, Math.floor(Number(city.troops) || 0));
  const troopFloat = Math.max(0, Number(city.troopFloat) || 0);
  if (troops === initialTroops && troopFloat === initialTroops) return null;
  return {
    kind: isCrownCitadel(city) ? "neutral_citadel_troops" : "neutral_stronghold_troops",
    patch: { troops: initialTroops, troopFloat: initialTroops },
  };
}

function getClanRealmShardRepair(record = {}, identity = {}) {
  if (cleanString(record.worldId) !== cleanString(identity.worldId)
    || cleanString(record.resetGeneration) !== cleanString(identity.resetGeneration)) return null;
  const currentShard = cleanString(record.realmShardId);
  const expectedShard = cleanString(identity.realmShardId || "legacy");
  if (currentShard === expectedShard) return null;
  if (currentShard) {
    throw new Error(`Refusing to rewrite a current clan record from shard ${currentShard} to ${expectedShard}.`);
  }
  return {
    kind: "clan_realm_shard",
    patch: { realmShardId: expectedShard },
  };
}

function stableTarget(target = {}) {
  return {
    documentPath: cleanString(target.documentPath),
    kind: cleanString(target.kind),
    patch: Object.fromEntries(Object.entries(target.patch || {}).sort(([left], [right]) => left.localeCompare(right))),
    updateTime: cleanString(target.updateTime),
  };
}

function buildPlanHash(identity = {}, targets = []) {
  const payload = {
    identity: {
      projectId: cleanString(identity.projectId),
      worldId: cleanString(identity.worldId),
      resetGeneration: cleanString(identity.resetGeneration),
      realmShardId: cleanString(identity.realmShardId || "legacy"),
      worldTopology: cleanString(identity.worldTopology),
    },
    targets: targets.map(stableTarget).sort((left, right) => left.documentPath.localeCompare(right.documentPath)),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function summarizeTargets(targets = []) {
  return targets.reduce((summary, target) => {
    summary[target.kind] = (summary[target.kind] || 0) + 1;
    return summary;
  }, {});
}

module.exports = Object.freeze({
  NEUTRAL_STRONGHOLD_INITIAL_TROOPS,
  NEUTRAL_CITADEL_INITIAL_TROOPS,
  buildPlanHash,
  getCityRepair,
  getClanRealmShardRepair,
  getNeutralObjectiveInitialTroops,
  hasPlayerControlHistory,
  isCurrentRealmRecord,
  isNeutralCity,
  isStronghold,
  summarizeTargets,
});
