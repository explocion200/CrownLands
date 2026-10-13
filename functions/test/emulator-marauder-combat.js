const { signUpVerifiedPlayer } = require("./auth-fixtures");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const { strictEqual, rejects } = require("node:assert/strict");
const M = require("../marauder-rules.js");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatEmulatorHost(host, port) {
  const normalizedHost = String(host || "127.0.0.1").trim();
  const formattedHost = normalizedHost.includes(":") && !normalizedHost.startsWith("[")
    ? `[${normalizedHost}]`
    : normalizedHost;
  return `${formattedHost}:${port}`;
}

async function resolveFunctionsHost() {
  if (configuredFunctionsHost) return configuredFunctionsHost;
  if (!functionsHostPromise) {
    functionsHostPromise = (async () => {
      const hubHost = String(process.env.FIREBASE_EMULATOR_HUB || "").trim();
      if (!hubHost) return "127.0.0.1:5001";
      const response = await fetch(`http://${hubHost}/emulators`);
      if (!response.ok) throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
      const functions = (await response.json())?.functions || {};
      const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
      const host = functions.host || listen?.address;
      const port = Number(functions.port || listen?.port);
      if (!host || !Number.isInteger(port) || port < 1) {
        throw new Error("Firebase Emulator Hub did not report a running Functions emulator.");
      }
      return formatEmulatorHost(host, port);
    })();
  }
  return functionsHostPromise;
}

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await signUpVerifiedPlayer(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `battle-gear-${label}-${nonce}@example.test`,
      password: `Battle-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callFunction(name, token, data = {}) {
  const host = await resolveFunctionsHost();
  const response = await fetch(`http://${host}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
        clientRealmShardId: realm.realmShardId || "legacy",
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  return body.result;
}


async function main() {
  const users = await Promise.all(['hunter','ally','rival'].map(createAuthUser));
  const info = await callFunction('getRealmInfo', users[0].token);
  Object.assign(realm,{releaseId:info.currentReleaseId,resetGeneration:info.resetGeneration,worldId:info.worldId,realmShardId:info.sharedRealmId});
  const current={worldId:realm.worldId,resetGeneration:realm.resetGeneration,realmShardId:realm.realmShardId};
  const storage=realm.resetGeneration+'--'+realm.realmShardId;
  const claims=[];for(const [i,user] of users.entries())claims.push(await callFunction('claimStartingCity',user.token,{playerName:'Hunt Tester '+i}));
  await db.doc('marauderPopulation/'+storage).set({enabled:true});
  const sourceRef=db.doc('islands/'+claims[0].islandId+'/cities/'+claims[0].cityId);
  const region=claims[0].regionId||claims[0].mainRegionId;
  const profileRef=db.doc('players/'+users[0].uid), staminaRef=profileRef.collection('stamina').doc('state');
  const source=(await sourceRef.get()).data();
  const id='marauder_'+crypto.createHash('sha256').update(region).digest('hex').slice(0,12)+'_00';
  const targetRef=db.doc('islands/'+claims[0].islandId+'/marauderCombat/'+id), publicRef=db.doc('islands/'+claims[0].islandId+'/marauders/'+id);
  async function seed(level=1,troops=M.balance(level).defenders){
    const row={...current,id,spawnId:crypto.randomUUID(),name:'Test Marauder',regionId:region,x:source.x+120,y:source.y,
      level,classification:'solo',targetType:'marauder',status:'active',slot:0,balanceVersion:1,ownerKind:'neutral',ownerUid:'',respawnAtMs:0};
    await Promise.all([targetRef.set({...row,troops}),publicRef.set(row)]);return row;
  }
  let enemy=await seed();
  const request=(kind,troops,armyId='hunt_'+crypto.randomBytes(8).toString('hex'))=>({sourceRegionId:region,targetRegionId:region,targetType:'marauder',targetSpawnId:enemy.spawnId,
    army:{id:armyId,kind,fromId:claims[0].cityId,toId:id,troops,requestedTroops:troops,targetType:'marauder',targetSpawnId:enemy.spawnId,sourceRegionId:region,targetRegionId:region}});
  async function replenish(){await sourceRef.set({troops:1000000,troopFloat:1000000,productionUpdatedAtMs:Date.now()},{merge:true});}
  async function launch(kind,troops){await replenish();const payload=request(kind,troops);const result=await callFunction('sendArmyOrder',users[0].token,payload);return {payload,movement:result.movement};}
  async function arrive(movement){await db.doc('armies/'+movement.id).set({arrivesAtMs:Date.now()-1000},{merge:true});return callFunction('resolveArmyOrder',users[0].token,{armyId:movement.id});}
  const initial=await callFunction('getStaminaState',users[0].token);strictEqual(initial.state.value,100);

  const walletRef = db.doc('players/'+users[0].uid+'/cosmetics/state');
  await walletRef.set({ version:1,crowns:120,revision:1 });
  await staminaRef.set({version:1,value:70,recoveredAtMs:Date.now(),revision:1,paidDay:''});
  const today = new Date().toISOString().slice(0,10);
  await profileRef.set({ daily:{date:today,harvestedGoldBonuses:0,harvestedTroopBonuses:0,harvestedBonuses:0},
    harvestBonuses:[{id:'hunt_refill_pickup',type:'crowns',regionId:region,x:1000,y:1000,createdAtMs:Date.now()}] },{merge:true});
  const reviewed = await callFunction('getStaminaState',users[0].token);
  strictEqual(reviewed.offer.price,9);
  const pickupRace = await Promise.allSettled([
    callFunction('refillStamina',users[0].token,{requestId:'hunt_pickup_refill',offer:reviewed.offer}),
    callFunction('collectHarvestBonus',users[0].token,{bonusId:'hunt_refill_pickup',type:'crowns',regionId:region}),
  ]);
  strictEqual(pickupRace[1].status,'fulfilled');
  strictEqual((await walletRef.get()).data().crowns,121-(pickupRace[0].status==='fulfilled'?9:0));
  strictEqual((await staminaRef.get()).data().paidDay,today && pickupRace[0].status==='fulfilled'?today:'');
  await staminaRef.set({version:1,value:100,recoveredAtMs:Date.now(),revision:10,paidDay:''});
  const previewPayload={...request('attack',200).army,requestedTroops:200};
  const unscouted=await callFunction('previewArmyProtection',users[0].token,previewPayload);strictEqual(unscouted.combatForecast.status,'unavailable');
  const scout=await launch('scout',1);strictEqual((await staminaRef.get()).data().value,100);
  await arrive(scout.movement);
  strictEqual((await db.doc(`battleSnapshots/${storage}/entries/${scout.movement.id}`).get()).exists,false,'Scouting creates no battle snapshot');
  const intel=(await profileRef.get()).data().scoutReports[enemy.spawnId];strictEqual(intel.troops,100);strictEqual(intel.totalDefense,100);
  const forecast=await callFunction('previewArmyProtection',users[0].token,previewPayload);strictEqual(forecast.combatForecast.status,'scouted');strictEqual(forecast.combatForecast.defensePower,100);
  const shieldUntil=Date.now()+3600000;await profileRef.set({itemEffects:{shieldExpiresAtMs:shieldUntil}},{merge:true});
  const battle=await launch('attack',200);strictEqual((await staminaRef.get()).data().value,90);
  await callFunction('sendArmyOrder',users[0].token,battle.payload);strictEqual((await staminaRef.get()).data().value,90);
  strictEqual((await profileRef.get()).data().itemEffects.shieldExpiresAtMs,shieldUntil);
  const soloDeparture=(await db.doc('armies/'+battle.movement.id).get()).data().attackCombatSnapshot;
  const settled=await arrive(battle.movement);strictEqual(settled.outcome,'victory');
  const soloSnapshotRef=db.doc(`battleSnapshots/${storage}/entries/${battle.movement.id}`);
  const savedSoloSnapshot=await soloSnapshotRef.get(),soloSnapshot=savedSoloSnapshot.data();
  strictEqual(settled.reports[0].battleId,battle.movement.id);
  strictEqual(soloSnapshot.target.targetType,'marauder');strictEqual(soloSnapshot.target.targetSpawnId,enemy.spawnId);
  strictEqual(soloSnapshot.totals.attackers,200);strictEqual(soloSnapshot.totals.defenders,100);
  strictEqual(soloSnapshot.totals.attackPower,soloDeparture.launchAttackPower);
  strictEqual(soloSnapshot.defender.effectivePower,100);strictEqual(soloSnapshot.siege,null);
  strictEqual(soloSnapshot.combatRule.captureAllowed,false);strictEqual(soloSnapshot.participantUids.length,1);
  strictEqual((await db.doc(`pvpKillEvents/${storage}/events/${battle.movement.id}`).get()).exists,false,'NPC report cannot grant PvP credit');
  strictEqual((await targetRef.get()).data().status,'defeated');strictEqual((await targetRef.get()).data().troops,0);
  const receipt=(await db.doc('marauderBattles/'+battle.movement.id).get()).data();strictEqual(receipt.loot.gold[users[0].uid],100);strictEqual(receipt.loot.xp[users[0].uid],20);
  assert(settled.movements.length===1,'Survivors return');
  const after=(await profileRef.get()).data();await callFunction('resolveArmyOrder',users[0].token,{armyId:battle.movement.id});strictEqual((await profileRef.get()).data().gold,after.gold);
  assert((await soloSnapshotRef.get()).updateTime.isEqual(savedSoloSnapshot.updateTime),'Replay rewrote the battle snapshot');
  await arrive(settled.movements[0]);
  enemy=await seed(1,100);const loss=await launch('attack',10);const defeat=await arrive(loss.movement);strictEqual(defeat.outcome,'defeat');
  const failed=(await targetRef.get()).data();assert(failed.troops>0&&failed.troops<100,'Failed battles retain defenders: '+JSON.stringify({failed,result:defeat}));strictEqual((await db.doc('marauderBattles/'+loss.movement.id).get()).data().loot,null);
  const failedSnapshot=(await db.doc(`battleSnapshots/${storage}/entries/${loss.movement.id}`).get()).data();
  strictEqual(failedSnapshot.outcome,'defeat');strictEqual(failedSnapshot.defender.survivors,failed.troops);
  strictEqual(failedSnapshot.attacker.losses,defeat.reports[0].attackerLosses);
  enemy=await seed();const first=await launch('attack',200),later=await launch('attack',200);const tie=Date.now()-2000;
  await Promise.all([first,later].map(b=>db.doc('armies/'+b.movement.id).set({arrivesAtMs:tie},{merge:true})));
  const sorted=[first,later].sort((a,b)=>a.movement.id.localeCompare(b.movement.id));
  const pending=await callFunction('resolveArmyOrder',users[0].token,{armyId:sorted[1].movement.id});strictEqual(pending.status,'pending');
  const winner=await callFunction('resolveArmyOrder',users[0].token,{armyId:sorted[0].movement.id});strictEqual(winner.outcome,'victory');
  const staminaBefore=(await staminaRef.get()).data().value;
  enemy=await seed();const replacementSpawn=enemy.spawnId;
  const refunded=await callFunction('resolveArmyOrder',users[0].token,{armyId:sorted[1].movement.id});strictEqual(refunded.outcome,'target_unavailable');strictEqual((await staminaRef.get()).data().value,staminaBefore+10);strictEqual((await targetRef.get()).data().spawnId,replacementSpawn);strictEqual((await targetRef.get()).data().troops,100);
  strictEqual(refunded.reports[0].battleId,'');
  strictEqual((await db.doc(`battleSnapshots/${storage}/entries/${sorted[1].movement.id}`).get()).exists,false,'Refund fabricated battle statistics');
  const stale=await callFunction('previewArmyProtection',users[0].token,{...previewPayload,targetSpawnId:replacementSpawn});strictEqual(stale.combatForecast.status,'unavailable');
  // Voluntary recalls spend committed stamina; server-invalid encounters refund it.
  // Existing Swift March restrictions still apply to hunts.
  await profileRef.set({shopItems:{recall_horn:1,swift_march_order:1}},{merge:true});
  const recalled=await launch('attack',200);const afterRecallLaunch=(await staminaRef.get()).data().value;
  await db.doc('armies/'+recalled.movement.id).set({arrivesAtMs:Date.now()+120000,startedAtMs:Date.now()-10000},{merge:true});
  await callFunction('useRecallHorn',users[0].token,{armyId:recalled.movement.id});
  strictEqual((await staminaRef.get()).data().value,afterRecallLaunch);
  const recalledMovement={...(await db.doc('armies/'+recalled.movement.id).get()).data(),id:recalled.movement.id};assert(recalledMovement.returning,'Recall returns home');
  await arrive(recalledMovement);strictEqual((await staminaRef.get()).data().value,afterRecallLaunch);
  strictEqual((await targetRef.get()).data().troops,100,'Recall never fights the NPC');
  await replenish();const swiftRequest=request('attack',200);swiftRequest.army.useSwiftMarchOrder=true;
  const staminaBeforeSwift=(await staminaRef.get()).data().value;
  await rejects(callFunction('sendArmyOrder',users[0].token,swiftRequest),/Swift March Orders only/);
  strictEqual((await staminaRef.get()).data().value,staminaBeforeSwift);strictEqual((await profileRef.get()).data().shopItems.swift_march_order,1);
  delete swiftRequest.army.useSwiftMarchOrder;const swift=await callFunction('sendArmyOrder',users[0].token,swiftRequest);
  const beforeInvalid=(await staminaRef.get()).data().value;await targetRef.delete();
  strictEqual((await arrive(swift.movement)).outcome,'target_unavailable');
  strictEqual((await staminaRef.get()).data().value,beforeInvalid+10);strictEqual((await profileRef.get()).data().shopItems.swift_march_order,1);
  enemy=await seed();
  // Population-policy retirement uses the same invalid-encounter path as a
  // vanished spawn: return every troop and refund committed stamina once.
  const retiredMarch=await launch('attack',200), beforeRetirement=(await staminaRef.get()).data().value;
  // Represent an already committed march consumable from before retirement.
  await profileRef.set({shopItems:{swift_march_order:0}},{merge:true});
  await db.doc('armies/'+retiredMarch.movement.id).set({swiftMarchUsedAtMs:Date.now()},{merge:true});
  await Promise.all([targetRef.set({status:'retired',retirementPolicyVersion:4},{merge:true}),publicRef.set({status:'retired'},{merge:true})]);
  const retiredResult=await arrive(retiredMarch.movement);
  strictEqual(retiredResult.outcome,'target_unavailable');strictEqual((await staminaRef.get()).data().value,beforeRetirement+10);
  strictEqual((await profileRef.get()).data().shopItems.swift_march_order,1);
  const retiredReceipt=(await db.doc('marauderBattles/'+retiredMarch.movement.id).get()).data();strictEqual(retiredReceipt.loot,null);
  strictEqual(retiredResult.movements.reduce((sum,row)=>sum+row.troops,0),200);
  await callFunction('resolveArmyOrder',users[0].token,{armyId:retiredMarch.movement.id});
  strictEqual((await staminaRef.get()).data().value,beforeRetirement+10,'No duplicate retirement refund');
  strictEqual((await profileRef.get()).data().shopItems.swift_march_order,1,'No duplicate retirement consumable refund');
  await arrive(retiredResult.movements[0]);enemy=await seed();
  await staminaRef.set({version:1,value:9,recoveredAtMs:Date.now(),revision:99,paidDay:''});await rejects(launch('attack',200),/stamina/);strictEqual((await staminaRef.get()).data().value,9);
  // Private stamina and current defender counts must never be readable by another player.
  async function readAs(user,path){return fetch('http://'+firestoreHost+'/v1/projects/'+projectId+'/databases/(default)/documents/'+path,{headers:{authorization:'Bearer '+user.token}});}
  strictEqual((await readAs(users[1],staminaRef.path)).status,403);strictEqual((await readAs(users[0],targetRef.path)).status,403);strictEqual((await readAs(users[1],publicRef.path)).status,200);
  strictEqual((await readAs(users[0],soloSnapshotRef.path)).status,200);
  strictEqual((await readAs(users[1],soloSnapshotRef.path)).status,403,'Other players cannot read solo battle intelligence');

  const clanId='hunt_clan_'+crypto.randomBytes(6).toString('hex');
  await db.doc('clans/'+clanId).set({...current,status:'active',leaderUid:users[0].uid,name:'Hunters',tag:'HUNT',memberCount:2});
  for(const [i,user] of users.slice(0,2).entries()){
    const role=i?'member':'leader';await db.doc('clans/'+clanId+'/members/'+user.uid).set({...current,uid:user.uid,clanId,status:'active',role,joinedAtMs:Date.now()-172800000});
    await db.doc('players/'+user.uid).set({clanId,clanRole:role,clanJoinedAtMs:Date.now()-172800000},{merge:true});
    await db.doc('islands/'+claims[i].islandId+'/cities/'+claims[i].cityId).set({troops:50000000,troopFloat:50000000,productionUpdatedAtMs:Date.now()},{merge:true});
  }
  const core=require('../core-expansion-region-catalog.json').regions.find(row=>row.permanentCore);
  const bossIsland=realm.worldId+'--'+realm.realmShardId+'--'+core.id;
  const coreCity=(await db.collection('islands/'+bossIsland+'/cities').limit(1).get()).docs[0].data();
  const boss={...current,id:'marauder_'+crypto.createHash('sha256').update(core.id).digest('hex').slice(0,12)+'_00',spawnId:crypto.randomUUID(),regionId:core.id,
    x:coreCity.x+120,y:coreCity.y,name:'Clan Boss Lv. 80',targetType:'marauder',classification:'boss',level:80,slot:0,status:'active',ownerUid:'',ownerKind:'neutral',balanceVersion:1};
  const bossRef=db.doc('islands/'+bossIsland+'/marauderCombat/'+boss.id);await bossRef.set({...boss,troops:20000000});
  const rallyId='boss_rally_'+crypto.randomBytes(8).toString('hex');
  const bossOrder={clanId,rallyId,sourceRegionId:region,targetRegionId:core.id,army:{id:rallyId,kind:'attack',fromId:claims[0].cityId,toId:boss.id,targetType:'marauder',targetSpawnId:boss.spawnId,sourceRegionId:region,targetRegionId:core.id,troops:10000000,requestedTroops:10000000}};
  await rejects(callFunction('sendArmyOrder',users[0].token,bossOrder),/bosses require a rally/);
  await callFunction('createClanRally',users[0].token,bossOrder);strictEqual((await staminaRef.get()).data().value,9,'Formation is free');
  await rejects(callFunction('launchClanRally',users[0].token,{clanId,rallyId}),/least|Ready|ready/);
  const joined=await callFunction('joinClanRally',users[1].token,{clanId,rallyId,army:{id:rallyId+'_join',kind:'rally_join',fromId:claims[1].cityId,sourceRegionId:claims[1].regionId||claims[1].mainRegionId,troops:20000000,requestedTroops:20000000}});
  await db.doc('armies/'+joined.movement.id).set({arrivesAtMs:Date.now()-1000},{merge:true});
  await callFunction('resolveArmyOrder',users[1].token,{armyId:joined.movement.id});
  const ready=await callFunction('getBossRallyReadiness',users[1].token,{clanId,rallyId});assert(ready.participants.every(p=>Object.keys(p).sort().join(',')==='ready,uid'),'Only readiness is public');strictEqual(ready.participants.find(p=>p.uid===users[0].uid).ready,false);
  await rejects(callFunction('getBossRallyReadiness',users[2].token,{clanId,rallyId}),/clan members/);
  await rejects(callFunction('launchClanRally',users[0].token,{clanId,rallyId}),/stamina/);strictEqual((await staminaRef.get()).data().value,9);
  await staminaRef.set({version:1,value:100,recoveredAtMs:Date.now(),revision:100,paidDay:''});
  const launched=await callFunction('launchClanRally',users[0].token,{clanId,rallyId,armyId:rallyId+'_attack'});
  strictEqual((await staminaRef.get()).data().value,90);strictEqual((await db.doc('players/'+users[1].uid+'/stamina/state').get()).data().value,90);
  strictEqual((await profileRef.get()).data().itemEffects.shieldExpiresAtMs,shieldUntil,'Neutral boss launch preserves shield');
  await callFunction('launchClanRally',users[0].token,{clanId,rallyId});strictEqual((await staminaRef.get()).data().value,90);
  const bossBattle=await arrive(launched.movement);strictEqual(bossBattle.outcome,'victory');
  const bossSnapshotRef=db.doc(`battleSnapshots/${storage}/entries/${launched.movement.id}`);
  const bossSnapshot=(await bossSnapshotRef.get()).data();
  strictEqual(bossSnapshot.target.classification,'boss');strictEqual(bossSnapshot.attackers.length,2);
  strictEqual(bossSnapshot.totals.attackPower,(await db.doc('clans/'+clanId+'/rallies/'+rallyId).get()).data().attackPower);
  for(const report of bossBattle.reports)strictEqual(report.battleId,launched.movement.id,'Rally recipients share one settled snapshot');
  for(const row of bossSnapshot.attackers){
    const personal=bossBattle.reports.find(report=>report.uid===row.ownerUid);
    strictEqual(row.startingTroops,personal.sentTroops);strictEqual(row.losses,personal.attackerLosses);strictEqual(row.survivors,personal.survivors);
  }
  for(const user of users.slice(0,2))strictEqual((await readAs(user,bossSnapshotRef.path)).status,200);
  strictEqual((await readAs(users[2],bossSnapshotRef.path)).status,403,'Nonparticipants cannot read a boss snapshot');
  const bossReceipt=(await db.doc('marauderBattles/'+launched.movement.id).get()).data();
  strictEqual(Object.values(bossReceipt.loot.gold).reduce((a,b)=>a+b,0),10000000);strictEqual(Object.values(bossReceipt.loot.xp).reduce((a,b)=>a+b,0),50000);
  strictEqual(Object.values(bossReceipt.loot.damage).reduce((a,b)=>a+b,0),20000000);assert(bossReceipt.loot.gold[users[1].uid]>bossReceipt.loot.gold[users[0].uid],'Departure damage weights split loot');
  assert(bossBattle.reports[0].xpAwarded < bossReceipt.loot.xp[users[0].uid], 'Personal Hero XP cap applies without redistribution');
  assert(bossBattle.reports[0].levelUpReward && bossBattle.reports[0].troopsAwarded > 0, 'Indirect Hero level-up troops are retained');
  strictEqual(bossBattle.reports[0].goldAwarded, bossReceipt.loot.gold[users[0].uid] + bossBattle.reports[0].levelUpReward.goldAwarded);
  strictEqual((await db.doc('clans/'+clanId+'/rallies/'+rallyId).get()).data().status,'resolved');
  const returners=await db.collection('armies').where('rallyId','==',rallyId).where('status','==','active').get();strictEqual(returners.size,2);
  // A second two-member rally has no reservation. If its boss vanishes, both
  // accounts recover their launch cost and the immutable old spawn receives no loot.
  const rally2=rallyId+'_cancel';boss.spawnId=crypto.randomUUID();await bossRef.set({...boss,troops:20000000});
  for(const [i,user] of users.slice(0,2).entries())await db.doc('islands/'+claims[i].islandId+'/cities/'+claims[i].cityId).set({troops:50000000,troopFloat:50000000,productionUpdatedAtMs:Date.now()},{merge:true});
  await callFunction('createClanRally',users[0].token,{...bossOrder,rallyId:rally2,army:{...bossOrder.army,id:rally2,targetSpawnId:boss.spawnId}});
  const join2=await callFunction('joinClanRally',users[1].token,{clanId,rallyId:rally2,army:{id:rally2+'_join',kind:'rally_join',fromId:claims[1].cityId,sourceRegionId:claims[1].regionId||claims[1].mainRegionId,troops:20000000,requestedTroops:20000000}});
  await db.doc('armies/'+join2.movement.id).set({arrivesAtMs:Date.now()-1000},{merge:true});await callFunction('resolveArmyOrder',users[1].token,{armyId:join2.movement.id});
  const launch2=await callFunction('launchClanRally',users[0].token,{clanId,rallyId:rally2});
  strictEqual((await staminaRef.get()).data().value,80);await bossRef.delete();
  strictEqual((await arrive(launch2.movement)).outcome,'target_unavailable');
  for(const user of users.slice(0,2))strictEqual((await db.doc('players/'+user.uid+'/stamina/state').get()).data().value,90);
  strictEqual((await db.doc('marauderBattles/'+launch2.movement.id).get()).data().loot,null);
  console.log('Marauder combat passed: real callables, routes, scouting privacy, departure charge, duplicate launch/settlement, shield preservation, normal combat/returns, simultaneous arrivals, failed survivors, immutable spawn refunds, insufficient stamina and Firestore privacy.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
