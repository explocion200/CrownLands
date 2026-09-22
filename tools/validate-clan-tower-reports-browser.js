"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { snapshot } = require("./validate-clan-tower-battle-reports");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const artifacts = path.resolve(__dirname, "../release-artifacts/clan-tower-reports");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client;
  const errors = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const evaluate = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
    for (let i = 0; i < 240; i++) {
      if (await evaluate('window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready"')) break;
      await delay(50);
    }
    await delay(300);
    await evaluate(`window.towerReportFixture = ${JSON.stringify(snapshot)};
      window.reportApi = getOnlineApi(); window.reportViewer = '';
      getCurrentOnlineUid = () => window.reportViewer;
      getOnlineApi = () => ({...window.reportApi, isSignedIn: () => true,
        loadBattleSnapshot: async () => window.towerReportFixture});`);
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const uid of snapshot.participantUids) {
        await evaluate("if(modal.open) modal.close()"); await delay(60);
        await evaluate(`(async () => {
          window.reportViewer = ${JSON.stringify(uid)};
          const report = { id:'tower-report', battleId:towerReportFixture.battleId,
            type:reportViewer.startsWith('attacker') ? 'attack' : 'defense',
            outcome:reportViewer.startsWith('attacker') ? 'victory' : 'lost', cityId:'ravenwatch',
            cityName:'Ravenwatch', targetType:'tower', regionId:'crownlands', cityLevel:5,
            occurredAtMs:Date.now(), createdAtMs:Date.now() };
          state.battleReports = [report]; battleSnapshotCache.clear();
          await showBattleReportDetail(report.id);
        })()`);
        const info = await evaluate(`(() => {
          const body = modalBody.querySelector('.report-body');
          const rows = [...body.querySelectorAll('[data-tower-participant]')];
          return { ids:rows.map(row=>row.dataset.towerParticipant),
            firstSection:body.querySelector('[data-detail-section]').dataset.detailSection,
            top:body.scrollTop, overflow:body.scrollWidth>body.clientWidth+1,
            rowOverflow:rows.some(row=>row.scrollWidth>row.clientWidth+1),
            you:rows[0]?.classList.contains('report-recipient'),
            flags:body.querySelectorAll('.participant-roster-flag').length,
            names:rows.map(row=>row.innerText),
            height:modal.getBoundingClientRect().height,
            nav:!!modalBody.querySelector('[data-detail-jump="battleDetail-participants"]') };
        })()`);
        assert.equal(info.ids[0], uid, "Recipient must be the first participant, including nonleaders");
        assert.equal(new Set(info.ids).size, 6); assert.equal(info.flags, 6);
        assert.equal(info.firstSection, "participants"); assert(info.you);
        assert.equal(info.top, 0); assert(!info.overflow && !info.rowOverflow, `${width}: horizontal overflow`);
        assert(info.height <= height + 1, "Report exceeded landscape viewport");
        assert(info.names.some(name=>name.includes("Attack power")) && info.names.some(name=>name.includes("Defense power")));
        if (uid === "defender-1") {
          const capture = await client.send("Page.captureScreenshot", { format:"png" });
          fs.writeFileSync(path.join(artifacts, `${width}x${height}.png`), Buffer.from(capture.data,"base64"));
        }
        await evaluate("modalBody.querySelector('.report-body').scrollTop = 999999");
        assert(await evaluate("modalBody.querySelector('.report-body').scrollTop > 0"), "Full roster/detail must remain scrollable");
      }
    }
    assert.deepEqual(errors, []);
    console.log("Clan Tower report browser: all six recipients first, flags, powers, scroll and fit at desktop and two mobile-landscape sizes passed.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
