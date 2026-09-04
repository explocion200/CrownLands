"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");
const {
  buildPlanHash,
  getCityRepair,
  getClanRealmShardRepair,
  hasPlayerControlHistory,
  isCurrentRealmRecord,
  isNeutralCity,
  isStronghold,
  summarizeTargets,
} = require("./current-realm-game-issue-repair");

const root = path.resolve(__dirname, "..");
const functionsDirectory = path.join(root, "functions");
const requireFromFunctions = createRequire(path.join(functionsDirectory, "package.json"));
const firebaseToolsRoot = path.dirname(requireFromFunctions.resolve("firebase-tools/package.json"));
const auth = require(path.join(firebaseToolsRoot, "lib", "auth"));
const { Client } = require(path.join(firebaseToolsRoot, "lib", "apiv2"));
const releaseConfig = require(path.join(functionsDirectory, "release-config.json"));
const coreExpansionWorldLayout = require(path.join(functionsDirectory, "core-expansion-world-layout.json"));

const CLAN_SUBCOLLECTIONS = Object.freeze([
  "members",
  "applications",
  "memberRewards",
  "worldBenefits",
  "giftActivity",
  "questProgress",
  "rallies",
  "rallyState",
  "treasury",
  "treasuryUsage",
  "treasuryReceipts",
  "messages",
  "audit",
  "memberRewardHistory",
  "questCaptureReceipts",
]);
const COMMIT_BATCH_SIZE = 400;
const ACTIVE_CORE_REGION_IDS = new Set((coreExpansionWorldLayout.maps || [])
  .filter(map => map.lifecycle === "active")
  .map(map => String(map.id || "").trim())
  .filter(Boolean));

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
  realmShardId: readArgument("realm-shard"),
  worldTopology: readArgument("world-topology"),
  apply: process.argv.includes("--apply"),
  confirmPlanHash: readArgument("confirm-plan-hash"),
  maxTargets: integerArgument("max-targets", 2500),
});

for (const [label, value] of [
  ["--project", options.projectId],
  ["--world", options.worldId],
  ["--reset-generation", options.resetGeneration],
  ["--realm-shard", options.realmShardId],
  ["--world-topology", options.worldTopology],
]) {
  if (!value) throw new Error(`${label} is required so the operation cannot drift into another realm.`);
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

function decodedFields(document = {}) {
  return Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, fromValue(value)]));
}

function documentId(document = {}) {
  return String(document.name || "").slice(String(document.name || "").lastIndexOf("/") + 1);
}

async function getDocument(client, relativePath) {
  const response = await client.get(`${documentRoot}/${relativePath}`);
  return response.body;
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

function targetFromDocument(document, repair) {
  return {
    documentName: document.name,
    documentPath: document.name.split("/documents/")[1],
    updateTime: document.updateTime,
    kind: repair.kind,
    patch: repair.patch,
  };
}

function assertCurrentRealmPointer(current = {}) {
  for (const fieldName of ["worldId", "resetGeneration", "realmShardId"]) {
    const expected = options[fieldName];
    const pointerValue = fieldName === "realmShardId"
      ? current.realmShardId || current.sharedRealmId
      : current[fieldName];
    const actual = String(pointerValue || (fieldName === "realmShardId" ? "legacy" : ""));
    if (actual !== expected) {
      throw new Error(`realmConfig/current ${fieldName} is ${actual || "(missing)"}, expected ${expected}.`);
    }
  }
  if (String(releaseConfig.worldTopology || "") !== options.worldTopology) {
    throw new Error(`The checked-out release uses ${releaseConfig.worldTopology || "(missing)"}, expected ${options.worldTopology}.`);
  }
  if (String(current.releaseId || "") !== String(releaseConfig.releaseId || "")) {
    throw new Error(`realmConfig/current releaseId is ${current.releaseId || "(missing)"}, but this checkout targets ${releaseConfig.releaseId || "(missing)"}.`);
  }
}

async function buildRepairPlan(client) {
  const currentDocument = await getDocument(client, "realmConfig/current");
  assertCurrentRealmPointer(decodedFields(currentDocument));
  const identity = {
    projectId: options.projectId,
    worldId: options.worldId,
    resetGeneration: options.resetGeneration,
    realmShardId: options.realmShardId,
    worldTopology: options.worldTopology,
  };
  const targets = [];
  const observations = {
    activeIslandCount: 0,
    neutralOrdinaryCityCount: 0,
    skippedPlayerCityCount: 0,
    skippedConqueredNeutralObjectiveCount: 0,
    activeClanCount: 0,
  };

  const realmIslands = (await listDocuments(client, "islands")).filter(island => (
    isCurrentRealmRecord(decodedFields(island), identity)
  ));
  const islands = realmIslands.filter(island => {
    const data = decodedFields(island);
    const regionId = String(data.regionId || "").trim();
    return ACTIVE_CORE_REGION_IDS.has(regionId)
      && documentId(island) === `${identity.worldId}--${identity.realmShardId}--${regionId}`;
  });
  if (islands.length !== realmIslands.length) {
    throw new Error(`${realmIslands.length - islands.length} current-realm island documents do not match the checked-out active topology; refusing to repair.`);
  }
  observations.activeIslandCount = islands.length;
  if (!islands.length) throw new Error("No islands matched the explicitly confirmed active realm identity.");

  for (const island of islands) {
    const islandId = documentId(island);
    const cities = await listDocuments(client, `islands/${encodeURIComponent(islandId)}/cities`);
    for (const cityDocument of cities) {
      const city = { id: documentId(cityDocument), ...decodedFields(cityDocument) };
      if (!isCurrentRealmRecord(city, identity)) continue;
      if (!isNeutralCity(city)) observations.skippedPlayerCityCount += 1;
      if (isNeutralCity(city) && !isStronghold(city)) observations.neutralOrdinaryCityCount += 1;
      if (isNeutralCity(city) && isStronghold(city) && hasPlayerControlHistory(city)) {
        observations.skippedConqueredNeutralObjectiveCount += 1;
      }
      const repair = getCityRepair(city, identity);
      if (repair) targets.push(targetFromDocument(cityDocument, repair));
    }
  }

  const clans = (await listDocuments(client, "clans")).filter(clan => {
    const record = decodedFields(clan);
    return String(record.worldId || "") === identity.worldId
      && String(record.resetGeneration || "") === identity.resetGeneration
      && record.status !== "disbanded";
  });
  observations.activeClanCount = clans.length;
  for (const clan of clans) {
    const clanId = documentId(clan);
    const rootRepair = getClanRealmShardRepair(decodedFields(clan), identity);
    if (rootRepair) targets.push(targetFromDocument(clan, rootRepair));
    for (const subcollection of CLAN_SUBCOLLECTIONS) {
      const documents = await listDocuments(client, `clans/${encodeURIComponent(clanId)}/${subcollection}`);
      for (const document of documents) {
        const repair = getClanRealmShardRepair(decodedFields(document), identity);
        if (repair) targets.push(targetFromDocument(document, repair));
      }
    }
  }

  targets.sort((left, right) => left.documentPath.localeCompare(right.documentPath));
  return {
    identity,
    targets,
    targetSummary: summarizeTargets(targets),
    observations,
    planHash: buildPlanHash(identity, targets),
  };
}

function patchWrite(target) {
  return {
    update: {
      name: target.documentName,
      fields: fieldsFromObject(target.patch),
    },
    updateMask: { fieldPaths: Object.keys(target.patch).sort() },
    currentDocument: { updateTime: target.updateTime },
  };
}

async function commitWrites(client, writes) {
  return client.post(`/v1/projects/${options.projectId}/databases/(default)/documents:commit`, { writes });
}

async function createClient() {
  if (!emulatorHost) {
    const account = auth.getProjectDefaultAccount(root);
    if (!account) throw new Error("The Firebase CLI account is unavailable. Run firebase login first.");
    auth.setActiveAccount({}, account);
  }
  return new Client({ urlPrefix, auth: !emulatorHost });
}

function publicPlan(plan) {
  return {
    mode: options.apply ? "apply" : "dry-run",
    ...plan.identity,
    targetCount: plan.targets.length,
    targetSummary: plan.targetSummary,
    observations: plan.observations,
    planHash: plan.planHash,
  };
}

async function main() {
  const client = await createClient();
  const plan = await buildRepairPlan(client);
  console.log(JSON.stringify(publicPlan(plan), null, 2));
  if (!options.apply || !plan.targets.length) return;
  if (plan.targets.length > options.maxTargets) {
    throw new Error(`Refusing ${plan.targets.length} targets because --max-targets is ${options.maxTargets}.`);
  }
  if (plan.planHash !== options.confirmPlanHash) {
    throw new Error("The repair plan changed after the dry run; inspect a new dry run and confirm its plan hash.");
  }

  const createdAt = new Date().toISOString();
  const operationId = `current_realm_game_issue_repair_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}z`;
  const operationName = `projects/${options.projectId}/databases/(default)/documents/adminOperations/${operationId}`;
  const receipt = {
    operationId,
    operationType: "current_realm_game_issue_repair",
    status: "applying",
    createdAt,
    planHash: plan.planHash,
    targetCount: plan.targets.length,
    targetSummary: plan.targetSummary,
    observations: plan.observations,
    ...plan.identity,
  };
  await commitWrites(client, [{
    update: { name: operationName, fields: fieldsFromObject(receipt) },
    currentDocument: { exists: false },
  }]);

  let committedCount = 0;
  for (let start = 0; start < plan.targets.length; start += COMMIT_BATCH_SIZE) {
    const batchTargets = plan.targets.slice(start, start + COMMIT_BATCH_SIZE);
    await commitWrites(client, batchTargets.map(patchWrite));
    committedCount += batchTargets.length;
  }

  const verification = await buildRepairPlan(client);
  if (verification.targets.length) {
    throw new Error(`Verification failed: ${verification.targets.length} repair targets remain.`);
  }
  const completedAt = new Date().toISOString();
  await commitWrites(client, [{
    update: {
      name: operationName,
      fields: fieldsFromObject({ status: "applied", committedCount, completedAt }),
    },
    updateMask: { fieldPaths: ["status", "committedCount", "completedAt"] },
    currentDocument: { exists: true },
  }]);
  console.log(JSON.stringify({
    applied: true,
    operationId,
    receiptPath: `adminOperations/${operationId}`,
    committedCount,
    remainingTargetCount: verification.targets.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error.status || error.code || "ERROR", error.message || error);
  process.exitCode = 1;
});
