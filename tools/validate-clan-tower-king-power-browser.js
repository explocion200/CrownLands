"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium is required.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails?.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await client.send("Page.navigate", {url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0`});
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) {
      ready = await evaluate('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
      if (!ready) await delay(100);
    }
    assert(ready, "Game fixture did not load.");
    await evaluate(`__CROWNLANDS_BENCHMARK__.closeModal();
      state.globalStats = {...getGlobalStatsSnapshot(), uid:getCurrentOnlineUid(), worldId:ONLINE_WORLD_ID,
        resetGeneration:RESET_GENERATION, version:KING_POWER_AUTHORITY_VERSION, totalTroops:600000,
        totalMarchingTroops:100000, totalTowerTroops:200000, totalRallyTroops:50000,
        totalReinforcementTroops:50000, kingPower:2120000};
      showProfileScreen();`);
    for (const [width, height] of [[1440,900], [844,390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:1,mobile:height<600});
      await delay(200);
      const result = await evaluate(`(() => {
        renderProfileScreen(); profileTroopsStat.scrollIntoView({block:'nearest'});
        const rect=profileTroopsStat.getBoundingClientRect();
        return {power:profileKingPowerStat.textContent, troops:profileTroopsStat.textContent,
          expectedPower:formatNumber(2120000),expectedTroops:formatNumber(1000000), summary:getKingdomSummary(),
          visible:rect.width>0&&rect.height>0&&rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,
          fits:document.documentElement.scrollWidth<=innerWidth};
      })()`);
      assert.equal(result.summary.troops,1000000);
      assert.equal(result.power,result.expectedPower); assert.equal(result.troops,result.expectedTroops);
      assert(result.visible && result.fits, `Profile stats do not fit ${width}x${height}`);
      const shot=await client.send("Page.captureScreenshot", {format:"png"});
      const output=path.resolve(__dirname,"../release-artifacts/clan-tower-king-power"); fs.mkdirSync(output,{recursive:true});
      fs.writeFileSync(path.join(output,`${width}x${height}.png`),Buffer.from(shot.data,"base64"));
    }
    assert.deepEqual(errors,[]);
    console.log("Clan Tower troop and King Power profile values passed at desktop and landscape-mobile sizes.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
