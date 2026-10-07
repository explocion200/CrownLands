"use strict";
// Design arithmetic only. No imports from the server, writes to players or runtime config.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const estate = require("../inner-city-estate");
const directory = path.join(__dirname, "../docs/estate-economy");
const config = JSON.parse(fs.readFileSync(path.join(directory, "draft-config.json"), "utf8"));
const keys = config.producers.map(p => p.output), byKey = Object.fromEntries(config.buildings.map(b => [b.key, b]));
const polynomial = (coefficients, level) => coefficients.reduce((sum, value, power) => sum + value * level ** power, 0);
const multiplier = level => 1 + config.productionGrowth * (level - 1);
function cost(building, target) {
  if(target===1)return {};
  const stage = config.stages.find(s => target >= s.min && target <= s.max);
  const units = polynomial(stage.units, target), weights = {...config.defaultWeights, ...building.weights};
  return Object.fromEntries(stage.active.filter(k => weights[k] > 0).map(k => [k, Math.ceil(units * weights[k] * building.factor * (building.permanent ? config.permanentCostFactor : 1))]));
}
const capacity = (key, levels) => polynomial(["grain", "food"].includes(key) ? config.granaryCapacity : config.storehouseCapacity, levels[["grain", "food"].includes(key) ? "granary" : "storehouse"]);
const slots = level => config.buildersSlots.filter(([at]) => level >= at).at(-1)[1];
const duration = (building, target, builders) => Math.ceil(polynomial(config.upgradeMinutes, target) * building.factor * (building.permanent ? config.permanentCostFactor : 1) * (1 - config.builderReductionAt100 * (builders - 1) / 99));
const goldFee = (building, target) => Math.ceil(config.referenceGoldPerHour * polynomial(config.upgradeGoldHours, target) * building.factor * (building.permanent ? config.permanentCostFactor : 1));
function netRates(level) {
  const rates = Object.fromEntries(keys.map(k => [k, 0]));
  for(const p of config.producers){const rate = p.basePerHour * multiplier(level); rates[p.output] += rate; for(const [k, quantity] of Object.entries(p.inputs))rates[k] -= rate * quantity;}
  return rates;
}
// Ten-minute discrete model: all twenty sites start at L1, no Gold limitation,
// quests, Crowns or manual factory changes. Factory inputs and storage are explicit.
function simulate(policy) {
  const levels = Object.fromEntries(config.buildings.map(b => [b.key, 1]));
  const stock = Object.fromEntries(keys.map(k => [k, 0])), jobs = [], milestones = {}, maxHours = 24 * 365;
  const dt = 1 / 6;
  for(let hours = 0; hours <= maxHours; hours += dt) {
    for(let i=jobs.length-1;i>=0;i--)if(jobs[i].finish!==undefined && jobs[i].finish<=hours){levels[jobs[i].key]=jobs[i].target;jobs.splice(i,1);}
    if(policy==="three-visits-monthly-reset"&&Math.round(hours/dt)>0&&Math.round(hours/dt)%(config.seasonDays*24/dt)===0){
      jobs.length=0;
      config.buildings.filter(b=>!b.permanent).forEach(b=>{levels[b.key]=1;});
      keys.forEach(k=>{stock[k]=0;});
    }
    const seasonal = config.buildings.filter(b => !b.permanent);
    for(const goal of [25,50,75,100]) {
      if(!milestones["hall"+goal] && levels["great-hall"]>=goal)milestones["hall"+goal]=hours;
      if(!milestones["seasonal"+goal] && seasonal.every(b => levels[b.key]>=goal))milestones["seasonal"+goal]=hours;
      if(!milestones["all"+goal] && config.buildings.every(b => levels[b.key]>=goal))milestones["all"+goal]=hours;
    }
    if(config.buildings.every(b => levels[b.key]===100))return {milestones, hours, levels};
    const candidates = config.buildings.filter(b => levels[b.key]<100 && !jobs.some(j => j.key===b.key) && (b.key==="great-hall" || b.permanent || levels[b.key]+1<=Math.min(100,levels["great-hall"]+5)));
    candidates.sort((a,b) => {
      const score = x => levels[x.key] + (policy!=="balanced" && x.permanent ? 35 : 0);
      return score(a)-score(b) || config.buildings.indexOf(a)-config.buildings.indexOf(b);
    });
    const limitedVisits=policy.startsWith("three-visits");
    if(!limitedVisits || Math.round(hours/dt)%48===0)for(const b of candidates) {
      if(jobs.length>=(limitedVisits ? 30 : slots(levels["builders-yard"])))break;
      for(let step=1;step<=(limitedVisits ? 5 : 1);step++){
        const target=levels[b.key]+step;
        if(target>100 || jobs.length>=(limitedVisits ? 30 : slots(levels["builders-yard"])) || (!b.permanent && b.key!=="great-hall" && target>levels["great-hall"]+5))break;
        const materials = cost(b, target);
        if(!Object.entries(materials).every(([k,v]) => stock[k]>=v))break;
        for(const [k,v] of Object.entries(materials))stock[k]-=v;
        jobs.push({key:b.key,target});
      }
    }
    let active=jobs.filter(j=>j.finish!==undefined).length;
    for(const job of jobs){
      if(active>=slots(levels["builders-yard"]))break;
      if(job.finish!==undefined || jobs.some(j=>j!==job&&j.key===job.key&&j.finish!==undefined))continue;
      job.finish=hours+duration(byKey[job.key],job.target,levels["builders-yard"])/60;active++;
    }
    assert(jobs.filter(j=>j.finish!==undefined).length<=slots(levels["builders-yard"]));
    assert(jobs.length<=30);
    const activeKeys=jobs.filter(j=>j.finish!==undefined).map(j=>j.key);
    assert.equal(new Set(activeKeys).size,activeKeys.length,"A building cannot run two simultaneous upgrades");
    for(const p of config.producers) {
      let quantity = Math.min(p.basePerHour * multiplier(levels[p.building]) * dt, Math.max(0,capacity(p.output,levels)-stock[p.output]));
      for(const [k,v] of Object.entries(p.inputs))quantity=Math.min(quantity,stock[k]/v);
      quantity=Math.max(0,quantity);
      for(const [k,v] of Object.entries(p.inputs))stock[k]-=quantity*v;
      stock[p.output]+=quantity;
    }
    for(const k of keys)assert(stock[k]>=-1e-7 && stock[k]<=capacity(k,levels)+1e-7);
  }
  throw Error("Draft model stalled before one year: "+policy);
}
assert.equal(config.maxLevel, estate.maxLevel);
assert.deepEqual(Object.keys(byKey).sort(), estate.buildings.map(b => b.key).sort());
assert.equal(config.buildings.filter(b => b.permanent).length,4);
const produced=new Set();
for(const producer of config.producers){for(const ingredient of Object.keys(producer.inputs))assert(produced.has(ingredient),"Recipes must form an acyclic feedstock chain");assert(!produced.has(producer.output));produced.add(producer.output);}
assert.deepEqual([...produced].sort(),estate.resources.map(r=>r.key).filter(k=>!["gold","crowns"].includes(k)).sort());
assert(config.buildings.every(b=>b.gold1>0&&b.minutes1>0));
const walk = (key, seen=new Set()) => { assert(!seen.has(key),"Circular L1 prerequisite: "+key);const next=new Set(seen).add(key);for(const dependency of byKey[key].requires1){assert(byKey[dependency]);walk(dependency,next);} };
config.buildings.forEach(b => walk(b.key));
const report = [], table = ["# Estate draft — all 100 levels", "", "PROPOSED arithmetic; this file does not configure gameplay. Generated with `node tools/validate-estate-economy-draft.js --write`.", "", "Materials = ceil(units × resource weight × building factor × permanence factor). Use the building weights in draft-config.json; permanence factor is 2 for the four officer buildings and 1 otherwise. Level 1 has only its fixed Gold construction fee. Gold hours below are multiplied by raw Main City Gold/hour, building factor and permanence factor, then rounded up. Minutes below are before those factors and the Builders' Yard reduction.", "", "| Target level | Production multiplier | Material units | Newly available construction input | Base Gold hours | Base minutes | Storehouse / material | Granary / food type |", "|---:|---:|---:|---|---:|---:|---:|---:|"];
let previous = 0;
for(let level=1;level<=100;level++) {
  const rates = netRates(level);
  assert(Object.values(rates).every(v=>v>0), "Factories must leave sustainable net stocks");
  assert(polynomial(config.storehouseCapacity,level)>=config.producers[0].basePerHour*multiplier(level)*24,"Storehouse must hold >=24h of gross Timber at matched levels");
  assert(polynomial(config.granaryCapacity,level)>=80*multiplier(level)*24,"Granary must hold >=24h of gross Grain at matched levels");
  const previousLevels=Object.fromEntries(config.buildings.map(x=>[x.key,Math.max(1,level-1)]));
  for(const b of config.buildings){const c=cost(b,level);for(const [k,v] of Object.entries(c)){assert(v>0 && v<=capacity(k,previousLevels),"Upgrade must fit previous-level storage");if(level>2)assert(v>=(cost(b,level-1)[k]||0),"Material costs must not decrease");}}
  if(level>1)for(const b of config.buildings){assert(Number.isSafeInteger(goldFee(b,level))&&goldFee(b,level)>0);if(level>2)assert(goldFee(b,level)>=goldFee(b,level-1),"Gold costs must not decrease");}
  const stage=config.stages.find(s=>level>=s.min&&level<=s.max);
  const units=stage?polynomial(stage.units,level):0;
  assert(units>=previous);previous=units;
  const newly=level===1?"Gold only":level===2?"Timber / Stone; food themes":level===11?"Planks":level===26?"Iron":level===51?"Tools":"—";
  table.push(`| ${level} | ${multiplier(level).toFixed(2)}× | ${units.toFixed(2)} | ${newly} | ${level===1?"fixed L1 fee":polynomial(config.upgradeGoldHours,level).toFixed(5)} | ${level===1?"4–8 initial":polynomial(config.upgradeMinutes,level).toFixed(1)} | ${polynomial(config.storehouseCapacity,level)} | ${polynomial(config.granaryCapacity,level)} |`);
  if([1,10,25,50,75,100].includes(level)){
    const demand=Object.fromEntries(keys.map(k=>[k,0]));
    if(level>1)for(const b of config.buildings)for(const [k,v] of Object.entries(cost(b,level)))demand[k]+=v;
    report.push({level,rates,demand,hours:Math.max(...keys.map(k=>demand[k]/rates[k]))});
  }
}
const simulations=["balanced","seasonal-first","three-visits","three-visits-monthly-reset"].map(policy=>({policy,...simulate(policy)}));
table.push("", "## Exact weights for all twenty buildings", "", "These weights complete the formula above for every target level. Inactive stage families have zero charge. The officer permanence factor doubles material, Gold and time requirements; existing starter buildings are granted without a retroactive bill.", "", "| Building | L1 Gold | Base factor | Permanence factor | Timber | Stone | Planks | Iron | Tools | Grain | Food |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for(const b of config.buildings){const weights={...config.defaultWeights,...b.weights},label=estate.buildings.find(x=>x.key===b.key).label;table.push(`| ${label} | ${b.gold1} | ${b.factor} | ${b.permanent?config.permanentCostFactor:1} | ${["timber","stone","planks","iron","tools","grain","food"].map(k=>weights[k]).join(" | ")} |`);}
assert(simulations.find(s=>s.policy==="seasonal-first").milestones.seasonal100<=28*24,"Automated seasonal-first baseline must leave room in a 30-day season");
assert.equal(config.paidHoursPerUtcDay,1);assert(config.paidHoursPerUtcDay/24<=.05);
const round=v=>(v/24).toFixed(2);
const review=["# Estate economy draft — arithmetic review", "", "PROPOSED, not live balance. Reproduce with `node tools/validate-estate-economy-draft.js --write`. No player data was used.", "", "## Production and upgrade demand", "", "All processors run continuously at the same level as extractors. Net rates deduct Timber, Ore, Grain, Planks and Iron used by recipes. A portfolio wave means one upgrade for each of all twenty buildings, including double-cost permanent officers. Stock waiting time is max(demand/net output); it excludes stored inventory, jobs, Gold, quests and differing factory levels.", "", "| Level | Timber/h | Stone/h | Ore/h | Grain/h | Planks/h | Iron/h | Tools/h | Food/h | Material wait for one portfolio wave |", "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"];
report.forEach(r=>review.push(`| ${r.level} | ${keys.map(k=>r.rates[k].toFixed(1)).join(" | ")} | ${r.hours.toFixed(2)}h |`));
review.push("", "## Construction/stock simulation", "", "Ten-minute ticks, all sites already L1, zero initial stocks, auto factories, capacity limits, one active job per building, 1/2/3 building slots at Builders' Yard 1/10/50, a Hall+5 ceiling for seasonal buildings and no seasonal Hall ceiling for permanent officers. Balanced/seasonal-first policies make decisions every tick. Three-visits policies use the seasonal-first priority, confirm prepaid batches of up to five levels only every eight hours, and hold at most thirty jobs; queued jobs run offline without another payment. Every cost is spent when queued. Gold is assumed affordable; no quests, Crown supplies, recruiting, meals, startup or missed visits are modeled. The monthly-reset variant clears stocks and unfinished jobs and returns all sixteen seasonal sites to L1 every thirty days, retaining only completed officer levels. It abstracts rebuilding L1 sites and old-generation refund handling; production must follow the six-completed/fourteen-unbuilt baseline and reject prepaid jobs crossing a reset. Other policies run uninterrupted. These are design estimates, not measured player completion promises. Milestones are first reach dates from the model start; the monthly-reset first seasonal-100 milestone is not a claim of preserving those levels. The three-visits result exposes the difference between arithmetic affordability and practical session pacing.", "", "| Policy | Hall 25 / 50 / 75 / 100 (days) | All seasonal 25 / 50 / 75 / 100 (days) | All 20 at 100 (days) |", "|---|---|---|---:|");
simulations.forEach(s=>review.push(`| ${s.policy} | ${[25,50,75,100].map(l=>round(s.milestones["hall"+l])).join(" / ")} | ${[25,50,75,100].map(l=>round(s.milestones["seasonal"+l])).join(" / ")} | ${round(s.hours)} |`));
review.push("", "## Gold funding constraint", "", `At a constant raw Main City rate of ${config.referenceGoldPerHour} Gold/hour, these totals sum the separately rounded Level 2 through target-level fees. They exclude first builds, recruiting, quests, Gear crafting, world upgrades and rebuilding after resets. The last two columns are Gold-only funding lower bounds, with all Main City income allocated to the estate. Gold accrues while materials/jobs advance, so do not add these days to the construction model. Higher kingdom income can fund projects sooner; spending only half of a single Main City's income doubles these lower bounds. Changing Main City level also changes future quotes and requires a time-varying funding model.`, "", "| Target across buildings | 16 seasonal Gold | All 20 Gold | Seasonal funding at 1 Main City income (days) | All 20 funding at 1 Main City income (days) |", "|---:|---:|---:|---:|---:|");
for(const goal of [25,50,75,100]){
  const total=buildings=>buildings.reduce((sum,b)=>{for(let level=2;level<=goal;level++)sum+=goldFee(b,level);return sum;},0);
  const seasonalGold=total(config.buildings.filter(b=>!b.permanent)),allGold=total(config.buildings);
  review.push(`| ${goal} | ${seasonalGold.toLocaleString("en-US")} | ${allGold.toLocaleString("en-US")} | ${(seasonalGold/config.referenceGoldPerHour/24).toFixed(2)} | ${(allGold/config.referenceGoldPerHour/24).toFixed(2)} |`);
}
review.push("", "A newcomer relying on one Main City's income cannot reproduce the 27.79-day seasonal material/queue result while also funding normal world progression. The intended reward is useful selected milestones, not compulsory maximuming of every site. Validate low-income cohorts and tune Gold fees before shipping; the affordable-Gold simulation is a construction estimate only.");
review.push("", "## Checks and limits", "", "- All twenty registries match; four officer tracks persist. No Level 1 prerequisite cycle exists, and Level 1 needs no crafted input.", "- Costs and production are monotonic through all 100 levels. Every single upgrade fits previous-level storage. Matched-level storage holds at least 24 hours of gross Timber/Grain production; heavily uneven levels can still fill earlier.", "- Factory recipes leave positive net output in every resource. Input-starved or output-full processors stop consuming inputs in the model.", "- Crown supplies share one production-hour equivalent per UTC day, at most 4.17% of 24-hour output for the selected material under the quoted reference rate. This is a local-material bound, not a measured PvP fairness result or total progress guarantee.", "- Full monthly maximum across every seasonal building is not a required objective. Compare the simulation against 30 days and tune progression before shipping; a seasonal-first strategy is faster for seasonal systems while officer progression carries between resets.", "- Existing two-copy Gear rules still require 1,048,576 Common L1 equivalents for one Legendary L1 piece. Building milestones alone do not solve acquisition. New higher-tier drops or targeted-copy sources require a separately confirmed Gear decision; existing items and earned access must be grandfathered.", "- These checks establish arithmetic consistency only. Human playtesting must measure Gold competition, quest/meal sinks, return frequency, decision fatigue, perceived rewards and monthly restart appeal. No claim that the whole economy is validated is made.", "");
const generated={"LEVEL_TABLES.md":table.join("\n")+"\n","BALANCE_REVIEW.md":review.join("\n")};
for(const [file,value] of Object.entries(generated)){
  if(process.argv.includes("--write"))fs.writeFileSync(path.join(directory,file),value);
  else assert.equal(fs.readFileSync(path.join(directory,file),"utf8").replace(/\r\n/g,"\n"),value,"Draft evidence is stale; reproduce with --write: "+file);
}
console.log(JSON.stringify({status:"PASS: proposed estate arithmetic and conservation checks",milestones:simulations.map(s=>({policy:s.policy,hall100Days:round(s.milestones.hall100),seasonal100Days:round(s.milestones.seasonal100),all100Days:round(s.hours)}))},null,2));
