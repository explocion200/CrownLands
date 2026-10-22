"use strict";
const assert=require("node:assert/strict"),{applyPacket}=require("../world/delta-feed");
const ids=["a"],empty={sections:[],marches:[],routes:[]};
const snapshot={kind:"snapshot",epoch:"one",viewer:"player",revision:1,serverTime:100,ids,
 objects:{upsert:[{key:"a:c",sectionId:"a",ownerUid:"player",troopVisibility:"exact",troops:10}],remove:[]},
 marches:{upsert:[{key:"march:x",sections:ids,routeId:"route",kind:"troop"}],remove:[]},routes:[{id:"route",points:[{x:0,y:0},{x:100,y:100}]}]};
let previous=applyPacket(empty,snapshot,ids,null),cursor={epoch:"one",revision:1};
const packet={...snapshot,kind:"delta",fromRevision:1,revision:2,serverTime:101,objects:{upsert:[],remove:[]},marches:{upsert:[],remove:[]},routes:[]};
const next=applyPacket(previous,packet,ids,cursor);
for(const name of ["sections","marches","routes"])assert.equal(next[name],previous[name],"Unchanged delta copied "+name);
assert.equal(next.serverTime,101);assert.equal(next.revision,2);assert.deepEqual(next.removed,[]);
for(const invalid of [{viewer:"other"},{epoch:"other"},{fromRevision:0},{revision:0},{ids:["b"]},{serverTime:NaN},{objects:{upsert:{length:0},remove:[]}},{routes:{length:0}}])assert.throws(()=>applyPacket(previous,{...packet,...invalid},ids,cursor));
const changed=applyPacket(previous,{...packet,objects:{upsert:[{...snapshot.objects.upsert[0],ownerUid:"enemy",troopVisibility:"hidden",troops:null}],remove:[]}},ids,cursor);
assert.notEqual(changed.sections,previous.sections);assert.equal(changed.sections[0].objects[0].troopVisibility,"hidden");
const removed=applyPacket(previous,{...packet,objects:{upsert:[],remove:["a:c"]},marches:{upsert:[],remove:["march:x"]}},ids,cursor);
assert.equal(removed.sections[0].objects.length,0);assert.equal(removed.routes.length,0);
const switched=applyPacket(previous,{...snapshot,epoch:"two",viewer:"other",revision:0},ids,cursor);
assert.notEqual(switched.sections,previous.sections);assert.equal(switched.viewer,"other");
assert.throws(()=>applyPacket(previous,{...packet,routes:[{id:"route",points:[{x:3,y:0},{x:100,y:100}]}]},ids,cursor),/Route identity/);
console.log("Production area deltas: unchanged identity/clock, malformed envelopes, changed ownership/disclosure, removals, route consistency and principal/epoch snapshots passed.");
