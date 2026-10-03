"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const policy = require("../functions/former-clan-protection");
const identity = { worldId: "world", resetGeneration: "season", realmShardId: "shard" };
const now = 1_800_000_000_000;
const record = policy.departureProtection(null, "departing", ["leader", "peer", "departing", "peer"], identity, now);
assert.equal(policy.DURATION_MS, 86_400_000);
assert.equal(record.attackers.length, 2);
for (const uid of ["leader", "peer"]) {
  assert.equal(policy.blockedUntil(record, uid, identity, now + policy.DURATION_MS - 1), now + policy.DURATION_MS);
  assert.equal(policy.blockedUntil(record, uid, identity, now + policy.DURATION_MS), 0);
}
for (const uid of ["departing", "outsider", "later-member", ""]) assert.equal(policy.blockedUntil(record, uid, identity, now), 0);
for (const key of Object.keys(identity)) {
  const other = { ...identity, [key]: "different" };
  assert.equal(policy.blockedUntil(record, "peer", other, now), 0);
  assert.equal(policy.departureProtection(record, "departing", [], other, now).attackers.length, 0);
}
const later = now + 3_600_000;
const second = policy.departureProtection(record, "departing", ["new-peer", "peer"], identity, later);
assert.equal(policy.blockedUntil(second, "leader", identity, later), now + policy.DURATION_MS);
assert.equal(policy.blockedUntil(second, "peer", identity, later), later + policy.DURATION_MS);
assert.equal(policy.blockedUntil(second, "new-peer", identity, later), later + policy.DURATION_MS);
assert.equal(policy.departureProtection(record, "departing", [], identity, now + policy.DURATION_MS).attackers.length, 0);
const malformed = { ...record, attackers: [null, {}, { uid: "peer", expiresAtMs: "forever" }] };
assert.equal(policy.blockedUntil(malformed, "peer", identity, now), 0);
assert.equal(policy.departureProtection(malformed, "departing", [], identity, now).attackers.length, 0);

// Run the actual server target selector, including owner and objective boundaries.
const source = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");
const begin = source.indexOf("function formerClanProtectionIdentity(");
const end = source.indexOf("async function evaluateHostileAntiFarmPolicy(", begin);
assert(begin > 0 && end > begin);
const context = vm.createContext({
  FORMER_CLAN_PROTECTION: policy, ONLINE_WORLD_ID: identity.worldId, RESET_GENERATION: identity.resetGeneration,
  getCurrentRealmShardId: () => identity.realmShardId,
  getOwnerUid: target => target.ownerUid || "",
  isStronghold: target => target.kind === "stronghold", isRewardCamp: target => target.kind === "camp",
  createAntiFarmPolicy: (blocked, reason, blockedUntilMs) => ({ blocked, reason, blockedUntilMs }),
});
vm.runInContext(source.slice(begin, end), context);
const check = (attacker, target = { ownerUid: "departing" }, type = "city", time = now) =>
  context.formerClanCityAttackPolicy(attacker, { formerClanCityProtection: record }, target, type, time);
assert.equal(check("peer").reason, "former-clan-city-protection");
for (const level of [1, 30, 70]) assert(check("peer", { ownerUid: "departing", level }).blocked);
for (const attacker of ["departing", "outsider"]) assert(!check(attacker).blocked);
assert(!check("peer", {}).blocked);
for (const type of ["camp", "tower"]) assert(!check("peer", { ownerUid: "departing" }, type).blocked);
assert(!check("peer", { ownerUid: "departing", kind: "stronghold" }).blocked);
assert(!check("peer", { ownerUid: "departing", kind: "camp" }).blocked);
assert(!check("peer", undefined, "city", now + policy.DURATION_MS).blocked);
console.log("Former-clan protection: roster snapshots, exact 24-hour expiry, repeated departures, cleanup, realm isolation and city scope passed.");
