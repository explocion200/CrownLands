const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const economyConfig = require("../economy-config.json");
const realm = require("../release-config.json");
const commonGear = require("../common-gear.js");

const SHOP_PRICE_HOURS = Object.freeze({
  shield_12h: 1,
  war_drums_30m: 0.36,
  royal_tax_decree_30m: 0.18,
  veil_of_silence_30m: 0.18,
  swift_march_order: 0.36,
  recall_horn: 0.54,
  common_gear_box: 1,
});

function getExpectedShopPrice(itemId, pricing = {}) {
  const rawRate = Math.max(0, Number(pricing.rawBaseGoldPerHour) || 0);
  const cityCount = Math.max(0, Math.floor(Number(pricing.cityCount) || 0));
  const premium = 1 + Math.min(cityCount / 500, 0.35);
  const amount = rawRate * SHOP_PRICE_HOURS[itemId] * premium;
  const step = 10 ** Math.max(1, Math.floor(Math.log10(Math.max(1, amount))) - 1);
  return Math.max(50, Math.round(amount / step) * step);
}

function getXpRequiredForLevel(level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
  const legacyRequirement = value => Math.floor(150 + value * 65 + Math.pow(value, 2.05) * 35);
  if (current <= 25) return legacyRequirement(current);
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(legacyRequirement(25) * Math.pow(1.1, current - 25)));
}

function getCityUpgradeXp(level) {
  return Math.max(1, Math.floor(
    getXpRequiredForLevel(level) * Number(economyConfig.cityUpgradeXp?.fixedXpRate || 0.05)
  ));
}

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

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(Number(actual) - Number(expected)) > tolerance) {
    throw new Error(`${message}: ${actual} !== ${expected} (±${tolerance})`);
  }
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
      email: `economy-race-${nonce}@example.test`,
      password: `Economy-${nonce}-Pass!`,
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

async function main() {
  const user = await createAuthUser();
  const claim = await callFunction("claimStartingCity", user.token, { playerName: "Economy Sentinel" });
  const profileRef = db.doc(`players/${user.uid}`);
  const cityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  const productionStartMs = Date.now() - 60 * 60 * 1000;

  await Promise.all([
    profileRef.set({
      gold: 100,
      goldFloat: 100,
      economyUpdatedAtMs: productionStartMs,
      shopItems: {},
      itemEffects: {},
      itemPurchaseCooldowns: {},
    }, { merge: true }),
    cityRef.set({
      level: 1,
      troops: 200,
      troopFloat: 200,
      productionUpdatedAtMs: productionStartMs,
    }, { merge: true }),
  ]);

  // Keep a meaningful same-player race without saturating the local Firestore
  // emulator's transaction-lock scheduler during the full release gate.
  const economyResults = await Promise.all(
    Array.from({ length: 6 }, () => invokeFunction("collectEconomy", user.token))
  );
  assert(economyResults.every(result => result.ok), "Concurrent economy collection returned an error.");
  const [profileAfterEconomy, cityAfterEconomy] = await Promise.all([profileRef.get(), cityRef.get()]);
  const collectedGold = Number(profileAfterEconomy.data()?.goldFloat || profileAfterEconomy.data()?.gold || 0);
  const collectedTroops = Number(cityAfterEconomy.data()?.troopFloat || cityAfterEconomy.data()?.troops || 0);
  const cityEconomy = economyConfig.cityEconomy || {};
  const expectedGold = 100
    + Math.floor(Number(cityEconomy.productionVpBase || 20))
      * Number(cityEconomy.goldPerProductionVp || 15);
  const levelOneVictoryPoints = Math.floor(6 + 4 + Math.pow(1, 1.35) * 2);
  const expectedTroops = 200
    + levelOneVictoryPoints * Number(cityEconomy.troopsPerVictoryPoint || 3);
  assert(
    collectedGold >= expectedGold - 2 && collectedGold < expectedGold + 10,
    `Concurrent collection duplicated gold production (${collectedGold}; expected about ${expectedGold}).`
  );
  assert(
    collectedTroops >= expectedTroops - 2 && collectedTroops < expectedTroops + 10,
    `Concurrent collection duplicated troop production (${collectedTroops}; expected about ${expectedTroops}).`
  );
  const shopPricing = economyResults.find(result => result.ok)?.result?.shopPricing || {};
  assert(Number(shopPricing.rawBaseGoldPerHour || 0) > 0, "Economy response omitted raw Shop pricing context.");
  assert(Number(shopPricing.cityCount || 0) === 1, "Shop pricing context did not count the regular owned city.");

  const cityRegionId = String((await cityRef.get()).data()?.regionId || claim.regionId || "west");
  const cityXpHighWatermarkRef = db.doc(
    `players/${user.uid}/cityUpgradeXp/${realm.resetGeneration}_${cityRegionId}_${claim.cityId}`
  );
  await Promise.all([
    profileRef.set({
      gold: 1000000000,
      goldFloat: 1000000000,
      character: { level: 1, xp: 0, skillPoints: 0 },
      economyUpdatedAtMs: Date.now(),
    }, { merge: true }),
    cityRef.set({
      level: 1,
      troops: 200,
      troopFloat: 200,
      investedGold: 0,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true }),
  ]);
  const legacyUpgrade = await callFunction("upgradeCity", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
  });
  assert(legacyUpgrade.legacyCityUpgradeRequest === true, "A request without an ID was not handled as legacy.");
  assert(Number(legacyUpgrade.cityUpgradeXp?.rawXp || 0) === 0, "A legacy upgrade exposed awardable Hero XP.");
  assert(Number(legacyUpgrade.cityUpgradeXp?.awardedXp || 0) === 0, "A legacy upgrade awarded Hero XP.");
  assert(
    Number(legacyUpgrade.cityUpgradeXp?.legacySuppressedXp || 0) === getCityUpgradeXp(1),
    "The legacy receipt did not account for the skipped city XP."
  );
  const [profileAfterLegacy, cityAfterLegacy, highWatermarkAfterLegacy] = await Promise.all([
    profileRef.get(),
    cityRef.get(),
    cityXpHighWatermarkRef.get(),
  ]);
  assert(Number(cityAfterLegacy.data()?.level || 0) === 2, "A compatible legacy request did not upgrade the city.");
  assert(Number(profileAfterLegacy.data()?.character?.xp || 0) === 0, "A legacy request changed Hero progression.");
  assert(
    Number(highWatermarkAfterLegacy.data()?.highestDevelopedCityLevel || 0) === 2,
    "A legacy request did not advance the seasonal city high-watermark."
  );

  await cityRef.set({
    level: 1,
    productionUpdatedAtMs: Date.now(),
  }, { merge: true });
  const reclaimPreview = await callFunction("getCityUpgradeXpPreview", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
  });
  assert(Number(reclaimPreview.cityUpgradeXp?.rawXp || 0) === 0, "A modern client could reclaim legacy-upgraded XP.");
  assert(
    Number(reclaimPreview.cityUpgradeXp?.rebuildSuppressedXp || 0) === getCityUpgradeXp(1),
    "The legacy-upgraded level was not treated as already developed."
  );
  const [profileBeforeRejectedReclaim, cityBeforeRejectedReclaim] = await Promise.all([
    profileRef.get(),
    cityRef.get(),
  ]);
  const rejectedReclaim = await invokeFunction("upgradeCity", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
    requestId: `city-upgrade-legacy-reclaim-warning-${crypto.randomBytes(6).toString("hex")}`,
  });
  assert(!rejectedReclaim.ok, "An unacknowledged legacy-level reclaim committed.");
  assert(
    rejectedReclaim.error?.details?.reason === "city-upgrade-xp-warning-required",
    "The legacy-level reclaim did not require the modern suppression warning."
  );
  const [profileAfterRejectedReclaim, cityAfterRejectedReclaim, watermarkAfterRejectedReclaim] = await Promise.all([
    profileRef.get(),
    cityRef.get(),
    cityXpHighWatermarkRef.get(),
  ]);
  assert(Number(cityAfterRejectedReclaim.data()?.level || 0) === 1, "A rejected reclaim partially upgraded the city.");
  assert(
    Number(profileAfterRejectedReclaim.data()?.goldFloat || 0)
      === Number(profileBeforeRejectedReclaim.data()?.goldFloat || 0),
    "A rejected reclaim partially spent Gold."
  );
  assert(
    JSON.stringify(profileAfterRejectedReclaim.data()?.character || {})
      === JSON.stringify(profileBeforeRejectedReclaim.data()?.character || {}),
    "A rejected reclaim changed Hero progression or level-up rewards."
  );
  for (const field of ["investedGold", "troops", "troopFloat"]) {
    assert(
      Number(cityAfterRejectedReclaim.data()?.[field] || 0) === Number(cityBeforeRejectedReclaim.data()?.[field] || 0),
      `A rejected reclaim partially changed city ${field}.`
    );
  }
  assert(
    Number(watermarkAfterRejectedReclaim.data()?.highestDevelopedCityLevel || 0) === 2,
    "A rejected reclaim changed the city high-watermark."
  );
  const acknowledgedReclaim = await callFunction("upgradeCity", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
    requestId: `city-upgrade-legacy-reclaim-${crypto.randomBytes(6).toString("hex")}`,
    acknowledgedRebuildSuppressedXp: getCityUpgradeXp(1),
  });
  assert(Number(acknowledgedReclaim.cityUpgradeXp?.awardedXp || 0) === 0, "A legacy-upgraded level awarded XP later.");

  await Promise.all([
    cityXpHighWatermarkRef.delete(),
    profileRef.set({
      gold: 1000000000,
      goldFloat: 1000000000,
      character: { level: 1, xp: 0, skillPoints: 0 },
      economyUpdatedAtMs: Date.now(),
    }, { merge: true }),
    cityRef.set({
      level: 1,
      troops: 200,
      troopFloat: 200,
      investedGold: 0,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true }),
  ]);

  const preview = await callFunction("getCityUpgradeXpPreview", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 2,
  });
  const expectedBulkCityXp = getCityUpgradeXp(1) + getCityUpgradeXp(2);
  assert(Number(preview.cityUpgradeXp?.rawXp || 0) === expectedBulkCityXp, "Bulk city XP preview did not sum each crossed level.");
  assert(
    JSON.stringify(preview.cityUpgradeXp?.eligibleLevels || []) === JSON.stringify([2, 3]),
    "First city XP encounter did not baseline at the current level."
  );

  await Promise.all([
    profileRef.set({
      gold: 1000000000,
      goldFloat: 1000000000,
      character: { level: 1, xp: 240, skillPoints: 0 },
      economyUpdatedAtMs: Date.now(),
    }, { merge: true }),
    cityRef.set({
      level: 1,
      troops: 200,
      troopFloat: 200,
      investedGold: 0,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true }),
  ]);
  const replaySafeRequest = {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 2,
    requestId: `city-upgrade-replay-${crypto.randomBytes(6).toString("hex")}`,
  };
  const concurrentCityUpgrades = await Promise.all([
    invokeFunction("upgradeCity", user.token, replaySafeRequest),
    invokeFunction("upgradeCity", user.token, replaySafeRequest),
  ]);
  assert(concurrentCityUpgrades.every(result => result.ok), "A replay-safe concurrent city upgrade returned an error.");
  assert(
    concurrentCityUpgrades.every(result => Number(result.result?.cityUpgradeXp?.awardedXp || 0) === expectedBulkCityXp),
    "Concurrent replay returned inconsistent city XP receipts."
  );
  const [profileAfterCityXp, cityAfterCityXp] = await Promise.all([profileRef.get(), cityRef.get()]);
  assert(Number(cityAfterCityXp.data()?.level || 0) === 3, "A replayed city upgrade applied its levels more than once.");
  assert(Number(profileAfterCityXp.data()?.character?.level || 0) === 2, "City XP did not use the normal Hero level-up path.");
  assert(Number(profileAfterCityXp.data()?.character?.xp || 0) === expectedBulkCityXp - 10, "City XP was not applied exactly once.");
  assert(Number(cityAfterCityXp.data()?.troops || 0) > 200, "The Hero level-up troop reward was not credited to the Main City.");

  await cityRef.set({
    level: 1,
    productionUpdatedAtMs: Date.now(),
  }, { merge: true });
  const rebuildXp = getCityUpgradeXp(1);
  const unacknowledgedRebuild = await invokeFunction("upgradeCity", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
    requestId: `city-upgrade-unacknowledged-${crypto.randomBytes(6).toString("hex")}`,
  });
  assert(!unacknowledgedRebuild.ok, "A rebuild committed without acknowledging suppressed Hero XP.");
  assert(
    unacknowledgedRebuild.error?.details?.reason === "city-upgrade-xp-warning-required",
    "The server did not return the refreshed city XP warning receipt."
  );
  assert(Number((await cityRef.get()).data()?.level || 0) === 1, "An unacknowledged rebuild changed the city.");
  const rebuildUpgrade = await callFunction("upgradeCity", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
    requestId: `city-upgrade-rebuild-${crypto.randomBytes(6).toString("hex")}`,
    acknowledgedRebuildSuppressedXp: rebuildXp,
  });
  assert(Number(rebuildUpgrade.cityUpgradeXp?.awardedXp || 0) === 0, "Rebuilding a prior seasonal city level awarded Hero XP.");
  assert(Number(rebuildUpgrade.cityUpgradeXp?.rebuildSuppressedXp || 0) === rebuildXp, "Rebuild suppression was not explicit.");

  await Promise.all([
    profileRef.set({
      gold: Number.MAX_SAFE_INTEGER,
      goldFloat: Number.MAX_SAFE_INTEGER,
      character: { level: 50, xp: 0, skillPoints: 49 },
      economyUpdatedAtMs: Date.now(),
    }, { merge: true }),
    cityRef.set({
      level: 150,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true }),
  ]);
  const cappedPreview = await callFunction("getCityUpgradeXpPreview", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
  });
  const cappedUpgrade = await callFunction("upgradeCity", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
    requestId: `city-upgrade-cap-${crypto.randomBytes(6).toString("hex")}`,
    acknowledgedCapSuppressedXp: Number(cappedPreview.cityUpgradeXp?.capSuppressedXp || 0),
    acknowledgedRebuildSuppressedXp: Number(cappedPreview.cityUpgradeXp?.rebuildSuppressedXp || 0),
  });
  assert(Number(cappedUpgrade.cityUpgradeXp?.awardedXp || 0) === getXpRequiredForLevel(50), "Hero Level 50 did not use one exact level-equivalent.");
  assert(Number(cappedUpgrade.cityUpgradeXp?.capSuppressedXp || 0) > 0, "The Level-50 cap did not report discarded excess XP.");
  assert(Number(cappedUpgrade.cityUpgradeXp?.capReferenceHeroLevel || 0) === 50, "The daily cap did not freeze at Hero Level 50.");

  await profileRef.set({
    gold: Number.MAX_SAFE_INTEGER,
    goldFloat: Number.MAX_SAFE_INTEGER,
    character: { level: 90, xp: 0, skillPoints: 89 },
    economyUpdatedAtMs: Date.now(),
  }, { merge: true });
  const frozenCapPreview = await callFunction("getCityUpgradeXpPreview", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
  });
  const frozenCapUpgrade = await callFunction("upgradeCity", user.token, {
    cityId: claim.cityId,
    regionId: cityRegionId,
    levels: 1,
    requestId: `city-upgrade-frozen-cap-${crypto.randomBytes(6).toString("hex")}`,
    acknowledgedCapSuppressedXp: Number(frozenCapPreview.cityUpgradeXp?.capSuppressedXp || 0),
    acknowledgedRebuildSuppressedXp: Number(frozenCapPreview.cityUpgradeXp?.rebuildSuppressedXp || 0),
  });
  assert(Number(frozenCapUpgrade.cityUpgradeXp?.awardedXp || 0) === 0, "A full frozen daily allowance awarded more city XP.");
  assert(Number(frozenCapUpgrade.cityUpgradeXp?.capReferenceHeroLevel || 0) === 50, "Combat-style Hero progress recalculated the frozen city XP cap.");

  await Promise.all([
    profileRef.set({
      character: { level: 1, xp: 0, skillPoints: 0 },
      economyUpdatedAtMs: Date.now(),
    }, { merge: true }),
    cityRef.set({
      level: 1,
      productionUpdatedAtMs: Date.now(),
    }, { merge: true }),
  ]);

  const shieldId = "shield_12h";
  const shieldCost = getExpectedShopPrice(shieldId, shopPricing);
  const purchaseGold = shieldCost * 2 + 1000;
  await profileRef.set({
    gold: purchaseGold,
    goldFloat: purchaseGold,
    shopItems: { [shieldId]: 0 },
    itemEffects: { shieldExpiresAtMs: 0 },
    itemPurchaseCooldowns: {},
  }, { merge: true });
  await cityRef.set({ productionUpdatedAtMs: Date.now(), ownerShieldExpiresAtMs: 0 }, { merge: true });

  const purchases = await Promise.all([
    invokeFunction("purchaseShopItem", user.token, { itemId: shieldId, cost: shieldCost }),
    invokeFunction("purchaseShopItem", user.token, { itemId: shieldId, cost: shieldCost }),
  ]);
  assert(
    purchases.filter(result => result.ok).length === 1
      && purchases.filter(result => !result.ok && result.error?.status === "FAILED_PRECONDITION").length === 1,
    `Concurrent shield purchases were not serialized correctly: ${JSON.stringify(purchases)}`
  );
  const profileAfterPurchase = (await profileRef.get()).data() || {};
  assert(Number(profileAfterPurchase.shopItems?.[shieldId] || 0) === 1, "Concurrent purchase credited the shield more than once.");
  assert(
    Number(profileAfterPurchase.itemPurchaseCooldowns?.[shieldId]?.purchaseCount || 0) === 1,
    "Concurrent purchase did not atomically record the UTC purchase limit."
  );
  const goldAfterPurchase = Number(profileAfterPurchase.goldFloat || profileAfterPurchase.gold || 0);
  assert(
    goldAfterPurchase >= purchaseGold - shieldCost && goldAfterPurchase < purchaseGold - shieldCost + 100,
    "Concurrent purchase charged the wrong number of times."
  );

  const drumsId = "war_drums_30m";
  const drumsCost = getExpectedShopPrice(drumsId, shopPricing);
  const drumsPurchaseGold = drumsCost * 5 + 1000;
  await profileRef.set({
    gold: drumsPurchaseGold,
    goldFloat: drumsPurchaseGold,
    shopItems: { [drumsId]: 0 },
    itemPurchaseCooldowns: {},
    economyUpdatedAtMs: Date.now(),
  }, { merge: true });
  const quantityPurchase = await invokeFunction("purchaseShopItem", user.token, {
    itemId: drumsId,
    cost: drumsCost,
    quantity: 3,
  });
  assert(quantityPurchase.ok, `Quantity purchase failed: ${JSON.stringify(quantityPurchase)}`);
  assert(Number(quantityPurchase.result?.purchasedQuantity || 0) === 3, "Quantity purchase did not report all three items.");
  assert(Number(quantityPurchase.result?.spentGold || 0) === drumsCost * 3, "Quantity purchase did not report its aggregate charge.");
  const legacyDrumPurchase = await invokeFunction("purchaseShopItem", user.token, { itemId: drumsId, cost: drumsCost });
  assert(legacyDrumPurchase.ok && Number(legacyDrumPurchase.result?.purchasedQuantity || 0) === 1, "Legacy omitted quantity did not remain one.");
  const overLimitPurchase = await invokeFunction("purchaseShopItem", user.token, { itemId: drumsId, cost: drumsCost });
  assert(!overLimitPurchase.ok && overLimitPurchase.error?.status === "FAILED_PRECONDITION", "The UTC daily limit accepted a fifth War Drums purchase.");
  const profileAfterQuantityPurchase = (await profileRef.get()).data() || {};
  assert(Number(profileAfterQuantityPurchase.shopItems?.[drumsId] || 0) === 4, "Quantity and legacy purchases did not settle exactly four items.");
  assert(Number(profileAfterQuantityPurchase.itemPurchaseCooldowns?.[drumsId]?.purchaseCount || 0) === 4, "Quantity purchases did not atomically update the daily count.");

  const taxId = "royal_tax_decree_30m";
  const taxCost = getExpectedShopPrice(taxId, shopPricing);
  await profileRef.set({
    gold: taxCost * 2 - 1,
    goldFloat: taxCost * 2 - 1,
    shopItems: { [taxId]: 0 },
    itemPurchaseCooldowns: {},
    economyUpdatedAtMs: Date.now(),
  }, { merge: true });
  const unaffordableQuantityPurchase = await invokeFunction("purchaseShopItem", user.token, { itemId: taxId, cost: taxCost, quantity: 2 });
  assert(!unaffordableQuantityPurchase.ok, "An unaffordable quantity purchase unexpectedly succeeded.");
  const profileAfterUnaffordablePurchase = (await profileRef.get()).data() || {};
  assert(Number(profileAfterUnaffordablePurchase.shopItems?.[taxId] || 0) === 0, "An unaffordable batch partially credited inventory.");

  const activations = await Promise.all([
    invokeFunction("activateInventoryItem", user.token, { itemId: shieldId }),
    invokeFunction("activateInventoryItem", user.token, { itemId: shieldId }),
  ]);
  assert(
    activations.filter(result => result.ok).length === 1
      && activations.filter(result => !result.ok && result.error?.status === "FAILED_PRECONDITION").length === 1,
    `Concurrent shield activation was not single-use: ${JSON.stringify(activations)}`
  );
  const [profileAfterActivation, cityAfterActivation] = await Promise.all([profileRef.get(), cityRef.get()]);
  const shieldExpiresAtMs = Number(profileAfterActivation.data()?.itemEffects?.shieldExpiresAtMs || 0);
  assert(Number(profileAfterActivation.data()?.shopItems?.[shieldId] || 0) === 0, "Shield activation did not consume exactly one item.");
  assert(shieldExpiresAtMs > Date.now(), "Shield activation did not persist an active server timer.");
  assert(
    Number(cityAfterActivation.data()?.ownerShieldExpiresAtMs || 0) === shieldExpiresAtMs,
    "Shield activation did not propagate the authoritative timer to the main city."
  );
  const multiShieldActivation = await invokeFunction("activateInventoryItem", user.token, { itemId: shieldId, quantity: 2 });
  assert(!multiShieldActivation.ok && multiShieldActivation.error?.status === "INVALID_ARGUMENT", "A single-use Shield accepted quantity two.");

  const stackableTimedItems = [
    {
      itemId: "war_drums_30m",
      startedField: "warDrumsStartedAtMs",
      effectField: "warDrumsExpiresAtMs",
      bonusPercent: Number(economyConfig.shopItems?.war_drums_30m?.bonusPercent || 30),
      productionType: "troops",
    },
    {
      itemId: "royal_tax_decree_30m",
      startedField: "royalTaxDecreeStartedAtMs",
      effectField: "royalTaxDecreeExpiresAtMs",
      bonusPercent: Number(economyConfig.shopItems?.royal_tax_decree_30m?.bonusPercent || 50),
      productionType: "gold",
    },
  ];
  for (const stackable of stackableTimedItems) {
    const durationMs = Number(economyConfig.shopItems?.[stackable.itemId]?.effectDurationMinutes || 30) * 60 * 1000;
    await profileRef.set({
      shopItems: { [stackable.itemId]: 3 },
      itemEffects: { [stackable.effectField]: 0 },
      economyUpdatedAtMs: Date.now(),
    }, { merge: true });
    const quantityStartedAtMs = Date.now();
    const quantityActivation = await invokeFunction("activateInventoryItem", user.token, {
      itemId: stackable.itemId,
      quantity: 3,
    });
    assert(quantityActivation.ok, `Quantity activation failed for ${stackable.itemId}: ${JSON.stringify(quantityActivation)}`);
    assert(Number(quantityActivation.result?.activatedQuantity || 0) === 3, `${stackable.itemId} did not report all activated items.`);
    assert(Number(quantityActivation.result?.effectDurationAddedMs || 0) === durationMs * 3, `${stackable.itemId} did not report aggregate duration.`);
    const quantityProfile = (await profileRef.get()).data() || {};
    assert(Number(quantityProfile.shopItems?.[stackable.itemId] || 0) === 0, `${stackable.itemId} quantity activation did not consume exactly three.`);
    assert(Number(quantityProfile.itemEffects?.[stackable.effectField] || 0) >= quantityStartedAtMs + durationMs * 3, `${stackable.itemId} quantity activation did not stack all durations.`);
    assert(
      Number(quantityProfile.itemEffects?.[stackable.effectField] || 0)
        - Number(quantityProfile.itemEffects?.[stackable.startedField] || 0) === durationMs * 3,
      `${stackable.itemId} client-visible timer and authoritative active interval disagree.`
    );

    await profileRef.set({
      shopItems: { [stackable.itemId]: 2 },
      itemEffects: { [stackable.effectField]: 0 },
      economyUpdatedAtMs: Date.now(),
    }, { merge: true });
    const stackingStartedAtMs = Date.now();
    const stackedActivations = await Promise.all([
      invokeFunction("activateInventoryItem", user.token, { itemId: stackable.itemId }),
      invokeFunction("activateInventoryItem", user.token, { itemId: stackable.itemId }),
    ]);
    assert(
      stackedActivations.every(result => result.ok),
      `Concurrent ${stackable.itemId} uses did not both stack: ${JSON.stringify(stackedActivations)}`
    );
    assert(
      stackedActivations.every(result => Number(result.result?.effectDurationAddedMs || 0) === durationMs),
      `${stackable.itemId} did not report the duration added by each use.`
    );
    const stackedProfile = (await profileRef.get()).data() || {};
    const stackedExpiresAtMs = Number(stackedProfile.itemEffects?.[stackable.effectField] || 0);
    assert(
      Number(stackedProfile.shopItems?.[stackable.itemId] || 0) === 0,
      `${stackable.itemId} did not consume both stacked items.`
    );
    assert(
      stackedExpiresAtMs >= stackingStartedAtMs + durationMs * 2
        && stackedExpiresAtMs <= Date.now() + durationMs * 2 + 5000,
      `${stackable.itemId} did not preserve both 30-minute durations (${stackedExpiresAtMs - stackingStartedAtMs}ms).`
    );
    const responseExpiries = stackedActivations
      .map(result => Number(result.result?.expiresAtMs || 0))
      .sort((left, right) => left - right);
    assert(
      responseExpiries[1] - responseExpiries[0] === durationMs,
      `${stackable.itemId} concurrent responses did not serialize into one stacked timer.`
    );
  }

  const levelOneBaseGoldPerHour = Math.floor(Number(cityEconomy.productionVpBase || 20))
    * Number(cityEconomy.goldPerProductionVp || 15);
  const levelOneBaseTroopsPerHour = levelOneVictoryPoints * Number(cityEconomy.troopsPerVictoryPoint || 3);
  for (const stackable of stackableTimedItems) {
    const durationMs = Number(economyConfig.shopItems?.[stackable.itemId]?.effectDurationMinutes || 30) * 60 * 1000;
    for (const quantity of [1, 2, 3]) {
      const seededAtMs = Date.now();
      const effectStartedAtMs = seededAtMs - durationMs * quantity - 60_000;
      const effectExpiresAtMs = seededAtMs - 60_000;
      const intervalStartedAtMs = effectStartedAtMs - 60_000;
      const baselineGold = 1_000_000;
      const baselineTroops = 1_000_000;
      await profileRef.set({
        gold: baselineGold,
        goldFloat: baselineGold,
        economyUpdatedAtMs: intervalStartedAtMs,
        upgrades: {},
        gear: commonGear.createDefaultState(),
        itemEffects: {
          shieldExpiresAtMs: 0,
          warDrumsStartedAtMs: stackable.itemId === "war_drums_30m" ? effectStartedAtMs : 0,
          warDrumsExpiresAtMs: stackable.itemId === "war_drums_30m" ? effectExpiresAtMs : 0,
          royalTaxDecreeStartedAtMs: stackable.itemId === "royal_tax_decree_30m" ? effectStartedAtMs : 0,
          royalTaxDecreeExpiresAtMs: stackable.itemId === "royal_tax_decree_30m" ? effectExpiresAtMs : 0,
          veilOfSilenceExpiresAtMs: 0,
        },
      }, { merge: true });
      await cityRef.set({
        level: 1,
        troops: baselineTroops,
        troopFloat: baselineTroops,
        productionUpdatedAtMs: intervalStartedAtMs,
      }, { merge: true });
      await callFunction("collectEconomy", user.token);
      const [settledProfileSnap, settledCitySnap] = await Promise.all([profileRef.get(), cityRef.get()]);
      const settledProfile = settledProfileSnap.data() || {};
      const settledCity = settledCitySnap.data() || {};
      const settledAtMs = Number(settledProfile.economyUpdatedAtMs || 0);
      const elapsedHours = (settledAtMs - intervalStartedAtMs) / 3_600_000;
      const boostedHours = durationMs * quantity / 3_600_000;
      const expectedGold = baselineGold + levelOneBaseGoldPerHour * elapsedHours
        + (stackable.productionType === "gold"
          ? levelOneBaseGoldPerHour * boostedHours * stackable.bonusPercent / 100
          : 0);
      const expectedTroops = baselineTroops + levelOneBaseTroopsPerHour * elapsedHours
        + (stackable.productionType === "troops"
          ? levelOneBaseTroopsPerHour * boostedHours * stackable.bonusPercent / 100
          : 0);
      assertClose(
        Number(settledProfile.goldFloat || settledProfile.gold || 0),
        expectedGold,
        0.05,
        `${quantity} ${stackable.itemId} did not credit the full authoritative gold interval`
      );
      assertClose(
        Number(settledCity.troopFloat || settledCity.troops || 0),
        expectedTroops,
        0.05,
        `${quantity} ${stackable.itemId} did not credit the full authoritative troop interval`
      );
    }
  }

  const gearStatus = await callFunction("getCommonGearStatus", user.token);
  const gearBoxPrice = Number(gearStatus.shop?.price || 0);
  const expectedGearBoxPrice = getExpectedShopPrice("common_gear_box", gearStatus.shopPricing);
  assert(gearBoxPrice === expectedGearBoxPrice, `Common Gear Box price must equal one raw Gold-production hour, got ${gearBoxPrice}; expected ${expectedGearBoxPrice}.`);
  await profileRef.set({
    gold: gearBoxPrice * 2 + 1000,
    goldFloat: gearBoxPrice * 2 + 1000,
    gear: commonGear.createDefaultState(),
    economyUpdatedAtMs: Date.now(),
  }, { merge: true });
  const concurrentGearPurchases = await Promise.all([
    invokeFunction("purchaseCommonGearBox", user.token, { cost: gearBoxPrice }),
    invokeFunction("purchaseCommonGearBox", user.token, { cost: gearBoxPrice }),
  ]);
  assert(
    concurrentGearPurchases.filter(result => result.ok).length === 1
      && concurrentGearPurchases.filter(result => !result.ok && result.error?.status === "RESOURCE_EXHAUSTED").length === 1,
    `Concurrent Common Gear Box purchases bypassed the UTC limit: ${JSON.stringify(concurrentGearPurchases)}`
  );
  const gearAfterPurchase = (await profileRef.get()).data()?.gear || {};
  assert(Number(gearAfterPurchase.commonGearBoxes || 0) === 1, "The Common Gear Box purchase did not credit exactly one box.");

  const openRequestId = `emulator-gear-${crypto.randomBytes(6).toString("hex")}`;
  const openedGear = await callFunction("openCommonGearBox", user.token, { requestId: openRequestId });
  assert(openedGear.receipt?.instanceIds?.length === 3, "A Common Gear Box did not reveal exactly three pieces.");
  assert(Object.keys(openedGear.gear?.instances || {}).length === 3, "The three revealed pieces were not stored in gear inventory.");
  assert(Number(openedGear.gear?.commonGearBoxes || 0) === 0, "Opening a Common Gear Box did not consume exactly one box.");
  const revealedBuildingIds = new Set(openedGear.receipt.instanceIds.map(instanceId => openedGear.gear.instances[instanceId].buildingId));
  assert(
    [...revealedBuildingIds].every(buildingId => openedGear.gear?.newMarkers?.[buildingId] === true),
    "A building that received Common Gear did not retain its new-gear marker."
  );
  const replayedGear = await callFunction("openCommonGearBox", user.token, { requestId: openRequestId });
  assert(replayedGear.replayed === true, "Repeating a Common Gear Box request was not idempotent.");
  assert(Object.keys(replayedGear.gear?.instances || {}).length === 3, "An idempotent box replay awarded extra gear.");
  const viewedBuildingId = [...revealedBuildingIds][0];
  const viewedGear = await callFunction("viewCommonGearBuilding", user.token, { buildingId: viewedBuildingId });
  assert(viewedGear.gear?.newMarkers?.[viewedBuildingId] === false, "Viewing a gear building did not clear its notification marker.");
  assert(
    Object.values(viewedGear.gear?.instances || {})
      .filter(instance => instance.buildingId === viewedBuildingId)
      .every(instance => instance.isNew === false),
    "Viewing a gear building did not clear its individual new-item markers."
  );

  const upgradeDefinition = commonGear.DEFINITIONS.find(definition => definition.statType === "attackStrength");
  const alternateSlotDefinition = commonGear.DEFINITIONS.find(definition => (
    definition.buildingId === upgradeDefinition.buildingId && definition.slot !== upgradeDefinition.slot
  ));
  const alternateOfficerDefinition = commonGear.DEFINITIONS.find(definition => (
    definition.buildingId !== upgradeDefinition.buildingId
  ));
  const upgradeGoldReserve = 1_000_000_000_000;
  const createUpgradeInstance = (instanceId, definition, level, acquiredAtMs) => commonGear.normalizeInstance({
    instanceId,
    gearKey: definition.gearKey,
    level,
    acquiredAtMs,
  });
  const seedUpgradeState = async gear => {
    const now = Date.now();
    await profileRef.update({
      gold: upgradeGoldReserve,
      goldFloat: upgradeGoldReserve,
      gear,
      economyUpdatedAtMs: now,
    });
  };
  const createSuccessUpgradeState = (level, { targetEquipped = false, includeEquippedMatch = false, includeSpare = true } = {}) => {
    const gear = commonGear.createDefaultState();
    const acquiredAtMs = Date.now() - 10_000;
    gear.instances.upgrade_target = createUpgradeInstance("upgrade_target", upgradeDefinition, level, acquiredAtMs);
    gear.instances.upgrade_material = createUpgradeInstance("upgrade_material", upgradeDefinition, level, acquiredAtMs + 1000);
    if (includeSpare) {
      gear.instances.upgrade_spare = createUpgradeInstance("upgrade_spare", upgradeDefinition, level, acquiredAtMs + 2000);
    }
    if (targetEquipped) {
      gear.equipped[upgradeDefinition.buildingId][upgradeDefinition.slot] = "upgrade_target";
    } else if (includeEquippedMatch) {
      gear.instances.upgrade_equipped_material = createUpgradeInstance(
        "upgrade_equipped_material",
        upgradeDefinition,
        level,
        acquiredAtMs + 3000
      );
      gear.equipped[upgradeDefinition.buildingId][upgradeDefinition.slot] = "upgrade_equipped_material";
    }
    return gear;
  };
  const assertSuccessfulUpgrade = async (level, options = {}) => {
    const gear = createSuccessUpgradeState(level, options);
    await seedUpgradeState(gear);
    const upgraded = await callFunction("upgradeCommonGear", user.token, { instanceId: "upgrade_target" });
    const upgradedState = upgraded.currentUser?.gear || {};
    const storedProfile = (await profileRef.get()).data() || {};
    assert(
      Number(upgradedState.instances?.upgrade_target?.level || 0) === level + 1,
      `Common Gear did not upgrade from Level ${level} to Level ${level + 1}.`
    );
    assert(upgraded.upgradedInstanceId === "upgrade_target", `The Level ${level} upgrade did not preserve the target instanceId.`);
    assert(!upgradedState.instances?.upgrade_material, `The Level ${level} upgrade did not consume the oldest matching same-level material.`);
    if (options.includeSpare === false) {
      assert(
        Object.keys(upgradedState.instances || {}).length === 1 && upgradedState.instances?.upgrade_target,
        `The exact-two-copy Level ${level} upgrade did not consume exactly one material and preserve only the target.`
      );
    } else {
      assert(upgradedState.instances?.upgrade_spare, `The Level ${level} upgrade consumed more than one matching material.`);
      assert(
        upgradedState.instances?.upgrade_spare?.level === level,
        `The Level ${level} upgrade changed the unconsumed matching material.`
      );
    }
    assert(Number(upgraded.spentGold || 0) > 0, `The Level ${level} upgrade did not report its existing gold cost.`);
    assert(
      Number(storedProfile.goldFloat || 0) >= upgradeGoldReserve - Number(upgraded.spentGold || 0) - 1
        && Number(storedProfile.goldFloat || 0) <= upgradeGoldReserve - Number(upgraded.spentGold || 0) + 10,
      `The Level ${level} upgrade deducted an unexpected amount of gold.`
    );
    if (options.targetEquipped) {
      assert(
        upgradedState.equipped?.[upgradeDefinition.buildingId]?.[upgradeDefinition.slot] === "upgrade_target",
        `Upgrading equipped Level ${level} gear unexpectedly unequipped it.`
      );
      assert(upgradedState.instances?.upgrade_target?.isEquipped === true, `The upgraded Level ${level} target lost equipped state.`);
      assert(
        Number(upgraded.bonuses?.attackStrength || 0) === commonGear.BONUS_BY_LEVEL[level + 1],
        `The equipped Level ${level} upgrade did not recalculate its active bonus.`
      );
    } else {
      assert(upgradedState.instances?.upgrade_target?.isEquipped === false, `The stored Level ${level} target became equipped.`);
    }
    if (options.includeEquippedMatch) {
      assert(
        upgradedState.instances?.upgrade_equipped_material?.isEquipped === true,
        "The server consumed an equipped copy instead of a stored same-level material."
      );
    }
  };
  const assertRejectedUpgrade = async (label, gear, expectedTargetLevel) => {
    await seedUpgradeState(gear);
    const response = await invokeFunction("upgradeCommonGear", user.token, { instanceId: "upgrade_target" });
    assert(
      !response.ok && response.error?.status === "FAILED_PRECONDITION",
      `${label} was not rejected: ${JSON.stringify(response)}`
    );
    const storedProfile = (await profileRef.get()).data() || {};
    const storedGear = commonGear.normalizeState(storedProfile.gear);
    assert(Number(storedGear.instances?.upgrade_target?.level || 0) === expectedTargetLevel, `${label} changed the target level.`);
    assert(storedGear.instances?.upgrade_target, `${label} consumed the selected target instance.`);
    assert(Number(storedProfile.goldFloat || 0) >= upgradeGoldReserve - 1, `${label} deducted gold on failure.`);
    return storedGear;
  };

  const loadoutGear = commonGear.createDefaultState();
  loadoutGear.instances.upgrade_target = createUpgradeInstance("upgrade_target", upgradeDefinition, 1, Date.now() - 3000);
  loadoutGear.instances.upgrade_material = createUpgradeInstance("upgrade_material", upgradeDefinition, 1, Date.now() - 2000);
  loadoutGear.instances.upgrade_swap = createUpgradeInstance("upgrade_swap", upgradeDefinition, 2, Date.now() - 1000);
  loadoutGear.equipped[upgradeDefinition.buildingId][upgradeDefinition.slot] = "upgrade_target";
  await seedUpgradeState(loadoutGear);
  const swappedGear = await callFunction("equipCommonGear", user.token, { instanceId: "upgrade_swap" });
  assert(swappedGear.currentUser?.gear?.instances?.upgrade_target?.isEquipped === false, "Replacing equipped gear did not return the old piece to inventory.");
  assert(swappedGear.currentUser?.gear?.instances?.upgrade_swap?.isEquipped === true, "Replacing equipped gear did not equip the selected piece.");
  const reequippedGear = await callFunction("equipCommonGear", user.token, { instanceId: "upgrade_target" });
  assert(reequippedGear.currentUser?.gear?.instances?.upgrade_target?.isEquipped === true, "The original gear could not be re-equipped.");

  await assertSuccessfulUpgrade(1, { includeSpare: false });
  await assertSuccessfulUpgrade(1, { targetEquipped: true, includeSpare: false });
  await assertSuccessfulUpgrade(2, { includeSpare: false });
  await assertSuccessfulUpgrade(2, { targetEquipped: true, includeSpare: false });
  await assertSuccessfulUpgrade(2, { includeEquippedMatch: true });
  await assertSuccessfulUpgrade(3, { targetEquipped: true });
  await assertSuccessfulUpgrade(4);

  const maxLevelGear = commonGear.createDefaultState();
  maxLevelGear.instances.upgrade_target = createUpgradeInstance("upgrade_target", upgradeDefinition, 5, Date.now() - 2000);
  maxLevelGear.instances.upgrade_material = createUpgradeInstance("upgrade_material", upgradeDefinition, 5, Date.now() - 1000);
  await assertRejectedUpgrade("A Level 5 upgrade", maxLevelGear, 5);

  for (const level of [2, 3, 4]) {
    const wrongLevelGear = commonGear.createDefaultState();
    wrongLevelGear.instances.upgrade_target = createUpgradeInstance("upgrade_target", upgradeDefinition, level, Date.now() - 10_000);
    for (let index = 0; index < 4; index += 1) {
      const instanceId = `wrong_level_${level}_${index}`;
      wrongLevelGear.instances[instanceId] = createUpgradeInstance(instanceId, upgradeDefinition, 1, Date.now() - 9000 + index);
    }
    const rejectedState = await assertRejectedUpgrade(
      `A Level ${level} target using Level 1 copies`,
      wrongLevelGear,
      level
    );
    assert(
      Object.keys(rejectedState.instances).filter(instanceId => instanceId.startsWith(`wrong_level_${level}_`)).length === 4,
      `The rejected Level ${level} upgrade consumed a wrong-level material.`
    );
  }

  const wrongGearState = commonGear.createDefaultState();
  wrongGearState.instances.upgrade_target = createUpgradeInstance("upgrade_target", upgradeDefinition, 1, Date.now() - 3000);
  wrongGearState.instances.wrong_slot = createUpgradeInstance("wrong_slot", alternateSlotDefinition, 1, Date.now() - 2000);
  wrongGearState.instances.wrong_officer = createUpgradeInstance("wrong_officer", alternateOfficerDefinition, 1, Date.now() - 1000);
  const rejectedWrongGear = await assertRejectedUpgrade("Different gearKey/slot/officer materials", wrongGearState, 1);
  assert(rejectedWrongGear.instances?.wrong_slot && rejectedWrongGear.instances?.wrong_officer, "A rejected upgrade consumed different gear.");

  const equippedOnlyMaterialState = commonGear.createDefaultState();
  equippedOnlyMaterialState.instances.upgrade_target = createUpgradeInstance("upgrade_target", upgradeDefinition, 1, Date.now() - 2000);
  equippedOnlyMaterialState.instances.equipped_only = createUpgradeInstance("equipped_only", upgradeDefinition, 1, Date.now() - 1000);
  equippedOnlyMaterialState.equipped[upgradeDefinition.buildingId][upgradeDefinition.slot] = "equipped_only";
  const rejectedEquippedMaterial = await assertRejectedUpgrade("An equipped-only material", equippedOnlyMaterialState, 1);
  assert(rejectedEquippedMaterial.instances?.equipped_only?.isEquipped === true, "A rejected upgrade consumed its equipped-only copy.");

  const [statsSnap, leaderboardSnap] = await Promise.all([
    db.doc(`players/${user.uid}/stats/global`).get(),
    db.doc(`leaderboards/${realm.resetGeneration}/entries/${user.uid}`).get(),
  ]);
  const stats = statsSnap.data() || {};
  const leaderboard = leaderboardSnap.data() || {};
  assert(stats.totalCities === 1 && Number(stats.kingPower || 0) > 0, "Global stats did not include the player's main city.");
  assert(
    Number(leaderboard.kingPower || 0) === Number(stats.kingPower || 0),
    "The leaderboard did not receive the authoritative King Power snapshot."
  );

  console.log("Emulator economy concurrency passed: production, city XP, items, Common Gear transactions, city propagation, and King Power.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
