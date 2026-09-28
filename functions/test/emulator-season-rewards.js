"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { signUpVerifiedPlayer } = require("./auth-fixtures");
const R = require("../season-rewards");
const PVP = require("../pvp-leaderboard");
const GEAR = require("../common-gear");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error("Local emulators required.");
initializeApp({projectId:"crown-land-b15e0"});
const db = getFirestore();
const info = R.seasonInfo("realm-2026-09"), next = R.seasonInfo("realm-2026-10");
const scope = {resetGeneration:info.seasonId,worldId:info.worldId,realmShardId:info.realmShardId};
async function main() {
  const signup = await signUpVerifiedPlayer("http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+"/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:"season-"+randomUUID()+"@example.test",password:"Season-Emulator-Only-123!",returnSecureToken:true})
  });
  const user = await signup.json(); assert(signup.ok);
  const uid = user.localId;
  await db.doc("realmConfig/current").set(scope);
  await db.doc("players/"+uid).set({...scope,mainCityId:"city",clanId:"house",gear:{commonGearBoxes:2,uncommonGearBoxes:3},playerName:"Winner"});
  await R.arm(db,info.seasonId,info.startsAtMs+1);
  await Promise.all(["z-last","a-first",uid].map((id,i)=>db.runTransaction(tx=>R.guardTransaction(db,tx,buffer=>{
    buffer.set(db.doc(`leaderboards/${info.boardId}/entries/${id}`),{...scope,uid:id,displayName:id,kingPower:i===2?500:100,clanId:"house"});
  },scope,()=>info.startsAtMs+100))));
  await db.doc("clans/house").set({...scope,status:"active",memberCount:2});
  for(const id of [uid,"inactive-member"]) await db.doc(`clans/house/members/${id}`).set({...scope,status:"active",joinedAtMs:info.endsAtMs-1});
  await db.doc(`clanLeaderboards/${info.boardId}/entries/house`).set({...scope,clanId:"house",name:"House",totalKingPower:600,memberCount:2});
  const eventRef = db.doc(`pvpKillEvents/${info.boardId}/events/battle`);
  await db.runTransaction(tx=>R.guardTransaction(db,tx,buffer=>{
    buffer.create(eventRef,{...scope,version:1,battleId:"battle",occurredAtMs:info.endsAtMs-1000,credits:[{uid,kills:77}]});
  },scope,()=>info.endsAtMs-1000));
  const projection = await R.status(db,uid,info.seasonId,info.seasonId,info.startsAtMs+100);
  assert.equal(projection.projected.players.rank,1);assert.equal(projection.clanEligible,true);
  let release;
  const waiting = new Promise(resolve=>{release=resolve;});
  let reached;
  const entered = new Promise(resolve=>{reached=resolve;});
  const lateWrite = db.runTransaction(tx=>R.guardTransaction(db,tx,async buffer=>{
    buffer.update(db.doc(`leaderboards/${info.boardId}/entries/${uid}`),{kingPower:999999});
    reached(); await waiting;
  },scope,()=>info.endsAtMs-5));
  await entered;
  await db.doc(`clanLeaderboards/${info.boardId}/entries/house`).update({memberCount:3});
  await assert.rejects(R.capture(db,info.seasonId,info.endsAtMs),/roster does not match/);
  assert.equal((await R.headerRef(db,info.seasonId).get()).data().status,"closing");
  assert.equal((await db.doc("realmConfig/current").get()).data().resetGeneration,info.seasonId);
  await db.doc(`clanLeaderboards/${info.boardId}/entries/house`).update({memberCount:2});
  await Promise.all([R.capture(db,info.seasonId,info.endsAtMs),R.capture(db,info.seasonId,info.endsAtMs)]);
  release(); await assert.rejects(lateWrite,/season has closed/i);
  assert.equal((await db.doc(`leaderboards/${info.boardId}/entries/${uid}`).get()).data().kingPower,500);
  const frozen = await db.doc(`seasonResults/${info.seasonId}/boards/players`).get();
  assert.deepEqual(frozen.data().entries.map(row=>row.id),[uid,"a-first","z-last"]);
  await assert.rejects(db.runTransaction(tx=>R.guardTransaction(db,tx,buffer=>buffer.delete(db.doc("clans/house/members/"+uid)),scope,()=>info.endsAtMs)),/closed/);
  await assert.rejects(R.claim(db,uid,info.seasonId,randomUUID()),/finalized/);
  await R.prepareTransition(db,next.seasonId,info.endsAtMs+1);
  await db.doc("realmConfig/current").set({resetGeneration:next.seasonId,worldId:next.worldId,realmShardId:next.realmShardId});
  await db.doc("players/"+uid).update({resetGeneration:next.seasonId,worldId:next.worldId});
  // A new-season clan migration/removal cannot change the old captured roster.
  await db.runTransaction(tx=>R.guardTransaction(db,tx,buffer=>buffer.delete(db.doc("clans/house/members/"+uid)),next,()=>info.endsAtMs+10));
  await Promise.all([PVP.processEvent(db,eventRef),PVP.processEvent(db,eventRef)]);
  // Resume an interrupted publisher; provisional awards cannot be claimed.
  await R.headerRef(db,info.seasonId).update({status:"finalizing",leaseUntilMs:0});
  await R.awardRef(db,uid,info.seasonId).set({seasonId:info.seasonId,commonGearBoxes:777,claimed:false});
  await assert.rejects(R.claim(db,uid,info.seasonId,randomUUID()),/finalized/);
  await Promise.all([R.finalize(db,info.seasonId),R.finalize(db,info.seasonId)]);
  const ready = (await R.headerRef(db,info.seasonId).get()).data();
  assert.equal(ready.status,"ready");assert.equal(ready.recipientCount,4);
  const award = (await R.awardRef(db,uid,info.seasonId).get()).data();
  assert.equal(award.commonGearBoxes,19);assert.equal(award.uncommonGearBoxes,5);
  assert.equal((await R.awardRef(db,"inactive-member",info.seasonId).get()).data().commonGearBoxes,3);
  const before = (await R.headerRef(db,info.seasonId).get()).updateTime;
  await R.capture(db,info.seasonId,info.endsAtMs+100);await R.finalize(db,info.seasonId);
  assert((await R.headerRef(db,info.seasonId).get()).updateTime.isEqual(before),"Replay regressed finalized results");
  const fullInventory = Object.fromEntries(Array.from({length:GEAR.INVENTORY_LIMIT},(_,i)=>["item-"+i,{instanceId:"item-"+i,gearKey:GEAR.COMMON_DEFINITIONS[0].gearKey,level:1}]));
  await db.doc("players/"+uid).update({"gear.instances":fullInventory});
  const receipts = await Promise.all(Array.from({length:12},()=>R.claim(db,uid,info.seasonId,randomUUID())));
  assert.equal(receipts.filter(row=>!row.replayed).length,1);
  const profile = (await db.doc("players/"+uid).get()).data();
  assert.equal(profile.gear.commonGearBoxes,21);assert.equal(profile.gear.uncommonGearBoxes,8);
  assert.equal(Object.keys(profile.gear.instances).length,GEAR.INVENTORY_LIMIT,"Claim truncated a full inventory");
  assert(receipts.every(row=>row.receipt.requestId===receipts[0].receipt.requestId));
  const nextYear = R.seasonInfo("realm-2027-09");
  await db.doc("realmConfig/current").set({resetGeneration:nextYear.seasonId,worldId:nextYear.worldId});
  await db.doc("players/"+uid).update({resetGeneration:nextYear.seasonId,worldId:nextYear.worldId});
  const replay = await R.claim(db,uid,info.seasonId,randomUUID());assert(replay.replayed);
  await db.doc("players/inactive-member").set({resetGeneration:nextYear.seasonId,worldId:nextYear.worldId,mainCityId:"returned",gear:{commonGearBoxes:0,uncommonGearBoxes:0}});
  const lateClaim=await R.claim(db,"inactive-member",info.seasonId,randomUUID(),nextYear.startsAtMs);
  assert.equal(lateClaim.receipt.commonGearBoxes,3);assert.equal(lateClaim.receipt.uncommonGearBoxes,1);
  assert.equal((await R.honors(db,"player",uid)).honors.length,3);
  assert.equal((await R.history(db,info.seasonId,"glory")).entries[0].pvpKills,77);
  // A missed pre-deadline registration must fail rather than invent September winners.
  await assert.rejects(R.capture(db,"realm-2026-11",Date.UTC(2026,11,1)),/not armed/);
  await assert.rejects(R.arm(db,"realm-2026-11",Date.UTC(2026,11,1)),/not armed/);
  const base="http://"+process.env.FIRESTORE_EMULATOR_HOST+"/v1/projects/crown-land-b15e0/databases/(default)/documents/";
  const headers={authorization:"Bearer "+user.idToken,"content-type":"application/json"};
  for(const location of [`seasonResults/${info.seasonId}`,`seasonResults/${info.seasonId}/rosters/house`,`players/${uid}/seasonRewards/${info.seasonId}`,`playerSeasonHonors/${uid}/seasons/${info.seasonId}`]) {
    assert.equal((await fetch(base+location,{headers})).status,403,"Private results must use authenticated callables");
    assert.equal((await fetch(base+location,{method:"PATCH",headers,body:JSON.stringify({fields:{claimed:{booleanValue:true}}})})).status,403);
  }
  console.log("Season reward emulator passed closure races, stable ties, roster capture, late Glory, verified publication, replay-safe claims, permanent honors, missing-capture rejection and private records.");
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
