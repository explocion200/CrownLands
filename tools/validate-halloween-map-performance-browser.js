"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function prepareScene() {
  __CROWNLANDS_BENCHMARK__.closeModal();
  isHalloweenMapSeason = () => true;
  const id = "new-lands-l02-p032", fixture = __CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  applyCoreExpansionRealmState({ coreExpansion: { activeRegionIds: [id] } });
  await ensureRegionDefinitionLoaded(id);
  fixture.citiesByRegion[id] = getPlayableBaseCitiesByRegion(id).map(base => ({ ...createNeutralCityFromBase(base), level: 125 }));
  if (!await switchOnlineIsland(id, { fromMapPicker: true })) throw Error("Fixture map did not open");
  usesServerEconomyAuthority = () => true;
  usesServerArmyAuthority = () => true;
  const cities = state.cities.filter(city => getCityRegionId(city) === id);
  const now = getArmyClockNowMs();
  onlineArmies = Array.from({ length: 25 }, (_, n) => {
    const from = cities[n % cities.length], to = cities[(n + 11) % cities.length];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    return { id: `decoration-march-${n}`, owner: "player", ownerKind: "player", ownerUid: getCurrentOnlineUid(),
      status: "active", kind: "transfer", launchKind: "transfer", viewerAccess: "owner", troopVisibility: "exact", troops: 12500,
      sourceRegionId: id, targetRegionId: id, fromId: from.id, toId: to.id, fromName: from.name, toName: to.name,
      launchedAtMs: now - 60000 - n * 1000, arrivesAtMs: now + 600000, total: 660, remaining: 600,
      pathSegments: [{ regionId: id, points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], length }] };
  });
  const layouts = await loadHalloweenMapLayouts();
  window.decorationPerf = { region: id, layouts, placements: layouts.maps[id], cities: cities.length, marches: onlineArmies.length };
  setZoomAroundPoint(.65, innerWidth / 2, innerHeight / 2); centerOnMap(); renderCities(true); renderArmies(true);
}

async function sampleScene(moving) {
  const origin = { x: camera.x, y: camera.y, zoom };
  const start = performance.now(), times = [];
  let last = null;
  await new Promise(resolve => {
    function tick(now) {
      if (last !== null) times.push(now - last);
      last = now;
      if (moving) {
        const t = (now - start) / 3000 * Math.PI * 2;
        camera.x = origin.x + Math.sin(t) * 150;
        camera.y = origin.y + Math.cos(t) * 90;
        zoom = origin.zoom + Math.sin(t) * .08;
        markCameraInteraction({ zooming: true }); updateCameraTransform();
      }
      if (now - start < 3000) requestAnimationFrame(tick); else resolve();
    }
    requestAnimationFrame(tick);
  });
  camera.x = origin.x; camera.y = origin.y; zoom = origin.zoom; updateCameraTransform();
  times.sort((a, b) => a - b);
  return { elapsedMs: performance.now() - start, frames: times.length, p95Ms: times[Math.floor(times.length * .95)], slowFrames: times.filter(ms => ms > 50).length };
}

async function main() {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.resolve(__dirname, "../release-artifacts/halloween-map-decorations");
  fs.mkdirSync(output, { recursive: true });
  let browser, client;
  const samples = [], comparisons = [], stabilityResults = [], fixtures = [], errors = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Chromium required");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    for (const domain of ["Page", "Runtime", "Performance"]) await client.send(`${domain}.enable`);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let n = 0; n < 400; n++) { if (await evaluate(expression)) return; await delay(50); }
      throw Error("Timed out: " + expression);
    };
    const metrics = async () => Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map(metric => [metric.name, metric.value]));
    for (const [width, height, dpr] of [[1440, 900, 1], [844, 390, 2]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: height < 600 });
      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready' && !isMapInteractionBlocked()");
      await evaluate(`(${prepareScene.toString()})()`);
      await wait("!isMapInteractionBlocked() && mapBg.querySelector('.island-art-map.active')?.dataset.imageRegion===decorationPerf.region");
      assert.equal(await evaluate("decorationPerf.placements.length"), 24, "Measure the full decoration budget");
      const fixture = await evaluate("({cities:decorationPerf.cities,marches:decorationPerf.marches,tokens:armyTokenCache.size})");
      assert.equal(fixture.cities, 40); assert.equal(fixture.marches, 25);
      // The phone viewport correctly culls marches beyond its visible bounds.
      assert(fixture.tokens > 0 && fixture.tokens <= 25, "Expected visible army tokens");
      fixtures.push({ width, height, ...fixture });
      for (const rate of [1, 4]) for (const moving of [false, true]) {
        await client.send("Emulation.setCPUThrottlingRate", { rate });
        // Repeat ABBA twice: four samples per variant reduce scheduling noise
        // on shared hosts without changing the relative regression thresholds.
        for (const count of [9, 24, 24, 9, 9, 24, 24, 9]) {
          await evaluate(`(async()=>{
            decorationPerf.layouts.maps[decorationPerf.region]=decorationPerf.placements.slice(0,${count});
            await renderHalloweenMapDecorations(decorationPerf.region,mapImageSwapToken);
            await Promise.all([...mapBg.querySelectorAll('.halloween-map-decorations img')].map(image=>image.decode()));
          })()`);
          assert.equal(await evaluate("mapBg.querySelector('.halloween-map-decorations').children.length"), count);
          assert.equal(await evaluate("mapBg.querySelector('.halloween-map-decorations').getAnimations({subtree:true}).length"), 0);
          await delay(400);
          const before = await metrics(), frames = await evaluate(`(${sampleScene.toString()})(${moving})`), after = await metrics();
          samples.push({ width, height, dpr, rate, moving, count, ...frames, taskMsPerSecond: (after.TaskDuration - before.TaskDuration) * 1e6 / frames.elapsedMs,
            styleMsPerSecond: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1e6 / frames.elapsedMs });
        }
        const rows = samples.filter(sample => sample.width === width && sample.rate === rate && sample.moving === moving);
        const summarize = count => ({ p95Ms: median(rows.filter(row => row.count === count).map(row => row.p95Ms)), taskMsPerSecond: median(rows.filter(row => row.count === count).map(row => row.taskMsPerSecond)) });
        const previous = summarize(9), current = summarize(24);
        const comparison = { width, height, dpr, rate, moving, previous, current };
        comparisons.push(comparison); console.log(JSON.stringify(comparison));
        // Relative gates tolerate one display-frame of host scheduling noise.
        // They check added cost; this does not promise a device's absolute FPS.
        assert(current.p95Ms <= previous.p95Ms * 1.25 + 8.4, "Denser scenery regressed frame pacing");
        assert(current.taskMsPerSecond <= previous.taskMsPerSecond * 1.25 + 20, "Denser scenery regressed main-thread CPU time");
      }
      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const stability = await evaluate(`(async()=>{
        decorationPerf.layouts.maps[decorationPerf.region]=decorationPerf.placements;
        for(let n=0;n<30;n++)await renderHalloweenMapDecorations(decorationPerf.region,mapImageSwapToken);
        const layer=mapBg.querySelector('.halloween-map-decorations'), observer=new MutationObserver(()=>{});
        observer.observe(layer,{subtree:true,attributes:true,childList:true});
        const started=performance.now();for(let n=0;n<1000;n++)refreshHalloweenDecorationVisibility();
        const result={layers:mapBg.querySelectorAll('.halloween-map-decorations').length,nodes:layer.children.length,mutations:observer.takeRecords().length,refreshMs:performance.now()-started};
        observer.disconnect();return result;
      })()`);
      assert.equal(stability.layers, 1); assert.equal(stability.nodes, 24); assert.equal(stability.mutations, 0);
      assert(stability.refreshMs < 100, "Visibility refresh exceeds 0.1ms per call");
      stabilityResults.push({ width, height, ...stability });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "performance.json"), JSON.stringify({ scenario: "40 maximum-level cities, 25 marching armies; previous 9 props versus 24; repeated ABBA sampling; idle and pan/zoom", synthetic: true, sampleDurationMs: 3000, summary: "Median of four samples per configuration", fixtures, samples, comparisons, stabilityResults, errors }, null, 2) + "\n");
    console.log("PASS decoration density performance: frame/CPU comparison, 24-node cap, no animation, no accumulating layers and no idle DOM writes.");
  } finally {
    fs.writeFileSync(path.join(output, "performance-samples.json"), JSON.stringify({ samples, comparisons, errors }, null, 2) + "\n");
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
