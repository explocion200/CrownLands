"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/marauders");

async function main(built = false) {
  const executable = [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "Chromium required"); fs.mkdirSync(artifacts,{recursive:true});
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client; const errors = [], failedAssets = [], records = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    if(built){
      for(const kind of ['solo','boss']) {
        const file=`assets/marauders/${kind}-defeated-v1.webp`;
        assert(fs.readFileSync(path.resolve(__dirname,'../dist',file)).equals(fs.readFileSync(path.resolve(__dirname,'..',file))),'Built defeated artwork is stale');
      }
      const delivered={};
      for(const file of ['marauders-ui.js','marauders-ui.css','city-details-ui.js','city-details-ui.css','scout-report-ui.js','scout-report-ui.css']){
        delivered[file]=fs.readFileSync(path.resolve(__dirname,'../dist',file),'utf8');
        const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n');
        assert.equal(delivered[file].replace(/\r\n/g,'\n'),file==='marauders-ui.js'?require('./estate-delivery').minifyEstate(source):source,'Built NPC Info asset is stale: '+file);
      }
      client.on('Fetch.requestPaused',event=>{
        const file=new URL(event.request.url).pathname.split('/').at(-1);
        client.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,
          responseHeaders:[{name:'Content-Type',value:file.endsWith('.css')?'text/css':'text/javascript'}],
          body:Buffer.from(delivered[file]).toString('base64')}).catch(error=>errors.push(error.message));
      });
      await client.send('Fetch.enable',{patterns:Object.keys(delivered).map(file=>({urlPattern:'*'+file+'*'}))});
    }
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    client.on("Network.responseReceived", e => { if (e.response.status >= 400 && ["Image","Stylesheet","Script"].includes(e.type)) failedAssets.push(e.response.url); });
    const ev = async expression => {
      const r = await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
      if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value;
    };
    const wait = async expression => { for(let i=0;i<500;i++){ if(await ev(expression))return; if(errors.length)throw Error(JSON.stringify(errors)); await delay(100); } throw Error("Timeout: "+expression+" · "+JSON.stringify(await ev("({modal:modal.className,open:modal.open,text:modalBody.textContent.slice(0,500),uid:cosmeticUid})"))); };
    const checkInfo=async(classification,width,height)=>{
      await wait("modalBody.querySelector('.marauder-portrait')?.complete");
      await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await ev('Promise.all(modal.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');
      assert(await ev('modal.open'),'NPC Info must remain open after painting');
      const info=await ev(`(()=>{
        const ledger=modalBody.querySelector('.cd-ledger'),actions=modalBody.querySelector('.cd-actions');ledger.scrollTop=0;
        const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
        const art=modalBody.querySelector('.marauder-portrait'),close=document.getElementById('closeModalBtn');
        return {dialog:rect(modal),body:rect(modalBody),portrait:rect(art),artLoaded:art.naturalWidth>0,
          art:art.getAttribute('src'),scrollable:ledger.scrollHeight>ledger.clientHeight,
          cityFrame:!!modalBody.querySelector('.cd-panel[data-npc-info] .cd-portrait'),
          paper:getComputedStyle(modal).backgroundColor,titleFont:getComputedStyle(modalTitle).fontFamily,
          columns:getComputedStyle(modalBody.querySelector('.cd-panel')).gridTemplateColumns.split(' ').length,
          actionScroll:getComputedStyle(actions).overflowY,ledgerScroll:getComputedStyle(ledger).overflowY,
          fakeCityControls:!!modalBody.querySelector('[data-city-upgrade-mode],#enterInnerCastleBtn,.player-name-link,[data-live-city-garrison]'),
          close:rect(close),closeHit:close.contains(document.elementFromPoint(close.getBoundingClientRect().x+close.offsetWidth/2,close.getBoundingClientRect().y+close.offsetHeight/2)),
          privateIntel:modalBody.textContent.includes('Scout this spawn')&&!modalBody.textContent.includes('Scouted defenders:'),
          horizontalOverflow:ledger.scrollWidth>ledger.clientWidth+1||actions.scrollWidth>actions.clientWidth+1};
      })()`);
      assert(info.artLoaded&&info.art.includes(classification==='boss'?'boss-v1':'solo-v1'));
      assert(info.privateIntel&&!info.horizontalOverflow,JSON.stringify(info));
      assert(info.cityFrame&&info.columns===2&&!info.fakeCityControls,JSON.stringify(info));
      assert.equal(info.paper,'rgb(242, 232, 205)');
      assert.equal(Math.round(info.dialog.width),Math.min(1040,width-24),'NPC Info matches City Details width');
      assert.equal(Math.round(info.dialog.height),Math.min(790,height-24),'NPC Info matches City Details height');
      assert.equal(info.actionScroll,'auto');assert.equal(info.ledgerScroll,'auto');
      assert(info.dialog.left>=0&&info.dialog.right<=width+1&&info.dialog.top>=0&&info.dialog.bottom<=height+1,JSON.stringify(info));
      assert(info.closeHit&&info.close.bottom<=height&&info.portrait.width<=140&&info.portrait.height<=140,JSON.stringify(info));
      for(const action of ['scout','attack']){
        const button=await ev(`(()=>{
          const b=modalBody.querySelector('[data-npc-action="${action}"]');b.focus();
          const r=b.getBoundingClientRect(),body=b.closest('.cd-actions').getBoundingClientRect(),decoration=getComputedStyle(b,'::before');
          return {width:r.width,height:r.height,label:b.textContent.trim(),focus:document.activeElement===b,
            visible:r.top>=body.top-1&&r.bottom<=body.bottom+1,
            hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),
            decoration:decoration.content!=='none'&&decoration.display!=='none',
            decorationWidth:parseFloat(decoration.width),decorationHeight:parseFloat(decoration.height)};
        })()`);
        assert(!button.decoration||(button.decorationWidth<=button.width&&button.decorationHeight<=button.height),'NPC Info button decoration covers the dialog: '+JSON.stringify(button));
        assert(button.height>=44&&button.visible&&button.hit&&button.focus,JSON.stringify(button));
        assert.equal(button.label,action==='scout'?'Scout':classification==='boss'?'Prepare rally':'Attack');
      }
      const isolation=await ev(`(()=>{const ledger=modalBody.querySelector('.cd-ledger'),actions=modalBody.querySelector('.cd-actions');
        const before=actions.scrollTop;ledger.scrollTop=99999;const independent=actions.scrollTop===before;ledger.scrollTop=0;actions.scrollTop=0;return independent;})()`);
      assert(isolation,'NPC ledger scroll must preserve the action column');
      await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await ev('Promise.all(modal.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');
      assert.equal(await ev("getComputedStyle(modal.querySelector('.modal-card')).opacity"),'1','NPC Info must be fully painted');
      fs.writeFileSync(path.join(artifacts,`npc-info-${classification}-${width}x${height}${built?'-built':''}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      assert(await ev('modal.open'),'NPC Info closed during screenshot capture');
      const sameStyle=await ev(`(()=>{
        const signature=()=>[modal,modalTitle,modalBody].map(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),s.backgroundColor,s.color,s.fontFamily,s.fontSize];});
        const npc=signature();modal.close();const city=state.cities.find(c=>c.owner==='player'&&!isStronghold(c));showCityInfoModal(city.id);
        const regular=signature();modal.close();return JSON.stringify(npc)===JSON.stringify(regular);
      })()`);
      assert(sameStyle,'NPC and regular-city Info must use the same window and typography');
      records.push({kind:'npcInfo',classification,width,height,built,...info});
    };
    await client.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick"});
    await wait("document.documentElement?.dataset.crownlandsBenchmarkReady==='true'");

    await ev(`(() => {
      __CROWNLANDS_BENCHMARK__.closeModal();
      const now=Date.now(), qa=window.huntQA={uid:'hunt-fixture', purchases:[], sends:0, count:0};
      getCurrentOnlineUid=()=>qa.uid;
      const api={getStaminaState:async()=>({state:{version:1,value:70,recoveredAtMs:now,revision:1,paidDay:'',serverNowMs:now},crowns:120,walletRevision:1,huntingEnabled:true,offer:{version:2,price:9,stamina:70,staminaRevision:1,walletRevision:1,utcDay:CrownlandsMarauders.day(now)}}),subscribeStamina:callbacks=>{qa.callbacks=callbacks;return()=>{};},refillStamina:request=>{qa.purchases.push(request);return new Promise(resolve=>qa.resolve=resolve);}};
      qa.api=api; getOnlineApi=()=>api;
      CrownlandsStaminaUI.sync({uid:qa.uid,api,onWallet:()=>{}});
      onlineCombatAuthorization={uid:qa.uid,shieldExpiresAtMs:now+900000,retaliation:[{id:'hunt-retake',cityId:'fixture-city',cityName:'Thornford',regionId:getActiveMapRegionId(),status:'available',expiresAtMs:now+600000}]};renderCombatTimers();
      const enemies=[{id:'marauder_000000000000_00',spawnId:'fixture-spawn',worldId:ONLINE_WORLD_ID,resetGeneration:RESET_GENERATION,regionId:getActiveMapRegionId(),status:'active',targetType:'marauder',classification:'solo',level:1,name:'Marauder Lv. 1',x:state.cities[0].x+100,y:state.cities[0].y+100}];
      applyOnlineMarauders(enemies,getActiveMapRegionId()); qa.target=getMarauderById(enemies[0].id);
    })()`);
    await wait("CrownlandsStaminaUI.value()?.value===70");
    assert.equal(await ev("document.querySelector('[data-stamina-value]').textContent"),'70/100');
    await ev(`(() => {
      const bounds=getActiveMapBounds(),solo=huntQA.visualSolo={...huntQA.target,x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
      huntQA.visualBoss={...solo,id:'boss-size-fixture',spawnId:'boss-size-spawn',classification:'boss',level:90,name:'Clan Boss Lv. 90',x:solo.x+200};
      centerOnWorldPoint(solo);applyOnlineMarauders([solo,huntQA.visualBoss],getActiveMapRegionId());
    })()`);
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await ev('centerOnWorldPoint(huntQA.visualSolo);renderCities(true)');
      const sizes=await ev(`(() => {const solo=document.querySelector('[data-marauder-id="'+huntQA.target.id+'"]'),boss=document.querySelector('[data-marauder-id="boss-size-fixture"]');return{solo:{width:getComputedStyle(solo).width,height:getComputedStyle(solo).height,aria:solo.getAttribute('aria-label')},boss:{width:getComputedStyle(boss).width,height:getComputedStyle(boss).height,aria:boss.getAttribute('aria-label'),classified:boss.classList.contains('marauder-node-boss')}}})()`);
      assert.equal(sizes.solo.width,'90px');assert.equal(sizes.solo.height,'90px');
      assert.equal(sizes.boss.width,'115px');assert.equal(sizes.boss.height,'115px');assert(sizes.boss.classified);
      assert(sizes.solo.aria.includes('Marauder')&&sizes.boss.aria.includes('Boss'));
      fs.writeFileSync(path.join(artifacts,`npc-sizes-${width}x${height}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    }
    // Defeated sprites reuse the exact living marker box/anchor and authoritative deadline.
    await ev(`(()=>{const qa=huntQA;qa.now=Date.now();qa.clock=qa.api.getServerNowMs;qa.api.getServerNowMs=()=>qa.now;
      qa.wakes=[];qa.api.isSignedIn=()=>true;qa.api.refreshMarauderRespawn=async request=>{qa.wakes.push(request);throw Error('Offline fixture');};
      selectMarauder(qa.visualSolo.id);qa.dead=[{...qa.visualSolo,status:'defeated',respawnAtMs:qa.now+119000},{...qa.visualBoss,status:'defeated',respawnAtMs:qa.now+1799000}];
      applyOnlineMarauders(qa.dead,getActiveMapRegionId());})()`);
    assert(!await ev("!!getMarauderById(huntQA.visualSolo.id)||!!document.querySelector('[data-marauder-spawn-id]')"),'Defeat removes target actions');
    assert.equal(await ev('currentMarauders().length'),0);
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await ev('centerOnWorldPoint(huntQA.visualSolo);renderCities(true);renderCombatTimers()');
      await wait("[...document.querySelectorAll('.marauder-node img')].every(img=>img.complete&&img.naturalWidth===384)");
      const remains=await ev(`[...document.querySelectorAll('.marauder-node')].map(node=>({width:getComputedStyle(node).width,height:getComputedStyle(node).height,
        transform:getComputedStyle(node).transform,opacity:getComputedStyle(node).opacity,background:getComputedStyle(node).backgroundColor,backgroundImage:getComputedStyle(node).backgroundImage,disabled:node.disabled,art:node.querySelector('img').getAttribute('src'),
        label:node.querySelector('[data-npc-respawn]').textContent,aria:node.getAttribute('aria-label'),x:node.style.left,y:node.style.top}))`);
      assert.equal(remains.length,2);
      for(const [i,kind,size,timer] of [[0,'solo','90px','Respawn 1:59'],[1,'boss','115px','Respawn 29:59']]){
        assert.equal(remains[i].width,size);assert.equal(remains[i].height,size);assert.equal(remains[i].opacity,'1');
        assert(remains[i].disabled&&remains[i].art.includes(kind+'-defeated-v1'));
        assert.equal(remains[i].label,timer);assert(remains[i].aria.includes('Defeated'));
        assert.equal(remains[i].background,'rgba(0, 0, 0, 0)','Defeated map artwork must retain a transparent backing: '+JSON.stringify(remains[i]));
        assert.equal(remains[i].backgroundImage,'none');
      }
      await ev("document.querySelector('.marauder-node').click();showNearbyMarauders()");
      assert(!await ev("!!document.querySelector('[data-enemy-id]')||!!document.querySelector('[data-marauder-spawn-id]')"));
      await ev('modal.close()');
      fs.writeFileSync(path.join(artifacts,`npc-defeated-${width}x${height}${built?'-built':''}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      records.push({kind:'defeatedNpc',width,height,built,remains});
    }
    await ev('huntQA.now+=1000;renderCombatTimers()');
    assert.equal(await ev("document.querySelector('[data-npc-respawn]').textContent"),'Respawn 1:58');
    await ev('huntQA.now+=1798000;renderCombatTimers();renderCombatTimers();applyOnlineMarauders(huntQA.dead,getActiveMapRegionId());renderCombatTimers()');
    assert.equal(await ev('huntQA.wakes.length'),2,'One deadline request per spawn, even after repeat snapshots and failed responses');
    assert(await ev("[...document.querySelectorAll('[data-npc-respawn]')].every(n=>n.textContent==='Awaiting respawn')"),'No local replacement or disappearing remains while placement waits');
    await ev("huntQA.uid='different-account';renderCities(true);renderCombatTimers()");
    assert.equal(await ev("document.querySelectorAll('.marauder-node').length"),0,'No remains from an old account');
    await ev("huntQA.uid='hunt-fixture';applyOnlineMarauders([{...huntQA.visualSolo,spawnId:'respawned',x:huntQA.visualSolo.x+140},huntQA.visualBoss],getActiveMapRegionId())");
    assert.equal(await ev("document.querySelectorAll('.marauder-node-defeated,[data-npc-respawn]').length"),0);
    assert(await ev("document.querySelector('[data-spawn-id=respawned] img').getAttribute('src').includes('solo-v1') && !document.querySelector('[data-spawn-id=respawned]').disabled"));
    assert(await ev("document.querySelector('[data-spawn-id=respawned]').style.left===worldToMapPoint({...huntQA.visualSolo,x:huntQA.visualSolo.x+140}).x+'px'"),'Replacement moves to its new server position');
    await ev("applyOnlineMarauders(huntQA.dead.map(row=>({...row,status:'retired'})),getActiveMapRegionId())");
    assert.equal(await ev("document.querySelectorAll('.marauder-node').length"),0,'Retired targets leave no permanent remains');
    await ev('huntQA.api.getServerNowMs=huntQA.clock;applyOnlineMarauders([huntQA.visualSolo,huntQA.visualBoss],getActiveMapRegionId())');
    // NPC selection uses the actual foreign-city wheel, including keyboard Info.
    await ev(`huntQA.source=state.cities.find(c=>c.owner==='player');huntQA.source.troops=10000;rememberOwnedAttackSource(huntQA.source)`);
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await ev(`modal.close();sendMode=false;centerOnWorldPoint(huntQA.visualSolo);document.querySelector('[data-marauder-id="'+huntQA.target.id+'"]').click()`);
      await wait("!!document.querySelector('.foreign-city-action-wheel[data-marauder-spawn-id=fixture-spawn]')");
      await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert(!await ev('modal.open'),'Selecting a map NPC opens controls, not details or an order');
      const wheel=await ev(`(()=>{const w=document.querySelector('[data-marauder-spawn-id=fixture-spawn]');return [...w.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{label:b.getAttribute('aria-label'),icon:!!b.querySelector('.wheel-icon svg'),left:r.left,right:r.right,top:r.top,bottom:r.bottom,hit:b.contains(hit),hitElement:hit?.outerHTML.slice(0,250)};});})()`);
      fs.writeFileSync(path.join(artifacts,`npc-controls-${width}x${height}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      assert.equal(wheel.length,3);assert(wheel.every(b=>b.icon&&b.left>=0&&b.right<=width&&b.top>=0&&b.bottom<=height&&b.hit),JSON.stringify(wheel));
      assert(await ev("isMapNodeInteractionTarget(document.querySelector('.marauder-node')) && isMapCommandInteractionTarget(document.querySelector('[data-marauder-spawn-id] .wheel-info'))"));
      await ev("document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-info').focus()");
      await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
      await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      assert(await ev("modal.open && modal.classList.contains('marauder-modal') && modalBody.textContent.includes('Scout this spawn')"));
      await checkInfo('solo',width,height);
      await ev("document.getElementById('closeModalBtn').click()");assert(!await ev('modal.open'));
      await ev("openMarauderDetails('boss-size-fixture')");await checkInfo('boss',width,height);
      await ev('modal.close()');records.push({kind:'npcControls',width,height,wheel});
    }
    // Pending scouts cannot be duplicated, and a changed spawn cancels the route.
    await ev(`(()=>{const qa=huntQA;qa.preferred=findPreferredAttackSource;qa.routeRequest=requestAuthoritativeOrderRoute;qa.scoutLaunch=launchScoutMission;
      findPreferredAttackSource=()=>({city:qa.source});qa.scoutCalls=0;qa.routes=0;qa.notices=[];qa.reject=rejectGameAction;rejectGameAction=m=>qa.notices.push(m);
      requestAuthoritativeOrderRoute=()=>{qa.routes++;return new Promise(resolve=>qa.resolveScoutRoute=resolve);};launchScoutMission=()=>{qa.scoutCalls++;return null;};
      document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-scout').click();document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-scout').click();})()`);
    assert.equal(await ev('huntQA.routes'),1);assert(await ev("document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-scout').disabled && document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-scout').getAttribute('aria-busy')==='true'"));
    await ev("applyOnlineMarauders([{...huntQA.visualSolo,spawnId:'replacement'},huntQA.visualBoss],getActiveMapRegionId());huntQA.resolveScoutRoute({points:[huntQA.source,huntQA.target]})");
    await wait('!pendingDirectScoutTargets.has(huntQA.target.id)');assert.equal(await ev('huntQA.scoutCalls'),0);
    assert(await ev("huntQA.notices.some(m=>m.includes('spawn has changed'))"));
    await ev("applyOnlineMarauders([{...huntQA.visualSolo,spawnId:'replacement'},huntQA.visualBoss],getActiveMapRegionId())");
    assert(!await ev("!!document.querySelector('[data-marauder-spawn-id]')"),'Replacement must be selected explicitly');
    await ev(`applyOnlineMarauders([huntQA.visualSolo,huntQA.visualBoss],getActiveMapRegionId());selectMarauder(huntQA.target.id);huntQA.notices=[];
      document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-scout').click();huntQA.resolveScoutRoute({points:[huntQA.source,huntQA.target]})`);
    await wait('!pendingDirectScoutTargets.has(huntQA.target.id)');assert.equal(await ev('huntQA.scoutCalls'),1);
    // Travelling and completed scout states share the city's labels and Report.
    await ev(`huntQA.pendingScout=getPendingScoutMission;getPendingScoutMission=id=>id===huntQA.target.id?{id:'fixture-mission'}:null;refreshScoutActionWheels([huntQA.target.id])`);
    assert(await ev("document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-scout').disabled && document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-action-name').textContent==='Scouting'"));
    await ev(`getPendingScoutMission=huntQA.pendingScout;const now=Date.now();mergeServerScoutReport({type:'scout',cityId:huntQA.target.id,targetType:'marauder',targetSpawnId:'fixture-spawn',scoutReport:{targetType:'marauder',targetSpawnId:'fixture-spawn',troops:87,totalDefense:87,regionId:huntQA.target.regionId,scoutedAtMs:now,expiresAtMs:now+600000}});refreshScoutActionWheels([huntQA.target.id])`);
    assert(await ev("document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-action-name').textContent==='Rescout' && !!document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-report')"));
    await ev("document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-report').click()");assert(await ev("modal.open && modal.classList.contains('scout-report-ledger')"));
    await ev(`modal.close();delete state.scoutReports['fixture-spawn'];refreshScoutActionWheels([huntQA.target.id]);huntQA.slider=showTroopSliderModalAsync;huntQA.orders=[];showTroopSliderModalAsync=async(source,target,options={})=>huntQA.orders.push({source:source.id,target:target.id,spawn:target.spawnId,kind:options.orderKind||'attack'});document.querySelector('[data-marauder-spawn-id=fixture-spawn] .wheel-attack').click()`);
    await wait('huntQA.orders.length===1');assert.equal(await ev('huntQA.orders[0].kind'),'attack');assert.equal(await ev('huntQA.orders[0].spawn'),'fixture-spawn');
    // Boss Attack is available only to rally creators and invokes real rally preparation.
    await ev(`huntQA.authority=usesServerArmyAuthority;huntQA.canRally=canCurrentPlayerCreateClanRally;huntQA.lastSource=findLastSelectedAttackSource;huntQA.clan=state.clanId;
      usesServerArmyAuthority=()=>true;canCurrentPlayerCreateClanRally=()=>false;findLastSelectedAttackSource=()=>({city:huntQA.source});state.clanId='fixture-clan';huntQA.api.createClanRally=()=>{throw Error('Preparation must not create a rally');};huntQA.api.isSignedIn=()=>true;selectMarauder('boss-size-fixture')`);
    assert(await ev("document.querySelector('[data-marauder-spawn-id=boss-size-spawn] .wheel-attack').disabled"));
    await ev("canCurrentPlayerCreateClanRally=()=>true;renderCities(true);document.querySelector('[data-marauder-spawn-id=boss-size-spawn] .wheel-attack').click()");
    await wait('huntQA.orders.length===2');assert.equal(await ev('huntQA.orders[1].kind'),'rally_create');assert.equal(await ev('activeRallyOrderContext.target.spawnId'),'boss-size-spawn');
    await ev(`findPreferredAttackSource=huntQA.preferred;requestAuthoritativeOrderRoute=huntQA.routeRequest;launchScoutMission=huntQA.scoutLaunch;rejectGameAction=huntQA.reject;
      showTroopSliderModalAsync=huntQA.slider;usesServerArmyAuthority=huntQA.authority;canCurrentPlayerCreateClanRally=huntQA.canRally;findLastSelectedAttackSource=huntQA.lastSource;state.clanId=huntQA.clan;
      sendMode=false;activeRallyOrderContext=null;applyOnlineMarauders([huntQA.target],getActiveMapRegionId())`);
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
      assert.equal(await ev("document.querySelector('[data-refill-crowns]').textContent"),'120 → 111');
      assert.equal(await ev("document.querySelector('[data-refill-buy]').textContent"),'Refill to 100 — 9 Crowns');
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
    await ev("huntQA.resolve({state:{version:1,value:100,recoveredAtMs:Date.now(),revision:2,paidDay:CrownlandsMarauders.day(Date.now())},crowns:111,walletRevision:2,receipt:{restored:30,price:9}})");
    await wait("document.querySelector('[data-refill-buy]').textContent==='Stamina full'");
    assert(await ev("document.querySelector('[data-stamina-feedback]').textContent.includes('30 stamina restored for 9 Crowns')"),'Confirmation uses the receipt charge');
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
      qa.api.getStaminaState=async()=>({state:{...qa.stamina,serverNowMs:Date.now()},crowns:qa.crowns,walletRevision:qa.walletRevision,huntingEnabled:true,offer:{version:2,price:Math.ceil((100-qa.stamina.value)*3/10),stamina:qa.stamina.value,staminaRevision:qa.stamina.revision,walletRevision:qa.walletRevision,utcDay:CrownlandsMarauders.day(Date.now())}});
      qa.api.getLiveCrownPaymentCatalog=async()=>{qa.catalogReads++;if(qa.catalogFailure)throw Error('Unavailable');return{enabled:qa.shopEnabled,mode:qa.shopMode,packs:[{id:'fixture',crowns:1000,amountMinor:499,currency:'usd'}]};};
      qa.api.getCrownPaymentCatalog=async()=>({enabled:false,mode:'test',packs:[]});qa.api.createLiveCrownCheckout=async()=>{qa.checkoutCalls++;throw Error('No checkout should be created by navigation');};
      cosmeticUid=qa.uid;cosmeticState=COSMETIC_CATALOG.normalize({crowns:qa.crowns,revision:qa.walletRevision});CrownlandsCrownPaymentsUI.reset(null);
      qa.input=document.getElementById('troopExactAmount');qa.beforePurchases=qa.purchases.length;
    })()`);
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await ev("huntQA.crowns=0;huntQA.walletRevision++;cosmeticState=COSMETIC_CATALOG.normalize({crowns:0,revision:huntQA.walletRevision});document.querySelector('#modal [data-open-stamina]').click()");
      await wait("document.querySelector('[data-refill-buy]').textContent==='Buy Crowns' && !document.querySelector('[data-refill-buy]').disabled");
      assert(await ev("document.querySelector('[data-stamina-feedback]').textContent.includes('28 Crowns')"));
      fs.writeFileSync(path.join(artifacts,`stamina-buy-crowns-${width}x${height}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await ev("document.querySelector('[data-refill-buy]').click()");
      await wait("modal.classList.contains('shop-modal') && !!document.querySelector('[data-crown-checkout]')");
      assert.equal(await ev("document.querySelector('[data-rs-section=crowns]').getAttribute('aria-selected')"),'true');
      assert(!await ev('huntQA.input.isConnected'),'Draft is suspended, not overwritten');
      assert.equal(await ev('huntQA.checkoutCalls'),0,'Navigation never starts a Crown purchase');
      await ev("huntQA.crowns=28;huntQA.walletRevision++;cosmeticState=COSMETIC_CATALOG.normalize({crowns:28,revision:huntQA.walletRevision});document.getElementById('closeModalBtn').click()");
      await wait("!!document.querySelector('.stamina-panel[open]') && document.querySelector('[data-refill-buy]').textContent==='Refill to 100 — 28 Crowns' && !document.querySelector('[data-refill-buy]').disabled");
      assert(await ev("huntQA.input===document.getElementById('troopExactAmount') && huntQA.input.value==='123' && selectedSourceId===huntQA.source.id && selectedTargetId===huntQA.target.id && activeRallyOrderContext.rallyId==='preserved-rally'"),'Shop return preserves source, target, troops, rally and input handlers');
      assert.equal(await ev('huntQA.purchases.length'),await ev('huntQA.beforePurchases'),'Crown credit never automatically refills');
      const immediateFocus = await ev("document.querySelector('[data-stamina-close]').click();document.activeElement.id");
      // Native dialog close events are queued; allow the focus-restoration handler to run.
      await wait("modal.open && document.activeElement.matches('[data-open-stamina]')");
      records.push({kind:'shopReturnFocus',width,height,immediateFocus});
    }
    // Affordability follows the missing-stamina price, including a one-Crown top-up.
    for(const [value,crowns,cost,label] of [[70,8,9,'Buy Crowns'],[70,9,9,'Refill to 100 — 9 Crowns'],[70,29,9,'Refill to 100 — 9 Crowns'],[66,11,11,'Refill to 100 — 11 Crowns'],[67,10,10,'Refill to 100 — 10 Crowns'],[99,0,1,'Buy Crowns'],[99,1,1,'Refill to 100 — 1 Crown'],[0,29,30,'Buy Crowns'],[0,30,30,'Refill to 100 — 30 Crowns'],[100,120,0,'Stamina full']]){
      await ev(`huntQA.stamina.value=${value};huntQA.stamina.revision++;huntQA.crowns=${crowns};huntQA.walletRevision++;huntQA.callbacks.onState(huntQA.stamina);document.querySelector('#modal [data-open-stamina]').click()`);
      await wait(`document.querySelector('[data-refill-buy]').textContent===${JSON.stringify(label)}`);
      assert.equal(await ev("document.querySelector('[data-refill-buy]').disabled"),value===100);
      if(cost>0 && crowns>=cost) assert.equal(await ev("document.querySelector('[data-refill-crowns]').textContent"),`${crowns} → ${crowns-cost}`);
      if(crowns<cost) assert(await ev(`document.querySelector('[data-stamina-feedback]').textContent.includes('You need ${cost-crowns} more.')`));
      await ev("document.querySelector('[data-stamina-close]').click()");
      await wait("modal.open && document.activeElement.matches('[data-open-stamina]')");
    }
    await ev("huntQA.stamina.value=9;huntQA.stamina.revision++;huntQA.callbacks.onState(huntQA.stamina)");
    for(const [mode,enabled,failure] of [['live',false,false],['test',true,false],['live',true,true]]){
      await ev(`huntQA.crowns=27;huntQA.walletRevision++;cosmeticState=COSMETIC_CATALOG.normalize({crowns:27,revision:huntQA.walletRevision});huntQA.shopMode=${JSON.stringify(mode)};huntQA.shopEnabled=${enabled};huntQA.catalogFailure=${failure};document.querySelector('#modal [data-open-stamina]').click()`);
      await wait("document.querySelector('[data-stamina-feedback]').textContent.includes('Crown purchases are currently unavailable.')");
      assert(await ev("document.querySelector('[data-refill-buy]').disabled"),'Disabled, test-only or unavailable checkout cannot route to paid Crowns');
      assert(!await ev("modal.classList.contains('shop-modal')"));await ev("document.querySelector('[data-stamina-close]').click()");
    }
    await ev("huntQA.shopMode='live';huntQA.shopEnabled=true;huntQA.catalogFailure=false;document.querySelector('#modal [data-open-stamina]').click()");
    await wait("document.querySelector('[data-refill-buy]').textContent==='Buy Crowns'");
    await ev("huntQA.loadShop=ensureOptionalUiScripts;ensureOptionalUiScripts=(names,host,ready)=>{huntQA.shopReady=ready;return false;};document.querySelector('[data-refill-buy]').click();document.querySelector('[data-stamina-close]').click();huntQA.shopReady();ensureOptionalUiScripts=huntQA.loadShop");
    assert(await ev("modal.open && !modal.classList.contains('shop-modal') && !document.querySelector('.stamina-panel[open]') && huntQA.input===document.getElementById('troopExactAmount')"),'Late Shop load cannot reopen a canceled review');
    await ev("modal.close();huntQA.callbacks.onState({version:1,value:9,recoveredAtMs:Date.now(),revision:3,paidDay:''})");assert.equal(await ev("document.querySelector('[data-stamina-value]').textContent"),'9/100');
    await ev("showNearbyMarauders()");assert.equal(await ev("document.querySelectorAll('[data-enemy-id]').length"),1);
    await ev("document.querySelector('[data-enemy-id]').click()");assert(await ev("modalBody.textContent.includes('Scout this spawn')"));assert(!await ev("modalBody.textContent.includes('Scouted defenders:')"));
    await ev(`(()=>{const now=Date.now();mergeServerScoutReport({type:'scout',cityId:huntQA.target.id,targetType:'marauder',targetSpawnId:'fixture-spawn',scoutReport:{targetType:'marauder',targetSpawnId:'fixture-spawn',troops:87,totalDefense:87,regionId:huntQA.target.regionId,scoutedAtMs:now,expiresAtMs:now+600000}});openMarauderDetails(huntQA.target.id);})()`);
    assert(await ev("modalBody.textContent.includes('Scouted defenders:')"));
    assert.equal(await ev('getScoutReportForTarget(huntQA.target).troops'),87);
    await ev('ensureModalUiScripts("battle-report",()=>{})');await wait('!!window.CrownlandsBattleReportUI');
    assert(await ev("renderLegacyBattleReportDetail({type:'attack',targetType:'marauder',cityName:'Marauder',marauderLevel:1,regionId:huntQA.target.regionId,outcome:'victory',summary:'Victory',sentTroops:200,attackerLosses:30,survivors:170,defendersLeft:0,goldAwarded:100,xpAwarded:20,itemAwarded:'recall_horn'},{tone:'victory',label:'VICTORY'}).includes('Added to your Bag')"));
    await ev("state.battleReports=[{id:'npc-scout-report',uid:huntQA.uid,type:'scout',outcome:'scout',cityId:huntQA.target.id,cityName:huntQA.target.name,regionId:huntQA.target.regionId,targetType:'marauder',targetSpawnId:'fixture-spawn',summary:'Scout revealed 87 defenders.',occurredAtMs:Date.now(),scoutReport:getScoutReportForTarget(huntQA.target)}];showBattleReportDetail('npc-scout-report')");
    await ev("updateScoutReportLifecycle(Date.now()+1000)");
    assert(await ev("modal.open && modal.classList.contains('scout-report-ledger') && !!document.querySelector('[data-scout-close]') && !!document.getElementById('battleReportBackBtn')"),'Actual NPC report uses navigation and expiry shell');
    const scoutSignature=`[modal,modalBody.querySelector('.scout-ledger-shell'),modalBody.querySelector('.window-header'),modalBody.querySelector('.report-body')].map(node=>{
      const s=getComputedStyle(node),r=node.getBoundingClientRect();return [Math.round(r.width),s.backgroundColor,s.color,s.fontFamily,s.fontSize];})`;
    const settleScout=async()=>{
      await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await ev('Promise.all(modal.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');
    };
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await ev(`(()=>{modal.close();const city=state.cities.find(c=>!isStronghold(c));const now=Date.now();
        mergeServerScoutReport({type:'scout',cityId:city.id,targetType:'city',scoutReport:{targetType:'city',cityLevel:city.level,troops:87,totalDefense:87,
          regionId:getCityRegionId(city),scoutedAtMs:now,expiresAtMs:now+600000}});showScoutReportModal(city.id);})()`);
      await settleScout();const cityScoutStyle=await ev(scoutSignature);
      for(const classification of ['solo','boss']){
        const troops=classification==='boss'?50000000:87;
        await ev(`(()=>{modal.close();const now=Date.now(),target=huntQA.scoutTarget={...huntQA.target,id:'scout-${classification}',spawnId:'scout-spawn-${classification}',
          classification:${JSON.stringify(classification)},level:${classification==='boss'?90:1},name:${JSON.stringify(classification==='boss'?'Clan Boss Lv. 90':'Marauder Lv. 1')}};
          applyOnlineMarauders([huntQA.target,target],target.regionId);
          const report={id:'scout-report-${classification}',uid:huntQA.uid,type:'scout',outcome:'scout',cityId:target.id,cityName:target.name,regionId:target.regionId,
            targetType:'marauder',targetSpawnId:target.spawnId,summary:'Scout completed.',occurredAtMs:now,
            scoutReport:{targetType:'marauder',targetSpawnId:target.spawnId,troops:${troops},totalDefense:${troops},regionId:target.regionId,scoutedAtMs:now,expiresAtMs:now+600000}};
          mergeServerScoutReport(report);state.battleReports=[report];showBattleReportDetail(report.id);})()`);
        await wait("modalBody.querySelector('.npc-scout-art')?.complete");await settleScout();
        assert.deepEqual(await ev(scoutSignature),cityScoutStyle,'NPC scouts match the regular-city scout window and typography');
        const scout=await ev(`(()=>{const b=modalBody.querySelector('.report-body'),art=b.querySelector('.npc-scout-art'),r=modal.getBoundingClientRect();return{
          text:b.textContent,art:art.getAttribute('src'),loaded:art.naturalWidth>0,
          cards:b.querySelectorAll('.intel-metric').length,table:!!b.querySelector('.scout-table'),
          fakeCity:!!b.querySelector('#scoutReportDefenderFlag,[data-player-uid="enemy"],#scoutDetail-walls,.skill-row'),
          overflow:b.scrollWidth>b.clientWidth+1,fit:r.left>=0&&r.right<=${width}+1&&r.top>=0&&r.bottom<=${height}+1,
          sections:[...modalBody.querySelectorAll('[data-scout-jump]')].map(n=>n.textContent),
          map:!!modalBody.querySelector('[data-report-jump]:not(:disabled)'),timers:!!b.closest('.scout-ledger-shell').querySelector('[data-scout-report-age]')&&!!modalBody.querySelector('[data-scout-report-expires]')};})()`);
        assert(scout.loaded&&scout.art.includes(classification==='boss'?'boss-v1':'solo-v1')&&scout.cards===2&&scout.table&&!scout.fakeCity&&!scout.overflow&&scout.fit&&scout.map&&scout.timers,JSON.stringify(scout));
        assert(scout.text.includes(troops.toLocaleString('en-US'))&&scout.text.includes('1.00 defense per defender')&&scout.text.includes('only to this spawn'));
        assert.deepEqual(scout.sections,['Overview','Defenses','Hunt']);
        await ev("modalBody.querySelector('[data-scout-jump=\"scoutDetail-defense\"]').focus()");
        await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
        await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
        assert(await ev("document.activeElement.closest('#scoutDetail-defense')!==null"),'Scout section keyboard focus lost');
        await ev("modalBody.querySelector('.report-body').scrollTop=0");
        fs.writeFileSync(path.join(artifacts,`npc-scout-${classification}-${width}x${height}${built?'-built':''}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
        await ev("modalBody.querySelector('[data-open-stamina]').click()");await wait("!!document.querySelector('.stamina-panel[open]')");
        await ev("document.querySelector('[data-stamina-close]').click()");
        await wait("modal.open&&modal.classList.contains('scout-report-ledger')&&!!modalBody.querySelector('.npc-scout-art')");
        assert.equal(await ev('modal.dataset.scoutReportCityId'),'scout-'+classification,'Refill review preserves scout target');
        await ev("applyOnlineMarauders([huntQA.target,{...huntQA.scoutTarget,spawnId:'replacement'}],huntQA.target.regionId);showBattleReportDetail('scout-report-'+huntQA.scoutTarget.classification)");
        assert(await ev("modalBody.textContent.includes('No current intelligence')&&!modalBody.querySelector('.intel-metric,.scout-table')"),'Replaced NPC intelligence must stay unavailable');
        assert.deepEqual(await ev(scoutSignature),cityScoutStyle,'Unavailable NPC scout retains the city report window');
        await ev("document.querySelector('[data-scout-close]').click()");assert(!await ev('modal.open'));
        records.push({kind:'npcScout',classification,width,height,built,scout});
      }
    }
    await ev("applyOnlineMarauders([huntQA.target],huntQA.target.regionId);state.battleReports=[{id:'npc-scout-report',uid:huntQA.uid,type:'scout',outcome:'scout',cityId:huntQA.target.id,cityName:huntQA.target.name,regionId:huntQA.target.regionId,targetType:'marauder',targetSpawnId:'fixture-spawn',occurredAtMs:Date.now(),scoutReport:getScoutReportForTarget(huntQA.target)}];showBattleReportDetail('npc-scout-report')");
    await ev("CrownlandsScoutReportUI.updateTiming(modalBody,20)");assert(await ev("document.querySelector('.expiry').classList.contains('urgent')"));
    await ev("document.querySelector('[data-scout-close]').click()");
    assert(!await ev('modal.open'));
    await ev("bossReadiness.set('rally-fixture',{checkedAtMs:Date.now(),participants:[{uid:'ally',ready:false}],combatForecast:{status:'unavailable'}})");
    assert(await ev("renderBossReadiness({id:'rally-fixture',participants:[{uid:'ally',ownerName:'Ally'}]}).includes('Ally: Needs stamina')"));
    await ev("modal.close();document.getElementById('staminaButton').click()");
    await wait("document.querySelector('[data-refill-buy]').textContent==='Buy Crowns'");await ev("document.querySelector('[data-refill-buy]').click()");
    await wait("modal.open && modal.classList.contains('shop-modal')");
    // Sign out the fixture account too: a normal HUD tick must not rehydrate the old session.
    await ev("huntQA.uid='';CrownlandsStaminaUI.sync({uid:'',api:huntQA.api});renderHud()");
    assert.equal(await ev("document.querySelector('[data-stamina-value]').textContent"),'—/100');
    assert(!await ev("modal.open || !!document.querySelector('.stamina-panel[open]')"),'Sign-out discards the suspended view');
    assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
    fs.writeFileSync(path.join(artifacts,built?'checks-built.json':'checks.json'),JSON.stringify({passed:true,records,errors,failedAssets},null,2));console.log(`Marauder/stamina UI (${built?'production':'source'}) passed: city-style solo/boss Info and scout reports, artwork, contained buttons, touch/focus/scroll, exact intelligence and replaced-target privacy, timers/navigation, refill review and preserved drafts.`);
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
}
main().then(()=>main(true)).catch(error=>{console.error(error);process.exitCode=1;});
