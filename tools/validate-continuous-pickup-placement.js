"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const model=require("../world/model");
const source=fs.readFileSync(require.resolve("../world/native.js"),"utf8");
function fixture(){
  const section={id:"current",x:1448,y:1086,width:1448,height:1086,gameBounds:{left:9000,top:6000,width:2896,height:2172}};
  const scene={width:1448*5,height:1086*5,sections:[section],objects:[{sectionId:"current",kind:"scenery",left:1450,top:1088,width:10,height:10}],marches:[]};
  const status={size:{width:1448,height:1086},feed:{ids:["current"],failed:false,authExpired:false}};
  let terrainCalls=0,land=true;
  const view={scene,selectedKey:null,snapshot:()=>status};
  const ctx={window:{SeamlessAppearance:{labelBounds:new Map()}},SeamlessModel:model,
    HARVEST_BONUS_CENTER_SEARCH_FRACTIONS:[.15,.25,.35],HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE:300,HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE:Math.PI*(3-Math.sqrt(5)),
    isHarvestBonusTerrainSafePoint:()=>{terrainCalls++;return land;}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const placement=ctx.createContinuousHarvestPlacement(view);
  const bonus=(x,y,type="gold")=>({id:"saved",type,regionId:"current",x:9000+x*2,y:6000+y*2});
  const object=(kind,x=724,y=543)=>({key:kind,kind,sectionId:"current",x:section.x+x,y:section.y+y,left:section.x+x-40,top:section.y+y-40,width:80,height:80});
  return {section,scene,status,view,ctx,placement,bonus,object,calls:()=>terrainCalls,land:value=>{land=value;scene.objects=[...scene.objects];}};
}
for(const kind of ["castle","camp","tower","stronghold","citadel","scenery","npc"]){
  const f=fixture();f.scene.objects=[f.object(kind)];
  for(const type of ["gold","troops","crowns"]){
    assert(!f.placement.safe(f.bonus(724,543,type)),kind+" obscures pickup");
    assert(!f.placement.safe(f.bonus(775,543,type)),kind+" clips the pickup glow");
  }
  const p=f.placement.create("current");assert(p&&f.placement.safe({...p,regionId:"current"}));
  assert(Math.hypot((p.x-9000)/2-724,(p.y-6000)/2-543)<381,"Reservation drifted outside the central search");
}
{
  const f=fixture(),b=f.bonus(500,543);f.scene.objects=[f.object("castle",900,543)];
  for(let i=0;i<1000;i++)assert(f.placement.safe(b));
  assert.equal(f.calls(),1,"Idle pickup rescanned terrain");
  f.scene.objects=[f.object("castle",500,543)];assert(!f.placement.safe(b),"New displayed city position was ignored");
  f.scene.objects=[f.object("castle",900,543)];assert(f.placement.safe(b));
  f.ctx.window.SeamlessAppearance.labelBounds=new Map([["castle",{left:1900,top:1580,right:2000,bottom:1680}]]);
  assert(!f.placement.safe(b),"Shifted label obscures the pickup");
}
{
  const f=fixture(),b=f.bonus(724,543);assert(f.placement.safe(b));
  f.status.feed.failed=true;assert(!f.placement.safe(b));assert.equal(f.placement.create("current"),null);
  f.status.feed.failed=false;f.status.feed.authExpired=true;assert(!f.placement.safe(b));
  f.status.feed.authExpired=false;f.status.feed.ids=[];assert(!f.placement.safe(b));
  f.status.feed.ids=["current"];assert(f.placement.safe(b));
  assert.equal(f.placement.create("unloaded"),null);
  f.land(false);const before=f.calls();assert.equal(f.placement.create("current"),null);
  assert(f.calls()-before<=900,"Blocked search exceeded 900 candidates");
}
{
  const f=fixture(),b=f.bonus(724,543);assert(f.placement.safe(b));
  f.scene.marches=[{key:"march",position:{x:2172,y:1629}}];assert(!f.placement.safe(b),"Army token obscures pickup");
  f.scene.marches[0].position.x+=400;assert(f.placement.safe(b),"Departed army keeps pickup hidden");
  f.scene.objects=[{...f.object("scenery"),left:1448,top:1086,width:1448,height:1086}];
  assert.equal(f.placement.create("current"),null,"Blocked map fell back behind artwork");
}
{
  const f=fixture(),b=f.bonus(724,543);f.scene.objects=[f.object("scenery",810,543)];
  assert(f.placement.safe(b));
  f.status.size={width:568,height:320};assert(!f.placement.safe(b),"Mobile glow clearance did not grow in world units");
  for(let i=0;i<30;i++){const p=f.placement.create("current");assert(p&&f.placement.safe({...p,regionId:"current"}));}
}
console.log("Continuous pickups: all resource types, live artwork/labels, shifted cities, mobile glow, moving troops, unloaded/failed data, bounded search and cached terrain checks passed.");
