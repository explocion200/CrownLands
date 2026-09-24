"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createMapBenchmarkServer } = require("./map-benchmark/server");

async function main() {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const evidence = [], dir = path.resolve(__dirname, "../release-artifacts/clan-tower-scouting");
  fs.mkdirSync(dir, { recursive: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.height < 600 });
      await context.route("**/*", route => new URL(route.request().url()).origin === new URL(address.url).origin
        ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${address.url}/__benchmark__/?scenario=A&visualMarches=0`);
      await page.waitForFunction(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready");
      await page.evaluate(async () => {
        const original = getOnlineApi();
        window.towerScoutQa = { calls: 0, reads: 0, original };
        const qa = towerScoutQa;
        qa.tower = getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[0].id);
        qa.source = playerCities().find(city => city.troops > 0);
        state.attacks = []; state.scoutReports = {}; state.battleReports = [];
        clearScoutResponsivenessState(); onlineArmiesByIsland.clear(); rebuildOnlineArmies();
        pendingDirectScoutTargets.clear(); resolvedOnlineArmyIds.clear();
        qa.snapshot = { ...HOLDING_TOWER_UI.createQaSnapshot(qa.tower, "enemy"),
          ownerMember: false, clanId: "fixture-rivals", clanName: "Fixture Rivals", ownershipRevision: 7,
          exactDefenders: null, permissions: { scout: true, inspect: true, createRallyAttack: true } };
        qa.intel = () => ({ targetType: "tower", towerId: qa.tower.id, towerName: qa.tower.name,
          towerOwnershipKey: "fixture-rivals:7", clanId: "fixture-rivals", clanName: "Fixture Rivals",
          troops: 123456, wallLevel: 8, wallIntegrityBps: 6500, fullWallPower: 10000, currentWallPower: 6500,
          scoutedAtMs: Date.now(), expiresAtMs: Date.now() + 600000 });
        getOnlineApi = () => ({ ...original, getHoldingTowerState: async () => ({ worldActive: true, towers: [qa.snapshot] }),
          subscribeHoldingTowerState: () => () => {}, getClanTowerShop: undefined,
          submitRecoverableArmyOrder: request => { qa.calls++; qa.request = request; return new Promise(resolve => { qa.accept = resolve; }); },
          resolveArmyOrder: async () => ({ ok: true, status: "returning", kind: "scout", targetType: "tower",
            scoutReport: qa.intel(), movement: { ...qa.movement, kind: "transfer", returning: true, arrivesAtMs: Date.now() + 60000 } }),
          loadServerReports: async () => { qa.reads++; return []; }
        });
        await ensureRegionDefinitionLoaded(qa.tower.regionId);
        zoom = 1; centerOnRegion(qa.tower.regionId); clearSelection(false);
        selectedTowerMapId = qa.tower.id; holdingTowerSnapshots.set(qa.tower.id, qa.snapshot);
        releaseSelectionRenderDelay(); renderAll();
        await selectClanTowerOnMap(qa.tower.id);
      });
      const button = page.locator('[data-clan-tower-map-action="scout"]');
      if (viewport.height < 600) await button.tap();
      else await button.click();
      assert.equal(await page.evaluate(() => towerScoutQa.calls), 1);
      await assert.doesNotReject(() => button.waitFor({ state: "visible" }));
      assert.equal(await button.isDisabled(), true, "A duplicate Tower Scout tap remains enabled");
      const launched = await page.evaluate(async () => {
        const qa = towerScoutQa, id = qa.request.armyId;
        qa.movement = { id, kind: "scout", launchKind: "scout", targetType: "tower", holdingTowerMovement: true,
          ownerUid: getCurrentOnlineUid(), ownerKind: "player", sourceType: "city", troops: 1, total: 60, status: "active",
          fromId: qa.source.id, toId: qa.tower.id, fromName: qa.source.name, toName: qa.tower.name,
          sourceRegionId: getCityRegionId(qa.source), targetRegionId: qa.tower.regionId,
          launchedAtMs: Date.now(), arrivesAtMs: Date.now() + 60000,
          routeRegionIds: [getCityRegionId(qa.source), qa.tower.regionId],
          path: [{ x: qa.tower.x - 100, y: qa.tower.y }, { x: qa.tower.x, y: qa.tower.y }],
          pathSegments: [{ regionId: qa.tower.regionId, points: [{ x: qa.tower.x - 100, y: qa.tower.y }, { x: qa.tower.x, y: qa.tower.y }], length: 100 }], pathLength: 100 };
        qa.accept({ movement: qa.movement });
        await new Promise(resolve => setTimeout(resolve, 50));
        return { targetType: qa.request.targetType, localType: state.attacks.find(a => a.onlineId === id)?.targetType };
      });
      assert.equal(launched.targetType, "tower");
      assert.equal(launched.localType, "tower", "Accepted Tower scout was converted into a city march");
      const received = await page.evaluate(async () => {
        const qa = towerScoutQa, mission = state.attacks.find(a => a.onlineId === qa.movement.id);
        await resolveServerArmyMission(mission);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const report = getScoutReport(qa.tower.id);
        return { report, reads: qa.reads, open: modal.open, returning: state.attacks.some(a => a.onlineId === qa.movement.id && a.returning) };
      });
      assert(received.report, "Tower arrival dropped its authoritative scoutReport while the subscription was delayed");
      assert.equal(received.report.targetType, "tower");
      assert(received.returning); assert.equal(received.open, false, "Report opened without player input");
      assert(received.reads > 0, "Returning Tower scouts did not recover their private report-list entry");
      const reportButton = page.locator('[data-clan-tower-map-action="report"]');
      if (viewport.height < 600) await reportButton.tap();
      else await reportButton.click();
      const text = await page.locator(".report-body").innerText();
      for (const expected of ["Clan Tower", "Fixture Rivals", "123,456", "65%", "6,500", "10,000"]) assert(text.includes(expected), expected);
      assert(!/City Lv|City owner|Skill levels|Shieldwall|Stoneworks|Base attack/.test(text), "Tower report invented city intelligence");
      assert(text.includes("Not recorded"), "Unknown total defense was presented as zero");
      const replacement = await page.evaluate(async () => {
        const qa = towerScoutQa, at = Date.now() + 1000;
        const body = modalBody.querySelector(".report-body");
        body.scrollTop = 90; const scrollTop = body.scrollTop;
        modalBody.querySelector("#battleReportBackBtn").focus();
        mergeServerReports([{ id: "tower-scout-fixture", uid: getCurrentOnlineUid(), type: "scout", targetType: "city",
          cityId: qa.tower.id, cityName: qa.tower.name, regionId: qa.tower.regionId, occurredAtMs: at,
          scoutReport: { ...qa.intel(), troops: 654321, scoutedAtMs: at, expiresAtMs: at + 600000 } }], { notify: false });
        await new Promise(resolve => requestAnimationFrame(resolve));
        return { type: state.battleReports.find(r => r.id === "tower-scout-fixture").targetType,
          scoutType: getScoutReport(qa.tower.id).targetType, text: modalBody.textContent,
          expectedScroll: scrollTop, scroll: modalBody.querySelector(".report-body").scrollTop, focus: document.activeElement.id };
      });
      assert.equal(replacement.type, "tower"); assert.equal(replacement.scoutType, "tower");
      assert(replacement.text.includes("654,321")); assert.equal(replacement.focus, "battleReportBackBtn");
      assert.equal(replacement.scroll, replacement.expectedScroll);
      await page.waitForFunction(() => getComputedStyle(modal).opacity === "1"
        && [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => Boolean(link.sheet)));
      await page.screenshot({ path: path.join(dir, `report-${viewport.width}.png`) });
      const expired = await page.evaluate(() => {
        modal.close();
        const qa = towerScoutQa;
        holdingTowerSnapshots.get(qa.tower.id).ownershipRevision++;
        const obsolete = getScoutReport(qa.tower.id);
        holdingTowerSnapshots.get(qa.tower.id).ownershipRevision--;
        state.scoutReports[qa.tower.id].expiresAtMs = Date.now() - 1;
        return { obsolete, expired: getScoutReport(qa.tower.id) };
      });
      assert.equal(expired.obsolete, null, "Tower ownership change retained usable stale intelligence");
      assert.equal(expired.expired, null);
      assert.deepEqual(errors, []);
      evidence.push({ viewport, launched, received: { type: received.report.targetType, troops: received.report.troops, returning: received.returning }, errors });
      console.log(`Tower scout launch, arrival, report and expiry passed: ${viewport.width}x${viewport.height}`);
      await context.close();
    }
    fs.writeFileSync(path.join(dir, "browser.json"), JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
