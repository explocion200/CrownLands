"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { signUpVerifiedPlayer } = require("./auth-fixtures");
const config = require("../economy-config.json");
const release = require("../release-config.json");
const layout = require("../core-expansion-world-layout.json");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("This test requires the Firestore emulator.");
const project = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId: project });
const db = getFirestore();
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
let identity = { ...release, realmShardId: "legacy" }, functionsHost, sequence = 0;
async function user() {
  const response = await signUpVerifiedPlayer(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({email:`camp-power-${randomUUID()}@example.test`,password:"Camp-Emulator-Only-123!",returnSecureToken:true}),
  });
  const body=await response.json(); assert(response.ok,"Emulator signup failed");
  return {uid:body.localId,token:body.idToken};
}
async function call(name, actor, data={}) {
  if(!functionsHost){
    const hub=await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB||"127.0.0.1:4400"}/emulators`).then(r=>r.json());
    functionsHost=`${hub.functions.host}:${hub.functions.port}`;
  }
  const response=await fetch(`http://${functionsHost}/${project}/us-central1/${name}`,{
    method:"POST",headers:{authorization:`Bearer ${actor.token}`,"content-type":"application/json"},
    body:JSON.stringify({data:{...data,clientReleaseId:identity.releaseId,clientResetGeneration:identity.resetGeneration,
      clientWorldId:identity.worldId,clientRealmShardId:identity.realmShardId}}),
  });
  const body=await response.json();
  if(!response.ok||body.error)throw Error(`${name}: ${JSON.stringify(body.error||body)}`);
  return body.result;
}
const island=region=>`${identity.worldId}--${identity.realmShardId}--${region}`;
const campRef=camp=>db.doc(`islands/${island(camp.regionId)}/camps/${camp.id}`);
async function hold(camp, actor, claim, {due=true,troops=100}={}) {
  const now=Date.now(), heldSinceMs=now-3_600_000-(++sequence)*1000;
  await campRef(camp).set({...camp,worldId:identity.worldId,resetGeneration:identity.resetGeneration,realmShardId:identity.realmShardId,
    mapId:camp.regionId,holderUid:actor.uid,holderName:"Camp Ruler",ownerUid:actor.uid,ownerKind:"player",
    heldSinceMs,lastCapturedAtMs:heldSinceMs,payoutAtMs:due?heldSinceMs+60000:now+3_600_000,
    payoutPending:true,currentGarrison:troops,troops,troopFloat:troops,alliedReinforcementTroops:0,activeArmyIds:[],state:"held",
    returnSourceCityId:claim.cityId,returnSourceRegionId:claim.mainRegionId,returnSourceCityName:"Home"});
}
async function main() {
  const seasons=require("../season-rewards");
  const previous=seasons.previousSeason(`realm-${new Date().toISOString().slice(0,7)}`);
  if(seasons.supported(previous))await seasons.arm(db,previous,seasons.seasonInfo(previous).startsAtMs+1);
  const actor=await user(), info=await call("getRealmInfo",actor);
  assert.equal(info.worldTopology,"core-expansion-v1");
  identity={releaseId:info.currentReleaseId,resetGeneration:info.resetGeneration,worldId:info.worldId,realmShardId:info.sharedRealmId};
  const claim=await call("claimStartingCity",actor,{playerName:"Camp Power Ruler"});
  const city=db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`), profile=db.doc(`players/${actor.uid}`);
  const baseline=(await profile.get()).data();
  const all=layout.maps.flatMap(map=>(map.camps||[]).map(c=>({...c,regionId:map.id})));
  const scope={worldId:identity.worldId,resetGeneration:identity.resetGeneration,realmShardId:identity.realmShardId};
  const progress=type=>db.doc(`players/${actor.uid}/objectiveStats/${type==="gold"?"goldCamp":"warbandCamp"}`);
  const seed=async(type,troops,count=0)=>{
    await city.set({level:100,troops,troopFloat:troops,productionUpdatedAtMs:Date.now()}, {merge:true});
    // A deliberately false cached power must never choose the payout tier.
    await profile.set({kingPower:1,globalStats:{kingPower:1},economyUpdatedAtMs:Date.now()}, {merge:true});
    await progress(type).set({...scope,date:new Date().toISOString().slice(0,10),count});
  };
  let weakFixturePower;
  for(const type of ["gold","troops"]){
    const camps=all.filter(c=>c.campType===type);assert(camps.length>=2);
    for(const [troops,tier,multiplier] of [[5000,"weak",3],[20000000,"middle",1],[150000000,"strong",0.5]]){
      for(let index=0;index<4;index++){
        const camp=camps[index%2];
        await seed(type,troops,index);await hold(camp,actor,claim);
        const result=await call("resolveRewardCampPayout",actor,{campId:camp.id,regionId:camp.regionId});
        assert.equal(result.status,"paid");assert.equal(result.powerReward.tier,tier);
        if(type==="gold"&&tier==="weak"&&index===0)weakFixturePower=result.powerReward.kingPower;
        assert.equal(result.powerReward.multiplier,multiplier);
        const schedule=config.camps[type].rewardSchedule[index];
        assert.equal(result.powerReward.effectiveHours,[0.5,1,1.5,2][index]*multiplier);
        const raw=result.globalStats[type==="gold"?"baseGoldPerHour":"baseTroopPerHour"];
        assert(raw>0);
        assert.equal(result.reward,Math.max(schedule.minimumReward,Math.floor(raw*schedule.productionHours*multiplier)));
        assert.equal(result.dailyClaim,index+1);
        assert.equal((await progress(type).get()).data().powerReward.tier,tier);
        const again=await call("resolveRewardCampPayout",actor,{campId:camp.id,regionId:camp.regionId});
        assert(["not-pending","duplicate"].includes(again.status));
        assert.equal((await progress(type).get()).data().count,index+1);
      }
    }
    await seed(type,5000,4);await hold(camps[1],actor,claim);
    const capped=await call("resolveRewardCampPayout",actor,{campId:camps[1].id,regionId:camps[1].regionId});
    assert.equal(capped.reward,0);assert.equal(capped.powerReward.effectiveHours,0);
    // Missing kingdom data must preserve the due hold and its daily allowance.
    await seed(type,5000);await hold(camps[0],actor,claim);
    await profile.update({worldId:"unavailable-world"});
    await assert.rejects(call("resolveRewardCampPayout",actor,{campId:camps[0].id,regionId:camps[0].regionId}));
    assert.equal((await campRef(camps[0]).get()).data().payoutPending,true);
    assert.equal((await progress(type).get()).data().count,0);
    await profile.update({worldId:baseline.worldId});
    assert.equal((await call("resolveRewardCampPayout",actor,{campId:camps[0].id,regionId:camps[0].regionId})).powerReward.tier,"weak");
  }
  const gold=all.find(c=>c.campType==="gold");
  const warband=all.find(c=>c.campType==="troops");
  for (const expired of [false, true]) {
    const expiresAtMs = Date.now() + (expired ? -1000 : 86400000);
    await profile.update({ troopProduction25Exclusion: { startsAtMs: expiresAtMs - 20 * 86400000, expiresAtMs } });
    await seed("troops", 20000000, 3); await hold(warband, actor, claim);
    const result = await call("resolveRewardCampPayout", actor, { campId: warband.id, regionId: warband.regionId });
    const rate = expired ? 19034 : 15227;
    assert.equal(result.globalStats.baseTroopPerHour, rate);
    assert.equal(result.powerReward.tier, "middle");
    assert.equal(result.reward, rate * 2, "Camp troop payout did not follow account exclusion expiry");
  }
  // Leave 50k power of headroom, then cross the boundary with the troop reward.
  // City soldiers contribute 2 army power plus 0.075 infrastructure power each.
  const nearBoundaryTroops=5000+Math.floor((7813452-50000-weakFixturePower)/2.075);
  await seed("troops",nearBoundaryTroops,3);await hold(warband,actor,claim);
  const crossing=await call("resolveRewardCampPayout",actor,{campId:warband.id,regionId:warband.regionId});
  assert.equal(crossing.powerReward.tier,"weak","The reward must use power before granting troops");
  assert(crossing.globalStats.kingPower>7813452,"The fixture must cross the weak boundary after credit");
  // Production skills and timed items may boost production, but not the rate used by camps.
  await seed("gold",20000000);await hold(gold,actor,claim);
  await profile.set({character:{level:100,xp:0},upgrades:{taxStewardship:20,royalGranaries:20},skillPointSystemVersion:2,
    itemEffects:{royalTaxDecreeExpiresAtMs:Date.now()+1800000,royalTaxDecreeStartedAtMs:Date.now()}},{merge:true});
  const boosted=await call("resolveRewardCampPayout",actor,{campId:gold.id,regionId:gold.regionId});
  assert.equal(boosted.powerReward.tier,"middle");
  assert(boosted.globalStats.goldPerHour>boosted.globalStats.baseGoldPerHour);
  assert.equal(boosted.reward,Math.max(20000,Math.floor(boosted.globalStats.baseGoldPerHour*0.5)));
  await seed("gold",5000);await hold(gold,actor,claim,{due:false});
  assert.equal((await call("resolveRewardCampPayout",actor,{campId:gold.id,regionId:gold.regionId})).status,"not-due");
  // A kingdom growing after capture is checked again at resolution.
  await city.update({troops:150000000,troopFloat:150000000});
  await campRef(gold).update({payoutAtMs:Date.now()-1000});
  const concurrent=await Promise.all([1,2].map(()=>call("resolveRewardCampPayout",actor,{campId:gold.id,regionId:gold.regionId})));
  const paid=concurrent.filter(r=>r.status==="paid");assert.equal(paid.length,1);
  assert.equal(paid[0].powerReward.tier,"strong");assert.equal((await progress("gold").get()).data().count,1);
  // Large forces moved into the camp remain in King Power.
  await seed("gold",5000);await hold(gold,actor,claim,{troops:150000000});
  const held=await call("resolveRewardCampPayout",actor,{campId:gold.id,regionId:gold.regionId});
  assert.equal(held.powerReward.tier,"strong");
  // Its returning march still counts at the next resolution.
  await seed("gold",5000);await hold(gold,actor,claim);
  const marching=await call("resolveRewardCampPayout",actor,{campId:gold.id,regionId:gold.regionId});
  assert.equal(marching.powerReward.tier,"strong");
  console.log("Core Camp power rewards: all tiers/claims, raw rates, minimums, shared limits, retries, duplicate races, changing power, camp garrisons and return marches passed.");
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
