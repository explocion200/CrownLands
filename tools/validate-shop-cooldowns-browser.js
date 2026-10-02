/* Run the real Shop timer against a controlled clock and synthetic server responses. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { installShopFixture } = require("./validate-shop-browser");

function installClockFixture() {
  const q = window.__shopQA;
  q.now = Date.UTC(2026, 9, 2, 12);
  q.adReads = 0;
  q.serverStatus = { enabled: true, eligible: true, reason: "", dayKey: "2026-10-02", claimedToday: 0, remainingToday: 20, dailyLimit: 20, cooldownEndsAtMs: 0 };
  const NativeDate = Date;
  function ClockDate(...args) {
    if (!new.target) return new NativeDate(q.now).toString();
    return new NativeDate(...(args.length ? args : [q.now]));
  }
  Object.setPrototypeOf(ClockDate, NativeDate);
  ClockDate.prototype = NativeDate.prototype;
  ClockDate.now = () => q.now;
  window.Date = ClockDate;
  const api = getOnlineApi();
  api.getRewardedAdStatus = async () => {
    q.adReads++;
    if (q.holdStatus) await new Promise(resolve => { q.releaseStatus = resolve; });
    if (q.failStatus) { q.failStatus = false; throw Error("Synthetic availability timeout"); }
    return { status: structuredClone(q.serverStatus) };
  };
  getOnlineApi = () => api;
  refreshRewardedAdStatus = window.__realShopStatusRefresh;
  // Capture the actual interval callback. Advance deadlines without sleeping for a day.
  q.captureTimer = () => {
    const nativeInterval = window.setInterval;
    window.setInterval = callback => { q.tick = callback; return nativeInterval(callback, 600000); };
    try { startRewardedAdShopCountdown(); } finally { window.setInterval = nativeInterval; }
  };
  q.capped = itemId => {
    q.now = Date.UTC(2026, 9, 2, 23, 59, 58);
    q.reset("ready");
    q.gold = state.gold = 2000000000;
    q.counters = Object.fromEntries(SHOP_ITEMS.map(item => [item.id, { utcDate: "2026-10-02", purchaseCount: getItemDailyPurchaseLimit(item.id) }]));
    state.itemPurchaseCooldowns = structuredClone(q.counters);
    state.gear.shopPurchase = { utcDate: "2026-10-02", purchaseCount: 1 };
    selectShopItem(itemId);
    q.captureTimer();
  };
  q.reward = async (time, status) => {
    q.now = time;
    q.serverStatus = { enabled: true, dailyLimit: 20, ...status };
    q.reset("rewards");
    q.captureTimer();
  };
}

async function main() {
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(browser, "Chromium required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Runtime.enable"); await client.send("Page.enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const evaluate = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); }
      throw Error("Timed out: " + expression);
    };
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const settled = () => wait("!rewardedAdStatusLoading");
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
    await evaluate("window.__realShopStatusRefresh=refreshRewardedAdStatus");
    await evaluate(`(${installShopFixture.toString()})()`);
    await evaluate(`(${installClockFixture.toString()})()`);
    const items = await evaluate("getSelectableShopItemIds()");
    for (const [width, height] of [[1440,900], [844,390], [568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const id of items) {
        await evaluate(`__shopQA.capped(${JSON.stringify(id)})`); await settled();
        assert(await evaluate("modal.querySelector('.rs-buy-button').disabled"), id + ": must lock at the cap");
        await evaluate("window.__cooldownButton=modal.querySelector('.rs-buy-button');window.__cooldownDetails=modal.querySelector('.rs-selection-scroll');__cooldownDetails.focus();__shopQA.now+=1000;__shopQA.tick()");
        if (id !== "common_gear_box") assert.match(await evaluate("modal.querySelector('[data-rs-status]').textContent"), /1s/, id + ": countdown must advance while open");
        await evaluate("__shopQA.now+=1000;__shopQA.tick()");
        assert(!(await evaluate("modal.querySelector('.rs-buy-button').disabled")), id + ": must unlock at exactly 00:00 UTC");
        assert.match(await evaluate("modal.querySelector('[data-shop-selected-daily]').textContent"), /^0\s*\//);
        assert(await evaluate("__cooldownButton===modal.querySelector('.rs-buy-button') && document.activeElement===__cooldownDetails"), "Tick must preserve the button and focused details");
        assert.equal(await evaluate("__shopQA.calls.length"), 0, "A timer must never purchase an item");
      }
      // Closing/reopening cannot reset an unexpired purchase limit.
      await evaluate("__shopQA.capped(WAR_DRUMS_ITEM_ID);modal.close();showShopModal();__shopQA.captureTimer()"); await settled();
      assert(await evaluate("modal.querySelector('.rs-buy-button').disabled"));
      await evaluate("__shopQA.now+=3000;modal.close();showShopModal();__shopQA.captureTimer()"); await settled();
      assert(!(await evaluate("modal.querySelector('.rs-buy-button').disabled")));

      const deadline = Date.UTC(2026, 9, 2, 12, 30);
      const cooldown = { dayKey: "2026-10-02", eligible: false, reason: "cooldown", claimedToday: 1, remainingToday: 19, cooldownEndsAtMs: deadline };
      await evaluate(`__shopQA.reward(${deadline - 2000},${JSON.stringify(cooldown)})`); await settled();
      for (const type of ["gold", "troops"]) {
        await click(`[data-rs-reward=${type}]`);
        assert(await evaluate("modal.querySelector('.rs-buy-button').disabled"), "Both rewards must share the lock");
      }
      await evaluate("window.__cooldownButton=modal.querySelector('.rs-buy-button');__shopQA.now+=1000;__shopQA.tick()");
      assert(await evaluate("[...modal.querySelectorAll('.rewarded-ad-availability')].every(e=>e.textContent==='Available in 0:01')"));
      await evaluate("Object.assign(__shopQA.serverStatus,{eligible:true,reason:''});__shopQA.now+=1000;__shopQA.tick()"); await settled();
      assert(!(await evaluate("modal.querySelector('.rs-buy-button').disabled")), "Server-confirmed cooldown expiry must unlock the button");
      assert(await evaluate("__cooldownButton===modal.querySelector('.rs-buy-button')"), "Expiry must preserve the selected action node");

      // A disclosure pauses presentation, then the same timer resumes after cancellation.
      await evaluate(`__shopQA.reward(${deadline - 2000},${JSON.stringify(cooldown)})`); await settled();
      await evaluate("void(window.__disclosure=showRewardedAdDisclosure({rewardType:'gold',rewardAmount:125},{makeRewardedVisible:()=>true}));window.__timerBefore=rewardedAdShopCountdownTimer;__shopQA.tick()");
      assert(await evaluate("rewardedAdShopCountdownTimer===__timerBefore && rewardedAdShopCountdownTimer!==0"), "Disclosure must not stop the Shop timer");
      await click("[data-rewarded-ad-cancel]"); assert.equal(await evaluate("__disclosure"), false);
      await evaluate("__shopQA.now+=1000;__shopQA.tick()");
      assert.match(await evaluate("modal.querySelector('[data-rs-status]').textContent"), /0:01/);

      const midnight = Date.UTC(2026, 9, 3);
      await evaluate(`__shopQA.reward(${midnight - 1000},{dayKey:'2026-10-02',eligible:false,reason:'daily-limit',claimedToday:20,remainingToday:0,cooldownEndsAtMs:0})`); await settled();
      await evaluate("__shopQA.now+=1000;Object.assign(__shopQA.serverStatus,{dayKey:'2026-10-03',eligible:true,reason:'',claimedToday:0,remainingToday:20});__shopQA.tick()"); await settled();
      assert(!(await evaluate("modal.querySelector('.rs-buy-button').disabled")), "Ad daily cap must refresh at midnight while open");
      assert.equal(await evaluate("modal.querySelector('[data-rs-watched]').textContent"), "0 / 20");

      // The UTC daily reset must not erase a shared cooldown crossing midnight.
      await evaluate(`__shopQA.reward(${midnight - 1000},{dayKey:'2026-10-02',eligible:false,reason:'daily-limit',claimedToday:20,remainingToday:0,cooldownEndsAtMs:${midnight + 30000}})`); await settled();
      await evaluate("__shopQA.now+=1000;Object.assign(__shopQA.serverStatus,{dayKey:'2026-10-03',eligible:false,reason:'cooldown',claimedToday:0,remainingToday:20});__shopQA.tick()"); await settled();
      assert(await evaluate("modal.querySelector('.rs-buy-button').disabled"));
      assert.equal(await evaluate("modal.querySelector('[data-rs-watched]').textContent"), "0 / 20");
      assert.match(await evaluate("modal.querySelector('[data-rs-status]').textContent"), /0:30/);

      // A failed expiry read stays locked, retries at a bounded rate, then recovers.
      await evaluate(`__shopQA.reward(${deadline - 1000},${JSON.stringify(cooldown)})`); await settled();
      await evaluate("__shopQA.failStatus=true;__shopQA.now+=1000;__shopQA.tick()"); await settled();
      assert(await evaluate("modal.querySelector('.rs-buy-button').disabled"));
      const reads = await evaluate("__shopQA.adReads");
      await evaluate("__shopQA.now+=1000;__shopQA.tick()"); await settled();
      assert.equal(await evaluate("__shopQA.adReads"), reads, "Do not poll the server each second after failure");
      await evaluate("__shopQA.now+=30000;Object.assign(__shopQA.serverStatus,{eligible:true,reason:''});__shopQA.tick()"); await settled();
      assert(!(await evaluate("modal.querySelector('.rs-buy-button').disabled")), "Failed expiry check must recover without reopening Shop");

      await evaluate(`__shopQA.reward(${deadline - 1000},${JSON.stringify(cooldown)})`); await settled();
      await evaluate("__shopQA.holdStatus=true;__shopQA.now+=1000;__shopQA.tick()");
      await wait("!!__shopQA.releaseStatus");
      const pendingReads = await evaluate("__shopQA.adReads");
      await evaluate("__shopQA.now+=60000;__shopQA.tick()");
      assert.equal(await evaluate("__shopQA.adReads"), pendingReads, "Only one availability read may be in flight");
      await evaluate("showInventoryModal();__shopQA.tick();__shopQA.holdStatus=false;__shopQA.releaseStatus();__shopQA.releaseStatus=null"); await settled();
      assert(await evaluate("modal.classList.contains('inventory-modal') && !modal.querySelector('.rs-shop-shell')"), "Late status response must not replace another dialog");
      assert.equal(await evaluate("rewardedAdShopCountdownTimer"), 0, "Leaving Shop stops its countdown");
    }
    assert.deepEqual(errors, []);
    console.log("PASS: Shop countdowns, every purchase cap, exact UTC unlock, shared ad cooldown, disclosure resume, daily reset, failure recovery, bounded reads and modal lifecycle at three sizes.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
