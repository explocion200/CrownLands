"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.resolve(__dirname, "../release-artifacts/map-zoom-smoothness");

(async () => {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const results = [], errors = [];
  let browser, client;
  try {
    const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium",
      "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    fs.mkdirSync(output, { recursive: true });
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Performance.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const metrics = async () => Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map(metric => [metric.name, metric.value]));
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      // The current release's Core map, with 150 cities and 100 moving armies.
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=C" });
      for (let i = 0; i < 400 && !await evaluate('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'); i++) await delay(100);
      assert(await evaluate('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'), "Map fixture did not load.");
      await client.send("Page.bringToFront");
      await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await delay(500);

      // Real computed CSS: keep the enlarged hit areas without passing their
      // changing custom property into thousands of unrelated map descendants.
      for (const [scale, detail, pixels] of [[.45, "far", 110], [.65, "medium", 84], [1, "close", 58]]) {
        const geometry = await evaluate(`(() => {
          zoom = ${scale}; centerOnMap();
          const pickup = document.createElement('button');
          pickup.className = 'harvest-bonus-node'; pickup.innerHTML = '<span class="harvest-bonus-icon"></span>';
          mapWorld.append(pickup);
          try {
            const hit = (selector, pseudo) => {
              const node = mapWorld.querySelector(selector);
              if (!node) throw Error('Missing fixture node: ' + selector);
              const style = getComputedStyle(node, pseudo);
              return {size: style.getPropertyValue('--map-hit-size').trim(), width: parseFloat(style.width), height: parseFloat(style.height)};
            };
            const leaks = [...mapWorld.querySelectorAll('.city-name,.city-label,.city-art,.army-token-count,.army-token-time')]
              .filter(node => getComputedStyle(node).getPropertyValue('--map-hit-size').trim()).length;
            return {detail:mapDetailLevel, city:hit('.city-node','::after'), camp:hit('.camp-node:not(.decorative)','::before'),
              army:hit('.army-token','::before'), pickup:hit('.harvest-bonus-node'), leaks,
              worldSize:getComputedStyle(mapWorld).getPropertyValue('--map-hit-size').trim(),
              cityCount:mapWorld.querySelectorAll('.city-node').length, armyCount:mapWorld.querySelectorAll('.army-token').length};
          } finally {pickup.remove();}
        })()`);
        assert.equal(geometry.detail, detail);
        assert.equal(geometry.worldSize, "", "Hit size must not invalidate the whole map subtree.");
        assert.equal(geometry.leaks, 0, "Hit size leaked into city artwork, labels or march text.");
        for (const kind of ["city", "camp", "army", "pickup"]) {
          assert.equal(geometry[kind].size, `${pixels}px`, `${kind} hit size at ${detail}`);
          assert(geometry[kind].width >= pixels && geometry[kind].height >= pixels, `${kind} lost its zoom-aware hit area.`);
        }
        assert(geometry.cityCount > 0 && geometry.cityCount <= 150, "Visible cities must survive zoom; offscreen cities may be culled.");
        assert(geometry.armyCount > 0 && geometry.armyCount <= 100, "Visible marches must survive zoom; offscreen marches may be culled.");
        results.push({ width, height, kind: "hit-areas", ...geometry });
        const shot = await client.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(output, `${width}-${detail}.png`), Buffer.from(shot.data, "base64"));
      }

      // Rapid wheel bursts cross all three detail levels repeatedly. Timing is
      // diagnostic, not an absolute FPS CI gate on shared/virtualized machines.
      for (const cpu of [1, 4]) {
        await client.send("Emulation.setCPUThrottlingRate", { rate: cpu });
        await evaluate("zoom = .45; centerOnMap()");
        await delay(300);
        const before = await metrics();
        const wheel = await evaluate(`(async () => {
          const rect = mapFrame.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
          let writes = 0;
          const observer = new MutationObserver(records => writes += records.length);
          observer.observe(mapWorld, {attributes:true,attributeFilter:['style']});
          window.__CROWNLANDS_BENCHMARK__.beginSample('wheel-burst');
          for (let frame = 0; frame < 60; frame++) {
            await new Promise(requestAnimationFrame);
            for (let i = 0; i < 4; i++) mapFrame.dispatchEvent(new WheelEvent('wheel', {
              bubbles:true,cancelable:true,deltaY:frame % 10 < 5 ? -1 : 1,clientX:x,clientY:y
            }));
          }
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          writes += observer.takeRecords().length; observer.disconnect();
          const sample = window.__CROWNLANDS_BENCHMARK__.endSample();
          for (let i=0; i<60 && isCameraInteractionActive(); i++) await new Promise(resolve => setTimeout(resolve,50));
          return {writes,sample,settled:!isCameraInteractionActive(),detail:mapDetailLevel};
        })()`);
        const after = await metrics();
        assert(wheel.writes > 0 && wheel.writes <= 62, "Wheel input stopped coalescing camera transforms into animation frames.");
        assert(wheel.settled && wheel.detail === "far", "Wheel gesture did not settle at the expected detail level.");
        results.push({ width, height, cpu, kind: "wheel-burst", ...wheel, styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000 });
      }

      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
      const anchor = await evaluate(`(() => {
        zoom=.5; centerOnMap(); const rect=mapFrame.getBoundingClientRect();
        const x=rect.left+rect.width/2, y=rect.top+rect.height/2;
        return {x,y,point:screenToMap(x,y),zoom};
      })()`);
      await delay(400);
      await evaluate("window.__CROWNLANDS_BENCHMARK__.beginSample('touch-pinch')");
      const points = spread => [{ x: anchor.x - spread, y: anchor.y, id: 1 }, { x: anchor.x + spread, y: anchor.y, id: 2 }];
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(40) });
      for (let step = 1; step <= 48; step++) {
        const spread = 40 + (step <= 24 ? step : 48 - step) * 2.5;
        await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(spread) });
        await delay(16);
      }
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const pinch = await evaluate(`(async () => {
        const sample=window.__CROWNLANDS_BENCHMARK__.endSample();
        for(let i=0;i<60&&isCameraInteractionActive();i++) await new Promise(resolve=>setTimeout(resolve,50));
        return {sample,zoom,point:screenToMap(${anchor.x},${anchor.y}),settled:!isCameraInteractionActive(),pointers:activePointers.size};
      })()`);
      assert(pinch.settled && pinch.pointers === 0, "Pinch left the camera or pointers active.");
      assert(Math.abs(pinch.zoom - anchor.zoom) < .01, "Reversed pinch did not restore zoom.");
      assert(Math.hypot(pinch.point.x - anchor.point.x, pinch.point.y - anchor.point.y) < 1, "Pinch moved its world anchor.");
      results.push({ width, height, kind: "touch-pinch", ...pinch });
      await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      console.log(`Validated map zoom at ${width}x${height}: three detail levels, hit areas, rapid wheel bursts and touch pinch.`);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "regressions.json"), JSON.stringify({ results, errors }, null, 2));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
      await removeBrowserProfile(browser.profilePath);
    }
    await server.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
