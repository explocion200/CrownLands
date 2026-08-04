const { initializeApp } = require("firebase-admin/app");
const crypto = require("node:crypto");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const realm = require("../release-config.json");
const { getClanQuestPeriod } = require("../clanQuestPeriod.js");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

let functionsHostPromise = null;

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
      if (hubHost) {
        const response = await fetch(`http://${hubHost}/emulators`);
        if (!response.ok) {
          throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
        }
        const emulators = await response.json();
        const functions = emulators?.functions || {};
        const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
        const host = functions.host || listen?.address;
        const port = Number(functions.port || listen?.port);
        if (host && Number.isInteger(port) && port > 0) {
          return formatEmulatorHost(host, port);
        }
        throw new Error("Firebase Emulator Hub did not report a running Functions emulator.");
      }
      return "127.0.0.1:5001";
    })();
  }
  return functionsHostPromise;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const starterFlagColors = [
  "#1f5f91",
  "#b23a35",
  "#2f7a4a",
  "#6d4aa2",
  "#d3a62e",
  "#202a38",
  "#d9e2e8",
  "#8d5a2f",
];
const starterFlagPatterns = [
  "split",
  "diagonal",
  "band",
  "cross",
  "saltire",
  "chevron",
  "quartered",
  "pale",
  "chief",
  "bend",
];
const starterFlagSymbols = [
  "crown",
  "castle",
  "star",
  "swords",
  "fleur",
  "cross",
  "sun",
  "moon",
  "knight",
  "tower",
  "diamond",
  "spire",
];
const sharedDefaultFlag = {
  primary: "#1f5f91",
  secondary: "#d3a62e",
  pattern: "diagonal",
  symbol: "crown",
};

function assertRandomStarterFlag(flag, label) {
  assert(starterFlagColors.includes(flag?.primary), `${label} has an invalid primary flag color.`);
  assert(starterFlagColors.includes(flag?.secondary), `${label} has an invalid secondary flag color.`);
  assert(flag.primary !== flag.secondary, `${label} received matching flag colors.`);
  assert(starterFlagPatterns.includes(flag?.pattern), `${label} has an invalid flag pattern.`);
  assert(starterFlagSymbols.includes(flag?.symbol), `${label} has an invalid flag symbol.`);
  assert(JSON.stringify(flag) !== JSON.stringify(sharedDefaultFlag), `${label} received the shared default flag.`);
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
  if (!response.ok || body.error) {
    throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  }
  return body.result;
}

async function attemptClientDailyRewardMutation(user) {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/players/${user.uid}?updateMask.fieldPaths=dailyLoginReward`;
  return fetch(url, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${user.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        dailyLoginReward: {
          mapValue: {
            fields: {
              cycle: { integerValue: "99" },
              nextDay: { integerValue: "30" },
            },
          },
        },
      },
    }),
  });
}

async function attemptClientDocumentRead(user, documentPath) {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const normalizedPath = String(documentPath || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${normalizedPath}`;
  return fetch(url, {
    headers: {
      authorization: `Bearer ${user.token}`,
    },
  });
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

async function waitForOwnershipEventIds(eventIds, timeoutMs = 30000) {
  const ids = [...new Set(eventIds.filter(Boolean))];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshots = await Promise.all(ids.map(eventId => (
      db.doc(`realmEvents/${realm.resetGeneration}/ownershipChanges/${eventId}`).get()
    )));
    if (snapshots.every(snapshot => snapshot.exists && snapshot.data()?.status === "processed")) {
      return snapshots;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Ownership events did not settle: ${ids.join(", ")}.`);
}

async function waitForDocumentValue(ref, predicate, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await ref.get();
    if (snapshot.exists && predicate(snapshot.data() || {})) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Document did not reach the expected state: ${ref.path}.`);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function main() {
  const users = await Promise.all(Array.from({ length: 50 }, (_, index) => createAuthUser(index)));
  const queuedUser = await createAuthUser(50);
  const lobbySessions = users.map((_, index) => `lobby-session-${index}`);
  const lobbyJoins = await Promise.all(users.map((user, index) => callFunction("joinGameServer", user.token, {
    serverId: "crown-marches",
    sessionId: lobbySessions[index],
    displayName: `Lobby Ruler ${index + 1}`,
  })));
  assert(lobbyJoins.every(result => result?.status === "active"), "The first 50 concurrent realm joins were not all admitted.");
  const queuedJoin = await callFunction("joinGameServer", queuedUser.token, {
    serverId: "crown-marches",
    sessionId: "lobby-session-50",
    displayName: "Queued Ruler",
  });
  assert(queuedJoin?.status === "waiting", "The 51st realm join bypassed the waiting queue.");

  const serverDocumentId = `crown-marches-${realm.resetGeneration}`;
  const serverRef = db.doc(`gameServers/${serverDocumentId}`);
  const serverAfterJoins = (await serverRef.get()).data() || {};
  assert(
    Object.keys(serverAfterJoins.activeSlots || {}).length === 50
      && Object.keys(serverAfterJoins.waitingQueue || {}).length === 1
      && Number(serverAfterJoins.activeCount || 0) === 50
      && Number(serverAfterJoins.waitingCount || 0) === 1,
    "Realm capacity counters or queue state drifted after concurrent joins."
  );
  const sharedServerUpdatedAtMs = Number(serverAfterJoins.updatedAtMs || 0);
  const heartbeatResults = await Promise.all([
    ...users.map((user, index) => callFunction("heartbeatGameServer", user.token, {
      serverId: "crown-marches",
      sessionId: lobbySessions[index],
      displayName: `Lobby Ruler ${index + 1}`,
    })),
    callFunction("heartbeatGameServer", queuedUser.token, {
      serverId: "crown-marches",
      sessionId: "lobby-session-50",
      displayName: "Queued Ruler",
    }),
  ]);
  assert(
    heartbeatResults.filter(result => result?.status === "active").length === 50
      && heartbeatResults.filter(result => result?.status === "waiting").length === 1,
    "Sharded heartbeats changed realm admission state."
  );
  const serverAfterHeartbeats = (await serverRef.get()).data() || {};
  assert(
    Number(serverAfterHeartbeats.updatedAtMs || 0) === sharedServerUpdatedAtMs,
    "Player heartbeats rewrote the shared realm-capacity document."
  );
  const memberSnapshot = await serverRef.collection("members").get();
  assert(
    memberSnapshot.size === 51
      && memberSnapshot.docs.every(doc => Number(doc.data()?.heartbeatModelVersion || 0) === 2),
    "Per-player realm heartbeat documents were not written for every active or waiting player."
  );
  const replacedHeartbeat = await callFunction("heartbeatGameServer", users[0].token, {
    serverId: "crown-marches",
    sessionId: "replaced-lobby-session",
    displayName: "Old Browser",
  });
  assert(replacedHeartbeat?.status === "session-replaced", "An old browser heartbeat replaced the current realm session.");
  const leaveResult = await callFunction("leaveGameServer", users[0].token, {
    serverId: "crown-marches",
    sessionId: lobbySessions[0],
  });
  assert(leaveResult?.status === "left", "An active realm slot could not be released.");
  const [serverAfterPromotionSnap, queuedMembershipSnap] = await Promise.all([
    serverRef.get(),
    db.doc(`players/${queuedUser.uid}/serverMembership/current`).get(),
  ]);
  const serverAfterPromotion = serverAfterPromotionSnap.data() || {};
  const promotionActiveCount = Object.keys(serverAfterPromotion.activeSlots || {}).length;
  const promotionWaitingCount = Object.keys(serverAfterPromotion.waitingQueue || {}).length;
  const promotedMembershipStatus = queuedMembershipSnap.data()?.status || "missing";
  assert(
    promotionActiveCount === 50
      && promotionWaitingCount === 0
      && promotedMembershipStatus === "active",
    `Leaving an active slot did not promote the first waiting player (active=${promotionActiveCount}, waiting=${promotionWaitingCount}, membership=${promotedMembershipStatus}).`
  );

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
  const newPlayerProfiles = await Promise.all(users.slice(1).map(async user => (
    (await db.doc(`players/${user.uid}`).get()).data() || {}
  )));
  const newPlayerFlags = newPlayerProfiles.map((newProfile, index) => {
    assertRandomStarterFlag(newProfile.flag, `New player ${index + 2}`);
    return JSON.stringify(newProfile.flag);
  });
  assert(
    new Set(newPlayerFlags).size > 1,
    "Concurrent new players all received the same generated flag."
  );

  const starterRegions = ["region_11", "region_12", "region_13", "region_14", "region_15"];
  const islandSnapshots = await Promise.all(starterRegions.map(regionId => (
    db.doc(`islands/${realm.worldId}-${regionId}`).get()
  )));
  const counts = islandSnapshots.map(snapshot => Number(snapshot.data()?.playerCount) || 0);
  assert(counts.reduce((sum, count) => sum + count, 0) === 50, `Starter counts do not total 50: ${counts.join(",")}`);
  assert(Math.max(...counts) - Math.min(...counts) <= 1, `Starter islands are imbalanced: ${counts.join(",")}`);

  const idempotentResults = await mapWithConcurrency(
    users,
    10,
    (user, index) => callFunction("claimStartingCity", user.token, { playerName: `Changed ${index}` }),
  );
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
  const economyResults = await mapWithConcurrency(
    users,
    10,
    user => callFunction("collectEconomy", user.token),
  );
  assert(economyResults.every(result => result?.ok !== false), "A 50-player economy collection failed.");
  const eventsAfterEconomy = await db.collection(`realmEvents/${realm.resetGeneration}/ownershipChanges`).get();
  assert(eventsAfterEconomy.size === eventsBeforeEconomy.size, "Economy checkpoints created ownership events.");

  const firstStats = (await db.doc(`players/${users[0].uid}/stats/global`).get()).data() || {};
  assert(firstStats.resetGeneration === realm.resetGeneration, "Stats were written to the wrong generation.");
  assert(firstStats.totalCities === 1, "Archived cities leaked into current-generation statistics.");

  const dailyStatus = await callFunction("getDailyLoginRewardStatus", users[0].token);
  assert(
    dailyStatus?.dailyLoginRewardStatus?.eligible === true
      && dailyStatus.dailyLoginRewardStatus.nextDay === 1
      && dailyStatus.dailyLoginRewardStatus.cycle === 1
      && dailyStatus.dailyLoginRewardStatus.pendingCount === 1
      && dailyStatus.dailyLoginRewardStatus.attendedToday === true,
    "A fresh reset profile did not begin on daily reward cycle 1, day 1."
  );
  const dailyGoldBefore = Number((await db.doc(`players/${users[0].uid}`).get()).data()?.gold || 0);
  const dayOneClaimRequest = {
    claimId: "emulator-day-1",
    expectedOrdinal: 1,
  };
  const concurrentDailyClaims = await Promise.all([
    callFunction("claimDailyLoginReward", users[0].token, dayOneClaimRequest),
    callFunction("claimDailyLoginReward", users[0].token, dayOneClaimRequest),
  ]);
  assert(
    concurrentDailyClaims.filter(result => result?.replayed === false).length === 1
      && concurrentDailyClaims.filter(result => result?.replayed === true).length === 1,
    "Concurrent daily reward claims did not produce one payout and one replay."
  );
  const dayOneClaim = concurrentDailyClaims.find(result => result?.replayed === false);
  const dayOneReplay = concurrentDailyClaims.find(result => result?.replayed === true);
  assert(
    dayOneClaim?.receipt?.day === 1
      && dayOneClaim.receipt.ordinal === 1
      && dayOneClaim.receipt.claimId === dayOneClaimRequest.claimId
      && dayOneClaim.receipt.goldHours === 1
      && dayOneClaim.receipt.gold > 0
      && JSON.stringify(dayOneClaim.receipt) === JSON.stringify(dayOneReplay?.receipt),
    "The day-1 daily reward receipt was not deterministic."
  );
  const dayOneProfile = (await db.doc(`players/${users[0].uid}`).get()).data() || {};
  assert(dayOneProfile.dailyLoginReward?.totalClaims === 1, "A concurrent daily claim advanced the track more than once.");
  assert(
    Number(dayOneProfile.gold || 0) >= dailyGoldBefore + Number(dayOneClaim.receipt.gold || 0),
    "The day-1 gold reward was not credited."
  );
  const sameDayReplay = await callFunction("claimDailyLoginReward", users[0].token, dayOneClaimRequest);
  assert(sameDayReplay?.replayed === true, "A repeated same-day daily reward claim was not idempotent.");

  const currentUtcDayKey = new Date().toISOString().slice(0, 10);
  const previousUtcDayKey = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await db.doc(`players/${users[0].uid}`).set({
    upgrades: { taxStewardship: 25, royalGranaries: 25 },
    itemEffects: {
      warDrumsExpiresAtMs: Date.now() + 60 * 60 * 1000,
      royalTaxDecreeExpiresAtMs: Date.now() + 60 * 60 * 1000,
    },
    dailyLoginReward: {
      schemaVersion: 2,
      nextClaimOrdinal: 5,
      earnedThroughOrdinal: 5,
      totalClaims: 4,
      lastAttendanceDayKey: currentUtcDayKey,
      lastClaimDayKey: previousUtcDayKey,
      lastClaimedAtMs: Date.now() - 24 * 60 * 60 * 1000,
    },
  }, { merge: true });
  const dayFiveProfileBefore = (await db.doc(`players/${users[0].uid}`).get()).data() || {};
  const dayFiveCityRef = db.doc(`islands/${claims[0].islandId}/cities/${claims[0].cityId}`);
  const dayFiveClaim = await callFunction("claimDailyLoginReward", users[0].token, {
    claimId: "emulator-day-5",
    expectedOrdinal: 5,
  });
  assert(
    dayFiveClaim?.receipt?.day === 5
      && dayFiveClaim.receipt.goldHours === 0
      && dayFiveClaim.receipt.troopHours === 0
      && dayFiveClaim.receipt.items?.war_drums_30m === 1,
    "The day-5 item reward did not match the fixed schedule."
  );
  const dayFiveProfileAfter = (await db.doc(`players/${users[0].uid}`).get()).data() || {};
  assert(
    Number(dayFiveProfileAfter.shopItems?.war_drums_30m || 0)
      === Number(dayFiveProfileBefore.shopItems?.war_drums_30m || 0) + 1,
    "The day-5 item was not added to the bag."
  );

  await db.doc(`players/${users[0].uid}`).set({
    dailyLoginReward: {
      schemaVersion: 2,
      nextClaimOrdinal: 6,
      earnedThroughOrdinal: 6,
      totalClaims: 5,
      lastAttendanceDayKey: currentUtcDayKey,
    },
  }, { merge: true });
  const daySixClaim = await callFunction("claimDailyLoginReward", users[0].token, {
    claimId: "emulator-day-6",
    expectedOrdinal: 6,
  });
  assert(
    daySixClaim?.receipt?.day === 6
      && daySixClaim.receipt.goldHours === 3
      && daySixClaim.receipt.gold === Math.floor(Number(firstStats.baseGoldPerHour || 0) * 3),
    "Daily gold hours included skill, Stronghold, or temporary production bonuses."
  );

  await db.doc(`players/${users[0].uid}`).set({
    dailyLoginReward: {
      schemaVersion: 2,
      nextClaimOrdinal: 7,
      earnedThroughOrdinal: 7,
      totalClaims: 6,
      lastAttendanceDayKey: currentUtcDayKey,
    },
  }, { merge: true });
  const daySevenCityBefore = (await dayFiveCityRef.get()).data() || {};
  const daySevenClaim = await callFunction("claimDailyLoginReward", users[0].token, {
    claimId: "emulator-day-7",
    expectedOrdinal: 7,
  });
  const daySevenCityAfter = (await dayFiveCityRef.get()).data() || {};
  assert(
    daySevenClaim?.receipt?.day === 7
      && daySevenClaim.receipt.troopHours === 3
      && daySevenClaim.receipt.troops === Math.floor(Number(firstStats.baseTroopPerHour || 0) * 3),
    "Daily troop hours included skill, Stronghold, or temporary production bonuses."
  );
  assert(
    Number(daySevenCityAfter.troops || 0)
      >= Number(daySevenCityBefore.troops || 0) + Number(daySevenClaim.receipt.troops || 0),
    "The day-7 troop reward was not credited to the main city."
  );

  await db.doc(`players/${users[0].uid}`).set({
    dailyLoginReward: {
      schemaVersion: 2,
      nextClaimOrdinal: 30,
      earnedThroughOrdinal: 30,
      totalClaims: 29,
      lastAttendanceDayKey: currentUtcDayKey,
      lastClaimDayKey: previousUtcDayKey,
      lastClaimedAtMs: Date.now() - 24 * 60 * 60 * 1000,
    },
  }, { merge: true });
  const dayThirtyItemsBefore = (await db.doc(`players/${users[0].uid}`).get()).data()?.shopItems || {};
  const dayThirtyClaim = await callFunction("claimDailyLoginReward", users[0].token, {
    claimId: "emulator-day-30",
    expectedOrdinal: 30,
  });
  assert(
    dayThirtyClaim?.receipt?.day === 30
      && dayThirtyClaim.receipt.goldHours === 0
      && dayThirtyClaim.receipt.troopHours === 0
      && dayThirtyClaim.receipt.items?.shield_12h === 1
      && dayThirtyClaim.dailyLoginRewardStatus?.cycle === 2
      && dayThirtyClaim.dailyLoginRewardStatus?.nextDay === 1,
    "Day 30 did not complete the cycle and restart at cycle 2, day 1."
  );
  const dayThirtyItemsAfter = (await db.doc(`players/${users[0].uid}`).get()).data()?.shopItems || {};
  assert(
    Number(dayThirtyItemsAfter.shield_12h || 0) === Number(dayThirtyItemsBefore.shield_12h || 0) + 1,
    "Day 30 did not credit the Royal Peace Shield."
  );

  await db.doc(`players/${users[1].uid}`).update({
    dailyLoginReward: {
      schemaVersion: 1,
      cycle: 3,
      nextDay: 14,
      totalClaims: 73,
      lastClaimDayKey: "2020-01-01",
      lastClaimedAtMs: Date.UTC(2020, 0, 1),
    },
  });
  const pausedDailyStatus = await callFunction("getDailyLoginRewardStatus", users[1].token);
  assert(
    pausedDailyStatus?.dailyLoginRewardStatus?.eligible === true
      && pausedDailyStatus.dailyLoginRewardStatus.cycle === 3
      && pausedDailyStatus.dailyLoginRewardStatus.nextDay === 14,
    "Missing UTC days reset or skipped daily reward progress."
  );
  const deniedDailyMutation = await attemptClientDailyRewardMutation(users[1]);
  assert(deniedDailyMutation.status === 403, "Firestore rules allowed a client to rewrite daily reward state.");

  const invalidMainCityRef = db.doc(`islands/${claims[2].islandId}/cities/${claims[2].cityId}`);
  const invalidMainCityBefore = (await invalidMainCityRef.get()).data() || {};
  const invalidMainProfileRef = db.doc(`players/${users[2].uid}`);
  const invalidMainProfileBefore = (await invalidMainProfileRef.get()).data() || {};
  await invalidMainCityRef.set({ ownerKind: "neutral", ownerUid: "" }, { merge: true });
  let invalidMainRejected = false;
  try {
    await callFunction("claimDailyLoginReward", users[2].token);
  } catch (error) {
    invalidMainRejected = /main city/i.test(String(error?.message || error));
  }
  assert(invalidMainRejected, "A daily reward was allowed without a valid current-generation main city.");
  const invalidMainProfileAfter = (await invalidMainProfileRef.get()).data() || {};
  assert(
    Number(invalidMainProfileAfter.gold || 0) === Number(invalidMainProfileBefore.gold || 0)
      && Number(invalidMainProfileAfter.dailyLoginReward?.totalClaims || 0)
        === Number(invalidMainProfileBefore.dailyLoginReward?.totalClaims || 0),
    "A rejected daily claim partially credited or advanced the player."
  );
  await invalidMainCityRef.set(invalidMainCityBefore);

  const mismatchedProfileRef = db.doc(`players/${users[3].uid}`);
  await mismatchedProfileRef.set({
    resetGeneration: "archived-generation",
    worldId: "main-archived-generation",
  }, { merge: true });
  let mismatchedGenerationRejected = false;
  try {
    await callFunction("getDailyLoginRewardStatus", users[3].token);
  } catch (error) {
    mismatchedGenerationRejected = /current crownlands world/i.test(String(error?.message || error));
  }
  assert(mismatchedGenerationRejected, "An archived-generation profile received a daily reward status.");
  await mismatchedProfileRef.set({
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
  }, { merge: true });

  const clanLeader = users[48];
  const clanApplicant = users[49];
  const clanLeaderRef = db.doc(`players/${clanLeader.uid}`);
  const clanApplicantRef = db.doc(`players/${clanApplicant.uid}`);
  const clanLeaderLoginAtMs = Date.now() - 90_000;
  const clanApplicantLoginAtMs = Date.now() - 45_000;
  await Promise.all([
    clanLeaderRef.set({
      character: { level: 9, xp: 0, skillPoints: 8 },
      gold: 100_000,
      goldFloat: 100_000,
      economyUpdatedAtMs: Date.now(),
      lastLoginAt: clanLeaderLoginAtMs,
      activeSession: { loginAtMs: clanLeaderLoginAtMs },
    }, { merge: true }),
    clanApplicantRef.set({
      character: { level: 10, xp: 0, skillPoints: 9 },
      lastLoginAt: clanApplicantLoginAtMs,
      activeSession: { loginAtMs: clanApplicantLoginAtMs },
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
  const clanLeaderMemberSnapshot = await db.doc(`clans/${applicationClanId}/members/${clanLeader.uid}`).get();
  assert(
    clanLeaderMemberSnapshot.data()?.lastLoginAtMs === clanLeaderLoginAtMs,
    "Creating a clan did not preserve the leader's authenticated login time."
  );

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
  assert(
    acceptedMemberSnapshot.data()?.lastLoginAtMs === clanApplicantLoginAtMs,
    "Joining a clan did not preserve the member's authenticated login time."
  );
  const refreshedClanApplicantLoginAtMs = Date.now();
  await clanApplicantRef.set({
    lastLoginAt: refreshedClanApplicantLoginAtMs,
    activeSession: { loginAtMs: refreshedClanApplicantLoginAtMs },
  }, { merge: true });
  const refreshedClanMemberSnapshot = await waitForDocumentValue(
    db.doc(`clans/${applicationClanId}/members/${clanApplicant.uid}`),
    member => member.lastLoginAtMs === refreshedClanApplicantLoginAtMs
  );
  assert(
    refreshedClanMemberSnapshot.data()?.lastLoginAtMs === refreshedClanApplicantLoginAtMs,
    "A new authenticated login did not refresh the clan roster timer."
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
  assert(
    Number(publicApplicantProfile?.troopEstimate?.min) > 0
      && Number(publicApplicantProfile?.troopEstimate?.max) >= Number(publicApplicantProfile?.troopEstimate?.min)
      && typeof publicApplicantProfile?.troopEstimate?.label === "string"
      && Number(publicApplicantProfile?.troopEstimate?.updatedAtMs) > 0,
    "The public player profile did not return a valid on-demand troop estimate."
  );
  assert(
    !("totalTroops" in publicApplicantProfile)
      && !("totalMilitaryTroops" in publicApplicantProfile)
      && !("troopStats" in publicApplicantProfile),
    "The public player profile exposed an exact troop total."
  );
  let memberRenameError = null;
  try {
    await callFunction("updateClanProfile", clanApplicant.token, { name: "Member Renamed Clan" });
  } catch (error) {
    memberRenameError = error;
  }
  assert(
    /clan role does not allow that action/i.test(String(memberRenameError?.message || "")),
    "A nonleader was allowed to rename the clan."
  );
  const renameFundedAtMs = Date.now();
  await clanLeaderRef.set({
    gold: 600_000,
    goldFloat: 600_000,
    economyUpdatedAtMs: renameFundedAtMs,
  }, { merge: true });
  await db.doc(`clanNameReservations/${realm.resetGeneration}_taken-gate`).set({
    clanId: "another-clan",
    reusableAtMs: Number.MAX_SAFE_INTEGER,
  });
  let duplicateRenameError = null;
  try {
    await callFunction("updateClanProfile", clanLeader.token, { name: "Taken Gate" });
  } catch (error) {
    duplicateRenameError = error;
  }
  assert(
    /already in use/i.test(String(duplicateRenameError?.message || ""))
      && Number((await clanLeaderRef.get()).data()?.gold || 0) === 600_000,
    "A reserved clan name was accepted or charged gold."
  );
  const renameStartedAtMs = Date.now();
  const renamedClanResult = await callFunction("updateClanProfile", clanLeader.token, {
    name: "Renamed Gate",
  });
  const renameFinishedAtMs = Date.now();
  assert(
    renamedClanResult?.nameChanged === true
      && renamedClanResult?.clan?.name === "Renamed Gate"
      && renamedClanResult?.gold === 100_000,
    "A valid leader clan rename did not charge exactly 500,000 gold."
  );
  const [
    renamedClanSnap,
    renamedLeaderSnap,
    renamedApplicantSnap,
    renamedClanLeaderboardSnap,
    newNameReservationSnap,
    oldNameReservationSnap,
  ] = await Promise.all([
    db.doc(`clans/${applicationClanId}`).get(),
    clanLeaderRef.get(),
    clanApplicantRef.get(),
    db.doc(`clanLeaderboards/${realm.resetGeneration}/entries/${applicationClanId}`).get(),
    db.doc(`clanNameReservations/${realm.resetGeneration}_renamed-gate`).get(),
    db.doc(`clanNameReservations/${realm.resetGeneration}_application-gate`).get(),
  ]);
  const renamedClanData = renamedClanSnap.data() || {};
  const renamedClanState = {
    name: renamedClanData.name,
    normalizedName: renamedClanData.normalizedName,
    lastNameChangedAtMs: Number(renamedClanData.lastNameChangedAtMs || 0),
    nextNameChangeAtMs: Number(renamedClanData.nextNameChangeAtMs || 0),
    renameStartedAtMs,
    renameFinishedAtMs,
  };
  assert(
    renamedClanState.name === "Renamed Gate"
      && renamedClanState.normalizedName === "renamed-gate"
      && renamedClanState.lastNameChangedAtMs >= renameStartedAtMs - 1_000
      && renamedClanState.lastNameChangedAtMs <= renameFinishedAtMs + 1_000
      && renamedClanState.nextNameChangeAtMs - renamedClanState.lastNameChangedAtMs
        === 7 * 24 * 60 * 60 * 1000,
    `The clan rename did not persist its canonical name and seven-day cooldown: ${JSON.stringify(renamedClanState)}`
  );
  assert(
    renamedLeaderSnap.data()?.clanName === "Renamed Gate"
      && renamedApplicantSnap.data()?.clanName === "Renamed Gate"
      && renamedClanLeaderboardSnap.data()?.name === "Renamed Gate"
      && Number(renamedLeaderSnap.data()?.goldFloat || 0) < 100_001,
    "The renamed clan identity did not propagate to member profiles and clan rankings."
  );
  assert(
    newNameReservationSnap.data()?.clanId === applicationClanId
      && Number(newNameReservationSnap.data()?.reusableAtMs || 0) === Number.MAX_SAFE_INTEGER,
    "The new clan name was not reserved transactionally."
  );
  assert(
    oldNameReservationSnap.data()?.clanId === applicationClanId
      && Number(oldNameReservationSnap.data()?.reusableAtMs || 0)
        === renamedClanState.lastNameChangedAtMs + (7 * 24 * 60 * 60 * 1000),
    "The previous clan name was not held for its seven-day release period."
  );
  const goldAfterRename = Number(renamedLeaderSnap.data()?.gold || 0);
  const replayedRename = await callFunction("updateClanProfile", clanLeader.token, {
    name: "Renamed Gate",
  });
  assert(
    replayedRename?.nameChanged === false
      && Number((await clanLeaderRef.get()).data()?.gold || 0) === goldAfterRename
      && Number((await db.doc(`clans/${applicationClanId}`).get()).data()?.nextNameChangeAtMs || 0)
        === Number(renamedClanData.nextNameChangeAtMs || 0),
    "Retrying the confirmed clan name charged gold or extended the cooldown."
  );
  let weeklyRenameError = null;
  try {
    await callFunction("updateClanProfile", clanLeader.token, { name: "Renamed Too Soon" });
  } catch (error) {
    weeklyRenameError = error;
  }
  assert(
    /once every seven days/i.test(String(weeklyRenameError?.message || ""))
      && Number((await clanLeaderRef.get()).data()?.gold || 0) === goldAfterRename,
    "The seven-day clan rename cooldown was not enforced without charging gold."
  );
  const [leaderRewardsBeforeGift, applicantRewardsBeforeGift] = await Promise.all([
    db.doc(`clans/${applicationClanId}/memberRewards/${clanLeader.uid}`).get(),
    db.doc(`clans/${applicationClanId}/memberRewards/${clanApplicant.uid}`).get(),
  ]);
  assert(leaderRewardsBeforeGift.exists && applicantRewardsBeforeGift.exists, "Clan member reward state was not created with membership.");
  const sentGift = await callFunction("sendClanGift", clanLeader.token);
  assert(sentGift?.recipientCount === 1 && sentGift?.productionMinutes === 30, "Clan gift did not reach every other current member.");
  const giftActivityAfterGift = await db.doc(`clans/${applicationClanId}/giftActivity/${realm.resetGeneration}`).get();
  const recentDonationsAfterGift = giftActivityAfterGift.data()?.recentDonations || [];
  assert(
    giftActivityAfterGift.exists
      && recentDonationsAfterGift.length === 1
      && recentDonationsAfterGift[0]?.donorUid === clanLeader.uid
      && recentDonationsAfterGift[0]?.donorName
      && Number(recentDonationsAfterGift[0]?.sentAtMs || 0) > 0
      && sentGift?.giftActivity?.recentDonations?.[0]?.donorUid === clanLeader.uid,
    "Clan gift activity did not publish the latest donor snapshot."
  );
  const [leaderRewardsAfterGift, applicantRewardsAfterGift] = await Promise.all([
    db.doc(`clans/${applicationClanId}/memberRewards/${clanLeader.uid}`).get(),
    db.doc(`clans/${applicationClanId}/memberRewards/${clanApplicant.uid}`).get(),
  ]);
  assert(
    Number(leaderRewardsAfterGift.data()?.pendingGiftGoldMinutes || 0) === 0,
    "The clan gift sender received their own gift."
  );
  assert(
    Number(applicantRewardsAfterGift.data()?.pendingGiftGoldMinutes || 0) === 30,
    "The clan gift recipient did not receive 30 pending production minutes."
  );
  let giftCooldownError = null;
  try {
    await callFunction("sendClanGift", clanLeader.token);
  } catch (error) {
    giftCooldownError = error;
  }
  assert(/still cooling down/.test(String(giftCooldownError?.message || "")), "The five-hour clan gift cooldown was not enforced.");
  const applicantGoldBeforeGiftClaim = Number((await clanApplicantRef.get()).data()?.gold || 0);
  const giftClaim = await callFunction("claimClanGiftPool", clanApplicant.token);
  const applicantRewardsAfterClaim = await db.doc(`clans/${applicationClanId}/memberRewards/${clanApplicant.uid}`).get();
  assert(giftClaim?.claimed === true && giftClaim?.reward > 0, "Clan gift collection did not award current base gold production.");
  assert(
    Number(applicantRewardsAfterClaim.data()?.pendingGiftGoldMinutes || 0) === 0,
    "Clan gift collection did not clear the pending production pool."
  );
  assert(
    Number((await clanApplicantRef.get()).data()?.gold || 0) >= applicantGoldBeforeGiftClaim + Number(giftClaim.reward || 0),
    "Clan gift collection did not immediately credit the player's gold."
  );

  const clanSecondSender = users[46];
  const clanSecondSenderRef = db.doc(`players/${clanSecondSender.uid}`);
  await clanSecondSenderRef.set({
    character: { level: 10, xp: 0, skillPoints: 9 },
  }, { merge: true });
  await callFunction("applyToClan", clanSecondSender.token, {
    clanId: applicationClanId,
    message: "Reinforcement recipient-cap gate",
  });
  await callFunction("reviewClanApplication", clanLeader.token, {
    clanId: applicationClanId,
    applicantUid: clanSecondSender.uid,
    accept: true,
  });

  const clanReinforcementSourceClaim = claims[48];
  const clanReinforcementHolderClaim = claims[49];
  const clanReinforcementSourceRef = db.doc(
    `islands/${clanReinforcementSourceClaim.islandId}/cities/${clanReinforcementSourceClaim.cityId}`
  );
  const clanReinforcementSource = (await clanReinforcementSourceRef.get()).data() || {};
  await clanReinforcementSourceRef.set({ troops: 10_000, troopFloat: 10_000 }, { merge: true });
  const alliedBounceCandidatesSnapshot = await db
    .collection(`islands/${clanReinforcementSourceClaim.islandId}/cities`)
    .where("ownerUid", "==", null)
    .get();
  const alliedBounceCandidates = alliedBounceCandidatesSnapshot.docs
    .filter(doc => !doc.data()?.strongholdType && doc.id !== clanReinforcementSourceClaim.cityId)
    .sort((left, right) => {
      const leftData = left.data() || {};
      const rightData = right.data() || {};
      const leftDistance = Math.hypot(
        Number(leftData.x) - Number(clanReinforcementSource.x),
        Number(leftData.y) - Number(clanReinforcementSource.y)
      );
      const rightDistance = Math.hypot(
        Number(rightData.x) - Number(clanReinforcementSource.x),
        Number(rightData.y) - Number(clanReinforcementSource.y)
      );
      return leftDistance - rightDistance;
    });
  let alliedBounceTargetDoc = null;
  let alliedBounceLaunch = null;
  const alliedBounceArmyId = `allied_bounce_${crypto.randomBytes(8).toString("hex")}`;
  for (const candidate of alliedBounceCandidates) {
    const originalTarget = candidate.data() || {};
    const distance = Math.hypot(
      Number(originalTarget.x) - Number(clanReinforcementSource.x),
      Number(originalTarget.y) - Number(clanReinforcementSource.y)
    );
    await candidate.ref.set({
      ownerKind: "player",
      ownerUid: users[47].uid,
      ownerName: "Ruler 48",
      ownerFlag: null,
      ownerShieldExpiresAtMs: 0,
      isMainCity: false,
      level: 1,
      defense: 1,
      troops: 100,
      troopFloat: 100,
    }, { merge: true });
    try {
      alliedBounceLaunch = await callFunction("sendArmyOrder", clanLeader.token, {
        army: {
          id: alliedBounceArmyId,
          kind: "attack",
          fromId: clanReinforcementSourceClaim.cityId,
          toId: candidate.id,
          fromName: clanReinforcementSource.name || clanReinforcementSourceClaim.cityId,
          toName: originalTarget.name || candidate.id,
          troops: 500,
          requestedTroops: 500,
          sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
          targetRegionId: clanReinforcementSourceClaim.mainRegionId,
          routeRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          viewRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          path: [
            { x: Number(clanReinforcementSource.x), y: Number(clanReinforcementSource.y) },
            { x: Number(originalTarget.x), y: Number(originalTarget.y) },
          ],
          pathSegments: [{
            regionId: clanReinforcementSourceClaim.mainRegionId,
            points: [
              { x: Number(clanReinforcementSource.x), y: Number(clanReinforcementSource.y) },
              { x: Number(originalTarget.x), y: Number(originalTarget.y) },
            ],
            length: distance,
          }],
          pathLength: distance,
        },
        sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
        targetRegionId: clanReinforcementSourceClaim.mainRegionId,
      });
      alliedBounceTargetDoc = candidate;
      break;
    } catch (error) {
      await candidate.ref.set(originalTarget);
      if (!String(error?.message || "").includes("route crosses")) throw error;
    }
  }
  assert(alliedBounceTargetDoc && alliedBounceLaunch, "No reachable enemy city was available for the allied bounce gate.");
  const alliedBounceTroops = Number(alliedBounceLaunch.movement.troops || 0);
  assert(alliedBounceTroops > 0, "The allied bounce gate did not launch troops.");
  const alliedBouncePublicPath = `islands/${clanReinforcementSourceClaim.islandId}/armies/${alliedBounceArmyId}`;
  const alliedBounceIncomingPath = `players/${users[47].uid}/incomingArmies/${alliedBounceArmyId}`;
  const [
    alliedBounceCanonicalProjection,
    alliedBouncePublicProjection,
    alliedBounceIncomingProjection,
    defenderCanonicalRead,
    defenderIncomingRead,
    attackerCanonicalRead,
  ] = await Promise.all([
    db.doc(`armies/${alliedBounceArmyId}`).get(),
    db.doc(alliedBouncePublicPath).get(),
    db.doc(alliedBounceIncomingPath).get(),
    attemptClientDocumentRead(users[47], `armies/${alliedBounceArmyId}`),
    attemptClientDocumentRead(users[47], alliedBounceIncomingPath),
    attemptClientDocumentRead(clanLeader, `armies/${alliedBounceArmyId}`),
  ]);
  assert(
    Number(alliedBounceCanonicalProjection.data()?.troops || 0) === alliedBounceTroops,
    "The army owner lost the exact canonical troop count."
  );
  assert(
    alliedBouncePublicProjection.exists
      && alliedBouncePublicProjection.data()?.troops === undefined
      && alliedBouncePublicProjection.data()?.troopVisibility === "estimate"
      && Number(alliedBouncePublicProjection.data()?.troopEstimateMin || 0) < alliedBounceTroops
      && Number(alliedBouncePublicProjection.data()?.troopEstimateMax || 0) >= alliedBounceTroops
      && Boolean(alliedBouncePublicProjection.data()?.troopEstimateLabel),
    "The public hostile-army projection exposed exact troops or used the wrong estimate."
  );
  assert(
    alliedBounceIncomingProjection.exists
      && alliedBounceIncomingProjection.data()?.troops === undefined
      && alliedBounceIncomingProjection.data()?.troopVisibility === "estimate"
      && Number(alliedBounceIncomingProjection.data()?.troopEstimateMin || 0) < alliedBounceTroops
      && Number(alliedBounceIncomingProjection.data()?.troopEstimateMax || 0) >= alliedBounceTroops
      && alliedBounceIncomingProjection.data()?.troopEstimateLabel
        === alliedBouncePublicProjection.data()?.troopEstimateLabel,
    "The defender's private incoming projection exposed exact troops or used the wrong estimate."
  );
  assert(defenderCanonicalRead.status === 403, "The defender could read the canonical exact army document.");
  assert(defenderIncomingRead.status === 200, "The defender could not read their incoming army estimate.");
  assert(attackerCanonicalRead.status === 200, "The army owner could not read their canonical exact army document.");
  const alliedBounceArmyRefs = [
    db.doc(`armies/${alliedBounceArmyId}`),
    db.doc(`islands/${clanReinforcementSourceClaim.islandId}/armies/${alliedBounceArmyId}`),
  ];
  const alliedBounceTravelMs = Math.max(
    1000,
    Number(alliedBounceLaunch.movement.arrivesAtMs) - Number(alliedBounceLaunch.movement.launchedAtMs)
  );
  const forcedAlliedBounceArrivalMs = Date.now();
  await Promise.all([
    ...alliedBounceArmyRefs.map(ref => ref.set({
      launchedAtMs: forcedAlliedBounceArrivalMs - alliedBounceTravelMs,
      arrivesAtMs: forcedAlliedBounceArrivalMs - 1,
    }, { merge: true })),
    alliedBounceTargetDoc.ref.set({
      ownerKind: "player",
      ownerUid: clanApplicant.uid,
      ownerName: "Ruler 50",
      ownerFlag: null,
      ownerShieldExpiresAtMs: 0,
      isMainCity: false,
      troops: 100,
      troopFloat: 100,
    }, { merge: true }),
  ]);
  const alliedBounceSourceAfterLaunch = Number((await clanReinforcementSourceRef.get()).data()?.troops || 0);
  const alliedBounceStarted = await callFunction("resolveArmyOrder", clanLeader.token, {
    armyId: alliedBounceArmyId,
    routeRegionIds: [clanReinforcementSourceClaim.mainRegionId],
  });
  const [alliedBounceActiveSnapshot, alliedBounceSourceWhileReturning, alliedBounceIncomingAfterReturn] = await Promise.all([
    alliedBounceArmyRefs[0].get(),
    clanReinforcementSourceRef.get(),
    db.doc(alliedBounceIncomingPath).get(),
  ]);
  const alliedBounceActive = alliedBounceActiveSnapshot.data() || {};
  assert(
    alliedBounceStarted?.status === "returning"
      && alliedBounceStarted?.outcome === "allied_return_started",
    "An attack whose target became allied did not start a routed return."
  );
  assert(
    alliedBounceActive.status === "active"
      && alliedBounceActive.returning === true
      && alliedBounceActive.returnStartProgress === 1
      && alliedBounceActive.returnDestinationId === clanReinforcementSourceClaim.cityId
      && Number(alliedBounceActive.arrivesAtMs) > Date.now(),
    "The allied-target army did not remain active on its original reverse route."
  );
  assert(
    Number(alliedBounceSourceWhileReturning.data()?.troops || 0) < alliedBounceSourceAfterLaunch + alliedBounceTroops,
    "The allied-target troops teleported into their source city before the return arrived."
  );
  assert(!alliedBounceIncomingAfterReturn.exists, "A defender incoming estimate remained after the army began returning.");
  const alliedBounceSourceBeforeReturn = Number((await clanReinforcementSourceRef.get()).data()?.troops || 0);
  const alliedBounceCompleted = await forceResolveMovement(alliedBounceStarted.movement, clanLeader.token);
  const [alliedBounceResolvedSnapshot, alliedBounceSourceAfterReturn] = await Promise.all([
    alliedBounceArmyRefs[0].get(),
    clanReinforcementSourceRef.get(),
  ]);
  assert(
    alliedBounceCompleted?.status === "resolved"
      && alliedBounceCompleted?.kind === "return"
      && alliedBounceCompleted?.returned === alliedBounceTroops,
    "The routed allied-target return did not resolve at its origin."
  );
  assert(alliedBounceResolvedSnapshot.data()?.status === "resolved", "The completed allied return stayed active.");
  assert(
    Number(alliedBounceSourceAfterReturn.data()?.troops || 0) >= alliedBounceSourceBeforeReturn + alliedBounceTroops,
    "The allied-target troops were not credited after the return reached its origin."
  );
  const clanApplicantProfileBeforeReinforcement = (await clanApplicantRef.get()).data() || {};
  const originalApplicantMainCity = {
    id: clanApplicantProfileBeforeReinforcement.mainCityId || clanReinforcementHolderClaim.cityId,
    islandId: clanApplicantProfileBeforeReinforcement.mainIslandId || clanReinforcementHolderClaim.islandId,
    regionId: clanApplicantProfileBeforeReinforcement.mainRegionId || clanReinforcementHolderClaim.mainRegionId,
  };
  const originalApplicantMainCityRef = db.doc(
    `islands/${originalApplicantMainCity.islandId}/cities/${originalApplicantMainCity.id}`
  );
  const shieldExpiresAtMs = Date.now() + 6 * 60 * 60 * 1000;
  await Promise.all([
    clanLeaderRef.set({
      itemEffects: { shieldExpiresAtMs },
    }, { merge: true }),
    clanApplicantRef.set({
      itemEffects: { shieldExpiresAtMs },
    }, { merge: true }),
    clanReinforcementSourceRef.set({
      troops: 10_000,
      troopFloat: 10_000,
      ownerShieldExpiresAtMs: shieldExpiresAtMs,
    }, { merge: true }),
  ]);
  const clanReinforcementCandidatesSnapshot = await db
    .collection(`islands/${clanReinforcementSourceClaim.islandId}/cities`)
    .where("ownerUid", "==", null)
    .get();
  const clanReinforcementCandidates = clanReinforcementCandidatesSnapshot.docs
    .filter(doc => !doc.data()?.strongholdType && doc.id !== clanReinforcementSourceClaim.cityId)
    .sort((left, right) => {
      const leftData = left.data() || {};
      const rightData = right.data() || {};
      const leftDistance = Math.hypot(
        Number(leftData.x) - Number(clanReinforcementSource.x),
        Number(leftData.y) - Number(clanReinforcementSource.y)
      );
      const rightDistance = Math.hypot(
        Number(rightData.x) - Number(clanReinforcementSource.x),
        Number(rightData.y) - Number(clanReinforcementSource.y)
      );
      return leftDistance - rightDistance;
    });
  assert(clanReinforcementCandidates.length, "No neutral city was available for the clan reinforcement gate.");

  let clanReinforcementTargetDoc = null;
  let firstClanReinforcement = null;
  const firstClanReinforcementArmyId = `clan_reinforce_a_${crypto.randomBytes(8).toString("hex")}`;
  for (const candidate of clanReinforcementCandidates) {
    const originalTarget = candidate.data() || {};
    const distance = Math.hypot(
      Number(originalTarget.x) - Number(clanReinforcementSource.x),
      Number(originalTarget.y) - Number(clanReinforcementSource.y)
    );
    await Promise.all([
      candidate.ref.set({
        ownerKind: "player",
        ownerUid: clanApplicant.uid,
        ownerName: "Ruler 50",
        ownerFlag: null,
        ownerShieldExpiresAtMs: shieldExpiresAtMs,
        isMainCity: true,
        level: 1,
        defense: 1,
        troops: 100,
        troopFloat: 100,
      }, { merge: true }),
      clanApplicantRef.set({
        mainCityId: candidate.id,
        mainIslandId: clanReinforcementSourceClaim.islandId,
        mainRegionId: clanReinforcementSourceClaim.mainRegionId,
      }, { merge: true }),
    ]);
    try {
      firstClanReinforcement = await callFunction("sendArmyOrder", clanLeader.token, {
        army: {
          id: firstClanReinforcementArmyId,
          kind: "reinforce",
          fromId: clanReinforcementSourceClaim.cityId,
          toId: candidate.id,
          fromName: clanReinforcementSource.name || clanReinforcementSourceClaim.cityId,
          toName: originalTarget.name || candidate.id,
          troops: 600,
          requestedTroops: 600,
          sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
          targetRegionId: clanReinforcementSourceClaim.mainRegionId,
          routeRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          viewRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          path: [
            { x: Number(clanReinforcementSource.x), y: Number(clanReinforcementSource.y) },
            { x: Number(originalTarget.x), y: Number(originalTarget.y) },
          ],
          pathSegments: [{
            regionId: clanReinforcementSourceClaim.mainRegionId,
            points: [
              { x: Number(clanReinforcementSource.x), y: Number(clanReinforcementSource.y) },
              { x: Number(originalTarget.x), y: Number(originalTarget.y) },
            ],
            length: distance,
          }],
          pathLength: distance,
        },
        sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
        targetRegionId: clanReinforcementSourceClaim.mainRegionId,
      });
      clanReinforcementTargetDoc = candidate;
      break;
    } catch (error) {
      await candidate.ref.set(originalTarget);
      if (!String(error?.message || "").includes("route crosses")) throw error;
    }
  }
  assert(clanReinforcementTargetDoc && firstClanReinforcement, "No reachable clan reinforcement target was available.");
  assert(
    clanReinforcementTargetDoc.id === (await clanApplicantRef.get()).data()?.mainCityId,
    "The proactive reinforcement target was not the holder's canonical main city."
  );
  assert(firstClanReinforcement?.movement?.kind === "reinforce", "Clan support did not launch as a reinforcement.");
  assert(firstClanReinforcement?.peaceShieldDeactivated === true, "Launching clan support did not drop the sender's shield.");
  const firstReinforcementPublicPath = `islands/${clanReinforcementSourceClaim.islandId}/armies/${firstClanReinforcementArmyId}`;
  const firstReinforcementIncomingPath = `players/${clanApplicant.uid}/incomingArmies/${firstClanReinforcementArmyId}`;
  const [firstReinforcementPublic, firstReinforcementIncoming] = await Promise.all([
    db.doc(firstReinforcementPublicPath).get(),
    db.doc(firstReinforcementIncomingPath).get(),
  ]);
  for (const [label, snapshot] of [
    ["public", firstReinforcementPublic],
    ["recipient incoming", firstReinforcementIncoming],
  ]) {
    const projection = snapshot.data() || {};
    assert(
      snapshot.exists
        && projection.troopVisibility === "estimate"
        && Number(projection.armyTroopVisibilityVersion || 0) === 3
        && projection.troops === undefined
        && projection.requestedTroops === undefined
        && Number(projection.troopEstimateMin || 0) < 600
        && Number(projection.troopEstimateMax || 0) >= 600
        && Boolean(projection.troopEstimateLabel),
      `The ${label} clan reinforcement projection exposed its exact troop amount or omitted its estimate.`
    );
  }
  const [leaderAfterReinforcementLaunch, holderAfterReinforcementLaunch, alliedTargetAfterLaunch] = await Promise.all([
    clanLeaderRef.get(),
    clanApplicantRef.get(),
    clanReinforcementTargetDoc.ref.get(),
  ]);
  assert(
    Number(leaderAfterReinforcementLaunch.data()?.itemEffects?.shieldExpiresAtMs || 0) === 0,
    "The reinforcement sender retained their Royal Peace Shield."
  );
  assert(
    Number(holderAfterReinforcementLaunch.data()?.itemEffects?.shieldExpiresAtMs || 0) === shieldExpiresAtMs
      && Number(alliedTargetAfterLaunch.data()?.ownerShieldExpiresAtMs || 0) === shieldExpiresAtMs,
    "The allied holding owner's Royal Peace Shield changed when support launched."
  );
  assert(
    Number(alliedTargetAfterLaunch.data()?.clanReinforcementSlotCount || 0) === 1,
    "The outbound reinforcement did not reserve an ordinary-city slot at launch."
  );

  async function forceResolveMovement(movement, token) {
    const routeRegionIds = movement.routeRegionIds || [movement.sourceRegionId, movement.targetRegionId].filter(Boolean);
    const refs = [
      db.doc(`armies/${movement.id}`),
      ...routeRegionIds.map(regionId => (
        db.doc(`islands/${realm.worldId}-${regionId}/armies/${movement.id}`)
      )),
    ];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await Promise.all(refs.map(ref => ref.set({ arrivesAtMs: Date.now() - 1000 }, { merge: true })));
      try {
        return await callFunction("resolveArmyOrder", token, {
          armyId: movement.id,
          routeRegionIds,
        });
      } catch (error) {
        if (attempt >= 2 || !/not arrived/i.test(String(error?.message || ""))) throw error;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    throw new Error("Forced army resolution exhausted its retry budget.");
  }

  const firstClanReinforcementArrival = await forceResolveMovement(
    firstClanReinforcement.movement,
    clanLeader.token
  );
  assert(
    firstClanReinforcementArrival?.kind === "reinforce"
      && firstClanReinforcementArrival?.outcome === "stationed",
    "Clan reinforcement did not station at the allied holding."
  );
  const reinforcementId = firstClanReinforcementArrival.reinforcementId;
  assert(reinforcementId, "Clan reinforcement arrival did not return its contribution id.");
  await Promise.all([
    clanApplicantRef.set({
      mainCityId: originalApplicantMainCity.id,
      mainIslandId: originalApplicantMainCity.islandId,
      mainRegionId: originalApplicantMainCity.regionId,
    }, { merge: true }),
    db.doc(`players/${clanApplicant.uid}/stats/global`).set({
      mainCityId: originalApplicantMainCity.id,
      mainIslandId: originalApplicantMainCity.islandId,
      mainRegionId: originalApplicantMainCity.regionId,
    }, { merge: true }),
    db.doc(`leaderboards/${realm.resetGeneration}/entries/${clanApplicant.uid}`).set({
      mainCityId: originalApplicantMainCity.id,
      mainIslandId: originalApplicantMainCity.islandId,
      mainRegionId: originalApplicantMainCity.regionId,
    }, { merge: true }),
    originalApplicantMainCityRef.set({ isMainCity: true }, { merge: true }),
    clanReinforcementTargetDoc.ref.set({ isMainCity: false }, { merge: true }),
  ]);

  let duplicateTargetError = null;
  try {
    await callFunction("sendArmyOrder", clanLeader.token, {
      army: {
        ...firstClanReinforcement.movement,
        id: `clan_reinforce_duplicate_${crypto.randomBytes(8).toString("hex")}`,
        troops: 400,
        requestedTroops: 400,
      },
      sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
      targetRegionId: clanReinforcementSourceClaim.mainRegionId,
    });
  } catch (error) {
    duplicateTargetError = error;
  }
  assert(
    /already have one active reinforcement/.test(String(duplicateTargetError?.message || "")),
    "A sender launched more than one active reinforcement to the same holding."
  );

  let secondClanReinforcementTargetDoc = null;
  let secondClanReinforcement = null;
  for (const candidate of clanReinforcementCandidates.filter(doc => doc.id !== clanReinforcementTargetDoc.id)) {
    const originalTarget = candidate.data() || {};
    const distance = Math.hypot(
      Number(originalTarget.x) - Number(clanReinforcementSource.x),
      Number(originalTarget.y) - Number(clanReinforcementSource.y)
    );
    await candidate.ref.set({
      ownerKind: "player",
      ownerUid: clanApplicant.uid,
      ownerName: "Ruler 50",
      ownerFlag: null,
      ownerShieldExpiresAtMs: shieldExpiresAtMs,
      isMainCity: false,
      level: 1,
      defense: 1,
      troops: 100,
      troopFloat: 100,
    }, { merge: true });
    try {
      secondClanReinforcement = await callFunction("sendArmyOrder", clanLeader.token, {
        army: {
          id: `clan_reinforce_b_${crypto.randomBytes(8).toString("hex")}`,
          kind: "reinforce",
          fromId: clanReinforcementSourceClaim.cityId,
          toId: candidate.id,
          fromName: clanReinforcementSource.name || clanReinforcementSourceClaim.cityId,
          toName: originalTarget.name || candidate.id,
          troops: 400,
          requestedTroops: 400,
          sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
          targetRegionId: clanReinforcementSourceClaim.mainRegionId,
          routeRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          viewRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          path: [
            { x: Number(clanReinforcementSource.x), y: Number(clanReinforcementSource.y) },
            { x: Number(originalTarget.x), y: Number(originalTarget.y) },
          ],
          pathSegments: [{
            regionId: clanReinforcementSourceClaim.mainRegionId,
            points: [
              { x: Number(clanReinforcementSource.x), y: Number(clanReinforcementSource.y) },
              { x: Number(originalTarget.x), y: Number(originalTarget.y) },
            ],
            length: distance,
          }],
          pathLength: distance,
        },
        sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
        targetRegionId: clanReinforcementSourceClaim.mainRegionId,
      });
      secondClanReinforcementTargetDoc = candidate;
      break;
    } catch (error) {
      await candidate.ref.set(originalTarget);
      if (!String(error?.message || "").includes("route crosses")) throw error;
    }
  }
  assert(secondClanReinforcementTargetDoc && secondClanReinforcement, "A second reachable clan reinforcement target was unavailable.");

  let maxReinforcementLimitError = null;
  for (const candidate of clanReinforcementCandidates.filter(doc => (
    doc.id !== clanReinforcementTargetDoc.id && doc.id !== secondClanReinforcementTargetDoc.id
  ))) {
    const originalTarget = candidate.data() || {};
    const distance = Math.hypot(
      Number(originalTarget.x) - Number(clanReinforcementSource.x),
      Number(originalTarget.y) - Number(clanReinforcementSource.y)
    );
    await candidate.ref.set({
      ownerKind: "player",
      ownerUid: clanApplicant.uid,
      ownerName: "Ruler 50",
      ownerFlag: null,
      ownerShieldExpiresAtMs: shieldExpiresAtMs,
      isMainCity: false,
      level: 1,
      defense: 1,
      troops: 100,
      troopFloat: 100,
    }, { merge: true });
    try {
      await callFunction("sendArmyOrder", clanLeader.token, {
        army: {
          id: `clan_reinforce_limit_${crypto.randomBytes(8).toString("hex")}`,
          kind: "reinforce",
          fromId: clanReinforcementSourceClaim.cityId,
          toId: candidate.id,
          fromName: clanReinforcementSource.name || clanReinforcementSourceClaim.cityId,
          toName: originalTarget.name || candidate.id,
          troops: 200,
          requestedTroops: 200,
          sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
          targetRegionId: clanReinforcementSourceClaim.mainRegionId,
          routeRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          viewRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          path: [
            { x: Number(clanReinforcementSource.x), y: Number(clanReinforcementSource.y) },
            { x: Number(originalTarget.x), y: Number(originalTarget.y) },
          ],
          pathSegments: [{
            regionId: clanReinforcementSourceClaim.mainRegionId,
            points: [
              { x: Number(clanReinforcementSource.x), y: Number(clanReinforcementSource.y) },
              { x: Number(originalTarget.x), y: Number(originalTarget.y) },
            ],
            length: distance,
          }],
          pathLength: distance,
        },
        sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
        targetRegionId: clanReinforcementSourceClaim.mainRegionId,
      });
      throw new Error("A sender launched a third active clan reinforcement.");
    } catch (error) {
      if (String(error?.message || "").includes("route crosses")) {
        await candidate.ref.set(originalTarget);
        continue;
      }
      maxReinforcementLimitError = error;
      break;
    }
  }
  assert(
    /2 active reinforcement assignments with this clanmate/.test(String(maxReinforcementLimitError?.message || "")),
    "A sender was not capped at two assignments with one clanmate."
  );

  const secondClanReinforcementArrival = await forceResolveMovement(
    secondClanReinforcement.movement,
    clanLeader.token
  );
  const secondReinforcementId = secondClanReinforcementArrival?.reinforcementId;
  assert(secondReinforcementId, "The sender's second reinforcement did not station.");

  const [firstContribution, secondContribution, leaderAtLimit] = await Promise.all([
    db.doc(`reinforcements/${reinforcementId}`).get(),
    db.doc(`reinforcements/${secondReinforcementId}`).get(),
    clanLeaderRef.get(),
  ]);
  assert(
    Number(firstContribution.data()?.troops || 0) === 600
      && Number(secondContribution.data()?.troops || 0) === 400
      && Number(leaderAtLimit.data()?.stationedReinforcementTroops || 0) === 1_000
      && leaderAtLimit.data()?.activeClanReinforcementTargets?.length === 2
      && leaderAtLimit.data()?.activeClanReinforcementAssignments?.length === 2,
    "Two allowed sender reinforcement slots were not tracked independently."
  );

  const sharedTarget = (await clanReinforcementTargetDoc.ref.get()).data() || {};
  let otherSenderReinforcement = null;
  const otherSenderSourceCandidates = clanReinforcementCandidates
    .filter(doc => (
      doc.id !== clanReinforcementTargetDoc.id
      && doc.id !== secondClanReinforcementTargetDoc.id
    ))
    .sort((left, right) => {
      const leftData = left.data() || {};
      const rightData = right.data() || {};
      return Math.hypot(
        Number(leftData.x) - Number(sharedTarget.x),
        Number(leftData.y) - Number(sharedTarget.y)
      ) - Math.hypot(
        Number(rightData.x) - Number(sharedTarget.x),
        Number(rightData.y) - Number(sharedTarget.y)
      );
    });
  for (const candidate of otherSenderSourceCandidates) {
    const currentSource = (await candidate.ref.get()).data() || {};
    if (currentSource.ownerUid) continue;
    const sharedTargetDistance = Math.hypot(
      Number(sharedTarget.x) - Number(currentSource.x),
      Number(sharedTarget.y) - Number(currentSource.y)
    );
    await candidate.ref.set({
      ownerKind: "player",
      ownerUid: clanSecondSender.uid,
      ownerName: "Ruler 47",
      ownerFlag: null,
      isMainCity: false,
      level: 1,
      defense: 1,
      troops: 10_000,
      troopFloat: 10_000,
    }, { merge: true });
    try {
      otherSenderReinforcement = await callFunction("sendArmyOrder", clanSecondSender.token, {
        army: {
          id: `clan_reinforce_other_sender_${crypto.randomBytes(8).toString("hex")}`,
          kind: "reinforce",
          fromId: candidate.id,
          toId: clanReinforcementTargetDoc.id,
          fromName: currentSource.name || candidate.id,
          toName: sharedTarget.name || clanReinforcementTargetDoc.id,
          troops: 200,
          requestedTroops: 200,
          sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
          targetRegionId: clanReinforcementSourceClaim.mainRegionId,
          routeRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          viewRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          path: [
            { x: Number(currentSource.x), y: Number(currentSource.y) },
            { x: Number(sharedTarget.x), y: Number(sharedTarget.y) },
          ],
          pathSegments: [{
            regionId: clanReinforcementSourceClaim.mainRegionId,
            points: [
              { x: Number(currentSource.x), y: Number(currentSource.y) },
              { x: Number(sharedTarget.x), y: Number(sharedTarget.y) },
            ],
            length: sharedTargetDistance,
          }],
          pathLength: sharedTargetDistance,
        },
        sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
        targetRegionId: clanReinforcementSourceClaim.mainRegionId,
      });
      break;
    } catch (error) {
      await candidate.ref.set(currentSource);
      if (!String(error?.message || "").includes("route crosses")) throw error;
    }
  }
  assert(otherSenderReinforcement, "A valid second allied sender source was unavailable.");
  const otherSenderArrival = await forceResolveMovement(otherSenderReinforcement.movement, clanSecondSender.token);
  const otherSenderReinforcementId = otherSenderArrival?.reinforcementId;
  const sharedTargetContributions = await db.collection("reinforcements")
    .where("targetKey", "==", `city:${clanReinforcementSourceClaim.mainRegionId}:${clanReinforcementTargetDoc.id}`)
    .where("resetGeneration", "==", realm.resetGeneration)
    .where("worldId", "==", realm.worldId)
    .where("status", "==", "stationed")
    .get();
  assert(
    otherSenderReinforcementId
      && sharedTargetContributions.docs.filter(doc => Number(doc.data()?.troops || 0) > 0).length === 2
      && Number((await clanReinforcementTargetDoc.ref.get()).data()?.clanReinforcementSlotCount || 0) === 2,
    "The holding owner could not receive independent reinforcements from multiple clan allies."
  );

  const cappedTargetKey = `city:${clanReinforcementSourceClaim.mainRegionId}:${secondClanReinforcementTargetDoc.id}`;
  const cappedTargetCapacityId = crypto.createHash("sha256")
    .update(`${realm.resetGeneration}|${cappedTargetKey}`)
    .digest("hex")
    .slice(0, 40);
  const cappedTargetCapacityRef = db.doc(
    `reinforcementCapacity/${realm.resetGeneration}/cities/${cappedTargetCapacityId}`
  );
  const [capacityBeforeSixth, cappedTargetBeforeSixth] = await Promise.all([
    cappedTargetCapacityRef.get(),
    secondClanReinforcementTargetDoc.ref.get(),
  ]);
  const cappedTarget = cappedTargetBeforeSixth.data() || {};
  await Promise.all([
    cappedTargetCapacityRef.set({
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      targetKey: cappedTargetKey,
      reservations: Array.from({ length: 5 }, (_, index) => ({
        ownerUid: `capacity-sender-${index}`,
        recipientUid: clanApplicant.uid,
        armyId: `capacity-army-${index}`,
        reservedAtMs: Date.now() - 10_000 + index,
      })),
      reservedSlotCount: 5,
      modelVersion: 2,
    }, { merge: true }),
    secondClanReinforcementTargetDoc.ref.set({ clanReinforcementSlotCount: 5 }, { merge: true }),
  ]);
  let sixthCapacityError = null;
  for (const candidate of otherSenderSourceCandidates) {
    const currentSource = (await candidate.ref.get()).data() || {};
    const alreadyOwnedBySender = currentSource.ownerUid === clanSecondSender.uid;
    if (currentSource.ownerUid && !alreadyOwnedBySender) continue;
    if (!alreadyOwnedBySender) {
      await candidate.ref.set({
        ownerKind: "player",
        ownerUid: clanSecondSender.uid,
        ownerName: "Ruler 47",
        ownerFlag: null,
        isMainCity: false,
        level: 1,
        defense: 1,
        troops: 10_000,
        troopFloat: 10_000,
      }, { merge: true });
    }
    const sixthSenderSource = (await candidate.ref.get()).data() || {};
    const sixthDistance = Math.hypot(
      Number(cappedTarget.x) - Number(sixthSenderSource.x),
      Number(cappedTarget.y) - Number(sixthSenderSource.y)
    );
    try {
      await callFunction("sendArmyOrder", clanSecondSender.token, {
        army: {
          id: `clan_reinforce_sixth_${crypto.randomBytes(8).toString("hex")}`,
          kind: "reinforce",
          fromId: candidate.id,
          toId: secondClanReinforcementTargetDoc.id,
          fromName: sixthSenderSource.name || candidate.id,
          toName: cappedTarget.name || secondClanReinforcementTargetDoc.id,
          troops: 100,
          requestedTroops: 100,
          sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
          targetRegionId: clanReinforcementSourceClaim.mainRegionId,
          routeRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          viewRegionIds: [clanReinforcementSourceClaim.mainRegionId],
          path: [
            { x: Number(sixthSenderSource.x), y: Number(sixthSenderSource.y) },
            { x: Number(cappedTarget.x), y: Number(cappedTarget.y) },
          ],
          pathSegments: [{
            regionId: clanReinforcementSourceClaim.mainRegionId,
            points: [
              { x: Number(sixthSenderSource.x), y: Number(sixthSenderSource.y) },
              { x: Number(cappedTarget.x), y: Number(cappedTarget.y) },
            ],
            length: sixthDistance,
          }],
          pathLength: sixthDistance,
        },
        sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
        targetRegionId: clanReinforcementSourceClaim.mainRegionId,
      });
    } catch (error) {
      if (/all 5 reinforcement slots reserved/.test(String(error?.message || ""))) {
        sixthCapacityError = error;
      } else if (!String(error?.message || "").includes("route crosses")) {
        if (!alreadyOwnedBySender) await candidate.ref.set(currentSource);
        throw error;
      }
    }
    if (!alreadyOwnedBySender) await candidate.ref.set(currentSource);
    if (sixthCapacityError) break;
  }
  assert(
    /all 5 reinforcement slots reserved/.test(String(sixthCapacityError?.message || "")),
    "The sixth ordinary-city reinforcement reservation was not rejected transactionally."
  );
  const deniedCapacityRead = await attemptClientDocumentRead(
    clanApplicant,
    `reinforcementCapacity/${realm.resetGeneration}/cities/${cappedTargetCapacityId}`
  );
  assert(
    deniedCapacityRead.status === 403,
    "A client could read private ordinary-city reinforcement contributor reservations."
  );
  await Promise.all([
    capacityBeforeSixth.exists
      ? cappedTargetCapacityRef.set(capacityBeforeSixth.data())
      : cappedTargetCapacityRef.delete(),
    secondClanReinforcementTargetDoc.ref.set({ clanReinforcementSlotCount: 1 }, { merge: true }),
  ]);

  const [sharedTargetBeforeEconomy, leaderContributionBeforeEconomy, otherContributionBeforeEconomy] = await Promise.all([
    clanReinforcementTargetDoc.ref.get(),
    db.doc(`reinforcements/${reinforcementId}`).get(),
    db.doc(`reinforcements/${otherSenderReinforcementId}`).get(),
  ]);
  await Promise.all([
    callFunction("collectEconomy", clanLeader.token),
    callFunction("collectEconomy", clanApplicant.token),
    callFunction("collectEconomy", clanSecondSender.token),
  ]);
  const [sharedTargetAfterEconomy, leaderContributionAfterEconomy, otherContributionAfterEconomy] = await Promise.all([
    clanReinforcementTargetDoc.ref.get(),
    db.doc(`reinforcements/${reinforcementId}`).get(),
    db.doc(`reinforcements/${otherSenderReinforcementId}`).get(),
  ]);
  assert(
    Number(sharedTargetBeforeEconomy.data()?.alliedReinforcementTroops || 0) === 800
      && Number(sharedTargetAfterEconomy.data()?.alliedReinforcementTroops || 0) === 800
      && leaderContributionBeforeEconomy.data()?.status === "stationed"
      && leaderContributionAfterEconomy.data()?.status === "stationed"
      && Number(leaderContributionAfterEconomy.data()?.troops || 0) === 600
      && otherContributionBeforeEconomy.data()?.status === "stationed"
      && otherContributionAfterEconomy.data()?.status === "stationed"
      && Number(otherContributionAfterEconomy.data()?.troops || 0) === 200,
    "Passive economy collection moved, expired, or detached stationed clan troops."
  );

  let unauthorizedReinforcementReturnError = null;
  try {
    await callFunction("returnClanReinforcement", users[0].token, {
      reinforcementId,
    });
  } catch (error) {
    unauthorizedReinforcementReturnError = error;
  }
  assert(
    /Only the troop owner or holding owner/.test(String(unauthorizedReinforcementReturnError?.message || "")),
    "An unrelated player could return another member's stationed reinforcement."
  );

  let reinforcedMainCityError = null;
  try {
    await callFunction("changeMainCity", clanApplicant.token, {
      cityId: clanReinforcementTargetDoc.id,
      regionId: clanReinforcementSourceClaim.mainRegionId,
    });
  } catch (error) {
    reinforcedMainCityError = error;
  }
  assert(
    /Send allied reinforcements home/.test(String(reinforcedMainCityError?.message || "")),
    "A holding with allied support was allowed to become a main city."
  );

  const holderDismissal = await callFunction("returnClanReinforcement", clanApplicant.token, {
    reinforcementId,
  });
  const [holderDismissalTargetState, holderDismissalSenderState] = await Promise.all([
    clanReinforcementTargetDoc.ref.get(),
    clanLeaderRef.get(),
  ]);
  const dismissedAssignmentToken = `${clanApplicant.uid}|city:${clanReinforcementSourceClaim.mainRegionId}:${clanReinforcementTargetDoc.id}`;
  assert(
    holderDismissal?.status === "returning"
      && Number(holderDismissal?.troops || 0) === 600
      && holderDismissal?.returnInitiatorRole === "holder"
      && !holderDismissal?.currentUser
      && Array.isArray(holderDismissal?.cityUpdates)
      && Number(holderDismissal.cityUpdates[0]?.alliedReinforcementTroops || 0) === 200
      && Number(holderDismissalTargetState.data()?.clanReinforcementSlotCount || 0) === 1
      && !(holderDismissalSenderState.data()?.activeClanReinforcementAssignments || [])
        .includes(dismissedAssignmentToken)
      && !(holderDismissalSenderState.data()?.activeClanReinforcementTargets || [])
        .includes(`city:${clanReinforcementSourceClaim.mainRegionId}:${clanReinforcementTargetDoc.id}`),
    "A dismissed reinforcement did not stop defending and consuming capacity as soon as its return march departed."
  );
  const holderDismissalArrival = await forceResolveMovement(holderDismissal.movement, clanLeader.token);
  assert(
    holderDismissalArrival?.kind === "transfer"
      && holderDismissal?.returnDestination?.id === clanReinforcementSourceClaim.cityId
      && (await db.doc(`reinforcements/${reinforcementId}`).get()).data()?.status === "returned",
    "Dismissed clan reinforcements did not return safely to their original source holding."
  );

  const thirdClanReinforcementArmyId = `clan_reinforce_c_${crypto.randomBytes(8).toString("hex")}`;
  const thirdClanReinforcement = await callFunction("sendArmyOrder", clanLeader.token, {
    army: {
      ...firstClanReinforcement.movement,
      id: thirdClanReinforcementArmyId,
      kind: "reinforce",
      launchKind: "reinforce",
      troops: 200,
      requestedTroops: 200,
    },
    sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
    targetRegionId: clanReinforcementSourceClaim.mainRegionId,
  });
  const thirdClanReinforcementArrival = await forceResolveMovement(
    thirdClanReinforcement.movement,
    clanLeader.token
  );
  const contributorRecall = await callFunction("returnClanReinforcement", clanLeader.token, {
    reinforcementId: thirdClanReinforcementArrival.reinforcementId,
  });
  assert(
    contributorRecall?.status === "returning"
      && Number(contributorRecall?.troops || 0) === 200
      && contributorRecall?.returnInitiatorRole === "contributor"
      && contributorRecall?.currentUser,
    "The contributor could not recall their full stationed contribution."
  );
  await forceResolveMovement(contributorRecall.movement, clanLeader.token);
  const finalReinforcementState = await db.doc(`reinforcements/${reinforcementId}`).get();
  assert(finalReinforcementState.data()?.status === "returned", "Recalled clan troops were not marked returned.");
  const [secondTargetRecall, otherSenderRecall] = await Promise.all([
    callFunction("returnClanReinforcement", clanLeader.token, {
      reinforcementId: secondReinforcementId,
    }),
    callFunction("returnClanReinforcement", clanSecondSender.token, {
      reinforcementId: otherSenderReinforcementId,
    }),
  ]);
  await Promise.all([
    forceResolveMovement(secondTargetRecall.movement, clanLeader.token),
    forceResolveMovement(otherSenderRecall.movement, clanSecondSender.token),
  ]);
  const [leaderAfterReturns, otherSenderAfterReturns] = await Promise.all([
    clanLeaderRef.get(),
    clanSecondSenderRef.get(),
  ]);
  assert(
    (leaderAfterReturns.data()?.activeClanReinforcementTargets || []).length === 0
      && (leaderAfterReturns.data()?.activeClanReinforcementAssignments || []).length === 0
      && (otherSenderAfterReturns.data()?.activeClanReinforcementTargets || []).length === 0,
    "Completed reinforcement returns did not release sender slots."
  );

  const capturedReinforcementArmyId = `clan_reinforce_captured_${crypto.randomBytes(8).toString("hex")}`;
  const capturedReinforcement = await callFunction("sendArmyOrder", clanLeader.token, {
    army: {
      ...firstClanReinforcement.movement,
      id: capturedReinforcementArmyId,
      kind: "reinforce",
      launchKind: "reinforce",
      troops: 200,
      requestedTroops: 200,
    },
    sourceRegionId: clanReinforcementSourceClaim.mainRegionId,
    targetRegionId: clanReinforcementSourceClaim.mainRegionId,
  });
  assert(
    capturedReinforcement?.movement?.kind === "reinforce",
    "Captured-destination gate did not launch as allied support."
  );
  await clanReinforcementTargetDoc.ref.set({
    ownerKind: "player",
    ownerUid: users[1].uid,
    ownerName: "Ruler 2",
    ownerFlag: null,
    ownerShieldExpiresAtMs: 0,
    isMainCity: false,
    level: 1,
    defense: 1,
    troops: 100_000,
    troopFloat: 100_000,
    alliedReinforcementTroops: 0,
  }, { merge: true });
  const capturedReinforcementResolution = await forceResolveMovement(
    capturedReinforcement.movement,
    clanLeader.token
  );
  const [capturedReinforcementArmy, leaderAfterCapturedReinforcement] = await Promise.all([
    db.doc(`armies/${capturedReinforcementArmyId}`).get(),
    clanLeaderRef.get(),
  ]);
  assert(
    capturedReinforcementResolution?.status === "resolved"
      && capturedReinforcementResolution?.kind === "attack"
      && capturedReinforcementResolution?.outcome === "defeat",
    "Support whose allied destination was captured did not fight the new owner."
  );
  assert(
    capturedReinforcementArmy.data()?.status === "resolved"
      && (leaderAfterCapturedReinforcement.data()?.activeClanReinforcementTargets || []).length === 0
      && (leaderAfterCapturedReinforcement.data()?.activeClanReinforcementAssignments || []).length === 0,
    "Converted support remained active or retained its reinforcement slot after combat."
  );
  await clanReinforcementTargetDoc.ref.set({
    troops: 0,
    troopFloat: 0,
  }, { merge: true });

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
  const resolved = await forceResolveMovement(sent.movement, attacker.token);
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
  const transferPublicPath = `islands/${sourceClaim.islandId}/armies/${reinforcementArmyId}`;
  const [transferCanonicalSnapshot, transferPublicSnapshot, observerTransferRead] = await Promise.all([
    db.doc(`armies/${reinforcementArmyId}`).get(),
    db.doc(transferPublicPath).get(),
    attemptClientDocumentRead(users[1], transferPublicPath),
  ]);
  const transferCanonical = transferCanonicalSnapshot.data() || {};
  const transferPublic = transferPublicSnapshot.data() || {};
  assert(
    Number(transferCanonical.troops || 0) === 20_000
      && Number(transferCanonical.requestedTroops || 0) === 20_000,
    "The transfer owner lost the exact canonical troop count."
  );
  assert(observerTransferRead.status === 200, "Another signed-in player could not see the traveling transfer icon.");
  assert(
    transferPublicSnapshot.exists
      && transferPublic.troopVisibility === "hidden"
      && Number(transferPublic.armyTroopVisibilityVersion || 0) === 3
      && transferPublic.troops === undefined
      && transferPublic.requestedTroops === undefined,
    "The public owned-city transfer projection exposed its exact troop amount."
  );

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
    updatedAt: FieldValue.serverTimestamp(),
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
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

  const retargetedResolution = await forceResolveMovement({
    id: reinforcementArmyId,
    ...retargetedArmy,
  }, attacker.token);
  assert(
    retargetedResolution?.status === "resolved"
      && retargetedResolution?.kind === "attack"
      && retargetedResolution?.outcome === "victory",
    "Protected retargeted reinforcement did not capture after winning on arrival."
  );
  const retargetedAttackReport = (retargetedResolution.reports || [])
    .find(report => report.type === "attack" && report.outcome === "victory");
  assert(
    retargetedAttackReport?.opponentUid === users[1].uid,
    "The authoritative attacker report did not preserve the defender UID for public-profile navigation."
  );
  const [persistedAttackerReport, persistedDefenderReport] = await Promise.all([
    db.doc(`players/${attacker.uid}/serverReports/${reinforcementArmyId}_attack_${attacker.uid}`).get(),
    db.doc(`players/${users[1].uid}/serverReports/${reinforcementArmyId}_defense_${users[1].uid}`).get(),
  ]);
  assert(
    persistedAttackerReport.data()?.opponentUid === users[1].uid,
    "The persisted attacker report lost the defender UID."
  );
  assert(
    persistedDefenderReport.data()?.opponentUid === attacker.uid,
    "The persisted defender report lost the attacker UID."
  );
  assert(
    retargetedAttackReport?.attackProtection?.mode === "raid"
      && retargetedAttackReport.attackProtection.captureAllowed === false,
    `The converted reinforcement gate did not exercise recalculated protected-raid rules: ${
      JSON.stringify(retargetedAttackReport?.attackProtection || null)
    }`
  );
  assert(
    retargetedAttackReport.survivors > 0
      && retargetedAttackReport.attackerLosses < retargetedAttackReport.sentTroops
      && /Reinforcements converted to an attack and captured the city/.test(retargetedAttackReport.summary),
    "Winning converted reinforcements did not retain survivors or report the capture clearly."
  );
  await waitForOwnershipEvents(53);

  const clanQuestPeriod = getClanQuestPeriod(Date.now(), realm.resetGeneration);
  const clanQuestDefenders = users.filter(user => user.uid !== clanApplicant.uid).slice(0, 25);
  const clanQuestEventIds = Array.from({ length: 25 }, (_, index) => (
    `clan_quest_gate_${index}_${crypto.randomBytes(6).toString("hex")}`
  ));
  const clanQuestBatch = db.batch();
  clanQuestEventIds.forEach((eventId, index) => {
    clanQuestBatch.set(
      db.doc(`realmEvents/${realm.resetGeneration}/ownershipChanges/${eventId}`),
      {
        eventId,
        worldId: realm.worldId,
        resetGeneration: realm.resetGeneration,
        releaseId: realm.releaseId,
        targetType: "city",
        targetId: `quest_gate_city_${index}`,
        regionId: sourceClaim.mainRegionId,
        targetKey: `${sourceClaim.mainRegionId}:quest_gate_city_${index}`,
        beforeOwnerUid: clanQuestDefenders[index].uid,
        afterOwnerUid: clanApplicant.uid,
        reason: "city_captured",
        status: "pending",
        attempts: 0,
        createdAtMs: Date.now() + index,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }
    );
  });
  await clanQuestBatch.commit();
  await waitForOwnershipEventIds(clanQuestEventIds);
  const questProgressRef = db.doc(`clans/${applicationClanId}/questProgress/${clanQuestPeriod.questPeriodId}`);
  const questProgressAtTwentyFive = (await questProgressRef.get()).data() || {};
  assert(questProgressAtTwentyFive.captureCount === 25, "Twenty-five eligible player-owned captures did not advance the weekly clan quest.");
  assert(
    Number(questProgressAtTwentyFive.milestoneUnlocks?.capture_25 || 0) > 0,
    "The 25-capture weekly clan milestone did not unlock."
  );
  assert(
    questProgressAtTwentyFive.questPeriodId === clanQuestPeriod.questPeriodId,
    "Weekly clan quest progress was written to the wrong period."
  );
  let staleQuestClaimError = null;
  try {
    await callFunction("claimClanQuestReward", clanApplicant.token, {
      rewardId: "capture_25",
      questPeriodId: `${clanQuestPeriod.questPeriodId}_expired`,
    });
  } catch (error) {
    staleQuestClaimError = error;
  }
  assert(/weekly quest period has expired/.test(String(staleQuestClaimError?.message || "")), "A stale weekly clan quest period was accepted.");
  const questGoldBeforeClaim = Number((await clanApplicantRef.get()).data()?.gold || 0);
  const questClaim = await callFunction("claimClanQuestReward", clanApplicant.token, {
    rewardId: "capture_25",
    questPeriodId: clanQuestPeriod.questPeriodId,
  });
  assert(questClaim?.claimed === true && questClaim?.replayed === false && questClaim?.reward > 0, "The first clan quest claim did not award base gold.");
  assert(
    Number((await clanApplicantRef.get()).data()?.gold || 0) >= questGoldBeforeClaim + Number(questClaim.reward || 0),
    "The clan quest reward was not immediately credited."
  );
  const replayedQuestClaim = await callFunction("claimClanQuestReward", clanApplicant.token, {
    rewardId: "capture_25",
    questPeriodId: clanQuestPeriod.questPeriodId,
  });
  assert(replayedQuestClaim?.replayed === true, "A repeated clan quest claim was not idempotent.");

  const excludedQuestEventIds = [
    `clan_quest_neutral_${crypto.randomBytes(6).toString("hex")}`,
    `clan_quest_camp_${crypto.randomBytes(6).toString("hex")}`,
  ];
  const excludedQuestBatch = db.batch();
  excludedQuestBatch.set(
    db.doc(`realmEvents/${realm.resetGeneration}/ownershipChanges/${excludedQuestEventIds[0]}`),
    {
      eventId: excludedQuestEventIds[0],
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      releaseId: realm.releaseId,
      targetType: "city",
      targetId: "quest_gate_neutral",
      regionId: sourceClaim.mainRegionId,
      targetKey: `${sourceClaim.mainRegionId}:quest_gate_neutral`,
      beforeOwnerUid: "",
      afterOwnerUid: clanApplicant.uid,
      reason: "city_captured",
      status: "pending",
      attempts: 0,
      createdAtMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
  );
  excludedQuestBatch.set(
    db.doc(`realmEvents/${realm.resetGeneration}/ownershipChanges/${excludedQuestEventIds[1]}`),
    {
      eventId: excludedQuestEventIds[1],
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      releaseId: realm.releaseId,
      targetType: "camp",
      targetId: "quest_gate_camp",
      regionId: sourceClaim.mainRegionId,
      targetKey: `${sourceClaim.mainRegionId}:quest_gate_camp`,
      beforeOwnerUid: users[0].uid,
      afterOwnerUid: clanApplicant.uid,
      reason: "city_captured",
      status: "pending",
      attempts: 0,
      createdAtMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
  );
  await excludedQuestBatch.commit();
  await waitForOwnershipEventIds(excludedQuestEventIds);
  assert(
    Number((await questProgressRef.get()).data()?.captureCount || 0) === 25,
    "Neutral territory or reward camps advanced clan conquest progress."
  );

  const priorQuestPeriod = getClanQuestPeriod(clanQuestPeriod.weekStartAtMs - 1, realm.resetGeneration);
  const delayedQuestEventId = `clan_quest_delayed_${crypto.randomBytes(6).toString("hex")}`;
  await db.doc(`realmEvents/${realm.resetGeneration}/ownershipChanges/${delayedQuestEventId}`).set({
    eventId: delayedQuestEventId,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    releaseId: realm.releaseId,
    targetType: "city",
    targetId: "quest_gate_delayed_city",
    regionId: sourceClaim.mainRegionId,
    targetKey: `${sourceClaim.mainRegionId}:quest_gate_delayed_city`,
    beforeOwnerUid: clanQuestDefenders[0].uid,
    afterOwnerUid: clanApplicant.uid,
    reason: "city_captured",
    status: "pending",
    attempts: 0,
    createdAtMs: clanQuestPeriod.weekStartAtMs - 1,
    createdAt: Timestamp.fromMillis(clanQuestPeriod.weekStartAtMs - 1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await waitForOwnershipEventIds([delayedQuestEventId]);
  const priorQuestProgress = (
    await db.doc(`clans/${applicationClanId}/questProgress/${priorQuestPeriod.questPeriodId}`).get()
  ).data() || {};
  assert(priorQuestProgress.captureCount === 1, "A delayed conquest did not remain in its original UTC week.");
  assert(
    Number((await questProgressRef.get()).data()?.captureCount || 0) === 25,
    "A delayed prior-week conquest contaminated the active weekly period."
  );

  const lateClanMember = users[47];
  await db.doc(`players/${lateClanMember.uid}`).set({
    character: { level: 10, xp: 0, skillPoints: 9 },
  }, { merge: true });
  await callFunction("applyToClan", lateClanMember.token, {
    clanId: applicationClanId,
    message: "Late quest applicant",
  });
  await callFunction("reviewClanApplication", clanLeader.token, {
    clanId: applicationClanId,
    applicantUid: lateClanMember.uid,
    accept: true,
  });
  let lateClaimError = null;
  try {
    await callFunction("claimClanQuestReward", lateClanMember.token, {
      rewardId: "capture_25",
      questPeriodId: clanQuestPeriod.questPeriodId,
    });
  } catch (error) {
    lateClaimError = error;
  }
  assert(/joined after that reward was unlocked/.test(String(lateClaimError?.message || "")), "A late clan member collected an earlier quest milestone.");
  await callFunction("promoteClanMember", clanLeader.token, { targetUid: clanApplicant.uid });
  let officerRemovalError = null;
  try {
    await callFunction("kickClanMember", clanApplicant.token, { targetUid: lateClanMember.uid });
  } catch (error) {
    officerRemovalError = error;
  }
  assert(
    /clan role does not allow that action/.test(String(officerRemovalError?.message || "")),
    "An officer removal request was not rejected by the leader-only server permission."
  );
  assert(
    (await db.doc(`clans/${applicationClanId}/members/${lateClanMember.uid}`).get()).exists,
    "The rejected officer removal changed the clan roster."
  );
  await callFunction("demoteClanOfficer", clanLeader.token, { targetUid: clanApplicant.uid });

  const pendingDisbandApplicant = queuedUser;
  await db.doc(`players/${pendingDisbandApplicant.uid}`).set({
    character: { level: 10, xp: 0, skillPoints: 9 },
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
  }, { merge: true });
  await callFunction("applyToClan", pendingDisbandApplicant.token, {
    clanId: applicationClanId,
    message: "Disband cleanup applicant",
  });
  let memberDisbandError = null;
  try {
    await callFunction("disbandClan", lateClanMember.token);
  } catch (error) {
    memberDisbandError = error;
  }
  assert(
    /clan role does not allow that action|only the clan leader/i.test(String(memberDisbandError?.message || "")),
    "A regular member was allowed to disband the clan."
  );
  assert(
    (await db.doc(`clans/${applicationClanId}`).get()).data()?.status === "active",
    "A rejected member disband request changed the clan state."
  );

  const rosterBeforeDisbandSnapshot = await db.collection(`clans/${applicationClanId}/members`).get();
  const expectedDisbandMemberCount = rosterBeforeDisbandSnapshot.size;
  const disbandedClan = await callFunction("disbandClan", clanLeader.token);
  assert(disbandedClan?.disbanded === true, "The leader's multi-member clan disband was not confirmed.");
  assert(
    disbandedClan.memberCount === expectedDisbandMemberCount && expectedDisbandMemberCount > 1,
    "The disband result did not count the full clan roster."
  );
  assert(disbandedClan.applicationCount === 1, "The disband result did not count the pending applicant.");
  const [
    disbandedClanSnapshot,
    disbandedMembersSnapshot,
    disbandedLeaderProfile,
    disbandedApplicantProfile,
    disbandedSecondSenderProfile,
    disbandedLateMemberProfile,
    releasedApplicantProfile,
    releasedApplicationSnapshot,
    disbandedBenefitsSnapshot,
    disbandedLeaderboardSnapshot,
  ] = await Promise.all([
    db.doc(`clans/${applicationClanId}`).get(),
    db.collection(`clans/${applicationClanId}/members`).get(),
    clanLeaderRef.get(),
    clanApplicantRef.get(),
    clanSecondSenderRef.get(),
    db.doc(`players/${lateClanMember.uid}`).get(),
    db.doc(`players/${pendingDisbandApplicant.uid}`).get(),
    db.doc(`clans/${applicationClanId}/applications/${pendingDisbandApplicant.uid}`).get(),
    db.doc(`clans/${applicationClanId}/worldBenefits/${realm.resetGeneration}`).get(),
    db.doc(`clanLeaderboards/${realm.resetGeneration}/entries/${applicationClanId}`).get(),
  ]);
  const retiredClan = disbandedClanSnapshot.data() || {};
  assert(retiredClan.status === "disbanded" && retiredClan.memberCount === 0, "The clan document was not retired.");
  assert(!retiredClan.leaderUid, "The disbanded clan retained an active leader.");
  assert(disbandedMembersSnapshot.empty, "Disbanding did not remove the full clan roster.");
  [disbandedLeaderProfile, disbandedApplicantProfile, disbandedSecondSenderProfile, disbandedLateMemberProfile].forEach(profileSnapshot => {
    assert(!profileSnapshot.data()?.clanId, `Disbanding did not clear clan identity for ${profileSnapshot.id}.`);
  });
  assert(
    Number(disbandedLeaderProfile.data()?.clanJoinCooldownUntilMs || 0) > Date.now(),
    "The disbanding leader did not receive the normal clan cooldown."
  );
  assert(
    Number(disbandedApplicantProfile.data()?.clanJoinCooldownUntilMs || 0) <= Date.now()
      && Number(disbandedSecondSenderProfile.data()?.clanJoinCooldownUntilMs || 0) <= Date.now()
      && Number(disbandedLateMemberProfile.data()?.clanJoinCooldownUntilMs || 0) <= Date.now(),
    "Members removed by a disband were incorrectly placed on a clan cooldown."
  );
  assert(!releasedApplicationSnapshot.exists, "Disbanding did not delete the pending clan application.");
  assert(!releasedApplicantProfile.data()?.pendingClanApplicationId, "Disbanding did not release the pending applicant.");
  assert(disbandedBenefitsSnapshot.data()?.status === "inactive", "Disbanding did not end shared clan benefits.");
  assert(!disbandedLeaderboardSnapshot.exists, "Disbanding did not remove the clan leaderboard entry.");

  console.log(`Emulator reset gate passed for 50 players with daily rewards, clan gifts, conquest quests, and leader clan disbanding: ${counts.join("/")} across starter islands.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
