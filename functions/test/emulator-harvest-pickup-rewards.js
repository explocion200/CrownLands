const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const commonGear = require("../common-gear.js");
const economyConfig = require("../economy-config.json");
const realm = require("../release-config.json");
const worldLayout = require("../world-layout.json");

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

async function createAuthUser() {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `harvest-reward-${nonce}@example.test`,
      password: `Harvest-${nonce}-Pass!`,
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
    Number(cityEconomy.productionVpBase || 20)
      * Math.pow(Number(cityEconomy.productionVpGrowth || 1.115), curveLevel - 1)
      + 0.000001
  );
  const endgameMultiplier = normalizedLevel > curveLevel
    ? Math.pow(Number(cityEconomy.goldEndgameGrowth || 1.08), normalizedLevel - curveLevel)
    : 1;
  return Math.floor(productionVp * Number(cityEconomy.goldPerProductionVp || 15) * endgameMultiplier);
}

function baseTroopPerHourForLevel(level) {
  const normalizedLevel = Math.max(1, Math.min(150, Math.floor(Number(level) || 1)));
  const victoryPoints = Math.floor(
    6 + normalizedLevel * 4 + Math.pow(normalizedLevel, 1.35) * 2
  );
  return victoryPoints * Number(economyConfig.cityEconomy?.troopsPerVictoryPoint || 10);
}

function createProductionGear() {
  const gear = commonGear.createDefaultState();
  const definitions = [
    commonGear.DEFINITIONS.find(definition => definition.statType === "goldProductionAllCities"),
    commonGear.DEFINITIONS.find(definition => definition.statType === "troopProductionAllCities"),
  ];
  definitions.forEach((definition, index) => {
    assert(definition, "The Common Gear fixture is missing a production definition.");
    const instanceId = `pickup_production_${index}`;
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
    ownerName: owned ? "Harvest Sentinel" : "",
    productionUpdatedAtMs: Date.now(),
  }, { merge: true });
}

async function main() {
  const user = await createAuthUser();
  const claim = await callFunction("claimStartingCity", user.token, { playerName: "Harvest Sentinel" });
  const profileRef = db.doc(`players/${user.uid}`);
  const mainCityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const mainRegionId = claim.mainRegionId || claim.islandId.split("-").at(-1);
  const additionalCity = (getMapById(mainRegionId)?.cities || []).find(city => city.id !== claim.cityId);
  assert(additionalCity, "The pickup fixture could not find a second regular city.");
  const additionalCityRef = db.doc(`islands/${claim.islandId}/cities/${additionalCity.id}`);
  const objectives = {
    gold: getObjective("west_gold_stronghold"),
    training: getObjective("north_training_stronghold"),
    citadel: getObjective("center_crown_citadel"),
  };
  const clanId = `harvest-clan-${crypto.randomBytes(5).toString("hex")}`;
  const clanBenefitsRef = db.doc(`clans/${clanId}/worldBenefits/${realm.resetGeneration}`);
  const baseLevel = 20;
  const raisedLevel = 30;
  const secondCityLevel = 15;
  const pickupMinutes = {
    gold: Number(economyConfig.pickups?.goldAwardProductionMinutes || 60),
    troops: Number(economyConfig.pickups?.troopAwardProductionMinutes || 60),
  };
  const minimums = {
    gold: Number(economyConfig.pickups?.minimumGold || 250),
    troops: Number(economyConfig.pickups?.minimumTroops || 250),
  };
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
    {
      name: "production skills",
      upgrades: { taxStewardship: 10, royalGranaries: 10 },
      boostsGold: true,
      boostsTroops: true,
    },
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
    {
      name: "normal-city level and ownership growth",
      mainLevel: raisedLevel,
      secondCityOwned: true,
      boostsRaw: true,
    },
  ];

  const baselineRaw = {
    gold: baseGoldPerHourForLevel(baseLevel),
    troops: baseTroopPerHourForLevel(baseLevel),
  };

  async function configureScenario(scenario, type) {
    const nowMs = Date.now();
    const mainLevel = scenario.mainLevel || baseLevel;
    const pickupId = `pickup_${scenario.name.replace(/[^a-z0-9]+/gi, "_")}_${type}_${crypto.randomBytes(4).toString("hex")}`;
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
        daily: {
          date: new Date(nowMs).toISOString().slice(0, 10),
          neutralCaptures: 0,
          harvestedBonuses: 0,
          harvestedGoldBonuses: 0,
          harvestedTroopBonuses: 0,
        },
        harvestBonuses: [{
          id: pickupId,
          type,
          regionId: mainRegionId,
          x: 500,
          y: 500,
          createdAtMs: nowMs,
        }],
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
        ownerName: scenario.secondCityOwned ? "Harvest Sentinel" : "",
        isMainCity: false,
        troops: 1_000,
        troopFloat: 1_000,
        productionUpdatedAtMs: nowMs,
      }, { merge: true }),
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
    return pickupId;
  }

  for (const scenario of scenarios) {
    for (const type of ["gold", "troops"]) {
      const pickupId = await configureScenario(scenario, type);
      const result = await callFunction("collectHarvestBonus", user.token, {
        bonusId: pickupId,
        type,
      });
      const expectedRaw = {
        gold: baseGoldPerHourForLevel(scenario.mainLevel || baseLevel)
          + (scenario.secondCityOwned ? baseGoldPerHourForLevel(secondCityLevel) : 0),
        troops: baseTroopPerHourForLevel(scenario.mainLevel || baseLevel)
          + (scenario.secondCityOwned ? baseTroopPerHourForLevel(secondCityLevel) : 0),
      };
      const expectedReward = Math.max(
        minimums[type],
        Math.floor(expectedRaw[type] * pickupMinutes[type] / 60)
      );
      const stats = result.globalStats || result.currentUser?.globalStats || {};
      assert(
        Number(result.reward) === expectedReward,
        `${scenario.name} ${type} pickup used a boosted rate: ${result.reward}; expected raw ${expectedReward}.`
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
        assert(
          Number(stats.goldPerHour) > expectedRaw.gold,
          `${scenario.name} failed to increase normal Gold production while its pickup remained raw.`
        );
      } else {
        assert(
          Number(stats.goldPerHour) === expectedRaw.gold,
          `${scenario.name} unexpectedly changed normal Gold production.`
        );
      }
      if (scenario.boostsTroops) {
        assert(
          Number(stats.troopPerHour) > expectedRaw.troops,
          `${scenario.name} failed to increase normal troop production while its pickup remained raw.`
        );
      } else {
        assert(
          Number(stats.troopPerHour) === expectedRaw.troops,
          `${scenario.name} unexpectedly changed normal troop production.`
        );
      }
      if (scenario.boostsRaw) {
        assert(expectedRaw.gold > baselineRaw.gold, "Normal-city growth did not increase raw Gold production.");
        assert(expectedRaw.troops > baselineRaw.troops, "Normal-city growth did not increase raw troop production.");
        assert(expectedReward > minimums[type], `Normal-city growth did not increase the ${type} pickup above its floor.`);
      }
    }
  }

  console.log(
    "Emulator harvest pickup rewards passed: raw city rates stay authoritative across skills, Gear, objectives, clan sharing, timed items, stacking, and normal-city growth."
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
