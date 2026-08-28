const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const commonGear = require("../common-gear.js");
const economyConfig = require("../economy-config.json");
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

async function createAuthUser() {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `camp-raw-reward-${nonce}@example.test`,
      password: `Camp-${nonce}-Pass!`,
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
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  }
  return body.result;
}

function baseGoldPerHourForLevel(level) {
  const cityEconomy = economyConfig.cityEconomy || {};
  const normalizedLevel = Math.max(1, Math.min(150, Math.floor(Number(level) || 1)));
  const curveLevel = Math.min(normalizedLevel, Number(cityEconomy.goldEndgameStartLevel || 100));
  const productionVp = Math.floor(
    Number(cityEconomy.productionVpBase || 19)
      * Math.pow(Number(cityEconomy.productionVpGrowth || 1.1155), curveLevel - 1)
      + 0.000001
  );
  const endgameMultiplier = normalizedLevel > curveLevel
    ? Math.pow(Number(cityEconomy.goldEndgameGrowth || 1.079), normalizedLevel - curveLevel)
    : 1;
  return Math.floor(productionVp * Number(cityEconomy.goldPerProductionVp || 15) * endgameMultiplier);
}

function baseTroopPerHourForLevel(level) {
  const normalizedLevel = Math.max(1, Math.min(150, Math.floor(Number(level) || 1)));
  const victoryPoints = Math.floor(6 + normalizedLevel * 4 + Math.pow(normalizedLevel, 1.35) * 2);
  return Math.floor(victoryPoints * Number(economyConfig.cityEconomy?.troopsPerVictoryPoint || 10.3));
}

function createProductionGear() {
  const gear = commonGear.createDefaultState();
  const definitions = [
    commonGear.DEFINITIONS.find(definition => definition.statType === "goldProductionAllCities"),
    commonGear.DEFINITIONS.find(definition => definition.statType === "troopProductionAllCities"),
  ];
  definitions.forEach((definition, index) => {
    assert(definition, "The Common Gear fixture is missing a production definition.");
    const instanceId = `camp_production_${index}`;
    gear.instances[instanceId] = commonGear.normalizeInstance({
      instanceId,
      gearKey: definition.gearKey,
      level: 5,
      acquiredAtMs: Date.now(),
    });
    gear.equipped[definition.buildingId][definition.slot] = instanceId;
  });
  return gear;
}

function getMapById(regionId) {
  return (worldLayout.maps || []).find(map => map.id === regionId);
}

function getObjective(objectiveId) {
  for (const map of worldLayout.maps || []) {
    const objective = (map.objectives || []).find(candidate => candidate.id === objectiveId);
    if (objective) return { regionId: map.id, ...objective };
  }
  throw new Error(`Missing objective ${objectiveId} in the authoritative world layout.`);
}

function getCamp(campType) {
  for (const map of worldLayout.maps || []) {
    const camp = (map.camps || []).find(candidate => candidate.campType === campType || candidate.type === campType);
    if (camp) return { regionId: map.id, ...camp };
  }
  throw new Error(`Missing ${campType} Camp in the authoritative world layout.`);
}

function objectiveRef(objective) {
  return db.doc(`islands/${realm.worldId}-${objective.regionId}/cities/${objective.id}`);
}

async function setObjectiveOwner(objective, user, owned) {
  await objectiveRef(objective).set({
    ...objective,
    kind: "stronghold",
    regionId: objective.regionId,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    owner: owned ? "player" : "neutral",
    ownerKind: owned ? "player" : "neutral",
    ownerUid: owned ? user.uid : "",
    ownerId: owned ? user.uid : "",
    ownerName: owned ? "Camp Sentinel" : "",
    productionUpdatedAtMs: Date.now(),
  }, { merge: true });
}

async function main() {
  const user = await createAuthUser();
  const claim = await callFunction("claimStartingCity", user.token, { playerName: "Camp Sentinel" });
  const profileRef = db.doc(`players/${user.uid}`);
  const mainCityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const mainRegionId = claim.mainRegionId || claim.islandId.split("-").at(-1);
  const additionalCity = (getMapById(mainRegionId)?.cities || []).find(city => city.id !== claim.cityId);
  assert(additionalCity, "The Camp fixture could not find a second regular city.");
  const additionalCityRef = db.doc(`islands/${claim.islandId}/cities/${additionalCity.id}`);
  const camps = { gold: getCamp("gold"), troops: getCamp("troops") };
  const objectives = {
    gold: getObjective("west_gold_stronghold"),
    training: getObjective("north_training_stronghold"),
    citadel: getObjective("center_crown_citadel"),
  };
  const clanId = `camp-clan-${crypto.randomBytes(5).toString("hex")}`;
  const clanBenefitsRef = db.doc(`clans/${clanId}/worldBenefits/${realm.resetGeneration}`);
  const baseLevel = 140;
  const raisedLevel = 150;
  const secondCityLevel = 100;
  const claimIndex = 3;
  const emptyUpgrades = {
    swordmastery: 0,
    shieldwallDiscipline: 0,
    stoneworks: 0,
    taxStewardship: 0,
    royalGranaries: 0,
    guildCharters: 0,
    marchOrders: 0,
    fieldMedics: 0,
  };
  const scenarios = [
    { name: "raw production only" },
    { name: "production skills", upgrades: { taxStewardship: 10, royalGranaries: 10 }, boostsGold: true, boostsTroops: true },
    { name: "production Common Gear", gear: createProductionGear(), boostsGold: true, boostsTroops: true },
    { name: "Gold and Training Strongholds", objectives: ["gold", "training"], boostsGold: true, boostsTroops: true },
    { name: "Crown Citadel", objectives: ["citadel"], boostsGold: true, boostsTroops: true },
    { name: "clan-shared objective", clanShared: true, boostsGold: true, boostsTroops: true },
    { name: "Royal Tax Decree", royalTax: true, boostsGold: true },
    { name: "War Drums", warDrums: true, boostsTroops: true },
    {
      name: "all production bonuses stacked",
      upgrades: { taxStewardship: 10, royalGranaries: 10 },
      gear: createProductionGear(),
      objectives: ["gold", "training", "citadel"],
      clanShared: true,
      royalTax: true,
      warDrums: true,
      boostsGold: true,
      boostsTroops: true,
    },
    { name: "normal-city level growth", mainLevel: raisedLevel, boostsRaw: true },
    { name: "normal-city ownership growth", secondCityOwned: true, boostsRaw: true },
  ];
  const baselineRaw = {
    gold: baseGoldPerHourForLevel(baseLevel),
    troops: baseTroopPerHourForLevel(baseLevel),
  };

  async function configureScenario(scenario, type) {
    const nowMs = Date.now();
    const mainLevel = scenario.mainLevel || baseLevel;
    const camp = camps[type];
    const campRef = db.doc(`islands/${realm.worldId}-${camp.regionId}/camps/${camp.id}`);
    const objectiveStatsId = type === "gold" ? "goldCamp" : "warbandCamp";
    await Promise.all([
      profileRef.set({
        upgrades: { ...emptyUpgrades, ...(scenario.upgrades || {}) },
        gear: scenario.gear || commonGear.createDefaultState(),
        itemEffects: {
          royalTaxDecreeExpiresAtMs: scenario.royalTax ? nowMs + 20 * 60 * 1000 : 0,
          warDrumsExpiresAtMs: scenario.warDrums ? nowMs + 20 * 60 * 1000 : 0,
        },
        clanId: scenario.clanShared ? clanId : "",
        clanObjectiveAccrual: FieldValue.delete(),
        pendingClanObjectiveAccrual: FieldValue.delete(),
        economyUpdatedAtMs: nowMs,
      }, { merge: true }),
      mainCityRef.set({
        level: mainLevel,
        troops: 5_000_000,
        troopFloat: 5_000_000,
        productionUpdatedAtMs: nowMs,
      }, { merge: true }),
      additionalCityRef.set({
        ...additionalCity,
        level: secondCityLevel,
        worldId: realm.worldId,
        resetGeneration: realm.resetGeneration,
        regionId: mainRegionId,
        owner: scenario.secondCityOwned ? "player" : "neutral",
        ownerKind: scenario.secondCityOwned ? "player" : "neutral",
        ownerUid: scenario.secondCityOwned ? user.uid : "",
        ownerId: scenario.secondCityOwned ? user.uid : "",
        ownerName: scenario.secondCityOwned ? "Camp Sentinel" : "",
        isMainCity: false,
        troops: 1_000,
        troopFloat: 1_000,
        productionUpdatedAtMs: nowMs,
      }, { merge: true }),
      campRef.set({
        ...camp,
        mapId: camp.regionId,
        regionId: camp.regionId,
        worldId: realm.worldId,
        resetGeneration: realm.resetGeneration,
        holderUid: user.uid,
        holderName: "Camp Sentinel",
        ownerUid: user.uid,
        ownerKind: "player",
        payoutPending: true,
        payoutAtMs: nowMs - 1_000,
        heldSinceMs: nowMs - 3_600_000,
        currentGarrison: 0,
        troops: 0,
        troopFloat: 0,
        alliedReinforcementTroops: 1,
        activeArmyIds: [],
        returnSourceCityId: claim.cityId,
        returnSourceRegionId: mainRegionId,
        returnSourceCityName: claim.cityName || "Main city",
        state: "held",
      }, { merge: false }),
      db.doc(`players/${user.uid}/objectiveStats/${objectiveStatsId}`).set({
        date: new Date(nowMs).toISOString().slice(0, 10),
        count: claimIndex,
        resetGeneration: realm.resetGeneration,
        worldId: realm.worldId,
      }, { merge: false }),
      clanBenefitsRef.set({
        clanId,
        worldId: realm.worldId,
        resetGeneration: realm.resetGeneration,
        status: scenario.clanShared ? "active" : "inactive",
        sharedBonuses: scenario.clanShared
          ? { goldBonusPercent: 6, troopBonusPercent: 6 }
          : { goldBonusPercent: 0, troopBonusPercent: 0 },
        citadelControllerUid: "",
        cumulativeGoldPercentMs: 0,
        cumulativeTroopPercentMs: 0,
        lastIntegratedAtMs: nowMs,
        revision: 1,
      }, { merge: true }),
      ...Object.entries(objectives).map(([key, objective]) => (
        setObjectiveOwner(objective, user, (scenario.objectives || []).includes(key))
      )),
    ]);
    return camp;
  }

  for (const scenario of scenarios) {
    for (const type of ["gold", "troops"]) {
      const camp = await configureScenario(scenario, type);
      const result = await callFunction("resolveRewardCampPayout", user.token, {
        campId: camp.id,
        regionId: camp.regionId,
      });
      const expectedRaw = {
        gold: baseGoldPerHourForLevel(scenario.mainLevel || baseLevel)
          + (scenario.secondCityOwned ? baseGoldPerHourForLevel(secondCityLevel) : 0),
        troops: baseTroopPerHourForLevel(scenario.mainLevel || baseLevel)
          + (scenario.secondCityOwned ? baseTroopPerHourForLevel(secondCityLevel) : 0),
      };
      const schedule = camp.rewardSchedule[claimIndex];
      const expectedReward = Math.max(
        Number(schedule.minimumReward),
        Math.floor(expectedRaw[type] * Number(schedule.productionHours))
      );
      const stats = result.globalStats || {};
      assert(result.status === "paid", `${scenario.name} ${type} Camp did not pay successfully (${result.status}).`);
      assert(
        Number(result.reward) === expectedReward,
        `${scenario.name} ${type} Camp used a boosted rate: ${result.reward}; expected raw ${expectedReward}.`
      );
      assert(
        Number(stats.baseGoldPerHour) === expectedRaw.gold,
        `${scenario.name} returned the wrong raw Gold rate (${stats.baseGoldPerHour}; expected ${expectedRaw.gold}).`
      );
      assert(
        Number(stats.baseTroopPerHour) === expectedRaw.troops,
        `${scenario.name} returned the wrong raw troop rate (${stats.baseTroopPerHour}; expected ${expectedRaw.troops}).`
      );
      if (scenario.boostsGold) {
        assert(Number(stats.goldPerHour) > expectedRaw.gold, `${scenario.name} failed to increase normal Gold production.`);
      } else {
        assert(
          Number(stats.goldPerHour) === expectedRaw.gold,
          `${scenario.name} unexpectedly changed normal Gold production (${stats.goldPerHour}; expected ${expectedRaw.gold}; source ${stats.strongholdBonusSource || "unknown"}; personal ${stats.personalStrongholdGoldBonusPercent || 0}%; shared ${stats.sharedClanGoldBonusPercent || 0}%).`
        );
      }
      if (scenario.boostsTroops) {
        assert(Number(stats.troopPerHour) > expectedRaw.troops, `${scenario.name} failed to increase normal troop production.`);
      } else {
        assert(
          Number(stats.troopPerHour) === expectedRaw.troops,
          `${scenario.name} unexpectedly changed normal troop production (${stats.troopPerHour}; expected ${expectedRaw.troops}; source ${stats.strongholdBonusSource || "unknown"}; personal ${stats.personalStrongholdTroopBonusPercent || 0}%; shared ${stats.sharedClanTroopBonusPercent || 0}%).`
        );
      }
      if (scenario.boostsRaw) {
        assert(expectedRaw.gold > baselineRaw.gold, `${scenario.name} did not increase raw Gold production.`);
        assert(expectedRaw.troops > baselineRaw.troops, `${scenario.name} did not increase raw troop production.`);
        assert(expectedReward > Number(schedule.minimumReward), `${scenario.name} did not raise the ${type} Camp reward above its floor.`);
      }
    }
  }

  console.log(
    "Emulator Camp rewards passed: Gold and troop Camps use raw regular-city production while normal skills, Gear, objectives, clan sharing, and timed boosts remain active."
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
