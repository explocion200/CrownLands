"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const gear = require("../common-gear.js");
const economy = require("../functions/economy-config.json");

function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.ok(bodyStart >= 0, `Missing ${name} body.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}
function profile(level, rarity = "common", gearLevel = 5) {
  const state = gear.createDefaultState();
  for (const slot of ["weapon", "head"]) {
    const definition = gear.DEFINITIONS.find(row => row.buildingId === "gatehouse" && row.slot === slot && row.rarity === rarity);
    state.instances[slot] = { instanceId: slot, gearKey: definition.gearKey, level: gearLevel };
    state.equipped["gatehouse"][slot] = slot;
  }
  return { playerName: "Fixture ruler", upgrades: { shieldwallDiscipline: level, stoneworks: 34 }, gear: state };
}
const context = {
  COMMON_GEAR: gear, CITY_LEVEL_STATS: economy.cityEconomy,
  DEFENSE_COMBAT_VERSION: 1, SIEGE_COMBAT_VERSION: 1,
  BASE_TROOP_DEFENSE_POWER: 1.3, REWARD_CAMP_TROOP_POWER: 1,
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  safeString: value => String(value || ""), normalizePlayerName: value => String(value || "Ruler"),
  getOwnerUid: target => target.ownerUid || target.holderUid || "", getOwnerName: target => target.ownerName || "",
  isStronghold: () => false, isRewardCamp: target => target.targetType === "camp",
  clampCityLevel: level => Math.max(1, Number(level) || 1), getBaseCityWalls: () => 200,
  getCommonGearBonuses: value => gear.getBonuses(value),
  getSkillLevel: (value, skill) => value?.upgrades?.[skill] || 0,
  getSkillPercent: (value, skill) => Math.min(economy.skills[skill]?.maxPercent || 0, (value?.upgrades?.[skill] || 0) * (economy.skills[skill]?.percentPerLevel || 0)),
  usesSiegeCombat: (version, type) => type !== "camp" && version >= 1,
  getTargetOwnerTroops: target => target.troops,
  getFortificationSnapshot: (target, stats) => ({ currentWallPower: stats.cityWalls }),
  getCasualtyRecoveryPercent: () => 0,
};
vm.createContext(context);
for (const name of ["usesSoldierDefenseModel", "getObjectiveTroopDefenseBonusPercent", "getCityStats", "calculateDefenderArmyPackages", "splitBattleObjectiveBonusPower", "createBattleDefensePowerBreakdown"]) {
  vm.runInContext(extract(server, name), context);
}
const holder = profile(10), ally = profile(20, "legendary");
const camp = { id: "fixture", targetType: "camp", ownerUid: "holder", troops: 10_000 };
const options = {
  target: camp, targetType: "camp", ownerProfile: holder,
  ownerBonuses: { cityDefenseBonusPercent: 8, personalDefenseBonusPercent: 8 },
  contributions: [{ id: "ally", ownerUid: "ally", troops: 5_000 }],
  contributorProfiles: new Map([["ally", ally]]),
  contributorStats: new Map([["ally", { cityDefenseBonusPercent: 5, sharedClanDefenseBonusPercent: 5 }]]),
};
const packages = context.calculateDefenderArmyPackages(options);
const expected = (troops, skill, objective, gearPercent) => Math.floor(troops * 1.3 * (1 + Math.min(200, skill + objective) / 100))
  + Math.floor(troops * 1.3 * Math.min(gearPercent, Math.max(0, 200 - skill - objective)) / 100);
assert.equal(packages.owner.effectivePower, expected(10_000, 30, 8, gear.getBonuses(holder).defenderStrength));
assert.equal(packages.reinforcements[0].effectivePower, expected(5_000, 60, 5, gear.getBonuses(ally).defenderStrength));
assert.equal(packages.reinforcements[0].gearOwnerUid, "ally");
assert.equal(packages.reinforcements[0].defenseGearItems[0].rarity, "legendary");
assert.equal(packages.totalDefense, packages.owner.effectivePower + packages.reinforcements[0].effectivePower);
assert.equal(packages.owner.basePower, 13_000);
assert.equal(packages.reinforcements[0].basePower, 6_500);
assert.equal(packages.fortification, null);
assert.equal(packages.owner.cityWalls, 0);
assert.equal(packages.owner.stoneworksPercent, 0);
assert.equal(packages.reinforcements[0].fortificationPower, 0);
for (const row of [packages.owner, ...packages.reinforcements]) {
  const breakdown = context.createBattleDefensePowerBreakdown(row);
  assert.equal(breakdown.totalDefensePower, row.effectivePower);
  assert(breakdown.shieldwallDisciplineBonusPower > 0);
  assert.equal(breakdown.gearDefenderStrengthBonusPower, row.gearDefenderStrengthBonusPower);
  assert.equal(Object.entries(breakdown).filter(([key]) => key !== "totalDefensePower").reduce((sum, [, value]) => sum + value, 0), row.effectivePower);
}
const noGearAlly = { ...ally, gear: gear.createDefaultState() };
const withoutAllyGear = context.calculateDefenderArmyPackages({ ...options, contributorProfiles: new Map([["ally", noGearAlly]]) });
assert.equal(withoutAllyGear.owner.effectivePower, packages.owner.effectivePower);
assert(withoutAllyGear.reinforcements[0].effectivePower < packages.reinforcements[0].effectivePower);
const capped = context.calculateDefenderArmyPackages({ ...options, ownerProfile: profile(34, "legendary"),
  ownerBonuses: { cityDefenseBonusPercent: 150, personalDefenseBonusPercent: 150 },
  contributorStats: new Map([["ally", { cityDefenseBonusPercent: 200 }]]) });
assert.equal(capped.owner.effectivePower, 39_000);
assert.equal(capped.reinforcements[0].effectivePower, 19_500);
assert.equal(capped.owner.gearDefenderStrengthBonusPower, 0);
const neutral = context.calculateDefenderArmyPackages({ ...options, target: { ...camp, ownerUid: "", troops: 20_000 }, contributions: [] });
assert.equal(neutral.totalDefense, 20_000, "NPC troops must ignore even supplied skills, gear and objective support");
assert.equal(neutral.defenseCombatVersion, 0);
const changedLiveSkills = context.calculateDefenderArmyPackages({ ...options, ownerProfile: profile(34) });
assert(changedLiveSkills.owner.effectivePower > packages.owner.effectivePower);
assert.equal(changedLiveSkills.reinforcements[0].effectivePower, packages.reinforcements[0].effectivePower);
vm.runInContext(extract(server, "getCityInfrastructurePowerComponents"), context);
assert.deepEqual(JSON.parse(JSON.stringify(context.getCityInfrastructurePowerComponents(camp, options.ownerBonuses))),
  { replacementPower: 0, defensivePower: 0, sustainableTroopPerHour: 0 }, "Camp bonuses must not inflate infrastructure King Power");

const clientContext = { ...context, state: { mainCityId: "main" },
  supportsDefenseCombat: () => true, isRewardCampTarget: context.isRewardCamp,
  getCommonGearBonuses: () => gear.getBonuses(holder),
  getSkillPercent: skill => context.getSkillPercent(holder, skill), getSkillLevel: skill => holder.upgrades[skill] || 0,
  getControlledObjectiveTroopDefenseBonusPercentForCity: () => 8,
  getCityVictoryPoints: () => 0, getMillionLordsCityProductionVp: () => 0,
  getControlledStrongholdGoldBonusPercent: () => 0, getControlledStrongholdTroopBonusPercent: () => 0,
  getBaseCityTroopProductionPerHour: () => 0, getMillionLordsPassiveGoldPerHour: () => 0,
};
vm.createContext(clientContext);
for (const name of ["calculateTroopProductionRates", "calculateGoldProductionRates", "getCityStats"]) {
  vm.runInContext(extract(client, name), clientContext);
}
const clientStats = clientContext.getCityStats({ ...camp, owner: "player" });
assert.equal(clientStats.totalDefense, packages.owner.effectivePower);
assert.equal(clientContext.getCityStats({ ...camp, owner: "neutral", ownerUid: "" }).totalDefense, 10_000);
assert.equal(clientStats.cityWalls, 0);

assert.match(extract(server, "usesSoldierDefenseModel"), /getOwnerUid/);
assert.match(server, /settlementDefenseCombatVersion = targetType === "camp"\s*\? DEFENSE_COMBAT_VERSION/);
console.log("Player camp defense passed: NPC immunity, own skills/gear/objectives, per-army caps, live changes, wall exclusion, report attribution and client parity.");
