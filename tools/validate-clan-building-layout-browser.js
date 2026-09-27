"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createMapBenchmarkServer } = require("./map-benchmark/server");

async function main() {
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executablePath, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/clan-building-layout");
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ executablePath, headless: true });
  const evidence = [];
  try {
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: height < 600 });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(address.url + "/__benchmark__/?scenario=A&visualMarches=0");
      await page.waitForFunction(() => document.documentElement.dataset.crownlandsBenchmarkReady === "true");
      await page.evaluate(() => {
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
      let reference;
      for (const id of ["workshop", "infirmary", "training", "shop"]) {
        await page.evaluate(id => openClanTowerBuilding(layoutTower.id, id), id);
        await page.waitForFunction(id => modalBody.dataset[id === "shop" ? "clanShopReady" : id + "Ready"] === "true", id);
        await page.locator(".clan-building-shell #buildingArt").evaluate(img => img.decode());
        await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => !animation.effect?.getTiming().iterations || Number.isFinite(animation.effect.getTiming().iterations)).map(animation => animation.finished.catch(() => {}))));
        const result = await page.evaluate(() => {
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
        await page.screenshot({ path: path.join(artifacts, `${width}-${id}-overview.png`) });
        await page.getByRole("tab", { name: "All levels", exact: true }).click();
        assert.equal(await page.locator(".levels-table tbody tr").count(), 10);
        await page.locator("#levelsPanel").evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
        await page.evaluate(() => refreshHoldingTower(layoutTower.id));
        assert.equal(await page.getByRole("tab", { name: "All levels", exact: true }).getAttribute("aria-selected"), "true");
        assert(await page.locator("#levelsPanel").evaluate(panel => panel.scrollTop > 0));
        await page.screenshot({ path: path.join(artifacts, `${width}-${id}-levels.png`) });
        evidence.push({ building: id, viewport: [width, height], ...result });
      }
      // Shop construction follows the same restrictions, retry identity and authoritative completion as the other buildings.
      await page.getByRole("tab", { name: "Overview", exact: true }).click();
      for (const scenario of ["funds", "balance", "walls", "attack", "member", "other", "maximum", "unbuilt"]) {
        await page.evaluate(scenario => {
          layoutTower.permissions.manage = scenario !== "member";
          layoutTower.attackBlocked = scenario === "attack";
          layoutTower.wallIntegrityBps = scenario === "walls" ? 9999 : 10000;
          layoutTower.buildings.shop = scenario === "maximum" ? 10 : scenario === "unbuilt" ? 0 : 4;
          layoutTower.buildingProject = scenario === "other" ? { buildingId: "training", targetLevel: 5, remainingMs: 21600000, progressStartedAtMs: Date.now() } : null;
          clanTreasuryStatus = scenario === "balance" ? null : { treasury: { balance: scenario === "funds" ? 0 : layoutQa.balance } };
          renderHoldingTowerModal({ ...layoutTower, clanShop: holdingTowerSnapshots.get(layoutTower.id).clanShop });
        }, scenario);
        assert.equal(await page.locator("#upgradeShop").isDisabled(), scenario !== "unbuilt", scenario);
        assert(await page.locator("#upgradeNote").innerText());
        if (scenario === "unbuilt") assert.equal(await page.locator("#upgradeShop").innerText(), "Build Level 1");
      }
      await page.evaluate(() => { layoutTower.buildings.shop = 4; layoutQa.fail = true; renderHoldingTowerModal({ ...layoutTower, clanShop: holdingTowerSnapshots.get(layoutTower.id).clanShop }); });
      await page.locator("#upgradeShop").click();
      await page.waitForFunction(() => !holdingTowerActionsInFlight.size);
      assert.match(await page.locator(".project-card.error").innerText(), /retry/i);
      await page.evaluate(() => { layoutQa.fail = false; });
      await page.locator("#upgradeShop").click();
      await page.waitForFunction(() => !holdingTowerActionsInFlight.size);
      assert(await page.evaluate(() => layoutQa.calls.length === 2 && layoutQa.calls[0].operationId === layoutQa.calls[1].operationId));
      await page.evaluate(() => { layoutTower.buildingProject.progressStartedAtMs = 0; layoutTower.attackBlocked = true; renderHoldingTowerModal(layoutTower); });
      assert.equal(await page.locator("#upgradeShop").innerText(), "Upgrade paused");
      await page.evaluate(() => { layoutTower.attackBlocked = false; layoutTower.buildingProject.progressStartedAtMs = Date.now() - 21600000; window.readsBefore = layoutQa.reads; renderHoldingTowerModal(layoutTower); });
      await page.waitForFunction(() => layoutQa.reads > readsBefore);
      assert.equal(await page.locator("#buildingLevel").innerText(), "Shop Level 4", "A client timer must not complete construction locally.");
      // Store entry still goes straight to purchases, while the building entry above opens Overview.
      await page.evaluate(() => { layoutTower.buildingProject = null; return openClanTowerBuilding(layoutTower.id, "shop", { section: "wares" }); });
      await page.waitForFunction(() => modalBody.dataset.clanShopReady === "true");
      assert.equal(await page.getByRole("tab", { name: "Items", exact: true }).getAttribute("aria-selected"), "true");
      await page.getByRole("tab", { name: "Items", exact: true }).focus(); await page.keyboard.press("Home");
      assert.equal(await page.getByRole("tab", { name: "Overview", exact: true }).getAttribute("aria-selected"), "true");
      await page.evaluate(() => modal.close());
      await page.waitForFunction(() => !modal.classList.contains("clan-building-modal"));
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`Shared Clan Tower layout ${width}x${height}: all four frames, costs, navigation, preserved tabs, construction restrictions/retries and server-only completion passed.`);
    }
    fs.writeFileSync(path.join(artifacts, "verification.json"), JSON.stringify(evidence, null, 2) + "\n");
  } finally { await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
