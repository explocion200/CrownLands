"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {createRouter}=require("./map-benchmark/seamless/open-world-routing");
const {createRouteService}=require("./map-benchmark/seamless/open-route-service");
const {createDisplayLayout}=require("./map-benchmark/seamless/open-world-layout");
const {buildCatalog,fixture,gameToImage,imageToGame}=require("./map-benchmark/seamless/live-catalog");
const topology=require("../functions/coreExpansionTopology");
const section=(x,y)=>({id:`section-${x}-${y}`,x:x*1448,y:y*1086,width:1448,height:1086});
const geometry=(sections,obstacles=[])=>({version:"open-world-draft-v1",sections,obstacles,unitsPerPixel:2});
function verify(router,result,a,b){assert.equal(result.status,"ok",JSON.stringify(result));assert.deepEqual(result.points[0],a);assert.deepEqual(result.points.at(-1),b);
 const ignored=router.ignoredEndpoints(a,b);let length=0;
 for(let i=1;i<result.points.length;i++){assert.ok(router.clear(result.points[i-1],result.points[i],ignored),"Route crossed blocked terrain");length+=Math.hypot(result.points[i].x-result.points[i-1].x,result.points[i].y-result.points[i-1].y);}
 assert.ok(Math.abs(result.length-length)<1e-6);for(let i=1;i<result.segments.length;i++)assert.deepEqual(result.segments[i-1].points.at(-1),result.segments[i].points[0]);
}
async function main(){
 // Independent brute-force oracle for the spatial hash: horizontal, vertical,
 // reverse, zero-length, exact bucket corners and sub-pixel clearance edges.
 let seed=351;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const obstacles=Array.from({length:300},(_,i)=>({key:`oracle-${i}`,x:10+random()*2800,y:10+random()*2100,radius:random()*60}));
 obstacles.push({key:"clearance",x:127.75,y:256,radius:0});
 const oracle=createRouter(geometry([section(0,0),section(1,0),section(0,1),section(1,1)],obstacles));
 function check(a,b){const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  const expected=!obstacles.some(o=>{const t=len?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/len)):0;return Math.hypot(o.x-a.x-dx*t,o.y-a.y-dy*t)<o.radius+.5;});
  assert.equal(oracle.clear(a,b),expected,`Spatial hash differs from exact obstacle test: ${JSON.stringify([a,b])}`);
 }
 for(let i=0;i<3000;i++)check({x:1+random()*2800,y:1+random()*2100},{x:1+random()*2800,y:1+random()*2100});
 for(const x of [128,256,1408])for(const y of [128,256,1024])for(const [a,b]of [
  [{x,y},{x,y}],[{x,y:1},{x,y:2100}],[{x:1,y},{x:2800,y}],
  [{x,y},{x:x+128,y:y+128}],[{x:x+128,y:y+128},{x,y}],
  [{x:x+128,y},{x,y:y+128}],[{x,y:y+128},{x:x+128,y}]])check(a,b);
 const simple=createRouter(geometry([section(0,0),section(1,0),section(0,1),section(1,1)]));
 // Every interior edge coordinate is legal; no road midpoint or old arrow is needed.
 for(const y of [12,80,200,740,1000,1074]){const a={x:1400,y},b={x:1500,y},r=simple.route(a,b);verify(simple,r,a,b);assert.equal(r.points.length,2);assert.equal(r.length,100);}
 for(const x of [12,300,900,1400]){const a={x,y:1050},b={x,y:1150};verify(simple,simple.route(a,b),a,b);}
 const a={x:1300,y:950},b={x:1600,y:1250};verify(simple,simple.route(a,b),a,b);
 const blocked=createRouter(geometry([section(0,0),section(1,0)],[{key:"tower",x:1448,y:200,radius:85}]));
 const detour=blocked.route({x:1200,y:200},{x:1650,y:200});verify(blocked,detour,{x:1200,y:200},{x:1650,y:200});assert.ok(detour.length>450);assert.ok(detour.segments[0].points.at(-1).y!==200);
 const corner=createRouter(geometry([section(0,0),section(1,1)]));assert.equal(corner.clear(a,b),false);assert.equal(corner.route(a,b).status,"unreachable");
 const hole=createRouter(geometry([section(0,0),section(1,0),section(2,0),section(0,1),section(2,1)]));
 const ha={x:1200,y:1400},hb={x:3000,y:1400};verify(hole,hole.route(ha,hb,{maxMs:3000}),ha,hb);
 assert.equal(hole.route(ha,{x:2000,y:1400}).status,"invalid-endpoint");assert.equal(simple.route({x:NaN,y:1},b).status,"invalid-endpoint");
 assert.equal(blocked.route({x:1440,y:200},{x:1600,y:200}).status,"blocked-endpoint");
 assert.equal(blocked.route({x:1200,y:200},{x:1650,y:200},{maxVisited:1}).status,"budget-exceeded");
 const realm={worldId:"fixture",resetGeneration:"fixture",sharedRealmId:"fixture"};
 const {manifest}=buildCatalog(realm,{worldId:realm.worldId,resetGeneration:realm.resetGeneration,realmShardId:realm.sharedRealmId,topologyVersion:"core-expansion-v1",activeRegionIds:Array.from({length:87},(_,i)=>topology.getRegionAtActivationOrdinal(i).id)});
 const layout=createDisplayLayout(manifest,fixture),router=createRouter(layout.geometry);let mapped=0,seams=0;
 for(const s of manifest.sections){const cities=fixture.objects.filter(o=>o.sectionId===s.templateId&&o.kind==="castle");
  for(const o of cities){const raw=imageToGame(s,o.local),local=gameToImage(s,raw),display=layout.project(s,local,"castle");assert.deepEqual(display,o.previewLocal);assert.ok(display.x>=54&&display.y>=54&&display.x<=1394&&display.y<=1032);mapped++;}
  for(const test of [p=>p.x<=110,p=>p.x>=1338,p=>p.y<=110,p=>p.y>=976])assert.ok(cities.filter(o=>test(layout.project(s,o.local,"castle"))).length>=2);
  for(const neighbor of manifest.sections.filter(n=>(n.x===s.x+1448&&n.y===s.y)||(n.y===s.y+1086&&n.x===s.x))){
   // The 54px inset leaves a clear strip along every seam, including roads.
   const horizontal=neighbor.x!==s.x,p=horizontal?{x:s.x+1440,y:s.y+200}:{x:s.x+200,y:s.y+1078},q=horizontal?{x:s.x+1456,y:s.y+200}:{x:s.x+200,y:s.y+1094};
   verify(router,router.route(p,q),p,q);seams++;
  }
 }
 assert.equal(seams,202);
 const pairs=[],slots=layout.geometry.slots.filter(s=>s.kind==="castle");
 for(let i=0;i<16;i++){
  const a=slots[(i*317)%slots.length],b=slots[(i*317+499)%slots.length],from={x:a.x,y:a.y},to={x:b.x,y:b.y};
  const result=router.route(from,to,{maxMs:2000});verify(router,result,from,to);pairs.push({sections:result.segments.length,length:result.length,visited:result.visited,ms:result.elapsedMs});
 }
 const service=createRouteService(layout.geometry);
 try{const from={x:slots[0].x,y:slots[0].y},to={x:slots[1].x,y:slots[1].y};const r=await service.route(from,to);verify(router,r,from,to);r.points[0].x=-1;assert.equal((await service.route(from,to)).points[0].x,from.x);assert.ok(service.stats().cached<=128);
  const burst=await Promise.all(slots.slice(2,11).map(o=>service.route(from,{x:o.x,y:o.y})));assert.equal(burst.filter(r=>r.status==="busy").length,5);assert.equal(service.stats().pending,0);
 }
 finally{await service.close();}
 const output=path.resolve("release-artifacts/continuous-open-routing");fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,"routing.json"),JSON.stringify({at:new Date().toISOString(),mapped,seams,pairs},null,2));
 console.log(JSON.stringify({mapped,seams,pairs,passed:true}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
