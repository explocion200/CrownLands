"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {CdpClient}=require('./map-benchmark/cdp-client');
const {createMapBenchmarkServer}=require('./map-benchmark/server');
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require('./validate-focused-browser-smoke');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const executable=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));assert(executable);
 const server=createMapBenchmarkServer(),address=await server.listen(),artifacts=path.resolve(__dirname,'../release-artifacts/clan-shop-game');fs.mkdirSync(artifacts,{recursive:true});
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
    const api=getOnlineApi();window.shopQa={calls:[],usage:{},fail:false,hold:false,unavailable:false,gold:5000000,boxes:2,items:{recall_horn:1},level:10,eligible:true};
    window.shopTower=HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[0].id),'owner');
    Object.assign(shopTower,{buildings:{shop:10,workshop:1,infirmary:1,training:1},buildingProject:null,wallIntegrityBps:10000,attackBlocked:false,repairActive:false});
    state.clanId=shopTower.clanId;state.gold=shopQa.gold;state.gear.commonGearBoxes=2;
    clanTreasuryClanId=state.clanId;clanTreasuryStatus={treasury:{balance:3400000000}};
    loadClanTreasuryStatus=async()=>clanTreasuryStatus;
    shopQa.stock=()=>({level:shopQa.level,localLevel:shopTower.buildings.shop,eligible:shopQa.eligible,eligibleAtMs:Date.now()+3600000,items:CrownlandsClanTowerBuildings.shopStatus(shopQa.level,shopQa.usage,Date.now()).map(i=>({...i,price:135000}))});
    shopQa.reply=()=>({ok:true,clanShop:shopQa.stock(),currentUser:{gold:shopQa.gold,goldFloat:shopQa.gold,shopItems:shopQa.items,gear:{...state.gear,commonGearBoxes:shopQa.boxes}}});
    getOnlineApi=()=>({...api,isReady:()=>true,isSignedIn:()=>true,subscribeHoldingTowerState:()=>()=>{},
      getHoldingTowerState:async()=>({worldActive:true,towers:[{...shopTower}]}),
      getClanTowerShop:async()=>{if(shopQa.unavailable)throw Error('Cannot load Shop stock.');return shopQa.reply();},
      purchaseClanTowerShopItem:async payload=>{shopQa.calls.push(payload);if(shopQa.hold)await new Promise(r=>shopQa.release=r);if(shopQa.fail){shopQa.fail=false;throw Error('Purchase not confirmed. Please retry.');}shopQa.usage=CrownlandsClanTowerBuildings.purchaseUsage(shopQa.level,shopQa.usage,payload.itemId,1,Date.now());shopQa.gold-=135000;if(payload.itemId==='common_gear_box')shopQa.boxes++;else shopQa.items[payload.itemId]=(shopQa.items[payload.itemId]||0)+1;return shopQa.reply();},
      startClanTowerBuilding:async payload=>{shopQa.calls.push(payload);return {ok:true};}
    });
   })()`);
   await ev(`openClanTowerBuilding(shopTower.id,'shop')`);
   await ready('modalBody.dataset.clanShopReady === "true"');
   await delay(150);
   assert.equal(await ev('modalBody.querySelectorAll("[data-item]").length'),7);
   const checkLayout=async()=>{
    const result=await ev(`(() => {const d=modal.getBoundingClientRect(),b=modalBody.querySelector('#purchase').getBoundingClientRect(),p=modalBody.querySelector('#purchase');return{fit:d.top>=0&&d.bottom<=innerHeight&&d.left>=0&&d.right<=innerWidth,button:b.top>=d.top&&b.bottom<=d.bottom&&b.width>=80&&b.height>=44,hit:p.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),overflow:modal.scrollWidth>modal.clientWidth+1};})()`);
    assert(result.fit&&result.button&&result.hit&&!result.overflow,JSON.stringify({width,height,...result}));
   };
   await checkLayout();await ev('document.fonts.ready');await delay(200);await screenshot(width+'-provisions');
   // The actual callable payload uses the server price; duplicate attempts are blocked.
   await ev(`shopQa.hold=true;modalBody.querySelector('[data-item="common_gear_box"]').click();modalBody.querySelector('#purchase').click();modalBody.querySelector('#purchase').click()`);
   assert.equal(await ev('shopQa.calls.length'),1);
   assert.equal(await ev('shopQa.calls[0].cost'),135000);
   assert(await ev(`modalBody.querySelector('#purchase').disabled`));
   await ev(`shopQa.release();shopQa.hold=false`);
   await ready('holdingTowerActionsInFlight.size === 0');
   assert.equal(await ev('state.gear.commonGearBoxes'),3);
   assert(await ev('state.gold >= 4865000 && state.gold < 4865100'));assert.equal(await ev('shopQa.gold'),4865000);
   assert.equal(await ev(`modalBody.querySelector('#itemGrid [aria-selected="true"]').dataset.item`),'common_gear_box');
   assert(await ev(`modalBody.querySelector('#purchase').disabled`));
   await checkLayout();await screenshot(width+'-purchased');
   await ev(`shopQa.fail=true;modalBody.querySelector('[data-item="recall_horn"]').click();modalBody.querySelector('#purchase').click()`);
   await ready('holdingTowerActionsInFlight.size === 0');
   assert(await ev(`modalBody.querySelector('.feedback.error').textContent.includes('retry')`));
   assert(await ev('state.gold >= 4865000 && state.gold < 4865100'));assert.equal(await ev('shopQa.gold'),4865000);
   await ev(`modalBody.querySelector('#purchase').click()`);await ready('holdingTowerActionsInFlight.size === 0');
   assert.equal(await ev('shopQa.calls[1].operationId'),await ev('shopQa.calls[2].operationId'));
   assert.equal(await ev('state.shopItems.recall_horn'),2);
   await ev(`modalBody.querySelector('[data-item="shield_12h"]').click();modalBody.querySelector('#purchase').click()`);await ready('holdingTowerActionsInFlight.size === 0');
   assert(await ev(`modalBody.querySelector('#purchase').disabled && modalBody.textContent.includes('72h')`));
   await ev(`shopQa.unavailable=true;refreshHoldingTower(shopTower.id)`);
   assert.equal(await ev(`modalBody.querySelector('#purchase').dataset.action`),'retry');
   await ev(`shopQa.unavailable=false;modalBody.querySelector('#purchase').click()`);await ready('!holdingTowerModalSession.shopView.refreshing');
   assert(await ev(`modalBody.querySelector('#purchase').disabled`));
   await ev(`shopQa.eligible=false;refreshHoldingTower(shopTower.id)`);
   await ev(`modalBody.querySelector('[data-item="war_drums_30m"]').click()`);
   assert(await ev(`modalBody.querySelector('#purchase').disabled && modalBody.textContent.includes('24 hours')`));
   await ev(`shopQa.eligible=true;shopQa.gold=0;refreshHoldingTower(shopTower.id)`);
   assert.equal(await ev(`modalBody.querySelector('#purchase').textContent`),'Not enough Gold');
   await ev(`shopQa.gold=5000000;shopTower.buildings.shop=9;shopQa.level=9;refreshHoldingTower(shopTower.id)`);
   await ev(`modalBody.querySelector('[data-item="shield_12h"]').click();modalBody.querySelector('#purchase').click()`);
   assert.equal(await ev(`modalBody.querySelector('#tab-upgrades').getAttribute('aria-selected')`),'true');
   assert.equal(await ev(`modalBody.querySelectorAll('.unlock-table tbody tr').length`),10);
   await screenshot(width+'-upgrades');
   await ev(`shopTower.attackBlocked=true;refreshHoldingTower(shopTower.id)`);
   assert(await ev(`modalBody.querySelector('#upgradeShop').disabled`));
   await ev(`shopTower.attackBlocked=false;shopTower.permissions.manage=false;refreshHoldingTower(shopTower.id)`);
   assert(await ev(`modalBody.querySelector('#upgradeShop').disabled`));
   // Losing ownership removes the purchase view entirely.
   await ev(`shopTower.ownerMember=false;shopTower.ownerKind='neutral';shopTower.clanId='';refreshHoldingTower(shopTower.id)`);
   assert.equal(await ev('modal.classList.contains("clan-shop-modal")'),false);
   assert.equal(await ev('modalBody.querySelector("#purchase")'),null);
   await ev('modal.close()');await delay(100);
   console.log('Clan Shop game '+width+'x'+height+': prices, inventory, duplicate guard, retry identity, allowance, permissions, ownership and layout passed.');
  }
  assert.deepEqual(errors,[]);
 }finally{if(client){await client.send('Browser.close').catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
