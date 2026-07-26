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

async function mapWithConcurrency(values, limit, operation) {
  const items = Array.from(values || []);
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(items[index], index);
      }
    }
  );
  await Promise.all(workers);
  return results;
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
  const remainingClaims = await mapWithConcurrency(users.slice(1), 5, (user, index) => (
    callFunction("claimStartingCity", user.token, { playerName: `Ruler ${index + 2}` })
  ));
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

  const attacker = users[0];
  const sourceClaim = claims[0];
  const sourceRef = db.doc(`islands/${sourceClaim.islandId}/cities/${sourceClaim.cityId}`);
  const source = (await sourceRef.get()).data() || {};
  const citySnapshot = await db.collection(`islands/${sourceClaim.islandId}/cities`)
    .where("ownerUid", "==", null)
    .limit(10)
    .get();
  const targetDoc = citySnapshot.docs.find(doc => !doc.data()?.strongholdType && doc.id !== sourceClaim.cityId);
  assert(targetDoc, "No neutral target was available for the army smoke test.");
  const target = targetDoc.data() || {};
  const distance = Math.hypot(Number(target.x) - Number(source.x), Number(target.y) - Number(source.y));
  const armyId = `reset_gate_${crypto.randomBytes(8).toString("hex")}`;
  const order = {
    army: {
      id: armyId,
      kind: "attack",
      fromId: sourceClaim.cityId,
      toId: targetDoc.id,
      fromName: source.name || sourceClaim.cityId,
      toName: target.name || targetDoc.id,
      troops: 10,
      requestedTroops: 10,
      total: 30,
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
  };
  const sent = await callFunction("sendArmyOrder", attacker.token, order);
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

  console.log(`Emulator reset gate passed for 50 players: ${counts.join("/")} across starter islands.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
