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
const index = read("index.html");
const worker = read("service-worker.js");

assert.match(game, /const INVENTORY_SLOT_COUNT = 8;/, "The Bag page size must remain exactly eight cards.");
assert.match(game, /\["all", "All"\][\s\S]*\["boosts", "Boosts"\][\s\S]*\["war", "War"\][\s\S]*\["defense", "Defense"\][\s\S]*\["utility", "Utility"\]/, "The five requested Bag categories are incomplete or reordered.");
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
  getInventoryGroups: () => [
    { id: "shield", count: 3 },
    { id: "drums", count: 4 },
    { id: "horn", count: 5 },
  ],
};
vm.createContext(pageContext);
vm.runInContext(pageSource, pageContext);
const firstPage = pageContext.getInventoryPageModel("all", 0);
const secondPage = pageContext.getInventoryPageModel("all", 1);
assert.equal(firstPage.totalEntries, 12);
assert.equal(firstPage.pageCount, 2);
assert.equal(firstPage.entries.length, 8, "The first Bag page must expose exactly eight owned entries.");
assert.equal(secondPage.entries.length, 4, "The second Bag page must contain only the remaining owned entries.");
assert.equal(new Set([...firstPage.entries, ...secondPage.entries].map(entry => entry.entryKey)).size, 12, "Individual presentation copies need stable unique keys.");
assert.equal(pageContext.getInventoryPageModel("all", 99).page, 1, "Out-of-range pages must clamp safely.");
pageContext.getInventoryGroups = () => [{ id: "large", count: 1_000_000 }];
assert.equal(pageContext.getInventoryPageModel("all", 124_999).entries.length, 8, "Large authoritative counts must render only one eight-card slice.");

const cardSource = actions.slice(actions.indexOf("function renderInventorySlot"), actions.indexOf("function getInventoryEffectLabel"));
const cardContext = {
  escapeHtml: String,
  formatNumber: String,
  renderItemIcon: () => "<img>",
};
vm.createContext(cardContext);
vm.runInContext(cardSource, cardContext);
const card = cardContext.renderInventorySlot({ id: "shield", entryKey: "shield:copy-2", label: "Shield", icon: "shield.webp", ownedCount: 3, copyOrdinal: 2 }, "shield:copy-2");
assert.match(card, /data-inventory-item="shield"/);
assert.match(card, /data-inventory-copy-index="1"/);
assert.match(card, /type="button"/);
assert.match(card, /aria-pressed="true"/);
assert.doesNotMatch(card, /role="listitem"/, "Item cards must retain native button semantics for assistive technology.");
assert.doesNotMatch(card, /inventory-slot-count|x3/, "Individual item cards must not expose a visible stack count.");

assert.match(game, /role="tablist" aria-label="Item categories"/);
assert.match(game, /role="tab" aria-selected=/);
assert.match(game, /role="group" aria-label="Owned items"/, "The card grid needs an accessible group label without overriding button roles.");
assert.match(game, /target\?\.click\(\);\s*modalBody\.querySelector\([\s\S]{0,120}?\)\?\.focus\(\);/, "Arrow-key category changes must restore focus to the newly rendered tab.");
assert.match(actions, /setInventoryPage\(nextPage, restoreFocus = false\)[\s\S]{0,600}?inventory-carousel-viewport[\s\S]{0,80}?focus\(\)/, "Keyboard paging must restore focus after the page DOM is rebuilt.");
assert.match(game, /aria-label="Previous item page"[\s\S]*aria-label="Next item page"/);
assert.match(actions, /Math\.abs\(deltaX\) < 42[\s\S]*inventorySuppressSelectionUntilMs = Date\.now\(\) \+ 350/, "Swipe selection suppression is missing.");
assert.match(actions, /addEventListener\("wheel"[\s\S]*passive: false/, "Trackpad paging is missing.");
assert.match(game, /selectedInventoryCategory = category;\s*selectedInventoryPage = 0;[\s\S]*selectedInventoryEntryKey = "";/, "Category changes must reset page and hidden selection state.");
assert.match(game, /data-inventory-use="\$\{escapeHtml\(selectedEntry\.id\)\}"/, "The selected card must retain the canonical one-item use flow.");
assert.match(game, /const selectedEntryActionLabel = selectedEntryIsGearBox \? "OPEN" : "USE";/, "Bag actions must use the requested short OPEN or USE labels.");
assert.match(game, /modalTitle\.textContent = "ITEM BAG";/, "The Bag heading must use the requested ITEM BAG label.");
assert.match(game, /selectedEntryProjectedExpiresAtMs = selectedEntry \? getProjectedItemEffectExpiresAtMs\(selectedEntry\)[\s\S]{0,180}?selectedEntryActiveRemaining = Math\.max/, "The selected copy must show queued Shield, Veil, War Drums, and Tax timer projections immediately.");
assert.doesNotMatch(game.slice(game.indexOf("function showInventoryModal"), game.indexOf("function consumeInventoryItem")), /search|sort|filter dropdown/i, "The Bag must not add search or sorting controls.");

assert.match(actions, /slot\.dataset\.inventoryItem[\s\S]*slot\.dataset\.inventoryCopyIndex[\s\S]*const reserved = count <= copyIndex;/, "Optimistic inventory updates must understand individual presentation copies.");
assert.match(actions, /const reserved = count <= copyIndex;[\s\S]{0,160}?slot\.disabled = reserved;/, "A reserved individual card must disable immediately.");
assert.match(actions, /const queued = enqueueInstantEconomyAction\([\s\S]{0,260}?selectedInventoryEntryKey = "";[\s\S]{0,80}?showInventoryModal\(\);/, "Accepted item actions must remove the selected presentation copy while leaving other projected copies available.");
assert.doesNotMatch(actions.slice(actions.indexOf("function patchInventoryProjectedUi"), actions.indexOf("function patchCityUpgradeUi")), /getInstantPendingItemDelta\(itemId\) < 0/, "One pending activation must not disable every remaining card of the same item type.");
assert.match(actions, /async function refreshInstantEconomyAfterFailure[\s\S]{0,420}?revalidateInstantEconomyActions\(\);[\s\S]{0,180}?showInventoryModal\(\);/, "Rejected item actions must rebuild the Bag so the restored card and page totals return immediately.");
assert.match(game, /if \(selectedInventoryItemId === item\.id\) \{\s*selectedInventoryItemId = "";\s*selectedInventoryEntryKey = "";/, "Confirmed or local item use must clear the consumed presentation selection.");
assert.match(styles, /\.modal\.inventory-modal \.inventory-slots[\s\S]*grid-template-columns: repeat\(4,[\s\S]*grid-template-rows: repeat\(2,/, "The Bag must use a fixed 4 by 2 card grid.");
assert.match(styles, /background: linear-gradient\(180deg, #173f5e, #0b263d\) !important;/, "Bag cards must retain the Crownlands navy surface.");
assert.match(mobile, /max-height: 440px[\s\S]*\.modal\.inventory-modal[\s\S]*\.inventory-selection/, "Landscape Bag compaction is missing.");
assert.match(index, /crownlands-build" content="20260823-item-bag-shop-reconcile-r1"/);
for (const asset of ["styles.css", "mobile-viewport.css", "instant-economy-actions.js", "game.js"]) {
  assert(index.includes(`${asset}?v=20260823-item-bag-shop-reconcile-r1`), `${asset} has a stale page cache stamp.`);
  assert(worker.includes(`/${asset}?v=20260823-item-bag-shop-reconcile-r1`), `${asset} is missing from the refreshed offline shell.`);
}
assert(worker.includes('CACHE_VERSION = "20260823-item-bag-shop-reconcile-r1"'));

console.log("Validated the Crownlands Item Bag: categories, individual copies, bounded 4x2 paging, input guards, responsive layout, and cache delivery.");
