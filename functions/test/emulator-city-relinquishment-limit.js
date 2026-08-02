const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

let functionsHostPromise = null;
const reservedHoldingPaths = new Set();

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
  if (configuredFunctionsHost) return configuredFunctionsHost;
  if (!functionsHostPromise) {
    functionsHostPromise = (async () => {
      const hubHost = String(process.env.FIREBASE_EMULATOR_HUB || "").trim();
      if (!hubHost) return "127.0.0.1:5001";
      const response = await fetch(`http://${hubHost}/emulators`);
      if (!response.ok) throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
      const emulators = await response.json();
      const functions = emulators?.functions || {};
      const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
      const host = functions.host || listen?.address;
      const port = Number(functions.port || listen?.port);
      if (!host || !Number.isInteger(port) || port < 1) {
        throw new Error("Firebase Emulator Hub did not report a running Functions emulator.");
      }
      return formatEmulatorHost(host, port);
    })();
  }
  return functionsHostPromise;
}

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `relinquish-${label}-${nonce}@example.test`,
      password: `Relinquish-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function invokeFunction(name, token, data = {}) {
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
      },
    }),
  });
  const body = await response.json();
  return {
    ok: response.ok && !body.error,
    status: response.status,
    result: body.result || null,
    error: body.error || null,
  };
}

async function callFunction(name, token, data = {}) {
  const response = await invokeFunction(name, token, data);
  if (!response.ok) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`);
  return response.result;
}

function getRegionId(claim) {
  if (claim.regionId) return String(claim.regionId);
  const islandId = String(claim.islandId || "");
  const prefix = `${realm.worldId}-`;
  if (!islandId.startsWith(prefix)) throw new Error(`Cannot determine the claim region from ${islandId}.`);
  return islandId.slice(prefix.length);
}

async function seedOwnedHolding(user, claim, suffix, holding = {}) {
  const mainRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const mainSnapshot = await mainRef.get();
  assert(mainSnapshot.exists, `Starting city ${claim.cityId} is missing.`);
  const main = mainSnapshot.data() || {};
  const citySnapshot = await db.collection(`islands/${claim.islandId}/cities`).get();
  const candidate = citySnapshot.docs.find(doc => {
    const city = doc.data() || {};
    return doc.id !== claim.cityId
      && !reservedHoldingPaths.has(doc.ref.path)
      && (!city.ownerUid || city.ownerKind === "neutral");
  });
  assert(candidate, `No neutral holding is available for ${suffix}.`);
  reservedHoldingPaths.add(candidate.ref.path);
  const id = candidate.id;
  const ref = candidate.ref;
  const existing = candidate.data() || {};
  await ref.set({
    ...existing,
    id,
    name: holding.name || `Relinquish ${suffix}`,
    regionId: getRegionId(claim),
    ownerKind: "player",
    ownerUid: user.uid,
    ownerName: main.ownerName || `Relinquish ${suffix}`,
    isMainCity: false,
    troops: 0,
    troopFloat: 0,
    investedGold: 0,
    productionUpdatedAtMs: Date.now(),
    ...holding,
  }, { merge: true });
  return { id, ref, regionId: getRegionId(claim) };
}

async function attemptClientTimestampMutation(user) {
  const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/players/${user.uid}?updateMask.fieldPaths=lastCityRelinquishedAtMs`;
  return fetch(url, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${user.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        lastCityRelinquishedAtMs: { integerValue: String(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  });
}

async function relinquish(user, holding) {
  return invokeFunction("relinquishCity", user.token, {
    cityId: holding.id,
    regionId: holding.regionId,
  });
}

async function main() {
  const [firstAccount, secondAccount] = await Promise.all([
    createAuthUser("first"),
    createAuthUser("second"),
  ]);
  const [firstClaim, secondClaim] = await Promise.all([
    callFunction("claimStartingCity", firstAccount.token, { playerName: "Relinquish First" }),
    callFunction("claimStartingCity", secondAccount.token, { playerName: "Relinquish Second" }),
  ]);

  const initialProfile = (await db.doc(`players/${firstAccount.uid}`).get()).data() || {};
  assert(!initialProfile.lastCityRelinquishedAtMs, "A new account began with its relinquishment allowance already used.");

  const [firstCity, secondCity] = await Promise.all([
    seedOwnedHolding(firstAccount, firstClaim, "race_a"),
    seedOwnedHolding(firstAccount, firstClaim, "race_b"),
  ]);
  const concurrentResults = await Promise.all([
    relinquish(firstAccount, firstCity),
    relinquish(firstAccount, secondCity),
  ]);
  assert(
    concurrentResults.filter(result => result.ok).length === 1
      && concurrentResults.filter(result => !result.ok).length === 1,
    "Simultaneous relinquishments did not produce exactly one success and one rejection."
  );
  const blockedRace = concurrentResults.find(result => !result.ok);
  assert(
    blockedRace.error?.status === "FAILED_PRECONDITION"
      && blockedRace.error?.details?.cityRelinquishPolicy?.used === true,
    `The simultaneous rejection did not return the structured UTC policy: ${JSON.stringify(blockedRace.error)}`
  );

  const [firstCityAfter, secondCityAfter, firstProfileAfter] = await Promise.all([
    firstCity.ref.get(),
    secondCity.ref.get(),
    db.doc(`players/${firstAccount.uid}`).get(),
  ]);
  const raceCities = [firstCityAfter.data() || {}, secondCityAfter.data() || {}];
  assert(
    raceCities.filter(city => city.ownerKind === "neutral" && !city.ownerUid).length === 1
      && raceCities.filter(city => city.ownerUid === firstAccount.uid).length === 1,
    "The simultaneous transaction changed ownership for more than one holding."
  );
  const firstRelinquishedAtMs = Number(firstProfileAfter.data()?.lastCityRelinquishedAtMs || 0);
  assert(firstRelinquishedAtMs > 0, "A successful relinquishment did not record the profile timestamp.");
  const stillOwnedCity = raceCities[0].ownerUid === firstAccount.uid ? firstCity : secondCity;

  const repeatedAttempt = await relinquish(firstAccount, stillOwnedCity);
  assert(
    !repeatedAttempt.ok
      && repeatedAttempt.error?.details?.cityRelinquishPolicy?.lastCityRelinquishedAtMs === firstRelinquishedAtMs,
    "A repeated same-day attempt was not rejected with the original allowance timestamp."
  );
  const [stillOwnedAfter, repeatedProfileAfter] = await Promise.all([
    stillOwnedCity.ref.get(),
    db.doc(`players/${firstAccount.uid}`).get(),
  ]);
  assert(stillOwnedAfter.data()?.ownerUid === firstAccount.uid, "A blocked attempt changed city ownership.");
  assert(
    Number(repeatedProfileAfter.data()?.lastCityRelinquishedAtMs || 0) === firstRelinquishedAtMs,
    "A blocked attempt extended or consumed the daily allowance again."
  );

  const [stronghold, citadel] = await Promise.all([
    seedOwnedHolding(firstAccount, firstClaim, "stronghold", {
      kind: "stronghold",
      strongholdType: "gold",
    }),
    seedOwnedHolding(firstAccount, firstClaim, "citadel", {
      kind: "stronghold",
      strongholdType: "crown",
    }),
  ]);
  const [strongholdAttempt, citadelAttempt] = await Promise.all([
    relinquish(firstAccount, stronghold),
    relinquish(firstAccount, citadel),
  ]);
  assert(
    !strongholdAttempt.ok
      && !citadelAttempt.ok
      && strongholdAttempt.error?.details?.cityRelinquishPolicy?.used === true
      && citadelAttempt.error?.details?.cityRelinquishPolicy?.used === true,
    "Strongholds and the Citadel did not share the account-wide allowance."
  );
  assert(
    (await stronghold.ref.get()).data()?.ownerUid === firstAccount.uid
      && (await citadel.ref.get()).data()?.ownerUid === firstAccount.uid,
    "A blocked special-holding attempt changed ownership."
  );

  const secondAccountCity = await seedOwnedHolding(secondAccount, secondClaim, "independent");
  const secondAccountResult = await relinquish(secondAccount, secondAccountCity);
  assert(secondAccountResult.ok, "Another account did not receive an independent daily allowance.");

  const forbiddenTimestampWrite = await attemptClientTimestampMutation(firstAccount);
  assert(forbiddenTimestampWrite.status === 403, "Firestore rules allowed a client to rewrite the relinquishment timestamp.");

  await db.doc(`players/${firstAccount.uid}`).set({
    lastCityRelinquishedAtMs: Date.now() - 24 * 60 * 60 * 1000,
  }, { merge: true });
  const resetAttempt = await relinquish(firstAccount, stillOwnedCity);
  assert(resetAttempt.ok, "An allowance from a prior UTC day did not reset.");

  console.log("Emulator city relinquishment limit passed: atomic race, same-day lock, special holdings, account isolation, rules, and UTC reset.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
