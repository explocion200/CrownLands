"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const topology = require("../functions/realmTopology.js");
const releaseConfig = require("../functions/release-config.json");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const apiSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

const beforeActivation = Date.parse("2026-08-31T23:59:59.999Z");
const activation = Date.parse("2026-09-01T00:00:00.000Z");
const october = Date.parse("2026-10-15T12:30:00.000Z");

const legacy = topology.getRealmIdentity(releaseConfig, beforeActivation);
assert.equal(legacy.mode, "legacy");
assert.equal(legacy.resetGeneration, releaseConfig.resetGeneration);
assert.equal(legacy.worldId, releaseConfig.worldId);

const septemberRealm = topology.getRealmIdentity(releaseConfig, activation);
assert.deepEqual(
  {
    mode: septemberRealm.mode,
    resetGeneration: septemberRealm.resetGeneration,
    worldId: septemberRealm.worldId,
    monthKey: septemberRealm.monthKey,
    startsAtMs: septemberRealm.startsAtMs,
    endsAtMs: septemberRealm.endsAtMs,
  },
  {
    mode: "monthly-sharded",
    resetGeneration: "realm-2026-09",
    worldId: "main-realm-2026-09",
    monthKey: "2026-09",
    startsAtMs: activation,
    endsAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
  }
);

const octoberRealm = topology.getRealmIdentity(releaseConfig, october);
assert.equal(octoberRealm.resetGeneration, "realm-2026-10");
assert.equal(octoberRealm.worldId, "main-realm-2026-10");
assert.equal(octoberRealm.startsAtMs, Date.parse("2026-10-01T00:00:00.000Z"));
assert.equal(octoberRealm.endsAtMs, Date.parse("2026-11-01T00:00:00.000Z"));

const capacity = topology.getRealmShardCapacity(releaseConfig);
assert.equal(capacity, 50);
const assignments = Array.from({ length: 120 }, (_, sequence) => (
  topology.getRealmShardForSequence(sequence, capacity)
));
const counts = assignments.reduce((result, assignment) => {
  result[assignment.realmShardId] = (result[assignment.realmShardId] || 0) + 1;
  return result;
}, {});
assert.deepEqual(counts, { shard_0001: 50, shard_0002: 50, shard_0003: 20 });
assert.deepEqual(assignments[50], {
  realmShardId: "shard_0002",
  shardOrdinal: 2,
  slotIndex: 0,
  sequence: 50,
});
assert.deepEqual(assignments[119], {
  realmShardId: "shard_0003",
  shardOrdinal: 3,
  slotIndex: 19,
  sequence: 119,
});

const legacyIslandId = topology.buildIslandId(legacy.worldId, "west", "legacy");
assert.equal(legacyIslandId, `${legacy.worldId}-west`);
assert.deepEqual(topology.parseIslandId(legacyIslandId, legacy.worldId), {
  worldId: legacy.worldId,
  realmShardId: "legacy",
  regionId: "west",
  legacy: true,
});

const shardIslandId = topology.buildIslandId(septemberRealm.worldId, "west", "shard_0003");
assert.equal(shardIslandId, "main-realm-2026-09--shard_0003--west");
assert.deepEqual(topology.parseIslandId(shardIslandId, septemberRealm.worldId), {
  worldId: septemberRealm.worldId,
  realmShardId: "shard_0003",
  regionId: "west",
  legacy: false,
});
assert.equal(topology.parseIslandId(shardIslandId, octoberRealm.worldId), null);

assert.match(serverSource, /ensureRealmShardAssignment/);
assert.match(serverSource, /nextPlayerSequence: sequence \+ 1/);
assert.match(serverSource, /status: "claimed"/);
assert.match(serverSource, /activateMonthlyRealm/);
assert.match(serverSource, /runWithRealmShard\(target\.realmShardId/);
assert.match(serverSource, /withDocumentRealmShard\(processOwnershipChangeEvent\)/);
assert.match(serverSource, /withDocumentRealmShard\(settleReinforcementBattleReceipt\)/);
assert.match(serverSource, /withDocumentRealmShard\(settleRallyBattleReceipt\)/);
assert.match(serverSource, /runForCurrentRealmShards[\s\S]*?selectCitadelAssaultTargets/);
assert.match(serverSource, /runForCurrentRealmShards[\s\S]*?resolveCitadelAssaultWave/);
assert.match(serverSource, /runWithRealmShard\([\s\S]*?processInactivePlayerCandidate/);
assert.match(serverSource, /runWithRealmShard\([\s\S]*?resolveRewardCampPayoutAndStats/);
assert.match(serverSource, /realmEvents\/\$\{getRealmStorageId\(\)\}\/ownershipChanges/);
assert.match(
  serverSource,
  /function scopeQueryToCurrentRealmShard\(query\)[\s\S]*?realmShardId === LEGACY_REALM_SHARD_ID[\s\S]*?\? query[\s\S]*?: query\.where\("realmShardId", "==", realmShardId\)/
);
assert.doesNotMatch(serverSource, /status:\s*"waiting"[\s\S]{0,120}waitingCount:\s*[1-9]/);
assert.match(clientSource, /applyVerifiedRealmIdentity\(realm\)/);
assert.match(clientSource, /--\$\{REALM_SHARD_ID\}--/);
assert.match(apiSource, /realmEvents", getRealmStorageId\(\), "activity"/);
assert.match(
  apiSource,
  /function getRealmShardQueryConstraints\(whereFactory\)[\s\S]*?REALM_SHARD_ID === "legacy"[\s\S]*?\? \[\][\s\S]*?: \[whereFactory\("realmShardId", "==", REALM_SHARD_ID\)\]/
);
assert.match(rulesSource, /documents\/realmConfig\/current/);
assert.match(rulesSource, /currentRealmShardId\(\)/);

console.log("Realm sharding validation passed: 120 players map to 50/50/20 across three isolated shards.");
