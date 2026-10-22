"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const original=require("../local-backend/world/templates.json"),{fixture,buildCatalog,layoutRevision}=require("../local-backend/world/catalog");
const {createDisplayLayout}=require("../local-backend/world/layout"),{rect,overlap,roadIndex}=require("./prepare-world-placements");
const {placeLabels,clearScenery}=require("../world/model");
require("node:child_process").execFileSync(process.execPath,["tools/prepare-world-placements.js","--check"],{stdio:"pipe"});
assert.equal(fixture.objects.length,original.objects.length);assert.equal(layoutRevision.length,64);
let minimum=Infinity,before=Infinity,decorations=0;
for(const s of fixture.sections){
 const items=fixture.objects.filter(o=>o.sectionId===s.id),cities=items.filter(o=>o.kind==="castle"),road=roadIndex(s.id);
 const old=original.objects.filter(o=>o.sectionId===s.id),prior=new Map(old.map(o=>[o.id,o]));
 for(const o of items){
  const p=prior.get(o.id);assert(p);assert.deepEqual(o.local,p.local);assert.deepEqual(o.artLocal,p.artLocal);
  for(const key of ["id","key","asset","width","height","kind","sectionId"])assert.equal(o[key],p[key]);
  assert(o.left>=s.x&&o.top>=s.y&&o.left+o.width<=s.x+s.width&&o.top+o.height<=s.y+s.height,"Artwork left its section: "+o.key);
  if(!["castle","scenery"].includes(o.kind))assert.deepEqual(o,p,"Moved a fixed objective");
 }
 const envelopes=cities.map(o=>rect(o.x-s.x,o.y-s.y));
 const landmarks=items.filter(o=>!["castle","scenery"].includes(o.kind)).map(o=>({left:o.left-s.x-12,top:o.top-s.y-110,right:o.left-s.x+o.width+12,bottom:o.top-s.y+o.height+12}));
 for(const a of cities){
  assert(!road(a.x-s.x,a.y-s.y,40),"City covers a road");
  for(const b of cities)if(a!==b){minimum=Math.min(minimum,Math.hypot(a.x-b.x,a.y-b.y));const p=prior.get(a.id),q=prior.get(b.id);before=Math.min(before,Math.hypot(p.x-q.x,p.y-q.y));}
 }
 assert.equal(s.pickupZones.length,2);
 const clearings=s.pickupZones.map(p=>rect(p.x,p.y,p.radius*2,p.radius,p.radius));
 for(const r of clearings)assert(![...envelopes,...landmarks].some(b=>overlap(r,b)),"Obstructed pickup clearing");
 for(const o of items.filter(o=>o.kind==="scenery")){
  const r={left:o.left-s.x,top:o.top-s.y,right:o.left-s.x+o.width,bottom:o.top-s.y+o.height};
  assert(![...envelopes,...landmarks,...clearings].some(b=>overlap(r,b,3)),"Decoration covers reserved UI/clearing: "+o.key);
  assert(!road(o.left+o.width/2-s.x,o.top+o.height/2-s.y,Math.max(o.width,o.height)/2),"Decoration covers road");decorations++;
 }
}
assert(minimum>=108&&minimum>before,"City separation did not improve");
// Check real cross-section corners as well as each section, including maximum
// normal banner sizes and the selected expanded details. No label hides a city.
const sites=fixture.objects.filter(o=>o.kind!=="scenery"),obstacles=sites.map(o=>({left:o.left,top:o.top,right:o.left+o.width,bottom:o.top+o.height}));
obstacles.push(...fixture.sections.flatMap(s=>s.pickupZones.map(p=>({left:s.x+p.x-p.radius,top:s.y+p.y-p.radius,right:s.x+p.x+p.radius,bottom:s.y+p.y+p.radius}))));
const labels=sites.map((o,i)=>({key:o.key,x:o.x,y:o.top-4,width:i===800?200:o.kind==="castle"?110:140,height:i===800?90:o.kind==="castle"?70:40,priority:i===800?1:0,compact:i===800?null:{width:o.kind==="castle"?64:105,height:o.kind==="castle"?56:40}}));
const placed=placeLabels(labels,new Set(),0,obstacles);assert(placed.every(p=>!p.hidden));
for(const p of placed)assert(!obstacles.some(r=>overlap(p.rect,r)),"Label covers artwork/clearing");
const clean=clearScenery(fixture.objects.filter(o=>o.kind==="scenery"),placed.map(p=>p.rect));
for(const o of clean)assert(!placed.some(p=>overlap({left:o.left,top:o.top,right:o.left+o.width,bottom:o.top+o.height},p.rect)),"Dynamic label covers decoration");
const realm={worldId:"sample",resetGeneration:"sample",sharedRealmId:"shard_0001"};
const generated=require("../functions/coreExpansionTopology").getRegionAtActivationOrdinal(88).id;
const {manifest}=buildCatalog(realm,{...realm,realmShardId:realm.sharedRealmId,topologyVersion:"core-expansion-v1",activeRegionIds:[generated]});
const section=manifest.sections.find(s=>s.id===generated),layout=createDisplayLayout(manifest,fixture),template=fixture.sections.find(s=>s.id===section.templateId);
assert.deepEqual(section.pickupZones,template.pickupZones);
for(const o of fixture.objects.filter(o=>o.sectionId===template.id&&o.kind==="castle"))assert.deepEqual(layout.project(section,o.local,"castle"),o.previewLocal);
console.log(JSON.stringify({sections:fixture.sections.length,cities:sites.filter(o=>o.kind==="castle").length,decorations,minimumCitySpacing:minimum,previousMinimum:before,clearings:fixture.sections.length*2,labels:placed.length,generatedLayoutVerified:true}));
