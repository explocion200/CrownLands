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
  const errors = [], out = path.join(root, 'release-artifacts/inner-city-estate');
  fs.mkdirSync(out, { recursive: true });
  let session, client;
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);
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
    await client.send('Page.navigate', { url: address.url + '/__benchmark__/?scenario=A&visualMarches=0' });
    await wait(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready');
    await evaluate(() => { window.__CROWNLANDS_BENCHMARK__.closeModal(); state.gear = normalizeCommonGearState(state.gear); });
    const keys = await evaluate(() => INNER_CASTLE_BUILDINGS.map(b => b.key));
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await evaluate(() => { state.gear.newMarkers.treasury = true; openInnerCastle(getMainCityReference().id); CrownlandsAnimations.setMode('full'); });
      await wait(() => document.querySelector('.estate-world').getBoundingClientRect().width > 0);
      await evaluate(() => Promise.all([...document.querySelectorAll('.estate-world img')].map(i => i.decode())));
      await wait(()=>Number(getComputedStyle(modal).opacity)>=.99);
      const initial = await evaluate(() => { const v = document.querySelector('.estate-viewport').getBoundingClientRect(), w = document.querySelector('.estate-world').getBoundingClientRect(), m = modal.getBoundingClientRect(); return { v: v.toJSON(), w: w.toJSON(), m: m.toJSON(), debug: innerCastleEstateView.debug(), scroll: modalBody.scrollHeight - modalBody.clientHeight }; });
      assert.equal(initial.debug.camera.zoom, 1); assert.equal(initial.debug.actors, 0); assert.equal(initial.debug.animationRunning, false); assert(initial.scroll <= 1);
      assert(Math.abs(initial.m.width - width) < 1 && Math.abs(initial.m.height - height) < 1, 'Estate must fill viewport');
      assert(initial.w.left >= initial.v.left - 1 && initial.w.right <= initial.v.right + 1 && initial.w.top >= initial.v.top - 1 && initial.w.bottom <= initial.v.bottom + 1, 'Fit must show whole estate: ' + JSON.stringify(initial));
      await screenshot('initial-' + width + 'x' + height + '.png');
      assert(await evaluate(() => !!document.querySelector('[data-estate-directory-building="treasury"] .estate-new')), 'New gear must appear in the building directory');
      assert.equal(await count('.estate-actor, .estate-roads, .estate-wall, .estate-mill-sails'),0,'Estate uses cohesive painted terrain without vector overlays or ambient actors');
      assert.equal(await evaluate(()=>document.querySelector('.estate-world').getAnimations({subtree:true}).length),0,'Still estate has no ambient CSS animation');
      assert(await evaluate(()=>['quarry','mine'].every(key=>{const label=document.querySelector('[data-estate-district="'+key+'"] span').getBoundingClientRect(),art=document.querySelector('[data-estate-site="'+key+'"] img').getBoundingClientRect();return label.top>=art.bottom+5;})),'Overview extraction labels must not cover site art at any viewport size');
      for (const district of await evaluate(() => CrownlandsEstate.districts.map(d => d.key))) {
        await click('[data-estate-district="' + district + '"]'); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 2.5); await click('[data-estate-fit]');
      }
      for (const key of keys) {
        await click('[data-estate-directory-toggle]');
        const selector = '[data-estate-directory-building="' + key + '"]';
        await evaluate(s => document.querySelector(s).scrollIntoView({ block: 'nearest' }), selector);
        const r = await box(selector); assert(r.height >= 44 && r.width >= 44); await click(selector);
        assert.equal(await evaluate(() => innerCastleSelectedBuildingKey), key);
        assert.equal(await text('.estate-detail h3'), await evaluate(k => getInnerCastleBuilding(k).label, key));
        const targets = await evaluate(() => [...document.querySelectorAll('.estate-building-target')].filter(e => !e.hidden).map(e => e.getBoundingClientRect().toJSON()));
        for (let i = 0; i < targets.length; i++) { assert(targets[i].width >= 44 && targets[i].height >= 44); for (let j = i + 1; j < targets.length; j++) assert(targets[i].right <= targets[j].left || targets[j].right <= targets[i].left || targets[i].bottom <= targets[j].top || targets[j].bottom <= targets[i].top, 'Map targets overlap'); }
        if (await count('[data-manage-common-gear]')) {
          const gear = await box('[data-manage-common-gear]'), panel = await box('.estate-detail'); assert(gear.y + gear.height <= panel.y + panel.height + 1, 'Manage Gear must stay visible');
          const before = await evaluate(() => { window.previousEstateView = innerCastleEstateView; return innerCastleEstateView.snapshot(); });
          await click('[data-manage-common-gear]'); await wait(() => !!document.querySelector('[data-gear-back]'));
          await evaluate(() => Promise.all(modal.querySelector('.modal-card').getAnimations().map(a => a.finished.catch(() => {}))));
          assert(await evaluate(() => previousEstateView.debug().destroyed && innerCastleEstateView === null), 'Gear must dispose scene animation');
          await click('[data-gear-back]'); assert.deepEqual(await evaluate(() => innerCastleEstateView.snapshot()), before, 'Gear return must preserve camera'); assert.equal(await evaluate(() => innerCastleSelectedBuildingKey), key); assert(await evaluate(k => !state.gear.newMarkers[k], key), 'Viewing gear clears its marker');
        } else assert.equal(await text('.estate-building-status'), 'Function planned');
      }
      await click('[data-estate-detail-close]');
      await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 45, y: 120, deltaX: 0, deltaY: -200 }); await delay(100);
      assert(await evaluate(() => innerCastleEstateView.snapshot().zoom > 2.5));
      const before = await evaluate(() => innerCastleEstateView.snapshot());
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 45, y: 120, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 8; i++) await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 45 + 100 * i / 8, y: 120 + 25 * i / 8, buttons: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 145, y: 145, button: 'left', clickCount: 1 });
      const after = await evaluate(() => innerCastleEstateView.snapshot()); assert(before.x !== after.x || before.y !== after.y, 'Dragging must pan');
      await evaluate(() => innerCastleEstateView.zoom(99)); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 4);
      await click('[data-estate-fit]'); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 1);
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 50, y: 120, id: 1 }, { x: 120, y: 120, id: 2 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 30, y: 120, id: 1 }, { x: 160, y: 120, id: 2 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); assert(await evaluate(() => innerCastleEstateView.snapshot().zoom > 1), 'Pinch must zoom'); await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await click('[data-estate-fit]'); await evaluate(() => document.querySelector('.estate-viewport').focus());
      await press('+', 187); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 1.5);
      const keyboardY = await evaluate(() => innerCastleEstateView.snapshot().y); await press('ArrowDown', 40); assert.notEqual(await evaluate(() => innerCastleEstateView.snapshot().y), keyboardY);
      await press('0', 48); assert.equal(await evaluate(() => innerCastleEstateView.snapshot().zoom), 1);
      await evaluate(() => CrownlandsAnimations.setMode('reduced')); assert.equal(await evaluate(() => innerCastleEstateView.debug().animationRunning), false);
      assert.equal(await count('.estate-actor'),0,'Reduced mode must not allocate deferred inhabitants');
      await evaluate(() => CrownlandsAnimations.setMode('off')); assert.equal(await evaluate(() => innerCastleEstateView.debug().animationRunning), false);
      await evaluate(() => { CrownlandsAnimations.setMode('full'); Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }); assert.equal(await evaluate(() => innerCastleEstateView.debug().animationRunning), false);
      await evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); assert.equal(await evaluate(() => innerCastleEstateView.debug().animationRunning), false);
      await evaluate(() => { window.previousEstateView = innerCastleEstateView; showCityInfoModal(getMainCityReference().id); document.querySelector('#enterInnerCastleBtn').click(); });
      await click('[data-inner-castle-back]'); assert(await evaluate(() => modal.dataset.cityInfoId === getMainCityReference().id && document.activeElement.id === 'enterInnerCastleBtn'));
      await evaluate(() => openInnerCastle(getMainCityReference().id)); await click('#closeModalBtn'); await wait(() => !modal.open && innerCastleEstateView === null); assert(await evaluate(() => !modal.classList.contains('bailey-modal') && !modal.dataset.innerCastleCityId));
    }
    assert(await evaluate(() => { const city = getMainCityReference(); return canEnterInnerCastle(city) && !canEnterInnerCastle(null) && !canEnterInnerCastle({ ...city, owner: 'enemy' }) && !canEnterInnerCastle({ ...city, owner: 'neutral' }) && !canEnterInnerCastle({ ...city, id: 'not-main-city', isMainCity: false, mainCity: false }); }));
    assert(await evaluate(() => { const cities = state.cities, cache = onlineOwnedCitiesCache, main = { ...getMainCityReference() }; try { onlineOwnedCitiesCache = [...cache, main]; state.cities = cities.filter(c => c.id !== main.id); openProfileInnerCastle(); return modal.open && modal.dataset.innerCastleCityId === main.id; } finally { state.cities = cities; onlineOwnedCitiesCache = cache; } }));
    await click('[data-estate-directory-toggle]'); await evaluate(() => document.querySelector('[data-estate-directory-building="barracks"]').focus()); await press('Enter', 13); assert.equal(await evaluate(() => innerCastleSelectedBuildingKey), 'barracks'); await press('Escape', 27); await wait(() => !modal.open && innerCastleEstateView === null);
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const scene of ['initial', 'completed', 'constructing']) {
      const url = address.url + '/docs/visual-qa/inner-city-estate/index.html?scene=' + scene;
      await client.send('Page.navigate', { url }); await wait(expected => location.href === expected && document.readyState === 'complete' && !!window.estatePreview, url); await evaluate(() => Promise.all([...document.images].map(i => i.decode())));
      assert.equal(await count('[data-estate-site]'), 20); if (scene !== 'initial') assert.equal(await count('[data-site-state="' + scene + '"]'), 20);
      assert.equal(await evaluate(()=>estatePreview.debug().actors),0);
      if (scene === 'completed') assert(await evaluate(()=>[...document.querySelectorAll('.estate-building-art')].every(image=>{const a=image.getBoundingClientRect(),p=image.parentElement.getBoundingClientRect();return a.left>=p.left-.6&&a.right<=p.right+.6&&a.top>=p.top-.6&&a.bottom<=p.bottom+.6;})),'Common-scale artwork stays within its reserved plot');
      await screenshot('fixture-' + scene + '.png');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: all 20 sites at desktop and two landscape sizes, complete overview, nonoverlapping 44px targets, visible gear actions and 12 camera-preserving gear returns, drag/wheel/pinch, zoom clamps, still scene in every animation mode, no overlay roads or actors, Back/focus/Close/Escape cleanup, ownership guard, off-map Profile and three art fixtures.');
  } finally {
    if (client) { await client.send('Browser.close').catch(() => {}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
