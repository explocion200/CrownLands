"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { itemSnapshot, wallEffects } = require("./validate-clan-tower-battle-reports");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "A Chromium browser is required");
  const output = path.resolve(__dirname, "../release-artifacts/battle-item-effects");
  fs.mkdirSync(output, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [], results = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const evaluate = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert(!r.exceptionDetails, r.exceptionDetails?.exception?.description || r.exceptionDetails?.text);
      return r.result.value;
    };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    let ready = false;
    for (let i = 0; i < 320; i++) {
      if (await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'")) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 125));
    }
    assert(ready, "Fixture did not load");
    await evaluate(`window.__CROWNLANDS_BENCHMARK__.closeModal(); clearOnlineServerReportWatcher(); window.__itemSnapshot=${JSON.stringify(itemSnapshot)};window.__wallEffects=${JSON.stringify(wallEffects)};`);
    for (const [width, height] of [[1440,900], [844,390], [568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const scenario of ["tower", "walls"]) for (const role of ["attacker", "defender"]) {
        const expected = scenario === "tower" ? 12 : 11;
        await evaluate(`(async()=>{
          const s=JSON.parse(JSON.stringify(__itemSnapshot));
          if(${JSON.stringify(scenario)}==='walls'){
            s.target.targetType='city';s.target.strongholdType='defense';s.attackers=[];s.reinforcements=[];
            s.gearEffects.attacker.items=s.gearEffects.attacker.items.filter(i=>i.ownerUid===s.attacker.ownerUid);
            s.gearEffects.defender.items=[...s.gearEffects.defender.items.filter(i=>i.ownerUid===s.defender.ownerUid),...__wallEffects.defender.items];
          }
          loadDetailedBattleSnapshot=async()=>normalizeDetailedBattleSnapshot(s);
          const report={id:'items-qa',battleId:s.battleId,type:${JSON.stringify(role === "attacker" ? "attack" : "defense")},outcome:'victory',cityId:s.target.id,cityName:s.target.name,regionId:s.target.regionId,occurredAtMs:Date.now(),gearEffects:s.gearEffects};
          state.battleReports=[report];await showBattleReportDetail(report.id);
          await Promise.all([...modal.querySelectorAll('img')].map(i=>i.decode()));
          modal.querySelector('#battleDetail-gear').scrollIntoView({block:'start'});
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        })()`);
        const result = await evaluate(`(()=>{
          const section=modal.querySelector('#battleDetail-gear'), body=modal.querySelector('.report-body'), rect=modal.getBoundingClientRect();
          const cards=[...section.querySelectorAll('[data-bonus-side]')];
          return {count:section.querySelectorAll('[data-gear-key]').length,sides:cards.map(c=>c.dataset.bonusSide),
            overflow:body.scrollWidth-body.clientWidth,viewport:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},
            images:[...section.querySelectorAll('.bonus-art.item')].every(i=>i.complete&&i.naturalWidth>0),
            visibleHeader:modal.querySelector('.window-header').getBoundingClientRect().top>=0,
            text:section.innerText};
        })()`);
        assert.equal(result.count, expected, `${scenario}/${role} missing items`);
        assert.deepEqual(result.sides, role === "attacker" ? ["attacker", "defender"] : ["defender", "attacker"]);
        assert(result.images && result.visibleHeader);
        assert(result.overflow <= 1, "Item rows overflow horizontally");
        assert(result.viewport.left >= 0 && result.viewport.top >= 0 && result.viewport.right <= width && result.viewport.bottom <= height);
        assert(result.text.includes("Legendary · Level 5") && result.text.includes("recovery"));
        if (scenario === "walls") assert(result.text.includes("50% repair time"));
        if (role === "defender") {
          const shot = await client.send("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(path.join(output, `${scenario}-${width}x${height}.png`), Buffer.from(shot.data, "base64"));
        }
        results.push({ width, height, scenario, role, ...result });
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "browser-verification.json"), JSON.stringify({ results, errors }, null, 2) + "\n");
    console.log("Battle item reports passed: both sides, all item art, saved rarity/level/owner, recovery, walls and repair at desktop and two landscape sizes.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
