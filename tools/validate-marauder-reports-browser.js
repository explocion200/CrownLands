"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { snapshots } = require("./validate-marauder-reports");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main(built = false) {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium required");
  const artifacts = path.resolve(__dirname, `../release-artifacts/marauders/reports${built ? "/built" : ""}`);
  const delivered = {};
  if (built) for (const file of ["battle-report-detail-ui.js", "marauders-ui.js"]) {
    delivered[file] = fs.readFileSync(path.resolve(__dirname, "../dist", file), "utf8");
    assert.equal(delivered[file], require("./estate-delivery").minifyEstate(
      fs.readFileSync(path.resolve(__dirname, "..", file), "utf8").replace(/\r\n/g, "\n")), `Built ${file} is stale`);
  }
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client; const errors = [], failedAssets = [], records = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    if (built) {
      client.on("Fetch.requestPaused", e => { client.send("Fetch.fulfillRequest", { requestId: e.requestId,
        responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/javascript; charset=utf-8" }],
        body: Buffer.from(delivered[new URL(e.request.url).pathname.split("/").at(-1)]).toString("base64") }).catch(error => errors.push(error.message)); });
      await client.send("Fetch.enable", { patterns: Object.keys(delivered).map(file => ({ urlPattern: `*${file}*` })) });
    }
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    client.on("Network.responseReceived", e => { if (e.response.status >= 400 && ["Image", "Stylesheet", "Script"].includes(e.type)) failedAssets.push(e.response.url); });
    const ev = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const wait = async expression => { for (let i = 0; i < 400; i++) { if (await ev(expression)) return; if (errors.length) throw Error(errors.join("\n")); await delay(50); } throw Error("Timeout: " + expression + " · " + JSON.stringify(await ev("({open:modal.open,cls:modal.className,detail:modal.dataset.battleReportDetailId,ui:!!window.CrownlandsBattleReportUI,text:modalBody.textContent.slice(0,700),ids:state.battleReports.map(r=>r.id)})"))); };
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick" });
    await wait("document.documentElement?.dataset.crownlandsBenchmarkReady==='true'");
    await delay(300);
    await ev(`__CROWNLANDS_BENCHMARK__.closeModal();window.npcReportApi=getOnlineApi();window.reportViewer='hunter-0';
      getCurrentOnlineUid=()=>window.reportViewer;
      getOnlineApi=()=>({...window.npcReportApi,isSignedIn:()=>true,
        loadBattleSnapshot:async()=>{if(window.reportLoadFails)throw Error('Fixture unavailable');return window.npcReportSnapshot;}});`);
    const cases = [
      { name: "solo", snapshot: snapshots.solo, outcome: "victory" },
      { name: "solo-defeat", snapshot: snapshots.soloDefeat, outcome: "defeat" },
      { name: "boss", snapshot: snapshots.boss, outcome: "victory", viewer: "hunter-1" },
      { name: "boss-defeat", snapshot: snapshots.bossDefeat, outcome: "defeat" },
      { name: "max-rally", snapshot: snapshots.maxRally, outcome: "victory", viewer: "hunter-19" },
      { name: "historical", snapshot: snapshots.solo, outcome: "victory", legacy: true },
      { name: "unavailable", snapshot: snapshots.boss, outcome: "target_unavailable", legacy: true },
      { name: "snapshot-failed", snapshot: snapshots.boss, outcome: "victory", fails: true },
    ];
    await ev('ensureModalUiScripts("battle-report",()=>{})');
    await wait("!!window.CrownlandsBattleReportUI && [...document.styleSheets].some(sheet=>sheet.href?.includes('battle-report-detail-ui.css'))");
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      const cityReportStyle=await ev(`(async()=>{
        const report={id:'city-style-reference',type:'attack',targetType:'city',outcome:'victory',cityId:'city-reference',cityName:'City reference',cityLevel:1,
          regionId:getActiveMapRegionId(),sentTroops:200,attackerLosses:50,survivors:150,defenderLosses:100,defendersLeft:0,occurredAtMs:Date.now()};
        state.battleReports=[report];await showBattleReportDetail(report.id);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        await Promise.all(modal.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
        return [modal,modalBody.querySelector('.detail-ledger-shell'),modalBody.querySelector('.window-header'),modalBody.querySelector('.report-body')].map(node=>{
          const s=getComputedStyle(node),r=node.getBoundingClientRect();return [Math.round(r.width),s.backgroundColor,s.color,s.fontFamily,s.fontSize];});
      })()`);
      for (const test of cases) {
        const snapshot = test.snapshot, viewer = test.viewer || "hunter-0";
        const personal = snapshot.attackers.find(p => p.ownerUid === viewer);
        const victory = test.outcome === "victory";
        const report = { id: "report-" + test.name, type: "attack", targetType: "marauder",
          battleId: test.legacy ? "" : snapshot.battleId, outcome: test.outcome,
          targetSpawnId: snapshot.target.targetSpawnId, marauderLevel: snapshot.target.level,
          cityId: snapshot.target.id, cityName: snapshot.target.name, cityLevel: snapshot.target.level,
          regionId: snapshot.target.regionId, sentTroops: personal.startingTroops,
          attackerLosses: test.outcome === "target_unavailable" ? 0 : personal.losses,
          survivors: test.outcome === "target_unavailable" ? personal.startingTroops : personal.survivors,
          troopCount: snapshot.defender.startingTroops, totalDefense: snapshot.totals.defensePower,
          defendersLeft: snapshot.defender.survivors, defenderLosses: snapshot.defender.losses,
          goldAwarded: victory ? 123456 : 0, xpAwarded: victory ? 789 : 0,
          troopsAwarded: victory ? 1500 : 0, fieldMedicsRecovered: test.outcome === "target_unavailable" ? 0 : 50,
          staminaRefunded: test.outcome === "target_unavailable" ? 10 : 0,
          itemAwarded: victory ? "recall_horn" : "", damageContribution: victory ? 23456 : 0,
          levelUpReward: victory ? { fromLevel: 1, toLevel: 2, levelsGained: 1, goldAwarded: 1000, troopsAwarded: 1500 } : null,
          summary: test.outcome === "target_unavailable" ? "The enemy was unavailable. Your army is returning. 10 stamina refunded." : "Recorded hunt result.",
          occurredAtMs: Date.now(), createdAtMs: Date.now() };
        await ev(`if(modal.open)modal.close();window.reportViewer=${JSON.stringify(viewer)};
          window.npcReportSnapshot=${JSON.stringify(snapshot)};window.reportLoadFails=${!!test.fails};
          state.battleReports=[{...${JSON.stringify(report)},occurredAtMs:Date.now(),createdAtMs:Date.now()}];battleSnapshotCache.clear();
          applyOnlineMarauders([{...npcReportSnapshot.target,worldId:ONLINE_WORLD_ID,resetGeneration:RESET_GENERATION,
            spawnId:npcReportSnapshot.target.targetSpawnId,status:'active'}],npcReportSnapshot.target.regionId);
          showBattleReportDetail(${JSON.stringify(report.id)});`);
        await wait("modalBody.querySelector('.detail-ledger-shell .army') && modalBody.querySelector('[data-detail-jump]')");
        await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await ev('Promise.all(modal.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');
        const info = await ev(`(()=>{const b=modalBody.querySelector('.report-body'),text=b.textContent;
          return {shell:!!modalBody.querySelector('.detail-ledger-shell'),header:modalBody.querySelector('.window-header').textContent,
            text,art:b.querySelector('.npc-report-art')?.getAttribute('src'),fakeNpcFlag:!!b.querySelector('.opponent [data-battle-participant-flag]'),
            walls:!!b.querySelector('#battleDetail-walls')||text.includes('Wall power at battle'),
            count:b.querySelectorAll('.rally-table tbody tr').length,bodyOverflow:b.scrollWidth>b.clientWidth+1,
            viewportFit:modal.getBoundingClientRect().height<=${height}+1,
            map:!!modalBody.querySelector('[data-report-jump]:not(:disabled)'),
            nav:[...modalBody.querySelectorAll('[data-detail-jump]')].map(n=>n.textContent),
            values:[...b.querySelectorAll('.comparison tbody tr')].map(r=>r.textContent)};})()`);
        assert(info.shell && info.header.includes("Attack report") && info.header.includes("Reports"));
        const npcReportStyle=await ev(`[modal,modalBody.querySelector('.detail-ledger-shell'),modalBody.querySelector('.window-header'),modalBody.querySelector('.report-body')].map(node=>{
          const s=getComputedStyle(node),r=node.getBoundingClientRect();return [Math.round(r.width),s.backgroundColor,s.color,s.fontFamily,s.fontSize];})`);
        assert.deepEqual(npcReportStyle,cityReportStyle,'NPC attack report must match the regular-city report window and typography');
        assert(!info.walls && !info.fakeNpcFlag, "NPC report invented walls or a player flag");
        assert(!info.text.includes("captured") && !info.text.includes("held the holding"));
        assert(info.art.includes(snapshot.target.classification === "boss" ? "boss-v1" : "solo-v1"));
        assert(info.viewportFit && !info.bodyOverflow, `${width} ${test.name}: overflow`);
        assert(info.map, "NPC map shortcut lost");
        assert(info.nav.includes("Forces") && info.nav.includes("Bonuses"));
        if (victory) assert(info.text.includes("Recall Horn") && info.text.includes("Added to your Bag") && info.text.includes("Hero level-up rewards included"), test.name+": "+info.text);
        else assert(!info.text.includes("123K") && !info.text.includes("Recall Horn"), "Defeat/refund invented hunt loot");
        if (test.outcome === "target_unavailable") assert(info.text.includes("Not attacked") && info.text.includes("Stamina refunded") && info.text.includes("capped at 100"));
        else if (test.legacy || test.fails) assert(info.text.includes("Not recorded"), "Historical attack power was invented");
        else {
          assert.equal(info.count, snapshot.attackers.length > 1 ? snapshot.attackers.length : 0);
          assert(info.text.includes(await ev(`formatBattleReportValue(${snapshot.totals.attackPower})`)));
          assert.equal(await ev("normalizeDetailedBattleSnapshot(npcReportSnapshot).totals.attackPower"), snapshot.totals.attackPower);
          assert(info.text.includes("Swordmastery") && info.text.includes("Gear Effects"));
          if (snapshot.target.classification === "boss" && victory) assert(info.text.includes("Your share of the boss rewards") && info.text.includes("23,456"));
        }
        await ev("modalBody.querySelector('[data-detail-jump=\"battleDetail-forces\"]').focus()");
        await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
        await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        assert(await ev("document.activeElement.closest('#battleDetail-forces') !== null"), "Keyboard section focus lost");
        await ev("modalBody.querySelector('.report-body').scrollTop=999999");
        assert(await ev("modalBody.querySelector('.report-body').scrollTop>0"), "Report cannot scroll");
        if (["solo", "boss", "unavailable"].includes(test.name)) {
          await ev("modalBody.querySelector('.report-body').scrollTop=0");
          fs.writeFileSync(path.join(artifacts, `${test.name}-${width}x${height}.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
        }
        await ev("modalBody.querySelector('[data-detail-close]').click()"); assert(!await ev("modal.open"));
        records.push({ name: test.name, width, height, passed: true });
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []);
    fs.writeFileSync(path.join(artifacts, "browser-validation.json"), JSON.stringify({ ok: true, records, errors, failedAssets }, null, 2));
    console.log(`NPC reports browser (${built ? "production minified" : "source"}): shared attack layout, solo/boss victory/defeat, 20-member rally, historical/failed snapshots, refunds, exact shares, art, keyboard navigation, map/close and scrolling passed in 24 desktop/landscape cases.`);
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().then(() => main(true)).catch(error => { console.error(error); process.exitCode = 1; });
