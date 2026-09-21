"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const B = require("../clan-tower-buildings");
const T = require("../functions/holding-towers");
const now = Date.parse("2026-09-21T12:00:00Z"), minute = 60000;
const owned = patch => ({ ...T.createNeutralTowerState(T.TOWERS[0].id, { nowMs: now }), ownerKind: "clan", clanId: "clan-a", ownershipRevision: 1, wallIntegrityBps: 10000, ...patch });
const start = (s, id, at = now) => T.startBuilding(s, id, 30e9, { uid: "leader" }, at, "order").state;
const advance = T.materializeTowerState;
assert.deepEqual(B.normalizeLevels({ shop: 11, training: -1 }), {shop:10,workshop:0,infirmary:0,training:0});
assert.equal(B.DEFINITIONS.reduce((sum) => sum + Array.from({length:10}, (_,i) => B.cost(i+1)).reduce((a,b)=>a+b), 0), 20.46e9);
assert.equal(B.DURATION_MINUTES.reduce((a,b)=>a+b)*4, 14*24*60+6*60);
for (const id of B.DEFINITIONS.map(d=>d.id)) {
  let tower = owned(), at = now;
  for (let level = 1; level <= 10; level++) {
    const prior = tower.buildings[id]; tower = start(tower,id,at);
    assert.equal(advance(tower,at+B.duration(level)-1).buildings[id],prior);
    at += B.duration(level); tower = advance(tower,at);
    assert.equal(tower.buildings[id],level); assert.equal(tower.buildingProject,null);
    assert(fs.existsSync(path.join(__dirname,"..",B.art(id,level))));
  }
  assert.throws(()=>start(tower,id,at), /building-level-limit/);
}
let tower = start(owned(), "workshop");
assert.throws(()=>start(tower,"shop"), /building-project-active/);
assert.throws(()=>start(owned({wallIntegrityBps:9999}),"shop"), /tower-wall-damaged/);
assert.throws(()=>start(owned({attackBlocked:true,incomingRallyIds:["attack"]}),"shop"), /tower-under-rally-attack/);
const blocked = advance({...tower,attackBlocked:true,incomingRallyIds:["attack"]}, now+10*minute);
assert.equal(blocked.buildingProject.remainingMs,20*minute);
assert.equal(advance(blocked,now+60*minute).buildings.workshop,0);
const resumed = advance({...blocked,attackBlocked:false,incomingRallyIds:[]},now+60*minute);
assert.equal(advance(resumed,now+80*minute).buildings.workshop,1);
// Wall and building queues progress independently; queued duration is locked at its start.
const wall = T.queueWallUpgrades(tower,4,1e8,()=>1,now,"walls").state;
const after = advance(wall,now+36*minute);
assert.equal(after.wallLevel,4); assert.equal(after.buildings.workshop,1);
assert.equal(after.upgradeQueue[0].durationMs,16*minute*.95);
assert.equal(after.upgradeQueue[0].progressStartedAtMs,now+36*minute);
const active = T.queueWallUpgrades(owned(),1,1e8,()=>1,now,"active").state;
assert.equal(advance({...active,buildings:{workshop:10}},now+minute).upgradeQueue[0].durationMs,10*minute);
assert.equal(B.wallDuration(150,10),153*minute);
const legacy = owned({wallLevel:90,upgradeQueue:[{id:"legacy",fromLevel:90,targetLevel:91,remainingMs:600000,progressStartedAtMs:now,paidCost:1}]});
assert.equal(advance(legacy,now+600000).wallLevel,91);
const repair = T.startPaidRepair(owned({buildings:{workshop:10},wallIntegrityBps:5000}),1e8,()=>1,()=>60,{uid:"leader"},now,"repair").state;
assert.equal(repair.repair.completeAtMs-now,15*minute);
const capture = T.conquerTower(start(owned({buildings:{shop:10,workshop:1,infirmary:0,training:4}}),"infirmary"),{id:"clan-b"},now+minute);
assert.deepEqual(capture.buildings,{shop:9,workshop:1,infirmary:0,training:3});assert.equal(capture.buildingProject,null);
assert.deepEqual(T.createNeutralTowerState(T.TOWERS[0].id).buildings,B.normalizeLevels());
// Every catalogue stage, UTC daily reset, rolling Shield cooldown, and level-loss accounting.
for(let level=0;level<=10;level++) for(const item of B.shopStatus(level,{},now)) {
  assert.equal(item.unlocked,level>=item.unlockLevel);
  assert.equal(item.limit, level<item.unlockLevel ? 0 : item.increaseLevel && level>=item.increaseLevel ? 2 : 1);
}
let usage=B.purchaseUsage(10,{},"swift_march_order",2,now);
assert.equal(B.shopStatus(1,usage,now).find(i=>i.id==="swift_march_order").remaining,0);
assert.equal(B.shopStatus(10,usage,now).find(i=>i.id==="swift_march_order").remaining,0);
assert.throws(()=>B.purchaseUsage(10,usage,"swift_march_order",1,now),/purchase-limit/);
assert.equal(B.shopStatus(10,usage,Date.parse("2026-09-22T00:00:00Z")).find(i=>i.id==="swift_march_order").remaining,2);
usage=B.purchaseUsage(10,usage,"shield_12h",1,now);
assert.equal(B.shopStatus(10,usage,now+72*60*minute-1).at(-1).remaining,0);
assert.equal(B.shopStatus(10,usage,now+72*60*minute).at(-1).remaining,1);
assert.throws(()=>B.purchaseUsage(8,{},"common_gear_box",1,now),/item-locked/);
// Execute production combat helpers, including the capped attribution that reports display.
const server=fs.readFileSync(path.join(__dirname,"../functions/index.js"),"utf8");
function extract(name){const start=server.indexOf(`function ${name}(`);assert(start>=0);const next=server.indexOf("\nfunction ",start+10);return server.slice(start,next);}
const context=vm.createContext({COMMON_GEAR:require("../common-gear"),BASE_TROOP_ATTACK_POWER:1.25,RALLY_PARTICIPANT_INBOUND:"inbound",safeNumber:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,getSkillPercent:(p,s)=>s==="fieldMedics"?p.medic||0:p.sword||0,getSkillLevel:()=>0,getCommonGearBonuses:p=>({casualtyEfficiency:p.gear||0,attackStrength:p.attackGear||0}),skillMultiplier:p=>1+(p.sword||0)/100,addCommonGearMarchSpeed:(p,k,m)=>m,normalizeRallyParticipant:p=>p,normalizePlayerName:(v,f)=>v||f,normalizeRegionId:v=>v});
for(const name of ["getCasualtyRecoveryPercent","createRallyParticipantSnapshot","createBattleCasualtyRecoverySnapshot","createBattleAttackPowerBreakdown"]) vm.runInContext(extract(name),context);
assert.equal(context.getCasualtyRecoveryPercent({medic:50,gear:9}),59);
assert.equal(context.getCasualtyRecoveryPercent({medic:50,gear:9},15),74);
assert.equal(context.getCasualtyRecoveryPercent({medic:80,gear:9},15),90);
const recovery=context.createBattleCasualtyRecoverySnapshot({losses:1000,recoveredTroops:900,fieldMedicsPercent:80,casualtyGearPercent:9,clanInfirmaryPercent:15});
assert.equal(recovery.appliedClanPercent,1);assert.equal(recovery.clanRecoveredTroops,10);assert.equal(recovery.gearRecoveredTroops,90);
const profile={sword:20,attackGear:9};
const rally=context.createRallyParticipantSnapshot({uid:"one",source:{id:"tower"},profile,troops:1000,clanTrainingPercent:10});
assert(Math.abs(rally.attackPowerPerTroop-1.7375)<1e-12);profile.sword=0;assert.equal(rally.clanTrainingPercent,10);
const breakdown=context.createBattleAttackPowerBreakdown(1250,1737,20,9,10);
assert.equal(Object.entries(breakdown).filter(([k])=>k!=="totalAttackPower").reduce((s,[,v])=>s+v,0),1737);
assert(breakdown.clanTrainingBonusPower>0);
assert.equal(context.createRallyParticipantSnapshot({uid:"one",source:{id:"city"},profile,troops:1000}).clanTrainingPercent,0);
assert.equal(fs.readFileSync(path.join(__dirname,"../functions/clan-tower-buildings.js"),"utf8"),fs.readFileSync(path.join(__dirname,"../clan-tower-buildings.js"),"utf8"));
console.log("Clan buildings: all 40 levels, costs/timers, pause/resume, simultaneous queues, legacy wall timers, Workshop repairs, capture/reset, all Shop tiers/stock/cooldowns, recovery cap/attribution and rally launch snapshots passed.");
