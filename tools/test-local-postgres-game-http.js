"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { Store, encode, Timestamp } = require("../local-backend/store");
const { AuthService, secret } = require("../local-backend/auth");
const { ClientData, decode } = require("../local-backend/client-data");
const { createGameServer } = require("../local-backend/game-http");
const { COOKIE, CSRF } = require("../local-backend/auth-http");

(async () => {
  const schema = "migration_game_http_" + crypto.randomBytes(5).toString("hex"), db = new Store({ schema });
  const auth = new AuthService({ store: db, rateKey: crypto.randomBytes(32) });
  const csrf = secret(), owner = { localId: "fixture-owner", email: "owner@example.test", emailVerified: true, providerUserInfo: [{ providerId: "google.com", rawId: "fixture-google" }] };
  const other = { ...owner, localId: "fixture-other", email: "other@example.test" };
  const scope = { resetGeneration: "realm-2026-10", worldId: "main-realm-2026-10", realmShardId: "shard_0001" };
  let signed, otherSigned, server, request, current = Date.now(), calls = 0;
  try {
    await db.initialize(); await auth.initialize();
    for (const account of [owner, other]) await db.pool.query(`INSERT INTO ${schema}.accounts(uid,body) VALUES($1,$2)`, [account.localId, account]);
    signed = await auth.transaction(client => auth.newSession(client, owner, "google.com"));
    otherSigned = await auth.transaction(client => auth.newSession(client, other, "google.com"));
    await db.doc("realmConfig/current").set(scope);
    const ref = db.doc("players/" + owner.localId);
    await ref.set({ ...scope, uid: owner.localId, gold: 500, marchPercent: 80 });
    await db.doc("players/" + other.localId).set({ ...scope, gold: 100, private: "must-not-leak" });
    const routes = [{ name: "fixtureCall", kind: "callable", options: {}, handler: async req => {
      calls++; assert.equal(req.auth.uid, owner.localId); assert.equal(req.rawRequest.headers["x-forwarded-for"], "192.168.1.145");
      return { uid: req.auth.uid, value: req.data.value };
    } }, { name: "fixturePrivateError", kind: "callable", options: {}, handler: async () => { throw Error("private-database-credentials-fixture"); } },
    { name: "fixtureScheduler", kind: "schedule", options: {}, handler: async () => { throw Error("Must not be HTTP callable"); } }];
    server = createGameServer({ store: db, auth, routes, ownerUid: owner.localId, expiresAt: new Date(current + 60000).toISOString(), now: () => current });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const headers = { Host: "playcrownlands.com", Origin: auth.origin, "Content-Type": "application/json", Cookie: `${CSRF}=${csrf}; ${COOKIE}=${signed.token}`, "X-Crownlands-CSRF": csrf, "X-Crownlands-Client-IP": "192.168.1.145", "Sec-Fetch-Site": "same-origin" };
    request = (route, input, extra = {}) => new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path: "/api/local-game/v1/" + route, method: "POST", headers: { ...headers, ...extra } }, res => {
        let text = ""; res.setEncoding("utf8"); res.on("data", chunk => text += chunk); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text, json: JSON.parse(text) }));
      }); req.on("error", reject); req.end(JSON.stringify(input));
    });
    for (const extra of [{ Origin: "https://attacker.example" }, { "X-Crownlands-CSRF": secret() }, { "Sec-Fetch-Site": "cross-site" }]) assert.equal((await request("call/fixtureCall", { data: {} }, extra)).status, 403);
    assert.equal((await request("call/fixtureCall", { data: {} }, { Host: "attacker.example" })).status, 421);
    assert.equal((await request("call/fixtureCall", { data: {} }, { "X-Crownlands-Client-IP": "203.0.113.8" })).status, 404);
    assert.equal((await request("call/fixtureCall", { data: {} }, { Cookie: `${CSRF}=${csrf}` })).status, 401);
    assert.equal((await request("call/fixtureCall", { data: {} }, { Cookie: `${CSRF}=${csrf}; ${COOKIE}=${otherSigned.token}` })).status, 403);
    assert.equal(calls, 0);
    const result = await request("call/fixtureCall", { data: { value: "fixture", auth: { uid: other.localId } } }, { "X-Forwarded-For": "attacker" });
    assert.equal(result.status, 200); assert.equal(result.json.result.uid, owner.localId); assert.equal(result.headers["cache-control"], "no-store");
    assert.equal((await request("call/fixtureScheduler", { data: {} })).status, 404);
    const hidden = await request("call/fixturePrivateError", { data: {} }); assert.equal(hidden.status, 500); assert(!hidden.text.includes("credentials"));
    assert.equal((await request("call/fixtureCall", { data: { large: "x".repeat(270000) } })).status, 413);
    assert.equal((await request("read", { targets: [{ path: ref.path }] })).status, 200);
    const denied = await request("read", { targets: [{ path: "players/" + other.localId }] }); assert.equal(denied.status, 403); assert(!denied.text.includes("must-not-leak"));
    assert.equal((await request("read", { targets: [{ collection: "serverConfig", filters: [{ field: ["secret"], op: "==", value: encode("guessed") }] }] })).status, 403, "Even empty private queries must be denied before reading");
    assert.equal((await request("write", { writes: [{ path: ref.path, kind: "update", data: encode({ gold: 999999 }) }] })).status, 403);
    assert.equal((await ref.get()).data().gold, 500);
    const before = await ref.get();
    const write = { path: ref.path, kind: "update", data: encode({ marchPercent: 50 }), transforms: [{ field: ["updatedAt"], kind: "timestamp" }] };
    assert.equal((await request("write", { writes: [write], checks: [{ path: ref.path, updateTime: before.body.updateTime }] })).status, 200);
    assert((await ref.get()).data().updatedAt instanceof Timestamp);
    assert.equal((await request("write", { writes: [write], checks: [{ path: ref.path, updateTime: before.body.updateTime }] })).status, 409);
    await ref.set({ ...scope, uid: owner.localId, gold: 500, scoutReports: { one: 1, two: 2 } });
    const deletion = { path: ref.path, kind: "set", merge: true, data: encode({}), transforms: [{ field: ["scoutReports", "one"], kind: "delete" }] };
    assert.equal((await request("write", { writes: [deletion] })).status, 200);
    assert.deepEqual((await ref.get()).data().scoutReports, { two: 2 });
    const client = new ClientData(db), identity = (await auth.session(signed.token)).auth;
    await assert.rejects(client.write(identity, [{ path: ref.path, kind: "update", data: encode({ marchPercent: 20 }) }, { path: "serverConfig/forbidden", kind: "set", data: encode({ enabled: true }) }]), { code: "permission-denied" });
    assert.equal((await ref.get()).data().marchPercent, undefined, "A denied batch must not commit an earlier allowed write");
    for (const input of [{ booleanValue: "true" }, { stringValue: {} }, { integerValue: "900719925474099312345" }, { timestampValue: "2026-02-31T00:00:00Z" }, { referenceValue: "projects/private" }]) assert.throws(() => decode(input));
    assert.deepEqual(decode(encode({ _documentReference: true, name: "fake" })), { _documentReference: true, name: "fake" });
    await new Promise(resolve => server.close(resolve));
    let releaseLate, lateFinished;
    const finished = new Promise(resolve => { lateFinished = resolve; });
    server = createGameServer({ store: db, auth, ownerUid: owner.localId, expiresAt: new Date(current + 60000).toISOString(), now: () => current,
      requestBudgetMs: 100, maxConcurrent: 1, routes: [{ name: "fixtureLate", kind: "callable", handler: async () => {
        try { await db.runTransaction(async tx => { await tx.get(ref); await new Promise(resolve => { releaseLate = resolve; }); tx.update(ref, { gold: 900 }); }); }
        finally { lateFinished(); }
      } }] });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    assert.equal((await request("call/fixtureLate", {})).status, 504);
    assert.equal((await request("read", { targets: [{ path: ref.path }] })).status, 429, "Timed-out work must retain its concurrency slot until it stops");
    releaseLate(); await finished; await new Promise(resolve => setImmediate(resolve));
    assert.equal((await ref.get()).data().gold, 500, "A transaction started before timeout must roll back a late write");
    await auth.signOut(signed.token);
    assert.equal((await request("read", { targets: [{ path: ref.path }] })).status, 401);
    current += 120000;
    assert.equal((await request("read", { targets: [{ path: ref.path }] })).status, 404);
    console.log("Local game HTTP: real session cookies, owner/LAN/expiry restriction, CSRF, trusted identity/IP, protected reads/writes, atomic permissions, optimistic versions, safe value decoding and private-error redaction passed.");
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
})().catch(error => { console.error("Local game HTTP integration failed:", error.message); process.exitCode = 1; });
