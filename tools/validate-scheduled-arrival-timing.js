"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const timing=require("../functions/operation-timing");
const source=fs.readFileSync(require.resolve("../functions/index.js"),"utf8");
(async()=>{
 const logs=[],errors=[],seen=[];let options;
 const targets=["slow","fast","expected","failed"].map(armyId=>({armyId,ownerUid:"private-owner",realmShardId:"private-shard",requestedRegions:["private-map"],arrivesAtMs:Date.now()-1000}));
 const context={exports:{},onSchedule:(o,fn)=>{options=o;return fn;},Date,Set,
  OPERATION_TIMING:{...timing,snapshot:()=>{const s=timing.snapshot();return {...s,requestDurationMs:s.dbReadRows===2?500:1};}},
  SCHEDULED_ARMY_RESOLVE_MAX_PAGES:2,SCHEDULED_ARMY_RESOLVE_RUNTIME_BUDGET_MS:60000,SCHEDULED_ARMY_RESOLVE_CONCURRENCY:8,
  loadDueArmyTargets:async()=>({targets,cursor:null,exhausted:true}),
  processWithConcurrency:async(rows,limit,fn)=>{assert.equal(limit,8);await Promise.all(rows.map(fn));},
  runWithRealmShard:async(shard,fn)=>{assert.equal(shard,"private-shard");return fn();},
  resolveArmyOrderById:async input=>{seen.push(input);timing.count("dbReadRows",input.armyId==="slow"?2:1);await new Promise(r=>setImmediate(r));
   if(["expected","failed"].includes(input.armyId))throw Object.assign(Error("private-failure"),{expected:input.armyId==="expected"});
   return {status:"resolved"};},
  isExpectedScheduledResolveError:error=>error.expected,
  loadDueArmyBacklogSnapshot:async()=>({pending:0,oldestArmyId:null,oldestLateByMs:0}),REALM_RELEASE_ID:"fixture",RESET_GENERATION:"fixture",
  console:{log:(name,value)=>logs.push([name,value]),error:(...values)=>errors.push(values)},
 };
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf("exports.resolveDueArmyOrders ="),source.indexOf("async function handleCitadelAssaultSelection")),context);
 await context.exports.resolveDueArmyOrders();
 assert.equal(options.schedule,"every 1 minutes");assert.equal(options.timeoutSeconds,180);assert.equal(seen.length,4);assert(seen.every(x=>x.callerUid===""));
 const detailed=logs.filter(([name])=>name==="crownlands_arrival_timing");assert.equal(detailed.length,2);
 assert(detailed.some(([,s])=>s.outcome==="resolved"&&s.dbReadRows===2));assert(detailed.some(([,s])=>s.outcome==="error"&&s.dbReadRows===1));
 assert(!/private|armyId|ownerUid|requestedRegions|SQL/.test(JSON.stringify(detailed)));
 const finished=logs.find(([name])=>name==="Scheduled army resolution finished")[1];assert.equal(finished.resolved,2);assert.equal(finished.skipped,1);assert.equal(finished.failed,1);assert.equal(errors.length,1);
 assert.deepEqual(timing.snapshot(),{});
 console.log("Scheduled arrival timing: isolated slow/error samples, private-field exclusion, unchanged concurrency/schedule/results and expected failures passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
