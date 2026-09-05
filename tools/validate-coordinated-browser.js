"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const browser = [process.env.CHROME_PATH, process.env.CROWNLANDS_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(browser, "Set CHROME_PATH to run the coordinated browser checks.");
  const server = createMapBenchmarkServer();
  const address = await server.listen();
  let session, client;
  const artifacts = path.resolve(__dirname, "../release-artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
    for (let i = 0; i < 120; i += 1) {
      const status = await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus()");
      if (status?.status === "error") throw new Error(status.error);
      if (status?.status === "ready") break;
      await wait(500);
    }
    assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__.getStatus().status"), "ready");
    for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "landscape", width: 844, height: 390 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
      for (const kind of ["attack", "transfer"]) {
        for (const speed of [1, 1.6 * 1.08 + .0115]) {
          const summary = await evaluate(`(() => {
            const source = playerCities().find(city => !isStronghold(city) && city.troops > 1);
            const target = ${kind === "transfer" ? "playerCities().find(city => city.id !== source.id && !isStronghold(city))" : "state.cities.find(city => city.owner === 'neutral' && !isStronghold(city) && !city.isMainCity)"};
            selectedTroopAmount = 4; selectedSourceId = source.id; selectedTargetId = target.id;
            const route = { points: [source, target], length: 2000, previewStatus: 'authoritative',
              authoritativeDurationSeconds: 1673, authoritativeRequestedTroops: 4, authoritativeSpeedMultiplier: ${speed} };
            showTroopSliderModalWithRoute(source, target, route, {orderKind: '${kind}'});
            return document.querySelector('.travel-time-summary').innerText;
          })()`);
          assert.equal(summary.replace(/\s+/g, " "), `Travel bonus ${speed === 1 ? "0" : "73.95"}% Travel time 27m 53s`);
          await wait(100);
          await evaluate("modalBody.scrollTop = modalBody.scrollHeight");
          const bounds = await evaluate(`(() => { const travel = document.querySelector('.travel-time-summary').getBoundingClientRect();
            const actions = document.querySelector('.troop-slider-actions').getBoundingClientRect();
            return {bottom: travel.bottom, actionsTop: actions.top, left: travel.left, right: travel.right}; })()`);
          assert(bounds.bottom <= bounds.actionsTop + 1, `${kind}/${viewport.name}: Travel details are covered by action buttons: ${JSON.stringify(bounds)}`);
          assert(bounds.left >= 0 && bounds.right <= viewport.width, "Travel details overflow the viewport.");
          if (speed > 1) {
            const shot = await client.send("Page.captureScreenshot", { format: "png" });
            fs.writeFileSync(path.join(artifacts, `${kind}-${viewport.name}.png`), Buffer.from(shot.data, "base64"));
          }
        }
      }
    }
    await evaluate("window.__CROWNLANDS_BENCHMARK__.closeModal()");
    await evaluate("window.__CROWNLANDS_BENCHMARK__.switchNeighborAndReturn()");
    assert.equal(await evaluate("typeof onlineServerReportsUnsubscribe"), "function", "Changing maps lost the reports subscription.");

    // Exercise the real chat controller with an authoritative clock and delayed
    // page delivery. The fixture uses no Firebase account or production data.
    await client.send("Page.navigate", { url: `${address.url}/docs/visual-qa/chat/index.html` });
    for (let i = 0; i < 60 && !await evaluate("Boolean(window.CrownlandsChatVisualQa)"); i += 1) await wait(100);
    await evaluate(`(() => {
      CrownlandsChatVisualQa.controller.dispose();
      const now = Date.now();
      window.releaseChatQa = { handlers: {}, base: now, started: performance.now() };
      const qa = releaseChatQa;
      qa.api = { getServerNowMs: () => qa.base + performance.now() - qa.started,
        subscribeChatMessages: (options, handlers) => { qa.handlers[options.channel] = handlers; return () => {}; },
        loadOlderChatMessages: () => new Promise(resolve => { qa.resolvePage = resolve; }) };
      qa.controller = CrownlandsChat.createController();
      qa.controller.start({api: qa.api, uid: 'qa', clanId: 'qa-clan'});
      qa.controller.setMode('full');
      qa.message = (id, createdAtMs, channel = 'global') => ({id, channel, text:id, createdAtMs, status:'visible'});
      qa.handlers.global.onMessages([qa.message('already-expired', now - 86400000), qa.message('expires-open', now - 86400000 + 400), qa.message('fresh', now)], {initial: true, hasMore: true});
      qa.handlers.clan.onMessages([qa.message('old-clan', 1, 'clan')], {initial:true});
    })()`);
    assert.equal(await evaluate("releaseChatQa.controller.diagnostics().renderedMessages"), 2);
    await wait(550);
    assert.equal(await evaluate("document.querySelectorAll('#chatMessageList .chat-message').length"), 1, "An open client retained an expired message.");
    await evaluate("document.getElementById('chatLoadOlderBtn').click(); releaseChatQa.controller.selectChannel('clan')");
    await evaluate("releaseChatQa.resolvePage([releaseChatQa.message('expired-page', 1)]); Promise.resolve()");
    assert.equal(await evaluate("document.querySelector('#chatMessageList .chat-message').dataset.messageId"), "old-clan");
    await evaluate("releaseChatQa.controller.selectChannel('global'); releaseChatQa.controller.setMode('closed'); releaseChatQa.controller.setMode('full')");
    assert.equal(await evaluate("releaseChatQa.controller.diagnostics().renderedMessages"), 1);
    await evaluate(`(() => { const qa=releaseChatQa; qa.old=qa.handlers.global; qa.controller.dispose();
      qa.controller.start({api:qa.api,uid:'qa',clanId:'qa-clan'}); qa.controller.setMode('full');
      qa.old.onMessages([qa.message('stale-listener',qa.base)]);
      qa.handlers.global.onMessages([qa.message('expired-cache',1),qa.message('fresh-reconnect',qa.base)],{initial:true}); })()`);
    assert.equal(await evaluate("releaseChatQa.controller.diagnostics().renderedMessages"), 1);
    console.log("Coordinated browser checks passed: attack/transfer 0% and stacked bonuses at desktop/landscape; map-stable reports; open-client Global expiry, pagination, reopening, stale listeners, reconnect, and retained Clan history.");
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
