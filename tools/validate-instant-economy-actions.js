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
assert.match(server, /requestedQuantity = data\.quantity === undefined \? 1[\s\S]*?purchasedQuantity: requestedQuantity[\s\S]*?spentGold: totalCost/, "Shop quantity purchases are not atomic and backward compatible.");
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
  console.log("Instant economy action validation passed.");
});
