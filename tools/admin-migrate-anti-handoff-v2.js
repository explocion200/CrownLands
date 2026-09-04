#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { createRequire } = require("node:module");
const releaseConfig = require("../functions/release-config.json");
const { planLegacyPairCleanup } = require("./anti-handoff-v2-migration.js");

const root = path.resolve(__dirname, "..");
const functionsDirectory = path.join(root, "functions");
const requireFromFunctions = createRequire(path.join(functionsDirectory, "package.json"));
const firebaseToolsRoot = path.dirname(requireFromFunctions.resolve("firebase-tools/package.json"));
const auth = require(path.join(firebaseToolsRoot, "lib", "auth"));
const { Client } = require(path.join(firebaseToolsRoot, "lib", "apiv2"));

function readArgument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : fallback;
}

const options = Object.freeze({
  projectId: readArgument("project"),
  worldId: readArgument("world"),
  resetGeneration: readArgument("reset-generation"),
  realmShardId: readArgument("realm-shard"),
  apply: process.argv.includes("--apply"),
  confirmPlanHash: readArgument("confirm-plan-hash"),
});

for (const [label, value] of [
  ["--project", options.projectId],
  ["--world", options.worldId],
  ["--reset-generation", options.resetGeneration],
  ["--realm-shard", options.realmShardId],
]) {
  if (!value) throw new Error(`${label} is required so the migration cannot drift into another realm.`);
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

async function getDocument(client, relativePath) {
  return (await client.get(`${documentRoot}/${relativePath}`)).body;
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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function planHash(plan) {
  return crypto.createHash("sha256").update(JSON.stringify(stable({
    identity: plan.identity,
    targets: plan.targets.map(target => ({
      pairId: target.pairId,
      updateTime: target.updateTime,
      deleteFields: target.deleteFields,
    })),
  }))).digest("hex");
}

function assertCurrentPointer(current = {}) {
  if (String(current.worldId || "") !== options.worldId
    || String(current.resetGeneration || "") !== options.resetGeneration) {
    throw new Error("realmConfig/current does not match the explicitly confirmed world and generation.");
  }
  if (String(current.releaseId || "") !== String(releaseConfig.releaseId || "")) {
    throw new Error("realmConfig/current does not match the checked-out release ID.");
  }
  if (String(current.sharedRealmId || "") !== options.realmShardId) {
    throw new Error("realmConfig/current does not match the explicitly confirmed realm shard.");
  }
}

async function buildPlan(client) {
  const current = decodedFields(await getDocument(client, "realmConfig/current"));
  assertCurrentPointer(current);
  const nowMs = Date.now();
  const documents = await listDocuments(client, `realmSecurity/${options.resetGeneration}/accountPairs`);
  const targets = [];
  const ambiguous = [];
  const affectedPlayerUids = new Set();
  let preservedSharedInstallationPairs = 0;
  for (const document of documents) {
    const data = decodedFields(document);
    if ((data.worldId && data.worldId !== options.worldId)
      || (data.resetGeneration && data.resetGeneration !== options.resetGeneration)) {
      ambiguous.push({ pairId: documentId(document), reason: "realm-identity-mismatch" });
      continue;
    }
    const cleanup = planLegacyPairCleanup(data, nowMs);
    if (cleanup.action === "ambiguous") {
      ambiguous.push({ pairId: documentId(document), reason: cleanup.reason });
      continue;
    }
    if (cleanup.action !== "update") continue;
    (Array.isArray(data.pairUids) ? data.pairUids : [])
      .map(value => String(value || "").trim())
      .filter(Boolean)
      .forEach(uid => affectedPlayerUids.add(uid));
    if (cleanup.preservesSharedInstallation) preservedSharedInstallationPairs += 1;
    targets.push({
      pairId: documentId(document),
      documentName: document.name,
      updateTime: document.updateTime,
      deleteFields: cleanup.deleteFields,
      reason: cleanup.reason,
      preservesSharedInstallation: cleanup.preservesSharedInstallation,
    });
  }
  targets.sort((left, right) => left.pairId.localeCompare(right.pairId));
  ambiguous.sort((left, right) => left.pairId.localeCompare(right.pairId));
  const plan = {
    identity: {
      projectId: options.projectId,
      worldId: options.worldId,
      resetGeneration: options.resetGeneration,
      releaseId: releaseConfig.releaseId,
      realmShardId: options.realmShardId,
    },
    nowMs,
    scannedPairCount: documents.length,
    targets,
    ambiguous,
    preservedSharedInstallationPairs,
    affectedPlayerCount: affectedPlayerUids.size,
  };
  return { ...plan, planHash: planHash(plan) };
}

function publicPlan(plan) {
  return {
    mode: options.apply ? "apply" : "dry-run",
    ...plan.identity,
    scannedPairCount: plan.scannedPairCount,
    targetDocumentCount: plan.targets.length,
    targetPlayerPairCount: plan.targets.length,
    affectedPlayerCount: plan.affectedPlayerCount,
    legacyFreshBlockCount: plan.targets.filter(target => target.reason.includes("block")).length,
    preservedSharedInstallationPairs: plan.preservedSharedInstallationPairs,
    ambiguousCount: plan.ambiguous.length,
    ambiguous: plan.ambiguous,
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

async function commitWrites(client, writes) {
  if (!writes.length) return;
  await client.post(`/v1/projects/${options.projectId}/databases/(default)/documents:commit`, { writes });
}

function targetWrite(target) {
  const setFields = {
    legacyFreshHandoffCleanupVersion: 2,
    legacyFreshHandoffCleanedAtMs: Date.now(),
  };
  return {
    update: { name: target.documentName, fields: fieldsFromObject(setFields) },
    updateMask: { fieldPaths: [...target.deleteFields, ...Object.keys(setFields)].sort() },
    updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
    currentDocument: { updateTime: target.updateTime },
  };
}

async function main() {
  const client = await createClient();
  const plan = await buildPlan(client);
  console.log(JSON.stringify(publicPlan(plan), null, 2));
  if (plan.ambiguous.length) {
    throw new Error(`Refusing migration because ${plan.ambiguous.length} pair record(s) are ambiguous.`);
  }
  if (!options.apply) return;
  if (plan.planHash !== options.confirmPlanHash) {
    throw new Error("The migration plan changed after the dry run; inspect and confirm the new plan hash.");
  }
  const createdAt = new Date().toISOString();
  const operationId = `anti_handoff_v2_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}z`;
  const operationName = `projects/${options.projectId}/databases/(default)/documents/adminOperations/${operationId}`;
  await commitWrites(client, [{
    update: {
      name: operationName,
      fields: fieldsFromObject({
        operationId,
        operationType: "anti_handoff_v2_legacy_cleanup",
        status: "applying",
        createdAt,
        planHash: plan.planHash,
        targetDocumentCount: plan.targets.length,
        preservedSharedInstallationPairs: plan.preservedSharedInstallationPairs,
        ...plan.identity,
      }),
    },
    currentDocument: { exists: false },
  }]);
  for (let start = 0; start < plan.targets.length; start += 400) {
    await commitWrites(client, plan.targets.slice(start, start + 400).map(targetWrite));
  }
  const verification = await buildPlan(client);
  if (verification.ambiguous.length || verification.targets.length) {
    throw new Error(`Verification failed: ${verification.targets.length} target(s), ${verification.ambiguous.length} ambiguous remain.`);
  }
  const completedAt = new Date().toISOString();
  await commitWrites(client, [{
    update: {
      name: operationName,
      fields: fieldsFromObject({ status: "applied", completedAt, changedDocumentCount: plan.targets.length }),
    },
    updateMask: { fieldPaths: ["status", "completedAt", "changedDocumentCount"] },
    currentDocument: { exists: true },
  }]);
  console.log(JSON.stringify({
    applied: true,
    operationId,
    receiptPath: `adminOperations/${operationId}`,
    changedDocumentCount: plan.targets.length,
    remainingLegacyTargetCount: verification.targets.length,
    remainingAmbiguousCount: verification.ambiguous.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error.status || error.code || "ERROR", error.message || error);
  process.exitCode = 1;
});
