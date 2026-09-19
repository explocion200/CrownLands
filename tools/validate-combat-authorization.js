"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const policy = require("../functions/combat-authorization.js");
const ui = require("../combat-timers-ui.js");
const now = 1_800_000_000_000, generation = "realm-test";
const identity = { uid: "high", cityId: "city-a", regionId: "map-a", worldId: "world", resetGeneration: generation, realmShardId: "shard", nowMs: now };
const record = { ...identity, id: "capture-a", originalOwnerUid: "high", capturerUid: "low", status: "available", capturedAtMs: now - 1000, expiresAtMs: now + 899_000, usedAtMs: 0, usedArmyId: "" };
for (const kind of ["scout", "transfer", "reinforce", "rally_join", "return", "defense"]) {
  assert.equal(policy.isOffensivePvp({ kind, attackerUid: "a", targetOwnerUid: "b" }), false, `${kind} triggered cooldown`);
}
assert(policy.isOffensivePvp({ kind: "attack", attackerUid: "a", targetOwnerUid: "b" }));
assert(policy.isOffensivePvp({ kind: "attack", attackerUid: "a", attackerClanId: "clan-a", targetClanId: "clan-b" }), "Clan-held Tower must count as PvP");
assert.equal(policy.isOffensivePvp({ kind: "attack", attackerUid: "a" }), false, "NPC objectives must not count as PvP");
assert.equal(policy.isOffensivePvp({ kind: "attack", attackerUid: "a", targetOwnerUid: "a", attackerClanId: "clan-a", targetClanId: "clan-a" }), false);
const initial = policy.shieldCooldownPatch({}, generation, now);
assert.equal(initial.peaceShieldCooldownExpiresAtMs, now + 900_000);
assert.equal(policy.shieldCooldownPatch(initial, generation, now + 60_000).peaceShieldCooldownExpiresAtMs, now + 960_000);
assert.equal(policy.shieldCooldownPatch(initial, generation, now - 60_000).peaceShieldCooldownExpiresAtMs, now + 900_000, "Retries cannot shorten a later cooldown");
assert.equal(policy.shieldCooldownExpiresAt(initial, "different-season"), 0);
assert.equal(policy.retaliationError(record, identity), "");
for (const field of ["uid", "cityId", "regionId", "worldId", "resetGeneration", "realmShardId"]) {
  assert(policy.retaliationError(record, { ...identity, [field]: "other" }), `${field} mismatch accepted`);
}
assert.equal(policy.retaliationError(record, { ...identity, nowMs: record.expiresAtMs - 1 }), "");
assert.match(policy.retaliationError(record, { ...identity, nowMs: record.expiresAtMs }), /Expired/);
assert.match(policy.retaliationError({ ...record, usedArmyId: "army" }, identity), /already been used/);
assert.match(policy.retaliationError({ ...record, status: "used" }, identity), /already been used/);
assert.match(policy.retaliationError(null, identity), /not found/);
// Ownership is intentionally not an input to the grant check.
assert.equal(policy.retaliationError({ ...record, currentOwnerUid: "third" }, identity), "");
const city = { retaliationAbandonLocks: policy.captureAbandonLocks({}, "low", now) };
assert.equal(policy.abandonLockExpiresAt(city, "low", now + 899_999), now + 900_000);
assert.equal(policy.abandonLockExpiresAt(city, "low", now + 900_000), 0);
assert.equal(policy.abandonLockExpiresAt(city, "third", now), 0);
assert.equal(policy.captureAbandonLocks(city, "third", now + 1000).low, now + 900_000);
assert.equal(policy.captureAbandonLocks(city, "low", now + 1000).low, now + 901_000);
const army = { id: "attack", ownerUid: "high", kind: "attack", launchKind: "attack", createdByServer: true,
  toId: "city-a", targetRegionId: "map-a", launchedAtMs: record.expiresAtMs - 1,
  retaliationAuthorization: { ...record, usedAtMs: record.expiresAtMs - 1, usedArmyId: "attack" } };
assert(policy.hasCommittedRetaliation(army, { ...identity, nowMs: now + 20_000_000 }));
for (const patch of [{ toId: "other" }, { targetRegionId: "other" }, { ownerUid: "other" }, { id: "other" }, { kind: "transfer" }, { createdByServer: false }]) {
  assert.equal(policy.hasCommittedRetaliation({ ...army, ...patch }, identity), false);
}
assert.equal(ui.remaining(now + 900_000, now), "15:00");
assert.equal(ui.remaining(now + 1000, now), "00:01");
assert.equal(ui.remaining(now - 1, now), "00:00");
assert.equal(ui.activeRecords([record, { ...record, id: "used", status: "used" }, { ...record, id: "expired", expiresAtMs: now }], now).length, 1);
const server = fs.readFileSync(path.resolve(__dirname, "../functions/index.js"), "utf8");
const start = server.indexOf("exports.launchClanRally =");
const rally = server.slice(start, server.indexOf("exports.previewArmyProtection", start));
assert(rally.includes("offensiveShieldCooldownPatch(participantProfiles.get(participant.uid)?.profile"), "Rally contributors need individual cooldowns");
console.log("Combat policy passed: offensive-only PvP, all objective ownership, reset/retry timing, exact-city/realm/actor grants, expiry boundaries, used grants, ownership changes, independent capturer locks, committed arrival scope and UI countdown boundaries.");
