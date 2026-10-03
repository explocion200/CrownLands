const { signUpVerifiedPlayer } = require("./auth-fixtures");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const { strictEqual, rejects } = require("node:assert/strict");
const commonGear = require("../common-gear.js");
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
  const response = await signUpVerifiedPlayer(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `battle-gear-${label}-${nonce}@example.test`,
      password: `Battle-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunction(name, token, data = {}) {
  const host = await resolveFunctionsHost();
  const response = await fetch(`http://${host}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
        clientRealmShardId: realm.realmShardId || "legacy",
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

function createEquippedGear(selections = []) {
  const state = commonGear.createDefaultState();
  selections.forEach((selection, index) => {
    const definition = commonGear.DEFINITIONS.find(entry => (
      entry.buildingId === selection.buildingId && entry.slot === selection.slot
        && entry.rarity === (selection.rarity || "common")
    ));
    assert(definition, `Missing ${selection.buildingId}/${selection.slot} gear definition.`);
    const instanceId = `battle_report_gear_${index}`;
    state.instances[instanceId] = {
      instanceId,
      gearKey: definition.gearKey,
      level: selection.level || 5,
      acquiredAtMs: Date.now() + index,
    };
    state.equipped[definition.buildingId][definition.slot] = instanceId;
  });
  return commonGear.normalizeState(state);
}

async function main() {
  const layout = require("../core-expansion-world-layout.json");
  // A fresh emulator has no previous season history. Arm its empty fixture before
  // bootstrapping the current month, without bypassing production closing guards.
  const rewards = require("../season-rewards");
  const previous = rewards.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
  if (rewards.supported(previous)) await rewards.arm(db, previous, rewards.seasonInfo(previous).startsAtMs + 1);
  const [attacker, holder, ally] = await Promise.all(["attacker", "holder", "ally"].map(createAuthUser));
  const info = await callFunction("getRealmInfo", attacker.token);
  Object.assign(realm, { releaseId: info.currentReleaseId, resetGeneration: info.resetGeneration,
    worldId: info.worldId, realmShardId: info.sharedRealmId });
  const storageId = realm.realmShardId && realm.realmShardId !== "legacy"
    ? `${realm.resetGeneration}--${realm.realmShardId}` : realm.resetGeneration;
  const claims = [];
  for (const [index, user] of [attacker, holder, ally].entries()) {
    claims.push(await callFunction("claimStartingCity", user.token, { playerName: `Camp Ruler ${index}` }));
  }
  const sourceRegion = claims[0].regionId || claims[0].mainRegionId;
  const current = { worldId: realm.worldId, resetGeneration: realm.resetGeneration, realmShardId: realm.realmShardId || "legacy" };
  const sourceRef = db.doc(`islands/${claims[0].islandId}/cities/${claims[0].cityId}`);
  const clanId = `camp_defense_${crypto.randomBytes(5).toString("hex")}`;
  await db.doc(`clans/${clanId}`).set({ ...current, status: "active", leaderUid: holder.uid, memberCount: 2, name: "Camp defenders", tag: "CAMP" });
  const holderGear = createEquippedGear([{ buildingId: "gatehouse", slot: "weapon" }, { buildingId: "gatehouse", slot: "head", rarity: "legendary" }]);
  const allyGear = createEquippedGear([{ buildingId: "gatehouse", slot: "weapon", rarity: "legendary" }]);
  for (const [user, role, gear, level] of [[holder, "leader", holderGear, 10], [ally, "member", allyGear, 20]]) {
    await db.doc(`clans/${clanId}/members/${user.uid}`).set({ ...current, uid: user.uid, clanId, role, status: "active", joinedAtMs: Date.now() - 172_800_000 });
    await db.doc(`players/${user.uid}`).set({ clanId, clanRole: role, clanJoinedAtMs: Date.now() - 172_800_000, gear,
      character: { level: 100, xp: 0 }, upgrades: { shieldwallDiscipline: level, stoneworks: 34 }, skillPointSystemVersion: 2,
      itemEffects: { shieldExpiresAtMs: 0 }, economyUpdatedAtMs: Date.now() }, { merge: true });
  }
  const expected = (troops, skill, gear) => Math.floor(troops * 1.3 * (1 + skill / 100))
    + Math.floor(troops * 1.3 * commonGear.getBonuses({ gear }).defenderStrength / 100);
  async function seed(campType, playerHeld = true) {
    const map = layout.maps.find(row => row.camps?.some(camp => camp.campType === campType));
    const camp = { ...map.camps.find(row => row.campType === campType), regionId: map.id };
    const island = realm.realmShardId && realm.realmShardId !== "legacy"
      ? `${realm.worldId}--${realm.realmShardId}--${map.id}` : `${realm.worldId}-${map.id}`;
    const ref = db.doc(`islands/${island}/camps/${camp.id}`);
    await ref.set({ ...camp, ...current, holderUid: playerHeld ? holder.uid : "", ownerUid: playerHeld ? holder.uid : "",
      holderName: "Camp holder", ownerKind: playerHeld ? "player" : "neutral", combatVersion: 1,
      currentGarrison: playerHeld ? 10_000 : 20_000, troops: playerHeld ? 10_000 : 20_000,
      alliedReinforcementTroops: playerHeld ? 5_000 : 0, activeArmyIds: [],
      heldSinceMs: Date.now(), payoutAtMs: Date.now() + 3_600_000, payoutPending: playerHeld,
      state: playerHeld ? "held" : "neutral", returnSourceCityId: claims[1].cityId,
      returnSourceRegionId: claims[1].regionId || claims[1].mainRegionId }, { merge: false });
    const targetKey = `camp:${map.id}:${camp.id}`;
    const reinforcementId = `reinforce_${crypto.createHash("sha256").update(`${realm.resetGeneration}|${ally.uid}|${targetKey}`).digest("hex").slice(0, 40)}`;
    const contribution = db.doc(`reinforcements/${reinforcementId}`);
    if (playerHeld) {
      await contribution.set({ ...current, ownerUid: ally.uid, ownerName: "Camp ally", targetOwnerUid: holder.uid,
        clanId, targetKey, targetType: "camp", targetId: camp.id, targetRegionId: map.id, troops: 5_000, status: "stationed",
        sourceCityId: claims[2].cityId, sourceRegionId: claims[2].regionId || claims[2].mainRegionId,
        reinforcementSourceId: claims[2].cityId, reinforcementSourceRegionId: claims[2].regionId || claims[2].mainRegionId,
        reinforcementRecipientUid: holder.uid });
      await db.doc(`players/${ally.uid}`).set({ stationedReinforcementTroops: 5_000 }, { merge: true });
    } else await contribution.delete();
    return { ...camp, ref, contribution };
  }
  async function launch(camp, kind, troops) {
    await sourceRef.set({ troops: 1_000_000, troopFloat: 1_000_000, productionUpdatedAtMs: Date.now() }, { merge: true });
    const armyId = `camp_defense_${kind}_${crypto.randomBytes(6).toString("hex")}`;
    const result = await callFunction("sendArmyOrder", attacker.token, { sourceRegionId: sourceRegion, targetRegionId: camp.regionId,
      targetType: "camp", army: { id: armyId, kind, fromId: claims[0].cityId, toId: camp.id, troops, requestedTroops: troops,
        sourceRegionId: sourceRegion, targetRegionId: camp.regionId, targetType: "camp" } });
    strictEqual(result.movement.id, armyId);
    return armyId;
  }
  async function arrive(id) {
    await db.doc(`armies/${id}`).set({ arrivesAtMs: Date.now() - 1_000 }, { merge: true });
    return callFunction("resolveArmyOrder", attacker.token, { armyId: id });
  }
  for (const type of ["gold", "troops", "items", "deed"]) {
    const camp = await seed(type);
    const total = expected(10_000, 30, holderGear) + expected(5_000, 60, allyGear);
    const inspect = await callFunction("getRewardCampDefense", holder.token, { campId: camp.id, regionId: camp.regionId });
    strictEqual(inspect.totalDefense, total, `${type}: holder inspection must use each owner's gear`);
    strictEqual(inspect.troops, 15_000);
    await rejects(callFunction("getRewardCampDefense", attacker.token, { campId: camp.id, regionId: camp.regionId }), /current camp holder/);
    if (type !== "gold") continue;
    const scoutId = await launch(camp, "scout", 1);
    const scouting = await arrive(scoutId);
    const report = scouting.scoutReport;
    assert(report, "Scout resolution must return the saved intelligence");
    strictEqual(report.totalDefense, total);
    strictEqual(report.ownerDefensePower, expected(10_000, 30, holderGear));
    strictEqual(report.reinforcements[0].effectivePower, expected(5_000, 60, allyGear));
    await db.doc(`players/${attacker.uid}`).set({ upgrades: { fieldMedics: 25 } }, { merge: true });
    const attackId = await launch(camp, "attack", 20_000);
    await db.doc(`players/${attacker.uid}`).set({ upgrades: { fieldMedics: 0 } }, { merge: true });
    const launched = (await db.doc(`armies/${attackId}`).get()).data();
    strictEqual(launched.launchCombatForecast.defensePower, total, "Forecast must preserve the scout's full camp defense");
    // Current defensive skills are evaluated on arrival, including pre-update marches.
    await db.doc(`players/${holder.uid}`).set({ upgrades: { shieldwallDiscipline: 34 } }, { merge: true });
    await db.doc(`armies/${attackId}`).set({ defenseCombatVersion: 0 }, { merge: true });
    await arrive(attackId);
    const snapshot = (await db.doc(`battleSnapshots/${storageId}/entries/${attackId}`).get()).data();
    assert(snapshot, "Camp combat must persist a battle snapshot");
    strictEqual(snapshot.attacker.casualtyRecovery.fieldMedicsPercent, 50, "Camp attack lost departure Field Medics");
    strictEqual(snapshot.attacker.casualtyRecovery.recoveredTroops, Math.floor(snapshot.totals.attackerLosses / 2), "Camp attack recovery used arrival skills");
    strictEqual(snapshot.totals.defensePower, expected(10_000, 100, holderGear) + expected(5_000, 60, allyGear));
    strictEqual(snapshot.defenseCombatVersion, 1);
    assert(!snapshot.siege, "Camp bonuses must not create walls");
    assert(snapshot.gearEffects.defender.items.some(item => item.ownerUid === ally.uid && item.statType === "defenderStrength"), "Ally gear must retain its owner in the report");
    assert(!snapshot.gearEffects.defender.items.some(item => item.statType === "wallStrength"), "Camp wall armor must contribute nothing");
    const saved = JSON.stringify(snapshot);
    await arrive(attackId);
    strictEqual(JSON.stringify((await db.doc(`battleSnapshots/${storageId}/entries/${attackId}`).get()).data()), saved, "Repeated settlement must not change the snapshot");
    await db.doc(`players/${holder.uid}`).set({ upgrades: { shieldwallDiscipline: 10 } }, { merge: true });
    const neutral = await seed("gold", false);
    const neutralId = await launch(neutral, "attack", 50_000);
    await arrive(neutralId);
    const neutralBattle = (await db.doc(`battleSnapshots/${storageId}/entries/${neutralId}`).get()).data();
    strictEqual(neutralBattle.totals.defensePower, 20_000);
    strictEqual(neutralBattle.defenseCombatVersion, 0);
  }
  console.log("Player camp defense emulator passed: all four camp types, private inspection, scouting, current skills, own allied gear, NPC combat and duplicate settlement.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
