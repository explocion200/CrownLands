"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const dir = path.resolve(__dirname, "../release-artifacts/tower-mobile-zoom");

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium is required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client;
  const records = [], errors = [];
  fs.mkdirSync(dir, {recursive:true});
  const ev = async fn => {
    const result = await client.send("Runtime.evaluate", {expression:typeof fn === "string" ? fn : `(${fn.toString()})()`, awaitPromise:true, returnByValue:true});
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const ready = async fn => {
    for (let i=0;i<200;i++) {if(await ev(fn)) return; await delay(100);}
    throw Error(`Timed out: ${fn}`);
  };
  const touch = (type, points) => client.send("Input.dispatchTouchEvent", {type, touchPoints:points});
  const sample = () => ev(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {zoom, camera:{...camera}, pageScale:visualViewport.scale, pointers:activePointers.size, pinch:!!pinchState, modal:modal.open,
      widths:[...document.querySelectorAll('[data-clan-tower-map-action]')].map(b=>b.getBoundingClientRect().width)};
  });
  try {
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      browser = await startBrowserSession(executable);
      client = await CdpClient.connect(browser.targets.find(t=>t.type==='page').webSocketDebuggerUrl);
      await Promise.all(['Page.enable','Runtime.enable','Network.enable'].map(method=>client.send(method)));
      client.on('Runtime.exceptionThrown', e=>errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
      await client.send('Network.setBlockedURLs',{urls:['*googleapis.com*','*cloudfunctions.net*','*firebaseio.com*','*playcrownlands.com*']});
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:height<600});
      await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
      await client.send('Page.navigate',{url:address.url+'/__benchmark__/?scenario=A&visualMarches=0'});
      await ready(()=>window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready');
      await ev(async()=>{
        if(modal.open)modal.close();
        const api=getOnlineApi();
        window.towerGestureQa={tower:getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[0].id)};
        const qa=towerGestureQa;
        state.clanId='gesture-clan';state.clanRole='leader';
        qa.snapshot={...HOLDING_TOWER_UI.createQaSnapshot(qa.tower,'owner'),clanId:state.clanId,
          buildings:{shop:4,workshop:4,infirmary:4,training:4},buildingProject:null};
        getOnlineApi=()=>({...api,subscribeHoldingTowerState:()=>()=>{},getClanTowerShop:undefined,
          getHoldingTowerState:async()=>({worldActive:true,towers:[qa.snapshot]}),
          getClanTreasuryStatus:async()=>({treasury:{balance:0}})});
        await ensureRegionDefinitionLoaded(qa.tower.regionId);
        qa.tower=getHoldingTowerVisual(qa.tower.id);
        centerOnRegion(qa.tower.regionId);
        await selectClanTowerOnMap(qa.tower.id);
        window.resetTowerGesture=async selector=>{
          if(modal.open)modal.close();cancelMapGesture();clearSelection(false);
          zoom=.65;centerOnWorldPoint({x:qa.tower.visualX,y:qa.tower.visualY},qa.tower.regionId);
          await selectClanTowerOnMap(qa.tower.id);
          const node=document.querySelector(selector);if(!node)throw Error('Missing gesture target '+selector+' on '+getActiveMapRegionId());
          const rect=node.getBoundingClientRect(),frame=mapFrame.getBoundingClientRect();
          camera.x+=(rect.x+rect.width/2-frame.x-frame.width/2)/zoom;
          camera.y+=(rect.y+rect.height/2-frame.y-frame.height*.42)/zoom;
          updateCameraTransform();
          await new Promise(resolve=>requestAnimationFrame(resolve));
          const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          return {x,y,hit:node.contains(document.elementFromPoint(x-12,y))&&node.contains(document.elementFromPoint(x+12,y))};
        };
      });
      for (const selector of ['.holding-tower-node','[data-clan-building-id="shop"]','[data-clan-tower-map-action="info"]']) {
        const point=await ev(`resetTowerGesture(${JSON.stringify(selector)})`);
        assert(point.hit, `Pinch fixture is obscured: ${width} ${selector}`);
        const before=await sample(),pair=spread=>[{x:point.x-spread,y:point.y,id:1},{x:point.x+spread,y:point.y,id:2}];
        await touch('touchStart',pair(12).slice(0,1));await touch('touchStart',pair(12));
        const started=await sample();
        await touch('touchMove',pair(17));const expanded=await sample();
        await touch('touchMove',pair(9));const contracted=await sample();
        await touch('touchEnd',[]);await delay(150);
        const after=await sample();
        const record={width,height,selector,before,started,expanded,contracted,after};records.push(record);
        assert(started.pinch&&started.pointers===2, `Pinch did not start over ${selector} at ${width}`);
        assert(expanded.zoom>before.zoom+.05&&contracted.zoom<before.zoom-.05, `Pinch failed to zoom both ways over ${selector}`);
        for(const s of [before,started,expanded,contracted,after]) {
          assert(s.widths.length===3&&s.widths.every(w=>Math.abs(w-56)<.15),`Tower controls scaled during pinch: ${JSON.stringify(record)}`);
          assert.equal(s.pageScale,1,'Browser page zoom changed');assert.equal(s.modal,false,'Pinch accidentally opened a Tower action');
        }
        assert.equal(after.pointers,0);
      }
      // A control and the map must compose a pinch in either finger order.
      for (const commandFirst of [false,true]) {
        const point=await ev('resetTowerGesture(\'[data-clan-tower-map-action="info"]\')');
        const command={x:point.x,y:point.y,id:1};
        const map=await ev(`(()=>{
          const p=${JSON.stringify(point)};
          return [[0,90],[90,0],[-90,0],[0,-90]].map(([dx,dy])=>({x:p.x+dx,y:p.y+dy,id:2})).find(p=>{
            const node=document.elementFromPoint(p.x,p.y);
            return node&&mapFrame.contains(node)&&!node.closest('button');
          });
        })()`);
        assert(map,'Mixed pinch needs a visible map point off a control');
        const first=commandFirst?command:map,second=commandFirst?map:command;
        await touch('touchStart',[first]);await touch('touchStart',[first,second]);
        const initial=await sample();assert(initial.pinch,'Mixed pinch did not start');
        const dx=second.x-first.x,dy=second.y-first.y;
        const moved={...second,x:second.x+dx*.25,y:second.y+dy*.25};
        await touch('touchMove',[first,moved]);
        const pinched=await sample();assert(pinched.zoom>initial.zoom,'Mixed pinch did not zoom');
        await touch('touchEnd',[moved]);
        const remaining=await sample();assert.equal(remaining.pointers,1);assert(!remaining.pinch);
        await delay(100);
        await touch('touchMove',[{...first,x:first.x+35}]);
        const dragged=await sample();
        const record={width,height,commandFirst,initial,pinched,remaining,dragged};records.push(record);
        assert(Math.abs(dragged.camera.x-remaining.camera.x)>10,'Lifting one finger must continue a drag');
        await touch('touchEnd',[]);await delay(150);
        const ended=await sample();assert.equal(ended.pointers,0);assert(!ended.modal,'Mixed pinch activated a command');
        record.ended=ended;
      }
      for(const selector of ['[data-clan-building-id="shop"]','[data-clan-tower-map-action="info"]']) {
        for(const cancel of [false,true]) {
          const point=await ev(`resetTowerGesture(${JSON.stringify(selector)})`),before=await sample();
          await touch('touchStart',[{x:point.x,y:point.y,id:1}]);
          if(!cancel)await touch('touchMove',[{x:point.x+45,y:point.y,id:1}]);
          const moved=await sample();
          if(!cancel)assert(Math.abs(moved.camera.x-before.camera.x)>10,'Dragging a Tower control did not pan');
          await touch(cancel?'touchCancel':'touchEnd',[]);await delay(150);
          const after=await sample();assert.equal(after.pointers,0);assert(!after.modal,'Drag/cancellation activated a command');
          records.push({width,height,selector,cancel,before,moved,after});
        }
      }
      // A mounted row can survive selection invalidation until gesture rendering settles.
      await ev('resetTowerGesture(\'[data-clan-tower-map-action="info"]\')');
      const deferred=await ev(()=>{
        const selected=selectedTowerMapId;
        selectedTowerMapId='';
        const widths=[.4,.7,1].map(value=>{
          zoom=value;updateCameraTransform();
          return [...cityLayer.querySelectorAll('[data-clan-tower-map-action]')].map(b=>b.getBoundingClientRect().width);
        });
        selectedTowerMapId=selected;
        return widths;
      });
      assert(deferred.every(row=>row.length===3&&row.every(w=>Math.abs(w-56)<.15)),'Deferred Tower row scaled with the camera');
      records.push({width,height,deferred});
      // Ordinary building taps must still open their own panel.
      const building=await ev('resetTowerGesture(\'[data-clan-building-id="shop"]\')');
      await touch('touchStart',[{x:building.x,y:building.y,id:1}]);await touch('touchEnd',[]);
      await ready(()=>modal.open&&holdingTowerDetailsTab==='buildings'&&holdingTowerBuildingSelection==='shop');
      // The same Info target must remain usable by a single tap after a pinch.
      const point=await ev('resetTowerGesture(\'[data-clan-tower-map-action="info"]\')');
      await ready(()=>[...document.querySelectorAll('.holding-tower-art,.holding-tower-building-node>img')].every(img=>img.complete&&img.naturalWidth));
      fs.writeFileSync(path.join(dir,`map-${width}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await touch('touchStart',[{x:point.x,y:point.y,id:1}]);await touch('touchEnd',[]);
      await ready(()=>modal.open&&!!modalBody.querySelector('#clanTower-overviewPanel'));
      // Keyboard activation is not swallowed by the post-gesture click guard.
      await ev('resetTowerGesture(\'[data-clan-tower-map-action="info"]\')');
      await ev(()=>{suppressMapClick=true;document.querySelector('[data-clan-tower-map-action="info"]').focus();});
      await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
      await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await ready(()=>modal.open&&!!modalBody.querySelector('#clanTower-overviewPanel'));
      assert.deepEqual(errors,[]);
      console.log(`Tower pinch, fixed controls and single tap passed: ${width}x${height}`);
      await client.send('Browser.close');client.close();client=null;
      await waitForProcessExit(browser.browserProcess);await removeBrowserProfile(browser.profilePath);browser=null;
    }
  } finally {
    fs.writeFileSync(path.join(dir,'gestures.json'),JSON.stringify({records,errors},null,2));
    if(client){await client.send('Browser.close').catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
