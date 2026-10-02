"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executablePath = [process.env.CHROME_PATH, process.env.CROWNLANDS_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executablePath, "Set CHROME_PATH to run marching army browser checks.");
  const server = createMapBenchmarkServer();
  const address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/marching-army-visibility");
  fs.mkdirSync(artifacts, { recursive: true });
  let session, client;
  const closeBrowser = async () => {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) {
      await waitForProcessExit(session.browserProcess);
      await removeBrowserProfile(session.profilePath);
    }
    client = null;
    session = null;
  };
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      session = await startBrowserSession(executablePath);
      client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
      await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
      await client.send("Network.setBypassServiceWorker", { bypass: true });
      const errors = [];
      client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
      client.on("Fetch.requestPaused", event => {
        const local = new URL(event.request.url).origin === address.url;
        void client.send(local ? "Fetch.continueRequest" : "Fetch.failRequest", {
          requestId: event.requestId, ...(local ? {} : { errorReason: "BlockedByClient" }),
        }).catch(error => errors.push(error.message));
      });
      await client.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
      const evaluate = async expression => {
        const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      };
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      for (let attempt = 0; attempt < 240; attempt++) {
        const status = await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus()");
        if (status?.status === "error") throw Error(status.error);
        if (status?.status === "ready") break;
        await delay(250);
      }
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"), "ready");
      const runCases = () => {
        const check = (value, message) => { if (!value) throw Error(message); };
        const fixture = window.__CROWNLANDS_BENCHMARK__.fixture;
        const region = getActiveMapRegionId();
        const bounds = getActiveMapBounds();
        const middle = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
        const source = { ...state.cities[0], id: "visibility-source", name: "Origin Keep", regionId: region,
          x: middle.x - 400, y: middle.y };
        const target = { ...source, id: "visibility-target", name: "Destination Keep", x: middle.x + 400 };
        const originalCities = state.cities;
        const now = getArmyClockNowMs();
        let clock = now;
        getArmyClockNowMs = () => clock;
        centerOnWorldPoint(middle);
        state.attacks = [];
        pendingOutgoingMissions.clear();
        onlineArmiesByIsland.clear();
        onlineArmies = [];
        resolvedOnlineArmyIds.clear();
        state.clanId = "visibility-clan";
        activeClanSubscriptionId = state.clanId;
        clanRosterReady = true;
        clanMemberUidSet = new Set([getCurrentOnlineUid(), "visibility-ally"]);
        const base = { id: "visibility-march", status: "active", kind: "attack", launchKind: "attack",
          ownerKind: "player", ownerUid: "visibility-rival", ownerName: "Test Ruler",
          fromId: source.id, toId: target.id, fromName: source.name, toName: target.name,
          sourceRegionId: region, targetRegionId: region, total: 120, remaining: 60,
          launchedAtMs: now - 60000, arrivesAtMs: now + 60000,
          troopVisibility: "estimate", troopEstimateMin: 100, troopEstimateMax: 499, troopEstimateLabel: "100–499",
          pathSegments: [{ regionId: region, points: [{ x: source.x, y: source.y }, { x: target.x, y: target.y }], length: 800 }] };
        const cases = [
          ["own attack", { ownerUid: getCurrentOnlineUid(), viewerAccess: "owner", troopVisibility: "exact", troops: 321 }, "player", true],
          ["clan attack", { ownerUid: "visibility-ally" }, "clan-attack", true],
          ["rival attack", {}, "enemy", true],
          ["own transfer", { ownerUid: getCurrentOnlineUid(), kind: "transfer", launchKind: "transfer", troopVisibility: "exact", troops: 321 }, "player", true],
          ["clan transfer", { ownerUid: "visibility-ally", kind: "transfer", launchKind: "transfer", troopVisibility: "hidden" }, "clan-ally", false],
          ["rival transfer", { kind: "transfer", launchKind: "transfer", troopVisibility: "hidden" }, "enemy", false],
          ["reinforcement", { kind: "reinforce", launchKind: "reinforce" }, "enemy", true],
          ["scout", { kind: "scout", launchKind: "scout", troopVisibility: "exact", troops: 1 }, "enemy", true],
          ["rally", { ownerUid: "visibility-ally", rallyAttack: true }, "clan-attack", true],
          ["return", { ownerUid: "visibility-ally", returning: true, recalledAtMs: now - 60000,
            returnStartProgress: 1 }, "clan-ally", true],
        ];
        const render = army => {
          onlineArmies = [army];
          renderPaths();
          renderArmies(true);
          return armyTokenCache.get(army.id);
        };
        let checked = 0;
        for (const [label, patch, color, showCount] of cases) {
          for (const missing of ["neither", "origin", "destination", "both"]) {
            state.cities = [...originalCities,
              ...(["origin", "both"].includes(missing) ? [] : [source]),
              ...(["destination", "both"].includes(missing) ? [] : [target])];
            const army = { ...base, ...patch };
            const token = render(army);
            check(pathsSvg.querySelectorAll(".army-route-flow").length === 1, `${label}/${missing}: route missing`);
            check(token?.isConnected && !token.hidden, `${label}/${missing}: route visible but troop marker missing`);
            check(token.classList.contains(color), `${label}/${missing}: wrong relationship color`);
            check(token.querySelector(".army-token-count").hidden === !showCount, `${label}/${missing}: troop privacy changed`);
            const count = token.querySelector(".army-token-count").textContent;
            check(count === (showCount ? String(army.troops || army.troopEstimateLabel) : ""), `${label}/${missing}: incorrect troop disclosure`);
            check(token.getAttribute("aria-label").includes(target.name), `${label}/${missing}: destination name missing`);
            check(token.title.includes(target.name), `${label}/${missing}: destination tooltip missing`);
            const expected = worldToMapPoint(getMissionPointAtProgress(army, getArmyTravelProgress(army)).point);
            const displayed = token.style.transform.match(/^translate\(([-.\d]+)px, ([-.\d]+)px\)/);
            check(displayed && Math.max(Math.abs(Number(displayed[1])-expected.x), Math.abs(Number(displayed[2])-expected.y)) * zoom * devicePixelRatio <= .126, `${label}/${missing}: marker left its route`);
            check(armyTokenCache.size === 1, `${label}/${missing}: duplicate token`);
            checked++;
          }
        }
        // An observer on an intermediate map need not have either endpoint loaded.
        state.cities = originalCities;
        const other = fixture.neighborRegionId;
        const segments = [other, region, other].map(regionId => ({ regionId, length: 800,
          points: [{ x: source.x, y: source.y }, { x: target.x, y: target.y }] }));
        const crossing = { ...base, sourceRegionId: other, targetRegionId: other, pathSegments: segments };
        const token = render(crossing);
        check(token?.isConnected && !token.hidden, "Intermediate map lost the army with both endpoints unloaded");
        const before = token.style.transform;
        clock += 1000;
        renderVisibleArmyMotion();
        check(token.style.transform !== before, "Army stopped moving between label refreshes");
        clock = now + 50000;
        renderVisibleArmyMotion();
        check(token.hidden, "Army remained on the previous map after crossing a portal");
        renderArmies(true);
        check(!armyTokenCache.size, "Departed marker was not removed");
        check(pathsSvg.querySelectorAll(".army-route-flow").length === 1, "Cross-region route should remain visible");
        clock = now;
        const reentered = render(crossing);
        check(reentered?.isConnected && !reentered.hidden, "Army did not reappear on its current map");
        // A fresh snapshot and a later city-cache refresh must retain one marker.
        check(render({ ...crossing }) === reentered, "Snapshot replaced the army marker");
        state.cities = [...originalCities, source, target];
        check(render({ ...base }) === reentered, "Loading endpoints replaced the army marker");
        check(armyTokenCache.size === 1, "Endpoint hydration duplicated the army");
        // A real tap must expose both endpoints even when they are not cached.
        state.cities = originalCities;
        const visible = render(base);
        visible.click();
        check(!visible.querySelector(".army-token-nav").hidden, "Route navigation did not open");
        for (const [kind, name] of [["from", source.name], ["to", target.name]]) {
          const button = visible.querySelector(`[data-army-endpoint="${kind}"]`);
          check(!button.disabled && button.getAttribute("aria-label").includes(name), `Missing ${kind} navigation`);
        }
        const rect = visible.getBoundingClientRect();
        check(rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth
          && rect.bottom > 0 && rect.top < innerHeight, "Marker is outside the viewport");
        const style = getComputedStyle(visible);
        check(style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0, "CSS hid the marker");
        return { checked, intermediateMap: true, motion: true, portalCrossing: true, snapshot: true, navigation: true };
      };
      const result = await evaluate(`(${runCases.toString()})()`);
      assert.equal(errors.length, 0, errors.join("\n"));
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, `marches-${viewport.width}.png`), Buffer.from(screenshot.data, "base64"));
      console.log(JSON.stringify({ viewport, ...result }));
      await closeBrowser();
    }
  } finally {
    await closeBrowser();
    await server.close();
  }
  console.log("March visibility passed: unloaded endpoints, own/clan/rival movement, hidden counts, cross-region motion and destination controls. Production requests blocked.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
