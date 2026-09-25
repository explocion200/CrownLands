"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 240; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      console.error(errors,await evaluate("({open:modal.open,tab:holdingTowerDetailsTab,html:modalBody.innerHTML.slice(0,900)})"));throw Error(`Timed out: ${expression}`);
    };
    let touch = false;
    const click = async point => {
      if (touch) {
        await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...point, id: 1 }] });
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        return;
      }
      await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, button: "none", buttons: 0 });
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
    };
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
    await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
    await evaluate(`(async () => {
      const api = getOnlineApi();
      window.towerMapReads = [];
      window.towerMapOrders = [];
      window.towerMapScenario = 'neutral';
      getOnlineApi = () => ({ ...api, getHoldingTowerState: async ({towerId}) => {
        towerMapReads.push(towerId);
        const snapshot = HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(towerId),towerMapScenario);
        if (towerMapScenario === 'ineligible') snapshot.permissions = {inspect:true};
        return {worldActive:true,towers:[snapshot]};
      }, subscribeHoldingTowerState: () => () => {}, getClanTowerShop: undefined,
      createClanRally: async payload => {towerMapOrders.push(payload);return {ok:true};},
      sendHoldingTowerArmyOrder: async payload => {towerMapOrders.push(payload);return {ok:true};}
      });
    })()`);
    const elementPoint = async selector => {
      const result = await evaluate(`(() => {
        const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;
        const r=node.getBoundingClientRect();
        const x=node.matches('.holding-tower-node')?(Math.max(0,r.left)+Math.min(innerWidth,r.right))/2:r.left+r.width/2;
        const y=node.matches('.holding-tower-node')?(Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2:r.top+r.height/2;
        return {z:getComputedStyle(node).zIndex,hitZ:getComputedStyle(document.elementFromPoint(x,y)).zIndex,position:getComputedStyle(node).position,x,y,width:r.width,height:r.height,hit:node.contains(document.elementFromPoint(x,y)),hitElement:document.elementFromPoint(x,y)?.outerHTML.slice(0,300),frame:mapFrame.getBoundingClientRect().toJSON()};
      })()`);
      if (!result?.hit) {
        console.error(await evaluate(`({modal:modal.getBoundingClientRect().toJSON(),body:modalBody.getBoundingClientRect().toJSON(),scroll:modalBody.scrollTop,scrollHeight:modalBody.scrollHeight,clientHeight:modalBody.clientHeight,overflow:getComputedStyle(modalBody).overflowY})`));
        const shot=await client.send("Page.captureScreenshot",{format:"png"});
        fs.writeFileSync(require("node:path").resolve(__dirname,"../.codex_tmp_tower-selection-blocked.png"),Buffer.from(shot.data,"base64"));
      }
      assert(result?.hit, `Control is not reachable: ${selector}: ${JSON.stringify(result)}`);
      if (selector.includes("data-clan-tower-map-action")) assert(result.width >= 44 && result.height >= 44, "Map actions became too small to tap.");
      return {x:result.x,y:result.y};
    };
    await evaluate(`(() => {
      const api=getOnlineApi(); window.buildingCalls=[];
      window.buildingFixture=HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[0].id),'owner');
      Object.assign(buildingFixture,{buildings:{shop:10,workshop:4,infirmary:7,training:1},buildingProject:null,wallIntegrityBps:10000,attackBlocked:false,repair:null});
      state.gold=1e9;state.clanId=buildingFixture.clanId;clanTreasuryClanId=state.clanId;clanTreasuryStatus={treasury:{balance:1e10}};
      const status=()=>({level:10,localLevel:buildingFixture.buildings.shop,eligible:true,items:CrownlandsClanTowerBuildings.shopStatus(10,{},Date.now()).map(i=>({...i,price:1000}))});
      loadClanTreasuryStatus=async()=>clanTreasuryStatus;
      applyServerEconomyResult=()=>{};
      getOnlineApi=()=>({...api,isReady:()=>true,isSignedIn:()=>true,getUser:()=>({uid:'building-qa'}),subscribeHoldingTowerState:()=>()=>{},
        subscribeClanTreasury:(_clanId,handlers)=>{window.treasuryLive=handlers;return()=>{};},
        getHoldingTowerState:async()=>({worldActive:true,towers:[{...buildingFixture}]}),
        getClanTowerShop:async()=>({clanShop:status()}),
        startClanTowerBuilding:async p=>{buildingCalls.push(p);buildingFixture.buildingProject={buildingId:p.buildingId,targetLevel:buildingFixture.buildings[p.buildingId]+1,remainingMs:1800000,progressStartedAtMs:Date.now()};return {tower:buildingFixture};},
        purchaseClanTowerShopItem:async p=>{buildingCalls.push(p);return {clanShop:status()};}
      });
      startClanTreasurySubscription(getOnlineApi(),state.clanId);
      ensureHoldingTowerMapSubscriptions();
    })()`);
    const frameTower = () => evaluate(`zoom=innerWidth<600?.4:innerHeight<560?.5:.8;centerOnRegion(buildingFixture.regionId);if(innerHeight<560)camera.y+=(innerWidth<600?50:18)/zoom;if(innerWidth<600)camera.x-=56/zoom;updateCameraTransform()`);
    const screenshot = async name => {
      const directory = require('node:path').resolve(__dirname,'../tmp/clan-buildings/qa');
      fs.mkdirSync(directory,{recursive:true});
      const shot = await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(require('node:path').join(directory,name),Buffer.from(shot.data,'base64'));
    };
    for (const viewport of [{width:1440,height:900,touch:false},{width:844,height:390,touch:true},{width:568,height:320,touch:true}]) {
      touch=viewport.touch;
      await client.send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:touch});
      await client.send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:5});
      await evaluate(`(async()=>{if(modal.open)modal.close();await ensureRegionDefinitionLoaded(buildingFixture.regionId);zoom=innerWidth<600?.5:.8;centerOnRegion(buildingFixture.regionId);holdingTowerSnapshots.set(buildingFixture.id,{...buildingFixture});cityRenderSignature='';renderAll();})()`);
      await frameTower();
      await ready('cityLayer.querySelectorAll(".holding-tower-building-node").length===4');
      await ready('cityLayer.querySelector(".holding-tower-courtyard")?.naturalWidth > 0');
      assert(await evaluate(`(()=>{
        const ground=cityLayer.querySelector('.holding-tower-courtyard');
        const label=cityLayer.querySelector('.holding-tower-node.has-buildings .holding-tower-map-label').getBoundingClientRect();
        return getComputedStyle(ground).pointerEvents==='none' && [...cityLayer.querySelectorAll('.holding-tower-building-node')].every(node=>{const r=node.getBoundingClientRect();return r.right<=label.left||r.left>=label.right||r.bottom<=label.top||r.top>=label.bottom;});
      })()`), 'Courtyard must allow map gestures and the Tower label must clear the buildings');
      for (const level of [1,4,7,10]) {
        await evaluate(`buildingFixture.buildings={shop:${level},workshop:${level},infirmary:${level},training:${level}};holdingTowerSnapshots.set(buildingFixture.id,{...buildingFixture});cityRenderSignature='';renderAll()`);
        const stage = level === 10 ? 4 : Math.ceil(level / 3);
        await ready(`(()=>{const images=[...cityLayer.querySelectorAll('.holding-tower-building-node>img')];return images.length===4&&images.every(img=>img.complete&&img.naturalWidth>0&&img.src.endsWith('-${stage}.webp'));})()`);
        if (level === 1 || level === 10) {
          for (const id of ['shop','workshop','infirmary','training']) {
            await click(await elementPoint(`[data-clan-building-id="${id}"]`));
            await ready(`modal.open&&holdingTowerDetailsTab==='buildings'&&holdingTowerBuildingSelection==='${id}'`);
            await evaluate('modal.close();clearSelection(false)');
            await delay(300);
            await frameTower();
          }
          await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:150,button:'none',buttons:0});
          await screenshot(`approved-${viewport.width}-level-${level}.png`);
        }
      }
      await evaluate('buildingFixture.buildings={shop:10,workshop:4,infirmary:7,training:1};holdingTowerSnapshots.set(buildingFixture.id,{...buildingFixture});cityRenderSignature="";renderAll()');
      const layouts=await evaluate(`(()=>{const result=[];selectedTowerMapId=buildingFixture.id;renderSelectedClanTowerWheel(buildingFixture.id);const prior=zoom;for(const z of [.4,.6,.8,1]){zoom=z;updateCameraTransform();result.push({buttons:[...mapFrame.querySelectorAll('[data-clan-tower-map-action]')].map(b=>b.getBoundingClientRect().toJSON()),buildings:[...cityLayer.querySelectorAll('.holding-tower-building-node')].map(b=>b.getBoundingClientRect().toJSON())});}zoom=prior;updateCameraTransform();clearSelection(false);return result;})()`);
      for(const layout of layouts)for(const button of layout.buttons){assert(Math.abs(button.width-56)<.2 && Math.abs(button.height-56)<.2,'Tower controls must keep their compact 56px size beside buildings');for(const building of layout.buildings)assert(button.right<=building.left || button.left>=building.right || button.bottom<=building.top || button.top>=building.bottom,'A fixed-size action overlaps a compound building');}
      await frameTower();
      await click(await elementPoint('[data-clan-building-id="shop"]'));
      await ready('modal.open && holdingTowerDetailsTab==="buildings" && modalBody.querySelector("#itemGrid")');
      await delay(100);
      assert.equal(await evaluate('modalBody.querySelectorAll("[data-shop-building] option").length'),4);
      assert.equal(await evaluate('modalBody.querySelectorAll("[data-item]").length'),7);
      assert(await evaluate('modalBody.textContent.includes("every 72 hours")'));
      const reachable = async selector => {
        await evaluate(`modalBody.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest'})`);await delay(100);
        await click(await elementPoint(selector));
      };
      const before=await evaluate('buildingCalls.length');
      await reachable('[data-item="recall_horn"]');
      await reachable('[data-clan-shop-buy="recall_horn"]');
      await ready(`buildingCalls.length===${before+1} && !holdingTowerActionsInFlight.size`);
      assert.equal((await evaluate('buildingCalls.at(-1)')).itemId,'recall_horn');
      await evaluate(`modalBody.querySelector('[data-shop-building]').value='training';modalBody.querySelector('[data-shop-building]').dispatchEvent(new Event('change'))`);
      await ready('modalBody.dataset.trainingReady === "true"');
      assert(await evaluate('modal.classList.contains("training-grounds-modal")'));
      assert.equal(await evaluate('modalBody.querySelector("#currentBenefit").textContent'), '+1%');
      await evaluate('buildingFixture.buildingProject=null;renderHoldingTowerModal({...buildingFixture,clanShop:holdingTowerSnapshots.get(buildingFixture.id).clanShop})');
      await evaluate('clanTreasuryStatus=null;treasuryLive.onTreasury({balance:0,totalDonated:0,totalSpent:0,revision:0})');
      assert(await evaluate('modalBody.querySelector("#upgrade").disabled'));
      await evaluate('treasuryLive.onTreasury({balance:20000000,totalDonated:20000000,totalSpent:0,revision:1})');
      assert(await evaluate('!modalBody.querySelector("#upgrade").disabled'), 'A clan donation did not enable the building upgrade.');
      assert.equal(await evaluate('holdingTowerDetailsTab'), 'buildings', 'A live donation changed the selected tab.');
      assert.equal(await evaluate('modalBody.querySelector("#balance").textContent'), (20000000).toLocaleString());
      assert(await evaluate('renderClanTreasuryPanel().includes((20000000).toLocaleString("en-US"))'), 'The clan panel disagrees with the Tower Treasury.');
      // Wall services now live outside the dedicated building screen. Preserve their live-balance checks.
      await evaluate('modalBody.querySelector("[data-training-back]").click();modalBody.querySelector("[data-tower-tab=walls]").click();treasuryLive.onTreasury({balance:0,totalDonated:0,totalSpent:0,revision:2})');
      assert(await evaluate('modalBody.querySelector("[data-tower-action=upgrade]").disabled'));
      await evaluate('modalBody.querySelector("[data-tower-upgrade-count]").value="2";treasuryLive.onTreasury({balance:20000000,totalDonated:20000000,totalSpent:0,revision:3})');
      assert(await evaluate('!modalBody.querySelector("[data-tower-action=upgrade]").disabled'), 'A clan donation did not enable wall construction.');
      assert.equal(await evaluate('modalBody.querySelector("[data-tower-upgrade-count]").value'), '2', 'A live donation reset the wall quantity.');
      assert.equal(await evaluate('holdingTowerDetailsTab'), 'walls', 'A live donation changed the wall services tab.');
      await evaluate('treasuryLive.onTreasury({balance:10000000000,totalDonated:10000000000,totalSpent:0,revision:4});modalBody.querySelector("[data-tower-tab=buildings]").click()');
      const orders=await evaluate('buildingCalls.length');
      await reachable('#upgrade');
      await ready(`buildingCalls.length===${orders+1} && !holdingTowerActionsInFlight.size`);
      assert.equal((await evaluate('buildingCalls.at(-1)')).buildingId,'training');
      await evaluate('buildingFixture.buildingProject.progressStartedAtMs=0;buildingFixture.attackBlocked=true;renderHoldingTowerModal(buildingFixture)');
      assert(await evaluate('modalBody.querySelector(".project-card.paused") && modalBody.querySelector("#upgrade").textContent === "Upgrade paused"'));
      await evaluate('buildingFixture.buildingProject=null;buildingFixture.attackBlocked=false;holdingTowerBuildingSelection="shop";renderHoldingTowerModal({...buildingFixture,clanShop:{level:1,localLevel:1,eligible:true,items:CrownlandsClanTowerBuildings.shopStatus(1,{},Date.now()).map(i=>({...i,price:1000}))}})');
      await evaluate(`modalBody.querySelector('[data-item="shield_12h"]').click()`);
      assert.equal(await evaluate(`modalBody.querySelector('#purchase').dataset.action`), 'upgrade');
      assert(await evaluate('modalBody.textContent.includes("Unlocks at Level 10")'));
      const shot=await client.send('Page.captureScreenshot',{format:'png'});
      fs.mkdirSync(require('node:path').resolve(__dirname,'../tmp/clan-buildings/qa'),{recursive:true});
      fs.writeFileSync(require('node:path').resolve(__dirname,`../tmp/clan-buildings/qa/buildings-${viewport.width}.png`),Buffer.from(shot.data,'base64'));
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Document overflowed horizontally');
      await evaluate('modal.close();clearSelection(false);holdingTowerSnapshots.set(buildingFixture.id,{...buildingFixture});cityRenderSignature="";renderAll()');
      await delay(300);
      await frameTower();
      await delay(200);
      const mapShot=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(require('node:path').resolve(__dirname,`../tmp/clan-buildings/qa/map-${viewport.width}.png`),Buffer.from(mapShot.data,'base64'));
      console.log(`Clan building map taps, selection, stock/unlock labels, purchase and construction actions, pause state and layout passed at ${viewport.width}x${viewport.height}.`);
    }
    for (const fixture of [
      {ownerKind:'clan',buildings:{},buildingProject:null,expected:0},
      {ownerKind:'clan',buildings:{},buildingProject:{buildingId:'shop'},expected:1},
      {ownerKind:'neutral',buildings:{shop:10},buildingProject:null,expected:0},
    ]) {
      await evaluate(`holdingTowerSnapshots.set(buildingFixture.id,{...buildingFixture,...${JSON.stringify(fixture)}});cityRenderSignature='';renderAll()`);
      assert.equal(await evaluate('cityLayer.querySelectorAll(".holding-tower-courtyard").length'),fixture.expected,'Courtyard must follow building construction and ownership');
    }
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate('holdingTowerSnapshots.set(buildingFixture.id,{...buildingFixture,buildings:{},buildingProject:null});cityRenderSignature="";renderAll()');
    await frameTower();
    await delay(200);
    await screenshot('approved-tower-only.png');
    for (const index of [0,1,2,3]) {
      await evaluate(`(async()=>{const tower=HOLDING_TOWER_DEFINITIONS[${index}];await ensureRegionDefinitionLoaded(tower.regionId);centerOnRegion(tower.regionId);cityRenderSignature='';renderAll()})()`);
      await ready(`cityLayer.querySelector('[data-holding-tower-id="core-v2-holding-tower-${index+1}"] .holding-tower-art')?.naturalWidth>0`);
      assert(await evaluate(`getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[${index}].id).artSrc==='assets/clan-buildings/tower.webp'`),'A Core Tower retained the previous art');
    }
    assert.deepEqual(errors, []);
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}

if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { run: main };
