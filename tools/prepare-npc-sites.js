"use strict";
// Author four alternatives against the current displayed Core layout. This is
// offline work; the population worker only inspects these bounded candidates.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {createTravelFixture}=require("./world-travel-test-fixtures");
const {createPlacementFixture}=require("./validate-marauder-terrain");
const {createCommandRouting}=require("../local-backend/world/routing");
const {fixture,buildCatalog,gameToImage}=require("../local-backend/world/catalog");
const {roadPlacementPoints,isClear,minimumEnemySeparation}=require("../functions/marauder-population");
const output=path.resolve(__dirname,"../local-backend/world/npc-sites.json");
const overlaps=(a,b,gap=4)=>a.left<b.right+gap&&a.right+gap>b.left&&a.top<b.bottom+gap&&a.bottom+gap>b.top;
// The live marker is 56px. Reserve its attached two-line label as well.
const envelope=p=>({left:p.x-48,right:p.x+48,top:p.y-54,bottom:p.y+32});
async function prepare(){
 const travel=createTravelFixture(56),context={worldId:"fixture",resetGeneration:"fixture",sharedRealmId:"shard_0001",activeRegionIds:travel.activeRegionIds};
 const routing=createCommandRouting({enabled:true});
 try{
  // Deliberately omit the prepared-site hook: validate source road geometry,
  // never the output of a previous run. Old painted scenery no longer renders.
  const placement=createPlacementFixture(travel,{routing:{enabled:true,projectStructure:routing.projectStructure},context});
  const {manifest}=buildCatalog(context,{...context,realmShardId:context.sharedRealmId,topologyVersion:"core-expansion-v1"});
  const sections=[];
  for(const section of manifest.sections){
   const base=fixture.sections.find(s=>s.id===section.templateId),g={...placement.geometry(section.id),rectangles:[]};
   const obstacles=fixture.objects.filter(o=>o.sectionId===base.id&&o.kind!=="scenery").map(o=>({left:o.left-base.x,top:o.top-base.y,right:o.left-base.x+o.width,bottom:o.top-base.y+o.height}));
   obstacles.push(...base.pickupZones.map(z=>({left:z.x-z.radius,right:z.x+z.radius,top:z.y-z.radius,bottom:z.y+z.radius})));
   const candidates=roadPlacementPoints(g).filter(p=>isClear(p,g)).map(p=>({...p,local:gameToImage(section,p)}))
    .filter(p=>!obstacles.some(r=>overlaps(envelope(p.local),r)));
   const chosen=[],rejected=new Set();
   while(chosen.length<4){
    // Prefer distant alternatives. Candidates need not all be simultaneously
    // occupied: the unchanged active-enemy separation is checked at spawn time.
    const available=candidates.filter(p=>!rejected.has(p)&&chosen.every(q=>Math.hypot(p.local.x-q.local.x,p.local.y-q.local.y)>=96));
    available.sort((a,b)=>{
     const score=p=>chosen.length?Math.min(...chosen.map(q=>Math.hypot(p.x-q.x,p.y-q.y))):Math.min(...g.structures.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));
     return score(b)-score(a)||a.x-b.x||a.y-b.y;
    });
    if(!available.length)break;
    const point=available[0];
    if(!g.accessible({...point,regionId:section.id})){rejected.add(point);continue;}
    chosen.push(point);
   }
   // A narrow Core road may have just one clearing. Retain a second distinct
   // position within it so the one boss can respawn without reusing its exact
   // old position. This does not permit two bosses or reduce active separation.
   if(chosen.length===1&&travel.scope.getServerCatalogRegion(section.id).permanentCore){
    const alternate=candidates.filter(p=>Math.hypot(p.local.x-chosen[0].local.x,p.local.y-chosen[0].local.y)>=24)
     .sort((a,b)=>Math.hypot(b.x-chosen[0].x,b.y-chosen[0].y)-Math.hypot(a.x-chosen[0].x,a.y-chosen[0].y))
     .find(p=>g.accessible({...p,regionId:section.id}));
    if(alternate)chosen.push(alternate);
   }
   const pairs=points=>points.flatMap((a,i)=>points.slice(i+1).filter(b=>Math.hypot(a.x-b.x,a.y-b.y)>=minimumEnemySeparation(g.bounds)).map(b=>[i,points.indexOf(b)]));
   const canRotate=points=>points.every((p,i)=>pairs(points).filter(pair=>pair.includes(i)).length>=2);
   if(!travel.scope.getServerCatalogRegion(section.id).permanentCore&&chosen.length===4&&!canRotate(chosen)){
    // Every occupied solo site needs two partners: one may be the old remains,
    // while the other stays available for a fresh-position replacement.
    search:for(let i=0;i<chosen.length;i++)for(const point of candidates){
     const proposed=chosen.map((p,j)=>i===j?point:p);
     if(!proposed.every((p,j)=>proposed.slice(j+1).every(q=>Math.hypot(p.local.x-q.local.x,p.local.y-q.local.y)>=96))||!canRotate(proposed))continue;
     if(!g.accessible({...point,regionId:section.id}))continue;
     chosen[i]=point;break search;
    }
   }
   const compatiblePairs=pairs(chosen);
   sections.push({id:section.id,points:chosen.map(p=>p.local),compatiblePairs});
  }
  return {version:1,topology:"core-expansion-v1",sections};
 }finally{await routing.close();}
}
if(require.main===module)prepare().then(data=>{const text=JSON.stringify(data)+"\n";if(process.argv.includes("--check"))assert.equal(fs.readFileSync(output,"utf8"),text);else fs.writeFileSync(output,text);console.log(JSON.stringify({templates:data.sections.length,counts:data.sections.reduce((a,s)=>(a[s.points.length]=(a[s.points.length]||0)+1,a),{}),limited:data.sections.filter(s=>s.points.length<4).map(s=>({id:s.id,count:s.points.length}))}));}).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={prepare,envelope,overlaps};
