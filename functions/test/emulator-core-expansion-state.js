"use strict";

const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const topology = require("../coreExpansionTopology.js");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");
if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const resetGeneration = "emulator-core-expansion-generation";
  const stateRef = db.doc(`realmGenerations/${resetGeneration}/expansion/current`);
  const initial = topology.createInitialExpansionState(resetGeneration);
  await stateRef.set(initial);

  async function applyThreshold(sourceRegionId, thresholdRevision, {
    generation = resetGeneration,
    remainingNpcCities = topology.EXPANSION_THRESHOLD_NPC_CITIES,
  } = {}) {
    return db.runTransaction(async transaction => {
      const snapshot = await transaction.get(stateRef);
      const plan = topology.planThresholdActivation({
        state: snapshot.data() || {},
        resetGeneration: generation,
        sourceRegionId,
        remainingNpcCities,
        thresholdRevision,
      });
      if (plan.changed) transaction.set(stateRef, plan.state, { merge: false });
      return {
        changed: plan.changed,
        reason: plan.reason,
        activatedRegionIds: plan.activatedRegions.map(region => region.id),
      };
    });
  }

  const firstSource = initial.admittingRegionIds[0];
  const firstWave = await Promise.all(Array.from({ length: 50 }, () => (
    applyThreshold(firstSource, 20)
  )));
  assert(firstWave.filter(result => result.changed).length === 1,
    "Concurrent threshold retries activated more than one two-map batch.");

  const afterFirst = topology.normalizeExpansionState((await stateRef.get()).data() || {});
  assert(afterFirst.revision === 2, "The first threshold did not advance exactly one revision.");
  assert(afterFirst.activeRegionIds.length === 3, "The first threshold did not activate exactly two maps.");
  assert(new Set(afterFirst.activeRegionIds).size === afterFirst.activeRegionIds.length,
    "The first threshold created duplicate active maps.");
  assert(!afterFirst.admittingRegionIds.includes(firstSource),
    "The threshold source continued admitting players after reaching 20 NPC cities.");
  assert(afterFirst.admittingRegionIds.length === 2,
    "The first threshold did not leave exactly two admitting maps.");

  const repeated = await applyThreshold(firstSource, 20);
  assert(!repeated.changed, "A repeated threshold request paid out another activation batch.");

  const belowThreshold = await applyThreshold(afterFirst.admittingRegionIds[0], 19, {
    remainingNpcCities: 21,
  });
  assert(!belowThreshold.changed && belowThreshold.reason === "threshold-not-reached",
    "A map activated before it reached the 20-NPC threshold.");

  const secondWave = await Promise.all(afterFirst.admittingRegionIds.flatMap((sourceRegionId, sourceIndex) => (
    Array.from({ length: 25 }, () => applyThreshold(sourceRegionId, 40 + sourceIndex))
  )));
  assert(secondWave.filter(result => result.changed).length === 2,
    "Two qualifying source maps did not produce exactly two idempotent activation batches.");

  const finalState = topology.normalizeExpansionState((await stateRef.get()).data() || {});
  assert(finalState.revision === 4, "Concurrent source thresholds produced the wrong revision count.");
  assert(finalState.activeRegionIds.length === 7, "Three thresholds did not activate six successor maps.");
  assert(new Set(finalState.activeRegionIds).size === finalState.activeRegionIds.length,
    "Concurrent source thresholds produced duplicate map IDs.");
  assert(Object.keys(finalState.activationReceipts).length === 3,
    "The activation ledger did not retain one receipt per qualifying source threshold.");

  let generationRejected = false;
  try {
    await applyThreshold(finalState.admittingRegionIds[0], 99, { generation: "archived-generation" });
  } catch (error) {
    generationRejected = /does not match/.test(String(error?.message || error));
  }
  assert(generationRejected, "A mismatched reset generation changed the expansion state.");

  console.log("Core-expansion emulator gate passed: 100 concurrent threshold attempts produced three unique, retry-safe two-map activation batches.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
