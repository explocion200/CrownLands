const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const gear = require(path.join(root, "common-gear.js"));
const serverGear = require(path.join(root, "functions", "common-gear.js"));

function pngMetadata(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${relativePath} must be a PNG.`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

assert.equal(gear.DEFINITIONS.length, 32, "Common Gear must define four complete eight-slot sets.");
assert.deepEqual(gear.SLOTS, ["head", "chest", "pants", "boots", "gloves", "belt", "weapon", "necklace"]);
assert.equal(new Set(gear.DEFINITIONS.map(item => item.gearKey)).size, 32, "Gear keys must be unique.");
assert.equal(new Set(gear.DEFINITIONS.map(item => item.art)).size, 32, "Every gear item must have unique artwork.");
gear.DEFINITIONS.forEach(definition => {
  assert.match(definition.art, new RegExp(`^assets/optimized/gear-${definition.buildingId}-${definition.slot}-`), `Incorrect art mapping for ${definition.gearKey}.`);
  const sourcePath = path.join(root, "assets", "gear", definition.buildingId, `${definition.slot}.png`);
  assert(fs.existsSync(sourcePath), `Missing source artwork for ${definition.gearKey}.`);
  const metadata = pngMetadata(path.relative(root, sourcePath));
  assert.equal(metadata.width, 1254, `${sourcePath} must use the canonical Common Gear source width.`);
  assert.equal(metadata.height, 1254, `${sourcePath} must use the canonical Common Gear source height.`);
  assert([4, 6].includes(metadata.colorType), `${sourcePath} must retain transparency.`);
});
const officerSources = {
  barracks: "assets/gear/war-captain.png",
  treasury: "assets/gear/master-of-coin.png",
  "royal-stables": "assets/gear/cavalry-master.png",
  gatehouse: "assets/gear/defensive-commander.png",
};
Object.entries(officerSources).forEach(([buildingId, source]) => {
  const metadata = pngMetadata(source);
  assert.equal(metadata.width, 1086, `${source} must use the canonical officer portrait width.`);
  assert.equal(metadata.height, 1448, `${source} must use the canonical officer portrait height.`);
  assert.equal(metadata.colorType, 2, `${source} must remain an opaque RGB portrait.`);
  assert.equal(gear.BUILDINGS[buildingId].gender, "male", `${buildingId} officer must remain explicitly male.`);
});
assert.equal(gear.getDefinition("treasury_weapon_common_01").isToolInsteadOfWeapon, true, "Treasury weapon slot must remain an administrative tool.");
assert.match(gear.getDefinition("treasury_weapon_common_01").gearName, /Ledger/, "Treasury tool must remain visibly identified as a ledger.");
assert.equal(gear.BOX_REVEAL_COUNT, 3);
assert.equal(gear.SHOP_DAILY_LIMIT, 1);
assert.equal(gear.SHOP_PRICE_HOURS, 1, "The Common Gear Box must cost one raw Gold-production hour.");
assert.equal(serverGear.SHOP_PRICE_HOURS, gear.SHOP_PRICE_HOURS, "Client and server Gear Box hour costs must stay synchronized.");
assert.equal(gear.RELIC_BONUS_CHANCE_PERCENT, 1);
assert.equal(gear.CASUALTY_RECOVERY_CAP_PERCENT, 75);
assert.deepEqual(gear.BONUS_BY_LEVEL, { 1: .25, 2: .5, 3: .8, 4: 1.15, 5: 1.5 });
assert.deepEqual(gear.UPGRADE_BY_LEVEL, {
  1: { duplicates: 1, baseGoldHours: .5 },
  2: { duplicates: 1, baseGoldHours: 1 },
  3: { duplicates: 1, baseGoldHours: 2 },
  4: { duplicates: 1, baseGoldHours: 4 },
});
assert.deepEqual(serverGear.UPGRADE_BY_LEVEL, gear.UPGRADE_BY_LEVEL, "Client and server upgrade requirements must stay synchronized.");
assert.equal(typeof gear.getUpgradeMaterialInstances, "function", "Client Common Gear must expose the shared upgrade-material rule.");
assert.equal(typeof serverGear.getUpgradeMaterialInstances, "function", "Server Common Gear must expose the shared upgrade-material rule.");

const sample = gear.createDefaultState();
const attackDefinition = gear.DEFINITIONS.find(item => item.statType === "attackStrength");
sample.instances.attack = gear.normalizeInstance({ instanceId: "attack", gearKey: attackDefinition.gearKey, level: 5 });
sample.equipped[attackDefinition.buildingId][attackDefinition.slot] = "attack";
assert.equal(gear.getBonuses(sample).attackStrength, 1.5, "Only equipped gear may contribute bonuses.");
sample.equipped[attackDefinition.buildingId][attackDefinition.slot] = "";
assert.equal(gear.getBonuses(sample).attackStrength, 0);

const index = read("functions/index.js");
for (const callable of ["getCommonGearStatus", "purchaseCommonGearBox", "openCommonGearBox", "viewCommonGearBuilding", "equipCommonGear", "unequipCommonGear", "upgradeCommonGear"]) {
  assert.match(index, new RegExp(`exports\\.${callable}\\s*=`), `Missing ${callable} callable.`);
}
assert.match(index, /crypto\.randomInt\(0, COMMON_GEAR\.DEFINITIONS\.length\)/, "Box rolls must use server cryptographic randomness.");
assert.match(
  index,
  /COMMON_GEAR\.getUpgradeMaterialInstances\(instance, gear\.instances\)/,
  "The authoritative upgrade must use the shared same-level material rule."
);
const sharedMaterialRule = gear.getUpgradeMaterialInstances.toString();
assert.match(sharedMaterialRule, /candidate\.instanceId !== target\.instanceId[\s\S]{0,180}candidate\.gearKey === target\.gearKey[\s\S]{0,120}candidate\.level === target\.level[\s\S]{0,120}!candidate\.isEquipped/, "The shared rule must require a different, stored, same-key, same-level material.");
assert.doesNotMatch(index, /candidate\.level === 1/, "The server must not accept Level 1 materials for every upgrade level.");
assert.match(index, /relicRewardItem[\s\S]{0,180}crypto\.randomInt\(1, 101\)/, "Relic Camp bonus must roll only with a rewarded item payout.");
assert.match(index, /claimedPosition\.day % 7 === 0 \? 1 : 0/, "Weekly daily-login milestones must award a Common Gear Box.");
assert.match(index, /currentState\.completedCount[\s\S]{0,1500}gear\.commonGearBoxes \+= 1/, "Completing all three daily missions must award a box once.");
assert.match(index, /getCasualtyRecoveryPercent[\s\S]{0,500}CASUALTY_RECOVERY_CAP_PERCENT/, "Field Medic plus gear recovery must be capped.");
assert.match(
  index,
  /function createCommonGearClientStatus[\s\S]{0,900}price: getCommonGearBoxPriceForEconomy\(economy\)/,
  "The authoritative Common Gear shop status must use the scalable shared price."
);
assert.match(index, /function getCommonGearBoxPriceForEconomy[\s\S]{0,400}COMMON_GEAR_BOX_ITEM_ID[\s\S]{0,200}rawBaseGoldPerHour[\s\S]{0,120}cityCount/, "Gear Box pricing must use raw production and kingdom size.");
assert.match(index, /purchaseCommonGearBox[\s\S]{0,900}data\.cost[\s\S]{0,300}status\.shop\.price[\s\S]{0,220}Gear Box price changed/, "The Gear Box purchase must reject a stale client quote.");

const rules = read("firestore.rules");
assert.match(rules, /'shopItems',\s*'gear',/, "Client profile creation must not seed authoritative gear.");
const client = read("firebaseClient.js");
assert.match(client, /delete cleanProfile\.gear;/, "Normal profile saves must strip authoritative gear.");
const clientIndex = read("index.html");
assert.match(clientIndex, /common-gear-ui\.css\?v=20260817-inner-castle-labels-r1/, "The equipment stylesheet must load in the game shell.");
assert.match(clientIndex, /common-gear-ui\.js\?v=20260825-shop-hourly-prices-r1[\s\S]*game\.js\?v=20260825-shop-hourly-prices-r1/, "The equipment runtime must load before game.js.");
const gearUi = read("common-gear-ui.js");
const game = `${read("game.js")}\n${gearUi}`;
assert.match(game, /Common Gear Box/);
assert.match(game, /common-gear-building-shell/);
assert.match(game, /data-gear-merge/);
assert.match(game, /data-manage-common-gear/);
assert.match(game, /function createCommonGearViewModel/, "The officer equipment renderer must consume a display view model.");
assert.match(game, /function createCommonGearBagGroups/, "The officer bag must use an explicit stack grouping helper.");
assert.match(
  game,
  /const key = `\$\{instance\.gearKey\}:\$\{instance\.level\}:\$\{displayBucket\}`/,
  "Equipment bag stacks must be separated by gear key, exact level, and equipped display state."
);
assert.match(game, /getCommonGearInstances\(buildingId\)/, "The right bag must load every slot for only the active officer.");
assert.match(game, /data-gear-bag-scroll/, "The redesigned officer bag must own vertical scrolling.");
assert.match(game, /commonGearBagScrollTop/, "Officer bag scroll position must survive rerenders.");
assert.match(game, /common-gear-bottom-info/, "Selected equipment metadata must render in the bottom strip.");
assert.match(game, /common-gear-confirm-backdrop/, "Upgrade must have an in-game confirmation step.");
assert.match(game, /upgradeCommonGear\(\{ instanceId \}\)/, "Upgrade must continue through the existing authoritative upgrade callable.");
assert.match(gearUi, />\$\{requirement \? "Upgrade" : "Max Level"\}<\//, "The player-facing equipment action must say Upgrade.");
assert.match(gearUi, />Upgrade requirements<|<span>Upgrade requirements<\/span>/, "The equipment requirement label must say Upgrade requirements.");
assert.match(gearUi, /Confirm Upgrade/, "The upgrade confirmation action must use Upgrade wording.");
assert.match(gearUi, /Requires \$\{requirement\.duplicates\} matching Level \$\{selected\.level\}/, "Selected gear requirements must name the matching current-level copy.");
assert.match(gearUi, /This consumes \$\{requirement\.duplicates\} unequipped matching Level \$\{selected\.level\}/, "Upgrade confirmation must identify the stored same-level material.");
assert.match(gearUi, /Next \+\$\{viewModel\.nextBonus\.toFixed\(2\)\}% · Requires \$\{viewModel\.requirement\.duplicates\} matching Level \$\{selected\.level\}/, "Bottom metadata must show the same-level upgrade material.");
assert.match(gearUi, /No matching material\. Requires \$\{requirement\.duplicates\} matching Level \$\{instance\.level\}/, "A missing material must have a player-readable reason.");
assert.match(gearUi, /Insufficient gold\. Requires \$\{formatNumber\(upgradeGold\)\} gold/, "Missing gold must be identified separately from missing material.");
assert.match(gearUi, /reason: "Max level\."/, "Maximum-level gear must expose a concise disabled reason.");
assert.doesNotMatch(gearUi, /Level 1 duplicate|Level 1 duplicates/, "Old always-Level-1 material wording must not remain in the equipment UI.");
assert.doesNotMatch(gearUi, />Merge(?:\s|<)|Merge cost|Confirm Merge|Select an item to merge|merged to Level|merge equipment|gear merge/, "Player-facing Merge wording must not remain in the equipment UI.");
assert.match(gearUi, /role="listbox"[\s\S]{0,240}data-gear-bag-filter-option/, "The equipment filter must use the custom accessible listbox.");
assert.doesNotMatch(gearUi, /<select[^>]*data-gear-bag-filter/, "The equipment filter must not invoke a mobile native select picker.");
assert.match(gearUi, /getCommonGearBagFilterOptions[\s\S]{0,260}"all"[\s\S]{0,260}COMMON_GEAR\.SLOTS/, "The custom filter must retain All Slots and every equipment slot.");
assert.match(gearUi, /data-gear-bag-filter-option[\s\S]{0,900}selectedCommonGearBagFilter[\s\S]{0,220}renderCommonGearBuilding/, "Selecting a custom filter option must rerender the filtered bag.");
assert.match(gearUi, /event\.key === "ArrowDown"[\s\S]{0,1000}event\.key === "Escape"/, "The custom equipment filter must retain desktop keyboard behavior.");
assert.match(game, /viewCommonGearBuilding[\s\S]{0,500}renderCommonGearBuilding\(buildingId\)/, "A fresh building response must rerender the officer equipment screen.");
assert.doesNotMatch(game, /data-gear-mobile-view|selectedCommonGearMobileView|common-gear-mobile-tabs/, "Equipment must keep the desktop three-panel structure instead of using mobile section tabs.");

const groupingStart = game.indexOf("function createCommonGearBagGroups");
const groupingEnd = game.indexOf("function createCommonGearViewModel", groupingStart);
assert(groupingStart >= 0 && groupingEnd > groupingStart, "Could not isolate the bag grouping helper.");
const groupingContext = { COMMON_GEAR: gear };
vm.runInNewContext(`${game.slice(groupingStart, groupingEnd)}\nthis.groupGear = createCommonGearBagGroups;`, groupingContext);
const groupingDefinition = gear.DEFINITIONS[0];
const groupedInstances = [
  { instanceId: "l1_a", gearKey: groupingDefinition.gearKey, buildingId: groupingDefinition.buildingId, slot: groupingDefinition.slot, level: 1, isEquipped: false, isNew: false, acquiredAtMs: 1 },
  { instanceId: "l1_b", gearKey: groupingDefinition.gearKey, buildingId: groupingDefinition.buildingId, slot: groupingDefinition.slot, level: 1, isEquipped: false, isNew: true, acquiredAtMs: 2 },
  { instanceId: "l2_bag", gearKey: groupingDefinition.gearKey, buildingId: groupingDefinition.buildingId, slot: groupingDefinition.slot, level: 2, isEquipped: false, isNew: false, acquiredAtMs: 3 },
  { instanceId: "l2_equipped", gearKey: groupingDefinition.gearKey, buildingId: groupingDefinition.buildingId, slot: groupingDefinition.slot, level: 2, isEquipped: true, isNew: false, acquiredAtMs: 4 },
];
const bagGroups = groupingContext.groupGear(groupedInstances, groupingDefinition.slot, "l1_b");
assert.equal(bagGroups.length, 3, "Different levels or equipped display buckets were merged into one bag stack.");
const levelOneStack = bagGroups.find(group => group.level === 1);
assert.equal(levelOneStack.count, 2, "Same-key same-level stored duplicates did not stack.");
assert.equal(levelOneStack.representativeInstanceId, "l1_b", "A selected stacked instance must remain the real representative.");
assert(levelOneStack.instanceIds.every(id => id.startsWith("l1_")), "A bag stack contains an instance from a different level.");
assert.equal(bagGroups.filter(group => group.level === 2).length, 2, "Equipped and stored Level 2 pieces must remain visibly distinct.");

const stableOrderDefinitions = gear.DEFINITIONS.filter(definition => definition.buildingId === groupingDefinition.buildingId).slice(0, 3);
const stableOrderInstances = stableOrderDefinitions.map((definition, index) => ({
  instanceId: `stable_${index}`,
  gearKey: definition.gearKey,
  buildingId: definition.buildingId,
  slot: definition.slot,
  level: 1,
  isEquipped: false,
  isNew: false,
  acquiredAtMs: index + 10,
}));
const stableOrderBefore = groupingContext.groupGear(stableOrderInstances, stableOrderDefinitions[0].slot, stableOrderInstances[0].instanceId).map(group => group.key).join("|");
const stableOrderAfter = groupingContext.groupGear(stableOrderInstances, stableOrderDefinitions[2].slot, stableOrderInstances[2].instanceId).map(group => group.key).join("|");
assert.equal(stableOrderAfter, stableOrderBefore, "Selecting a bag item or changing compatibility must not reorder equipment tiles.");
assert.match(game, /const preservedBagScrollTop = bagScroll\?\.scrollTop \?\? commonGearBagScrollTop;[\s\S]{0,180}bagScroll\.scrollTop = preservedBagScrollTop;/, "Bag selection focus must restore the exact prior scroll position.");

const previewStart = game.indexOf("function getCommonGearUpgradePreview");
const previewEnd = game.indexOf("function createCommonGearViewModel", previewStart);
assert(previewStart >= 0 && previewEnd > previewStart, "Could not isolate the upgrade-ready preview helper.");
const previewTarget = { ...groupedInstances[0], instanceId: "preview_target", isEquipped: true };
const previewDuplicate = { ...groupedInstances[1], instanceId: "preview_duplicate", isEquipped: false };
const previewContext = {
  COMMON_GEAR: gear,
  formatNumber: value => String(value),
  state: {
    gold: 1000,
    globalStats: { baseGoldPerHour: 100 },
    gear: { instances: { previewTarget, previewDuplicate } },
  },
};
vm.runInNewContext(`${game.slice(previewStart, previewEnd)}\nthis.previewUpgrade = getCommonGearUpgradePreview;`, previewContext);
for (let level = 1; level < gear.MAX_LEVEL; level += 1) {
  const target = { ...previewTarget, level, instanceId: `preview_target_${level}`, isEquipped: level % 2 === 1 };
  const matching = { ...previewDuplicate, level, instanceId: `preview_matching_${level}`, isEquipped: false };
  const wrongLevel = { ...previewDuplicate, level: level === 1 ? 2 : 1, instanceId: `preview_wrong_level_${level}`, isEquipped: false };
  assert.equal(
    previewContext.previewUpgrade(target, [target, matching]).canUpgrade,
    true,
    `A Level ${level} target with another stored matching Level ${level} copy must be upgrade-ready.`
  );
  assert.equal(
    previewContext.previewUpgrade(target, [target, wrongLevel]).canUpgrade,
    false,
    `A Level ${level} target must ignore a different-level material.`
  );
}
assert.equal(previewContext.previewUpgrade(previewTarget, [previewTarget, previewDuplicate]).canUpgrade, true, "An item with its required matching copy and gold must be upgrade-ready.");
const missingMaterialPreview = previewContext.previewUpgrade(previewTarget, [previewTarget]);
assert.equal(missingMaterialPreview.canUpgrade, false, "An item without its required duplicate must not be upgrade-ready.");
assert.equal(missingMaterialPreview.hasMatchingMaterial, false);
assert.match(missingMaterialPreview.reason, /^No matching material\. Requires 1 matching Level 1 copy; 0 available\.$/);
const equippedMaterial = { ...previewDuplicate, isEquipped: true };
const equippedMaterialPreview = previewContext.previewUpgrade(previewTarget, [previewTarget, equippedMaterial]);
assert.equal(equippedMaterialPreview.canUpgrade, false, "An equipped item must not be consumed as upgrade material.");
assert.equal(equippedMaterialPreview.hasMatchingMaterial, false);
const storedTargetWithEquippedTwin = { ...previewTarget, isEquipped: false };
assert.match(
  previewContext.previewUpgrade(storedTargetWithEquippedTwin, [storedTargetWithEquippedTwin, equippedMaterial]).reason,
  /Select the equipped Level 1 copy as the upgrade target; equipped gear cannot be used as material\./,
  "A stored selection must explain how to upgrade when its only matching twin is equipped."
);
const otherDefinition = gear.DEFINITIONS.find(definition => definition.gearKey !== previewTarget.gearKey);
const wrongGear = { ...previewDuplicate, gearKey: otherDefinition.gearKey, buildingId: otherDefinition.buildingId, slot: otherDefinition.slot };
assert.equal(previewContext.previewUpgrade(previewTarget, [previewTarget, wrongGear]).canUpgrade, false, "Different gear must not count as upgrade material.");
const maxTarget = { ...previewTarget, level: gear.MAX_LEVEL };
assert.equal(previewContext.previewUpgrade(maxTarget, [maxTarget, { ...previewDuplicate, level: gear.MAX_LEVEL }]).canUpgrade, false, "Level 5 gear must never be upgrade-ready.");
previewContext.state.gold = 49;
const insufficientGoldPreview = previewContext.previewUpgrade(previewTarget, [previewTarget, previewDuplicate]);
assert.equal(insufficientGoldPreview.canUpgrade, false, "An item without enough gold must not be upgrade-ready.");
assert.equal(insufficientGoldPreview.hasMatchingMaterial, true, "Insufficient gold must not hide a valid same-level material.");
assert.equal(insufficientGoldPreview.hasEnoughGold, false);
assert.match(insufficientGoldPreview.reason, /^Insufficient gold\. Requires 50 gold; 49 available\.$/);
assert.match(gearUi, /group\.isUpgradeReady = !group\.isEquipped[\s\S]{0,160}getCommonGearUpgradePreview\(group\.representative, instances\)\.hasMatchingMaterial/, "Stored material-ready groups must receive alerts even when gold is missing.");
assert.match(gearUi, /isUpgradeReady: Boolean\(equipped && getCommonGearUpgradePreview\(equipped, instances\)\.hasMatchingMaterial\)/, "Equipped gear with a valid stored material must flag its loadout slot.");
assert.match(gearUi, /group\.isUpgradeReady && !group\.isEquipped \? `<span class="common-gear-upgrade-ready common-gear-bag-upgrade-ready"/, "Equipped bag copies must not render the upgrade alert.");
assert.match(gearUi, /isUpgradeReady \? `<span class="common-gear-upgrade-ready common-gear-slot-upgrade-ready"/, "Upgradeable equipped items must render the alert on their equipment slot.");

assert.match(game, /equippedDefinition\.art/, "Equipped slots must render item artwork.");
assert.match(game, /class="common-gear-detail-art"[\s\S]{0,100}definition\.art/, "Selected gear and its upgrade view must render item artwork.");
assert.match(game, /function renderCommonGearBagTile[\s\S]{0,1800}def\.art/, "Building inventory cards must render item artwork.");
assert.match(game, /class="common-gear-reveal-card"[\s\S]{0,140}definition\.art/, "Box reveals must render item artwork.");
assert.match(game, /onerror="this\.hidden=true"/, "Gear art must fail gracefully without obscuring labels.");
assert.match(
  game,
  /function getCommonGearBoxShopPrice\(\)[\s\S]{0,360}getShopPricingContext\(\)[\s\S]{0,220}calculateScalableShopPrice\(/,
  "The Shop must display the same scalable Common Gear Box price used by the server."
);
assert.match(gearUi, /purchaseCommonGearBox\(\{ cost: quotedPrice \}\)/, "The Gear Box purchase must submit the displayed price for server validation.");
const profilePatchSection = game.slice(
  game.indexOf("function applyServerProfilePatch"),
  game.indexOf("function applyServerCityUpdateToOwnedCache")
);
assert.match(profilePatchSection, /patch\.gear[\s\S]{0,120}normalizeCommonGearState/, "Server gear settlement must update client state.");
const economyResultSection = game.slice(
  game.indexOf("function applyServerEconomyResult"),
  game.indexOf("function mergeServerEconomyRefreshOptions")
);
assert.doesNotMatch(economyResultSection, /patch\.gear/, "Economy settlement must not reference an out-of-scope profile patch.");
const css = `${read("styles.css")}\n${read("interface-theme.css")}\n${read("common-gear-ui.css")}\n${read("crownlands-palette.css")}`;
assert.match(
  css,
  /\.common-gear-box-modal\.modal,[\s\S]{0,120}\.common-gear-building-modal\.modal[\s\S]{0,180}width: min\(96vw, 980px\);[\s\S]{0,120}max-height: none;/,
  "Common Gear dialogs must own their full responsive width instead of overflowing the base modal."
);
assert.match(
  css,
  /\.common-gear-box-modal \.modal-card,[\s\S]{0,120}\.common-gear-building-modal \.modal-card[\s\S]{0,180}width: 100%;[\s\S]{0,180}100dvh/,
  "Common Gear cards must fit their dialog and the dynamic viewport."
);
assert.match(
  css,
  /\.common-gear-building-modal #modalBody[\s\S]{0,120}height: auto;[\s\S]{0,80}overflow: hidden;/,
  "The Common Gear body must use the modal grid row instead of subtracting a fixed title height."
);
assert.match(
  css,
  /@media \(max-height: 560px\) and \(orientation: landscape\)[\s\S]{0,1800}\.common-gear-screen\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\) 58px;/,
  "Short landscape screens need a compact non-overlapping officer equipment layout."
);
assert.match(css, /@media \(max-height: 560px\) and \(orientation: landscape\)[\s\S]{0,3000}\.common-gear-slot\s*\{[^}]*min-height: 0;/, "Short landscape loadouts must fit all four slot rows.");
assert.match(css, /\.common-gear-main\s*\{[^}]*grid-template-columns:[^}]*1\.12fr[^}]*\.72fr[^}]*1\.05fr/, "Wide equipment screens must keep loadout, detail, and bag columns.");
assert.match(css, /\.common-gear-bag-scroll\s*\{[^}]*overflow-y: auto;/, "The officer equipment bag must scroll vertically.");
assert.match(css, /\.common-gear-bag-grid\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, "The officer bag must render as a tile grid.");
assert.match(css, /@media \(max-width: 980px\)[\s\S]{0,1800}\.common-gear-main\s*\{[^}]*display: grid;[^}]*grid-template-columns:[^}]*1\.12fr[^}]*\.76fr[^}]*1\.08fr/, "Narrow equipment screens must retain the loadout, detail, and bag columns.");
assert.doesNotMatch(css, /common-gear-mobile-tabs|data-gear-mobile-view/, "The equipment stylesheet must not restore the retired mobile tab layout.");
assert.match(
  css,
  /\.common-gear-bag-tile\.rarity-common\s*\{[^}]*--gear-rarity-edge: #98948b;[^}]*--gear-rarity-surface:[^}]*#42413e[^}]*#252522[^}]*#171816/,
  "Common bag tiles must use the neutral gray rarity surface."
);
assert.doesNotMatch(css, /\.common-gear-bag-tile\.rarity-common\s*\{[^}]*#283039|\.common-gear-bag-tile\.rarity-common\s*\{[^}]*#111619/, "Common bag tiles must not use the former blue default surface.");
assert.match(css, /\.common-gear-selected-panel \.common-gear-rarity\.rarity-common\s*\{[^}]*color: #56524b;[^}]*background:/, "Selected Common gear must use neutral rarity styling.");
const selectedTileRule = css.match(/\.common-gear-bag-tile\.selected\s*\{([^}]*)\}/)?.[1] || "";
assert.match(selectedTileRule, /outline: 2px solid #7b4c20;/, "The selected bag item needs a clear brass selection ring.");
assert.match(selectedTileRule, /0 0 18px rgba\(244,195,87,\.88\)/, "The selected bag item needs a visible gold selection glow.");
assert.doesNotMatch(selectedTileRule, /transform|width|height|margin|padding/, "Selecting a bag tile must not resize or shift it.");
assert.match(
  css,
  /#modal\.common-gear-building-modal \.common-gear-screen \.common-gear-bag-panel \.common-gear-bag-tile\[data-gear-stack-key\]\s*\{[^}]*background: var\(--gear-rarity-surface\) !important;/,
  "Equipment bag rarity surfaces must outrank the shared palette cascade."
);
assert.match(
  css,
  /#modal\.common-gear-building-modal \.common-gear-screen \.common-gear-bag-panel \.common-gear-bag-tile \.common-gear-bag-slot,[\s\S]{0,500}\.common-gear-bag-name\s*\{ color: #efe3c4 !important; \}/,
  "Dark equipment tiles must keep their labels readable after shared theme styles load."
);
assert.match(
  css,
  /#modal\.common-gear-building-modal \.common-gear-screen \.common-gear-selected-panel \.common-gear-actions button\s*\{[^}]*color: #f3dfac !important;[^}]*background: linear-gradient\(180deg, #87363b, #592328\) !important;/,
  "Primary equipment actions must retain their readable dark-panel treatment."
);
assert.match(css, /\.common-gear-bag-panel\s*\{[^}]*color: #eadcb9;[^}]*background: #191610;/, "Dark equipment bag chrome must use light parchment text.");
assert.match(css, /\.common-gear-bag-panel > footer span\s*\{[^}]*color: #ead8ae;/, "The bag summary must stay readable on its dark footer.");
assert.match(css, /\.common-gear-back span\s*\{[^}]*color: inherit;/, "The Back button icon must inherit the button's light text color.");
assert.match(css, /\.common-gear-actions button:disabled\s*\{[^}]*color: #ded1b3;[^}]*opacity: 1;/, "Disabled dark action buttons must retain readable light text.");
assert.match(css, /\.common-gear-bag-name\s*\{[^}]*color: #efe3c4;[^}]*opacity: 1;/, "Bag item names must remain readable on neutral dark tiles.");
assert.match(
  css,
  /#modal\.common-gear-building-modal \.common-gear-screen \.common-gear-loadout-panel \.common-gear-slot\.selected\s*\{[^}]*color: #fff0c6 !important;[^}]*background: linear-gradient\(180deg, #7b3439, #4d2024\) !important;/,
  "Selected equipment slots must use high-contrast light text on the dark burgundy selection surface."
);
assert.match(
  css,
  /\.common-gear-slot\.selected \.common-gear-slot-copy b,[\s\S]{0,180}\.common-gear-slot\.selected \.common-gear-slot-copy small\s*\{[^}]*color: #fff0c6 !important;/,
  "Selected slot labels and levels must remain readable."
);
assert.match(css, /\.common-gear-upgrade-ready\s*\{[^}]*position: absolute;[^}]*border: 1px solid #efc86c;[^}]*background: radial-gradient/, "Upgrade-ready alerts must use the fixed medieval badge without affecting tile layout.");
assert.match(css, /\.common-gear-bag-upgrade-ready\s*\{[^}]*top: 5px;[^}]*right: 5px;/, "Unequipped upgrade alerts must occupy the equipped-badge position.");
assert.match(css, /\.common-gear-bag-filter-menu\s*\{[^}]*position: absolute;[^}]*right: 0;[^}]*max-height: clamp\(154px, 46dvh, 310px\);[^}]*overflow-y: auto;/, "The custom equipment filter must align to the bag and remain scrollable on mobile landscape.");
assert.match(css, /\.common-gear-bag-filter-menu\[hidden\]\s*\{ display: none; \}/, "The custom equipment filter must close without exposing its options.");
assert.match(css, /@media \(max-width: 760px\) and \(orientation: landscape\)[\s\S]{0,800}\.common-gear-bag-filter\s*\{ width: 78px; \}/, "Small landscape equipment filters must stay aligned inside the bag header.");
assert.match(css, /\[data-gear-officer="treasury"\]\s*\{ --gear-officer-position: 40% 28%; \}/, "The Master of Coin portrait must use its corrected focal alignment.");
assert.match(css, /\[data-gear-officer="gatehouse"\]\s*\{ --gear-officer-position: 44% 28%; \}/, "The Defensive Commander portrait must use its corrected focal alignment.");
assert.match(css, /@media \(max-width: 980px\)[\s\S]{0,1800}\.common-gear-character-panel > img\s*\{[^}]*object-fit: cover;[^}]*object-position: var\(--gear-officer-position, center 28%\);/, "Officer focal alignment must remain active on mobile landscape.");
assert.match(
  css,
  /\.shop-modal \.shop-items\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;[\s\S]*?\.shop-modal \.shop-purchase-bar\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/,
  "The paid Shop must horizontally scroll while one shared purchase bar remains anchored."
);
for (const [selector, label] of [
  ["\\.shop-item-image", "Shop item"],
  ["\\.inventory-slot-image", "Bag slot"],
  ["\\.inventory-selection-image", "selected Bag item"],
  ["\\.inner-castle-preview-art", "Inner Castle preview"],
]) {
  assert.match(
    css,
    new RegExp(`${selector}\\s*\\{[^}]*object-fit: contain;`),
    `${label} artwork must be fully contained instead of cropped.`
  );
}
assert.match(css, /\.common-gear-character-panel > img\s*\{[^}]*object-fit: (?:cover|contain);/, "Officer artwork must deliberately fill or fit its portrait frame.");

const manifest = JSON.parse(read("assets/optimized/manifest.json"));
const expectedAssets = ["gear-war-captain", "gear-master-of-coin", "gear-cavalry-master", "gear-defensive-commander", "item-common-gear-box"];
expectedAssets.forEach(id => {
  const asset = manifest.assets.find(entry => entry.id === id);
  assert(asset, `Missing optimized Common Gear artwork: ${id}`);
  assert(fs.existsSync(path.join(root, asset.output)), `Missing optimized file for ${id}`);
  if (id.startsWith("gear-")) {
    assert.equal(asset.width, 768, `${id} optimized portrait width drifted.`);
    assert.equal(asset.height, 1024, `${id} optimized portrait height drifted.`);
    assert.equal(asset.hasAlpha, false, `${id} optimized portrait must remain opaque.`);
  }
});
gear.DEFINITIONS.forEach(definition => {
  const id = `gear-${definition.buildingId}-${definition.slot}`;
  const asset = manifest.assets.find(entry => entry.id === id);
  assert(asset, `Missing optimized item artwork: ${id}`);
  assert.equal(asset.output, definition.art, `Definition path does not match optimized manifest for ${id}.`);
  assert.equal(asset.hasAlpha, true, `${id} must preserve alpha transparency.`);
  assert.equal(asset.category, "gear-item", `${id} must use the fixed-layout gear-item category.`);
  assert.equal(asset.width, 192, `${id} optimized width must remain fixed at 192px.`);
  assert.equal(asset.height, 192, `${id} optimized height must remain fixed at 192px.`);
  assert(asset.bytes <= 140 * 1024, `${id} exceeds the per-file gear art budget.`);
  assert(fs.existsSync(path.join(root, asset.output)), `Missing optimized file for ${id}.`);
});

const browserContext = {};
browserContext.window = browserContext;
vm.runInNewContext(read("common-gear.js"), browserContext);
assert.equal(browserContext.CROWNLANDS_COMMON_GEAR.DEFINITIONS.length, 32, "Browser Common Gear config failed to load.");

console.log("Validated Common Gear definitions, male officer standard, canonical art dimensions, authoritative rewards/actions, secure storage, UI, bonuses, and optimized art.");
