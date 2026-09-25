"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const { createMapBenchmarkServer } = require("./map-benchmark/server");

async function main() {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium is required for the Tower scout regression");
  let session, client;
  const errors = [];
  const evaluate = async fn => {
    const result = await client.send("Runtime.evaluate", { expression: typeof fn === "string" ? fn : `(${fn.toString()})()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const ready = async fn => {
    for (let i = 0; i < 200; i++) { if (await evaluate(fn)) return; await wait(100); }
    throw Error(`Tower scouting browser timed out: ${fn}`);
  };
  const click = async (selector, touch) => {
    await ready(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    const point = await evaluate(`(() => {const node=document.querySelector(${JSON.stringify(selector)}), r=node.getBoundingClientRect();
      const x=r.left+r.width/2, y=node.matches('[data-holding-tower-id]') ? Math.max(40,Math.min(innerHeight-40,r.top+r.height/2)) : r.top+r.height/2; return {x,y,hit:node.contains(document.elementFromPoint(x,y)),hitElement:document.elementFromPoint(x,y)?.tagName,hitClass:document.elementFromPoint(x,y)?.className,hitParent:document.elementFromPoint(x,y)?.parentElement?.outerHTML.slice(0,600)};})()`);
    if (!point.hit) {
      const shot = await client.send("Page.captureScreenshot", {format:"png"});
      fs.writeFileSync(path.join(dir,"blocked-control.png"),Buffer.from(shot.data,"base64"));
    }
    assert(point.hit, `Tower control is not reachable: ${selector}: ${JSON.stringify(point)}`);
    const { x, y } = point;
    if (touch) {
      await client.send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[{x,y,id:1}] });
      await client.send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
    } else {
      await client.send("Input.dispatchMouseEvent", { type:"mousePressed", x,y,button:"left",buttons:1,clickCount:1 });
      await client.send("Input.dispatchMouseEvent", { type:"mouseReleased", x,y,button:"left",buttons:0,clickCount:1 });
    }
  };
  const evidence = [], dir = path.resolve(__dirname, "../release-artifacts/clan-tower-scouting");
  fs.mkdirSync(dir, { recursive: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      session = await startBrowserSession(executable);
      client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
      await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
      client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
      await client.send("Network.setBlockedURLs", { urls:["*googleapis.com*", "*cloudfunctions.net*", "*firebaseio.com*", "*playcrownlands.com*"] });
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor:1, mobile:false });
      await client.send("Emulation.setTouchEmulationEnabled", { enabled:viewport.height < 600 });
      await client.send("Page.navigate", { url:`${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await ready(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready");
      await evaluate(async () => {
        if (modal.open) modal.close();
        const original = getOnlineApi();
        window.towerScoutQa = { calls: 0, reads: 0, original };
        const qa = towerScoutQa;
        qa.tower = getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[0].id);
        qa.source = playerCities().find(city => city.troops > 0);
        state.clanId = "fixture-clan"; state.clanRole = "leader";
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
        qa.towerReads = 0; qa.delayTower = true;
        getOnlineApi = () => ({ ...original, getHoldingTowerState: () => {
          qa.towerReads++;
          return qa.delayTower ? new Promise(resolve => { qa.finishTowerRead = resolve; })
            : Promise.resolve({ worldActive: true, towers: [qa.snapshot] });
        },
          subscribeHoldingTowerState: () => () => {}, getClanTowerShop: undefined,
          getClanTreasuryStatus: async () => ({treasury:{balance:0}}),
          createClanRally: async () => { throw Error("Selection regression must not create a Rally"); },
          previewArmyRoute: async request => ({ points:[{x:qa.source.x,y:qa.source.y},{x:qa.tower.x,y:qa.tower.y}], durationMs:60000, requestedTroops:request.requestedTroops }),
          submitRecoverableArmyOrder: request => { qa.calls++; qa.request = request; return new Promise(resolve => { qa.accept = resolve; }); },
          resolveArmyOrder: async () => ({ ok: true, status: "returning", kind: "scout", targetType: "tower",
            scoutReport: qa.intel(), movement: { ...qa.movement, kind: "transfer", returning: true, arrivesAtMs: Date.now() + 60000 } }),
          loadServerReports: async () => { qa.reads++; return []; }
        });
        await ensureRegionDefinitionLoaded(qa.tower.regionId);
        zoom = 1; centerOnRegion(qa.tower.regionId); clearSelection(false);
        holdingTowerSnapshots.delete(qa.tower.id);
        releaseSelectionRenderDelay(); renderAll();
        // Position the selected controls above the bottom HUD on short landscape screens.
        if (innerHeight < 360) centerOnWorldPoint({ x:qa.tower.x, y:qa.tower.y + 100 }, qa.tower.regionId);
      });
      const towerSelector = await evaluate(() => `[data-holding-tower-id="${towerScoutQa.tower.id}"]`);
      await click(towerSelector, viewport.height < 600);
      const cold = await evaluate(() => ({ reads: towerScoutQa.towerReads,
        actions: [...document.querySelectorAll('[data-clan-tower-map-action]')].map(b => ({ action:b.dataset.clanTowerMapAction, disabled:b.getAttribute('aria-disabled') === 'true' })) }));
      assert.deepEqual(cold.actions, [{action:'scout',disabled:true},{action:'info',disabled:false},{action:'rally-attack',disabled:true}], 'Cold selection hid Tower controls until the network responded');
      assert.equal(cold.reads, 1);
      await click('[data-clan-tower-map-action="scout"]', viewport.height < 600);
      assert.equal(await evaluate(() => towerScoutQa.calls), 0, 'Pending permissions dispatched a scout');
      await click('[data-clan-tower-map-action="rally-attack"]', viewport.height < 600);
      assert.equal(await evaluate(() => modal.open), false, 'Pending permissions opened Rally orders');
      await evaluate(() => { void selectClanTowerOnMap(towerScoutQa.tower.id); });
      assert.equal(await evaluate(() => towerScoutQa.towerReads), 1, 'Repeated selection duplicated the pending Tower read');
      await evaluate(async () => {
        const qa = towerScoutQa;
        qa.delayTower = false; qa.finishTowerRead({worldActive:true,towers:[qa.snapshot]});
        await new Promise(resolve => requestAnimationFrame(resolve));
      });
      await ready(() => document.querySelector('[data-clan-tower-map-action="rally-attack"]')?.getAttribute('aria-disabled') === 'false');
      const controlsShot = await client.send("Page.captureScreenshot", {format:"png"});
      fs.writeFileSync(path.join(dir,`selection-${viewport.width}.png`),Buffer.from(controlsShot.data,"base64"));
      await click('[data-clan-tower-map-action="info"]', viewport.height < 600);
      await ready(() => modal.open && !!modalBody.querySelector('#clanTower-overviewPanel'));
      await evaluate(() => { modal.close(); rememberOwnedAttackSource(towerScoutQa.source); });
      await click('[data-clan-tower-map-action="rally-attack"]', viewport.height < 600);
      await ready(() => modal.open && !!modalBody.querySelector('[data-order-kind="rally_create"]'));
      assert.equal(await evaluate(() => selectedSourceId), await evaluate(() => towerScoutQa.source.id));
      await evaluate(async () => {
        modal.close(); clearSelection(false);
        const qa=towerScoutQa; qa.delayTower=true;
        void selectClanTowerOnMap(qa.tower.id);
        // A warm selection keeps the already-authorized row usable during refresh.
      });
      assert.equal(await evaluate(() => document.querySelector('[data-clan-tower-map-action="rally-attack"]')?.getAttribute('aria-disabled')), 'false');
      await evaluate(async () => {
        const qa=towerScoutQa; qa.delayTower=false;
        qa.finishTowerRead({worldActive:true,towers:[qa.snapshot]});
        await new Promise(resolve => requestAnimationFrame(resolve));
      });
      await click('[data-clan-tower-map-action="scout"]', viewport.height < 600);
      assert.equal(await evaluate(() => towerScoutQa.calls), 1);
      assert.equal(await evaluate(() => document.querySelector('[data-clan-tower-map-action="scout"]').disabled), true, "A duplicate Tower Scout tap remains enabled");
      const launched = await evaluate(async () => {
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
      const received = await evaluate(async () => {
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
      await click('[data-clan-tower-map-action="report"]', viewport.height < 600);
      const text = await evaluate(() => modalBody.querySelector(".report-body").innerText);
      for (const expected of ["Clan Tower", "Fixture Rivals", "123,456", "65%", "6,500", "10,000"]) assert(text.includes(expected), expected);
      assert(!/City Lv|City owner|Skill levels|Shieldwall|Stoneworks|Base attack/.test(text), "Tower report invented city intelligence");
      assert(text.includes("Not recorded"), "Unknown total defense was presented as zero");
      const replacement = await evaluate(async () => {
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
      await ready(() => getComputedStyle(modal).opacity === "1"
        && [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => Boolean(link.sheet)));
      const screenshot = await client.send("Page.captureScreenshot", { format:"png" });
      fs.writeFileSync(path.join(dir, `report-${viewport.width}.png`), Buffer.from(screenshot.data, "base64"));
      const expired = await evaluate(() => {
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
      evidence.push({ viewport, coldSelection:cold, infoAndRallyOpened:true, warmSelectionImmediate:true, launched, received: { type: received.report.targetType, troops: received.report.troops, returning: received.returning }, errors });
      console.log(`Tower scout launch, arrival, report and expiry passed: ${viewport.width}x${viewport.height}`);
      await client.send("Browser.close");
      await waitForProcessExit(session.browserProcess);
      await removeBrowserProfile(session.profilePath);
      client = null; session = null;
    }
    fs.writeFileSync(path.join(dir, "browser.json"), JSON.stringify(evidence, null, 2));
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
