"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const source = read("firebaseClient.js");
const loader = source.slice(source.indexOf("  async function loadActiveMarauders("), source.indexOf("  async function loadOwnedCitiesAcrossIslands("));
const scope = { worldId: "current-world", resetGeneration: "current-season", realmShardId: "shard_0001" };
const encode = row => ({ fields: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "number" ? { integerValue: String(value) } : { stringValue: value }])) });
async function check(transport) {
  let calls = [], mutate = () => {}, fail = false;
  const root = { location: { origin: "https://playcrownlands.com", pathname: "/api/local-game/rehearsal/" },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} }, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    fetch: async (url, options) => {
      if (url === "/local-auth/v1/session") return Response.json({ csrf: "fixture", user: { uid: "fixture" }, authTime: 1 });
      assert.equal(url, "/api/local-game/v1/read", "Search must never write, subscribe or launch an order");
      const { targets } = JSON.parse(options.body); calls.push(targets); mutate();
      if (fail) return Response.json({ error: { code: "unavailable", message: "Synthetic unavailable map" } }, { status: 503 });
      return Response.json({ result: targets.map(target => {
        assert.equal(target.filters[0].field[0], "status"); assert.equal(target.filters[0].value.stringValue, "active");
        const regionId = target.collection.split("/")[1].split("--").at(-1);
        const row = { ...scope, regionId, status: "active", spawnId: "spawn-" + regionId, level: 10, x: 100, y: 200 };
        // Defense in depth even if malformed/old documents reach this read.
        const variants = [row, { ...row, level: 1 }, { ...row, level: 100 }, { ...row, status: "defeated" },
          { ...row, status: "retired" }, { ...row, worldId: "old-world" }, { ...row, resetGeneration: "old-season" },
          { ...row, realmShardId: "shard_0002" }, { ...row, regionId: "inactive" }, { ...row, spawnId: "" }];
        return { document: false, documents: variants.map((body, index) => ({ path: target.collection + "/enemy-" + index, body: encode(body) })) };
      }) });
    } };
  new Function("window", transport)(root);
  const local = root.CrownlandsLocalBackend.create(), f = local.firestore;
  const client = { db: f.getFirestore(), user: { uid: "fixture" }, modules: { firestore: f } };
  const load = new Function("client", "init", "requireSignedIn", "getRealmIdentity", "ONLINE_WORLD_ID", "RESET_GENERATION", "REALM_SHARD_ID", loader + "return loadActiveMarauders;")(
    client, async () => {}, () => client.user.uid, () => scope, scope.worldId, scope.resetGeneration, scope.realmShardId);
  const maps = Array.from({ length: 100 }, (_, i) => ({ regionId: "map-" + i, islandId: scope.worldId + "--" + scope.realmShardId + "--map-" + i }));
  try {
    const progress = [], rows = await load(maps, { min: 10, max: 10, onProgress: done => progress.push(done) });
    assert.equal(rows.length, 100); assert.equal(calls.length, 5); assert(calls.every(batch => batch.length === 20));
    assert.deepEqual(progress, [20, 40, 60, 80, 100]); assert.equal(rows[99].regionId, "map-99");
    assert.equal((await load([maps[0], maps[0]])).length, 3, "Inclusive level endpoints and duplicate map removal");
    await assert.rejects(load(maps, { min: 20, max: 10 }), /level range/);
    await assert.rejects(load(maps, { min: 1.5 }), /level range/);
    await assert.rejects(f.getDocsBatch([]), /1–20/); await assert.rejects(f.getDocsBatch(Array(21).fill(f.collection(client.db, "islands"))), /1–20/);
    calls = []; let current = true; mutate = () => { current = false; };
    await assert.rejects(load(maps, { isCurrent: () => current }), /canceled/); assert.equal(calls.length, 1, "Closing cancels remaining map batches");
    mutate = () => { client.user = { uid: "replacement" }; };
    await assert.rejects(load(maps), /canceled/);
    client.user = { uid: "fixture" }; mutate = () => {}; fail = true; calls = [];
    await assert.rejects(load(maps), /Synthetic unavailable/); assert.equal(calls.length, 1, "No silently incomplete roster");
    fail = false; assert.equal((await load(maps)).length, 300, "Failed search is retryable with fresh reads");
    delete f.getDocsBatch; calls = []; assert.equal((await load(maps.slice(0, 5), { min: 10, max: 10 })).length, 5);
    assert.equal(calls.length, 5, "Standard Firestore fallback remains server-only");
  } finally { local.dispose(); }
}
(async () => { await check(read("local-client.js")); await check(require("./estate-delivery").minifyEstate(read("local-client.js")));
  console.log("Enemy search: actual local batch transport, 100 maps/5 reads, inclusive range, world/shard/generation/status filters, cancellation, account changes, failure/retry and server-only fallback passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
