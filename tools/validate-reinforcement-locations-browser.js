"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/reinforcement-locations");

async function main() {
  const browser = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(browser, "Set CHROME_PATH to a Chromium browser.");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
    client.on("Fetch.requestPaused", event => {
      const local = new URL(event.request.url).origin === address.url;
      void client.send(local ? "Fetch.continueRequest" : "Fetch.failRequest", {
        requestId: event.requestId, ...(local ? {} : { errorReason: "BlockedByClient" }),
      }).catch(error => errors.push(error.message));
    });
    await client.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    const evaluate = async (fn, arg) => {
      const result = await client.send("Runtime.evaluate", { expression: `(${fn.toString()})(${JSON.stringify(arg ?? null)})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    for (let i = 0; i < 240 && !await evaluate(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready"); i++) await wait(250);
    assert.equal(await evaluate(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status), "ready");
    // All substitutions are confined to this isolated loopback fixture.
    await evaluate(() => {
      window.__CROWNLANDS_BENCHMARK__.closeModal();
      pendingOfflineRewardsSummary = null;
      getCurrentOnlineUid = () => "location-viewer";
      state.clanId = "location-clan";
      state.attacks = [];
      onlineClanRallies = [];
      pendingOutgoingMissions.clear();
      const region = getActiveMapRegionId(), now = getArmyClockNowMs();
      const bounds = getActiveMapBounds();
      const x = (bounds.left + bounds.right) / 2, y = (bounds.top + bounds.bottom) / 2;
      const from = { ...state.cities[0], id: "location-origin", name: "Home City", owner: "player", ownerUid: "location-viewer", regionId: region, x: x - 300, y };
      const to = { ...from, id: "location-ally", name: "Wyvernmarket Allied Keep", owner: "enemy", ownerUid: "location-ally", x: x + 300 };
      state.cities.push(from, to);
      getArmyClockNowMs = () => now;
      const base = { kind: "reinforce", owner: "player", ownerUid: "location-viewer", targetOwnerUid: "location-ally", fromId: from.id, toId: to.id, fromName: from.name, toName: to.name,
        sourceRegionId: region, targetRegionId: region, troops: 12345, remaining: 60, total: 120, launchedAtMs: now - 60000, arrivesAtMs: now + 60000,
        pathSegments: [{ regionId: region, points: [{ x: from.x, y }, { x: to.x, y }], length: 600 }] };
      window.supportFixture = { now, region, from, to, armies: [
        { ...base, id: "outgoing" },
        { ...base, id: "incoming", owner: "enemy", ownerUid: "location-ally", targetOwnerUid: "location-viewer", incomingClanReinforcement: true, troopVisibility: "estimate", troopEstimateMin: 10000, troopEstimateMax: 100000 },
        { ...base, id: "returning", kind: "transfer", returning: true, reinforcementReturn: true, recalledAtMs: now - 30000, returnStartProgress: .75, arrivesAtMs: now + 60000 },
      ] };
      getRenderableArmies = () => supportFixture.armies;
      onlineReinforcements = [
        { id: "stationed", ownerUid: "location-viewer", targetOwnerUid: "location-ally", targetId: to.id, targetName: to.name, targetRegionId: region, troops: 250000, sourceCityId: from.id, sourceCityName: from.name, sourceRegionId: region },
        { id: "defending", ownerUid: "location-ally", targetOwnerUid: "location-viewer", targetId: from.id, targetName: from.name, targetRegionId: region, troops: 3456789, sourceCityId: to.id, sourceCityName: to.name, sourceRegionId: region },
      ];
      window.supportOpen = () => { activeOperationsTab = "reinforcements"; showOutgoingAttacksModal(); };
      window.supportCenters = [];
      window.supportReturns = [];
      window.supportOriginalReturn = returnClanReinforcement;
      returnClanReinforcement = id => { supportReturns.push(id); };
      const center = centerOnWorldPoint;
      centerOnWorldPoint = (point, map) => { supportCenters.push({ point: { x: point.x, y: point.y }, map }); return center(point, map); };
      supportOpen();
    });
    for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "landscape", width: 844, height: 390 }, { name: "small-landscape", width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
      await evaluate(() => { supportOpen(); modalBody.querySelector(".support-ledger").scrollTop = 0; });
      await wait(200);
      const layout = await evaluate(() => {
        const r = modal.getBoundingClientRect(), ledger = modalBody.querySelector(".support-ledger");
        return { fits: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          overflow: ledger.scrollWidth > ledger.clientWidth + 1, height: ledger.clientHeight,
          buttons: [...ledger.querySelectorAll("[data-support-location]")].map(button => {
            const b = button.getBoundingClientRect(), row = button.closest(".support-row").getBoundingClientRect();
            return { width: b.width, height: b.height, fits: b.left >= row.left && b.right <= row.right && b.top >= row.top && b.bottom <= row.bottom };
          }), returns: ledger.querySelectorAll("[data-return-clan-reinforcement]").length,
          rows: [...ledger.querySelectorAll(".support-row")].map(row => {
            const r = row.getBoundingClientRect();
            const location = row.querySelector("[data-support-location]").getBoundingClientRect();
            const action = row.querySelector("[data-return-clan-reinforcement]")?.getBoundingClientRect();
            const parts = [...row.children].filter(part => part.getBoundingClientRect().width > 0);
            return { id: row.dataset.supportRow, height: r.height,
              ordered: !action || location.right <= action.left && Math.abs(location.top - action.top) < 1,
              overlap: parts.some((part, i) => parts.slice(i + 1).some(other => {
                const a = part.getBoundingClientRect(), b = other.getBoundingClientRect();
                return Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
              })) };
          }),
          privacy: ledger.querySelector('[data-support-row="incoming"] .support-force').textContent };
      });
      assert(layout.fits && !layout.overflow && layout.height >= 80, JSON.stringify({ viewport, layout }));
      assert.equal(layout.buttons.length, 5);
      assert(layout.buttons.every(button => button.fits && button.width >= 44 && button.height >= 44), JSON.stringify(layout));
      assert(layout.rows.every(row => row.ordered && !row.overlap), JSON.stringify({ viewport, rows: layout.rows }));
      // Compactness must not be bought by clipping information or stacking the action pair.
      assert(layout.rows.filter(row => ["stationed", "defending"].includes(row.id)).every(row => row.height <= (viewport.width <= 650 ? 130 : 90)), JSON.stringify({ viewport, rows: layout.rows }));
      assert.equal(layout.returns, 2, "Recall and Send Home remain separate controls.");
      assert.match(layout.privacy, /Estimated troops/);
      assert(!layout.privacy.includes("12,345"), "Location must not expose private incoming troop counts.");
      for (const section of ["traveling", "allies", "defending"]) {
        await evaluate(section => { modalBody.querySelector(`[data-support-jump="${section}"]`).click(); toast.classList.remove("visible"); }, section);
        const shot = await client.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(artifacts, `${viewport.name}-${section}.png`), Buffer.from(shot.data, "base64"));
      }
      const edgeLayout = await evaluate(() => {
        const original = onlineReinforcements.map(entry => ({ ...entry }));
        reinforcementReturnRequests.add("stationed");
        setReinforcementActivityError("defending", "Connection interrupted. Please try sending these troops home again.");
        onlineReinforcements.forEach(entry => { entry.targetName = "The Great Northern Highland Reinforcement Fortress"; entry.troops = 987654321012; });
        renderOutgoingAttacksModalContent();
        const ledger = modalBody.querySelector(".support-ledger");
        const rows = [...ledger.querySelectorAll(".support-row.allies, .support-row.defending")].map(row => {
          const location = row.querySelector("[data-support-location]");
          const action = row.querySelector("[data-return-clan-reinforcement]");
          const a = location.getBoundingClientRect(), b = action.getBoundingClientRect();
          const force = row.querySelector(".support-force strong");
          return { ordered: a.right <= b.left && Math.abs(a.top - b.top) < 1,
            disabled: action.disabled, locationEnabled: !location.disabled,
            fullCount: force.textContent === "987,654,321,012" && force.scrollWidth <= force.clientWidth + 1,
            fits: row.scrollWidth <= row.clientWidth + 1 && action.scrollWidth <= action.clientWidth + 1 };
        });
        const result = { rows, overflow: ledger.scrollWidth > ledger.clientWidth + 1,
          pending: ledger.querySelector('[data-support-row="stationed"]').textContent.includes("Sending return order"),
          error: ledger.querySelector('[data-support-row="defending"] .row-feedback')?.textContent };
        reinforcementReturnRequests.delete("stationed");
        setReinforcementActivityError("defending");
        onlineReinforcements = original;
        renderOutgoingAttacksModalContent();
        return result;
      });
      assert(!edgeLayout.overflow && edgeLayout.pending && edgeLayout.error, JSON.stringify(edgeLayout));
      assert(edgeLayout.rows.every(row => row.ordered && row.locationEnabled && row.fullCount && row.fits), JSON.stringify({ viewport, edgeLayout }));
      assert.deepEqual(edgeLayout.rows.map(row => row.disabled), [true, false]);
      const stable = await evaluate(() => {
        const button = modalBody.querySelector('[data-support-location="stationed:defending"]');
        button.scrollIntoView({ block: "center" }); button.focus();
        const ledger = modalBody.querySelector(".support-ledger"), scroll = ledger.scrollTop;
        supportFixture.armies[0].remaining -= 1;
        renderOutgoingAttacksModalContent();
        const same = button === document.activeElement;
        onlineReinforcements[0].troops += 10000000; // Structural class update.
        renderOutgoingAttacksModalContent();
        const result = { same, restored: document.activeElement?.dataset.supportLocation === "stationed:defending", scroll: Math.abs(modalBody.querySelector(".support-ledger").scrollTop - scroll) <= 1 };
        onlineReinforcements[0].troops -= 10000000;
        return result;
      });
      assert(stable.same && stable.restored && stable.scroll, JSON.stringify(stable));
      for (const key of ["march:outgoing", "march:incoming", "march:returning", "stationed:stationed", "stationed:defending"]) {
        const result = await evaluate(async key => {
          supportOpen(); supportCenters.length = 0;
          const entry = getActiveOperationsSnapshot().reinforcements.find(item => reinforcementLocationKey(item) === key);
          const expected = entry.stationed ? getArmyTargetById(entry.targetId) : getMissionPointAtProgress(entry, getArmyTravelProgress(entry)).point;
          const button = modalBody.querySelector(`[data-support-location="${key}"]`);
          button.scrollIntoView({ block: "center" });
          const rect = button.getBoundingClientRect();
          if (!button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))) throw Error("Location button is obscured: " + key);
          button.focus();
          button.click();
          return { closed: !modal.open, point: supportCenters.at(-1)?.point, expected: { x: expected.x, y: expected.y }, region: supportCenters.at(-1)?.map, correctRegion: supportFixture.region };
        }, key);
        assert(result.closed, key);
        assert.deepEqual(result.point, result.expected, key);
        assert.equal(result.region, result.correctRegion);
      }
      const actions = await evaluate(() => {
        const locationReturns = supportReturns.splice(0);
        supportOpen();
        for (const id of ["stationed", "defending"]) modalBody.querySelector(`[data-return-clan-reinforcement="${id}"]`).click();
        return { locationReturns, actionReturns: supportReturns.splice(0) };
      });
      assert.deepEqual(actions.locationReturns, [], "Location must never issue a return order.");
      assert.deepEqual(actions.actionReturns, ["stationed", "defending"], "Recall and Send Home must keep their original assignment handlers.");
      console.log(`Validated compact rows, left-to-right actions, pending/error layouts, full counts, Location buttons, scroll/focus, touch targets and navigation at ${viewport.width}x${viewport.height}.`);
    }
    const edgeCases = await evaluate(async () => {
      const check = (value, message) => { if (!value) throw Error(message); };
      const saved = { snapshot: getActiveOperationsSnapshot, active: getActiveMapRegionId, target: getArmyTargetById, switchMap: switchOnlineIsland, center: centerOnWorldPoint, render: renderArmies, clear: clearSelection, toast: showToast };
      let active = supportFixture.region, records = [], centered = [], switches = [], notices = [];
      const other = getRegionIds().find(id => id !== active);
      getActiveMapRegionId = () => active;
      getActiveOperationsSnapshot = () => ({ reinforcements: records });
      getArmyTargetById = id => active === other && id === "remote-holding" ? { id, name: "Remote holding", regionId: other, x: 81, y: 92 } : null;
      centerOnWorldPoint = (point, region) => { centered.push({ point, region }); return true; };
      renderArmies = () => {};
      clearSelection = () => {};
      showToast = message => notices.push(message);
      const normalSwitch = async (region, options) => { check(options?.preserveModal, "Keep the ledger during map loading."); switches.push(region); active = region; return true; };
      try {
        const stationed = { id: "remote", stationed: true, targetId: "remote-holding", targetRegionId: other };
        for (const type of ["city", "camp", "tower"]) {
          active = supportFixture.region; records = [{ ...stationed, targetType: type }]; switches = []; centered = [];
          switchOnlineIsland = normalSwitch;
          check(await focusReinforcementLocation("stationed:remote"), `Unloaded ${type} must load before looking up the holding.`);
          check(switches[0] === other && centered[0].point.x === 81, `Wrong ${type} location.`);
        }
        const march = { ...supportFixture.armies[0], id: "remote-march", fromId: "absent-source", toId: "absent-target", sourceRegionId: supportFixture.region, targetRegionId: other,
          launchedAtMs: supportFixture.now - 90000, arrivesAtMs: supportFixture.now + 30000,
          pathSegments: [{ regionId: supportFixture.region, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], length: 100 }, { regionId: other, points: [{ x: 200, y: 0 }, { x: 300, y: 0 }], length: 100 }] };
        active = supportFixture.region; records = [march]; centered = []; switches = [];
        check(await focusReinforcementLocation("march:remote-march"), "Cross-map army navigation failed.");
        check(centered[0].point.x === 250 && centered[0].region === other, "Must locate the army partway through the second route segment.");
        active = supportFixture.region; records = [march]; centered = [];
        switchOnlineIsland = async (region, options) => { await normalSwitch(region, options); records = [{ ...march, launchedAtMs: supportFixture.now - 96000, arrivesAtMs: supportFixture.now + 24000 }]; return true; };
        check(await focusReinforcementLocation("march:remote-march"), "Updated march navigation failed.");
        check(centered[0].point.x === 260, "Recompute progress after waiting for the map.");
        for (const failure of ["missing", "syncing", "offline", "reject", "wrong-map", "removed", "session", "clan"]) {
          active = supportFixture.region; records = failure === "missing" ? [] : failure === "syncing" ? [{ id: "remote" }] : [stationed];
          centered = []; notices = []; modal.showModal();
          const oldSession = onlineSessionGeneration, oldClan = state.clanId;
          switchOnlineIsland = async region => {
            if (failure === "offline") return false;
            if (failure === "reject") throw Error("Fixture offline");
            if (failure === "wrong-map") return true;
            active = region;
            if (failure === "removed") records = [];
            if (failure === "session") onlineSessionGeneration++;
            if (failure === "clan") state.clanId = "changed-clan";
            return true;
          };
          check(!await focusReinforcementLocation(failure === "syncing" ? "march:remote" : "stationed:remote"), failure + " must not claim navigation success.");
          check(centered.length === 0 && modal.open, failure + " must keep the ledger without stale camera movement.");
          if (!["session", "clan"].includes(failure)) check(notices.length > 0, failure + " needs recovery feedback.");
          onlineSessionGeneration = oldSession; state.clanId = oldClan;
          modal.close();
        }
        return "uncached cities/camps/towers, cross-map progress, map-load delays, removed rows, missing paths, connection failures, account and clan changes";
      } finally {
        getActiveOperationsSnapshot = saved.snapshot; getActiveMapRegionId = saved.active; getArmyTargetById = saved.target;
        switchOnlineIsland = saved.switchMap; centerOnWorldPoint = saved.center; renderArmies = saved.render; clearSelection = saved.clear; showToast = saved.toast;
      }
    });
    // Exercise the real shared return handler through both production button surfaces.
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      const recall = await evaluate(async () => {
        const check = (value, message) => { if (!value) throw Error(message); };
        const saved = { api: getOnlineApi, confirm: window.confirm, apply: applyServerArmyResult, adopt: adoptServerArmyMovement };
        const calls = [], confirmations = [], adopted = [], applied = [];
        let settle, fail, signedIn = true, confirmResult = false;
        const own = { id: "immediate-recall", status: "stationed", ownerUid: "location-viewer", targetOwnerUid: "location-ally", targetId: supportFixture.to.id,
          targetName: supportFixture.to.name, targetRegionId: supportFixture.region, troops: 250000,
          reinforcementSourceId: supportFixture.from.id, reinforcementSourceRegionId: supportFixture.region, reinforcementSourceCityName: supportFixture.from.name };
        const flush = () => new Promise(resolve => setTimeout(resolve, 0));
        returnClanReinforcement = supportOriginalReturn;
        getOnlineApi = () => ({ isSignedIn: () => signedIn, returnClanReinforcement: payload => {
          calls.push(payload); return new Promise((resolve, reject) => { settle = resolve; fail = reject; });
        } });
        window.confirm = message => { confirmations.push(message); return confirmResult; };
        applyServerArmyResult = result => applied.push(result);
        adoptServerArmyMovement = movement => adopted.push(movement);
        try {
          onlineReinforcements = [own]; supportOpen();
          const button = modalBody.querySelector('[data-return-clan-reinforcement="immediate-recall"]');
          button.scrollIntoView({ block: "center" }); button.click();
          check(calls.length === 1 && confirmations.length === 0, "Recall must submit on the first click without a popup.");
          check(reinforcementReturnRequests.has(own.id), "Recall must lock the pending assignment.");
          check(modalBody.querySelector('[data-return-clan-reinforcement="immediate-recall"]').disabled, "Pending Recall stays disabled.");
          button.click(); await returnClanReinforcement(own.id);
          check(calls.length === 1, "Rapid clicks must not send duplicate recall orders.");
          fail(Error("Fixture return interrupted")); await flush();
          check(onlineReinforcements.length === 1 && !reinforcementReturnRequests.has(own.id), "Failure must preserve troops and release the retry guard.");
          check(getReinforcementActivityError(own.id).includes("interrupted"), "Recall failure must show retry feedback.");
          check(applied.length === 0 && adopted.length === 0, "Failed Recall cannot create a return movement.");
          modalBody.querySelector('[data-return-clan-reinforcement="immediate-recall"]').click();
          check(calls.length === 2 && confirmations.length === 0, "Retry also submits directly.");
          settle({ troops: own.troops, returnInitiatorRole: "contributor", movement: { id: "return-order", toName: "Main City fallback" } }); await flush();
          check(!onlineReinforcements.length && adopted.length === 1 && applied.length === 1, "Successful Recall must adopt the server return once.");
          check(toast.textContent.includes("Main City fallback"), "Server-confirmed fallback must remain visible after Recall.");

          // Holding details use the same no-confirmation command and still require sign-in.
          onlineReinforcements = [own]; modal.className = "";
          modalBody.innerHTML = renderHoldingReinforcementPanel(supportFixture.to); bindHoldingReinforcementButtons();
          signedIn = false; modalBody.querySelector('[data-return-clan-reinforcement="immediate-recall"]').click();
          check(calls.length === 2, "Signed-out Recall must not dispatch."); signedIn = true;
          modalBody.querySelector('[data-return-clan-reinforcement="immediate-recall"]').click();
          check(calls.length === 3 && confirmations.length === 0, "Holding-details Recall must dispatch without confirmation.");
          settle({ troops: own.troops, returnInitiatorRole: "contributor", returnDestination: { name: supportFixture.from.name } }); await flush();
          check(!onlineReinforcements.length, "Holding-details acknowledgement must remove the stationed assignment.");

          // This request changes Recall only; the owner still confirms sending another player's troops home.
          const ally = { ...own, id: "send-home", ownerUid: "location-ally", targetOwnerUid: "location-viewer", targetId: supportFixture.from.id };
          onlineReinforcements = [ally]; supportOpen();
          modalBody.querySelector('[data-return-clan-reinforcement="send-home"]').click();
          check(confirmations.length === 1 && calls.length === 3, "Canceled Send Home must keep its confirmation and assignment.");
          confirmResult = true; modalBody.querySelector('[data-return-clan-reinforcement="send-home"]').click();
          check(calls.length === 4, "Confirmed Send Home must still work.");
          settle({ troops: ally.troops, returnInitiatorRole: "holder", movement: { id: "ally-return" } }); await flush();
          check(adopted.length === 1, "Do not adopt an ally's return as the current player's army.");
          return { directRecall: true, duplicateGuard: true, retry: true, holdingDetails: true, sendHomePreserved: true };
        } finally {
          getOnlineApi = saved.api; window.confirm = saved.confirm; applyServerArmyResult = saved.apply; adoptServerArmyMovement = saved.adopt;
          modal.close();
        }
      });
      console.log(`Validated immediate Recall at ${viewport.width}x${viewport.height}: ${JSON.stringify(recall)}.`);
    }
    assert.deepEqual(errors, []);
    console.log(`Validated ${edgeCases}.`);
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
