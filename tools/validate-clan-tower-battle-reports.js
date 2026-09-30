"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname, "../functions/index.js"), "utf8");
const context = vm.createContext({
  COMMON_GEAR: require("../common-gear.js"),
  DEFENSE_COMBAT_VERSION: 1, BASE_TROOP_DEFENSE_POWER: 1.3, BATTLE_SNAPSHOT_MODEL_VERSION: 1,
  SIEGE_COMBAT_VERSION: 1, ONLINE_WORLD_ID: "fixture", RESET_GENERATION: "fixture",
  FieldValue: { serverTimestamp: () => 123 },
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  safeString: (value, max = 200) => String(value || "").slice(0, max),
  clampInt: (n, min, max) => Math.max(min, Math.min(max, Math.floor(n))),
  clampCityLevel: n => n, normalizeRegionId: n => n || "", normalizePlayerName: (n, fallback) => n || fallback,
  normalizeCombatFortificationSnapshot: n => n, normalizeAttackCombatSnapshot: () => null,
  normalizeAttackProtectionSnapshot: () => null, battleClanIdentity: p => p,
  getSkillPercent: () => 0, getSkillLevel: () => 0,
  getCommonGearBonuses: profile => ({ attackStrength: profile.attackStrength || 0 }),
});
for (const name of ["splitBattleObjectiveBonusPower", "createBattleAttackPowerBreakdown", "getBattleAttackerBasePower",
  "createBattleDefensePowerBreakdown", "createBattleWallPowerBreakdown", "createBattlePowerGearEffect",
  "createBattleCasualtyRecoverySnapshot", "createBattleParticipantRecovery", "createBattleGearItemEffects",
  "createBattleGearEffectsSnapshot", "createDetailedBattleSnapshot", "createHoldingTowerBattleSnapshot"]) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf("\nfunction ", start + 10);
  assert(start >= 0, name);
  vm.runInContext(source.slice(start, end), context);
}
const packages = [0, 1, 2].map(i => ({ uid: `attacker-${i}`, ownerName: `Attacking Ruler ${i + 1}`,
  ownerFlag: null, role: i ? "ally" : "leader", troops: 10000 * (i + 1),
  attackBonusPercent: i * 10, attackGearPercent: i, clanTrainingPercent: 5,
  effectivePower: Math.floor(10000 * (i + 1) * (1 + (i * 11 + 5) / 100)) }));
const contributions = [0, 1, 2].map(i => ({ id: `defender-${i}`, ownerUid: `defender-${i}`,
  ownerName: `Defending Ruler ${i + 1}`, ownerFlag: null, troops: 7000 * (i + 1),
  basePower: 9100 * (i + 1), shieldwallDisciplineLevel: i,
  shieldwallDisciplinePercent: i * 5, gearDefenderStrengthPercent: i,
  effectivePower: Math.floor(9100 * (i + 1) * (1 + i * 6 / 100)) }));
const input = {
  armyId: "tower-report-fixture", tower: { id: "ravenwatch", name: "Ravenwatch", regionId: "crownlands", wallLevel: 5, clanId: "defenders", clanName: "Defending Clan" },
  defense: { contributions, neutralTroops: 0, fortification: { fullWallPower: 5000, startingWallPower: 5000,
    startingIntegrityBps: 10000, endingIntegrityBps: 0, repairWindowMinutes: 10 },
    totalDefense: 5000 + contributions.reduce((sum, row) => sum + row.effectivePower, 0) },
  packages, attackerAllocation: packages.map(row => ({ ...row, losses: row.troops / 4, survivors: row.troops * 3 / 4 })),
  defenderAllocation: { ownerLosses: 0, contributions: contributions.map(row => ({ ...row, losses: row.troops, remaining: 0 })) },
  leaderUid: packages[0].uid, leaderProfile: { playerName: packages[0].ownerName }, nowMs: 123,
};
input.result = { success: true, attackerLosses: 15000, survivors: 45000, defenderLosses: 42000,
  attackPower: packages.reduce((sum, row) => sum + row.effectivePower, 0), defensePower: input.defense.totalDefense,
  fortification: input.defense.fortification };
const before = JSON.stringify(input);
const snapshot = JSON.parse(JSON.stringify(context.createHoldingTowerBattleSnapshot(input)));
assert.equal(JSON.stringify(input), before, "Snapshot changed combat inputs");
assert.equal(snapshot.target.targetType, "tower");
assert.deepEqual([...snapshot.participantUids].sort(), [...packages.map(p => p.uid), ...contributions.map(p => p.ownerUid)].sort());
for (const [rows, originals, powerKey] of [[snapshot.attackers, packages, "attackPower"], [[snapshot.defender, ...snapshot.reinforcements], contributions, "defensePower"]]) {
  for (const row of rows) {
    const original = originals.find(p => (p.uid || p.ownerUid) === row.ownerUid);
    assert.equal(row.effectivePower, original.effectivePower, "Changed individual battle power");
    assert.equal(row.startingTroops, original.troops);
    assert.equal(row.losses + row.survivors, row.startingTroops);
  }
  assert.equal(rows.reduce((sum, row) => sum + row.effectivePower, 0) + (powerKey === "defensePower" ? 5000 : 0), snapshot.totals[powerKey]);
}
assert.equal(snapshot.totals.attackPowerBreakdown.totalAttackPower, snapshot.totals.attackPower);
assert.equal(snapshot.totals.defensePowerBreakdown.baseWallPower, 5000);
const noLoss = context.createHoldingTowerBattleSnapshot({ ...input,
  defenderAllocation: { ownerLosses: 0, contributions: contributions.map(row => ({ ...row, losses: 0, remaining: row.troops })) },
  result: { ...input.result, success: false, defenderLosses: 0 },
});
assert.equal(noLoss.participantUids.length, 6, "Zero-loss defenders disappeared");
assert.equal(noLoss.defender.losses, 0);
assert.equal(noLoss.reinforcements[1].survivors, contributions[2].troops);
const launchGear = context.createHoldingTowerBattleSnapshot({ ...input,
  leaderProfile: { ...input.leaderProfile, attackStrength: 50 },
  packages: packages.map(row => ({ ...row, attackGearPercent: 0 })),
});
assert.equal(launchGear.gearEffects.attacker.attackStrength, null,
  "Gear equipped after launch appeared in the battle's attack bonus");
const neutral = context.createHoldingTowerBattleSnapshot({ ...input,
  defense: { ...input.defense, contributions: [], neutralTroops: 42000 },
  defenderAllocation: { ownerLosses: 42000, contributions: [] },
});
assert.equal(neutral.defender.ownerUid, "");
assert.equal(neutral.defender.ownerName, "Neutral defenders");
assert.equal(neutral.participantUids.length, 3, "Neutral garrison became a report recipient");
console.log("Clan Tower snapshots: all participants, exact individual power/losses, separate walls, mixed rally bonuses, zero-loss defenders and neutral privacy passed.");
module.exports = { snapshot };

const limitedSnapshot = context.createHoldingTowerBattleSnapshot({ ...input,
  result: { ...input.result, captured: false, captureBlockedReason: "clan_tower_limit" } });
assert.equal(limitedSnapshot.outcome, "victory");
assert.equal(limitedSnapshot.combatRule.id, "clan_tower_raid");
assert.equal(limitedSnapshot.combatRule.captureAllowed, false);
assert.equal(limitedSnapshot.formula.captureRequiresAttackPowerAboveDefense, false);
assert.deepEqual(JSON.parse(JSON.stringify(limitedSnapshot.totals)), snapshot.totals, "Ownership cap changed combat totals");

const G = require("../common-gear.js"), T = require("../functions/holding-towers.js");
function equippedProfile(rarity = "legendary", level = 5) {
  const gear = G.createDefaultState();
  for (const def of G.DEFINITIONS.filter(def => def.rarity === rarity)) {
    const instanceId = def.gearKey;
    gear.instances[instanceId] = { instanceId, gearKey: def.gearKey, level };
    gear.equipped[def.buildingId][def.slot] = instanceId;
  }
  return { gear, worldId: "fixture", resetGeneration: "fixture", realmShardId: "shard_0001",
    clanId: "defenders", playerName: "Item Owner", shieldwallDiscipline: 100, fieldMedics: 50 };
}
Object.assign(context, { Map, HOLDING_TOWERS: T, CLAN_BUILDINGS: require("../clan-tower-buildings.js"),
  REALM_TOPOLOGY: { normalizeRealmShardId: value => value }, getCurrentRealmShardId: () => "shard_0001",
  normalizeServerFlag: value => value || null, getBaseCityWalls: () => 5000,
  getSiegeRepairWindowMinutes: () => 16, FORTIFICATION_STATE_VERSION: 1,
  getSkillPercent: (profile, skill) => profile?.[skill] || 0,
  getCommonGearBonuses: profile => ({ ...G.getBonuses(profile), attackStrength: profile?.attackStrength || G.getBonuses(profile).attackStrength }),
});
for (const name of ["getCasualtyRecoveryPercent", "isCurrentHoldingTowerGarrison", "createHoldingTowerDefensePackages"]) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf("\nfunction ", start + 10);
  vm.runInContext(source.slice(start, end), context);
}
const tower = { ...T.createNeutralTowerState(T.TOWERS[0].id), ownerKind: "clan", clanId: "defenders",
  buildings: { infirmary: 10 }, wallIntegrityBps: 10000 };
const garrison = { ...equippedProfile(), towerId: tower.id, ownerUid: "defender", troops: 10000 };
for (const rarity of G.RARITIES) for (let level = 1; level <= 5; level++) {
  const profile = equippedProfile(rarity, level);
  const defense = context.createHoldingTowerDefensePackages(tower, [garrison], 123, new Map([["defender", profile]]));
  const percent = G.getBonuses(profile).defenderStrength;
  assert.equal(defense.contributions[0].gearDefenderStrengthPercent, percent, "Tower ignored its equipped shield");
  assert.equal(defense.totalGarrisonDefense, Math.floor(13000 * (1 + (100 + percent) / 100)));
  assert.equal(defense.contributions[0].fieldMedicsPercent, Math.min(90, 65 + G.getBonuses(profile).casualtyEfficiency));
}
const stale = context.createHoldingTowerDefensePackages(tower, [garrison], 123,
  new Map([["defender", { ...equippedProfile(), resetGeneration: "other" }]]));
assert.equal(stale.totalGarrisonDefense, 13000, "Stale profile bonuses leaked into the active Tower");
assert.equal(context.getBattleAttackerBasePower({ troops: 10000, attackPowerPerTroop: 3.75, bonusPercent: 210 }), 12500,
  "Capped rallies reported a lower base attack power");

const itemPackages = packages.map((row, index) => {
  const profile = equippedProfile(["rare", "epic", "legendary"][index]);
  const bonuses = G.getBonuses(profile), attackPowerPerTroop = 1.25 * (1 + Math.min(200, 110 + bonuses.attackStrength) / 100);
  return { ...row, attackBonusPercent: 100, attackGearPercent: bonuses.attackStrength, clanTrainingPercent: 10,
    attackPowerPerTroop, effectivePower: Math.floor(row.troops * attackPowerPerTroop),
    attackGearItems: G.getEquippedBonusItems(profile, ["attackStrength"]),
    casualtyGearItems: G.getEquippedBonusItems(profile, ["casualtyEfficiency"]),
    fieldMedicsSkillPercent: 50, casualtyGearPercent: bonuses.casualtyEfficiency, fieldMedicsPercent: 50 + bonuses.casualtyEfficiency };
});
const itemDefenders = contributions.map(row => ({ ...row, gearDefenderStrengthPercent: 60,
  effectivePower: Math.floor(row.basePower * 1.6), shieldwallDisciplinePercent: 0,
  defenseGearItems: G.getEquippedBonusItems(equippedProfile(), ["defenderStrength"]),
  casualtyGearItems: G.getEquippedBonusItems(equippedProfile(), ["casualtyEfficiency"]),
  fieldMedicsSkillPercent: 50, casualtyGearPercent: 40, fieldMedicsPercent: 90, clanInfirmaryPercent: 15 }));
const itemSnapshot = context.createHoldingTowerBattleSnapshot({ ...input, packages: itemPackages,
  defense: { ...input.defense, contributions: itemDefenders,
    totalDefense: 5000 + itemDefenders.reduce((sum, row) => sum + row.effectivePower, 0) },
  result: { ...input.result, attackPower: itemPackages.reduce((sum, row) => sum + row.effectivePower, 0),
    defensePower: 5000 + itemDefenders.reduce((sum, row) => sum + row.effectivePower, 0) } });
for (const side of ["attacker", "defender"]) {
  const effects = itemSnapshot.gearEffects[side].items;
  assert.equal(effects.length, 6, "A participant's combat or recovery item disappeared");
  assert.equal(effects.filter(row => row.statType === "casualtyEfficiency").length, 3);
  assert(effects.every(row => row.gearKey && row.ownerUid && row.level === 5));
  assert.equal(effects.reduce((sum, row) => sum + row.bonusPower, 0),
    itemSnapshot.gearEffects[side][side === "attacker" ? "attackStrength" : "defenderStrength"].bonusPower);
}
const wallOwner = { ownerUid: "wall-owner", ownerName: "Wall Keeper",
  wallGearItems: G.getEquippedBonusItems(equippedProfile(), ["wallStrength"]),
  repairGearItems: G.getEquippedBonusItems(equippedProfile(), ["wallRepairSpeed"]) };
const wallEffects = context.createBattleGearEffectsSnapshot({ wallOwner, wallGearPercent: 100,
  defensePowerBreakdown: { gearWallStrengthBonusPower: 10003 }, siege: { repairAddedMs: 10000, repairReductionPercent: 50 } });
assert.equal(wallEffects.defender.items.length, 7, "Each wall armor piece and repair seal must be recorded");
assert.equal(wallEffects.defender.items.reduce((sum, row) => sum + row.bonusPower, 0), 10003, "Item rounding lost wall power");
assert.equal(wallEffects.defender.items.find(row => row.statType === "wallRepairSpeed").appliedPercent, 50);
assert.equal(context.createBattleGearEffectsSnapshot({ wallOwner, wallGearPercent: 100,
  siege: { repairAddedMs: 0, repairReductionPercent: 50 } }).defender.items.length, 0, "Unused wall/repair gear appeared");

const cityShield = G.getEquippedBonusItems(equippedProfile(), ["defenderStrength"]);
const sharedShield = context.createBattleGearEffectsSnapshot({ defenderParticipants: [
  { ownerUid: "city-owner", ownerName: "City Ruler", defenseGearItems: cityShield, gearDefenderStrengthPercent: 60,
    powerBreakdown: { gearDefenderStrengthBonusPower: 780 } },
  { ownerUid: "ally", ownerName: "Ally", gearOwnerUid: "city-owner", gearOwnerName: "City Ruler",
    defenseGearItems: cityShield, gearDefenderStrengthPercent: 60,
    powerBreakdown: { gearDefenderStrengthBonusPower: 1560 } },
] });
assert.equal(sharedShield.defender.items.length, 1, "A shared city shield was listed as two equipped items");
assert.equal(sharedShield.defender.items[0].ownerUid, "city-owner");
assert.equal(sharedShield.defender.items[0].bonusPower, 2340, "Shared shield lost an allied army's contribution");
const recordedRecovery = context.createBattleCasualtyRecoverySnapshot({ profile: equippedProfile(), losses: 100,
  fieldMedicsPercent: 80, casualtyGearPercent: 40, combinedRecoveryPercent: 90 });
assert.equal(recordedRecovery.appliedGearPercent, 10, "Recovery item exceeded the remaining cap");
assert.equal(recordedRecovery.items, null, "An old receipt inherited the player's current item identity");
const unknownItem = context.createBattleGearItemEffects(null, "attackStrength", 1.5, 19, { ownerUid: "old-ruler" });
assert.equal(unknownItem[0].gearName, "Item not recorded");
assert.equal(unknownItem[0].bonusPower, 19);
const noRecovery = context.createBattleGearEffectsSnapshot({ attackerParticipants: [{ ownerUid: "ruler",
  casualtyRecovery: context.createBattleCasualtyRecoverySnapshot({ profile: equippedProfile(), losses: 0 }) }] });
assert.equal(noRecovery.attacker.items.length, 0, "A recovery item appeared without casualties");
const savedItem = { ...cityShield[0], bonusPercent: 11.25, gearName: "Saved shield name" };
assert.equal(G.normalizeBonusItems([savedItem])[0].bonusPercent, 11.25, "Historical values were recalculated from current item curves");
assert.equal(G.normalizeBonusItems([savedItem])[0].gearName, "Saved shield name");
module.exports.itemSnapshot = JSON.parse(JSON.stringify(itemSnapshot));
module.exports.wallEffects = JSON.parse(JSON.stringify(wallEffects));
console.log("Tower shields at every rarity/level, capped rally base power, all participant items, recovery and wall/repair attribution passed.");
