"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const functionsDirectory = path.join(root, "functions");
const requireFromFunctions = createRequire(path.join(functionsDirectory, "package.json"));
const firebaseToolsRoot = path.dirname(requireFromFunctions.resolve("firebase-tools/package.json"));
const auth = require(path.join(firebaseToolsRoot, "lib", "auth"));
const { Client } = require(path.join(firebaseToolsRoot, "lib", "apiv2"));
const worldLayout = require(path.join(functionsDirectory, "world-layout.json"));
const realmTopology = require(path.join(functionsDirectory, "realmTopology.js"));

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
  maxTargets: integerArgument("max-targets", 450),
});

for (const [label, value] of [
  ["--project", options.projectId],
  ["--world", options.worldId],
  ["--reset-generation", options.resetGeneration],
]) {
  if (!value) throw new Error(`${label} is required so the operation cannot drift into another realm.`);
}
if (options.apply && options.confirmTargetCount === null) {
  throw new Error("--apply requires --confirm-target-count from a fresh dry run.");
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
  return fromValue(document.fields?.[name] || {});
}

function documentId(document) {
  return document.name.slice(document.name.lastIndexOf("/") + 1);
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

function summarize(targets) {
  const byRegion = {};
  const byPreviousLevel = {};
  for (const target of targets) {
    byRegion[target.regionId] = (byRegion[target.regionId] || 0) + 1;
    byPreviousLevel[target.previousLevel] = (byPreviousLevel[target.previousLevel] || 0) + 1;
  }
  return { byRegion, byPreviousLevel };
}

async function findTargets(client) {
  const cityIdsByRegion = new Map((worldLayout.maps || []).map(map => [
    String(map.id || ""),
    new Set((map.cities || []).map(city => String(city.id || ""))),
  ]));
  const islands = (await listDocuments(client, "islands")).filter(island => (
    field(island, "worldId") === options.worldId
    && field(island, "resetGeneration") === options.resetGeneration
  ));
  const targets = [];
  for (const island of islands) {
    const islandId = documentId(island);
    const parsed = realmTopology.parseIslandId(islandId, options.worldId);
    if (!parsed || !cityIdsByRegion.has(parsed.regionId)) continue;
    const ordinaryCityIds = cityIdsByRegion.get(parsed.regionId);
    const cities = await listDocuments(client, `islands/${encodeURIComponent(islandId)}/cities`);
    for (const city of cities) {
      const cityId = documentId(city);
      const ownerUid = field(city, "ownerUid");
      const ownerKind = field(city, "ownerKind");
      const level = Number(field(city, "level") || 1);
      const currentRealm = field(city, "worldId") === options.worldId
        && field(city, "resetGeneration") === options.resetGeneration;
      if (
        currentRealm
        && ordinaryCityIds.has(cityId)
        && ownerKind === "neutral"
        && !ownerUid
        && Number.isFinite(level)
        && level > 1
      ) {
        targets.push({
          documentName: city.name,
          documentPath: city.name.split("/documents/")[1],
          regionId: parsed.regionId,
          previousLevel: Math.floor(level),
          previousDefense: Math.max(1, Math.floor(Number(field(city, "defense")) || 1)),
          preResetUpdateTime: city.updateTime,
        });
      }
    }
  }
  return targets.sort((left, right) => left.documentPath.localeCompare(right.documentPath));
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
  const targets = await findTargets(client);
  const summary = summarize(targets);
  console.log(JSON.stringify({
    mode: options.apply ? "apply" : "dry-run",
    projectId: options.projectId,
    worldId: options.worldId,
    resetGeneration: options.resetGeneration,
    targetCount: targets.length,
    ...summary,
  }, null, 2));

  if (!options.apply || !targets.length) return;
  if (targets.length > options.maxTargets) {
    throw new Error(`Refusing ${targets.length} targets because --max-targets is ${options.maxTargets}.`);
  }
  if (targets.length !== options.confirmTargetCount) {
    throw new Error(`Target count changed from ${options.confirmTargetCount} to ${targets.length}; run a new dry run.`);
  }

  const createdAt = new Date().toISOString();
  const operationId = `npc_city_level_reset_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}z`;
  const operationName = `projects/${options.projectId}/databases/(default)/documents/adminOperations/${operationId}`;
  const receipt = {
    operationId,
    operationType: "neutral_city_level_reset",
    status: "applied",
    projectId: options.projectId,
    worldId: options.worldId,
    resetGeneration: options.resetGeneration,
    createdAt,
    targetCount: targets.length,
    byRegion: summary.byRegion,
    byPreviousLevel: summary.byPreviousLevel,
    targets: targets.map(target => ({
      documentPath: target.documentPath,
      previousLevel: target.previousLevel,
      previousDefense: target.previousDefense,
      preResetUpdateTime: target.preResetUpdateTime,
    })),
  };
  const writes = [
    {
      update: { name: operationName, fields: fieldsFromObject(receipt) },
      currentDocument: { exists: false },
    },
    ...targets.map(target => ({
      update: {
        name: target.documentName,
        fields: { level: { integerValue: "1" }, defense: { integerValue: "1" } },
      },
      updateMask: { fieldPaths: ["level", "defense"] },
      currentDocument: { updateTime: target.preResetUpdateTime },
    })),
  ];
  const response = await client.post(
    `/v1/projects/${options.projectId}/databases/(default)/documents:commit`,
    { writes }
  );
  const remaining = await findTargets(client);
  if (remaining.length) throw new Error(`Verification failed: ${remaining.length} neutral cities remain above level 1.`);
  console.log(JSON.stringify({
    applied: true,
    operationId,
    receiptPath: `adminOperations/${operationId}`,
    commitTime: response.body.commitTime,
    resetCount: targets.length,
    remainingAboveLevelOne: remaining.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error.status || error.code || "ERROR", error.message || error);
  process.exitCode = 1;
});
