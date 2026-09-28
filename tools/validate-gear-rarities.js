const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const G = require("../common-gear");
const P = require("../docs/gear-rarity-progression/proposal.json");
const M = require("../docs/gear-rarity-progression/model");

assert.equal(G.DEFINITIONS.length, 160);
assert.equal(new Set(G.DEFINITIONS.map(d => d.gearKey)).size, 160);
assert.equal(new Set(G.DEFINITIONS.map(d => d.art)).size, 160);
assert.equal(G.COMMON_DEFINITIONS.length, 32);
assert(G.COMMON_DEFINITIONS.every(d => d.rarity === "common"));
assert.equal(fs.readFileSync(path.join(__dirname, "../common-gear.js"), "utf8").replace(/\r\n/g, "\n"),
  fs.readFileSync(path.join(__dirname, "../functions/common-gear.js"), "utf8").replace(/\r\n/g, "\n"));
// Independent approved prices cover every step and all 32 item families below.
const expectedGold = [[100000,170000,300000,500000,850000],[1500000,2500000,4000000,7000000,50000000],[100000000,200000000,350000000,600000000,1000000000],[1500000000,2500000000,4000000000,6000000000,9000000000],[14000000000,22000000000,34000000000,50000000000,null]];
for (const [rarityIndex, rarity] of G.RARITIES.entries()) {
  for (let level = 1; level <= G.MAX_LEVEL; level++) {
    const item = { gearKey: "barracks_weapon_" + rarity + "_01", level, goldCost: 1, rawBaseGoldPerHour: 0 };
    const cost = expectedGold[rarityIndex][level - 1];
    assert.equal(G.getUpgradeRequirement(item)?.goldCost ?? null, cost);
    assert.equal(G.getUpgradeGoldCost(item), cost || 0);
    assert.equal(G.getUpgradeGoldCost(level, rarity), cost || 0);
    if (cost !== null) {
      assert(Number.isSafeInteger(cost) && cost >= 100000 && cost <= 50000000000);
      assert.equal(G.getUpgradeRequirement(item).duplicates, 1);
    }
  }
}
let upgrades = 0, promotions = 0, values = 0;
for (const family of G.COMMON_DEFINITIONS) {
  let previousBonus = 0;
  for (const [rarityIndex, rarity] of G.RARITIES.entries()) {
    for (let level = 1; level <= G.MAX_LEVEL; level++) {
      const gearKey = `${family.familyKey}_${rarity}_01`;
      const target = G.normalizeInstance({ instanceId: "target", gearKey, level, rarity: "forged", acquiredAtMs: 1 });
      assert.equal(target.rarity, rarity, "Definition, not client rarity, is authoritative");
      const bonus = G.getBonusPercent(target);
      assert.equal(bonus, M.bonus(P, family.statType, rarityIndex, level));
      assert(bonus > previousBonus, `${gearKey}/${level} must improve even at promotion`);
      previousBonus = bonus;
      values++;
      const state = G.createDefaultState();
      state.instances.target = target;
      state.instances.material = { ...target, instanceId: "material", acquiredAtMs: 2 };
      state.equipped[family.buildingId][family.slot] = "target";
      target.isEquipped = true;
      const next = G.getUpgradeResult(target);
      const before = JSON.stringify(state);
      const result = G.consumeUpgradeInputs(state, "target", "result", 10);
      if (rarity === "legendary" && level === 5) {
        assert.equal(next, null);
        assert.equal(result, null);
        assert.equal(JSON.stringify(state), before);
        assert.equal(G.getUpgradeGoldCost(target), 0);
        continue;
      }
      assert(result);
      assert.deepEqual(Object.keys(state.instances), ["result"]);
      assert.equal(state.instances.result.gearKey, next.gearKey);
      assert.equal(state.instances.result.level, level === 5 ? 1 : level + 1);
      assert.equal(state.instances.result.rarity, G.RARITIES[rarityIndex + (level === 5 ? 1 : 0)]);
      assert.equal(state.equipped[family.buildingId][family.slot], "result");
      assert.equal(state.instances.result.isEquipped, true);
      assert.equal(result.previousRarity, rarity);
      assert.equal(result.newRarity, next.rarity);
      assert.equal(G.getUpgradeGoldCost(target), expectedGold[rarityIndex][level - 1]);
      assert.equal(G.getBonuses(state)[family.statType], G.getBonusPercent(next));
      assert.equal(G.getBaseCopyCountForLevel(level, rarity), M.copiesFromCommon(rarityIndex, level));
      assert.equal(G.getCumulativeGoldCostForLevel(level, rarity), M.cumulativeGold(P, rarityIndex, level));
      assert.equal(G.consumeUpgradeInputs(state, "target", "another-result", 11), null, "Consumed inputs cannot replay");
      upgrades++;
      if (level === 5) promotions++;
    }
  }
}
assert.equal(values, 800); assert.equal(upgrades, 768); assert.equal(promotions, 128);

for (const change of [
  { level: 4 },
  { gearKey: "barracks_weapon_uncommon_01" },
  { gearKey: "barracks_head_common_01" },
  { gearKey: "treasury_weapon_common_01" },
  { isEquipped: true },
]) {
  const gear = G.createDefaultState();
  gear.instances.target = G.normalizeInstance({ instanceId: "target", gearKey: "barracks_weapon_common_01", level: 5 });
  gear.instances.material = { ...gear.instances.target, instanceId: "material", ...change };
  const before = JSON.stringify(gear);
  assert.equal(G.consumeUpgradeInputs(gear, "target", "result", 1), null);
  assert.equal(JSON.stringify(gear), before, "Invalid materials cannot partially consume inventory");
}
const old = G.createDefaultState();
old.schemaVersion = 2;
old.commonGearBoxes = 10001;
for (let index = 0; index < 2001; index++) old.instances[`old_${index}`] = {
  instanceId: `old_${index}`, gearKey: "barracks_weapon_common_01", level: index % 5 + 1, acquiredAtMs: index + 1,
};
old.instances.future = { instanceId: "future", gearKey: "future_unsupported_piece", opaque: { level: 9 } };
old.equipped.barracks.weapon = "old_2000";
const migrated = G.normalizeState(old);
assert.equal(Object.keys(migrated.instances).length, 2002, "Normalization must not truncate an over-limit owned inventory");
assert.equal(migrated.commonGearBoxes, 10001, "Unopened rewards cannot be truncated");
assert.deepEqual(migrated.instances.future, old.instances.future);
assert.equal(migrated.equipped.barracks.weapon, "old_2000");
assert.equal(migrated.instances.old_2000.acquiredAtMs, 2001);
assert.equal(G.getBonuses(migrated).attackStrength, .25);
assert.equal(G.getBonusPercent(migrated.instances.future), 0);
const future = G.normalizeState({ ...old, schemaVersion: 99 });
assert.equal(future.schemaVersion, 99, "Future version must remain detectable by the server");
const boxes = G.normalizeState({commonGearBoxes:2, uncommonGearBoxes:3,
  lastOpenRequestId:"common-request",lastOpenReceipt:{requestId:"common-request",instanceIds:[]},
  lastUncommonOpenRequestId:"green-request",lastUncommonOpenReceipt:{requestId:"green-request",boxType:"uncommon",instanceIds:[]}});
assert.equal(boxes.schemaVersion,4);
assert.equal(boxes.commonGearBoxes,2); assert.equal(boxes.uncommonGearBoxes,3);
assert.equal(boxes.lastOpenReceipt.boxType,"common");
assert.equal(boxes.lastUncommonOpenReceipt.boxType,"uncommon");
assert.deepEqual(G.normalizeState(boxes),boxes,"Profile round trips must preserve both counts and retry receipts.");
assert.equal(G.normalizeState({schemaVersion:3,commonGearBoxes:7}).uncommonGearBoxes,0);
assert.equal(G.normalizeState({uncommonGearBoxes:-3}).uncommonGearBoxes,0);
for (const [category, cap] of Object.entries(G.BONUS_CAPS)) {
  assert.equal(G.capBonus(category, cap + 1000), cap);
  assert.equal(G.capBonus(category, -1), 0);
  assert.equal(G.capBonus(category, 1.5), 1.5);
}
const server = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");
assert(server.includes('const rarity = uncommon && index === 0 ? "uncommon" : "common";'));
assert(server.includes("pool[crypto.randomInt(0, pool.length)]"));
assert(server.includes("requireGearCapacity(gear, participation.profile)"));
assert(server.includes("targetId !== replayReceipt.targetInstanceId"));
assert(server.includes("requireGearProgressionClient(request, instance)"));
console.log(`PASS: ${values} values, ${upgrades} two-item upgrades, ${promotions} rarity promotions, terminal level, wrong materials, equipment transfer, rarity-specific box pools, caps and lossless inventory migration.`);

const vm = require("node:vm");
const ui = fs.readFileSync(path.join(__dirname, "../common-gear-ui.js"), "utf8");
const previewScope = { COMMON_GEAR: G, state: { gear: G.createDefaultState() }, getSkillPercent: () => 100,
  getStrongholdMarchSpeedMultiplier: () => 2 };
vm.createContext(previewScope);
vm.runInContext(ui.slice(ui.indexOf("function getCommonGearAppliedPreview("), ui.indexOf("function createCommonGearViewModel(")), previewScope);
for (const [key, cap] of [["barracks_weapon_epic_01",100],["gatehouse_head_epic_01",150],["royal_stables_weapon_epic_01",150],["gatehouse_necklace_epic_01",50],["barracks_necklace_epic_01",75]]) {
  const item = G.normalizeInstance({instanceId:"preview",gearKey:key,level:5});
  const text = previewScope.getCommonGearAppliedPreview(item,G.getUpgradeResult(item));
  assert(text.includes(`Total cap ${cap}%`),text);
  if (key.startsWith("barracks") || key.startsWith("royal-stables")) assert(text.includes("applied +0%"),text);
}
