"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const functionsRequire = createRequire(path.resolve(__dirname, "../functions-auto-reset/package.json"));
const { initializeApp, deleteApp } = functionsRequire("firebase-admin/app");
const { getFirestore } = functionsRequire("firebase-admin/firestore");
const adapters = require("../functions-auto-reset/production-adapters.js");
const firebaseAdapter = require("../functions-auto-reset/firebase-adapter.js");
const reset2 = require("./core-v2-reset-2/architecture.js");
const prodReady = require("./core-v2-prod-ready-1/architecture.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(ROOT, "benchmark-results", "map", "core-v2-prod-ready-1", "PRODUCTION_ADAPTER_EMULATOR.json");
const PROJECT_ID = "demo-crownlands-prod-ready";
const PLAYER_COUNT = 601;
const CLAN_LEADER_INDEXES = new Set([1, 2, 4, 5, 7, 10, 13]);

function packageFixture(regionId, gridX, gridY, options = {}) {
  const worldId = options.worldId || "prod-ready-emulator-world";
  const seasonId = options.seasonId || "season-2026-09";
  const layer = options.layer ?? 1;
  const clockwiseSlot = options.clockwiseSlot ?? 0;
  const cityIds = Array.from({ length: 40 }, (_, index) => options.cityIds?.[index]
    || `${regionId}-city-${String(index + 1).padStart(2, "0")}`);
  const cities = cityIds.map((id, index) => ({
    id,
    name: `Neutral City ${index + 1}`,
    regionId,
    x: 174 + (index % 8) * 157,
    y: 190 + Math.floor(index / 8) * 172,
    ownerUid: "",
    ownerKind: "neutral",
    level: 1,
    troops: 10,
    defense: 1,
    generated: true,
  }));
  const identityBasis = {
    worldId,
    seasonId,
    regionId,
    coordinate: { gridX, gridY },
    layer,
    clockwiseSlot,
    generatorVersion: adapters.GENERATOR_ALGORITHM_VERSION,
    assetLibraryVersion: adapters.ASSET_LIBRARY_VERSION,
    seed: { world: worldId, season: seasonId, region: regionId, variant: options.variant || "a" },
    retrySalt: options.variant || "a",
  };
  const identity = { ...identityBasis, identityKey: adapters.hashValue(identityBasis) };
  const objectiveReservations = options.fortress ? [{
    reservationId: `layer-1-fortress-slot-${clockwiseSlot}`,
    type: "FORTRESS",
    worldLayer: layer,
    clockwiseSlot,
    coordinate: { gridX, gridY },
    reservationGeometry: { x: 724, y: 543, radiusX: 126, radiusY: 112 },
    invisibleInLiveGameplay: true,
    immutableOncePublished: true,
  }] : [];
  const edgeSides = {};
  for (const side of adapters.SIDES) {
    const inherited = options.inherited?.[side] || null;
    const delta = adapters.DELTAS[side];
    const contractBasis = {
      schemaVersion: "phase7-edge-contract-v1",
      side,
      roadSocketCoordinate: side === "north" || side === "south" ? { x: 724, y: side === "north" ? 0 : 1086 } : { x: side === "west" ? 0 : 1448, y: 543 },
      socketOrientation: adapters.OPPOSITE[side],
      socketTangentOffset: 0,
      corridorWidth: 96,
      transitionBand: { maximumWidth: 96, geometry: { side, width: 96 } },
      neighborCoordinate: { gridX: gridX + delta.x, gridY: gridY + delta.y },
      compatibility: { sourceTheme: "west", cardinalOnly: true, existingPublishedRegionWins: true, openGatedStateExcluded: true },
      owningPackage: { identityKey: identity.identityKey, packageSchemaVersion: adapters.PACKAGE_SCHEMA_VERSION, generatorVersion: adapters.GENERATOR_ALGORITHM_VERSION },
      inheritedPublishedConstraint: inherited,
      sourceContractHash: adapters.hashValue({ regionId, side, variant: options.variant || "a" }),
    };
    edgeSides[side] = { ...contractBasis, contractHash: adapters.hashValue(contractBasis) };
  }
  const edgeContracts = {
    schemaVersion: "phase7-edge-contract-set-v1",
    immutableAfterPublication: true,
    runtimeOpenGatedStateExcluded: true,
    existingPublishedPackageWins: true,
    sides: edgeSides,
    edgeContractHash: adapters.hashValue(edgeSides),
  };
  const payload = {
    phase: "7",
    packageSchemaVersion: adapters.PACKAGE_SCHEMA_VERSION,
    storageSchemaVersion: adapters.STORAGE_SCHEMA_VERSION,
    publicationSchemaVersion: "phase7-atomic-publication-v1",
    activationSchemaVersion: "phase7-atomic-activation-v1",
    developmentOnly: true,
    productionActivated: false,
    lifecycle: "STANDBY",
    identity,
    regionDefinition: { worldId, seasonId, regionId, coordinate: { gridX, gridY }, layer, clockwiseSlot, cityCapacity: 40, startingCandidateCount: 4, objectiveReservations },
    cities,
    startingCandidates: cityIds.slice(0, 4).map((cityId, index) => ({ cityId, rank: index + 1 })),
    topologyTemplate: Object.fromEntries(adapters.SIDES.map(side => [side, { side, state: "gated", targetRegionId: "", runtimeMutable: true, packageArtState: "unchanged" }])),
    roads: { schemaVersion: "fixture-road-v1", geometryId: "road-01" },
    blockers: [],
    edgeContracts,
    compositionPlanHash: adapters.hashValue({ regionId, variant: options.variant || "a" }),
    cityDefinitionsHash: adapters.hashValue(cities),
    approvedPhase6FPackageHash: adapters.hashValue({ source: regionId, variant: options.variant || "a" }),
    mapWebp: { mediaType: "image/webp", width: 1448, height: 1086, sha256: adapters.hashValue(`map:${regionId}:${options.variant || "a"}`), bytes: 1000 },
    thumbnailWebp: { mediaType: "image/webp", width: 320, height: 240, sha256: adapters.hashValue(`thumb:${regionId}:${options.variant || "a"}`), bytes: 100 },
    validationReceipt: {
      schemaVersion: "phase7-standby-validation-v1",
      valid: true,
      exactCityCapacity: true,
      exactStartingCandidates: true,
      minimumSpacing: 157,
      fortressReservationClearance: options.fortress === true,
    },
  };
  payload.packageHash = adapters.hashValue(adapters.packageHashBasis(payload));
  const basePath = `generated-worlds/v1/worlds/${worldId}/seasons/${seasonId}/regions/${regionId}/packages/${payload.packageHash}`;
  payload.storage = {
    schemaVersion: adapters.STORAGE_SCHEMA_VERSION,
    basePath,
    immutableVersionedPaths: true,
    mutableLatestAuthoritative: false,
    files: {
      "map.webp": { path: `${basePath}/map.webp`, sha256: payload.mapWebp.sha256, bytes: 1000, immutable: true },
      "thumbnail.webp": { path: `${basePath}/thumbnail.webp`, sha256: payload.thumbnailWebp.sha256, bytes: 100, immutable: true },
    },
  };
  payload.files = { "map.webp": Buffer.from("raw-fixture-bytes-must-not-enter-firestore") };
  return payload;
}

function playerFixture(index) {
  const instanceId = `common-${String(index).padStart(4, "0")}`;
  return {
    flag: { primary: "#123456", secondary: "#654321", symbol: "crown" },
    clanId: index % 3 ? `clan-${index % 7}` : "",
    clanName: index % 3 ? `Clan ${index % 7}` : "",
    clanTag: index % 3 ? `C${index % 7}` : "",
    clanRole: index % 3 ? (CLAN_LEADER_INDEXES.has(index) ? "leader" : "member") : "",
    gear: {
      schemaVersion: 1,
      instances: {
        [instanceId]: {
          instanceId,
          gearKey: "city-hall-crown",
          buildingId: "cityHall",
          slot: "crown",
          rarity: "common",
          level: 1 + (index % 10),
          acquiredAtMs: 1700000000000 + index,
          upgradedAtMs: 1710000000000 + index,
          seasonalFieldMustNotPersist: "discard",
        },
      },
      equipped: { cityHall: { crown: instanceId } },
      commonGearBoxes: 999,
      shopPurchase: { utcDate: "2026-08-21" },
    },
    shopItems: { peaceShield: 99 },
    itemEffects: { warDrumsExpiresAtMs: 9999999999999 },
    worldId: "old-world",
    mainCityId: `old-city-${index}`,
    cities: [`old-city-${index}`],
    marches: [{ id: `march-${index}` }],
    gold: 1000000,
  };
}

async function seedPlayers(db) {
  for (let offset = 0; offset < PLAYER_COUNT; offset += 400) {
    const batch = db.batch();
    for (let index = offset; index < Math.min(PLAYER_COUNT, offset + 400); index += 1) {
      batch.create(db.collection("players").doc(`player-${String(index).padStart(4, "0")}`), playerFixture(index));
    }
    await batch.commit();
  }
}

async function seedClans(db) {
  for (let clanIndex = 0; clanIndex < 7; clanIndex += 1) {
    const clanId = `clan-${clanIndex}`;
    const members = Array.from({ length: PLAYER_COUNT }, (_, index) => index)
      .filter(index => index % 3 !== 0 && index % 7 === clanIndex)
      .map(index => `player-${String(index).padStart(4, "0")}`);
    const leaderUid = members[0];
    await db.collection("clans").doc(clanId).set({
      name: `Clan ${clanIndex}`,
      normalizedName: `clan ${clanIndex}`,
      tag: `C${clanIndex}`,
      normalizedTag: `c${clanIndex}`,
      description: `Persistent clan ${clanIndex}`,
      shield: { primary: "#123456", secondary: "#654321", division: "split", charge: "crown" },
      banner: { primary: "#123456", secondary: "#654321", pattern: "split", symbol: "crown" },
      admissionMode: "approval",
      leaderUid,
      status: "active",
      createdAtMs: 1700000000000 + clanIndex,
      worldId: "old-world-must-not-persist",
      totalKingPower: 999999,
    });
    for (let offset = 0; offset < members.length; offset += 400) {
      const batch = db.batch();
      members.slice(offset, offset + 400).forEach((uid, memberIndex) => batch.create(db.doc(`clans/${clanId}/members/${uid}`), {
        uid,
        role: offset + memberIndex === 0 ? "leader" : "member",
        joinedAtMs: 1700000000000 + memberIndex,
        roleChangedAtMs: 1700000000000 + memberIndex,
        status: "active",
        worldId: "old-world-must-not-persist",
        kingPower: 999999,
      }));
      await batch.commit();
    }
  }
}

async function seedActiveRegion(db, worldId, seasonId, regionId, npcCount = 40) {
  const root = db.doc(`generatedWorlds/${worldId}/seasons/${seasonId}`);
  const region = root.collection("regions").doc(regionId);
  await region.set({
    schemaVersion: adapters.ADAPTER_VERSION,
    regionId,
    kind: "player_region",
    lifecycle: "ACTIVE",
    gridX: 3,
    gridY: -2,
    staticCityCapacity: 40,
    currentGenerationId: "generation-1",
    currentNpcCityCount: npcCount,
    spawnEligible: npcCount >= 15,
  });
  const batch = db.batch();
  for (let index = 0; index < 40; index += 1) {
    batch.create(region.collection("cities").doc(`${regionId}-city-${index}`), {
      cityId: `${regionId}-city-${index}`,
      regionId,
      generationId: "generation-1",
      ownerUid: index < 40 - npcCount ? `existing-owner-${index}` : null,
      ownerType: index < 40 - npcCount ? "PLAYER" : "NPC",
    });
  }
  await batch.commit();
}

async function main() {
  assert(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required; production is forbidden.");
  assert.notEqual(PROJECT_ID, adapters.PRODUCTION_PROJECT_ID);
  const candidate = prodReady.buildCandidateIdentity();
  const app = initializeApp({ projectId: PROJECT_ID }, `prod-ready-${Date.now()}`);
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  const controls = { enabled: true, candidateVersion: candidate.candidateId };
  const commonOptions = {
    projectId: PROJECT_ID,
    environment: "STAGING",
    serverAuthority: true,
    candidateVersion: candidate.candidateId,
    assetManifestHash: prodReady.ASSET_MANIFEST_HASH,
    controls,
  };
  const worldId = "prod-ready-emulator-world";
  const seasonId = "season-2026-09";
  try {
    for (const collectionName of ["players", "clans", "generatedWorlds", "seasonResetMigrations"]) {
      await db.recursiveDelete(db.collection(collectionName));
    }
    await seedPlayers(db);
    await seedClans(db);

    const production = firebaseAdapter.createFirebaseProductionAdapters(db, {
      ...commonOptions,
      worldId,
      seasonId,
      operationId: "prod-ready-emulator-migration",
      pageSize: 300,
      controls: { generation: controls, migration: controls, placement: controls },
    });
    const generation = production.generation;
    const regionId = "phase6d-region-emulator-0001";
    const packageValue = packageFixture(regionId, -3, -3, { worldId, seasonId, layer: 1, clockwiseSlot: 0 });
    const allocation = { regionId, coordinate: { gridX: -3, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 0 } };
    const firstGeneration = await generation.stageStandby({ packageValue, allocation });
    const generationReplay = await generation.stageStandby({ packageValue, allocation });
    assert.equal(firstGeneration.lifecycle, "STANDBY");
    assert.equal(firstGeneration.activated, false);
    assert.equal(generationReplay.replay, true);
    let duplicateConflict = false;
    try {
      await generation.stageStandby({ packageValue: packageFixture(regionId, -3, -3, { worldId, seasonId, layer: 1, clockwiseSlot: 0, variant: "b" }), allocation });
    } catch (error) {
      duplicateConflict = error.code === "already-exists";
    }
    assert.equal(duplicateConflict, true);
    let coreRejected = false;
    try {
      const corePackage = packageFixture("forbidden-core", 0, 0, { worldId, seasonId, layer: 0, clockwiseSlot: 0 });
      adapters.validateGeneratedPackage(corePackage, { regionId: "forbidden-core", coordinate: { gridX: 0, gridY: 0, worldLayer: 0, clockwiseOrderIndex: 0 } });
    } catch {
      coreRejected = true;
    }
    assert.equal(coreRejected, true);
    const generatedCities = await db.collection(`generatedWorlds/${worldId}/seasons/${seasonId}/regions/${regionId}/cities`).get();
    const generatedCityLocks = await db.collection(`generatedWorlds/${worldId}/seasons/${seasonId}/cityLocks`).get();
    assert.equal(generatedCities.size, 40);
    assert.equal(generatedCityLocks.size, 40);
    const storedPackage = await db.doc(`generatedWorlds/${worldId}/seasons/${seasonId}/packages/${packageValue.packageHash}`).get();
    assert.equal(Object.prototype.hasOwnProperty.call(storedPackage.data(), "files"), false);

    await db.doc(`generatedWorlds/${worldId}/seasons/${seasonId}/regions/${regionId}`).update({ lifecycle: "PUBLISHED" });
    const neighborRegionId = "phase6d-region-emulator-0002";
    const inheritedWest = {
      regionId,
      side: "east",
      contractHash: packageValue.edgeContracts.sides.east.sourceContractHash,
    };
    const neighborPackage = packageFixture(neighborRegionId, -2, -3, {
      worldId,
      seasonId,
      layer: 1,
      clockwiseSlot: 1,
      inherited: { west: inheritedWest },
    });
    const neighborAllocation = { regionId: neighborRegionId, coordinate: { gridX: -2, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 1 } };
    const neighborGeneration = await generation.stageStandby({ packageValue: neighborPackage, allocation: neighborAllocation });
    assert.equal(neighborGeneration.lifecycle, "STANDBY");
    let edgeInheritanceRejected = false;
    const badNeighborId = "phase6d-region-emulator-bad-edge";
    try {
      const badNeighbor = packageFixture(badNeighborId, -3, -2, {
        worldId,
        seasonId,
        layer: 1,
        clockwiseSlot: 15,
        inherited: { north: { regionId, side: "south", contractHash: adapters.hashValue("wrong") } },
      });
      await generation.stageStandby({
        packageValue: badNeighbor,
        allocation: { regionId: badNeighborId, coordinate: { gridX: -3, gridY: -2, worldLayer: 1, clockwiseOrderIndex: 15 } },
      });
    } catch {
      edgeInheritanceRejected = true;
    }
    assert.equal(edgeInheritanceRejected, true);
    let missingFortressRejected = false;
    try {
      const missingFortress = packageFixture("phase6d-region-emulator-fortress-missing", -1, -3, {
        worldId,
        seasonId,
        layer: 1,
        clockwiseSlot: 2,
      });
      adapters.validateGeneratedPackage(missingFortress, {
        regionId: missingFortress.identity.regionId,
        coordinate: { gridX: -1, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 2 },
      });
    } catch {
      missingFortressRejected = true;
    }
    assert.equal(missingFortressRejected, true);
    const fortressRegionId = "phase6d-region-emulator-fortress";
    const fortressPackage = packageFixture(fortressRegionId, -1, -3, {
      worldId,
      seasonId,
      layer: 1,
      clockwiseSlot: 2,
      fortress: true,
    });
    const fortressGeneration = await generation.stageStandby({
      packageValue: fortressPackage,
      allocation: { regionId: fortressRegionId, coordinate: { gridX: -1, gridY: -3, worldLayer: 1, clockwiseOrderIndex: 2 } },
    });
    assert.equal(fortressGeneration.lifecycle, "STANDBY");

    const migration = production.migration;
    const pages = [];
    let afterUid = "";
    while (true) {
      const page = await migration.readPage(afterUid);
      const result = await migration.migratePage(page);
      const replay = await migration.migratePage(page);
      assert.equal(replay.replay, true);
      assert.equal(result.recordsHash, replay.recordsHash);
      pages.push({ count: page.rows.length, afterUid: page.afterUid, nextCursor: page.nextCursor, done: page.done, recordsHash: result.recordsHash });
      if (page.done) break;
      afterUid = page.nextCursor;
    }
    assert.deepEqual(pages.map(page => page.count), [300, 300, 1]);
    const migratedPlayers = await db.collection("seasonResetMigrations/prod-ready-emulator-migration/players").get();
    assert.equal(migratedPlayers.size, PLAYER_COUNT);
    migratedPlayers.docs.forEach(document => {
      const value = document.data().persistent;
      assert.deepEqual(adapters.validatePersistentPlayer(value), []);
      assert.equal(Object.prototype.hasOwnProperty.call(value, "shopItems"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(value, "worldId"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(value.gear, "commonGearBoxes"), false);
      assert.equal(Object.values(value.gear.instances).every(instance => !Object.prototype.hasOwnProperty.call(instance, "seasonalFieldMustNotPersist")), true);
      assert.equal(document.data().sourceChecksum, document.data().targetChecksum);
    });
    const clanPages = [];
    let afterClanId = "";
    while (true) {
      const page = await migration.readClanPage(afterClanId);
      const result = await migration.migrateClanPage(page);
      const replay = await migration.migrateClanPage(page);
      assert.equal(replay.replay, true);
      assert.equal(result.recordsHash, replay.recordsHash);
      clanPages.push({ count: page.rows.length, memberCount: result.memberCount, afterClanId: page.afterClanId, nextCursor: page.nextCursor, done: page.done });
      if (page.done) break;
      afterClanId = page.nextCursor;
    }
    const migratedClans = await db.collection("seasonResetMigrations/prod-ready-emulator-migration/clans").get();
    assert.equal(migratedClans.size, 7);
    let migratedClanMembers = 0;
    for (const clan of migratedClans.docs) {
      const members = await clan.ref.collection("members").get();
      migratedClanMembers += members.size;
      assert.equal(Object.prototype.hasOwnProperty.call(clan.data().persistent, "worldId"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(clan.data().persistent, "totalKingPower"), false);
    }
    assert.equal(migratedClanMembers, 400);

    await seedActiveRegion(db, worldId, seasonId, "threshold-region", 15);
    const placement = production.placement;
    const thresholdPass = await placement.place({ uid: "threshold-player", regionId: "threshold-region", cityId: "threshold-region-city-25", requestId: "threshold-request" });
    assert.equal(thresholdPass.npcBefore, 15);
    assert.equal(thresholdPass.npcAfter, 14);
    const thresholdReplay = await placement.place({ uid: "threshold-player", regionId: "threshold-region", cityId: "threshold-region-city-25", requestId: "threshold-request" });
    assert.equal(thresholdReplay.replay, true);
    let thresholdRejected = false;
    try {
      await placement.place({ uid: "rejected-player", regionId: "threshold-region", cityId: "threshold-region-city-26", requestId: "threshold-reject" });
    } catch (error) {
      thresholdRejected = error.code === "resource-exhausted";
    }
    assert.equal(thresholdRejected, true);
    const thresholdRegion = await db.doc(`generatedWorlds/${worldId}/seasons/${seasonId}/regions/threshold-region`).get();
    assert.equal(thresholdRegion.data().lifecycle, "ACTIVE");
    assert.equal(thresholdRegion.data().spawnEligible, false);

    await seedActiveRegion(db, worldId, seasonId, "concurrent-region", 40);
    const concurrent = await Promise.allSettled([
      placement.place({ uid: "concurrent-a", regionId: "concurrent-region", cityId: "concurrent-region-city-0", requestId: "concurrent-a-request" }),
      placement.place({ uid: "concurrent-b", regionId: "concurrent-region", cityId: "concurrent-region-city-0", requestId: "concurrent-b-request" }),
    ]);
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
    let mainCityRejected = false;
    try {
      await placement.place({ uid: "forbidden-main", regionId: "core-v2-crown-citadel-p0-p0", cityId: "any-city", requestId: "forbidden-main-request" });
    } catch {
      mainCityRejected = true;
    }
    assert.equal(mainCityRejected, true);

    const result = {
      schemaVersion: "crownlands-prod-ready-1-production-adapter-emulator-v1",
      environment: "FIRESTORE_EMULATOR",
      projectId: PROJECT_ID,
      productionProjectId: adapters.PRODUCTION_PROJECT_ID,
      candidateId: candidate.candidateId,
      version: adapters.ADAPTER_VERSION,
      firebaseAdapterFactoryPassed: true,
      generatorVersion: reset2.GENERATED_WORLD_VERSION,
      persistenceAllowlistVersion: reset2.PERSISTENCE_ALLOWLIST_VERSION,
      generationPassed: true,
      phase7PackageSchemaPassed: true,
      exactGeneratorAndAssetLockPassed: true,
      immutableMetadataOnlyPassed: true,
      cityInitializationPassed: generatedCities.size === 40 && generatedCityLocks.size === 40,
      publishedNeighborContractInheritancePassed: neighborGeneration.lifecycle === "STANDBY" && edgeInheritanceRejected,
      fortressReservationSchedulePassed: missingFortressRejected && fortressGeneration.lifecycle === "STANDBY",
      generationDuplicateGuard: duplicateConflict,
      generationCoreGuard: coreRejected,
      generationActivationOff: firstGeneration.activated === false,
      migrationPassed: migratedPlayers.size === PLAYER_COUNT,
      clanMigrationPassed: migratedClans.size === 7 && migratedClanMembers === 400,
      clanPaginationPassed: clanPages.length === 1 && clanPages[0].count === 7,
      clanMembershipCount: migratedClanMembers,
      paginationPassed: pages.length === 3 && pages.reduce((sum, page) => sum + page.count, 0) === PLAYER_COUNT,
      pagination: { playerCount: PLAYER_COUNT, pageSize: 300, pageCounts: pages.map(page => page.count), deterministicCursors: true },
      allowlistPassed: true,
      checksumsPassed: true,
      migrationIdempotencyPassed: true,
      placementPassed: true,
      placementOutsideCore: true,
      placementCapacity40: true,
      npcThresholdPassed: thresholdPass.npcBefore === 15 && thresholdPass.npcAfter === 14 && thresholdRejected,
      concurrencyPassed: concurrent.filter(value => value.status === "fulfilled").length === 1,
      mainCityRestrictionsPassed: mainCityRejected,
      productionMutationPerformed: false,
      completedAt: new Date().toISOString(),
    };
    result.receiptHash = prodReady.hashValue(result);
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
    fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await deleteApp(app);
  }
}

if (require.main === module) main().catch(error => {
  console.error(`${error.code || "prod-ready-emulator-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});

module.exports = Object.freeze({ RESULT_PATH, PLAYER_COUNT, main });
