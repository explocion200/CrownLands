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
  let browser, client;
  const errors = [], results = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
    assert(executable, "Set CHROME_PATH to Chromium.");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const evaluate = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const run = code => evaluate(`document.getElementById("game").contentWindow.eval(${JSON.stringify(code)})`);
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: height < 600});
      await client.send("Page.navigate", {url: address.url + "/docs/visual-qa/clan-castle-layout/preview.html"});
      let ready = false;
      for (let i = 0; i < 400; i++) {
        ready = await evaluate('!!document.getElementById("game")?.contentWindow?.CrownlandsCastlePositionReview?.tower');
        if (ready) break;
        await delay(100);
      }
      assert(ready, "Clan Tower fixture did not load.");
      const geometry = await run(`(() => {
        const original = Element.prototype.getBoundingClientRect;
        let reads = 0;
        const wheel = cityLayer.querySelector('.clan-tower-action-wheel');
        const observer = new MutationObserver(() => {});
        observer.observe(wheel, {attributes:true,subtree:true});
        Element.prototype.getBoundingClientRect = function () {
          if (this.matches('.holding-tower-node,.holding-tower-map-label,.holding-tower-building-node,.ctb-map-label')) reads++;
          return original.call(this);
        };
        let panWrites;
        const started = performance.now();
        try {
          markCameraInteraction({settleMs:60000});
          for (let i=0;i<120;i++) {camera.x += i%2 ? 1 : -1; applyCameraTransform();}
          panWrites = observer.takeRecords().length;
          for (let i=0;i<120;i++) {zoom=.4+(i%40)*.01; applyCameraTransform();}
        } finally {
          Element.prototype.getBoundingClientRect = original;
          observer.disconnect();
          clearTimeout(cameraInteractionSettleTimer);
          mapFrame.classList.remove('camera-moving','zooming','dragging');interactionRenderLockUntil=0;
        }
        const buttons = [...wheel.querySelectorAll('[data-clan-tower-map-action]')].map(n=>n.getBoundingClientRect());
        const bottom = Math.max(...[...cityLayer.querySelectorAll('.holding-tower-building-node')].map(n=>n.querySelector('.ctb-map-label').getBoundingClientRect().bottom));
        return {reads,panWrites,durationMs:performance.now()-started,sizes:buttons.map(r=>r.width),gap:buttons[1].left-buttons[0].right,clearance:buttons[0].top-bottom};
      })()`);
      assert.equal(geometry.reads, 0, "Camera movement remeasured Tower geometry.");
      assert.equal(geometry.panWrites, 0, "Panning rewrote unchanged action styles.");
      geometry.sizes.forEach(size => assert(Math.abs(size - 56) < .1, "Zoom changed the action size."));
      assert(Math.abs(geometry.gap - 4) < .1, "Action spacing changed.");
      assert(Math.abs(geometry.clearance - 8) < .2, "Actions drifted from the building labels while zooming.");
      const reconciliation = await run(`(() => {
        const tower = CrownlandsCastlePositionReview.tower;
        const nodes = [...cityLayer.querySelectorAll('.holding-tower-building-node')];
        const images = nodes.map(n=>n.querySelector('img'));
        const ground = cityLayer.querySelector('.holding-tower-courtyard');
        nodes[0].focus({preventScroll:true});
        const start = performance.now();
        for (let i=0;i<30;i++) renderCities(true);
        const durationMs = performance.now()-start;
        const retained = nodes.every((n,i)=>n.isConnected && n.querySelector('img')===images[i]);
        const focusRetained = document.activeElement===nodes[0];
        const groundRetained = ground.isConnected;
        tower.buildings[nodes[0].dataset.clanBuildingId]=7;
        renderCities(true);
        const upgraded = nodes[0].isConnected && nodes[0].textContent.includes('Lv 7') && nodes[0].querySelector('img')!==images[0];
        const otherImagesRetained = nodes.slice(1).every((n,i)=>n.querySelector('img')===images[i+1]);
        tower.buildings=Object.fromEntries(Object.keys(tower.buildings).map(id=>[id,0]));
        tower.buildingProject={buildingId:'workshop',targetLevel:1};
        renderCities(true);
        const constructionOnly = cityLayer.querySelectorAll('.holding-tower-building-node').length===1 && cityLayer.querySelector('.holding-tower-building-node').classList.contains('constructing');
        tower.ownerKind='neutral';renderCities(true);
        const neutralCleared = !cityLayer.querySelector('.holding-tower-building-node,.holding-tower-courtyard');
        return {durationMs,retained,focusRetained,groundRetained,upgraded,otherImagesRetained,constructionOnly,neutralCleared};
      })()`);
      for (const [key, value] of Object.entries(reconciliation)) if (key !== "durationMs") assert.equal(value, true, key);
      results.push({width,height,geometry,reconciliation});
    }
    assert.deepEqual(errors, []);
    const output = path.resolve(__dirname, "../release-artifacts/map-ui-responsiveness");
    fs.mkdirSync(output, {recursive:true});
    fs.writeFileSync(path.join(output, "regressions.json"), JSON.stringify({results,errors}, null, 2));
    console.log("Validated map responsiveness: no repeated Tower geometry reads or pan style writes; fixed 56px actions; stable buildings, focus, upgrades, construction and ownership cleanup at three viewport sizes.");
  } finally {
    if (client) {await client.send("Browser.close").catch(() => {}); client.close();}
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) {browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess);}
      await removeBrowserProfile(browser.profilePath);
    }
    await server.close();
  }
})().catch(error => {console.error(error.stack || error.message);process.exitCode=1;});
