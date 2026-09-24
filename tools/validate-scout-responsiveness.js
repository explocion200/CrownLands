"use strict";
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { clientSource, extractFunction } = require("./world-travel-test-fixtures");
function load(scope,names) {
  vm.createContext(scope);
  for(const name of names) {
    const source=extractFunction(clientSource,name);
    const async=clientSource.includes(`async function ${name}(`);
    vm.runInContext((async?"async ":"")+source,scope);
  }
  return scope;
}
const drain=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const noop=()=>{};
async function resolutionChecks() {
  let now=10000,scopeKey="player:realm:session1",calls=0,apply=0,present=0,backfill=0;
  const requests=[];
  const scope=load({
    console:{warn:noop},Date:{now:()=>now},performance:{now:()=>now},Math:Object.assign(Object.create(Math),{random:()=>.5}),
    state:{attacks:[]},RESET_GENERATION:"test",resolvingOnlineArmyIds:new Set(),resolvedOnlineArmyIds:new Set(),
    scoutResolutionRequests:new Map(),scoutResolutionRetries:new Map(),
    usesServerArmyAuthority:()=>true,getOnlineArmyResolutionId:m=>m.onlineId||m.id,
    getOnlineSessionRequestScope:()=>scopeKey,getMissionRegionIds:()=>["map"],
    getOnlineApi:()=>({resolveArmyOrder:()=>{calls++;return new Promise((resolve,reject)=>requests.push({resolve,reject}));}}),
    recordMarchInteractionTiming:noop,applyServerArmyResult:()=>apply++,purgeResolvedOnlineArmy:noop,adoptServerArmyMovement:noop,
    scheduleScoutPresentation:()=>present++,saveGame:noop,flushOnlineSave:()=>assert.fail("Scout forced a cloud save"),
    renderAll:()=>assert.fail("Scout forced a full map render"),updateIncomingAttackUi:noop,updateOutgoingAttackUi:noop,
    loadServerReportsOnce:()=>{backfill++;return new Promise(()=>{});},
    getOnlineArmyRemainingSeconds:()=>0,
  },["createScoutResolutionQueue","isServerArmyNotArrivedError","deferServerArmyResolutionRetry","resolveServerArmyMission","resolveOverdueOnlineArmyAsync","resolveOverdueOnlineArmy"]);
  scope.queueScoutResolution=scope.createScoutResolutionQueue();
  const mission=id=>({id,onlineId:id,kind:"scout",toId:"target-"+id,onlineRegionIds:["map"]});
  const first=scope.resolveServerArmyMission(mission("one"));
  scope.resolveOverdueOnlineArmy(mission("one"));
  await scope.resolveOverdueOnlineArmyAsync(mission("one"));
  const rest=Array.from({length:4},(_,i)=>scope.resolveServerArmyMission(mission("batch-"+i)));
  await drain();assert.equal(calls,2,"Countdown/reconnect duplicated a request or exceeded two workers");
  // Keep worker one stalled while worker two delivers every other report.
  for(let i=1;i<5;i++){requests[i].resolve({status:"resolved",reports:[{type:"scout"}]});await drain();}
  assert.equal(apply,4);assert.equal(present,4);assert.equal(calls,5);
  requests[0].resolve({status:"already-resolved"});await first;await Promise.all(rest);
  assert.equal(backfill,1,"Resolved receipt did not request missing reports");
  assert.equal(scope.scoutResolutionRequests.size,0,"A missing-report read held the resolution lock");
  // Retries must be keyed to the canonical army, not a transient snapshot object.
  for(let attempt=1;attempt<=5;attempt++) {
    const p=scope.resolveServerArmyMission(mission("retry"));await drain();
    requests.at(-1).reject({code:"functions/unavailable",message:"network"});await p;
    const retry=scope.scoutResolutionRetries.get("retry");
    assert.equal(retry.retryAtMs-now,Math.min(8000,1000*2**(attempt-1)));
    const before=calls;await scope.resolveServerArmyMission(mission("retry"));
    scope.resolveOverdueOnlineArmy(mission("retry"));await drain();assert.equal(calls,before);
    now=retry.retryAtMs;
  }
  const early=scope.resolveServerArmyMission(mission("clock"));await drain();
  requests.at(-1).reject({code:"functions/failed-precondition",message:"Army has not arrived yet."});await early;
  assert.equal(scope.scoutResolutionRetries.get("clock").retryAtMs-now,1000);
  const forbidden=scope.resolveServerArmyMission(mission("forbidden"));await drain();
  requests.at(-1).reject({code:"functions/permission-denied"});await forbidden;
  assert.equal(scope.scoutResolutionRetries.get("forbidden").retryAtMs,Infinity);
  const stale=scope.resolveServerArmyMission(mission("stale"));await drain();
  const before=apply;scopeKey="other:realm:session2";requests.at(-1).resolve({status:"resolved",reports:[]});await stale;
  assert.equal(apply,before,"Old-session arrival changed the new account");
}
async function reportReadChecks() {
  let scopeKey="one",calls=0,resolveRead;
  const scope=load({getOnlineSessionRequestScope:()=>scopeKey,scoutReportRead:null,
    performServerReportRead:()=>{calls++;return new Promise(resolve=>{resolveRead=resolve;});}
  },["loadServerReportsOnce"]);
  const first=scope.loadServerReportsOnce(),second=scope.loadServerReportsOnce();
  assert.equal(first,second);assert.equal(calls,1);
  const oldResolve=resolveRead;scopeKey="two";const next=scope.loadServerReportsOnce();
  oldResolve(true);await first;assert.equal(scope.scoutReportRead.scope,"two");
  resolveRead(true);await next;assert.equal(scope.scoutReportRead,null);
}
async function debounceChecks() {
  let now=10,key="one",timer,refreshes=0;
  const scope=load({performance:{now:()=>now},scoutEconomyRefreshRevisionMs:0,scoutEconomyRefreshStartedAt:0,
    scoutEconomyRefreshTimer:0,getOnlineSessionRequestScope:()=>key,lastAuthoritativeProfileRevisionMs:0,
    lastReportDrivenEconomyRefreshAtMs:0,refreshServerEconomy:()=>refreshes++,
    clearTimeout:noop,setTimeout:(fn,delay)=>{timer={fn,delay};return 1;},
  },["scheduleScoutEconomyRefresh"]);
  scope.scheduleScoutEconomyRefresh(1);assert.equal(timer.delay,250);
  now=210;scope.scheduleScoutEconomyRefresh(2);assert.equal(timer.delay,250);
  now=910;scope.scheduleScoutEconomyRefresh(3);assert.equal(timer.delay,100);
  timer.fn();assert.equal(refreshes,1);assert.equal(scope.lastReportDrivenEconomyRefreshAtMs,3);
  scope.lastAuthoritativeProfileRevisionMs=10;scope.scheduleScoutEconomyRefresh(4);timer.fn();assert.equal(refreshes,1);
  scope.scheduleScoutEconomyRefresh(20);key="two";timer.fn();assert.equal(refreshes,1,"Old session refreshed new economy");
}
async function nearbyChecks() {
  let scopeKey="one",calls=0,applied=0,rendered=0,feedback=0,release,reject,sequence=0;
  const sent=[];
  const source={id:"source",name:"Source",owner:"player",troops:100};
  const targets=Array.from({length:24},(_,i)=>({id:"target-"+i}));
  const scope=load({console,performance:{now:()=>1},requestAnimationFrame:fn=>fn(),
    state:{gold:100000},SCOUT_NEARBY_COST:75000,ONLINE_WORLD_ID:"realm",RESET_GENERATION:"generation",
    scoutNearbySourceId:null,regroupSourceId:null,pendingBulkOrderAction:null,bulkOrderActionRequestId:0,bulkOrderRequestIds:new Map(),
    canUseBulkArmyOrders:()=>true,supportsBulkArmyOrders:()=>true,getOnlineSessionRequestScope:()=>scopeKey,
    cityById:()=>source,getCityRegionId:()=>"map",getNearbyScoutCandidates:()=>targets,
    createOnlineArmyId:()=>"request-"+ ++sequence,
    renderAll:()=>rendered++,renderScoutNearbyFeedback:()=>feedback++,recordMarchInteractionTiming:noop,
    showToast:noop,rejectGameAction:noop,formatNumber:String,playGameSound:noop,addLog:noop,
    rememberScoutVeilBlocksFromError:()=>false,
    applyServerBulkOrderResult:(result,options)=>{assert.equal(options.render,false);applied++;return result.armies;},
    getOnlineApi:()=>({sendNearbyScouts:request=>{calls++;sent.push(request);return new Promise((resolve,fail)=>{release=resolve;reject=fail;});}}),
  },["getBulkOrderKey","getBulkOrderRequestId","beginBulkOrderAction","isBulkOrderActionCurrent","finishBulkOrderAction","cancelBulkOrderPreview","toggleScoutNearby"]);
  await scope.toggleScoutNearby(source.id);assert.equal(calls,0);
  const before=rendered;const first=scope.toggleScoutNearby(source.id);
  await scope.toggleScoutNearby(source.id);assert.equal(calls,1);assert.equal(rendered,before,"Pending batch forced a full redraw");
  assert(feedback>0);assert.equal(sent[0].targetCityIds.length,24);
  reject({code:"functions/unavailable"});await first;
  const retry=scope.toggleScoutNearby(source.id);assert.equal(sent[1].requestId,sent[0].requestId,"Uncertain batch retry changed its receipt ID");
  release({armies:targets.map(t=>({id:t.id}))});await retry;
  assert.equal(applied,1);assert.equal(scope.bulkOrderRequestIds.size,0);
  await scope.toggleScoutNearby(source.id);const stale=scope.toggleScoutNearby(source.id);scopeKey="other";
  release({armies:[]});await stale;assert.equal(applied,1,"Old-session batch changed the new account");
}
async function main(){await resolutionChecks();await reportReadChecks();await debounceChecks();await nearbyChecks();
  console.log("Scout responsiveness passed: two workers, independent delivery, duplicate entry points, 1/2/4/8s retries, early arrivals, stale sessions, nonblocking backfill, single-flight reads, and bounded economy debounce.");}
main().catch(error=>{console.error(error);process.exitCode=1;});
