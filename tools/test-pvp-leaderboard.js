"use strict";
const assert=require("node:assert/strict");
const {creditForBattle,eventForBattle}=require("../functions/pvp-leaderboard");
const row=(ownerUid,startingTroops,losses,effectivePower=startingTroops)=>({ownerUid,startingTroops,losses,effectivePower});
const battle=(extra={})=>({battleId:"battle",target:{targetType:"city"},attacker:row("a",100,40),defender:row("d",80,50),...extra});
const sorted=value=>value.slice().sort((a,b)=>a.uid.localeCompare(b.uid));
assert.deepEqual(sorted(creditForBattle(battle())),[{uid:"a",kills:50},{uid:"d",kills:40}]);
assert.deepEqual(creditForBattle(battle({defender:row("",80,50)})),[],"Neutral battles do not count on either side.");
assert.deepEqual(creditForBattle(battle({defender:row("a",80,50)})),[],"Self attacks do not count.");
assert.deepEqual(creditForBattle(battle({attacker:{...row("a",100,40),clan:{clanId:"same"}},defender:{...row("d",80,50),clan:{clanId:"same"}}})),[],"Friendly clans do not count.");
const mixed=battle({target:{targetType:"tower"},defender:row("",200,100),reinforcements:[row("d",50,25),row("e",50,25)]});
assert.equal(creditForBattle(mixed).find(row=>row.uid==="a").kills,50,"Neutral share must not enter player kill totals.");
const recovered=battle({gearEffects:{attacker:{casualtyRecovery:{recoveredTroops:30}},defender:{casualtyRecovery:{recoveredTroops:40}}}});
assert.deepEqual(creditForBattle(recovered),creditForBattle(battle()),"Recovery does not change raw defeated troops.");
assert.deepEqual(creditForBattle(battle({defender:row("d",0,0),siege:{startingWallPower:100}})),[{uid:"d",kills:40}],"An owned city wall can defeat player attackers without a garrison.");
for(let pool=1;pool<150;pool++){
 const sample=battle({attackers:[row("c",20,3,90),row("a",20,3,20),row("b",20,3,20)],defender:row("d",200,pool),totals:{attackerLosses:9}});
 const credit=creditForBattle(sample);
 assert.equal(credit.filter(row=>row.uid!=="d").reduce((sum,row)=>sum+row.kills,0),pool);
 assert.equal(credit.find(row=>row.uid==="d").kills,9);
 assert.deepEqual(sorted(credit),sorted(creditForBattle({...sample,attackers:sample.attackers.slice().reverse()})));
}
const event=eventForBattle({...battle(),worldId:"world",resetGeneration:"season",occurredAtMs:123},"shard_0001");
assert.equal(event.resetGeneration,"season");assert.equal(event.occurredAtMs,123);
assert.equal(eventForBattle(battle({defender:row("",80,50)}),"shard_0001"),null);
console.log("PvP accounting passed: solo, rally allocation/conservation, mixed neutral garrisons, city walls, friendly/self exclusion, raw casualties and deterministic rounding.");
