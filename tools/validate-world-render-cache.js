"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const M=require("../world/model"),{AssetLoader}=require("../world/assets");
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 let seed=61;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 const objects=Array.from({length:1800},(_,key)=>({key,left:random()*9000-500,top:random()*7000-500,width:20+random()*700,height:20+random()*700}));
 const index=new M.SpatialIndex(objects);
 for(let i=0;i<300;i++){const left=random()*8500,top=random()*6500,view={left,top,right:left+100+random()*4000,bottom:top+100+random()*2500};assert.deepEqual(index.query(view),objects.filter(o=>M.intersects(view,o.left,o.top,o.width,o.height)));}
 const pending=[],released=[],loader=new AssetLoader(()=>{},(path,signal)=>new Promise((resolve,reject)=>pending.push({path,signal,resolve,reject})),url=>released.push(url));
 loader.update(Array.from({length:10},(_,i)=>({path:"terrain-"+i,kind:"full",priority:i})));await tick();assert.equal(pending.length,2);
 loader.update([{path:"new",kind:"full",priority:0}]);assert(pending.every(p=>p.signal.aborted));pending.splice(0).forEach(p=>p.resolve(p.path));await tick();assert(!loader.get("terrain-0"));assert(released.includes("terrain-0"));
 pending.shift().reject(Error("Offline"));await tick();assert.equal(loader.stats().failed,1);loader.retry();await tick();pending.shift().resolve("new-loaded");await tick();assert.equal(loader.get("new"),"new-loaded");
 for(let group=0;group<5;group++){
  loader.update(Array.from({length:45},(_,i)=>({path:`sprite-${group}-${i}`,kind:"sprite",priority:i})));
  await tick();while(pending.length){pending.splice(0).forEach(p=>p.resolve(p.path));await tick();}
  assert(loader.stats().sprites<=loader.stats().requestedSprites+64);
 }
 loader.update([]);assert(loader.stats().sprites<=64);assert(loader.stats().peakRequests<=2);assert(loader.stats().peakFull<=4);loader.dispose();assert.equal(loader.stats().cached,0);
 // Exact-scale drawing reuse, invalidation and bounded allocation without
 // requiring a GPU for the pure cache contract. Browser tests inspect pixels.
 let draws=0;const context={setTransform(){},clearRect(){},drawImage(){draws++;}};
 const canvas=()=>({width:0,height:0,style:{},setAttribute(){},getContext:()=>context,remove(){}});
 const sandbox={window:{},devicePixelRatio:2,Image:class {complete=true;naturalWidth=64;},document:{createElement:canvas}};
 vm.runInNewContext(fs.readFileSync("world/sprite-layer.js","utf8"),sandbox);
 const assets=new Map([["tree","blob:tree"]]),layer=new sandbox.window.SeamlessSpriteLayer({append(){}},{get:key=>assets.get(key)});
 const items=[{key:"tree1",asset:"tree",left:300,top:250,width:60,height:60}],size={width:844,height:390},camera={x:400,y:300,zoom:1};
 layer.scenery(items,camera,size);const initial=layer.stats();assert.equal(initial.tileBuilds,1);
 layer.scenery(items,{...camera,x:410},size);assert.equal(layer.stats().tileBuilds,1);assert.equal(layer.stats().tileHits,1);
 layer.scenery(items,{...camera,zoom:2},size);assert.equal(layer.stats().tileBuilds,2,"Zoom must draw at its actual resolution");
 layer.scenery([],{...camera,zoom:2},size);assert.equal(layer.stats().tileBuilds,3,"Clearance changes must remove a covered decoration");
 assets.delete("tree");layer.scenery([],camera,size);assert.equal(layer.stats().images,0);
 assets.set("tree","blob:tree-again");layer.scenery(items,camera,{width:8000,height:4000});
 assets.delete("tree");layer.scenery([],camera,{width:8000,height:4000});
 assert.equal(layer.stats().images,0,"Direct drawing must also release evicted sprite references");
 assert.equal(layer.stats().tileBytes,0,"Oversized displays must bypass the overscanned drawing cache");
 assert(draws>0);layer.dispose();assert.equal(layer.stats().images,0);assert.equal(layer.stats().tileBytes,0);
 console.log("World render cache passed: ordered spatial queries, late/failed asset loads, active art retention, bounded caches, zoom and scenery invalidation, disposal.");
})().catch(error=>{console.error(error);process.exitCode=1;});
