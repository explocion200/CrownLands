"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/marauders");

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
    const wait = async expression => { for(let i=0;i<500;i++){ if(await ev(expression))return; if(errors.length)throw Error(JSON.stringify(errors)); await delay(100); } throw Error("Timeout: "+expression+" · "+JSON.stringify(await ev("({modal:modal.className,open:modal.open,text:modalBody.textContent.slice(0,500),uid:cosmeticUid})"))); };
    await client.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick"});
    await wait("document.documentElement?.dataset.crownlandsBenchmarkReady==='true'");

    await ev(`(() => {
      __CROWNLANDS_BENCHMARK__.closeModal();
      const now=Date.now(), qa=window.huntQA={uid:'hunt-fixture', purchases:[], sends:0, count:0};
      getCurrentOnlineUid=()=>qa.uid;
      const api={getStaminaState:async()=>({state:{version:1,value:70,recoveredAtMs:now,revision:1,paidDay:'',serverNowMs:now},crowns:120,walletRevision:1,huntingEnabled:true,offer:{version:1,price:30,stamina:70,staminaRevision:1,walletRevision:1,utcDay:CrownlandsMarauders.day(now)}}),subscribeStamina:callbacks=>{qa.callbacks=callbacks;return()=>{};},refillStamina:request=>{qa.purchases.push(request);return new Promise(resolve=>qa.resolve=resolve);}};
      qa.api=api; getOnlineApi=()=>api;
      CrownlandsStaminaUI.sync({uid:qa.uid,api,onWallet:()=>{}});
      onlineCombatAuthorization={uid:qa.uid,shieldExpiresAtMs:now+900000,retaliation:[{id:'hunt-retake',cityId:'fixture-city',cityName:'Thornford',regionId:getActiveMapRegionId(),status:'available',expiresAtMs:now+600000}]};renderCombatTimers();
      const enemies=[{id:'marauder_000000000000_00',spawnId:'fixture-spawn',worldId:ONLINE_WORLD_ID,resetGeneration:RESET_GENERATION,regionId:getActiveMapRegionId(),status:'active',targetType:'marauder',classification:'solo',level:1,name:'Marauder Lv. 1',x:state.cities[0].x+100,y:state.cities[0].y+100}];
      applyOnlineMarauders(enemies,getActiveMapRegionId()); qa.target=getMarauderById(enemies[0].id);
    })()`);
    await wait("CrownlandsStaminaUI.value()?.value===70");
    assert.equal(await ev("document.querySelector('[data-stamina-value]').textContent"),'70/100');
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(200);
      await ev('renderCombatTimers();updateMainCityReturnButton()');
      const hud=await ev(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};const card=document.getElementById('staminaButton');return{card:rect(card),currencies:rect(document.querySelector('.profile-currencies')),timers:rect(document.getElementById('combatTimers')),hit:card.contains(document.elementFromPoint(card.getBoundingClientRect().x+card.offsetWidth/2,card.getBoundingClientRect().y+card.offsetHeight/2))};})()`);
      assert(hud.card.height>=44&&hud.card.right<=width&&hud.hit,JSON.stringify(hud));
      assert(await ev("!!document.querySelector('#staminaButton .stamina-refill-icon') && document.getElementById('staminaButton').getAttribute('aria-label').includes('Refill stamina')"),'Refill icon has an accessible button label');
      assert(Math.abs(hud.card.y-hud.currencies.y)<2,'Stamina beside currencies');assert(hud.card.x>=hud.currencies.right,'No overlap');assert(hud.timers.y>=hud.card.bottom-2,'Timers below group');
      await ev("document.getElementById('staminaButton').focus();document.getElementById('staminaButton').click()");await wait("!!document.querySelector('.stamina-panel[open]')");
      assert.equal(await ev('huntQA.purchases.length'),0,'Opening never purchases');
      assert(!await ev("document.querySelector('.stamina-panel details').open"),'Recovery details start collapsed');
      assert.equal(await ev("document.querySelector('[data-refill-stamina]').textContent"),'70 → 100 · Restores 30');
      assert.equal(await ev("document.querySelector('[data-refill-crowns]').textContent"),'120 → 90');
      const panel=await ev("(()=>{const r=document.querySelector('.stamina-panel').getBoundingClientRect(), b=document.querySelector('[data-refill-buy]').getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,buyBottom:b.bottom};})()");
      assert(panel.top>=0&&panel.bottom<=height&&panel.left>=0&&panel.right<=width&&panel.buyBottom<=height,JSON.stringify(panel));
      const screen=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,`stamina-${width}x${height}.png`),Buffer.from(screen.data,'base64'));
      await ev("document.querySelector('[data-stamina-close]').click()");assert.equal(await ev('document.activeElement.id'),'staminaButton');records.push({width,height,hud,panel});
    }
    // Use the real order editor under the separate stamina dialog.
    await ev(`(()=>{const source=state.cities.find(c=>c.owner==='player');source.troops=10000;huntQA.source=source;
      selectedSourceId=source.id;selectedTargetId=huntQA.target.id;selectedTroopAmount=123;activeTroopOrderKind='attack';activeRallyOrderContext=null;
      huntQA.route={points:[{x:source.x,y:source.y,regionId:source.regionId},{x:huntQA.target.x,y:huntQA.target.y,regionId:huntQA.target.regionId}],pathLength:200,previewStatus:'authoritative',authoritativeDurationSeconds:60,authoritativeRequestedTroops:123};
      showTroopSliderModalWithRoute(source,huntQA.target,huntQA.route);
      document.querySelector('[data-open-stamina]').focus();})()`);
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await ev("document.querySelector('#modal [data-open-stamina]').focus()");
      assert(await ev("document.activeElement.matches('[data-open-stamina]')"), JSON.stringify(await ev("({active:document.activeElement.outerHTML,modal:modal.open,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id||d.className)})")));
      await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
      await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await wait("!!document.querySelector('.stamina-panel[open]')");
      await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await wait("!document.querySelector('.stamina-panel[open]')");
      assert(await ev("modal.open && document.activeElement.matches('[data-open-stamina]') && document.getElementById('troopExactAmount').value==='123'"));
    }
    await ev("document.querySelector('#modal [data-open-stamina]').click()");
    await wait("!document.querySelector('[data-refill-buy]').disabled");
    await ev("document.querySelector('[data-refill-buy]').click();document.querySelector('[data-refill-buy]').click()");assert.equal(await ev('huntQA.purchases.length'),1);
    await ev("huntQA.resolve({state:{version:1,value:100,recoveredAtMs:Date.now(),revision:2,paidDay:CrownlandsMarauders.day(Date.now())},crowns:90,walletRevision:2,receipt:{restored:30}})");
    await wait("document.querySelector('[data-refill-buy]').textContent==='Stamina full'");
    await ev("document.querySelector('[data-stamina-close]').click()");
    assert(await ev("modal.open && selectedSourceId===huntQA.source.id && selectedTargetId===huntQA.target.id && selectedTroopAmount===123 && document.getElementById('troopExactAmount').value==='123' && document.activeElement.matches('[data-open-stamina]') && !!document.getElementById('troopSliderConfirm')"),'Real attack draft preserved; explicit send remains');
    // A replacement in the same slot cannot silently become the target of this draft.
    await ev("getMarauderById(huntQA.target.id).spawnId='new-spawn';huntQA.launched=0;launchAttack=()=>{huntQA.launched++;return false;};confirmTroopSliderOrder()");
    assert.equal(await ev('huntQA.launched'),0);assert(await ev('modal.open'));
    await ev("getMarauderById(huntQA.target.id).spawnId='fixture-spawn';activeRallyOrderContext={rallyId:'preserved-rally'};document.querySelector('#modal [data-open-stamina]').click()");
    await wait("!!document.querySelector('.stamina-panel[open]')");await ev("document.querySelector('[data-stamina-close]').click()");
    assert.equal(await ev('activeRallyOrderContext.rallyId'),'preserved-rally');
    // Insufficient Crowns opens the real Shop, then restores the exact draft nodes.
    await ev(`(()=>{const qa=huntQA;qa.crowns=0;qa.walletRevision=3;qa.shopEnabled=true;qa.shopMode='live';qa.catalogReads=0;qa.checkoutCalls=0;
      qa.stamina={version:1,value:9,recoveredAtMs:Date.now(),revision:3,paidDay:''};qa.callbacks.onState(qa.stamina);
      qa.api.getStaminaState=async()=>({state:{...qa.stamina,serverNowMs:Date.now()},crowns:qa.crowns,walletRevision:qa.walletRevision,huntingEnabled:true,offer:{version:1,price:30,stamina:9,staminaRevision:3,walletRevision:qa.walletRevision,utcDay:CrownlandsMarauders.day(Date.now())}});
      qa.api.getLiveCrownPaymentCatalog=async()=>{qa.catalogReads++;if(qa.catalogFailure)throw Error('Unavailable');return{enabled:qa.shopEnabled,mode:qa.shopMode,packs:[{id:'fixture',crowns:1000,amountMinor:499,currency:'usd'}]};};
      qa.api.getCrownPaymentCatalog=async()=>({enabled:false,mode:'test',packs:[]});qa.api.createLiveCrownCheckout=async()=>{qa.checkoutCalls++;throw Error('No checkout should be created by navigation');};
      cosmeticUid=qa.uid;cosmeticState=COSMETIC_CATALOG.normalize({crowns:qa.crowns,revision:qa.walletRevision});CrownlandsCrownPaymentsUI.reset(null);
      qa.input=document.getElementById('troopExactAmount');qa.beforePurchases=qa.purchases.length;
    })()`);
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await ev("huntQA.crowns=0;huntQA.walletRevision++;cosmeticState=COSMETIC_CATALOG.normalize({crowns:0,revision:huntQA.walletRevision});document.querySelector('#modal [data-open-stamina]').click()");
      await wait("document.querySelector('[data-refill-buy]').textContent==='Buy Crowns' && !document.querySelector('[data-refill-buy]').disabled");
      assert(await ev("document.querySelector('[data-stamina-feedback]').textContent.includes('30 Crowns')"));
      fs.writeFileSync(path.join(artifacts,`stamina-buy-crowns-${width}x${height}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await ev("document.querySelector('[data-refill-buy]').click()");
      await wait("modal.classList.contains('shop-modal') && !!document.querySelector('[data-crown-checkout]')");
      assert.equal(await ev("document.querySelector('[data-rs-section=crowns]').getAttribute('aria-selected')"),'true');
      assert(!await ev('huntQA.input.isConnected'),'Draft is suspended, not overwritten');
      assert.equal(await ev('huntQA.checkoutCalls'),0,'Navigation never starts a Crown purchase');
      await ev("huntQA.crowns=30;huntQA.walletRevision++;cosmeticState=COSMETIC_CATALOG.normalize({crowns:30,revision:huntQA.walletRevision});document.getElementById('closeModalBtn').click()");
      await wait("!!document.querySelector('.stamina-panel[open]') && document.querySelector('[data-refill-buy]').textContent==='Refill to 100 — 30 Crowns' && !document.querySelector('[data-refill-buy]').disabled");
      assert(await ev("huntQA.input===document.getElementById('troopExactAmount') && huntQA.input.value==='123' && selectedSourceId===huntQA.source.id && selectedTargetId===huntQA.target.id && activeRallyOrderContext.rallyId==='preserved-rally'"),'Shop return preserves source, target, troops, rally and input handlers');
      assert.equal(await ev('huntQA.purchases.length'),await ev('huntQA.beforePurchases'),'Crown credit never automatically refills');
      await ev("document.querySelector('[data-stamina-close]').click()");
      assert(await ev("modal.open && document.activeElement.matches('[data-open-stamina]')"),'Return focus to the hunt draft');
    }
    for(const [mode,enabled,failure] of [['live',false,false],['test',true,false],['live',true,true]]){
      await ev(`huntQA.crowns=29;huntQA.walletRevision++;cosmeticState=COSMETIC_CATALOG.normalize({crowns:29,revision:huntQA.walletRevision});huntQA.shopMode=${JSON.stringify(mode)};huntQA.shopEnabled=${enabled};huntQA.catalogFailure=${failure};document.querySelector('#modal [data-open-stamina]').click()`);
      await wait("document.querySelector('[data-stamina-feedback]').textContent.includes('Crown purchases are currently unavailable.')");
      assert(await ev("document.querySelector('[data-refill-buy]').disabled"),'Disabled, test-only or unavailable checkout cannot route to paid Crowns');
      assert(!await ev("modal.classList.contains('shop-modal')"));await ev("document.querySelector('[data-stamina-close]').click()");
    }
    await ev("huntQA.shopMode='live';huntQA.shopEnabled=true;huntQA.catalogFailure=false;document.querySelector('#modal [data-open-stamina]').click()");
    await wait("document.querySelector('[data-refill-buy]').textContent==='Buy Crowns'");
    await ev("huntQA.loadShop=ensureOptionalUiScripts;ensureOptionalUiScripts=(names,host,ready)=>{huntQA.shopReady=ready;return false;};document.querySelector('[data-refill-buy]').click();document.querySelector('[data-stamina-close]').click();huntQA.shopReady();ensureOptionalUiScripts=huntQA.loadShop");
    assert(await ev("modal.open && !modal.classList.contains('shop-modal') && !document.querySelector('.stamina-panel[open]') && huntQA.input===document.getElementById('troopExactAmount')"),'Late Shop load cannot reopen a canceled review');
    await ev("modal.close();huntQA.callbacks.onState({version:1,value:9,recoveredAtMs:Date.now(),revision:3,paidDay:''})");assert.equal(await ev("document.querySelector('[data-stamina-low]').hidden"),false);
    await ev("showNearbyMarauders()");assert.equal(await ev("document.querySelectorAll('[data-enemy-id]').length"),1);
    await ev("document.querySelector('[data-enemy-id]').click()");assert(await ev("modalBody.textContent.includes('Scout this spawn')"));assert(!await ev("modalBody.textContent.includes('Scouted defenders:')"));
    await ev(`(()=>{const now=Date.now();mergeServerScoutReport({type:'scout',cityId:huntQA.target.id,targetType:'marauder',targetSpawnId:'fixture-spawn',scoutReport:{targetType:'marauder',targetSpawnId:'fixture-spawn',troops:87,totalDefense:87,regionId:huntQA.target.regionId,scoutedAtMs:now,expiresAtMs:now+600000}});openMarauderDetails(huntQA.target.id);})()`);
    assert(await ev("modalBody.textContent.includes('Scouted defenders:')"));
    assert.equal(await ev('getScoutReportForTarget(huntQA.target).troops'),87);
    assert(await ev("renderMarauderScoutReport({report:getScoutReportForTarget(huntQA.target),city:huntQA.target,age:0,remaining:600}).includes('1 defense per defender')"));
    assert(await ev("renderMarauderBattleReport({cityName:'Marauder',marauderLevel:1,regionId:huntQA.target.regionId,outcome:'victory',summary:'Victory',sentTroops:200,attackerLosses:30,survivors:170,defendersLeft:0,goldAwarded:100,xpAwarded:20,itemAwarded:'recall_horn'}).includes('Added to your Bag')"));
    await ev("state.battleReports=[{id:'npc-scout-report',uid:huntQA.uid,type:'scout',outcome:'scout',cityId:huntQA.target.id,cityName:huntQA.target.name,regionId:huntQA.target.regionId,targetType:'marauder',targetSpawnId:'fixture-spawn',summary:'Scout revealed 87 defenders.',occurredAtMs:Date.now(),scoutReport:getScoutReportForTarget(huntQA.target)}];showBattleReportDetail('npc-scout-report')");
    await ev("updateScoutReportLifecycle(Date.now()+1000)");
    assert(await ev("modal.open && modal.classList.contains('scout-report-ledger') && !!document.querySelector('[data-scout-close]') && !!document.getElementById('battleReportBackBtn')"),'Actual NPC report uses navigation and expiry shell');
    await ev("CrownlandsScoutReportUI.updateTiming(modalBody,20)");assert(await ev("document.querySelector('.expiry').classList.contains('urgent')"));
    await ev("document.querySelector('[data-scout-close]').click()");
    assert(!await ev('modal.open'));
    await ev("bossReadiness.set('rally-fixture',{checkedAtMs:Date.now(),participants:[{uid:'ally',ready:false}],combatForecast:{status:'unavailable'}})");
    assert(await ev("renderBossReadiness({id:'rally-fixture',participants:[{uid:'ally',ownerName:'Ally'}]}).includes('Ally: Needs stamina')"));
    await ev("modal.close();document.getElementById('staminaButton').click()");
    await wait("document.querySelector('[data-refill-buy]').textContent==='Buy Crowns'");await ev("document.querySelector('[data-refill-buy]').click()");
    await wait("modal.open && modal.classList.contains('shop-modal')");
    await ev("CrownlandsStaminaUI.sync({uid:'',api:huntQA.api})");assert.equal(await ev("document.querySelector('[data-stamina-value]').textContent"),'—/100');
    assert(!await ev("modal.open || !!document.querySelector('.stamina-panel[open]')"),'Sign-out discards the suspended view');
    assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
    fs.writeFileSync(path.join(artifacts,'checks.json'),JSON.stringify({passed:true,records,errors,failedAssets},null,2));console.log('Marauder/stamina UI passed: desktop and both landscape sizes, panel bounds, exact review, duplicate clicks, focus, preserved drafts, explicit sending, private intel, search, low/unknown states.');
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
