"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const controller = fs.readFileSync(path.join(root, "instant-economy-actions.js"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const firebase = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

assert.match(controller, /const INSTANT_ECONOMY_ACTION_DELAY_MS = 125;/, "The shared action queue must use the approved 125ms coalescing window.");
for (const type of ["shop", "city", "item", "swift", "recall", "skill"]) {
  assert.match(controller, new RegExp(`action\\.type === "${type}"`), `The controller does not serialize ${type} actions.`);
}
assert.match(controller, /function canBatchExactCityActions[\s\S]*?combinedLevels <= SERVER_CITY_UPGRADE_LEVEL_CHUNK/, "Adjacent exact city upgrades are not bounded into server-safe batches.");
assert.match(controller, /previous[\s\S]*?previous\.type === normalized\.type[\s\S]*?previous\.key === normalized\.key/, "Adjacent matching non-city actions are not coalesced.");
assert.match(controller, /function resumeInstantEconomyActionsAfterSync[\s\S]*?revalidateInstantEconomyActions\(\)[\s\S]*?scheduleInstantEconomyFlush\(0\)/, "Rejected actions do not wait for authoritative synchronization before the remaining queue resumes.");
assert.match(controller, /action\.generation !== instantEconomyGeneration/, "Late responses from an old session are not ignored.");
assert.match(game, /clearInstantEconomyActions\(\)[\s\S]*?onlineSaveAuthUid = nextUid/, "Auth generation changes do not clear queued actions.");
assert.match(server, /instantEconomyActionsVersion: 1/, "Realm capabilities do not advertise instant economy actions.");
assert.match(server, /cityUpgradeModesVersion: CITY_UPGRADE_MODES_VERSION/, "Realm capabilities do not advertise authoritative city-upgrade modes.");
assert.match(server, /mode === "exact"[\s\S]*?!plan\.exactSatisfied[\s\S]*?reason: "insufficient-gold"/, "Exact city upgrades are not enforced as all-or-nothing server transactions.");
assert.match(server, /mode === "max"[\s\S]*?Number\.MAX_SAFE_INTEGER[\s\S]*?createCityUpgradePlan/, "MAX city upgrades are not calculated authoritatively without a client level cap.");
assert.match(server, /cityUpgradeReceipts[\s\S]*?priorReceipt[\s\S]*?replayed: true/, "City upgrade requests are not idempotently replayed.");
assert.match(server, /activeArmiesTargetingPlayerQuery\(uid\)[\s\S]*?isIncomingCityUpgradeAttack[\s\S]*?reason: "incoming-attack"/, "City upgrades do not revalidate incoming attacks on the server.");
assert.match(controller, /supportsAuthoritativeCityUpgradeModes[\s\S]*?cityUpgradeModesVersion/, "The client does not gate authoritative city-upgrade modes on realm capability.");
assert.match(controller, /action\.mode === "exact" \|\| action\.mode === "max"[\s\S]*?requestId: action\.requestId/, "Exact/MAX upgrades do not use one request-id-backed server call.");
assert.match(controller, /action\.mode === "exact" \? \{ levels: action\.requestedLevels \} : \{\}/, "MAX requests must not send a client-computed level target.");
assert.match(controller, /function queueServerCityUpgrade[\s\S]*?getProjectedAffordableCityUpgradeLevels[\s\S]*?coalesce: mode !== "max"/, "Authoritative exact city upgrades must be batchable while MAX stays standalone.");
assert.doesNotMatch(controller, /already has an upgrade pending/, "Pending city upgrades must not block rapid follow-up actions.");
assert.doesNotMatch(controller, /api\.getCityUpgradeXpPreview/, "City upgrades still wait for a routine XP-preview request.");
assert.match(controller, /scheduleInstantEconomyFlush\(normalized\.type === "city" \? 0/, "City upgrades must dispatch without the shared 125ms economy delay.");
assert.match(controller, /requestAnimationFrame[\s\S]*?safelyPatchInstantEconomyUi/, "Projected economy presentation is not limited to one guarded animation-frame update.");
assert.match(controller, /flushInstantEconomyActions\(\)\.catch[\s\S]*?Instant economy queue drain failed/, "Timer-launched queue failures can still become unhandled rejections.");
assert.match(controller, /finally \{[\s\S]*?instantEconomyActiveAction = null[\s\S]*?scheduleInstantEconomyFlush\(0\)[\s\S]*?scheduleInstantEconomyUiPatch/, "Queue cleanup and continued draining are not guaranteed independently from presentation.");
assert.match(controller, /const submitUpgrade[\s\S]*?result = await submitUpgrade\(\)[\s\S]*?city-upgrade-xp-warning-required[\s\S]*?result = await submitUpgrade\(\)/, "The direct city request must retain a silent retry for an older warning-enforcing backend.");
assert.match(controller, /function discardQueuedCityUpgradeActions[\s\S]*?instantEconomyActions\.splice[\s\S]*?discardQueuedCityUpgradeActions\(action\.key\)/, "Rejected or declined city actions must discard dependent same-city actions.");
assert.match(server, /requestedQuantity = data\.quantity === undefined \? 1[\s\S]*?unitPrice = getShopItemPriceForEconomy\(economy, itemId\)[\s\S]*?purchasedQuantity: requestedQuantity[\s\S]*?unitPrice,[\s\S]*?spentGold: totalCost/, "Shop quantity purchases are not atomically priced and backward compatible.");
assert.match(server, /const maxQuantity = stackable \? 25 : 1;[\s\S]*?activatedQuantity: requestedQuantity[\s\S]*?effectDurationAddedMs:[\s\S]*?requestedQuantity/, "Timed-item quantity activation is not bounded and aggregated.");
assert.match(firebase, /purchaseShopItem\(\{ itemId = "", cost = 0, quantity = 1 \}[\s\S]*?\{ itemId, cost, quantity \}/, "The client wrapper drops Shop purchase quantities.");
assert.ok(index.indexOf("instant-economy-actions.js") < index.indexOf("game.js"), "The action controller must load immediately before game.js.");
assert.match(worker, /instant-economy-actions\.js/, "The controller is missing from the offline shell.");
const staticCache = worker.match(/const STATIC_CACHE_URLS\s*=\s*(\[[\s\S]*?\]);/)?.[1] || "";
assert.doesNotMatch(staticCache, /map-transition-clouds/, "Map-transition clouds must be runtime-cached instead of install-precached.");

const queuedCity = { id: "city_1", name: "Queued City", regionId: "west", owner: "player", level: 1 };
const cityTimers = [];
const cityRejections = [];
const cityPresentationFrames = new Map();
let cityPresentationFrameSequence = 0;
let cityPresentationFailures = 0;
let throwCityPresentation = false;
const citySandbox = {
  console: { ...console, warn() {} },
  Promise,
  Map,
  Set,
  Date,
  Math,
  SERVER_CITY_UPGRADE_LEVEL_CHUNK: 25,
  queuedCity,
  state: { gold: 1_000 },
  selectedSourceId: "",
  verifiedRealmInfo: { capabilities: { instantEconomyActionsVersion: 1, cityUpgradeModesVersion: 1 } },
  selectedInventoryItemId: "",
  selectedInventoryEntryKey: "",
  skillPresetMarkupSignature: "",
  SHOP_ITEMS: [],
  goldText: null,
  window: {
    crypto: { randomUUID: (() => { let sequence = 0; return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`; })() },
    confirm: () => true,
    setTimeout(callback) { cityTimers.push(callback); return cityTimers.length; },
    clearTimeout() {},
    requestAnimationFrame(callback) {
      const frameId = ++cityPresentationFrameSequence;
      cityPresentationFrames.set(frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(frameId) { cityPresentationFrames.delete(frameId); },
  },
  modal: { open: false, classList: { contains: () => false } },
  modalBody: { querySelector: () => null, querySelectorAll: () => [] },
  cityLayer: { querySelector: () => null },
  getKnownCityId: value => String(value || ""),
  normalizeRegionId: value => String(value || "west"),
  getActiveMapRegionId: () => "west",
  getCityRegionId: city => city?.regionId || "west",
  clampCityLevel: value => Math.max(1, Math.floor(Number(value) || 1)),
  getOwnedCitySnapshotForUpgrade: id => id === queuedCity.id ? queuedCity : null,
  cityById: () => null,
  isStronghold: () => false,
  getIncomingUpgradeBlockers: () => [],
  cityHasIncomingUpgradeBlocker: () => false,
  getCityUpgradeCostAtLevel: () => 100,
  getCityUpgradeReductionPercent: () => 0,
  getCityVfxSnapshot: city => ({ level: city?.level || 1 }),
  usesServerEconomyAuthority: () => true,
  renderHud() {},
  renderCities() {
    if (!throwCityPresentation) return;
    throwCityPresentation = false;
    cityPresentationFailures += 1;
    throw new Error("injected city presentation failure");
  },
  setTextIfChanged() {},
  patchCityListUpgradeRows() {},
  formatNumber: value => String(value),
  formatDuration: value => String(value),
  rejectGameAction(message) { cityRejections.push(message); },
};
vm.createContext(citySandbox);
vm.runInContext(controller, citySandbox, { filename: "instant-economy-actions.js" });

for (let tap = 0; tap < 3; tap += 1) {
  assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', citySandbox), true);
}
assert.equal(vm.runInContext("instantEconomyActions.length", citySandbox), 1, "Rapid +1 taps were not compacted into one undispatched exact batch.");
assert.equal(vm.runInContext("instantEconomyActions[0].requestedLevels", citySandbox), 3, "The compacted exact batch lost requested levels.");
assert.equal(vm.runInContext("getProjectedGold()", citySandbox), 700, "Rapid city taps did not reserve projected Gold immediately.");
assert.equal(vm.runInContext("getProjectedCityForInstantActions(queuedCity).level", citySandbox), 4, "Rapid city taps did not project the city level immediately.");
assert.equal(vm.runInContext('getPendingCityUpgradeCount("city_1", "west")', citySandbox), 3, "The syncing count lost queued city actions.");
assert.equal(cityPresentationFrames.size, 1, "Rapid projected changes scheduled more than one presentation frame.");
throwCityPresentation = true;
const projectedFrame = cityPresentationFrames.values().next().value;
cityPresentationFrames.clear();
projectedFrame();
assert.equal(cityPresentationFailures, 1, "The presentation-failure fixture did not execute.");
assert.equal(vm.runInContext("instantEconomyActions.length", citySandbox), 1, "A presentation exception corrupted the queued city batch.");
assert.equal(vm.runInContext("getCityUpgradeStableSortLevel(queuedCity)", citySandbox), 1, "A pending projection changed the row's stable sort level.");
assert.equal(vm.runInContext("new Set(instantEconomyActions.map(action => action.requestId)).size", citySandbox), 1, "The compacted exact batch does not have one replay-safe request ID.");
assert.equal(vm.runInContext('discardQueuedCityUpgradeActions("west:city_1")', citySandbox), 1, "Same-city dependent batches were not discarded together.");
assert.equal(vm.runInContext("getProjectedGold()", citySandbox), 1_000, "Discarding dependent city actions did not roll projected Gold back.");
assert.equal(vm.runInContext("getProjectedCityForInstantActions(queuedCity).level", citySandbox), 1, "Discarding dependent city actions did not roll the projected level back.");

citySandbox.state.gold = 10_000;
for (let tap = 0; tap < 50; tap += 1) {
  assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', citySandbox), true);
}
assert.equal(vm.runInContext("instantEconomyActions.length", citySandbox), 2, "Fifty rapid upgrades were not bounded into two 25-level batches.");
assert.equal(vm.runInContext("instantEconomyActions[0].requestedLevels", citySandbox), 25, "The first stress batch exceeded or missed the 25-level contract.");
assert.equal(vm.runInContext("instantEconomyActions[1].requestedLevels", citySandbox), 25, "The overflow stress batch did not preserve all requested levels.");
assert.equal(vm.runInContext("getProjectedGold()", citySandbox), 5_000, "The 50-level stress projection reserved the wrong Gold.");
assert.equal(vm.runInContext("getProjectedCityForInstantActions(queuedCity).level", citySandbox), 51, "The 50-level stress projection lost city levels.");
assert.equal(cityPresentationFrames.size, 1, "Fifty rapid changes scheduled more than one presentation frame.");
vm.runInContext("clearInstantEconomyActions()", citySandbox);

citySandbox.state.gold = 5_000;
assert.equal(vm.runInContext('upgradeCity("city_1", 5, { mode: "exact", regionId: "west" })', citySandbox), true);
assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', citySandbox), true);
assert.equal(vm.runInContext('upgradeCity("city_1", 5, { mode: "exact", regionId: "west" })', citySandbox), true);
assert.equal(vm.runInContext("instantEconomyActions.length", citySandbox), 1, "Mixed +1 and +5 inputs were not compacted together.");
assert.equal(vm.runInContext("instantEconomyActions[0].requestedLevels", citySandbox), 11, "The mixed exact batch lost requested levels.");
assert.equal(vm.runInContext("getProjectedGold()", citySandbox), 3_900, "The mixed exact batch reserved the wrong Gold.");
vm.runInContext("clearInstantEconomyActions()", citySandbox);

citySandbox.state.gold = 400;
assert.equal(vm.runInContext('upgradeCity("city_1", 5, { mode: "exact", regionId: "west" })', citySandbox), false, "+5 accepted a partial purchase.");
assert.equal(vm.runInContext("instantEconomyActions.length", citySandbox), 0, "A rejected +5 left a partial queued action.");
citySandbox.state.gold = 650;
assert.equal(vm.runInContext('upgradeCity("city_1", 5, { mode: "exact", regionId: "west" })', citySandbox), true, "Affordable +5 was rejected.");
assert.equal(vm.runInContext("instantEconomyActions[0].levels", citySandbox), 5, "+5 did not reserve all five levels.");
assert.equal(vm.runInContext("getProjectedCityForInstantActions(queuedCity).level", citySandbox), 6, "+5 did not project its final level.");
vm.runInContext("clearInstantEconomyActions()", citySandbox);
citySandbox.state.gold = 350;
assert.equal(vm.runInContext('upgradeCity("city_1", 0, { mode: "max", regionId: "west" })', citySandbox), true, "MAX was rejected with affordable levels available.");
assert.equal(vm.runInContext("instantEconomyActions[0].levels", citySandbox), 3, "MAX did not reserve every level affordable with projected Gold.");
assert.equal(vm.runInContext("getProjectedGold()", citySandbox), 50, "MAX projected Gold is incorrect.");
vm.runInContext("clearInstantEconomyActions()", citySandbox);

citySandbox.state.gold = 1_000;
assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', citySandbox), true);
assert.equal(vm.runInContext('upgradeCity("city_1", 0, { mode: "max", regionId: "west" })', citySandbox), true);
assert.equal(vm.runInContext("instantEconomyActions.length", citySandbox), 2, "MAX merged into an adjacent exact city batch.");
assert.equal(vm.runInContext('instantEconomyActions[0].mode === "exact" && instantEconomyActions[1].mode === "max"', citySandbox), true, "MAX did not remain a standalone ordered action.");
vm.runInContext("clearInstantEconomyActions()", citySandbox);

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const cityUpgradeDelayValidation = (async () => {
  const delayedCities = [
    { id: "city_1", name: "First City", regionId: "west", owner: "player", level: 1 },
    { id: "city_2", name: "Second City", regionId: "east", owner: "player", level: 1 },
  ];
  const delayedTimers = [];
  const delayedCalls = [];
  const upgradeDeferreds = [];
  let refreshCount = 0;
  let economyRefreshSucceeds = true;
  let ownedCityRefreshSucceeds = true;
  let throwAfterAuthoritativeSettlement = false;
  let authoritativeSettlementPresentationFailures = 0;
  const delayedSandbox = {
    console: { ...console, warn() {} },
    Promise,
    Map,
    Set,
    Date,
    Math,
    SERVER_CITY_UPGRADE_LEVEL_CHUNK: 25,
    delayedCities,
    state: { gold: 1_000 },
    selectedSourceId: "",
    verifiedRealmInfo: { capabilities: { instantEconomyActionsVersion: 1, cityUpgradeModesVersion: 1 } },
    selectedInventoryItemId: "",
    selectedInventoryEntryKey: "",
    skillPresetMarkupSignature: "",
    SHOP_ITEMS: [],
    goldText: null,
    window: {
      crypto: { randomUUID: (() => { let sequence = 100; return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`; })() },
      setTimeout(callback) { delayedTimers.push(callback); return delayedTimers.length; },
      clearTimeout() {},
    },
    modal: { open: false, classList: { contains: () => false } },
    modalBody: { querySelector: () => null, querySelectorAll: () => [] },
    cityLayer: { querySelector: () => null },
    getKnownCityId: value => String(value || ""),
    normalizeRegionId: value => String(value || "west"),
    getActiveMapRegionId: () => "west",
    getCityRegionId: city => city?.regionId || "west",
    clampCityLevel: value => Math.max(1, Math.floor(Number(value) || 1)),
    getOwnedCitySnapshotForUpgrade: (id, regionId = "") => delayedCities.find(city => (
      city.id === id && (!regionId || city.regionId === regionId)
    )) || null,
    cityById: id => delayedCities.find(city => city.id === id) || null,
    isStronghold: () => false,
    getIncomingUpgradeBlockers: () => [],
    cityHasIncomingUpgradeBlocker: () => false,
    getCityUpgradeCostAtLevel: () => 100,
    getCityUpgradeReductionPercent: () => 0,
    getCityVfxSnapshot: city => ({ level: city?.level || 1 }),
    usesServerEconomyAuthority: () => true,
    renderHud() {},
    renderCities() {},
    setTextIfChanged() {},
    patchCityListUpgradeRows() {},
    formatNumber: value => String(value),
    formatDuration: value => String(value),
    rejectGameAction() {},
    addLog() {},
    showToast() {},
    playGameSound() {},
    playCityUpgradeAnimation() {},
    saveGame() {},
    refreshServerEconomy: async () => { refreshCount += 1; return economyRefreshSucceeds; },
    refreshAllOwnedCities: async () => ownedCityRefreshSucceeds,
    applyServerEconomyResult(result) {
      delayedSandbox.state.gold = result.currentUser.gold;
      for (const update of result.cityUpdates || []) {
        const city = delayedCities.find(entry => entry.id === update.id);
        if (city) Object.assign(city, update);
      }
      if (throwAfterAuthoritativeSettlement) {
        throwAfterAuthoritativeSettlement = false;
        authoritativeSettlementPresentationFailures += 1;
        throw new Error("injected post-settlement presentation failure");
      }
    },
    getOnlineApi: () => ({
      upgradeCity(payload) {
        const deferred = createDeferred();
        delayedCalls.push({
          type: "upgrade",
          cityId: payload.cityId,
          regionId: payload.regionId,
          mode: payload.mode,
          levels: payload.levels,
          requestId: payload.requestId,
          acknowledgedRebuildSuppressedXp: payload.acknowledgedRebuildSuppressedXp,
        });
        upgradeDeferreds.push(deferred);
        return deferred.promise;
      },
    }),
  };
  vm.createContext(delayedSandbox);
  vm.runInContext(controller, delayedSandbox, { filename: "instant-economy-actions.js" });

  const runNext = () => {
    vm.runInContext("instantEconomyFlushTimer = 0", delayedSandbox);
    return vm.runInContext("flushInstantEconomyActions()", delayedSandbox);
  };

  for (let tap = 0; tap < 3; tap += 1) {
    assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', delayedSandbox), true);
  }
  assert.equal(vm.runInContext("getProjectedGold()", delayedSandbox), 700, "Delayed responses removed the immediate Gold projection.");
  assert.equal(vm.runInContext('getProjectedCityForInstantActions(delayedCities[0]).level', delayedSandbox), 4, "Delayed responses removed the immediate level projection.");

  const compactedFlush = runNext();
  await Promise.resolve();
  assert.equal(delayedCalls.length, 1, "Three undispatched presses made more than one server request.");
  assert.equal(delayedCalls[0].levels, 3, "The compacted server request did not contain all three levels.");
  throwAfterAuthoritativeSettlement = true;
  upgradeDeferreds.shift().resolve({
    upgraded: 3,
    spentGold: 300,
    finalLevel: 4,
    currentUser: { gold: 700 },
    cityUpdates: [{ id: "city_1", regionId: "west", level: 4 }],
    cityUpgradeXp: { awardedXp: 3, capSuppressedXp: 0, rebuildSuppressedXp: 0 },
  });
  assert.equal(await compactedFlush, true, "The compacted three-level confirmation did not settle.");
  assert.equal(authoritativeSettlementPresentationFailures, 1, "The post-settlement presentation exception was not injected.");
  assert.equal(delayedCities[0].level, 4, "Ordered confirmations did not reconcile the authoritative city level.");
  assert.equal(delayedSandbox.state.gold, 700, "Ordered confirmations did not reconcile authoritative Gold.");
  assert.equal(vm.runInContext("getInstantEconomyPendingActions().length", delayedSandbox), 0, "Confirmed city actions remained pending.");

  vm.runInContext("clearInstantEconomyActions()", delayedSandbox);
  delayedSandbox.state.gold = 10_000;
  delayedCities[0].level = 1;
  const stressCallStart = delayedCalls.length;
  assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', delayedSandbox), true);
  const firstStressFlush = runNext();
  await Promise.resolve();
  for (let tap = 1; tap < 20; tap += 1) {
    assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', delayedSandbox), true);
  }
  assert.equal(vm.runInContext('getPendingCityUpgradeCount("city_1", "west")', delayedSandbox), 20, "The active and trailing batches lost stress-test levels.");
  assert.equal(vm.runInContext("instantEconomyActions.length", delayedSandbox), 1, "Nineteen trailing presses were not compacted behind the active request.");
  assert.equal(vm.runInContext("instantEconomyActions[0].requestedLevels", delayedSandbox), 19, "The trailing exact batch has the wrong level count.");
  upgradeDeferreds.shift().resolve({
    upgraded: 1,
    spentGold: 100,
    finalLevel: 2,
    currentUser: { gold: 9_900 },
    cityUpdates: [{ id: "city_1", regionId: "west", level: 2 }],
    cityUpgradeXp: { awardedXp: 1, capSuppressedXp: 0, rebuildSuppressedXp: 0 },
  });
  assert.equal(await firstStressFlush, true, "The immutable active stress request did not settle.");
  const trailingStressFlush = runNext();
  await Promise.resolve();
  assert.equal(delayedCalls.length - stressCallStart, 2, "Twenty rapid presses used more than one initial and one trailing request.");
  assert.equal(delayedCalls.at(-1).levels, 19, "The trailing server request lost compacted levels.");
  upgradeDeferreds.shift().resolve({
    upgraded: 19,
    spentGold: 1_900,
    finalLevel: 21,
    currentUser: { gold: 8_000 },
    cityUpdates: [{ id: "city_1", regionId: "west", level: 21 }],
    cityUpgradeXp: { awardedXp: 19, capSuppressedXp: 0, rebuildSuppressedXp: 0 },
  });
  assert.equal(await trailingStressFlush, true, "The trailing stress batch did not settle.");
  assert.equal(delayedCities[0].level, 21, "Twenty rapid presses did not reconcile the final city level.");
  assert.equal(delayedSandbox.state.gold, 8_000, "Twenty rapid presses did not reconcile final Gold.");

  vm.runInContext("clearInstantEconomyActions()", delayedSandbox);
  delayedSandbox.state.gold = 10_000;
  delayedCities[0].level = 1;
  for (let tap = 0; tap < 30; tap += 1) {
    assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', delayedSandbox), true);
  }
  assert.equal(vm.runInContext("instantEconomyActions.length", delayedSandbox), 2, "Thirty presses were not split at the exact 25-level boundary.");
  const firstMidQueueFlush = runNext();
  await Promise.resolve();
  assert.equal(delayedCalls.at(-1).levels, 25, "The first mid-queue request did not stop at 25 levels.");
  upgradeDeferreds.shift().resolve({
    upgraded: 25,
    spentGold: 2_500,
    finalLevel: 26,
    currentUser: { gold: 7_500 },
    cityUpdates: [{ id: "city_1", regionId: "west", level: 26 }],
    cityUpgradeXp: { awardedXp: 25, capSuppressedXp: 0, rebuildSuppressedXp: 0 },
  });
  assert.equal(await firstMidQueueFlush, true, "The first mid-queue batch did not settle.");
  const rejectedMidQueueFlush = runNext();
  await Promise.resolve();
  assert.equal(delayedCalls.at(-1).levels, 5, "The overflow mid-queue request did not retain five levels.");
  upgradeDeferreds.shift().reject(new Error("insufficient gold after first batch"));
  assert.equal(await rejectedMidQueueFlush, false, "The rejected overflow batch reported success.");
  assert.equal(delayedCities[0].level, 26, "A rejected overflow batch rolled back an already-confirmed batch.");
  assert.equal(delayedSandbox.state.gold, 7_500, "A rejected overflow batch corrupted confirmed Gold.");
  assert.equal(vm.runInContext('getPendingCityUpgradeCount("city_1", "west")', delayedSandbox), 0, "A rejected overflow batch left dependent city levels pending.");

  vm.runInContext("clearInstantEconomyActions()", delayedSandbox);
  delayedSandbox.state.gold = 1_000;
  delayedCities.forEach(city => { city.level = 1; });
  assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', delayedSandbox), true);
  assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', delayedSandbox), true);
  assert.equal(vm.runInContext('upgradeCity("city_2", 1, { mode: "exact", regionId: "east" })', delayedSandbox), true);
  const rejectedFlush = runNext();
  await Promise.resolve();
  upgradeDeferreds.shift().reject(new Error("server rejected city upgrade"));
  assert.equal(await rejectedFlush, false, "A rejected city request reported success.");
  assert.equal(vm.runInContext("instantEconomyActions.length", delayedSandbox), 1, "A rejection did not clear only dependent same-city actions.");
  assert.equal(vm.runInContext("instantEconomyActions[0].cityId", delayedSandbox), "city_2", "An unrelated queued city action was not preserved.");
  assert.equal(vm.runInContext('getProjectedCityForInstantActions(delayedCities[0]).level', delayedSandbox), 1, "A rejected action did not roll its city projection back.");
  assert.equal(vm.runInContext('getProjectedCityForInstantActions(delayedCities[1]).level', delayedSandbox), 2, "The unrelated action was not revalidated after rejection.");
  assert.equal(vm.runInContext("getProjectedGold()", delayedSandbox), 900, "Gold was not reprojected after rejection.");
  assert.equal(vm.runInContext('instantEconomyActions[0].regionId', delayedSandbox), "east", "The unrelated off-map action lost its region binding.");

  vm.runInContext("clearInstantEconomyActions()", delayedSandbox);
  delayedSandbox.state.gold = 1_000;
  delayedCities.forEach(city => { city.level = 1; });
  economyRefreshSucceeds = false;
  ownedCityRefreshSucceeds = false;
  assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', delayedSandbox), true);
  assert.equal(vm.runInContext('upgradeCity("city_2", 1, { mode: "exact", regionId: "east" })', delayedSandbox), true);
  const offlineRejectedFlush = runNext();
  await Promise.resolve();
  upgradeDeferreds.shift().reject(new Error("offline during city upgrade"));
  assert.equal(await offlineRejectedFlush, false, "An offline rejection reported success.");
  assert.equal(vm.runInContext("Boolean(instantEconomySyncRecovery)", delayedSandbox), true, "The unrelated queue did not pause for authoritative recovery.");
  assert.equal(vm.runInContext("instantEconomyActions.length", delayedSandbox), 1, "Offline recovery discarded an unrelated city action.");
  const callsWhileOffline = delayedCalls.length;
  assert.equal(await runNext(), false, "The queue drained while authoritative recovery was incomplete.");
  assert.equal(delayedCalls.length, callsWhileOffline, "An unrelated request reached the server while recovery was paused.");
  assert.equal(vm.runInContext("resumeInstantEconomyActionsAfterSync({ economy: true })", delayedSandbox), false, "Economy-only recovery resumed a city queue without its owned-city snapshot.");
  assert.equal(vm.runInContext("resumeInstantEconomyActionsAfterSync({ ownedCities: true })", delayedSandbox), true, "Complete reconnect synchronization did not resume the queue.");
  const recoveredFlush = runNext();
  await Promise.resolve();
  assert.equal(delayedCalls.at(-1).cityId, "city_2", "Reconnect resumed the wrong queued city.");
  upgradeDeferreds.shift().resolve({
    upgraded: 1,
    spentGold: 100,
    finalLevel: 2,
    currentUser: { gold: 900 },
    cityUpdates: [{ id: "city_2", regionId: "east", level: 2 }],
    cityUpgradeXp: { awardedXp: 1, capSuppressedXp: 0, rebuildSuppressedXp: 0 },
  });
  assert.equal(await recoveredFlush, true, "The unrelated city action did not settle after reconnect.");
  economyRefreshSucceeds = true;
  ownedCityRefreshSucceeds = true;

  vm.runInContext("clearInstantEconomyActions()", delayedSandbox);
  delayedSandbox.state.gold = 1_000;
  delayedCities[0].level = 1;
  assert.equal(vm.runInContext('upgradeCity("city_1", 1, { mode: "exact", regionId: "west" })', delayedSandbox), true);
  const compatibilityFlush = runNext();
  await Promise.resolve();
  const warningError = new Error("Older backend warning");
  warningError.details = {
    reason: "city-upgrade-xp-warning-required",
    cityUpgradeXp: { awardedXp: 0, rebuildSuppressedXp: 2 },
  };
  upgradeDeferreds.shift().reject(warningError);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(delayedCalls.at(-1).acknowledgedRebuildSuppressedXp, 2, "The compatibility retry did not silently acknowledge rebuilt-level suppression.");
  upgradeDeferreds.shift().resolve({
    upgraded: 1,
    spentGold: 100,
    finalLevel: 2,
    currentUser: { gold: 900 },
    cityUpdates: [{ id: "city_1", regionId: "west", level: 2 }],
    cityUpgradeXp: { awardedXp: 0, capSuppressedXp: 0, rebuildSuppressedXp: 2 },
  });
  assert.equal(await compatibilityFlush, true, "The silent compatibility retry did not settle.");
  assert.equal(delayedCities[0].level, 2, "The compatibility retry did not reconcile the city.");
  assert(refreshCount >= 1, "A rejected city action did not refresh authoritative state.");
})();

const skillAdjustmentDelayValidation = (async () => {
  const skillTimers = [];
  const skillCalls = [];
  const skillDeferreds = [];
  const skillRejections = [];
  let skillRefreshes = 0;
  const skillSandbox = {
    console: { ...console, warn() {} },
    Promise,
    Map,
    Set,
    Date,
    Math,
    state: {
      gold: 0,
      character: { level: 30, skillPoints: 8 },
      upgrades: { alpha: 20, beta: 1 },
      skillPresets: { activeSlot: 1, slots: [] },
    },
    selectedSourceId: "",
    selectedInventoryItemId: "",
    selectedInventoryEntryKey: "",
    verifiedRealmInfo: { capabilities: { instantEconomyActionsVersion: 1, skillLevelAdjustmentVersion: 1 } },
    skillPresetMarkupSignature: "",
    SKILL_CONFIG: {
      alpha: { label: "Alpha", maxPercent: 50 },
      beta: { label: "Beta", maxPercent: 60 },
    },
    SHOP_ITEMS: [],
    window: {
      crypto: { randomUUID: (() => { let sequence = 200; return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`; })() },
      setTimeout(callback) { skillTimers.push(callback); return skillTimers.length; },
      clearTimeout() {},
    },
    modal: { open: false, classList: { contains: () => false } },
    modalBody: { querySelector: () => null, querySelectorAll: () => [] },
    cityLayer: { querySelector: () => null },
    normalizeCharacterProgress: character => ({ ...character }),
    normalizeUpgrades: upgrades => ({ alpha: Number(upgrades?.alpha || 0), beta: Number(upgrades?.beta || 0) }),
    getSkillMaxLevel: skill => skill === "alpha" ? 25 : 30,
    getSkillPointCost: (skill, level) => {
      const maxLevel = skill === "alpha" ? 25 : 30;
      if (level < 0 || level >= maxLevel) return 0;
      return level >= maxLevel - 5 ? 2 : 1;
    },
    getSpentSkillPoints(upgrades) {
      return Object.entries(upgrades || {}).reduce((total, [skill, level]) => {
        let spent = 0;
        for (let current = 0; current < Number(level || 0); current += 1) spent += skillSandbox.getSkillPointCost(skill, current);
        return total + spent;
      }, 0);
    },
    getAvailableSkillPoints(character, upgrades) {
      return Math.max(0, Number(character?.level || 1) - 1 - skillSandbox.getSpentSkillPoints(upgrades));
    },
    reconcileSkillPoints(character, upgrades) {
      character.skillPoints = skillSandbox.getAvailableSkillPoints(character, upgrades);
      return character;
    },
    getSkillLevel: skill => Number(skillSandbox.state.upgrades?.[skill] || 0),
    setActiveSkillPresetSlot: presets => ({ ...(presets || {}), activeSlot: 0 }),
    usesServerEconomyAuthority: () => true,
    getOnlineApi: () => ({
      spendSkillPoint() {},
      adjustSkillLevels(payload) {
        const deferred = createDeferred();
        skillCalls.push(payload);
        skillDeferreds.push(deferred);
        return deferred.promise;
      },
    }),
    applyServerEconomyResult(result) {
      skillSandbox.state.character = { ...result.currentUser.character };
      skillSandbox.state.upgrades = { ...result.currentUser.upgrades };
      skillSandbox.state.skillPresets = { ...result.currentUser.skillPresets };
    },
    refreshServerEconomy: async () => { skillRefreshes += 1; },
    refreshAllOwnedCities: async () => {},
    ensureShopItems: () => ({}),
    goldText: null,
    renderHud() {},
    renderCities() {},
    setTextIfChanged() {},
    renderProfileSkills() {},
    cityById: () => null,
    formatNumber: value => String(value),
    addLog() {},
    showToast() {},
    saveGame() {},
    rejectGameAction(message) { skillRejections.push(message); },
  };
  vm.createContext(skillSandbox);
  vm.runInContext(controller, skillSandbox, { filename: "instant-economy-actions.js" });
  vm.runInContext(`
    function getDisplayedSkillUpgrades() {
      const upgrades = { ...state.upgrades };
      for (const skill of Object.keys(SKILL_CONFIG)) {
        const activeDelta = activeSkillSpendBatch?.adjustments?.find(adjustment => adjustment.skillId === skill)?.levelDelta || 0;
        upgrades[skill] = Math.max(0, Math.min(getSkillMaxLevel(skill), upgrades[skill] + activeDelta + (pendingSkillSpendAllocations.get(skill) || 0)));
      }
      return upgrades;
    }
    function getDisplayedSkillLevel(skill) { return getDisplayedSkillUpgrades()[skill] || 0; }
    function getDisplayedSkillPoints() { return getAvailableSkillPoints(state.character, getDisplayedSkillUpgrades()); }
    function isDisplayedSkillAtCap(skill) { return getDisplayedSkillLevel(skill) >= getSkillMaxLevel(skill); }
  `, skillSandbox);

  assert.equal(vm.runInContext('buySkill("alpha")', skillSandbox), true);
  assert.equal(vm.runInContext('buySkill("alpha")', skillSandbox), true);
  assert.equal(vm.runInContext('refundSkill("alpha")', skillSandbox), true);
  assert.equal(vm.runInContext('buySkill("beta")', skillSandbox), true);
  assert.equal(vm.runInContext('getDisplayedSkillLevel("alpha")', skillSandbox), 21, "Rapid plus/minus clicks did not coalesce to Alpha +1.");
  assert.equal(vm.runInContext('getDisplayedSkillLevel("beta")', skillSandbox), 2, "A rapid cross-skill addition was not projected.");
  assert.equal(vm.runInContext("getDisplayedSkillPoints()", skillSandbox), 5, "Rapid signed changes showed the wrong optimistic point total.");
  assert.equal(skillSandbox.state.skillPresets.activeSlot, 0, "An accepted live adjustment did not clear the active preset immediately.");

  vm.runInContext("skillSpendFlushTimer = 0; flushSkillSpendQueue()", skillSandbox);
  assert.equal(vm.runInContext("instantEconomyActions.length", skillSandbox), 1, "The first signed batch was not queued.");
  const firstSkillFlush = vm.runInContext("instantEconomyFlushTimer = 0; flushInstantEconomyActions()", skillSandbox);
  await Promise.resolve();
  assert.equal(skillCalls.length, 1, "The first signed skill request did not reach the server.");
  assert.equal(skillCalls[0].adjustments.find(adjustment => adjustment.skillId === "alpha")?.levelDelta, 1, "The net Alpha delta was not serialized.");
  assert.equal(skillCalls[0].adjustments.find(adjustment => adjustment.skillId === "beta")?.levelDelta, 1, "The Beta delta was not serialized.");

  assert.equal(vm.runInContext('buySkill("alpha")', skillSandbox), true, "A plus click was blocked while an earlier skill request was pending.");
  assert.equal(vm.runInContext('refundSkill("beta")', skillSandbox), true, "A minus click was blocked while an earlier skill request was pending.");
  assert.equal(vm.runInContext('getDisplayedSkillLevel("alpha")', skillSandbox), 22, "A later Alpha projection was lost behind the active request.");
  assert.equal(vm.runInContext('getDisplayedSkillLevel("beta")', skillSandbox), 1, "A later Beta refund did not overlay the active request.");
  skillDeferreds.shift().resolve({
    spentSkillPoints: 3,
    refundedSkillPoints: 0,
    currentUser: {
      character: { level: 30, skillPoints: 5 },
      upgrades: { alpha: 21, beta: 2 },
      skillPresets: { activeSlot: 0, slots: [] },
    },
  });
  assert.equal(await firstSkillFlush, true, "The first delayed signed batch did not settle.");
  assert.equal(vm.runInContext('getDisplayedSkillLevel("alpha")', skillSandbox), 22, "Confirmation removed a later Alpha projection.");
  assert.equal(vm.runInContext('getDisplayedSkillLevel("beta")', skillSandbox), 1, "Confirmation removed a later Beta projection.");

  vm.runInContext("skillSpendFlushTimer = 0; flushSkillSpendQueue()", skillSandbox);
  const secondSkillFlush = vm.runInContext("instantEconomyFlushTimer = 0; flushInstantEconomyActions()", skillSandbox);
  await Promise.resolve();
  assert.equal(skillCalls.length, 2, "The later projected skill changes were not serialized after confirmation.");
  skillDeferreds.shift().resolve({
    spentSkillPoints: 2,
    refundedSkillPoints: 1,
    currentUser: {
      character: { level: 30, skillPoints: 4 },
      upgrades: { alpha: 22, beta: 1 },
      skillPresets: { activeSlot: 0, slots: [] },
    },
  });
  assert.equal(await secondSkillFlush, true, "The second delayed signed batch did not settle.");
  assert.equal(vm.runInContext('getDisplayedSkillLevel("alpha")', skillSandbox), 22, "The confirmed Alpha level is incorrect.");
  assert.equal(vm.runInContext('getDisplayedSkillLevel("beta")', skillSandbox), 1, "The confirmed Beta level is incorrect.");
  assert.equal(vm.runInContext("getDisplayedSkillPoints()", skillSandbox), 4, "The confirmed available-point total is incorrect.");

  vm.runInContext("skillSpendFlushTimer = 0", skillSandbox);
  assert.equal(vm.runInContext('buySkill("beta")', skillSandbox), true);
  assert.equal(vm.runInContext('refundSkill("beta")', skillSandbox), true);
  assert.equal(vm.runInContext("pendingSkillSpendAllocations.size", skillSandbox), 0, "A net-zero rapid change was not coalesced away.");
  vm.runInContext("skillSpendFlushTimer = 0", skillSandbox);
  assert.equal(vm.runInContext("flushSkillSpendQueue()", skillSandbox), false, "A net-zero skill change created a server request.");

  assert.equal(vm.runInContext('buySkill("alpha")', skillSandbox), true);
  vm.runInContext("skillSpendFlushTimer = 0; flushSkillSpendQueue()", skillSandbox);
  const rejectedSkillFlush = vm.runInContext("instantEconomyFlushTimer = 0; flushInstantEconomyActions()", skillSandbox);
  await Promise.resolve();
  assert.equal(vm.runInContext('buySkill("alpha")', skillSandbox), true, "A dependent projection could not queue behind the rejected request.");
  skillDeferreds.shift().reject(new Error("server rejected skill adjustment"));
  assert.equal(await rejectedSkillFlush, false, "A rejected signed skill request reported success.");
  assert.equal(vm.runInContext("pendingSkillSpendAllocations.size", skillSandbox), 0, "A rejected signed request did not clear dependent projections.");
  assert.equal(vm.runInContext("activeSkillSpendBatch === null", skillSandbox), true, "A rejected signed request left an active projection.");
  assert.equal(vm.runInContext('getDisplayedSkillLevel("alpha")', skillSandbox), 22, "A rejected signed request did not roll back to the authoritative Alpha level.");
  assert.equal(skillRefreshes, 1, "A rejected signed request did not refresh authoritative profile data.");
  assert(skillRejections.some(message => /server rejected skill adjustment/i.test(message)), "The rejected signed request did not explain its rollback.");
})();

let resolvePurchase;
const deferredPurchase = new Promise(resolve => { resolvePurchase = resolve; });
const scheduled = [];
const sandbox = {
  console,
  Promise,
  Map,
  Set,
  Date,
  Math,
  state: { gold: 1_000, shopItems: { test_item: 0 } },
  selectedSourceId: "",
  verifiedRealmInfo: { capabilities: { instantEconomyActionsVersion: 1 } },
  selectedInventoryItemId: "",
  selectedInventoryEntryKey: "stale-entry",
  skillPresetMarkupSignature: "",
  window: {
    setTimeout(callback) { scheduled.push(callback); return scheduled.length; },
    clearTimeout() {},
  },
  modal: { open: false, classList: { contains: () => false } },
  modalBody: { querySelector: () => null, querySelectorAll: () => [] },
  cityLayer: { querySelector: () => null },
  SHOP_ITEMS: [{ id: "test_item", label: "Test Item", cost: 100 }],
  goldText: null,
  getShopItemById: id => id === "test_item" ? { id, label: "Test Item", cost: 100 } : null,
  getShopItemPrice: item => item?.cost || 0,
  getItemPurchaseCount: () => 0,
  getItemDailyPurchaseLimit: () => 10,
  getItemPurchaseCooldownText: () => "",
  ensureShopItems() { return sandbox.state.shopItems; },
  usesServerEconomyAuthority: () => true,
  getOnlineApi: () => ({ purchaseShopItem: () => deferredPurchase }),
  renderHud() {},
  setTextIfChanged() {},
  cityById: () => null,
  formatNumber: value => String(value),
  rejectGameAction(message) { throw new Error(message); },
  applyServerEconomyResult(result) { sandbox.state.gold = result.currentUser.gold; sandbox.state.shopItems = result.currentUser.shopItems; },
  addLog() {},
  showToast() {},
  saveGame() {},
};
vm.createContext(sandbox);
vm.runInContext(controller, sandbox, { filename: "instant-economy-actions.js" });

assert.equal(vm.runInContext('buyShopItem("test_item")', sandbox), true);
assert.equal(vm.runInContext('buyShopItem("test_item")', sandbox), true);
assert.equal(vm.runInContext('buyShopItem("test_item")', sandbox), true);
assert.equal(vm.runInContext("getProjectedGold()", sandbox), 700, "Rapid Shop taps did not project shared gold synchronously.");
assert.equal(vm.runInContext('getProjectedInventoryCount("test_item")', sandbox), 3, "Rapid Shop taps did not project inventory synchronously.");
assert.equal(vm.runInContext("instantEconomyActions.length", sandbox), 1);
assert.equal(vm.runInContext("instantEconomyActions[0].quantity", sandbox), 3, "Adjacent Shop taps were not coalesced.");
scheduled.shift()();
assert.equal(vm.runInContext("getProjectedGold()", sandbox), 700, "Projection disappeared while the server promise was pending.");

resolvePurchase({
  purchasedQuantity: 3,
  spentGold: 300,
  currentUser: { gold: 700, shopItems: { test_item: 3 } },
});

setImmediate(() => {
  assert.equal(vm.runInContext("getProjectedGold()", sandbox), 700, "Confirmed gold did not settle cleanly.");
  assert.equal(vm.runInContext('getProjectedInventoryCount("test_item")', sandbox), 3, "Confirmed inventory did not settle cleanly.");
  assert.equal(sandbox.selectedInventoryEntryKey, "", "Confirmed purchases must clear a stale presentation key before selecting the purchased item.");

  const failedItemTimers = [];
  let failedItemBagRebuilds = 0;
  const failedItemSandbox = {
    console: { ...console, warn() {} },
    Promise,
    Map,
    Set,
    Date,
    Math,
    state: { gold: 0, shopItems: { shield: 1 } },
    selectedSourceId: "",
    selectedInventoryItemId: "shield",
    selectedInventoryEntryKey: "shield",
    selectedInventoryCategory: "all",
    selectedInventoryPage: 0,
    COMMON_GEAR: null,
    COMMON_GEAR_BOX_ITEM: { id: "common_gear_box", bagCategory: "utility" },
    INVENTORY_SLOT_COUNT: 8,
    verifiedRealmInfo: { capabilities: { instantEconomyActionsVersion: 1 } },
    skillPresetMarkupSignature: "",
    window: {
      setTimeout(callback) { failedItemTimers.push(callback); return failedItemTimers.length; },
      clearTimeout() {},
    },
    modal: { open: true, classList: { contains: name => name === "inventory-modal" } },
    modalBody: { querySelector: () => null, querySelectorAll: () => [] },
    cityLayer: { querySelector: () => null },
    SHOP_ITEMS: [{ id: "shield", label: "Shield", cost: 0 }],
    goldText: null,
    SWIFT_MARCH_ORDER_ITEM_ID: "swift",
    RECALL_HORN_ITEM_ID: "recall",
    WAR_DRUMS_ITEM_ID: "drums",
    ROYAL_TAX_DECREE_ITEM_ID: "tax",
    ROYAL_PEACE_SHIELD_ITEM_ID: "shield",
    VEIL_OF_SILENCE_ITEM_ID: "veil",
    WAR_DRUMS_DURATION_MS: 1_800_000,
    ROYAL_TAX_DECREE_DURATION_MS: 1_800_000,
    ROYAL_PEACE_SHIELD_DURATION_MS: 86_400_000,
    VEIL_OF_SILENCE_DURATION_MS: 21_600_000,
    getShopItemById: id => id === "shield" ? { id, label: "Shield", cost: 0 } : null,
    ensureShopItems() { return failedItemSandbox.state.shopItems; },
    getItemPurchaseCount: () => 0,
    getItemDailyPurchaseLimit: () => 1,
    getItemPurchaseCooldownText: () => "",
    getActiveWarDrumsExpiresAtMs: () => 0,
    getActiveRoyalTaxDecreeExpiresAtMs: () => 0,
    getActivePeaceShieldExpiresAtMs: () => 0,
    getActiveVeilOfSilenceExpiresAtMs: () => 0,
    isStackableTimedInventoryItem: () => false,
    usesServerEconomyAuthority: () => true,
    getOnlineApi: () => ({ activateInventoryItem: async () => { throw new Error("rejected"); } }),
    refreshServerEconomy: async () => {},
    refreshAllOwnedCities: async () => {},
    renderHud() {},
    setTextIfChanged() {},
    cityById: () => null,
    formatNumber: value => String(value),
    formatDuration: value => String(value),
    rejectGameAction() {},
    showInventoryModal() { failedItemBagRebuilds += 1; },
  };
  vm.createContext(failedItemSandbox);
  vm.runInContext(controller, failedItemSandbox, { filename: "instant-economy-actions.js" });
  assert.equal(vm.runInContext('useInventoryItem("shield")', failedItemSandbox), true);
  assert.equal(failedItemSandbox.selectedInventoryEntryKey, "", "Using the final projected copy must clear its now-empty stack selection immediately.");
  assert.equal(failedItemBagRebuilds, 1, "An accepted item action must rebuild the projected Bag once.");
  failedItemTimers.shift()();
  setImmediate(() => {
    assert.equal(failedItemBagRebuilds, 2, "A rejected item action must rebuild the Bag and restore its authoritative card count.");
    assert.equal(vm.runInContext('getProjectedInventoryCount("shield")', failedItemSandbox), 1, "Rejected item inventory did not roll back to its authoritative count.");

    const rapidTimers = [];
    let rapidBagRebuilds = 0;
    const rapidSandbox = {
      ...failedItemSandbox,
      state: { gold: 0, shopItems: { drums: 5 } },
      selectedInventoryItemId: "drums",
      selectedInventoryEntryKey: "drums",
      selectedInventoryCategory: "all",
      selectedInventoryPage: 0,
      SHOP_ITEMS: [{ id: "drums", label: "War Drums", cost: 0, bagCategory: "boosts" }],
      window: {
        setTimeout(callback) { rapidTimers.push(callback); return rapidTimers.length; },
        clearTimeout() {},
      },
      getShopItemById: id => id === "drums" ? { id, label: "War Drums", cost: 0, bagCategory: "boosts" } : null,
      ensureShopItems() { return rapidSandbox.state.shopItems; },
      isStackableTimedInventoryItem: item => item?.id === "drums",
      rejectGameAction() {},
      showInventoryModal() { rapidBagRebuilds += 1; },
    };
    vm.createContext(rapidSandbox);
    vm.runInContext(controller, rapidSandbox, { filename: "instant-economy-actions.js" });
    for (let index = 0; index < 5; index += 1) {
      assert.equal(vm.runInContext('useInventoryItem("drums")', rapidSandbox), true, `Rapid projected use ${index + 1} was not accepted.`);
      assert.equal(vm.runInContext('getProjectedInventoryCount("drums")', rapidSandbox), 4 - index, "Each rapid use must decrement the visible stack by exactly one.");
    }
    assert.equal(vm.runInContext('useInventoryItem("drums")', rapidSandbox), false, "A rapid use beyond the projected stack must be rejected.");
    assert.equal(vm.runInContext("instantEconomyActions.length", rapidSandbox), 1, "Adjacent rapid uses must remain one serialized queue entry.");
    assert.equal(vm.runInContext("instantEconomyActions[0].quantity", rapidSandbox), 5, "The rapid-use queue lost or duplicated a tap.");
    assert.equal(rapidBagRebuilds, 1, "Only the x1 to x0 transition should rebuild the Bag and move selection.");
    vm.runInContext("clearInstantEconomyActions()", rapidSandbox);
    assert.equal(vm.runInContext('getProjectedInventoryCount("drums")', rapidSandbox), 5, "Clearing an unconfirmed queue must roll the stack back to x5.");
    rapidSandbox.state.shopItems.drums = 4;
    assert.equal(vm.runInContext('getProjectedInventoryCount("drums")', rapidSandbox), 4, "A confirmed one-item settlement must remain at x4.");
    Promise.all([cityUpgradeDelayValidation, skillAdjustmentDelayValidation]).then(() => {
      console.log("Instant economy action validation passed.");
    });
  });
});
