"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname, "../functions/index.js"), "utf8");
const context = vm.createContext({
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
  getCommonGearBonuses: () => ({ attackStrength: 0 }),
});
for (const name of ["splitBattleObjectiveBonusPower", "createBattleAttackPowerBreakdown", "getBattleAttackerBasePower",
  "createBattleDefensePowerBreakdown", "createBattleWallPowerBreakdown", "createBattlePowerGearEffect",
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
const neutral = context.createHoldingTowerBattleSnapshot({ ...input,
  defense: { ...input.defense, contributions: [], neutralTroops: 42000 },
  defenderAllocation: { ownerLosses: 42000, contributions: [] },
});
assert.equal(neutral.defender.ownerUid, "");
assert.equal(neutral.defender.ownerName, "Neutral defenders");
assert.equal(neutral.participantUids.length, 3, "Neutral garrison became a report recipient");
console.log("Clan Tower snapshots: all participants, exact individual power/losses, separate walls, mixed rally bonuses, zero-loss defenders and neutral privacy passed.");
module.exports = { snapshot };
