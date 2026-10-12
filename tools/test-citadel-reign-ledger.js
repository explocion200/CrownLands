"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
function section(file, start, end) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Missing source boundaries in ${file}`);
  return source.slice(from, to);
}

async function serverAccounting() {
  const documents = new Map();
  let writing = false;
  const transaction = {
    get: async ref => { assert(!writing, "Ledger reads must precede writes"); return { ref, data: () => documents.get(ref.path) }; },
    set: (ref, data) => { writing = true; documents.set(ref.path, { ...documents.get(ref.path), ...data }); },
  };
  const context = vm.createContext({
    db: { doc: path => ({ path }) }, FieldValue: { serverTimestamp: () => "server-time" },
    safeString: (v, n) => String(v || "").trim().slice(0, n), safeNumber: (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback,
    normalizePlayerName: (v, fallback) => v || fallback, timestampToMs: v => Number(v) || 0,
    isCrownCitadel: c => c.strongholdType === "crown", getRealmStorageId: () => "realm--shard",
    getCurrentRealmShardId: () => "shard", ONLINE_WORLD_ID: "world", RESET_GENERATION: "realm",
  });
  vm.runInContext(section("functions/index.js", "function crownCitadelReignRef", "function isStrongholdLegacyTarget"), context);
  const change = async (oldUid, newUid, nowMs, captured = 0) => {
    writing = false;
    const input = { citadel: { strongholdType: "crown", lastCapturedAtMs: captured }, previousOwnerUid: oldUid, nextOwnerUid: newUid, nowMs };
    input.reignSnapshots = await context.prefetchCrownCitadelReignSnapshots(transaction, input);
    context.recordCrownCitadelControlChange(transaction, input);
  };
  const get = uid => documents.get(`crownCitadelReigns/realm--shard/entries/${uid}`);
  await change("", "a", 1000);
  assert.equal(get("a").currentHeldSinceMs, 1000);
  await change("a", "b", 5000, 1000);
  assert.equal(get("a").totalHeldMs, 4000);
  assert.equal(get("a").isCurrentHolder, false);
  await change("b", "a", 8000, 5000);
  assert.equal(get("b").totalHeldMs, 3000);
  assert.equal(get("a").totalHeldMs, 4000, "Recapture retains completed reigns");
  await change("a", "", 12000, 8000);
  assert.equal(get("a").totalHeldMs, 8000, "Release adds the final tenure once");
  assert.equal(get("a").currentHeldSinceMs, 0);
  await change("a", "a", 14000);
  assert.equal(get("a").totalHeldMs, 8000, "Same-owner changes cannot add time");
  await change("unrecorded", "b", 16000, 15000);
  assert.equal(get("unrecorded").totalHeldMs, 1000, "First recorded handoff preserves existing tenure");
  documents.set("crownCitadelReigns/realm--shard/entries/stale", { worldId: "old", resetGeneration: "old", totalHeldMs: 999999 });
  await change("b", "stale", 17000, 16000);
  assert.equal(get("stale").totalHeldMs, 0, "Archived totals cannot enter this realm");
  console.log("Citadel server accounting: capture, recapture, release, first record and realm isolation passed.");
}

async function clientReads() {
  let scope = "account:world:realm:shard", pending = null;
  const fields = { worldId: "world", resetGeneration: "realm", realmShardId: "shard" };
  const makeDoc = (id, extra = {}) => ({ id, exists: () => true, data: () => ({ ...fields, playerId: id, totalHeldMs: 1000, ...extra }) });
  const docs = Array.from({ length: 100 }, (_, i) => makeDoc(`ruler-${i}`, { totalHeldMs: 2000 + i }));
  let current = makeDoc("current", { currentHeldSinceMs: 1000, isCurrentHolder: true });
  const reads = [];
  const context = vm.createContext({
    init: async () => {}, requireSignedIn: () => "viewer", getOnlineRequestScope: () => scope,
    getRealmStorageId: () => "realm--shard", getRealmShardQueryConstraints: where => [where("realmShardId", "==", "shard")],
    ONLINE_WORLD_ID: "world", RESET_GENERATION: "realm", REALM_SHARD_ID: "shard",
    cleanPlayerName: v => v, timestampToMs: () => 0,
    client: { db: {}, modules: { firestore: {
      collection: (_, ...parts) => parts.join("/"), doc: (_, ...parts) => parts.join("/"),
      query: (...args) => args, where: (...args) => args, orderBy: (...args) => args, limit: n => n,
      getDocs: async q => { reads.push(q); if (pending) await pending; return { docs }; },
      getDoc: async ref => { reads.push(ref); return current; },
    } } },
  });
  vm.runInContext(section("firebaseClient.js", "async function loadCrownCitadelReignLeaderboard", "async function loadStrongholdLegacyLeaderboard"), context);
  const result = await context.loadCrownCitadelReignLeaderboard(100, "current");
  assert.equal(result.length, 101, "The current ruler must be fetched even below the completed-time top 100");
  assert.equal(result.find(r => r.playerId === "current").totalHeldMs, 1000);
  assert(reads.some(r => typeof r === "string" && r.endsWith("/current")));
  current = docs[0];
  assert.equal((await context.loadCrownCitadelReignLeaderboard(100, "ruler-0")).length, 100, "Current ruler is not duplicated");
  current = makeDoc("archived", { resetGeneration: "old" });
  assert(!(await context.loadCrownCitadelReignLeaderboard(100, "archived")).some(r => r.playerId === "archived"));
  let finish;
  pending = new Promise(resolve => { finish = resolve; });
  const stale = context.loadCrownCitadelReignLeaderboard(100, "current");
  await new Promise(resolve => setImmediate(resolve));
  scope = "another-account:world:realm:shard"; finish();
  await assert.rejects(stale, /account or realm changed/i);
  console.log("Citadel client reads: current ruler inclusion, deduplication and stale-scope rejection passed.");
}

serverAccounting().then(clientReads).catch(error => { console.error(error); process.exitCode = 1; });
