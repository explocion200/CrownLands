"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {CdpClient}=require('./map-benchmark/cdp-client');
const {createMapBenchmarkServer}=require('./map-benchmark/server');
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require('./validate-focused-browser-smoke');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const executable=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));assert(executable);
 const server=createMapBenchmarkServer(),address=await server.listen(),artifacts=path.resolve(__dirname,'../release-artifacts/infirmary-game');fs.mkdirSync(artifacts,{recursive:true});
 let browser,client;const errors=[];
 try{
  browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await Promise.all(['Page.enable','Runtime.enable'].map(m=>client.send(m)));
  client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  const ev=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const ready=async expression=>{for(let i=0;i<800;i++){if(await ev(expression))return;await delay(75);}throw Error('Timed out: '+expression);};
  const screenshot=async name=>fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  for(const [width,height] of [[1440,900],[844,390],[568,320]]){
   await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:height<600});
   await client.send('Page.navigate',{url:address.url+'/__benchmark__/?scenario=A&visualMarches=0'});
   await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
   await ev(`(() => {
    window.__CROWNLANDS_BENCHMARK__.closeModal();
    const api=getOnlineApi();window.infirmaryQa={calls:[],fail:false,hold:false,balance:4260000000,reads:0,balanceReads:0,failBalance:false};
    window.infirmaryTower=HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[0].id),'owner');
    Object.assign(infirmaryTower,{buildings:{shop:4,workshop:4,infirmary:4,training:1},buildingProject:null,wallIntegrityBps:10000,attackBlocked:false,repairActive:false});
    state.clanId=infirmaryTower.clanId;clanTreasuryClanId=state.clanId;clanTreasuryStatus={treasury:{balance:infirmaryQa.balance}};
    loadClanTreasuryStatus=async()=>{infirmaryQa.balanceReads++;if(infirmaryQa.failBalance)throw Error('Balance could not be refreshed.');clanTreasuryStatus={treasury:{balance:infirmaryQa.balance}};return clanTreasuryStatus;};
    getOnlineApi=()=>({...api,isReady:()=>true,isSignedIn:()=>true,subscribeHoldingTowerState:()=>()=>{},
      getHoldingTowerState:async()=>{infirmaryQa.reads++;return {worldActive:true,towers:[{...infirmaryTower}]};},
      getClanTowerShop:async()=>({clanShop:{level:4,eligible:true,items:CrownlandsClanTowerBuildings.shopStatus(4,{},Date.now()).map(i=>({...i,price:135000}))}}),
      startClanTowerBuilding:async payload=>{infirmaryQa.calls.push(payload);if(infirmaryQa.hold)await new Promise(r=>infirmaryQa.release=r);if(infirmaryQa.fail){infirmaryQa.fail=false;throw Error('Construction not confirmed. Please retry.');}infirmaryQa.balance-=CrownlandsClanTowerBuildings.cost(infirmaryTower.buildings.infirmary+1);infirmaryTower.buildingProject={buildingId:payload.buildingId,targetLevel:5,remainingMs:21600000,progressStartedAtMs:Date.now()};return {tower:infirmaryTower,clanId:infirmaryTower.clanId,treasury:{balance:infirmaryQa.balance}};}
    });
   })()`);
   await ev(`openClanTowerBuilding(infirmaryTower.id,'infirmary')`);
   await ready('modalBody.dataset.infirmaryReady === "true"');await delay(150);
   const layout=async()=>{
    const result=await ev(`(() => {const d=modal.getBoundingClientRect(),p=modalBody.querySelector('#upgrade'),b=p.getBoundingClientRect();return{fit:d.top>=0&&d.bottom<=innerHeight&&d.left>=0&&d.right<=innerWidth,button:b.top>=d.top&&b.bottom<=d.bottom&&b.width>=80&&b.height>=44,hit:p.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),overflow:modal.scrollWidth>modal.clientWidth+1||[...modalBody.querySelectorAll('.detail-scroll')].some(e=>e.scrollWidth>e.clientWidth+1),art:[...modalBody.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0)};})()`);
    assert(result.fit&&result.button&&result.hit&&!result.overflow&&result.art,JSON.stringify({width,height,...result}));
   };
   await ev('document.fonts.ready');await delay(200);await layout();await screenshot(width+'-overview');
   assert.equal(await ev(`modalBody.querySelector('#currentBenefit').textContent`),'+6%');
   assert.equal(await ev(`modalBody.querySelector('#nextBenefit').textContent`),'+7.5%');
   assert.equal(await ev(`modalBody.querySelectorAll('[data-infirmary-building] option').length`),4);
   await ev(`modalBody.querySelector('#recoveryExample').open=true;modalBody.querySelector('#exampleBase').value='88';modalBody.querySelector('#exampleBase').dispatchEvent(new Event('change',{bubbles:true}));modalBody.querySelector('#overviewPanel').scrollTop=99999`);await delay(50);
   assert.equal(await ev(`modalBody.querySelector('#exampleTotal').textContent`),'90%');assert.equal(await ev(`modalBody.querySelector('#exampleNext').textContent`),'90%');
   assert(await ev(`modalBody.querySelector('#exampleCap').textContent.includes('Only 2 of')`));
   await ev('refreshHoldingTower(infirmaryTower.id)');
   assert(await ev(`modalBody.querySelector('#recoveryExample').open&&modalBody.querySelector('#exampleBase').value==='88'&&modalBody.querySelector('#overviewPanel').scrollTop>0`));await layout();await screenshot(width+'-recovery-cap');
   await ev(`modalBody.querySelector('#exampleBase').value='30';modalBody.querySelector('#exampleBase').dispatchEvent(new Event('change',{bubbles:true}))`);
   assert.equal(await ev(`modalBody.querySelector('#exampleTotal').textContent`),'36%');assert.equal(await ev(`modalBody.querySelector('#exampleNext').textContent`),'37.5%');
   await ev(`modalBody.querySelector('#tab-levels').click();modalBody.querySelector('#levelsPanel').scrollTop=99999`);
   assert.equal(await ev(`modalBody.querySelectorAll('.levels-table tbody tr').length`),10);
   assert(await ev(`(()=>{const p=modalBody.querySelector('#levelsPanel').getBoundingClientRect(),r=modalBody.querySelector('.levels-table tbody tr:last-child').getBoundingClientRect();return r.bottom<=p.bottom&&r.top>=p.top;})()`));
   await screenshot(width+'-levels');
   await ev(`refreshHoldingTower(infirmaryTower.id)`);
   assert(await ev(`modalBody.querySelector('#levelsPanel').scrollTop>0&&modalBody.querySelector('#tab-levels').getAttribute('aria-selected')==='true'`));
   await ev(`modalBody.querySelector('#tab-overview').click();infirmaryQa.hold=true;modalBody.querySelector('#upgrade').click();modalBody.querySelector('#upgrade').click()`);
   assert.equal(await ev('infirmaryQa.calls.length'),1);assert.equal(await ev('infirmaryQa.calls[0].buildingId'),'infirmary');
   assert.equal(await ev('infirmaryQa.calls[0].towerId'),await ev('infirmaryTower.id'));
   assert.equal(await ev('clanTreasuryStatus.treasury.balance'),4260000000);
   assert(await ev(`modalBody.querySelector('#upgrade').disabled`));
   await ev(`infirmaryQa.fail=true;infirmaryQa.hold=false;infirmaryQa.release()`);await ready('holdingTowerActionsInFlight.size === 0');
   assert(await ev(`modalBody.querySelector('.project-card.error').textContent.includes('retry')`));
   assert.equal(await ev('clanTreasuryStatus.treasury.balance'),4260000000);
   await ev(`modalBody.querySelector('#upgrade').click()`);await ready('holdingTowerActionsInFlight.size === 0');
   assert.equal(await ev('infirmaryQa.calls[0].operationId'),await ev('infirmaryQa.calls[1].operationId'));
   assert.equal(await ev('clanTreasuryStatus.treasury.balance'),4180000000);
   assert.equal(await ev(`modalBody.querySelector('#currentBenefit').textContent`),'+6%');
   assert(await ev(`modalBody.querySelector('#upgrade').disabled&&modalBody.querySelector('#upgradeFacts').textContent.includes('Gold paid')`));
   await layout();await screenshot(width+'-upgrading');
   await ev(`Object.assign(infirmaryTower,{attackBlocked:true,wallIntegrityBps:6200});Object.assign(infirmaryTower.buildingProject,{progressStartedAtMs:0,remainingMs:8100000});refreshHoldingTower(infirmaryTower.id)`);
   const paused=await ev(`modalBody.querySelector('[data-project-time]').textContent`);await delay(1100);
   assert.equal(await ev(`modalBody.querySelector('[data-project-time]').textContent`),paused);assert.equal(paused,'2h 15m');
   await screenshot(width+'-paused');await layout();
   // Expired snapshots prompt one refresh, without locally granting a level or polling in a loop.
   await ev(`infirmaryTower.attackBlocked=false;infirmaryTower.wallIntegrityBps=10000;Object.assign(infirmaryTower.buildingProject,{progressStartedAtMs:Date.now()-5000,remainingMs:1000});refreshHoldingTower(infirmaryTower.id)`);
   await delay(1200);const reads=await ev('infirmaryQa.reads');await delay(1200);assert.equal(await ev('infirmaryQa.reads'),reads);
   assert.equal(await ev(`modalBody.querySelector('#currentBenefit').textContent`),'+6%');
   await ev(`infirmaryTower.buildingProject=null;infirmaryTower.buildings.infirmary=5;refreshHoldingTower(infirmaryTower.id)`);
   assert.equal(await ev(`modalBody.querySelector('#currentBenefit').textContent`),'+7.5%');
   for(const state of ['attack','damage','repair','member','other','low','missing']){
    await ev(`Object.assign(infirmaryTower,{attackBlocked:false,wallIntegrityBps:10000,repairActive:false,buildingProject:null});infirmaryTower.permissions.manage=true;clanTreasuryStatus={treasury:{balance:4260000000}};
      if('${state}'==='attack')infirmaryTower.attackBlocked=true;if('${state}'==='damage')infirmaryTower.wallIntegrityBps=6000;if('${state}'==='repair')infirmaryTower.repairActive=true;if('${state}'==='member')infirmaryTower.permissions.manage=false;
      if('${state}'==='other')infirmaryTower.buildingProject={buildingId:'training',targetLevel:2,remainingMs:10000,progressStartedAtMs:0};if('${state}'==='low')clanTreasuryStatus.treasury.balance=0;if('${state}'==='missing')clanTreasuryStatus=null;refreshHoldingTower(infirmaryTower.id)`);
    assert(await ev(`modalBody.querySelector('#upgrade').disabled`),state);await layout();
    if(state==='other')assert(await ev(`modalBody.querySelector('.project-card').textContent.includes('Training Grounds')&&modalBody.querySelector('.project-card').textContent.includes('Paused')`));
   }
   await ev(`infirmaryQa.failBalance=true;modalBody.querySelector('[data-retry]').click()`);await ready('!holdingTowerModalSession.infirmaryView.refreshing');
   assert(await ev(`modalBody.querySelector('.project-card.error').textContent.includes('Balance could not')`));
   await ev(`infirmaryQa.failBalance=false;modalBody.querySelector('[data-retry]').click()`);await ready('!holdingTowerModalSession.infirmaryView.refreshing');
   assert.equal(await ev('clanTreasuryStatus.treasury.balance'),4180000000);
   for(const level of [0,1,4,7,10]){
    await ev(`infirmaryTower.buildings.infirmary=${level};refreshHoldingTower(infirmaryTower.id)`);
    assert.equal(await ev(`modalBody.querySelector('#currentBenefit').textContent`),'+'+level*1.5+'%');
    assert.equal(await ev(`modalBody.querySelector('#buildingArt').getAttribute('src')`),await ev(`CrownlandsClanTowerBuildings.art('infirmary',${level})`));
   }
   assert(await ev(`modalBody.querySelector('#upgrade').disabled&&modalBody.querySelector('#upgrade').textContent==='Maximum level'`));
   await ev(`modalBody.querySelector('[data-infirmary-back]').click()`);assert(!await ev('modal.classList.contains("infirmary-modal")'));
   await ev(`modalBody.querySelector('[data-tower-tab="buildings"]').click()`);assert(await ev('modal.classList.contains("infirmary-modal")'));
   await ev(`modalBody.querySelector('[data-infirmary-building]').value='shop';modalBody.querySelector('[data-infirmary-building]').dispatchEvent(new Event('change'))`);assert(await ev('modal.classList.contains("clan-shop-modal")'));
   await ev(`modalBody.querySelector('[data-shop-building]').value='infirmary';modalBody.querySelector('[data-shop-building]').dispatchEvent(new Event('change'))`);assert(await ev('modal.classList.contains("infirmary-modal")'));
   await ev(`modalBody.querySelector('[data-infirmary-building]').value='workshop';modalBody.querySelector('[data-infirmary-building]').dispatchEvent(new Event('change'))`);assert(await ev('modal.classList.contains("engineers-workshop-modal")'));
   await ev(`modalBody.querySelector('[data-workshop-building]').value='infirmary';modalBody.querySelector('[data-workshop-building]').dispatchEvent(new Event('change'))`);assert(await ev('modal.classList.contains("infirmary-modal")'));
   // Closing during an operation must not reopen the panel or contaminate a different clan.
   await ev(`infirmaryTower.buildings.infirmary=4;refreshHoldingTower(infirmaryTower.id);infirmaryQa.hold=true;modalBody.querySelector('#upgrade').click();modal.close()`);
   await delay(100);assert(!await ev('modal.classList.contains("infirmary-modal")'));
   await ev(`state.clanId='different-clan';clanTreasuryClanId=state.clanId;clanTreasuryStatus={treasury:{balance:123}};infirmaryQa.hold=false;infirmaryQa.release()`);await ready('holdingTowerActionsInFlight.size === 0');
   assert.equal(await ev('clanTreasuryStatus.treasury.balance'),123);assert(!await ev('modal.open'));
   await ev(`state.clanId=infirmaryTower.clanId;openClanTowerBuilding(infirmaryTower.id,'infirmary')`);await ready('modalBody.dataset.infirmaryReady === "true"');
   await ev(`infirmaryTower.ownerMember=false;infirmaryTower.ownerKind='neutral';infirmaryTower.clanId='';refreshHoldingTower(infirmaryTower.id)`);
   assert(!await ev('modal.classList.contains("infirmary-modal")'));assert.equal(await ev('modalBody.querySelector("#upgrade")'),null);
   await ev('modal.close()');await delay(100);
   console.log('Infirmary game '+width+'x'+height+': layout, authoritative balance/level, permissions, pauses, retries, duplicate guard, refresh, recovery cap, navigation and stale session checks passed.');
  }
  assert.deepEqual(errors,[]);
 }finally{if(client){await client.send('Browser.close').catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
