"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { signUpVerifiedPlayer } = require("./auth-fixtures");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Local emulators required.");
}
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore();
const scope = { resetGeneration: "realm-2026-09", worldId: "main-realm-2026-09", realmShardId: "shard_0001" };
const board = scope.resetGeneration + "--" + scope.realmShardId;
const documents = `projects/${projectId}/databases/(default)/documents/`;
const endpoint = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/${documents}`;

async function main() {
  const signup = await signUpVerifiedPlayer(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `glory-client-${randomUUID()}@example.test`, password: "Emulator-Glory-Only-123!", returnSecureToken: true }),
  });
  assert(signup.ok);
  const actor = await signup.json();
  const ids = Array.from({ length: 100 }, (_, index) => index ? `glory-ruler-${String(index).padStart(3, "0")}` : actor.localId);
  const flag = { version: 2, primary: "#324522", secondary: "#efdca1", symbolColor: "#efdca1", pattern: "cross", symbol: "crown" };
  const batch = db.batch();
  batch.set(db.doc("realmConfig/current"), scope);
  batch.set(db.doc("players/" + actor.localId), scope);
  batch.set(db.doc("pvpLeaderboards/" + board), { ...scope, trackingStartedAtMs: 1000 });
  ids.forEach((uid, index) => {
    batch.set(db.doc(`pvpLeaderboards/${board}/entries/${uid}`), { ...scope, uid, pvpKills: 10000 - index, reachedAtMs: 1000 + index });
    // Scores survive a missing public identity or one outside the current scope.
    if (index === 98) return;
    batch.set(db.doc(`leaderboards/${board}/entries/${uid}`), {
      ...scope, worldId: index === 99 ? "another-world" : scope.worldId,
      playerName: `Ruler ${index}`, flag, clanId: "test-clan", clanTag: "TEST", kingPower: index,
    });
  });
  await batch.commit();

  const headers = { authorization: "Bearer " + actor.idToken, "content-type": "application/json" };
  const queries = [];
  const decode = value => {
    if (value?.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
    return value?.stringValue ?? (value?.integerValue !== undefined ? Number(value.integerValue) : value?.doubleValue ?? value?.booleanValue ?? null);
  };
  const snapshot = document => ({ id: document?.name.split("/").at(-1), exists: () => Boolean(document), data: () => document ? decode({ mapValue: { fields: document.fields } }) : undefined });
  const read = async (route, structuredQuery) => {
    const response = await fetch(endpoint + route + (structuredQuery ? ":runQuery" : ""), {
      headers, ...(structuredQuery ? { method: "POST", body: JSON.stringify({ structuredQuery }) } : {}),
    });
    const body = await response.json();
    if (response.status === 404 && !structuredQuery) return null;
    if (!response.ok) {
      const error = new Error(`Player read failed (${route}): ${body?.error?.message}`);
      error.code = String(body?.error?.status || "unknown").toLowerCase().replaceAll("_", "-");
      throw error;
    }
    return body;
  };
  // Adapt modular query constructors to REST, but execute the real client loader
  // and every read with the player's token so security rules are not bypassed.
  const firestore = {
    collection: (_db, ...parts) => parts.join("/"), doc: (_db, ...parts) => parts.join("/"),
    documentId: () => "__name__", where: (field, op, value) => ({ field, op, value }),
    orderBy: (field, direction) => ({ order: { field: { fieldPath: field }, direction: direction === "asc" ? "ASCENDING" : "DESCENDING" } }),
    limit: value => ({ limit: value }), query: (collection, ...constraints) => ({ collection, constraints }),
    getDoc: async route => snapshot(await read(route)),
    getDocs: async query => {
      queries.push(query);
      const parts = query.collection.split("/"), collectionId = parts.pop();
      const filters = query.constraints.filter(item => item.op).map(item => ({ fieldFilter: {
        field: { fieldPath: item.field }, op: item.op === "in" ? "IN" : "EQUAL",
        value: item.op === "in" ? { arrayValue: { values: item.value.map(id => ({ referenceValue: documents + query.collection + "/" + id })) } } : { stringValue: item.value },
      } }));
      const orderBy = query.constraints.filter(item => item.order).map(item => item.order);
      const limit = query.constraints.find(item => item.limit)?.limit;
      const result = await read(parts.join("/"), {
        from: [{ collectionId }], where: { compositeFilter: { op: "AND", filters } },
        ...(orderBy.length ? { orderBy } : {}), ...(limit ? { limit } : {}),
      });
      return { docs: result.filter(row => row.document).map(row => snapshot(row.document)) };
    },
  };
  const client = { user: { uid: actor.localId }, db: {}, activeSessionId: "glory-test", activeSessionActivationGeneration: 1, modules: { firestore } };
  const context = { client, init: async () => {}, requireSignedIn: () => client.user.uid,
    ONLINE_WORLD_ID: scope.worldId, RESET_GENERATION: scope.resetGeneration, getRealmStorageId: () => board,
    getRealmShardQueryConstraints: where => [where("realmShardId", "==", scope.realmShardId)],
  };
  const source = fs.readFileSync(path.join(__dirname, "../../firebaseClient.js"), "utf8");
  const start = source.indexOf("  async function loadPvpLeaderboard(");
  const end = source.indexOf("  async function loadPlayerIdentities(", start);
  assert(start > 0 && end > start);
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);

  for (const count of [20, 100]) {
    queries.length = 0;
    const result = await context.loadPvpLeaderboard(count);
    assert.equal(result.entries.length, count);
    assert.equal(result.trackingStartedAtMs, 1000);
    assert.equal(new Set(result.entries.map(row => row.uid)).size, count);
    result.entries.forEach((row, index) => {
      assert.equal(row.uid, ids[index]);
      assert.equal(row.pvpKills, 10000 - index);
      if (index < 98) {
        assert.equal(row.playerName, `Ruler ${index}`);
        assert.deepEqual(row.flag, flag);
        assert.equal(row.clanTag, "TEST");
      } else assert.equal(row.playerName, undefined);
    });
    assert(queries.filter(query => query.collection.startsWith("leaderboards/")).every(query => query.constraints.find(item => item.op === "in").value.length <= 10));
  }
  console.log("PvP client emulator passed authenticated 20/100-player boards, all identities, canonical scores/order, and missing/out-of-scope identity fallback.");
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
