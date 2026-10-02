"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const {initializeApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {HttpsError}=require("firebase-functions/v2/https");
const {signUpVerifiedPlayer}=require("./auth-fixtures");
const {createCosmeticsService}=require("../cosmetics-service");
const C=require("../cosmetics"),flags=require("../playerFlagConfig"),rewards=require("../season-rewards");
const realm={...require("../release-config.json")};
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error("Emulator only");
const projectId=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||"crown-land-b15e0";
initializeApp({projectId});const db=getFirestore();
async function user(){const nonce=crypto.randomBytes(7).toString("hex");const response=await signUpVerifiedPlayer(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:`skins-${nonce}@example.test`,password:`Skins-${nonce}!`,returnSecureToken:true})});const body=await response.json();assert(response.ok,JSON.stringify(body));return{uid:body.localId,token:body.idToken};}
let functionHost;
async function call(name,token,data={}){
 if(!functionHost){const emulators=await(await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`)).json();functionHost=`${emulators.functions.host}:${emulators.functions.port}`;}
 const response=await fetch(`http://${functionHost}/${projectId}/us-central1/${name}`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({data:{...data,clientReleaseId:realm.releaseId,clientResetGeneration:realm.resetGeneration,clientWorldId:realm.worldId,clientRealmShardId:realm.realmShardId||"legacy"}})});
 const body=await response.json();if(!response.ok||body.error)throw Error(JSON.stringify(body.error||body));return body.result;
}
async function rest(user,path,method="GET",body){return fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${path}`,{method,headers:{authorization:`Bearer ${user.token}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});}
async function main(){
 const previous=rewards.previousSeason(`realm-${new Date().toISOString().slice(0,7)}`);if(rewards.supported(previous))await rewards.arm(db,previous,rewards.seasonInfo(previous).startsAtMs+1);
 const owner=await user(),stranger=await user();const info=await call("getRealmInfo",owner.token);
 Object.assign(realm,{releaseId:info.currentReleaseId,resetGeneration:info.resetGeneration,worldId:info.worldId,realmShardId:info.sharedRealmId});
 const claim=await call("claimStartingCity",owner.token,{playerName:"Skin tester"});
 const profileRef=db.doc(`players/${owner.uid}`),walletRef=db.doc(`players/${owner.uid}/cosmetics/state`);
 assert.equal((await call("getCosmeticsState",owner.token)).state.crowns,0);
 await assert.rejects(call("purchaseCosmetic",owner.token,{offerId:"unknown",expectedPrice:0,catalogVersion:1,requestId:"test_callable_offer"}),/catalog/);
 const regionId=claim.regionId||claim.mainRegionId,today=new Date().toISOString().slice(0,10);
 async function pickup(id,type="crowns"){
   await profileRef.set({daily:{date:today,harvestedGoldBonuses:0,harvestedTroopBonuses:0,harvestedBonuses:0},harvestBonuses:[{id,type,regionId,x:1000,y:1000,createdAtMs:Date.now()}]},{merge:true});
   return {bonusId:id,type,regionId,daily:{date:today,harvestedCrownBonuses:0}};
 }
 const first=await pickup("skin_pickup_first");
 const concurrent=await Promise.all([call("collectHarvestBonus",owner.token,first),call("collectHarvestBonus",owner.token,first)]);
 assert.equal(concurrent.reduce((sum,result)=>sum+result.reward,0),1);assert.equal((await walletRef.get()).data().crowns,1);
 assert.equal((await call("collectHarvestBonus",owner.token,first)).replayed,true);
 for(let i=1;i<20;i++){await call("collectHarvestBonus",owner.token,await pickup(`skin_pickup_${i}`));}
 assert.equal((await walletRef.get()).data().crowns,20);
 // Resetting seasonal counters (including via a fresh profile) cannot restore the global allowance.
 const over=await pickup("skin_pickup_over_cap");await assert.rejects(call("collectHarvestBonus",owner.token,over),/limit/);
 assert.equal((await walletRef.get()).data().crownPickups,20);
 await profileRef.set({harvestBonuses:[],harvestNextBonusType:"crowns",harvestNextSpawnAtMs:Date.now()-1,daily:{date:today,harvestedGoldBonuses:0,harvestedTroopBonuses:0}},{merge:true});
 const spawn=await call("reserveHarvestBonusSpawn",owner.token,{type:"crowns",bonus:{id:"skin_skip_capped",regionId,x:1000,y:1000}});
 assert.equal(spawn.currentUser.harvestBonuses[0].type,"gold","Exhausted Crowns must skip to Gold");
 assert.equal(spawn.currentUser.harvestNextBonusType,"troops");
 const failedBefore=JSON.stringify((await profileRef.get()).data().harvestBonuses);
 await assert.rejects(call("collectHarvestBonus",owner.token,{bonusId:"missing",type:"gold"}),/expired/);
 assert.equal(JSON.stringify((await profileRef.get()).data().harvestBonuses),failedBefore);
 // Exercise the production service with an injected October clock, independent of CI's calendar.
 const service=createCosmeticsService({db,HttpsError,runTransaction:fn=>db.runTransaction(fn),assertCurrentPlayerProfile:profile=>assert.equal(profile.resetGeneration,realm.resetGeneration),normalizeFlag:flags.normalizeFlag});
 const now=Date.UTC(2026,9,15);
 await walletRef.set(C.normalize({crowns:1500}));
 const request={offerId:"halloween_city",expectedPrice:600,catalogVersion:1,requestId:"test_city_purchase"};
 await Promise.all([service.purchase(owner.uid,request,now),service.purchase(owner.uid,request,now)]);
 assert.equal((await walletRef.get()).data().crowns,900);
 await assert.rejects(service.purchase(owner.uid,{...request,offerId:"halloween_troops"},now),/different purchase/);
 await service.purchase(owner.uid,{offerId:C.BUNDLE.id,expectedPrice:720,catalogVersion:1,requestId:"test_remaining_bundle"},now);
 let wallet=(await walletRef.get()).data();assert.equal(wallet.crowns,180);assert.equal(Object.keys(wallet.owned).length,7);
 assert.equal(wallet.equipped.city,"");
 await assert.rejects(service.purchase(owner.uid,{offerId:"not_real",expectedPrice:0,catalogVersion:1,requestId:"test_fake_offer"},now),/catalog/);
 const equipped=await call("equipCosmetic",owner.token,{category:"city",itemId:"halloween_city",expectedRevision:wallet.revision,requestId:"test_equip_city"});
 assert.equal(equipped.state.equipped.city,"halloween_city");wallet=equipped.state;
 const visibleAppearance=await (await rest(stranger,`playerCosmetics/${owner.uid}`)).json();
 assert.equal(visibleAppearance.fields.equipped.mapValue.fields.city.stringValue,"halloween_city","Another player must see the applied city skin");
 const restored=await call("equipCosmetic",owner.token,{category:"city",itemId:"",expectedRevision:wallet.revision,requestId:"test_restore_city"});
 assert.equal((await service.publicRef(owner.uid).get()).data().equipped.city,"","Default must also publish to other players");
 const reapplied=await call("equipCosmetic",owner.token,{category:"city",itemId:"halloween_city",expectedRevision:restored.state.revision,requestId:"test_reapply_city"});
 wallet=reapplied.state;
 const profile=(await profileRef.get()).data();
 const flag=await call("equipCosmetic",owner.token,{category:"flag",itemId:"halloween_pumpkin",expectedRevision:wallet.revision,expectedIdentityRevision:profile.identityRevision||0,requestId:"test_equip_flag"});
 assert.equal(flag.flag.symbol,"halloween-pumpkin");assert.equal(flag.flag.primary,profile.flag.primary);assert.equal(flag.flag.pattern,profile.flag.pattern);
 await assert.rejects(call("equipCosmetic",owner.token,{category:"troops",itemId:"halloween_troops",expectedRevision:0,requestId:"test_stale_equip"}),/collection changed/);
 const saved=(await walletRef.get()).data();await profileRef.set({...profile,flag:flag.flag,identityRevision:flag.identityRevision,daily:{date:today}});
 assert.deepEqual((await walletRef.get()).data(),saved,"Seasonal parent replacement must preserve permanent cosmetics");
 assert.equal((await rest(owner,`players/${owner.uid}/cosmetics/state`)).status,200);
 assert.equal((await rest(stranger,`players/${owner.uid}/cosmetics/state`)).status,403);
 assert.equal((await rest(owner,`players/${owner.uid}/cosmetics/state`,"PATCH",{fields:{crowns:{integerValue:"999999"}}})).status,403);
 assert.equal((await rest(stranger,`playerCosmetics/${owner.uid}`)).status,200);
 assert.equal((await rest(owner,`playerCosmetics/${owner.uid}`,"PATCH",{fields:{revision:{integerValue:"999"}}})).status,403);
 function fields(value){return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,typeof v==="string"?{stringValue:v}:typeof v==="number"?{integerValue:String(v)}:{mapValue:{fields:fields(v)}}]));}
 await call("claimStartingCity",stranger.token,{playerName:"Free ruler"});
 await assert.rejects(call("equipCosmetic",stranger.token,{category:"city",itemId:"halloween_city",expectedRevision:0,requestId:"test_unowned_city"}),/do not own/);
 const strangerProfile=(await db.doc(`players/${stranger.uid}`).get()).data();
 const mask="?updateMask.fieldPaths=flag&updateMask.fieldPaths=identityRevision";
 const freePatch={flag:flags.toStoredFlag({...strangerProfile.flag,symbol:"crown"},stranger.uid),identityRevision:(strangerProfile.identityRevision||0)+1};
 assert.equal((await rest(stranger,`players/${stranger.uid}${mask}`,"PATCH",{fields:fields(freePatch)})).status,200,"Free flag editing must remain allowed");
 const paidPatch={flag:flags.toStoredFlag({...strangerProfile.flag,symbol:"halloween-bat"},stranger.uid),identityRevision:freePatch.identityRevision+1};
 assert.equal((await rest(stranger,`players/${stranger.uid}${mask}`,"PATCH",{fields:fields(paidPatch)})).status,403,"Unowned premium flag must be rejected by the existing identity-save path");
 const strangerCities=await db.collectionGroup("cities").where("ownerUid","==",stranger.uid).get();
 assert(strangerCities.size>0);
 const cityPath=strangerCities.docs[0].ref.path+"?updateMask.fieldPaths=ownerFlag";
 assert.equal((await rest(stranger,cityPath,"PATCH",{fields:fields({ownerFlag:freePatch.flag})})).status,200,"Free city flag projection must remain allowed");
 assert.equal((await rest(stranger,cityPath,"PATCH",{fields:fields({ownerFlag:paidPatch.flag})})).status,403,"City identity projection must not bypass premium ownership");
 const ownerProfile=(await profileRef.get()).data();
 const ownedPatch={flag:flags.toStoredFlag({...ownerProfile.flag,symbol:"halloween-bat"},owner.uid),identityRevision:ownerProfile.identityRevision+1};
 assert.equal((await rest(owner,`players/${owner.uid}${mask}`,"PATCH",{fields:fields(ownedPatch)})).status,200,"Owned premium flag must remain selectable in the flag editor");
 assert.deepEqual(Object.keys((await service.publicRef(owner.uid).get()).data()).sort(),["equipped","revision"]);
 console.log("Cosmetics emulator passed: atomic Crown claims, duplicate receipts, daily cap across resets, rotation skipping, purchase replay, bundles, equipment, flag preservation and private/write-protected account data.");
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
