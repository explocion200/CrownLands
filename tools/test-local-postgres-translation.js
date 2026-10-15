"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { JWT } = require("../local-backend/node_modules/google-auth-library");
const { Store } = require("../local-backend/store");
const { Access } = require("../local-backend/access");
const { createPlatform } = require("../local-backend/platform");
const { createService } = require("../functions/chat-translation");
const T = require("../local-backend/chat-translation-rehearsal");
const { reserveProjectAllowance, initializeLocalAllowance } = require("./local-migration/translation_allowance");

(async () => {
  const source = new Store({ schema: "migration_translation_source_" + crypto.randomBytes(4).toString("hex") });
  const store = new Store({ schema: "migration_game_translate_" + crypto.randomBytes(6).toString("hex") });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-translation-")), providers = [];
  const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const serviceAccount = { type: "service_account", project_id: T.PROJECT, client_email: T.ACCOUNT,
    private_key_id: "a".repeat(40), private_key: keys.privateKey.export({ type: "pkcs8", format: "pem" }), token_uri: "https://oauth2.googleapis.com/token" };
  let clock = Date.parse("2026-10-15T12:00:00Z"), tokenCalls = 0, providerCalls = 0, tokenWait, fetchWait, onToken, onFetch, failProvider = false;
  const now = () => clock;
  const scope = (limit = 1000) => ({ version: 1, projectId: T.PROJECT, clientEmail: T.ACCOUNT, schema: store.schema, ownerUid: "synthetic-owner",
    reservationId: crypto.randomBytes(16).toString("hex"), month: new Date(now()).toISOString().slice(0, 7), characterLimit: limit, expiresAt: new Date(now() + 3600000).toISOString() });
  const fail = (code, message) => Object.assign(Error(message), { code });
  class FixtureJWT extends JWT {
    constructor(options) {
      super(options);
      this.transporter = { request: async opts => {
        tokenCalls++; assert.equal(String(opts.url), serviceAccount.token_uri); assert.equal(opts.timeout, 8000);
        assert.equal(opts.retry, false); assert.equal(opts.retryConfig.retry, 0); assert.equal(opts.maxRedirects, 0);
        const assertion = opts.data.get("assertion"), [header, body, signature] = assertion.split(".");
        assert(crypto.verify("RSA-SHA256", Buffer.from(header + "." + body), keys.publicKey, Buffer.from(signature, "base64url")));
        const claims = JSON.parse(Buffer.from(body, "base64url"));
        assert.equal(claims.iss, T.ACCOUNT); assert.equal(claims.scope, "https://www.googleapis.com/auth/cloud-translation");
        assert.equal(claims.aud, serviceAccount.token_uri); assert.equal(claims.sub, undefined);
        onToken?.(); if (tokenWait) await tokenWait;
        return { data: { access_token: "synthetic-token", expires_in: 3600, token_type: "Bearer" }, status: 200, headers: new Headers() };
      } };
    }
  }
  const fetchImpl = async (url, opts) => {
    providerCalls++; assert.equal(opts.redirect, "error"); assert.equal(opts.headers.authorization, "Bearer synthetic-token");
    assert.equal(opts.headers["x-goog-user-project"], T.PROJECT); assert.equal(opts.signal.aborted, false);
    const body = JSON.parse(opts.body); assert.equal(body.mimeType, "text/plain");
    onFetch?.(); if (fetchWait) await fetchWait;
    if (failProvider) throw Error("synthetic-sensitive-provider-detail");
    if (url.endsWith(":detectLanguage")) {
      assert.deepEqual(Object.keys(body).sort(), ["content", "mimeType"]);
      return { ok: true, json: async () => ({ languages: [{ languageCode: "es", confidence: 0.99 }] }) };
    }
    assert.deepEqual(Object.keys(body).sort(), ["contents", "mimeType", "model", "targetLanguageCode"]);
    assert.equal(body.model, `projects/${T.PROJECT}/locations/global/models/general/nmt`);
    return { ok: true, json: async () => ({ translations: body.contents.map(text => ({ translatedText: "translated " + text })) }) };
  };
  function provider(config, extra = {}) {
    const value = T.createReservedGoogleProvider({ store, scope: config, serviceAccount, now, fetchImpl, JWTClass: FixtureJWT, ...extra });
    providers.push(value); return value;
  }
  async function initialize(config) {
    const receipt = await reserveProjectAllowance({ db: source, scope: config, now });
    await initializeLocalAllowance({ store, scope: config, receipt, now }); return receipt;
  }
  const used = async config => (await store.doc(T.reservationPath(config)).get()).data().usedCharacters;
  try {
    execFileSync("python3", [path.join(__dirname, "local-migration/test_translation_preview.py")], { stdio: "pipe" });
    await source.initialize(); await store.initialize();
    const initial = scope(12);
    for (const patch of [{ schema: "live" }, { projectId: "other-project" }, { characterLimit: 1001 }, { characterLimit: 0 },
      { month: "2026-09" }, { extra: true }, { expiresAt: "2026-11-01T00:00:01Z" }, { expiresAt: new Date(now()).toISOString() }]) {
      assert.throws(() => T.validateScope({ ...initial, ...patch }, now()));
    }
    for (const patch of [{ type: "authorized_user" }, { project_id: "other-project" }, { client_email: "operator@example.com" },
      { token_uri: "https://example.com/token" }, { private_key_id: "bad" }]) assert.throws(() => provider(initial, { serviceAccount: { ...serviceAccount, ...patch } }));
    const file = path.join(temporary, "private.json"); fs.writeFileSync(file, JSON.stringify({ scope: initial, serviceAccount }), { mode: 0o600 });
    assert.equal(T.readConfiguration(file).scope.schema, store.schema);
    fs.chmodSync(file, 0o640); assert.throws(() => T.readConfiguration(file)); fs.chmodSync(file, 0o600);
    fs.symlinkSync(file, path.join(temporary, "link")); assert.throws(() => T.readConfiguration(path.join(temporary, "link")));
    const missing = provider(initial); await assert.rejects(missing(["hola"], "en")); assert.equal(tokenCalls, 0); assert.equal(providerCalls, 0);
    const receipts = await Promise.all([1, 2].map(() => reserveProjectAllowance({ db: source, scope: initial, now })));
    assert.deepEqual(receipts[0], receipts[1]); assert.equal((await source.doc("chatTranslationUsage/2026-10").get()).data().reservedCharacters, 12);
    await assert.rejects(reserveProjectAllowance({ db: source, scope: { ...initial, characterLimit: 13 }, now }), /review/);
    await initializeLocalAllowance({ store, scope: initial, receipt: receipts[0], now });
    const p = provider(initial);
    assert.deepEqual(await p.verifyReservation(), { usedCharacters: 0, characterLimit: 12 });
    assert.deepEqual(await p(["a😀b"], "en"), ["translated a😀b"]); assert.equal(await used(initial), 3);
    const detections = await p(["a😀b"], "en", "detect"); assert.equal(JSON.parse(detections[0]).language, "es"); assert.equal(await used(initial), 6);
    await initializeLocalAllowance({ store, scope: initial, receipt: receipts[0], now }); assert.equal(await used(initial), 6);
    p.stop(); const restarted = provider(initial); await restarted(["abc"], "en"); assert.equal(await used(initial), 9);
    failProvider = true;
    await assert.rejects(restarted(["abc"], "en"), error => error.message === "Private translation is unavailable.");
    failProvider = false; assert.equal(await used(initial), 12);
    const previousCalls = providerCalls; await assert.rejects(restarted(["a"], "en")); assert.equal(providerCalls, previousCalls);

    const concurrent = scope(4); await initialize(concurrent);
    const a = provider(concurrent), b = provider(concurrent);
    const outcome = await Promise.allSettled([a(["abc"], "en"), b(["abc"], "en")]);
    assert.equal(outcome.filter(item => item.status === "fulfilled").length, 1); assert.equal(await used(concurrent), 3);

    // A blocked provider keeps both execution slots; a third request cannot
    // reserve more characters while the first two remain unresolved.
    const bounded = scope(); await initialize(bounded); const busy = provider(bounded);
    let releaseBusy, bothEntered, arrivals = 0;
    fetchWait = new Promise(resolve => { releaseBusy = resolve; });
    const both = new Promise(resolve => { bothEntered = resolve; });
    onFetch = () => { if (++arrivals === 2) bothEntered(); };
    const held = [busy(["abc"], "en"), busy(["def"], "en")]; await both;
    await assert.rejects(busy(["third"], "en")); assert.equal(await used(bounded), 6);
    busy.stop(); releaseBusy(); assert((await Promise.allSettled(held)).every(value => value.status === "rejected"));
    fetchWait = onFetch = undefined;

    // Both an operator reservation and the existing game reserve the same source
    // document. Serializable conflicts cannot exceed the project-wide limit.
    await source.doc("chatTranslationUsage/2026-10").set({ reservedCharacters: 499990 });
    const last = await Promise.allSettled([reserveProjectAllowance({ db: source, scope: scope(10), now }),
      source.runTransaction(async tx => { const ref = source.doc("chatTranslationUsage/2026-10"), n = (await tx.get(ref)).data().reservedCharacters;
        if (n + 10 > 500000) throw Error("limit"); tx.update(ref, { reservedCharacters: n + 10 }); })]);
    assert.equal(last.filter(item => item.status === "fulfilled").length, 1);
    assert.equal((await source.doc("chatTranslationUsage/2026-10").get()).data().reservedCharacters, 500000);
    await source.doc("chatTranslationUsage/2026-10").set({ reservedCharacters: 10000 });

    // Existing shared service enforces authoritative source, visibility and free
    // cache hits when backed by PostgreSQL and the separately bounded provider.
    const cached = scope(); await initialize(cached); const cachedProvider = provider(cached);
    const id = "a".repeat(40), message = store.doc(`globalChat/fixture/messages/${id}`);
    await message.set({ text: "hola", visible: true, createdAtMs: now() });
    const service = createService({ db: store, now, provider: cachedProvider, fail, authorize: async (_tx, request) => {
      if (request.auth.uid !== cached.ownerUid) throw fail("permission-denied", "denied");
      return { messageCollection: "globalChat/fixture/messages", isVisible: value => value.visible === true };
    } });
    const request = { auth: { uid: cached.ownerUid }, data: { channel: "global", messageIds: [id], targetLanguage: "en" } };
    assert.equal((await service(request)).translations[0].text, "translated hola"); assert.equal(await used(cached), 4);
    await service(request); assert.equal(await used(cached), 4);
    await assert.rejects(service({ ...request, data: { ...request.data, text: "forged" } }), { code: "invalid-argument" });
    await assert.rejects(service({ ...request, auth: { uid: "another-owner" } }), { code: "permission-denied" });
    await message.update({ visible: false }); await assert.rejects(service(request)); assert.equal(await used(cached), 4);
    await store.runTransaction(async tx => {
      const access = new Access({ store, transaction: tx, auth: { uid: cached.ownerUid } });
      for (const target of [T.reservationPath(cached), "chatTranslationUsage/2026-10", "chatTranslationCache/private"]) {
        assert.equal(await access.canRead(target, {}), false); assert.equal(await access.canWrite(target, {}, {}), false);
      }
    });
    await message.update({ visible: true, text: "adios" });
    let release; fetchWait = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { onFetch = resolve; });
    const pending = service(request); await entered; await message.update({ visible: false }); release();
    await assert.rejects(pending); fetchWait = onFetch = undefined;

    const stopping = scope(); await initialize(stopping); const stopped = provider(stopping);
    tokenWait = new Promise(resolve => { release = resolve; });
    const tokenEntered = new Promise(resolve => { onToken = resolve; });
    const beforeStop = providerCalls, waiting = stopped(["abc"], "en"); await tokenEntered; stopped.stop(); release();
    await assert.rejects(waiting); assert.equal(providerCalls, beforeStop); assert.equal(await used(stopping), 3);
    tokenWait = onToken = undefined;
    await assert.rejects(stopped(["a"], "en"));

    const dbStopping = scope(); await initialize(dbStopping); const dbStopped = provider(dbStopping);
    const runTransaction = store.runTransaction.bind(store);
    let dbEntered; const inDatabase = new Promise(resolve => { dbEntered = resolve; });
    const dbWait = new Promise(resolve => { release = resolve; });
    store.runTransaction = async callback => { dbEntered(); await dbWait; return runTransaction(callback); };
    const afterDBWait = dbStopped(["abc"], "en"); await inDatabase; dbStopped.stop(); release();
    await assert.rejects(afterDBWait); store.runTransaction = runTransaction; assert.equal(await used(dbStopping), 0);

    const expiring = scope(); await initialize(expiring); const expired = provider(expiring);
    clock = Date.parse(expiring.expiresAt); await assert.rejects(expired(["abc"], "en")); assert.equal(await used(expiring), 0);
    clock -= 3600000;
    const tokenExpiring = scope(); await initialize(tokenExpiring); const expiringToken = provider(tokenExpiring);
    tokenWait = new Promise(resolve => { release = resolve; });
    const expiringTokenEntered = new Promise(resolve => { onToken = resolve; });
    const beforeExpiry = providerCalls, tokenPending = expiringToken(["abc"], "en"); await expiringTokenEntered;
    clock = Date.parse(tokenExpiring.expiresAt); release(); await assert.rejects(tokenPending); assert.equal(providerCalls, beforeExpiry);
    tokenWait = onToken = undefined; clock -= 3600000;
    const platform = createPlatform({ store, translation: { scope: scope(), serviceAccount, now, fetchImpl, JWTClass: FixtureJWT } });
    providers.push(platform.chatTranslationProvider); assert.equal(typeof platform.chatTranslationProvider, "function");
    assert.throws(() => platform.getApp().options.credential.getAccessToken(), { code: "failed-precondition" });
    assert.throws(() => platform.getMessaging().send(), { code: "failed-precondition" });
    assert.equal(createPlatform({ store }).chatTranslationProvider, undefined);
    console.log("Local translation: real PostgreSQL reservations, shared source limit, Unicode accounting, no reset/refund, independent-process concurrency, Google JWT/request contract, cache/access controls, private credential scope and stop/expiry fences passed. No external requests sent.");
  } finally {
    providers.forEach(value => value.stop());
    await source.pool.query(`DROP SCHEMA IF EXISTS ${source.schema} CASCADE`); await source.close();
    await store.pool.query(`DROP SCHEMA IF EXISTS ${store.schema} CASCADE`); await store.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error("Synthetic translation test failed:", error.stack); process.exitCode = 1; });
