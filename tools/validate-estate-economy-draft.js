"use strict";
// Review-only arithmetic and persistence fixtures; not gameplay configuration.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const estate=require("../inner-city-estate");
const dir=path.join(__dirname,"../docs/estate-economy");
const c=JSON.parse(fs.readFileSync(path.join(dir,"draft-config.json"),"utf8")),p=c.progression;
const keys=c.producers.map(x=>x.output),materials=["timber","stone","planks","iron","tools","grain","food"];
const byKey=Object.fromEntries(c.buildings.map(b=>[b.key,b]));
const sum=a=>a.reduce((s,v)=>s+v,0),poly=(a,l)=>sum(a.map((v,i)=>v*l**i));
const mult=l=>1+c.productionGrowth*(l-1),fmt=v=>Number(v||0).toLocaleString("en-US");
const label=k=>estate.buildings.find(b=>b.key===k).label;
const cap=(k,l)=>poly(["grain","food"].includes(k)?c.granaryCapacity:c.storehouseCapacity,l);
const gold=(b,l)=>l===1?b.gold1:Math.ceil(c.referenceGoldPerHour*poly(c.upgradeGoldHours,l)*b.factor*b.goldFactor);
function rates(l){
 const r=Object.fromEntries(keys.map(k=>[k,0]));
 for(const x of c.producers){const q=x.basePerHour*mult(l);r[x.output]+=q;for(const [k,v] of Object.entries(x.inputs))r[k]-=q*v;}
 return r;
}
function allocate(total,levels,band,timer=false){
 const w=levels.map(l=>band.min===2
  ? timer?Math.max(p.onboarding.timerMinimumWeight,Math.min(1,(l-band.min)/p.onboarding.timerRampLevels)):((l-band.min+1)/(band.max-band.min+1))**p.onboarding.materialExponent
  :1+p.withinBandGrowth*(l-band.min)/(band.max-band.min));
 const minimum=band.min===2?1:0;assert(total>=minimum*levels.length);
 const a=w.map(v=>minimum+Math.floor((total-minimum*levels.length)*v/sum(w)));
 const remainder=total-sum(a);assert(remainder>=0&&remainder<levels.length);
 return a.map((v,i)=>v+(i>=a.length-remainder?1:0));
}
assert.equal(c.maxLevel,estate.maxLevel);assert.equal(c.maxLevel,100);
assert.deepEqual(Object.keys(byKey).sort(),estate.buildings.map(b=>b.key).sort());
assert.equal(c.buildings.length,20);assert(c.buildings.every(b=>b.permanent));
assert.equal(p.productionShare,.5);assert.equal(p.constructionShare,.2);assert.equal(c.seasonDays,30);
assert.deepEqual(p.bands.map(b=>[b.min,b.max,b.seasons]),[[2,25,1],[26,50,2],[51,75,3],[76,100,4]]);
assert.deepEqual(p.onboarding,{materialExponent:2,timerMinimumWeight:0.02,timerRampLevels:8});
const produced=new Set();
for(const x of c.producers){for(const k of Object.keys(x.inputs))assert(produced.has(k));assert(!produced.has(x.output));produced.add(x.output);}
assert.deepEqual([...produced].sort(),estate.resources.map(r=>r.key).filter(k=>!["gold","crowns"].includes(k)).sort());
function walk(k,seen=new Set()){assert(!seen.has(k));for(const d of byKey[k].requires1){assert(byKey[d]);walk(d,new Set(seen).add(k));}}
c.buildings.forEach(b=>{assert(b.gold1>0&&b.minutes1>0);walk(b.key);});
const refs=p.bands.map(b=>({...b,rates:rates(b.referenceProducerLevel),budget:Object.fromEntries(keys.map(k=>[k,Math.floor(rates(b.referenceProducerLevel)[k]*c.seasonDays*24*p.productionShare)]))}));
const costs={},bands={},minutes={};
for(const band of refs){
 const levels=Array.from({length:band.max-band.min+1},(_,i)=>band.min+i);
 const times=allocate(Math.round(band.seasons*c.seasonDays*24*60*p.constructionShare),levels,band,true);
 levels.forEach((l,i)=>minutes[l]=times[i]);
}
for(const b of c.buildings){
 costs[b.key]={1:{}};bands[b.key]=[];
 const w={...c.defaultWeights,...b.weights};
 for(const band of refs){
  const levels=Array.from({length:band.max-band.min+1},(_,i)=>band.min+i);
  const active=l=>c.stages.find(s=>l>=s.min&&l<=s.max).active.filter(k=>w[k]>0);
  const used=[...new Set(levels.flatMap(active))],max=Math.max(...used.map(k=>w[k]));
  const totals=Object.fromEntries(used.map(k=>[k,Math.ceil(band.budget[k]*band.seasons*(w[k]/max))]));
  levels.forEach(l=>costs[b.key][l]={});
  for(const k of used){
   const eligible=levels.filter(l=>active(l).includes(k)),amounts=allocate(totals[k],eligible,band);
   eligible.forEach((l,i)=>costs[b.key][l][k]=amounts[i]);
   assert.equal(sum(eligible.map(l=>costs[b.key][l][k])),totals[k]);
  }
  const seasons=Math.max(...used.map(k=>totals[k]/band.budget[k]));
  assert(seasons>=band.seasons&&seasons-band.seasons<.001);
  bands[b.key].push({...band,totals,resourceSeasons:seasons});
 }
}
const cost=(b,l)=>costs[b.key][l],duration=(l,builders=1)=>Math.ceil(minutes[l]*(1-c.builderReductionAt100*(builders-1)/99));
const starterRates=rates(1);
for(const b of c.buildings){
 assert(duration(2)>=b.minutes1,"First upgrade timer must not undercut first construction");
 assert(Math.max(...Object.entries(cost(b,2)).map(([k,v])=>v/(starterRates[k]*p.productionShare)))<=1,"First material upgrade exceeds one reference hour: "+b.key);
}
for(let l=1;l<=100;l++){
 assert(Object.values(rates(l)).every(v=>v>0));assert(cap("timber",l)>=100*mult(l)*24);assert(cap("grain",l)>=80*mult(l)*24);
 if(l>2)assert(minutes[l]>=minutes[l-1]);
 const stock=Object.fromEntries(keys.map(k=>[k,0]));
 for(const x of c.producers){const q=x.basePerHour*mult(l);for(const [k,v] of Object.entries(x.inputs)){assert(stock[k]+1e-7>=q*v);stock[k]-=q*v;}stock[x.output]+=q;}
 for(const k of keys)assert(Math.abs(stock[k]-rates(l)[k])<1e-7);
 for(const b of c.buildings){
  for(const [k,v] of Object.entries(cost(b,l))){
   assert(Number.isSafeInteger(v)&&v>0);
   if(l>2)assert(v>=(cost(b,l-1)[k]||0),"Nondecreasing bills: "+b.key+"/"+l+"/"+k);
   if(k==="planks")assert(l>=11);if(k==="iron")assert(l>=26);if(k==="tools")assert(l>=51);
  }
  if(l===1)assert.deepEqual(cost(b,l),{});
  else {assert(Number.isSafeInteger(gold(b,l)));if(l>2)assert(gold(b,l)>=gold(b,l-1));}
 }
}
// Ledger fixtures model proposed invariants; no backend implementation is claimed.
function deposit(s,r){
 const signature=JSON.stringify(r),previous=s.receipts[r.id];
 if(previous){assert.equal(previous,signature);return;}
 assert.equal(r.generation,s.generation);assert.equal(r.target,s.level+1);assert(r.target<=100);assert.equal(r.version,p.costVersion);
 assert(Object.keys(r.amounts).length);
 const bill=cost(byKey[s.building],r.target);
 for(const [k,v] of Object.entries(r.amounts)){assert(Number.isSafeInteger(v)&&v>0);assert(bill[k]&&v<=bill[k]-(s.deposited[k]||0));assert(v<=(s.stock[k]||0));}
 for(const [k,v] of Object.entries(r.amounts)){s.stock[k]-=v;s.deposited[k]=(s.deposited[k]||0)+v;}
 s.receipts[r.id]=signature;
}
function rollover(s){s.generation++;}
for(const b of c.buildings)for(const target of [2,25]){
 const bill=cost(b,target),k=Object.keys(bill)[0],amount=Math.min(250,bill[k]-1);
 assert(amount>0);
 const s={building:b.key,level:target-1,generation:1,stock:{[k]:500},deposited:{},receipts:{},champions:[{level:7,xp:93,recoveryUntil:240}],expeditions:[{endsAt:600}],job:null};
 const first={id:"first",generation:1,target,version:p.costVersion,amounts:{[k]:amount}};
 deposit(s,first);assert.equal(s.stock[k],500-amount);assert.equal(s.deposited[k],amount);
 const before=JSON.stringify(s);deposit(s,first);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>deposit(s,{...first,amounts:{[k]:amount+1}}));
 for(const amounts of [{[k]:-1},{[k]:1.5},{[k]:bill[k]+1},{[k]:501},{[k]:1,ore:1}]){
  assert.throws(()=>deposit(s,{...first,id:"bad",amounts}));assert.equal(JSON.stringify(s),before);
 }
 const saved=structuredClone(s);rollover(s);assert.deepEqual({...s,generation:1},saved);
 deposit(s,first);assert.deepEqual(s.deposited,saved.deposited);assert.throws(()=>deposit(s,{...first,id:"stale"}));
 let serial=0;
 const supplied=Object.fromEntries(keys.map(key=>[key,(s.stock[key]||0)+(s.deposited[key]||0)]));
 for(const [key,total] of Object.entries(bill))while((s.deposited[key]||0)<total){
  const amount=Math.min(500,total-(s.deposited[key]||0));
  const gathered=Math.max(0,amount-(s.stock[key]||0));
  supplied[key]+=gathered;s.stock[key]=(s.stock[key]||0)+gathered;
  deposit(s,{id:"chunk-"+serial++,generation:2,target,version:p.costVersion,amounts:{[key]:amount}});
 }
 for(const key of keys)assert.equal((s.stock[key]||0)+(s.deposited[key]||0),supplied[key],"Fixture must not replace unspent stock while funding");
 assert.deepEqual(s.deposited,bill);if(target===25)assert(Object.values(bill).some(v=>v>500));
 assert.throws(()=>deposit(s,{id:"over",generation:2,target,version:p.costVersion,amounts:{[k]:1}}));
 s.job={target,endsAt:120,funding:structuredClone(s.deposited),version:p.costVersion};
 const job=structuredClone(s.job);rollover(s);assert.deepEqual(s.job,job);
 const completed=new Set();
 function complete(id){if(completed.has(id))return;assert(s.job&&s.job.target===s.level+1);assert.deepEqual(s.job.funding,cost(b,s.job.target));s.level=s.job.target;s.job=null;s.deposited={};completed.add(id);}
 complete("finish");complete("finish");assert.equal(s.level,target);rollover(s);assert.equal(s.level,target);
}
// Focused, ideal reference. Supporting infrastructure is assumed, not granted.
function simulate(b,builders){
 const dt=1/6,stock=Object.fromEntries(keys.map(k=>[k,0])),deposited={},milestones={};
 let level=1,end=null,generation=1;
 for(let h=0;h<=360*24;h+=dt){
  if(end!==null&&h+1e-7>=end){level++;end=null;for(const k of keys)delete deposited[k];if([25,50,75,100].includes(level))milestones[level]=h/24;if(level===100)return milestones;}
  const target=level+1,band=refs.find(x=>target>=x.min&&target<=x.max);
  if(Math.floor((h+1e-7)/(c.seasonDays*24))+1>generation)generation++; // Estate state stays intact.
  for(const k of keys)stock[k]=Math.min(cap(k,band.referenceProducerLevel),stock[k]+band.rates[k]*p.productionShare*dt);
  if(end!==null)continue;
  const bill=cost(b,target);
  for(const [k,need] of Object.entries(bill)){const amount=Math.min(stock[k],need-(deposited[k]||0));stock[k]-=amount;deposited[k]=(deposited[k]||0)+amount;}
  assert(Object.values(stock).every(v=>v>=-1e-7));
  if(Object.entries(bill).every(([k,v])=>deposited[k]>=v-1e-7))end=h+duration(target,b.key==="builders-yard"?level:builders)/60;
 }
 throw Error("Reference stalled: "+b.key);
}
const simulations=c.buildings.map(b=>({key:b.key,base:simulate(b,1),fast:simulate(b,100)}));
for(const s of simulations)for(const [l,days] of [[25,30],[50,90],[75,180],[100,300]]){assert(Math.abs(s.base[l]-days)<2,"Focused target drift: "+s.key+"/"+l+"/"+s.base[l]);assert(s.fast[l]<=s.base[l]+.1);}
assert.equal(c.paidHoursPerUtcDay,1);
const cells=bill=>materials.map(k=>bill[k]?fmt(bill[k]):"—").join(" | ");
const tables=["# Persistent estate — every building and level","","Owner-confirmed: all twenty Inner Castle buildings, estate materials and estate progress persist. Each building individually targets cumulative 1 / 3 / 6 / 10 reference seasons at Levels 25 / 50 / 75 / 100, using 50% of production. Quantities, reference output and timers were approved October 8, 2026. Regenerate with node tools/validate-estate-economy-draft.js --write. These tables are checked against the pending-release runtime prices.","","## Reference and calculation","","One reference season is 30 days. Supporting producers/processors use fixed band reference levels 13 / 38 / 63 / 88, approximating the middle of each progression band. All processors run; net rates deduct their inputs. These support levels are assumptions, not free upgrades or proof that all twenty sites can follow the same calendar. Prices are fixed by target level/version, never recalculated from player income. Production levels and stock now persist; there is no seasonal rebuilding reset.","","| Target levels | Additional seasons | Cumulative seasons | Reference producer level | Base construction days in band |","|---|---:|---:|---:|---:|"];
let cumulative=0;
refs.forEach(b=>tables.push("| "+b.min+"–"+b.max+" | "+b.seasons+" | "+(cumulative+=b.seasons)+" | "+b.referenceProducerLevel+" | "+b.seasons*c.seasonDays*p.constructionShare+" |"));
tables.push("","For each material: reference budget = floor(net hourly output at the band reference level × 720 hours × 50%). Building band bill = ceil(reference budget × additional seasons × resource theme weight / largest active theme weight). One themed resource consumes the stated budget; the others vary with purpose. The old double-material and material building factors are superseded. Concurrent projects compete for the same inventory; there is no independent free 50% allocation for every building.","","Draft 4 redistributes the first band using squared level weights ((target-1)/24)^2, reserving one unit per eligible level before weighted rounding. Later bands retain their 10% linear rise. First-band timers use max(0.02, min(1, (target-2)/8)) weights, also reserving one minute per level. Floor each share and give remaining units to the last eligible levels. Every band total stays exact and bills/timers never decrease, including across bands. Level 1 is Gold-only; Timber/Stone and applicable Grain/Food start at 2, Planks at 11, Iron at 26 and Tools at 51. Ore is indirect feedstock. Initial construction is outside the 99-upgrade target.","","Base construction totals 20% of each band's reference duration: 6 / 12 / 18 / 24 days spread across its upgrades. Timers overlap ongoing production; they are not simply added to ten seasons of resource collection. Builders' Yard reduces new timers up to 30%. All buildings use this timing without the former Guild/Hall timer surcharges. Gold retains the earlier separate formula/building factors, paid when a reviewed permanent contract is funded; Gold is not a refundable estate deposit.","","## 50% resource budget per reference season","","| Band | Timber | Stone | Ore | Grain | Planks | Iron | Tools | Food |","|---|---:|---:|---:|---:|---:|---:|---:|---:|");
refs.forEach(b=>tables.push("| "+b.min+"–"+b.max+" | "+keys.map(k=>fmt(b.budget[k])).join(" | ")+" |"));
tables.push("","## Timer examples","","| Target | Base timer | Builders' Yard 100 |","|---:|---:|---:|");
[2,10,11,25,26,50,51,75,76,100].forEach(l=>tables.push("| "+l+" | "+(duration(l)/60).toFixed(2)+" h | "+(duration(l,100)/60).toFixed(2)+" h |"));
tables.push("","## All twenty building band totals","","Each row covers EVERY upgrade in that band, not only the milestone level. Gold is additional. Food and Grain carry over like other estate materials.");
for(const b of c.buildings){
 tables.push("","### "+label(b.key),"","| Upgrades | Additional seasons | Timber | Stone | Planks | Iron | Tools | Grain | Food |","|---|---:|---:|---:|---:|---:|---:|---:|---:|");
 bands[b.key].forEach(x=>tables.push("| "+(x.min-1)+"→"+x.max+" | "+x.seasons+" | "+cells(x.totals)+" |"));
}
tables.push("","## Every individual upgrade","","Each row is the price to enter that target level. Reference Gold uses 285/hour; actual Gold follows the Main City formula. Base minutes assume Builders' Yard 1. The six existing starter structures are granted without retroactive charges.");
for(const b of c.buildings){
 tables.push("","### "+label(b.key)+" — Levels 1–100","","| Target | Timber | Stone | Planks | Iron | Tools | Grain | Food | Reference Gold | Base minutes |","|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
 for(let l=1;l<=100;l++)tables.push("| "+l+" | "+cells(cost(b,l))+" | "+fmt(gold(b,l))+" | "+(l===1?b.minutes1:duration(l))+" |");
}
const review=["# Persistent estate — arithmetic and timing review","","Approved reference values; no live player data. Reproduce with node tools/validate-estate-economy-draft.js --write. Previous seasonal rebuilding and all-twenty completion estimates are superseded.","","## Focused building reference","","Each row runs one building from L1 to L100 with one available construction slot, affordable Gold, zero starting materials, immediate voluntary deposits and 50% of each resource's net production. The Builders' Yard uses its own completed level for its self-upgrade discount; other rows compare Yard 1 and 100. Supporting production/storage uses the fixed band reference level (13 / 38 / 63 / 88). That infrastructure is an external assumption: these runs do not build or pay for it. Ten-minute ticks preserve stock through construction and season boundaries. Gathering continues during timers and reference storage caps apply. The other 50% is outside this model. No quests, Crown deliveries, missed visits or competing projects are modeled.","","The approved reference treats the 1 / 3 / 6 / 10 seasons as approximate total progression targets. This checks the combined collection/construction effect, not two durations added together. Rounding and the final construction step can finish slightly beyond a nominal boundary. Exact timer allocation is approved; a fixed resource bill is not a calendar lock.","","| Building | L25 days | L50 days | L75 days | L100 days | L100 with Builders 100 |","|---|---:|---:|---:|---:|---:|"];
simulations.forEach(s=>review.push("| "+label(s.key)+" | "+[25,50,75,100].map(l=>s.base[l].toFixed(2)).join(" | ")+" | "+s.fast[100].toFixed(2)+" |"));
review.push("","## Checks","","- All twenty registry buildings persist. First-build prerequisites are acyclic, and Level 1 is Gold-only.","- All 100 levels have positive whole nondecreasing material/Gold bills and timers. Individual bills sum exactly to unchanged band totals; inputs enter at their stated levels. Draft 4 reduces the Level 2 material wait below one hour at half of Level 1 net output; construction still takes at least the original first-build duration.","- Each band matches its 1 / 2 / 3 / 4-season resource budget within 0.001 season of rounding. Combined focused timing stays within two days of each nominal cumulative target.","- Factory input/output conservation holds at all 100 matched levels. Matched storage retains at least 24 hours of gross Timber/Grain; the shared-account review separately exercises uneven infrastructure.","- Draft ledger fixtures for all twenty sites cover partial deposits, costs above starter storage, invalid/insufficient/excess amounts, atomic rejection, replayed receipts, stale-generation writes, retained loose stocks, deposits, champions and expeditions, retained funded jobs and once-only completion. These are design fixtures, not implemented backend tests.","","## Limits and next validation","","- Supporting infrastructure is not free. Twenty buildings cannot each independently spend the same 50% of an account's production. Projects share stocks and construction slots; no completion date for the full twenty-building estate is claimed.","- The production references assume a developed supply chain. A building supplied by weaker factories takes longer; saved advanced factories and stockpiles can fund a lower building faster. Prices never chase player income.","- Bootstrap, Gold competition, the Hall ceiling, actual visits, storage congestion, quests and paid supply concentration are modeled in REWARD_REVIEW.md; pacing still requires playtesting. Table rows are individual reference tracks, not fresh-account promises.","- All estate queues, stocks, expedition rewards, recovery deadlines, shop receipts and limits carry. Migration must settle elapsed work once; it must not reset daily allowances or refresh recruitment. World Gold, world cities and Hero progression retain their existing realm reset rules.","- Persistent factories create veteran advantages. Estate materials and champion expeditions provide no direct world troop, wall or city-production bonuses. Officer Gear follows existing rules; cross-season fairness still needs review.","- See README.md and READINESS_PLAN.md for the approved reward/XP/quest/queue repairs and their pending-release implementation. Material-funded commissions supplement the unchanged two-copy Gear system. Champion training and optional activities are included in the shared-account review.","- Arithmetic and model persistence checks pass. Runtime transaction, emulator and browser tests are separate evidence; this reference alone does not certify deployment or player satisfaction.","");
for(const [file,value] of Object.entries({"LEVEL_TABLES.md":tables.join("\n")+"\n","BALANCE_REVIEW.md":review.join("\n")})){
 if(process.argv.includes("--write"))fs.writeFileSync(path.join(dir,file),value);
 else assert.equal(fs.readFileSync(path.join(dir,file),"utf8").replace(/\r\n/g,"\n"),value,"Stale generated draft: "+file);
}
console.log(JSON.stringify({status:"PASS: all-20 costs, timing and draft deposit fixtures",referenceTargetDays:[30,90,180,300],productionShare:p.productionShare,focusedRangeDays:[25,50,75,100].map(l=>({level:l,min:Math.min(...simulations.map(s=>s.base[l])).toFixed(2),max:Math.max(...simulations.map(s=>s.base[l])).toFixed(2)}))},null,2));
