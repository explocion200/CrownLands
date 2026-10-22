"use strict";
const assert=require("node:assert/strict"),{randomBytes,randomUUID,createHash}=require("node:crypto");
(async()=>{
 assert(!process.env.CROWNLANDS_BACKEND&&!process.env.FIRESTORE_EMULATOR_HOST);
 process.env.CROWNLANDS_BACKEND="postgres-rehearsal";
 process.env.CROWNLANDS_REHEARSAL_SCHEMA="migration_game_stamina_"+randomBytes(6).toString("hex");
 const {store:db,HttpsError}=require("../functions/platform"),game=require("../functions");
 const uid="stamina_"+randomUUID();let identity={};
 const callAs=(actor,name,data={})=>game[name]({auth:{uid:actor,token:{email_verified:true,firebase:{sign_in_provider:"password"}}},data:{clientReleaseId:identity.releaseId,clientWorldId:identity.worldId,clientResetGeneration:identity.resetGeneration,clientRealmShardId:identity.realmShardId,...data}});
 const call=(name,data={})=>callAs(uid,name,data);
 const read=async ref=>(await ref.get()).data();
 try{
  await db.initialize();
  await require("../functions/test/stamina-refill-cases")({db,HttpsError});
  const seasons=require("../functions/season-rewards"),prior=seasons.previousSeason(`realm-${new Date().toISOString().slice(0,7)}`);
  await seasons.arm(db,prior,seasons.seasonInfo(prior).startsAtMs+1);
  const realm=await call("getRealmInfo");identity={releaseId:realm.currentReleaseId,worldId:realm.worldId,resetGeneration:realm.resetGeneration,realmShardId:realm.sharedRealmId};
  const claim=await call("claimStartingCity",{playerName:"Stamina Tester"}),regionId=claim.regionId||claim.mainRegionId;
  const source=db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`),origin=await read(source);
  const stamina=db.doc(`players/${uid}/stamina/state`),wallet=db.doc(`players/${uid}/cosmetics/state`);
  const saved={version:1,value:70,recoveredAtMs:Date.now()-40*86400000,revision:1,paidDay:""};
  await stamina.set(saved);await wallet.set({version:1,crowns:120,revision:1});
  await db.doc(`marauderPopulation/${identity.resetGeneration}--${identity.realmShardId}`).set({enabled:true});
  const loaded=await call("getStaminaState");assert.equal(loaded.state.value,70);assert.equal(loaded.offer.price,30);assert.deepEqual(await read(stamina),saved);
  const request={requestId:randomUUID(),offer:loaded.offer};
  await call("refillStamina",request);await call("refillStamina",request);
  assert.equal((await read(stamina)).value,100);assert.equal((await read(wallet)).crowns,90);
  const enemy={...identity,id:"marauder_"+createHash("sha256").update(regionId).digest("hex").slice(0,12)+"_00",regionId,spawnId:randomUUID(),name:"Stamina Test Marauder",x:origin.x+120,y:origin.y,level:1,classification:"solo",targetType:"marauder",status:"active",slot:0,balanceVersion:1,ownerKind:"neutral",ownerUid:"",respawnAtMs:0};
  const target=db.doc(`islands/${claim.islandId}/marauderCombat/${enemy.id}`),pub=db.doc(`islands/${claim.islandId}/marauders/${enemy.id}`);
  await target.set({...enemy,troops:100});await pub.set(enemy);
  await source.update({troops:10000,troopFloat:10000,productionUpdatedAtMs:Date.now()});
  const order={sourceRegionId:regionId,targetRegionId:regionId,targetType:"marauder",targetSpawnId:enemy.spawnId,
   army:{id:"stamina_hunt_"+randomUUID(),kind:"attack",fromId:claim.cityId,toId:enemy.id,troops:200,requestedTroops:200,targetType:"marauder",targetSpawnId:enemy.spawnId,sourceRegionId:regionId,targetRegionId:regionId}};
  const sent=await call("sendArmyOrder",order);await call("sendArmyOrder",order);assert.equal((await read(stamina)).value,90);
  await target.delete();await pub.delete();await db.doc(`armies/${sent.movement.id}`).update({arrivesAtMs:Date.now()-1000});
  const settled=await call("resolveArmyOrder",{armyId:sent.movement.id});assert.equal(settled.outcome,"target_unavailable");
  assert.equal((await read(stamina)).value,90);assert(settled.reports.every(r=>r.staminaRefunded===0));
  await call("resolveArmyOrder",{armyId:sent.movement.id});assert.equal((await read(stamina)).value,90);
  assert.equal((await call("getStaminaState")).state.value,90);
  // Real rally callables: every assembled member needs 20, and failed starts debit nobody.
  const ally="stamina_"+randomUUID(),other=await callAs(ally,"claimStartingCity",{playerName:"Stamina Ally"});
  const clanId="stamina_clan_"+randomUUID(),members=[{uid,claim},{uid:ally,claim:other}];
  await db.doc(`clans/${clanId}`).set({...identity,status:"active",leaderUid:uid,name:"Stamina Test Clan",tag:"STAM",memberCount:2});
  for(const [i,member] of members.entries()){
   await db.doc(`clans/${clanId}/members/${member.uid}`).set({...identity,uid:member.uid,clanId,status:"active",role:i?"member":"leader",joinedAtMs:Date.now()-172800000});
   await db.doc(`players/${member.uid}`).set({clanId,clanRole:i?"member":"leader",clanJoinedAtMs:Date.now()-172800000},{merge:true});
   await db.doc(`players/${member.uid}/stamina/state`).set({...saved,value:100});
   await db.doc(`islands/${member.claim.islandId}/cities/${member.claim.cityId}`).set({troops:50000000,troopFloat:50000000,productionUpdatedAtMs:Date.now()},{merge:true});
  }
  const core=require("../functions/core-expansion-region-catalog.json").regions.find(row=>row.permanentCore);
  const island=identity.worldId+"--"+identity.realmShardId+"--"+core.id;
  const coreCity=(await db.collection(`islands/${island}/cities`).limit(1).get()).docs[0].data();
  const boss={...identity,id:"marauder_"+createHash("sha256").update(core.id).digest("hex").slice(0,12)+"_00",spawnId:randomUUID(),regionId:core.id,x:coreCity.x+120,y:coreCity.y,name:"Stamina Test Boss",targetType:"marauder",classification:"boss",level:80,slot:0,status:"active",ownerUid:"",ownerKind:"neutral",balanceVersion:2};
  const bossRef=db.doc(`islands/${island}/marauderCombat/${boss.id}`);
  await bossRef.set({...boss,troops:5000000});await db.doc(`islands/${island}/marauders/${boss.id}`).set(boss);
  const rallyId="stamina_rally_"+randomUUID();
  await call("createClanRally",{clanId,rallyId,sourceRegionId:regionId,targetRegionId:core.id,army:{id:rallyId,kind:"attack",fromId:claim.cityId,toId:boss.id,targetType:"marauder",targetSpawnId:boss.spawnId,sourceRegionId:regionId,targetRegionId:core.id,troops:10000000,requestedTroops:10000000}});
  const joined=await callAs(ally,"joinClanRally",{clanId,rallyId,army:{id:rallyId+"_join",kind:"rally_join",fromId:other.cityId,sourceRegionId:other.regionId||other.mainRegionId,troops:1,requestedTroops:1}});
  await db.doc("armies/"+joined.movement.id).update({arrivesAtMs:Date.now()-1000});await callAs(ally,"resolveArmyOrder",{armyId:joined.movement.id});
  const allyStamina=db.doc(`players/${ally}/stamina/state`);
  for(const insufficient of [stamina,allyStamina]){
   await stamina.set({...saved,value:20});await allyStamina.set({...saved,value:20});await insufficient.update({value:19});
   const ready=await call("getBossRallyReadiness",{clanId,rallyId});assert.equal(ready.participants.filter(p=>p.ready).length,1);
   await assert.rejects(call("launchClanRally",{clanId,rallyId}),/20 stamina/);
   assert.equal((await read(insufficient)).value,19);assert.equal((await read(insufficient===stamina?allyStamina:stamina)).value,20);
  }
  await stamina.set({...saved,value:20});await allyStamina.set({...saved,value:20});
  assert((await call("getBossRallyReadiness",{clanId,rallyId})).participants.every(p=>p.ready));
  const launch=await call("launchClanRally",{clanId,rallyId});await call("launchClanRally",{clanId,rallyId});
  assert.equal(launch.movement.staminaCost,20);assert.equal((await read(stamina)).value,0);assert.equal((await read(allyStamina)).value,0);
  await bossRef.delete();await db.doc("armies/"+launch.movement.id).update({arrivesAtMs:Date.now()-1000});
  const invalid=await call("resolveArmyOrder",{armyId:launch.movement.id});assert.equal(invalid.outcome,"target_unavailable");assert(invalid.reports.every(r=>r.staminaRefunded===0));
  await call("resolveArmyOrder",{armyId:launch.movement.id});assert.equal((await read(stamina)).value,0);assert.equal((await read(allyStamina)).value,0);
  console.log("PostgreSQL boss stamina passed: both members at 19/20, atomic rejection, 20-point launch, duplicate launch/settlement and no invalid-target refund.");
  console.log("PostgreSQL stamina passed: shared transaction cases, real callables, old timestamps, flat price, duplicate refill/dispatch/settlement, invalid hunt with no stamina refund.");
 }finally{await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`);await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
