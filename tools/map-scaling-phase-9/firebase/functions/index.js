"use strict";

const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2/options");

const STAGING_PROJECT_ID = "crownlands-map-staging-2026";
const PRODUCTION_PROJECT_ID = "crown-land-b15e0";
const ENVIRONMENT = "STAGING";
const REQUEST_SCHEMA_VERSION = "phase9-staging-admin-v1";
const CONTROL_SCHEMA_VERSION = "phase9-staging-controls-v1";
const ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const CITY_CAPACITY = 40;
const STARTING_CANDIDATES = 4;
const MINIMUM_NPC_CITIES_FOR_SPAWN = 15;
const REGION = "us-central1";
const MAX_ADMIN_SESSION_AGE_SECONDS = 60 * 60;
const SIDES = Object.freeze(["north", "east", "south", "west"]);
const OPPOSITE = Object.freeze({ north: "south", east: "west", south: "north", west: "east" });
const DELTAS = Object.freeze({
  north: Object.freeze({ x: 0, y: -1 }),
  east: Object.freeze({ x: 1, y: 0 }),
  south: Object.freeze({ x: 0, y: 1 }),
  west: Object.freeze({ x: -1, y: 0 }),
});

const SERVICE_ACCOUNTS = Object.freeze({
  generation: `phase9-generation@${STAGING_PROJECT_ID}.iam.gserviceaccount.com`,
  publication: `phase9-publication@${STAGING_PROJECT_ID}.iam.gserviceaccount.com`,
  activation: `phase9-activation@${STAGING_PROJECT_ID}.iam.gserviceaccount.com`,
  monitoring: `phase9-monitoring@${STAGING_PROJECT_ID}.iam.gserviceaccount.com`,
  operator: `phase9-operator@${STAGING_PROJECT_ID}.iam.gserviceaccount.com`,
});

const ALLOWED_TRANSITIONS = Object.freeze({
  ALLOCATED: Object.freeze(["GENERATING", "FAILED"]),
  GENERATING: Object.freeze(["VALIDATING", "FAILED"]),
  VALIDATING: Object.freeze(["STANDBY", "FAILED"]),
  STANDBY: Object.freeze(["PUBLISHING", "FAILED"]),
  PUBLISHING: Object.freeze(["PUBLISHED", "STANDBY"]),
  PUBLISHED: Object.freeze(["ACTIVE"]),
  ACTIVE: Object.freeze([]),
  FAILED: Object.freeze(["ALLOCATED"]),
});

setGlobalOptions({
  region: REGION,
  invoker: "public",
  maxInstances: 2,
  concurrency: 1,
  memory: "1GiB",
  timeoutSeconds: 540,
});

initializeApp();
const db = getFirestore();

function assertRuntimeEnvironment() {
  const projectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  if (!projectId) throw new HttpsError("failed-precondition", "The Firebase project identity is unavailable.");
  if (projectId === PRODUCTION_PROJECT_ID) {
    throw new HttpsError("permission-denied", `Phase 9 refuses production project ${projectId}.`);
  }
  if (projectId !== STAGING_PROJECT_ID) {
    throw new HttpsError("permission-denied", `Phase 9 allows only staging project ${STAGING_PROJECT_ID}.`);
  }
  return projectId;
}

function safeId(value, label, maxLength = 120) {
  const result = String(value || "").trim();
  if (!result || result.length > maxLength || !/^[a-zA-Z0-9_-]+$/.test(result)) {
    throw new HttpsError("invalid-argument", `${label} is invalid.`);
  }
  return result;
}

function safeHash(value, label = "hash") {
  const result = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) throw new HttpsError("invalid-argument", `${label} must be SHA-256.`);
  return result;
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value)) throw new HttpsError("invalid-argument", `${label} must be an integer.`);
  return value;
}

function requestData(request, action) {
  const data = request.data || {};
  if (data.schemaVersion !== REQUEST_SCHEMA_VERSION || data.action !== action) {
    throw new HttpsError("invalid-argument", `Expected ${REQUEST_SCHEMA_VERSION} ${action} request.`);
  }
  if (String(data.environment || "").toUpperCase() !== ENVIRONMENT) {
    throw new HttpsError("permission-denied", "The request is not explicitly bound to STAGING.");
  }
  if (data.projectId !== STAGING_PROJECT_ID || data.productionProjectId !== PRODUCTION_PROJECT_ID) {
    throw new HttpsError("permission-denied", "The request project identity does not match the staging guard.");
  }
  return data;
}

function bearerToken(request) {
  const authorization = String(request.rawRequest?.headers?.authorization || "");
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

async function requireStagingAdmin(request) {
  assertRuntimeEnvironment();
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  const token = bearerToken(request);
  if (!token) throw new HttpsError("unauthenticated", "A verified Firebase ID token is required.");
  let verified;
  try {
    verified = await getAuth().verifyIdToken(token, true);
  } catch {
    throw new HttpsError("unauthenticated", "The admin token is expired, malformed, or revoked.");
  }
  if (verified.uid !== request.auth.uid) throw new HttpsError("permission-denied", "Token identity mismatch.");
  if (verified.crownlandsMapAdmin !== true || verified.crownlandsEnvironment !== "staging") {
    throw new HttpsError("permission-denied", "A server-issued Crownlands staging-admin claim is required.");
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(verified.auth_time || 0);
  if (ageSeconds < 0 || ageSeconds > MAX_ADMIN_SESSION_AGE_SECONDS) {
    throw new HttpsError("unauthenticated", "The staging-admin session is stale.");
  }
  const authority = await db.doc(`phase9AdminAuthorities/${verified.uid}`).get();
  const authorityData = authority.data() || {};
  const expiresAtMs = authorityData.expiresAt?.toMillis?.() || 0;
  if (
    !authority.exists
    || authorityData.active !== true
    || authorityData.environment !== ENVIRONMENT
    || authorityData.revision !== verified.crownlandsAdminRevision
    || expiresAtMs <= Date.now()
  ) {
    throw new HttpsError("permission-denied", "The server-side staging-admin authority is inactive or stale.");
  }
  return Object.freeze({ uid: verified.uid, revision: authorityData.revision });
}

async function requirePlayer(request) {
  assertRuntimeEnvironment();
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  if (request.auth.token?.crownlandsEnvironment !== "staging") {
    throw new HttpsError("permission-denied", "A synthetic staging identity is required.");
  }
  return request.auth.uid;
}

async function audit(actorUid, action, context, result, detail = {}) {
  await db.collection("phase9Audit").add({
    schemaVersion: "phase9-operator-audit-v1",
    environment: ENVIRONMENT,
    projectId: STAGING_PROJECT_ID,
    actorUid,
    action,
    worldId: context.worldId || "",
    seasonId: context.seasonId || "",
    regionId: context.regionId || "",
    packageHash: context.packageHash || "",
    result,
    detail,
    timestamp: FieldValue.serverTimestamp(),
  });
}

async function controls() {
  const snapshot = await db.doc("phase9Controls/staging").get();
  if (!snapshot.exists) throw new HttpsError("failed-precondition", "Staging controls are not provisioned.");
  const value = snapshot.data();
  if (value.schemaVersion !== CONTROL_SCHEMA_VERSION || value.environment !== ENVIRONMENT) {
    throw new HttpsError("failed-precondition", "Staging controls are malformed.");
  }
  return value;
}

async function requireControls(...flags) {
  const value = await controls();
  for (const flag of flags) {
    if (value[flag] !== true) throw new HttpsError("failed-precondition", `${flag} is OFF.`);
  }
  return value;
}

function seasonRoot(worldId, seasonId) {
  return db.doc(`generatedWorlds/${worldId}/seasons/${seasonId}`);
}

function regionRef(worldId, seasonId, regionId) {
  return seasonRoot(worldId, seasonId).collection("regions").doc(regionId);
}

function packageRef(worldId, seasonId, packageHash) {
  return seasonRoot(worldId, seasonId).collection("packages").doc(packageHash);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function immutablePackagePrefix(worldId, seasonId, regionId, packageHash) {
  return `generated-worlds/v1/worlds/${worldId}/seasons/${seasonId}/regions/${regionId}/packages/${packageHash}/`;
}

async function verifyStoredPackage(packageData, context) {
  const objects = Array.isArray(packageData.objects) ? packageData.objects : [];
  if (objects.length !== 9) throw new HttpsError("failed-precondition", "An immutable package requires exactly nine objects.");
  const prefix = immutablePackagePrefix(context.worldId, context.seasonId, context.regionId, context.packageHash);
  const bucket = getStorage().bucket(`${STAGING_PROJECT_ID}.firebasestorage.app`);
  for (const object of objects) {
    const objectPath = String(object.path || "");
    if (!objectPath.startsWith(prefix)) throw new HttpsError("failed-precondition", "Package object path escaped its hash prefix.");
    const expectedHash = safeHash(object.sha256, "object SHA-256");
    const file = bucket.file(objectPath);
    const [metadata] = await file.getMetadata();
    if (
      metadata.metadata?.packageHash !== context.packageHash
      || metadata.metadata?.environment !== ENVIRONMENT
      || metadata.metadata?.immutable !== "true"
    ) {
      throw new HttpsError("failed-precondition", `Immutable metadata mismatch for ${objectPath}.`);
    }
    const [bytes] = await file.download();
    if (sha256(bytes) !== expectedHash) throw new HttpsError("data-loss", `Hash mismatch for ${objectPath}.`);
  }
  return objects.length;
}

async function withAdminAudit(request, action, operation) {
  const data = requestData(request, action);
  const actor = await requireStagingAdmin(request);
  const resolvedAuditAction = action === "transition"
    ? ({ GENERATING: "generate", FAILED: "reject", ALLOCATED: "regenerate-unpublished" }[
      String(data.targetLifecycle || "").toUpperCase()
    ] || "transition")
    : action;
  const context = {
    worldId: data.worldId || "",
    seasonId: data.seasonId || "",
    regionId: data.regionId || "",
    packageHash: data.packageHash || "",
  };
  try {
    const result = await operation({ data, actor, context });
    await audit(actor.uid, resolvedAuditAction, context, "PASS", {
      requestedOperation: action,
      targetLifecycle: data.targetLifecycle || "",
    });
    return { environment: ENVIRONMENT, projectId: STAGING_PROJECT_ID, ...result };
  } catch (error) {
    await audit(actor.uid, resolvedAuditAction, context, "FAIL", {
      code: error.code || "internal",
      requestedOperation: action,
      targetLifecycle: data.targetLifecycle || "",
    }).catch(() => {});
    throw error;
  }
}

exports.phase9SetControl = onCall({ serviceAccount: SERVICE_ACCOUNTS.operator }, request => (
  withAdminAudit(request, "set-control", async ({ data, actor }) => {
    const flag = String(data.flag || "");
    const allowed = new Set([
      "generatedWorldEnabled", "generationEnabled", "publicationEnabled", "activationEnabled", "expansionEnabled",
    ]);
    if (!allowed.has(flag) || typeof data.enabled !== "boolean") {
      throw new HttpsError("invalid-argument", "A known boolean control flag is required.");
    }
    const ref = db.doc("phase9Controls/staging");
    const updated = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new HttpsError("failed-precondition", "Staging controls are missing.");
      const current = snapshot.data();
      if (current.revision !== data.expectedRevision) throw new HttpsError("aborted", "The control revision is stale.");
      if (flag === "generatedWorldEnabled" && data.enabled === false) {
        transaction.update(ref, {
          generatedWorldEnabled: false,
          generationEnabled: false,
          publicationEnabled: false,
          activationEnabled: false,
          expansionEnabled: false,
          revision: current.revision + 1,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        });
      } else {
        transaction.update(ref, {
          [flag]: data.enabled,
          revision: current.revision + 1,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        });
      }
      return { flag, enabled: data.enabled, revision: current.revision + 1 };
    });
    return updated;
  })
));

exports.phase9AllocateRegion = onCall({ serviceAccount: SERVICE_ACCOUNTS.generation }, request => (
  withAdminAudit(request, "allocate", async ({ data, actor }) => {
    await requireControls("generatedWorldEnabled", "generationEnabled", "expansionEnabled");
    const worldId = safeId(data.worldId, "worldId");
    const seasonId = safeId(data.seasonId, "seasonId");
    const regionId = safeId(data.regionId, "regionId");
    const gridX = safeInteger(data.gridX, "gridX");
    const gridY = safeInteger(data.gridY, "gridY");
    const worldLayer = safeInteger(data.worldLayer, "worldLayer");
    const clockwiseOrderIndex = safeInteger(data.clockwiseOrderIndex, "clockwiseOrderIndex");
    if (worldLayer < 1) throw new HttpsError("invalid-argument", "Generated regions must be outside the permanent Core.");
    const root = seasonRoot(worldId, seasonId);
    const ref = regionRef(worldId, seasonId, regionId);
    const coordinateRef = root.collection("coordinateLocks").doc(`${gridX}_${gridY}`);
    await db.runTransaction(async transaction => {
      const [region, coordinate] = await Promise.all([transaction.get(ref), transaction.get(coordinateRef)]);
      if (region.exists) throw new HttpsError("already-exists", "The region ID is already allocated.");
      if (coordinate.exists) throw new HttpsError("already-exists", "The coordinate is already allocated.");
      transaction.create(coordinateRef, { regionId, gridX, gridY, createdAt: FieldValue.serverTimestamp() });
      transaction.create(ref, {
        schemaVersion: "phase9-staging-region-v1",
        environment: ENVIRONMENT,
        worldId,
        seasonId,
        regionId,
        gridX,
        gridY,
        worldLayer,
        clockwiseOrderIndex,
        lifecycle: "ALLOCATED",
        staticCityCapacity: CITY_CAPACITY,
        currentGenerationId: "",
        packageHash: "",
        runtimeTopology: {},
        createdBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { regionId, gridX, gridY, worldLayer, clockwiseOrderIndex, lifecycle: "ALLOCATED" };
  })
));

exports.phase9TransitionRegion = onCall({ serviceAccount: SERVICE_ACCOUNTS.generation }, request => (
  withAdminAudit(request, "transition", async ({ data, actor }) => {
    await requireControls("generatedWorldEnabled", "generationEnabled");
    const worldId = safeId(data.worldId, "worldId");
    const seasonId = safeId(data.seasonId, "seasonId");
    const regionId = safeId(data.regionId, "regionId");
    const target = String(data.targetLifecycle || "").toUpperCase();
    const ref = regionRef(worldId, seasonId, regionId);
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new HttpsError("not-found", "The region does not exist.");
      const current = snapshot.data();
      if (!(ALLOWED_TRANSITIONS[current.lifecycle] || []).includes(target)) {
        throw new HttpsError("failed-precondition", `${current.lifecycle} -> ${target} is forbidden.`);
      }
      const patch = {
        lifecycle: target,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      };
      if (target === "STANDBY") {
        const packageHash = safeHash(data.packageHash, "packageHash");
        const generationId = safeId(data.generationId, "generationId");
        const packageSnapshot = await transaction.get(packageRef(worldId, seasonId, packageHash));
        const packageData = packageSnapshot.data() || {};
        if (!packageSnapshot.exists || packageData.regionId !== regionId || packageData.cityDefinitions?.length !== CITY_CAPACITY) {
          throw new HttpsError("failed-precondition", "The validated 40-city package record is missing.");
        }
        patch.packageHash = packageHash;
        patch.currentGenerationId = generationId;
        patch.validationReceiptHash = safeHash(data.validationReceiptHash, "validationReceiptHash");
      }
      transaction.update(ref, patch);
      return { regionId, previousLifecycle: current.lifecycle, lifecycle: target };
    });
    return result;
  })
));

exports.phase9PublishRegion = onCall({ serviceAccount: SERVICE_ACCOUNTS.publication }, request => (
  withAdminAudit(request, "publish", async ({ data, actor }) => {
    await requireControls("generatedWorldEnabled", "publicationEnabled");
    const worldId = safeId(data.worldId, "worldId");
    const seasonId = safeId(data.seasonId, "seasonId");
    const regionId = safeId(data.regionId, "regionId");
    const packageHash = safeHash(data.packageHash, "packageHash");
    const region = await regionRef(worldId, seasonId, regionId).get();
    const packageSnapshot = await packageRef(worldId, seasonId, packageHash).get();
    if (!region.exists || region.data().lifecycle !== "STANDBY" || region.data().packageHash !== packageHash) {
      throw new HttpsError("failed-precondition", "The region is not the matching STANDBY package.");
    }
    if (!packageSnapshot.exists || packageSnapshot.data().immutable !== true) {
      throw new HttpsError("failed-precondition", "The immutable package record is missing.");
    }
    const edgeContractSides = packageSnapshot.data().edgeContracts?.sides || {};
    if (SIDES.some(side => !edgeContractSides[side]?.contractHash)) {
      throw new HttpsError("failed-precondition", "The immutable package is missing four edge contracts.");
    }
    const verifiedObjectCount = await verifyStoredPackage(packageSnapshot.data(), { worldId, seasonId, regionId, packageHash });
    const root = seasonRoot(worldId, seasonId);
    const marker = root.collection("publicationMarkers").doc(regionId);
    const publishState = await db.runTransaction(async transaction => {
      const [freshRegion, existingMarker] = await Promise.all([
        transaction.get(regionRef(worldId, seasonId, regionId)),
        transaction.get(marker),
      ]);
      if (existingMarker.exists) {
        if (existingMarker.data().packageHash === packageHash && freshRegion.data()?.lifecycle === "PUBLISHED") {
          return "ALREADY_PUBLISHED";
        }
        throw new HttpsError("already-exists", "A different immutable package is already published.");
      }
      if (freshRegion.data()?.lifecycle !== "STANDBY") throw new HttpsError("aborted", "Region lifecycle changed.");
      transaction.update(regionRef(worldId, seasonId, regionId), {
        lifecycle: "PUBLISHING",
        publicationStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      return "PUBLISHING";
    });
    if (publishState !== "ALREADY_PUBLISHED") {
      try {
        await db.runTransaction(async transaction => {
          const [publishingRegion, existingMarker] = await Promise.all([
            transaction.get(regionRef(worldId, seasonId, regionId)),
            transaction.get(marker),
          ]);
          if (existingMarker.exists) throw new HttpsError("already-exists", "A publication marker already exists.");
          if (publishingRegion.data()?.lifecycle !== "PUBLISHING" || publishingRegion.data()?.packageHash !== packageHash) {
            throw new HttpsError("aborted", "The PUBLISHING lifecycle contract changed.");
          }
          transaction.create(marker, {
            schemaVersion: "phase9-publication-marker-v1",
            regionId,
            packageHash,
            immutable: true,
            publishedAt: FieldValue.serverTimestamp(),
            publishedBy: actor.uid,
          });
          for (const side of SIDES) {
            transaction.create(root.collection("edgeContracts").doc(`${regionId}_${side}`), {
              ...edgeContractSides[side],
              schemaVersion: "phase9-published-edge-contract-v1",
              worldId,
              seasonId,
              regionId,
              side,
              packageHash,
              immutable: true,
              publishedAt: FieldValue.serverTimestamp(),
            });
          }
          transaction.update(regionRef(worldId, seasonId, regionId), {
            lifecycle: "PUBLISHED",
            publishedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
      } catch (error) {
        await db.runTransaction(async transaction => {
          const [failedRegion, existingMarker] = await Promise.all([
            transaction.get(regionRef(worldId, seasonId, regionId)),
            transaction.get(marker),
          ]);
          if (!existingMarker.exists && failedRegion.data()?.lifecycle === "PUBLISHING" && failedRegion.data()?.packageHash === packageHash) {
            transaction.update(regionRef(worldId, seasonId, regionId), {
              lifecycle: "STANDBY",
              publicationFailureAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: actor.uid,
            });
          }
        });
        throw error;
      }
    }
    return { regionId, packageHash, lifecycle: "PUBLISHED", verifiedObjectCount };
  })
));

exports.phase9ActivateRegion = onCall({ serviceAccount: SERVICE_ACCOUNTS.activation }, request => (
  withAdminAudit(request, "activate", async ({ data, actor }) => {
    await requireControls("generatedWorldEnabled", "activationEnabled");
    const worldId = safeId(data.worldId, "worldId");
    const seasonId = safeId(data.seasonId, "seasonId");
    const regionId = safeId(data.regionId, "regionId");
    const packageHash = safeHash(data.packageHash, "packageHash");
    const root = seasonRoot(worldId, seasonId);
    const ref = regionRef(worldId, seasonId, regionId);
    const packageDocument = packageRef(worldId, seasonId, packageHash);
    const marker = root.collection("publicationMarkers").doc(regionId);
    const catalog = root.collection("catalog").doc(regionId);
    await db.runTransaction(async transaction => {
      const [region, packageSnapshot, publication, catalogSnapshot] = await Promise.all([
        transaction.get(ref),
        transaction.get(packageDocument),
        transaction.get(marker),
        transaction.get(catalog),
      ]);
      const regionData = region.data() || {};
      const packageData = packageSnapshot.data() || {};
      if (regionData.lifecycle === "ACTIVE" && catalogSnapshot.exists && regionData.packageHash === packageHash) return;
      if (regionData.lifecycle !== "PUBLISHED" || publication.data()?.packageHash !== packageHash) {
        throw new HttpsError("failed-precondition", "Only the published package may activate.");
      }
      const cities = Array.isArray(packageData.cityDefinitions) ? packageData.cityDefinitions : [];
      const startingCandidates = Array.isArray(packageData.startingCandidates) ? packageData.startingCandidates : [];
      if (cities.length !== CITY_CAPACITY || new Set(cities.map(city => city.cityId)).size !== CITY_CAPACITY) {
        throw new HttpsError("failed-precondition", "Activation requires exactly 40 unique city definitions.");
      }
      if (startingCandidates.length !== STARTING_CANDIDATES) {
        throw new HttpsError("failed-precondition", "Activation requires exactly four starting candidates.");
      }
      const coordinateRefs = SIDES.map(side => {
        const delta = DELTAS[side];
        return root.collection("coordinateLocks").doc(`${regionData.gridX + delta.x}_${regionData.gridY + delta.y}`);
      });
      const coordinateSnapshots = await Promise.all(coordinateRefs.map(coordinateRef => transaction.get(coordinateRef)));
      const neighborDescriptors = coordinateSnapshots.map((coordinateSnapshot, index) => ({
        side: SIDES[index],
        regionId: coordinateSnapshot.exists ? safeId(coordinateSnapshot.data().regionId, "neighbor regionId") : "",
      }));
      const existingNeighbors = neighborDescriptors.filter(neighbor => neighbor.regionId);
      const neighborRegions = await Promise.all(existingNeighbors.map(neighbor => transaction.get(regionRef(worldId, seasonId, neighbor.regionId))));
      const neighborCatalogs = await Promise.all(existingNeighbors.map(neighbor => transaction.get(root.collection("catalog").doc(neighbor.regionId))));
      const runtimeTopology = Object.fromEntries(SIDES.map(side => [side, {
        side,
        state: "gated",
        targetRegionId: "",
      }]));
      existingNeighbors.forEach((neighbor, index) => {
        const neighborRegion = neighborRegions[index];
        const neighborCatalog = neighborCatalogs[index];
        if (neighborRegion.data()?.lifecycle !== "ACTIVE" || neighborCatalog.data()?.lifecycle !== "ACTIVE") return;
        runtimeTopology[neighbor.side] = {
          side: neighbor.side,
          state: "open",
          targetRegionId: neighbor.regionId,
        };
      });
      const cityCollection = ref.collection("cities");
      const preparedCities = cities.map(city => ({
        city,
        cityId: safeId(city.cityId, "cityId"),
      }));
      const existingCities = await Promise.all(preparedCities.map(({ cityId }) => transaction.get(cityCollection.doc(cityId))));
      existingCities.forEach((existing, index) => {
        if (existing.exists) throw new HttpsError("already-exists", `City ${preparedCities[index].cityId} already exists.`);
      });
      for (const { city, cityId } of preparedCities) {
        const cityRef = cityCollection.doc(cityId);
        transaction.create(cityRef, {
          schemaVersion: "phase9-staging-city-v1",
          cityId,
          regionId,
          generationId: regionData.currentGenerationId,
          packageHash,
          x: Number(city.x),
          y: Number(city.y),
          cityType: city.cityType || "neutral_city",
          cityLevel: Number(city.cityLevel || 1),
          ownerUid: null,
          ownerType: "NPC",
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(catalog, {
        schemaVersion: "phase9-staging-catalog-v1",
        environment: ENVIRONMENT,
        worldId,
        seasonId,
        regionId,
        lifecycle: "ACTIVE",
        packageHash,
        gridX: regionData.gridX,
        gridY: regionData.gridY,
        worldLayer: regionData.worldLayer,
        clockwiseOrderIndex: regionData.clockwiseOrderIndex,
        staticCityCapacity: CITY_CAPACITY,
        runtimeTopology,
        activatedAt: FieldValue.serverTimestamp(),
      });
      existingNeighbors.forEach((neighbor, index) => {
        const neighborRegion = neighborRegions[index];
        const neighborCatalog = neighborCatalogs[index];
        if (neighborRegion.data()?.lifecycle !== "ACTIVE" || neighborCatalog.data()?.lifecycle !== "ACTIVE") return;
        const reciprocalSide = OPPOSITE[neighbor.side];
        const reciprocalEdge = { side: reciprocalSide, state: "open", targetRegionId: regionId };
        transaction.update(regionRef(worldId, seasonId, neighbor.regionId), {
          [`runtimeTopology.${reciprocalSide}`]: reciprocalEdge,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(root.collection("catalog").doc(neighbor.regionId), {
          [`runtimeTopology.${reciprocalSide}`]: reciprocalEdge,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      transaction.update(ref, {
        lifecycle: "ACTIVE",
        currentNpcCityCount: CITY_CAPACITY,
        spawnEligible: true,
        runtimeTopology,
        activatedAt: FieldValue.serverTimestamp(),
        activatedBy: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { regionId, packageHash, lifecycle: "ACTIVE", initializedCities: CITY_CAPACITY };
  })
));

exports.phase9ClaimCity = onCall({ serviceAccount: SERVICE_ACCOUNTS.activation }, async request => {
  const data = requestData(request, "claim-city");
  const playerUid = await requirePlayer(request);
  const control = await requireControls("generatedWorldEnabled");
  const worldId = safeId(data.worldId, "worldId");
  const seasonId = safeId(data.seasonId, "seasonId");
  const regionId = safeId(data.regionId, "regionId");
  const cityId = safeId(data.cityId, "cityId");
  const ref = regionRef(worldId, seasonId, regionId);
  const result = await db.runTransaction(async transaction => {
    const region = await transaction.get(ref);
    const regionData = region.data() || {};
    if (!region.exists || regionData.lifecycle !== "ACTIVE" || regionData.worldLayer < 1) {
      throw new HttpsError("failed-precondition", "The player region is not ACTIVE.");
    }
    const cityRef = ref.collection("cities").doc(cityId);
    const city = await transaction.get(cityRef);
    if (!city.exists || city.data().generationId !== regionData.currentGenerationId || city.data().ownerUid !== null) {
      throw new HttpsError("failed-precondition", "The current-generation city is not NPC-owned.");
    }
    const npcQuery = ref.collection("cities")
      .where("generationId", "==", regionData.currentGenerationId)
      .where("ownerUid", "==", null);
    const npcCities = await transaction.get(npcQuery);
    const npcBefore = npcCities.size;
    if (npcBefore < MINIMUM_NPC_CITIES_FOR_SPAWN) {
      throw new HttpsError("resource-exhausted", "The authoritative NPC-city threshold blocks new placement.");
    }
    transaction.update(cityRef, {
      ownerUid: playerUid,
      ownerType: "PLAYER",
      claimedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(ref, {
      currentNpcCityCount: npcBefore - 1,
      spawnEligible: npcBefore - 1 >= MINIMUM_NPC_CITIES_FOR_SPAWN,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      regionId,
      cityId,
      npcBefore,
      npcAfter: npcBefore - 1,
      subsequentSpawnEligible: npcBefore - 1 >= MINIMUM_NPC_CITIES_FOR_SPAWN,
      controlRevision: control.revision,
    };
  });
  await audit(playerUid, "claim-city", { worldId, seasonId, regionId }, "PASS", {
    cityId,
    npcBefore: result.npcBefore,
    npcAfter: result.npcAfter,
  });
  return { environment: ENVIRONMENT, projectId: STAGING_PROJECT_ID, ...result };
});

exports.phase9Health = onCall({ serviceAccount: SERVICE_ACCOUNTS.monitoring }, async request => {
  assertRuntimeEnvironment();
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  const control = await controls();
  return {
    schemaVersion: "phase9-staging-health-v1",
    environment: ENVIRONMENT,
    projectId: STAGING_PROJECT_ID,
    productionProjectId: PRODUCTION_PROJECT_ID,
    generatedWorldControls: {
      generatedWorldEnabled: control.generatedWorldEnabled,
      generationEnabled: control.generationEnabled,
      publicationEnabled: control.publicationEnabled,
      activationEnabled: control.activationEnabled,
      expansionEnabled: control.expansionEnabled,
      revision: control.revision,
    },
    cityCapacity: CITY_CAPACITY,
    minimumNpcCitiesForSpawn: MINIMUM_NPC_CITIES_FOR_SPAWN,
    assetManifestHash: ASSET_MANIFEST_HASH,
    timestamp: Timestamp.now().toDate().toISOString(),
  };
});
