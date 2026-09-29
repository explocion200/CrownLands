"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const results = [], errors = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=B` });
      for (let i = 0; i < 600 && !await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"); i++) await delay(100);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"), "ready");
      const result = await evaluate(`(() => {
        __CROWNLANDS_BENCHMARK__.closeModal();
        selectedSourceId = selectedTargetId = null; sendMode = false;
        renderCities(true);
        const nodes = [...cityLayer.querySelectorAll('.city-node')];
        const images = nodes.map(node => node.querySelector('img'));
        const own = state.cities.find(city => city.owner === 'player' && !isStronghold(city));
        const rival = state.cities.find(city => city.owner === 'enemy' && !isStronghold(city));
        const find = city => cityLayer.querySelector('[data-city-id="' + city.id + '"]');
        const ownNode = find(own), rivalNode = find(rival);
        ownNode.focus({preventScroll:true});
        const observer = new MutationObserver(() => {});
        observer.observe(cityLayer, {attributes:true,subtree:true});
        const start = performance.now();
        for (let i = 0; i < 3; i++) { renderCities(true); mapFrame.getBoundingClientRect(); }
        const durationMs = performance.now() - start;
        const unchangedWrites = observer.takeRecords().filter(record => nodes.includes(record.target)).length;
        const focusRetained = document.activeElement === ownNode;
        const imagesRetained = nodes.every((node, i) => node.isConnected && node.querySelector('img') === images[i]);
        selectedSourceId = own.id; selectedTargetId = rival.id; sendMode = true;
        renderCities(true);
        const orderClasses = ownNode.classList.contains('selected') && rivalNode.classList.contains('targeted') && rivalNode.classList.contains('attackable');
        selectedSourceId = selectedTargetId = null; sendMode = false;
        renderCities(true);
        const selectionCleared = nodes.every(node => !node.matches('.selected,.targeted,.attackable,.supportable'));
        const priorClan = state.clanId, priorRosterReady = clanRosterReady, priorSubscription = activeClanSubscriptionId, priorMembers = clanMemberUidSet;
        state.clanId = 'reconciliation-clan'; clanRosterReady = true; activeClanSubscriptionId = state.clanId;
        clanMemberUidSet = new Set([rival.ownerUid]);
        renderCities(true);
        const allied = rivalNode.classList.contains('clan-ally');
        clanMemberUidSet = new Set(); renderCities(true);
        const allianceUpdated = allied && !rivalNode.classList.contains('clan-ally');
        state.clanId = priorClan; clanRosterReady = priorRosterReady; activeClanSubscriptionId = priorSubscription; clanMemberUidSet = priorMembers;
        const prior = {...rival}, priorMain = state.mainCityId;
        rival.owner = 'player'; rival.ownerUid = getCurrentOnlineUid();
        rival.name = 'Reconciled Keep'; rival.level = 99; state.mainCityId = rival.id;
        renderCities(true);
        const ownershipUpdated = rivalNode === find(rival) && rivalNode.classList.contains('player') && !rivalNode.classList.contains('enemy')
          && rivalNode.classList.contains('main-city-node') && rivalNode.classList.contains('castle-stage-' + getCastleStage(99))
          && rivalNode.getAttribute('aria-label').includes('Reconciled Keep') && rivalNode.title === 'Reconciled Keep'
          && !rivalNode.dataset.enemyPowerBand;
        Object.assign(rival, prior); state.mainCityId = priorMain;
        renderCities(true);
        const ownershipRestored = rivalNode.classList.contains('enemy') && !rivalNode.classList.contains('player')
          && rivalNode.title.includes(prior.name) && rivalNode.dataset.enemyPowerBand === getStableEnemyCityPowerBand(rival);
        observer.disconnect();
        return {cityCount:nodes.length,durationMs,unchangedWrites,focusRetained,imagesRetained,orderClasses,selectionCleared,allianceUpdated,ownershipUpdated,ownershipRestored};
      })()`);
      assert(result.cityCount >= 50, "The busy-map fixture did not exercise enough cities.");
      assert.equal(result.unchangedWrites, 0, "Unchanged city refreshes rewrote city attributes.");
      for (const key of ["focusRetained", "imagesRetained", "orderClasses", "selectionCleared", "allianceUpdated", "ownershipUpdated", "ownershipRestored"]) assert.equal(result[key], true, key);
      results.push({ width, height, ...result });
    }
    assert.deepEqual(errors, []);
    const output = path.resolve(__dirname, "../release-artifacts/ui-map-smoothness");
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "city-regression.json"), JSON.stringify({ results, errors }, null, 2));
    console.log("Validated unchanged city refreshes, retained images/focus, order highlights and clan/ownership/main-city/level/name transitions at three viewports.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) {
      if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); }
      await removeBrowserProfile(session.profilePath);
    }
    await server.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
