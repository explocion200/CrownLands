"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "Chromium is required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const dir = path.resolve(__dirname, "../release-artifacts/king-power-colors"); fs.mkdirSync(dir, { recursive: true });
  let session, client;
  const results = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("Network.enable")]);
    await client.send("Network.setBlockedURLs", { urls: ["*googleapis.com*", "*cloudfunctions.net*", "*firebaseio.com*", "*playcrownlands.com*"] });
    const evaluate = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    for (const [width, height] of [[1440,900], [844,390], [568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      for (let i = 0; i < 160; i++) {
        const status = await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus()");
        if (status?.status === "error") throw Error(status.error);
        if (status?.status === "ready") break;
        await wait(100);
      }
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__.getStatus().status"), "ready");
      const before = await evaluate(`(() => {
        window.powerQa = { now:Date.now(), stats:{kingPower:200000,version:12,updatedAtMs:Date.now()}, calls:0 };
        const qa=powerQa; getGlobalStatsSnapshot=()=>qa.stats;
        modal.close(); selectedTargetId=null; selectedSourceId=null; sendMode=false;
        qa.cities=[...cityLayer.querySelectorAll('.city-node.enemy')].map(n=>cityById(n.dataset.cityId)).filter(c=>!isStronghold(c)&&!isClanAllyCity(c)).slice(0,5);
        if(qa.cities.length!==5)throw Error('Need five visible enemy cities');
        clearEnemyPowerBandCache(); playerIdentityLookupQueue.clear();
        zoom=1; applyCameraTransform();
        qa.cities.forEach((c,i)=>Object.assign(c,screenToWorld(innerWidth*(.14+i*.18),innerHeight*.58)));
        qa.powers=[25000,150000,250001,200000,100000];
        qa.cities.forEach((c,i)=>{c.ownerUid='power-fixture-'+i;c.ownerClanId='';c.ownerName=['Unknown','In range','Stronger','Equal','Protected'][i];
          playerIdentityCache.delete(c.ownerUid);
          rememberPlayerIdentity({uid:c.ownerUid,displayName:c.ownerName,kingPower:qa.powers[i],kingPowerVersion:i===0?11:12,updatedAtMs:qa.now},{force:true});});
        qa.read=()=>qa.cities.map(c=>{const n=cityLayer.querySelector('[data-city-id="'+c.id+'"]');return {id:c.id,band:n.dataset.enemyPowerBand,color:getComputedStyle(n.querySelector('.foreign-city-shield')).backgroundColor,title:n.title,aria:n.getAttribute('aria-label')};});
        renderCities(true);qa.firstNode=cityLayer.querySelector('[data-city-id="'+qa.cities[0].id+'"]');
        window.CrownlandsOnline={...window.CrownlandsOnline,isSignedIn:()=>true,
          loadPlayerIdentities:async()=>[{uid:qa.cities[0].ownerUid,kingPower:25000,kingPowerVersion:11,updatedAtMs:qa.now}],
          getCombatPlayerIdentity:()=>{qa.calls++;return new Promise(r=>qa.release=r);}};
        return qa.read();
      })()`);
      assert.deepEqual(before.map(r => r.band), ["unknown", "in-range", "overpowering", "in-range", "protected"]);
      assert.deepEqual(before.map(r => r.color), ["rgb(129, 118, 101)", "rgb(179, 38, 30)", "rgb(75, 20, 24)", "rgb(179, 38, 30)", "rgb(201, 120, 111)"]);
      assert.match(before[0].title, /not yet verified/);
      const initialShot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(dir, `${width}x${height}-bands.png`), Buffer.from(initialShot.data, "base64"));
      await evaluate("playerIdentityLookupQueue.add(powerQa.cities[0].ownerUid); powerQa.task=refreshQueuedPlayerIdentities(); void 0");
      for (let i = 0; i < 30 && !await evaluate("Boolean(powerQa.release)"); i++) await wait(50);
      const after = await evaluate(`(async()=>{const qa=powerQa;qa.release({uid:qa.cities[0].ownerUid,displayName:'Protected after refresh',kingPower:25000,kingPowerVersion:12,updatedAtMs:qa.now+100});await qa.task;return {rows:qa.read(),calls:qa.calls,sameNode:qa.firstNode===cityLayer.querySelector('[data-city-id="'+qa.cities[0].id+'"]')};})()`);
      assert.equal(after.rows[0].band, "protected"); assert.equal(after.rows[0].color, "rgb(201, 120, 111)");
      assert.equal(after.calls, 1); assert(after.sameNode); assert.match(after.rows[0].aria, /raid only/);
      await evaluate("powerQa.stats={kingPower:400000,version:12,updatedAtMs:powerQa.now+200}; renderCities(true)");
      assert.equal((await evaluate("powerQa.read()"))[1].band, "in-range", "Three-second stabilization was removed");
      await wait(3300);
      const stabilized = await evaluate("powerQa.read()");
      assert.equal(stabilized[1].band, "protected", "Stable new power did not update the actual map color");
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(dir, `${width}x${height}.png`), Buffer.from(screenshot.data, "base64"));
      results.push({ width, height, before, after, stabilized });
      console.log(`Verified map colors at ${width}x${height}: unknown, protected, in-range/equal, stronger, authoritative repair and timed refresh.`);
    }
    fs.writeFileSync(path.join(dir, "browser.json"), JSON.stringify(results, null, 2));
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
