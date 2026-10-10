"use strict";
// Local draft regression: extra members must not dilute existing contributions.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const context={window:{},crypto:require("node:crypto").webcrypto};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,"../docs/visual-qa/guild-master/game-fixture.js"),"utf8"),context);
const M=context.window.GuildReviewModel;
const person=(id,type,level=1,roll=0)=>({id,name:id,type,level,base:M.types[type].base.map(v=>v+roll),recoveryUntilMs:0});
const state=members=>({members,party:members.map(c=>c.id),leader:members[0]?.id,route:"direct",approach:"balanced",supply:false,rooms:{infirmary:0}});
const escort=M.missions.find(m=>m.id==="escort");
const example=state([person("guard","guard",3),person("scout","scout",3),person("scholar","scholar")]);
example.party=["guard","scout"];
const two=M.forecast(example,escort);
assert.equal(two.success,88,"Existing reference two-member forecast stays at 88%");
example.party.push("scholar");
const three=M.forecast(example,escort);
assert.equal(three.success,92.5,"A lower-level non-specialist helps instead of diluting the party");
assert.equal(three.target,two.target,"Adding members never raises contract difficulty");
assert.equal(three.leaderBonus,two.leaderBonus,"Adding members never changes leader weight");
assert(three.readiness>two.readiness);
example.party=example.party.filter(id=>id!=="scholar");
assert.equal(M.forecast(example,escort).success,88,"Removal restores prior odds, not higher odds");
example.party=[];assert.equal(M.forecast(example,escort),null,"Empty party has no forecast");

let checked=0;
const types=Object.keys(M.types);
for(const mission of M.missions)for(const leaderType of types)for(const helperType of types)for(const extraType of types){
  for(const level of [1,10,100])for(const route of ["direct","patrolled","remote"])for(const approach of ["cautious","balanced","bold"])for(const supply of [false,true]){
    const s=state([person("leader",leaderType,level,2),person("helper",helperType,level,-2),person("extra",extraType,1,-2)]);
    Object.assign(s,{party:["leader","helper"],route,approach,supply});
    const before=M.forecast(s,mission);
    s.party.push("extra");const after=M.forecast(s,mission);
    assert(after.success>=before.success,"Every type contributes without lowering success");
    assert(after.readiness>before.readiness,"Even a weaker addition raises readiness");
    assert.equal(after.target,before.target);assert.equal(after.leaderBonus,before.leaderBonus);
    assert(after.signature>=before.signature&&after.traits>=before.traits);
    assert(after.success>=25&&after.success<=95);
    assert.equal(Math.round(after.success*10)+Math.round(after.partial*10)+Math.round(after.failure*10),1000);
    const baseContribution=after.contributions.find(c=>c.id==="extra").points;
    s.members[2].level=2;const stronger=M.forecast(s,mission);
    assert(stronger.contributions.find(c=>c.id==="extra").points>baseContribution);
    assert(stronger.success>=after.success,"Leveling a member never worsens odds");
    s.party.push("extra");assert.equal(M.forecast(s,mission).readiness,stronger.readiness,"Duplicate ID does not double-count a member");
    checked++;
  }
}
const leaderChange=state([person("guard","guard"),person("envoy","envoy")]);
const oldLeader=M.forecast(leaderChange,escort);leaderChange.leader="envoy";
const newLeader=M.forecast(leaderChange,escort);
assert.equal(newLeader.leaderId,"envoy");assert(newLeader.leaderBonus>oldLeader.leaderBonus);
assert.deepEqual(newLeader.contributions,oldLeader.contributions,"Changing leader changes only leadership, not member contributions");
const harder=M.forecast(leaderChange,{...escort,statTarget:48});
assert(harder.success<newLeader.success,"A fixed harder contract still challenges the same party");
console.log(`PASS Guild additive party forecast: ${checked.toLocaleString()} combinations; reference odds 88% → 92.5% with a third member; caps, leaders and fixed difficulty verified.`);
