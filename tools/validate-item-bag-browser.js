/* Actual Item Bag with synthetic inventory/API results. No production account or writes. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { CdpClient } = require('./map-benchmark/cdp-client');
const { createMapBenchmarkServer } = require('./map-benchmark/server');
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require('./validate-focused-browser-smoke');
const out = path.resolve(__dirname, '../release-artifacts/bag-inventory');

function installBagFixture() {
  window.__bagQA = { mode: 'ok', calls: [], counts: {}, effects: {}, refreshes: 0, handoffs: 0, eligible: false };
  const q = window.__bagQA;
  usesServerEconomyAuthority = () => true;
  supportsInstantEconomyActionBatching = () => true;
  saveGame = () => {};
  getOnlineApi = () => ({ getUser: () => ({ uid: 'bag-fixture' }), activateInventoryItem: async ({ itemId, quantity }) => {
    q.calls.push({ itemId, quantity });
    if (q.mode === 'slow') { await new Promise(resolve => { q.resolve = resolve; }); q.mode = 'ok'; }
    if (q.mode === 'fail') { q.mode = 'ok'; throw Error('Synthetic item rejection'); }
    const key = { war_drums_30m: 'warDrumsExpiresAtMs', royal_tax_decree_30m: 'royalTaxDecreeExpiresAtMs', shield_12h: 'shieldExpiresAtMs', veil_of_silence_30m: 'veilOfSilenceExpiresAtMs' }[itemId];
    const durationMs = { war_drums_30m: WAR_DRUMS_DURATION_MS, royal_tax_decree_30m: ROYAL_TAX_DECREE_DURATION_MS, shield_12h: ROYAL_PEACE_SHIELD_DURATION_MS, veil_of_silence_30m: VEIL_OF_SILENCE_DURATION_MS }[itemId];
    q.counts[itemId] -= quantity; q.effects[key] = Math.max(Date.now(), q.effects[key] || 0) + durationMs * quantity;
    return { activatedQuantity: quantity, expiresAtMs: q.effects[key], effectDurationAddedMs: durationMs * quantity, currentUser: { shopItems: { ...q.counts }, itemEffects: { ...q.effects } } };
  }});
  refreshServerEconomy = async () => { q.refreshes++; applyServerEconomyResult({ currentUser: { shopItems: { ...q.counts }, itemEffects: { ...q.effects } } }); return true; };
  getOutgoingAttacks = () => q.eligible ? [{ id: 'bag-qa-march' }] : [];
  isSwiftMarchOrderEligible = () => q.eligible; isRecallHornEligible = () => q.eligible;
  showOutgoingAttacksModal = () => { q.handoffs++; };
  q.reset = (sample = 'ready') => {
    clearInstantEconomyActions(); q.calls = []; q.mode = 'ok'; q.refreshes = 0; q.handoffs = 0; q.eligible = false;
    q.counts = Object.fromEntries(SHOP_ITEMS.map((i, n) => [i.id, [2, 12, 8, 3, 4, 2][n]])); q.effects = {};
    state.gear = COMMON_GEAR.createDefaultState(); state.gear.commonGearBoxes = 5;
    selectedInventoryCategory = 'all'; selectedInventoryPage = 0; selectedInventoryItemId = sample === 'unselected' ? '' : COMMON_GEAR_BOX_ITEM.id;
    if (sample === 'boost') { selectedInventoryItemId = WAR_DRUMS_ITEM_ID; q.effects.warDrumsExpiresAtMs = Date.now() + 18 * 60000; }
    if (sample === 'shield') { selectedInventoryItemId = ROYAL_PEACE_SHIELD_ITEM_ID; q.effects.shieldExpiresAtMs = Date.now() + 2 * 3600000; }
    if (['empty', 'category-empty', 'last'].includes(sample)) { q.counts = Object.fromEntries(SHOP_ITEMS.map(i => [i.id, 0])); state.gear.commonGearBoxes = 0; selectedInventoryItemId = ''; }
    if (sample === 'last') { q.counts[WAR_DRUMS_ITEM_ID] = 1; selectedInventoryItemId = WAR_DRUMS_ITEM_ID; }
    if (sample === 'category-empty') { state.gear.commonGearBoxes = 5; selectedInventoryCategory = 'war'; }
    if (sample === 'large') { q.counts = Object.fromEntries(SHOP_ITEMS.map(i => [i.id, 1000000])); state.gear.commonGearBoxes = 1000000; }
    state.shopItems = { ...q.counts }; state.itemEffects = { ...q.effects }; selectedInventoryEntryKey = selectedInventoryItemId; showInventoryModal();
  };
  q.reset();
}

async function main() {
  const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
  assert(browser, 'A Chromium browser is required.'); fs.mkdirSync(out, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen(); let session, client;
  const results = [], errors = [], missing = [];
  try {
    session = await startBrowserSession(browser); client = await CdpClient.connect(session.targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await client.send('Runtime.enable'); await client.send('Page.enable'); await client.send('Network.enable');
    client.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    client.on('Network.responseReceived', e => {
      // The fixture server has no public /play/ update-probe route; presentation assets must all load.
      const url = new URL(e.response.url);
      const fixtureUpdateProbe = url.pathname === '/play/' && url.searchParams.has('updateCheck');
      if (e.response.url.startsWith(address.url) && e.response.status >= 400 && !fixtureUpdateProbe) missing.push(e.response.url);
    });
    const evaluate = async expression => { const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const wait = async expression => { for (let i = 0; i < 480; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 125)); } throw Error('Timed out: ' + expression); };
    const paint = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const shot = async name => { const s = await client.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(s.data, 'base64')); };
    const click = async selector => { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')!==e)throw Error('Obscured '+${JSON.stringify(selector)});return{x:r.x+r.width/2,y:r.y+r.height/2}})()`); for (const type of ['mousePressed', 'mouseReleased']) await client.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 }); await paint(); };
    await client.send('Page.navigate', { url: address.url + '/__benchmark__/?scenario=A&visualMarches=0' });
    await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'"); await evaluate(`(${installBagFixture.toString()})()`);
    for (const [width, height] of [[1440,900], [844,390], [568,320]]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      for (const sample of ['ready', 'unselected', 'shield', 'boost', 'last', 'empty', 'category-empty', 'large']) {
        await evaluate(`__bagQA.reset('${sample}')`); await paint(); await evaluate("Promise.all([...modal.querySelectorAll('img')].map(i=>i.decode()))");
        const data = await evaluate(`(()=>{const r=modal.getBoundingClientRect(),buttons=[...modal.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return{label:e.ariaLabel||e.textContent,w:b.width,h:b.height,inside:b.x>=r.x&&b.y>=r.y&&b.right<=r.right+1&&b.bottom<=r.bottom+1}}),tiles=[...modal.querySelectorAll('[data-inventory-select]')].map(e=>{const a=e.querySelector('img').getBoundingClientRect(),n=e.querySelector('.ib-item-name'),b=n.getBoundingClientRect();return{artAboveLabel:a.bottom<=b.y+1,nameClipped:n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1}});return{within:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,bodyOverflow:modalBody.scrollHeight-modalBody.clientHeight,buttons,tiles,slots:modal.querySelectorAll('.ib-item-grid>*').length,chest:modal.querySelector('.ib-selected-art img')?.getAttribute('src'),columns:modal.querySelector('.ib-item-grid')?getComputedStyle(modal.querySelector('.ib-item-grid')).gridTemplateColumns.split(' ').length:0}})()`);
        await shot(`runtime-${width}x${height}-${sample}`);
        assert(data.within && data.bodyOverflow <= 1, JSON.stringify({ width,height,sample,...data }));
        assert(data.buttons.every(b => b.w >= 44 && b.h >= 44 && b.inside), JSON.stringify({ width,height,sample,buttons:data.buttons }));
        assert(data.tiles.every(t => t.artAboveLabel && !t.nameClipped), JSON.stringify({ width,height,sample,tiles:data.tiles }));
        if (data.slots) { assert.equal(data.slots, 8); assert.equal(data.columns, 4); }
        if (sample === 'ready') assert.equal(data.chest, 'assets/icons/common-gear-chest-r1.svg');
        results.push({ width,height,sample,...data });
      }
    }
    await evaluate("__bagQA.reset('ready')");
    const definitions = await evaluate('[COMMON_GEAR_BOX_ITEM,...SHOP_ITEMS].map(({id,label,description,bagCategory})=>({id,label,description,bagCategory}))');
    for (const item of definitions) { await click(`[data-inventory-item="${item.id}"]`); assert.equal(await evaluate("modal.querySelector('.ib-description').textContent"), item.description); assert.equal(await evaluate('document.activeElement.dataset.inventoryItem'), item.id); }
    for (const category of ['all','boosts','war','defense','utility']) { await click(`[data-inventory-category="${category}"]`); assert.deepEqual(await evaluate("[...modal.querySelectorAll('[data-inventory-item]')].map(e=>e.dataset.inventoryItem)"), definitions.filter(i => category === 'all' || i.bagCategory === category).map(i => i.id)); assert.equal(await evaluate('selectedInventoryEntryKey'), ''); }
    await evaluate("__bagQA.reset('shield')"); assert(await evaluate("modal.querySelector('[data-inventory-use]').disabled"));
    await evaluate('state.itemEffects.shieldExpiresAtMs=Date.now()+100'); await wait("!modal.querySelector('[data-inventory-use]').disabled"); assert(await evaluate("[...modal.querySelectorAll('[data-inventory-active]')].every(e=>e.hidden)"));
    await evaluate("__bagQA.reset('boost');__bagQA.mode='slow'"); await click('[data-inventory-use]'); await wait('__bagQA.calls.length===1'); assert.equal(await evaluate('getProjectedInventoryCount(WAR_DRUMS_ITEM_ID)'), 11); assert.equal(await evaluate("modal.querySelector('[data-inventory-owned]').textContent"), '11'); assert(await evaluate("modal.querySelector('.ib-heading-status').textContent.match(/^Active: (47m [0-9]+s|48m 0s)$/)"));
    await click('[data-inventory-use]'); assert.equal(await evaluate('getProjectedInventoryCount(WAR_DRUMS_ITEM_ID)'), 10); await evaluate('__bagQA.resolve()'); await wait('getInstantEconomyPendingActions().length===0'); assert.equal(await evaluate('state.shopItems[WAR_DRUMS_ITEM_ID]'), 10);
    await evaluate("__bagQA.reset('last')"); await click('[data-inventory-use]'); await wait('getInstantEconomyPendingActions().length===0'); assert(await evaluate("!!modal.querySelector('.ib-empty-bag')"));
    await evaluate("__bagQA.reset('last');__bagQA.mode='fail'"); await click('[data-inventory-use]'); await wait('__bagQA.refreshes===1 && getInstantEconomyPendingActions().length===0'); assert.equal(await evaluate('getProjectedInventoryCount(WAR_DRUMS_ITEM_ID)'), 1); await wait("!!modal.querySelector('[data-inventory-item=war_drums_30m]')"); await click('[data-inventory-item=war_drums_30m]'); await click('[data-inventory-use]'); await wait('getInstantEconomyPendingActions().length===0'); assert.equal(await evaluate('state.shopItems[WAR_DRUMS_ITEM_ID]'), 0);
    await evaluate("__bagQA.reset('ready')"); const counts = await evaluate('JSON.stringify(state.shopItems)');
    for (const id of ['swift_march_order','recall_horn']) { await evaluate(`showInventoryModal();selectedInventoryItemId='${id}';selectedInventoryEntryKey='${id}';showInventoryModal();__bagQA.eligible=true`); await click('[data-inventory-use]'); assert.equal(await evaluate('modal.open'), false); assert.equal(await evaluate('JSON.stringify(state.shopItems)'), counts); }
    assert.equal(await evaluate('__bagQA.handoffs'), 2);
    await evaluate("__bagQA.reset('ready')"); await click('[data-inventory-use]'); assert(await evaluate("modal.classList.contains('cgb-modal')")); assert.equal(await evaluate('state.gear.commonGearBoxes'), 5); await click('[data-cgb-action=bag]'); assert.equal(await evaluate('modal.className'), 'inventory-modal modal'); await paint(); await shot('runtime-back-from-box');
    await click('#closeModalBtn'); await wait('!modal.open && disposeItemBagPresentation===null'); await evaluate('showInventoryModal()'); await click('[data-inventory-category=all]');
    const focusedCategory = await evaluate('document.activeElement?.dataset.inventoryCategory');
    assert.equal(focusedCategory, 'all', 'Category click must restore keyboard focus to its new tab.');
    for (const type of ['keyDown','keyUp']) await client.send('Input.dispatchKeyEvent', { type,key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39 }); await paint(); assert.equal(await evaluate('selectedInventoryCategory'), 'boosts');
    // Explicit QA-only definitions exercise paging capacity without inventing shipped items.
    await evaluate("__bagQA.reset();SHOP_ITEMS.push({...SHOP_ITEMS[0],id:'qa-page-8'},{...SHOP_ITEMS[0],id:'qa-page-9'});state.shopItems['qa-page-8']=1;state.shopItems['qa-page-9']=1;getProjectedBagItemCount=(id)=>id.startsWith('qa-page-')?1:id===COMMON_GEAR_BOX_ITEM.id?state.gear.commonGearBoxes:getProjectedInventoryCount(id);showInventoryModal()"); await click('[aria-label="Next item page"]'); assert.equal(await evaluate('selectedInventoryPage'), 1); assert.equal(await evaluate("modal.querySelectorAll('[data-inventory-select]').length"), 1); await click('[aria-label="Previous item page"]'); assert.equal(await evaluate('selectedInventoryPage'), 0);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []); fs.writeFileSync(path.join(out, 'runtime-checks.json'), JSON.stringify({ results,errors,missing,interactions:'passed' }, null, 2));
    console.log('PASS: Item Bag 24 desktop/landscape states; approved chest; complete information; 44px controls; category/keyboard/paging; projected quantities and timers; repeated boost use; last item; rejected-action restoration/retry; march and Gear Box handoffs; close cleanup.');
  } finally { if (client) { await client.send('Browser.close').catch(()=>{}); client.close(); } if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); } await server.close(); }
}
module.exports = { installBagFixture };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
