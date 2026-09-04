"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const functionsDirectory = path.join(root, "functions");
const requireFromFunctions = createRequire(path.join(functionsDirectory, "package.json"));
const firebaseToolsRoot = path.dirname(requireFromFunctions.resolve("firebase-tools/package.json"));
const auth = require(path.join(firebaseToolsRoot, "lib", "auth"));
const { Client } = require(path.join(firebaseToolsRoot, "lib", "apiv2"));
const regionCatalog = require(path.join(functionsDirectory, "core-expansion-region-catalog.json"));
const realmTopology = require(path.join(functionsDirectory, "realmTopology.js"));

const SELECTION_VERSION = "core-main-city-repair-v1";
const FIRESTORE_COMMIT_WRITE_LIMIT = 500;

function readArgument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : fallback;
}

function integerArgument(name, fallback) {
  const raw = readArgument(name, "");
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a non-negative integer.`);
  return value;
}

const options = Object.freeze({
  projectId: readArgument("project"),
  worldId: readArgument("world"),
  resetGeneration: readArgument("reset-generation"),
  apply: process.argv.includes("--apply"),
  confirmTargetCount: integerArgument("confirm-target-count", null),
  confirmBlockedCount: integerArgument("confirm-blocked-count", null),
  confirmPlanHash: readArgument("confirm-plan-hash"),
  maxTargets: integerArgument("max-targets", 80),
});

for (const [label, value] of [
  ["--project", options.projectId],
  ["--world", options.worldId],
  ["--reset-generation", options.resetGeneration],
]) {
  if (!value) throw new Error(`${label} is required so the operation cannot drift into another realm.`);
}
if (options.apply && (
  options.confirmTargetCount === null
  || options.confirmBlockedCount === null
  || !options.confirmPlanHash
)) {
  throw new Error(
    "--apply requires --confirm-target-count, --confirm-blocked-count, and --confirm-plan-hash from a fresh dry run."
  );
}

const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || "").trim();
const urlPrefix = emulatorHost ? `http://${emulatorHost}` : "https://firestore.googleapis.com";
const documentRoot = `/v1/projects/${options.projectId}/databases/(default)/documents`;
const permanentCoreRegionIds = new Set(
  (regionCatalog.regions || [])
    .filter(region => region?.permanentCore === true)
    .map(region => String(region.id || "").trim())
    .filter(Boolean)
);

function fromValue(value = {}) {
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  return undefined;
}

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (value && typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toValue(entry)])) } };
  }
  throw new Error(`Unsupported Firestore value: ${typeof value}`);
}

function fieldsFromObject(value = {}) {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toValue(entry)]));
}

function field(document, name) {
  return fromValue(document?.fields?.[name] || {});
}

function documentId(document) {
  return String(document?.name || "").slice(String(document?.name || "").lastIndexOf("/") + 1);
}

function documentPath(document) {
  return String(document?.name || "").split("/documents/")[1] || "";
}

function normalizeRegionId(value = "") {
  return String(value || "").trim();
}

function regionIdFromIslandId(islandId = "") {
  return normalizeRegionId(realmTopology.parseIslandId(islandId, options.worldId)?.regionId || "");
}

function isCurrentRealmDocument(document) {
  return field(document, "worldId") === options.worldId
    && field(document, "resetGeneration") === options.resetGeneration;
}

function isPlayerOwnedCity(city) {
  return field(city.document, "ownerKind") === "player" && Boolean(field(city.document, "ownerUid"));
}

function isStronghold(city) {
  const id = city.cityId;
  return field(city.document, "kind") === "stronghold"
    || Boolean(field(city.document, "strongholdType"))
    || [
      "west_gold_stronghold",
      "north_training_stronghold",
      "east_speed_stronghold",
      "south_defense_stronghold",
      "center_crown_citadel",
    ].includes(id);
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

async function getDocument(client, relativePath) {
  try {
    const response = await client.get(`${documentRoot}/${relativePath}`);
    return response.body || null;
  } catch (error) {
    if (Number(error?.status) === 404 || Number(error?.response?.statusCode) === 404) return null;
    throw error;
  }
}

async function createClient() {
  if (!emulatorHost) {
    const account = auth.getProjectDefaultAccount(root);
    if (!account) throw new Error("The Firebase CLI account is unavailable. Run firebase login first.");
    auth.setActiveAccount({}, account);
  }
  return new Client({ urlPrefix, auth: !emulatorHost });
}

function stableRandomIndex(uid, candidateCount) {
  const digest = crypto.createHash("sha256").update(`${SELECTION_VERSION}:${uid}`).digest();
  return digest.readUInt32BE(0) % candidateCount;
}

function realmStorageId(profile) {
  const shardId = realmTopology.normalizeRealmShardId(field(profile, "realmShardId"));
  return shardId === realmTopology.LEGACY_REALM_SHARD_ID
    ? options.resetGeneration
    : `${options.resetGeneration}--${shardId}`;
}

function sortObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function summarize(plan) {
  const bySourceRegion = {};
  const byDestinationRegion = {};
  for (const target of plan.targets) {
    bySourceRegion[target.sourceRegionId || "unknown"] = (bySourceRegion[target.sourceRegionId || "unknown"] || 0) + 1;
    byDestinationRegion[target.destination.regionId] = (byDestinationRegion[target.destination.regionId] || 0) + 1;
  }
  return {
    bySourceRegion: sortObject(bySourceRegion),
    byDestinationRegion: sortObject(byDestinationRegion),
  };
}

function targetFingerprint(target) {
  return {
    uid: target.uid,
    profilePath: target.profilePath,
    sourcePath: target.sourcePath,
    destinationPath: target.destination.path,
    cityPatchPaths: target.cityPatches.map(entry => entry.path),
  };
}

async function loadCurrentRealmState(client) {
  const [profiles, islands] = await Promise.all([
    listDocuments(client, "players"),
    listDocuments(client, "islands"),
  ]);
  const currentProfiles = profiles.filter(isCurrentRealmDocument);
  const currentIslands = islands.filter(isCurrentRealmDocument);
  const cities = [];
  for (const island of currentIslands) {
    const islandId = documentId(island);
    const regionId = regionIdFromIslandId(islandId);
    if (!regionId) continue;
    const islandCities = await listDocuments(client, `islands/${encodeURIComponent(islandId)}/cities`);
    for (const document of islandCities) {
      if (!isCurrentRealmDocument(document)) continue;
      cities.push({
        document,
        cityId: documentId(document),
        islandId,
        regionId,
        path: documentPath(document),
      });
    }
  }
  return { profiles: currentProfiles, cities };
}

function buildPlan({ profiles, cities }) {
  const citiesByOwner = new Map();
  for (const city of cities) {
    if (!isPlayerOwnedCity(city)) continue;
    const uid = field(city.document, "ownerUid");
    if (!citiesByOwner.has(uid)) citiesByOwner.set(uid, []);
    citiesByOwner.get(uid).push(city);
  }

  const targets = [];
  const blocked = [];
  for (const profile of profiles) {
    const uid = documentId(profile);
    const ownedCities = (citiesByOwner.get(uid) || []).filter(city => !isStronghold(city));
    const profileMainCityId = String(field(profile, "mainCityId") || "");
    const profileMainIslandId = String(field(profile, "mainIslandId") || "");
    const profileRegionId = normalizeRegionId(
      field(profile, "mainRegionId") || regionIdFromIslandId(profileMainIslandId)
    );
    const pointerCity = ownedCities.find(city => (
      city.cityId === profileMainCityId
      && (!profileMainIslandId || city.islandId === profileMainIslandId)
    ));
    const flaggedCoreCities = ownedCities.filter(city => (
      permanentCoreRegionIds.has(city.regionId) && field(city.document, "isMainCity") === true
    ));
    const profileMarksCore = permanentCoreRegionIds.has(profileRegionId);
    const pointerIsCore = Boolean(pointerCity && permanentCoreRegionIds.has(pointerCity.regionId));
    if (!profileMarksCore && !pointerIsCore && !flaggedCoreCities.length) continue;

    const candidates = ownedCities
      .filter(city => !permanentCoreRegionIds.has(city.regionId))
      .sort((left, right) => left.path.localeCompare(right.path));
    if (!candidates.length) {
      blocked.push({
        uid,
        profilePath: documentPath(profile),
        sourceRegionId: pointerCity?.regionId || profileRegionId || flaggedCoreCities[0]?.regionId || "unknown",
        reason: "no-owned-regular-city-outside-core",
      });
      continue;
    }

    const destination = pointerCity && !pointerIsCore
      ? pointerCity
      : candidates[stableRandomIndex(uid, candidates.length)];
    const cityPatches = ownedCities
      .filter(city => field(city.document, "isMainCity") !== (city.path === destination.path))
      .map(city => ({
        path: city.path,
        name: city.document.name,
        updateTime: city.document.updateTime,
        isMainCity: city.path === destination.path,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    targets.push({
      uid,
      profile,
      profilePath: documentPath(profile),
      sourcePath: pointerCity?.path || flaggedCoreCities[0]?.path || "",
      sourceRegionId: pointerCity?.regionId || profileRegionId || flaggedCoreCities[0]?.regionId || "unknown",
      destination: {
        path: destination.path,
        cityId: destination.cityId,
        islandId: destination.islandId,
        regionId: destination.regionId,
      },
      cityPatches,
    });
  }
  targets.sort((left, right) => left.profilePath.localeCompare(right.profilePath));
  blocked.sort((left, right) => left.profilePath.localeCompare(right.profilePath));
  return { targets, blocked };
}

async function attachProjectionDocuments(client, plan) {
  for (const target of plan.targets) {
    const statsPath = `players/${encodeURIComponent(target.uid)}/stats/global`;
    const leaderboardPath = `leaderboards/${encodeURIComponent(realmStorageId(target.profile))}/entries/${encodeURIComponent(target.uid)}`;
    const [stats, leaderboard] = await Promise.all([
      getDocument(client, statsPath),
      getDocument(client, leaderboardPath),
    ]);
    target.stats = stats ? { document: stats, path: statsPath } : null;
    target.leaderboard = leaderboard ? { document: leaderboard, path: leaderboardPath } : null;
  }
  return plan;
}

function createUpdateWrite(document, fields, fieldPaths) {
  return {
    update: { name: document.name, fields: fieldsFromObject(fields) },
    updateMask: { fieldPaths },
    currentDocument: { updateTime: document.updateTime },
  };
}

function createWrites(plan, operationId, planHash, createdAt) {
  const nowMs = Date.parse(createdAt);
  const receiptPath = `adminOperations/${operationId}`;
  const operationName = `projects/${options.projectId}/databases/(default)/documents/${receiptPath}`;
  const receipt = {
    operationId,
    operationType: "core_main_city_repair",
    status: "applied",
    projectId: options.projectId,
    worldId: options.worldId,
    resetGeneration: options.resetGeneration,
    selectionVersion: SELECTION_VERSION,
    planHash,
    createdAt,
    targetCount: plan.targets.length,
    blockedCount: plan.blocked.length,
    blocked: plan.blocked,
    targets: plan.targets.map(target => ({
      uid: target.uid,
      sourcePath: target.sourcePath,
      sourceRegionId: target.sourceRegionId,
      destinationPath: target.destination.path,
      destinationRegionId: target.destination.regionId,
      profileUpdateTime: target.profile.updateTime,
      cityPatches: target.cityPatches.map(entry => ({
        path: entry.path,
        isMainCity: entry.isMainCity,
        updateTime: entry.updateTime,
      })),
    })),
  };
  const writes = [{
    update: { name: operationName, fields: fieldsFromObject(receipt) },
    currentDocument: { exists: false },
  }];
  for (const target of plan.targets) {
    const projection = {
      mainCityId: target.destination.cityId,
      mainIslandId: target.destination.islandId,
      mainRegionId: target.destination.regionId,
      updatedAtMs: nowMs,
    };
    const profileProjection = {
      ...projection,
      mainCityRepairUpdatedAtMs: nowMs,
    };
    writes.push(createUpdateWrite(target.profile, profileProjection, Object.keys(profileProjection)));
    if (target.stats) {
      writes.push(createUpdateWrite(target.stats.document, projection, Object.keys(projection)));
    }
    if (target.leaderboard) {
      writes.push(createUpdateWrite(target.leaderboard.document, projection, Object.keys(projection)));
    }
    for (const cityPatch of target.cityPatches) {
      writes.push({
        update: {
          name: cityPatch.name,
          fields: fieldsFromObject({ isMainCity: cityPatch.isMainCity }),
        },
        updateMask: { fieldPaths: ["isMainCity"] },
        currentDocument: { updateTime: cityPatch.updateTime },
      });
    }
  }
  return { receiptPath, writes };
}

async function main() {
  if (permanentCoreRegionIds.size !== 25) {
    throw new Error(`Expected 25 permanent Core regions, found ${permanentCoreRegionIds.size}.`);
  }
  const client = await createClient();
  const state = await loadCurrentRealmState(client);
  const plan = await attachProjectionDocuments(client, buildPlan(state));
  const planHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      targets: plan.targets.map(targetFingerprint),
      blocked: plan.blocked,
    }))
    .digest("hex");
  const summary = summarize(plan);
  const projectedWriteCount = 1 + plan.targets.reduce((count, target) => (
    count + 1 + Number(Boolean(target.stats)) + Number(Boolean(target.leaderboard)) + target.cityPatches.length
  ), 0);
  console.log(JSON.stringify({
    mode: options.apply ? "apply" : "dry-run",
    projectId: options.projectId,
    worldId: options.worldId,
    resetGeneration: options.resetGeneration,
    selectionVersion: SELECTION_VERSION,
    scannedPlayerCount: state.profiles.length,
    scannedCityCount: state.cities.length,
    targetCount: plan.targets.length,
    blockedCount: plan.blocked.length,
    blockedReasons: sortObject(plan.blocked.reduce((result, entry) => {
      result[entry.reason] = (result[entry.reason] || 0) + 1;
      return result;
    }, {})),
    projectedWriteCount,
    planHash,
    ...summary,
  }, null, 2));

  if (!options.apply || !plan.targets.length) return;
  if (plan.targets.length > options.maxTargets) {
    throw new Error(`Refusing ${plan.targets.length} targets because --max-targets is ${options.maxTargets}.`);
  }
  if (plan.targets.length !== options.confirmTargetCount) {
    throw new Error(`Target count changed from ${options.confirmTargetCount} to ${plan.targets.length}; run a new dry run.`);
  }
  if (plan.blocked.length !== options.confirmBlockedCount) {
    throw new Error(`Blocked count changed from ${options.confirmBlockedCount} to ${plan.blocked.length}; run a new dry run.`);
  }
  if (planHash !== options.confirmPlanHash) {
    throw new Error("The repair plan changed since the dry run; run a new dry run.");
  }

  const createdAt = new Date().toISOString();
  const operationId = `core_main_city_repair_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}z`;
  const { receiptPath, writes } = createWrites(plan, operationId, planHash, createdAt);
  if (writes.length > FIRESTORE_COMMIT_WRITE_LIMIT) {
    throw new Error(`Refusing ${writes.length} writes because Firestore permits at most ${FIRESTORE_COMMIT_WRITE_LIMIT} per commit.`);
  }
  const response = await client.post(
    `/v1/projects/${options.projectId}/databases/(default)/documents:commit`,
    { writes }
  );

  const verificationState = await loadCurrentRealmState(client);
  const remainingPlan = buildPlan(verificationState);
  if (remainingPlan.targets.length || remainingPlan.blocked.length !== plan.blocked.length) {
    throw new Error(
      `Verification failed: ${remainingPlan.targets.length} repairable and ${remainingPlan.blocked.length} blocked Core main-city assignments remain; expected 0 and ${plan.blocked.length}.`
    );
  }
  console.log(JSON.stringify({
    applied: true,
    operationId,
    receiptPath,
    commitTime: response.body.commitTime,
    repairedPlayerCount: plan.targets.length,
    remainingCoreMainCityCount: remainingPlan.blocked.length,
    remainingBlockedCount: remainingPlan.blocked.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error.status || error.code || "ERROR", error.message || error);
  process.exitCode = 1;
});
