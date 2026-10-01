"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "A Chromium browser is required");
  const output = path.resolve(__dirname, "../release-artifacts/player-camp-defense");
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
    await evaluate(`(() => {
      window.__CROWNLANDS_BENCHMARK__.closeModal(); clearOnlineServerReportWatcher();
      window.campDefenseFixture = [...WORLD_CAMPS_BY_ID.values()][0];
      if (!campDefenseFixture) throw Error('No camp fixture');
      window.campDefenseUid = getCurrentOnlineUid() || 'camp-holder';
      getCurrentOnlineUid = () => campDefenseUid;
      window.originalCampApi = getOnlineApi;
      getOnlineApi = () => ({ isSignedIn: () => true,
        loadRewardCampProgress: async () => ({count:0}),
        getRewardCampDefense: async () => ({ownerUid:campDefenseUid,troops:15000,totalDefense:32760}) });
    })()`);
    for (const [width, height] of [[1440,900], [844,390], [568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const scenario of ["holder", "player-scout", "npc-scout", "legacy-scout"]) {
        await evaluate(`(() => {
          modal.close();const c=campDefenseFixture, mode=${JSON.stringify(scenario)};
          onlineCampStates.set(c.id,{holderUid:mode==='holder'?campDefenseUid:mode==='npc-scout'?'':'enemy-holder',currentGarrison:10000,alliedReinforcementTroops:5000,payoutPending:true});
          if(mode==='holder'){showRewardCampInfoModal(c.id);return;}
          const modern=mode==='player-scout', total=modern?32760:15000;
          state.scoutReports[c.id]={targetType:'camp',troops:15000,ownerTroops:10000,ownerDefensePower:18135,
            totalDefense:total,baseTotalDefense:modern?19500:15000,defenseCombatVersion:modern?1:0,
            baseDefensePowerPerTroop:modern?1.3:1,shieldwallDisciplinePercent:modern?30:0,
            objectiveTroopDefenseBonusPercent:modern?8:0,gearDefenderStrengthPercent:modern?1.5:0,
            ownerUid:mode==='npc-scout'?'':'enemy-holder',ownerName:mode==='npc-scout'?'Neutral defenders':'Camp holder',
            scoutedAt:state.gameSeconds,expiresAt:state.gameSeconds+600,scoutedAtMs:Date.now(),expiresAtMs:Date.now()+600000,
            reinforcements:[{ownerUid:'ally',ownerName:'Allied ruler',troops:5000,effectivePower:modern?14625:5000,
              basePower:modern?6500:5000,baseDefensePowerPerTroop:modern?1.3:1,shieldwallDisciplinePercent:modern?60:0,
              sharedDefenseBonusPercent:modern?5:0,personalDefenseBonusPercent:0,gearDefenderStrengthPercent:modern?60:0}]};
          showScoutReportModal(c.id);
        })()`);
        await new Promise(resolve => setTimeout(resolve, 300));
        const result = await evaluate(`(() => {const r=modal.getBoundingClientRect();return {
          text:modalBody.innerText, overflow:modalBody.scrollWidth-modalBody.clientWidth,
          bounds:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},
          ownerPower:modalBody.querySelector('[data-camp-defense-power]')?.textContent,
          table:modalBody.querySelector('.scout-table')?.innerText};})()`);
        assert(result.bounds.left >= 0 && result.bounds.top >= 0 && result.bounds.right <= width + 1 && result.bounds.bottom <= height + 1);
        assert(result.overflow <= 1, `${scenario} horizontal overflow at ${width}`);
        if (scenario === "holder") assert.equal(result.ownerPower, await evaluate("formatNumber(32760)"));
        if (scenario === "player-scout") {
          for (const value of ["18,135", "14,625", "32,760", "Shieldwall +30%", "Shieldwall +60%"]) assert(result.table.includes(value), `Missing ${value}`);
          assert(!result.text.includes("Every stationed troop contributes exactly 1.00"));
        }
        if (scenario === "npc-scout" || scenario === "legacy-scout") assert(result.text.includes("This snapshot records 1.00"));
        const shot = await client.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(output, `${scenario}-${width}x${height}.png`), Buffer.from(shot.data, "base64"));
        results.push({ width, height, scenario, ...result });
      }
    }
    await evaluate(`(() => {modal.close();onlineCampStates.set(campDefenseFixture.id,{holderUid:campDefenseUid,currentGarrison:10000});
      getOnlineApi=()=>({isSignedIn:()=>true,loadRewardCampProgress:async()=>({count:0}),getRewardCampDefense:async()=>{throw Error('offline fixture')}});
      showRewardCampInfoModal(campDefenseFixture.id);})()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await evaluate("modalBody.querySelector('[data-camp-defense-power]').textContent"), "Unavailable");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "browser-verification.json"), JSON.stringify({ results, errors }, null, 2) + "\n");
    console.log("Camp holder totals, mixed player scout bonuses, NPC/legacy reports and offline inspection passed at desktop and two landscape sizes.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
