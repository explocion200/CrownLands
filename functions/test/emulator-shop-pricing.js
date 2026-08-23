const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
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
      email: `shop-price-${nonce}@example.test`,
      password: `Shop-${nonce}-Pass!`,
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

function expectedTaxPrice(rawBaseGoldPerHour, cityCount) {
  const cityPremium = 1 + Math.min(Math.max(0, cityCount) / 500, 0.35);
  const amount = Math.max(0, rawBaseGoldPerHour) * 0.18 * cityPremium;
  const step = 10 ** Math.max(1, Math.floor(Math.log10(Math.max(1, amount))) - 1);
  return Math.max(50, Math.round(amount / step) * step);
}

function createGoldProductionGear() {
  const gear = commonGear.createDefaultState();
  const definition = commonGear.DEFINITIONS.find(candidate => candidate.statType === "goldProductionAllCities");
  assert(definition, "The Shop pricing fixture is missing Gold production Gear.");
  const instanceId = "shop_gold_production_gear";
  gear.instances[instanceId] = commonGear.normalizeInstance({
    instanceId,
    gearKey: definition.gearKey,
    level: 5,
    acquiredAtMs: Date.now(),
  });
  gear.equipped[definition.buildingId][definition.slot] = instanceId;
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
    ownerName: owned ? "Shop Sentinel" : "",
    productionUpdatedAtMs: Date.now(),
  }, { merge: true });
}

async function main() {
  const user = await createAuthUser();
  const claim = await callFunction("claimStartingCity", user.token, { playerName: "Shop Sentinel" });
  const profileRef = db.doc(`players/${user.uid}`);
  const mainCityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const mainRegionId = claim.mainRegionId || claim.islandId.split("-").at(-1);
  const secondCity = (getMapById(mainRegionId)?.cities || []).find(city => city.id !== claim.cityId);
  assert(secondCity, "The Shop pricing fixture could not find a second regular city.");
  const secondCityRef = db.doc(`islands/${claim.islandId}/cities/${secondCity.id}`);
  const objectives = {
    gold: getObjective("west_gold_stronghold"),
    citadel: getObjective("center_crown_citadel"),
  };
  const clanId = `shop-clan-${crypto.randomBytes(5).toString("hex")}`;
  const clanBenefitsRef = db.doc(`clans/${clanId}/worldBenefits/${realm.resetGeneration}`);
  const baseLevel = 20;
  const raisedLevel = 30;
  const secondCityLevel = 20;
  const taxItemId = "royal_tax_decree_30m";
  const highGold = 10_000_000_000_000;
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
    { name: "Tax Stewardship", upgrades: { taxStewardship: 10 }, boostsNormal: true },
    { name: "Gold Common Gear", gear: createGoldProductionGear(), boostsNormal: true },
    { name: "Gold Stronghold", objectives: ["gold"], boostsNormal: true },
    { name: "Crown Citadel", objectives: ["citadel"], boostsNormal: true },
    { name: "clan-shared Gold objective", clanShared: true, boostsNormal: true },
    { name: "Royal Tax Decree", royalTax: true, boostsNormal: true },
    {
      name: "stacked Gold bonuses",
      upgrades: { taxStewardship: 10 },
      gear: createGoldProductionGear(),
      objectives: ["gold", "citadel"],
      clanShared: true,
      royalTax: true,
      boostsNormal: true,
    },
    { name: "regular-city level and ownership growth", mainLevel: raisedLevel, secondCityOwned: true, growsRaw: true },
  ];

  const baselineRaw = baseGoldPerHourForLevel(baseLevel);
  let baselinePrice = 0;

  for (const scenario of scenarios) {
    const nowMs = Date.now();
    const mainLevel = scenario.mainLevel || baseLevel;
    await Promise.all([
      profileRef.set({
        gold: highGold,
        goldFloat: highGold,
        economyUpdatedAtMs: nowMs,
        upgrades: { ...emptyUpgrades, ...(scenario.upgrades || {}) },
        gear: scenario.gear || commonGear.createDefaultState(),
        itemEffects: {
          royalTaxDecreeStartedAtMs: scenario.royalTax ? nowMs - 60_000 : 0,
          royalTaxDecreeExpiresAtMs: scenario.royalTax ? nowMs + 20 * 60 * 1000 : 0,
        },
        shopItems: { [taxItemId]: 0 },
        itemPurchaseCooldowns: {},
        clanId: scenario.clanShared ? clanId : "",
      }, { merge: true }),
      mainCityRef.set({
        level: mainLevel,
        troops: 5_000_000,
        troopFloat: 5_000_000,
        productionUpdatedAtMs: nowMs,
      }, { merge: true }),
      secondCityRef.set({
        ...secondCity,
        level: secondCityLevel,
        worldId: realm.worldId,
        resetGeneration: realm.resetGeneration,
        regionId: mainRegionId,
        owner: scenario.secondCityOwned ? "player" : "neutral",
        ownerKind: scenario.secondCityOwned ? "player" : "neutral",
        ownerUid: scenario.secondCityOwned ? user.uid : "",
        ownerId: scenario.secondCityOwned ? user.uid : "",
        ownerName: scenario.secondCityOwned ? "Shop Sentinel" : "",
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
          ? { goldBonusPercent: 6, troopBonusPercent: 0 }
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

    const economy = await callFunction("collectEconomy", user.token);
    const expectedRaw = baseGoldPerHourForLevel(mainLevel)
      + (scenario.secondCityOwned ? baseGoldPerHourForLevel(secondCityLevel) : 0);
    const expectedCityCount = scenario.secondCityOwned ? 2 : 1;
    const pricing = economy.shopPricing || economy.currentUser?.shopPricing || {};
    const normalGoldPerHour = Number(economy.globalStats?.goldPerHour || 0);
    const expectedPrice = expectedTaxPrice(expectedRaw, expectedCityCount);

    assert(Number(pricing.rawBaseGoldPerHour || 0) === expectedRaw, `${scenario.name}: raw Shop rate changed (${pricing.rawBaseGoldPerHour} !== ${expectedRaw}).`);
    assert(Number(pricing.cityCount || 0) === expectedCityCount, `${scenario.name}: regular-city premium count changed.`);
    if (scenario.boostsNormal) {
      assert(normalGoldPerHour > expectedRaw, `${scenario.name}: the production bonus no longer increases normal Gold/hour.`);
    } else {
      assert(normalGoldPerHour === expectedRaw, `${scenario.name}: unboosted normal production drifted from raw production.`);
    }

    const incorrectlyBoostedQuote = expectedTaxPrice(normalGoldPerHour, expectedCityCount);
    if (incorrectlyBoostedQuote !== expectedPrice) {
      const beforeRejected = (await profileRef.get()).data() || {};
      const rejected = await invokeFunction("purchaseShopItem", user.token, {
        itemId: taxItemId,
        cost: incorrectlyBoostedQuote,
      });
      const afterRejected = (await profileRef.get()).data() || {};
      assert(!rejected.ok && rejected.error?.status === "FAILED_PRECONDITION", `${scenario.name}: a boosted or stale quote was accepted.`);
      assert(Number(afterRejected.gold || 0) === Number(beforeRejected.gold || 0), `${scenario.name}: rejected quote changed Gold.`);
      assert(Number(afterRejected.shopItems?.[taxItemId] || 0) === 0, `${scenario.name}: rejected quote granted an item.`);
    }

    const purchase = await callFunction("purchaseShopItem", user.token, {
      itemId: taxItemId,
      cost: expectedPrice,
    });
    assert(Number(purchase.unitPrice || 0) === expectedPrice, `${scenario.name}: server returned the wrong unit price.`);
    assert(Number(purchase.spentGold || 0) === expectedPrice, `${scenario.name}: server charged the wrong scalable price.`);
    assert(Number(purchase.currentUser?.shopItems?.[taxItemId] || 0) === 1, `${scenario.name}: purchase did not grant exactly one item.`);

    if (!baselinePrice) baselinePrice = expectedPrice;
    if (!scenario.growsRaw) {
      assert(expectedRaw === baselineRaw, `${scenario.name}: a bonus incorrectly changed raw production.`);
      assert(expectedPrice === baselinePrice, `${scenario.name}: a bonus incorrectly changed Shop price.`);
    } else {
      assert(expectedRaw > baselineRaw, "Regular-city growth did not increase raw production.");
      assert(expectedPrice > baselinePrice, "Regular-city growth did not increase Shop price.");
    }
  }

  console.log("Server-authoritative scalable Shop pricing emulator validation passed.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
