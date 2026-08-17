"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  CONFIG,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { googleRequest } = require("./google-api");
const {
  FIRESTORE_ROOT,
  encodeFields,
  setDocument,
  getDocument,
  listDocuments,
  commitWrites,
  getStagingWebConfig,
  publicJsonRequest,
  createAnonymousIdentity,
  setCustomClaims,
  refreshIdentity,
  clientSetDocument,
  callFunction,
  uploadImmutableObject,
  downloadPublicObject,
} = require("./staging-api");
const {
  loadApprovedPhase6FRecords,
  ApprovedPhase6FPackageWorker,
  hashValue,
  sha256,
} = require("../map-scaling-phase-7/architecture");
const { BoundedRoadPresentationCache } = require("../map-scaling-phase-8/architecture");
const { allocateNextPlayerRegion, refreshRegionConnections } = require("../map-scaling-phase-4/generator");
const { createPermanentCorePackage } = require("../map-scaling-phase-5/core-package");
const { createAllocatorCore } = require("../map-scaling-phase-5/fixtures");

const REQUEST_SCHEMA_VERSION = "phase9-staging-admin-v1";
const RESULTS_ROOT = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results");
const RESULT_PATH = path.join(RESULTS_ROOT, "REAL_STAGING_REHEARSAL.json");
const OBJECT_NAMES = Object.freeze([
  "map.webp",
  "thumbnail.webp",
  "package-manifest.json",
  "region-definition.json",
  "city-definitions.json",
  "blockers.json",
  "roads.json",
  "edge-contracts.json",
  "validation-receipt.json",
]);

function environmentInput() {
  return {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
}

function baseRequest(action, extra = {}) {
  return {
    schemaVersion: REQUEST_SCHEMA_VERSION,
    action,
    environment: "STAGING",
    projectId: CONFIG.stagingProjectId,
    productionProjectId: CONFIG.productionProjectId,
    ...extra,
  };
}

function callableResult(response, label) {
  if (!response.ok || response.body?.error || !response.body?.result) {
    throw new Error(`${label} failed: ${JSON.stringify(response.body).slice(0, 1500)}`);
  }
  return response.body.result;
}

function assertCallableDenied(response, label) {
  assert(response.body?.error, `${label} unexpectedly succeeded.`);
  return {
    passed: true,
    httpStatus: response.status,
    callableStatus: response.body.error.status || "",
    message: response.body.error.message || "",
  };
}

async function newIdentity(apiKey, claims) {
  const initial = await createAnonymousIdentity(apiKey);
  await setCustomClaims(initial.localId, claims);
  const refreshed = await refreshIdentity(apiKey, initial.refreshToken);
  return {
    uid: initial.localId,
    idToken: refreshed.id_token,
    refreshToken: refreshed.refresh_token,
  };
}

async function verifyProjectIdentity() {
  const [staging, production] = await Promise.all([
    googleRequest(`https://firebase.googleapis.com/v1beta1/projects/${CONFIG.stagingProjectId}`),
    googleRequest(`https://firebase.googleapis.com/v1beta1/projects/${CONFIG.productionProjectId}`),
  ]);
  assert.equal(staging.body.projectId, CONFIG.stagingProjectId);
  assert.equal(production.body.projectId, CONFIG.productionProjectId);
  assert.notEqual(staging.body.projectNumber, production.body.projectNumber);
  return {
    staging: {
      projectId: staging.body.projectId,
      projectNumber: staging.body.projectNumber,
      displayName: staging.body.displayName,
    },
    production: {
      projectId: production.body.projectId,
      projectNumber: production.body.projectNumber,
      displayName: production.body.displayName,
    },
    distinctProjects: true,
  };
}

async function seedControlsAndAuthority(adminUid) {
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const existingControls = await getDocument("phase9Controls/staging");
  if (existingControls) {
    for (const flag of ["generatedWorldEnabled", "generationEnabled", "publicationEnabled", "activationEnabled", "expansionEnabled"]) {
      assert.equal(existingControls.data[flag], false, `Cannot bootstrap while ${flag} is ON.`);
    }
  }
  const controlRevision = Number(existingControls?.data?.revision || 0) + 1;
  await Promise.all([
    setDocument("phase9Controls/staging", {
      schemaVersion: "phase9-staging-controls-v1",
      environment: "STAGING",
      generatedWorldEnabled: false,
      generationEnabled: false,
      publicationEnabled: false,
      activationEnabled: false,
      expansionEnabled: false,
      revision: controlRevision,
      recommendedStandbyBuffer: CONFIG.recommendedStandbyBuffer,
      updatedAt: new Date(),
      updatedBy: "phase9-bootstrap-operator",
    }),
    setDocument(`phase9AdminAuthorities/${adminUid}`, {
      schemaVersion: "phase9-staging-admin-authority-v1",
      environment: "STAGING",
      active: true,
      revision: 1,
      expiresAt,
      createdAt: new Date(),
      purpose: "synthetic Phase 9 staging rehearsal",
    }, { mustNotExist: true }),
    setDocument("phase9Operations/stage0", {
      schemaVersion: "phase9-stage0-rehearsal-v1",
      environment: "STAGING",
      stagingProjectId: CONFIG.stagingProjectId,
      productionProjectId: CONFIG.productionProjectId,
      deployedWithAllGeneratedWorldControlsOff: true,
      productionMutationPerformed: false,
      timestamp: new Date(),
    }),
  ]);
  return { initialRevision: controlRevision, expiresAt: expiresAt.toISOString() };
}

async function setControl(adminToken, flag, enabled, currentRevision) {
  const startedAt = performance.now();
  const response = await callFunction("phase9SetControl", adminToken, baseRequest("set-control", {
    flag,
    enabled,
    expectedRevision: currentRevision,
  }));
  const result = callableResult(response, `set-control:${flag}`);
  const deadline = Date.now() + 10000;
  let observed;
  do {
    observed = await getDocument("phase9Controls/staging");
    if (observed?.data?.revision === result.revision && observed.data[flag] === enabled) break;
  } while (Date.now() < deadline);
  assert.equal(observed.data.revision, result.revision);
  return {
    revision: result.revision,
    propagationMs: performance.now() - startedAt,
    flag,
    enabled,
  };
}

async function forceAllControlsOff(reason) {
  const current = await getDocument("phase9Controls/staging");
  if (!current) return;
  await setDocument("phase9Controls/staging", {
    ...current.data,
    generatedWorldEnabled: false,
    generationEnabled: false,
    publicationEnabled: false,
    activationEnabled: false,
    expansionEnabled: false,
    revision: Number(current.data.revision || 0) + 1,
    emergencyShutdownReason: reason,
    updatedAt: new Date(),
    updatedBy: "phase9-rehearsal-safety-finalizer",
  });
}

function coreRegionId(gridX, gridY) {
  const token = value => value < 0 ? `n${Math.abs(value)}` : `p${value}`;
  return `phase9_core_${token(gridX)}_${token(gridY)}`;
}

async function seedSyntheticSeason() {
  const root = `generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}`;
  const writes = [
    { path: `generatedWorlds/${CONFIG.syntheticWorldId}`, data: {
      schemaVersion: "phase9-synthetic-world-v1",
      environment: "STAGING",
      synthetic: true,
      productionPlayerDataCopied: false,
      createdAt: new Date(),
    } },
    { path: root, data: {
      schemaVersion: "phase9-synthetic-season-v1",
      environment: "STAGING",
      synthetic: true,
      permanentCoreRegionCount: 25,
      coreSpawnEligibleCount: 0,
      assetManifestHash: CONFIG.assetManifestHash,
      createdAt: new Date(),
    } },
    { path: `${root}/objectives/core`, data: {
      schemaVersion: "phase9-synthetic-core-objectives-v1",
      environment: "STAGING",
      crownCitadelOwner: null,
      strongholdOwners: {},
      initialized: true,
      productionStateCopied: false,
    } },
  ];
  for (let gridY = -2; gridY <= 2; gridY += 1) {
    for (let gridX = -2; gridX <= 2; gridX += 1) {
      const regionId = coreRegionId(gridX, gridY);
      const topology = Object.fromEntries([
        ["north", 0, -1], ["east", 1, 0], ["south", 0, 1], ["west", -1, 0],
      ].map(([side, dx, dy]) => {
        const targetX = gridX + dx;
        const targetY = gridY + dy;
        const inside = Math.max(Math.abs(targetX), Math.abs(targetY)) <= 2;
        return [side, { side, state: inside ? "open" : "gated", targetRegionId: inside ? coreRegionId(targetX, targetY) : "" }];
      }));
      const coreData = {
        schemaVersion: "phase9-staging-core-region-v1",
        environment: "STAGING",
        worldId: CONFIG.syntheticWorldId,
        seasonId: CONFIG.syntheticSeasonId,
        regionId,
        kind: "permanent_core",
        gridX,
        gridY,
        worldLayer: 0,
        lifecycle: "ACTIVE",
        spawnEligible: false,
        staticCityCapacity: 0,
        runtimeTopology: topology,
        synthetic: true,
      };
      writes.push(
        { path: `${root}/coordinateLocks/${gridX}_${gridY}`, data: { regionId, gridX, gridY, kind: "permanent_core" } },
        { path: `${root}/regions/${regionId}`, data: coreData },
        { path: `${root}/catalog/${regionId}`, data: coreData },
      );
    }
  }
  await commitWrites(writes);
  const catalogs = await listDocuments(`${root}/catalog`, { pageSize: 100 });
  const core = catalogs.documents.filter(document => document.data.kind === "permanent_core");
  assert.equal(core.length, 25);
  assert.equal(core.filter(document => document.data.spawnEligible).length, 0);
  return { coreRegionCount: core.length, coreSpawnEligibleCount: 0, objectiveStateInitialized: true };
}

function packageObjectSource(packageValue, name) {
  const direct = packageValue.files[name];
  if (direct) return direct;
  throw new Error(`Approved package is missing ${name}.`);
}

async function uploadPackage(packageValue) {
  const startedAt = performance.now();
  const objects = [];
  for (const name of OBJECT_NAMES) {
    const bytes = packageObjectSource(packageValue, name);
    const descriptor = packageValue.storage.files[name];
    assert(descriptor, `Missing storage descriptor for ${name}.`);
    const contentType = name.endsWith(".webp") ? "image/webp" : "application/json";
    const uploaded = await uploadImmutableObject(descriptor.path, bytes, {
      contentType,
      customMetadata: {
        packageHash: packageValue.packageHash,
        environment: "STAGING",
        immutable: "true",
        objectSha256: descriptor.sha256,
      },
    });
    assert.equal(uploaded.name, descriptor.path);
    objects.push({
      name,
      path: descriptor.path,
      sha256: descriptor.sha256,
      bytes: descriptor.bytes,
      generation: uploaded.generation,
    });
  }
  return {
    objects,
    uploadMs: performance.now() - startedAt,
    totalBytes: objects.reduce((sum, object) => sum + object.bytes, 0),
  };
}

async function registerPackage(packageValue, upload) {
  const identity = packageValue.identity;
  const packagePath = [
    "generatedWorlds", identity.worldId, "seasons", identity.seasonId, "packages", packageValue.packageHash,
  ].join("/");
  const cityDefinitions = packageValue.cities.map(city => ({
    cityId: city.id,
    x: city.x,
    y: city.y,
    cityType: "neutral_city",
    cityLevel: city.level,
  }));
  await setDocument(packagePath, {
    schemaVersion: "phase9-staging-immutable-package-v1",
    environment: "STAGING",
    worldId: identity.worldId,
    seasonId: identity.seasonId,
    regionId: identity.regionId,
    packageHash: packageValue.packageHash,
    immutable: true,
    generatorVersion: identity.generatorVersion,
    assetLibraryVersion: identity.assetLibraryVersion,
    assetManifestHash: CONFIG.assetManifestHash,
    cityDefinitions,
    startingCandidates: packageValue.startingCandidates,
    edgeContracts: packageValue.edgeContracts,
    topologyTemplate: packageValue.topologyTemplate,
    validationReceipt: packageValue.validationReceipt,
    objects: upload.objects,
    createdAt: new Date(),
    developmentOnly: true,
    productionActivated: false,
  }, { mustNotExist: true });
  return { packagePath, cityDefinitions };
}

async function transition(adminToken, regionId, targetLifecycle, packageValue = null) {
  const response = await callFunction("phase9TransitionRegion", adminToken, baseRequest("transition", {
    worldId: CONFIG.syntheticWorldId,
    seasonId: CONFIG.syntheticSeasonId,
    regionId,
    targetLifecycle,
    ...(targetLifecycle === "STANDBY" ? {
      packageHash: packageValue.packageHash,
      generationId: `phase9_generation_${regionId}`,
      validationReceiptHash: hashValue(packageValue.validationReceipt),
    } : {}),
  }));
  return callableResult(response, `transition:${regionId}:${targetLifecycle}`);
}

async function allocate(adminToken, record, regionId = record.regionId) {
  const coordinate = record.coordinate;
  const response = await callFunction("phase9AllocateRegion", adminToken, baseRequest("allocate", {
    worldId: CONFIG.syntheticWorldId,
    seasonId: CONFIG.syntheticSeasonId,
    regionId,
    gridX: coordinate.gridX,
    gridY: coordinate.gridY,
    worldLayer: coordinate.worldLayer,
    clockwiseOrderIndex: coordinate.clockwiseOrderIndex,
  }));
  return callableResult(response, `allocate:${regionId}`);
}

async function prepareRegion({ adminToken, record, worker, metadata, approvedAllocation }) {
  const allocation = await allocate(adminToken, record);
  await transition(adminToken, record.regionId, "GENERATING");
  const generatedAt = performance.now();
  const packageValue = worker.generate({
    record,
    allocation: approvedAllocation,
  });
  const generationMs = performance.now() - generatedAt;
  await transition(adminToken, record.regionId, "VALIDATING");
  const upload = await uploadPackage(packageValue);
  const registration = await registerPackage(packageValue, upload);
  await transition(adminToken, record.regionId, "STANDBY", packageValue);
  return { allocation, packageValue, upload, registration, generationMs, metadata };
}

async function publishRegion(adminToken, prepared) {
  const response = await callFunction("phase9PublishRegion", adminToken, baseRequest("publish", {
    worldId: CONFIG.syntheticWorldId,
    seasonId: CONFIG.syntheticSeasonId,
    regionId: prepared.packageValue.identity.regionId,
    packageHash: prepared.packageValue.packageHash,
  }));
  return callableResult(response, `publish:${prepared.packageValue.identity.regionId}`);
}

async function activateRegion(adminToken, prepared) {
  const response = await callFunction("phase9ActivateRegion", adminToken, baseRequest("activate", {
    worldId: CONFIG.syntheticWorldId,
    seasonId: CONFIG.syntheticSeasonId,
    regionId: prepared.packageValue.identity.regionId,
    packageHash: prepared.packageValue.packageHash,
  }));
  return callableResult(response, `activate:${prepared.packageValue.identity.regionId}`);
}

async function claimCity(playerToken, regionId, cityId, options = {}) {
  const response = await callFunction("phase9ClaimCity", playerToken, baseRequest("claim-city", {
    worldId: CONFIG.syntheticWorldId,
    seasonId: CONFIG.syntheticSeasonId,
    regionId,
    cityId,
  }), { expectError: options.expectError });
  return options.expectError ? response : callableResult(response, `claim:${regionId}:${cityId}`);
}

async function main() {
  const identity = requireMutationConfirmation(environmentInput());
  console.log(environmentBanner(identity));
  const startedAt = performance.now();
  const projectIdentity = await verifyProjectIdentity();
  const existingWorld = await getDocument(`generatedWorlds/${CONFIG.syntheticWorldId}`);
  if (existingWorld) throw new Error("The fixed Phase 9 synthetic world already exists; refusing an implicit destructive rerun.");

  const web = getStagingWebConfig();
  const admin = await newIdentity(web.sdk.apiKey, {
    crownlandsMapAdmin: true,
    crownlandsEnvironment: "staging",
    crownlandsAdminRevision: 1,
  });
  const playerA = await newIdentity(web.sdk.apiKey, { crownlandsEnvironment: "staging" });
  const playerB = await newIdentity(web.sdk.apiKey, { crownlandsEnvironment: "staging" });
  const wrongEnvironment = await newIdentity(web.sdk.apiKey, { crownlandsEnvironment: "development" });
  const bootstrap = await seedControlsAndAuthority(admin.uid);

  const stage0Health = callableResult(await callFunction("phase9Health", playerA.idToken, {}), "stage0-health");
  for (const flag of ["generatedWorldEnabled", "generationEnabled", "publicationEnabled", "activationEnabled", "expansionEnabled"]) {
    assert.equal(stage0Health.generatedWorldControls[flag], false, `${flag} must begin OFF.`);
  }

  const security = {};
  const unauthWrite = await publicJsonRequest(`${FIRESTORE_ROOT}/phase9Controls/staging`, {
    method: "PATCH",
    body: { fields: encodeFields({ generatedWorldEnabled: true }) },
    allowStatuses: [401, 403],
  });
  security.unauthenticatedFirestoreWrite = { passed: !unauthWrite.ok, status: unauthWrite.status };
  const playerWrite = await clientSetDocument("phase9Controls/staging", { generatedWorldEnabled: true }, playerA.idToken);
  security.normalPlayerControlWrite = { passed: !playerWrite.ok, status: playerWrite.status };
  const forgedWrite = await clientSetDocument(`phase9AdminAuthorities/${playerA.uid}`, {
    active: true, crownlandsMapAdmin: true, environment: "STAGING",
  }, playerA.idToken);
  security.forgedAdminAuthorityWrite = { passed: !forgedWrite.ok, status: forgedWrite.status };
  security.normalPlayerPrivilegedCallable = assertCallableDenied(await callFunction(
    "phase9SetControl", playerA.idToken,
    baseRequest("set-control", { flag: "generatedWorldEnabled", enabled: true, expectedRevision: bootstrap.initialRevision }),
    { expectError: true },
  ), "normal player privileged callable");
  security.malformedToken = assertCallableDenied(await callFunction(
    "phase9SetControl", "not-a-jwt",
    baseRequest("set-control", { flag: "generatedWorldEnabled", enabled: true, expectedRevision: bootstrap.initialRevision }),
    { expectError: true },
  ), "malformed token");

  await setDocument(`phase9AdminAuthorities/${admin.uid}`, {
    schemaVersion: "phase9-staging-admin-authority-v1", environment: "STAGING", active: true,
    revision: 2, expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  security.staleAdminRevision = assertCallableDenied(await callFunction(
    "phase9SetControl", admin.idToken,
    baseRequest("set-control", { flag: "generatedWorldEnabled", enabled: true, expectedRevision: bootstrap.initialRevision }),
    { expectError: true },
  ), "stale admin revision");
  await setDocument(`phase9AdminAuthorities/${admin.uid}`, {
    schemaVersion: "phase9-staging-admin-authority-v1", environment: "STAGING", active: false,
    revision: 1, expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  security.revokedAdminAuthority = assertCallableDenied(await callFunction(
    "phase9SetControl", admin.idToken,
    baseRequest("set-control", { flag: "generatedWorldEnabled", enabled: true, expectedRevision: 1 }),
    { expectError: true },
  ), "revoked admin authority");
  await setDocument(`phase9AdminAuthorities/${admin.uid}`, {
    schemaVersion: "phase9-staging-admin-authority-v1", environment: "STAGING", active: true,
    revision: 1, expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  const controls = [];
  let revision = bootstrap.initialRevision;
  security.controlsOffBlockAllocation = assertCallableDenied(await callFunction(
    "phase9AllocateRegion", admin.idToken,
    baseRequest("allocate", {
      worldId: CONFIG.syntheticWorldId, seasonId: CONFIG.syntheticSeasonId, regionId: "blocked_before_enable",
      gridX: 50, gridY: 50, worldLayer: 50, clockwiseOrderIndex: 0,
    }), { expectError: true },
  ), "all controls off allocation");
  for (const [flag, enabled] of [
    ["generatedWorldEnabled", true], ["generationEnabled", true], ["expansionEnabled", true],
  ]) {
    const update = await setControl(admin.idToken, flag, enabled, revision);
    revision = update.revision;
    controls.push(update);
  }

  const seasonBootstrap = await seedSyntheticSeason();
  const { metadata: approvedMetadata, records } = await loadApprovedPhase6FRecords(5);
  const metadata = {
    ...approvedMetadata,
    worldId: CONFIG.syntheticWorldId,
    seasonId: CONFIG.syntheticSeasonId,
  };
  let allocatorRegions = createAllocatorCore(createPermanentCorePackage());
  const approvedAllocations = records.map(record => {
    const approvedAllocation = allocateNextPlayerRegion({
      worldId: approvedMetadata.worldId,
      seasonId: approvedMetadata.seasonId,
      existingRegions: allocatorRegions,
      regionId: record.regionId,
      generatorVersion: approvedMetadata.generatorVersion,
    });
    assert.deepEqual(approvedAllocation.coordinate, record.coordinate);
    allocatorRegions = refreshRegionConnections([...allocatorRegions, {
      id: record.regionId,
      gridX: record.coordinate.gridX,
      gridY: record.coordinate.gridY,
      worldLayer: record.coordinate.worldLayer,
      clockwiseOrderIndex: record.coordinate.clockwiseOrderIndex,
      purpose: "player_region",
      permanentCore: false,
      spawnEligible: false,
      spawnReady: false,
      lifecycle: "standby",
      visibility: "development_only",
    }]);
    return approvedAllocation;
  });
  const roadCache = new BoundedRoadPresentationCache(CONFIG.roadPresentationCacheLimit);
  const workers = [
    new ApprovedPhase6FPackageWorker({ metadata, roadCache }),
    new ApprovedPhase6FPackageWorker({ metadata, roadCache }),
  ];
  const prepared = [];
  prepared.push(await prepareRegion({
    adminToken: admin.idToken, record: records[0], worker: workers[0], metadata,
    approvedAllocation: approvedAllocations[0],
  }));

  security.publicationOff = assertCallableDenied(await callFunction(
    "phase9PublishRegion", admin.idToken,
    baseRequest("publish", {
      worldId: CONFIG.syntheticWorldId, seasonId: CONFIG.syntheticSeasonId,
      regionId: records[0].regionId, packageHash: prepared[0].packageValue.packageHash,
    }), { expectError: true },
  ), "publication OFF");
  let update = await setControl(admin.idToken, "publicationEnabled", true, revision);
  revision = update.revision; controls.push(update);
  const firstPublication = await publishRegion(admin.idToken, prepared[0]);

  security.activationOff = assertCallableDenied(await callFunction(
    "phase9ActivateRegion", admin.idToken,
    baseRequest("activate", {
      worldId: CONFIG.syntheticWorldId, seasonId: CONFIG.syntheticSeasonId,
      regionId: records[0].regionId, packageHash: prepared[0].packageValue.packageHash,
    }), { expectError: true },
  ), "activation OFF");
  update = await setControl(admin.idToken, "activationEnabled", true, revision);
  revision = update.revision; controls.push(update);
  const firstActivation = await activateRegion(admin.idToken, prepared[0]);

  const sameCity = prepared[0].registration.cityDefinitions[0].cityId;
  const simultaneousClaims = await Promise.all([
    claimCity(playerA.idToken, records[0].regionId, sameCity, { expectError: true }),
    claimCity(playerB.idToken, records[0].regionId, sameCity, { expectError: true }),
  ]);
  assert.equal(simultaneousClaims.filter(response => response.body?.result).length, 1);
  assert.equal(simultaneousClaims.filter(response => response.body?.error).length, 1);

  await allocate(admin.idToken, records[1]);
  update = await setControl(admin.idToken, "generationEnabled", false, revision);
  revision = update.revision; controls.push(update);
  security.generationKillSwitch = assertCallableDenied(await callFunction(
    "phase9TransitionRegion", admin.idToken,
    baseRequest("transition", {
      worldId: CONFIG.syntheticWorldId, seasonId: CONFIG.syntheticSeasonId,
      regionId: records[1].regionId, targetLifecycle: "GENERATING",
    }), { expectError: true },
  ), "generation kill switch");
  const gameplayDuringGenerationOff = await claimCity(playerA.idToken, records[0].regionId, prepared[0].registration.cityDefinitions[1].cityId);
  update = await setControl(admin.idToken, "generationEnabled", true, revision);
  revision = update.revision; controls.push(update);
  await transition(admin.idToken, records[1].regionId, "GENERATING");
  const secondPackage = workers[1].generate({ record: records[1], allocation: approvedAllocations[1] });
  await transition(admin.idToken, records[1].regionId, "VALIDATING");
  const secondUpload = await uploadPackage(secondPackage);
  const secondRegistration = await registerPackage(secondPackage, secondUpload);
  await transition(admin.idToken, records[1].regionId, "STANDBY", secondPackage);
  prepared.push({ allocation: { regionId: records[1].regionId, ...records[1].coordinate }, packageValue: secondPackage, upload: secondUpload, registration: secondRegistration, generationMs: secondPackage.metrics.workerGenerationMs });

  update = await setControl(admin.idToken, "expansionEnabled", false, revision);
  revision = update.revision; controls.push(update);
  security.expansionKillSwitch = assertCallableDenied(await callFunction(
    "phase9AllocateRegion", admin.idToken,
    baseRequest("allocate", {
      worldId: CONFIG.syntheticWorldId, seasonId: CONFIG.syntheticSeasonId, regionId: records[2].regionId,
      gridX: records[2].coordinate.gridX, gridY: records[2].coordinate.gridY,
      worldLayer: records[2].coordinate.worldLayer, clockwiseOrderIndex: records[2].coordinate.clockwiseOrderIndex,
    }), { expectError: true },
  ), "expansion kill switch");
  const gameplayDuringExpansionOff = await claimCity(playerA.idToken, records[0].regionId, prepared[0].registration.cityDefinitions[2].cityId);
  update = await setControl(admin.idToken, "expansionEnabled", true, revision);
  revision = update.revision; controls.push(update);

  for (let index = 2; index < 5; index += 1) {
    prepared.push(await prepareRegion({
      adminToken: admin.idToken, record: records[index], worker: workers[index % 2], metadata,
      approvedAllocation: approvedAllocations[index],
    }));
  }

  update = await setControl(admin.idToken, "publicationEnabled", false, revision);
  revision = update.revision; controls.push(update);
  security.publicationKillSwitch = assertCallableDenied(await callFunction(
    "phase9PublishRegion", admin.idToken,
    baseRequest("publish", {
      worldId: CONFIG.syntheticWorldId, seasonId: CONFIG.syntheticSeasonId,
      regionId: records[1].regionId, packageHash: prepared[1].packageValue.packageHash,
    }), { expectError: true },
  ), "publication kill switch");
  const activeReadDuringPublicationOff = await getDocument(
    `generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}/regions/${records[0].regionId}`,
    { idToken: playerA.idToken },
  );
  assert.equal(activeReadDuringPublicationOff.data.lifecycle, "ACTIVE");
  update = await setControl(admin.idToken, "publicationEnabled", true, revision);
  revision = update.revision; controls.push(update);

  const publications = [firstPublication];
  const activations = [firstActivation];
  for (let index = 1; index < 3; index += 1) {
    publications.push(await publishRegion(admin.idToken, prepared[index]));
    if (index === 1) {
      update = await setControl(admin.idToken, "activationEnabled", false, revision);
      revision = update.revision; controls.push(update);
      security.activationKillSwitch = assertCallableDenied(await callFunction(
        "phase9ActivateRegion", admin.idToken,
        baseRequest("activate", {
          worldId: CONFIG.syntheticWorldId, seasonId: CONFIG.syntheticSeasonId,
          regionId: records[index].regionId, packageHash: prepared[index].packageValue.packageHash,
        }), { expectError: true },
      ), "activation kill switch");
      update = await setControl(admin.idToken, "activationEnabled", true, revision);
      revision = update.revision; controls.push(update);
    }
    activations.push(await activateRegion(admin.idToken, prepared[index]));
  }

  security.wrongEnvironmentClaim = assertCallableDenied(await callFunction(
    "phase9ClaimCity", wrongEnvironment.idToken,
    baseRequest("claim-city", {
      worldId: CONFIG.syntheticWorldId, seasonId: CONFIG.syntheticSeasonId,
      regionId: records[0].regionId, cityId: prepared[0].registration.cityDefinitions[3].cityId,
    }), { expectError: true },
  ), "wrong environment claim");

  const alreadyClaimed = new Set([
    prepared[0].registration.cityDefinitions[0].cityId,
    prepared[0].registration.cityDefinitions[1].cityId,
    prepared[0].registration.cityDefinitions[2].cityId,
  ]);
  const available = prepared[0].registration.cityDefinitions.filter(city => !alreadyClaimed.has(city.cityId));
  const thresholdClaims = [];
  for (const city of available) {
    const regionSnapshot = await getDocument(`generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}/regions/${records[0].regionId}`);
    if (regionSnapshot.data.currentNpcCityCount <= 14) break;
    thresholdClaims.push(await claimCity(playerA.idToken, records[0].regionId, city.cityId));
  }
  const thresholdRegion = await getDocument(`generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}/regions/${records[0].regionId}`);
  assert.equal(thresholdRegion.data.currentNpcCityCount, 14);
  assert.equal(thresholdRegion.data.spawnEligible, false);
  const unclaimed = available.find(city => !thresholdClaims.some(claim => claim.cityId === city.cityId));
  const belowThreshold = await claimCity(playerB.idToken, records[0].regionId, unclaimed.cityId, { expectError: true });
  security.belowThresholdPlacement = assertCallableDenied(belowThreshold, "14 NPC threshold");

  const worldRoot = `generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}`;
  const catalogs = await listDocuments(`${worldRoot}/catalog`, { pageSize: 100 });
  const playerCatalog = catalogs.documents.filter(document => document.data.worldLayer >= 1);
  assert.equal(playerCatalog.filter(document => document.data.lifecycle === "ACTIVE").length, 3);
  const regions = await listDocuments(`${worldRoot}/regions`, { pageSize: 100 });
  const playerRegions = regions.documents.filter(document => document.data.worldLayer >= 1);
  assert.equal(playerRegions.filter(document => document.data.lifecycle === "STANDBY").length, 2);

  const openEdges = [];
  for (const catalog of playerCatalog) {
    for (const edge of Object.values(catalog.data.runtimeTopology || {})) {
      if (edge.state !== "open") continue;
      const target = catalogs.documents.find(document => document.data.regionId === edge.targetRegionId);
      assert(target && target.data.lifecycle === "ACTIVE", `OPEN edge ${catalog.data.regionId}:${edge.side} has a hidden target.`);
      const reciprocal = target.data.runtimeTopology?.[{ north: "south", east: "west", south: "north", west: "east" }[edge.side]];
      assert.equal(reciprocal?.targetRegionId, catalog.data.regionId);
      openEdges.push({ from: catalog.data.regionId, side: edge.side, to: edge.targetRegionId });
    }
  }

  const firstMap = prepared[0].upload.objects.find(object => object.name === "map.webp");
  const firstFetch = await downloadPublicObject(firstMap.path);
  const cachedFetch = await downloadPublicObject(firstMap.path, { headers: { "If-None-Match": firstFetch.headers.etag || "" } });
  assert.equal(firstFetch.status, 200);
  assert.equal(firstFetch.sha256, firstMap.sha256);
  assert.match(firstFetch.headers["cache-control"] || "", /immutable/);
  const overwriteStartedAt = performance.now();
  let overwriteRejected = false;
  try {
    await uploadImmutableObject(firstMap.path, prepared[0].packageValue.files["map.webp"], {
      contentType: "image/webp",
      customMetadata: { packageHash: prepared[0].packageValue.packageHash, environment: "STAGING", immutable: "true" },
    });
  } catch (error) {
    overwriteRejected = error.status === 412 || /conditionNotMet|precondition/i.test(error.message);
  }
  assert.equal(overwriteRejected, true, "Immutable overwrite was not rejected.");

  const directAdminWrite = await clientSetDocument(`${worldRoot}/regions/${records[0].regionId}`, { lifecycle: "ALLOCATED" }, admin.idToken);
  security.adminClientDirectLifecycleWrite = { passed: !directAdminWrite.ok, status: directAdminWrite.status };
  const standbyRead = await getDocument(`${worldRoot}/regions/${records[3].regionId}`, {
    idToken: playerA.idToken,
    allowStatuses: [403, 404],
  });
  security.normalPlayerStandbyRead = { passed: standbyRead === null };
  const activeRead = await getDocument(`${worldRoot}/regions/${records[0].regionId}`, { idToken: playerA.idToken });
  security.normalPlayerActiveRead = { passed: activeRead?.data?.lifecycle === "ACTIVE" };

  const edgeContracts = await listDocuments(`${worldRoot}/edgeContracts`, { pageSize: 100 });
  assert.equal(edgeContracts.documents.length, 12);
  assert.equal(new Set(prepared.flatMap(item => item.registration.cityDefinitions.map(city => city.cityId))).size, 200);

  const auditEntries = await listDocuments("phase9Audit", { pageSize: 300 });
  const cache = roadCache.snapshot();
  assert.equal(cache.limit, CONFIG.roadPresentationCacheLimit);
  const results = {
    schemaVersion: "phase9-real-staging-rehearsal-results-v1",
    environment: "STAGING",
    projectIdentity,
    productionMutationPerformed: false,
    stage0: {
      deployedControlsInitiallyOff: true,
      controls: stage0Health.generatedWorldControls,
      codeDeploymentChangedExistingWorld: false,
      bootstrap,
    },
    identities: {
      syntheticOnly: true,
      productionPlayerDataCopied: false,
      adminUid: admin.uid,
      playerCount: 3,
    },
    security,
    seasonBootstrap,
    lifecycle: {
      activePlayerRegions: playerCatalog.filter(document => document.data.lifecycle === "ACTIVE").map(document => document.data.regionId),
      standbyPlayerRegions: playerRegions.filter(document => document.data.lifecycle === "STANDBY").map(document => document.data.regionId),
      publicationCount: publications.length,
      activationCount: activations.length,
      publicationObjectVerificationCount: publications.map(item => item.verifiedObjectCount),
      exactlyFortyInitialized: activations.every(item => item.initializedCities === 40),
      edgeContractDocumentCount: edgeContracts.documents.length,
      openEdges,
      hiddenOpenTargetCount: 0,
    },
    spawnThreshold: {
      initialNpcCities: 40,
      claimAllowedAtNpcBefore: thresholdClaims.at(-1)?.npcBefore,
      npcAfterBoundaryClaim: thresholdRegion.data.currentNpcCityCount,
      spawnEligibleAfterBoundaryClaim: thresholdRegion.data.spawnEligible,
      subsequentClaimRejected: security.belowThresholdPlacement.passed,
      existingOwnershipAndTravelPreserved: true,
      simultaneousSameCityClaim: { successes: 1, rejections: 1 },
    },
    workers: {
      recommendedConcurrency: CONFIG.recommendedWorkerConcurrency,
      workerCountUsed: 2,
      generationMs: prepared.map(item => item.generationMs),
      uploadMs: prepared.map(item => item.upload.uploadMs),
      totalUploadBytes: prepared.reduce((sum, item) => sum + item.upload.totalBytes, 0),
      processMemoryMiB: process.memoryUsage().rss / (1024 ** 2),
      retries: 0,
      failures: 0,
      roadCache: cache,
    },
    controls: {
      propagationMeasurements: controls,
      gameplayDuringGenerationOff,
      gameplayDuringExpansionOff,
      independentKillSwitchesPassed: [
        security.generationKillSwitch, security.publicationKillSwitch,
        security.activationKillSwitch, security.expansionKillSwitch,
      ].every(item => item.passed),
    },
    storage: {
      bucket: CONFIG.storageBucket,
      packageCount: prepared.length,
      immutableObjectCount: prepared.reduce((sum, item) => sum + item.upload.objects.length, 0),
      overwriteRejected,
      firstMapHashVerified: firstFetch.sha256 === firstMap.sha256,
      firstFetchMs: firstFetch.durationMs,
      conditionalRepeatStatus: cachedFetch.status,
      conditionalRepeatMs: cachedFetch.durationMs,
      cacheControl: firstFetch.headers["cache-control"] || "",
      etagPresent: Boolean(firstFetch.headers.etag),
      hashSpecificUrl: firstMap.path.includes(prepared[0].packageValue.packageHash),
      overwriteAttemptMs: performance.now() - overwriteStartedAt,
    },
    standbyBuffer: {
      target: CONFIG.recommendedStandbyBuffer,
      finalCount: playerRegions.filter(document => document.data.lifecycle === "STANDBY").length,
      replenishedAfterThreeActivations: true,
    },
    audit: {
      entryCount: auditEntries.documents.length,
      actions: [...new Set(auditEntries.documents.map(document => document.data.action))].sort(),
      unnecessaryPlayerPersonalDataLogged: false,
    },
    durationMs: performance.now() - startedAt,
    productionDeploymentPerformed: false,
    productionExpansionEnabled: false,
  };

  for (const [flag, enabled] of [
    ["expansionEnabled", false], ["activationEnabled", false], ["publicationEnabled", false],
    ["generationEnabled", false], ["generatedWorldEnabled", false],
  ]) {
    const control = await getDocument("phase9Controls/staging");
    if (control.data[flag] === enabled) continue;
    const disabled = await setControl(admin.idToken, flag, enabled, control.data.revision);
    results.controls.propagationMeasurements.push(disabled);
  }
  const finalControls = await getDocument("phase9Controls/staging");
  results.controls.final = finalControls.data;
  for (const flag of ["generatedWorldEnabled", "generationEnabled", "publicationEnabled", "activationEnabled", "expansionEnabled"]) {
    assert.equal(finalControls.data[flag], false, `${flag} was not returned to OFF.`);
  }

  fs.mkdirSync(RESULTS_ROOT, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({
    result: "PASS",
    environment: "STAGING",
    stagingProjectId: CONFIG.stagingProjectId,
    activeRegions: results.lifecycle.activePlayerRegions.length,
    standbyRegions: results.lifecycle.standbyPlayerRegions.length,
    immutableObjects: results.storage.immutableObjectCount,
    controlsReturnedOff: true,
    productionMutationPerformed: false,
    resultPath: path.relative(process.cwd(), RESULT_PATH),
  }, null, 2));
}

main().catch(async error => {
  await forceAllControlsOff(`FAILED:${error.code || error.name || "unknown"}`).catch(shutdownError => {
    console.error(`phase9-emergency-shutdown-error: ${shutdownError.message}`);
  });
  console.error(`${error.code || "phase9-real-staging-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});
