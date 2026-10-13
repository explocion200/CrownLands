"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createPlacementFixture, samplePopulation } = require("./validate-marauder-terrain");
const { imagePointToWorld } = require("../functions/authoritative-route-planner");
const catalog = require("../functions/core-expansion-region-catalog.json"), roads = require("../functions/marauder-road-points.json");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium required");
  const fixture = createPlacementFixture(), artifacts = path.resolve(__dirname, "../release-artifacts/marauders/road-placement");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client; const errors = [], failedAssets = [], records = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    for (const domain of ["Page", "Runtime", "Network"]) await client.send(`${domain}.enable`);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Network.responseReceived", event => { if (event.response.status >= 400 && ["Image", "Stylesheet", "Script"].includes(event.type)) failedAssets.push(event.response.url); });
    const ev = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let attempt = 0; attempt < 500; attempt++) {
        if (await ev(expression)) return;
        if (errors.length) throw Error(JSON.stringify(errors));
        await delay(100);
      }
      throw Error(`Timeout: ${expression}`);
    };
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick" });
    await wait("document.documentElement?.dataset.crownlandsBenchmarkReady==='true'");
    for (const id of ["core-v2-north-support-p0-m2", "new-lands-l01-p001"]) {
      const region = catalog.regions.find(row => row.id === id), target = samplePopulation(fixture, region).enemies[0];
      assert(target, "Visual fixture needs a safe road spawn");
      const model = fixture.planner.getModel(id);
      const expectedImage = roads.templates[id].find(([x, y]) => {
        const world = imagePointToWorld(model, { x, y }); return Math.hypot(world.x - target.x, world.y - target.y) < 1e-6;
      });
      assert(expectedImage);
      // Isolated loopback fixture: load the real map/background and use a
      // server-selected road coordinate, with no production subscription.
      await ev(`(async()=>{__CROWNLANDS_BENCHMARK__.closeModal();await ensureRegionDefinitionLoaded(${JSON.stringify(id)});await preloadIslandMap(${JSON.stringify(id)});state.activeRegionId=${JSON.stringify(id)};state.online.activeRegionId=${JSON.stringify(id)};onlineActiveRegionId=${JSON.stringify(id)};window.roadQA=${JSON.stringify(target)};roadQA={...roadQA,id:'road-fixture-'+roadQA.regionId,spawnId:'road-spawn-'+roadQA.regionId,status:'active',targetType:'marauder',level:${region.permanentCore ? 90 : 10},name:'${region.permanentCore ? "Clan Boss" : "Marauder"}',worldId:ONLINE_WORLD_ID,resetGeneration:RESET_GENERATION};syncMapSurfaceToActiveIsland();applyOnlineMarauders([roadQA],roadQA.regionId);})()`);
      for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
        await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await ev("selectedTargetId=null;selectedMarauderSpawnId='';zoom=clampZoomForViewport(innerHeight<=320?0.65:1);centerOnWorldPoint(roadQA);if(innerHeight<=320){camera.y+=25/zoom;updateCameraTransform();}renderCities(true);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
        await wait("!!document.querySelector('.marauder-node')");
        const view = await ev(`(()=>{const node=document.querySelector('.marauder-node'),point=worldToMapPoint(roadQA),image=worldToIslandImagePointRaw(roadQA.regionId,roadQA),rect=node.getBoundingClientRect();return{image,dx:parseFloat(node.style.left)-point.x,dy:parseFloat(node.style.top)-point.y,markerWidth:getComputedStyle(node).width,art:node.querySelector('img').getAttribute('src'),label:node.textContent,visible:rect.right>0&&rect.left<innerWidth&&rect.bottom>0&&rect.top<innerHeight,hit:node.contains(document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height*0.75)),loaded:node.querySelector('img').complete&&node.querySelector('img').naturalWidth>0};})()`);
        assert(Math.abs(view.image.x - expectedImage[0]) < 1e-4 && Math.abs(view.image.y - expectedImage[1]) < 1e-4, "Client artwork uses the same painted-road coordinate as the server");
        assert(Math.abs(view.dx) < 0.01 && Math.abs(view.dy) < 0.01, JSON.stringify(view));
        assert.equal(view.markerWidth, region.permanentCore ? "115px" : "90px");
        assert.equal(view.art, `assets/marauders/${region.permanentCore ? "boss" : "solo"}-v1.webp`);
        assert(view.label.includes(region.permanentCore ? "Boss" : "Marauder"));
        if (!view.loaded) await wait("document.querySelector('.marauder-node img').naturalWidth>0");
        assert(view.visible && view.hit, JSON.stringify(view));
        fs.writeFileSync(path.join(artifacts, `${region.permanentCore ? "boss" : "solo"}-${width}x${height}.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
        records.push({ region: id, width, height, ...view });
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []);
    fs.writeFileSync(path.join(artifacts, "checks.json"), JSON.stringify({ passed: true, records }, null, 2));
    console.log("Road placement visual checks passed: real Core/New Lands backgrounds, server/client road coordinate agreement, 90/115px markers, desktop and both landscape sizes.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
