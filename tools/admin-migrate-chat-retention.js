#!/usr/bin/env node
"use strict";

// Metadata-only, resumable migration. No chat text or player identity is logged.
const path = require("node:path");
const { createRequire } = require("node:module");
const RETENTION_MS = 24 * 60 * 60 * 1000;

function migrationWrite(document, nowMs) {
  const relative = document.name.split("/documents/")[1] || "";
  const fields = document.fields || {};
  const precondition = { updateTime: document.updateTime };
  if (/^clans\/[^/]+\/messages\/[^/]+$/.test(relative)) {
    const expiryFields = ["expiresAt", "expiresAtMs"].filter(field => Object.hasOwn(fields, field));
    return expiryFields.length ? { kind: "clanExpiryRemoved", write: {
      update: { name: document.name, fields: {} }, updateMask: { fieldPaths: expiryFields }, currentDocument: precondition,
    } } : null;
  }
  if (!/^globalChat\/[^/]+\/messages\/[^/]+$/.test(relative)) return null;
  const createdAtMs = Number(fields.createdAtMs?.integerValue ?? fields.createdAtMs?.doubleValue)
    || Date.parse(fields.createdAt?.timestampValue || "");
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return { kind: "invalidGlobalTimestamp" };
  return createdAtMs <= nowMs - RETENTION_MS
    ? { kind: "expiredGlobalDeleted", write: { delete: document.name, currentDocument: precondition } } : null;
}

async function main() {
  const projectIndex = process.argv.indexOf("--project");
  const project = projectIndex >= 0 ? process.argv[projectIndex + 1] : "";
  if (!project || !/^[a-z0-9-]+$/.test(project)) throw new Error("An explicit --project is required.");
  const apply = process.argv.includes("--apply");
  const root = path.resolve(__dirname, "..");
  const requireFunctions = createRequire(path.join(root, "functions/package.json"));
  const cli = path.dirname(requireFunctions.resolve("firebase-tools/package.json"));
  const { Client } = require(path.join(cli, "lib/apiv2"));
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulator) {
    const auth = require(path.join(cli, "lib/auth"));
    const account = auth.getProjectDefaultAccount(root);
    if (!account) throw new Error("Firebase CLI authentication is required.");
    auth.setActiveAccount({}, account);
  }
  const client = new Client({ urlPrefix: emulator ? `http://${emulator}` : "https://firestore.googleapis.com", auth: !emulator });
  const database = `/v1/projects/${project}/databases/(default)`;
  const requestOptions = emulator ? { headers: { authorization: "Bearer owner" } } : {};
  if (apply && !emulator) {
    const field = await client.get(`${database}/collectionGroups/messages/fields/expiresAt`);
    if (field.body?.ttlConfig) throw new Error("Disable the shared messages.expiresAt TTL policy before applying this migration.");
  }
  const nowMs = Date.now();
  const counts = { scanned: 0, expiredGlobalDeleted: 0, clanExpiryRemoved: 0, invalidGlobalTimestamp: 0 };
  let cursor = "";
  do {
    const result = await client.post(`${database}/documents:runQuery`, { structuredQuery: {
      from: [{ collectionId: "messages", allDescendants: true }],
      select: { fields: ["createdAtMs", "createdAt", "expiresAt", "expiresAtMs"].map(fieldPath => ({ fieldPath })) },
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 400,
      ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}),
    } }, requestOptions);
    const documents = (result.body || []).filter(row => row.document).map(row => row.document);
    const writes = [];
    for (const document of documents) {
      counts.scanned += 1;
      const target = migrationWrite(document, nowMs);
      if (target) { counts[target.kind] += 1; if (target.write) writes.push(target.write); }
    }
    if (apply && writes.length) {
      // Update-time preconditions preserve concurrent moderation/deletion. A conflict
      // stops this batch; rerunning safely resumes the remaining metadata changes.
      await client.post(`${database}/documents:commit`, { writes }, requestOptions);
    }
    cursor = documents.length === 400 ? documents.at(-1).name : "";
  } while (cursor);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", project, cutoff: new Date(nowMs - RETENTION_MS).toISOString(), ...counts }));
  if (counts.invalidGlobalTimestamp) throw new Error("Global messages with invalid timestamps need review; they were preserved.");
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { migrationWrite };
