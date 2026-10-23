"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const { createMapBenchmarkServer } = require("./map-benchmark/server");

(async () => {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const executablePath = [process.env.CHROME_PATH, process.env.CROWNLANDS_CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  let browser;
  const output = path.resolve("release-artifacts/clan-loading"); fs.mkdirSync(output, { recursive: true });
  const results = [];
  try {
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: height < 500 });
      const retry = () => height < 500 ? page.locator('[data-clan-action="retry-clan"]').tap() : page.locator('[data-clan-action="retry-clan"]').click();
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("https://**", route => route.abort());
      await page.goto(address.url + "/__benchmark__/?scenario=A&visualMarches=0");
      await page.waitForFunction(() => document.documentElement.dataset.crownlandsBenchmarkReady === "true");
      await page.evaluate(() => {
        if (modal.open) modal.close();
        stopClanRealtimeSubscriptions({ clear: true });
        state.clanId = "loading-test-clan"; state.clanRole = "member";
        const clan = { id: state.clanId, status: "active", name: "Sample Clan", tag: "TEST" };
        window.loadingQA = { clan, handlers: [], unsubscribed: 0 };
        const api = getOnlineApi();
        getOnlineApi = () => ({ ...api, isSignedIn: () => true, loadPlayerProfile: async () => null,
          subscribeClanState: (_id, handlers) => { loadingQA.handlers.push(handlers); return () => loadingQA.unsubscribed++; },
          subscribeClanRallies: undefined, subscribeClanTreasury: undefined, subscribeClanSocialState: undefined,
          subscribeClanQuestProgress: undefined, getClanTreasuryStatus: undefined,
          clanWarCities: async () => ({ version: 1, logVersion: 1, clanId: state.clanId, entries: [] }),
        });
        showClanHub();
      });
      await page.waitForFunction(() => !clanUiLoading && clanContent.textContent.includes("Loading clans"));
      // A terminal data-listener failure used to leave the loading screen forever.
      await page.evaluate(() => loadingQA.handlers.at(-1).onError(Error("Connection lost"), "clan"));
      await page.locator('[data-clan-action="retry-clan"]').waitFor();
      assert.match(await page.locator("#clanContent").innerText(), /could not load/);
      const before = await page.evaluate(() => loadingQA.handlers.length);
      await retry();
      await page.waitForFunction(n => !clanUiLoading && loadingQA.handlers.length === n + 1, before);
      assert.equal(await page.evaluate(() => loadingQA.unsubscribed), 1);
      await page.evaluate(() => {
        loadingQA.handlers[0].onClan({ ...loadingQA.clan, name: "Stale response" });
      });
      assert.equal(await page.evaluate(() => clanSnapshot), null, "Canceled listener restored old clan data");
      await page.evaluate(() => loadingQA.handlers.at(-1).onClan(loadingQA.clan));
      await page.locator("#clanOverviewPanel").waitFor();
      assert((await page.locator("#clanContent").innerText()).includes("Sample Clan"));
      assert.equal(await page.evaluate(() => clanStateError), "");
      // Reopening must recreate a failed subscription instead of reusing its dead handle.
      await page.evaluate(() => { loadingQA.handlers.at(-1).onError(Error("Roster lost"), "members"); showProfileClan({ force: true }); });
      await page.waitForFunction(n => !clanUiLoading && loadingQA.handlers.length === n + 2, before);
      await page.evaluate(() => loadingQA.handlers.at(-1).onClan(null));
      await page.locator('[data-clan-action="retry-clan"]').waitFor();
      assert.match(await page.locator("#clanContent").innerText(), /refresh your membership/);
      // Exercise the real bounded deadline with browser time, not a long wall-clock wait.
      await page.clock.install();
      await retry();
      await page.waitForFunction(() => !clanUiLoading && !clanStateError);
      await page.clock.fastForward(15050);
      assert.match(await page.locator("#clanContent").innerText(), /too long to load/);
      await page.screenshot({ path: path.join(output, `retry-${width}.png`) });
      const bounds = await page.locator('[data-clan-action="retry-clan"]').boundingBox();
      assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
      assert(bounds.width >= 44 && bounds.height >= 44, "Retry must remain a usable touch target");
      // A late valid response is still useful until that subscription is canceled.
      await page.evaluate(() => loadingQA.handlers.at(-1).onClan(loadingQA.clan));
      await page.locator("#clanOverviewPanel").waitFor();
      await page.evaluate(() => {
        const old = loadingQA.handlers.at(-1);
        stopClanRealtimeSubscriptions({ clear: true }); state.clanId = "another-clan";
        old.onClan(loadingQA.clan); old.onError(Error("Old clan failure"), "clan");
      });
      assert.equal(await page.evaluate(() => clanSnapshot), null);
      assert.equal(await page.evaluate(() => clanStateError), "");
      assert.equal(await page.evaluate(() => clanStateLoadTimer), null);
      assert.deepEqual(errors, []);
      results.push({ width, height, failedSubscriptionRetry: true, reopen: true, timeout: true, lateResponse: true, membershipIsolation: true });
      await page.close();
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
    console.log("Clan loading recovery passed at desktop and two landscape sizes: failures, retry, reopen, timeout, late responses and membership isolation.");
  } finally { try { await browser?.close(); } finally { await server.close(); } }
})().catch(error => { console.error(error); process.exitCode = 1; });
