"use strict";
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const assert = require("node:assert/strict"), crypto = require("node:crypto"), { performance } = require("node:perf_hooks");
const { Pool } = require("../local-backend/node_modules/pg"), { Store } = require("../local-backend/store");
const { ChatEvents, watchChat } = require("../local-backend/chat-events"), { ClientData } = require("../local-backend/client-data");
const S = require("../functions/social"), translation = require("../functions/chat-translation"), { operate } = require("./social-operator");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const db = new Store({ schema: "migration_game_social_" + crypto.randomBytes(4).toString("hex"), pool: new Pool({ host: "/var/run/postgresql", database: "crownlands_migration", max: 12 }) });
  const events = new ChatEvents(new Pool({ host: "/var/run/postgresql", database: "crownlands_migration", max: 1 }), db.schema), data = new ClientData(db), controllers = [];
  const scope = { resetGeneration: "fixture-social-realm", worldId: "fixture-world", realmShardId: "shard_0001" };
  const auth = uid => ({ uid, token: { email_verified: true } });
  const service = S.createService({ db, getRealm: () => scope });
  const call = (uid, input) => service.handler({ auth: auth(uid), data: { ...input, requestId: input.requestId || crypto.randomUUID() } });
  const watches = [];
  try {
    await db.initialize(); await events.start();
    await db.doc("realmConfig/current").set(scope); await db.doc(S.CONFIG).set({ enabled: true });
    const client = await db.pool.connect(); try { await require("./local-postgres-social-indexes").apply(client, db.schema); } finally { client.release(); }
    for (let i = 0; i < 50; i++) {
      await db.doc("players/p" + i).set({ ...scope, playerName: "Player " + i, gold: 500 });
      await db.doc(`socialAccounts/p${i}/signals/current`).set({ inbox: "initial" });
    }
    for (let i = 0; i < 25; i++) {
      const uids = ["p" + i, "p" + (i + 25)], id = S.pairId(...uids);
      await db.doc(S.pairPath(id)).set({ id, uids, blocks: {}, friend: { status: "accepted" }, conversation: { status: "accepted" }, sequence: 0 });
    }
    const deniedPaths = ["socialAccounts/p1/signals/current", S.pairPath(S.pairId("p1", "p26")), "socialReports/guess", "socialAccounts/p0"];
    for (const path of deniedPaths) await assert.rejects(data.read(auth("p0"), [{ path }]), { code: "permission-denied" });
    await assert.rejects(data.read(auth("p0"), [{ collection: "socialPairs", limit: 50 }]), { code: "permission-denied" });
    await assert.rejects(data.write(auth("p0"), [{ path: "socialAccounts/p0/signals/current", kind: "delete" }]), { code: "permission-denied" });
    // Stable-action fixture measures a small authoritative player transaction.
    const actions = async () => { const samples = []; for (let i = 0; i < 80; i++) { const t = performance.now(); await db.runTransaction(async tx => { const ref = db.doc("players/p49"), p = await tx.get(ref); tx.update(ref, { gold: p.data().gold + 1 }); }); samples.push(performance.now() - t); } return samples.sort((a,b) => a-b)[75]; };
    await actions(); const baseline = await actions();
    for (let i = 0; i < 50; i++) {
      const targets = [{ collection: `socialAccounts/p${i}/signals`, limit: 1 }], read = targets => data.read(auth("p" + i), targets, { partial: true });
      const initial = await read(targets), cursor = crypto.createHash("sha256").update(JSON.stringify(initial)).digest("hex"), controller = new AbortController(); controllers.push(controller);
      watches.push(watchChat({ events, targets, cursor, signal: controller.signal, holdMs: 15000, recheckMs: 10000, read }).then(result => ({ result, at: performance.now() })));
    }
    for (let i = 0; i < 100 && events.subscribers.size < 50; i++) await delay(10);
    assert.equal(events.subscribers.size, 50); await delay(100);
    assert.equal(db.pool.waitingCount, 0); assert.equal(db.pool.idleCount, db.pool.totalCount, "Held social updates consumed DB connections");
    const loaded = await actions();
    const sends = [], delivery = [];
    for (let i = 0; i < 25; i++) {
      const t = performance.now(); await call("p" + i, { action: "send", peerUid: "p" + (i + 25), text: "Synthetic private dispatch" }); sends.push(performance.now() - t);
      delivery.push((await watches[i + 25]).at - t);
    }
    await Promise.all(watches);
    assert(sends.every(ms => ms < 300)); assert(delivery.every(ms => ms < 1000));
    assert(loaded <= Math.max(baseline * 1.1, baseline + 3), "Idle social updates regressed action latency beyond timing noise");
    // Concurrent replay, send/block race and account-wide rate limit.
    const replay = { action: "send", peerUid: "p26", text: "Single replay", requestId: crypto.randomUUID() };
    const repeated = await Promise.all(Array.from({ length: 6 }, () => call("p25", replay)));
    assert.equal(new Set(repeated.map(r => r.messageId)).size, 1);
    const id = S.pairId("p0", "p25"), msg = (await call("p25", { action: "history", conversationId: id })).messages[0];
    const report = await call("p25", { action: "report", conversationId: id, messageId: msg.id, reason: "spam" });
    const evidenceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "social-evidence-"));
    try {
      const output = path.join(evidenceDirectory, "report.json");
      await operate(db, { action: "review", reportId: report.reportId, output });
      assert.equal(fs.statSync(output).mode & 0o777, 0o600);
      assert.equal(JSON.parse(fs.readFileSync(output)).evidence.length, 1);
      await assert.rejects(operate(db, { action: "review", reportId: report.reportId, output }));
    } finally { fs.rmSync(evidenceDirectory, { recursive: true }); }
    await operate(db, { action: "restrict", reportId: report.reportId, hours: 24, reason: "Synthetic operator restriction", epoch: "test" });
    await assert.rejects(call("p0", { action: "send", peerUid: "p25", text: "restricted" }), { code: "permission-denied" });
    assert.equal((await operate(db, { action: "list" })).reports.length, 0);
    const providerCalls = [];
    const translate = translation.createService({ db, authorize: service.authorizeTranslation, fail: (code, message) => Object.assign(Error(message), { code }), provider: async (texts) => { providerCalls.push(texts); return texts.map(() => "Translated fixture"); } });
    const request = { auth: auth("p25"), data: { channel: "private", conversationId: id, messageIds: [msg.id], targetLanguage: "es" } };
    assert.equal((await translate(request)).translations[0].text, "Translated fixture");
    await translate(request); assert.equal(providerCalls.length, 1);
    await assert.rejects(translate({ ...request, auth: auth("p49") }), { code: "permission-denied" });
    await assert.rejects(translate({ ...request, data: { ...request.data, operation: "detect" } }), { code: "invalid-argument" });
    assert(providerCalls.every(texts => texts.every(text => !text.includes("p0"))));
    const racing = await Promise.allSettled([
      call("p28", { action: "send", peerUid: "p3", text: "Synthetic race" }),
      call("p3", { action: "block", peerUid: "p28", enabled: true }),
    ]);
    assert.equal(racing[1].status, "fulfilled");
    await assert.rejects(call("p28", { action: "send", peerUid: "p3", text: "After block" }), { code: "permission-denied" });
    assert.equal((await call("p3", { action: "unread" })).count, 0);
    const pair = (await db.doc(S.pairPath(S.pairId("p3", "p28"))).get()).data();
    assert.equal(pair.blocks.p3, true); assert.equal(pair.conversation.status, "none");
    // Backend signals are useful with Global + Clan and remain private.
    const subscriber = events.subscribe(["globalChat/fixture/messages", "clans/fixture/messages", "socialAccounts/p0/signals"]); subscriber.close();
    assert.throws(() => events.subscribe(["socialAccounts/p0/signals", "socialAccounts/p0/signals"]));
    console.log(JSON.stringify({ connectedSessions: 50, sendP95Ms: Math.round(sends.sort((a,b)=>a-b)[23]), deliveryP95Ms: Math.round(delivery.sort((a,b)=>a-b)[23]), actionBaselineP95Ms: +baseline.toFixed(2), actionWithIdleSocialP95Ms: +loaded.toFixed(2), privateAccess: true, operatorRestrictions: true, manualTranslation: true }));
  } finally {
    controllers.forEach(controller => controller.abort()); await Promise.allSettled(watches); await events.close();
    await db.pool.query(`DROP SCHEMA ${db.schema} CASCADE`); await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
