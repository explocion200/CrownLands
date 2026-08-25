"use strict";

const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatEmulatorHost(host, port) {
  const normalizedHost = String(host || "127.0.0.1").trim();
  const formattedHost = normalizedHost.includes(":") && !normalizedHost.startsWith("[")
    ? `[${normalizedHost}]`
    : normalizedHost;
  return `${formattedHost}:${port}`;
}

async function resolveFunctionsHost() {
  if (process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST) {
    return process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST;
  }
  const hubHost = String(process.env.FIREBASE_EMULATOR_HUB || "").trim();
  if (!hubHost) return "127.0.0.1:5001";
  const response = await fetch(`http://${hubHost}/emulators`);
  if (!response.ok) throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
  const functions = (await response.json())?.functions || {};
  const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
  return formatEmulatorHost(functions.host || listen?.address, Number(functions.port || listen?.port));
}

async function createAuthUser(index) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `realm-scale-${index}@example.test`,
      password: `RealmScale-${index}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunction(name, token, data = {}) {
  const functionsHost = await resolveFunctionsHost();
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
        clientRealmShardId: "legacy",
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index], index);
    }
  }));
  return results;
}

async function main() {
  const users = await mapWithConcurrency(
    Array.from({ length: 120 }, (_, index) => index),
    20,
    createAuthUser
  );
  const sessions = users.map((_, index) => `scale-session-${index}`);
  const joins = await mapWithConcurrency(users, 12, (user, index) => callFunction(
    "joinGameServer",
    user.token,
    {
      serverId: "crown-marches",
      sessionId: sessions[index],
      displayName: `Scale Ruler ${index + 1}`,
    }
  ));
  assert(joins.length === 120, "The scale admission gate did not exercise 120 players.");
  assert(joins.every(result => result?.status === "active"), "At least one player entered a waiting room.");

  const heartbeats = await mapWithConcurrency(users, 12, (user, index) => callFunction(
    "heartbeatGameServer",
    user.token,
    {
      serverId: "crown-marches",
      sessionId: sessions[index],
      displayName: `Scale Ruler ${index + 1}`,
    }
  ));
  assert(heartbeats.every(result => result?.status === "active"), "At least one admitted player lost active status.");

  const serverRef = db.doc(`gameServers/crown-marches-${realm.resetGeneration}`);
  const [serverSnap, membersSnap] = await Promise.all([
    serverRef.get(),
    serverRef.collection("members").get(),
  ]);
  const server = serverSnap.data() || {};
  assert(server.admissionModel === "sharded-members-v3", "The sharded admission model was not persisted.");
  assert(Number(server.waitingCount || 0) === 0, "The server reported a global waiting count.");
  assert(!Object.prototype.hasOwnProperty.call(server, "activeSlots"), "The removed global active-slot map returned.");
  assert(!Object.prototype.hasOwnProperty.call(server, "waitingQueue"), "The removed FIFO waiting queue returned.");
  assert(membersSnap.size === 120, `Expected 120 active member documents, received ${membersSnap.size}.`);

  console.log("Realm scale admission passed: 120 concurrent players joined and heartbeated as active without a global queue.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
