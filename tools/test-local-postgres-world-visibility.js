"use strict";
const assert=require("node:assert/strict"), fs=require("node:fs"),vm=require("node:vm");
const {createStageThreeServer}=require("./map-benchmark/seamless/stage-three-server");
const {CONTRACT}=require("./map-benchmark/seamless/game-visibility");
const {applyPacket}=require("./map-benchmark/seamless/delta-feed");
// Run the exact live producer's pure projection functions, as the established
// incoming-army validator does. Never import/start the production function app.
const source=fs.readFileSync("functions/index.js","utf8");
function fn(name) { const start=source.indexOf(`function ${name}(`),body=source.indexOf(") {",start)+2; assert.ok(start>=0&&body>start);let depth=0;for(let i=body;i<source.length;i++){if(source[i]==="{")depth++;if(source[i]==="}")depth--;if(!depth)return source.slice(start,i+1);}throw Error("Missing function end"); }
const gone=Symbol("delete"),sandbox={FieldValue:{delete:()=>gone},ARMY_TROOP_VISIBILITY_VERSION:3,ARMY_TROOP_ESTIMATE_DECADE_MAX:1000000,safeNumber:(n,f=0)=>Number.isFinite(Number(n))?Number(n):f};
vm.createContext(sandbox);for(const name of ["formatTroopEstimateBound","getIncomingTroopEstimate","isEstimatedAttackMovement","isEstimatedClanReinforcementMovement","isPrivateTransferMovement","createArmyPublicProjection"])vm.runInContext(fn(name),sandbox);
const publicArmy=data=>Object.fromEntries(Object.entries(sandbox.createArmyPublicProjection(data)).filter(([,v])=>v!==gone));
async function main(){
 let clock=Date.now(),clockStep=0; const server=await createStageThreeServer({scripted:false,clock:()=>{const now=clock;clock+=clockStep;return now;}}); const {realm,store}=server;
 try {
  const template=realm.initial.find(r=>r.kind==="march"),id=template.sections[0], uid="sample-rowan",other="sample-alder", cases=[];
  function row(name,path,data,visible,visibility){const key=id+":"+name;const r={...template,key,viewers:[uid,other],body:{...template.body,key,id:name,name,owner:"Fixture owner",troops:123456,email:"never@example.test",attackCombatSnapshot:{secret:true},scoutReports:{secret:true}},source:{path,data:{...CONTRACT,...data}}};cases.push({name,r,visible,visibility});return r;}
  const privateBase={ownerUid:other,status:"active",kind:"attack",troops:123456,requestedTroops:123456,launchCombatForecast:{secret:true},attackCombatSnapshot:{secret:true}};
  row("own","armies/own",{...privateBase,ownerUid:uid},true,"exact");
  row("outsider","armies/outsider",privateBase,false);
  row("clan-alone","armies/clan-alone",{...privateBase,clanId:"sample-clan"},false);
  row("participant","armies/participant",{...privateBase,participantUids:[uid]},true,"hidden");
  row("incoming-rally","armies/incoming-rally",{...privateBase,rallyAttack:true,targetOwnerUid:uid},true,"hidden");
  row("incoming-normal-private","armies/incoming",{...privateBase,targetOwnerUid:uid},false);
  for(const kind of ["attack","reinforce","transfer"]){const data=publicArmy({...privateBase,kind}); assert.ok(!("troops"in data));assert.ok(!("attackCombatSnapshot"in data));row("public-"+kind,`islands/${CONTRACT.worldId}-sample/armies/${kind}`,data,true,kind==="transfer"?"hidden":"estimate");}
  row("incoming-view",`players/${uid}/incomingArmies/one`,publicArmy(privateBase),true,"estimate");
  row("other-incoming",`players/${other}/incomingArmies/one`,publicArmy(privateBase),false);
  row("stationed-owner","reinforcements/own",{ownerUid:uid,targetOwnerUid:other,status:"stationed"},true,"exact");
  row("stationed-host","reinforcements/host",{ownerUid:other,targetOwnerUid:uid,status:"stationed"},true,"hidden");
  row("stationed-outsider","reinforcements/other",{ownerUid:other,targetOwnerUid:"else",status:"stationed"},false);
  row("travelling-not-stationed","reinforcements/travel",{ownerUid:uid,status:"active"},false);
  row("clan-rally","clans/sample-clan/rallies/one",{ownerUid:other},true,"hidden");
  row("other-clan-rally","clans/other/rallies/one",{ownerUid:other},false);
  await store.doc("holdingTowers/sample-tower").set({...CONTRACT,clanId:"sample-clan"});
  row("clan-tower","holdingTowers/sample-tower/garrison/sample-alder",{ownerUid:other,clanId:"sample-clan"},true,"hidden");
  row("wrong-generation","armies/old",{ownerUid:uid,resetGeneration:"old"},false);
  row("wrong-shard","armies/shard",{ownerUid:uid,realmShardId:"other"},false);
  row("old-island",`islands/old-world-sample/armies/one`,publicArmy(privateBase),false);
  row("own-scout",`players/${uid}/serverReports/scout`,{ownerUid:uid,scoutReport:{expiresAtMs:Date.now()+600000}},true,"exact");
  row("expired-scout",`players/${uid}/serverReports/expired`,{ownerUid:uid,scoutReport:{expiresAtMs:1}},false);
  row("other-scout",`players/${other}/serverReports/scout`,{ownerUid:other,scoutReport:{expiresAtMs:Date.now()+600000}},false);
  // Existing rows are not test candidates. Insert the matrix atomically, with
  // both viewers included so the real Access engine must decide each result.
  await realm.change(cases.map(c=>({key:c.r.key,row:c.r})));
  let packet=await realm.read(uid,[id]), cursor={epoch:packet.epoch,revision:packet.revision};
  for(const c of cases){const dto=packet.marches.upsert.find(o=>o.key===c.r.key);assert.equal(!!dto,c.visible,c.name);if(dto){assert.equal(dto.troopVisibility,c.visibility,c.name);if(c.visibility!=="exact")assert.ok(!("troops"in dto),c.name);if(c.visibility==="estimate")assert.equal(dto.troopEstimateLabel,"100K–1M");}}
  assert.ok(!/"(?:source|email|requestedTroops|attackCombatSnapshot|launchCombatForecast|scoutReports|participantUids)"/.test(JSON.stringify(packet)));
  let data=applyPacket({revision:-1,sections:[],marches:[],routes:[]},packet,[id],null);
  // Tower ownership is a separate permission dependency: revoke its clan,
  // without changing the viewer or the map row journal.
  await store.doc("holdingTowers/sample-tower").update({clanId:"other"});
  packet=await realm.read(uid,[id],cursor);assert.equal(packet.kind,"snapshot");
  data=applyPacket(data,packet,[id],cursor);assert.ok(!data.marches.some(m=>m.id==="clan-tower"));
  cursor={epoch:packet.epoch,revision:packet.revision};
  // Membership loss must invalidate an unchanged journal cursor: snapshot and
  // client diff remove formerly visible clan data, even without a row event.
  await store.doc(`clans/sample-clan/members/${uid}`).update({status:"left"});
  packet=await realm.read(uid,[id],cursor);assert.equal(packet.kind,"snapshot");assert.notEqual(packet.epoch,cursor.epoch);
  data=applyPacket(data,packet,[id],cursor);assert.ok(!data.marches.some(m=>["clan-rally","clan-tower"].includes(m.id)));
  cursor={epoch:packet.epoch,revision:packet.revision};
  clock += 700000;packet=await realm.read(uid,[id],cursor);assert.equal(packet.kind,"snapshot");assert.ok(!packet.marches.upsert.some(m=>m.id==="own-scout"),"Expired intelligence survived a no-change poll");
  // An expiry between clock reads must not label an unexpired row with the
  // already-expired epoch, which would leave it cached on all later deltas.
  const scout=cases.find(c=>c.name==="own-scout").r, edgeKey=id+":boundary-scout";
  await realm.change([{key:edgeKey,row:{...scout,key:edgeKey,body:{...scout.body,key:edgeKey,id:"boundary-scout"},source:{...scout.source,data:{...scout.source.data,scoutReport:{expiresAtMs:clock+1}}}}}]);
  clockStep=2;packet=await realm.read(uid,[id]);assert.ok(packet.marches.upsert.some(m=>m.key===edgeKey));
  cursor={epoch:packet.epoch,revision:packet.revision};packet=await realm.read(uid,[id],cursor);clockStep=0;
  assert.equal(packet.kind,"snapshot");assert.ok(!packet.marches.upsert.some(m=>m.key===edgeKey));
  cursor={epoch:packet.epoch,revision:packet.revision};
  const owned=cases.find(c=>c.name==="own").r;
  await realm.change([{key:owned.key,row:{...owned,source:{...owned.source,data:{...owned.source.data,ownerUid:other}}}}]);
  packet=await realm.read(uid,[id],cursor);assert.ok(packet.marches.remove.includes(owned.key));
  // Reconnect/epoch restart keeps the same authorization outcome, never an old
  // private selection or cached grant from another account/realm.
  realm.epoch="restarted-private-realm";packet=await realm.read(uid,[id],cursor);assert.equal(packet.kind,"snapshot");assert.ok(!packet.marches.upsert.some(m=>m.key===owned.key));
  await store.doc("players/"+uid).update({resetGeneration:"old"});await assert.rejects(()=>realm.read(uid,[id]),e=>e.code==="permission-denied");
  console.log(`Game visibility: ${cases.length} real Access/projection cases, current realm/shard, public estimate/hidden counts, clan/rally/reinforcement/scout privacy, membership revocation, owner change and restart passed.`);
 } finally {await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
