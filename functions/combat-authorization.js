"use strict";

const SHIELD_COOLDOWN_MS = 15 * 60 * 1000;
const RETALIATION_WINDOW_MS = 24 * 60 * 60 * 1000;
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
    peaceShieldCooldownExpiresAtMs: Math.max(shieldCooldownExpiresAt(profile, resetGeneration), nowMs + SHIELD_COOLDOWN_MS),
  };
}

function retaliationError(record, { uid, cityId, regionId, worldId, resetGeneration, realmShardId, nowMs }) {
  if (!record || record.originalOwnerUid !== uid) return "Retaliation authorization was not found.";
  if (record.cityId !== cityId || record.regionId !== regionId
    || record.worldId !== worldId || record.resetGeneration !== resetGeneration || record.realmShardId !== realmShardId) {
    return "King Power Protection: retaliation only applies to the exact city captured from you in this realm.";
  }
  if (record.reservedArmyId && record.status === "available") return "A retaliation attack is already travelling to this city.";
  if (record.status !== "available" || record.usedArmyId || timestamp(record.usedAtMs)) return "This retaliation opportunity has already been used.";
  if (timestamp(record.expiresAtMs) <= nowMs || timestamp(record.capturedAtMs) > nowMs) {
    return "Retaliation Expired: the launch window for this city has ended.";
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
  locks[capturerUid] = Math.max(locks[capturerUid] || 0, nowMs + RETALIATION_WINDOW_MS);
  return locks;
}

// Version 2 reserves at launch and spends at combat. Legacy launch receipts remain
// valid, but their already-used grants are never restored by the new lifecycle.
function hasCommittedRetaliation(army, { cityId, regionId, worldId, resetGeneration, realmShardId }) {
  const record = army?.retaliationAuthorization;
  const version2 = record?.version === 2;
  const armyId = version2 ? record.reservedArmyId : record?.usedArmyId;
  const launchedAtMs = timestamp(version2 ? record.reservedAtMs : record?.usedAtMs);
  return Boolean(record && army.createdByServer === true && army.kind === "attack" && army.launchKind === "attack"
    && !army.returning && !army.recalledAtMs
    && armyId === army.id && record.originalOwnerUid === army.ownerUid
    && record.cityId === cityId && record.regionId === regionId && army.toId === cityId && army.targetRegionId === regionId
    && record.worldId === worldId && record.resetGeneration === resetGeneration && record.realmShardId === realmShardId
    && launchedAtMs === timestamp(army.launchedAtMs)
    && timestamp(record.capturedAtMs) <= launchedAtMs && launchedAtMs < timestamp(record.expiresAtMs));
}

async function readCityRecords(db, transaction, uid, cityPath, realm) {
  if (!uid) return [];
  const snapshot = await transaction.get(db.collection(`players/${uid}/retaliationWindows`).where("cityPath", "==", cityPath));
  return snapshot.docs.filter(doc => {
    const record = doc.data();
    return record.originalOwnerUid === uid && Object.entries(realm).every(([key, value]) => record[key] === value);
  });
}

function reservationIsCurrent(records, army) {
  const receipt = army?.retaliationAuthorization;
  return receipt?.version === 2 && records.some(doc => {
    const record = doc.data();
    return doc.id === receipt.id && record.status === "available" && !record.usedArmyId && !record.usedAtMs
      && record.reservedArmyId === army.id && record.reservedAtMs === receipt.reservedAtMs;
  });
}

// Reads are supplied by the caller before any writes. Conditional ownership of
// the reservation prevents an old return/retry from clearing a later launch.
function settleReservation(transaction, records, army, nowMs, hit = false) {
  if (army?.retaliationAuthorization?.version !== 2) return;
  for (const doc of records) {
    const record = doc.data();
    if (record.status !== "available" || record.usedArmyId || record.usedAtMs || record.reservedArmyId !== army.id) continue;
    transaction.set(doc.ref, { reservedArmyId: "", reservedAtMs: 0,
      ...(hit ? { status: "used", usedArmyId: army.id, usedAtMs: nowMs } : {}), updatedAtMs: nowMs }, { merge: true });
  }
}

function closeRecoveredCity(transaction, records, nowMs, exceptArmyId = "") {
  for (const doc of records) {
    const record = doc.data();
    if (record.status !== "available" || record.usedArmyId || record.usedAtMs || record.capturedAtMs > nowMs
      || (exceptArmyId && record.reservedArmyId === exceptArmyId)) continue;
    transaction.set(doc.ref, { status: "recovered", recoveredAtMs: nowMs,
      reservedArmyId: "", reservedAtMs: 0, updatedAtMs: nowMs }, { merge: true });
  }
}

module.exports = {
  SHIELD_COOLDOWN_MS, RETALIATION_WINDOW_MS, isOffensivePvp, shieldCooldownExpiresAt, shieldCooldownPatch,
  retaliationError, abandonLockExpiresAt, captureAbandonLocks, hasCommittedRetaliation,
  readCityRecords, reservationIsCurrent, settleReservation, closeRecoveredCity,
};
