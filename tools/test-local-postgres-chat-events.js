"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto"), http = require("node:http");
const { Pool } = require("../local-backend/node_modules/pg");
const { Store, encode } = require("../local-backend/store");
const { AuthService, secret } = require("../local-backend/auth");
const { createGameServer } = require("../local-backend/game-http");
const { ChatEvents, channel, topic } = require("../local-backend/chat-events");
const { COOKIE, CSRF } = require("../local-backend/auth-http");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test) { for (let i = 0; i < 200; i++) { if (await test()) return; await wait(10); } throw Error("Fixture wait expired"); }
(async () => {
  const schema = "migration_game_chat_" + crypto.randomBytes(5).toString("hex"), db = new Store({ schema });
  const events = new ChatEvents(new Pool({ database: "crownlands_migration", host: "/var/run/postgresql", max: 1 }), schema);
  const auth = new AuthService({ store: db, rateKey: crypto.randomBytes(32) }), csrf = secret();
  const scope = { resetGeneration: "realm-2026-10", worldId: "main-realm-2026-10", realmShardId: "shard_0001" };
  const owner = { localId: "fixture-owner", email: "owner@example.test", emailVerified: true, providerUserInfo: [{ providerId: "google.com", rawId: "fixture-google" }] };
  const globalPath = "globalChat/realm-2026-10--shard_0001/messages", clanPath = "clans/fixture-clan/messages";
  const target = collection => ({ collection, filters: Object.entries({ ...scope, status: "visible" }).map(([key, value]) => ({ field: [key], op: "==", value: encode(value) })), orders: [{ field: ["createdAtMs"], direction: "desc" }], limit: 80 });
  let server, signed;
  const requests = new Set();
  try {
    await db.initialize(); await auth.initialize(); await events.start();
    await db.pool.query(`INSERT INTO ${schema}.accounts(uid,body) VALUES($1,$2)`, [owner.localId, owner]);
    signed = await auth.transaction(client => auth.newSession(client, owner, "google.com"));
    await db.doc("realmConfig/current").set(scope);
    await db.doc("players/" + owner.localId).set({ ...scope, uid: owner.localId, clanId: "fixture-clan" });
    await db.doc("clans/fixture-clan").set({ ...scope, status: "active" });
    await db.doc("clans/fixture-clan/members/" + owner.localId).set({ ...scope, uid: owner.localId, status: "active" });
    server = createGameServer({ store: db, auth, routes: [{ kind: "callable", name: "fixtureAction", handler: async () => ({ ok: true }) }],
      ownerUid: owner.localId, expiresAt: new Date(Date.now() + 600000).toISOString(), chatEvents: events, chatHoldMs: 1500, chatRecheckMs: 350, maxConcurrent: 2 });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const headers = { Host: "playcrownlands.com", Origin: auth.origin, "Content-Type": "application/json", Cookie: `${CSRF}=${csrf}; ${COOKIE}=${signed.token}`, "X-Crownlands-CSRF": csrf, "X-Crownlands-Client-IP": "127.0.0.1" };
    function request(input, extra = {}, route = "watch-chat") {
      let req;
      const promise = new Promise((resolve, reject) => {
        req = http.request({ hostname: "127.0.0.1", port: server.address().port, path: "/api/local-game/v1/" + route, method: "POST", headers: { ...headers, ...extra } }, response => {
          let text = ""; response.setEncoding("utf8"); response.on("data", chunk => text += chunk);
          response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(text), text }));
        });
        requests.add(req); req.on("error", reject); req.on("close", () => requests.delete(req)); req.end(JSON.stringify(input));
      });
      promise.abort = () => req.destroy(); return promise;
    }
    const targets = [target(globalPath), target(clanPath)];
    for (const extra of [{ Origin: "https://attacker.test" }, { "X-Crownlands-CSRF": secret() }, { Cookie: `${CSRF}=${csrf}` }]) assert([401,403].includes((await request({ targets }, extra)).status));
    assert.equal((await request({ targets: [{ path: "players/private" }] })).status, 400);
    assert.equal((await request({ targets: [...targets, targets[0]] })).status, 400);
    assert.equal((await request({ targets: [{ ...targets[0], limit: 1000 }] })).status, 400);
    assert.equal((await request({ targets, cursor: "bad" })).status, 400);
    const denied = await request({ targets: [target("clans/other/messages")] });
    assert.equal(denied.status, 200); assert.equal(denied.body.result.results[0].error.code, "permission-denied");
    let initial = (await request({ targets })).body.result; assert(initial.results.every(result => !result.documents.length));
    let pending = request({ targets, cursor: initial.cursor }); await until(() => events.subscribers.size === 1);
    const sent = performance.now();
    await db.doc(globalPath + "/message").set({ ...scope, text: "Synthetic chat", status: "visible", createdAtMs: Date.now() });
    let update = await pending; const deliveryMs = performance.now() - sent;
    assert.equal(update.status, 200); assert.equal(update.body.result.results[0].documents.length, 1);
    assert(deliveryMs < 1000, "Committed chat waited for the ordinary 1.5-second polling interval");
    initial = update.body.result;

    // A rolled-back database notification cannot wake the listener or expose a message.
    const subscription = events.subscribe([globalPath]), version = subscription.version;
    const connection = await db.pool.connect();
    try { await connection.query("BEGIN"); await connection.query("SELECT pg_notify($1,$2)", [channel(schema), topic(globalPath)]); await connection.query("ROLLBACK"); }
    finally { connection.release(); }
    await wait(80); assert.equal(subscription.version, version); subscription.close();

    pending = request({ targets, cursor: initial.cursor }); await until(() => events.subscribers.size === 1);
    await db.doc(globalPath + "/message").update({ text: "Authoritative edit" });
    update = await pending; assert.equal(update.body.result.results[0].documents[0].body.fields.text.stringValue, "Authoritative edit"); initial = update.body.result;
    pending = request({ targets, cursor: initial.cursor }); await until(() => events.subscribers.size === 1);
    await db.doc(globalPath + "/message").delete();
    update = await pending; assert.equal(update.body.result.results[0].documents.length, 0); initial = update.body.result;

    // Two held requests use no action admission slots; a third is bounded.
    const held = [request({ targets, cursor: initial.cursor }), request({ targets, cursor: initial.cursor })];
    await until(() => events.subscribers.size === 2);
    assert.equal((await request({ targets, cursor: initial.cursor })).status, 429);
    assert.equal((await request({ data: {} }, {}, "call/fixtureAction")).status, 200);
    assert.equal(db.pool.waitingCount, 0); assert.equal(db.pool.idleCount, db.pool.totalCount, "Held chat retained a database connection");
    for (const item of held) { item.catch(() => {}); item.abort(); }
    await until(() => events.subscribers.size === 0);

    // Membership revocation is rechecked even without a new chat message.
    pending = request({ targets, cursor: initial.cursor }); await until(() => events.subscribers.size === 1);
    await db.doc("clans/fixture-clan/members/" + owner.localId).update({ status: "removed" });
    update = await pending; assert.equal(update.body.result.results[1].error.code, "permission-denied");
    assert(!update.text.includes("Synthetic chat"));

    // Reconnect recovers a notification missed while the listener was down.
    const globalTargets = [target(globalPath)]; initial = (await request({ targets: globalTargets })).body.result;
    pending = request({ targets: globalTargets, cursor: initial.cursor }); await until(() => events.subscribers.size === 1);
    const pid = events.client.processID;
    await db.pool.query("SELECT pg_terminate_backend($1)", [pid]); await until(() => !events.client);
    await db.doc(globalPath + "/reconnect").set({ ...scope, text: "Recovered", status: "visible", createdAtMs: Date.now() });
    update = await pending; assert.equal(update.body.result.results[0].documents.length, 1);
    await until(() => events.client && events.client.processID !== pid);
    initial = update.body.result;
    pending = request({ targets: globalTargets, cursor: initial.cursor }); await until(() => events.subscribers.size === 1);
    await auth.signOut(signed.token); update = await pending; assert.equal(update.status, 401);
    await until(() => events.subscribers.size === 0);
    console.log(JSON.stringify({ deliveryMs: Math.round(deliveryMs), committedOnly: true, editsAndRemoval: true, authorization: true, boundedConnections: true, reconnect: true, sessionRevocation: true }));
  } finally {
    for (const req of requests) req.destroy();
    await events.close(); if (server) await new Promise(resolve => server.close(resolve));
    await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
