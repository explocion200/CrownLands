"use strict";
// Compare draft distances using the existing ordinary travel formula. This
// executes no game command and writes no arrival timestamp or player record.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {buildCatalog,fixture,imageToGame}=require("./map-benchmark/seamless/live-catalog");
const {createDisplayLayout}=require("./map-benchmark/seamless/open-world-layout");
const {createRouter}=require("./map-benchmark/seamless/open-world-routing");
const {createAuthoritativeRoutePlanner}=require("../functions/authoritative-route-planner");
const worldLayout=require("../functions/core-expansion-world-layout.json"),source=fs.readFileSync(path.resolve(__dirname,"../functions/index.js"),"utf8");
function extract(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);const body=source.indexOf("{",source.indexOf(")",start));let depth=0;
 for(let i=body;i<source.length;i++){if(source[i]==="{")depth++;if(source[i]==="}")depth--;if(!depth)return source.slice(start,i+1);}throw Error("Function not found");}
const constants=["ARMY_TRAVEL_SECONDS_PER_MAP_UNIT","ARMY_TRAVEL_MIN_SECONDS","ARMY_TRAVEL_SCOUT_MIN_SECONDS","ARMY_TRAVEL_KIND_MULTIPLIERS","ARMY_TRAVEL_TROOP_BAND_LIMITS","ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS"];
const context={safeNumber:(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback,normalizeDemoAttackSnapshot:()=>null};vm.createContext(context);
vm.runInContext([...constants.map(name=>source.match(new RegExp(`const ${name} = [^;]+;`))[0]),...['getTroopTravelBandIndex','getTroopTravelMultiplier','calculateTravelTime'].map(extract)].join('\n'),context);
const realm={worldId:"test",resetGeneration:"test",sharedRealmId:"test"};
const manifest=buildCatalog(realm,{worldId:"test",resetGeneration:"test",realmShardId:"test",topologyVersion:"core-expansion-v1",activeRegionIds:[]}).manifest;
const display=createDisplayLayout(manifest,fixture),router=createRouter(display.geometry),current=createAuthoritativeRoutePlanner(worldLayout),results=[];
for(const s of manifest.sections){assert.ok(Math.abs(s.gameBounds.width/s.width-display.geometry.unitsPerPixel)<1e-9);assert.ok(Math.abs(s.gameBounds.height/s.height-display.geometry.unitsPerPixel)<1e-9);}
const home=manifest.sections.find(s=>s.id===manifest.homeSectionId),east=manifest.sections.find(s=>s.x===home.x+1448&&s.y===home.y),far=manifest.sections.at(-1);
const cities=s=>fixture.objects.filter(o=>o.sectionId===s.templateId&&o.kind==="castle");
const border=cities(home).filter(o=>o.previewLocal.x>1300).sort((a,b)=>a.previewLocal.y-b.previewLocal.y)[0];
const opposite=cities(east).filter(o=>o.previewLocal.x<120).sort((a,b)=>Math.abs(a.previewLocal.y-border.previewLocal.y)-Math.abs(b.previewLocal.y-border.previewLocal.y))[0];
for(const [label,s,a,t,b]of [["across neighboring edges",home,border,east,opposite],["within section",home,cities(home)[0],home,cities(home).at(-1)],["across Core",home,cities(home)[0],far,cities(far)[0]]]){
 const old=current.calculate({id:a.id,regionId:s.id,...imageToGame(s,a.local)},{id:b.id,regionId:t.id,...imageToGame(t,b.local)});assert.ok(old);
 const next=router.route({x:s.x+a.previewLocal.x,y:s.y+a.previewLocal.y},{x:t.x+b.previewLocal.x,y:t.y+b.previewLocal.y},{maxMs:3000});assert.equal(next.status,"ok");
 const samples=[];
 for(const kind of ["scout","attack","transfer","reinforce","rally_join"])for(const troopCount of [1,10,11,100,101,1000,1001,10000,10001,100000,100001,1000000,1000001,10000000,10000001,100000000,100000001])for(const speedMultiplier of [1,1.5,3]){
  const input={kind,troopCount,speedMultiplier},previous=context.calculateTravelTime({...input,pathLength:old.pathLength}),draft=context.calculateTravelTime({...input,pathLength:next.mapUnits});
  assert.ok(Number.isFinite(draft)&&draft>0);assert.ok(draft>=(kind==="scout"?10:30));
  if(kind==="attack"&&troopCount===1000&&speedMultiplier===1)samples.push({kind,troopCount,speedMultiplier,previousSeconds:previous,draftSeconds:draft});
 }
 results.push({label,previousMapUnits:old.pathLength,draftMapUnits:next.mapUnits,distanceChangePercent:(next.mapUnits/old.pathLength-1)*100,samples});
}
const output=path.resolve("release-artifacts/continuous-open-routing");fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,"travel.json"),JSON.stringify({at:new Date().toISOString(),source:"Existing ordinary travel formula; no bonuses/account lookup or march mutation",cases:765,results},null,2));
console.log(JSON.stringify({passed:true,cases:765,results}));
