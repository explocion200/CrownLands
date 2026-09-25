"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { signUpVerifiedPlayer } = require("./auth-fixtures");
const release = require("../release-config.json");
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST, firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!authHost || !firestoreHost || !process.env.FIREBASE_EMULATOR_HUB) throw new Error("Local Auth, Firestore and Functions emulators are required.");
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore(), adminAuth = getAuth();
const authRoot = `http://${authHost}/identitytoolkit.googleapis.com/v1`;
async function authCall(action, body) {
  const response = await fetch(`${authRoot}/accounts:${action}?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert(response.ok, `Auth emulator ${action} failed (${response.status}).`);
  return response.json();
}
async function main() {
  const email = `email-auth-${randomUUID()}@example.test`, password = "Emulator password 123";
  const created = await authCall("signUp", { email, password, returnSecureToken: true });
  const hub = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`).then(r => r.json());
  const call = async (name, token, data = {}) => {
    const response = await fetch(`http://${hub.functions.host}:${hub.functions.port}/${projectId}/us-central1/${name}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }),
    });
    return response.json();
  };
  for (const name of ["getRealmInfo", "getCommonGearStatus", "joinGameServer", "sendChatMessage"]) {
    const result = await call(name, created.idToken);
    assert.equal(result.error?.status, "PERMISSION_DENIED", `${name} did not reject unverified email.`);
    assert.equal(result.error?.details?.reason, "email-verification-required");
  }
  assert.equal((await db.doc(`players/${created.localId}`).get()).exists, false, "Unverified signup created a player.");
  const playerPath = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/players/${created.localId}`;
  const read = token => fetch(playerPath, { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await read(created.idToken)).status, 403);
  const write = await fetch(playerPath, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${created.idToken}` }, body: JSON.stringify({ fields: { playerName: { stringValue: "Unverified" } } }) });
  assert.equal(write.status, 403);
  await adminAuth.updateUser(created.localId, { emailVerified: true });
  const fresh = await authCall("signInWithPassword", { email, password, returnSecureToken: true });
  assert.equal(fresh.localId, created.localId);
  // The old token must remain blocked until refreshed even after verification.
  assert.equal((await read(created.idToken)).status, 403);
  await db.doc(`players/${created.localId}`).set({ playerName: "Original ruler", gold: 123456, playerFlag: { primary: "#ffffff" }, ...release });
  assert.equal((await read(fresh.idToken)).status, 200);
  assert(!(await call("getRealmInfo", fresh.idToken)).error);

  // Linking the current token keeps the verified Google identity and all game data.
  const googleEmail = `google-link-${randomUUID()}@example.test`;
  const google = await adminAuth.createUser({ email: googleEmail, emailVerified: true });
  await adminAuth.updateUser(google.uid, { providerToLink: { providerId: "google.com", uid: `google-${randomUUID()}`, email: googleEmail } });
  const customToken = await adminAuth.createCustomToken(google.uid);
  const googleSession = await authCall("signInWithCustomToken", { token: customToken, returnSecureToken: true });
  const kingdom = { playerName: "Existing ruler", gold: 7654321, playerFlag: { primary: "#123456" }, createdAt: 1000, ...release };
  await db.doc(`players/${google.uid}`).set(kingdom);
  // firebase-tools 15.22.4 rejects same-email token-bearing signup before it
  // looks up the token (operations.js signUp). Do not weaken the production
  // client to fit that emulator bug. Seed the linked credential through Admin
  // here; the client test covers the actual SDK linking call and UID guards.
  await adminAuth.updateUser(google.uid, { password });
  const passwordSession = await authCall("signInWithPassword", { email: googleEmail, password, returnSecureToken: true });
  assert.equal(passwordSession.localId, google.uid);
  assert.deepEqual((await db.doc(`players/${google.uid}`).get()).data(), kingdom);
  assert((await adminAuth.getUser(google.uid)).providerData.some(provider => provider.providerId === "google.com"));
  const verifiedFixture = await signUpVerifiedPlayer(`${authRoot}/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `fixture-${randomUUID()}@example.test`, password, returnSecureToken: true }),
  }).then(r => r.json());
  assert.equal(JSON.parse(Buffer.from(verifiedFixture.idToken.split(".")[1], "base64url")).email_verified, true);
  assert.equal(JSON.parse(Buffer.from(googleSession.idToken.split(".")[1], "base64url")).user_id, google.uid);
  console.log("Email auth emulator passed: unverified reads/writes/callables blocked, refreshed verification accepted, Admin-seeded linked credential retains UID/providers/kingdom. Real Google linking requires controlled-account release verification.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
