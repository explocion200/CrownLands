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
  assert.equal(policy.protectedUntil(record, uid, identity, now + policy.DURATION_MS - 1), now + policy.DURATION_MS);
  assert.equal(policy.protectedUntil(record, uid, identity, now + policy.DURATION_MS), 0);
}
for (const uid of ["departing", "outsider", "later-member", ""]) assert.equal(policy.protectedUntil(record, uid, identity, now), 0);
for (const key of Object.keys(identity)) {
  const other = { ...identity, [key]: "different" };
  assert.equal(policy.protectedUntil(record, "peer", other, now), 0);
  assert.equal(policy.departureProtection(record, "departing", [], other, now).attackers.length, 0);
}
const later = now + 3_600_000;
const second = policy.departureProtection(record, "departing", ["new-peer", "peer"], identity, later);
assert.equal(policy.protectedUntil(second, "leader", identity, later), now + policy.DURATION_MS);
assert.equal(policy.protectedUntil(second, "peer", identity, later), later + policy.DURATION_MS);
assert.equal(policy.protectedUntil(second, "new-peer", identity, later), later + policy.DURATION_MS);
assert.equal(policy.departureProtection(record, "departing", [], identity, now + policy.DURATION_MS).attackers.length, 0);
const malformed = { ...record, attackers: [null, {}, { uid: "peer", expiresAtMs: "forever" }] };
assert.equal(policy.protectedUntil(malformed, "peer", identity, now), 0);
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
});
vm.runInContext(source.slice(begin, end), context);
const check = (attacker, target = { ownerUid: "departing" }, type = "city", time = now) =>
  context.formerClanCityCaptureProtectedUntil(attacker, { formerClanCityProtection: record }, target, type, time);
assert.equal(check("peer"), now + policy.DURATION_MS);
for (const level of [1, 30, 70]) assert(check("peer", { ownerUid: "departing", level }));
for (const attacker of ["departing", "outsider"]) assert(!check(attacker));
assert(!check("peer", {}));
for (const type of ["camp", "tower"]) assert(!check("peer", { ownerUid: "departing" }, type));
assert(!check("peer", { ownerUid: "departing", kind: "stronghold" }));
assert(!check("peer", { ownerUid: "departing", kind: "camp" }));
assert(!check("peer", undefined, "city", now + policy.DURATION_MS));
console.log("Former-clan protection: roster snapshots, exact 24-hour expiry, repeated departures, cleanup, realm isolation and city scope passed.");
