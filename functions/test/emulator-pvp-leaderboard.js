"use strict";
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {initializeApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {signUpVerifiedPlayer}=require("./auth-fixtures");
const pvp=require("../pvp-leaderboard");
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error("Local emulators required.");
const projectId=process.env.GCLOUD_PROJECT||"crown-land-b15e0";
initializeApp({projectId});const db=getFirestore();
const scope={resetGeneration:"realm-2026-09",worldId:"main-realm-2026-09",realmShardId:"shard_0001"};
const boardId=scope.resetGeneration+"--"+scope.realmShardId;
const documentUrl=relative=>"http://"+process.env.FIRESTORE_EMULATOR_HOST+"/v1/projects/"+projectId+"/databases/(default)/documents/"+relative;
async function main(){
 const signup=await signUpVerifiedPlayer("http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+"/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:"glory-"+randomUUID()+"@example.test",password:"Emulator-Glory-Only-123!",returnSecureToken:true})
 });
 const actor=await signup.json();assert(signup.ok);
 await db.doc("realmConfig/current").set(scope);
 await db.doc("players/"+actor.localId).set({...scope,playerName:"Glory Tester",gold:123456,totalTroops:900,kingPower:1800});
 const headers={authorization:"Bearer "+actor.idToken,"content-type":"application/json"};
 const nonce=randomUUID(), a=actor.localId,d="defender-"+nonce;
 const oldProfile=(await db.doc("players/"+a).get()).data();
 const record=(battleId,kills,occurredAtMs,identity=scope)=>({...identity,version:pvp.VERSION,battleId,occurredAtMs,credits:[{uid:a,kills},{uid:d,kills:3}]});
 // Missing metadata is an empty season, not a permission error.
 assert.equal((await fetch(documentUrl("pvpLeaderboards/"+boardId),{headers})).status,404);
 const first=db.doc("pvpKillEvents/"+boardId+"/events/first-"+nonce);
 await first.create(record(first.id,7,1000));
 // Prove the deployed event trigger performs the initial credit without a player request.
 for(let i=0;i<100&&!(await first.get()).data().processedAtMs;i++)await new Promise(resolve=>setTimeout(resolve,200));
 assert((await first.get()).data().processedAtMs,"PvP trigger did not settle the event.");
 const events=Array.from({length:5},(_,i)=>db.doc("pvpKillEvents/"+boardId+"/events/"+nonce+"-"+i));
 await Promise.all(events.map((ref,i)=>ref.create(record(ref.id,11,2000+i))));
 // Competing consumers and repeated deliveries must conserve every increment.
 await Promise.all(events.flatMap(ref=>[pvp.processEvent(db,ref),pvp.processEvent(db,ref)]));
 await Promise.all([pvp.processEvent(db,first),pvp.processEvent(db,first)]);
 const scoreRef=db.doc("pvpLeaderboards/"+boardId+"/entries/"+a);
 assert.equal((await scoreRef.get()).data().pvpKills,62);
 assert.equal((await scoreRef.get()).data().reachedAtMs,2004);
 assert.equal((await db.doc("pvpLeaderboards/"+boardId).get()).data().trackingStartedAtMs,1000);
 assert.deepEqual((await db.doc("players/"+a).get()).data(),oldProfile,"Scoring touched troops, Gold, King Power or profile state.");
 // Old delayed work is applied only to the old season, even after the pointer advances.
 const next={...scope,resetGeneration:"realm-2026-10",worldId:"main-realm-2026-10"};
 await db.doc("realmConfig/current").set(next);
 await db.doc("players/"+a).update(next);
 const delayed=db.doc("pvpKillEvents/"+boardId+"/events/delayed-"+nonce);
 await delayed.create(record(delayed.id,5,1500));await pvp.processEvent(db,delayed);
 assert.equal((await scoreRef.get()).data().pvpKills,67);
 assert.equal((await scoreRef.get()).data().reachedAtMs,2004,"Out-of-order events changed the deterministic tie-break.");
 const nextBoard=next.resetGeneration+"--"+next.realmShardId;
 const nextEvent=db.doc("pvpKillEvents/"+nextBoard+"/events/"+nonce);
 await nextEvent.create(record(nextEvent.id,2,3000,next));await pvp.processEvent(db,nextEvent);
 assert.equal((await db.doc("pvpLeaderboards/"+nextBoard+"/entries/"+a).get()).data().pvpKills,2);
 assert.equal((await fetch(documentUrl("pvpLeaderboards/"+boardId+"/entries/"+a),{headers})).status,403);
 assert.equal((await fetch(documentUrl("pvpLeaderboards/"+nextBoard+"/entries/"+a),{headers})).status,200);
 assert.equal((await fetch(documentUrl("pvpLeaderboards/"+nextBoard+"/entries/"+a))).status,403);
 assert.equal((await fetch(documentUrl(nextEvent.path),{headers})).status,403,"Private casualty credits leaked.");
 for(const target of ["pvpLeaderboards/"+nextBoard,"pvpLeaderboards/"+nextBoard+"/entries/"+a,nextEvent.path]){
  const response=await fetch(documentUrl(target),{method:"PATCH",headers,body:JSON.stringify({fields:{pvpKills:{integerValue:"999999999"}}})});
  assert.equal(response.status,403,"Client modified protected PvP state: "+target);
 }
 // Query boundaries mirror the client and reject missing season constraints.
 const filter=(field,value)=>({fieldFilter:{field:{fieldPath:field},op:"EQUAL",value:{stringValue:value}}});
 const query={from:[{collectionId:"entries"}],where:{compositeFilter:{op:"AND",filters:Object.entries(next).map(([k,v])=>filter(k,v))}},
  orderBy:[{field:{fieldPath:"pvpKills"},direction:"DESCENDING"},{field:{fieldPath:"reachedAtMs"},direction:"ASCENDING"}],limit:100};
 const endpoint=documentUrl("pvpLeaderboards/"+nextBoard)+":runQuery";
 assert.equal((await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({structuredQuery:query})})).status,200);
 const unscoped={...query};delete unscoped.where;
 assert.equal((await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({structuredQuery:unscoped})})).status,403);
 console.log("PvP emulator passed: live trigger, duplicate/concurrent receipts, totals, unchanged economy, season rollover/delayed events, and scoped read/write rules.");
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
