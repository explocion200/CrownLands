"use strict";
const assert = require("node:assert/strict");
const M = require("../functions/marauder-rules");
for (let value = 0; value <= 100; value++) assert.equal(M.refillPrice(value), value === 100 ? 0 : 30);
assert.equal(M.REFILL_VERSION, 4);
assert.equal(M.BOSS_HUNT_COST, 20);
assert.equal(M.HUNT_COST, 10);
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
  assert.equal(slots.length, region.permanentCore ? 1 : 2);
  for (const slot of slots) assert.equal(slot.classification === "boss", region.permanentCore);
}
assert.equal(M.slots({ permanentCore: false, spawnEligible: false }).length, 2);
assert.deepEqual(M.slots({ permanentCore: false }).map(({ min, max }) => [min, max]), [[1, 10], [11, 79]]);
assert.deepEqual(M.slots({}), []);
const now = Date.UTC(2026, 9, 22);
let stamina = M.changeStamina(null, -10, now);
assert.equal(stamina.value, 90);
for (const elapsed of [0, 12*60000, 86400000, 90*86400000]) {
  assert.equal(M.stamina(stamina, now + elapsed).value, 90);
  assert.equal(M.view(stamina, now + elapsed).nextPointAtMs, null);
  assert.equal(M.view(stamina, now + elapsed).fullAtMs, null);
}
stamina = M.changeStamina(stamina, -10, now + 86400000);
assert.equal(stamina.value, 80);
assert.throws(() => M.changeStamina(stamina, 10, now), /30-Crown refill/);
assert.throws(() => M.changeStamina({ ...stamina, value: 9 }, -10, now));
assert.equal(M.view({ ...stamina, paidDay: M.day(now) }, now).paidRefillsToday, 1);
assert.equal(M.view({ ...stamina, paidDay: M.day(now) }, now + 86400000).paidRefillsToday, 0);
assert.equal(M.view({ ...stamina, paidDay: M.day(now) }, now + 86400000).value, 80);
assert.equal(M.MAX_STAMINA / M.HUNT_COST, 10);
assert.equal(M.MAX_STAMINA / M.BOSS_HUNT_COST, 5);
assert.throws(() => M.changeStamina({ ...stamina, value: 19 }, -20, now), /20 stamina/);
assert.equal(M.changeStamina({ ...stamina, value: 20 }, -20, now).value, 0);
assert.equal(M.view({ ...stamina, value: 70 }, now).bossHunts, 3);
const today = M.day(now), tomorrow = M.day(now + 86400000);
let daily = M.dailyStamina({...stamina,value:0,dailyResetDay:today,paidDay:today}, now+86400000-1);
assert.equal(daily.value,0);
daily = M.dailyStamina(daily, now+86400000);
assert.equal(daily.value,100); assert.equal(daily.dailyResetDay,tomorrow);
assert.equal(M.view(daily,now+86400000).paidRefillsToday,0);
daily = M.changeStamina(daily,-20,now+86400000);
assert.equal(M.dailyStamina(daily,now+86400000+60000).value,80);
assert.equal(M.dailyStamina(daily,now+100*86400000).value,100);
assert.equal(M.dailyStamina(daily,now).value,80,"A backward clock cannot grant an extra reset");
assert.throws(()=>M.dailyStamina({...daily,dailyResetDay:"2026-02-30"},now));
assert.equal(M.view(daily,now+100*86400000).value,80,"The client must not predict a free reset");

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

// Balance v2 is frozen independently of economy progression and stamina versions.
const approved = require('node:fs').readFileSync(require('node:path').join(__dirname, '../docs/MARAUDER_REWARD_BALANCE_DRAFT.md'), 'utf8');
const expected = approved.split('\n').map(line => line.split('|').slice(1,-1).map(s => s.trim()))
  .filter(c => [5,6].includes(c.length) && c.slice(0,4).every(v => /^[\d,]+$/.test(v)) && c[4].includes('%'));
assert.equal(expected.length,100);
for (const cells of expected) {
  const [level, defenders, gold, xp] = cells.slice(0,4).map(v => Number(v.replaceAll(',','')));
  const config = M.balance(level,2);
  assert.deepEqual([config.defenders,config.gold,config.xp],[defenders,gold,xp]);
  assert.equal(config.itemChanceBps,Math.round(parseFloat(cells[4])*100));
  assert.equal(config.boxChanceBps,cells[5] ? Math.round(parseFloat(cells[5])*100) : 0);
  const members = Array.from({length:level<80?1:5},(_,i)=>({uid:'member'+i,attackPower:defenders+1}));
  const rolls=members.flatMap(()=>[0,.99,0,0]);
  const loot=M.rewards(level,defenders,members,rolls,2);
  assert.equal(Object.values(loot.gold).reduce((a,b)=>a+b,0),gold);
  assert.equal(Object.values(loot.xp).reduce((a,b)=>a+b,0),xp);
  assert.equal(Object.values(loot.damage).reduce((a,b)=>a+b,0),defenders);
  for(const p of members){
    assert.equal(loot.items[p.uid],'shield_12h');
    assert.equal(loot.gearBoxes[p.uid],level<80?null:level===80?'common':'uncommon');
  }
  assert.deepEqual(M.rewards(level,defenders,[...members].reverse(),rolls,2),loot,'Stable UID order');
  const boundary=members.flatMap(()=>[config.itemChance,0,config.boxChanceBps/10000,config.uncommonUpgradeBps/10000]);
  // A guaranteed consumable's roll must still be strictly below one.
  if(level===100)boundary.forEach((_,i)=>{if(i%4===0)boundary[i]=.999999;});
  const noDrop=M.rewards(level,defenders,members,boundary,2);
  assert(Object.values(noDrop.gearBoxes).every(v=>v===null));
  assert(Object.values(noDrop.items).every(v=>level===100?v!==null:v===null));
  if(level>=80){
    const common=M.rewards(level,defenders,members,members.flatMap(()=>[0,0,0,config.uncommonUpgradeBps/10000]),2);
    assert(Object.values(common.gearBoxes).every(v=>v==='common'),'Upgrade boundary gives Common, never a second box');
  }
}
for(const version of [0,3,null,'2',NaN])assert.throws(()=>M.balance(80,version));
assert.deepEqual(M.balance(80),M.balance(80,1),'Missing version remains legacy');
assert.equal(M.stamina({version:1,value:50,recoveredAtMs:0,revision:1,paidDay:''},0).value,50);
const contribution=(powers,level=80)=>M.bossEligibility(level,powers.map((attackPower,i)=>({uid:'p'+i,attackPower})));
for(const [powers,valid] of [
  [[500000,500000],true],[[499999,500000],false],[[7000000,3000000],true],[[7000001,2999999],false],
  [[5500000,2250000,2250000],true],[[5500001,2249999,2250000],false],
  [[4500000,2000000,2000000,1500000],true],[[4500001,1999999,2000000,1500000],false],
  [[4000000,1500000,1500000,1500000,1500000],true],[[4000001,1499999,1500000,1500000,1500000],false],
  [[10000000,10000000,10000000,10000000,999999],false],
  [[1000000],false],[[1000000,1000000,1000000,1000000,1000000,1000000],false],
])assert.equal(contribution(powers).eligible,valid,JSON.stringify(powers));
assert(contribution([500000,500000]).eligible,'A losing forecast alone must not block launch');
assert(contribution(Array(5).fill(Number.MAX_SAFE_INTEGER)).eligible,'Exact comparisons beyond Number sum precision');
assert.throws(()=>M.bossEligibility(80,[{uid:'a',attackPower:1},{uid:'a',attackPower:2}]));
console.log('Balance v2: all 100 approved rows, exact contribution boundaries, personal drops, rarity replacement, conserved pools and legacy/stamina isolation passed.');

// New departure policy: one troop qualifies; every member gets the full reward.
for(let level=80;level<=100;level++)for(let count=2;count<=5;count++){
  const config=M.balance(level,2);
  const members=Array.from({length:count},(_,i)=>({uid:'p'+i,attackPower:i?1:config.defenders+1}));
  const readiness=M.bossEligibility(level,members,M.BOSS_REWARD_VERSION);
  assert(readiness.eligible && readiness.members.every(p=>p.eligible));
  assert(readiness.members.every(p=>p.gold===config.gold && p.xp===config.xp));
  const rolls=members.flatMap((_,i)=>i%2?[.999999,0,.999999,0]:[0,0,0,.999999]);
  const loot=M.rewards(level,config.defenders,members,rolls,2,M.BOSS_REWARD_VERSION);
  for(const [i,p] of members.entries()){
    assert.equal(loot.gold[p.uid],config.gold);assert.equal(loot.xp[p.uid],config.xp);
    assert.equal(loot.items[p.uid],i%2&&level<100?null:'war_drums_30m');
    assert.equal(loot.gearBoxes[p.uid],i%2?null:'common','Each member has independent box randomness');
  }
  assert.equal(Object.values(loot.gold).reduce((a,b)=>a+b,0),count*config.gold);
  assert.equal(Object.values(loot.xp).reduce((a,b)=>a+b,0),count*config.xp);
  assert.equal(Object.values(loot.damage).reduce((a,b)=>a+b,0),config.defenders);
  assert.deepEqual(M.rewards(level,config.defenders,[...members].reverse(),rolls,2,M.BOSS_REWARD_VERSION),loot);
  assert.deepEqual(M.rewards(level,config.defenders,members,rolls,2,M.BOSS_REWARD_VERSION),loot,'Retry reuses the same personal drops');
}
for(const powers of [[1],[1,1,1,1,1,1],[1,0]]){
  const members=powers.map((attackPower,i)=>({uid:'p'+i,attackPower}));
  assert.equal(M.bossEligibility(80,members,M.BOSS_REWARD_VERSION).eligible,false);
}
const tiny=[{uid:'a',attackPower:1},{uid:'b',attackPower:1}];
assert(M.bossEligibility(80,tiny,M.BOSS_REWARD_VERSION).eligible,'A losing forecast does not prevent launch');
assert.throws(()=>M.rewards(80,5000000,tiny,Array(8).fill(0),2,M.BOSS_REWARD_VERSION),'Defeat pays no loot');
for(const version of [0,3,null,'2',NaN]){
  assert.throws(()=>M.bossEligibility(80,tiny,version));
  assert.throws(()=>M.rewards(80,1,tiny,Array(8).fill(0),2,version));
}
assert.throws(()=>M.bossEligibility(80,[tiny[0],tiny[0]],M.BOSS_REWARD_VERSION));
assert.throws(()=>M.rewards(79,1,tiny,Array(8).fill(0),2,M.BOSS_REWARD_VERSION),'Personal boss policy cannot alter solo rewards');
assert.throws(()=>M.rewards(80,1,tiny,Array(8).fill(0),1,M.BOSS_REWARD_VERSION),'Legacy NPC encounters remain unchanged');
console.log('Boss departure policy: all 21 levels, 2–5 members, one-power contributions, full personal Gold/XP, independent drops, deterministic retries and invalid policies passed.');
