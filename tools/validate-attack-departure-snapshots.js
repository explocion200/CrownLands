"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");
const G = require("../common-gear");
const E = require("../functions/economy-config.json");
const context = vm.createContext({
  COMMON_GEAR: G, ATTACK_COMBAT_SNAPSHOT_VERSION: 2, BASE_TROOP_ATTACK_POWER: 1.25,
  safeNumber: (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback,
  getSkillLevel: (p, key) => p.upgrades?.[key] || 0,
  getSkillPercent: (p, key) => Math.min(E.skills[key].maxPercent,
    (p.upgrades?.[key] || 0) * E.skills[key].percentPerLevel),
  getCommonGearBonuses: p => G.getBonuses(p),
});
for (const name of ["normalizeAttackCombatSnapshot", "createAttackCombatSnapshot",
  "getAttackRecoveryOptions", "getSnapshottedAttackPower", "createBattleCasualtyRecoverySnapshot"]) {
  const start = source.indexOf("function " + name + "(");
  const end = source.indexOf("\nfunction ", start + 10);
  assert(start >= 0 && end > start, "Missing " + name);
  vm.runInContext(source.slice(start, end), context);
}
function profile(medics, sword, rarity) {
  const gear = G.createDefaultState();
  for (const slot of ["necklace", "weapon"]) {
    if (!rarity) continue;
    const item = G.DEFINITIONS.find(d => d.buildingId === "barracks" && d.slot === slot && d.rarity === rarity);
    const id = "departure_" + slot;
    gear.instances[id] = { instanceId: id, gearKey: item.gearKey, level: 5, acquiredAtMs: 1 };
    gear.equipped.barracks[slot] = id;
  }
  return { upgrades: { fieldMedics: medics, swordmastery: sword }, gear: G.normalizeState(gear) };
}
function check(launchProfile, laterProfile, expectedPercent) {
  const snapshot = context.createAttackCombatSnapshot(4_476_174, launchProfile);
  const departure = JSON.parse(JSON.stringify(snapshot));
  const power = snapshot.launchAttackPower;
  // A persisted march must survive a skill reset and equipment replacement.
  launchProfile.upgrades = laterProfile.upgrades;
  launchProfile.gear = laterProfile.gear;
  const options = context.getAttackRecoveryOptions(departure);
  assert.equal(options.combinedRecoveryPercent, expectedPercent);
  const losses = 4_163_431;
  const recoveredTroops = Math.floor(losses * expectedPercent / 100);
  const report = context.createBattleCasualtyRecoverySnapshot({
    profile: launchProfile, ...options, losses, recoveredTroops,
  });
  assert.equal(report.combinedPercent, expectedPercent, "Report used arrival bonuses");
  assert.equal(report.recoveredTroops, recoveredTroops, "Recovery changed after a reset");
  assert.equal(context.getSnapshottedAttackPower(departure, 4_476_174), power,
    "Changing a profile altered departure attack power");
  assert.equal(JSON.stringify(snapshot), JSON.stringify(departure), "Profile mutation altered stored gear");
  assert.equal(report.items.length, options.casualtyGearItems.length);
  if (expectedPercent === 0) {
    assert.equal(report.items.length, 0, "Newly equipped gear appeared in an old attack");
    assert.equal(recoveredTroops, 0, "Zero departure recovery fell back to arrival skills");
  }
}
check(profile(25, 27, "common"), profile(0, 0, null), 51.5);
check(profile(0, 0, null), profile(25, 50, "legendary"), 0);
check(profile(25, 50, "legendary"), profile(0, 0, "common"), 90);
check(profile(10, 10, "common"), profile(25, 50, "legendary"), 21.5);
const legacy = { version: 1, attackPowerPerTroop: 3.2, launchTroops: 100, launchAttackPower: 320 };
assert.equal(context.getSnapshottedAttackPower(legacy, 100), 320, "Legacy launch attack power changed");
assert.equal(Object.keys(context.getAttackRecoveryOptions(legacy)).length, 0,
  "Missing historical recovery was invented");
assert.equal(Object.keys(context.getAttackRecoveryOptions(null)).length, 0);
console.log("Attack departure snapshots: skill reset, later skill/gear gains, recovery cap, zero recovery, item identity, reports and legacy attack power passed.");
