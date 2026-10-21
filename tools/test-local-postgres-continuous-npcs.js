"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const {createGameplayPilot}=require("./map-benchmark/seamless/gameplay-pilot");
const {createTravelFixture}=require("./world-travel-test-fixtures");
const {createPlacementFixture}=require("./validate-marauder-terrain");
const {roadPlacementPoints,isClear,createMarauderPopulation}=require("../functions/marauder-population");
const {LiveReader}=require("../local-backend/world/reader");
const {imageToGame,gameToImage}=require("../local-backend/world/catalog");
const M=require("../functions/marauder-rules");
(async()=>{
 const p=await createGameplayPilot({productionRouting:true});
 try{
  const {store,identity}=p,context=p.context(),travel=createTravelFixture(87);
  const fixture=createPlacementFixture(travel,{routing:p.routing,context});
  const reader=new LiveReader({pool:p.reader.pool,schema:store.schema,openWorld:true});await reader.initialize(p.players[0].uid);
  let points=0;
  for(const section of reader.sections.values()){
   const area=fixture.geometry(section.id),roads=roadPlacementPoints(area);assert(roads.length);
   const old=fixture.context.getAuthoritativeIslandSeed(section.id).cities;
   for(const city of old){const original={...city},projected=area.projectStructure(city),local=gameToImage(section,city),shown=reader.display.project(section,local,"castle"),actual=gameToImage(section,projected);
    assert(Math.hypot(actual.x-shown.x,actual.y-shown.y)<1e-7,"Spawn clearance differs from visible castle");
    assert.equal(projected.id,city.id);assert.deepEqual(city,original,"Projection must not mutate saved city coordinates");
   }
   for(const point of roads){const local=gameToImage(section,point);assert(Number.isFinite(local.x)&&Number.isFinite(local.y));points++;}
  }
  const regionId="core-v2-north-east-holding-tower-p1-m1",section=reader.sections.get(regionId),area=fixture.geometry(regionId);
  const clear=roadPlacementPoints(area).filter(point=>isClear(point,area)&&area.accessible({...point,regionId}));
  assert(clear.length>1,"Lionwatch needs multiple valid roads at displayed castle positions");
  const island=`islands/${identity.worldId}--${identity.realmShardId}--${regionId}`;
  await store.doc(island).set({...identity,regionId});
  await store.doc(`marauderPopulation/${identity.resetGeneration}--${identity.realmShardId}`).set({enabled:true});
  const id="marauder_"+crypto.createHash("sha256").update(regionId).digest("hex").slice(0,12)+"_00";
  const spawnId=crypto.randomUUID(),now=Date.now(),due=now+1800000;
  const old={...identity,id,regionId,spawnId,slot:0,status:"defeated",classification:"boss",level:90,balanceVersion:1,
   name:"Lionwatch fixture boss",targetType:"marauder",ownerKind:"neutral",ownerUid:"",respawnAtMs:due,...imageToGame(section,{x:1272,y:128})};
  const pub=store.doc(`${island}/marauders/${id}`),priv=store.doc(`${island}/marauderCombat/${id}`);
  await store.batch().set(pub,old).set(priv,{...old,troops:0}).commit();
  const invoke=(name,data)=>p.routes.find(r=>r.name===name).handler({auth:{uid:p.players[0].uid,token:{email_verified:true,firebase:{sign_in_provider:"password"}}},data:{...data,clientReleaseId:identity.releaseId,clientWorldId:identity.worldId,clientResetGeneration:identity.resetGeneration,clientRealmShardId:identity.realmShardId}});
  const request={id,regionId,spawnId};
  assert.equal((await invoke("refreshMarauderRespawn",{...request,now:due+1})).spawned,0,"Client time cannot bypass boss cooldown");
  const patch={respawnAtMs:now-1000};await store.batch().update(pub,patch).update(priv,patch).commit();
  const results=await Promise.all([invoke("refreshMarauderRespawn",request),invoke("refreshMarauderRespawn",request)]);
  assert.equal(results.reduce((n,r)=>n+r.spawned,0),1,"Concurrent requests must replace the boss exactly once");
  const live=(await priv.get()).data(),publicLive=(await pub.get()).data();
  assert.equal(live.status,"active");assert.notEqual(live.spawnId,spawnId);assert.equal(live.respawnAtMs,0);
  assert.equal(publicLive.spawnId,live.spawnId);assert.equal(live.balanceVersion,2);assert.equal(live.troops,M.balance(live.level,2).defenders);
  assert(clear.some(r=>r.x===live.x&&r.y===live.y));assert(!Object.hasOwn(publicLive,"troops"));
  assert.equal((await invoke("refreshMarauderRespawn",request)).spawned,0);
  // Repeat via the offline/minute population path with real current city rows.
  const population=createMarauderPopulation({db:store,runTransaction:work=>store.runTransaction(work),
   context:()=>({...identity,storageId:identity.resetGeneration+"--"+identity.realmShardId}),activeRegions:async()=>[regionId],
   descriptor:id=>travel.scope.getServerCatalogRegion(id),layout:fixture.geometry,islandId:()=>island.slice(8)});
  const dead={status:"defeated",respawnAtMs:now-1};await store.batch().update(pub,dead).update(priv,dead).commit();
  assert.equal((await population.maintain(now)).spawned,1,"Offline scheduler must recover the Lionwatch boss");
  const replacement=(await pub.get()).data();assert.notEqual(replacement.spawnId,live.spawnId);
  assert(replacement.x!==live.x||replacement.y!==live.y);
  // Retired records must not consume the bounded area budget or become corpses.
  for(let i=0;i<25;i++)await store.doc(`${island}/marauders/retired-${i}`).set({...old,id:`retired-${i}`,status:"retired",respawnAtMs:0});
  let clock=Date.now();reader.clock=()=>clock;
  let packet=await reader.read(p.players[0].uid,[regionId]),cursor={epoch:packet.epoch,revision:packet.revision};
  assert.equal(packet.objects.upsert.filter(o=>o.kind==="npc").length,1);
  const shown=packet.objects.upsert.find(o=>o.id===id);assert(shown.selectable);assert(!Object.hasOwn(shown,"troops"));
  assert.equal(reader.object(id,"marauders",{...old,status:"retired"},section),null);
  await pub.update({status:"retired"});clock+=1000;
  packet=await reader.read(p.players[0].uid,[regionId],cursor);assert(packet.objects.remove.includes(shown.key),"Retirement must remove an already visible marker");
  await pub.update({...replacement,status:"defeated",respawnAtMs:clock+120000});clock+=1000;
  packet=await reader.read(p.players[0].uid,[regionId]);const remains=packet.objects.upsert.find(o=>o.id===id);
  assert(!remains.selectable&&remains.asset.includes("boss-defeated"));assert.equal(remains.respawnAtMs,clock+119000);
  console.log(JSON.stringify({passed:true,sections:reader.sections.size,roadSamples:points,lionwatchClearRoadPoints:clear.length,concurrentAndOfflineRespawn:true,retiredHidden:true,deltaRemoval:true,privateDefendersHidden:true}));
 }finally{await p.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
