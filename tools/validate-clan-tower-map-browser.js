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
      throw Error(`Timed out: ${expression}`);
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
        const snapshot = HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(towerId),towerMapScenario.startsWith('store')?'owner':towerMapScenario);
        snapshot.buildings={shop:towerMapScenario==='store'||towerMapScenario==='store-probation'?1:0};
        if(towerMapScenario==='store-building')snapshot.buildingProject={buildingId:'shop',targetLevel:1,remainingMs:10000};
        if(towerMapScenario==='store-probation'){snapshot.permissions={inspect:true};snapshot.eligibility={eligible:false,remainingMs:3600000};}
        if (towerMapScenario === 'ineligible') {snapshot.permissions = {inspect:true};snapshot.eligibility={eligible:false,remainingMs:3600000};}
        if (towerMapScenario === 'empty') {snapshot.ownStationedTroops=0;snapshot.permissions={inspect:true,reinforce:true};}
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
        return {x,y,width:r.width,height:r.height,hit:node.contains(document.elementFromPoint(x,y)),hitElement:document.elementFromPoint(x,y)?.outerHTML.slice(0,300),frame:mapFrame.getBoundingClientRect().toJSON()};
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
    const prepare = async (index, level, scenario = "neutral") => {
      const tower = await evaluate(`(async()=>{
        if(modal.open)modal.close();clearSelection(false);
        towerMapScenario=${JSON.stringify(scenario)};holdingTowerSnapshots.clear();
        const tower=HOLDING_TOWER_DEFINITIONS[${index}];
        await ensureRegionDefinitionLoaded(tower.regionId);
        zoom=${level};centerOnRegion(tower.regionId);releaseSelectionRenderDelay();renderAll();
        return {id:tower.id,name:tower.name};
      })()`);
      await delay(180);
      return tower;
    };
    const select = async tower => {
      const before = await evaluate("towerMapReads.length");
      await click(await elementPoint(`[data-holding-tower-id="${tower.id}"]`));
      await ready(`selectedTowerMapId===${JSON.stringify(tower.id)} && cityLayer.querySelector('.clan-tower-action-wheel')`);
      await delay(100);
      assert.equal(await evaluate("towerMapReads.length"), before + 1, "A single pointer tap dispatched duplicate Tower reads.");
      assert.equal(await evaluate(`cityLayer.querySelector('[data-holding-tower-id="${tower.id}"]').getAttribute('aria-pressed')`), "true");
    };
    const submitOrder = async (tower, mode) => {
      const outgoing = ['withdraw','attack-from'].includes(mode);
      if (outgoing) {
        await click(await elementPoint('[data-clan-tower-map-action="send"]'));
        await ready(`sendMode && selectedSourceId===${JSON.stringify(tower.id)} && !modal.open`);
        await evaluate(`selectCity(getHoldingTowerComposerTargets(${JSON.stringify(mode)},holdingTowerSnapshots.get(${JSON.stringify(tower.id)})).find(target=>getHoldingTowerTargetType(target)==='city').id)`);
      } else if (mode==='reinforce') {
        await evaluate('beginSendMode(playerCities().find(city=>city.troops>0).id)');
        await click(await elementPoint(`[data-holding-tower-id="${tower.id}"]`));
      } else await click(await elementPoint(`[data-clan-tower-map-action="${mode}"]`));
      await ready(`modal.open && !!modalBody.querySelector('[data-tower-order-mode="${mode}"]')`);
      assert.equal(await evaluate("!!modalBody.querySelector('[data-tower-send-mode]')"),false,'Tower orders must infer their action from the map destination.');
      if(mode!=='rally-attack')assert(await evaluate("!!modalBody.querySelector('.troop-slider-panel .troop-range')"),'Map orders must use the city troop-slider presentation.');
      if (mode === "rally-attack") assert(await evaluate('modalBody.textContent.includes("At least 3 eligible clan members, including the leader")'));
      await delay(350);
      const expected = await evaluate(`({candidate:modalBody.querySelector('[data-tower-order-target]').value,troops:Number(modalBody.querySelector('[data-tower-order-troops]').value),count:towerMapOrders.length})`);
      // Short landscape screens use the dialog's existing scrollable body.
      assert(await evaluate(`(() => {
        const button=modalBody.querySelector('button[type=submit]');
        const body=modalBody.getBoundingClientRect(), rect=button.getBoundingClientRect();
        if(rect.bottom>body.bottom || rect.top<body.top){
          if(!['auto','scroll'].includes(getComputedStyle(modalBody).overflowY))return false;
          button.scrollIntoView({block:'center'});
        }
        return true;
      })()`), "Tower order controls are clipped without a scrollable body.");
      await delay(100);
      await click(await elementPoint("[data-tower-order-form] button[type=submit]"));
      await ready(`towerMapOrders.length===${expected.count + 1} && !modal.open`);
      const payload = await evaluate("towerMapOrders.at(-1)");
      assert.equal(payload.army.troops, expected.troops);
      if (["reinforce", "rally-attack"].includes(mode)) {
        assert.equal(payload.sourceType, "city"); assert.equal(payload.targetType, "tower");
        assert.equal(payload.army.fromId, expected.candidate); assert.equal(payload.army.toId, tower.id);
      } else {
        assert.equal(payload.sourceType, "tower"); assert.equal(payload.army.fromId, tower.id);
        assert.equal(payload.army.toId, expected.candidate);
        assert.equal(payload.army.kind, mode === 'withdraw' ? 'transfer' : 'attack');
        assert(expected.troops <= 685200, 'Send used the combined clan garrison.');
      }
    };
    const verifyZoom = async () => {
      const measurements = await evaluate(`(() => {
        const originalZoom=zoom, originalCamera={...camera}, wheel=cityLayer.querySelector('.clan-tower-action-wheel');
        const sizes=[];
        for(const level of [0.4,0.6,0.8,1,0.5]) {
          zoom=level;updateCameraTransform();
          if(wheel!==cityLayer.querySelector('.clan-tower-action-wheel'))throw Error('Zoom rebuilt the controls');
          const rects=[...wheel.querySelectorAll('button')].map(button=>button.getBoundingClientRect().toJSON());
          sizes.push({zoom,rects});
        }
        zoom=originalZoom;Object.assign(camera,originalCamera);updateCameraTransform();
        return sizes;
      })()`);
      for (const sample of measurements) {
        for (const rect of sample.rects) {
          assert(Math.abs(rect.width-64)<0.2 && Math.abs(rect.height-64)<0.2,`Tower button scaled during camera zoom: ${JSON.stringify(sample)}`);
        }
        for(let i=0;i<sample.rects.length;i++)for(let j=i+1;j<sample.rects.length;j++) {
          const a=sample.rects[i],b=sample.rects[j];
          assert(a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top,"Tower controls overlap after zooming.");
        }
      }
    };
    for (const viewport of [{width:1440,height:900,touch:false},{width:844,height:390,touch:true},{width:568,height:320,touch:true}]) {
      touch = viewport.touch;
      await client.send("Emulation.setDeviceMetricsOverride", {width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:touch});
      await client.send("Emulation.setTouchEmulationEnabled", {enabled:touch,maxTouchPoints:5});
      assert(await evaluate(`(() => {
        for (const targetType of ['tower','city']) for (const activity of [false,true]) {
          for (const [count,inbound] of [[2,false],[3,true],[3,false]]) {
            const rally={id:'minimum-qa',status:'forming',leaderUid:getCurrentOnlineUid(),targetType,targetId:HOLDING_TOWER_DEFINITIONS[0].id,
              participants:Array.from({length:count},(_,i)=>({uid:'minimum-'+i,ownerName:'Ruler '+i,troops:1,status:inbound&&i===count-1?'inbound':'assembled'}))};
            const container=document.createElement('div');container.innerHTML=renderClanRallyCard(rally,activity);
            const launch=container.querySelector('[data-rally-action="launch"]');
            if(!launch||launch.disabled!==(inbound||(targetType==='tower'&&count<3)))return false;
          }
        }
        return true;
      })()`), 'Both Rally views must require three Ready Tower contributors and preserve ordinary two-member rallies');
      for (const level of [1,0.6]) {
        for (let index=0;index<4;index++) {
          const tower=await prepare(index,level);
          await select(tower);
          await verifyZoom();
          const actions=await evaluate("[...cityLayer.querySelectorAll('[data-clan-tower-map-action]')].map(b=>b.dataset.clanTowerMapAction)");
          assert.deepEqual(actions,["info","scout","rally-attack"]);
          await click(await elementPoint('[data-clan-tower-map-action="info"]'));
          await ready("modal.open && !!modalBody.querySelector('.clan-tower-details')");
          assert.equal(await evaluate("modalBody.querySelector('h1').textContent"),tower.name);
          assert(await evaluate('modalBody.querySelector(".identity-facts").textContent.includes("3 members")'));
          assert.equal(await evaluate("!!modalBody.querySelector('[data-tower-order-form],[data-tower-action]')"),false,"Orders leaked into the info window.");
          await click(await elementPoint('[data-tower-close]'));
          await ready("!modal.open");
          await submitOrder(tower,"rally-attack");
        }
      }
      const tower=await prepare(0,1,"owner");
      await select(tower);
      assert.deepEqual(await evaluate("[...cityLayer.querySelectorAll('[data-clan-tower-map-action]')].map(b=>b.dataset.clanTowerMapAction)"),['info','store','send']);
      assert.equal(await evaluate("cityLayer.querySelector('.holding-tower-clan-banner strong')?.textContent"),'The Crimson Watch');
      await verifyZoom();
      for (const level of [0.6, 1]) {
        await evaluate(`zoom=${level};centerOnRegion(HOLDING_TOWER_DEFINITIONS[0].regionId);renderAll()`);
        await delay(180);
        await elementPoint('[data-clan-tower-map-action="info"]');
      }
      for (const mode of ["reinforce","withdraw","attack-from"]) {
        await prepare(0,1,'owner');await select(tower);
        await submitOrder(tower,mode);
      }
      await prepare(0,1,'owner');await select(tower);
      await click(await elementPoint('[data-clan-tower-map-action="send"]'));
      await ready('sendMode && !modal.open');
      await evaluate(`(() => {
        window.towerCityCountGetter=getOwnedRegularCityCountForDisplay;
        getOwnedRegularCityCountForDisplay=()=>29;
        const target=getHoldingTowerComposerTargets('attack-from',holdingTowerSnapshots.get(${JSON.stringify(tower.id)})).find(city=>city.owner==='neutral'&&getHoldingTowerTargetType(city)==='city');
        if(!target)throw Error('Missing neutral city fixture');
        selectCity(target.id);
      })()`);
      for (const count of [29,30,31]) {
        await evaluate(`getOwnedRegularCityCountForDisplay=()=>${count};updateHoldingTowerOrderAvailability()`);
        assert.equal(await evaluate("modalBody.querySelector('button[type=submit]').disabled"),count>=30,`Tower NPC button used the wrong boundary at ${count} cities.`);
        if(count>=30) {
          assert.match(await evaluate("modalBody.querySelector('[data-tower-order-status]').textContent"),/30 or more cities/);
          const sent=await evaluate('towerMapOrders.length');
          await evaluate("modalBody.querySelector('[data-tower-order-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
          assert.equal(await evaluate('towerMapOrders.length'),sent,'A forced form submission bypassed the NPC limit.');
        }
      }
      await evaluate('toast.classList.remove("visible");modalBody.scrollTop=0');
      await delay(250);
      const capDirectory=require('node:path').resolve(__dirname,'../tmp/clan-tower-controls');
      fs.mkdirSync(capDirectory,{recursive:true});
      const capShot=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(require('node:path').join(capDirectory,`npc-limit-${viewport.width}.png`),Buffer.from(capShot.data,'base64'));
      await evaluate('getOwnedRegularCityCountForDisplay=towerCityCountGetter;delete window.towerCityCountGetter;modal.close()');
      await prepare(0,1,"ineligible");await select(tower);
      assert.deepEqual(await evaluate("[...cityLayer.querySelectorAll('[data-clan-tower-map-action]')].map(b=>[b.dataset.clanTowerMapAction,b.getAttribute('aria-disabled')])"),[['info','false'],['store','true'],['send','true']]);
      await click(await elementPoint('[data-clan-tower-map-action="send"]'));
      assert.equal(await evaluate('modal.open'),false,'A probation member opened troop orders.');
      await prepare(0,1,"empty");await select(tower);
      assert.equal(await evaluate("cityLayer.querySelector('[data-clan-tower-map-action=store]').getAttribute('aria-disabled')"),'true');
      assert.equal(await evaluate("cityLayer.querySelector('[data-clan-tower-map-action=send]').getAttribute('aria-disabled')"),'true');
      for(const scenario of ['store-building','store','store-probation']) {
        await prepare(0,.4,scenario);await select(tower);
        assert.equal(await evaluate("cityLayer.querySelector('[data-clan-tower-map-action=store]').getAttribute('aria-disabled')"),scenario==='store-building'?'true':'false');
        await click(await elementPoint('[data-clan-tower-map-action="store"]'));
        if(scenario==='store-building')assert.equal(await evaluate('modal.open'),false,'An unfinished Store opened.');
        else {
          await ready("modal.open && !!modalBody.querySelector('#clanTower-buildingsPanel:not([hidden]) .ctb-shop')");
          assert.equal(await evaluate('holdingTowerBuildingSelection'),'shop');
          await evaluate('modal.close()');
        }
      }
      // Public ownership is visible without selecting a Tower and is removed on neutralization.
      for (let index=0;index<4;index++) {
        const current=await prepare(index,viewport.height<560?.6:1,'owner');
        await evaluate(`holdingTowerSnapshots.set(${JSON.stringify(current.id)},HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(${JSON.stringify(current.id)}),'owner'));renderCities()`);
        assert.equal(await evaluate('selectedTowerMapId'),'');
        assert.equal(await evaluate("cityLayer.querySelector('.holding-tower-clan-banner strong')?.textContent"),'The Crimson Watch');
        assert(await evaluate("!getComputedStyle(cityLayer.querySelector('.holding-tower-node')).contain.includes('paint')"),'The ownership banner is paint-clipped.');
        const originalFlag=await evaluate("cityLayer.querySelector('.holding-tower-clan-banner svg').outerHTML");
        await evaluate(`holdingTowerSnapshots.set(${JSON.stringify(current.id)},{...holdingTowerSnapshots.get(${JSON.stringify(current.id)}),clanName:'Changed Clan',clanEmblem:{shape:'round',primary:'#225544'}});renderCities()`);
        assert.equal(await evaluate("cityLayer.querySelector('.holding-tower-clan-banner strong')?.textContent"),'Changed Clan');
        assert.notEqual(await evaluate("cityLayer.querySelector('.holding-tower-clan-banner svg').outerHTML"),originalFlag,'A flag update did not redraw the heraldry.');
        await evaluate(`holdingTowerSnapshots.set(${JSON.stringify(current.id)},HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(${JSON.stringify(current.id)}),'neutral'));renderCities()`);
        assert.equal(await evaluate("cityLayer.querySelectorAll('.holding-tower-clan-banner').length"),0);
      }
      await prepare(0,.6,'enemy');await select(tower);
      assert.deepEqual(await evaluate("[...cityLayer.querySelectorAll('[data-clan-tower-map-action]')].map(b=>b.dataset.clanTowerMapAction)"),['info','scout','rally-attack']);
      assert.equal(await evaluate("cityLayer.querySelector('.holding-tower-clan-banner strong')?.textContent"),'The Crimson Watch');
      await prepare(0,viewport.height<560?.4:1,'owner');await select(tower);
      await evaluate('toast.classList.remove("visible")');
      await delay(350);
      const screenshotDirectory=require('node:path').resolve(__dirname,'../tmp/clan-tower-controls');
      fs.mkdirSync(screenshotDirectory,{recursive:true});
      const mapShot=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(require('node:path').join(screenshotDirectory,`map-${viewport.width}.png`),Buffer.from(mapShot.data,'base64'));
      await click(await elementPoint('[data-clan-tower-map-action="send"]'));
      await ready('sendMode && !modal.open');
      await evaluate('selectCity(playerCities()[0].id)');
      await ready("modal.open && !!modalBody.querySelector('[data-tower-order-form]')");
      await delay(300);
      const sendShot=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(require('node:path').join(screenshotDirectory,`send-${viewport.width}.png`),Buffer.from(sendShot.data,'base64'));
      await prepare(0,1);
      let point=await elementPoint(`[data-holding-tower-id="${tower.id}"]`);
      const before=await evaluate("towerMapReads.length");
      if(touch){
        await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...point,id:1}]});
        await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:point.x+70,y:point.y+10,id:1}]});
        await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      }else{
        await client.send("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",buttons:1,clickCount:1});
        await client.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:point.x+70,y:point.y+10,button:"left",buttons:1});
        await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:point.x+70,y:point.y+10,button:"left",buttons:0,clickCount:1});
      }
      await delay(150);
      assert.equal(await evaluate("selectedTowerMapId"),"","Dragging from a tower selected it.");
      assert.equal(await evaluate("towerMapReads.length"),before);
      if(touch){
        for(const gesture of ["cancel","pinch"]){
          await prepare(0,1);point=await elementPoint(`[data-holding-tower-id="${tower.id}"]`);
          await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...point,id:1}]});
          if(gesture==="cancel")await client.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});
          else{
            await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...point,id:1},{x:point.x+80,y:point.y,id:2}]});
            await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:point.x-20,y:point.y,id:1},{x:point.x+100,y:point.y,id:2}]});
            await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
          }
          await delay(150);
          assert.equal(await evaluate("selectedTowerMapId"),"",`${gesture} selected a Tower.`);
          assert.equal(await evaluate("towerMapReads.length"),before);
        }
      }
      await prepare(0,1);
      await evaluate(`cityLayer.querySelector('[data-holding-tower-id="${tower.id}"]').focus()`);
      await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r",unmodifiedText:"\r"});
      await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
      await delay(150);
      assert.equal(await evaluate("selectedTowerMapId"),tower.id,"Keyboard activation did not select the Tower.");
      console.log(`Clan Tower checks passed at ${viewport.width}x${viewport.height}: all four towers, normal/low zoom, ${touch ? "touch" : "mouse"}, Info, Rally submission, owned orders, permissions, drag/cancel and keyboard.`);
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
