'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CdpClient } = require('./map-benchmark/cdp-client');
const { createMapBenchmarkServer } = require('./map-benchmark/server');
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require('./validate-focused-browser-smoke');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && fs.existsSync(p));
  assert(executable, 'Set CHROME_PATH to a Chromium browser');
  const server = createMapBenchmarkServer(), address = await server.listen();
  const errors = [], out = path.join(root, 'release-artifacts/estate-building-labels');
  fs.mkdirSync(out, { recursive: true });
  let session, client;
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);
    const deliveredEstate = fs.readFileSync(path.join(root, 'dist/inner-city-estate.js')).toString('base64');
    let deliveredRequests = 0;
    client.on('Fetch.requestPaused', async event => {
      try {
        await client.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body: deliveredEstate });
        deliveredRequests++;
      } catch (error) { errors.push('Estate delivery: ' + error.message); }
    });
    await client.send('Fetch.enable', { patterns: [{ urlPattern: '*inner-city-estate.js*' }] });
    await client.send('Page.bringToFront');
    client.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const evaluate = async (fn, arg) => {
      const expression = typeof fn === 'function' ? '(' + fn.toString() + ')(' + JSON.stringify(arg) + ')' : fn;
      const response = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const wait = async (fn, arg) => {
      for (let i = 0; i < 400; i++) { if (await evaluate(fn, arg)) return; await delay(100); }
      throw new Error('Timed out: ' + fn.toString() + '\n' + errors.join('\n'));
    };
    const box = selector => evaluate(s => document.querySelector(s)?.getBoundingClientRect().toJSON(), selector);
    const count = selector => evaluate(s => document.querySelectorAll(s).length, selector);
    const text = selector => evaluate(s => document.querySelector(s)?.textContent, selector);
    const click = async selector => {
      await wait(s => !!document.querySelector(s)?.getBoundingClientRect().width, selector);
      await evaluate(s => document.querySelector(s).scrollIntoView({ block: 'nearest' }), selector);
      const r = await box(selector), x = r.x + r.width / 2, y = r.y + r.height / 2;
      assert(await evaluate(({ s, x, y }) => document.querySelector(s).contains(document.elementFromPoint(x, y)), { s: selector, x, y }), 'Control is covered: ' + selector);
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };
    const press = async (key, code) => {
      const physical = key === '+' ? 'Equal' : key === '0' ? 'Digit0' : key;
      const text = key === 'Enter' ? '\r' : key.length === 1 ? key : '';
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: physical, text, unmodifiedText: text, windowsVirtualKeyCode: code });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: physical, windowsVirtualKeyCode: code });
    };
    const screenshot = async file => {
      const capture = await client.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, file), Buffer.from(capture.data, 'base64'));
    };
    const assertDistrictGeography = async () => {
      const result = await evaluate(() => {
        const world=document.querySelector('.estate-world').getBoundingClientRect();
        const cityX=world.left+world.width*.5,cityY=world.top+world.height*.43;
        const boxes=[...document.querySelectorAll('[data-estate-district]')].map(e=>({key:e.dataset.estateDistrict,hidden:e.hidden,...e.getBoundingClientRect().toJSON()}));
        return {cityX,cityY,boxes};
      });
      assert.equal(result.boxes.filter(b=>!b.hidden).length,7,'Fit Estate must retain all district controls: '+JSON.stringify(result.boxes));
      for(const b of result.boxes){
        if(b.key==='city')assert(Math.abs((b.left+b.right)/2-result.cityX)<24&&Math.abs((b.top+b.bottom)/2-result.cityY)<24,'City label must stay over the city');
        if(['quarry','woodland','crafts','farmland'].includes(b.key))assert(b.right<result.cityX,'Western district label crossed to eastern scenery: '+b.key);
        if(['mine','trade'].includes(b.key))assert(b.left>result.cityX,'Eastern district label crossed to western scenery: '+b.key);
        for(const other of result.boxes.filter(o=>o.key!==b.key))assert(b.right<=other.left||b.left>=other.right||b.bottom<=other.top||b.top>=other.bottom,'District hit targets overlap');
      }
    };
    const assertNameplates = async () => {
      const report = await evaluate(() => {
        const viewport=document.querySelector('.estate-viewport').getBoundingClientRect();
        const labels=[...document.querySelectorAll('.estate-nameplate:not([hidden])')].map(e=>({key:e.dataset.estateNameplate,box:e.getBoundingClientRect().toJSON(),pointer:getComputedStyle(e).pointerEvents,font:parseFloat(getComputedStyle(e).fontSize)}));
        const art=[...document.querySelectorAll('.estate-site>img')].map(e=>e.getBoundingClientRect().toJSON());
        const controls=[...document.querySelectorAll('.estate-camera-controls,.estate-directory:not([hidden]),.estate-detail:not([hidden])')].map(e=>e.getBoundingClientRect().toJSON());
        return {viewport:viewport.toJSON(),labels,art,controls,zoom:innerCastleEstateView.snapshot().zoom};
      });
      if(report.zoom<2.5){
        assert.equal(report.labels.length,0,'Overview and intermediate zoom must show district labels only');
        assert.equal(await count('[data-estate-nameplate][hidden]'),20);
        return;
      }
      assert(report.labels.length>0,'The visible estate must show building name/level captions');
      const overlaps=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
      report.labels.forEach((label,i)=>{
        assert(label.font>=10,'Names must stay readable in screen pixels');
        assert(label.box.height<=22,'Zoomed captions must be compact single-line strips');
        assert.equal(label.pointer,'none','Captions must not intercept map or touch gestures');
        assert(label.box.left>=report.viewport.left && label.box.right<=report.viewport.right && label.box.top>=report.viewport.top && label.box.bottom<=report.viewport.bottom,'Caption must stay within the viewport: '+label.key);
        for(const other of report.labels.slice(i+1))assert(!overlaps(label.box,other.box),'Captions overlap: '+label.key+' / '+other.key);
        for(const art of report.art)assert(!overlaps(label.box,art),'Caption covers building artwork: '+label.key);
        for(const control of report.controls)assert(!overlaps(label.box,control),'Caption covers estate UI: '+label.key);
      });
    };
    const dismissGear = async (method, width) => {
      if (method === 'escape') return press('Escape', 27);
      if (method === 'backdrop') {
        const r = await box('#modal');
        assert(r.left > 5 && r.top > 5, 'Desktop backdrop must be outside equipment');
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
      } else if (width === 568) {
        const r = await box('#closeModalBtn');
        await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      } else await click('#closeModalBtn');
    };
    await client.send('Page.navigate', { url: address.url + '/__benchmark__/?scenario=A&visualMarches=0' });
    await wait(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready');
    await evaluate(() => { window.__CROWNLANDS_BENCHMARK__.closeModal(); state.gear = normalizeCommonGearState(state.gear); });
    const keys = await evaluate(() => INNER_CASTLE_BUILDINGS.map(b => b.key));
    const gearKeys = await evaluate(() => Object.keys(COMMON_GEAR.BUILDINGS));
    for (const [width, height] of [[1440, 900], [1280, 590], [844, 390], [568, 320]]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await evaluate(() => { state.gear.newMarkers.treasury = true; openInnerCastle(getMainCityReference().id); CrownlandsAnimations.setMode('full'); });
      await wait(() => document.querySelector('.estate-world').getBoundingClientRect().width > 0);
      await evaluate(() => Promise.all([...document.querySelectorAll('.estate-world img[src]')].map(i => i.decode())));
      await wait(()=>Number(getComputedStyle(modal).opacity)>=.99);
      const initial = await evaluate(() => { const v = document.querySelector('.estate-viewport').getBoundingClientRect(), w = document.querySelector('.estate-world').getBoundingClientRect(), m = modal.getBoundingClientRect(); return { v: v.toJSON(), w: w.toJSON(), m: m.toJSON(), debug: innerCastleEstateView.debug(), scroll: modalBody.scrollHeight - modalBody.clientHeight }; });
      assert.equal(initial.debug.camera.zoom, 1); assert.equal(initial.debug.actors, 0); assert.equal(initial.debug.animationRunning, false); assert(initial.scroll <= 1);
      assert(Math.abs(initial.m.width - width) < 1 && Math.abs(initial.m.height - height) < 1, 'Estate must fill viewport');
      assert(initial.w.left >= initial.v.left - 1 && initial.w.right <= initial.v.right + 1 && initial.w.top >= initial.v.top - 1 && initial.w.bottom <= initial.v.bottom + 1, 'Fit must show whole estate: ' + JSON.stringify(initial));
      assert(await evaluate(() => {
        const v=document.querySelector('.estate-viewport').getBoundingClientRect(),w=document.querySelector('.estate-world').getBoundingClientRect();
        const [left,right]=[...document.querySelectorAll('.estate-scenery')].map(i=>i.getBoundingClientRect());
        return left.left<=v.left+.6 && left.right>=w.left+2 && right.left<=w.right-2 && right.right>=v.right-.6 && left.top<=v.top+.6 && left.bottom>=v.bottom-.6;
      }), 'Painted scenery must fill both wide-screen gutters with a small ground-edge overlap');
      await screenshot('initial-' + width + 'x' + height + '.png');
      await assertDistrictGeography();
      assert.equal(await count('[data-estate-resource]'),10);
      assert.equal(await text('[data-estate-resource="timber"] dd'),'—','Production must not present draft materials as owned');
      assert.equal(await text('[data-estate-resource="gold"] dd'),await evaluate(()=>CrownlandsEstate.formatResource(Math.floor(getProjectedGold()))));
      assert(await evaluate(()=>{
        const bar=document.querySelector('.estate-resources').getBoundingClientRect(),header=document.querySelector('.estate-header').getBoundingClientRect(),viewport=document.querySelector('.estate-viewport').getBoundingClientRect();
        return Math.abs(bar.left+bar.right-header.left-header.right)<1&&bar.top>=header.bottom-.6&&bar.bottom<=viewport.top+.6&&[...document.querySelectorAll('[data-estate-resource]')].every(e=>{const r=e.getBoundingClientRect();return r.left>=bar.left&&r.right<=bar.right+.6&&r.top>=bar.top&&r.bottom<=bar.bottom+.6&&e.scrollWidth<=e.clientWidth+1;});
      }),'All ten counters must be centered, readable and outside the map at every viewport');
      await evaluate(()=>{ window.estateResourceGoldText=goldText.textContent; window.estateResourceGold=state.gold; state.gold+=10000; goldText.textContent='resource update probe'; });
      await wait(()=>document.querySelector('[data-estate-resource="gold"] dd').textContent===CrownlandsEstate.formatResource(Math.floor(getProjectedGold())));
      await evaluate(()=>{state.gold=estateResourceGold;goldText.textContent=estateResourceGoldText;});
      await assertNameplates();
      assert.equal(await count('[data-estate-nameplate]'),20);
      assert.equal(await text('[data-estate-directory-building="treasury"] small'),'Lv. 1');
      assert.equal(await text('[data-estate-directory-building="quarry"] small'),'Not built');
      assert(await evaluate(() => !!document.querySelector('[data-estate-directory-building="treasury"] .estate-new')), 'New gear must appear in the building directory');
      assert.equal(await count('.estate-actor, .estate-roads, .estate-wall, .estate-mill-sails'),0,'Estate uses cohesive painted terrain without vector overlays or ambient actors');
      assert.equal(await evaluate(()=>document.querySelector('.estate-world').getAnimations({subtree:true}).length),0,'Still estate has no ambient CSS animation');
      assert(await evaluate(()=>['quarry','mine'].every(key=>{const label=document.querySelector('[data-estate-district="'+key+'"] span').getBoundingClientRect(),art=document.querySelector('[data-estate-site="'+key+'"] img').getBoundingClientRect();return label.top>=art.bottom+5;})),'Overview extraction labels must not cover site art at any viewport size');
      for (const district of await evaluate(() => CrownlandsEstate.districts.map(d => d.key))) {
        await click('[data-estate-district="' + district + '"]'); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 2.5);
        await assertNameplates();
        if(width===844 && ['city','crafts','farmland'].includes(district))await screenshot('district-'+district+'-'+width+'x'+height+'.png');
        await click('[data-estate-fit]');
        await assertNameplates();
      }
      await evaluate(()=>innerCastleEstateView.zoom(2.49));await assertNameplates();
      await evaluate(()=>innerCastleEstateView.zoom(2.5));await assertNameplates();
      await click('[data-estate-fit]');await assertNameplates();
      for (const key of keys) {
        await click('[data-estate-directory-toggle]');
        const selector = '[data-estate-directory-building="' + key + '"]';
        await evaluate(s => document.querySelector(s).scrollIntoView({ block: 'nearest' }), selector);
        const r = await box(selector); assert(r.height >= 44 && r.width >= 44);
        await evaluate(() => { window.previousEstateView = innerCastleEstateView; });
        await click(selector);
        assert.equal(await evaluate(() => innerCastleSelectedBuildingKey), key);
        if (gearKeys.includes(key)) {
          await wait(() => !!document.querySelector('[data-gear-back]'));
          assert.equal(await evaluate(() => modal.dataset.commonGearBuildingId), key, 'Directory activation must open the matching equipment UI directly');
          assert.equal(await count('[data-gear-slot]'), 8, 'The actual officer screen must expose all eight slots');
          assert(await evaluate(() => document.activeElement.matches('[data-gear-slot]')), 'Direct gear entry must focus a slot');
          const before = await evaluate(() => innerCastleEstateCamera);
          assert.equal(before.detailOpen, false, 'Direct equipment entry must not restore the description panel');
          assert(await evaluate(() => previousEstateView.debug().destroyed && innerCastleEstateView === null), 'Gear must dispose the estate scene');
          await evaluate(() => Promise.all(modal.querySelector('.modal-card').getAnimations().map(a => a.finished.catch(() => {}))));
          if (width === 1440) await screenshot('gear-' + key + '.png');
          await click('[data-gear-back]');
          assert.deepEqual(await evaluate(() => innerCastleEstateView.snapshot()), before, 'Gear return must preserve camera');
          assert.equal(await evaluate(() => innerCastleSelectedBuildingKey), key);
          assert(await evaluate(k => !state.gear.newMarkers[k], key), 'Viewing gear clears its marker');
          assert(await evaluate(k => document.activeElement.dataset.innerCastleBuilding === k, key), 'Back must focus the selected map target');
        } else {
          assert.equal(await text('.estate-detail h3'), await evaluate(k => getInnerCastleBuilding(k).label, key));
          assert.equal(await text('.estate-building-status'), 'Function planned');
          assert.equal(await count('[data-manage-common-gear]'), 0);
        }
        assert(await evaluate(() => [...document.querySelectorAll('.estate-site')].every(s => ['none', 'normal'].includes(getComputedStyle(s, '::after').content))), 'Selecting a site must not draw a dotted plot boundary');
        const targets = await evaluate(() => [...document.querySelectorAll('.estate-building-target')].filter(e => !e.hidden).map(e => e.getBoundingClientRect().toJSON()));
        for (let i = 0; i < targets.length; i++) { assert(targets[i].width >= 44 && targets[i].height >= 44); for (let j = i + 1; j < targets.length; j++) assert(targets[i].right <= targets[j].left || targets[j].right <= targets[i].left || targets[i].bottom <= targets[j].top || targets[j].bottom <= targets[i].top, 'Map targets overlap'); }
        await assertNameplates();
      }
      // Physical map clicks/taps use the same direct entry as directory buttons.
      for (const key of gearKeys) {
        await evaluate(k => innerCastleEstateView.select(k), key);
        await click('[data-estate-detail-close]');
        const before = await evaluate(() => innerCastleEstateView.snapshot());
        const selector = '[data-inner-castle-building="' + key + '"]';
        if (width === 568) {
          await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
          const r = await box(selector), x = r.x + r.width / 2, y = r.y + r.height / 2;
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
          await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
        } else await click(selector);
        await wait(() => !!document.querySelector('[data-gear-back]'));
        assert.equal(await evaluate(() => modal.dataset.commonGearBuildingId), key, 'Map activation must open matching gear');
        await evaluate(() => Promise.all(modal.querySelector('.modal-card').getAnimations().map(a => a.finished.catch(() => {}))));
        await click('[data-gear-back]');
        assert.deepEqual(await evaluate(() => innerCastleEstateView.snapshot()), before);
        for (const method of width === 1440 ? ['close', 'escape', 'backdrop'] : ['close', 'escape']) {
          await click(selector);
          await wait(() => !!document.querySelector('[data-gear-back]'));
          assert.equal(await evaluate(() => modal.dataset.commonGearBuildingId), key);
          await evaluate(() => Promise.all(modal.querySelector('.modal-card').getAnimations().map(a => a.finished.catch(() => {}))));
          if (width === 1440 && key === 'treasury' && method === 'escape') {
            await click('[data-gear-bag-select]');
            await press('Escape', 27);
            assert(await evaluate(() => modal.open && modal.dataset.commonGearBuildingId === 'treasury'), 'Filter Escape must stay in equipment');
          }
          await dismissGear(method, width);
          try {
            await wait(() => modal.open && !!innerCastleEstateView && !modal.dataset.commonGearBuildingId);
          } catch (error) {
            await screenshot('equipment-dismiss-failure.png');
            throw new Error(JSON.stringify({ width, key, method, status: await evaluate(() => ({ open: modal.open, classes: modal.className, building: modal.dataset.commonGearBuildingId, estate: !!innerCastleEstateView, focus: document.activeElement?.outerHTML.slice(0, 160) })) }) + '\n' + error.message);
          }
          assert.deepEqual(await evaluate(() => innerCastleEstateView.snapshot()), before, method + ' must restore camera for ' + key);
          assert.equal(await evaluate(() => innerCastleSelectedBuildingKey), key);
          assert(await evaluate(k => document.activeElement.dataset.innerCastleBuilding === k, key), method + ' must restore selected building focus');
          assert.equal(await count('.estate-viewport'), 1, 'Dismissal remounts exactly one estate');
          assert.equal(await evaluate(() => innerCastleEstateView.debug().actors), 0);
          if (width === 844 && key === 'gatehouse' && method === 'close') {
            await evaluate(() => Promise.all([...document.querySelectorAll('.estate-world img[src]')].map(i => i.decode())));
            await screenshot('equipment-close-return-844x390.png');
          }
        }
      }
      await evaluate(() => Promise.all(modal.querySelector('.modal-card').getAnimations().map(a => a.finished.catch(() => {}))));
      const gestureY=(await box('.estate-viewport')).top+40;
      await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 45, y: gestureY, deltaX: 0, deltaY: -200 }); await delay(100);
      assert(await evaluate(() => innerCastleEstateView.snapshot().zoom > 2.5));
      const before = await evaluate(() => innerCastleEstateView.snapshot());
      // Move before pressing, including after touch emulation, so the browser
      // processes any pending release of its previous implicit pointer capture.
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 45, y: gestureY, buttons: 0 });
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 45, y: gestureY, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 8; i++) { await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 45 + 100 * i / 8, y: gestureY + 25 * i / 8, button: 'left', buttons: 1 }); await delay(16); }
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 145, y: gestureY+25, button: 'left', clickCount: 1 });
      const after = await evaluate(() => innerCastleEstateView.snapshot()); assert(before.x !== after.x || before.y !== after.y, 'Dragging must pan: ' + JSON.stringify({ width, before, after }));
      await evaluate(() => innerCastleEstateView.zoom(99)); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 4);
      await click('[data-estate-fit]'); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 1);
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 50, y: gestureY, id: 1 }, { x: 120, y: gestureY, id: 2 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 30, y: gestureY, id: 1 }, { x: 160, y: gestureY, id: 2 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); assert(await evaluate(() => innerCastleEstateView.snapshot().zoom > 1), 'Pinch must zoom');
      await click('[data-estate-fit]');
      const districtBox=await box('[data-estate-district="city"]'),cx=districtBox.x+districtBox.width/2,cy=districtBox.y+districtBox.height/2;
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-10,y:cy,id:1},{x:cx+10,y:cy,id:2}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-20,y:cy,id:1},{x:cx+20,y:cy,id:2}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert(Math.abs(await evaluate(()=>innerCastleEstateView.snapshot().zoom)-2)<.02,'Pinching a district label must zoom without activating it');
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await click('[data-estate-fit]'); await evaluate(() => document.querySelector('.estate-viewport').focus());
      await press('+', 187); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 1.5);
      const keyboardY = await evaluate(() => innerCastleEstateView.snapshot().y); await press('ArrowDown', 40); assert.notEqual(await evaluate(() => innerCastleEstateView.snapshot().y), keyboardY);
      await press('0', 48); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 1);
      await evaluate(() => CrownlandsAnimations.setMode('reduced')); assert.equal(await evaluate(() => innerCastleEstateView.debug().animationRunning), false);
      assert.equal(await count('.estate-actor'),0,'Reduced mode must not allocate deferred inhabitants');
      await evaluate(() => CrownlandsAnimations.setMode('off')); assert.equal(await evaluate(() => innerCastleEstateView.debug().animationRunning), false);
      await evaluate(() => { CrownlandsAnimations.setMode('full'); Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }); assert.equal(await evaluate(() => innerCastleEstateView.debug().animationRunning), false);
      await evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); assert.equal(await evaluate(() => innerCastleEstateView.debug().animationRunning), false);
      await evaluate(() => { showCityInfoModal(getMainCityReference().id); document.querySelector('#enterInnerCastleBtn').click(); window.previousEstateView = innerCastleEstateView; });
      assert.equal(await evaluate(() => document.querySelector('[data-inner-castle-back]').getAttribute('aria-label')), 'Back to Realm');
      assert.equal(await text('[data-inner-castle-back] span'), 'Back to Realm');
      const realmView = await evaluate(() => ({ region: getActiveMapRegionId(), camera: { ...camera }, zoom }));
      if (width === 1440) {
        await evaluate(() => document.querySelector('[data-inner-castle-back]').focus());
        await press('Enter', 13);
      } else if (width === 568) {
        const r = await box('[data-inner-castle-back]');
        await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      } else await click('[data-inner-castle-back]');
      await wait(() => !modal.open && innerCastleEstateView === null);
      assert(await evaluate(() => !modal.dataset.cityInfoId && !modal.dataset.innerCastleCityId && !innerCastleEstateCamera && document.activeElement === mapFrame && previousEstateView.debug().destroyed), 'Back to Realm must dispose the estate and focus the map');
      assert.deepEqual(await evaluate(() => ({ region: getActiveMapRegionId(), camera: { ...camera }, zoom })), realmView, 'Back to Realm must retain the active realm and map camera');
      await evaluate(() => openInnerCastle(getMainCityReference().id)); await click('#closeModalBtn'); await wait(() => !modal.open && innerCastleEstateView === null); assert(await evaluate(() => !modal.classList.contains('bailey-modal') && !modal.dataset.innerCastleCityId));
    }
    assert(await evaluate(() => { const city = getMainCityReference(); return canEnterInnerCastle(city) && !canEnterInnerCastle(null) && !canEnterInnerCastle({ ...city, owner: 'enemy' }) && !canEnterInnerCastle({ ...city, owner: 'neutral' }) && !canEnterInnerCastle({ ...city, id: 'not-main-city', isMainCity: false, mainCity: false }); }));
    assert(await evaluate(() => { const cities = state.cities, cache = onlineOwnedCitiesCache, main = { ...getMainCityReference() }; try { onlineOwnedCitiesCache = [...cache, main]; state.cities = cities.filter(c => c.id !== main.id); openProfileInnerCastle(); return modal.open && modal.dataset.innerCastleCityId === main.id; } finally { state.cities = cities; onlineOwnedCitiesCache = cache; } }));
    await click('[data-inner-castle-back]');
    assert(await evaluate(() => !modal.open && !innerCastleEstateView && !profileScreen.classList.contains('open') && document.activeElement === mapFrame), 'Profile estate entry must also return to the realm');
    await evaluate(() => openProfileInnerCastle());
    await click('[data-estate-directory-toggle]'); await evaluate(() => document.querySelector('[data-estate-directory-building="barracks"]').focus()); await press('Enter', 13); assert.equal(await evaluate(() => innerCastleSelectedBuildingKey), 'barracks'); await wait(() => !!document.querySelector('[data-gear-back]')); assert.equal(await evaluate(() => modal.dataset.commonGearBuildingId), 'barracks');
    const keyboardCamera = await evaluate(() => innerCastleEstateCamera);
    await press('Escape', 27);
    await wait(() => modal.open && !!innerCastleEstateView);
    assert.deepEqual(await evaluate(() => innerCastleEstateView.snapshot()), keyboardCamera);
    assert(await evaluate(() => document.activeElement.dataset.innerCastleBuilding === 'barracks'));
    await press('Escape', 27); await wait(() => !modal.open && innerCastleEstateView === null);
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    // A delayed synthetic view response must not reopen equipment after dismissal.
    await evaluate(() => {
      window.estateOriginalApi = getOnlineApi;
      getOnlineApi = () => ({ viewCommonGearBuilding: () => new Promise(resolve => { window.resolveEstateGearView = resolve; }) });
      openInnerCastle(getMainCityReference().id);
      innerCastleEstateView.select('gatehouse');
      document.querySelector('[data-estate-detail-close]').click();
    });
    await click('[data-inner-castle-building="gatehouse"]');
    await wait(() => !!document.querySelector('[data-gear-back]'));
    await click('#closeModalBtn');
    await evaluate(() => {
      window.returnedEstateView = innerCastleEstateView;
      window.returnedEstateGear = JSON.stringify(state.gear);
      resolveEstateGearView({ gear: COMMON_GEAR.createDefaultState() });
      getOnlineApi = estateOriginalApi;
    });
    await delay(100);
    assert(await evaluate(() => modal.open && innerCastleEstateView === returnedEstateView && JSON.stringify(state.gear) === returnedEstateGear && !modal.dataset.commonGearBuildingId), 'Obsolete gear response must not replace returned estate or gear');
    // Native close requests return from equipment; forced close still disposes it.
    await click('[data-inner-castle-building="gatehouse"]');
    await wait(() => !!document.querySelector('[data-gear-back]'));
    await evaluate(() => modal.requestClose());
    await wait(() => modal.open && !!innerCastleEstateView);
    await click('[data-inner-castle-building="gatehouse"]');
    await wait(() => !!document.querySelector('[data-gear-back]'));
    await evaluate(() => modal.close());
    assert(await evaluate(() => !modal.open && !innerCastleEstateView && !innerCastleEstateCamera && !modal.dataset.innerCastleCityId && !modal.dataset.commonGearBuildingId), 'Programmatic session cleanup must still close equipment');
    // An ownership change must not allow dismissal to reopen a forbidden estate.
    await evaluate(() => { openInnerCastle(getMainCityReference().id); innerCastleEstateView.select('gatehouse'); document.querySelector('[data-estate-detail-close]').click(); });
    await click('[data-inner-castle-building="gatehouse"]');
    await wait(() => !!document.querySelector('[data-gear-back]'));
    await evaluate(() => { window.estateGuardCity = getInnerCastleCity(modal.dataset.innerCastleCityId); window.estateGuardOwner = estateGuardCity.owner; estateGuardCity.owner = 'enemy'; });
    await click('#closeModalBtn');
    assert(await evaluate(() => !modal.open && !innerCastleEstateView && !modal.dataset.innerCastleCityId), 'Lost Main City ownership must close normally');
    await evaluate(() => { estateGuardCity.owner = estateGuardOwner; });
    for (const method of ['close', 'escape', 'backdrop']) {
      await evaluate(() => showCityInfoModal(getMainCityReference().id));
      await wait(() => Number(getComputedStyle(modal).opacity) >= .99 && !document.querySelector('.optional-ui-loading'));
      await dismissGear(method, 1440);
      await wait(() => !modal.open && !innerCastleEstateView);
    }
    for (const scene of ['initial', 'completed', 'constructing']) {
      const url = address.url + '/docs/visual-qa/inner-city-estate/index.html?scene=' + scene;
      await client.send('Page.navigate', { url }); await wait(expected => location.href === expected && document.readyState === 'complete' && !!window.estatePreview, url); await evaluate(() => Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i => i.decode())));
      assert.equal(await count('[data-estate-site]'), 20); if (scene !== 'initial') assert.equal(await count('[data-site-state="' + scene + '"]'), 20);
      assert.equal(await evaluate(()=>estatePreview.debug().actors),0);
      if (scene === 'completed') assert(await evaluate(()=>[...document.querySelectorAll('.estate-building-art')].every(image=>{const a=image.getBoundingClientRect(),p=image.parentElement.getBoundingClientRect();return a.left>=p.left-.6&&a.right<=p.right+.6&&a.top>=p.top-.6&&a.bottom<=p.bottom+.6;})),'Common-scale artwork stays within its reserved plot');
      assert.equal(await count('.estate-site-ground'),0,'Ground is painted into the terrain without repeated soil overlays');
      if(scene==='completed'){
        assert(await evaluate(()=>[...document.querySelectorAll('[data-estate-site]:not([data-estate-site="gatehouse"]) .estate-building-art')].every(image=>{const a=image.getBoundingClientRect(),p=image.parentElement.getBoundingClientRect();return Math.abs(p.left+p.width/2-a.left-a.width/2)<.6&&Math.abs(p.top+p.height/2-a.top-a.height/2)<.6;})),'Freestanding buildings retain the approved plot centers over their painted ground');
        assert.equal(await count('.estate-terrain-detail[src]'),0,'Overview must not request close-up tiles at 1x display density');
      }
      await screenshot('fixture-' + scene + '.png');
      if(scene==='completed'){
        // Match the supplied wide-phone view while retaining the entire 4:3 map.
        for(const [width,height] of [[1280,590],[2400,590]]){
          await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
          await wait(()=>{
            const v=document.querySelector('.estate-viewport').getBoundingClientRect(),w=document.querySelector('.estate-world').getBoundingClientRect();
            return Math.abs(w.height-v.height)<.6 && Math.abs(w.left+w.right-v.left-v.right)<1 && [...document.querySelectorAll('.estate-scenery')].every(i=>!i.hidden&&i.complete&&i.naturalWidth>0);
          });
          const coverage=await evaluate(()=>({
            v:document.querySelector('.estate-viewport').getBoundingClientRect().toJSON(),w:document.querySelector('.estate-world').getBoundingClientRect().toJSON(),
            s:[...document.querySelectorAll('.estate-scenery')].map(i=>i.getBoundingClientRect().toJSON()),
            ground:[document.querySelector('.estate-ground').clientWidth,document.querySelector('.estate-ground').clientHeight],
          }));
          assert(coverage.w.left>=coverage.v.left-.6 && coverage.w.right<=coverage.v.right+.6 && coverage.s[0].left<=coverage.v.left+.6 && coverage.s[1].right>=coverage.v.right-.6 && coverage.ground[0]===1448 && coverage.ground[1]===1086,'Phone and ultrawide scenery must fill the screen without changing the map size or crop: '+JSON.stringify({width,...coverage}));
          await screenshot('fixture-completed-'+width+'x'+height+'.png');
        }
        await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
        // A naturally fitting viewport must not fetch scenery just to mount it.
        await evaluate(()=>{
          estatePreview.destroy();
          document.querySelector('#modalBody').innerHTML='';
          document.querySelector('#modalBody').style.width='600px';
          document.querySelector('#modalBody').style.height='500px';
          window.estatePreview=CrownlandsEstate.mount(document.querySelector('#modalBody'),{cityName:'Crownlands',fixture:Object.fromEntries(CrownlandsEstate.buildings.map(b=>[b.key,'completed']))});
          const v=document.querySelector('.estate-viewport');v.style.flex='none';v.style.width='600px';v.style.height='450px';
        });
        await wait(()=>!document.querySelector('.estate-world').classList.contains('has-scenery'));
        assert.equal(await count('.estate-scenery[src]'),0,'A 4:3 viewport must not request unused outpainting');
        await evaluate(()=>{
          const v=document.querySelector('.estate-viewport');v.style.width='';v.style.height='';v.style.flex='';
          document.querySelector('#modalBody').style.width='';document.querySelector('#modalBody').style.height='';
        });
        await wait(()=>[...document.querySelectorAll('.estate-scenery')].every(i=>!i.hidden&&i.complete&&i.naturalWidth>0));
        await evaluate(()=>{estatePreview.select('gatehouse');estatePreview.zoom(4);document.querySelector('[data-estate-detail-close]').click();});
        assert.equal(await count('.estate-scenery:not([hidden])'),0,'Close-up views hide the unused scenic sides');
        await evaluate(()=>Promise.all([...document.querySelectorAll('.estate-world img[src]')].map(i=>i.decode())));
        assert(await evaluate(()=>[...document.querySelectorAll('.estate-terrain-detail:not([hidden])')].every(i=>i.naturalWidth>=1400&&i.naturalHeight>=1000)),'Zoom must render decoded native close-up terrain');
        assert(await evaluate(()=>[...document.querySelectorAll('.estate-building-art')].every(i=>i.naturalWidth/i.width>=3.2&&i.naturalHeight/i.height>=3.2)),'Zoom keeps at least 3.2x source detail for completed buildings');
        assert(await evaluate(()=>{const image=document.querySelector('[data-estate-site="gatehouse"] .estate-building-art').getBoundingClientRect(),target=document.querySelector('[data-inner-castle-building="gatehouse"]'),box=target.getBoundingClientRect();return !target.hidden&&Math.abs(image.left+image.width/2-box.left-box.width/2)<.6&&Math.abs(image.top+image.height/2-box.top-box.height/2)<.6;}),'Gatehouse click target must follow the aligned visible artwork');
        await screenshot('gatehouse-zoom-4x.png');
        await evaluate(()=>{estatePreview.select('great-hall');estatePreview.zoom(4);document.querySelector('[data-estate-detail-close]').click();});
        await evaluate(()=>Promise.all([...document.querySelectorAll('.estate-world img[src]')].map(i=>i.decode())));
        await screenshot('city-zoom-4x.png');
      }
    }
    for (const scene of ['completed', 'constructing']) {
      const url = address.url + '/docs/visual-qa/inner-city-estate/index.html?scene=' + scene + '&estateUi=1&visualMarches=0';
      await client.send('Page.navigate', { url });
      await wait(expected => location.href === expected && document.readyState === 'complete' && document.documentElement?.dataset.estateQa === 'ready', url);
      await wait(() => Number(getComputedStyle(modal).opacity) >= .99);
      assert.equal(await count('[data-site-state="' + scene + '"]'), 20);
      for (const key of gearKeys) {
        await click('[data-estate-directory-toggle]');
        await click('[data-estate-directory-building="' + key + '"]');
        if (scene === 'completed') {
          await wait(() => !!document.querySelector('[data-gear-back]'));
          assert.equal(await evaluate(() => modal.dataset.commonGearBuildingId), key);
          assert.equal(await count('[data-gear-slot]'), 8, 'Preview must use the real eight-slot equipment screen');
          await evaluate(() => Promise.all(modal.querySelector('.modal-card').getAnimations().map(a => a.finished.catch(() => {}))));
          await click(key === 'gatehouse' ? '#closeModalBtn' : '[data-gear-back]');
          assert.equal(await count('[data-site-state="completed"]'), 20, 'Gear return must keep the development fixture');
        } else {
          assert.equal(await text('.estate-detail .estate-eyebrow'), 'Under construction');
          assert.equal(await count('[data-manage-common-gear], [data-gear-back]'), 0, 'Construction sites cannot open equipment');
        }
      }
    }
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      const url=address.url+'/docs/visual-qa/inner-city-estate/index.html?scene=completed&levels=milestones&estateUi=1&visualMarches=0';
      await client.send('Page.navigate',{url});
      await wait(()=>document.documentElement?.dataset.estateQa==='ready');
      assert.equal(await text('[data-estate-resource="gold"] dd'),'2.5M');
      assert.equal(await text('[data-estate-resource="timber"] dd'),'1.2K');
      assert.equal(await text('[data-estate-resource="tools"] dd'),'48');
      assert.equal(await evaluate(()=>document.querySelector('.estate-resources').getAttribute('aria-label')),'Economy preview balances');
      await wait(()=>Number(getComputedStyle(modal).opacity)>=.99);
      const levels=await evaluate(()=>innerCastleEstateView.debug().siteLevels);
      const keys=await evaluate(()=>CrownlandsEstate.buildings.map(b=>b.key));
      keys.forEach((key,i)=>assert.equal(levels[key],[1,25,50,75,100][i%5]));
      await assertNameplates();
      await screenshot('levels-'+width+'x'+height+'.png');
      await assertDistrictGeography();
      await evaluate(()=>innerCastleEstateView.select('gatehouse'));
      assert.equal(await text('.estate-level-caption'),'Lv. 100 / 100');
      await click('[data-estate-detail-close]');
      await assertNameplates();
      await click('[data-inner-castle-building="gatehouse"]');
      await wait(()=>!!document.querySelector('[data-gear-back]'));
      await evaluate(()=>Promise.all(modal.querySelector('.modal-card').getAnimations().map(a=>a.finished.catch(()=>{}))));
      await click('[data-gear-back]');
      assert.deepEqual(await evaluate(()=>innerCastleEstateView.debug().siteLevels),levels,'Gear return must retain review levels');
      await assertNameplates();
      await screenshot('city-levels-'+width+'x'+height+'.png');
    }
    assert(deliveredRequests > 0, 'Browser checks must exercise the delivered estate script');
    assert.deepEqual(errors, []);
    console.log('PASS: all 20 sites at desktop and three landscape sizes; sharp name/level captions avoid artwork, other captions and controls; initial/unbuilt status, Level 100 and mixed-level gear returns; Back to Realm via mouse/touch/keyboard preserves the realm camera and disposes the estate; unchanged 1448x1086 art/camera, lazy scenery and detail; four real gear UIs, 32 Back returns, 36 X/touch/Escape/backdrop returns, stale responses and lifecycle guards; nonoverlapping 44px targets, keyboard/touch navigation, drag/wheel/pinch and three art fixtures.');
  } finally {
    if (client) { await client.send('Browser.close').catch(() => {}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
