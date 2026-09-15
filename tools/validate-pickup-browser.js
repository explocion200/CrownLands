"use strict";
const assert = require("node:assert/strict");

async function verifyPickupInteractions(client, evaluate, baselinePlacement = "null", baselineEditorMap = "null", bonusType = "gold") {
  const placement = await evaluate(`(() => {
    const original = {valid:isValidHarvestBonusPoint,random:Math.random,bonuses:state.harvestBonuses,editorMap:getEditorMap,buildMap:buildCatalogEditorMap};
    const beforePlace = ${baselinePlacement};
    const beforeMap = ${baselineEditorMap};
    let checks = 0, builds = 0;
    buildCatalogEditorMap=(...args)=>{builds++;return original.buildMap(...args);};
    isValidHarvestBonusPoint = (...args) => {checks++;return original.valid(...args);};
    state.harvestBonuses = [];
    const measure = place => {
      let seed = 12345;
      Math.random = () => ((seed=(seed*1664525+1013904223)>>>0)/0x100000000);
      checks=0;builds=0;
      const start=performance.now();
      const points=Array.from({length:10},()=>place(getActiveMapRegionId()));
      return {ms:performance.now()-start,checks,builds,points};
    };
    try {
      if(beforeMap)getEditorMap=beforeMap;
      const before=beforePlace?measure(beforePlace):null;
      getEditorMap=original.editorMap;
      const after=measure(createHarvestBonusPoint), persisted=[];
      // These seeds placed a fractional point on land, then rounded the saved
      // pickup across its terrain boundary so the next update deleted it.
      for(const fixtureSeed of [2,22,31]) {
        let seed=(fixtureSeed*2654435761)>>>0;
        Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/0x100000000);
        state.harvestBonuses=[];
        const region=getActiveMapRegionId(),point=createHarvestBonusPoint(region);
        if(!point) throw new Error('No valid pickup placement for seed '+fixtureSeed);
        const bonus=createHarvestBonusRecord(region,'gold',point);
        state.harvestBonuses=[bonus];pruneExpiredHarvestBonuses();
        persisted.push({seed:fixtureSeed,retained:state.harvestBonuses.length===1});
      }
      return {region:getActiveMapRegionId(),before,after,persisted};
    }
    finally {isValidHarvestBonusPoint=original.valid;Math.random=original.random;state.harvestBonuses=original.bonuses;getEditorMap=original.editorMap;buildCatalogEditorMap=original.buildMap;}
  })()`);
  assert(placement.after.points.every(Boolean), "Current-map terrain did not permit a pickup.");
  assert(placement.persisted.every(result=>result.retained), `Saving a pickup moved it off valid terrain: ${JSON.stringify(placement.persisted)}`);
  if (placement.before) {
    assert.deepEqual(placement.after.points, placement.before.points, "Early exit changed the selected placement.");
    assert(placement.after.checks <= placement.before.checks, "Placement added terrain checks.");
  }
  const position = await evaluate(`(() => {
    const qa=window.pickupBrowserQa={calls:0,reservations:0,original:{usesServerEconomyAuthority,getOnlineApi,bonuses:state.harvestBonuses,daily:state.daily,next:state.harvestNextSpawnAtMs,timer:state.harvestSpawnTimer}};
    state.harvestBonuses=[];
    const region=getActiveMapRegionId(),point=createHarvestBonusPoint(region);
    qa.bonus={...createHarvestBonusRecord(region,${JSON.stringify(bonusType)},point),id:'pickup-browser-regression'};
    state.harvestBonuses=[qa.bonus];
    state.daily={date:currentDailyDateKey(),harvestedBonuses:0,harvestedGoldBonuses:0,harvestedTroopBonuses:0};
    state.harvestNextSpawnAtMs=Date.now()-1000;
    usesServerEconomyAuthority=()=>true;
    getOnlineApi=()=>({collectHarvestBonus:()=>{qa.calls++;return new Promise((resolve,reject)=>{qa.resolve=resolve;qa.reject=reject;});},reserveHarvestBonusSpawn:()=>{qa.reservations++;return Promise.resolve({});}});
    renderHarvestBonuses();centerOnWorldPoint(qa.bonus,region);updateCameraTransform();
    qa.node=harvestLayer.querySelector('.harvest-bonus-node');
    qa.node.focus();
    for(let i=0;i<30;i++) renderHarvestBonuses();
    const stable=qa.node===harvestLayer.querySelector('.harvest-bonus-node') && document.activeElement===qa.node;
    const rect=qa.node.getBoundingClientRect();
    return {stable,x:rect.left+rect.width/2,y:rect.top+rect.height/2};
  })()`);
  try {
    assert(position.stable, "Routine renders replaced the pickup button or keyboard focus.");
    await client.send("Input.dispatchMouseEvent", {type:"mousePressed",x:position.x,y:position.y,button:"left",clickCount:1});
    await evaluate("renderHarvestBonuses()");
    await client.send("Input.dispatchMouseEvent", {type:"mouseReleased",x:position.x,y:position.y,button:"left",clickCount:1});
    const pending = await evaluate(`(() => {
      const qa=pickupBrowserQa;
      renderHarvestBonuses();updateServerHarvestBonuses();
      qa.node.click();
      return {calls:qa.calls,reservations:qa.reservations,stable:qa.node===harvestLayer.querySelector('.harvest-bonus-node'),disabled:qa.node.disabled,busy:qa.node.getAttribute('aria-busy')};
    })()`);
    assert.deepEqual(pending,{calls:1,reservations:0,stable:true,disabled:true,busy:"true"},"A repaint swallowed the click or allowed competing pickup requests.");
    const pendingArt = await evaluate(`(() => {
      const style = getComputedStyle(pickupBrowserQa.node);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, filter: style.filter };
    })()`);
    assert.deepEqual(pendingArt,{backgroundColor:"rgba(0, 0, 0, 0)",backgroundImage:"none",filter:"none"},"Pending collection picked up the global disabled-button background or gray filter.");
    await evaluate("pickupBrowserQa.reject(new Error('Controlled pickup rejection'))");
    await evaluate("new Promise(resolve=>setTimeout(resolve,0))");
    assert.equal(await evaluate("!pickupBrowserQa.node.disabled && pickupBrowserQa.node===harvestLayer.querySelector('.harvest-bonus-node') && pendingHarvestBonusIds.size===0"),true,"Failed collection did not restore the same usable button.");
    await evaluate("pickupBrowserQa.node.click()");
    await evaluate(`pickupBrowserQa.resolve({reward:125,currentUser:{harvestBonuses:[],harvestNextSpawnAtMs:Date.now()+120000,harvestSpawnTimer:120,daily:{date:currentDailyDateKey(),harvestedBonuses:1,harvestedGoldBonuses:${bonusType === "gold" ? 1 : 0},harvestedTroopBonuses:${bonusType === "troops" ? 1 : 0}}}})`);
    await evaluate("new Promise(resolve=>setTimeout(resolve,0))");
    await evaluate("for(let i=0;i<30;i++) renderHarvestBonuses()");
    assert.equal(await evaluate("harvestLayer.querySelector('.harvest-bonus-node')===null && pendingHarvestBonusIds.size===0 && pickupBrowserQa.calls===2"),true,"Confirmed collection left a ghost pickup.");
    return {bonusType,placement,pending,pendingArt,failedRetry:true,confirmedRemoval:true};
  } finally {
    await evaluate(`(() => {const original=pickupBrowserQa.original;usesServerEconomyAuthority=original.usesServerEconomyAuthority;getOnlineApi=original.getOnlineApi;state.harvestBonuses=original.bonuses;state.daily=original.daily;state.harvestNextSpawnAtMs=original.next;state.harvestSpawnTimer=original.timer;renderHarvestBonuses();delete window.pickupBrowserQa;})()`);
  }
}

module.exports = { verifyPickupInteractions };

if (require.main === module) (async () => {
  const fs = require("node:fs"), path = require("node:path");
  const { execFileSync } = require("node:child_process");
  const { CdpClient } = require("./map-benchmark/cdp-client");
  const { createMapBenchmarkServer } = require("./map-benchmark/server");
  const { startBrowserSession,waitForProcessExit,removeBrowserProfile } = require("./validate-focused-browser-smoke");
  const browser=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(file=>file&&fs.existsSync(file));
  assert(browser,"Chromium browser required.");
  let baseline="null",baselineMap="null";
  if(process.argv.includes("--compare-main")) {
    const source=execFileSync("git",["show","origin/main:game.js"],{cwd:path.join(__dirname,".."),encoding:"utf8",maxBuffer:8*1024*1024});
    const start=source.indexOf("function createHarvestBonusPoint(");
    baseline=source.slice(start,source.indexOf("\n}",start)+2);
    const mapStart=source.indexOf("function getEditorMap(");
    baselineMap=source.slice(mapStart,source.indexOf("\n}",mapStart)+2);
  }
  const server=createMapBenchmarkServer(),address=await server.listen();
  let session,client;
  const results=[];
  try {
    session=await startBrowserSession(browser);
    client=await CdpClient.connect(session.targets.find(target=>target.type==="page").webSocketDebuggerUrl);
    await client.send("Page.enable");await client.send("Runtime.enable");
    const evaluate=async expression=>{const result=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));return result.result.value;};
    for(const viewport of [{name:"desktop",width:1440,height:900},{name:"landscape-4x",width:844,height:390,cpuRate:4}]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});
      await client.send("Emulation.setCPUThrottlingRate",{rate:viewport.cpuRate||1});
      await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});
      for(let i=0;i<240&&!await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");i++)await new Promise(resolve=>setTimeout(resolve,250));
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__.getStatus().status"),"ready");
      await evaluate("window.__CROWNLANDS_BENCHMARK__.closeModal()");
      for (const bonusType of ["gold", "troops"]) {
        const result={viewport:viewport.name,...await verifyPickupInteractions(client,evaluate,baseline,baselineMap,bonusType)};
        results.push(result);console.log(JSON.stringify(result));
      }
    }
    const output=path.join(__dirname,"../release-artifacts/performance/pickup-interactions.json");
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(results,null,2)+"\n");
  } finally {
    if(client)await client.send("Browser.close").catch(()=>{});
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
