"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { deleteMaintenanceDocuments } = require("../functions/maintenance-deletes");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const server = read("functions/index.js"), game = read("game.js");
const section = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

async function main() {
  const estimateContext = vm.createContext({});
  vm.runInContext(section(game, "function formatTroopEstimateBound(", "function getIncomingTroopEstimate("), estimateContext);
  vm.runInContext('Number.prototype.toLocaleString = () => { throw new Error("Hot march labels must not construct locale formatters"); };', estimateContext);
  for (const [input, expected] of [[-1,"0"],[0,"0"],[10,"10"],[999.9,"999"],[1000,"1K"],[1500,"1.5K"],[1000000,"1M"]]) {
    estimateContext.input = input;
    assert.equal(vm.runInContext("formatTroopEstimateBound(input)", estimateContext), expected);
  }
  const writes = [];
  const reportContext = vm.createContext({
    db: { doc: path => path }, getCurrentRealmShardId: () => "test-shard",
    isSuccessfulScoutIntelReport: () => true, getBattleReportsArray: () => [],
    timestampToMs: Number, safeString: value => String(value || ""),
    FieldValue: { serverTimestamp: () => "server-time" }, reportRef: (uid, id) => `${uid}/${id}`,
  });
  vm.runInContext(section(server, "function writeReport(", "function writeScoutReport("), reportContext);
  reportContext.transaction = { set: (ref, data) => {
    const check = value => { assert.notEqual(value, undefined, "Undefined values must never reach Firestore."); if(value && typeof value === "object") Object.values(value).forEach(check); };
    check(data); writes.push({ref, data});
  }};
  vm.runInContext('writeReport(transaction, "recipient", {id:"tower-scout",uid:undefined,type:"scout"})', reportContext);
  assert.equal(writes[0].data.uid, "recipient");
  assert.equal(writes[1].data.battleReports[0].uid, "recipient");
  vm.runInContext('writeReport(transaction, "recipient", {id:"other",uid:"wrong-recipient"})', reportContext);
  assert.equal(writes[2].data.uid, "recipient", "Recipient identity must match the report's document owner.");

  const deleted = [], attempted = [];
  const db = { batch() { const rows = []; return { delete(ref) { rows.push(ref); }, async commit() {
    attempted.push(rows.length); if(rows.length > 3) throw Object.assign(new Error("3 INVALID_ARGUMENT: Transaction too big. Decrease transaction size."), {code:3});
    deleted.push(...rows);
  }}; }};
  const docs = Array.from({length:103}, (_, i) => ({ref:`receipt-${i}`}));
  await deleteMaintenanceDocuments(db, docs);
  assert.deepEqual(deleted, docs.map(doc => doc.ref));
  assert.equal(new Set(deleted).size,103);
  assert.ok(Math.max(...attempted) <= 50);
  let failures = 0;
  await assert.rejects(deleteMaintenanceDocuments({batch:()=>({delete(){},commit(){failures++;throw new Error("permission denied");}})},docs),/permission denied/);
  assert.equal(failures,1,"Unrelated failures must not cause a retry storm.");

  const selectedBatches = [];
  const tokens = ["ok", "retry", "invalid"].map(id => ({id,data:()=>({token:id+"-token"})}));
  const pushContext = vm.createContext({safeString:value=>String(value||""),
    db:{collection:()=>({where:()=>({limit:()=>({get:async()=>({empty:false,docs:tokens})})})})},
    messaging:{async sendEach(messages){selectedBatches.push(messages.map(m=>m.token));return {successCount:1,responses:messages.map(m=>m.token==="ok-token"?{success:true}:m.token==="retry-token"?{success:false,error:{code:"messaging/server-unavailable"}}:{success:false,error:{code:"messaging/registration-token-not-registered"}})};}},
    isInvalidMessagingTokenError:error=>error?.code==="messaging/registration-token-not-registered",
    removeNotificationTokenDocs:async()=>{}, console,
  });
  vm.runInContext(section(server,"async function sendIncomingArmyNotification(","function queueIncomingArmyNotification("),pushContext);
  const partial = await vm.runInContext('sendIncomingArmyNotification({defenderUid:"recipient"})',pushContext);
  assert.deepEqual(Array.from(partial.deliveredTokenIds),["ok"]);
  assert.deepEqual(Array.from(partial.completedTokenIds),["ok","invalid"]);
  assert.equal(partial.retryError.code,"messaging/server-unavailable","Partial failures must remain retryable.");
  await vm.runInContext('sendIncomingArmyNotification({defenderUid:"recipient"},["ok","invalid"])',pushContext);
  assert.deepEqual(selectedBatches[1],["retry-token"],"Successful and permanently invalid devices must not be resent.");

  let scheduled=0, warnings=0, throws=true;
  const frameContext=vm.createContext({lastFrameTime:0, crownlandsAnimations:null,state:null,
    renderableArmiesFrameCacheActive:false,renderableArmiesFrameCache:null,playerCitiesFrameCacheActive:false,playerCitiesFrameCache:null,
    kingPowerRenderFrameCacheActive:false,kingPowerRenderFrameCache:null,simulationUpdateAccumulatorMs:0,
    samplePerformancePanel(){if(throws)throw new Error("Synthetic presentation failure");},updateDeploymentCheck(){},
    requestAnimationFrame(){scheduled++;},console:{warn(){warnings++;}},
  });
  vm.runInContext(section(game,"let lastFrameFailureLogTime", "function updateGame("),frameContext);
  vm.runInContext('frame(10);frame(20);',frameContext);
  assert.equal(scheduled,2,"A transient render failure must not permanently stop the animation loop.");
  assert.equal(warnings,1,"Repeated frame failures must be rate-limited.");
  for(const key of ["renderableArmiesFrameCacheActive","playerCitiesFrameCacheActive","kingPowerRenderFrameCacheActive"]) assert.equal(frameContext[key],false);
  throws=false;vm.runInContext('frame(30)',frameContext);assert.equal(scheduled,3);
  const listeners=new Map(),background=[];let releaseCache,stored="";
  const slowCache=new Promise(resolve=>{releaseCache=resolve;});
  const workerContext={URL,Request,Response,Headers,console,importScripts(){},
    self:{location:new URL("https://example.test/service-worker.js"),addEventListener:(name,fn)=>listeners.set(name,fn)},
    caches:{match:async()=>{throw new Error("Cache unavailable");},open:async()=>{await slowCache;return {put:async(_request,response)=>{stored=await response.text();}};}},
    fetch:async()=>new Response("network asset",{status:200}),
  };
  vm.runInNewContext(read("service-worker.js"),workerContext);
  let response;
  listeners.get("fetch")({request:new Request("https://example.test/game.js?v=release"),respondWith:value=>{response=value;},waitUntil:promise=>background.push(promise)});
  let timeout;
  const delivered=await Promise.race([response,new Promise((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error("Slow cache writes blocked the network response")),200);})]).finally(()=>clearTimeout(timeout));
  assert.equal(await delivered.text(),"network asset");assert.equal(background.length,1);
  releaseCache();await Promise.all(background);assert.equal(stored,"network asset","Cache writes must retain their own readable response clone.");
  listeners.get("fetch")({request:new Request("https://example.test/assets/map.webp"),respondWith:value=>{response=value;},waitUntil:promise=>background.push(promise)});
  assert.equal(await (await response).text(),"network asset","Unavailable browser storage must not prevent network asset loading.");
  await Promise.all(background);
  console.log("Stability regressions passed: report identity, bounded cleanup, push retries, frame recovery, nonblocking cache writes and unavailable storage.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
