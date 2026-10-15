"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const { AuthService, secret } = require("../local-backend/auth");

(async () => {
  const schema = "migration_auth_" + crypto.randomBytes(6).toString("hex"), store = new Store({ schema });
  const hashConfig = { algorithm: "SCRYPT", signerKey: "jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==", saltSeparator: "Bw==", rounds: 8, memoryCost: 14 };
  let googleRequest, googleSub = "fixture-google-subject", googleEmail = "same-address@example.test", wrongNonce = false;
  const googleClient = {
    generateAuthUrl: options => { googleRequest = options; return "https://accounts.google.com/fixture?state=" + options.state; },
    getToken: async options => { assert.equal(typeof options.codeVerifier, "string"); return { tokens: { id_token: "synthetic" } }; },
    verifyIdToken: async options => { assert.equal(options.audience, "fixture-client"); return { getPayload: () => ({ sub: googleSub, email_verified: true,
      email: googleEmail, nonce: wrongNonce ? "wrong" : googleRequest.nonce }) }; },
  };
  const service = new AuthService({ store, hashConfig, google: { clientId: "fixture-client", clientSecret: "fixture-secret" }, googleClient, rateKey: crypto.randomBytes(32) });
  try {
    await store.initialize(); await service.initialize();
    const passwordAccount = { localId: "original-firebase-uid", email: "password@example.test", emailVerified: true,
      passwordHash: "lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==", salt: "42xEC+ixf3L2lw==",
      providerUserInfo: [{ providerId: "password" }] };
    const googleAccount = { localId: "original-google-uid", email: "same-address@example.test", emailVerified: true,
      providerUserInfo: [{ providerId: "google.com", rawId: "fixture-google-subject" }] };
    await store.pool.query(`INSERT INTO ${schema}.accounts(uid,body) VALUES($1,$2),($3,$4)`, [passwordAccount.localId, passwordAccount, googleAccount.localId, googleAccount]);
    await assert.rejects(service.passwordSignIn(passwordAccount.email, "wrong-password", "fixture-ip"), { code: "auth/invalid-credential" });
    const signed = await service.passwordSignIn(passwordAccount.email, "user1password", "fixture-ip");
    assert.equal(signed.user.uid, passwordAccount.localId);
    assert.equal((await service.session(signed.token)).auth.uid, passwordAccount.localId);
    assert.equal((await service.session(signed.token)).auth.token.firebase.sign_in_provider, "password");
    const migrated = (await store.pool.query(`SELECT body FROM ${schema}.accounts WHERE uid=$1`, [passwordAccount.localId])).rows[0].body;
    assert.ok(migrated.localPassword); assert.equal(migrated.passwordHash, undefined); assert.equal(migrated.salt, undefined);
    assert.equal((await service.passwordSignIn(passwordAccount.email, "user1password", "fixture-ip")).user.uid, passwordAccount.localId);
    assert.equal(await service.session("malformed"), null);
    await service.signOut(signed.token); assert.equal(await service.session(signed.token), null);
    const beforeReset = await service.passwordSignIn(passwordAccount.email, "user1password", "fixture-ip");
    assert.deepEqual(await service.requestPasswordReset("unknown@example.test", "fixture-ip"), { accepted: true });
    assert.deepEqual(await service.requestPasswordReset(passwordAccount.email, "fixture-ip"), { accepted: true });
    const outbox = (await store.pool.query(`SELECT action_url FROM ${schema}.auth_mail`)).rows;
    assert.equal(outbox.length, 1);
    const resetToken = new URL(outbox[0].action_url).searchParams.get("token");
    await service.finishEmailAction(resetToken, "resetPassword", "new-synthetic-password");
    await assert.rejects(service.finishEmailAction(resetToken, "resetPassword", "new-synthetic-password"), { code: "auth/invalid-action-code" });
    assert.equal(await service.session(beforeReset.token), null);
    assert.equal((await service.passwordSignIn(passwordAccount.email, "new-synthetic-password", "fixture-ip")).user.uid, passwordAccount.localId);
    const binding = secret();
    await service.googleStart(binding);
    await assert.rejects(service.googleFinish({ state: googleRequest.state, binding: secret(), code: "fixture-code" }), { code: "auth/invalid-credential" });
    const googleSigned = await service.googleFinish({ state: googleRequest.state, binding, code: "fixture-code" });
    assert.equal(googleSigned.user.uid, googleAccount.localId);
    await assert.rejects(service.googleFinish({ state: googleRequest.state, binding, code: "fixture-code" }), { code: "auth/invalid-credential" });
    await service.googleStart(binding); wrongNonce = true;
    await assert.rejects(service.googleFinish({ state: googleRequest.state, binding, code: "fixture-code" }), { code: "auth/invalid-credential" });
    wrongNonce = false; googleSub = "different-subject-same-email";
    await service.googleStart(binding);
    await assert.rejects(service.googleFinish({ state: googleRequest.state, binding, code: "fixture-code" }), { code: "auth/migration-account-unavailable" });
    await service.addPassword(googleSigned.token, "linked-synthetic-password");
    assert.equal((await service.passwordSignIn(googleAccount.email, "linked-synthetic-password", "fixture-ip")).user.uid, googleAccount.localId);
    await assert.rejects(service.createPasswordAccount("new@example.test", "test-long-password", "fixture-ip"), { code: "auth/operation-not-allowed" });
    service.allowRegistration = true;
    await service.googleStart(binding);
    await assert.rejects(service.googleFinish({ state: googleRequest.state, binding, code: "fixture-code" }), { code: "auth/account-exists-with-different-credential" });
    googleEmail = "new-google@example.test";
    await service.googleStart(binding);
    const newGoogle = await service.googleFinish({ state: googleRequest.state, binding, code: "fixture-code" });
    assert.notEqual(newGoogle.user.uid, googleAccount.localId);
    await service.googleStart(binding);
    assert.equal((await service.googleFinish({ state: googleRequest.state, binding, code: "fixture-code" })).user.uid, newGoogle.user.uid);
    await service.googleStart(binding, newGoogle.token);
    await service.signOut(newGoogle.token);
    await assert.rejects(service.googleFinish({ state: googleRequest.state, binding, code: "fixture-code" }), { code: "auth/user-token-expired" });
    // Revocation during password hashing must be rechecked inside the account lock.
    const raceSignIn = await service.createPasswordAccount("race@example.test", "fixture-password-long", "new-ip");
    await service.signOut(raceSignIn.token);
    await assert.rejects(service.addPassword(raceSignIn.token, "another-fixture-password"), { code: "auth/user-mismatch" });
    await service.rateLimit("fixture", "one", 1);
    await assert.rejects(service.rateLimit("fixture", "one", 1), { code: "auth/too-many-requests" });
    await store.pool.query(`UPDATE ${schema}.accounts SET body=jsonb_set(body,'{disabled}','true'::jsonb) WHERE uid=$1`, [googleAccount.localId]);
    assert.equal(await service.session(googleSigned.token), null);
    console.log("Local auth: preserved UIDs/provider subjects, imported-password upgrade, session revocation, one-use resets, OAuth binding/nonce/replay defenses, no email-only linking and disabled-account/rate-limit enforcement passed.");
  } finally {
    await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await store.close();
  }
})().catch(error => { console.error("Local authentication integration failed:", error.message); process.exitCode = 1; });
