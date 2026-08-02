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
      email: `peace-shield-${label}-${nonce}@example.test`,
      password: `Shield-${nonce}-Pass!`,
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

function getRegionId(claim) {
  if (claim.regionId) return String(claim.regionId);
  const islandId = String(claim.islandId || "");
  const prefix = `${realm.worldId}-`;
  if (!islandId.startsWith(prefix)) throw new Error(`Cannot determine claim region from ${islandId}.`);
  return islandId.slice(prefix.length);
}

function islandIdForRegion(regionId) {
  return `${realm.worldId}-${regionId}`;
}

function regionalArmyRefs(movement) {
  return [...new Set(movement.viewRegionIds || movement.routeRegionIds || [])]
    .map(regionId => db.doc(`islands/${islandIdForRegion(regionId)}/armies/${movement.id}`));
}

async function seedMovement(movement) {
  const batch = db.batch();
  batch.set(db.doc(`armies/${movement.id}`), movement);
  regionalArmyRefs(movement).forEach(ref => batch.set(ref, movement));
  if (movement.targetOwnerUid && movement.targetOwnerUid !== movement.ownerUid && !movement.returning) {
    batch.set(db.doc(`players/${movement.targetOwnerUid}/incomingArmies/${movement.id}`), {
      ...movement,
      viewerAccess: "target",
    });
  }
  await batch.commit();
}

function expectedProgress(movement, nowMs) {
  if (
    movement.swiftMarchUsedAtMs > 0
    && movement.arrivesAtMs > movement.swiftMarchUsedAtMs
    && nowMs >= movement.swiftMarchUsedAtMs
  ) {
    const acceleratedProgress = Math.min(1, Math.max(
      0,
      (nowMs - movement.swiftMarchUsedAtMs) / (movement.arrivesAtMs - movement.swiftMarchUsedAtMs)
    ));
    return Math.min(1, Math.max(
      0,
      movement.swiftMarchProgressAtUse + (1 - movement.swiftMarchProgressAtUse) * acceleratedProgress
    ));
  }
  return Math.min(1, Math.max(
    0,
    (nowMs - movement.launchedAtMs) / (movement.arrivesAtMs - movement.launchedAtMs)
  ));
}

async function forceResolveMovement(movement, token) {
  const refs = [db.doc(`armies/${movement.id}`), ...regionalArmyRefs(movement)];
  await Promise.all(refs.map(ref => ref.set({ arrivesAtMs: Date.now() - 1000 }, { merge: true })));
  return callFunction("resolveArmyOrder", token, {
    armyId: movement.id,
    routeRegionIds: movement.routeRegionIds,
  });
}

async function main() {
  const nonce = crypto.randomBytes(5).toString("hex");
  const [shieldOwner, rival] = await Promise.all([
    createAuthUser("owner"),
    createAuthUser("rival"),
  ]);
  const [ownerClaim, rivalClaim] = await Promise.all([
    callFunction("claimStartingCity", shieldOwner.token, { playerName: `Shield Owner ${nonce}` }),
    callFunction("claimStartingCity", rival.token, { playerName: `Shield Rival ${nonce}` }),
  ]);
  const ownerRegionId = getRegionId(ownerClaim);
  const rivalRegionId = getRegionId(rivalClaim);
  const routeRegionIds = [...new Set([ownerRegionId, rivalRegionId])];
  const ownerProfileRef = db.doc(`players/${shieldOwner.uid}`);
  const rivalProfileRef = db.doc(`players/${rival.uid}`);
  const ownerMainRef = db.doc(`islands/${ownerClaim.islandId}/cities/${ownerClaim.cityId}`);
  const rivalMainRef = db.doc(`islands/${rivalClaim.islandId}/cities/${rivalClaim.cityId}`);
  const fallbackSourceId = `peace_source_${nonce}`;
  const fallbackSourceRef = db.doc(`islands/${ownerClaim.islandId}/cities/${fallbackSourceId}`);
  const seedNowMs = Date.now();

  await Promise.all([
    ownerProfileRef.set({
      shopItems: { shield_12h: 1 },
      itemEffects: { shieldExpiresAtMs: 0 },
      battleReports: [],
      economyUpdatedAtMs: seedNowMs,
    }, { merge: true }),
    rivalProfileRef.set({ battleReports: [], economyUpdatedAtMs: seedNowMs }, { merge: true }),
    ownerMainRef.set({ productionUpdatedAtMs: seedNowMs, ownerShieldExpiresAtMs: 0 }, { merge: true }),
    rivalMainRef.set({ productionUpdatedAtMs: seedNowMs, ownerShieldExpiresAtMs: 0 }, { merge: true }),
    fallbackSourceRef.set({
      id: fallbackSourceId,
      name: "Fallback Source",
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      regionId: ownerRegionId,
      ownerKind: "player",
      ownerUid: shieldOwner.uid,
      ownerName: `Shield Owner ${nonce}`,
      isMainCity: false,
      kind: "city",
      level: 1,
      defense: 1,
      troops: 1000,
      troopFloat: 1000,
      productionUpdatedAtMs: seedNowMs,
      ownerShieldExpiresAtMs: 0,
    }),
  ]);

  const movementBase = {
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    ownerKind: "player",
    kind: "attack",
    launchKind: "attack",
    targetType: "city",
    routeRegionIds,
    viewRegionIds: routeRegionIds,
    status: "active",
    createdByServer: true,
    serverAuthorityVersion: 3,
  };
  const outgoing = {
    ...movementBase,
    id: `shield_outgoing_${nonce}`,
    ownerUid: shieldOwner.uid,
    ownerName: `Shield Owner ${nonce}`,
    targetOwnerUid: rival.uid,
    originalTargetOwnerUid: rival.uid,
    fromId: fallbackSourceId,
    toId: rivalClaim.cityId,
    sourceRegionId: ownerRegionId,
    targetRegionId: rivalRegionId,
    troops: 111,
    total: 120,
    launchedAtMs: seedNowMs - 40_000,
    arrivesAtMs: seedNowMs + 80_000,
  };
  const swiftOutgoing = {
    ...movementBase,
    id: `shield_swift_${nonce}`,
    ownerUid: shieldOwner.uid,
    ownerName: `Shield Owner ${nonce}`,
    targetOwnerUid: rival.uid,
    originalTargetOwnerUid: rival.uid,
    fromId: fallbackSourceId,
    toId: rivalClaim.cityId,
    sourceRegionId: ownerRegionId,
    targetRegionId: rivalRegionId,
    troops: 222,
    total: 50,
    launchedAtMs: seedNowMs - 40_000,
    arrivesAtMs: seedNowMs + 30_000,
    swiftMarchUsedAtMs: seedNowMs - 20_000,
    swiftMarchOriginalArrivesAtMs: seedNowMs + 80_000,
    swiftMarchProgressAtUse: 1 / 6,
    swiftMarchRemainingMultiplier: 0.5,
  };
  const incoming = {
    ...movementBase,
    id: `shield_incoming_${nonce}`,
    ownerUid: rival.uid,
    ownerName: `Shield Rival ${nonce}`,
    targetOwnerUid: shieldOwner.uid,
    originalTargetOwnerUid: shieldOwner.uid,
    fromId: rivalClaim.cityId,
    toId: ownerClaim.cityId,
    sourceRegionId: rivalRegionId,
    targetRegionId: ownerRegionId,
    troops: 333,
    total: 120,
    launchedAtMs: seedNowMs - 30_000,
    arrivesAtMs: seedNowMs + 90_000,
  };

  const excludedMovements = [
    { id: `shield_scout_${nonce}`, kind: "scout" },
    { id: `shield_transfer_${nonce}`, kind: "transfer" },
    { id: `shield_reinforce_${nonce}`, kind: "reinforce" },
    { id: `shield_neutral_${nonce}`, targetOwnerUid: "", originalTargetOwnerUid: "" },
    { id: `shield_camp_${nonce}`, targetType: "camp", toId: `gold_camp_${nonce}` },
    { id: `shield_stronghold_source_${nonce}`, fromId: "west_gold_stronghold" },
    { id: `shield_citadel_${nonce}`, toId: "center_crown_citadel" },
    { id: `shield_rally_${nonce}`, rallyAttack: true, rallyId: `rally_${nonce}` },
    { id: `shield_rally_return_${nonce}`, rallyReturn: true },
    { id: `shield_camp_return_${nonce}`, campReturn: true },
    { id: `shield_reinforcement_return_${nonce}`, reinforcementReturn: true },
    { id: `shield_relinquish_${nonce}`, relinquishTransfer: true },
    { id: `shield_resolved_${nonce}`, status: "resolved" },
    { id: `shield_returning_${nonce}`, returning: true, returnReason: "recall_horn" },
    { id: `shield_recalled_${nonce}`, recalledAtMs: seedNowMs - 1000 },
  ].map(patch => ({
    ...movementBase,
    ownerUid: shieldOwner.uid,
    ownerName: `Shield Owner ${nonce}`,
    targetOwnerUid: rival.uid,
    originalTargetOwnerUid: rival.uid,
    fromId: fallbackSourceId,
    toId: rivalClaim.cityId,
    sourceRegionId: ownerRegionId,
    targetRegionId: rivalRegionId,
    troops: 50,
    total: 120,
    launchedAtMs: seedNowMs - 20_000,
    arrivesAtMs: seedNowMs + 100_000,
    ...patch,
  }));
  const npcIncoming = {
    ...movementBase,
    id: `shield_npc_${nonce}`,
    eventKind: "citadel_npc_assault",
    ownerKind: "npc",
    ownerUid: `citadel_legion_${nonce}`,
    ownerName: "Citadel Legion",
    targetOwnerUid: shieldOwner.uid,
    fromId: "center_crown_citadel",
    toId: ownerClaim.cityId,
    sourceRegionId: "center",
    targetRegionId: ownerRegionId,
    routeRegionIds: [...new Set(["center", ownerRegionId])],
    viewRegionIds: [...new Set(["center", ownerRegionId])],
    troops: 100000,
    total: 120,
    launchedAtMs: seedNowMs - 20_000,
    arrivesAtMs: seedNowMs + 100_000,
  };

  await Promise.all([
    seedMovement(outgoing),
    seedMovement(swiftOutgoing),
    seedMovement(incoming),
    ...excludedMovements.map(seedMovement),
    seedMovement(npcIncoming),
  ]);

  const [sourceBeforeActivation, rivalSourceBeforeActivation] = await Promise.all([
    fallbackSourceRef.get(),
    rivalMainRef.get(),
  ]);
  const activations = await Promise.all([
    invokeFunction("activateInventoryItem", shieldOwner.token, { itemId: "shield_12h" }),
    invokeFunction("activateInventoryItem", shieldOwner.token, { itemId: "shield_12h" }),
  ]);
  const successfulActivations = activations.filter(result => result.ok);
  assert(successfulActivations.length === 1, `Concurrent activation was not single-use: ${JSON.stringify(activations)}`);
  assert(
    activations.filter(result => !result.ok && result.error?.status === "FAILED_PRECONDITION").length === 1,
    `The losing shield activation did not fail atomically: ${JSON.stringify(activations)}`
  );
  const summary = successfulActivations[0].result?.shieldReturnSummary || {};
  assert(
    summary.outgoing === 2 && summary.incoming === 1 && summary.total === 3,
    `Shield return summary was inaccurate: ${JSON.stringify(summary)}`
  );

  const [ownerAfterActivation, ownerMainAfterActivation, sourceAfterActivation, rivalSourceAfterActivation] = await Promise.all([
    ownerProfileRef.get(),
    ownerMainRef.get(),
    fallbackSourceRef.get(),
    rivalMainRef.get(),
  ]);
  const shieldExpiresAtMs = Number(ownerAfterActivation.data()?.itemEffects?.shieldExpiresAtMs || 0);
  assert(shieldExpiresAtMs > Date.now(), "The shield timer was not activated.");
  assert(Number(ownerAfterActivation.data()?.shopItems?.shield_12h || 0) === 0, "Exactly one shield was not consumed.");
  assert(
    Number(ownerMainAfterActivation.data()?.ownerShieldExpiresAtMs || 0) === shieldExpiresAtMs,
    "The shield timer was not propagated to the owner's regular city."
  );
  assert(
    Number(sourceAfterActivation.data()?.troops || 0) === Number(sourceBeforeActivation.data()?.troops || 0)
      && Number(rivalSourceAfterActivation.data()?.troops || 0) === Number(rivalSourceBeforeActivation.data()?.troops || 0),
    "A reversed march teleported troops home during shield activation."
  );

  const eligibleMovements = [outgoing, swiftOutgoing, incoming];
  for (const original of eligibleMovements) {
    const canonical = (await db.doc(`armies/${original.id}`).get()).data() || {};
    assert(canonical.returning === true, `${original.id} did not begin returning.`);
    assert(canonical.returnReason === "peace_shield", `${original.id} has the wrong return reason.`);
    assert(canonical.returnDestinationId === original.fromId, `${original.id} is not returning to its source.`);
    assert(canonical.targetOwnerUid === "", `${original.id} retained its incoming target owner.`);
    assert(Number(canonical.troops || 0) === original.troops, `${original.id} lost or duplicated troops at reversal.`);
    const progress = Math.min(0.999999, Math.max(0.000001, expectedProgress(original, canonical.recalledAtMs)));
    const originalArrivesAtMs = Math.max(original.arrivesAtMs, original.swiftMarchOriginalArrivesAtMs || 0);
    const expectedReturnMs = Math.max(1000, Math.ceil((originalArrivesAtMs - original.launchedAtMs) * progress));
    assert(
      Math.abs(Number(canonical.returnStartProgress) - progress) < 1e-9,
      `${original.id} did not reverse at its exact current route progress.`
    );
    assert(
      Number(canonical.arrivesAtMs) - Number(canonical.recalledAtMs) === expectedReturnMs,
      `${original.id} has the wrong return duration.`
    );
    for (const ref of regionalArmyRefs(original)) {
      const publicMovement = (await ref.get()).data() || {};
      assert(
        publicMovement.returning === true
          && publicMovement.returnReason === "peace_shield"
          && publicMovement.targetOwnerUid === "",
        `${original.id} regional movement did not reverse immediately.`
      );
    }
    const incomingView = await db.doc(`players/${original.targetOwnerUid}/incomingArmies/${original.id}`).get();
    assert(!incomingView.exists, `${original.id} remained in the defender incoming view.`);
  }

  for (const excluded of [...excludedMovements, npcIncoming]) {
    const snapshot = await db.doc(`armies/${excluded.id}`).get();
    const current = snapshot.data() || {};
    assert(
      Boolean(current.returning) === Boolean(excluded.returning)
        && String(current.returnReason || "") === String(excluded.returnReason || "")
        && current.status === excluded.status,
      `Excluded movement changed during shield activation: ${excluded.id}`
    );
  }

  const reportsAfterActivation = ownerAfterActivation.data()?.battleReports || [];
  assert(reportsAfterActivation.length === 0, "Shield activation created a battle report.");

  await fallbackSourceRef.set({ ownerKind: "neutral", ownerUid: null, ownerName: "" }, { merge: true });
  const ownerMainTroopsBeforeReturn = Number(ownerMainAfterActivation.data()?.troops || 0);
  const rivalMainTroopsBeforeReturn = Number(rivalSourceAfterActivation.data()?.troops || 0);
  for (const movement of [outgoing, swiftOutgoing]) {
    const result = await forceResolveMovement(movement, shieldOwner.token);
    assert(result?.kind === "return" && result?.returned === movement.troops, `${movement.id} did not resolve as a return.`);
    assert(result?.returnCityId === ownerClaim.cityId, `${movement.id} did not use the source-loss fallback city.`);
  }
  const incomingResult = await forceResolveMovement(incoming, rival.token);
  assert(
    incomingResult?.kind === "return"
      && incomingResult?.returned === incoming.troops
      && incomingResult?.returnCityId === rivalClaim.cityId,
    "The incoming rival march did not return to its original source."
  );

  const [ownerMainAfterReturn, rivalMainAfterReturn, ownerProfileAfterReturn, rivalProfileAfterReturn] = await Promise.all([
    ownerMainRef.get(),
    rivalMainRef.get(),
    ownerProfileRef.get(),
    rivalProfileRef.get(),
  ]);
  assert(
    Number(ownerMainAfterReturn.data()?.troops || 0) >= ownerMainTroopsBeforeReturn + outgoing.troops + swiftOutgoing.troops,
    "Returned outgoing troops were not credited to the fallback city."
  );
  assert(
    Number(rivalMainAfterReturn.data()?.troops || 0) >= rivalMainTroopsBeforeReturn + incoming.troops,
    "Returned incoming troops were not credited to the rival source city."
  );
  assert(
    (ownerProfileAfterReturn.data()?.battleReports || []).length === 0
      && (rivalProfileAfterReturn.data()?.battleReports || []).length === 0,
    "Peace Shield returns created a battle report at arrival."
  );
  for (const movement of eligibleMovements) {
    const resolved = (await db.doc(`armies/${movement.id}`).get()).data() || {};
    assert(
      resolved.status === "resolved"
        && resolved.result?.kind === "return"
        && resolved.result?.returnReason === "peace_shield",
      `${movement.id} did not finish as a Peace Shield return.`
    );
  }

  console.log("Emulator Peace Shield returns passed: atomic activation, exact reversals, exclusions, view cleanup, Swift timing, and fallback arrival.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
