"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createService, cacheKey, MONTHLY_CHARACTER_LIMIT } = require("../chat-translation");
const realm = require("../release-config.json");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Emulators are required.");
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore();
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let functionsHost, identity = {releaseId:realm.releaseId,resetGeneration:realm.resetGeneration,worldId:realm.worldId,realmShardId:"legacy"};
const id = () => crypto.randomBytes(20).toString("hex");
const fail = (code,message,details) => Object.assign(new Error(message),{code,details});
async function user() {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:`translation-${id()}@example.test`,password:"Translation-test-only-123!",returnSecureToken:true})});
  const body=await response.json();assert(response.ok);
  return {uid:body.localId,token:body.idToken};
}
async function call(name,actor,data={}) {
  if(!functionsHost){const hub=await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`).then(r=>r.json());functionsHost=`${hub.functions.host}:${hub.functions.port}`;}
  const response=await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`,{method:"POST",headers:{"content-type":"application/json",...(actor?{authorization:`Bearer ${actor.token}`}:{})},
    body:JSON.stringify({data:{...data,clientReleaseId:identity.releaseId,clientResetGeneration:identity.resetGeneration,clientWorldId:identity.worldId,clientRealmShardId:identity.realmShardId}})});
  const body=await response.json();if(body.error)throw fail(body.error.status,body.error.message,body.error.details);assert(response.ok);return body.result;
}
const rejectCode = (promise,code) => assert.rejects(promise,error=>error.code===code);
async function main(){
  const actor=await user(),outsider=await user();
  const info=await call("getRealmInfo",actor);
  identity={releaseId:info.currentReleaseId,resetGeneration:info.resetGeneration,worldId:info.worldId,realmShardId:info.sharedRealmId};
  assert.equal(identity.realmShardId,"shard_0001","Test the current shared realm.");
  await call("claimStartingCity",actor,{playerName:"Translation QA"});
  await call("claimStartingCity",outsider,{playerName:"Outside QA"});
  const clanId=`translation-${id()}`;
  await db.doc(`players/${actor.uid}`).update({clanId});
  await db.doc(`clans/${clanId}`).set({...identity,status:"active",leaderUid:actor.uid});
  await db.doc(`clans/${clanId}/members/${actor.uid}`).set({...identity,uid:actor.uid,status:"active",role:"leader"});
  const messageId=id(), clanMessageId=id();
  const globalCollection=`globalChat/${identity.resetGeneration}--${identity.realmShardId}/messages`;
  const clanCollection=`clans/${clanId}/messages`;
  async function seed(collection,message,channel="global",text="Bonjour") {
    const ref=db.doc(`${collection}/${message}`);
    await ref.set({...identity,id:message,channel,channelId:channel==="clan"?clanId:"global",status:"visible",text,createdAtMs:Date.now(),senderUid:actor.uid});
    const cache=db.doc(`chatTranslationCache/${cacheKey(ref.path,text,"en")}`);
    await cache.set({state:"ready",text:"Hello",expiresAtMs:Date.now()+60000});
    return {ref,cache};
  }
  const global=await seed(globalCollection,messageId);
  const clan=await seed(clanCollection,clanMessageId,"clan");
  const globalData={channel:"global",messageIds:[messageId],targetLanguage:"en"};
  const clanData={channel:"clan",clanId,messageIds:[clanMessageId],targetLanguage:"en"};
  await rejectCode(call("translateChatMessages",null,globalData),"UNAUTHENTICATED");
  assert.equal((await call("translateChatMessages",actor,globalData)).translations[0].text,"Hello");
  assert.equal((await call("translateChatMessages",actor,clanData)).translations[0].text,"Hello");
  await rejectCode(call("translateChatMessages",outsider,clanData),"PERMISSION_DENIED");
  await rejectCode(call("translateChatMessages",actor,{...globalData,text:"forged"}),"INVALID_ARGUMENT");
  await global.ref.update({status:"removed"});
  await rejectCode(call("translateChatMessages",actor,globalData),"NOT_FOUND");
  await global.ref.update({status:"visible",createdAtMs:Date.now()-86400001});
  await rejectCode(call("translateChatMessages",actor,globalData),"NOT_FOUND");
  await clan.ref.update({realmShardId:"different-shard"});
  await rejectCode(call("translateChatMessages",actor,clanData),"NOT_FOUND");
  await clan.ref.update({realmShardId:identity.realmShardId});
  await db.doc(`clans/${clanId}/members/${actor.uid}`).update({status:"removed"});
  await rejectCode(call("translateChatMessages",actor,clanData),"PERMISSION_DENIED");
  await db.doc(`clans/${clanId}/members/${actor.uid}`).update({status:"active"});
  await clan.ref.delete();
  await rejectCode(call("translateChatMessages",actor,clanData),"NOT_FOUND");
  await global.ref.update({createdAtMs:Date.now()});await global.cache.delete();
  await rejectCode(call("translateChatMessages",actor,globalData),"UNAVAILABLE");
  assert.equal((await db.doc(`chatTranslationUsage/${new Date().toISOString().slice(0,7)}`).get()).data().reservedCharacters,7,
    "The callable must reserve before invoking the emulator-blocked provider.");
  // Server-only data is inaccessible through the real Firestore rules.
  for(const path of [clan.cache.path,`chatTranslationUsage/${new Date().toISOString().slice(0,7)}`]){
    const response=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${path}`,{headers:{authorization:`Bearer ${actor.token}`}});
    assert.equal(response.status,403,"Private translation state leaked.");
  }
  // Exercise real Firestore transactions with an injected provider, never Google.
  let clock=Date.UTC(2030,0,15),providerCalls=0;
  const collection=`translationTestMessages/${id()}/messages`;
  const members=db.doc(`translationTestAccess/${id()}`);await members.set({allowed:true});
  const authorize=async transaction=>{
    if(!(await transaction.get(members)).data().allowed)throw fail("permission-denied","Revoked");
    return {messageCollection:collection,isVisible:message=>message.status==="visible"};
  };
  const service=(provider=async texts=>{providerCalls++;return texts.map(text=>`Translated ${text}`);})=>createService({db,authorize,provider,fail,now:()=>clock});
  const request=message=>({auth:{uid:id()},data:{channel:"clan",clanId:"test",messageIds:[message],targetLanguage:"es"}});
  const make=async(text="Hello")=>{const message=id();await db.doc(`${collection}/${message}`).set({text,status:"visible"});return message;};
  const budget=db.doc("chatTranslationUsage/2030-01");
  await budget.set({reservedCharacters:MONTHLY_CHARACTER_LIMIT-5});
  const a=await make(),b=await make();
  const results=await Promise.allSettled([service()(request(a)),service()(request(b))]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await budget.get()).data().reservedCharacters,MONTHLY_CHARACTER_LIMIT);
  assert.equal(providerCalls,1,"Concurrent cap overrun made extra Google calls.");
  const winner=results[0].status==="fulfilled"?a:b;
  await service()(request(winner));assert.equal(providerCalls,1,"Cache hit charged again at cap.");
  await rejectCode(service()(request(await make())),"resource-exhausted");
  clock=Date.UTC(2030,1,1);
  await service()(request(await make("😀")));
  assert.equal((await db.doc("chatTranslationUsage/2030-02").get()).data().reservedCharacters,1,"Use Unicode code points.");
  let release,entered;
  const ready=new Promise(resolve=>{entered=resolve;});
  const pending=service(async texts=>{providerCalls++;entered();await new Promise(resolve=>{release=resolve;});return texts;});
  const c=await make();const first=pending(request(c));await ready;
  await rejectCode(pending(request(c)),"unavailable");release();await first;
  const before=(await db.doc("chatTranslationUsage/2030-02").get()).data().reservedCharacters;
  const failedMessage=await make();
  await rejectCode(service(async()=>{throw Error("Provider timeout");})(request(failedMessage)),"unavailable");
  assert.equal((await db.doc("chatTranslationUsage/2030-02").get()).data().reservedCharacters,before+5,"Uncertain requests must not refund the cap.");
  await service()(request(failedMessage));
  await rejectCode(service(async texts=>{await members.update({allowed:false});return texts;})(request(await make())),"permission-denied");
  await members.update({allowed:true});
  const edited=await make();
  await rejectCode(service(async texts=>{await db.doc(`${collection}/${edited}`).update({text:"Changed"});return texts;})(request(edited)),"not-found");
  const limited=request(winner);
  await db.doc(`serverRateLimits/translation_${limited.auth.uid}`).set({minute:Math.floor(clock/60000),count:30});
  await rejectCode(service()(limited),"resource-exhausted");
  console.log("Chat translation emulator passed: current realm, auth, clan isolation/revocation, moderation/expiry, private cache, concurrent cap and deduplication, Unicode counts, month rollover, timeout reservation, edits and rate limit.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
