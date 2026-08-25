const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const economyConfig = require("../economy-config.json");
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
      const functions = (await response.json())?.functions || {};
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
      email: `scouting-veil-${label}-${nonce}@example.test`,
      password: `Veil-${nonce}-Pass!`,
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
    result: body.result || null,
    error: body.error || null,
  };
}

async function callFunction(name, token, data = {}) {
  const response = await invokeFunction(name, token, data);
  if (!response.ok) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`);
  return response.result;
}

function scoutOrder({ id, sourceId, targetId, sourceName, targetName, regionId }) {
  return {
    sourceRegionId: regionId,
    targetRegionId: regionId,
    routeRegionIds: [regionId],
    army: {
      id,
      kind: "scout",
      targetType: "city",
      fromId: sourceId,
      toId: targetId,
      fromName: sourceName,
      toName: targetName,
      troops: 1,
      requestedTroops: 1,
      sourceRegionId: regionId,
      targetRegionId: regionId,
      routeRegionIds: [regionId],
    },
  };
}

async function findBulkArmies(requestId) {
  const snapshot = await db.collection("armies").where("bulkRequestId", "==", requestId).get();
  return snapshot.docs;
}

async function findBulkRequestRecords(uid, requestId) {
  const snapshot = await db.collection(`players/${uid}/bulkOrderRequests`)
    .where("requestId", "==", requestId)
    .get();
  return snapshot.docs;
}

async function collectionSize(path) {
  return (await db.collection(path).get()).size;
}

async function main() {
  const [attacker, defender] = await Promise.all([
    createAuthUser("attacker"),
    createAuthUser("defender"),
  ]);
  const [attackerClaim] = await Promise.all([
    callFunction("claimStartingCity", attacker.token, { playerName: "Veil Scout" }),
    callFunction("claimStartingCity", defender.token, { playerName: "Veiled Defender" }),
  ]);

  const islandId = attackerClaim.islandId;
  const regionId = attackerClaim.regionId || attackerClaim.mainRegionId || String(islandId).split("-").pop();
  const cities = db.collection(`islands/${islandId}/cities`);
  const sourceRef = cities.doc(attackerClaim.cityId);
  const source = (await sourceRef.get()).data() || {};
  const candidates = (await cities.get()).docs.filter(doc => doc.id !== attackerClaim.cityId);
  assert(candidates.length > 0, "The emulator world has no city for Veil scouting coverage.");
  const targetRef = candidates[0].ref;
  const target = candidates[0].data() || {};
  const attackerRef = db.doc(`players/${attacker.uid}`);
  const defenderRef = db.doc(`players/${defender.uid}`);
  const nowMs = Date.now();
  const scoutCost = Number(economyConfig.playerCosts?.nearbyScoutGold || 0);
  assert(scoutCost > 0, "Scout Nearby gold cost is not configured.");

  await Promise.all([
    attackerRef.set({
      gold: scoutCost * 4,
      goldFloat: scoutCost * 4,
      economyUpdatedAtMs: nowMs,
      itemEffects: { shieldExpiresAtMs: 0, veilOfSilenceExpiresAtMs: 0 },
    }, { merge: true }),
    defenderRef.set({
      economyUpdatedAtMs: nowMs,
      itemEffects: { shieldExpiresAtMs: 0, veilOfSilenceExpiresAtMs: nowMs + 60_000 },
    }, { merge: true }),
    sourceRef.set({
      ...source,
      owner: "player",
      ownerKind: "player",
      ownerUid: attacker.uid,
      ownerName: "Veil Scout",
      ownerShieldExpiresAtMs: 0,
      troops: 100,
      troopFloat: 100,
      productionUpdatedAtMs: nowMs,
      regionId,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
    }, { merge: true }),
    targetRef.set({
      ...target,
      x: Number(source.x || 0) + 35,
      y: Number(source.y || 0) + 35,
      owner: "player",
      ownerKind: "player",
      ownerUid: defender.uid,
      ownerName: "Veiled Defender",
      ownerShieldExpiresAtMs: 0,
      isMainCity: false,
      level: 1,
      troops: 50,
      troopFloat: 50,
      productionUpdatedAtMs: nowMs,
      regionId,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
    }, { merge: true }),
  ]);

  // Active Veil must reject a direct scout without committing any game state or notification/report noise.
  const rejectedArmyId = `veil_direct_rejected_${crypto.randomBytes(5).toString("hex")}`;
  const beforeDirectProfile = (await attackerRef.get()).data() || {};
  const beforeDirectSource = (await sourceRef.get()).data() || {};
  const beforeDirectReports = await collectionSize(`players/${attacker.uid}/serverReports`);
  const beforeDirectOutbox = await collectionSize("serverNotificationOutbox");
  const directRejection = await invokeFunction("sendArmyOrder", attacker.token, scoutOrder({
    id: rejectedArmyId,
    sourceId: sourceRef.id,
    targetId: targetRef.id,
    sourceName: source.name || "Scout source",
    targetName: target.name || "Veiled target",
    regionId,
  }));
  assert(
    !directRejection.ok && directRejection.error?.status === "FAILED_PRECONDITION",
    `Active Veil did not reject a direct scout: ${JSON.stringify(directRejection)}`
  );
  assert(directRejection.error?.details?.reason === "veil_of_silence", "Direct Veil rejection omitted its reason.");
  assert(
    directRejection.error?.details?.targets?.[0]?.cityId === targetRef.id
      && directRejection.error?.details?.targets?.[0]?.ownerUid === defender.uid
      && Number(directRejection.error?.details?.targets?.[0]?.expiresAtMs) > nowMs,
    "Direct Veil rejection omitted target ownership or expiration details."
  );
  const afterDirectProfile = (await attackerRef.get()).data() || {};
  const afterDirectSource = (await sourceRef.get()).data() || {};
  assert(!(await db.doc(`armies/${rejectedArmyId}`).get()).exists, "Rejected direct scout created a canonical army.");
  assert(Number(afterDirectProfile.gold) === Number(beforeDirectProfile.gold), "Rejected direct scout changed gold.");
  assert(Number(afterDirectSource.troops) === Number(beforeDirectSource.troops), "Rejected direct scout removed a troop.");
  assert(
    JSON.stringify(afterDirectProfile.activeArmies || []) === JSON.stringify(beforeDirectProfile.activeArmies || []),
    "Rejected direct scout changed active-army state."
  );
  assert(
    await collectionSize(`players/${attacker.uid}/serverReports`) === beforeDirectReports,
    "Rejected direct scout created a server report."
  );
  assert(await collectionSize("serverNotificationOutbox") === beforeDirectOutbox, "Rejected direct scout queued a notification.");
  assert(
    !(await db.doc(`serverNotificationOutbox/incoming_${rejectedArmyId}_${defender.uid}`).get()).exists,
    "Rejected direct scout left a target notification."
  );

  // Expiration is exclusive: a timestamp equal to or behind server time allows re-scouting.
  await Promise.all([
    targetRef.set({
      owner: "player",
      ownerKind: "player",
      ownerUid: defender.uid,
      ownerName: "Veiled Defender",
      isMainCity: false,
    }, { merge: true }),
    defenderRef.set({ itemEffects: { veilOfSilenceExpiresAtMs: Date.now() } }, { merge: true }),
  ]);
  const expiryArmyId = `veil_expired_${crypto.randomBytes(5).toString("hex")}`;
  const expiryLaunch = await callFunction("sendArmyOrder", attacker.token, scoutOrder({
    id: expiryArmyId,
    sourceId: sourceRef.id,
    targetId: targetRef.id,
    sourceName: source.name || "Scout source",
    targetName: target.name || "Expired Veil target",
    regionId,
  }));
  assert(expiryLaunch.movement?.id === expiryArmyId, "Scouting did not resume when Veil expired.");

  // A Veil activated while a scout is traveling must still block intel at arrival and return the scout once.
  await Promise.all([
    defenderRef.set({ itemEffects: { veilOfSilenceExpiresAtMs: Date.now() + 60_000 } }, { merge: true }),
    db.doc(`armies/${expiryArmyId}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true }),
  ]);
  const sourceAfterExpiryLaunch = (await sourceRef.get()).data() || {};
  const veiledResolution = await callFunction("resolveArmyOrder", attacker.token, {
    armyId: expiryArmyId,
    regionIds: [regionId],
  });
  assert(veiledResolution.status === "resolved", "The in-flight Veil scout did not resolve.");
  assert(!veiledResolution.scoutReport, "The in-flight Veil scout leaked city intel.");
  assert(
    veiledResolution.reports?.some(report => /Veil of Silence blocked the scout/.test(report?.summary || "")),
    "The in-flight Veil scout did not return a clear blocked report."
  );
  const resolvedArmy = (await db.doc(`armies/${expiryArmyId}`).get()).data() || {};
  assert(resolvedArmy.status === "resolved", "The in-flight Veil army was not marked resolved.");
  assert(resolvedArmy.result?.blocked === "veil_of_silence", "The canonical army omitted its Veil result.");
  const sourceAfterVeiledResolution = (await sourceRef.get()).data() || {};
  assert(Number(resolvedArmy.result?.returned) === 1, "The canonical Veil result did not return exactly one scout.");
  assert(
    Number(sourceAfterVeiledResolution.troops) >= Number(sourceAfterExpiryLaunch.troops) + 1,
    `The scout blocked at arrival was not returned to its source: ${JSON.stringify({
      afterLaunch: sourceAfterExpiryLaunch.troops,
      afterResolution: sourceAfterVeiledResolution.troops,
      result: resolvedArmy.result,
    })}`
  );
  const veiledReportId = `${expiryArmyId}_scout_veiled_${attacker.uid}`;
  assert(
    (await db.doc(`players/${attacker.uid}/serverReports/${veiledReportId}`).get()).exists,
    "The in-flight Veil resolution did not persist its attacker report."
  );
  const reportCountAfterResolution = await collectionSize(`players/${attacker.uid}/serverReports`);
  await callFunction("resolveArmyOrder", attacker.token, { armyId: expiryArmyId, regionIds: [regionId] });
  const sourceAfterDuplicateResolution = (await sourceRef.get()).data() || {};
  assert(
    Number(sourceAfterDuplicateResolution.troops) === Number(sourceAfterVeiledResolution.troops),
    "Resolving the Veil-blocked scout twice returned its troop twice."
  );
  assert(
    await collectionSize(`players/${attacker.uid}/serverReports`) === reportCountAfterResolution,
    "Resolving the Veil-blocked scout twice created duplicate reports."
  );

  // Scout Nearby must reject atomically during Veil, then accept the same request after expiry.
  await Promise.all([
    db.doc(`serverRateLimits/armyLaunch_${attacker.uid}`).delete(),
    attackerRef.set({
      gold: scoutCost * 2,
      goldFloat: scoutCost * 2,
      economyUpdatedAtMs: Date.now(),
    }, { merge: true }),
    sourceRef.set({
      troops: 100,
      troopFloat: 100,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true }),
  ]);
  const bulkRequestId = `veil_nearby_${crypto.randomBytes(5).toString("hex")}`;
  const bulkPayload = {
    sourceCityId: sourceRef.id,
    sourceRegionId: regionId,
    targetCityIds: [targetRef.id],
    requestId: bulkRequestId,
  };
  const beforeBulkProfile = (await attackerRef.get()).data() || {};
  const beforeBulkSource = (await sourceRef.get()).data() || {};
  const beforeBulkReports = await collectionSize(`players/${attacker.uid}/serverReports`);
  const beforeBulkOutbox = await collectionSize("serverNotificationOutbox");
  const bulkRejection = await invokeFunction("sendNearbyScouts", attacker.token, bulkPayload);
  assert(
    !bulkRejection.ok && bulkRejection.error?.status === "FAILED_PRECONDITION",
    `Active Veil did not reject Scout Nearby: ${JSON.stringify(bulkRejection)}`
  );
  assert(bulkRejection.error?.details?.reason === "veil_of_silence", "Scout Nearby Veil rejection omitted its reason.");
  assert(
    bulkRejection.error?.details?.targetCityIds?.includes(targetRef.id),
    "Scout Nearby Veil rejection omitted the blocked target."
  );
  const afterBulkProfile = (await attackerRef.get()).data() || {};
  const afterBulkSource = (await sourceRef.get()).data() || {};
  assert(Number(afterBulkProfile.gold) === Number(beforeBulkProfile.gold), "Rejected Scout Nearby changed gold.");
  assert(Number(afterBulkSource.troops) === Number(beforeBulkSource.troops), "Rejected Scout Nearby removed a troop.");
  assert((await findBulkArmies(bulkRequestId)).length === 0, "Rejected Scout Nearby created an army.");
  assert((await findBulkRequestRecords(attacker.uid, bulkRequestId)).length === 0, "Rejected Scout Nearby persisted request state.");
  assert(await collectionSize(`players/${attacker.uid}/serverReports`) === beforeBulkReports, "Rejected Scout Nearby created a report.");
  assert(await collectionSize("serverNotificationOutbox") === beforeBulkOutbox, "Rejected Scout Nearby queued a notification.");

  await defenderRef.set({ itemEffects: { veilOfSilenceExpiresAtMs: Date.now() } }, { merge: true });
  const bulkLaunch = await callFunction("sendNearbyScouts", attacker.token, bulkPayload);
  assert(bulkLaunch.armies?.length === 1, "Scout Nearby did not resume after Veil expired.");
  assert(bulkLaunch.armies[0]?.toId === targetRef.id, "Scout Nearby launched toward the wrong city after expiry.");
  assert((await findBulkArmies(bulkRequestId)).length === 1, "Scout Nearby did not persist exactly one army after expiry.");
  assert((await findBulkRequestRecords(attacker.uid, bulkRequestId)).length === 1, "Scout Nearby did not persist idempotency state after success.");
  const afterBulkLaunchProfile = (await attackerRef.get()).data() || {};
  const afterBulkLaunchSource = (await sourceRef.get()).data() || {};
  assert(Number(afterBulkLaunchProfile.gold) === Number(beforeBulkProfile.gold) - scoutCost, "Successful Scout Nearby charged the wrong gold amount.");
  assert(Number(afterBulkLaunchSource.troops) === Number(beforeBulkSource.troops) - 1, "Successful Scout Nearby removed the wrong troop count.");

  console.log("Validated direct and Nearby Veil launch blocking, in-flight activation, expiry, and side effects.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
