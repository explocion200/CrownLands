"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Store } = require("../local-backend/store");
const { AuthService } = require("../local-backend/auth");
const { AuthMailDispatcher, ResendRehearsalSender, message } = require("../local-backend/auth-mail");
const { sendOwnerResetTest } = require("./local-migration/rehearse_account_email");

(async () => {
  const schema = "migration_auth_mail_test_" + crypto.randomBytes(6).toString("hex"), store = new Store({ schema });
  const account = { localId: "synthetic-account", email: "fixture@example.test", emailVerified: false };
  const auth = new AuthService({ store, rateKey: crypto.randomBytes(32) });
  const requests = [], accepted = new Map(); let nextResponse, blockRequest, enterRequest;
  const sender = new ResendRehearsalSender({ apiKey: "re_synthetic_fixture_key", allowedRecipients: [account.email], fetchImpl: async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails"); assert.equal(options.redirect, "error");
    assert.equal(options.method, "POST"); assert.equal(options.headers.Authorization, "Bearer re_synthetic_fixture_key");
    const key = options.headers["Idempotency-Key"]; requests.push({ key, body: options.body });
    if (enterRequest) enterRequest();
    if (blockRequest) await blockRequest;
    if (nextResponse) { const effect = nextResponse; nextResponse = null; return effect(); }
    if (accepted.has(key)) assert.equal(accepted.get(key).body, options.body);
    else accepted.set(key, { id: crypto.randomUUID(), body: options.body });
    return new Response(JSON.stringify({ id: accepted.get(key).id }), { status: 200 });
  } });
  const dispatcher = new AuthMailDispatcher({ store, sender });
  const issue = async (purpose = "resetPassword") => auth.transaction(async client => {
    const body = (await client.query(`SELECT body FROM ${schema}.accounts WHERE uid=$1 FOR UPDATE`, [account.localId])).rows[0].body;
    return auth.queueEmailAction(client, body, purpose);
  });
  const retryNow = id => store.pool.query(`UPDATE ${schema}.auth_mail_delivery SET next_attempt_at=clock_timestamp()-interval '1 second',lease_until=NULL WHERE id=$1`, [id]);
  const status = async id => (await store.pool.query(`SELECT m.status,m.action_url,d.payload,d.attempts,d.last_code FROM ${schema}.auth_mail m
    LEFT JOIN ${schema}.auth_mail_delivery d ON d.id=m.id WHERE m.id=$1`, [id])).rows[0];
  try {
    await store.initialize(); await auth.initialize(); await dispatcher.initialize();
    await store.pool.query(`INSERT INTO ${schema}.accounts(uid,body) VALUES($1,$2)`, [account.localId, account]);
    // Two workers cannot deliver the same claimed row concurrently.
    const verification = await issue("verifyEmail");
    let entered; const entering = new Promise(resolve => { entered = resolve; }); enterRequest = entered;
    let unblock; blockRequest = new Promise(resolve => { unblock = resolve; });
    const first = dispatcher.deliverOne(); await entering;
    assert.deepEqual(await new AuthMailDispatcher({ store, sender }).deliverOne(), { state: "idle" });
    unblock(); blockRequest = null; enterRequest = null;
    assert.deepEqual(await first, { state: "accepted" });
    const saved = await status(verification);
    assert.equal(saved.status, "accepted"); assert.equal(saved.action_url, ""); assert.equal(saved.payload, null);
    const verifyPayload = JSON.parse(requests.at(-1).body);
    assert.equal(verifyPayload.subject, "Verify your Crownlands email");
    const verifyLink = verifyPayload.text.split("\n").find(line => line.startsWith("https://"));
    await auth.finishEmailAction(new URL(verifyLink).searchParams.get("token"), "verifyEmail");
    assert.equal((await store.pool.query(`SELECT body->>'emailVerified' AS verified FROM ${schema}.accounts`)).rows[0].verified, "true");

    // Crash after provider acceptance but before the local acknowledgement.
    const crash = await issue(); const claimed = await dispatcher.claim();
    assert.equal(claimed.id, crash); const before = accepted.size;
    await sender.send(claimed);
    await retryNow(crash);
    assert.deepEqual(await new AuthMailDispatcher({ store, sender }).deliverOne(), { state: "accepted" });
    assert.equal(accepted.size, before + 1); assert.equal((await status(crash)).attempts, 2);
    const duplicated = requests.filter(item => item.key.endsWith(crash));
    assert.equal(duplicated.length, 2); assert.equal(duplicated[0].body, duplicated[1].body);

    // Transient/quota/network failures retry the same frozen message, without
    // persisting provider response messages, recipient text or secret payloads.
    const transient = await issue();
    nextResponse = () => new Response("private-provider-details", { status: 429, headers: { "Retry-After": "60" } });
    assert.deepEqual(await dispatcher.deliverOne(), { state: "retry" });
    assert.equal((await status(transient)).last_code, "provider-busy");
    const waiting = (await store.pool.query(`SELECT next_attempt_at>clock_timestamp()+interval '50 seconds' AS waits FROM ${schema}.auth_mail_delivery WHERE id=$1`, [transient])).rows[0];
    assert.equal(waiting.waits, true); assert.deepEqual(await dispatcher.deliverOne(), { state: "idle" });
    await retryNow(transient); nextResponse = () => { throw Error("secret-request-details"); };
    assert.deepEqual(await dispatcher.deliverOne(), { state: "retry" });
    assert.equal((await status(transient)).last_code, "network");
    await retryNow(transient); assert.deepEqual(await dispatcher.deliverOne(), { state: "accepted" });

    // Superseded/consumed/expired actions must not be sent or retain URL tokens.
    const old = await issue(); await dispatcher.claim(); const newest = await issue();
    const oldRequests = requests.length;
    assert.deepEqual(await dispatcher.deliverOne(), { state: "accepted" });
    assert.equal(requests.length, oldRequests + 1); assert.ok(requests.at(-1).key.endsWith(newest));
    assert.equal((await status(old)).payload, null); assert.equal((await status(old)).action_url, "");
    const consumed = await issue();
    const consumedUrl = (await status(consumed)).action_url;
    await auth.finishEmailAction(new URL(consumedUrl).searchParams.get("token"), "resetPassword", "synthetic-new-password");
    const count = requests.length;
    assert.deepEqual(await dispatcher.deliverOne(), { state: "discarded" }); assert.equal(requests.length, count);
    assert.equal((await status(consumed)).action_url, "");
    const expired = await issue();
    await store.pool.query(`UPDATE ${schema}.auth_mail SET created_at=clock_timestamp()-interval '2 hours' WHERE id=$1`, [expired]);
    assert.deepEqual(await dispatcher.deliverOne(), { state: "discarded" }); assert.equal(requests.length, count);

    const disabled = await issue();
    await store.pool.query(`UPDATE ${schema}.accounts SET body=jsonb_set(body,'{disabled}','true')`);
    assert.deepEqual(await dispatcher.deliverOne(), { state: "discarded" }); assert.equal((await status(disabled)).action_url, "");
    await store.pool.query(`UPDATE ${schema}.accounts SET body=body-'disabled'`);
    const rejected = await issue(); nextResponse = () => new Response("secret-key-details", { status: 403 });
    assert.deepEqual(await dispatcher.deliverOne(), { state: "failed" });
    assert.equal((await status(rejected)).last_code, "provider-rejected"); assert.equal((await status(rejected)).payload, null);
    const exhausted = await issue(); await dispatcher.claim();
    await store.pool.query(`UPDATE ${schema}.auth_mail_delivery SET attempts=8 WHERE id=$1`, [exhausted]); await retryNow(exhausted);
    assert.deepEqual(await dispatcher.deliverOne(), { state: "discarded" }); assert.equal((await status(exhausted)).status, "attempts-exhausted");

    // A late completion cannot overwrite a new lease or clear its message.
    const late = await issue();
    const slow = new AuthMailDispatcher({ store, sender: { send: async () => {
      await store.pool.query(`UPDATE ${schema}.auth_mail_delivery SET lease_token=$2 WHERE id=$1`, [late, crypto.randomUUID()]); return crypto.randomUUID();
    } } });
    assert.deepEqual(await slow.deliverOne(), { state: "lease-lost" }); assert.equal((await status(late)).status, "pending");
    await retryNow(late); assert.deepEqual(await dispatcher.deliverOne(), { state: "accepted" });

    // Invalid action destinations and unauthorized recipients fail before HTTP.
    const valid = { id: crypto.randomUUID(), recipient: account.email, purpose: "resetPassword",
      action_url: "https://playcrownlands.com/local-auth/action?mode=resetPassword&token=" + crypto.randomBytes(32).toString("base64url") };
    for (const change of [ { recipient: "first@example.test,second@example.test" }, { purpose: "arbitrary" },
      { action_url: valid.action_url.replace("playcrownlands.com", "attacker.example") }, { action_url: valid.action_url + "&token=extra" } ]) {
      assert.throws(() => message({ ...valid, ...change }, "https://playcrownlands.com"), { code: "invalid-message" });
    }
    const disallowed = message({ ...valid, recipient: "blocked@example.test" }, "https://playcrownlands.com");
    const unchanged = requests.length;
    await assert.rejects(sender.send({ id: valid.id, payload: disallowed.payload }), { code: "recipient-blocked" }); assert.equal(requests.length, unchanged);
    const malformed = new ResendRehearsalSender({ apiKey: "re_synthetic_fixture_key", allowedRecipients: [account.email],
      fetchImpl: async () => new Response("private-not-json", { status: 200 }) });
    await assert.rejects(malformed.send({ id: valid.id, payload: message(valid, "https://playcrownlands.com").payload }), { code: "invalid-response" });
    const timeout = new ResendRehearsalSender({ apiKey: "re_synthetic_fixture_key", allowedRecipients: [account.email], timeoutMs: 20,
      fetchImpl: async (_, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(Error("secret-abort")), { once: true })) });
    await assert.rejects(timeout.send({ id: valid.id, payload: message(valid, "https://playcrownlands.com").payload }), { code: "network" });
    const ownerStore = new Store({ schema: "migration_auth_preview_" + crypto.randomBytes(6).toString("hex") });
    try {
      await ownerStore.initialize();
      const ownerAuth = new AuthService({ store: ownerStore, rateKey: crypto.randomBytes(32) }); await ownerAuth.initialize();
      await ownerStore.pool.query(`INSERT INTO ${ownerStore.schema}.accounts(uid,body) VALUES($1,$2)`, [account.localId, { ...account, emailVerified: true }]);
      const options = { store: ownerStore, auth: ownerAuth, dispatcher: new AuthMailDispatcher({ store: ownerStore, sender }),
        expectedEmail: account.email, expiresAt: new Date(Date.now() + 60000).toISOString() };
      await assert.rejects(sendOwnerResetTest({ ...options, expectedEmail: "someone-else@example.test" }), /approved recipient/);
      await assert.rejects(sendOwnerResetTest({ ...options, expiresAt: "2000-01-01T00:00:00Z" }), /unexpired/);
      const receipt = await sendOwnerResetTest(options); assert.equal(receipt.deliveryConfirmed, false); assert.equal(receipt.purpose, "resetPassword");
      await ownerAuth.requestPasswordReset(account.email, "fixture-next-request");
      await assert.rejects(sendOwnerResetTest(options), /pending account email/);
    } finally { await ownerStore.pool.query(`DROP SCHEMA IF EXISTS ${ownerStore.schema} CASCADE`); await ownerStore.close(); }
    execFileSync("python3", [path.join(__dirname, "local-migration/test_auth_action_preview.py")], { stdio: "inherit" });
    console.log("Account mail: synthetic-only provider, concurrent workers, crash-safe idempotency, retry/expiry fences, one-use actions, stale leases, recipient allowlist, controlled owner-test scope and private error handling passed. No real emails sent.");
  } finally { await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await store.close(); }
})().catch(() => { console.error("Account email rehearsal integration failed; private diagnostics suppressed."); process.exitCode = 1; });
