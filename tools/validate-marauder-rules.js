"use strict";
const assert = require("node:assert/strict");
const M = require("../functions/marauder-rules");
for (const [stamina, crowns] of [[0,30],[1,30],[50,15],[66,11],[67,10],[70,9],[90,3],[96,2],[97,1],[99,1],[100,0]]) {
  assert.equal(M.refillPrice(stamina), crowns);
}
for (let stamina = 0; stamina <= 100; stamina++) {
  const price = M.refillPrice(stamina), missing = 100 - stamina;
  assert(Number.isSafeInteger(price) && price >= 0 && price <= 30);
  assert(price * 100 >= missing * 30 && (price - 1) * 100 < missing * 30, 'Charge the smallest whole Crown amount covering the missing stamina');
  if (stamina) assert(price <= M.refillPrice(stamina - 1), 'More stamina never costs more');
}
for (const invalid of [-1, 101, 1.5, NaN, Infinity, null, '70']) assert.throws(() => M.refillPrice(invalid));
for (const [level, defenders, gold, xp] of M.ANCHORS) assert.deepEqual(
  [M.balance(level).defenders, M.balance(level).gold, M.balance(level).xp], [defenders, gold, xp]);
let previous = null;
for (let level = 1; level <= 100; level++) {
  const config = M.balance(level);
  for (const key of ["defenders", "gold", "xp"]) {
    assert(Number.isSafeInteger(config[key]));
    if (previous) assert(config[key] > previous[key]);
  }
  assert.equal(config.classification, level < 80 ? "solo" : "boss");
  const pool = M.rewards(level, config.defenders, [
    { uid: "a", attackPower: config.defenders }, { uid: "b", attackPower: config.defenders * 2 },
  ], [0, 0, .8]);
  assert.equal(Object.values(pool.gold).reduce((a, b) => a + b), config.gold);
  assert.equal(Object.values(pool.xp).reduce((a, b) => a + b), config.xp);
  assert.equal(Object.values(pool.damage).reduce((a, b) => a + b), config.defenders);
  assert.equal(pool.item, "war_drums_30m"); assert.equal(pool.recipientUid, "b");
  assert.equal(M.rewards(level, config.defenders, [{ uid: "a", attackPower: config.defenders + 1 }],
    [config.itemChance, .99, 0]).item, null);
  previous = config;
}
assert.deepEqual(M.allocate(2, [{ uid: "c", weight: 1 }, { uid: "b", weight: 1 }, { uid: "a", weight: 1 }]), { a: 1, b: 1, c: 0 });
assert.equal(Object.values(M.allocate(50000000, [{ uid: "a", weight: Number.MAX_SAFE_INTEGER },
  { uid: "b", weight: Number.MAX_SAFE_INTEGER - 1 }])).reduce((a, b) => a + b), 50000000);
assert.throws(() => M.allocate(1, [{ uid: "a", weight: 0 }]));
assert.throws(() => M.rewards(1, 100, [{ uid: "a", attackPower: 100 }], [0, 0, 0]));
assert.equal(M.balance(1).itemChance, .02); assert.equal(M.balance(79).itemChance, .1);
assert.equal(M.balance(80).itemChance, .2); assert(Math.abs(M.balance(100).itemChance - .3) < 1e-12);
const weights = Object.fromEntries(M.ITEMS.map(([item]) => [item, 0]));
for (let roll = 0; roll < 100; roll++) weights[M.rewards(1, 100, [{ uid: "a", attackPower: 101 }], [0, (roll + .5) / 100, 0]).item]++;
assert.deepEqual(weights, Object.fromEntries(M.ITEMS));
for (let count = 2; count <= 20; count++) {
  const participants = Array.from({ length: count }, (_, i) => ({ uid: 'member_' + String(i).padStart(2, '0'), attackPower: (i + 1) * 100000000 }));
  for (const remaining of [1, 99999999, 100000000]) {
    const loot = M.rewards(100, remaining, participants, [0, .999, .999]);
    assert.equal(Object.values(loot.damage).reduce((a,b)=>a+b), remaining);
    assert.equal(Object.values(loot.gold).reduce((a,b)=>a+b), 50000000);
    assert.equal(Object.values(loot.xp).reduce((a,b)=>a+b), 200000);
    assert.equal(loot.recipientUid, participants.at(-1).uid);
    assert.equal(loot.item, 'shield_12h');
  }
}
const catalog = require("../functions/core-expansion-region-catalog.json");
assert.equal(catalog.regions.filter(region => region.permanentCore).length, 25);
for (const region of catalog.regions) {
  const slots = M.slots(region);
  assert.equal(slots.length, region.permanentCore ? 1 : 12);
  for (const slot of slots) assert.equal(slot.classification === "boss", region.permanentCore);
}
assert.equal(M.slots({ permanentCore: false, spawnEligible: false }).length, 12);
assert.deepEqual(M.slots({}), []);
const now = Date.UTC(2026, 9, 12), interval = M.RECOVERY_MS;
let stamina = M.changeStamina(null, -10, now);
assert.equal(stamina.value, 90);
assert.equal(M.stamina(stamina, now + interval - 1).value, 90);
assert.equal(M.stamina(stamina, now + interval).value, 91);
stamina = M.changeStamina(stamina, -10, now + interval / 2);
assert.equal(M.stamina(stamina, now + interval).value, 81); // Spending preserves fractional recovery.
assert.equal(M.stamina(stamina, now + 86400000).value, 100);
assert.equal(M.changeStamina(stamina, 100, now).value, 100);
assert.throws(() => M.changeStamina({ ...stamina, value: 9 }, -10, now));
assert.equal(M.view({ ...stamina, paidDay: M.day(now) }, now).paidRefillsToday, 1);
assert.equal(M.view({ ...stamina, paidDay: M.day(now) }, now + 86400000).paidRefillsToday, 0);
assert.equal(86400000 / interval / M.HUNT_COST, 12);
assert.equal(M.MAX_STAMINA / M.HUNT_COST, 10);
// Maximum daily pools at a fixed level before losses, XP caps, and random items.
const totals = [1, 20, 79, 80, 100].map(level => ({ level,
  naturalGold: M.balance(level).gold * 12, paidExtraGold: M.balance(level).gold * 10,
  bankedExtraGold: M.balance(level).gold * 10,
  naturalXpPool: M.balance(level).xp * 12, paidExtraXpPool: M.balance(level).xp * 10 }));
console.log(JSON.stringify({ passed: true, rewardBudget: totals }));

// Exercise the existing server combat and departure-recovery implementations
// with NPC defense, including exact-power losses and very large armies.
const fs = require('node:fs'), vm = require('node:vm');
const server = fs.readFileSync(require.resolve('../functions/index.js'), 'utf8');
const context = vm.createContext({ Math, Number,
  safeNumber: (n, fallback=0) => Number.isFinite(Number(n)) ? Number(n) : fallback,
  clamp: (n, min, max) => Math.min(max, Math.max(min,n)),
  clampInt: (n, min, max) => Math.min(max, Math.max(min,Math.floor(n))),
  timestampToMs: value => Number(value) || 0,
  // PvP protection and fortifications do not participate in neutral NPC combat.
  normalizeAttackProtectionSnapshot: () => null, usesSiegeCombat: () => false,
  normalizeCharacterProgress: character => character,
  COMMON_GEAR: require('../common-gear.js'),
  BASE_TROOP_ATTACK_POWER: require('../functions/economy-config.json').troopCombat.baseAttackPowerPerTroop,
});
for (const match of server.matchAll(/const (HERO_XP_[A-Z_]+|BATTLE_XP_[A-Z_]*CAP[A-Z_]*|CHARACTER_START_LEVEL|ATTACK_COMBAT_SNAPSHOT_VERSION) = ([0-9.]+);/g)) context[match[1]] = Number(match[2]);
for (const name of ['calculateCombatResult','normalizeAttackCombatSnapshot','getSnapshottedAttackPower','getXpRequiredForLevel','getBattleXpLevelCapRate','capBattleXpForHeroLevel']) {
  const start=server.indexOf('function '+name+'('), end=server.indexOf('\nfunction ',start+10);
  assert(start>=0&&end>start);vm.runInContext(server.slice(start,end),context);
}
for (let level=1;level<=100;level++) {
  const defense=M.balance(level).defenders;
  for (const attack of [1,defense,defense+1,defense*2,defense*1000]) {
    const troops=Math.max(1,Math.ceil(attack/context.BASE_TROOP_ATTACK_POWER));
    const result=context.calculateCombatResult(troops,{troops:defense},null,null,{targetType:'marauder',siegeCombatVersion:0,defensePower:defense,attackPower:attack});
    assert.equal(result.success,attack>defense);assert.equal(result.survivors+result.attackerLosses,troops);
    assert.equal(result.defendersLeft+result.defenderLosses,defense);
    assert(result.success ? result.survivors>0&&result.defendersLeft===0 : result.survivors===0&&result.defendersLeft>0);
    for (const recovery of [0,25,90,150]) {
      const snapshot=context.normalizeAttackCombatSnapshot({version:2,attackPowerPerTroop:1.25,launchTroops:troops,casualtyRecovery:{fieldMedicsPercent:recovery,gearPercent:recovery,items:[]}});
      const recovered=Math.floor(result.attackerLosses*snapshot.casualtyRecovery.combinedPercent/100);
      assert(snapshot.casualtyRecovery.combinedPercent<=90);assert(recovered+result.survivors<=troops);
    }
  }
  for (const hero of [1,50,51,100,150,500]) {
    const awarded=context.capBattleXpForHeroLevel(M.balance(level).xp,{character:{level:hero,xp:0}});
    assert(Number.isSafeInteger(awarded)&&awarded>=0&&awarded<=M.balance(level).xp);
  }
}
const starter=context.calculateCombatResult(200,{troops:100},null,null,{targetType:'marauder',siegeCombatVersion:0,defensePower:100,attackPower:250});
assert.equal(starter.attackerLosses,55);assert.equal(starter.survivors,145);
assert.equal(context.capBattleXpForHeroLevel(200000,{character:{level:1,xp:0}}),250);
console.log('All 100 NPC levels: combat boundaries, starter loss, extreme forces, departure recovery cap and individual Hero XP caps passed.');
