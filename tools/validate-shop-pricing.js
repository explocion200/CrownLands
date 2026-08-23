"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const client = read("game.js");
const controller = read("instant-economy-actions.js");
const commonGear = read("common-gear-ui.js");
const server = read("functions/index.js");
const palette = read("crownlands-palette.css");
const visualQa = read("docs/visual-qa/scalable-shop-pricing/index.html");

const hours = Object.freeze({
  royal_tax_decree_30m: 0.18,
  swift_march_order: 1,
  recall_horn: 1.25,
  war_drums_30m: 1.5,
  veil_of_silence_30m: 2,
  shield_12h: 3.5,
});

function roundNice(value) {
  const amount = Math.max(0, Number(value) || 0);
  if (amount <= 0) return 50;
  const step = 10 ** Math.max(1, Math.floor(Math.log10(amount)) - 1);
  return Math.max(50, Math.round(amount / step) * step);
}

function price(itemId, rawBaseGoldPerHour, cityCount) {
  const premium = 1 + Math.min(Math.max(0, Math.floor(cityCount)) / 500, 0.35);
  return roundNice(rawBaseGoldPerHour * hours[itemId] * premium);
}

assert.equal(price("royal_tax_decree_30m", 10_000, 0), 1_800);
assert.equal(price("royal_tax_decree_30m", 10_000, 100), 2_200);
assert.equal(price("royal_tax_decree_30m", 10_000, 250), 2_400);
assert.equal(price("royal_tax_decree_30m", 10_000, 500), 2_400, "The 35% city premium cap changed.");
assert.equal(price("royal_tax_decree_30m", 10_000, 5_000), 2_400, "The city premium must remain capped for large kingdoms.");
assert.equal(price("royal_tax_decree_30m", 0, 0), 50, "New players must not receive free Shop items.");
assert.equal(price("swift_march_order", 10_000, 0), 10_000);
assert.equal(price("recall_horn", 10_000, 0), 13_000);
assert.equal(price("war_drums_30m", 10_000, 0), 15_000);
assert.equal(price("veil_of_silence_30m", 10_000, 0), 20_000);
assert.equal(price("shield_12h", 10_000, 0), 35_000);

const rawPrice = price("royal_tax_decree_30m", 10_000, 100);
assert.equal(rawPrice, price("royal_tax_decree_30m", 10_000, 100), "Price must depend only on raw production and city count.");
assert.notEqual(rawPrice, price("royal_tax_decree_30m", 19_000, 100), "A boosted rate would incorrectly change the price.");
assert.equal(Math.floor(10_000 * 0.5 * 30 / 60), 2_500, "Royal Tax value must remain 25% of raw hourly Gold.");

for (const [itemId, multiplier] of Object.entries(hours)) {
  const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedMultiplier = String(multiplier).replace(".", "\\.");
  const entryPattern = new RegExp(`\\[?(?:[A-Z_]+|${escapedId})\\]?:\\s*${escapedMultiplier}`);
  assert.match(client, entryPattern, `Client pricing is missing ${itemId} = ${multiplier} hours.`);
  assert.match(server, entryPattern, `Server pricing is missing ${itemId} = ${multiplier} hours.`);
}

assert.match(client, /function getHarvestBonusBaseRates\(\)[\s\S]*?playerRegularCities\(\)[\s\S]*?includeSkillBoosts:\s*false[\s\S]*?includeStrongholdBoosts:\s*false[\s\S]*?includeTimedItemBoosts:\s*false/);
assert.match(server, /function getShopPricingContext\(economy = null\)[\s\S]*?getRewardedAdBaseRates\(economy\)[\s\S]*?isStronghold\(city\)/);
assert.match(server, /function getRewardedAdBaseRates\(economy = null\)[\s\S]*?baseGoldProductionPerHour/);
assert.match(server, /const unitPrice = getShopItemPriceForEconomy\(economy, itemId\);[\s\S]*?goldFloat - totalCost[\s\S]*?spentGold: totalCost/, "The authoritative transaction must calculate and charge the scalable price atomically.");
assert.match(server, /Math\.floor\(safeNumber\(data\.cost, 0\)\) !== unitPrice[\s\S]*?Shop item price changed/, "Stale Shop prices must be rejected before purchase.");
assert.match(controller, /getShopItemPrice\(item\)[\s\S]*?reservedGold:\s*price/, "Instant purchases must reserve the displayed scalable price.");

assert.match(client, /function renderShopItem[\s\S]*?data-shop-select[\s\S]*?role="option"/);
const paidRenderer = client.match(/function renderShopItem[\s\S]*?\n}/)?.[0] || "";
assert.match(paidRenderer, /shop-item-image-placeholder[\s\S]*renderItemIcon/);
assert.doesNotMatch(paidRenderer, /shop-item-copy|data-shop-card-price|data-shop-owned|item\.description|shop-item-value|data-shop-buy|>Buy</);
assert.match(paidRenderer, /aria-label="\$\{escapeHtml\(item\.label\)\}"/);
assert.match(client, /function renderShopPurchaseBar[\s\S]*?shop-purchase-description[\s\S]*?data-shop-selected-owned[\s\S]*?data-shop-selected-price[\s\S]*?data-shop-purchase-selected/);
for (const description of [
  "Boosts Gold production for 30 minutes.",
  "Protects your city for a limited time.",
  "Boosts your army’s battle readiness.",
  "Hides your city from scouting for a limited time.",
  "Speeds up troop movement.",
  "Calls troops back to regroup.",
]) {
  assert.ok(client.includes(description), `Missing concise Shop description: ${description}`);
}
assert.doesNotMatch(client.match(/function getShopPurchaseState[\s\S]*?\n}/)?.[0] || "", /Scales from raw|raw base gold|city premium|30m value/);
assert.match(commonGear, /function renderCommonGearShopItem[\s\S]*?data-shop-select="common_gear_box"/);
const commonGearRenderer = commonGear.match(/function renderCommonGearShopItem[\s\S]*?\n}/)?.[0] || "";
assert.match(commonGearRenderer, /shop-item-image-placeholder[\s\S]*renderItemIcon/);
assert.doesNotMatch(commonGearRenderer, /shop-item-copy|data-shop-card-price|data-shop-owned|data-common-gear-buy|>Buy</);
assert.match(palette, /\.shop-modal \.shop-items\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/);
assert.match(palette, /\.shop-modal \.shop-purchase-bar\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;[^}]*grid-template-columns:/);
assert.match(palette, /\.shop-modal \.shop-items \.shop-item\.selected/);
assert.match(palette, /--shop-paid-tile-size:\s*clamp\(104px,\s*12vw,\s*132px\);/);
assert.match(palette, /\.shop-modal \.shop-items \.shop-item\s*\{[^}]*flex:\s*0 0 var\(--shop-paid-tile-size\);[^}]*inline-size:\s*var\(--shop-paid-tile-size\);[^}]*block-size:\s*var\(--shop-paid-tile-size\);[^}]*min-inline-size:\s*var\(--shop-paid-tile-size\);[^}]*min-block-size:\s*var\(--shop-paid-tile-size\);[^}]*aspect-ratio:\s*1 \/ 1;[^}]*grid-template:\s*minmax\(0,\s*1fr\) \/ minmax\(0,\s*1fr\);[^}]*place-items:\s*center;/);
assert.match(palette, /\.shop-modal \.shop-items \.shop-item-image-placeholder\s*\{[^}]*inline-size:\s*100%;[^}]*block-size:\s*100%;[^}]*aspect-ratio:\s*1 \/ 1;/);
assert.match(palette, /@media \(max-height:\s*560px\)[\s\S]*?--shop-paid-tile-size:\s*clamp\(82px,\s*13vw,\s*108px\);/);
assert.match(palette, /@media \(max-width:\s*620px\)[\s\S]*?--shop-paid-tile-size:\s*64px;/);
assert.doesNotMatch(palette, /\.shop-modal \.shop-items \.shop-item-copy/);
assert.match(palette, /@media \(max-height:\s*560px\) and \(orientation:\s*landscape\)/);
assert.match(palette, /@media \(max-height:\s*560px\)[\s\S]*?\.shop-modal \.shop-rewarded-section\s*\{[^}]*display:\s*grid;/, "Mobile landscape must keep the desktop Shop section hierarchy.");
assert.equal((visualQa.match(/class="shop-item(?: common-gear-shop-item)?(?: selected)?"/g) || []).length, 7, "The visual QA fixture must include all seven paid image tiles.");
assert.doesNotMatch(visualQa.match(/<div class="shop-items"[\s\S]*?<\/div>\s*<section class="shop-purchase-bar"/)?.[0] || "", /shop-item-copy|data-shop-card-price/, "The visual QA carousel contains duplicated card details.");

console.log("Validated raw-base scalable Shop pricing, equal square image tiles, horizontal scrolling, concise details, and anchored purchase controls.");
