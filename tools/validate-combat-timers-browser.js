"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/combat-timers");
async function main() {
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(browser, "Set CHROME_PATH to a Chromium browser.");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [], results = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
    const evaluate = async (fn, arg) => {
      const result = await client.send("Runtime.evaluate", { expression: `(${fn.toString()})(${JSON.stringify(arg ?? null)})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    for (let i = 0; i < 240 && !await evaluate(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready"); i++) await wait(250);
    assert.equal(await evaluate(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status), "ready");
    // Only the loopback game fixture receives synthetic snapshots; no production calls.
    await evaluate(() => {
      window.__CROWNLANDS_BENCHMARK__.closeModal();
      pendingOfflineRewardsSummary = null;
      getCurrentOnlineUid = () => "combat-viewer";
      window.combatFixtureNow = getClanQuestServerNowMs();
      window.combatFixture = { uid: "combat-viewer", shieldExpiresAtMs: combatFixtureNow + 900_000,
        retaliation: Array.from({ length: 12 }, (_, i) => ({ id: `capture-${i}`, cityId: `city-${i}`, cityName: i === 0 ? "Stoneward Keep" : `Captured city ${i + 1}`,
          regionId: "Northgate March", status: "available", capturedAtMs: combatFixtureNow - 10_000, expiresAtMs: combatFixtureNow + 300_000 + i * 30_000 })) };
      onlineCombatAuthorization = structuredClone(combatFixture);
      renderCombatTimers();
    });
    for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "landscape", width: 844, height: 390 }, { name: "small-landscape", width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
      const chatClear = await evaluate(() => {
        document.querySelector("#combatTimers details").open = false;
        const a = document.getElementById("combatTimers").getBoundingClientRect(), b = document.getElementById("chatToggleBtn").getBoundingClientRect();
        return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
      });
      assert(chatClear, `Combat timers overlap Chat at ${viewport.name}`);
      await evaluate(() => { document.querySelector("#combatTimers details").open = true; renderCombatTimers(); });
      await wait(150);
      const layout = await evaluate(() => {
        const timers = document.getElementById("combatTimers"), gold = document.querySelector(".profile-gold");
        const r = timers.getBoundingClientRect(), g = gold.getBoundingClientRect();
        const panel = timers.querySelector(".retaliation-list-panel"), p = panel.getBoundingClientRect();
        return { belowGold: r.top >= g.bottom, width: r.width, bounds: { x: r.x, y: r.y, bottom: r.bottom },
          listVisible: p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight,
          scrollable: panel.scrollHeight > panel.clientHeight, count: timers.querySelectorAll("li").length, text: timers.innerText,
          listOnTop: panel.contains(document.elementFromPoint(p.left + 15, p.bottom - 15)) };
      });
      assert(layout.belowGold && layout.width <= 190 && layout.listVisible && layout.scrollable && layout.listOnTop, JSON.stringify({ viewport, layout }));
      assert.equal(layout.count, 12);
      assert.match(layout.text, /12 Active/);
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, viewport.name + ".png"), Buffer.from(shot.data, "base64"));
      results.push({ viewport, layout });
    }
    const states = await evaluate(() => {
      const element = document.getElementById("combatTimers"), ui = CrownlandsCombatTimersUI;
      const single = { ...combatFixture, retaliation: [combatFixture.retaliation[0]] };
      ui.render(element, single, combatFixtureNow);
      const one = element.querySelector("summary").textContent;
      const title = element.querySelector("summary").title;
      ui.render(element, single, combatFixtureNow + 300_001);
      const retaliationExpired = element.querySelector("details").hidden;
      ui.render(element, single, combatFixtureNow + 900_001);
      const allExpired = element.hidden;
      ui.render(element, {}, combatFixtureNow);
      const signedOut = element.hidden;
      // Reconstruct the view from the same server timestamps, at a later time.
      ui.render(element, JSON.parse(JSON.stringify(combatFixture)), combatFixtureNow + 30_000);
      const reconstructed = element.querySelector("[data-shield-cooldown] strong").textContent;
      const reboundCount = element.querySelectorAll("li").length;
      return { one, title, retaliationExpired, allExpired, signedOut, reconstructed, reboundCount };
    });
    assert.match(states.one, /05:00/);
    assert.match(states.title, /Stoneward Keep/);
    assert(states.retaliationExpired && states.allExpired && states.signedOut);
    assert.equal(states.reconstructed, "14:30");
    assert.equal(states.reboundCount, 12);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, "verification.json"), JSON.stringify({ results, states, errors }, null, 2));
    console.log("Combat timers browser passed: under Gold, all 12 records, scrolling at three supported sizes, single-city label, independent expiry, account clearing and timestamp reconstruction.");
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
