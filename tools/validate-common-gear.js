const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const gear = require(path.join(root, "common-gear.js"));

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
assert.equal(gear.SHOP_PRICE_GOLD, 1_000_000_000, "The Common Gear Box must cost exactly 1 billion gold.");
assert.equal(gear.RELIC_BONUS_CHANCE_PERCENT, 1);
assert.equal(gear.CASUALTY_RECOVERY_CAP_PERCENT, 75);
assert.deepEqual(gear.BONUS_BY_LEVEL, { 1: .25, 2: .5, 3: .8, 4: 1.15, 5: 1.5 });
assert.deepEqual(gear.UPGRADE_BY_LEVEL, {
  1: { duplicates: 1, baseGoldHours: .5 },
  2: { duplicates: 2, baseGoldHours: 1 },
  3: { duplicates: 3, baseGoldHours: 2 },
  4: { duplicates: 4, baseGoldHours: 4 },
});

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
assert.match(index, /candidate\.level === 1 && !candidate\.isEquipped/, "Upgrades must consume only unequipped Level 1 duplicates.");
assert.match(index, /relicRewardItem[\s\S]{0,180}crypto\.randomInt\(1, 101\)/, "Relic Camp bonus must roll only with a rewarded item payout.");
assert.match(index, /claimedPosition\.day % 7 === 0 \? 1 : 0/, "Weekly daily-login milestones must award a Common Gear Box.");
assert.match(index, /currentState\.completedCount[\s\S]{0,1500}gear\.commonGearBoxes \+= 1/, "Completing all three daily missions must award a box once.");
assert.match(index, /getCasualtyRecoveryPercent[\s\S]{0,500}CASUALTY_RECOVERY_CAP_PERCENT/, "Field Medic plus gear recovery must be capped.");
assert.match(
  index,
  /createCommonGearClientStatus[\s\S]{0,700}price: COMMON_GEAR\.SHOP_PRICE_GOLD/,
  "The authoritative Common Gear shop status must use the fixed shared price."
);

const rules = read("firestore.rules");
assert.match(rules, /'shopItems',\s*'gear',/, "Client profile creation must not seed authoritative gear.");
const client = read("firebaseClient.js");
assert.match(client, /delete cleanProfile\.gear;/, "Normal profile saves must strip authoritative gear.");
const game = read("game.js");
assert.match(game, /Common Gear Box/);
assert.match(game, /common-gear-building-shell/);
assert.match(game, /data-gear-upgrade/);
assert.match(game, /data-manage-common-gear/);
assert.match(game, /equippedDefinition\.art/, "Equipped slots must render item artwork.");
assert.match(game, /class="common-gear-detail-art"[\s\S]{0,100}definition\.art/, "Selected gear and its upgrade view must render item artwork.");
assert.match(game, /class="common-gear-mini-card[\s\S]{0,260}def\.art/, "Building inventory cards must render item artwork.");
assert.match(game, /class="common-gear-reveal-card"[\s\S]{0,140}definition\.art/, "Box reveals must render item artwork.");
assert.match(game, /onerror="this\.hidden=true"/, "Gear art must fail gracefully without obscuring labels.");
assert.match(
  game,
  /function getCommonGearBoxShopPrice\(\)[\s\S]{0,180}COMMON_GEAR\?\.SHOP_PRICE_GOLD/,
  "The Shop must display the same fixed Common Gear Box price used by the server."
);
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
const css = read("styles.css");
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
  /@media \(max-height: 520px\)[\s\S]{0,2200}\.common-gear-building-shell\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\) 68px;/,
  "Short landscape screens need a compact non-overlapping Common Gear layout."
);
assert.match(
  css,
  /@media \(max-width: 520px\)[\s\S]{0,3000}\.shop-items \.shop-item\s*\{[^}]*grid-template-columns: 52px minmax\(0, 1fr\);[\s\S]{0,1400}\.shop-items \.shop-buy-btn\s*\{[^}]*grid-column: 1 \/ -1;/,
  "Narrow Shop rows must give copy room and move purchase buttons onto their own row."
);
for (const [selector, label] of [
  ["\\.shop-item-image", "Shop item"],
  ["\\.inventory-slot-image", "Bag slot"],
  ["\\.inventory-selection-image", "selected Bag item"],
  ["\\.inner-castle-preview-art", "Inner Castle preview"],
  ["\\.common-gear-character-panel > img", "officer character"],
]) {
  assert.match(
    css,
    new RegExp(`${selector}\\s*\\{[^}]*object-fit: contain;`),
    `${label} artwork must be fully contained instead of cropped.`
  );
}

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
