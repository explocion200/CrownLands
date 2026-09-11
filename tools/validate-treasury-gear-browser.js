/* Browser integration coverage for the approved Treasury, using synthetic gear and a local API stub. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'release-artifacts/treasury-gear');
const G = require(path.join(root, 'common-gear'));
const { CdpClient } = require('./map-benchmark/cdp-client');
const { createMapBenchmarkServer } = require('./map-benchmark/server');
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require('./validate-focused-browser-smoke');
const gear = G.createDefaultState();
let sequence = 0;
function add(slot, level, equipped = false, isNew = false) {
  const definition = G.DEFINITIONS.find(d => d.buildingId === 'treasury' && d.slot === slot);
  const instanceId = `treasury-qa-${++sequence}`;
  gear.instances[instanceId] = G.normalizeInstance({ instanceId, gearKey: definition.gearKey, level, isNew, acquiredAtMs: sequence });
  if (equipped) gear.equipped.treasury[slot] = instanceId;
  return instanceId;
}
const ready = add('head', 2, true); add('head', 2); add('head', 2);
add('head', 1, false, true); add('head', 1, false, true); add('head', 1, false, true);
add('chest', 2, true); add('chest', 1);
const missing = add('pants', 3, true); add('boots', 1, true);
add('belt', 2, true); add('belt', 2); add('weapon', 3, true); add('weapon', 3);
const max = add('necklace', 5, true), stored = add('necklace', 1, false, true);

async function main() {
  const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
  assert(browser, 'Set CHROME_PATH to a Chromium browser.');
  fs.mkdirSync(out, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const results = [], errors = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await client.send('Runtime.enable'); await client.send('Page.enable');
    client.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const evaluate = async expression => {
      const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
      return r.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 480; i++) {
        if (await evaluate(expression)) return;
        await new Promise(r => setTimeout(r, 125));
      }
      throw Error('Timed out: ' + expression);
    };
    const paint = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const click = async selector => {
      const point = await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect();if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')!==b)throw Error('Obscured control: '+${JSON.stringify(selector)});return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      await paint();
    };
    const key = async (key, code, virtualKey) => {
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
      await paint();
    };
    await client.send('Page.navigate', { url: address.url + '/__benchmark__/?scenario=A&visualMarches=0' });
    await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
    await evaluate(`(async()=>{window.__CROWNLANDS_BENCHMARK__.closeModal();await new Promise(r=>setTimeout(r,50));state.gear=normalizeCommonGearState(${JSON.stringify(gear)});state.gold=128400;authoritativeShopPricing={rawBaseGoldPerHour:48000};openInnerCastle(getMainCityReference().id);})()`);
    await evaluate("Promise.all(modal.getAnimations().map(a=>a.finished.catch(()=>{})))");
    await evaluate("setAnimationModePreference('full')");
    for (const [width, height] of [[1440,900],[1024,768],[844,390],[667,375],[568,320]]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      for (const [example, id] of [['ready',ready],['missing',missing],['max',max],['empty',''],['gold',ready]]) {
        await evaluate(`state.gold=${example === 'gold' ? 12000 : 128400};selectedCommonGearInstanceId=${JSON.stringify(id)};selectedCommonGearSlot=${JSON.stringify(id ? gear.instances[id].slot : 'gloves')};selectedCommonGearBagFilter='all';commonGearMergeConfirmOpen=false;renderCommonGearBuilding('treasury');`);
        await evaluate("Promise.all([...modal.querySelectorAll('img')].map(i=>i.decode()))"); await paint();
        assert(await evaluate(`(()=>{const image=modal.querySelector('[data-treasury-officer]'),bounds=image.getBoundingClientRect(),frame=image.parentElement.getBoundingClientRect();return image.complete&&image.naturalWidth===256&&image.currentSrc.includes('treasury-master-of-coin-idle-')&&bounds.x>=frame.x&&bounds.y>=frame.y&&bounds.right<=frame.right&&bounds.bottom<=frame.bottom;})()`), `Sprite must decode and fit its frame at ${width}x${height}.`);
        const data = await evaluate(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return{modal:rect(modal),slots:[...modal.querySelectorAll('[data-gear-slot]')].map(rect),actions:[...modal.querySelectorAll('.tg-actions button')].map(rect),back:rect(modal.querySelector('[data-gear-back]')),close:rect(closeModalBtn),bodyOverflow:modalBody.scrollHeight-modalBody.clientHeight,upgradeDisabled:modal.querySelector('[data-gear-merge]')?.disabled,gray:[...modal.querySelectorAll('[data-rarity=common]')].every(e=>getComputedStyle(e).backgroundColor==='rgb(217, 218, 214)'),emptyColor:getComputedStyle(modal.querySelector('.tg-slot.is-empty')).backgroundColor,text:modal.querySelector('.tg-details').innerText};})()`);
        results.push({ width, height, example, ...data });
        if (example === 'ready') {
          const shot = await client.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(out, `runtime-${width}x${height}.png`), Buffer.from(shot.data, 'base64'));
        }
        assert(data.modal.x >= 0 && data.modal.y >= 0 && data.modal.right <= width && data.modal.bottom <= height, JSON.stringify(data.modal));
        assert.equal(data.slots.length, 8); assert(data.bodyOverflow <= 1, `Overflow: ${JSON.stringify(data)}`);
        for (const r of [...data.slots,...data.actions,data.back,data.close]) {
          assert(r.width >= 44 && r.height >= 44, `Small control at ${width}: ${JSON.stringify(r)}`);
          assert(r.bottom <= data.modal.bottom && r.right <= data.modal.right && r.y >= data.modal.y, `Clipped control at ${width}: ${JSON.stringify(r)}`);
        }
        assert(data.gray, 'Common rarity gray must persist for selected and unselected items.');
        assert.notEqual(data.emptyColor, 'rgb(217, 218, 214)');
        if (example === 'ready') {
          assert.equal(data.upgradeDisabled, false);
          assert(await evaluate("[...modal.querySelectorAll('[data-rarity=common][aria-pressed=true]')].every(e=>getComputedStyle(e).borderTopColor==='rgb(111, 61, 60)')"), 'Selected Common gear needs its burgundy border.');
        }
        if (['missing','max','gold'].includes(example)) assert.equal(data.upgradeDisabled, true);
        if (example === 'max') assert(data.text.includes('all owned cities'));
        if (example === 'gold') assert(data.text.includes('Insufficient gold'));
      }
    }
    await evaluate(`state.gold=128400;selectedCommonGearInstanceId=${JSON.stringify(ready)};renderCommonGearBuilding('treasury')`); await paint();
    await click('[data-gear-merge]');
    assert(await evaluate("modal.querySelector('[data-treasury-officer]').getAttribute('src')===TREASURY_OFFICER_ART.still"), 'Confirmation must pause decorative animation.');
    assert.equal(await evaluate('document.activeElement.hasAttribute("data-gear-merge-cancel")'), true);
    assert(await evaluate('modal.querySelector(".tg-main").inert && getComputedStyle(closeModalBtn).visibility === "hidden"'));
    await key('Tab','Tab',9); assert(await evaluate('document.activeElement.hasAttribute("data-gear-merge-confirm")'));
    await key('Tab','Tab',9); assert(await evaluate('document.activeElement.hasAttribute("data-gear-merge-cancel")'));
    const confirmShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out,'runtime-confirmation-small.png'), Buffer.from(confirmShot.data,'base64'));
    await key('Escape','Escape',27);
    assert(await evaluate('modal.open && !commonGearMergeConfirmOpen && document.activeElement.hasAttribute("data-gear-merge")'));
    assert(await evaluate("modal.querySelector('[data-treasury-officer]').getAttribute('src')===TREASURY_OFFICER_ART.idle"), 'Closing confirmation must restore full-mode animation.');
    await click('[data-gear-merge]'); await click('[data-gear-merge-cancel]');
    assert(await evaluate('!commonGearMergeConfirmOpen && document.activeElement.hasAttribute("data-gear-merge")'));
    await evaluate("const select=modal.querySelector('[data-gear-bag-select]');select.value='head';select.dispatchEvent(new Event('change')); "); await paint();
    assert.equal(await evaluate("modal.querySelectorAll('.tg-item').length"), 3);
    assert(await evaluate('document.activeElement.hasAttribute("data-gear-bag-select")'));
    await evaluate("modal.querySelector('[data-gear-bag-select]').value='all';modal.querySelector('[data-gear-bag-select]').dispatchEvent(new Event('change'));modal.querySelector('[data-gear-bag-scroll]').scrollTop=100;"); await paint();
    const priorScroll = await evaluate("modal.querySelector('[data-gear-bag-scroll]').scrollTop");
    await evaluate(`modal.querySelector('[data-gear-instance="${stored}"]').click()`); await paint();
    assert.equal(await evaluate('selectedCommonGearInstanceId'), stored);
    assert.equal(await evaluate("modal.querySelector('[data-gear-bag-scroll]').scrollTop"), priorScroll);
    await click('[data-gear-slot=gloves]'); assert(await evaluate("modal.querySelector('.tg-empty')&&!modal.querySelector('[data-gear-equip]')"));
    await evaluate("state.gear=normalizeCommonGearState({});renderCommonGearBuilding('treasury')");
    assert(await evaluate("modal.querySelector('.tg-bag').textContent.includes('Open Common Gear Boxes')"));
    // The stub only exists inside this synthetic browser. No account or production API is contacted.
    await evaluate(`state.gear=normalizeCommonGearState(${JSON.stringify(gear)});selectedCommonGearInstanceId=${JSON.stringify(ready)};renderCommonGearBuilding('treasury');window.__treasuryCalls=[];window.__treasuryOriginalApi=getOnlineApi;getOnlineApi=()=>({unequipCommonGear:args=>new Promise((resolve,reject)=>{window.__treasuryCalls.push({action:'unequip',args});window.__treasuryReject=reject;}),equipCommonGear:async args=>{window.__treasuryCalls.push({action:'equip',args});throw Error('Synthetic equip rejection');},upgradeCommonGear:args=>new Promise(resolve=>{window.__treasuryCalls.push({action:'upgrade',args});window.__treasuryResolve=resolve;})});`); await paint();
    await click('[data-gear-equip]');
    assert(await evaluate('commonGearActionInFlight && [...modal.querySelectorAll(".tg-actions button")].every(b=>b.disabled)'));
    await evaluate("modal.querySelector('[data-gear-equip]').click();window.__treasuryReject(Error('Synthetic unequip rejection'))");
    await wait('!commonGearActionInFlight'); assert.equal(await evaluate('__treasuryCalls.length'), 1);
    await evaluate(`selectedCommonGearInstanceId=${JSON.stringify(stored)};renderCommonGearBuilding('treasury')`); await paint();
    await click('[data-gear-equip]'); await wait('!commonGearActionInFlight');
    assert.equal(await evaluate('__treasuryCalls[1].action'), 'equip');
    await evaluate(`selectedCommonGearInstanceId=${JSON.stringify(ready)};renderCommonGearBuilding('treasury')`); await paint();
    await click('[data-gear-merge]'); await click('[data-gear-merge-confirm]');
    assert(await evaluate('commonGearActionInFlight && __treasuryCalls[2].args.requestId && __treasuryCalls[2].args.instanceId === '+JSON.stringify(ready)));
    await evaluate(`(()=>{const next=normalizeCommonGearState(state.gear);const receipt=COMMON_GEAR.consumeUpgradeInputs(next,${JSON.stringify(ready)},'treasury-upgraded',Date.now());next.updatedAtMs=Date.now();window.__treasuryResolve({gear:next,upgradedInstanceId:'treasury-upgraded',consumedInstanceIds:receipt.consumedInstanceIds});})()`);
    await wait('!commonGearActionInFlight');
    assert(await evaluate("selectedCommonGearInstanceId==='treasury-upgraded' && createCommonGearViewModel('treasury').selected.level===3 && Object.keys(state.gear.instances).length===15"));
    await evaluate('getOnlineApi=window.__treasuryOriginalApi');
    for (const mode of ['reduced', 'off', 'full']) {
      await evaluate(`setAnimationModePreference('${mode}')`);
      await wait(`modal.querySelector('[data-treasury-officer]').getAttribute('src')===TREASURY_OFFICER_ART.${mode === 'full' ? 'idle' : 'still'}`);
    }
    await evaluate("volatileAnimationModePreference='';localStorage.removeItem(ANIMATION_MODE_STORAGE_KEY);localStorage.removeItem(LEGACY_ANIMATION_MODE_STORAGE_KEY);renderAnimationModeSetting()");
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await wait("modal.querySelector('[data-treasury-officer]').getAttribute('src')===TREASURY_OFFICER_ART.still");
    await evaluate("setAnimationModePreference('full')");
    await wait("modal.querySelector('[data-treasury-officer]').getAttribute('src')===TREASURY_OFFICER_ART.idle");
    await client.send('Emulation.setEmulatedMedia', { features: [] });
    // Simulate visibility events without depending on headless browser tab scheduling.
    await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
    assert(await evaluate("modal.querySelector('[data-treasury-officer]').getAttribute('src')===TREASURY_OFFICER_ART.still"));
    await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
    await wait("modal.querySelector('[data-treasury-officer]').getAttribute('src')===TREASURY_OFFICER_ART.idle");
    await evaluate("modal.querySelector('[data-treasury-officer]').dispatchEvent(new Event('error'))");
    assert(await evaluate("modal.querySelector('[data-treasury-officer]').getAttribute('src')===TREASURY_OFFICER_ART.still"), 'A failed animation must fall back to the still.');
    await evaluate("renderCommonGearBuilding('treasury')");
    await click('[data-gear-back]'); assert(await evaluate("modal.classList.contains('bailey-modal')&&!modal.dataset.commonGearBuildingId"));
    assert(await evaluate('disposeTreasuryGearPortrait===null'), 'Back must dispose portrait listeners.');
    for (const building of ['barracks','gatehouse','royal-stables']) {
      await evaluate(`renderCommonGearBuilding(${JSON.stringify(building)})`); await paint();
      assert(await evaluate("!!modal.querySelector('.common-gear-screen')&&!modal.querySelector('.tg-shell')"));
      await click('[data-gear-back]');
    }
    await evaluate("renderCommonGearBuilding('treasury')"); await paint(); await click('#closeModalBtn');
    await wait('!modal.open');
    await wait('disposeTreasuryGearPortrait===null');
    assert.equal(errors.length,0,JSON.stringify(errors));
    fs.writeFileSync(path.join(out,'runtime-checks.json'),JSON.stringify({results,errors,interactions:'passed'},null,2));
    console.log('PASS: Treasury runtime, 25 desktop/landscape states, sprite decoding/containment, animation settings/system preference/visibility/error fallback/cleanup, 44px controls, gray rarity surfaces, confirmation focus/Tab/Escape, selection/filter/scroll, empty inventory, pending/error action guards, upgrade response identity, Back/Close and other-officer isolation.');
  } finally {
    if (client) await client.send('Browser.close').catch(()=>{});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
