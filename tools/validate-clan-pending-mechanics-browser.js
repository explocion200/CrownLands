"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {CdpClient} = require("./map-benchmark/cdp-client");
const {createMapBenchmarkServer} = require("./map-benchmark/server");
const {startBrowserSession, waitForProcessExit, removeBrowserProfile} = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main(buildings = ["infirmary", "training"]) {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "A Chromium browser is required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/runtime-cleanup");
  fs.mkdirSync(artifacts, {recursive: true});
  let browser, client; const errors = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const ev = async expression => {
      const result = await client.send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let i = 0; i < 400; i++) {if (await ev(expression)) return; await delay(100);}
      throw Error("Timed out: " + expression + " " + JSON.stringify(await ev("({open:modal.open,view:modal.className,body:modalBody.textContent.slice(0,250),tower:selectedHoldingTowerId})")) + " " + errors.join("\n"));
    };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: height < 600});
      await client.send("Page.navigate", {url: address.url + "/__benchmark__/?scenario=A&visualMarches=0"});
      await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
      assert.equal(await ev('typeof window.CrownlandsInfirmaryUi'), "undefined", "The Infirmary is not loaded during startup");
      await ev(`(() => {
        window.__CROWNLANDS_BENCHMARK__.closeModal();
        const api = getOnlineApi(); window.cleanupQa = {calls: 0, reads: 0};
        window.cleanupTower = HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[0].id), 'owner');
        Object.assign(cleanupTower, {buildings: {shop: 4, workshop: 4, infirmary: 4, training: 4}, buildingProject: null, wallIntegrityBps: 10000, attackBlocked: false, repairActive: false});
        state.clanId = cleanupTower.clanId; clanTreasuryClanId = state.clanId;
        clanTreasuryStatus = {treasury: {balance: 4260000000}};
        loadClanTreasuryStatus = async () => clanTreasuryStatus;
        getOnlineApi = () => ({...api, isReady: () => true, isSignedIn: () => true, subscribeHoldingTowerState: () => () => {},
          getHoldingTowerState: async () => {cleanupQa.reads++; return {worldActive: true, towers: [{...cleanupTower}]};},
          startClanTowerBuilding: async () => {cleanupQa.calls++; throw Error('Retired upgrade was submitted');},
        });
      })()`);
      for (const id of buildings) {
        await ev(`cleanupTower.buildingProject = null; openClanTowerBuilding(cleanupTower.id, ${JSON.stringify(id)})`);
        await ready(`modalBody.dataset.${id}Ready === "true" && Boolean(modalBody.querySelector('#nextBenefit'))`);
        await ev("document.fonts.ready");
        await ready("[...modalBody.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0)");
        await ev("Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getTiming().iterations)).map(animation => animation.finished.catch(() => {})))");
        assert.equal(await ev("modalBody.querySelector('#currentBenefit').textContent"), "4 / 10");
        assert.equal(await ev("modalBody.querySelector('#nextBenefit').textContent"), "+0%");
        assert(await ev("modalBody.querySelector('#upgrade').disabled"));
        await ev("modalBody.querySelector('#upgrade').click()");
        assert.equal(await ev("cleanupQa.calls"), 0);
        const layout = await ev(`(() => {
          const r = modal.getBoundingClientRect(), button = modalBody.querySelector('#upgrade'), b = button.getBoundingClientRect();
          return {fits: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            actionVisible: b.height >= 44 && b.top >= r.top && b.bottom <= r.bottom,
            overflow: modal.scrollWidth > modal.clientWidth + 1 || [...modalBody.querySelectorAll('.detail-scroll')].some(p => p.scrollWidth > p.clientWidth + 1)};
        })()`);
        assert(layout.fits && layout.actionVisible && !layout.overflow, JSON.stringify({id, width, layout}));
        fs.writeFileSync(path.join(artifacts, `${width}-${id}-overview.png`), Buffer.from((await client.send("Page.captureScreenshot", {format: "png"})).data, "base64"));
        await ev("modalBody.querySelector('#tab-levels').click(); modalBody.querySelector('#levelsPanel').scrollTop = 99999");
        assert.equal(await ev("modalBody.querySelectorAll('.levels-table tbody tr').length"), 10);
        const scroll = await ev("modalBody.querySelector('#levelsPanel').scrollTop");
        await ev("refreshHoldingTower(cleanupTower.id)");
        assert.equal(await ev("modalBody.querySelector('#levelsPanel').scrollTop"), scroll);
        assert.equal(await ev("modalBody.querySelector('#tab-levels').getAttribute('aria-selected')"), "true");
        await ev(`cleanupTower.buildingProject = {id: 'paid', buildingId: ${JSON.stringify(id)}, targetLevel: 5, remainingMs: 8100000, progressStartedAtMs: 0}; cleanupTower.attackBlocked = true; refreshHoldingTower(cleanupTower.id)`);
        assert.match(await ev("modalBody.querySelector('[data-project-time]').textContent"), /Paused/);
        await ev("cleanupTower.attackBlocked = false; cleanupTower.buildingProject.remainingMs = 1; cleanupTower.buildingProject.progressStartedAtMs = Date.now() - 1000; refreshHoldingTower(cleanupTower.id)");
        await delay(200);
        const reads = await ev("cleanupQa.reads"); await delay(1100);
        assert.equal(await ev("cleanupQa.reads"), reads, "An expired paid project requests one authoritative refresh");
        assert.equal(await ev(`cleanupTower.buildings.${id}`), 4, "The browser never grants a level");
        await ev("modal.close()");
        await ready("!modal.open && holdingTowerModalSession === null");
      }
      console.log(`Clan mechanics ${width}x${height}: preserved artwork/levels, paused upgrades, scrolling, saved tab, paid-project refresh and deferred loading passed.`);
    }
    assert.deepEqual(errors, []);
  } finally {
    if (client) {await client.send("Browser.close").catch(() => {}); client.close();}
    if (browser) {await waitForProcessExit(browser.browserProcess); await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
}
module.exports = {main};
if (require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
