"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),vm=require("node:vm"),sharp=require("sharp");
const {buildCatalog,fixture}=require("../local-backend/world/catalog");
const {createDisplayLayout}=require("../local-backend/world/layout");
const {createRouter}=require("../local-backend/world/pathfinder");
const {build}=require("../local-backend/world/terrain-worker");
const topology=require("../functions/coreExpansionTopology");
const M=require("../world/model"),{AssetLoader}=require("../world/assets");
(async()=>{
  require("node:child_process").execFileSync(process.execPath,["tools/prepare-world-templates.js","--check"],{stdio:"pipe"});
  const realm={worldId:"main-test",resetGeneration:"realm-test",sharedRealmId:"shard_0001"};
  const catalog=n=>buildCatalog(realm,{...realm,realmShardId:realm.sharedRealmId,topologyVersion:"core-expansion-v1",activeRegionIds:Array.from({length:n},(_,i)=>topology.getRegionAtActivationOrdinal(i).id)}).manifest;
  const max=catalog(487);assert.equal(max.sections.length,512);assert.throws(()=>catalog(488),/512/);
  const layout=createDisplayLayout(max,fixture),router=createRouter(layout.geometry);
  const a=layout.geometry.slots.find(s=>s.kind==="castle"),b=layout.geometry.slots.find(s=>s.sectionId===a.sectionId&&s.kind==="castle"&&s.key!==a.key);
  assert.equal(router.route(a,b).status,"ok");
  for(const size of [{width:1440,height:900},{width:844,height:390},{width:568,height:320}]){
    const model=M.forWorld(max),camera={x:max.width/2,y:max.height/2,zoom:model.limits(size).home},anchor={x:size.width*.4,y:size.height*.6};
    const before=model.unproject(camera,anchor,size),next=model.zoomAt(camera,size,anchor,camera.zoom*1.3),after=model.unproject(next,anchor,size);
    assert(Math.hypot(before.x-after.x,before.y-after.y)<1e-8);
  }
  for(const [a,b] of [["source/ground.png","docs/art-sources/clean-map-ground/ground.png"],["source/dirt.png","docs/art-sources/blended-dirt-roads/dirt-material.png"],["source/roads.json","tools/map-art/clearance.json"],["source/catalog.json","assets/worlds/core-expansion-v1/region-catalog.json"]])assert(fs.readFileSync("local-backend/world/"+a).equals(fs.readFileSync(b)),"Approved art input changed: "+a);
  assert(fixture.objects.every(o=>!Object.hasOwn(o,"owner")&&!Object.hasOwn(o,"troops")));
  const denied=["https://attacker.test/x.webp","../private.webp","api/local-game/v1/read","tools/map-benchmark/seamless/terrain/a.webp"];
  for(const value of denied)await assert.rejects(AssetLoader.load(value),/Non-asset/);
  const code=fs.readFileSync("functions/index.js","utf8"),start=code.indexOf("async function selectPrivateScoutOrigin("),end=code.indexOf("\nfunction buildCurrentServerGeneratedArmyRoute",start);
  const candidates=[null,{id:"empty",regionId:"a",troops:0},{id:"near",regionId:"a",troops:2},{id:"far",regionId:"b",troops:2},{id:"tie",regionId:"a",troops:2}];
  let planned=[];const sandbox={Map,Infinity,ONLINE_WORLD_ID:"w",RESET_GENERATION:"r",getCurrentRealmShardId:()=>"s",REALM_REQUEST_CONTEXT:{getStore:()=>({activeTravelRegionIds:["a","b"]})},ensureTravelNetworkContext:async()=>{},clampInt:n=>n,getCanonicalArmyRouteEndpoint:c=>c,privateWorldRouting:{lowerBound:c=>({near:4,far:50,tie:5})[c.id]},OPERATION_TIMING:{scout:()=>{}},buildServerGeneratedArmyRoute:async c=>{planned.push(c.id);return {pathLength:5};},HOLDING_TOWERS:{selectClosestScoutOrigin:(cs,t,route)=>cs.filter(c=>c&&route(c)).map(c=>c.id)}};
  vm.createContext(sandbox);vm.runInContext(code.slice(start,end),sandbox);
  assert.deepEqual(Array.from(await sandbox.selectPrivateScoutOrigin(candidates,{})),["near","tie"]);assert.deepEqual(planned,["near","tie"],"Safe lower bound must keep ties and prune only impossible closest origins");
  // Verify all prepared + generated seams using the actual production cache.
  const manifest=catalog(87),directory=path.resolve("release-artifacts/continuous-production/terrain-unit");
  const painted=await build({manifest,directory}),images=new Map();
  for(const s of painted.manifest.sections)images.set(s.id,await sharp(path.join(directory,path.basename(s.terrain))).removeAlpha().raw().toBuffer());
  const pw=1452,ph=1090,values=[];let seams=0,corners=0;
  const pixel=(img,x,y,c)=>img[(y*pw+x)*3+c];
  for(const s of painted.manifest.sections)for(const [dx,dy]of[[1,0],[0,1]]){
    const t=painted.manifest.sections.find(t=>t.gridX===s.gridX+dx&&t.gridY===s.gridY+dy);if(!t)continue;seams++;
    const left=images.get(s.id),right=images.get(t.id),diff=[];
    for(let k=2;k<(dx?ph:pw)-2;k++)for(let o=0;o<4;o++)for(let c=0;c<3;c++)diff.push(Math.abs(pixel(left,dx?1448+o:k,dy?1086+o:k,c)-pixel(right,dx?o:k,dy?o:k,c)));
    const mean=diff.reduce((a,b)=>a+b,0)/diff.length;values.push(mean);assert(mean<14,"Painted seam: "+s.id+" / "+t.id+" = "+mean);
    if(dx&&painted.manifest.sections.some(t=>t.gridX===s.gridX&&t.gridY===s.gridY+1)&&painted.manifest.sections.some(t=>t.gridX===s.gridX+1&&t.gridY===s.gridY+1))corners++;
  }
  // A corrupt cached file cannot keep passing the warm-start checks.
  const victim=path.join(directory,path.basename(painted.manifest.sections[0].terrain));fs.writeFileSync(victim,"corrupt fixture");
  const rebuilt=await build({manifest,directory});assert.equal((await sharp(victim).metadata()).width,1452);
  const next=catalog(88),grown=await build({manifest:next,directory});
  const unchanged=grown.manifest.sections.filter(s=>painted.manifest.sections.find(old=>old.id===s.id)?.terrain===s.terrain).length;
  assert(unchanged>=manifest.sections.length-9,"New section repainted unaffected tiles");
  const report={maxSections:512,checkedSections:112,seams,corners,maxMeanSeamDifference:Math.max(...values),unchangedTilesAfterGrowth:unchanged,cacheCorruptionRecovered:true};
  fs.writeFileSync("release-artifacts/continuous-production/terrain-report.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
