/* Real theme cascade, synthetic inventory and local-only equip receipts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../common-gear');
const { CdpClient } = require('./map-benchmark/cdp-client');
const { createMapBenchmarkServer } = require('./map-benchmark/server');
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require('./validate-focused-browser-smoke');

const colors = {
  common: 'rgb(217, 218, 214)', uncommon: 'rgb(199, 210, 180)',
  rare: 'rgb(191, 206, 216)', epic: 'rgb(211, 196, 218)', legendary: 'rgb(227, 196, 132)',
};
const out = path.resolve(__dirname, '../release-artifacts/gear-rarity-backgrounds');

async function main() {
  const browser = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
  assert(browser, 'Set CHROME_PATH to a Chromium browser.');
  fs.mkdirSync(out, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const results = [], errors = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await client.send('Runtime.enable'); await client.send('Page.enable');
    await client.send('Network.enable');
    await client.send('Network.setBlockedURLs', { urls: ['https://*'] });
    client.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const ev = async expression => {
      const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
      return r.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 480; i++) {
        if (await ev(expression)) return;
        await new Promise(r => setTimeout(r, 125));
      }
      throw Error('Timed out: ' + expression);
    };
    const paint = () => ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const point = async selector => {
      await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'});void 0`);
      await paint();
      return ev(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect();
        if(!b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('Obscured control: '+${JSON.stringify(selector)});
        return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    };
    const click = async selector => {
      const p = await point(selector);
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
      await paint();
    };
    const checkSurfaces = async label => {
      const surfaces = await ev(`Array.from(modal.querySelectorAll('[data-rarity]:not([data-rarity=""])'),e=>({
        kind:e.className,rarity:e.dataset.rarity,color:getComputedStyle(e).backgroundColor,
        selected:e.getAttribute('aria-pressed')==='true',border:getComputedStyle(e).borderTopColor}))`);
      assert(surfaces.length >= 14, 'All five rarities must be rendered, not an empty asynchronous screen.');
      assert.deepEqual([...new Set(surfaces.map(s => s.rarity))].sort(), [...G.RARITIES].sort());
      for (const s of surfaces) {
        assert.equal(s.color, colors[s.rarity], `${label}: ${s.kind}/${s.rarity} lost its rarity background`);
        if (s.selected) assert.equal(s.border, 'rgb(111, 61, 60)', `${label}: selected gear needs its burgundy border`);
      }
      return surfaces;
    };
    await client.send('Page.navigate', { url: address.url + '/__benchmark__/?scenario=A&visualMarches=0' });
    await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
    await ev(`(async()=>{window.__CROWNLANDS_BENCHMARK__.closeModal();await new Promise(r=>setTimeout(r,100));
      state.gold=1e15;openInnerCastle(getMainCityReference().id);setAnimationModePreference('off');})()`);
    await ev('Promise.all([document.fonts.ready,...modal.getAnimations().map(a=>a.finished.catch(()=>{}))])');
    // The API exists only in this synthetic page; no player or production data is used.
    await ev(`window.__gearCalls=[];getOnlineApi=()=>({
      equipCommonGear:async({instanceId})=>{__gearCalls.push('equip');const g=normalizeCommonGearState(state.gear),i=g.instances[instanceId];g.equipped[i.buildingId][i.slot]=instanceId;g.updatedAtMs=Date.now();return{currentUser:{gear:g}};},
      unequipCommonGear:async({instanceId})=>{__gearCalls.push('unequip');const g=normalizeCommonGearState(state.gear),i=g.instances[instanceId];g.equipped[i.buildingId][i.slot]='';g.updatedAtMs=Date.now();return{currentUser:{gear:g}};}
    });void 0`);
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      for (const building of Object.keys(G.BUILDINGS)) {
        const gear = G.createDefaultState();
        G.RARITIES.forEach((rarity, i) => {
          const d = G.DEFINITIONS.find(d => d.buildingId === building && d.slot === G.SLOTS[i] && d.rarity === rarity);
          for (const n of [0, 1]) {
            const id = rarity + n;
            gear.instances[id] = G.normalizeInstance({ instanceId: id, gearKey: d.gearKey, level: 1 });
          }
          gear.equipped[building][d.slot] = rarity + '0';
        });
        await ev(`state.gear=normalizeCommonGearState(${JSON.stringify(gear)});selectedCommonGearInstanceId='uncommon0';
          selectedCommonGearSlot=${JSON.stringify(G.SLOTS[1])};selectedCommonGearBagFilter='all';commonGearMergeConfirmOpen=false;
          renderCommonGearBuilding(${JSON.stringify(building)});void 0`);
        await wait(`!!modal.querySelector('[data-${building}-officer]')`);
        await ev("Promise.all([...modal.querySelectorAll('img')].map(i=>i.decode()))"); await paint();
        const label = `${building} ${width}x${height}`;
        for (const rarity of G.RARITIES) {
          await click(`[data-gear-instance="${rarity}0"]`);
          assert.equal(await ev('selectedCommonGearInstanceId'), rarity + '0');
          await checkSurfaces(label);
          for (const selector of [`[data-gear-instance="${rarity}0"]`, `.tg-slot[data-rarity="${rarity}"]`]) {
            await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...await point(selector) });
            await paint();
            const hoverColor = rarity === 'common' ? 'rgb(228, 229, 225)' : colors[rarity];
            assert.equal(await ev(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).backgroundColor`), hoverColor, `${label}: hover must retain the officer's rarity treatment`);
          }
          await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
          await click('[data-gear-merge]');
          assert.equal(await ev("modal.querySelectorAll('.tg-confirm-art').length"), 2);
          await checkSurfaces(label + ' confirmation');
          await click('[data-gear-merge-cancel]');
        }
        await click('[data-gear-instance="uncommon0"]');
        await click('[data-gear-equip]'); await wait('!commonGearActionInFlight');
        assert.equal(await ev(`state.gear.equipped[${JSON.stringify(building)}][${JSON.stringify(G.SLOTS[1])}]`), '');
        await checkSurfaces(label + ' unequipped');
        await click('[data-gear-equip]'); await wait('!commonGearActionInFlight');
        assert.equal(await ev(`state.gear.equipped[${JSON.stringify(building)}][${JSON.stringify(G.SLOTS[1])}]`), 'uncommon0');
        const surfaces = await checkSurfaces(label + ' re-equipped');
        assert.equal(await ev("getComputedStyle(modal.querySelector('.tg-slot.is-empty')).backgroundColor"), 'rgb(244, 234, 209)', 'Empty slots retain the shared parchment.');
        assert.equal(await ev("getComputedStyle(modal.querySelector('[data-gear-equip]')).backgroundColor"), 'rgb(244, 234, 209)', 'Ordinary action buttons retain the shared theme.');
        await ev("modal.querySelector('[data-gear-bag-scroll]').scrollTop=0;void 0"); await paint();
        const bounds = await ev('(()=>{const r=modal.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,overflow:modalBody.scrollHeight-modalBody.clientHeight}})()');
        assert(bounds.x >= 0 && bounds.y >= 0 && bounds.right <= width && bounds.bottom <= height && bounds.overflow <= 1, `${label}: gear window must fit`);
        fs.writeFileSync(path.join(out, `${building}-${width}x${height}.png`), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
        results.push({ building, width, height, surfaces, bounds });
      }
    }
    assert.equal(await ev('__gearCalls.length'), 24, 'Each officer and viewport must exercise Unequip and Equip.');
    assert.deepEqual(errors, [], 'No uncaught browser errors.');
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log('PASS: five rarity backgrounds, selection/hover, upgrade preview and equip round trips across four officers at desktop and two landscape-mobile sizes.');
  } finally {
    if (client) await client.send('Browser.close').catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
