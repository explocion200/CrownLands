"use strict";

const DURATION_MS = 24 * 60 * 60 * 1000;
const sameRealm = (record, identity) => Boolean(record && identity.worldId && identity.resetGeneration
  && identity.realmShardId && ["worldId", "resetGeneration", "realmShardId"]
    .every(key => record[key] === identity[key]));

function departureProtection(previous, departingUid, memberUids, identity, nowMs) {
  const attackers = new Map();
  if (sameRealm(previous, identity)) {
    for (const row of Array.isArray(previous.attackers) ? previous.attackers : []) {
      if (typeof row?.uid === "string" && Number.isSafeInteger(row.expiresAtMs) && row.expiresAtMs > nowMs) {
        attackers.set(row.uid, Math.max(attackers.get(row.uid) || 0, row.expiresAtMs));
      }
    }
  }
  for (const uid of memberUids) {
    if (typeof uid === "string" && uid && uid !== departingUid) {
      attackers.set(uid, Math.max(attackers.get(uid) || 0, nowMs + DURATION_MS));
    }
  }
  attackers.delete(departingUid);
  return {
    worldId: identity.worldId, resetGeneration: identity.resetGeneration, realmShardId: identity.realmShardId,
    attackers: [...attackers].map(([uid, expiresAtMs]) => ({ uid, expiresAtMs })),
  };
}

function blockedUntil(record, attackerUid, identity, nowMs) {
  if (!attackerUid || !sameRealm(record, identity)) return 0;
  return (Array.isArray(record.attackers) ? record.attackers : []).reduce((until, row) => (
    row?.uid === attackerUid && Number.isSafeInteger(row.expiresAtMs) && row.expiresAtMs > nowMs
      ? Math.max(until, row.expiresAtMs) : until
  ), 0);
}

module.exports = { DURATION_MS, departureProtection, blockedUntil };
