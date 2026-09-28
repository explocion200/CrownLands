"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname,"../firebaseClient.js"),"utf8");
const start = source.indexOf("  async function loadPvpLeaderboard(");
const end = source.indexOf("  async function loadPlayerIdentities(",start);
assert(start > 0 && end > start);
function fixture(count = 100) {
  const calls = [], scope = {world:"world-a",generation:"season-a",shard:"shard-a"};
  const client = {user:{uid:"viewer"},db:{},activeSessionId:"session-a",activeSessionActivationGeneration:1,modules:{}};
  const rows = Array.from({length:count},(_,i)=>({id:"ruler-"+i,data:()=>({pvpKills:1000-i,reachedAtMs:i,worldId:scope.world})}));
  const api = {
    collection:(_db,...parts)=>parts.join("/"),doc:(_db,...parts)=>parts.join("/"),
    where:(field,op,value)=>({kind:"where",field,op,value}),orderBy:(field,direction)=>({kind:"order",field,direction}),
    documentId:()=>"__name__",limit:value=>({kind:"limit",value}),query:(collection,...constraints)=>({collection,constraints}),
    getDoc:async()=>({data:()=>({trackingStartedAtMs:50})}),
    getDocs:async query=>{
      calls.push(query);
      if(query.collection.startsWith("pvpLeaderboards/")) return {docs:rows};
      const ids=query.constraints.find(c=>c.op==="in").value;
      return {docs:ids.map(id=>({id,data:()=>({displayName:"Current "+id,flag:{fieldColor:"green"},pvpKills:999999,kingPower:7})}))};
    },
  };
  client.modules.firestore=api;
  const context={client,init:async()=>{},requireSignedIn:()=>client.user?.uid,
    ONLINE_WORLD_ID:scope.world,RESET_GENERATION:scope.generation,
    getRealmStorageId:()=>scope.generation+"--"+scope.shard,
    getRealmShardQueryConstraints:where=>[where("realmShardId","==",scope.shard)]};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  return {client,api,context,calls,load:context.loadPvpLeaderboard};
}
(async()=>{
  const f=fixture();const result=await f.load(10000);
  assert.equal(result.entries.length,100);assert.equal(f.calls.length,5);
  assert.deepEqual(f.calls.slice(1).map(q=>q.constraints.find(c=>c.op==="in").value.length),[30,30,30,10]);
  for(const q of f.calls) assert.equal(q.constraints.filter(c=>c.kind==="where"&&c.op==="==").length,3);
  assert.equal(f.calls[0].constraints.find(c=>c.kind==="limit").value,100);
  assert.deepEqual(f.calls[0].constraints.filter(c=>c.kind==="order").map(c=>[c.field,c.direction]),[["pvpKills","desc"],["reachedAtMs","asc"]]);
  assert.equal(result.entries[0].displayName,"Current ruler-0");assert.equal(result.entries[0].pvpKills,1000);
  assert.equal(result.entries[99].pvpKills,901);assert.equal(result.trackingStartedAtMs,50);
  const empty=fixture(0);assert.equal((await empty.load()).entries.length,0);assert.equal(empty.calls.length,1);
  for(const mutate of [
    f=>f.client.user={uid:"other"}, f=>f.client.activeSessionId="session-b",
    f=>f.client.activeSessionActivationGeneration++, f=>f.context.ONLINE_WORLD_ID="world-b",
    f=>f.context.RESET_GENERATION="season-b",
  ]) {
    const changed=fixture(1), read=changed.api.getDoc;
    changed.api.getDoc=async(...args)=>{mutate(changed);return read(...args);};
    await assert.rejects(changed.load(),/session changed/);
  }
  console.log("PvP client passed bounded identity reads, score ordering, canonical totals, empty boards and account/session/season guards.");
})().catch(error=>{console.error(error);process.exitCode=1;});
