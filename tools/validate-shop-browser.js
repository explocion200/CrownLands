/* Actual Shop presentation and existing purchase actions with synthetic API receipts. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { CdpClient } = require('./map-benchmark/cdp-client');
const { createMapBenchmarkServer } = require('./map-benchmark/server');
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require('./validate-focused-browser-smoke');
const out = path.resolve(__dirname, '../release-artifacts/shop-ui');

function installShopFixture() {
  const q = window.__shopQA = { calls: [], gold: 5000000, counts: {}, counters: {}, mode: 'ok', refreshes: 0 };
  usesServerEconomyAuthority = () => true; supportsInstantEconomyActionBatching = () => true; saveGame = () => {};
  getRewardedAdClientConfig = () => ({ enabled: true, isTestHost: true, productionHostApproved: true, adUnitPath: '/qa-only', dailyLimit: 20, cooldownMinutes: 30 });
  isRewardedAdSecurityReady = () => true; getPendingRewardedAdClaim = () => null;
  refreshRewardedAdStatus = async () => {};
  const profile = () => ({ gold: q.gold, shopItems: { ...q.counts }, itemPurchaseCooldowns: structuredClone(q.counters) });
  getOnlineApi = () => ({ getUser: () => ({ uid: 'shop-fixture' }), purchaseShopItem: async ({ itemId, cost, quantity }) => {
    q.calls.push({ itemId, cost, quantity });
    if (q.mode === 'slow') { await new Promise(resolve => { q.resolve = resolve; }); q.mode = 'ok'; }
    if (q.mode === 'fail') { q.mode = 'ok'; throw Error('Synthetic purchase rejection'); }
    q.gold -= cost * quantity; q.counts[itemId] += quantity; q.counters[itemId] = { utcDate: getUtcDateKeyAtMs(), purchaseCount: (q.counters[itemId]?.purchaseCount || 0) + quantity };
    return { purchasedQuantity: quantity, unitPrice: cost, spentGold: cost * quantity, currentUser: profile() };
  }, purchaseCommonGearBox: async ({ cost }) => {
    q.calls.push({ itemId: 'common_gear_box', cost, quantity: 1 });
    if (q.mode === 'slow') { await new Promise(resolve => { q.resolve = resolve; }); q.mode = 'ok'; }
    if (q.mode === 'fail') { q.mode = 'ok'; throw Error('Synthetic box rejection'); }
    q.gold -= cost; const gear = structuredClone(state.gear); gear.commonGearBoxes++; gear.shopPurchase = { utcDate: currentDailyDateKey(), purchaseCount: 1 }; gear.updatedAtMs = Date.now();
    return { currentUser: { ...profile(), gear } };
  }});
  refreshServerEconomy = async () => { q.refreshes++; applyServerEconomyResult({ currentUser: profile() }); return true; };
  q.reset = (sample = 'ready') => {
    clearInstantEconomyActions(); q.calls = []; q.mode = 'ok'; q.refreshes = 0; q.gold = sample === 'low' ? 1 : sample === 'large' ? 234567890123 : 5000000;
    q.counts = Object.fromEntries(SHOP_ITEMS.map(item => [item.id, sample === 'large' ? 123456789 : 12])); q.counters = {};
    state.gold = q.gold; state.shopItems = { ...q.counts }; state.itemPurchaseCooldowns = {};
    state.gear = COMMON_GEAR.createDefaultState(); state.gear.commonGearBoxes = 5;
    selectedShopItemId = COMMON_GEAR_BOX_ITEM.id; royalShopSection = 'provisions'; royalShopRewardId = 'gold'; royalShopBoxPending = false;
    rewardedAdInFlight = false; rewardedAdStatusLoading = false;
    rewardedAdStatus = { eligible: true, remainingToday: 20, claimedToday: 0, dailyLimit: 20, reason: 'available', cooldownEndsAtMs: 0, previewRewards: { gold: 125000, troops: 6250 } };
    if (sample === 'limit') state.gear.shopPurchase = { utcDate: currentDailyDateKey(), purchaseCount: 1 };
    if (sample === 'pending') { rewardedAdInFlight = true; royalShopSection = 'rewards'; }
    if (['rewards', 'cooldown', 'adlimit', 'unavailable'].includes(sample)) royalShopSection = 'rewards';
    if (sample === 'cooldown') Object.assign(rewardedAdStatus, { reason: 'cooldown', eligible: false, cooldownEndsAtMs: Date.now() + 840000 });
    if (sample === 'adlimit') Object.assign(rewardedAdStatus, { reason: 'daily-limit', eligible: false, remainingToday: 0, claimedToday: 20 });
    if (sample === 'unavailable') Object.assign(rewardedAdStatus, { reason: 'disabled', eligible: false });
    showShopModal();
  };
  q.reset();
}

async function main() {
  const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
  assert(browser, 'Chromium required'); fs.mkdirSync(out, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen(); let session, client;
  const results = [], errors = [];
  try {
    session = await startBrowserSession(browser); client = await CdpClient.connect(session.targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await client.send('Runtime.enable'); await client.send('Page.enable');
    client.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const evaluate = async expression => { const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const wait = async expression => { for (let i = 0; i < 480; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 125)); } throw Error('Timed out: ' + expression); };
    const paint = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const click = async selector => { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')!==e)throw Error('Obscured '+${JSON.stringify(selector)});return{x:r.x+r.width/2,y:r.y+r.height/2}})()`); for (const type of ['mousePressed','mouseReleased']) await client.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1}); await paint(); };
    const shot = async name => { const r = await client.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64')); };
    await client.send('Page.navigate', { url: address.url + '/__benchmark__/?scenario=A&visualMarches=0' });
    await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'"); await evaluate(`(${installShopFixture.toString()})()`);
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for (const sample of ['ready','low','limit','pending','large','rewards','cooldown','adlimit','unavailable']) {
        await evaluate(`__shopQA.reset('${sample}')`); await paint(); await evaluate("Promise.all([...modal.querySelectorAll('img')].map(i=>i.decode()))");
        const data = await evaluate(`(()=>{const r=modal.getBoundingClientRect(),buttons=[...modal.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return{label:e.ariaLabel||e.textContent,w:b.width,h:b.height,inside:b.x>=r.x&&b.y>=r.y&&b.right<=r.right+1&&b.bottom<=r.bottom+1}}),tiles=[...modal.querySelectorAll('.rs-item-tile')].map(e=>{const a=e.querySelector('.rs-tile-art img').getBoundingClientRect(),n=e.querySelector('.rs-item-name'),b=n.getBoundingClientRect();return{artHeight:a.height,artAboveLabel:a.bottom<=b.y+1,nameClipped:n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1}});return{within:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,bodyOverflow:modalBody.scrollHeight-modalBody.clientHeight,buttons,tiles,disabled:modal.querySelector('.rs-buy-button').disabled,columns:getComputedStyle(document.querySelector('#royalShopItemGrid')).gridTemplateColumns.split(' ').length}})()`);
        assert(data.within&&data.bodyOverflow<=1,JSON.stringify({width,height,sample,...data}));
        assert(data.buttons.every(b=>b.w>=44&&b.h>=44&&b.inside),JSON.stringify({width,height,sample,buttons:data.buttons}));
        assert(data.tiles.every(t=>t.artHeight>=12&&t.artAboveLabel&&!t.nameClipped),JSON.stringify({width,height,sample,tiles:data.tiles}));
        assert.equal(data.disabled,!['ready','large','rewards'].includes(sample));
        assert.equal(data.columns,['ready','low','limit','large'].includes(sample)?4:2);
        if (['ready','rewards'].includes(sample)) await shot(`runtime-${width}x${height}-${sample}`);
        results.push({width,height,sample,...data});
      }
    }
    await evaluate("__shopQA.reset('ready')");
    const definitions=await evaluate('[COMMON_GEAR_BOX_ITEM,...SHOP_ITEMS].map(({id,description,icon})=>({id,description,icon}))');
    for(const item of definitions){await click(`[data-shop-select="${item.id}"]`);assert.equal(await evaluate("modal.querySelector('.rs-description').textContent"),item.description);assert.equal(await evaluate("modal.querySelector('.rs-selected-art img').getAttribute('src')"),item.icon);}
    await evaluate("__shopQA.reset('ready');__shopQA.mode='slow'"); await click('[data-shop-select=war_drums_30m]');
    const price=await evaluate('getShopItemPrice(WAR_DRUMS_ITEM_ID)');
    await click('[data-shop-purchase-selected]'); await wait('__shopQA.calls.length===1'); await click('[data-shop-purchase-selected]');
    assert.equal(await evaluate('getProjectedInventoryCount(WAR_DRUMS_ITEM_ID)'),14);assert.equal(await evaluate("modal.querySelector('[data-shop-selected-owned]').textContent"),'14');
    assert.equal(await evaluate('getProjectedGold()'),5000000-price*2);assert.equal(await evaluate("modal.querySelector('[data-rs-action]').textContent"),'Buy Again');
    await evaluate('__shopQA.resolve()');await wait('getInstantEconomyPendingActions().length===0');await paint();
    await click('[data-shop-purchase-selected]'); await click('[data-shop-purchase-selected]'); await wait('getInstantEconomyPendingActions().length===0');await paint();
    assert.equal(await evaluate('state.shopItems[WAR_DRUMS_ITEM_ID]'),16);assert(await evaluate("modal.querySelector('.rs-buy-button').disabled"));
    await evaluate("__shopQA.reset('ready');__shopQA.mode='fail'");await click('[data-shop-select=war_drums_30m]');await click('[data-shop-purchase-selected]');await wait('__shopQA.refreshes>0&&getInstantEconomyPendingActions().length===0');
    assert.equal(await evaluate('getProjectedInventoryCount(WAR_DRUMS_ITEM_ID)'),12);assert.equal(await evaluate('getProjectedGold()'),5000000);await click('[data-shop-purchase-selected]');await wait('getInstantEconomyPendingActions().length===0');await paint();assert.equal(await evaluate('state.shopItems[WAR_DRUMS_ITEM_ID]'),13);
    await evaluate("__shopQA.reset('ready');__shopQA.mode='slow'");await click('[data-shop-purchase-selected]');await wait('__shopQA.calls.length===1');assert(await evaluate("modal.querySelector('.rs-buy-button').disabled"));await click('[data-shop-select=war_drums_30m]');await click('[data-shop-select=common_gear_box]');assert(await evaluate("modal.querySelector('.rs-buy-button').disabled"));await evaluate('__shopQA.resolve()');await wait('!royalShopBoxPending');assert.equal(await evaluate('state.gear.commonGearBoxes'),6);assert(await evaluate("modal.querySelector('.rs-buy-button').disabled"));
    await evaluate("__shopQA.reset('ready');__shopQA.mode='slow'");await click('[data-shop-purchase-selected]');await wait('__shopQA.calls.length===1');await click('#closeModalBtn');await evaluate('showInventoryModal();__shopQA.resolve()');await wait('!royalShopBoxPending');assert(await evaluate("modal.classList.contains('inventory-modal')"));
    await evaluate("__shopQA.reset('cooldown');window.__shopTimerNode=modal.querySelector('.rs-buy-button')");await wait("modal.querySelector('.rewarded-ad-availability').textContent.includes('13:')");assert(await evaluate("window.__shopTimerNode===modal.querySelector('.rs-buy-button')"));
    await evaluate("__shopQA.reset('rewards');void(window.__shopDisclosure=showRewardedAdDisclosure({rewardType:'gold',rewardAmount:125000},{makeRewardedVisible:()=>true}))");await paint();await shot('runtime-ad-confirmation');await click('[data-rewarded-ad-cancel]');assert.equal(await evaluate('__shopDisclosure'),false);assert(await evaluate("!!modal.querySelector('.rs-shop-shell')"));
    await click('[data-rs-section=provisions]');await click('[data-shop-select=common_gear_box]');
    for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type,key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await paint();assert.equal(await evaluate('selectedShopItemId'),'veil_of_silence_30m');
    await click('#closeModalBtn');await wait('!modal.open');assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'runtime-checks.json'),JSON.stringify({results,errors,interactions:'passed'},null,2));
    console.log('PASS: Shop 27 desktop/landscape states; all artwork and full descriptions; 44px controls; repeat buying, caps, rejection/retry, pending Box guard, close handoff, stable cooldown nodes, ad disclosure cancellation and keyboard selection.');
  } finally { if(client){await client.send('Browser.close').catch(()=>{});client.close();}if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}await server.close(); }
}
module.exports={installShopFixture};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
