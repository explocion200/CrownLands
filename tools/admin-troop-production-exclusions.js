"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const policy = require("../functions/troop-production-policy");
const release = require("../functions/release-config.json");
const FIELD = "troopProduction25Exclusion";
const NAMES = ["Sir Prize", "Sir Render"];

function decode(value = {}) {
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  return value.stringValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : value.booleanValue);
}
function data(doc) { return decode({ mapValue: { fields: doc.fields } }); }
function buildPlan(pointer, profiles, startsAtMs, expected) {
  const current = data(pointer);
  assert.equal(release.worldTopology, "core-expansion-v1", "Only the active Core world is supported.");
  assert.equal(release.realmMode, "monthly-shared", "Only the monthly shared realm is supported.");
  assert(expected.worldId && expected.resetGeneration && expected.realmShardId, "Explicit world, generation and shard are required.");
  assert.equal(current.worldId, expected.worldId, "Current world changed.");
  assert.equal(current.resetGeneration, expected.resetGeneration, "Current generation changed.");
  assert.equal(current.resetReadinessStatus, "ready", "Current realm is not ready.");
  assert.equal(current.sharedRealmId, expected.realmShardId, "Current shared realm changed.");
  const window = policy.normalize({ startsAtMs, expiresAtMs: startsAtMs + policy.DURATION_MS });
  assert(window, "Supply an exact deployment timestamp in milliseconds.");
  assert.equal(profiles.length, 2, "Exactly two accounts are required.");
  assert.equal(new Set(profiles.map(doc => doc.name)).size, 2, "Accounts must be distinct.");
  const writes = [];
  for (let i = 0; i < profiles.length; i++) {
    const doc = profiles[i], profile = data(doc);
    assert.equal(profile.playerName, NAMES[i], "The selected account name changed; resolve it again.");
    for (const field of ["worldId", "resetGeneration"]) assert.equal(profile[field], current[field], "Account realm changed.");
    assert.equal(profile.realmShardId, current.sharedRealmId, "Account shard changed.");
    if (profile[FIELD] !== undefined) {
      assert.deepEqual(profile[FIELD], window, "An existing exception cannot be changed or restarted.");
      continue;
    }
    writes.push({ update: { name: doc.name, fields: { [FIELD]: { mapValue: { fields: {
      startsAtMs: { integerValue: String(window.startsAtMs) }, expiresAtMs: { integerValue: String(window.expiresAtMs) },
    } } } } }, updateMask: { fieldPaths: [FIELD] }, currentDocument: { updateTime: doc.updateTime } });
  }
  // Profile versions may change during normal gameplay; fresh versions still guard the atomic commit.
  const hash = createHash("sha256").update(JSON.stringify({ pointer: pointer.name,
    world: current.worldId, generation: current.resetGeneration, shard: current.sharedRealmId,
    accounts: profiles.map(doc => doc.name), window })).digest("hex");
  return { writes, hash, window };
}

async function main() {
  const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? "" : process.argv[i + 1]; };
  const project = arg("project"), startsAtMs = Number(arg("starts-at-ms")), apply = process.argv.includes("--apply");
  assert.equal(project, "crown-land-b15e0", "Explicit --project crown-land-b15e0 is required.");
  if (apply) assert(arg("confirm-plan-hash"), "Apply requires a reviewed dry-run hash.");
  const root = path.resolve(__dirname, "..");
  const req = createRequire(path.join(root, "functions/package.json"));
  const lib = path.join(path.dirname(req.resolve("firebase-tools/package.json")), "lib");
  const auth = require(path.join(lib, "auth")), options = { project, projectId: project, nonInteractive: true };
  auth.setActiveAccount(options, auth.getProjectDefaultAccount(root));
  await require(path.join(lib, "requireAuth")).requireAuth(options);
  const { Client } = require(path.join(lib, "apiv2"));
  const api = new Client({ urlPrefix: "https://firestore.googleapis.com", apiVersion: "v1", auth: true });
  const base = `projects/${project}/databases/(default)/documents`;
  const skipLog = { body: true, resBody: true, queryParams: true };
  const pointer = (await api.get(`${base}/realmConfig/current`, { skipLog })).body;
  const current = data(pointer), profiles = [];
  for (const name of NAMES) {
    const response = await api.post(`${base}/leaderboards/${current.resetGeneration}--${current.sharedRealmId}:runQuery`, {
      structuredQuery: { from: [{ collectionId: "entries" }], where: { fieldFilter: {
        field: { fieldPath: "displayName" }, op: "EQUAL", value: { stringValue: name },
      } }, limit: 2 },
    }, { skipLog });
    const docs = response.body.filter(row => row.document).map(row => row.document);
    assert.equal(docs.length, 1, `Expected exactly one current leaderboard account for ${name}.`);
    const uid = docs[0].name.split("/").pop();
    profiles.push((await api.get(`${base}/players/${uid}`, { skipLog })).body);
  }
  const plan = buildPlan(pointer, profiles, startsAtMs, {
    worldId: arg("world"), resetGeneration: arg("reset-generation"), realmShardId: arg("realm-shard"),
  });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", players: NAMES,
    startsAt: new Date(plan.window.startsAtMs).toISOString(), expiresAt: new Date(plan.window.expiresAtMs).toISOString(),
    pendingAccounts: plan.writes.length, planHash: plan.hash }, null, 2));
  if (!apply) return;
  assert.equal(arg("confirm-plan-hash"), plan.hash, "Plan changed; run another dry run.");
  if (!plan.writes.length) { console.log("Already activated with the same window; no writes."); return; }
  assert(Math.abs(Date.now() - startsAtMs) < 15 * 60 * 1000, "Activate at deployment, within 15 minutes of the supplied start.");
  const freshPointer = (await api.get(`${base}/realmConfig/current`, { skipLog })).body;
  assert.equal(freshPointer.updateTime, pointer.updateTime, "Realm changed; run another dry run.");
  await api.post(`${base}:commit`, { writes: plan.writes }, { skipLog });
  for (const doc of profiles) {
    const verified = data((await api.get(doc.name, { skipLog })).body);
    assert.deepEqual(verified[FIELD], plan.window, "Activation verification failed.");
  }
  console.log("Verified both account exceptions. The timer will not restart on retry.");
}
module.exports = { buildPlan, FIELD, NAMES };
if (require.main === module) main().catch(() => {
  // API errors can contain private document paths or values. Keep CLI output private-data free.
  console.error("Exception activation stopped. Check the named accounts, current realm, timestamp and dry-run hash; no automatic retry was attempted.");
  process.exitCode = 1;
});
