"use strict";
const assert=require("node:assert/strict"),E=require("../functions/estate-economy"),S=require("../functions/estate-services");
const recipes=E.C.producers.filter(p=>Object.keys(p.inputs).length);
function estate(level=1){const s=E.initial(0);for(const key in s.levels)s.levels[key]=level;for(const p of E.C.producers)s.processors[p.building]=false;return s;}
for(const p of recipes)for(const level of [1,25,50,75,100]){
 const s=estate(level);for(const [key,ratio]of Object.entries(p.inputs)){s.stock[key]=ratio*25+.5;s.reserves[key]=ratio*5;}
 s.stock[p.output]=E.capacity(s,p.output)-30;
 const before=structuredClone(s),recipe=E.productionRecipe(s,p.building);
 assert.equal(recipe.maxQuantity,20);assert.deepEqual(s,before,"Listing a recipe starts and pays nothing");
 for(const quantity of [0,-1,1.5,"1",21,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>E.productionQuote(s,p.building,quantity));assert.deepEqual(s,before,"Invalid quantities cannot change the account");
 }
 const q=E.productionQuote(s,p.building,20);
 assert.equal(q.durationMs,Math.ceil(20/(p.basePerHour*E.multiplier(level))*E.HOUR));
 E.startProduction(s,q,"batch_"+p.building,0);
 for(const [key,ratio]of Object.entries(p.inputs))assert.equal(s.stock[key],before.stock[key]-ratio*20);
 assert.equal(E.pendingProduction(s,p.output),20);assert.equal(E.storageSpace(s,p.output),10);
 const paid=structuredClone(s);assert.throws(()=>E.startProduction(s,q,"second_batch",0),/Finish/);assert.deepEqual(s,paid);
 E.settle(s,Math.floor(q.durationMs/2));assert.equal(s.stock[p.output],before.stock[p.output],"The paid output arrives at completion");
 const restored=E.normalize(JSON.parse(JSON.stringify(s)),q.durationMs);
 E.settle(restored,q.durationMs);assert.equal(restored.stock[p.output],before.stock[p.output]+20);assert.equal(restored.productionOrders[p.building],undefined);
 const finished={...restored.stock};E.settle(restored,q.durationMs+1000*E.HOUR);assert.deepEqual(restored.stock,finished,"No repeat or downstream recipe may start automatically");
 assert.equal(E.snapshot(restored,restored.settledAtMs).resources[p.output].status,"Choose production");
}
assert.throws(()=>E.productionQuote(estate(),"quarry",1),/processing/);
let s=estate();s.levels.sawmill=0;assert.throws(()=>E.productionQuote(s,"sawmill",1),/Construct/);
s=estate();s.stock.timber=100;s.stock.planks=E.capacity(s,"planks");assert.equal(E.productionRecipe(s,"sawmill").maxQuantity,0);
assert.throws(()=>E.productionQuote(s,"sawmill",1),/storage/);
// A paid timer is frozen across an upgrade, regardless of new production speed.
s=estate();s.stock.timber=100;const frozen=E.productionQuote(s,"sawmill",20);E.startProduction(s,frozen,"frozen_batch",0);
s.jobs=[{id:"upgrade_sawmill",building:"sawmill",target:2,status:"running",startedAtMs:0,durationMs:60000,completesAtMs:60000}];
E.settle(s,60000);assert.equal(s.levels.sawmill,2);assert.equal(s.productionOrders.sawmill.durationMs,E.HOUR);assert.equal(s.stock.planks,0);
assert.equal(E.snapshot(s,60000).projection.untilMs,E.HOUR);E.settle(s,E.HOUR);assert.equal(s.stock.planks,20);
assert(E.productionQuote(s,"sawmill",20).durationMs<frozen.durationMs,"New batches benefit from the completed upgrade");
// Reservations protect paid outputs from supply packs and partial quest claims.
s=estate();const foodCapacity=E.capacity(s,"food");s.stock.grain=1000;s.stock.food=foodCapacity-51;E.startProduction(s,E.productionQuote(s,"windmill",50),"food_batch",0);
assert.throws(()=>S.supplyQuote(s,"food",.25,0),/storage/);
s.parcels=[{id:"reward_food",rewards:{food:10}}];assert.deepEqual(S.claimParcel(s,"reward_food"),{food:1});assert.equal(s.parcels[0].rewards.food,9);
E.settle(s,s.productionOrders.windmill.completesAtMs);assert.equal(s.stock.food,foodCapacity);assert.equal(s.parcels[0].rewards.food,9);
// Even an unexpected overfilled saved stock cannot destroy paid output.
s=estate();const plankCapacity=E.capacity(s,"planks");s.stock.timber=100;E.startProduction(s,E.productionQuote(s,"sawmill",20),"retained_batch",0);s.stock.planks=plankCapacity;
E.settle(s,E.HOUR);assert.equal(s.productionOrders.sawmill.status,"ready");assert.equal(s.productionOrders.sawmill.delivered,0);
s.stock.planks-=5;E.settle(s,E.HOUR);assert.equal(s.productionOrders.sawmill.delivered,5);assert.equal(s.stock.planks,plankCapacity);
s.stock.planks-=15;E.settle(s,E.HOUR);assert.equal(s.productionOrders.sawmill,undefined);assert.equal(s.stock.planks,plankCapacity);
E.settle(s,2*E.HOUR);assert.equal(s.stock.planks,plankCapacity,"Completed output is delivered once");
// Schema-compatible migration keeps fractions, credits, preferences and time.
const old=estate();delete old.productionPolicyVersion;delete old.productionOrders;old.stock.planks=2.25;old.stock.timber=100;old.processors.sawmill=true;
const migrated=E.normalize(old,E.HOUR);E.settle(migrated,E.HOUR);assert.equal(migrated.stock.planks,22.25);assert.equal(migrated.stock.timber,60);
E.settle(migrated,2*E.HOUR);assert.equal(migrated.stock.planks,22.25);assert.equal(migrated.stock.timber,60);assert.deepEqual(migrated.productionOrders,{});
assert.throws(()=>E.normalize({...old,productionOrders:null},0),/ledger/);
console.log("Manual production passed: four recipes, all milestone speeds, quantity/input/reserve/storage gates, one-time payment, frozen timers, offline persistence, safe reserved output, legacy accrual and no automatic repeat.");
