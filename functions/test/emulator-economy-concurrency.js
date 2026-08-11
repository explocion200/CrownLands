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

  const economyResults = await Promise.all(
    Array.from({ length: 10 }, () => invokeFunction("collectEconomy", user.token))
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

  const shieldId = "shield_12h";
  const shieldCost = Number(economyConfig.shopItems?.[shieldId]?.cost || 0);
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
  const drumsCost = Number(economyConfig.shopItems?.[drumsId]?.cost || 0);
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
  const taxCost = Number(economyConfig.shopItems?.[taxId]?.cost || 0);
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
      effectField: "warDrumsExpiresAtMs",
    },
    {
      itemId: "royal_tax_decree_30m",
      effectField: "royalTaxDecreeExpiresAtMs",
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

  console.log("Emulator economy concurrency passed: production, shield use, stackable timed items, city propagation, and King Power.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
