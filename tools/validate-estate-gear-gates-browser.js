"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const G = require("../common-gear");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

async function main() {
  const browser = [process.env.CHROME_PATH,"/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));
  assert(browser,"Set CHROME_PATH to Chromium.");
  const output = path.resolve(__dirname,"../release-artifacts/estate-building-gear-requirements");
  fs.mkdirSync(output,{recursive:true});
  const server=createMapBenchmarkServer(),address=await server.listen();
  let session,client; const errors=[],results=[];
  try {
    session=await startBrowserSession(browser);
    client=await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
    await client.send("Runtime.enable");await client.send("Page.enable");await client.send("Network.enable");
    await client.send("Network.setBlockedURLs",{urls:["https://*"]});
    client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
    const ev=async expression=>{
      const r=await client.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);
      return r.result.value;
    };
    const wait=async expression=>{
      for(let i=0;i<480;i++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,125));}
      throw Error("Timed out: "+expression);
    };
    await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});
    await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
    await ev(`(async()=>{window.__CROWNLANDS_BENCHMARK__.closeModal();await new Promise(r=>setTimeout(r,100));
      state.gold=1e15;openInnerCastle(getMainCityReference().id);setAnimationModePreference('off');
      window.__gateLevels={};window.__gateCalls=[];
      innerCastleEconomy={snapshot:()=>({estate:{levels:__gateLevels,entitlements:{barracks:4,treasury:4,gatehouse:4,'royal-stables':4}}}),balances:()=>({}),now:Date.now,visibilityChanged(){},refresh:async()=>{}};
      innerCastleEstateView?.updateResources();
      getOnlineApi=()=>({equipCommonGear:async()=>{__gateCalls.push('equip');return{};}});
    })()`);
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      for(const building of Object.keys(G.BUILDINGS)){
        for(let tier=1;tier<5;tier++){
          const rarity=G.RARITIES[tier],threshold=[1,25,50,75,100][tier];
          const d=G.DEFINITIONS.find(d=>d.buildingId===building&&d.slot==="head"&&d.rarity===rarity);
          const previous=G.DEFINITIONS.find(item=>item.familyKey===d.familyKey&&item.rarity===G.RARITIES[tier-1]);
          const gear=G.createDefaultState();
          for(const [id,definition,level,gated] of [["new",d,1,true],["material",d,1,true],["old",d,1,false],["old-copy",d,1,false],["promotion",previous,5,false],["promotion-copy",previous,5,false]])
            gear.instances[id]=G.normalizeInstance({instanceId:id,gearKey:definition.gearKey,level,requiresBuildingLevel:gated});
          await ev(`state.gear=normalizeCommonGearState(${JSON.stringify(gear)});__gateLevels[${JSON.stringify(building)}]=${threshold-1};
            selectedCommonGearInstanceId='new';selectedCommonGearSlot='head';selectedCommonGearBagFilter='all';
            commonGearMergeConfirmOpen=false;renderCommonGearBuilding(${JSON.stringify(building)});void 0`);
          await wait(`!!modal.querySelector('[data-${building}-officer]')`);
          const blocked=await ev(`(()=>{const vm=createCommonGearViewModel(${JSON.stringify(building)});return{
            canEquip:vm.canEquip,canMerge:vm.canMerge,reason:vm.equipReason,
            equipDisabled:modal.querySelector('[data-gear-equip]').disabled,upgradeDisabled:modal.querySelector('[data-gear-merge]').disabled,
            text:modal.querySelector('[data-gear-building-requirement]').textContent,
            groups:vm.bagGroups.length};})()`);
          assert(!blocked.canEquip&&!blocked.canMerge&&blocked.equipDisabled&&blocked.upgradeDisabled);
          assert(blocked.text.includes("Level "+threshold)&&blocked.text.includes("Current building Level "+(threshold-1)));
          assert.equal(blocked.groups,3,"Old usable copies must remain separately selectable");
          await ev("modal.querySelector('[data-gear-equip]').click();void 0");
          assert.equal(await ev("__gateCalls.length"),0,"Disabled equip sends no action");
          if(tier===1){
            await ev("document.querySelector('[data-gear-building-requirement]').scrollIntoView({block:'center'});new Promise(r=>requestAnimationFrame(r))");
            const fit=await ev(`(()=>{const panel=modal.querySelector('[data-gear-panel="details"]'),warning=modal.querySelector('[data-gear-building-requirement]'),r=warning.getBoundingClientRect(),p=panel.getBoundingClientRect();return{horizontal:modalBody.scrollWidth<=modalBody.clientWidth+1,warningVisible:r.top>=p.top-1&&r.bottom<=p.bottom+1,buttons:[...modal.querySelectorAll('.tg-actions button')].every(b=>{const q=b.getBoundingClientRect();return q.left>=0&&q.right<=innerWidth&&q.top>=0&&q.bottom<=innerHeight;})};})()`);
            assert(fit.horizontal&&fit.warningVisible&&fit.buttons,JSON.stringify({building,width,fit}));
            fs.writeFileSync(path.join(output,building+"-locked-"+width+".png"),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
          }
          await ev(`selectedCommonGearInstanceId='old';renderCommonGearBuilding(${JSON.stringify(building)});void 0`);
          assert(await ev(`(()=>{const vm=createCommonGearViewModel(${JSON.stringify(building)});return vm.canEquip&&vm.canMerge;})()`),"Existing Gear keeps equip and same-rarity upgrade access");
          await ev(`selectedCommonGearInstanceId='promotion';renderCommonGearBuilding(${JSON.stringify(building)});void 0`);
          assert.equal(await ev(`createCommonGearViewModel(${JSON.stringify(building)}).canMerge`),false,"Owned destination rarity and old entitlements cannot authorize promotion");
          await ev(`__gateLevels[${JSON.stringify(building)}]=${threshold};renderCommonGearBuilding(${JSON.stringify(building)});void 0`);
          assert.equal(await ev(`createCommonGearViewModel(${JSON.stringify(building)}).canMerge`),true);
          await ev(`selectedCommonGearInstanceId='new';renderCommonGearBuilding(${JSON.stringify(building)});void 0`);
          assert(await ev(`(()=>{const vm=createCommonGearViewModel(${JSON.stringify(building)});return vm.canEquip&&vm.canMerge;})()`),"Completed milestone permits both actions");
          await ev(`delete __gateLevels[${JSON.stringify(building)}];renderCommonGearBuilding(${JSON.stringify(building)});void 0`);
          assert.equal(await ev(`createCommonGearViewModel(${JSON.stringify(building)}).canEquip`),false,"Unknown building state fails closed");
          await ev(`state.gear.equipped[${JSON.stringify(building)}].head='new';state.gear=normalizeCommonGearState(state.gear);renderCommonGearBuilding(${JSON.stringify(building)});void 0`);
          assert.equal(await ev("modal.querySelector('[data-gear-equip]').disabled"),false,"Unequip always remains available");
          assert.equal(await ev("modal.querySelector('[data-gear-equip]').textContent"),"Unequip");
          results.push({building,rarity,threshold,width,height,passed:true});
        }
      }
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,"browser-results.json"),JSON.stringify(results,null,2));
    console.log("PASS: four officers, every rarity gate, old-item preservation, separate stacks, promotion/equip/upgrade boundaries, unknown-state rejection and unchanged reachable controls at desktop and two landscape sizes.");
  }finally{
    if(client)await client.send("Browser.close").catch(()=>{});
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
