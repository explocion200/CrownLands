"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(browser, "Set CHROME_PATH to a Chromium browser.");
  const server = createMapBenchmarkServer();
  const address = await server.listen();
  let session, client;
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A` });
    for (let i = 0; i < 480 && !await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"); i++) await wait(250);
    assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"), "ready");
    await evaluate("__CROWNLANDS_BENCHMARK__.closeModal()");
    await wait(200);
    await evaluate(`window.modalLifecycleQa = {
      closeButton() {
        return modal.classList.contains('help-handbook-modal') ? modalBody.querySelector('#closeHelp') : closeModalBtn;
      },
      closeState() {
        const button = this.closeButton();
        const rect = button.getBoundingClientRect();
        return { open: modal.open, classes: modal.className,
          visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth,
          usable: !button.disabled && button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) };
      }
    };`);
    const guidanceVisibility = await evaluate(`(async () => {
      const saved = { ...getOnboardingPrefs() };
      const source = selectedSourceId, target = selectedTargetId;
      try {
        saveOnboardingPrefs({ enabled: true, dismissed: [] });
        selectedSourceId = playerCities()[0].id; selectedTargetId = null;
        toast.classList.remove('visible'); renderOnboardingMapTip();
        const tip = document.getElementById('onboardingMapTip');
        if (tip.hidden) throw new Error('Guidance fixture did not become visible');
        const states = [];
        for (const [open, close] of [
          [() => modal.showModal(), () => modal.close()],
          [() => chatDialog.showModal(), () => chatDialog.close()],
          [() => profileScreen.classList.add('open'), () => profileScreen.classList.remove('open')],
          [() => toast.classList.add('visible'), () => toast.classList.remove('visible')],
          [() => setupScreen.classList.add('visible'), () => setupScreen.classList.remove('visible')],
        ]) {
          open(); await Promise.resolve(); const blocked = tip.hidden;
          close(); await Promise.resolve(); states.push(blocked && !tip.hidden);
        }
        return states;
      } finally {
        saveOnboardingPrefs(saved); selectedSourceId = source; selectedTargetId = target;
        renderOnboardingMapTip();
      }
    })()`);
    assert(guidanceVisibility.every(Boolean), `Overlay visibility failed: ${JSON.stringify(guidanceVisibility)}`);
    await wait(200);
    for (const fullscreen of [false, true]) {
      if (fullscreen) {
        await evaluate("toggleFullscreen()");
        assert.equal(await evaluate("document.fullscreenElement === document.documentElement"), true);
      }
      for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
        await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
        for (const destination of ["showCityInfoModal(playerCities()[0].id)", "showCityListModal()", "showShopModal()", "showHelpModal()"] ) {
          await evaluate("showLogModal(); modalBody.querySelector('[data-reports-close]').click()");
          await wait(100);
          await evaluate(destination);
          for (let i = 0; i < 600 && await evaluate('!!modalBody.querySelector(".optional-ui-loading")'); i++) await wait(100);
          assert(!await evaluate('!!modalBody.querySelector(".optional-ui-loading")'), "Destination styles did not load");
          await wait(350);
          const status = await evaluate("modalLifecycleQa.closeState()");
          assert(status.open && status.visible && status.usable, `Reports poisoned ${destination} at ${JSON.stringify({ fullscreen, viewport, status })}`);
          await evaluate("modalLifecycleQa.closeButton().click()");
          await wait(100);
          assert.equal(await evaluate("modal.open"), false);
        }
      }
    }
    await evaluate("toggleFullscreen()");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    // Player links replace the report in-place, without a native close event.
    for (const theme of ["battle-reports-ledger", "battle-report-detail-ledger", "scout-report-ledger", "marches-activity-ledger", "rallies-activity-ledger"]) {
      await evaluate(`showLogModal(); modal.classList.add(${JSON.stringify(theme)}); void showPublicPlayerProfile(getCurrentOnlineUid());`);
      await wait(350);
      const status = await evaluate("modalLifecycleQa.closeState()");
      assert(status.visible && status.usable && status.classes === "modal public-player-profile-modal", `Profile retained ${theme}: ${JSON.stringify(status)}`);
      await evaluate("modal.close()");
      await wait(100);
    }
    const reopen = await evaluate(`(async () => {
      showCityListModal(); modal.close(); showCityListModal();
      const requestId = publicPlayerProfileRequestId;
      await new Promise(resolve => setTimeout(resolve, 150));
      return { ...modalLifecycleQa.closeState(), sameRequestId: requestId === publicPlayerProfileRequestId };
    })()`);
    assert(reopen.open && reopen.classes.includes("city-list-modal") && reopen.sameRequestId, `Queued close cleared a reopened window: ${JSON.stringify(reopen)}`);
    await evaluate("modal.close()");
    await wait(100);
    const replacement = await evaluate(`(async () => {
      showLogModal(); const oldRequest = publicPlayerProfileRequestId;
      modal.close(); showCityInfoModal(playerCities()[0].id);
      const retired = oldRequest !== publicPlayerProfileRequestId;
      await new Promise(resolve => setTimeout(resolve, 150));
      const status = modalLifecycleQa.closeState(); modal.close();
      return { ...status, retired };
    })()`);
    assert(replacement.visible && replacement.usable && replacement.retired && !replacement.classes.includes('ledger'),
      `Same-turn replacement retained the old view or request: ${JSON.stringify(replacement)}`);
    await wait(100);
    await evaluate("showCityListModal()");
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await wait(100);
    assert.equal(await evaluate("!modal.open && !modal.classList.contains('city-list-modal')"), true, "Native Escape bypassed dialog cleanup.");
    const timing = await evaluate(`(() => {
      const operations = getActiveOperationsSnapshot();
      if (!operations.marches.length) throw new Error('Fixture has no outgoing marches');
      activeOperationsTab = 'marches'; showOutgoingAttacksModal();
      const root = modalBody.firstElementChild;
      const control = modalBody.querySelector('[data-close-marches]');
      control.focus();
      const observer = new MutationObserver(() => {}); observer.observe(modalBody, { childList: true, subtree: true });
      const start = performance.now();
      for (let i = 0; i < 30; i++) renderOutgoingAttacksModalContent({ ...operations,
        marches: operations.marches.map(march => ({ ...march, remaining: 500 - i })) });
      const elapsedMs = performance.now() - start;
      const structuralMutations = observer.takeRecords().length; observer.disconnect();
      const stable = root === modalBody.firstElementChild && control === modalBody.querySelector('[data-close-marches]');
      const latestTimer = modalBody.querySelector('.march-arrival strong')?.textContent;
      const expectedTimer = formatDuration(471);
      const focusPreserved = document.activeElement === control;
      // Identity/busy/eligibility changes must still rebuild and bind the fresh controls.
      renderOutgoingAttacksModalContent({ ...operations, marches: operations.marches.map(march => ({ ...march, serverPending: true })) });
      const changed = root !== modalBody.firstElementChild && modalBody.textContent.includes('Sending');
      modalBody.querySelector('[data-close-marches]').click();
      return { elapsedMs, structuralMutations, stable, latestTimer, expectedTimer, focusPreserved, changed, closed: !modal.open };
    })()`);
    assert(timing.stable && timing.focusPreserved && timing.structuralMutations === 0, `Countdown replaced controls: ${JSON.stringify(timing)}`);
    assert.equal(timing.latestTimer, timing.expectedTimer);
    assert(timing.changed && timing.closed, "Changed operation state did not rebuild or bind controls.");
    await wait(100);
    // A real pointer press spanning a countdown tick must still click Close.
    const point = await evaluate(`(() => {
      activeOperationsTab = 'marches'; showOutgoingAttacksModal();
      const rect = modalBody.querySelector('[data-close-marches]').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await evaluate("renderOutgoingAttacksModalContent()");
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
    assert.equal(await evaluate("modal.open"), false, "Countdown swallowed a real Close click.");
    await wait(100);
    const incoming = await evaluate(`(() => {
      const attacks = getIncomingAttacks();
      if (!attacks.length) throw new Error('Fixture has no incoming attacks');
      showIncomingAttacksModal();
      const root = modalBody.firstElementChild, control = modalBody.querySelector('[data-incoming-city]');
      control.focus();
      renderIncomingAttacksModalContent(attacks.map(attack => ({ ...attack, remaining: 500 })));
      const stable = root === modalBody.firstElementChild && document.activeElement === control;
      modal.close(); return stable;
    })()`);
    assert(incoming, "Incoming countdown replaced controls or lost focus.");
    await wait(100);
    const rally = await evaluate(`(() => {
      const source = playerCities()[0], uid = getCurrentOnlineUid();
      const rally = { id: 'modal-lifecycle-rally', leaderUid: uid, status: 'forming',
        targetId: source.id, targetName: 'Test objective', targetRegionId: getCityRegionId(source),
        assemblyCityId: source.id, assemblyCityName: source.name,
        participants: [{ uid, ownerName: 'Creator', role: 'leader', status: 'assembled', troops: 500 },
          { uid: 'test-ally', ownerName: 'Ally', role: 'ally', status: 'inbound', troops: 400, arrivesAtMs: Date.now() + 500000 }] };
      const operations = { marches: [], rallies: [rally], reinforcements: [], camps: [], strongholds: [] };
      activeOperationsTab = 'rallies'; modal.className = 'modal outgoing-attack-modal';
      renderOutgoingAttacksModalContent(operations); modal.showModal();
      const root = modalBody.firstElementChild, close = modalBody.querySelector('[data-close-marches]');
      close.focus(); rally.participants[1].arrivesAtMs -= 1000;
      renderOutgoingAttacksModalContent(operations);
      const stable = root === modalBody.firstElementChild && document.activeElement === close;
      const initiallyDisabled = modalBody.querySelector('[data-rally-action="launch"]').disabled;
      rally.participants[1].status = 'assembled'; renderOutgoingAttacksModalContent(operations);
      const ready = !modalBody.querySelector('[data-rally-action="launch"]').disabled;
      modalBody.querySelector('[data-close-marches]').click(); activeOperationsTab = 'marches';
      return { stable, initiallyDisabled, ready, closed: !modal.open };
    })()`);
    assert(rally.stable && rally.initiallyDisabled && rally.ready && rally.closed, `Rally updates lost state or controls: ${JSON.stringify(rally)}`);
    console.log(`Modal lifecycle passed: Reports transitions at 3 sizes in/out of fullscreen, profile transitions, queued reopen, and stable activity controls. 30 countdown updates: ${timing.elapsedMs.toFixed(1)}ms, ${timing.structuralMutations} structural mutations.`);
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
