"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createTravelFixture, canonicalCity } = require("./world-travel-test-fixtures");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const browser = [process.env.CHROME_PATH, process.env.CROWNLANDS_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(browser, "Set CHROME_PATH for distant-city order checks.");
  // Current Core + both open New Lands rings. Use actual opaque Core IDs,
  // unlike the benchmark's prefixed synthetic IDs, which survive cache eviction.
  const world = createTravelFixture(56);
  const sourceMap = world.maps.find(map => map.gridX === -2 && map.gridY === 2);
  const targetMap = world.maps.find(map => map.gridX === 4 && map.gridY === -4);
  const source = canonicalCity(world.planner, sourceMap.id);
  const target = canonicalCity(world.planner, targetMap.id);
  assert.match(source.id, /^core_[a-f0-9]{18}$/);
  const route = world.planner.calculate(source, target);
  assert(route?.routeRegionIds.length > 8);
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/distant-city-attack-routes");
  fs.mkdirSync(artifacts, { recursive: true });
  const evidence = { scope: "Local browser, current Core topology, synthetic owners and mocked acknowledgements; no production writes.", viewports: [] };
  let session, client;
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(tab => tab.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Network.setBlockedURLs", { urls: ["*googleapis.com*", "*cloudfunctions.net*", "*firebaseio.com*", "*playcrownlands.com*"] });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const until = async expression => {
      for (let attempt = 0; attempt < 120; attempt++) {
        if (await evaluate(expression)) return;
        await wait(100);
      }
      throw Error(`Timed out: ${expression}`);
    };
    for (const viewport of [{ name: "desktop", width: 1366, height: 820 },
      { name: "landscape", width: 844, height: 390 }, { name: "short-landscape", width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await until("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'");
      const fixture = { source, target, route, expansion: { revision: 99, activeRegionIds: world.activeRegionIds, regions: world.descriptors } };
      const setup = await evaluate(`(async () => {
        const fixture = ${JSON.stringify(fixture)};
        applyCoreExpansionRealmState({ coreExpansion: fixture.expansion });
        window.orderQa = { requests: [], previews: [], route: fixture.route, failPreview: true };
        const qa = orderQa;
        qa.source = { ...fixture.source, owner: 'player', ownerUid: getCurrentOnlineUid(), troops: 1000, troopFloat: 1000, level: 50 };
        qa.target = { ...fixture.target, owner: 'enemy', ownerUid: 'distant-route-fixture', troops: 500, level: 50, isMainCity: false };
        state.cities = [...state.cities.filter(city => ![qa.source.id, qa.target.id].includes(city.id)), qa.source, qa.target];
        await ensureRegionDefinitionLoaded(qa.source.regionId);
        getPlayableBaseCitiesByRegion(qa.source.regionId);
        const warmRegion = getCityRegionId(qa.source.id);
        for (const id of getRegionIds().filter(id => id !== qa.source.regionId).slice(0, REGION_DEFINITION_CACHE_LIMIT + 2)) {
          await ensureRegionDefinitionLoaded(id);
        }
        const originalApi = window.CrownlandsOnline;
        window.CrownlandsOnline = { ...originalApi,
          previewArmyRoute: async request => {
            qa.previews.push(request);
            await new Promise(resolve => { qa.finishPreview = resolve; });
            if (qa.failPreview) throw Error('Route verification temporarily unavailable.');
            return { ...qa.route, durationMs: 120000, speedMultiplier: 1, requestedTroops: request.requestedTroops };
          },
          submitRecoverableArmyOrder: async request => {
            qa.requests.push(request);
            return { movement: { ...request.army, ...qa.route, status: 'active' },
              sourceCity: { id: qa.source.id, regionId: qa.source.regionId, troops: 500 } };
          }
        };
        lastSelectedOwnedCityId = qa.source.id;
        return { warmRegion, coldRegion: getCityRegionId(qa.source.id), evicted: !getPlayableBaseCityById(qa.source.id),
          definitionEvicted: !regionDefinitionCache.has(qa.source.regionId), activeMaps: getRegionIds().length };
      })()`);
      assert.equal(setup.activeMaps, 81);
      assert(setup.evicted && setup.definitionEvicted, "Exercise real map-cache eviction.");
      assert.equal(setup.warmRegion, source.regionId);
      assert.equal(setup.coldRegion, source.regionId, "An off-screen opaque city ID must retain its region.");
      await evaluate("attackForeignCity(orderQa.target.id)");
      await until("Boolean(orderQa.finishPreview)");
      assert(await evaluate("modal.open && document.querySelector('#troopSliderConfirm').disabled"), "Wait for server route verification.");
      await evaluate("orderQa.finishPreview()");
      await until("Boolean(document.querySelector('#retryTravelRoute'))");
      assert(await evaluate("document.querySelector('#troopSliderConfirm').disabled && orderQa.requests.length === 0"), "A failed route check must not launch troops.");
      await evaluate("orderQa.failPreview = false; orderQa.finishPreview = null; document.querySelector('#retryTravelRoute').click()");
      await until("Boolean(orderQa.finishPreview)");
      await evaluate("orderQa.finishPreview()");
      await until("Boolean(document.querySelector('#troopSliderConfirm') && !document.querySelector('#troopSliderConfirm').disabled)");
      const panel = await evaluate(`(() => {
        const button = document.querySelector('#troopSliderConfirm').getBoundingClientRect();
        return { sourceRegion: activeTroopSliderRoute.route.segments[0].regionId,
          targetRegion: activeTroopSliderRoute.route.segments.at(-1).regionId,
          authoritative: isOrderRouteReady(activeTroopSliderRoute.route),
          buttonVisible: button.left >= 0 && button.right <= innerWidth && button.top >= 0 && button.bottom <= innerHeight };
      })()`);
      assert.equal(panel.sourceRegion, source.regionId);
      assert.equal(panel.targetRegion, target.regionId);
      assert(panel.authoritative && panel.buttonVisible);
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, `${viewport.name}.png`), Buffer.from(screenshot.data, "base64"));
      await evaluate("document.querySelector('#troopSliderConfirm').click()");
      await until("orderQa.requests.length === 1 && pendingOutgoingMissions.size === 0");
      const submitted = await evaluate(`(() => {
        const request = orderQa.requests[0];
        return { sourceRegionId: request.sourceRegionId, armySourceRegionId: request.army.sourceRegionId,
          targetRegionId: request.targetRegionId, fromId: request.army.fromId, toId: request.army.toId,
          regions: request.routeRegionIds, kind: request.army.kind };
      })()`);
      assert.equal(submitted.sourceRegionId, source.regionId);
      assert.equal(submitted.armySourceRegionId, source.regionId);
      assert.equal(submitted.targetRegionId, target.regionId);
      assert.equal(submitted.fromId, source.id);
      assert.equal(submitted.toId, target.id);
      assert.equal(submitted.kind, "attack");
      assert.deepEqual(new Set(submitted.regions), new Set(route.routeRegionIds), "No fallback/closed region may enter the order.");
      // A delayed order keeps explicit endpoint metadata even if its source has
      // left the visible state. Do not replace it with an inferred fallback.
      const retained = await evaluate(`(async () => {
        const mission = { owner: 'player', kind: 'transfer', fromId: orderQa.source.id, toId: orderQa.target.id,
          sourceRegionId: orderQa.source.regionId, targetRegionId: orderQa.target.regionId,
          troops: 1, total: 120, path: orderQa.route.path, pathSegments: orderQa.route.pathSegments };
        state.cities = state.cities.filter(city => city.id !== mission.fromId);
        await publishOnlineArmyMovement(mission);
        const request = orderQa.requests.at(-1);
        return { source: request.sourceRegionId, armySource: request.army.sourceRegionId, regions: request.routeRegionIds };
      })()`);
      assert.equal(retained.source, source.regionId);
      assert.equal(retained.armySource, source.regionId);
      assert.deepEqual(new Set(retained.regions), new Set(route.routeRegionIds));
      const row = { ...viewport, ...setup, ...panel, submitted, retained };
      evidence.viewports.push(row);
      console.log(`${viewport.name}: evicted source, authoritative preview, attack payload and retained order endpoints passed.`);
    }
    fs.writeFileSync(path.join(artifacts, "browser-validation.json"), JSON.stringify(evidence, null, 2));
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
