const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const game = read("game.js");
const actions = read("instant-economy-actions.js");
const styles = read("styles.css");
const mobile = read("mobile-viewport.css");
const profileTheme = read("profile-theme.css");
const index = read("index.html");
const worker = read("service-worker.js");

assert.match(game, /const INVENTORY_SLOT_COUNT = 8;/, "The Bag page size must remain exactly eight cards.");
assert.match(actions, /\["all", "All"\][\s\S]*\["boosts", "Boosts"\][\s\S]*\["war", "War"\][\s\S]*\["defense", "Defense"\][\s\S]*\["utility", "Utility"\]/, "The five requested Bag categories are incomplete or reordered.");
for (const [label, category] of [
  ["Common Gear Box", "utility"],
  ["Royal Peace Shield", "defense"],
  ["War Drums", "boosts"],
  ["Royal Tax Decree", "boosts"],
  ["Veil of Silence", "defense"],
  ["Swift March Order", "war"],
  ["Recall Horn", "war"],
]) {
  assert.match(game, new RegExp(`label: "${label}"[\\s\\S]{0,700}?bagCategory: "${category}"`), `${label} has the wrong Bag category.`);
}

const pageSource = actions.slice(actions.indexOf("function getInventoryPageModel"), actions.indexOf("function renderInventorySlot"));
const pageContext = {
  INVENTORY_SLOT_COUNT: 8,
  selectedInventoryCategory: "all",
  selectedInventoryPage: 0,
  selectedInventoryItemId: "",
  selectedInventoryEntryKey: "",
  COMMON_GEAR: null,
  COMMON_GEAR_BOX_ITEM: { id: "gear-box", bagCategory: "utility" },
  SHOP_ITEMS: [],
  getProjectedBagItemCount: () => 0,
  getInventoryGroups: () => Array.from({ length: 9 }, (_, index) => ({
    id: `item-${index + 1}`,
    count: [1, 5, 100, 2, 3, 4, 6, 7, 8][index],
  })),
};
vm.createContext(pageContext);
vm.runInContext(pageSource, pageContext);
const firstPage = pageContext.getInventoryPageModel("all", 0);
const secondPage = pageContext.getInventoryPageModel("all", 1);
assert.equal(firstPage.totalEntries, 9);
assert.equal(firstPage.pageCount, 2);
assert.equal(firstPage.entries.length, 8, "The first Bag page must expose exactly eight unique stacks.");
assert.equal(secondPage.entries.length, 1, "The second Bag page must contain only the ninth unique stack.");
assert.deepEqual(Array.from([...firstPage.entries, ...secondPage.entries], entry => entry.ownedCount), [1, 5, 100, 2, 3, 4, 6, 7, 8]);
assert.equal(new Set([...firstPage.entries, ...secondPage.entries].map(entry => entry.entryKey)).size, 9, "Each authoritative item ID needs exactly one stable stack key.");
assert.equal(pageContext.getInventoryPageModel("all", 99).page, 1, "Out-of-range pages must clamp safely.");
pageContext.getInventoryGroups = () => [{ id: "large", count: 1_000_000 }];
const largeStackPage = pageContext.getInventoryPageModel("all", 124_999);
assert.equal(largeStackPage.entries.length, 1, "A large authoritative quantity must consume one card.");
assert.equal(largeStackPage.entries[0].ownedCount, 1_000_000, "Large stack quantities must remain exact.");

pageContext.SHOP_ITEMS = [
  { id: "shield", bagCategory: "defense" },
  { id: "drums", bagCategory: "boosts" },
  { id: "horn", bagCategory: "war" },
];
pageContext.selectedInventoryCategory = "all";
pageContext.selectedInventoryPage = 0;
pageContext.selectedInventoryItemId = "shield";
pageContext.selectedInventoryEntryKey = "shield";
pageContext.getProjectedBagItemCount = id => id === "shield" ? 0 : 1;
pageContext.getInventoryGroups = () => [{ id: "drums", count: 1 }, { id: "horn", count: 1 }];
assert.equal(pageContext.reconcileInventorySelectionAfterCountChange("shield"), true);
assert.equal(pageContext.selectedInventoryItemId, "drums", "Removing the last copy must select the next canonical owned stack.");
pageContext.selectedInventoryItemId = "horn";
pageContext.selectedInventoryEntryKey = "horn";
pageContext.getProjectedBagItemCount = () => 0;
pageContext.getInventoryGroups = () => [{ id: "drums", count: 1 }];
assert.equal(pageContext.reconcileInventorySelectionAfterCountChange("horn"), true);
assert.equal(pageContext.selectedInventoryItemId, "drums", "When no next stack exists, removing the last copy must select the previous owned stack.");

const cardSource = actions.slice(actions.indexOf("function renderInventorySlot"), actions.indexOf("function getInventoryEffectLabel"));
const cardContext = {
  escapeHtml: String,
  formatNumber: value => Number(value).toLocaleString("en-US"),
  renderItemIcon: () => "<img>",
};
vm.createContext(cardContext);
vm.runInContext(cardSource, cardContext);
const card = cardContext.renderInventorySlot({ id: "shield", entryKey: "shield", label: "Shield", icon: "shield.webp", ownedCount: 3 }, "shield");
assert.match(card, /data-inventory-item="shield"/);
assert.match(card, /type="button"/);
assert.match(card, /aria-pressed="true"/);
assert.doesNotMatch(card, /role="listitem"/, "Item cards must retain native button semantics for assistive technology.");
assert.match(card, /inventory-slot-count[^>]*data-inventory-quantity[^>]*>x3</, "Every item card must expose its xN quantity badge.");
for (const quantity of [1, 9, 99, 999, 1_000_000]) {
  const quantityCard = cardContext.renderInventorySlot({ id: "shield", entryKey: "shield", label: "Shield", icon: "shield.webp", ownedCount: quantity }, "");
  assert.match(quantityCard, new RegExp(`>x${quantity.toLocaleString("en-US")}<`), `The quantity badge does not render x${quantity.toLocaleString("en-US")}.`);
}
assert.doesNotMatch(card, /data-inventory-copy-index/, "Stack cards must not retain per-copy presentation indexes.");

assert.match(game, /role="tablist" aria-label="Item categories"/);
assert.match(game, /role="tab" aria-selected=/);
assert.match(game, /role="group" aria-label="Owned items"/, "The card grid needs an accessible group label without overriding button roles.");
assert.match(actions, /target\?\.click\(\);\s*modalBody\.querySelector\([\s\S]{0,120}?\)\?\.focus\(\);/, "Arrow-key category changes must restore focus to the newly rendered tab.");
assert.match(actions, /setInventoryPage\(nextPage, restoreFocus = false\)[\s\S]{0,600}?inventory-carousel-viewport[\s\S]{0,80}?focus\(\)/, "Keyboard paging must restore focus after the page DOM is rebuilt.");
assert.match(game, /aria-label="Previous item page"[\s\S]*aria-label="Next item page"/);
assert.match(actions, /Math\.abs\(deltaX\) < 42[\s\S]*inventorySuppressSelectionUntilMs = Date\.now\(\) \+ 350/, "Swipe selection suppression is missing.");
assert.match(actions, /addEventListener\("wheel"[\s\S]*passive: false/, "Trackpad paging is missing.");
assert.match(actions, /selectedInventoryCategory = category;\s*selectedInventoryPage = 0;[\s\S]*selectedInventoryEntryKey = "";/, "Category changes must reset page and hidden selection state.");
assert.match(game, /data-inventory-use="\$\{escapeHtml\(selectedEntry\.id\)\}"/, "The selected card must retain the canonical one-item use flow.");
assert.match(game, /const selectedEntryActionLabel = selectedEntryIsGearBox \? "OPEN" : "USE";/, "Bag actions must use the requested short OPEN or USE labels.");
assert.match(game, /modalTitle\.textContent = "ITEM BAG";/, "The Bag heading must use the requested ITEM BAG label.");
assert.match(game, /selectedEntryProjectedExpiresAtMs = selectedEntry \? getProjectedItemEffectExpiresAtMs\(selectedEntry\)[\s\S]{0,180}?selectedEntryActiveRemaining = Math\.max/, "The selected stack must show queued Shield, Veil, War Drums, and Tax timer projections immediately.");
assert.doesNotMatch(game.slice(game.indexOf("function showInventoryModal"), game.indexOf("function consumeInventoryItem")), /search|sort|filter dropdown/i, "The Bag must not add search or sorting controls.");

assert.match(actions, /slot\.querySelector\("\[data-inventory-quantity\]"\)[\s\S]{0,80}?`x\$\{formatNumber\(count\)\}`/, "Optimistic inventory updates must patch the visible stack badge immediately.");
assert.match(actions, /slot\.disabled = count < 1;/, "A stack card must remain usable while projected copies remain.");
assert.match(actions, /const queued = enqueueInstantEconomyAction\([\s\S]{0,280}?reconcileInventorySelectionAfterCountChange\(item\.id\)[\s\S]{0,80}?patchInventoryProjectedUi\(\);/, "Accepted item actions must preserve the selected stack while projected copies remain.");
assert.doesNotMatch(actions.slice(actions.indexOf("function patchInventoryProjectedUi"), actions.indexOf("function patchCityUpgradeUi")), /slot\.disabled = pending/, "A pending activation must not disable a stack with projected copies remaining.");
assert.match(actions, /async function refreshInstantEconomyAfterFailure[\s\S]{0,420}?revalidateInstantEconomyActions\(\);[\s\S]{0,180}?showInventoryModal\(\);/, "Rejected item actions must rebuild the Bag so the restored card and page totals return immediately.");
assert.match(game, /reconcileInventorySelectionAfterCountChange\(item\.id\);/, "Confirmed or local item use must retain the stack selection or choose an adjacent stack at zero.");
assert.match(styles, /\.modal\.inventory-modal \.inventory-slots[\s\S]*grid-template-columns: repeat\(4,[\s\S]*grid-template-rows: repeat\(2,/, "The Bag must use a fixed 4 by 2 card grid.");
const bagTheme = styles.slice(styles.indexOf("/* Item Bag:"), styles.indexOf(".city-list-modal.modal"));
assert.match(bagTheme, /\.inventory-carousel-viewport[\s\S]*background: var\(--cl-inset-bg\);/, "The Bag item area must use the Shop parchment inset surface.");
assert.match(bagTheme, /\.inventory-slot \{[\s\S]*color: var\(--cl-text\) !important;[\s\S]*background: linear-gradient\(180deg, var\(--cl-panel-raised\), var\(--cl-panel-inset\)\) !important;[\s\S]*border: 1px solid var\(--cl-brass\) !important;/, "Bag cards must use the Shop parchment, brown-text, and brass treatment.");
assert.match(bagTheme, /\.inventory-slot\.selected \{[\s\S]*border-color: var\(--cl-gold-highlight\) !important;[\s\S]*background: linear-gradient\(180deg, #f2e2bf, var\(--cl-panel-inset\)\) !important;[\s\S]*rgba\(114,54,58,\.78\)/, "Selected Bag cards must retain the Shop-style burgundy and restrained-gold accent.");
assert.match(bagTheme, /\.inventory-page-arrow \{[\s\S]*color: var\(--cl-text\) !important;[\s\S]*background: linear-gradient\(180deg, var\(--cl-panel-raised\), var\(--cl-panel-inset\)\) !important;/, "Bag arrows must use the Shop parchment button language.");
assert.match(bagTheme, /\.inventory-slot-count \{[\s\S]*position: absolute;[\s\S]*color: #f2e2bf !important;[\s\S]*#74383d[\s\S]*#54272d[\s\S]*white-space: nowrap;/, "The xN badge must use the approved burgundy and warm-ivory Crownlands treatment without shifting cards.");
assert.doesNotMatch(bagTheme, /#173f5e|#0b263d|#1c4a6c|#285c79|#11324e/, "The approved Bag must not regress to navy fantasy surfaces.");
assert.match(profileTheme, /:not\(\[aria-pressed="true"\]\):not\(\.inventory-slot,\.inventory-page-arrow\)/, "The legacy Profile button layer must not repaint Bag cards or arrows navy.");
assert.match(mobile, /max-height: 440px[\s\S]*\.modal\.inventory-modal[\s\S]*\.inventory-selection/, "Landscape Bag compaction is missing.");
assert.match(index, /crownlands-build" content="20260827-skill-controls-live-refunds-r1"/);
for (const asset of ["styles.css", "instant-economy-actions.js"]) {
  assert(index.includes(`${asset}?v=20260827-skill-controls-live-refunds-r1`), `${asset} has a stale page cache stamp.`);
  assert(worker.includes(`/${asset}?v=20260827-skill-controls-live-refunds-r1`), `${asset} is missing from the refreshed offline shell.`);
}
assert(index.includes("mobile-viewport.css?v=20260825-shop-hourly-prices-r1"), "mobile-viewport.css has a stale cache stamp.");
assert(worker.includes("/mobile-viewport.css?v=20260825-shop-hourly-prices-r1"), "mobile-viewport.css is missing from the refreshed offline shell.");
assert(index.includes("game.js?v=20260827-skill-controls-live-refunds-r1"), "game.js has a stale City List cache stamp.");
assert(worker.includes("/game.js?v=20260827-skill-controls-live-refunds-r1"), "game.js is missing from the refreshed offline shell.");
assert(worker.includes('CACHE_VERSION = "20260827-skill-controls-live-refunds-r1"'));

console.log("Validated the Crownlands Item Bag: authoritative item-ID stacks, xN badges, unique 4x2 paging, zero-count selection, responsive layout, and cache delivery.");
