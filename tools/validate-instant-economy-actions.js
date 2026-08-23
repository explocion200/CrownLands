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
assert.match(controller, /previous\.type === normalized\.type && previous\.key === normalized\.key/, "Adjacent matching actions are not coalesced.");
assert.match(controller, /refreshServerEconomy\(true[\s\S]*?revalidateInstantEconomyActions\(\)/, "Rejected actions do not refresh and revalidate the remaining queue.");
assert.match(controller, /action\.generation !== instantEconomyGeneration/, "Late responses from an old session are not ignored.");
assert.match(game, /clearInstantEconomyActions\(\)[\s\S]*?onlineSaveAuthUid = nextUid/, "Auth generation changes do not clear queued actions.");
assert.match(server, /instantEconomyActionsVersion: 1/, "Realm capabilities do not advertise instant economy actions.");
assert.match(server, /requestedQuantity = data\.quantity === undefined \? 1[\s\S]*?unitPrice = getShopItemPriceForEconomy\(economy, itemId\)[\s\S]*?purchasedQuantity: requestedQuantity[\s\S]*?unitPrice,[\s\S]*?spentGold: totalCost/, "Shop quantity purchases are not atomically priced and backward compatible.");
assert.match(server, /const maxQuantity = stackable \? 25 : 1;[\s\S]*?activatedQuantity: requestedQuantity[\s\S]*?effectDurationAddedMs:[\s\S]*?requestedQuantity/, "Timed-item quantity activation is not bounded and aggregated.");
assert.match(firebase, /purchaseShopItem\(\{ itemId = "", cost = 0, quantity = 1 \}[\s\S]*?\{ itemId, cost, quantity \}/, "The client wrapper drops Shop purchase quantities.");
assert.ok(index.indexOf("instant-economy-actions.js") < index.indexOf("game.js"), "The action controller must load immediately before game.js.");
assert.match(worker, /instant-economy-actions\.js/, "The controller is missing from the offline shell.");
const staticCache = worker.match(/const STATIC_CACHE_URLS\s*=\s*(\[[\s\S]*?\]);/)?.[1] || "";
assert.doesNotMatch(staticCache, /map-transition-clouds/, "Map-transition clouds must be runtime-cached instead of install-precached.");

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
  getShopItemById: id => id === "test_item" ? { id, label: "Test Item", cost: 100 } : null,
  getShopItemPrice: item => item?.cost || 0,
  getItemPurchaseCount: () => 0,
  getItemDailyPurchaseLimit: () => 10,
  getItemPurchaseCooldownText: () => "",
  ensureShopItems() { return sandbox.state.shopItems; },
  usesServerEconomyAuthority: () => true,
  getOnlineApi: () => ({ purchaseShopItem: () => deferredPurchase }),
  renderHud() {},
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
    console.log("Instant economy action validation passed.");
  });
});
