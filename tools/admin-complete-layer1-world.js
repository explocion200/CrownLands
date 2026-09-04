#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { createRequire } = require("node:module");
const topology = require("../functions/coreExpansionTopology.js");
const realmTopology = require("../functions/realmTopology.js");
const worldLayout = require("../functions/core-expansion-world-layout.json");
const releaseConfig = require("../functions/release-config.json");
const { createAuthoritativeRoutePlanner, imagePointToWorld } = require("../functions/authoritative-route-planner.js");
const { getCanonicalLayoutCityName } = require("./city-name-utils.js");

const root = path.resolve(__dirname, "..");
const functionsDirectory = path.join(root, "functions");
const requireFromFunctions = createRequire(path.join(functionsDirectory, "package.json"));
const firebaseToolsRoot = path.dirname(requireFromFunctions.resolve("firebase-tools/package.json"));
const auth = require(path.join(firebaseToolsRoot, "lib", "auth"));
const { Client } = require(path.join(firebaseToolsRoot, "lib", "apiv2"));
const planner = createAuthoritativeRoutePlanner(worldLayout);
const COMMIT_BATCH_SIZE = 400;

function readArgument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : fallback;
}

const options = Object.freeze({
  projectId: readArgument("project"),
  worldId: readArgument("world"),
  resetGeneration: readArgument("reset-generation"),
  realmShardId: readArgument("realm-shard"),
  worldTopology: readArgument("world-topology"),
  apply: process.argv.includes("--apply"),
  confirmPlanHash: readArgument("confirm-plan-hash"),
});

for (const [label, value] of [
  ["--project", options.projectId],
  ["--world", options.worldId],
  ["--reset-generation", options.resetGeneration],
  ["--realm-shard", options.realmShardId],
  ["--world-topology", options.worldTopology],
]) {
  if (!value) throw new Error(`${label} is required so the rollout cannot drift into another realm.`);
}
if (options.apply && !options.confirmPlanHash) {
  throw new Error("--apply requires --confirm-plan-hash from a fresh dry run.");
}

const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || "").trim();
const urlPrefix = emulatorHost ? `http://${emulatorHost}` : "https://firestore.googleapis.com";
const documentRoot = `/v1/projects/${options.projectId}/databases/(default)/documents`;

function fromValue(value = {}) {
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(fromValue);
  if (value.mapValue) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, fromValue(entry)]));
  }
  return undefined;
}

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number" && Number.isFinite(value)) return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (value && typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toValue(entry)])) } };
  }
  throw new Error(`Unsupported Firestore value: ${typeof value}`);
}

function fieldsFromObject(value = {}) {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toValue(entry)]));
}

function decodedFields(document = {}) {
  return Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, fromValue(value)]));
}

function documentId(document = {}) {
  return String(document.name || "").slice(String(document.name || "").lastIndexOf("/") + 1);
}

async function getDocument(client, relativePath, required = true) {
  try {
    return (await client.get(`${documentRoot}/${relativePath}`)).body;
  } catch (error) {
    const status = Number(error?.status || error?.response?.status || error?.context?.response?.status);
    if (!required && status === 404) return null;
    throw error;
  }
}

async function listDocuments(client, relativePath) {
  const documents = [];
  let pageToken = "";
  do {
    const queryParams = { pageSize: 300 };
    if (pageToken) queryParams.pageToken = pageToken;
    const response = await client.get(`${documentRoot}/${relativePath}`, { queryParams });
    documents.push(...(response.body.documents || []));
    pageToken = response.body.nextPageToken || "";
  } while (pageToken);
  return documents;
}

function isCurrentRealmRecord(record = {}) {
  return String(record.worldId || "") === options.worldId
    && String(record.resetGeneration || "") === options.resetGeneration
    && String(record.realmShardId || "legacy") === options.realmShardId;
}

function assertCurrentRealmPointer(current = {}) {
  const pointerShard = String(current.realmShardId || current.sharedRealmId || "legacy");
  if (String(current.worldId || "") !== options.worldId
    || String(current.resetGeneration || "") !== options.resetGeneration
    || pointerShard !== options.realmShardId) {
    throw new Error("realmConfig/current does not match the explicitly confirmed world, generation, and shard.");
  }
  if (String(current.releaseId || "") !== String(releaseConfig.releaseId || "")) {
    throw new Error("realmConfig/current does not match the checked-out release ID.");
  }
  if (options.worldTopology !== topology.TOPOLOGY_VERSION
    || String(releaseConfig.worldTopology || "") !== topology.TOPOLOGY_VERSION) {
    throw new Error("The checked-out release does not target the Core-expansion topology.");
  }
}

function expectedIslandPatch(map, create) {
  const world = worldLayout.globalSettings || {};
  return {
    id: realmTopology.buildIslandId(options.worldId, map.id, options.realmShardId),
    worldId: options.worldId,
    resetGeneration: options.resetGeneration,
    releaseId: releaseConfig.releaseId,
    realmShardId: options.realmShardId,
    regionId: map.id,
    regionName: String(map.label || map.name || map.id),
    version: Number(worldLayout.version),
    name: `${String(map.label || map.name || map.id)} - Crownlands`,
    cityCount: map.cities.length,
    regionCount: worldLayout.maps.length,
    cityCountPerRegion: Number(map.cityCapacity),
    worldWidth: Number(world.worldWidth),
    worldHeight: Number(world.worldHeight),
    regularCityCount: map.cities.length,
    seededCityCount: map.cities.length,
    seededCampCount: 0,
    layoutSeedVersion: Number(worldLayout.version),
    ...(create ? { createdBy: "admin-layer1-rollout", playerCount: 0 } : {}),
  };
}

function expectedCityPatch(map, city, index) {
  const model = planner.getModel(map.id);
  const point = imagePointToWorld(model, city);
  return {
    id: city.id,
    worldId: options.worldId,
    resetGeneration: options.resetGeneration,
    realmShardId: options.realmShardId,
    name: getCanonicalLayoutCityName(city, map.id, index),
    x: Math.round(point.x),
    y: Math.round(point.y),
    startPool: map.id,
    regionId: map.id,
    kind: "",
    strongholdType: "",
    bonus: "",
    bonusPercent: 0,
    size: 0,
    artSrc: "",
    startTroops: 0,
    ownerKind: "neutral",
    ownerUid: null,
    ownerName: "",
    ownerFlag: null,
    ownerKingPower: 0,
    ownerShieldExpiresAtMs: 0,
    isMainCity: false,
    level: 1,
    defense: 1,
    troops: 0,
    troopFloat: 0,
    investedGold: 0,
    lastCapturedAt: null,
    relinquishedAtMs: 0,
    relocatedAtMs: 0,
    neutralClaimOpen: false,
    neutralClaimEventId: "",
    neutralClaimedByUid: "",
    neutralClaimedAtMs: 0,
    neutralClaimSource: "",
    neutralClaimCurrentOwnerUid: "",
    neutralClaimPreviousOwnerUid: "",
    neutralClaimOwnershipChangedAtMs: 0,
    neutralClaimPolicyVersion: 2,
    neutralClaimClosedAtMs: 0,
  };
}

function target(documentPath, patch, currentDocument, timestampFields) {
  return {
    documentPath,
    documentName: `projects/${options.projectId}/databases/(default)/documents/${documentPath}`,
    patch,
    currentDocument,
    timestampFields,
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function buildPlanHash(plan = {}) {
  const payload = {
    identity: plan.identity,
    expansionUpdateTime: plan.expansionUpdateTime,
    missingActiveRegionIds: plan.missingActiveRegionIds,
    targets: plan.targets.map(entry => ({
      documentPath: entry.documentPath,
      patch: entry.patch,
      currentDocument: entry.currentDocument,
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}

async function buildPlan(client) {
  const pointerDocument = await getDocument(client, "realmConfig/current");
  assertCurrentRealmPointer(decodedFields(pointerDocument));
  const expansionPath = `realmGenerations/${options.resetGeneration}/expansion/current`;
  const expansionDocument = await getDocument(client, expansionPath);
  const expansionState = topology.normalizeExpansionState(decodedFields(expansionDocument));
  if (expansionState.resetGeneration !== options.resetGeneration) {
    throw new Error("The expansion state belongs to another generation.");
  }
  if (expansionState.pendingActivation || expansionState.queuedActivationSources.length) {
    throw new Error("A dynamic expansion activation is pending or queued; retry after it completes.");
  }
  const firstLayerRegionIds = topology.getFirstLayerRegionIds();
  const mapsById = new Map(worldLayout.maps.map(map => [map.id, map]));
  const targets = [];
  const observations = {
    intendedRegionCount: firstLayerRegionIds.length,
    currentActiveRegionCount: firstLayerRegionIds.filter(regionId => expansionState.activeRegionIds.includes(regionId)).length,
    existingIslandCount: 0,
    existingExpectedCityCount: 0,
    preservedPlayerCityCount: 0,
    islandCreates: 0,
    islandMetadataUpdates: 0,
    cityCreates: 0,
  };

  for (const regionId of firstLayerRegionIds) {
    const map = mapsById.get(regionId);
    if (!map || map.lifecycle !== "active" || map.cities?.length !== 40) {
      throw new Error(`${regionId} is not a validated 40-city active Layer 1 map.`);
    }
    const islandId = realmTopology.buildIslandId(options.worldId, regionId, options.realmShardId);
    const islandPath = `islands/${islandId}`;
    const islandDocument = await getDocument(client, islandPath, false);
    const island = islandDocument ? decodedFields(islandDocument) : null;
    if (island && !isCurrentRealmRecord(island)) {
      throw new Error(`${islandPath} exists with another realm identity.`);
    }
    const existingCities = await listDocuments(client, `${islandPath}/cities`);
    const existingCitiesById = new Map(existingCities.map(document => [documentId(document), document]));
    const expectedCityIds = new Set(map.cities.map(city => city.id));
    for (const existing of existingCities) {
      if (!expectedCityIds.has(documentId(existing))) continue;
      const city = decodedFields(existing);
      if (!isCurrentRealmRecord(city) || String(city.regionId || "") !== regionId) {
        throw new Error(`${islandPath}/cities/${documentId(existing)} has another realm or region identity.`);
      }
      const ownerUid = String(city.ownerUid || "").trim();
      const neutral = !ownerUid && ["neutral", "npc"].includes(String(city.ownerKind || "neutral").toLowerCase());
      if (neutral && Number(city.level) !== 1) {
        throw new Error(`${islandPath}/cities/${documentId(existing)} is a non-Level-1 NPC city; run the scoped NPC repair first.`);
      }
      if (ownerUid) observations.preservedPlayerCityCount += 1;
      observations.existingExpectedCityCount += 1;
    }
    if (islandDocument) {
      observations.existingIslandCount += 1;
      const expected = expectedIslandPatch(map, false);
      const metadataCurrent = Object.entries(expected).every(([key, value]) => island[key] === value);
      if (!metadataCurrent) {
        targets.push(target(islandPath, expected, { updateTime: islandDocument.updateTime }, ["updatedAt"]));
        observations.islandMetadataUpdates += 1;
      }
    } else {
      targets.push(target(islandPath, expectedIslandPatch(map, true), { exists: false }, ["createdAt", "updatedAt"]));
      observations.islandCreates += 1;
    }
    map.cities.forEach((city, index) => {
      if (existingCitiesById.has(city.id)) return;
      const cityPath = `${islandPath}/cities/${city.id}`;
      targets.push(target(cityPath, expectedCityPatch(map, city, index), { exists: false }, ["createdAt", "updatedAt"]));
      observations.cityCreates += 1;
    });
  }

  targets.sort((left, right) => left.documentPath.localeCompare(right.documentPath));
  const plan = {
    identity: {
      projectId: options.projectId,
      worldId: options.worldId,
      resetGeneration: options.resetGeneration,
      realmShardId: options.realmShardId,
      worldTopology: options.worldTopology,
      releaseId: releaseConfig.releaseId,
    },
    expansionPath,
    expansionUpdateTime: expansionDocument.updateTime,
    expansionState,
    firstLayerRegionIds,
    missingActiveRegionIds: firstLayerRegionIds.filter(regionId => !expansionState.activeRegionIds.includes(regionId)),
    targets,
    observations,
  };
  return { ...plan, planHash: buildPlanHash(plan) };
}

function targetWrite(entry) {
  const write = {
    update: { name: entry.documentName, fields: fieldsFromObject(entry.patch) },
    currentDocument: entry.currentDocument,
  };
  if (entry.currentDocument.updateTime) {
    write.updateMask = { fieldPaths: Object.keys(entry.patch).sort() };
  }
  if (entry.timestampFields?.length) {
    write.updateTransforms = entry.timestampFields.map(fieldPath => ({
      fieldPath,
      setToServerValue: "REQUEST_TIME",
    }));
  }
  return write;
}

async function commitWrites(client, writes) {
  if (!writes.length) return;
  await client.post(`/v1/projects/${options.projectId}/databases/(default)/documents:commit`, { writes });
}

async function verifyLayer1(client, firstLayerRegionIds) {
  const mapsById = new Map(worldLayout.maps.map(map => [map.id, map]));
  const readyRegionIds = [];
  for (const regionId of firstLayerRegionIds) {
    const map = mapsById.get(regionId);
    const islandId = realmTopology.buildIslandId(options.worldId, regionId, options.realmShardId);
    const islandPath = `islands/${islandId}`;
    const islandDocument = await getDocument(client, islandPath, false);
    if (!islandDocument || !isCurrentRealmRecord(decodedFields(islandDocument))) continue;
    const island = decodedFields(islandDocument);
    if (Number(island.seededCityCount) !== map.cities.length || Number(island.layoutSeedVersion) !== Number(worldLayout.version)) continue;
    const cities = await listDocuments(client, `${islandPath}/cities`);
    const citiesById = new Map(cities.map(document => [documentId(document), decodedFields(document)]));
    const valid = map.cities.every(city => {
      const stored = citiesById.get(city.id);
      if (!stored || !isCurrentRealmRecord(stored) || String(stored.regionId || "") !== regionId) return false;
      const ownerUid = String(stored.ownerUid || "").trim();
      const neutral = !ownerUid && ["neutral", "npc"].includes(String(stored.ownerKind || "neutral").toLowerCase());
      return !neutral || Number(stored.level) === 1;
    });
    if (valid) readyRegionIds.push(regionId);
  }
  return readyRegionIds;
}

function publicPlan(plan) {
  return {
    mode: options.apply ? "apply" : "dry-run",
    ...plan.identity,
    firstLayerRegionIds: plan.firstLayerRegionIds,
    missingActiveRegionIds: plan.missingActiveRegionIds,
    targetCount: plan.targets.length,
    observations: plan.observations,
    planHash: plan.planHash,
  };
}

async function createClient() {
  if (!emulatorHost) {
    const account = auth.getProjectDefaultAccount(root);
    if (!account) throw new Error("The Firebase CLI account is unavailable. Run firebase login first.");
    auth.setActiveAccount({}, account);
  }
  return new Client({ urlPrefix, auth: !emulatorHost });
}

async function main() {
  const client = await createClient();
  const plan = await buildPlan(client);
  console.log(JSON.stringify(publicPlan(plan), null, 2));
  if (!options.apply) return;
  if (plan.planHash !== options.confirmPlanHash) {
    throw new Error("The rollout plan changed after the dry run; inspect and confirm a new plan hash.");
  }
  if (plan.targets.length > 1000) throw new Error("The rollout exceeded its 1,000-document safety boundary.");

  const createdAt = new Date().toISOString();
  const operationId = `complete_layer1_world_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}z`;
  const operationName = `projects/${options.projectId}/databases/(default)/documents/adminOperations/${operationId}`;
  await commitWrites(client, [{
    update: {
      name: operationName,
      fields: fieldsFromObject({
        operationId,
        operationType: "complete_layer1_world",
        status: "applying",
        createdAt,
        planHash: plan.planHash,
        targetCount: plan.targets.length,
        missingActiveRegionIds: plan.missingActiveRegionIds,
        ...plan.identity,
      }),
    },
    currentDocument: { exists: false },
  }]);

  for (let start = 0; start < plan.targets.length; start += COMMIT_BATCH_SIZE) {
    await commitWrites(client, plan.targets.slice(start, start + COMMIT_BATCH_SIZE).map(targetWrite));
  }
  const readyRegionIds = await verifyLayer1(client, plan.firstLayerRegionIds);
  if (readyRegionIds.length !== plan.firstLayerRegionIds.length) {
    throw new Error(`Only ${readyRegionIds.length}/${plan.firstLayerRegionIds.length} Layer 1 regions verified after preparation.`);
  }
  const currentExpansionDocument = await getDocument(client, plan.expansionPath);
  if (currentExpansionDocument.updateTime !== plan.expansionUpdateTime) {
    throw new Error("The expansion state changed during preparation; seeded maps remain dormant and a fresh dry run is required.");
  }
  const currentExpansionState = decodedFields(currentExpansionDocument);
  const completion = topology.planFirstLayerCompletion({
    state: currentExpansionState,
    resetGeneration: options.resetGeneration,
    readyRegionIds,
  });
  if (plan.missingActiveRegionIds.length && !completion.changed) {
    throw new Error(`Layer 1 activation was refused: ${completion.reason}.`);
  }
  if (completion.changed) {
    const completedAt = new Date().toISOString();
    const statePatch = {
      activeRegionIds: completion.state.activeRegionIds,
      admittingRegionIds: completion.state.admittingRegionIds,
      nextActivationOrdinal: completion.state.nextActivationOrdinal,
      revision: completion.state.revision,
      firstLayerRollout: {
        schemaVersion: 1,
        releaseId: releaseConfig.releaseId,
        planHash: plan.planHash,
        regionCount: plan.firstLayerRegionIds.length,
        activatedRegionIds: completion.activatedRegions.map(region => region.id),
        completedAt,
      },
      updatedAtMs: Date.now(),
    };
    await commitWrites(client, [{
      update: {
        name: currentExpansionDocument.name,
        fields: fieldsFromObject(statePatch),
      },
      updateMask: { fieldPaths: Object.keys(statePatch).sort() },
      updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: { updateTime: currentExpansionDocument.updateTime },
    }]);
  }

  const verifiedExpansion = topology.normalizeExpansionState(decodedFields(
    await getDocument(client, plan.expansionPath)
  ));
  const missingAfter = plan.firstLayerRegionIds.filter(regionId => !verifiedExpansion.activeRegionIds.includes(regionId));
  if (missingAfter.length) throw new Error(`Layer 1 activation verification failed for: ${missingAfter.join(", ")}.`);
  const completedAt = new Date().toISOString();
  await commitWrites(client, [{
    update: {
      name: operationName,
      fields: fieldsFromObject({
        status: "applied",
        completedAt,
        preparedWriteCount: plan.targets.length,
        activeRegionCount: plan.firstLayerRegionIds.length,
        admittingRegionCount: verifiedExpansion.admittingRegionIds.length,
      }),
    },
    updateMask: { fieldPaths: ["status", "completedAt", "preparedWriteCount", "activeRegionCount", "admittingRegionCount"] },
    currentDocument: { exists: true },
  }]);
  console.log(JSON.stringify({
    applied: true,
    operationId,
    receiptPath: `adminOperations/${operationId}`,
    preparedWriteCount: plan.targets.length,
    activeFirstLayerRegionCount: plan.firstLayerRegionIds.length,
    remainingMissingRegionCount: missingAfter.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error.status || error.code || "ERROR", error.message || error);
  process.exitCode = 1;
});
