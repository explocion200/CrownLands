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
        const snapshot = HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(towerId),towerMapScenario);
        if (towerMapScenario === 'ineligible') snapshot.permissions = {inspect:true};
        return {worldActive:true,towers:[snapshot]};
      }, subscribeHoldingTowerState: () => () => {},
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
        zoom=${level};centerOnRegion(tower.regionId);renderAll();
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
      await click(await elementPoint(`[data-clan-tower-map-action="${mode}"]`));
      await ready(`modal.open && !!modalBody.querySelector('[data-tower-order-mode="${mode}"]')`);
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
          assert.equal(await evaluate("!!modalBody.querySelector('[data-tower-order-form],[data-tower-action]')"),false,"Orders leaked into the info window.");
          await click(await elementPoint('[data-tower-close]'));
          await ready("!modal.open");
          await submitOrder(tower,"rally-attack");
        }
      }
      const tower=await prepare(0,1,"owner");
      await select(tower);
      await verifyZoom();
      for (const level of [0.6, 1]) {
        await evaluate(`zoom=${level};centerOnRegion(HOLDING_TOWER_DEFINITIONS[0].regionId);renderAll()`);
        await delay(180);
        await elementPoint('[data-clan-tower-map-action="info"]');
      }
      for (const mode of ["reinforce","withdraw","attack-from","rally-from"]) await submitOrder(tower,mode);
      await prepare(0,1,"ineligible");await select(tower);
      assert.deepEqual(await evaluate("[...cityLayer.querySelectorAll('[data-clan-tower-map-action]')].map(b=>b.dataset.clanTowerMapAction)"),["info"],"Server-denied actions were exposed.");
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
