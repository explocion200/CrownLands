"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { Store, Timestamp } = require("../local-backend/store");
const { AuthService, secret } = require("../local-backend/auth");
const { createGameServer } = require("../local-backend/game-http");
const { COOKIE, CSRF } = require("../local-backend/auth-http");

(async () => {
  const schema = "migration_game_browser_" + crypto.randomBytes(4).toString("hex"), store = new Store({ schema });
  const auth = new AuthService({ store, rateKey: crypto.randomBytes(32) }), csrf = secret();
  const owner = { localId: "fixture-browser", email: "browser@example.test", emailVerified: true, providerUserInfo: [{ providerId: "google.com", rawId: "fixture-browser-google" }] };
  const scope = { resetGeneration: "realm-2026-10", worldId: "main-realm-2026-10", realmShardId: "shard_0001" };
  const island = scope.worldId + "--" + scope.realmShardId + "--fixture";
  let server, client, signed, nextId = 0, reads = 0, worldReads = 0, pauseWatch, resumeWatch, logOut = false, writeConflict = false, activeRequests = 0, peakRequests = 0, holdCalls = false;
  const releaseCalls = [];
  const timers = new Map(), intervals = new Map();
  try {
    await store.initialize(); await auth.initialize();
    await store.pool.query(`INSERT INTO ${schema}.accounts(uid,body) VALUES($1,$2)`, [owner.localId, owner]);
    signed = await auth.transaction(connection => auth.newSession(connection, owner, "google.com"));
    await store.doc("realmConfig/current").set(scope);
    await store.doc("players/" + owner.localId).set({ ...scope, uid: owner.localId, marchPercent: 70, scoutReports: { stale: 1, keep: 2 }, updatedAt: new Timestamp(1700000000, 123456789) });
    for (let i = 1; i <= 3; i++) await store.doc(`islands/${island}/cities/city${i}`).set({ ...scope, ownerUid: owner.localId, rank: i });
    await store.doc(`islands/${island}/cities/other`).set({ ...scope, ownerUid: "someone-else", rank: 4 });
    const social = require("../functions/social").createService({ db: store, getRealm: () => scope });
    await store.doc("socialConfiguration/current").set({ enabled: true });
    await store.doc("players/social-peer").set({ ...scope, playerName: "Social fixture" });
    const socialAs = (uid, data) => social.handler({ auth: { uid, token: { email_verified: true } }, data: { ...data, requestId: crypto.randomUUID() } });
    await socialAs(owner.localId, { action: "friend", peerUid: "social-peer", choice: "request" });
    await socialAs("social-peer", { action: "friend", peerUid: owner.localId, choice: "accept" });
    const privateMessage = await socialAs("social-peer", { action: "send", peerUid: owner.localId, text: "Synthetic private message" });
    server = createGameServer({ store, auth, worldData: { schema, async read(identity, operation) {
      worldReads++; assert.equal(identity.uid, owner.localId);
      if (operation === "areas") throw Object.assign(Error("Realm changed"), { code: "failed-precondition", status: 409 });
      return { ready: true };
    } }, routes: [{ name: "fixtureEcho", kind: "callable", handler: async req => ({ value: req.data.value, uid: req.auth.uid }) },
      { name: "social", kind: "callable", handler: social.handler }], ownerUid: owner.localId, expiresAt: new Date(Date.now() + 600000).toISOString() });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const root = {
      location: { origin: auth.origin, pathname: "/api/local-game/rehearsal/" }, document: { hidden: false },
      setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
      setInterval: fn => { const id = ++nextId; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
      fetch: async (url, options = {}) => {
        assert(!String(url).includes("googleapis") && !String(url).includes("firebase"));
        if (url === "/local-auth/v1/session") return Response.json({ ...(!logOut && await auth.session(signed.token) || { user: null }), csrf });
        assert(url.startsWith("/api/local-game/v1/"));
        if (url.endsWith("/watch")) { reads++; if (pauseWatch) { pauseWatch(); await new Promise(resolve => { resumeWatch = resolve; }); } }
        if (url.endsWith("/write") && writeConflict) {
          writeConflict = false; await store.doc("players/" + owner.localId).update({ marchPercent: 40 });
        }
        activeRequests++; peakRequests = Math.max(peakRequests, activeRequests);
        if (holdCalls) await new Promise(resolve => releaseCalls.push(resolve));
        return new Promise((resolve, reject) => {
          const request = http.request({ hostname: "127.0.0.1", port: server.address().port, path: url, method: options.method, signal: options.signal,
            headers: { ...options.headers, Host: "playcrownlands.com", Origin: auth.origin,
              Cookie: `${CSRF}=${csrf}; ${COOKIE}=${signed.token}`, "X-Crownlands-Client-IP": "192.168.1.145", "Sec-Fetch-Site": "same-origin" } }, response => {
            const chunks = []; response.on("data", chunk => chunks.push(chunk));
            response.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
          }); request.on("error", reject); request.end(options.body);
        }).finally(() => { activeRequests--; });
      },
    };
    new Function("window", fs.readFileSync(path.join(__dirname, "../local-client.js"), "utf8"))(root);
    assert.throws(() => { root.location.pathname = "/play/"; root.CrownlandsLocalBackend.create(); }, /private rehearsal/);
    root.location.pathname = "/api/local-game/rehearsal/"; client = root.CrownlandsLocalBackend.create();
    const f = client.firestore, db = f.getFirestore(), profile = f.doc(db, "players", owner.localId);
    const snap = await f.getDoc(profile);
    assert(snap.exists()); assert.equal(snap.data().updatedAt.seconds, 1700000000); assert.equal(snap.data().updatedAt.nanoseconds, 123456789);
    assert.equal(snap.get("marchPercent"), 70);
    await f.updateDoc(profile, { "scoutReports.stale": f.deleteField(), updatedAt: f.serverTimestamp() });
    assert.deepEqual((await f.getDoc(profile)).data().scoutReports, { keep: 2 });
    await assert.rejects(f.updateDoc(profile, { gold: 1000000 }), { code: "permission-denied" });
    const scopeFilters = Object.entries(scope).map(([key, value]) => f.where(key, "==", value));
    const owned = f.query(f.collectionGroup(db, "cities"), f.where("ownerUid", "==", owner.localId), ...scopeFilters, f.orderBy("rank"));
    const cities = await f.getDocs(owned); assert.equal(cities.size, 3); assert.equal(cities.docs[0].ref.parent.parent.id, island);
    const remaining = await f.getDocs(f.query(owned, f.startAfter(cities.docs[0]), f.limit(1))); assert.equal(remaining.docs[0].id, "city2");
    const implicit = f.query(f.collection(db, "islands", island, "cities"), f.where("rank", ">=", 1));
    assert.equal((await f.getDocs(f.query(implicit, f.startAfter(cities.docs[0]), f.limit(1)))).docs[0].id, "city2");
    await assert.rejects(f.getDocs(f.query(f.collectionGroup(db, "cities"), ...scopeFilters)), { code: "permission-denied" });
    await assert.rejects(f.getDocs(f.collection(db, "players", "someone-else", "estate")), { code: "permission-denied" });
    const echo = await client.functions.httpsCallable({}, "fixtureEcho")({ value: 42 }); assert.equal(echo.data.value, 42); assert.equal(echo.data.uid, owner.localId);
    const socialCall = client.functions.httpsCallable({}, "social");
    assert.equal((await socialCall({ action: "status" })).data.enabled, true);
    // Reproduce login: tabs initialize before the map sets its command context.
    root.CROWNLANDS_WORLD_SESSION = Object.freeze({ protocol: 1, revision: "a".repeat(64) });
    for (const kind of ["friends", "conversations"]) {
      const rows = (await socialCall({ action: "list", kind })).data.rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].peerUid, "social-peer");
    }
    const history = (await socialCall({ action: "history", conversationId: privateMessage.conversationId })).data.messages;
    assert.equal(history[0].text, "Synthetic private message");
    assert.equal((await socialCall({ action: "unread" })).data.count, 1);
    await assert.rejects(socialCall({ action: "list", kind: "friends", forged: true }), { code: "functions/invalid-argument" });
    delete root.CROWNLANDS_WORLD_SESSION;
    peakRequests = 0;
    const burst = await Promise.all(Array.from({ length: 30 }, (_, value) => client.functions.httpsCallable({}, "fixtureEcho")({ value })));
    assert.deepEqual(burst.map(result => result.data.value), Array.from({ length: 30 }, (_, value) => value));
    assert.equal(peakRequests, 6, "Startup bursts must queue below the server admission limit");
    holdCalls = true;
    const occupied = Array.from({ length: 6 }, () => client.functions.httpsCallable({}, "fixtureEcho")({ value: 1 }));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(releaseCalls.length, 6);
    const cancel = new AbortController(), obsolete = client.world.read("catalog", {}, cancel.signal);
    cancel.abort(); await assert.rejects(obsolete, { name: "AbortError" });
    holdCalls = false; for (const release of releaseCalls.splice(0)) release(); await Promise.all(occupied);
    assert.equal(worldReads, 0, "Cancelled queued camera requests must never reach the server");
    assert.deepEqual(await client.world.read("catalog"), { ready: true });
    await assert.rejects(client.world.read("areas", { realm: "changed", ids: [] }), { status: 409 });
    let attempts = 0; writeConflict = true;
    await f.runTransaction(db, async tx => { attempts++; const before = await tx.get(profile); tx.update(profile, { marchPercent: before.get("marchPercent") + 1 }); });
    assert.equal(attempts, 2); assert.equal((await f.getDoc(profile)).get("marchPercent"), 41);
    await f.writeBatch(db).commit();

    const snapshots = [], denied = [], counts = [];
    const stopProfile = f.onSnapshot(profile, value => { snapshots.push(value.get("marchPercent")); });
    f.onSnapshot(f.doc(db, "players", "someone-else"), () => assert.fail("private data delivered"), error => denied.push(error.code));
    const stopCities = f.onSnapshot(owned, value => counts.push(value.docChanges().map(change => [change.type, change.doc.id])));
    const tick = async () => { const [id, timer] = timers.entries().next().value; timers.delete(id); await timer.fn(); return timer.delay; };
    await tick(); assert.equal(reads, 1); assert.deepEqual(snapshots, [41]); assert.deepEqual(denied, ["permission-denied"]); assert.equal(counts[0].length, 3);
    await tick(); assert.equal(reads, 2); assert.equal(snapshots.length, 1); assert.equal(denied.length, 1, "Permission-denied listener must stop");
    await store.doc(`islands/${island}/cities/city2`).update({ rank: 8 });
    await store.doc(`islands/${island}/cities/city3`).delete();
    await tick(); assert(counts[1].some(([type, id]) => type === "removed" && id === "city3")); assert(counts[1].some(([type, id]) => type === "modified" && id === "city2"));
    root.document.hidden = true; await tick(); assert.equal([...timers.values()][0].delay, 10000);
    stopCities(); stopProfile(); await tick(); assert.equal(timers.size, 0);

    await client.auth.reload(); let pendingStarted;
    const started = new Promise(resolve => { pendingStarted = resolve; }); pauseWatch = pendingStarted;
    f.onSnapshot(profile, () => assert.fail("Old-session response delivered"), error => assert.equal(error.code, "unauthenticated"));
    const pending = tick(); await started;
    logOut = true; await client.auth.reload(); resumeWatch(); await pending;
    assert.equal(timers.size, 0);
    logOut = false; await client.auth.reload(); holdCalls = true;
    root.CROWNLANDS_WORLD_SESSION = Object.freeze({protocol:1,revision:"a".repeat(64)});
    const queued = Array.from({length:7}, () => client.functions.httpsCallable({}, "fixtureEcho")({value:1}).then(()=>"ok",error=>error.code));
    await new Promise(resolve=>setImmediate(resolve));assert.equal(releaseCalls.length,6);
    root.CROWNLANDS_WORLD_SESSION = Object.freeze({protocol:1,revision:"b".repeat(64)});
    holdCalls=false;for(const release of releaseCalls.splice(0))release();
    assert.deepEqual(await Promise.all(queued),["ok","ok","ok","ok","ok","ok","functions/failed-precondition"]);
    delete root.CROWNLANDS_WORLD_SESSION;holdCalls=true;
    const held = Array.from({ length: 140 }, () => client.functions.httpsCallable({}, "fixtureEcho")({ value: 1 })
      .then(() => "unexpected-success", error => error.code));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(releaseCalls.length, 6);
    client.dispose(); for (const release of releaseCalls) release();
    const rejected = await Promise.all(held);
    assert.equal(rejected.filter(code => code === "functions/resource-exhausted").length, 6, "Pending work is bounded to 128 plus six in flight");
    assert.equal(rejected.filter(code => code === "functions/unauthenticated").length, 134, "Disposal rejects queued and in-flight old-session results");
    console.log("Local browser client: real PostgreSQL cookie API, permission boundaries, nanosecond timestamps, nested transforms, scoped queries/cursors, retrying transactions, batched independent listeners, visibility backoff and stale-session response rejection passed.");
  } finally {
    client?.dispose(); if (resumeWatch) resumeWatch();
    if (server) await new Promise(resolve => server.close(resolve));
    await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await store.close();
  }
})().catch(error => { console.error("Local browser client integration failed:", error.stack); process.exitCode = 1; });
