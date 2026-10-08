"use strict";
// Shared-account simulation of the actual runtime rules, including earned supply chains.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const E=require("../functions/estate-economy"),S=require("../functions/estate-services");
const names=Object.fromEntries(require("../inner-city-estate").buildings.map(b=>[b.key,b.label]));
const priorities=["great-hall",...E.C.producers.map(p=>p.building),"storehouse","granary","builders-yard","guild-master","alehouse",...Object.keys(E.BUILDINGS)];
const affordable=(s,bill)=>Object.entries(bill).every(([k,v])=>Math.floor(s.stock[k]+E.EPS)>=v);
const fmt=n=>Number(n).toLocaleString("en-US",{maximumFractionDigits:2});
for(const key of Object.keys(E.BUILDINGS))for(let l=2;l<=100;l++)assert.notEqual(E.benefit(key,l),E.benefit(key,l-1),key+" has an empty level");
function simulate(visits,services=false,commissions=false,crowns=false){
 const s=E.initial(0),champions={},milestones={},snapshots={},stats={funded:0,quests:0,commissions:0,crowns:0,recruits:0};
 let gold=100,project="",serial=0,gearCount=0,previousDay=0;
 const step=24/visits;
 const candidates=()=>Object.keys(E.BUILDINGS).map(key=>{try{return E.constructionQuote(s,key,1,285);}catch(error){if(error.code!=="failed-precondition"&&error.code!=="invalid-argument")throw error;return null;}}).filter(Boolean)
  .sort((a,b)=>a.jobs[0].target-b.jobs[0].target||priorities.indexOf(a.building)-priorities.indexOf(b.building));
 for(let hours=0;hours<=3600*24;hours+=step){
  const now=hours*E.HOUR,day=hours/24;
  gold=day>0&&Math.floor(day/30)>Math.floor(previousDay/30)?100:gold+ (hours?step*285:0); previousDay=day;
  E.settle(s,now); S.settleQuests(s,champions,now);
  for(const parcel of [...s.parcels])try{S.claimParcel(s,parcel.id);}catch(error){assert(error.message.includes("storage"));}
  for(const [key,order]of Object.entries(s.commissions))if(order.completesAtMs<=now&&gearCount<2000){delete s.commissions[key];gearCount++;}
  if(services&&s.levels["guild-master"]){
   const dayId=S.utcDay(now);
   if(s.recruitOffers?.day!==dayId)s.recruitOffers={day:dayId,offers:S.offers(s,now,285)};
   for(const offer of s.recruitOffers.offers){
    if(offer.claimed||s.activeChampionIds.length>=S.rosterLimit(s)||gold<offer.gold)continue;
    const id="champion_"+offer.id; champions[id]={id,name:offer.name,level:offer.level,quality:offer.quality,xp:0,active:true,questId:"",recoveryUntilMs:0};
    s.activeChampionIds.push(id);offer.claimed=true;gold-=offer.gold;stats.recruits++;
   }
  }
  let choices=candidates(),target=choices.find(q=>q.building===project)||choices[0];
  const bottleneck=target?Object.keys(target.materials).filter(k=>target.materials[k]>0&&!['grain','food'].includes(k)).sort((a,b)=>
   (target.materials[b]-s.stock[b])/Math.max(1,E.quoteRate(s,b))-(target.materials[a]-s.stock[a])/Math.max(1,E.quoteRate(s,a)))[0]:"stone";
  if(crowns&&bottleneck){
   for(let purchase=0;purchase<4;purchase++){
    let q;for(const pack of [1,.5,.25])try{q=S.supplyQuote(s,bottleneck,pack,now);break;}catch{}
    if(!q)break;
    if(s.supplyUsage.day!==q.day)s.supplyUsage={day:q.day,hours:0};s.supplyUsage.hours+=q.hours;s.stock[q.resource]+=q.quantity;stats.crowns+=q.crowns;
   }
  }
  if(services&&bottleneck){
   for(let party=0;party<3;party++){
    const available=s.activeChampionIds.map(id=>champions[id]).filter(c=>!c.questId&&c.recoveryUntilMs<=now).sort((a,b)=>b.level*(1+.25*b.quality)-a.level*(1+.25*a.quality));
    const ids=available.slice(0,s.levels["guild-master"]>=50?4:s.levels["guild-master"]>=25?3:2).map(c=>c.id);
    let q;
    for(let tier=Math.min(E.rarityIndex(s.levels["guild-master"]),E.rarityIndex(s.levels.alehouse));tier>=0&&!q;tier--)
     for(const meal of ["feast","stew","bread","none"])try{
      const candidate=S.questQuote(s,{tier,hours:8,championIds:ids,resources:[bottleneck],meal},champions,now);
      if(s.stock.food>=candidate.food){q=candidate;break;}
     }catch{}
    if(!q)break;S.launchQuest(s,q,"quest_"+(++serial),champions,now);stats.quests++;
   }
  }
  if(commissions)for(const building of ["treasury","barracks","gatehouse","royal-stables"]){
   try{const q=S.commissionQuote(s,building,building.replaceAll("-","_")+"_head");
    if(affordable(s,q.materials)){E.spend(s,q.materials);s.commissions[building]={...q,id:"commission_"+(++serial),completesAtMs:now+q.durationMs};stats.commissions++;}
   }catch(error){assert(error.code==="failed-precondition");}
  }
  // Each visit deposits available stock, then explicitly starts funded work
  // only with a free builder. Installments retain one selected next-level project.
  for(let attempts=0;attempts<40;attempts++){
   choices=candidates();
   let q=choices.find(q=>q.building===project);
   if(!q){project="";q=choices.find(q=>gold>=q.gold&&affordable(s,q.materials));}
   if(q&&gold>=q.gold&&Object.values(q.materials).every(v=>v===0)&&s.jobs.length<E.slots(s)){
    gold-=q.gold;E.fund(s,q,"construction_"+(++serial),now);stats.funded++;if(project===q.building)project="";continue;
   }
   q=q||choices.find(q=>!s.jobs.some(j=>j.building===q.building));
   if(q&&q.jobs[0].target>1&&!s.jobs.some(j=>j.building===q.building)){
    project=q.building;const amounts=Object.fromEntries(Object.entries(q.materials).map(([k,v])=>[k,Math.min(v,Math.floor(s.stock[k]+E.EPS))]).filter(([,v])=>v>0));
    if(Object.keys(amounts).length){E.deposit(s,project,amounts);continue;}
   }
   break;
  }
  for(const level of [1,25,50,75,100])if(milestones[level]===undefined&&Object.values(s.levels).every(l=>l>=level))milestones[level]=day;
  if([1,7,30,90,180,300].includes(day))snapshots[day]={...s.levels};
  assert(gold>=0);for(const k of E.KEYS)assert(Number.isFinite(s.stock[k])&&s.stock[k]>=0&&s.stock[k]<=E.capacity(s,k)+.001);
  assert(s.jobs.every(j=>j.status==='running'));assert(s.jobs.length<=E.slots(s));assert(s.questUsage.hours<=2.4+1e-9);assert(s.supplyUsage.hours<=1+1e-9);
  for(const [key,l]of Object.entries(s.levels))if(key!=="great-hall")assert(l<=s.levels["great-hall"]);
  if(milestones[100]!==undefined)break;
 }
 return{visits,services,commissions,crowns,milestones,snapshots,stats,gearCount,levels:s.levels};
}
const accounts=[simulate(1),simulate(3),simulate(1,true),simulate(3,true),simulate(3,true,true),simulate(3,true,true,true)];
const lines=["# Approved estate economy — shared-account review","","Owner approval: October 8, 2026. Runtime implementation is pending release. This report uses the actual estate rules, not production player data. Regenerate with node tools/validate-estate-reward-review.js --write.","",
 "## Rewards at every level","","Every one of the 1,980 upgrades changes a usable rule. Actual value depends on supply, demand and player choices; a changed number is not a playtest.","",
 "| Building | Changing upgrades | Level 100 benefit |","|---|---:|---|"];
for(const key of Object.keys(E.BUILDINGS))lines.push("| "+names[key]+" | 99 | "+E.benefit(key,100)+" |");
lines.push("","## Shared-account cohorts","",
 "Start with the actual six Level 1 buildings, fourteen plots, no materials, 100 Gold and 285 raw Main City Gold/hour. Model Gold restarting at 100 every 30 days while all estate state persists. Earn all supporting producers, storage, Hall levels and builder slots. Settle continuous production exactly at storage/reserve boundaries and construction completions. Every cohort uses the same whole-unit runtime prices, permanent deposits and individual starts; no new upgrade queues.","",
 "At each visit, deposit toward affordable lowest-target work, prioritizing Hall/sources/processing/storage at ties. Start one next level only after every material is deposited, with enough Gold and a free builder. Retain one next-level deposit project while gathering or waiting for builders; future income is never spent automatically. Work completed between visits leaves a builder idle until the next visit. Use all available estate materials for these chosen activities. This is a reproducible policy, not optimal play or a forecast for twenty independently funded buildings.","",
 "Services cohorts recruit into the active roster, launch the highest eligible eight-hour quests, choose meals only when affordable/valid, retain recovery/XP/parcel deadlines and collect what fits. Commission cohorts fund selected head-family pieces for all four officers when affordable. Claims stop at the real 2,000-item bag limit; this model does not assume free Gear upgrades or Gold sufficient to pay item fees. Crown cohorts assume an external optional budget of at most 20 Crowns/day, with the actual shared supply allowance, level/preset/source/capacity gates. No recurring purchase is automatic gameplay.","",
 "| Visits/day | Optional activities | All 20 built, day | All 25 | All 50 | All 75 | All 100 |","|---:|---|---:|---:|---:|---:|---:|");
for(const a of accounts)lines.push("| "+a.visits+" | "+(a.services?"Quests/meals"+(a.commissions?" + commissions":"")+(a.crowns?" + Crown supplies":""):"Construction")+" | "+[1,25,50,75,100].map(l=>a.milestones[l]===undefined?">3,600":fmt(a.milestones[l])).join(" | ")+" |");
lines.push("","| Cohort | Day 30: lowest / highest | Day 300: lowest / highest | Launched quests | Commissioned pieces claimed | Crowns spent |","|---|---|---|---:|---:|---:|");
for(const [i,a]of accounts.entries())lines.push("| "+(i+1)+" | "+[30,300].map(day=>Math.min(...Object.values(a.snapshots[day]))+" / "+Math.max(...Object.values(a.snapshots[day]))).join(" | ")+" | "+a.stats.quests+" | "+a.gearCount+" | "+fmt(a.stats.crowns)+" |");
lines.push("","## Interpreting the results","",
 "The approved 1/3/6/10-season targets are per-building material equivalents at 50% reference production, with paid supporting infrastructure. They do not promise that a whole estate reaches 100 in ten calendar seasons. The shared Hall gate, competing construction, supply levels, deposits, visits to start upgrades and optional activities change the actual route. These cohorts spend 100% of materials across their selected estate activities; saving half elsewhere takes longer.","",
 "Optional commissions intentionally exchange progression speed for permanent Gear. A free player can earn the same resource chains, storage and construction slots. Crown supplies cannot buy rarity gates, extra builders, champions or timer skips; the modeled throughput is shared across stores. Quests add at most 2.17728 normalized resource-hours/day (9.072% of one resource's daily reference output before recovery/rounding), never that amount for every material. Crown supplies add at most one shared hour/day. These caps bound input; they do not prove PvP fairness or optimal bottleneck value.","",
 "The champion curve requires 19,800 XP from 1 to 100: at most 28 XP/hour, or 707.14 eligible quest-hours before Guild limits, recovery and party requirements. Recruits start no higher than 10. At a training ceiling, the quote shows only XP that can be retained. Higher quest tiers never lower whole-unit material returns at equal supply/duration, and no Rare+ Tool fee applies.","",
 "One officer's eight-slot Legendary Level 5 set needs 128 Legendary Level 1 commissioned pieces after unlock, or 384 commission-days at Level 100, plus the unchanged two-copy upgrade and fixed Gold fees. Inventory space and claiming matter. Full bags retain pending commissions safely; unused materials are never taxed away.","",
 "## Release evidence and limits","",
 "Unit tests independently compare all 2,000 runtime bills/timers with the reviewed tables and test recipe conservation, reserve/cap boundaries, long-absence partition equivalence, frozen contracts and partial parcels. The estate emulator checks real currency transactions, replay, concurrency, migration, quests, shops and denied client writes. Browser tests exercise desktop and landscape panels, confirmation, retry, camera/selection preservation, Gear round trips and cleanup. Required PR checks and production deployment are separate gates. A physical-device/account playtest remains necessary for pacing and touch feel; mathematical checks alone do not establish player satisfaction.","");
const destination=path.join(__dirname,"../docs/estate-economy/REWARD_REVIEW.md"),report=lines.join("\n");
if(process.argv.includes("--write"))fs.writeFileSync(destination,report);else assert.equal(fs.readFileSync(destination,"utf8").replace(/\r\n/g,"\n"),report,"Stale shared-account review");
console.log(JSON.stringify({status:"PASS: runtime cohort invariants and all 1,980 changing upgrades",accounts:accounts.map(({visits,services,commissions,crowns,milestones,stats})=>({visits,services,commissions,crowns,milestones,stats}))},null,2));
