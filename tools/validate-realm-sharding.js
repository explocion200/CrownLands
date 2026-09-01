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
const enabledMonthlyConfig = Object.freeze({
  ...releaseConfig,
  realmMode: "monthly-shared",
});

const legacy = topology.getRealmIdentity(releaseConfig, beforeActivation);
assert.equal(legacy.mode, "legacy");
assert.equal(legacy.resetGeneration, releaseConfig.resetGeneration);
assert.equal(legacy.worldId, releaseConfig.worldId);

const heldAtActivation = topology.getRealmIdentity(releaseConfig, activation);
assert.equal(heldAtActivation.mode, "legacy");
assert.equal(heldAtActivation.resetGeneration, releaseConfig.resetGeneration);
assert.equal(heldAtActivation.worldId, releaseConfig.worldId);

const heldAfterActivation = topology.getRealmIdentity(releaseConfig, october);
assert.equal(heldAfterActivation.mode, "legacy");
assert.equal(heldAfterActivation.resetGeneration, releaseConfig.resetGeneration);
assert.equal(heldAfterActivation.worldId, releaseConfig.worldId);

const septemberRealm = topology.getRealmIdentity(enabledMonthlyConfig, activation);
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
    mode: "monthly-shared",
    resetGeneration: "realm-2026-09",
    worldId: "main-realm-2026-09",
    monthKey: "2026-09",
    startsAtMs: activation,
    endsAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
  }
);

const octoberRealm = topology.getRealmIdentity(enabledMonthlyConfig, october);
assert.equal(octoberRealm.resetGeneration, "realm-2026-10");
assert.equal(octoberRealm.worldId, "main-realm-2026-10");
assert.equal(octoberRealm.startsAtMs, Date.parse("2026-10-01T00:00:00.000Z"));
assert.equal(octoberRealm.endsAtMs, Date.parse("2026-11-01T00:00:00.000Z"));

const midMonthActivation = Date.parse("2026-09-02T00:00:00.000Z");
const delayedMonthlyConfig = Object.freeze({
  ...enabledMonthlyConfig,
  monthlyResetStartsAt: new Date(midMonthActivation).toISOString(),
});
const delayedSeptemberRealm = topology.getRealmIdentity(delayedMonthlyConfig, midMonthActivation);
assert.equal(delayedSeptemberRealm.resetGeneration, "realm-2026-09");
assert.equal(delayedSeptemberRealm.startsAtMs, midMonthActivation);
assert.equal(delayedSeptemberRealm.endsAtMs, Date.parse("2026-10-01T00:00:00.000Z"));

const capacity = topology.getSharedRealmStartingCityCapacity(releaseConfig);
assert.equal(capacity, 363);
const assignments = Array.from({ length: 150 }, (_, sequence) => (
  topology.getSharedRealmAssignment(sequence)
));
const counts = assignments.reduce((result, assignment) => {
  result[assignment.realmShardId] = (result[assignment.realmShardId] || 0) + 1;
  return result;
}, {});
assert.deepEqual(counts, { shard_0001: 150 });
assert.deepEqual(assignments[50], {
  realmShardId: "shard_0001",
  shardOrdinal: 1,
  slotIndex: 50,
  sequence: 50,
});
assert.deepEqual(assignments[149], {
  realmShardId: "shard_0001",
  shardOrdinal: 1,
  slotIndex: 149,
  sequence: 149,
});

const legacyIslandId = topology.buildIslandId(legacy.worldId, "west", "legacy");
assert.equal(legacyIslandId, `${legacy.worldId}-west`);
assert.deepEqual(topology.parseIslandId(legacyIslandId, legacy.worldId), {
  worldId: legacy.worldId,
  realmShardId: "legacy",
  regionId: "west",
  legacy: true,
});

const shardIslandId = topology.buildIslandId(septemberRealm.worldId, "west", topology.SHARED_REALM_SHARD_ID);
assert.equal(shardIslandId, "main-realm-2026-09--shard_0001--west");
assert.deepEqual(topology.parseIslandId(shardIslandId, septemberRealm.worldId), {
  worldId: septemberRealm.worldId,
  realmShardId: "shard_0001",
  regionId: "west",
  legacy: false,
});
assert.equal(topology.parseIslandId(shardIslandId, octoberRealm.worldId), null);

assert.match(serverSource, /ensureRealmShardAssignment/);
assert.deepEqual(releaseConfig.legacyCompatibleClients, [{
  releaseId: "crownlands-2026-08-02-single-active-skill-preset-v1",
  apiContractHash: "e6029faf76eb863612cebf975f69bbd2e5116571153a916993825a7a7f674020",
}]);
assert.match(serverSource, /identity\.mode === "legacy"[\s\S]*?LEGACY_COMPATIBLE_CLIENTS\.some/);
assert.match(serverSource, /function getRealmInfoResponseContract/);
assert.match(serverSource, /getStableSharedRealmSlotIndex/);
assert.match(serverSource, /getSharedRealmAssignment\(slotIndex\)/);
assert.match(serverSource, /assignmentModel: "uid-distributed-v2"/);
assert.doesNotMatch(serverSource, /nextPlayerSequence: sequence \+ 1/);
assert.match(serverSource, /identity\.mode === "legacy" \? \[LEGACY_REALM_SHARD_ID\] : \[SHARED_REALM_ID\]/);
assert.doesNotMatch(serverSource, /getRealmShardForSequence/);
assert.match(serverSource, /realmShardCapacity:\s*realm\.startingCityCapacity/);
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
assert.match(
  rulesSource,
  /match \/clanLeaderboards\/\{resetId\}\/entries\/\{clanId\}[\s\S]*?allow read: if signedIn\(\)[\s\S]*?resetId == currentRealmStorageId\(\);[\s\S]*?allow create, update, delete: if false;/,
  "Clan leaderboard list reads must use the authoritative realm-storage path without an unqueryable document-field predicate."
);

console.log("Realm hold validation passed: production remains legacy while the enabled monthly model keeps 150 players in one generation-isolated realm partition.");
