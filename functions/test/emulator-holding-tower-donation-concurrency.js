"use strict";
const assert = require("node:assert/strict"), { randomUUID } = require("node:crypto");
const { signUpVerifiedPlayer } = require("./auth-fixtures");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_EMULATOR_HUB) throw Error("Local emulators required");
const project = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
if (!getApps().length) initializeApp({ projectId: project });
const db = getFirestore();
let identity = {}, host;
async function createActor() {
  const response = await signUpVerifiedPlayer(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `treasury-${randomUUID()}@example.test`, password: "Emulator-Treasury-Only-123!", returnSecureToken: true }),
  });
  assert(response.ok); const data = await response.json(); return { uid: data.localId, token: data.idToken };
}
async function call(name, actor, data = {}) {
  if (!host) { const hub = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`).then(r => r.json()); host = `${hub.functions.host}:${hub.functions.port}`; }
  const response = await fetch(`http://${host}/${project}/us-central1/${name}`, { method: "POST",
    headers: { authorization: `Bearer ${actor.token}`, "content-type": "application/json" },
    body: JSON.stringify({ data: { ...data, clientReleaseId: identity.releaseId, clientWorldId: identity.worldId,
      clientResetGeneration: identity.resetGeneration, clientRealmShardId: identity.realmShardId } }),
  });
  const result = await response.json(); if (result.error) throw Error(`${name}: ${result.error.message}`); return result.result;
}
async function privateAccess(owner, outsider, paths) {
  for (const path of paths) for (const actor of [owner, outsider]) for (const method of ["GET", "PATCH", "DELETE"]) {
    const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents/${path}`, {
      method, headers: { authorization: `Bearer ${actor.token}`, "content-type": "application/json" },
      ...(method === "PATCH" ? { body: JSON.stringify({ fields: { donatedToday: { integerValue: "0" } } }) } : {}),
    });
    assert.equal(response.status, 403, "Server-only donation usage/receipts were accessible");
  }
}
require("./treasury-donation-scenarios")({ db, call, createActor, setIdentity: value => { identity = value; }, privateAccess })
  .catch(error => { console.error(error); process.exitCode = 1; });
