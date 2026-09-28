"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const vm = require("node:vm");
const topology = require("../functions/coreExpansionTopology");
const layout = require("../functions/core-expansion-world-layout.json");
const { extractFunction, serverSource, createTravelFixture } = require("./world-travel-test-fixtures");
const plain = value => JSON.parse(JSON.stringify(value));

function validateAdmission() {
  const generation = "realm-reset-test";
  let state = topology.createResetExpansionState(generation);
  let legacy = topology.createInitialExpansionState(generation);
  const resetIds = topology.getResetNewLandsRegionIds();
  assert.equal(resetIds.length, 56);
  assert.equal(resetIds.filter(id => topology.parseNewLandsRegionId(id).worldLayer === 1).length, 24);
  assert.equal(resetIds.filter(id => topology.parseNewLandsRegionId(id).worldLayer === 2).length, 32);
  assert.deepEqual(state.activeRegionIds, resetIds);
  assert.deepEqual(state.admittingRegionIds, [resetIds[0]]);
  assert.equal(state.nextActivationOrdinal, 56);
  assert.equal(state.nextAdmissionOrdinal, 1);
  assert.deepEqual(topology.normalizeExpansionState(state), state);
  assert.equal(topology.planFirstLayerCompletion({ state, resetGeneration: generation }).reason, "already-complete");

  // Compare actual admission transitions with the existing algorithm, including
  // the Layer 1/2 and Layer 2/3 boundaries. Open territory must not skip capacity.
  for (let turn = 0; turn < 40; turn += 1) {
    assert.deepEqual(state.admittingRegionIds, legacy.admittingRegionIds);
    const sourceRegionId = state.admittingRegionIds[0];
    const args = { resetGeneration: generation, sourceRegionId, remainingNpcCities: 20, thresholdRevision: turn };
    const plan = topology.planThresholdActivation({ ...args, state });
    const oldPlan = topology.planThresholdActivation({ ...args, state: legacy });
    assert.deepEqual(plan.preparedRegions, oldPlan.preparedRegions);
    assert.deepEqual(plan.state.activeRegionIds, state.activeRegionIds, "Unverified new maps must stay closed");
    assert.deepEqual(topology.finalizePendingActivation({
      state: plan.state, eventId: plan.eventId, readyRegionIds: plan.state.pendingActivation.regionIds.slice(0, 1),
    }).state, plan.state, "A partial preparation must not admit the pair");
    const rollback = topology.rollbackPendingActivation({ state: plan.state, eventId: plan.eventId });
    assert.equal(rollback.state.nextAdmissionOrdinal, state.nextAdmissionOrdinal);
    assert.deepEqual(rollback.state.activeRegionIds, state.activeRegionIds);
    assert.deepEqual(topology.planThresholdActivation({ ...args, state: rollback.state }).preparedRegions, plan.preparedRegions);
    state = topology.finalizePendingActivation({
      state: plan.state, eventId: plan.eventId, readyRegionIds: plan.state.pendingActivation.regionIds,
    }).state;
    legacy = topology.finalizePendingActivation({
      state: oldPlan.state, eventId: oldPlan.eventId, readyRegionIds: oldPlan.state.pendingActivation.regionIds,
    }).state;
    assert.equal(state.nextAdmissionOrdinal, legacy.nextActivationOrdinal);
    assert.equal(state.activeRegionIds.length, Math.max(56, legacy.activeRegionIds.length));
    assert.equal(topology.planThresholdActivation({ ...args, state }).changed, false);
  }
  assert(state.activeRegionIds.includes("new-lands-l03-p001"));
  // Older persisted states must not gain a new cursor or be rewound on deploy.
  const current = { ...topology.createInitialExpansionState(generation),
    activeRegionIds: Array.from({ length: 68 }, (_, i) => topology.getRegionAtActivationOrdinal(i).id),
    admittingRegionIds: [topology.getRegionAtActivationOrdinal(67).id], nextActivationOrdinal: 68 };
  assert.equal(topology.normalizeExpansionState(current).nextAdmissionOrdinal, undefined);
  assert.equal(topology.planThresholdActivation({ state: current, resetGeneration: generation,
    sourceRegionId: current.admittingRegionIds[0], remainingNpcCities: 20 }).preparedRegions[0].activationOrdinal, 68);

  const fixture = createTravelFixture(56);
  assert.equal(fixture.descriptors.length, 81);
  for (const id of resetIds) {
    assert(fixture.planner.findRegionChain(resetIds[0], id)?.length, `Reset map ${id} is unreachable`);
  }
  assert(!fixture.descriptors.some(region => region.id === "new-lands-l03-p001"));
}

async function validateResetGate() {
  const generation = "realm-reset-test", worldId = "main-realm-reset-test";
  const statePath = `realmGenerations/${generation}/expansion/current`;
  const readyPath = `realmGenerations/${generation}/resetActivation/current`;
  const previousPointer = { worldId: "previous-world", resetGeneration: "previous-generation" };
  const documents = new Map([["realmConfig/current", previousPointer]]);
  const seeds = new Map();
  const reads = [];
  const maps = new Map(layout.maps.map(map => [map.id, map]));
  const lastMap = topology.getResetNewLandsRegionIds().at(-1);
  let failSeed = true, failVerification = false;
  const doc = path => ({
    async get() { reads.push(path); return { exists: documents.has(path), data: () => documents.get(path) }; },
    async set(value, options) { documents.set(path, { ...(options?.merge ? documents.get(path) : {}), ...plain(value) }); },
  });
  const scope = {
    crypto, CORE_EXPANSION: topology, RESET_GENERATION: generation, ONLINE_WORLD_ID: worldId,
    REALM_RELEASE_ID: "test-release", SHARED_REALM_ID: "shard_0001", LEGACY_REALM_SHARD_ID: "legacy",
    CORE_PERMANENT_REGION_IDS: layout.maps.filter(map => !topology.parseNewLandsRegionId(map.id)).map(map => map.id),
    FieldValue: { serverTimestamp: () => 0 }, HttpsError: Error,
    REALM_TOPOLOGY: { normalizeRealmShardId: value => value },
    REALM_REQUEST_CONTEXT: { getStore: () => null },
    safeString: value => String(value || ""), safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    db: { doc }, getCurrentRealmShardId: () => "shard_0001", isCoreExpansionTopologyActive: () => true,
    getCurrentRealmStartingCityCapacity: () => 81900, logOperation: () => {},
    refreshActiveRealmIdentity: () => ({ mode: "monthly-shared", worldId, resetGeneration: generation,
      monthKey: "test", startsAtMs: 1, endsAtMs: 2 }),
    runTransactionWithInfrastructureRetry: fn => fn({ get: ref => ref.get(), set: (ref, value, options) => ref.set(value, options) }),
    processWithConcurrency: async (items, _limit, fn) => { for (const item of items) await fn(item); },
    ensureMainIslandForPlayer: async (_uid, { regionId }) => {
      if (failSeed && regionId === lastMap) throw Error("injected seed interruption");
      if (!seeds.has(regionId)) seeds.set(regionId, { marker: "neutral seed" });
      return { writes: 0 };
    },
    verifyPreparedExpansionRegion: async regionId => ({ regionId,
      ready: seeds.has(regionId) && !(failVerification && regionId === lastMap),
      verifiedCityCount: maps.get(regionId).cities.length, verifiedCampCount: maps.get(regionId).camps?.length || 0 }),
  };
  vm.createContext(scope);
  for (const name of ["coreExpansionStateRef", "ensureCoreExpansionState", "coreExpansionResetReadinessRef",
    "isCurrentCoreExpansionResetReady", "ensureCoreExpansionResetReady", "ensureCurrentRealmConfiguration"]) {
    vm.runInContext((name.startsWith("ensure") ? "async " : "") + extractFunction(serverSource, name), scope);
  }
  await assert.rejects(scope.ensureCurrentRealmConfiguration(), /injected seed interruption/);
  assert.deepEqual(documents.get("realmConfig/current"), previousPointer);
  assert.equal(documents.get(readyPath).status, "failed");
  assert.equal(seeds.size, 80);
  const retained = { marker: "existing city must survive retry" };
  seeds.set(topology.getResetNewLandsRegionIds()[0], retained);
  failSeed = false;
  failVerification = true;
  await assert.rejects(scope.ensureCurrentRealmConfiguration(), /failed verification/);
  assert.deepEqual(documents.get("realmConfig/current"), previousPointer);
  assert.equal(documents.get(readyPath).status, "failed");
  failVerification = false;
  const result = await scope.ensureCurrentRealmConfiguration();
  assert.equal(result.resetReadiness.regionCount, 81);
  assert.equal(result.resetReadiness.cityCount, 3720);
  assert.deepEqual(result.resetReadiness.initialNewLandsRegionIds, topology.getResetNewLandsRegionIds());
  assert.equal(documents.get("realmConfig/current").worldId, worldId);
  assert.equal(documents.get(statePath).nextAdmissionOrdinal, 1);
  assert.equal(seeds.get(topology.getResetNewLandsRegionIds()[0]), retained);
  const savedState = plain(documents.get(statePath));
  const savedReadiness = plain(documents.get(readyPath));
  // A completed current season's readiness receipt remains authoritative, even
  // if that season used the old 26-map initialization policy.
  documents.set(readyPath, { ...savedReadiness, regionCount: 26, cityCount: 1520 });
  reads.length = 0;
  await scope.ensureCurrentRealmConfiguration();
  assert(!reads.includes(statePath), "Existing ready realms must not be reinitialized");
  assert.deepEqual(documents.get(statePath), savedState);
  assert.equal(documents.get(readyPath).regionCount, 26);
}

async function main() {
  validateAdmission();
  await validateResetGate();
  console.log("Validated 81-map reset preparation, fail-closed pointer, retry recovery, unchanged existing realms, and legacy-equivalent clockwise admission through Layer 3.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
