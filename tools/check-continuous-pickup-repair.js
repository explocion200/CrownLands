"use strict";
const assert=require("node:assert/strict");
module.exports=async function checkPickupRepair(page,pilot,source){
  const profile=pilot.store.doc("players/"+pilot.players[0].uid);
  const bonus=await page.evaluate(key=>{
    harvestSpawnRequestInFlight=true;
    const v=nativeContinuousWorld.view,o=v.getObject(key),s=v.scene.sections.find(s=>s.id===o.sectionId),b=s.gameBounds;
    return {id:"obstructed-connected-pickup",type:"gold",regionId:s.id,x:Math.round(b.left+(o.x-s.x)/s.width*b.width),y:Math.round(b.top+(o.y-s.y)/s.height*b.height),createdAtMs:Date.now()};
  },source.regionId+":"+source.id);
  const deadline=Date.now()+120000;
  try{
    await profile.update({harvestBonuses:[bonus],harvestNextSpawnAtMs:deadline});
    const before=(await profile.get()).data();
    await page.evaluate(async()=>applyServerEconomyResult(await getOnlineApi().collectEconomy(),{renderCities:false}));
    assert(await page.locator(`#continuous-world-pickups [data-harvest-bonus-id="${bonus.id}"]`).isHidden(),"Obstructed saved pickup flashes over its castle");
    assert(!await page.evaluate(()=>isHarvestBonusPlacementSafe(getAllActiveHarvestBonuses()[0])));
    await page.evaluate(()=>{harvestSpawnRequestInFlight=false;harvestRelocationRetryAtMs=0;updateServerHarvestBonuses();});
    await page.waitForFunction(id=>{const b=getAllActiveHarvestBonuses().find(b=>b.id===id);return b&&isHarvestBonusPlacementSafe(b)&&!harvestSpawnRequestInFlight;},bonus.id);
    const after=(await profile.get()).data(),moved=after.harvestBonuses.find(b=>b.id===bonus.id);
    assert(moved&&(moved.x!==bonus.x||moved.y!==bonus.y));
    assert.equal(moved.type,bonus.type);assert.equal(moved.createdAtMs,bonus.createdAtMs);assert.equal(after.harvestNextSpawnAtMs,deadline);
    for(const key of ["harvestedGoldBonuses","harvestedTroopBonuses","harvestedCrownBonuses"])assert.equal(after.daily?.[key]||0,before.daily?.[key]||0,"Relocation spends an allowance");
    await profile.update({harvestBonuses:[],harvestNextSpawnAtMs:deadline});
    await page.evaluate(async()=>applyServerEconomyResult(await getOnlineApi().collectEconomy(),{renderCities:false}));
  }finally{await page.evaluate(()=>{harvestSpawnRequestInFlight=false;});}
};
