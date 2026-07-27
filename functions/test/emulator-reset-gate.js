const admin = require("firebase-admin");
const crypto = require("node:crypto");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const functionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

admin.initializeApp({ projectId });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createAuthUser(index) {
  const email = `reset-player-${index}@example.test`;
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: `ResetGate-${index}-Pass!`, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken, email };
}

async function callFunction(name, token, data = {}) {
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
  if (!response.ok || body.error) {
    throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  }
  return body.result;
}

async function waitForOwnershipEvents(expected, timeoutMs = 30000) {
  const startedAt = Date.now();
  const ref = db.collection(`realmEvents/${realm.resetGeneration}/ownershipChanges`);
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await ref.get();
    const processed = snapshot.docs.filter(doc => doc.data()?.status === "processed").length;
    if (snapshot.size >= expected && processed >= expected) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Ownership events did not settle at ${expected}.`);
}

async function main() {
  const users = await Promise.all(Array.from({ length: 50 }, (_, index) => createAuthUser(index)));
  const preservedFlag = {
    background: "#17324d",
    pattern: "split",
    patternColor: "#d8bd78",
    emblem: "crown",
    emblemColor: "#ffffff",
  };
  await db.doc(`players/${users[0].uid}`).set({
    uid: users[0].uid,
    playerName: "Preserved Ruler",
    flag: preservedFlag,
    resetGeneration: "archived-generation",
    worldId: "main-archived-generation",
    gold: 999999,
    character: { level: 99, xp: 123, skillPoints: 98 },
    shopItems: { shield_12h: 7 },
    clanId: "archived-clan",
    battleReports: [{ id: "old-report" }],
    activeSession: { id: "preserved-session", device: "test" },
  });
  await db.doc(`islands/main-archived-generation-region_11/cities/legacy_city`).set({
    worldId: "main-archived-generation",
    resetGeneration: "archived-generation",
    ownerKind: "player",
    ownerUid: users[0].uid,
    troops: 999999,
  });

  const firstClaim = await callFunction("claimStartingCity", users[0].token, {
    playerName: "Client Tried To Rename",
    flag: { background: "#000000" },
  });
  assert(firstClaim.cityId, "The first reset player did not receive a city.");
  const remainingClaims = [];
  for (const [index, user] of users.slice(1).entries()) {
    remainingClaims.push(
      await callFunction("claimStartingCity", user.token, { playerName: `Ruler ${index + 2}` })
    );
  }
  const claims = [firstClaim, ...remainingClaims];
  assert(new Set(claims.map(claim => claim.cityId)).size === 50, "Starting city assignments collided.");

  const profile = (await db.doc(`players/${users[0].uid}`).get()).data() || {};
  assert(profile.playerName === "Preserved Ruler", "Ruler name was not preserved.");
  assert(JSON.stringify(profile.flag) === JSON.stringify(preservedFlag), "Personal flag was not preserved.");
  assert(profile.gold === 100, "Starting gold was not reset to 100.");
  assert(profile.character?.level === 1 && profile.character?.xp === 0, "Character progression was not reset.");
  assert(!profile.clanId && !profile.battleReports?.length, "Clan or report progression survived the reset.");
  assert(Object.values(profile.shopItems || {}).every(count => count === 0), "Items survived the reset.");
  assert(profile.activeSession?.id === "preserved-session", "Technical session state was not preserved.");

  const starterRegions = ["region_11", "region_12", "region_13", "region_14", "region_15"];
  const islandSnapshots = await Promise.all(starterRegions.map(regionId => (
    db.doc(`islands/${realm.worldId}-${regionId}`).get()
  )));
  const counts = islandSnapshots.map(snapshot => Number(snapshot.data()?.playerCount) || 0);
  assert(counts.reduce((sum, count) => sum + count, 0) === 50, `Starter counts do not total 50: ${counts.join(",")}`);
  assert(Math.max(...counts) - Math.min(...counts) <= 1, `Starter islands are imbalanced: ${counts.join(",")}`);

  const idempotentResults = await Promise.all(users.map((user, index) => (
    callFunction("claimStartingCity", user.token, { playerName: `Changed ${index}` })
  )));
  idempotentResults.forEach((result, index) => {
    assert(result.alreadyClaimed === true, `Repeated claim ${index} was not idempotent.`);
    assert(result.cityId === claims[index].cityId, `Repeated claim ${index} changed city.`);
  });
  const countsAfterRetry = await Promise.all(starterRegions.map(async regionId => (
    Number((await db.doc(`islands/${realm.worldId}-${regionId}`).get()).data()?.playerCount) || 0
  )));
  assert(countsAfterRetry.join(",") === counts.join(","), "Repeated claims changed island populations.");

  await waitForOwnershipEvents(50);
  const eventsBeforeEconomy = await db.collection(`realmEvents/${realm.resetGeneration}/ownershipChanges`).get();
  const economyResults = await Promise.all(users.map(user => callFunction("collectEconomy", user.token)));
  assert(economyResults.every(result => result?.ok !== false), "A 50-player economy collection failed.");
  const eventsAfterEconomy = await db.collection(`realmEvents/${realm.resetGeneration}/ownershipChanges`).get();
  assert(eventsAfterEconomy.size === eventsBeforeEconomy.size, "Economy checkpoints created ownership events.");

  const firstStats = (await db.doc(`players/${users[0].uid}/stats/global`).get()).data() || {};
  assert(firstStats.resetGeneration === realm.resetGeneration, "Stats were written to the wrong generation.");
  assert(firstStats.totalCities === 1, "Archived cities leaked into current-generation statistics.");

  const clanLeader = users[48];
  const clanApplicant = users[49];
  const clanLeaderRef = db.doc(`players/${clanLeader.uid}`);
  const clanApplicantRef = db.doc(`players/${clanApplicant.uid}`);
  await Promise.all([
    clanLeaderRef.set({
      character: { level: 9, xp: 0, skillPoints: 8 },
      gold: 100_000,
      goldFloat: 100_000,
      economyUpdatedAtMs: Date.now(),
    }, { merge: true }),
    clanApplicantRef.set({
      character: { level: 10, xp: 0, skillPoints: 9 },
    }, { merge: true }),
  ]);
  let lockedClanError = null;
  try {
    await callFunction("createClan", clanLeader.token, {
      name: "Application Gate",
      tag: "APGT",
      description: "Exercises approval applications in the release gate.",
      admissionMode: "approval",
    });
  } catch (error) {
    lockedClanError = error;
  }
  assert(
    /Clans unlock at Hero Level 10/.test(String(lockedClanError?.message || "")),
    "A Level 9 player was not blocked from creating a clan."
  );
  await clanLeaderRef.set({
    character: { level: 10, xp: 0, skillPoints: 9 },
  }, { merge: true });
  const createdClan = await callFunction("createClan", clanLeader.token, {
    name: "Application Gate",
    tag: "APGT",
    description: "Exercises approval applications in the release gate.",
    admissionMode: "approval",
  });
  const applicationClanId = createdClan?.clan?.id;
  assert(applicationClanId, "The clan application gate could not create its approval clan.");

  const firstApplication = await callFunction("applyToClan", clanApplicant.token, {
    clanId: applicationClanId,
    message: "First application",
  });
  assert(firstApplication?.pending === true, "Applying to an approval clan did not return pending status.");
  let applicationSnapshot = await db.doc(`clans/${applicationClanId}/applications/${clanApplicant.uid}`).get();
  let applicantProfile = (await clanApplicantRef.get()).data() || {};
  assert(applicationSnapshot.exists, "The pending clan application was not persisted.");
  assert(applicationSnapshot.data()?.resetGeneration === realm.resetGeneration, "The clan application was written to the wrong reset.");
  assert(applicationSnapshot.data()?.worldId === realm.worldId, "The clan application was written to the wrong world.");
  assert(applicantProfile.pendingClanApplicationId === applicationClanId, "The applicant profile did not track its pending clan.");

  await callFunction("cancelClanApplication", clanApplicant.token, { clanId: applicationClanId });
  applicationSnapshot = await db.doc(`clans/${applicationClanId}/applications/${clanApplicant.uid}`).get();
  applicantProfile = (await clanApplicantRef.get()).data() || {};
  assert(!applicationSnapshot.exists, "Canceling a clan application did not remove it.");
  assert(!applicantProfile.pendingClanApplicationId, "Canceling a clan application did not clear the applicant profile.");

  await callFunction("applyToClan", clanApplicant.token, {
    clanId: applicationClanId,
    message: "Second application",
  });
  const reviewedApplication = await callFunction("reviewClanApplication", clanLeader.token, {
    clanId: applicationClanId,
    applicantUid: clanApplicant.uid,
    accept: true,
  });
  assert(reviewedApplication?.ok === true && reviewedApplication?.role === "member", "Accepting a clan application did not join the applicant.");
  const [acceptedMemberSnapshot, acceptedApplicationSnapshot, acceptedApplicantSnapshot] = await Promise.all([
    db.doc(`clans/${applicationClanId}/members/${clanApplicant.uid}`).get(),
    db.doc(`clans/${applicationClanId}/applications/${clanApplicant.uid}`).get(),
    clanApplicantRef.get(),
  ]);
  assert(acceptedMemberSnapshot.exists, "The accepted applicant was not added to the clan roster.");
  assert(!acceptedApplicationSnapshot.exists, "The accepted clan application was not removed.");
  assert(acceptedApplicantSnapshot.data()?.clanId === applicationClanId, "The accepted applicant profile did not receive clan identity.");
  const acceptedApplicantStats = (await db.doc(`players/${clanApplicant.uid}/stats/global`).get()).data() || {};
  assert(
    acceptedMemberSnapshot.data()?.kingPower === acceptedApplicantStats.kingPower,
    "The public clan roster did not store the member's authoritative King Power."
  );
  const publicApplicantProfile = await callFunction("getCombatPlayerIdentity", clanLeader.token, {
    uid: clanApplicant.uid,
    includePublicProfile: true,
  });
  assert(publicApplicantProfile?.clan?.id === applicationClanId, "The public player profile did not resolve the player's canonical clan.");
  assert(
    JSON.stringify(publicApplicantProfile?.clanShield) === JSON.stringify(createdClan?.clan?.shield),
    "The public player profile did not return the shield belonging to the player's clan."
  );

  const attacker = users[0];
  const sourceClaim = claims[0];
  const sourceRef = db.doc(`islands/${sourceClaim.islandId}/cities/${sourceClaim.cityId}`);
  const source = (await sourceRef.get()).data() || {};
  const defenderClaim = claims[1];
  const protectionPreview = await callFunction("previewArmyProtection", attacker.token, {
    fromId: sourceClaim.cityId,
    toId: defenderClaim.cityId,
    sourceRegionId: sourceClaim.mainRegionId,
    targetRegionId: defenderClaim.mainRegionId,
    targetType: "city",
    requestedTroops: Math.max(1, Math.floor(Number(source.troops) || 1)),
  });
  assert(protectionPreview?.ok === true, "Player attack protection preview failed.");

  const citySnapshot = await db.collection(`islands/${sourceClaim.islandId}/cities`)
    .where("ownerUid", "==", null)
    .get();
  const targetCandidates = citySnapshot.docs
    .filter(doc => !doc.data()?.strongholdType && doc.id !== sourceClaim.cityId)
    .sort((left, right) => {
      const leftData = left.data() || {};
      const rightData = right.data() || {};
      const leftDistance = Math.hypot(Number(leftData.x) - Number(source.x), Number(leftData.y) - Number(source.y));
      const rightDistance = Math.hypot(Number(rightData.x) - Number(source.x), Number(rightData.y) - Number(source.y));
      return leftDistance - rightDistance;
    });
  assert(targetCandidates.length, "No neutral target was available for the army smoke test.");
  await sourceRef.set({ troops: 2_000, troopFloat: 2_000 }, { merge: true });

  let targetDoc = null;
  let armyId = "";
  let sent = null;
  for (const candidate of targetCandidates) {
    const target = candidate.data() || {};
    const distance = Math.hypot(Number(target.x) - Number(source.x), Number(target.y) - Number(source.y));
    const candidateArmyId = `reset_gate_${crypto.randomBytes(8).toString("hex")}`;
    await candidate.ref.set({ level: 1, defense: 1, troops: 0, troopFloat: 0 }, { merge: true });
    try {
      sent = await callFunction("sendArmyOrder", attacker.token, {
        army: {
          id: candidateArmyId,
          kind: "attack",
          fromId: sourceClaim.cityId,
          toId: candidate.id,
          fromName: source.name || sourceClaim.cityId,
          toName: target.name || candidate.id,
          troops: 500,
          requestedTroops: 500,
          total: 500,
          sourceRegionId: sourceClaim.mainRegionId,
          targetRegionId: sourceClaim.mainRegionId,
          routeRegionIds: [sourceClaim.mainRegionId],
          viewRegionIds: [sourceClaim.mainRegionId],
          path: [{ x: Number(source.x), y: Number(source.y) }, { x: Number(target.x), y: Number(target.y) }],
          pathSegments: [{
            regionId: sourceClaim.mainRegionId,
            points: [{ x: Number(source.x), y: Number(source.y) }, { x: Number(target.x), y: Number(target.y) }],
            length: distance,
          }],
          pathLength: distance,
        },
        sourceRegionId: sourceClaim.mainRegionId,
        targetRegionId: sourceClaim.mainRegionId,
      });
      targetDoc = candidate;
      armyId = candidateArmyId;
      break;
    } catch (error) {
      if (!String(error?.message || "").includes("route crosses")) throw error;
    }
  }
  assert(targetDoc && sent, "No reachable neutral target was available for the army smoke test.");
  assert(sent?.movement?.id === armyId, "Army order was not created.");
  const armyRefs = [
    db.doc(`armies/${armyId}`),
    db.doc(`islands/${sourceClaim.islandId}/armies/${armyId}`),
  ];
  await Promise.all(armyRefs.map(ref => ref.set({ arrivesAtMs: Date.now() - 1 }, { merge: true })));
  const resolved = await callFunction("resolveArmyOrder", attacker.token, {
    armyId,
    routeRegionIds: [sourceClaim.mainRegionId],
  });
  assert(resolved?.status === "resolved" && resolved?.outcome === "victory", "Army capture smoke test failed.");
  await waitForOwnershipEvents(51);

  const reinforcementTarget = (await targetDoc.ref.get()).data() || {};
  const reinforcementDistance = Math.hypot(
    Number(reinforcementTarget.x) - Number(source.x),
    Number(reinforcementTarget.y) - Number(source.y)
  );
  const reinforcementArmyId = `retarget_gate_${crypto.randomBytes(8).toString("hex")}`;
  await sourceRef.set({ troops: 100_000, troopFloat: 100_000 }, { merge: true });
  const reinforcement = await callFunction("sendArmyOrder", attacker.token, {
    army: {
      id: reinforcementArmyId,
      kind: "transfer",
      fromId: sourceClaim.cityId,
      toId: targetDoc.id,
      fromName: source.name || sourceClaim.cityId,
      toName: reinforcementTarget.name || targetDoc.id,
      troops: 20_000,
      requestedTroops: 20_000,
      sourceRegionId: sourceClaim.mainRegionId,
      targetRegionId: sourceClaim.mainRegionId,
      routeRegionIds: [sourceClaim.mainRegionId],
      viewRegionIds: [sourceClaim.mainRegionId],
      path: [
        { x: Number(source.x), y: Number(source.y) },
        { x: Number(reinforcementTarget.x), y: Number(reinforcementTarget.y) },
      ],
      pathSegments: [{
        regionId: sourceClaim.mainRegionId,
        points: [
          { x: Number(source.x), y: Number(source.y) },
          { x: Number(reinforcementTarget.x), y: Number(reinforcementTarget.y) },
        ],
        length: reinforcementDistance,
      }],
      pathLength: reinforcementDistance,
    },
    sourceRegionId: sourceClaim.mainRegionId,
    targetRegionId: sourceClaim.mainRegionId,
  });
  assert(reinforcement?.movement?.kind === "transfer", "Owned-city reinforcement did not launch as a transfer.");

  const retargetEventId = `retarget_gate_${crypto.randomBytes(8).toString("hex")}`;
  const retargetBatch = db.batch();
  retargetBatch.set(targetDoc.ref, {
    ownerKind: "player",
    ownerUid: users[1].uid,
    ownerName: "Ruler 2",
    ownerFlag: null,
    ownerShieldExpiresAtMs: 0,
    isMainCity: false,
    troops: 1_000,
    troopFloat: 1_000,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  retargetBatch.set(
    db.doc(`realmEvents/${realm.resetGeneration}/ownershipChanges/${retargetEventId}`),
    {
      eventId: retargetEventId,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      releaseId: realm.releaseId,
      targetType: "city",
      targetId: targetDoc.id,
      regionId: sourceClaim.mainRegionId,
      targetKey: `${sourceClaim.mainRegionId}:${targetDoc.id}`,
      beforeOwnerUid: attacker.uid,
      afterOwnerUid: users[1].uid,
      reason: "emulator_retarget_gate",
      status: "pending",
      attempts: 0,
      createdAtMs: Date.now(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
  );
  await retargetBatch.commit();
  await waitForOwnershipEvents(52);

  const retargetedArmyRef = db.doc(`armies/${reinforcementArmyId}`);
  const retargetedArmy = (await retargetedArmyRef.get()).data() || {};
  assert(retargetedArmy.kind === "attack", "Reinforcement did not become an attack after its target changed owner.");
  assert(retargetedArmy.targetOwnerUid === users[1].uid, "Retargeted attack did not follow the new city owner.");
  assert(retargetedArmy.retargetedFromKind === "transfer", "Retargeted attack lost its reinforcement origin.");
  assert(
    retargetedArmy.lastIncomingNotificationOwnerUid === users[1].uid,
    "The new defender was not marked for an incoming-attack notification."
  );

  const reinforcementArmyRefs = [
    retargetedArmyRef,
    db.doc(`islands/${sourceClaim.islandId}/armies/${reinforcementArmyId}`),
  ];
  await Promise.all(reinforcementArmyRefs.map(ref => ref.set({ arrivesAtMs: Date.now() - 1 }, { merge: true })));
  const retargetedResolution = await callFunction("resolveArmyOrder", attacker.token, {
    armyId: reinforcementArmyId,
    routeRegionIds: [sourceClaim.mainRegionId],
  });
  assert(
    retargetedResolution?.status === "resolved"
      && retargetedResolution?.kind === "attack"
      && retargetedResolution?.outcome === "victory",
    "Protected retargeted reinforcement did not capture after winning on arrival."
  );
  const retargetedAttackReport = (retargetedResolution.reports || [])
    .find(report => report.type === "attack" && report.outcome === "victory");
  assert(
    retargetedAttackReport?.attackProtection?.mode === "raid"
      && retargetedAttackReport.attackProtection.captureAllowed === false,
    "The converted reinforcement gate did not exercise recalculated protected-raid rules."
  );
  assert(
    retargetedAttackReport.survivors > 0
      && retargetedAttackReport.attackerLosses < retargetedAttackReport.sentTroops
      && /Reinforcements converted to an attack and captured the city/.test(retargetedAttackReport.summary),
    "Winning converted reinforcements did not retain survivors or report the capture clearly."
  );
  await waitForOwnershipEvents(53);

  console.log(`Emulator reset gate passed for 50 players: ${counts.join("/")} across starter islands.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
