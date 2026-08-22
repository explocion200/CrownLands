"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const reset2 = require("./core-v2-reset-2/architecture.js");
const prodReady = require("./core-v2-prod-ready-1/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const LOCKED_RECEIPT_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-reset-2", "RESET_2_LOCAL_CANDIDATE.json");
const RESULT_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-prod-ready-1", "RESET_2_REVALIDATION.json");

function main() {
  const locked = JSON.parse(fs.readFileSync(LOCKED_RECEIPT_PATH, "utf8"));
  const rehearsal = reset2.runLocalDressRehearsal();
  const idempotency = reset2.runIdempotencyProof();
  const { result } = rehearsal;

  assert.equal(result.candidate.sourceBundleHash, locked.candidate.sourceBundleHash);
  assert.deepEqual(result.candidate.sourceHashes, locked.candidate.sourceHashes);
  assert.equal(result.dataset.playerCount, 5000);
  assert.deepEqual(result.pagination.map(item => item.size), reset2.PAGINATION_CASES);
  result.pagination.forEach(item => {
    assert.equal(item.uniqueProcessed, item.size);
    assert.equal(item.duplicateCount, 0);
    assert.equal(item.skippedCount, 0);
    assert.equal(item.staleCursorCount, 0);
    assert.equal(item.original300BoundaryProtected, true);
  });
  assert.equal(result.pagination.find(item => item.size === 5000).pageCount, 17);
  assert.equal(result.persistence.playerCount, 5000);
  assert.equal(result.seasonalReset.consumablesRemaining, 0);
  assert.equal(result.seasonalReset.worldStateRemaining, 0);
  assert.equal(result.restore.validated, true);
  assert.equal(result.restore.publishedPackagesRegenerated, false);
  assert.equal(result.world.coreRegionCount, 25);
  assert.equal(result.world.coreCityCount, 1480);
  assert.equal(result.world.activeOuterRegions, 194);
  assert.equal(result.world.standbyOuterRegions, 2);
  assert.equal(result.world.duplicateCityIds, 0);
  assert.equal(result.world.reciprocalTopologyErrors, 0);
  assert.equal(result.placements.count, 5000);
  assert.equal(result.placements.uniqueStartingCities, 5000);
  assert.equal(result.placements.allOutsideCore, true);
  assert.equal(result.boundaryAndStandby.successfulPlacement.npcBefore, 15);
  assert.equal(result.boundaryAndStandby.successfulPlacement.npcAfter, 14);
  assert.equal(result.boundaryAndStandby.rejectedPlacement.allowed, false);
  assert.equal(result.mainCity.rejectedAttempts, 40);
  assert.equal(result.pointerCutover.atomic, true);
  assert.equal(result.oldSeason.deleted, false);
  assert(result.failures.every(item => item.oldSeasonRemainsAuthoritative && !item.partialSeasonVisible && item.safeToRetry));
  assert.equal(idempotency.passed, true);

  const receipt = {
    schemaVersion: "crownlands-prod-ready-1-reset2-revalidation-v1",
    status: "PASS",
    checkpointScopeGuardPreserved: true,
    lockedCandidateId: locked.candidate.candidateId,
    sourceBundleHash: result.candidate.sourceBundleHash,
    dataset: result.dataset,
    pagination: result.pagination,
    persistence: result.persistence,
    world: result.world,
    placements: result.placements,
    npcBoundary: result.boundaryAndStandby,
    mainCity: {
      paths: result.mainCity.paths.length,
      restrictedRegions: result.mainCity.restrictedRegions.length,
      rejectedAttempts: result.mainCity.rejectedAttempts,
    },
    failureInjectionCount: result.failures.length,
    idempotency,
    runDurationMs: result.durationMs,
    productionMutationPerformed: false,
    validatedAt: new Date().toISOString(),
  };
  receipt.receiptHash = prodReady.hashValue(receipt);
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`RESET-2 production-readiness revalidation passed: ${receipt.dataset.playerCount} players, ${receipt.pagination.at(-1).pageCount} pages, idempotency ${receipt.idempotency.passed}.`);
  return receipt;
}

if (require.main === module) main();

module.exports = Object.freeze({ RESULT_PATH, main });
