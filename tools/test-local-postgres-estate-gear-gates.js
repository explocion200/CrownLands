"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto");
(async()=>{
  assert(!process.env.CROWNLANDS_BACKEND&&!process.env.FIRESTORE_EMULATOR_HOST);
  process.env.CROWNLANDS_BACKEND="postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA="migration_game_gear_"+crypto.randomBytes(5).toString("hex");
  const game=require("../functions"),db=require("../functions/platform").store;
  const E=require("../functions/estate-economy"),G=require("../functions/common-gear");
  const uid="gear-gates-fixture";let identity={};
  const call=(name,data={})=>game[name]({auth:{uid,token:{email_verified:true,firebase:{sign_in_provider:"google.com"}}},data:{...identity,...data}});
  const gearCall=(name,data)=>call(name,{gearSchemaVersion:G.SCHEMA_VERSION,...data});
  try{
    await db.initialize();
    const seasons=require("../functions/season-rewards"),prior=seasons.previousSeason("realm-"+new Date().toISOString().slice(0,7));
    await seasons.arm(db,prior,seasons.seasonInfo(prior).startsAtMs+1);
    const info=await call("getRealmInfo");
    identity={clientReleaseId:info.currentReleaseId,clientWorldId:info.worldId,clientResetGeneration:info.resetGeneration,clientRealmShardId:info.sharedRealmId};
    await call("claimStartingCity",{playerName:"Gear Requirements"});
    const profile=db.doc(`players/${uid}`),estate=db.doc(`players/${uid}/estate/state`);
    for(const building of Object.keys(G.BUILDINGS))for(let tier=1;tier<5;tier++){
      const threshold=[1,25,50,75,100][tier],rarity=G.RARITIES[tier];
      const target=G.DEFINITIONS.find(d=>d.buildingId===building&&d.slot==="head"&&d.rarity===rarity);
      const source=G.DEFINITIONS.find(d=>d.familyKey===target.familyKey&&d.rarity===G.RARITIES[tier-1]);
      const gear=G.createDefaultState();gear.uncommonGearBoxes=2;
      for(const [id,definition,level,gated]of[["old",target,1,false],["old_copy",target,1,false],["new",target,1,true],["new_copy",target,1,true],["promotion",source,5,false],["promotion_copy",source,5,false]])
        gear.instances[id]=G.normalizeInstance({instanceId:id,gearKey:definition.gearKey,level,requiresBuildingLevel:gated});
      const saved=E.initial(Date.now());saved.levels[building]=threshold-1;saved.entitlements[building]=4;saved.chestEntitlement=1;
      await estate.set(saved);await profile.update({gear,gold:1e15,goldFloat:1e15});
      const denied=async(name,input)=>{
        const before=[(await profile.get()).data(),(await estate.get()).data()];
        await assert.rejects(gearCall(name,input),new RegExp("Level "+threshold));
        assert.deepEqual([(await profile.get()).data(),(await estate.get()).data()],before,"Rejected actions are read-only, including automatic settlement");
      };
      await denied("equipCommonGear",{instanceId:"new"});
      await denied("upgradeCommonGear",{instanceId:"new",cost:G.getUpgradeGoldCost(gear.instances.new),requestId:crypto.randomUUID()});
      await denied("upgradeCommonGear",{instanceId:"promotion",cost:G.getUpgradeGoldCost(gear.instances.promotion),requestId:crypto.randomUUID()});
      const oldEquip=await gearCall("equipCommonGear",{instanceId:"old"});
      assert.equal(oldEquip.currentUser.gear.equipped[building].head,"old");
      const oldUpgrade=await gearCall("upgradeCommonGear",{instanceId:"old",cost:G.getUpgradeGoldCost(gear.instances.old),requestId:crypto.randomUUID()});
      assert.equal(oldUpgrade.currentUser.gear.instances[oldUpgrade.upgradedInstanceId].requiresBuildingLevel,undefined);
      assert.equal(oldUpgrade.currentUser.gear.equipped[building].head,oldUpgrade.upgradedInstanceId);
      await gearCall("unequipCommonGear",{instanceId:oldUpgrade.upgradedInstanceId});
      await profile.update({gear});saved.levels[building]=threshold;await estate.set(saved);
      assert.equal((await gearCall("equipCommonGear",{instanceId:"new"})).currentUser.gear.equipped[building].head,"new");
      const requestId=crypto.randomUUID(),input={instanceId:"promotion",cost:G.getUpgradeGoldCost(gear.instances.promotion),requestId};
      const race=await Promise.all([gearCall("upgradeCommonGear",input),gearCall("upgradeCommonGear",input)]);
      assert.equal(race.filter(r=>r.replayed).length,1);
      const accepted=race.find(r=>!r.replayed);
      assert.equal(accepted.currentUser.gear.instances[accepted.upgradedInstanceId].rarity,rarity);
      assert.equal(accepted.currentUser.gear.instances[accepted.upgradedInstanceId].requiresBuildingLevel,true);
      const after=(await profile.get()).data();
      assert.equal(Object.keys(after.gear.instances).length,5);
      // Historical receipts still replay independently of subsequent gates.
      await estate.update({["levels."+building]:threshold-1});
      assert((await gearCall("upgradeCommonGear",input)).replayed);
      await gearCall("unequipCommonGear",{instanceId:"new"});
    }
    const saved=E.initial(Date.now());await estate.set(saved);
    const gear=G.createDefaultState();gear.uncommonGearBoxes=1;await profile.update({gear});
    const opened=await gearCall("openCommonGearBox",{requestId:"new_gear_box_001",boxType:"uncommon"});
    assert.equal(Object.keys(opened.gear.instances).length,3);
    const uncommon=Object.values(opened.gear.instances).find(i=>i.rarity==="uncommon");
    assert(uncommon.requiresBuildingLevel);
    await assert.rejects(gearCall("equipCommonGear",{instanceId:uncommon.instanceId}),/Level 25/);
    assert((await gearCall("openCommonGearBox",{requestId:"new_gear_box_001",boxType:"uncommon"})).replayed);
    console.log("PostgreSQL Gear requirements passed: every officer/tier boundary, old gear equip/upgrade, new equipment gates, strict promotions despite old entitlements/chests/owned rarity, atomic rejection, concurrent replay, unequip and new-box markers.");
  }finally{await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`);await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
