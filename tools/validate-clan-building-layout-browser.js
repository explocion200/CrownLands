"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const { createMapBenchmarkServer } = require("./map-benchmark/server");

async function main() {
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executablePath, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/clan-building-layout");
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await startBrowserSession(executablePath);
  const client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await Promise.all(["Page.enable", "Runtime.enable"].map(method => client.send(method)));
  const errors = [];
  client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  const ev = async (fn, ...args) => {
    const result = await client.send("Runtime.evaluate", { expression: '(' + fn.toString() + ')(' + args.map(arg => JSON.stringify(arg)).join(',') + ')', awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const ready = async (fn, ...args) => { for (let i = 0; i < 400; i++) { if (await ev(fn, ...args)) return; await delay(100); } throw Error("Timed out: " + fn); };
  const click = async selector => {
    const point = await ev(selector => { const node = modalBody.querySelector(selector), r = node.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; return { x, y, reachable: r.width > 0 && r.height > 0 && node.contains(document.elementFromPoint(x, y)) }; }, selector);
    assert(point.reachable, "Unreachable control: " + selector);
    for (const type of ["mousePressed", "mouseReleased"]) await client.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
  };
  const screenshot = async name => fs.writeFileSync(path.join(artifacts, name), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  const frameStyle = () => ev(() => {
    const shell = modalBody.querySelector(".tower-shell, .clan-building-shell");
    const rect = node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); };
    const style = (node, properties) => { const css = getComputedStyle(node); return Object.fromEntries(properties.map(key => [key, css[key]])); };
    return {
      window: rect(modal),
      backdrop: getComputedStyle(modal, "::backdrop").backgroundColor,
      frame: style(modal, ["backgroundColor", "border", "padding", "borderRadius", "boxShadow"]),
      shell: style(shell, ["backgroundColor", "border", "color"]),
      header: rect(shell.querySelector(".window-header")),
      headerStyle: style(shell.querySelector(".window-header"), ["backgroundImage", "padding"]),
      title: style(shell.querySelector(".heading h1"), ["fontSize", "fontFamily", "color"]),
      tabs: style(shell.querySelector(".tabs-bar, .clan-building-tabs"), ["backgroundColor"]),
      selectedTab: style(shell.querySelector('[role="tab"][aria-selected="true"]'), ["backgroundImage", "fontSize", "color", "borderBottomColor", "boxShadow"]),
      otherTab: style(shell.querySelector('[role="tab"][aria-selected="false"]'), ["backgroundImage", "fontSize", "color", "borderBottomColor", "boxShadow"]),
      close: style(shell.querySelector(".close-button, .close"), ["backgroundImage", "fontSize", "color", "boxShadow"]),
      footer: style(shell.querySelector(".tower-footer, .upgrade-footer"), ["backgroundImage", "borderTop"]),
    };
  });
  const evidence = [];
  try {
    for (const [width, height] of [[1440, 900], [1024, 600], [1000, 700], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await ready(() => document.documentElement?.dataset.crownlandsBenchmarkReady === "true");
      await ev(() => {
        window.__CROWNLANDS_BENCHMARK__.closeModal();
        const api = getOnlineApi();
        window.layoutQa = { calls: [], reads: 0, balance: 4260000000, fail: false };
        window.layoutTower = HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[0].id), "owner");
        Object.assign(layoutTower, { buildings: { shop: 4, workshop: 4, infirmary: 4, training: 4 }, buildingProject: null, wallIntegrityBps: 10000, attackBlocked: false, repairActive: false });
        state.clanId = layoutTower.clanId; state.gold = 5000000;
        clanTreasuryClanId = state.clanId; clanTreasuryStatus = { treasury: { balance: layoutQa.balance } };
        loadClanTreasuryStatus = async () => { clanTreasuryStatus = { treasury: { balance: layoutQa.balance } }; return clanTreasuryStatus; };
        getOnlineApi = () => ({ ...api, isReady: () => true, isSignedIn: () => true, subscribeHoldingTowerState: () => () => {},
          getHoldingTowerState: async () => { layoutQa.reads++; return { worldActive: true, towers: [{ ...layoutTower }] }; },
          getClanTowerShop: async () => ({ clanShop: { level: layoutTower.buildings.shop, eligible: true, items: CrownlandsClanTowerBuildings.shopStatus(layoutTower.buildings.shop, {}, Date.now()).map(item => ({ ...item, price: 1000 })) } }),
          startClanTowerBuilding: async payload => { layoutQa.calls.push(payload); if (layoutQa.fail) throw Error("Construction not confirmed. Please retry."); layoutTower.buildingProject = { buildingId: payload.buildingId, targetLevel: 5, remainingMs: 21600000, progressStartedAtMs: Date.now() }; return { tower: layoutTower }; },
        });
      });
      await ev(() => openHoldingTower(layoutTower.id));
      await ready(() => Boolean(modalBody.querySelector(".tower-shell")));
      await ev(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getTiming().iterations)).map(a => a.finished.catch(() => {}))));
      const towerFrame = await frameStyle();
      for (const tab of ["overview", "garrison", "walls", "rules"]) {
        await click(`[data-tower-tab="${tab}"]`);
        assert.deepEqual(await frameStyle(), towerFrame, "Tower frame changed on " + tab);
      }
      await click('[data-tower-tab="overview"]');
      await screenshot(`${width}-tower-overview.png`);
      await click('[data-tower-tab="buildings"]');
      await ready(() => modalBody.dataset.clanShopReady === "true");
      assert.deepEqual(await frameStyle(), towerFrame, "Buildings tab must keep the Tower size and theme");
      let reference;
      for (const id of ["workshop", "infirmary", "training", "shop"]) {
        await ev(id => openClanTowerBuilding(layoutTower.id, id), id);
        await ready(id => modalBody.dataset[id === "shop" ? "clanShopReady" : id + "Ready"] === "true", id);
        await ev(() => modalBody.querySelector("#buildingArt").decode());
        await ev(() => Promise.all(document.getAnimations().filter(animation => !animation.effect?.getTiming().iterations || Number.isFinite(animation.effect.getTiming().iterations)).map(animation => animation.finished.catch(() => {}))));
        assert.deepEqual(await frameStyle(), towerFrame, id + " must match the other Tower tabs at " + width);
        const result = await ev(() => {
          const shell = modalBody.querySelector(".clan-building-shell"), footer = shell.querySelector(".upgrade-footer"), button = footer.querySelector("button");
          const box = node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(n => Math.round(n)); };
          const r = button.getBoundingClientRect();
          return { header: box(shell.querySelector(".window-header")), sidebar: box(shell.querySelector(".building-panel")), footer: box(footer),
            goldFont: getComputedStyle(shell.querySelector("#upgradeCost")).fontSize,
            overview: shell.querySelector("#tab-overview").getAttribute("aria-selected"),
            benefitCount: shell.querySelectorAll(".benefit-card").length,
            cost: shell.querySelector("#upgradeCost").textContent,
            choices: shell.querySelectorAll(".building-navigation option").length,
            buttonVisible: r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
            overflow: modal.scrollWidth > modal.clientWidth + 1 || [...shell.querySelectorAll(".detail-scroll")].filter(n => !n.hidden).some(n => n.scrollWidth > n.clientWidth + 1) };
        });
        assert.equal(result.overview, "true"); assert.equal(result.benefitCount, 2); assert.equal(result.choices, 4);
        assert.equal(result.cost, "80,000,000"); assert(result.buttonVisible && !result.overflow, JSON.stringify({ id, width, ...result }));
        if (!reference) reference = result;
        else for (const key of ["header", "sidebar", "footer", "goldFont"]) assert.deepEqual(result[key], reference[key], id + ": inconsistent " + key + " at " + width);
        await screenshot(`${width}-${id}-overview.png`);
        await click("#tab-levels");
        assert.equal(await ev(() => modalBody.querySelectorAll(".levels-table tbody tr").length), 10);
        const levelScroll = await ev(() => { const panel = modalBody.querySelector("#levelsPanel"); panel.scrollTop = panel.scrollHeight; return panel.scrollTop; });
        await ev(() => refreshHoldingTower(layoutTower.id));
        assert.equal(await ev(() => modalBody.querySelector("#tab-levels").getAttribute("aria-selected")), "true");
        assert.equal(await ev(() => modalBody.querySelector("#levelsPanel").scrollTop), levelScroll, "Refresh moved the level table");
        assert(await ev(() => {
          const panel = modalBody.querySelector("#levelsPanel").getBoundingClientRect();
          const last = modalBody.querySelector(".levels-table tbody tr:last-child").getBoundingClientRect();
          return last.top >= panel.top && last.bottom <= panel.bottom;
        }), "Level 10 must be reachable, including when the full table fits without scrolling");
        await screenshot(`${width}-${id}-levels.png`);
        evidence.push({ building: id, viewport: [width, height], towerFrame, ...result });
        await click(`[data-${id}-back]`);
        assert.deepEqual(await frameStyle(), towerFrame, "Returning from " + id + " changed the Tower frame");
        await click('[data-tower-tab="buildings"]');
        await ready(id => modalBody.dataset[id === "shop" ? "clanShopReady" : id + "Ready"] === "true", id);
      }
      // Shop construction follows the same restrictions, retry identity and authoritative completion as the other buildings.
      await click("#tab-overview");
      for (const scenario of ["funds", "balance", "walls", "attack", "member", "other", "maximum", "unbuilt"]) {
        await ev(scenario => {
          layoutTower.permissions.manage = scenario !== "member";
          layoutTower.attackBlocked = scenario === "attack";
          layoutTower.wallIntegrityBps = scenario === "walls" ? 9999 : 10000;
          layoutTower.buildings.shop = scenario === "maximum" ? 10 : scenario === "unbuilt" ? 0 : 4;
          layoutTower.buildingProject = scenario === "other" ? { buildingId: "training", targetLevel: 5, remainingMs: 21600000, progressStartedAtMs: Date.now() } : null;
          clanTreasuryStatus = scenario === "balance" ? null : { treasury: { balance: scenario === "funds" ? 0 : layoutQa.balance } };
          renderHoldingTowerModal({ ...layoutTower, clanShop: holdingTowerSnapshots.get(layoutTower.id).clanShop });
        }, scenario);
        assert.equal(await ev(() => modalBody.querySelector("#upgradeShop").disabled), scenario !== "unbuilt", scenario);
        assert(await ev(() => modalBody.querySelector("#upgradeNote").textContent));
        if (scenario === "unbuilt") assert.equal(await ev(() => modalBody.querySelector("#upgradeShop").textContent), "Build Level 1");
      }
      await ev(() => { layoutTower.buildings.shop = 4; layoutQa.fail = true; renderHoldingTowerModal({ ...layoutTower, clanShop: holdingTowerSnapshots.get(layoutTower.id).clanShop }); });
      await click("#upgradeShop");
      await ready(() => !holdingTowerActionsInFlight.size);
      assert.match(await ev(() => modalBody.querySelector(".project-card.error").textContent), /retry/i);
      await ev(() => { layoutQa.fail = false; });
      await click("#upgradeShop");
      await ready(() => !holdingTowerActionsInFlight.size);
      assert(await ev(() => layoutQa.calls.length === 2 && layoutQa.calls[0].operationId === layoutQa.calls[1].operationId));
      await ev(() => { layoutTower.buildingProject.progressStartedAtMs = 0; layoutTower.attackBlocked = true; renderHoldingTowerModal(layoutTower); });
      assert.equal(await ev(() => modalBody.querySelector("#upgradeShop").textContent), "Upgrade paused");
      await ev(() => { layoutTower.attackBlocked = false; layoutTower.buildingProject.progressStartedAtMs = Date.now() - 21600000; window.readsBefore = layoutQa.reads; renderHoldingTowerModal(layoutTower); });
      await ready(() => layoutQa.reads > readsBefore);
      assert.equal(await ev(() => modalBody.querySelector("#buildingLevel").textContent), "Shop Level 4", "A client timer must not complete construction locally.");
      // Store entry still goes straight to purchases, while the building entry above opens Overview.
      await ev(() => { layoutTower.buildingProject = null; return openClanTowerBuilding(layoutTower.id, "shop", { section: "wares" }); });
      await ready(() => modalBody.dataset.clanShopReady === "true");
      assert.equal(await ev(() => modalBody.querySelector("#tab-wares").getAttribute("aria-selected")), "true");
      await ev(() => modalBody.querySelector("#tab-wares").focus());
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
      assert.equal(await ev(() => modalBody.querySelector("#tab-overview").getAttribute("aria-selected")), "true");
      await ev(() => modal.close());
      await ready(() => !modal.classList.contains("clan-building-modal"));
      assert.deepEqual(errors, []);
      console.log(`Shared Clan Tower layout ${width}x${height}: all Tower tabs and building frames match; costs, navigation, preserved tabs, construction restrictions/retries and server-only completion passed.`);
    }
    fs.writeFileSync(path.join(artifacts, "verification.json"), JSON.stringify(evidence, null, 2) + "\n");
  } finally {
    await client.send("Browser.close").catch(() => {}); client.close();
    if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
    await removeBrowserProfile(browser.profilePath); await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
