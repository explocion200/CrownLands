"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/crowns-currency");

function installFixture() {
  __CROWNLANDS_BENCHMARK__.closeModal();
  const qa = window.crownsQA = { uid: "crowns-a", reads: [], subscriptions: [], claims: 0 };
  getCurrentOnlineUid = () => qa.uid;
  getOnlineApi = () => ({
    getUser: () => qa.uid ? { uid: qa.uid } : null,
    getCosmeticsState: () => new Promise(resolve => qa.reads.push({ uid: qa.uid, resolve })),
    subscribeCosmetics: callbacks => {
      const entry = { uid: qa.uid, callbacks, stopped: false }; qa.subscriptions.push(entry);
      return () => { entry.stopped = true; };
    },
    collectHarvestBonus: () => { qa.claims++; return new Promise((resolve, reject) => { qa.claim = { resolve, reject }; }); },
  });
  syncCosmeticsSession();
}

function layout() {
  const rect = e => { const r = e.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
  const overlap = (a,b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  const gold = document.querySelector(".profile-gold"), crowns = document.getElementById("crownsBalance"), timers = document.getElementById("combatTimers");
  const g = rect(gold), c = rect(crowns), t = rect(timers);
  const controls = ["profileBtn","leaderboardBtn","clanHudBtn","dailyLoginRewardBtn","mainCityReturnBtn","fullscreenBtn","incomingAttackBtn","outgoingAttackBtn","logBtn","chatToggleBtn","inventoryBtn","shopBtn","cityListBtn","islandSwitchBtn"]
    .map(id => document.getElementById(id)).filter(e => !e.hidden).map(e => {
      const r = rect(e), hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return { id:e.id, bounds:r, clear:!overlap(t,r), reachable:e.contains(hit) };
    });
  return { gold:g, crowns:c, timers:t, controls, collisions:controls.flatMap((a,i)=>controls.slice(i+1).filter(b=>overlap(a.bounds,b.bounds)).map(b=>[a.id,b.id])),
    icons:[gold,crowns].map(e => rect(e.querySelector("img"))), amounts:[gold,crowns].map(e => rect(e.querySelector("strong"))),
    labelsFit:[...timers.querySelectorAll("[data-shield-cooldown],summary")].every(e => e.scrollWidth <= e.clientWidth+1),
    goldFits:gold.scrollWidth<=gold.clientWidth+1, crownsFits:crowns.scrollWidth<=crowns.clientWidth+1 };
}

async function main() {
  const executable = [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "Chromium required"); fs.mkdirSync(artifacts,{recursive:true});
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client; const errors = [], failedAssets = [], records = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    client.on("Network.responseReceived", e => { if (e.response.status >= 400 && ["Image","Stylesheet","Script"].includes(e.type)) failedAssets.push(e.response.url); });
    const ev = async expression => {
      const r = await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
      if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value;
    };
    const wait = async expression => { for(let i=0;i<500;i++){ if(await ev(expression))return; await delay(100); } throw Error("Timeout: "+expression); };
    const text = () => ev("document.getElementById('crownsText').textContent");
    await client.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick"});
    await wait("document.documentElement?.dataset.crownlandsBenchmarkReady==='true'");
    await ev(`(${installFixture.toString()})()`);
    assert.equal(await text(), "—", "An unknown wallet must not appear as zero or a previous balance");
    await ev("crownsQA.subscriptions[0].callbacks.onError(Error('Offline'))");
    assert.equal(await text(), "—");
    assert.equal(await ev("document.getElementById('crownsBalance').title"), "Crowns balance unavailable");
    await ev("crownsQA.subscriptions[0].callbacks.onState({crowns:120,revision:1})");
    assert.equal(await text(), "120");
    await ev("applyServerEconomyResult({cosmetics:{crowns:121,revision:2}},{render:false})");
    assert.equal(await text(), "121", "The real collection response path must refresh a closed-panel HUD");
    await ev("crownsQA.subscriptions[0].callbacks.onState({crowns:120,revision:1});crownsQA.reads[0].resolve({state:{crowns:0,revision:0}})");
    assert.equal(await text(), "121", "Older snapshots or initial reads cannot roll back the balance");
    await ev("crownsQA.uid='crowns-b';syncCosmeticsSession()");
    assert.equal(await text(), "—");
    assert(await ev("crownsQA.subscriptions[0].stopped"));
    await ev("crownsQA.subscriptions[0].callbacks.onState({crowns:999,revision:99});crownsQA.subscriptions[1].callbacks.onState({crowns:0,revision:0})");
    assert.equal(await text(), "0", "Confirmed zero is distinct from loading and ignores the previous account");
    await ev("crownsQA.uid='';syncCosmeticsSession();crownsQA.reads[1].resolve({state:{crowns:777,revision:100}})");
    assert.equal(await text(), "—", "Sign-out clears the balance and rejects a late previous-account read");
    await ev("crownsQA.uid='crowns-c';syncCosmeticsSession();crownsQA.subscriptions[2].callbacks.onState({crowns:1234567,revision:1})");
    assert.equal(await ev("document.getElementById('crownsBalance').getAttribute('aria-label')"), "1,234,567 Crowns");
    assert.equal(await ev("document.getElementById('crownsBalance').title"), "1,234,567 Crowns");
    await ev(`(() => {
      const now=getClanQuestServerNowMs();
      onlineCombatAuthorization={uid:crownsQA.uid,shieldExpiresAtMs:now+900000,retaliation:[{id:'crown-layout-retake',cityId:'fixture-city',cityName:'Thornford',regionId:getActiveMapRegionId(),status:'available',expiresAtMs:now+600000}]};
      renderCombatTimers();
      state.harvestBonuses=[];
      const point=createHarvestBonusPoint(getActiveMapRegionId());
      if(!point)throw Error('No terrain-safe fixture pickup position');
      state.harvestBonuses=[createHarvestBonusRecord(getActiveMapRegionId(),'crowns',point)];
      renderHarvestBonuses();centerOnWorldPoint(point,getActiveMapRegionId());updateCameraTransform();
    })()`);
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false}); await delay(250);
      await ev("centerOnWorldPoint(state.harvestBonuses[0],getActiveMapRegionId());updateCameraTransform();renderCombatTimers();renderHarvestBonuses();updateMainCityReturnButton()");
      const metrics = await ev(`(${layout.toString()})()`);
      fs.writeFileSync(path.join(artifacts,`hud-${width}.png`),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
      records.push({width,height,metrics});
      fs.writeFileSync(path.join(artifacts,"layout.json"),JSON.stringify(records,null,2));
      assert.equal(metrics.gold.x,metrics.crowns.x); assert.equal(metrics.gold.x,metrics.timers.x);
      assert.equal(metrics.gold.width,metrics.crowns.width); assert.equal(metrics.icons[0].x,metrics.icons[1].x);
      assert.equal(metrics.amounts[0].right,metrics.amounts[1].right);
      assert(metrics.crowns.y >= metrics.gold.bottom+3 && metrics.timers.y >= metrics.crowns.bottom+3);
      assert(metrics.goldFits && metrics.crownsFits && metrics.labelsFit, "Counter or timer text overflows: "+JSON.stringify(metrics));
      assert(metrics.controls.every(e => e.clear && e.reachable), "Timers crowd another HUD control: "+JSON.stringify({width,height,metrics}));
      assert.deepEqual(metrics.collisions,[],"HUD controls must not overlap at "+width);
      await ev("document.querySelector('#combatTimers details').open=true;renderCombatTimers()");
      const menu = await ev(`(() => { const e=document.querySelector('.retaliation-list-panel'),r=e.getBoundingClientRect();return{fits:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight,hit:e.contains(document.elementFromPoint(r.x+15,r.bottom-15))}; })()`);
      assert(menu.fits && menu.hit, "Retaliation dropdown must remain visible and reachable");
      await ev("document.querySelector('#combatTimers details').open=false");
    }
    assert(await ev("!!document.querySelector('.harvest-bonus-crowns img')"), await ev("JSON.stringify({region:getActiveMapRegionId(),bounds:getIslandMapBounds(getActiveMapRegionId()),bonuses:state.harvestBonuses,nodes:harvestLayer.innerHTML})"));
    const art = await ev(`(async () => {
      const images=[document.querySelector('#crownsBalance img'),document.querySelector('.harvest-bonus-crowns img')];
      return Promise.all(images.map(async image=>{await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return{width:image.naturalWidth,height:image.naturalHeight,corner:ctx.getImageData(0,0,1,1).data[3],center:ctx.getImageData(canvas.width/2,canvas.height/2,1,1).data[3]};}));
    })()`);
    assert.deepEqual(art.map(a=>[a.width,a.height]),[[96,96],[192,192]]);
    assert(art.every(a=>a.corner===0&&a.center>240), "Runtime artwork must retain transparent edges and solid subject");
    const pickups = await ev(`(() => {
      return ['gold','troops','crowns'].map(type=>{state.harvestBonuses[0].type=type;renderHarvestBonuses();const e=document.querySelector('.harvest-bonus-node'),s=getComputedStyle(e),r=getComputedStyle(e,'::before'),i=getComputedStyle(e.querySelector('img'));return{type,width:s.width,height:s.height,radius:r.borderRadius,ring:r.borderColor,glow:r.backgroundImage,artWidth:i.width,artHeight:i.height};});
    })()`);
    assert.equal(new Set(pickups.map(p=>[p.width,p.height,p.radius,p.artWidth,p.artHeight].join('|'))).size,1,"All three pickups must share circle and art sizing");
    assert.equal(new Set(pickups.map(p=>p.ring)).size,3,"Crowns need their own purple ring, not the default Gold glow");
    assert.match(pickups[2].glow,/150, 94, 181/);
    for(const zoom of [.5,1,2.2]){
      await ev(`__CROWNLANDS_BENCHMARK__.setVisualZoom(${zoom})`);
      await ev("centerOnWorldPoint(state.harvestBonuses[0],getActiveMapRegionId());updateCameraTransform();renderCombatTimers()");
      const target=await ev("(()=>{const e=document.querySelector('.harvest-bonus-crowns'),r=e.getBoundingClientRect();return{width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()");
      assert(target.width>=44&&target.height>=44&&target.hit,"Crown pickup must retain a usable hit area at zoom "+zoom);
    }
    await ev("usesServerEconomyAuthority=()=>true");
    const point=await ev("(()=>{const r=document.querySelector('.harvest-bonus-crowns').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...point});
    await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...point});
    await ev("document.querySelector('.harvest-bonus-crowns').click()");
    assert.equal(await ev("crownsQA.claims"),1);
    assert(await ev("document.querySelector('.harvest-bonus-crowns').disabled"));
    assert.equal(await ev("document.getElementById('crownsBalance').title"),"1,234,567 Crowns","Pending collection must not grant locally");
    await ev("crownsQA.claim.reject(Error('Fixture collection failed'))");
    await wait("pendingHarvestBonusIds.size===0");
    assert(await ev("!!document.querySelector('.harvest-bonus-crowns:not(:disabled)')"));
    await ev("document.querySelector('.harvest-bonus-crowns').click();crownsQA.claim.resolve({cosmetics:{crowns:1234568,revision:2},reward:1})");
    await wait("pendingHarvestBonusIds.size===0");
    assert.equal(await ev("document.getElementById('crownsBalance').title"),"1,234,568 Crowns");
    assert.equal(await ev("document.querySelectorAll('.harvest-bonus-crowns').length"),0);
    assert.deepEqual(errors,[]); assert.deepEqual(failedAssets,[]);
    fs.writeFileSync(path.join(artifacts,"checks.json"),JSON.stringify({passed:true,records,art,pickups,errors,failedAssets},null,2));
    console.log("Crowns HUD passed: wallet loading/zero/updates, stale and account guards, exact amounts, collection failure/pending/success, matching pickup circles and desktop/landscape timer alignment.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
