"use strict";
// Explicitly scoped, coordinate-only migration. Dry run is the default. Every
// write has an update-time precondition; concurrent gameplay is never replaced.
const path = require("node:path");
const { createRequire } = require("node:module");
const assert = require("node:assert/strict");
const { canonicalCityPositions, planHash, commitCoordinateBatch } = require("./illustrated-map-coordinate-plan");
const root = path.resolve(__dirname, "..");
const requireFunctions = createRequire(path.join(root, "functions/package.json"));
const firebaseRoot = path.dirname(requireFunctions.resolve("firebase-tools/package.json"));
const auth = require(path.join(firebaseRoot, "lib/auth"));
const { Client } = require(path.join(firebaseRoot, "lib/apiv2"));
const layout = require("../functions/core-expansion-world-layout.json");
const release = require("../functions/release-config.json");
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : ""; };
const identity = { project: arg("project"), worldId: arg("world"), resetGeneration: arg("reset-generation"), realmShardId: arg("realm-shard"), assetVersion: layout.assetVersion };
for (const [key, value] of Object.entries(identity)) assert(value, `Explicit ${key} required`);
assert.equal(release.worldTopology, "core-expansion-v1");
const apply = process.argv.includes("--apply"), confirmedHash = arg("confirm-plan-hash");
if (apply) assert(confirmedHash, "--apply requires the reviewed dry-run --confirm-plan-hash");
const documentRoot = `/v1/projects/${identity.project}/databases/(default)/documents`;
const decode = value => value.stringValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : value.doubleValue ?? value.booleanValue ?? (value.arrayValue ? (value.arrayValue.values || []).map(decode) : value.mapValue ? fields(value.mapValue.fields) : null));
const fields = entries => Object.fromEntries(Object.entries(entries || {}).map(([key, value]) => [key, decode(value)]));

async function get(client, relative) { return (await client.get(`${documentRoot}/${relative}`)).body; }
async function list(client, relative) {
  const documents = []; let pageToken = "";
  do {
    const response = await client.get(`${documentRoot}/${relative}`, { queryParams: { pageSize: 300, ...(pageToken ? { pageToken } : {}) } });
    documents.push(...(response.body.documents || [])); pageToken = response.body.nextPageToken || "";
  } while (pageToken);
  return documents;
}
async function buildPlan(client) {
  const pointer = await get(client, "realmConfig/current"), current = fields(pointer.fields);
  assert.equal(current.worldId, identity.worldId); assert.equal(current.resetGeneration, identity.resetGeneration);
  assert.equal(current.sharedRealmId || current.realmShardId, identity.realmShardId); assert.equal(current.releaseId, release.releaseId);
  const expansion = await get(client, `realmGenerations/${identity.resetGeneration}/expansion/current`);
  const active = fields(expansion.fields);
  assert.equal(active.topologyVersion, "core-expansion-v1");
  const regionIds = [...new Set([...layout.maps.filter(m => m.permanentCore).map(m => m.id), ...(active.activeRegionIds || [])])];
  const targets = []; let cityCount = 0;
  for (const regionId of regionIds) {
    const expected = canonicalCityPositions(layout, regionId);
    const islandId = `${identity.worldId}--${identity.realmShardId}--${regionId}`;
    const island = fields((await get(client, `islands/${islandId}`)).fields);
    for (const key of ["worldId", "resetGeneration", "realmShardId"]) assert.equal(island[key], identity[key], `Island ${key} mismatch`);
    const documents = await list(client, `islands/${islandId}/cities`), seen = new Set();
    for (const document of documents) {
      const id = document.name.split("/").at(-1), position = expected.get(id);
      if (!position) continue; // Objective documents are deliberately untouched.
      assert(!seen.has(id)); seen.add(id); const city = fields(document.fields);
      for (const key of ["worldId", "resetGeneration", "realmShardId"]) assert.equal(city[key], identity[key], `City ${key} mismatch`);
      if (city.x !== position.x || city.y !== position.y) targets.push({ document, position, before: { x: city.x, y: city.y } });
    }
    assert.equal(seen.size, expected.size, `Missing cities on ${regionId}`); cityCount += seen.size;
  }
  return { targets, pointer, expansion, mapCount: regionIds.length, cityCount, planHash: planHash(identity, targets) };
}
async function main() {
  const account = auth.getProjectDefaultAccount(root); assert(account, "Firebase CLI account required");
  auth.setActiveAccount({}, account); const client = new Client({ urlPrefix: "https://firestore.googleapis.com", auth: true });
  const plan = await buildPlan(client);
  console.log(JSON.stringify({ ...identity, maps: plan.mapCount, cities: plan.cityCount, coordinateChanges: plan.targets.length, planHash: plan.planHash, apply }, null, 2));
  if (!apply) return;
  assert.equal(plan.planHash, confirmedHash, "Coordinates or realm changed since the reviewed plan; run a fresh dry run");
  let committed = 0;
  for (let i = 0; i < plan.targets.length; i += 150) {
    const batch = plan.targets.slice(i, i + 150);
    const guards = [plan.pointer, plan.expansion].map(document => ({
      path: document.name.split("/documents/")[1],
      validate: current => assert.equal(current.updateTime, document.updateTime, "Realm pointer or expansion changed; take a fresh dry run"),
    }));
    await commitCoordinateBatch(client, documentRoot, guards, batch);
    committed += batch.length; console.log(`Aligned ${committed}/${plan.targets.length} cities`);
  }
  const verification = await buildPlan(client);
  assert.equal(verification.targets.length, 0, "Some cities still require coordinate alignment");
  console.log(JSON.stringify({ applied: true, committed, verifiedMaps: verification.mapCount, verifiedCities: verification.cityCount, remaining: 0, fieldsChanged: ["x", "y"] }));
}
main().catch(error => { console.error(error.code || error.status || "ERROR", error.message); process.exitCode = 1; });
