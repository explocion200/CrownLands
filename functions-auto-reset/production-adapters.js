"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { FieldPath, FieldValue } = require("firebase-admin/firestore");

const PRODUCTION_PROJECT_ID = "crown-land-b15e0";
const STAGING_PROJECT_ID = "crownlands-map-staging-2026";
const ADAPTER_VERSION = "crownlands-prod-ready-1-adapters-v1";
const PACKAGE_SCHEMA_VERSION = "phase7-generated-region-package-v1";
const STORAGE_SCHEMA_VERSION = "phase7-immutable-storage-v1";
const GENERATOR_ALGORITHM_VERSION = "phase6f-road-geometry-decoupling-v1";
const ASSET_LIBRARY_VERSION = "phase6d-macro-variation-v1";
const ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const CITY_CAPACITY = 40;
const STARTING_CANDIDATE_COUNT = 4;
const MINIMUM_NPC_CITIES_FOR_SPAWN = 15;
const CORE_RADIUS = 2;
const DEFAULT_PAGE_SIZE = 300;
const MAX_PAGE_SIZE = 500;
const MAX_CLAN_PAGE_SIZE = 100;
const COMMON_GEAR_SCHEMA_VERSION = 1;
const FORTRESS_LAYER_ONE_SLOTS = Object.freeze(new Set([2, 8, 14, 20]));
const SIDES = Object.freeze(["north", "east", "south", "west"]);
const OPPOSITE = Object.freeze({ north: "south", east: "west", south: "north", west: "east" });
const DELTAS = Object.freeze({
  north: Object.freeze({ x: 0, y: -1 }),
  east: Object.freeze({ x: 1, y: 0 }),
  south: Object.freeze({ x: 0, y: 1 }),
  west: Object.freeze({ x: -1, y: 0 }),
});

const PERSISTENT_PLAYER_FIELDS = Object.freeze([
  "flag",
  "clanId",
  "clanName",
  "clanTag",
  "clanRole",
]);
const PERSISTENT_GEAR_FIELDS = Object.freeze(["schemaVersion", "instances", "equipped"]);
const PERSISTENT_GEAR_INSTANCE_FIELDS = Object.freeze([
  "instanceId",
  "gearKey",
  "buildingId",
  "slot",
  "rarity",
  "level",
  "acquiredAtMs",
  "upgradedAtMs",
]);
const PERSISTENT_CLAN_FIELDS = Object.freeze([
  "name", "normalizedName", "tag", "normalizedTag", "description", "shield", "banner", "admissionMode",
  "leaderUid", "status", "lastNameChangedAtMs", "nextNameChangeAtMs", "createdAtMs",
]);
const PERSISTENT_CLAN_MEMBER_FIELDS = Object.freeze(["uid", "role", "joinedAtMs", "roleChangedAtMs", "status"]);
const FORBIDDEN_MAIN_CITY_REGIONS = Object.freeze(new Set([
  "core-v2-crown-citadel-p0-p0",
  "core-v2-greybanner-hold-p0-m1",
  "core-v2-aurum-keep-m1-p0",
  "core-v2-swiftgate-p1-p0",
  "core-v2-ironwatch-p0-p1",
]));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function definedFields(source, fields) {
  return Object.fromEntries(fields.filter(field => source[field] !== undefined).map(field => [field, clone(source[field])]));
}

function cleanId(value, label) {
  const result = String(value || "").trim();
  assert(result && result.length <= 160 && /^[a-zA-Z0-9_.-]+$/.test(result), `${label} is invalid.`);
  return result;
}

function cleanHash(value, label = "hash") {
  const result = String(value || "").trim().toLowerCase();
  assert(/^[a-f0-9]{64}$/.test(result), `${label} must be SHA-256.`);
  return result;
}

function environmentForProject(projectId) {
  if (projectId === PRODUCTION_PROJECT_ID) return "PRODUCTION";
  if (projectId === STAGING_PROJECT_ID || projectId.startsWith("demo-")) return "STAGING";
  return "DEVELOPMENT";
}

function requiredAuthorization(operation, projectId, candidateVersion) {
  return `AUTHORIZE_${operation.toUpperCase()}_FOR:${projectId}:${candidateVersion}`;
}

function requireAuthority(options, operation) {
  const projectId = cleanId(options.projectId, "projectId");
  const environment = environmentForProject(projectId);
  assert.equal(options.serverAuthority, true, `${operation} requires server/admin authority.`);
  assert.equal(options.environment, environment, `${operation} environment does not match project ${projectId}.`);
  assert.equal(options.controls?.enabled, true, `${operation} control is OFF.`);
  const candidateVersion = cleanId(options.candidateVersion, "candidateVersion");
  assert.equal(options.controls?.candidateVersion, candidateVersion, `${operation} candidate mismatch.`);
  if (environment === "PRODUCTION") {
    assert.equal(projectId, PRODUCTION_PROJECT_ID);
    assert.equal(
      options.productionAuthorization,
      requiredAuthorization(operation, projectId, candidateVersion),
      `${operation} lacks explicit production authorization.`,
    );
  } else {
    assert.notEqual(projectId, PRODUCTION_PROJECT_ID);
  }
  return Object.freeze({ projectId, environment, candidateVersion, operation });
}

function isCoreCoordinate(gridX, gridY) {
  return Math.abs(gridX) <= CORE_RADIUS && Math.abs(gridY) <= CORE_RADIUS;
}

function packageHashBasis(packageValue) {
  return {
    packageSchemaVersion: packageValue.packageSchemaVersion,
    storageSchemaVersion: packageValue.storageSchemaVersion,
    identity: packageValue.identity,
    compositionPlanHash: packageValue.compositionPlanHash,
    regionDefinitionHash: hashValue(packageValue.regionDefinition),
    cityDefinitionsHash: packageValue.cityDefinitionsHash,
    startingCandidatesHash: hashValue(packageValue.startingCandidates),
    topologyTemplateHash: hashValue(packageValue.topologyTemplate),
    blockerHash: hashValue(packageValue.blockers),
    roadHash: hashValue(packageValue.roads),
    edgeContractHash: packageValue.edgeContracts?.edgeContractHash,
    validationReceiptHash: hashValue(packageValue.validationReceipt),
    mapWebpHash: packageValue.mapWebp?.sha256,
    thumbnailWebpHash: packageValue.thumbnailWebp?.sha256,
    generatorVersion: packageValue.identity?.generatorVersion,
    assetLibraryVersion: packageValue.identity?.assetLibraryVersion,
  };
}

function validateGeneratedPackage(packageValue, allocation) {
  assert(packageValue && typeof packageValue === "object", "A generated package is required.");
  assert.equal(packageValue.packageSchemaVersion, PACKAGE_SCHEMA_VERSION, "Generated package schema drifted.");
  assert.equal(packageValue.storageSchemaVersion, STORAGE_SCHEMA_VERSION, "Generated package storage schema drifted.");
  assert.equal(packageValue.lifecycle, "STANDBY", "Only a validated STANDBY package may be staged.");
  assert.equal(packageValue.developmentOnly, true, "Phase 7 package provenance is missing.");
  assert.equal(packageValue.productionActivated, false, "Generation may not activate a region.");
  const identity = packageValue.identity || {};
  const regionId = cleanId(identity.regionId, "regionId");
  const packageHash = cleanHash(packageValue.packageHash, "packageHash");
  assert.equal(hashValue(packageHashBasis(packageValue)), packageHash, "Generated package hash mismatch.");
  assert.equal(identity.generatorVersion, GENERATOR_ALGORITHM_VERSION, "Generated package algorithm version drifted.");
  assert.equal(identity.assetLibraryVersion, ASSET_LIBRARY_VERSION, "Generated package asset-library version drifted.");
  const identityKey = cleanHash(identity.identityKey, "identityKey");
  const identityBasis = clone(identity);
  delete identityBasis.identityKey;
  assert.equal(hashValue(identityBasis), identityKey, "Generated package identity hash mismatch.");
  assert(Array.isArray(packageValue.cities), "Generated package cities are missing.");
  assert.equal(packageValue.cities.length, CITY_CAPACITY, "Generated player regions require exactly 40 cities.");
  const cityIds = packageValue.cities.map(city => cleanId(city.id, "cityId"));
  assert.equal(new Set(cityIds).size, CITY_CAPACITY, "Generated city IDs must be unique.");
  assert.equal(hashValue(packageValue.cities), packageValue.cityDefinitionsHash, "Generated city-definition hash mismatch.");
  for (const city of packageValue.cities) {
    assert.equal(city.regionId, regionId, "Generated city belongs to the wrong region.");
    assert(Number.isFinite(city.x) && Number.isFinite(city.y), "Generated city coordinates are invalid.");
    assert(city.x >= 0 && city.x <= 1448 && city.y >= 0 && city.y <= 1086, "Generated city is outside map bounds.");
  }
  for (let left = 0; left < packageValue.cities.length; left += 1) {
    for (let right = left + 1; right < packageValue.cities.length; right += 1) {
      const a = packageValue.cities[left];
      const b = packageValue.cities[right];
      assert(Math.hypot(a.x - b.x, a.y - b.y) >= 112, "Generated city spacing is below 112 px.");
    }
  }
  assert(Array.isArray(packageValue.startingCandidates), "Starting candidates are missing.");
  assert.equal(packageValue.startingCandidates.length, STARTING_CANDIDATE_COUNT);
  const cityIdSet = new Set(cityIds);
  assert(packageValue.startingCandidates.every(candidate => cityIdSet.has(candidate.cityId || candidate.id)), "Starting candidate is not a generated city.");
  const coordinate = allocation.coordinate || allocation;
  const gridX = Number(coordinate.gridX);
  const gridY = Number(coordinate.gridY);
  assert(Number.isSafeInteger(gridX) && Number.isSafeInteger(gridY), "Allocated coordinate must be integral.");
  assert.equal(isCoreCoordinate(gridX, gridY), false, "Generic generation may never target a permanent Core coordinate.");
  assert.equal(cleanId(allocation.regionId, "allocation regionId"), regionId);
  assert.equal(identity.coordinate?.gridX, gridX, "Generated package X coordinate differs from allocation.");
  assert.equal(identity.coordinate?.gridY, gridY, "Generated package Y coordinate differs from allocation.");
  assert.equal(identity.layer, coordinate.worldLayer, "Generated package layer differs from allocation.");
  assert.equal(identity.clockwiseSlot, coordinate.clockwiseOrderIndex, "Generated package clockwise slot differs from allocation.");
  assert(Number.isSafeInteger(identity.layer) && identity.layer >= 1, "Generated region must be outside the Core.");
  assert(Number.isSafeInteger(identity.clockwiseSlot) && identity.clockwiseSlot >= 0, "Generated package lacks a clockwise slot.");
  assert.equal(packageValue.regionDefinition?.regionId, regionId, "Region definition identity mismatch.");
  assert.equal(packageValue.regionDefinition?.cityCapacity, CITY_CAPACITY, "Region definition capacity drifted.");
  assert.equal(packageValue.regionDefinition?.startingCandidateCount, STARTING_CANDIDATE_COUNT, "Region starting-candidate count drifted.");
  const reservations = Array.isArray(packageValue.regionDefinition?.objectiveReservations)
    ? packageValue.regionDefinition.objectiveReservations
    : [];
  const fortressReservations = reservations.filter(reservation => reservation?.type === "FORTRESS");
  if (identity.layer === 1 && FORTRESS_LAYER_ONE_SLOTS.has(identity.clockwiseSlot)) {
    assert.equal(fortressReservations.length, 1, "Scheduled Layer 1 Fortress reservation is missing.");
    const fortress = fortressReservations[0];
    assert.equal(fortress.worldLayer, 1, "Fortress reservation layer mismatch.");
    assert.equal(fortress.clockwiseSlot, identity.clockwiseSlot, "Fortress reservation slot mismatch.");
    assert.deepEqual(fortress.coordinate, identity.coordinate, "Fortress reservation coordinate mismatch.");
    assert.equal(fortress.invisibleInLiveGameplay, true, "Fortress reservation must remain invisible.");
    assert.equal(fortress.immutableOncePublished, true, "Fortress reservation must become immutable on publication.");
    assert(Number.isFinite(fortress.reservationGeometry?.x) && Number.isFinite(fortress.reservationGeometry?.y), "Fortress reservation geometry is invalid.");
    assert.equal(packageValue.validationReceipt?.fortressReservationClearance, true, "Fortress reservation clearance did not pass.");
  } else if (identity.layer === 1) {
    assert.equal(fortressReservations.length, 0, "Unexpected Layer 1 Fortress reservation.");
  }
  assert.equal(packageValue.mapWebp?.width, 1448, "Generated map width drifted.");
  assert.equal(packageValue.mapWebp?.height, 1086, "Generated map height drifted.");
  cleanHash(packageValue.mapWebp?.sha256, "mapWebp hash");
  assert.equal(packageValue.thumbnailWebp?.width, 320, "Generated thumbnail width drifted.");
  assert.equal(packageValue.thumbnailWebp?.height, 240, "Generated thumbnail height drifted.");
  cleanHash(packageValue.thumbnailWebp?.sha256, "thumbnailWebp hash");
  assert.equal(packageValue.edgeContracts?.immutableAfterPublication, true, "Published edge contracts must be immutable.");
  assert.equal(packageValue.edgeContracts?.runtimeOpenGatedStateExcluded, true, "Runtime OPEN/GATED state must remain outside package hashes.");
  assert.equal(packageValue.edgeContracts?.existingPublishedPackageWins, true, "Earlier published edge contracts must win.");
  assert.deepEqual(Object.keys(packageValue.edgeContracts?.sides || {}).sort(), [...SIDES].sort(), "Exactly four cardinal edge contracts are required.");
  assert.equal(hashValue(packageValue.edgeContracts.sides), packageValue.edgeContracts.edgeContractHash, "Edge-contract hash mismatch.");
  for (const side of SIDES) {
    const contract = packageValue.edgeContracts.sides[side];
    assert.equal(contract.side, side, `Edge contract side mismatch: ${side}.`);
    assert.equal(contract.compatibility?.cardinalOnly, true, `Edge contract is not cardinal-only: ${side}.`);
    assert.equal(contract.compatibility?.existingPublishedRegionWins, true, `Published-neighbor precedence missing: ${side}.`);
    assert.equal(contract.compatibility?.openGatedStateExcluded, true, `Runtime edge state leaked: ${side}.`);
    const contractBasis = clone(contract);
    delete contractBasis.contractHash;
    assert.equal(hashValue(contractBasis), contract.contractHash, `Edge contract hash mismatch: ${side}.`);
  }
  assert.equal(packageValue.storage?.schemaVersion, STORAGE_SCHEMA_VERSION, "Immutable storage schema drifted.");
  assert.equal(packageValue.storage?.immutableVersionedPaths, true, "Generated storage paths must be immutable.");
  assert.equal(packageValue.storage?.mutableLatestAuthoritative, false, "A mutable latest package may not be authoritative.");
  assert(packageValue.storage?.basePath?.includes(`/packages/${packageHash}`), "Package storage path is not content-addressed.");
  for (const descriptor of Object.values(packageValue.storage?.files || {})) {
    assert.equal(descriptor.immutable, true, "Generated package file is mutable.");
    assert(String(descriptor.path || "").includes(`/packages/${packageHash}/`), "Generated package file path is not content-addressed.");
    cleanHash(descriptor.sha256, "generated package file hash");
  }
  assert.equal(packageValue.validationReceipt?.valid, true, "Generated package validation receipt did not pass.");
  return Object.freeze({ regionId, packageHash, gridX, gridY, cityIds, identity });
}

function compactPackageMetadata(packageValue) {
  const fields = [
    "packageSchemaVersion", "storageSchemaVersion", "publicationSchemaVersion", "activationSchemaVersion",
    "developmentOnly", "productionActivated", "lifecycle", "identity", "regionDefinition", "startingCandidates",
    "topologyTemplate", "edgeContracts", "compositionPlanHash", "cityDefinitionsHash", "approvedPhase6FPackageHash",
    "mapWebp", "thumbnailWebp", "roadPresentation", "validationReceipt", "packageHash", "storage", "manifest", "metrics",
  ];
  return Object.fromEntries(fields.filter(field => packageValue[field] !== undefined).map(field => [field, clone(packageValue[field])]));
}

function extractPersistentGear(rawGear = {}) {
  const instances = rawGear.instances && typeof rawGear.instances === "object" && !Array.isArray(rawGear.instances)
    ? rawGear.instances
    : {};
  const equipped = rawGear.equipped && typeof rawGear.equipped === "object" && !Array.isArray(rawGear.equipped)
    ? rawGear.equipped
    : {};
  const persistentInstances = Object.fromEntries(Object.entries(instances).map(([instanceId, instance = {}]) => [
    instanceId,
    definedFields(instance, PERSISTENT_GEAR_INSTANCE_FIELDS),
  ]));
  return {
    schemaVersion: rawGear.schemaVersion ?? COMMON_GEAR_SCHEMA_VERSION,
    instances: persistentInstances,
    equipped: clone(equipped),
  };
}

function extractPersistentPlayer(player = {}) {
  const result = Object.fromEntries(PERSISTENT_PLAYER_FIELDS.map(field => {
    const value = clone(player[field]);
    return [field, value === undefined ? (field === "flag" ? null : "") : value];
  }));
  result.gear = extractPersistentGear(player.gear || player.Gear || {});
  return result;
}

function validatePersistentPlayer(payload = {}) {
  const errors = [];
  const allowed = new Set([...PERSISTENT_PLAYER_FIELDS, "gear"]);
  for (const field of Object.keys(payload)) if (!allowed.has(field)) errors.push(`unexpected:${field}`);
  for (const field of PERSISTENT_PLAYER_FIELDS) if (!Object.prototype.hasOwnProperty.call(payload, field)) errors.push(`missing:${field}`);
  if (!payload.gear || typeof payload.gear !== "object") errors.push("missing:gear");
  else {
    for (const field of Object.keys(payload.gear)) if (!PERSISTENT_GEAR_FIELDS.includes(field)) errors.push(`unexpected:gear.${field}`);
    for (const [instanceId, instance] of Object.entries(payload.gear.instances || {})) {
      for (const field of Object.keys(instance || {})) {
        if (!PERSISTENT_GEAR_INSTANCE_FIELDS.includes(field)) errors.push(`unexpected:gear.instances.${instanceId}.${field}`);
      }
      if (String(instance?.rarity || "").toLowerCase() !== "common") errors.push(`non-common:${instanceId}`);
    }
    if (payload.gear.schemaVersion !== COMMON_GEAR_SCHEMA_VERSION) errors.push("invalid:gear.schemaVersion");
    if (!payload.gear.instances || typeof payload.gear.instances !== "object" || Array.isArray(payload.gear.instances)) errors.push("invalid:gear.instances");
    if (!payload.gear.equipped || typeof payload.gear.equipped !== "object" || Array.isArray(payload.gear.equipped)) errors.push("invalid:gear.equipped");
    for (const slots of Object.values(payload.gear.equipped || {})) {
      for (const instanceId of Object.values(slots && typeof slots === "object" ? slots : {})) {
        if (instanceId && !payload.gear.instances?.[instanceId]) errors.push(`unowned-equipped:${instanceId}`);
      }
    }
  }
  return errors;
}

function extractPersistentClan(clan = {}) {
  return definedFields(clan, PERSISTENT_CLAN_FIELDS);
}

function extractPersistentClanMember(uid, member = {}) {
  return { uid: cleanId(member.uid || uid, "clan member uid"), ...definedFields(member, PERSISTENT_CLAN_MEMBER_FIELDS.filter(field => field !== "uid")) };
}

function validatePersistentClan(clanId, clan = {}, members = []) {
  const errors = [];
  for (const field of Object.keys(clan)) if (!PERSISTENT_CLAN_FIELDS.includes(field)) errors.push(`unexpected:clan.${field}`);
  if (!String(clan.name || "").trim()) errors.push("missing:clan.name");
  if (!String(clan.tag || "").trim()) errors.push("missing:clan.tag");
  if (!String(clan.leaderUid || "").trim()) errors.push("missing:clan.leaderUid");
  const seen = new Set();
  for (const member of members) {
    for (const field of Object.keys(member)) if (!PERSISTENT_CLAN_MEMBER_FIELDS.includes(field)) errors.push(`unexpected:member.${field}`);
    if (seen.has(member.uid)) errors.push(`duplicate:member.${member.uid}`);
    seen.add(member.uid);
    if (!["leader", "officer", "member"].includes(member.role)) errors.push(`invalid:member.role.${member.uid}`);
  }
  if (clan.leaderUid && !members.some(member => member.uid === clan.leaderUid && member.role === "leader")) errors.push("clan-leader-membership-mismatch");
  if (!cleanId(clanId, "clanId")) errors.push("invalid:clanId");
  return errors;
}

function createProductionGenerationAdapter(db, options) {
  assert(db && typeof db.runTransaction === "function");
  const authority = requireAuthority(options, "generation");
  const worldId = cleanId(options.worldId, "worldId");
  const seasonId = cleanId(options.seasonId, "seasonId");
  assert.equal(cleanHash(options.assetManifestHash, "assetManifestHash"), ASSET_MANIFEST_HASH, "Approved 118-asset manifest drifted.");
  const root = db.doc(`generatedWorlds/${worldId}/seasons/${seasonId}`);
  return Object.freeze({
    authority,
    async stageStandby({ packageValue, allocation }) {
      const checked = validateGeneratedPackage(packageValue, allocation);
      assert.equal(checked.identity.worldId, worldId, "Generated package world differs from the authorized world.");
      assert.equal(checked.identity.seasonId, seasonId, "Generated package season differs from the authorized season.");
      const lock = root.collection("coordinateLocks").doc(`${checked.gridX}_${checked.gridY}`);
      const region = root.collection("regions").doc(checked.regionId);
      const packageRef = root.collection("packages").doc(checked.packageHash);
      const cityLocks = checked.cityIds.map(cityId => root.collection("cityLocks").doc(cityId));
      const cityRefs = checked.cityIds.map(cityId => region.collection("cities").doc(cityId));
      const neighborLocks = SIDES.map(side => root.collection("coordinateLocks").doc(`${checked.gridX + DELTAS[side].x}_${checked.gridY + DELTAS[side].y}`));
      return db.runTransaction(async transaction => {
        const [lockSnapshot, regionSnapshot, packageSnapshot, cityLockSnapshots, neighborLockSnapshots] = await Promise.all([
          transaction.get(lock), transaction.get(region), transaction.get(packageRef),
          Promise.all(cityLocks.map(reference => transaction.get(reference))),
          Promise.all(neighborLocks.map(reference => transaction.get(reference))),
        ]);
        if (lockSnapshot.exists || regionSnapshot.exists || packageSnapshot.exists) {
          const same = lockSnapshot.data()?.regionId === checked.regionId
            && regionSnapshot.data()?.packageHash === checked.packageHash
            && packageSnapshot.data()?.packageHash === checked.packageHash;
          if (!same) throw Object.assign(new Error("generated-region-duplicate-conflict"), { code: "already-exists" });
          return { ...checked, lifecycle: "STANDBY", replay: true, activated: false };
        }
        if (cityLockSnapshots.some(snapshot => snapshot.exists)) {
          throw Object.assign(new Error("generated-city-id-conflict"), { code: "already-exists" });
        }
        for (let index = 0; index < SIDES.length; index += 1) {
          const neighborLockSnapshot = neighborLockSnapshots[index];
          if (!neighborLockSnapshot.exists) continue;
          const side = SIDES[index];
          const neighborRegionId = cleanId(neighborLockSnapshot.data().regionId, `neighbor ${side} regionId`);
          const neighborRegionSnapshot = await transaction.get(root.collection("regions").doc(neighborRegionId));
          const neighborRegion = neighborRegionSnapshot.data() || {};
          if (!["PUBLISHED", "ACTIVE"].includes(neighborRegion.lifecycle)) continue;
          const neighborPackageSnapshot = await transaction.get(root.collection("packages").doc(cleanHash(neighborRegion.packageHash, "neighbor packageHash")));
          assert(neighborPackageSnapshot.exists, `Published neighbor package is missing: ${neighborRegionId}.`);
          const oppositeContract = neighborPackageSnapshot.data().edgeContracts?.sides?.[OPPOSITE[side]];
          const inherited = packageValue.edgeContracts.sides[side].inheritedPublishedConstraint;
          assert(oppositeContract && inherited, `Published neighbor contract was not inherited: ${side}.`);
          assert.equal(inherited.regionId, neighborRegionId, `Inherited neighbor region mismatch: ${side}.`);
          assert.equal(inherited.side, OPPOSITE[side], `Inherited neighbor side mismatch: ${side}.`);
          assert.equal(inherited.contractHash, oppositeContract.sourceContractHash, `Earlier published edge contract did not win: ${side}.`);
        }
        transaction.create(lock, {
          schemaVersion: ADAPTER_VERSION,
          regionId: checked.regionId,
          gridX: checked.gridX,
          gridY: checked.gridY,
          candidateVersion: authority.candidateVersion,
          immutable: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.create(packageRef, {
          ...compactPackageMetadata(packageValue),
          schemaVersion: ADAPTER_VERSION,
          assetManifestHash: ASSET_MANIFEST_HASH,
          immutable: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.create(region, {
          schemaVersion: ADAPTER_VERSION,
          regionId: checked.regionId,
          gridX: checked.gridX,
          gridY: checked.gridY,
          lifecycle: "STANDBY",
          kind: "player_region",
          spawnEligible: false,
          staticCityCapacity: CITY_CAPACITY,
          currentGenerationId: checked.packageHash,
          currentNpcCityCount: CITY_CAPACITY,
          packageHash: checked.packageHash,
          activationAuthorized: false,
          candidateVersion: authority.candidateVersion,
          createdAt: FieldValue.serverTimestamp(),
        });
        packageValue.cities.forEach((city, index) => {
          const cityId = checked.cityIds[index];
          transaction.create(cityLocks[index], {
            schemaVersion: ADAPTER_VERSION,
            cityId,
            regionId: checked.regionId,
            packageHash: checked.packageHash,
            immutable: true,
            createdAt: FieldValue.serverTimestamp(),
          });
          transaction.create(cityRefs[index], {
            schemaVersion: ADAPTER_VERSION,
            ...clone(city),
            cityId,
            regionId: checked.regionId,
            generationId: checked.packageHash,
            ownerUid: null,
            ownerType: "NPC",
            immutableDefinition: true,
            createdAt: FieldValue.serverTimestamp(),
          });
        });
        return { ...checked, lifecycle: "STANDBY", replay: false, activated: false };
      });
    },
  });
}

function createProductionMigrationAdapter(db, options) {
  assert(db && typeof db.runTransaction === "function");
  const authority = requireAuthority(options, "migration");
  const operationId = cleanId(options.operationId, "operationId");
  const targetSeasonId = cleanId(options.targetSeasonId, "targetSeasonId");
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(options.pageSize || DEFAULT_PAGE_SIZE)));
  const clanPageSize = Math.min(MAX_CLAN_PAGE_SIZE, pageSize);
  const root = db.collection("seasonResetMigrations").doc(operationId);
  return Object.freeze({
    authority,
    async readPage(afterUid = "") {
      let query = db.collection("players").orderBy(FieldPath.documentId()).limit(pageSize);
      if (afterUid) query = query.startAfter(cleanId(afterUid, "afterUid"));
      const snapshot = await query.get();
      const rows = snapshot.docs.map(document => ({ uid: document.id, source: document.data() }));
      const nextCursor = rows.at(-1)?.uid || afterUid;
      if (rows.length && nextCursor <= afterUid) throw new Error("migration-pagination-cursor-did-not-advance");
      return { rows, afterUid, nextCursor, done: rows.length < pageSize };
    },
    async migratePage(page) {
      const records = page.rows.map(({ uid, source }) => {
        const persistent = extractPersistentPlayer(source);
        const errors = validatePersistentPlayer(persistent);
        if (errors.length) throw new Error(`persistent-allowlist-invalid:${uid}:${errors.join(",")}`);
        return {
          uid,
          targetSeasonId,
          persistent,
          sourceChecksum: hashValue(extractPersistentPlayer(source)),
          targetChecksum: hashValue(persistent),
        };
      });
      const pageId = `${String(page.afterUid || "BEGIN").replace(/[^a-zA-Z0-9_.-]/g, "-")}-${String(page.nextCursor || "END")}`;
      const pageRef = root.collection("pages").doc(pageId);
      const result = await db.runTransaction(async transaction => {
        const pageSnapshot = await transaction.get(pageRef);
        if (pageSnapshot.exists) {
          const existing = pageSnapshot.data();
          const expectedHash = hashValue(records);
          if (existing.recordsHash !== expectedHash) throw new Error("migration-idempotency-checksum-mismatch");
          return { pageId, replay: true, recordsHash: expectedHash, count: records.length };
        }
        for (const record of records) {
          transaction.create(root.collection("players").doc(record.uid), {
            schemaVersion: ADAPTER_VERSION,
            uid: record.uid,
            targetSeasonId,
            persistent: record.persistent,
            sourceChecksum: record.sourceChecksum,
            targetChecksum: record.targetChecksum,
            candidateVersion: authority.candidateVersion,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        const recordsHash = hashValue(records);
        transaction.create(pageRef, {
          schemaVersion: ADAPTER_VERSION,
          afterUid: page.afterUid,
          nextCursor: page.nextCursor,
          done: page.done,
          count: records.length,
          recordsHash,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { pageId, replay: false, recordsHash, count: records.length };
      });
      assert(records.every(record => record.sourceChecksum === record.targetChecksum));
      return result;
    },
    async readClanPage(afterClanId = "") {
      let query = db.collection("clans").orderBy(FieldPath.documentId()).limit(clanPageSize);
      if (afterClanId) query = query.startAfter(cleanId(afterClanId, "afterClanId"));
      const snapshot = await query.get();
      const rows = await Promise.all(snapshot.docs.map(async document => {
        const members = await root.collection("players").where("persistent.clanId", "==", document.id).get();
        return {
          clanId: document.id,
          source: document.data(),
          members: members.docs.map(member => ({
            uid: member.id,
            source: {
              uid: member.id,
              role: member.data().persistent?.clanRole,
              status: "active",
            },
          })),
        };
      }));
      const nextCursor = rows.at(-1)?.clanId || afterClanId;
      if (rows.length && nextCursor <= afterClanId) throw new Error("clan-migration-pagination-cursor-did-not-advance");
      return { rows, afterClanId, nextCursor, done: rows.length < clanPageSize };
    },
    async migrateClanPage(page) {
      const records = page.rows.map(row => {
        const persistent = extractPersistentClan(row.source);
        const members = row.members.map(member => extractPersistentClanMember(member.uid, member.source));
        const errors = validatePersistentClan(row.clanId, persistent, members);
        if (errors.length) throw new Error(`persistent-clan-allowlist-invalid:${row.clanId}:${errors.join(",")}`);
        return {
          clanId: cleanId(row.clanId, "clanId"),
          persistent,
          members,
          sourceChecksum: hashValue({ persistent, members }),
        };
      });
      let replayCount = 0;
      for (const record of records) {
        const clanRef = root.collection("clans").doc(record.clanId);
        const memberRefs = record.members.map(member => clanRef.collection("members").doc(member.uid));
        const playerRefs = record.members.map(member => root.collection("players").doc(member.uid));
        const replay = await db.runTransaction(async transaction => {
          const [clanSnapshot, memberSnapshots, playerSnapshots] = await Promise.all([
            transaction.get(clanRef),
            Promise.all(memberRefs.map(reference => transaction.get(reference))),
            Promise.all(playerRefs.map(reference => transaction.get(reference))),
          ]);
          playerSnapshots.forEach((snapshot, index) => {
            const member = record.members[index];
            const player = snapshot.data()?.persistent || {};
            if (!snapshot.exists || player.clanId !== record.clanId || player.clanRole !== member.role) {
              throw new Error(`clan-player-membership-mismatch:${record.clanId}:${member.uid}`);
            }
          });
          if (clanSnapshot.exists) {
            if (clanSnapshot.data().sourceChecksum !== record.sourceChecksum || memberSnapshots.some(snapshot => !snapshot.exists)) {
              throw new Error("clan-migration-idempotency-checksum-mismatch");
            }
            return true;
          }
          if (memberSnapshots.some(snapshot => snapshot.exists)) throw new Error("orphan-clan-member-migration-conflict");
          transaction.create(clanRef, {
            schemaVersion: ADAPTER_VERSION,
            clanId: record.clanId,
            targetSeasonId,
            persistent: record.persistent,
            memberCount: record.members.length,
            sourceChecksum: record.sourceChecksum,
            candidateVersion: authority.candidateVersion,
            createdAt: FieldValue.serverTimestamp(),
          });
          record.members.forEach((member, index) => transaction.create(memberRefs[index], {
            schemaVersion: ADAPTER_VERSION,
            ...member,
            targetSeasonId,
            candidateVersion: authority.candidateVersion,
            createdAt: FieldValue.serverTimestamp(),
          }));
          return false;
        });
        if (replay) replayCount += 1;
      }
      const pageId = `${String(page.afterClanId || "BEGIN").replace(/[^a-zA-Z0-9_.-]/g, "-")}-${String(page.nextCursor || "END")}`;
      const pageRef = root.collection("clanPages").doc(pageId);
      const recordsHash = hashValue(records);
      const pageResult = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(pageRef);
        if (snapshot.exists) {
          if (snapshot.data().recordsHash !== recordsHash) throw new Error("clan-page-idempotency-checksum-mismatch");
          return { replay: true };
        }
        transaction.create(pageRef, {
          schemaVersion: ADAPTER_VERSION,
          afterClanId: page.afterClanId,
          nextCursor: page.nextCursor,
          done: page.done,
          count: records.length,
          memberCount: records.reduce((sum, record) => sum + record.members.length, 0),
          recordsHash,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { replay: false };
      });
      return {
        pageId,
        replay: pageResult.replay && replayCount === records.length,
        recordsHash,
        count: records.length,
        memberCount: records.reduce((sum, record) => sum + record.members.length, 0),
      };
    },
  });
}

function createProductionPlacementAdapter(db, options) {
  assert(db && typeof db.runTransaction === "function");
  const authority = requireAuthority(options, "placement");
  const worldId = cleanId(options.worldId, "worldId");
  const seasonId = cleanId(options.seasonId, "seasonId");
  const root = db.doc(`generatedWorlds/${worldId}/seasons/${seasonId}`);
  return Object.freeze({
    authority,
    async place({ uid, regionId, cityId, requestId }) {
      const safeUid = cleanId(uid, "uid");
      const safeRegionId = cleanId(regionId, "regionId");
      const safeCityId = cleanId(cityId, "cityId");
      const safeRequestId = cleanId(requestId, "requestId");
      assert.equal(FORBIDDEN_MAIN_CITY_REGIONS.has(safeRegionId), false, "Main city cannot be assigned to a restricted Core map.");
      const regionRef = root.collection("regions").doc(safeRegionId);
      const cityRef = regionRef.collection("cities").doc(safeCityId);
      const placementRef = root.collection("playerPlacements").doc(safeUid);
      return db.runTransaction(async transaction => {
        const [regionSnapshot, citySnapshot, placementSnapshot] = await Promise.all([
          transaction.get(regionRef), transaction.get(cityRef), transaction.get(placementRef),
        ]);
        if (placementSnapshot.exists) {
          const existing = placementSnapshot.data();
          if (existing.requestId !== safeRequestId || existing.cityId !== safeCityId || existing.regionId !== safeRegionId) {
            throw Object.assign(new Error("player-placement-conflict"), { code: "already-exists" });
          }
          return { ...existing, replay: true };
        }
        const region = regionSnapshot.data() || {};
        assert(regionSnapshot.exists && region.lifecycle === "ACTIVE", "Placement requires an ACTIVE player region.");
        assert.equal(region.kind || "player_region", "player_region");
        assert.equal(isCoreCoordinate(Number(region.gridX), Number(region.gridY)), false, "Core is spawn-ineligible.");
        assert.equal(region.staticCityCapacity, CITY_CAPACITY);
        const city = citySnapshot.data() || {};
        assert(citySnapshot.exists, "Starting city is missing.");
        assert.equal(city.generationId, region.currentGenerationId, "City is not in the current generation.");
        assert.equal(city.ownerUid, null, "Starting city is not NPC-owned.");
        const npcQuery = regionRef.collection("cities")
          .where("generationId", "==", region.currentGenerationId)
          .where("ownerUid", "==", null);
        const npcSnapshot = await transaction.get(npcQuery);
        const npcBefore = npcSnapshot.size;
        if (npcBefore < MINIMUM_NPC_CITIES_FOR_SPAWN) {
          throw Object.assign(new Error("authoritative-npc-threshold-blocks-placement"), { code: "resource-exhausted" });
        }
        const result = {
          schemaVersion: ADAPTER_VERSION,
          uid: safeUid,
          regionId: safeRegionId,
          cityId: safeCityId,
          requestId: safeRequestId,
          mainCityId: safeCityId,
          npcBefore,
          npcAfter: npcBefore - 1,
          candidateVersion: authority.candidateVersion,
        };
        transaction.update(cityRef, {
          ownerUid: safeUid,
          ownerType: "PLAYER",
          claimedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(regionRef, {
          currentNpcCityCount: npcBefore - 1,
          spawnEligible: npcBefore - 1 >= MINIMUM_NPC_CITIES_FOR_SPAWN,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(placementRef, { ...result, createdAt: FieldValue.serverTimestamp() });
        return { ...result, replay: false };
      });
    },
  });
}

module.exports = Object.freeze({
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
  ADAPTER_VERSION,
  PACKAGE_SCHEMA_VERSION,
  STORAGE_SCHEMA_VERSION,
  GENERATOR_ALGORITHM_VERSION,
  ASSET_LIBRARY_VERSION,
  ASSET_MANIFEST_HASH,
  CITY_CAPACITY,
  STARTING_CANDIDATE_COUNT,
  MINIMUM_NPC_CITIES_FOR_SPAWN,
  CORE_RADIUS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_CLAN_PAGE_SIZE,
  COMMON_GEAR_SCHEMA_VERSION,
  FORTRESS_LAYER_ONE_SLOTS,
  SIDES,
  OPPOSITE,
  DELTAS,
  PERSISTENT_PLAYER_FIELDS,
  PERSISTENT_GEAR_FIELDS,
  PERSISTENT_GEAR_INSTANCE_FIELDS,
  PERSISTENT_CLAN_FIELDS,
  PERSISTENT_CLAN_MEMBER_FIELDS,
  FORBIDDEN_MAIN_CITY_REGIONS,
  hashValue,
  environmentForProject,
  requiredAuthorization,
  requireAuthority,
  isCoreCoordinate,
  validateGeneratedPackage,
  packageHashBasis,
  compactPackageMetadata,
  extractPersistentGear,
  extractPersistentPlayer,
  validatePersistentPlayer,
  extractPersistentClan,
  extractPersistentClanMember,
  validatePersistentClan,
  createProductionGenerationAdapter,
  createProductionMigrationAdapter,
  createProductionPlacementAdapter,
});
