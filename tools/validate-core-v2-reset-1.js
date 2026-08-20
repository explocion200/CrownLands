"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const reset = require("./core-v2-reset-1/architecture.js");
const resetContract = require("../reset-persistence-contract.js");
const mainCityPolicy = require("../functions/core-main-city-policy.js");
const { createCurrentProductionWorldAdapter, readLockedAssetManifest } = require("./map-scaling-phase-7/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULTS_DIRECTORY = path.join(ROOT, "benchmark-results", "map", "core-v2-reset-1");
const RESULT_PATH = path.join(RESULTS_DIRECTORY, "RESET_1_LOCAL_REHEARSAL.json");
const STAGING_RESULT_PATH = path.join(RESULTS_DIRECTORY, "STAGING_RESET_REHEARSAL.json");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function main() {
  const rehearsal = reset.runResetRehearsal();
  const idempotency = reset.runIdempotencyProof();
  const receipt = rehearsal.receipt;
  const production = createCurrentProductionWorldAdapter();
  const assets = readLockedAssetManifest();
  const serverSource = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
  const policySource = fs.readFileSync(path.join(ROOT, "functions", "core-main-city-policy.js"), "utf8");
  const stagingApiSource = fs.readFileSync(path.join(ROOT, "tools", "map-scaling-phase-9", "staging-api.js"), "utf8");
  const stagingResult = JSON.parse(fs.readFileSync(STAGING_RESULT_PATH, "utf8"));

  assert.deepEqual(receipt.lifecycleHistory, reset.RESET_LIFECYCLE);
  assert.equal(receipt.oldSeason.status, "ARCHIVED");
  assert.equal(receipt.oldSeason.mutationState, "READ_ONLY");
  assert.equal(receipt.freezeReceipt.mutationState, "FROZEN");
  assert.equal(receipt.freezeReceipt.newPlacementEnabled, false);
  assert.equal(receipt.freezeReceipt.finalSnapshotCount, 4);
  assert.equal(receipt.oldSeason.archivedReadOnly, true);
  assert.equal(receipt.activePointerAfter.worldId, reset.NEW_WORLD_ID);
  assert.equal(receipt.activePointerAfter.seasonId, reset.NEW_SEASON_ID);
  assert.equal(receipt.newSeason.coreRegionCount, 25);
  assert.equal(receipt.newSeason.coreCityCount, 1480);
  assert.equal(receipt.newSeason.standbyPlayerRegions.length, 2);
  assert.equal(receipt.newSeason.assetManifestHash, reset.ASSET_MANIFEST_HASH);
  assert.equal(receipt.beforeReceipts.length, 4);
  assert.equal(receipt.afterReceipts.length, 4);
  assert(receipt.afterReceipts.every(item => item.persistentHashMatches));
  assert.equal(resetContract.CONTRACT_VERSION, 2);
  assert.deepEqual(Object.keys(resetContract.extractPersistentCommonGear({})).sort(), [...resetContract.PERSISTENT_GEAR_FIELDS].sort());
  const hostileSource = {
    flag: { primary: "#123456" },
    clanId: "strict-allowlist-clan",
    clanName: "Strict",
    clanTag: "ST",
    clanRole: "member",
    experience: 999999,
    shopItems: { peaceShield: 99 },
    gear: {
      commonGearBoxes: 99,
      shopPurchase: { utcDate: "2026-08-19", purchaseCount: 4 },
      instances: {
        strict_gear: {
          instanceId: "strict_gear",
          gearKey: "barracks_weapon_common_01",
          level: 5,
          isNew: true,
          seasonalMarker: "must-not-survive",
        },
      },
      equipped: { barracks: { weapon: "strict_gear" } },
    },
  };
  const hostileProjection = resetContract.extractPersistentPlayerProgression(hostileSource);
  assert.deepEqual(Object.keys(hostileProjection).sort(), [...resetContract.PERSISTENT_PLAYER_FIELDS].sort());
  assert.equal(hostileProjection.experience, undefined);
  assert.equal(hostileProjection.shopItems, undefined);
  assert.equal(hostileProjection.gear.commonGearBoxes, undefined);
  assert.equal(hostileProjection.gear.shopPurchase, undefined);
  assert.deepEqual(Object.keys(hostileProjection.gear.instances.strict_gear).sort(), [...resetContract.PERSISTENT_GEAR_INSTANCE_FIELDS].sort());
  assert.equal(hostileProjection.gear.instances.strict_gear.isNew, undefined);
  assert.equal(hostileProjection.gear.instances.strict_gear.seasonalMarker, undefined);
  assert.deepEqual(resetContract.validatePersistentPayload(hostileProjection), []);
  receipt.afterReceipts.forEach(item => Object.values(item.persistent.gear.instances).forEach(instance => {
    assert.deepEqual(Object.keys(instance).sort(), [...resetContract.PERSISTENT_GEAR_INSTANCE_FIELDS].sort());
  }));
  assert(!reset.PERSISTENCE_ALLOWLIST.some(field => reset.RESET_FIELDS.includes(field)));
  assert.equal(receipt.threshold.successAt15.npcBefore, 15);
  assert.equal(receipt.threshold.successAt15.remainingNpcCityCount, 14);
  assert.equal(receipt.threshold.rejectedAt14.rejected, true);
  assert.equal(receipt.threshold.gameplayUnaffected, true);
  assert.equal(receipt.expansion.standbyCount, 2);
  assert(receipt.expansion.reciprocalOpenEdges.length > 0);
  assert.equal(receipt.mainCitySecurity.restrictedRegions.length, 5);
  assert.equal(receipt.mainCitySecurity.supportedPaths.length, 5);
  assert.equal(receipt.mainCitySecurity.attempts.length, 25);
  assert.equal(receipt.mainCitySecurity.malformed.length, 5);
  assert(receipt.mainCitySecurity.normalCoreGameplay.every(item => item.allowed && !item.mainCityMutationAttempted));
  assert.equal(receipt.postResetGameplay.allPassed, true);
  assert.equal(receipt.postResetGameplay.normalCityGameplay.length, 5);
  assert.equal(receipt.postResetGameplay.objectiveInteractions.length, 17);
  assert.equal(receipt.postResetGameplay.travel.reciprocal, true);
  assert.equal(receipt.aborts.allPassed, true);
  assert.equal(idempotency.passed, true);
  assert.equal(idempotency.firstHash, idempotency.secondHash);
  assert.equal(idempotency.duplicateCityIds, 0);

  assert.equal(Object.keys(mainCityPolicy.FORBIDDEN_CORE_MAIN_CITY_REGIONS).length, 5);
  assert(serverSource.includes("CORE_MAIN_CITY_POLICY.getForbiddenMainCityReason(targetEntry.city, targetRegionId)"));
  assert(serverSource.includes("CORE_MAIN_CITY_POLICY.isEligibleMainCityLocation("));
  assert(serverSource.includes("entry.city.regionId || getRegionIdFromOnlineIslandId(getCityEntryIslandId(entry))"));
  assert(serverSource.includes("CORE_MAIN_CITY_POLICY.getForbiddenMainCityReason(chosenCity, chosenIsland.regionId)"));
  assert(serverSource.includes("CORE_MAIN_CITY_POLICY.getForbiddenMainCityReason({ regionId }, regionId)"));
  assert(policySource.includes("forbidden-core-main-city-region"));
  assert(stagingApiSource.includes('query.set("currentDocument.updateTime", options.updateTime)'));
  assert.equal(stagingResult.passed, true);
  assert.equal(stagingResult.runId, "reset1-pre-september-2026-v8");
  assert.equal(stagingResult.inputReceiptHash, receipt.receiptHash);
  assert.equal(stagingResult.replayed, true);
  assert.equal(stagingResult.pointerCompareAndSet.initialCutoverUsedUpdateTimePrecondition, true);
  assert.equal(stagingResult.pointerCompareAndSet.replaySkippedRedundantCutover, true);
  assert.equal(stagingResult.activePointer.revision, 8);
  assert.equal(stagingResult.oldSeason.mutationState, "READ_ONLY");
  assert.equal(stagingResult.oldSeason.newPlacementEnabled, false);
  assert.equal(stagingResult.newSeason.playerEntryEnabled, true);
  assert.equal(stagingResult.dataWritesCommitted, 1696);
  assert.equal(stagingResult.controlWritesCommitted, 6);
  assert.equal(stagingResult.productionMutationPerformed, false);

  assert.equal(production.productionMapCount, 15);
  assert.equal(production.productionCityCount, 1050);
  assert.equal(production.directedMapChainCount, 210);
  assert.equal(production.generatedActiveRegionCount, 0);
  assert.equal(assets.manifest.assetCount, 118);
  assert.equal(assets.hash, reset.ASSET_MANIFEST_HASH);

  const result = {
    schemaVersion: "core-v2-reset-1-validation-v1",
    passed: true,
    localRehearsalReceiptHash: receipt.receiptHash,
    lifecycle: receipt.lifecycleHistory,
    persistenceAllowlist: reset.PERSISTENCE_ALLOWLIST,
    resetFields: reset.RESET_FIELDS,
    syntheticPlayers: receipt.afterReceipts.map(item => ({ uid: item.uid, persistentHashMatches: item.persistentHashMatches, mainRegionId: item.mainRegionId })),
    mainCitySecurity: {
      policyVersion: receipt.mainCitySecurity.policyVersion,
      restrictedRegionCount: receipt.mainCitySecurity.restrictedRegions.length,
      supportedPathCount: receipt.mainCitySecurity.supportedPaths.length,
      rejectedAttempts: receipt.mainCitySecurity.rejectedAttemptCount,
      normalCoreGameplayChecks: receipt.mainCitySecurity.normalCoreGameplay.length,
    },
    threshold: receipt.threshold,
    expansion: receipt.expansion,
    postResetGameplay: receipt.postResetGameplay,
    rollback: receipt.aborts,
    idempotency,
    productionBaseline: {
      maps: production.productionMapCount,
      cities: production.productionCityCount,
      directedChains: production.directedMapChainCount,
      generatedActiveRegions: production.generatedActiveRegionCount,
    },
    approvedGeneratorAssets: { count: assets.manifest.assetCount, manifestHash: assets.hash },
    stagingRehearsal: {
      runId: stagingResult.runId,
      freshDurationMs: stagingResult.freshDurationMs,
      replayDurationMs: stagingResult.replayDurationMs,
      receiptHash: stagingResult.receiptHash,
      pointerCompareAndSet: stagingResult.pointerCompareAndSet,
    },
    sourceHashes: {
      resetContract: sha256File(path.join(ROOT, "reset-persistence-contract.js")),
      mainCityPolicy: sha256File(path.join(ROOT, "functions", "core-main-city-policy.js")),
      architecture: sha256File(path.join(ROOT, "tools", "core-v2-reset-1", "architecture.js")),
    },
    productionMutationPerformed: false,
  };
  fs.mkdirSync(RESULTS_DIRECTORY, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Core v2 RESET-1 validation passed (${receipt.newSeason.coreRegionCount} Core maps, ${receipt.newSeason.coreCityCount} Core cities, ${receipt.mainCitySecurity.rejectedAttemptCount} forbidden main-city attempts rejected).`);
  return result;
}

if (require.main === module) main();

module.exports = Object.freeze({ main, RESULT_PATH });
