"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  NEUTRAL_CITADEL_INITIAL_TROOPS,
  NEUTRAL_STRONGHOLD_INITIAL_TROOPS,
  buildPlanHash,
  getCityRepair,
  getClanRealmShardRepair,
  hasPlayerControlHistory,
} = require("./current-realm-game-issue-repair");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const coreLayout = JSON.parse(fs.readFileSync(path.join(root, "functions", "core-expansion-world-layout.json"), "utf8"));

assert.match(server, /NEUTRAL_STRONGHOLD_INITIAL_TROOPS\s*=\s*50_000_000/, "The server Stronghold seed constant must be 50,000,000.");
assert.match(server, /NEUTRAL_CITADEL_INITIAL_TROOPS\s*=\s*100_000_000/, "The server Citadel seed constant must be 100,000,000.");
assert.match(server, /function cleanServerCityLayoutSeed[\s\S]*?startTroops: initialObjectiveTroops,[\s\S]*?level: isStrongholdCity \? clampCityLevel[\s\S]*?: 1,/, "Server layout normalization must force ordinary NPC cities to Level 1 and canonical neutral objective troops.");
assert.match(server, /const alreadyExists = existingCityIds\.has\(city\.id\)[\s\S]*?\.\.\.\(alreadyExists \? \{\} : \{[\s\S]*?troops: initialTroops/, "Layout reconciliation must initialize only new objectives and preserve existing or conquered troop state.");
assert.match(client, /CROWN_CITADEL_START_TROOPS\s*=\s*100000000/, "The client Citadel seed must be 100,000,000.");
assert.match(client, /function getStrongholdStartTroops[\s\S]*?isCrownCitadel\(city\)[\s\S]*?CROWN_CITADEL_START_TROOPS[\s\S]*?GOLD_STRONGHOLD_START_TROOPS/, "Client neutral objective creation must use canonical type-based troops instead of stale map data.");

const coreObjectives = coreLayout.maps.flatMap(map => (map.objectives || []).map(objective => ({ ...objective, regionId: map.id })));
assert.equal(coreObjectives.length, 5, "The prepared Core objective fixture changed unexpectedly.");
coreObjectives.forEach(objective => {
  const expected = objective.strongholdType === "crown_citadel"
    ? NEUTRAL_CITADEL_INITIAL_TROOPS
    : NEUTRAL_STRONGHOLD_INITIAL_TROOPS;
  assert.equal(objective.troops, expected, `${objective.regionId} has the wrong pristine neutral troop seed.`);
});

const identity = Object.freeze({
  projectId: "test-project",
  worldId: "main-realm-test",
  resetGeneration: "realm-test",
  realmShardId: "shard_0001",
  worldTopology: "core-expansion-v1",
});
const current = overrides => ({
  worldId: identity.worldId,
  resetGeneration: identity.resetGeneration,
  realmShardId: identity.realmShardId,
  ownerKind: "neutral",
  ownerUid: null,
  ...overrides,
});

const ordinaryRepair = getCityRepair(current({ id: "core_0123456789abcdefab", level: 73 }), identity);
assert.deepEqual(ordinaryRepair, { kind: "npc_city_level", patch: { level: 1 } });
assert.equal(getCityRepair(current({ id: "core_0123456789abcdefab", level: 1 }), identity), null);
assert.deepEqual(getCityRepair(current({ id: "core_0123456789abcdefab", level: 9, ownerKind: "npc" }), identity), { kind: "npc_city_level", patch: { level: 1 } });
assert.equal(getCityRepair(current({ id: "core_0123456789abcdefab", level: 73, ownerKind: "player", ownerUid: "player" }), identity), null);
assert.equal(getCityRepair({ ...current({ id: "core_0123456789abcdefab", level: 73 }), resetGeneration: "archived" }, identity), null);
assert.equal(getCityRepair({ ...current({ id: "core_0123456789abcdefab", level: 73 }), realmShardId: "shard_0002" }, identity), null);

const strongholdRepair = getCityRepair(current({
  id: "core-v2-aurum-keep-m1-p0_gold_stronghold",
  kind: "stronghold",
  strongholdType: "gold_stronghold",
  troops: 150_000,
  troopFloat: 150_000,
  lastCapturedAt: null,
  relinquishedAtMs: 0,
}), identity);
assert.deepEqual(strongholdRepair, {
  kind: "neutral_stronghold_troops",
  patch: { troops: NEUTRAL_STRONGHOLD_INITIAL_TROOPS, troopFloat: NEUTRAL_STRONGHOLD_INITIAL_TROOPS },
});
assert.equal(getCityRepair(current({
  kind: "stronghold",
  strongholdType: "gold_stronghold",
  troops: NEUTRAL_STRONGHOLD_INITIAL_TROOPS,
  troopFloat: NEUTRAL_STRONGHOLD_INITIAL_TROOPS,
}), identity), null);

const citadelRepair = getCityRepair(current({
  id: "core-v2-crown-citadel-p0-p0_crown_citadel",
  kind: "stronghold",
  strongholdType: "crown_citadel",
  troops: 500_000,
  troopFloat: 500_000,
}), identity);
assert.deepEqual(citadelRepair, {
  kind: "neutral_citadel_troops",
  patch: { troops: NEUTRAL_CITADEL_INITIAL_TROOPS, troopFloat: NEUTRAL_CITADEL_INITIAL_TROOPS },
});
for (const history of [{ lastCapturedAtMs: 1 }, { lastCapturedAt: "2026-09-01T00:00:00.000Z" }, { relinquishedAtMs: 2 }]) {
  const conquered = current({
    kind: "stronghold",
    strongholdType: "crown_citadel",
    troops: 12_345,
    troopFloat: 12_345,
    ...history,
  });
  assert.equal(hasPlayerControlHistory(conquered), true);
  assert.equal(getCityRepair(conquered, identity), null, "A previously controlled objective must retain player-maintained troops.");
}
assert.equal(getCityRepair(current({
  kind: "stronghold",
  strongholdType: "crown_citadel",
  ownerKind: "player",
  ownerUid: "player",
  troops: 12_345,
  troopFloat: 12_345,
}), identity), null, "A player-controlled Citadel must never be repaired as neutral seed state.");

assert.deepEqual(
  getClanRealmShardRepair({ worldId: identity.worldId, resetGeneration: identity.resetGeneration }, identity),
  { kind: "clan_realm_shard", patch: { realmShardId: identity.realmShardId } }
);
assert.equal(getClanRealmShardRepair({ ...identity }, identity), null);
assert.equal(getClanRealmShardRepair({ ...identity, resetGeneration: "archived", realmShardId: "" }, identity), null);
assert.throws(
  () => getClanRealmShardRepair({ ...identity, realmShardId: "shard_0002" }, identity),
  /Refusing to rewrite/
);

const targets = [
  { documentPath: "islands/a/cities/b", kind: ordinaryRepair.kind, patch: ordinaryRepair.patch, updateTime: "two" },
  { documentPath: "clans/a", kind: "clan_realm_shard", patch: { realmShardId: identity.realmShardId }, updateTime: "one" },
];
assert.equal(buildPlanHash(identity, targets), buildPlanHash(identity, [...targets].reverse()), "Repair plan confirmation must be order-independent.");
assert.notEqual(buildPlanHash(identity, targets), buildPlanHash(identity, [{ ...targets[0], updateTime: "changed" }, targets[1]]));

console.log("Validated idempotent current-realm NPC level, untouched player city, pristine neutral objective, conquered objective, clan shard, and plan confirmation repairs.");
