"use strict";
const assert=require("node:assert/strict"),{randomBytes,randomUUID,createHash}=require("node:crypto");
(async()=>{
 assert(!process.env.CROWNLANDS_BACKEND&&!process.env.FIRESTORE_EMULATOR_HOST);
 process.env.CROWNLANDS_BACKEND="postgres-rehearsal";
 process.env.CROWNLANDS_REHEARSAL_SCHEMA="migration_game_stamina_"+randomBytes(6).toString("hex");
 const {store:db,HttpsError}=require("../functions/platform"),game=require("../functions");
 const uid="stamina_"+randomUUID();let identity={};
 const call=(name,data={})=>game[name]({auth:{uid,token:{email_verified:true,firebase:{sign_in_provider:"password"}}},data:{clientReleaseId:identity.releaseId,clientWorldId:identity.worldId,clientResetGeneration:identity.resetGeneration,clientRealmShardId:identity.realmShardId,...data}});
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
  console.log("PostgreSQL stamina passed: shared transaction cases, real callables, old timestamps, flat price, duplicate refill/dispatch/settlement, invalid hunt with no stamina refund.");
 }finally{await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`);await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
