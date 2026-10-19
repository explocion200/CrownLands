"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname, "../functions/index.js"), "utf8");
const G = require("../common-gear.js"), M = require("../functions/marauder-rules.js");
const context = vm.createContext({
  COMMON_GEAR: G, DEFENSE_COMBAT_VERSION: 1, BATTLE_SNAPSHOT_MODEL_VERSION: 1,
  SIEGE_COMBAT_VERSION: 1, ONLINE_WORLD_ID: "fixture", RESET_GENERATION: "fixture",
  FieldValue: { serverTimestamp: () => 123 },
  safeNumber: (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback,
  safeString: (n, max = 200) => String(n || "").slice(0, max),
  clampInt: (n, min, max) => Math.max(min, Math.min(max, Math.floor(n))),
  clampCityLevel: n => n, normalizeRegionId: n => n || "", normalizePlayerName: (n, fallback) => n || fallback,
  normalizeCombatFortificationSnapshot: n => n || null, normalizeAttackCombatSnapshot: () => null,
  normalizeAttackProtectionSnapshot: () => null, battleClanIdentity: () => null,
  getSkillPercent: () => 0, getSkillLevel: () => 0, getCommonGearBonuses: () => ({ attackStrength: 0 }),
});
for (const name of ["splitBattleObjectiveBonusPower", "createBattleAttackPowerBreakdown", "getBattleAttackerBasePower",
  "createBattleDefensePowerBreakdown", "createBattleWallPowerBreakdown", "createBattlePowerGearEffect",
  "createBattleCasualtyRecoverySnapshot", "createBattleParticipantRecovery", "createBattleGearItemEffects",
  "createBattleGearEffectsSnapshot", "createDetailedBattleSnapshot", "createMarauderBattleSnapshot"]) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf("\nfunction ", start + 10);
  assert(start >= 0 && end > start, name);
  vm.runInContext(source.slice(start, end), context);
}
const gear = G.createDefaultState();
for (const def of G.DEFINITIONS.filter(def => def.rarity === "legendary")) {
  gear.instances[def.gearKey] = { instanceId: def.gearKey, gearKey: def.gearKey, level: 5 };
  gear.equipped[def.buildingId][def.slot] = def.gearKey;
}
const equipped = { gear, playerName: "Departure Ruler" };
function fixture(level, count, success = true, version = 1) {
  const defenders = M.balance(level, version).defenders;
  const participants = Array.from({ length: count }, (_, i) => {
    const troops = Math.ceil(defenders * (success ? 2 : 0.01) / count) + i;
    const attackBonusPercent = i ? 250 : 20, attackGearPercent = i ? 100 : 5;
    const rate = 1.25 * (1 + Math.min(200, attackBonusPercent + attackGearPercent) / 100);
    return { uid: `hunter-${i}`, ownerName: `Hunter ${i + 1}`, ownerFlag: null, role: i ? "ally" : "leader",
      sourceId: "source", sourceRegionId: "crownlands", troops, attackPowerPerTroop: rate,
      attackBonusPercent, attackGearPercent, attackSkillLevel: i ? 100 : 10,
      effectivePower: Math.floor(troops * rate), fieldMedicsPercent: 90,
      fieldMedicsSkillPercent: 80, casualtyGearPercent: 40,
      attackGearItems: G.getEquippedBonusItems(equipped, ["attackStrength"]),
      casualtyGearItems: G.getEquippedBonusItems(equipped, ["casualtyEfficiency"]) };
  });
  const allocations = participants.map(p => ({ ...p, losses: success ? Math.floor(p.troops / 4) : p.troops,
    survivors: success ? p.troops - Math.floor(p.troops / 4) : 0 }));
  const input = { armyId: `hunt-${level}-${count}-${success}`, target: { id: "marauder_fixture_00",
    name: level >= 80 ? "Clan Boss" : "Marauder", level, balanceVersion: version, classification: level >= 80 ? "boss" : "solo",
    regionId: "crownlands", troops: defenders, spawnId: `spawn-${level}`, x: 512, y: 512 },
    participants, allocations, attackerUid: participants[0].uid, attackerProfile: { playerName: "Hunter 1" }, nowMs: 123,
    result: { success, attackerLosses: allocations.reduce((n, p) => n + p.losses, 0),
      survivors: allocations.reduce((n, p) => n + p.survivors, 0),
      defenderLosses: success ? defenders : Math.floor(defenders / 10),
      attackPower: participants.reduce((n, p) => n + p.effectivePower, 0), defensePower: defenders } };
  const before = JSON.stringify(input), snapshot = JSON.parse(JSON.stringify(context.createMarauderBattleSnapshot(input)));
  assert.equal(JSON.stringify(input), before, "Report snapshot mutated combat or departure data");
  assert.equal(snapshot.target.targetType, "marauder");
  assert.equal(snapshot.target.targetSpawnId, input.target.spawnId);
  assert.equal(snapshot.target.level, level);
  assert.equal(snapshot.combatRule.captureAllowed, false);
  assert.equal(snapshot.combatRule.id, "marauder_hunt");
  assert.equal(snapshot.formula.captureRequiresAttackPowerAboveDefense, false);
  assert.equal(require("../functions/pvp-leaderboard").eventForBattle(snapshot, "shard_0001"), null);
  assert.equal(snapshot.siege, null);
  assert.equal(snapshot.defender.ownerUid, "");
  assert.equal(snapshot.defender.basePower, defenders);
  assert.equal(snapshot.totals.defensePower, defenders);
  assert.equal(snapshot.totals.defenderSurvivors + snapshot.totals.defenderLosses, defenders);
  assert.equal(snapshot.totals.attackPowerBreakdown.baseAttackPower,
    participants.reduce((n, p) => n + Math.floor(p.troops * 1.25), 0));
  assert.equal(snapshot.totals.attackPowerBreakdown.totalAttackPower, input.result.attackPower);
  assert.deepEqual(snapshot.participantUids.sort(), participants.map(p => p.uid).sort());
  for (const key of ["baseWallPower", "stoneworksWallBonusPower", "gearWallStrengthBonusPower",
    "baseDefenseBonusPower", "shieldwallDisciplineBonusPower", "personalObjectiveBonusPower", "sharedClanBonusPower"]) {
    assert.equal(snapshot.totals.defensePowerBreakdown[key], 0, `Invented NPC defense: ${key}`);
  }
  for (const [i, row] of snapshot.attackers.entries()) {
    assert.equal(row.effectivePower, participants[i].effectivePower, "Used current bonuses instead of departure power");
    assert.equal(row.losses, allocations[i].losses); assert.equal(row.survivors, allocations[i].survivors);
    assert.equal(row.losses + row.survivors, row.startingTroops);
    assert.equal(row.casualtyRecovery.combinedPercent, 90);
    assert(row.casualtyRecovery.recoveredTroops <= Math.floor(row.losses * 0.9));
    assert(row.attackGearItems.length > 0);
  }
  return snapshot;
}
const snapshots = {
  modernBoss: fixture(100, 5, true, 2), modernBossDefeat: fixture(80, 2, false, 2),
  solo: fixture(1, 1), soloDefeat: fixture(79, 1, false), boss: fixture(80, 2),
  bossDefeat: fixture(100, 2, false), maxRally: fixture(100, 20),
};
module.exports = { snapshots };
console.log("NPC report snapshots: solo/boss victory and defeat, 20-member rallies, exact departure powers/losses, recovery cap, private recipients, immutable identity and zero walls/capture/PvP credit passed.");
