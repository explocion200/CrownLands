"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const game = read("game.js");
function extract(name) {
  const start = game.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const tail = game.slice(start), end = tail.search(/\n(?:async )?function /);
  assert(end > 0);
  return tail.slice(0, end);
}
let mounted, bound = 0;
const claim = () => {}, replace = () => {};
const body = {querySelector: () => null};
const context = vm.createContext({
  window: {CrownlandsQuestsUI: {mount: (host, options) => {mounted = {host, options};}}},
  modalBody: body, modal: {classList: {contains: () => true, toggle() {}}}, modalTitle: {}, modalHeaderNav: {},
  activeDailyRewardModalTab: "quests", clearSeasonalAchievementRenderTimer() {},
  renderDailyRewardModalTabs: () => "tabs", bindDailyRewardModalTabs: () => bound++,
  ensureModalUiScripts: () => true, dailyMissionState: {missions: []}, dailyMissionStatusLoading: false,
  dailyMissionError: "", supportsDailyMissions: () => true, dailyMissionActionsInFlight: new Set(),
  getOnlineSessionRequestScope: () => "session", getDailyMissionNowMs: () => 1,
  cityDetailsIcon: () => "", getRegionLabel: () => "Map", claimDailyMission: claim, rerollDailyMission: replace,
});
vm.runInContext(extract("renderDailyMissions"), context);
vm.runInContext(extract("renderDailyLoginRewardModal"), context);
context.renderDailyLoginRewardModal();
assert.equal(bound, 1, "The active reward modal binds its tab navigation");
assert.equal(mounted.host, body, "Quests mount in the active reward modal");
assert.equal(mounted.options.claim, claim, "Quest claims use the authoritative action");
assert.equal(mounted.options.replace, replace, "Quest replacements use the authoritative action");
assert.equal(mounted.options.scope, "session");

const item = {id: "shield_12h", label: "Peace Shield", description: "Protects your city.", bagCategory: "utility"};
const box = {id: "common_gear_box", label: "Common Gear Box"};
const reward = {id: "gold", label: "Gold reward", rewardLabel: "Gold", description: "Watch an advertisement."};
const shop = vm.createContext({
  selectedShopItemId: item.id, COMMON_GEAR_BOX_ITEM: box, REWARDED_AD_ITEMS: [reward],
  INVENTORY_CATEGORIES: [["utility", "Utility"]], getShopItemById: () => item,
  getShopPurchaseState: () => ({price: 1200, owned: 2, purchaseCount: 1, purchaseLimit: 4, canBuy: true, buttonLabel: "Buy", status: ""}),
  getRewardedAdAvailability: () => ({canWatch: true, text: "Ready"}),
  rewardedAdStatus: {claimedToday: 2, dailyLimit: 5, previewRewards: {gold: 500}},
  getRewardedAdClientConfig: () => ({dailyLimit: 5}), escapeHtml: value => String(value || ""),
  formatNumber: String, renderItemIcon: () => '<img alt="Item">',
});
vm.runInContext(read("shop-ui.js"), shop);
for (const provision of [item, box]) {
  const html = shop.renderRoyalShopCard(provision);
  assert(html.includes(`data-shop-select="${provision.id}"`));
  assert(html.includes('role="option"'));
  assert(!html.includes("data-rewarded-ad-watch"));
}
const provision = shop.renderRoyalShopSelection();
assert(provision.includes('data-shop-purchase-selected="shield_12h"'));
assert(provision.includes("data-shop-selected-price"));
assert(provision.includes("data-shop-selected-owned"));
vm.runInContext('royalShopSection = "rewards"; royalShopRewardId = "gold";', shop);
const advertisement = shop.renderRoyalShopSelection();
assert(advertisement.includes("data-rewarded-ad-watch"));
assert(advertisement.includes("Watch Advertisement"));
assert(advertisement.includes("Estimated reward: 500 Gold"));
assert(advertisement.includes("2 / 5"));
assert(!advertisement.includes("data-shop-purchase-selected"));
console.log("Active reward UI passed: Quests mount and action wiring, provision/Gear Box selection, paid prices and advertisement rewards.");
