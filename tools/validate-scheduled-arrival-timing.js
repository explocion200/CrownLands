"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const timing=require("../functions/operation-timing");
const {WorkerDiagnostics}=require("../local-backend/worker-diagnostics");
const source=fs.readFileSync(require.resolve("../functions/index.js"),"utf8");
(async()=>{
 const logs=[],errors=[],seen=[];let options;
 const diagnostics=new WorkerDiagnostics(),captured={},restore=diagnostics.capture(captured);
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
  console:{log:(name,value)=>{logs.push([name,value]);captured.log(name,value);},error:(...values)=>{errors.push(values);captured.error(...values);}},
 };
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf("exports.resolveDueArmyOrders ="),source.indexOf("async function handleCitadelAssaultSelection")),context);
 await context.exports.resolveDueArmyOrders();
 assert.equal(options.schedule,"every 1 minutes");assert.equal(options.timeoutSeconds,180);assert.equal(seen.length,4);assert(seen.every(x=>x.callerUid===""));
 const detailed=logs.filter(([name])=>name==="crownlands_arrival_timing");assert.equal(detailed.length,4);
 assert(detailed.some(([,s])=>s.outcome==="resolved"&&s.dbReadRows===2));assert(detailed.some(([,s])=>s.outcome==="error"&&s.dbReadRows===1));
 assert(!/private|armyId|ownerUid|requestedRegions|SQL/.test(JSON.stringify(detailed)));
 const finished=logs.find(([name])=>name==="Scheduled army resolution finished")[1];assert.equal(finished.resolved,2);assert.equal(finished.skipped,1);assert.equal(finished.failed,1);assert.equal(errors.length,1);
 assert.deepEqual(timing.snapshot(),{});
 const retained=diagnostics.snapshot();assert.equal(retained.arrivalTimings.length,4);assert.equal(retained.counts.error,1);
 assert(!/private|armyId|ownerUid|requestedRegions|SQL/.test(JSON.stringify(retained)));
 assert.equal(retained.arrivalTimings[0].dbReadRows,2);
 assert.equal(retained.arrivalAggregate.samples,4); assert.deepEqual(retained.arrivalAggregate.outcomes,{resolved:2,skipped:1,error:1});
 assert.equal(retained.arrivalAggregate.request.count,4); assert.equal(retained.arrivalAggregate.request.sum,503);
 assert.equal(retained.arrivalAggregate.queueDelay.count,4); assert(retained.arrivalAggregate.queueDelay.max>=1000);
 assert(detailed.every(([,sample])=>sample.queueDelayMs>=1000));
 retained.arrivalTimings[0].dbReadRows=999;assert.equal(diagnostics.snapshot().arrivalTimings[0].dbReadRows,2);
 const phases=Object.assign(Object.create({dbPoolWait:999}),{dbRead:42,privateMap:"private-data",dbCommit:Infinity,dbBackoff:-1});
 Object.defineProperty(phases,"routePlanning",{get(){throw Error("Do not invoke a logged phase getter");}});
 const payload={operation:"scheduledArmyArrival",outcome:"resolved",requestDurationMs:1e20,dbReadRows:1e20,phaseDurationMs:phases,ownerUid:"private-owner",SQL:"private-SQL"};
 Object.defineProperty(payload,"dbRetries",{get(){throw Error("Do not invoke a logged counter getter");}});
 for(let i=0;i<100;i++)captured.log("crownlands_arrival_timing",payload);
 const bounded=diagnostics.snapshot();assert.equal(bounded.arrivalTimings.length,32);assert.equal(bounded.arrivalAggregate.samples,104);
 assert.equal(bounded.arrivalAggregate.request.count,104);assert.equal(bounded.arrivalAggregate.counters.dbReadRows,100000005);
 assert.equal(bounded.arrivalAggregate.phases.dbRead.count,100);
 assert.equal(bounded.arrivalAggregate.phases.dbRead.sum,4200);
 assert.deepEqual(bounded.arrivalTimings[0],{operation:"scheduledArmyArrival",outcome:"resolved",requestDurationMs:1000000,phaseDurationMs:{dbRead:42},dbReadRows:1000000});
 for(const override of [{operation:"private-operation"},{outcome:"private-outcome"},{requestDurationMs:"private-duration"},{requestDurationMs:NaN}])captured.log("crownlands_arrival_timing",{...payload,...override});
 assert.deepEqual(diagnostics.snapshot().arrivalTimings,bounded.arrivalTimings);restore();assert.equal(captured.log,undefined);
 console.log("Scheduled arrival timing: all-outcome aggregate histograms and bounded recent samples, bounded private worker-status capture, private-field/getter exclusion, unchanged concurrency/schedule/results and expected failures passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
