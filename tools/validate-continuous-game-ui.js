"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {GameBridge}=require("./map-benchmark/seamless/game-bridge");
const {createNativeFixture}=require("./map-benchmark/seamless/native-fixture");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
(async()=>{
 const waits=[],activated=[],busy=[];let valid=true;
 const bridge=new GameBridge({resolve:item=>{const d=deferred();waits.push({...d,item});return d.promise;},activate:item=>activated.push(item),clear(){},valid:()=>valid,busy:v=>busy.push(v)});
 const a={sectionId:"east",id:"same"},b={sectionId:"west",id:"same"};
 const first=bridge.select(a),second=bridge.select(b);assert.equal(waits.length,1,"Concurrent section loads");
 waits[0].resolve(a);assert.equal(await first,false);await Promise.resolve();assert.equal(waits.length,2);
 waits[1].resolve(b);assert.equal(await second,true);assert.deepEqual(activated,[b]);
 const wrong=bridge.select(a);waits[2].resolve(b);assert.equal(await wrong,false,"Wrong section accepted for same city ID");
 const stale=bridge.select(a);valid=false;waits[3].resolve(a);assert.equal(await stale,false,"Session loss accepted an action");
 valid=true;const canceled=bridge.select(a);bridge.cancel();waits[4].resolve(a);assert.equal(await canceled,false);
 const disposed=bridge.select(a);bridge.dispose();waits[5].resolve(a);assert.equal(await disposed,false);assert.equal(await bridge.select(b),false);assert.equal(busy.at(-1),false);
 const recover=new GameBridge({resolve:async()=>{throw Error("offline")},activate(){throw Error("should not run")},clear(){}});
 assert.equal(await recover.select(a),false);assert.equal(recover.error,"offline");assert.equal(recover.running,false);
 const f=createNativeFixture();assert.equal(f.nativeScene.sections.length,9);assert.equal(f.nativeScene.objects.filter(o=>o.kind==="castle").length,540);
 for(const map of f.mapData.maps){const scene=f.nativeScene.objects.filter(o=>o.kind==="castle"&&o.sectionId===map.id);assert.deepEqual(new Set(scene.map(o=>o.id)),new Set(map.cities.map(c=>c.id)));
  for(const o of scene){const c=map.cities.find(c=>c.id===o.id);assert.equal(o.local.x,c.x);assert.equal(o.local.y,c.y);}}
 assert(!f.commandNonce,"Inspect-only preview must not silently send commands");
 for(const file of ["native-game","preview","game-bridge"])new vm.Script(fs.readFileSync(`tools/map-benchmark/seamless/${file}.js`,"utf8"));
 const server=createMapBenchmarkServer();try{const a=await server.listen();
  const normal=await(await fetch(a.url+"/__benchmark__/")).text();assert(!normal.includes('data-manual'),"Normal benchmark imports the new view");
  const html=await(await fetch(a.url+"/__benchmark__/?nativeWorld=1")).text();assert(html.includes('data-manual'));assert(html.includes("game-bridge.js"));
  assert.equal((await fetch(a.url+"/__benchmark__/native-command",{method:"POST",headers:{origin:a.url,"content-type":"application/json"},body:'{"name":"sendArmyOrder"}'})).status,403);
 }finally{await server.close();}
 const game=fs.readFileSync("game.js","utf8");
 const begin=game.indexOf('          const protectionText = acceptedProtection');
 const end=game.indexOf('        }',begin);
 assert(begin>0 && end>begin);
 for(const protection of [null,{mode:"normal",label:"Normal"},{mode:"raid",label:"Protected raid"}]){
   const messages=[];vm.runInNewContext(game.slice(begin,end),{acceptedProtection:protection,getAttackProtectionNotice:()=>"Raid notice",peaceShieldDeactivated:false,acceptedTroops:100,requestedTroops:100,formatNumber:String,source:{name:"Home"},target:{name:"Away"},adjustedText:"",addLog:m=>messages.push(m),showToast:m=>messages.push(m)});
   assert(messages.at(-1).includes(protection?.mode==="raid"?"Protected raid":"Attack moving"));
 }
 const production=fs.readFileSync("tools/build-production-client.js","utf8");assert(!production.includes("seamless/"));assert(!fs.readFileSync("index.html","utf8").includes("seamless/"));
 console.log("Continuous game UI: current catalog, serialized exact selection, session invalidation, disposal, private route and package boundaries passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
