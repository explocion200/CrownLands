const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");
const worldLayout = require("../world-layout.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIREBASE_FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

let functionsHostPromise = null;

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
      email: `camp-lifecycle-${label}-${nonce}@example.test`,
      password: `Camp-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunctionResponse(name, token, data = {}) {
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
  return { response, body: await response.json() };
}

async function callFunction(name, token, data = {}) {
  const { response, body } = await callFunctionResponse(name, token, data);
  if (!response.ok || body.error) {
    throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  }
  return body.result;
}

function getCamp(campType) {
  for (const map of worldLayout.maps || []) {
    const camp = (map.camps || []).find(candidate => candidate.campType === campType || candidate.type === campType);
    if (camp) return { regionId: map.id, ...camp };
  }
  throw new Error(`Missing ${campType} Camp in the authoritative world layout.`);
}

function campRef(camp) {
  return db.doc(`islands/${realm.worldId}-${camp.regionId}/camps/${camp.id}`);
}

async function configureHold(camp, user, claim, {
  due = true,
  pending = true,
  currentGarrison = 10,
  alliedReinforcementTroops = 0,
  heldSinceMs = Date.now() - 60_000,
} = {}) {
  const payoutAtMs = due ? Date.now() - 1_000 : Date.now() + 60_000;
  await campRef(camp).set({
    ...camp,
    mapId: camp.regionId,
    regionId: camp.regionId,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    holderUid: user.uid,
    holderName: "Camp Holder",
    holderFlag: null,
    ownerUid: user.uid,
    ownerKind: "player",
    heldSinceMs,
    lastCapturedAtMs: heldSinceMs || 0,
    payoutAtMs,
    payoutPending: pending,
    currentGarrison,
    troops: currentGarrison,
    troopFloat: currentGarrison,
    alliedReinforcementTroops,
    activeArmyIds: [],
    returnSourceCityId: claim.cityId,
    returnSourceRegionId: claim.mainRegionId,
    returnSourceCityName: claim.cityName || "Main city",
    state: pending ? "held" : "neutral",
  }, { merge: false });
  return payoutAtMs;
}

function firestoreRestUrl(documentPath) {
  return `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
}

async function readDocumentAs(documentPath, token) {
  return fetch(firestoreRestUrl(documentPath), {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function main() {
  const holder = await createAuthUser("holder");
  const outsider = await createAuthUser("outsider");
  const claim = await callFunction("claimStartingCity", holder.token, { playerName: "Camp Holder" });
  const profileRef = db.doc(`players/${holder.uid}`);
  const mainCityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const goldCamp = getCamp("gold");
  const troopCamp = getCamp("troops");

  await configureHold(goldCamp, holder, claim, { due: false });
  const profileBeforeEarlyCall = (await profileRef.get()).data() || {};
  const early = await callFunction("resolveRewardCampPayout", holder.token, {
    campId: goldCamp.id,
    regionId: goldCamp.regionId,
  });
  assert(early.status === "not-due", "A Camp paid before its authoritative hold timer elapsed.");
  const profileAfterEarlyCall = (await profileRef.get()).data() || {};
  assert(
    Number(profileAfterEarlyCall.goldFloat || profileAfterEarlyCall.gold || 0)
      === Number(profileBeforeEarlyCall.goldFloat || profileBeforeEarlyCall.gold || 0),
    "An incomplete Camp hold changed the holder's Gold."
  );

  await configureHold(goldCamp, holder, claim, { due: true, alliedReinforcementTroops: 25 });
  const beforePayout = (await profileRef.get()).data() || {};
  const outsiderAttempt = await callFunctionResponse("resolveRewardCampPayout", outsider.token, {
    campId: goldCamp.id,
    regionId: goldCamp.regionId,
  });
  assert(
    outsiderAttempt.body?.error?.status === "PERMISSION_DENIED",
    `Another player could resolve or inspect the holder's payout: ${JSON.stringify(outsiderAttempt.body)}`
  );
  assert((await campRef(goldCamp).get()).data()?.payoutPending === true, "The outsider changed the Camp payout state.");

  const concurrent = await Promise.all([
    callFunction("resolveRewardCampPayout", holder.token, { campId: goldCamp.id, regionId: goldCamp.regionId }),
    callFunction("resolveRewardCampPayout", holder.token, { campId: goldCamp.id, regionId: goldCamp.regionId }),
  ]);
  const paid = concurrent.find(result => result.status === "paid");
  const duplicate = concurrent.find(result => ["not-pending", "duplicate"].includes(result.status));
  assert(paid && duplicate, `Concurrent claims did not resolve exactly once: ${JSON.stringify(concurrent)}`);
  const afterPayout = (await profileRef.get()).data() || {};
  assert(
    Number(afterPayout.goldFloat || afterPayout.gold || 0)
      === Number(beforePayout.goldFloat || beforePayout.gold || 0) + Number(paid.reward || 0),
    "The Gold Camp reward was not persisted exactly once."
  );
  const goldStats = (await db.doc(`players/${holder.uid}/objectiveStats/goldCamp`).get()).data() || {};
  assert(Number(goldStats.count) === 1, "Concurrent Gold Camp claims advanced the daily ladder more than once.");
  const completedCamp = (await campRef(goldCamp).get()).data() || {};
  assert(completedCamp.payoutPending === false && !completedCamp.holderUid, "Completed Camp did not reset to neutral.");
  assert(Number(completedCamp.alliedReinforcementTroops || 0) === 0, "Completed Camp retained stale allied troops.");
  assert(!Object.hasOwn(completedCamp, "dailyRewardClaims"), "Completed Camp published private reward metadata.");
  const receipts = await db.collection(`rewardCampPayoutReceipts/${realm.resetGeneration}/entries`)
    .where("holderUid", "==", holder.uid)
    .get();
  assert(receipts.size === 1, "The completed hold did not create exactly one payout receipt.");

  const publicCampRead = await readDocumentAs(
    `islands/${realm.worldId}-${goldCamp.regionId}/camps/${goldCamp.id}`,
    outsider.token
  );
  assert(publicCampRead.ok, "Current Camp map state should remain visible to signed-in players.");
  const publicCampDocument = await publicCampRead.json();
  assert(!publicCampDocument.fields?.dailyRewardClaims, "The public Camp document exposed private payout details.");
  const legacyPayoutReportPath = `islands/${realm.worldId}-${goldCamp.regionId}/reports/${goldCamp.id}_hold_123_${holder.uid}`;
  await db.doc(legacyPayoutReportPath).set({
    uid: holder.uid,
    campReward: { rewardType: "gold", amount: 99_999 },
    summary: "Legacy private Camp payout",
  });
  assert(
    (await readDocumentAs(legacyPayoutReportPath, outsider.token)).status === 403,
    "A legacy public Camp payout report remained readable."
  );
  const receiptRead = await readDocumentAs(
    `rewardCampPayoutReceipts/${realm.resetGeneration}/entries/${receipts.docs[0].id}`,
    holder.token
  );
  assert(receiptRead.status === 403, "A player could read the server-only payout receipt.");

  const historyId = `privacy_${crypto.randomBytes(5).toString("hex")}`;
  const historyPath = `islands/${realm.worldId}-${goldCamp.regionId}/camps/${goldCamp.id}/rewardHistory/${historyId}`;
  await db.doc(historyPath).set({
    campId: goldCamp.id,
    cityId: claim.cityId,
    cityName: claim.cityName || "Main city",
    regionId: claim.mainRegionId,
    regionName: claim.mainRegionId,
    awardedToPlayerId: holder.uid,
    awardedToDisplayName: "Camp Holder",
    awardedAtMs: Date.now(),
    source: "deed_camp",
  });
  assert((await readDocumentAs(historyPath, holder.token)).ok, "The awarded player could not read their Camp reward history.");
  assert(
    (await readDocumentAs(historyPath, outsider.token)).status === 403,
    "Another player could read private Camp reward history."
  );

  const troopCheckpointMs = Date.now() - 10 * 60_000;
  await mainCityRef.set({
    troops: 5_000,
    troopFloat: 5_000,
    productionUpdatedAtMs: troopCheckpointMs,
  }, { merge: true });
  await configureHold(troopCamp, holder, claim, { due: true });
  const troopResult = await callFunction("resolveRewardCampPayout", holder.token, {
    campId: troopCamp.id,
    regionId: troopCamp.regionId,
  });
  assert(troopResult.status === "paid" && troopResult.rewardedTroops > 0, "Warband Camp did not award troops.");
  const cityAfterTroopReward = (await mainCityRef.get()).data() || {};
  assert(
    Number(cityAfterTroopReward.troopFloat) === 5_000 + Number(troopResult.rewardedTroops),
    "Warband Camp did not add the awarded troops to the destination city."
  );
  assert(
    Number(cityAfterTroopReward.productionUpdatedAtMs) === troopCheckpointMs,
    "Warband Camp discarded passive troop production by advancing its checkpoint."
  );

  const goldBeforeRecall = Number((await profileRef.get()).data()?.goldFloat || 0);
  const claimCountBeforeRecall = Number((await db.doc(`players/${holder.uid}/objectiveStats/goldCamp`).get()).data()?.count || 0);
  await configureHold(goldCamp, holder, claim, {
    due: false,
    currentGarrison: 0,
    alliedReinforcementTroops: 777,
  });
  const recalled = await callFunction("recallRewardCampGarrison", holder.token, {
    campId: goldCamp.id,
    regionId: goldCamp.regionId,
  });
  assert(recalled.status === "recalled", "The holder could not abandon an unfinished Camp hold.");
  const recalledCamp = (await campRef(goldCamp).get()).data() || {};
  assert(recalledCamp.payoutPending === false && !recalledCamp.holderUid, "Abandoned Camp did not become neutral.");
  assert(Number(recalledCamp.alliedReinforcementTroops || 0) === 0, "Abandoned Camp retained stale allied troops.");
  assert(!Object.hasOwn(recalledCamp, "dailyRewardClaims"), "Abandoned Camp retained public reward metadata.");
  assert(Number((await profileRef.get()).data()?.goldFloat || 0) === goldBeforeRecall, "Abandoning a Camp awarded Gold.");
  assert(
    Number((await db.doc(`players/${holder.uid}/objectiveStats/goldCamp`).get()).data()?.count || 0)
      === claimCountBeforeRecall,
    "Abandoning a Camp advanced the reward ladder."
  );

  await configureHold(goldCamp, holder, claim, { due: true, pending: false });
  const failed = await callFunction("resolveRewardCampPayout", holder.token, {
    campId: goldCamp.id,
    regionId: goldCamp.regionId,
  });
  assert(failed.status === "not-pending", "A failed Camp state was treated as complete.");
  assert(Number((await profileRef.get()).data()?.goldFloat || 0) === goldBeforeRecall, "A failed Camp awarded Gold.");

  await configureHold(goldCamp, holder, claim, { due: true, heldSinceMs: 0 });
  const invalid = await callFunction("resolveRewardCampPayout", holder.token, {
    campId: goldCamp.id,
    regionId: goldCamp.regionId,
  });
  assert(invalid.status === "invalid-hold", "An invalid Camp hold passed the completion gate.");
  assert(Number((await profileRef.get()).data()?.goldFloat || 0) === goldBeforeRecall, "An invalid Camp hold awarded Gold.");

  console.log(
    "Emulator Camp lifecycle passed: private rewards, completion gating, exact-once claims, production preservation, and safe abandonment."
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
