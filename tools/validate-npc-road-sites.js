"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {prepare,envelope,overlaps}=require("./prepare-npc-sites"),sites=require("../local-backend/world/npc-sites.json");
const {fixture,buildCatalog,gameToImage}=require("../local-backend/world/catalog");
const {createTravelFixture}=require("./world-travel-test-fixtures"),{createPlacementFixture}=require("./validate-marauder-terrain");
const {createCommandRouting}=require("../local-backend/world/routing");
const {roadPlacementPoints,isClear,minimumEnemySeparation}=require("../functions/marauder-population");
const {placeLabels}=require("../world/model"),M=require("../functions/marauder-rules");
(async()=>{
 assert.deepEqual(await prepare(),sites,"Prepared sites are stale");
 const travel=createTravelFixture(121),context={worldId:"sample",resetGeneration:"sample",sharedRealmId:"shard_0001",activeRegionIds:travel.activeRegionIds};
 const routing=createCommandRouting({enabled:true}),geometry=createPlacementFixture(travel,{routing,context});let checked=0;
 try{
  const {manifest}=buildCatalog(context,{...context,realmShardId:context.sharedRealmId,topologyVersion:"core-expansion-v1"});
  for(const section of manifest.sections){
   const g=geometry.geometry(section.id),points=roadPlacementPoints(g),base=fixture.sections.find(s=>s.id===section.templateId);
   const reserved=sites.sections.find(s=>s.id===base.id),items=fixture.objects.filter(o=>o.sectionId===base.id);
   assert.equal(points.length,reserved.points.length);
   points.map(p=>gameToImage(section,p)).forEach((p,i)=>assert(Math.hypot(p.x-reserved.points[i].x,p.y-reserved.points[i].y)<1e-8,"Generated section must inherit its own template sites"));
   assert(points.length>=2&&points.length<=4);assert(g.fixedRoadSites);assert.strictEqual(routing.npcPlacement(section.id,context),routing.npcPlacement(section.id,context),"Cache static geometry");
   for(const p of points){
    assert(isClear(p,g)&&g.accessible({...p,regionId:section.id}),section.id+": unsafe/unreachable site");
    const local=gameToImage(section,p),box=envelope(local);
    for(const o of items)assert(!overlaps(box,{left:o.left-base.x,top:o.top-base.y,right:o.left-base.x+o.width,bottom:o.top-base.y+o.height},0),section.id+": artwork covers NPC/label");
    for(const z of base.pickupZones)assert(!overlaps(box,{left:z.x-z.radius,top:z.y-z.radius,right:z.x+z.radius,bottom:z.y+z.radius}),"Pickup area overlaps NPC");
    checked++;
   }
   const descriptor=travel.scope.getServerCatalogRegion(section.id);
   assert.equal(M.slots(descriptor).length,descriptor.permanentCore?1:2,"Spawn caps unchanged");
   if(!descriptor.permanentCore)for(const a of points){
    const partners=points.filter(b=>Math.hypot(a.x-b.x,a.y-b.y)>=minimumEnemySeparation(g.bounds));
    assert(partners.length>=2,section.id+": an occupied site must allow another active solo and a different replacement");
   }
   // All four alternatives may be empty; labels must fit at each exact anchor.
   // Exercise each site alongside the section's maximum city/landmark footprints.
   const art=items.filter(o=>o.kind!=="scenery").map(o=>({left:o.left-base.x,top:o.top-base.y,right:o.left-base.x+o.width,bottom:o.top-base.y+o.height}));
   for(const [i,p]of reserved.points.entries()){
    const npc={key:"npc-"+i,x:p.x,y:p.y-32,width:88,height:27.2,anchored:true};
    const labels=items.filter(o=>o.kind!=="scenery").map(o=>({key:o.key,x:o.x-base.x,y:o.top-base.y-4,width:110,height:70,compact:{width:64,height:56}}));
    const placed=placeLabels([...labels,npc],new Set(),0,[...art,{left:p.x-28,right:p.x+28,top:p.y-28,bottom:p.y+28}]);
    const label=placed.find(l=>l.key===npc.key);assert(!label.hidden&&label.dx===0&&Object.is(label.dy,-0),"NPC label detached");
   }
  }
  const blocked=placeLabels([{key:"npc",x:100,y:100,width:80,height:20,anchored:true}],new Set(),0,[{left:50,right:150,top:50,bottom:120}]);
  assert(blocked[0].hidden,"Invalid old geometry must never relocate its name to an unrelated object");
  assert.throws(()=>routing.npcPlacement("inactive-map",context));
  const report={passed:true,templates:sites.sections.length,sections:manifest.sections.length,checkedSites:checked,limited:sites.sections.filter(s=>s.points.length<4).map(s=>({name:fixture.sections.find(f=>f.id===s.id).name,count:s.points.length})),caps:{solo:2,boss:1}};
  fs.mkdirSync("release-artifacts/npc-road-sites",{recursive:true});fs.writeFileSync("release-artifacts/npc-road-sites/geometry.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await routing.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
