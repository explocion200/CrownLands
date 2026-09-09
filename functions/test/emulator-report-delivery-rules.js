"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!firestoreHost || !authHost) throw new Error("Firestore and Auth emulators are required.");
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore();
const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const identity = { resetGeneration: "realm-2026-09", worldId: "main-realm-2026-09", realmShardId: "shard_0001" };

function extractFunction(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, `Missing ${name}`);
  const end = source.indexOf("\n  }", match.index);
  assert.ok(end > match.index);
  return source.slice(match.index, end + 4);
}

async function main() {
  const nonce = crypto.randomBytes(6).toString("hex");
  const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `report-delivery-${nonce}@example.test`, password: `Reports-${nonce}!`, returnSecureToken: true }),
  });
  assert.equal(signup.status, 200);
  const user = await signup.json();
  const playerPath = `players/${user.localId}`;
  const nowMs = Date.now();
  const current = { ...identity, uid: user.localId, type: "attack", createdAtMs: nowMs, occurredAtMs: nowMs };
  const batch = db.batch();
  batch.set(db.doc("realmConfig/current"), identity);
  const clanId = `sync-${nonce}`;
  batch.set(db.doc(playerPath), { uid: user.localId, clanId, ...identity, battleReports: [] });
  batch.set(db.doc(`${playerPath}/serverReports/current-battle`), current);
  batch.set(db.doc(`${playerPath}/serverReports/other-shard`), { ...current, realmShardId: "shard_0002" });
  batch.set(db.doc(`${playerPath}/serverReports/archived`), { ...current, resetGeneration: "archived", worldId: "archived" });
  batch.set(db.doc(`players/other-${nonce}/serverReports/private`), { ...current, uid: `other-${nonce}` });
  batch.set(db.doc(`clans/${clanId}`), { ...identity, status: "active" });
  batch.set(db.doc(`clans/${clanId}/members/${user.localId}`), { ...identity, uid: user.localId, status: "active", role: "leader" });
  const streams = [
    [`armies/outgoing-${nonce}`, { ownerUid: user.localId, status: "active" }],
    [`${playerPath}/incomingArmies/incoming`, { status: "active" }],
    [`reinforcements/contributor-${nonce}`, { ownerUid: user.localId, targetOwnerUid: "ally", status: "stationed" }],
    [`reinforcements/holder-${nonce}`, { ownerUid: "ally", targetOwnerUid: user.localId, status: "stationed" }],
    [`clans/${clanId}/rallies/forming`, { status: "forming" }],
    [`${playerPath}/stats/global`, {}],
    [`${playerPath}/dailyMissions/current`, { cycleKey: "current" }],
    [`${playerPath}/seasonalAchievements/current`, { seasonId: "current" }],
  ];
  streams.forEach(([p, data]) => {
    batch.set(db.doc(p), { ...current, ...data });
    if (!p.includes("/stats/") && !p.includes("/dailyMissions/") && !p.includes("/seasonalAchievements/")) {
      batch.set(db.doc(p + "-foreign"), { ...current, ...data, realmShardId: "shard_0002" });
      batch.set(db.doc(p + "-archived"), { ...current, ...data, resetGeneration: "archived", worldId: "archived" });
    }
  });
  await batch.commit();

  const queries = [];
  const listeners = [];
  let serverReads = 0;
  let listener;
  const decode = value => value.stringValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : undefined)
    ?? value.booleanValue ?? null;
  const firestore = {
    collection: (_db, ...segments) => segments.join("/"),
    doc: (_db, ...segments) => ({ documentPath: segments.join("/") }),
    where: (fieldPath, op, value) => {
      assert.ok(["==", "in"].includes(op));
      return { fieldFilter: { field: { fieldPath }, op: op === "in" ? "IN" : "EQUAL", value: Array.isArray(value)
        ? { arrayValue: { values: value.map(stringValue => ({ stringValue })) } } : { stringValue: value } } };
    },
    orderBy: (fieldPath, order) => ({ orderBy: { field: { fieldPath }, direction: order === "desc" ? "DESCENDING" : "ASCENDING" } }),
    limit: count => ({ limit: count }),
    query: (collectionPath, ...constraints) => {
      const filters = constraints.filter(c => c.fieldFilter);
      const query = { collectionPath, structuredQuery: {
        from: [{ collectionId: collectionPath.split("/").pop() }],
        where: { compositeFilter: { op: "AND", filters } },
        orderBy: constraints.filter(c => c.orderBy).map(c => c.orderBy),
        limit: constraints.find(c => c.limit)?.limit,
      } };
      queries.push(query);
      return query;
    },
    getDocs: async query => {
      const result = await request(query);
      assert.equal(result.status, 200, `Actual client report query failed: ${JSON.stringify(result.body)}`);
      return { docs: result.body.filter(row => row.document).map(row => ({
        id: row.document.name.split("/").pop(), data: () => Object.fromEntries(Object.entries(row.document.fields || {}).map(([k, v]) => [k, decode(v)])),
      })) };
    },
    onSnapshot: (query, ...callbacks) => {
      const onNext = callbacks.find(value => typeof value === "function");
      listener = { query, emit: async () => {
        if (query.documentPath) {
          const response = await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${query.documentPath}`, { headers: { authorization: `Bearer ${user.idToken}` } });
          assert.equal(response.status, 200, "Authenticated live document read failed");
          const value = await response.json();
          return onNext({ id: query.documentPath.split("/").pop(), exists: () => true, data: () => Object.fromEntries(Object.entries(value.fields || {}).map(([k, v]) => [k, decode(v)])) });
        }
        const snapshot = await firestore.getDocs(query);
        onNext({ ...snapshot, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
      } };
      listeners.push(listener);
      return () => {};
    },
  };
  async function request(query) {
    const parent = query.collectionPath.split("/").slice(0, -1).join("/");
    const response = await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents${parent ? "/" + parent : ""}:runQuery`, {
      method: "POST", headers: { authorization: `Bearer ${user.idToken}`, "content-type": "application/json" },
      body: JSON.stringify({ structuredQuery: query.structuredQuery }),
    });
    return { status: response.status, body: await response.json() };
  }
  const scope = {
    client: { configured: true, db: {}, user: { uid: user.localId }, modules: { firestore } },
    init: async () => {}, requireSignedIn: () => user.localId,
    RESET_GENERATION: identity.resetGeneration, ONLINE_WORLD_ID: identity.worldId, REALM_SHARD_ID: identity.realmShardId,
    dispatch() {}, cleanGlobalStats: value => value, window: { setTimeout, clearTimeout },
  };
  firestore.getDocsFromServer = query => { serverReads += 1; return firestore.getDocs(query); };
  vm.createContext(scope);
  for (const name of ["getRealmShardQueryConstraints", "subscribeScopedSnapshot", "loadServerReports", "subscribeServerReports", "subscribePlayerArmies", "subscribePlayerReinforcements", "subscribeClanRallies", "subscribePlayerGlobalStats", "subscribeDailyMissionState", "subscribeSeasonalAchievementState"]) {
    vm.runInContext(extractFunction(name), scope);
  }
  const loaded = await scope.loadServerReports();
  assert.equal(serverReads, 1, "Report recovery did not request an authoritative server read.");
  assert.deepEqual(Array.from(loaded, r => r.id), ["current-battle"], "The client did not recover a current report missing from the profile.");
  const deliveries = [];
  let stop = scope.subscribeServerReports({ onReports: reports => deliveries.push(Array.from(reports, r => r.id)) });
  await listener.emit();
  assert.deepEqual(deliveries[0], ["current-battle"]);
  await db.doc(`${playerPath}/serverReports/new-battle`).set({ ...current, createdAtMs: nowMs + 1 });
  await listener.emit();
  assert.deepEqual(deliveries[1], ["new-battle", "current-battle"], "The live query missed a newly committed report.");
  stop();
  await listener.emit();
  assert.equal(deliveries.length, 2, "A stopped report watcher delivered a late snapshot.");
  stop = scope.subscribeServerReports({ onReports: reports => deliveries.push(Array.from(reports, r => r.id)) });
  await listener.emit();
  assert.deepEqual(deliveries[2], ["new-battle", "current-battle"], "Reconnect failed to recover current reports.");
  stop();

  const unscoped = JSON.parse(JSON.stringify(queries[0]));
  unscoped.structuredQuery.where.compositeFilter.filters = unscoped.structuredQuery.where.compositeFilter.filters.filter(f => f.fieldFilter.field.fieldPath !== "realmShardId");
  assert.equal((await request(unscoped)).status, 403, "The original missing-shard query unexpectedly passed.");
  const foreign = { ...queries[0], collectionPath: `players/other-${nonce}/serverReports` };
  assert.equal((await request(foreign)).status, 403, "A different player's reports became readable.");
  for (const [name, args, handler, expectedCount] of [
    ["subscribePlayerArmies", [], "onArmies", 2],
    ["subscribePlayerReinforcements", [], "onReinforcements", 2],
    ["subscribeClanRallies", [clanId], "onRallies", 1],
    ["subscribePlayerGlobalStats", [], "onStats", 1],
    ["subscribeDailyMissionState", ["current"], "onState", 1],
    ["subscribeSeasonalAchievementState", ["current"], "onState", 1],
  ]) {
    const first = listeners.length;
    const delivered = [];
    const close = scope[name](...args, { [handler]: value => delivered.push(value) });
    for (const live of listeners.slice(first)) await live.emit();
    assert.ok(delivered.length, `${name} did not deliver authenticated data`);
    const result = delivered.at(-1);
    assert.equal(Array.isArray(result) ? result.length : 1, expectedCount, `${name} included another shard or archived records`);
    close();
    const beforeLate = delivered.length;
    for (const live of listeners.slice(first)) await live.emit();
    assert.equal(delivered.length, beforeLate, `${name} delivered a stopped session's data`);
  }
  const indexes = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8")).indexes;
  for (const query of queries) {
    const collectionGroup = query.collectionPath.split("/").pop();
    const equalityFields = query.structuredQuery.where.compositeFilter.filters.map(f => f.fieldFilter.field.fieldPath);
    const orderedFields = query.structuredQuery.orderBy || [];
    assert.ok(indexes.some(index => index.collectionGroup === collectionGroup && index.queryScope === "COLLECTION"
      && index.fields.length === new Set([...equalityFields, ...orderedFields.map(f => f.field.fieldPath)]).size
      && equalityFields.every(field => index.fields.some(f => f.fieldPath === field && f.order === "ASCENDING"))
      && orderedFields.every(field => index.fields.some(f => f.fieldPath === field.field.fieldPath && f.order === field.direction))), `${collectionGroup}: the actual client query has no matching deployable index.`);
  }
  console.log("Authenticated sync queries passed: reports, armies, reinforcements, rallies, stats, missions, achievements, reconnects, and stopped listeners.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
