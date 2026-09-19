"use strict";

const COMBAT_WINDOW_MS = 15 * 60 * 1000;
const timestamp = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

function isOffensivePvp({ kind, attackerUid, attackerClanId = "", targetOwnerUid = "", targetClanId = "" }) {
  return kind === "attack" && Boolean(attackerUid) && (
    Boolean(targetOwnerUid && targetOwnerUid !== attackerUid)
    || Boolean(targetClanId && targetClanId !== attackerClanId)
  );
}

function shieldCooldownExpiresAt(profile, resetGeneration) {
  return profile?.peaceShieldCooldownResetGeneration === resetGeneration
    ? timestamp(profile.peaceShieldCooldownExpiresAtMs) : 0;
}

function shieldCooldownPatch(profile, resetGeneration, nowMs) {
  return {
    peaceShieldCooldownResetGeneration: resetGeneration,
    peaceShieldCooldownExpiresAtMs: Math.max(shieldCooldownExpiresAt(profile, resetGeneration), nowMs + COMBAT_WINDOW_MS),
  };
}

function retaliationError(record, { uid, cityId, regionId, worldId, resetGeneration, realmShardId, nowMs }) {
  if (!record || record.originalOwnerUid !== uid) return "Retaliation authorization was not found.";
  if (record.cityId !== cityId || record.regionId !== regionId
    || record.worldId !== worldId || record.resetGeneration !== resetGeneration || record.realmShardId !== realmShardId) {
    return "King Power Protection: retaliation only applies to the exact city captured from you in this realm.";
  }
  if (record.status !== "available" || record.usedArmyId || timestamp(record.usedAtMs)) return "This retaliation opportunity has already been used.";
  if (timestamp(record.expiresAtMs) <= nowMs || timestamp(record.capturedAtMs) > nowMs) {
    return "Retaliation Expired: the 15-minute launch window for this city has ended.";
  }
  return "";
}

function abandonLockExpiresAt(city, uid, nowMs) {
  const expiresAtMs = timestamp(city?.retaliationAbandonLocks?.[uid]);
  return expiresAtMs > nowMs ? expiresAtMs : 0;
}

function captureAbandonLocks(city, capturerUid, nowMs) {
  const locks = Object.fromEntries(Object.entries(city?.retaliationAbandonLocks || {})
    .filter(([, expiry]) => timestamp(expiry) > nowMs)
    .map(([uid, expiry]) => [uid, timestamp(expiry)]));
  locks[capturerUid] = Math.max(locks[capturerUid] || 0, nowMs + COMBAT_WINDOW_MS);
  return locks;
}

// Only server-created, original outbound marches can carry a committed exception.
// Arrival deliberately checks the launch timestamp, not current time or current owner.
function hasCommittedRetaliation(army, { cityId, regionId, worldId, resetGeneration, realmShardId }) {
  const record = army?.retaliationAuthorization;
  return Boolean(record && army.createdByServer === true && army.kind === "attack" && army.launchKind === "attack"
    && record.usedArmyId === army.id && record.originalOwnerUid === army.ownerUid
    && record.cityId === cityId && record.regionId === regionId && army.toId === cityId && army.targetRegionId === regionId
    && record.worldId === worldId && record.resetGeneration === resetGeneration && record.realmShardId === realmShardId
    && timestamp(record.usedAtMs) === timestamp(army.launchedAtMs)
    && timestamp(record.capturedAtMs) <= timestamp(record.usedAtMs)
    && timestamp(record.usedAtMs) < timestamp(record.expiresAtMs));
}

module.exports = {
  COMBAT_WINDOW_MS, isOffensivePvp, shieldCooldownExpiresAt, shieldCooldownPatch,
  retaliationError, abandonLockExpiresAt, captureAbandonLocks, hasCommittedRetaliation,
};
