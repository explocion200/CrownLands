"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const proof = require("./map-art/clan-tower-clearance.json");
const { canonicalCityPositions } = require("./illustrated-map-coordinate-plan");
const layout = require("../functions/core-expansion-world-layout.json");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const intersects = (a, b) => a.x < b.x + b.w - .1 && a.x + a.w > b.x + .1 && a.y < b.y + b.h - .1 && a.y + a.h > b.y + .1;

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const directory = path.resolve(__dirname, "../release-artifacts/clan-tower-clearance");
  fs.mkdirSync(directory, { recursive: true });
  let browser, client;
  const errors = [], records = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const ev = async (fn, ...args) => {
      const result = await client.send("Runtime.evaluate", { expression: `(${fn.toString()})(${args.map(arg => JSON.stringify(arg)).join(",")})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async fn => { for (let i = 0; i < 300; i++) { if (await ev(fn)) return; await delay(100); } throw Error("Timed out: " + fn); };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await ready(() => document.documentElement?.dataset.crownlandsBenchmarkReady === "true");
      await ev(() => {
        window.__CROWNLANDS_BENCHMARK__.closeModal();
        const toggle = document.getElementById("chatToggleBtn");
        if (toggle?.getAttribute("aria-expanded") === "true") toggle.click();
        state.playerName = "A Long Named Clan Ruler";
        const api = getOnlineApi();
        getOnlineApi = () => ({ ...api, subscribeHoldingTowerState: () => () => {}, getHoldingTowerState: async () => ({ worldActive: true, towers: [window.clearanceTower] }) });
        const readScout = getScoutReport;
        getScoutReport = id => window.clearanceEnemy && id === window.clearanceTower?.id ? { targetId: id } : readScout(id);
      });
      for (const map of proof.maps) {
        const positions = await ev(async id => {
          if (modal.open) modal.close();
          clearSelection(false);
          const definition = HOLDING_TOWER_DEFINITIONS.find(tower => tower.regionId === id);
          await ensureRegionDefinitionLoaded(id);
          const data = await (await fetch(REGION_CATALOG_SUMMARIES_BY_ID.get(id).regionDefinitionPath)).json();
          state.cities = data.cities.map((city, i) => ({ ...createEditorCitySlot(WORLD_REGIONS_BY_ID.get(id), city, i), level: 100, owner: "player", name: "The Crownlands Grand Castle", troops: 1000000000 }));
          centerOnRegion(id);
          const visual = getHoldingTowerVisual(definition.id);
          window.clearanceTower = HOLDING_TOWER_UI.createQaSnapshot(visual, "owner");
          state.clanId = clearanceTower.clanId;
          ensureHoldingTowerMapSubscriptions();
          return state.cities.map(city => [city.id, { x: city.x, y: city.y }]);
        }, map.id);
        assert.deepEqual(positions, [...canonicalCityPositions(layout, map.id)], "Client/server city coordinates differ");
        assert(await ev(move => {
          const from = cityById(move.id), to = state.cities.find(city => city.id !== from.id);
          const oldStart = islandImagePointToWorld(from.regionId, move.from);
          const mission = { fromId: from.id, toId: to.id, sourceRegionId: from.regionId, targetRegionId: to.regionId, departAt: 1000, arriveAt: 61000,
            pathSegments: [{ regionId: from.regionId, points: [oldStart, { x: to.x, y: to.y }] }] };
          const before = JSON.stringify(mission), segments = getMissionDisplayRouteSegments(mission);
          return JSON.stringify(mission) === before && segments[0].points[0].x === from.x && segments[0].points[0].y === from.y
            && segments.at(-1).points.at(-1).x === to.x && segments.at(-1).points.at(-1).y === to.y;
        }, map.moves[0]), "Existing march must align to the relocated city without changing its timing or stored path");
        for (const [level, enemy] of [[1, false], [4, false], [7, false], [10, false], [10, true]]) for (const z of [.4, .6, 1]) {
          await ev(({ level, enemy, z }) => {
            window.clearanceEnemy = enemy;
            Object.assign(clearanceTower, HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(clearanceTower.id), enemy ? "enemy" : "owner"),
              { buildings: { shop: level, workshop: level, infirmary: level, training: level }, buildingProject: null });
            holdingTowerSnapshots.set(clearanceTower.id, clearanceTower);
            selectedTowerMapId = clearanceTower.id;
            zoom = z;
            centerOnRegion(clearanceTower.regionId);
            cityRenderSignature = "";
            renderAll();
            updateCameraTransform();
          }, { level, enemy, z });
          await ready(() => cityLayer.querySelectorAll(".holding-tower-building-node").length === 4 && [...cityLayer.querySelectorAll(".holding-tower-building-node>img,.holding-tower-art,.city-art")].every(image => image.complete && image.naturalWidth > 0));
          // Camera rendering is scheduled on animation frames; inspect the painted layout.
          await ev(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const measure = await ev(() => {
            const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
            return {
              compound: [...cityLayer.querySelectorAll(".holding-tower-node,.holding-tower-building-node,.holding-tower-map-label,.ctb-map-label,.holding-tower-clan-banner"), ...mapFrame.querySelectorAll("[data-clan-tower-map-action]")].map(node => ({ kind: node.className, ...box(node) })).filter(r => r.w && r.h),
              cities: [...cityLayer.querySelectorAll(".city-node")].map(node => ({ id: node.dataset.cityId, boxes: [box(node), box(node.querySelector(".city-art")), box(node.querySelector(".city-label"))] })),
              buildings: [...cityLayer.querySelectorAll(".holding-tower-building-node>img")].map(image => image.getAttribute("src")),
              actions: mapFrame.querySelectorAll("[data-clan-tower-map-action]").length,
            };
          });
          assert.equal(measure.buildings.length, 4);
          assert.equal(measure.actions, enemy ? 4 : 3, "Cover the wider scouted-rival action row as well as the owner row");
          const stage = level === 10 ? 4 : Math.ceil(level / 3);
          assert(measure.buildings.every(source => source.endsWith(`-${stage}.webp`)));
          assert(measure.cities.length > 0, "City fixture is empty");
          for (const city of measure.cities) for (const box of city.boxes) for (const compound of measure.compound) {
            assert(!intersects(box, compound), `${map.id} ${width}x${height} zoom ${z} stage ${stage}: ${city.id} overlaps ${compound.kind}`);
          }
          records.push({ map: map.id, width, height, zoom: z, stage, enemy, checkedCities: measure.cities.length, overlaps: 0 });
          if (level === 10 && !enemy && z === (height < 600 ? .4 : .6)) {
            const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
            fs.writeFileSync(path.join(directory, `${width}-${map.towerId}.png`), Buffer.from(screenshot.data, "base64"));
          }
        }
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(directory, "browser-checks.json"), JSON.stringify({ records, errors }, null, 2));
    console.log(`Validated ${records.length} fully built Tower layouts: all four maps, four building stages, three zoom levels, desktop and two landscape mobile sizes; no city/art/label/action overlaps or browser errors.`);
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
