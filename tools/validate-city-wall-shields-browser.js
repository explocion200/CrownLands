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
  const dir = path.resolve(__dirname, "../release-artifacts/city-wall-shields"); fs.mkdirSync(dir, { recursive: true });
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
      for (let i = 0; i < 160 && await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status") !== "ready"; i++) await wait(100);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__.getStatus().status"), "ready");
      const before = await evaluate(`(() => {
        modal.close(); selectedTargetId=null; selectedSourceId=null; sendMode=false;
        window.wallQa={now:Date.now()}; const qa=wallQa;
        if(formatWallIntegrity(9999)!=='99.9%'||formatWallIntegrity(10000)!=='100%')throw Error('Wall labels must distinguish partial and full repair');
        qa.cities=[...cityLayer.querySelectorAll('.city-node.enemy')].map(n=>cityById(n.dataset.cityId)).filter(c=>!isStronghold(c)).slice(0,4);
        if(qa.cities.length!==4)throw Error('Need four visible regular cities');
        zoom=1; applyCameraTransform();
        state.itemEffects.shieldExpiresAtMs=qa.now+60000;
        qa.cities.forEach((c,i)=>{Object.assign(c,screenToWorld(innerWidth*(.2+i*.2),innerHeight*.58));
          c.name=['Full walls','Repairing','Owned full','Owned repair'][i];
          c.owner=i<2?'enemy':'player'; c.ownerKind='player'; c.ownerUid=i<2?'wall-rival':getCurrentOnlineUid();
          c.ownerShieldExpiresAtMs=qa.now+60000;
          c.fortificationState=i%2?{version:1,integrityBps:5000,lastDamagedAtMs:qa.now,repairAtMs:qa.now+4000}:null;});
        qa.read=()=>qa.cities.map(c=>{const n=cityLayer.querySelector('[data-city-id="'+c.id+'"]');return {id:c.id,shield:n.classList.contains('peace-shielded'),blocked:!!getPeaceShieldAttackBlockReason(c,'enemy','other-ruler')};});
        renderCities(true); return qa.read();
      })()`);
      assert.deepEqual(before.map(r => r.shield), [true,false,true,false]);
      assert.deepEqual(before.map(r => r.blocked), [true,false,true,false]);
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(dir, `${width}x${height}-repairing.png`), Buffer.from(shot.data, "base64"));
      // Let the normal rendering loop notice elapsed repair; no snapshot, reload or forced render.
      await wait(5500);
      const repaired = await evaluate("wallQa.read()");
      assert(repaired.every(r => r.shield && r.blocked), "Automatic wall completion did not update map and attack controls: " + JSON.stringify(repaired));
      const after = await evaluate(`(() => {
        const qa=wallQa;qa.cities[0].ownerShieldExpiresAtMs=Date.now()-1;
        qa.cities[1].ownerUid='new-ruler';qa.cities[1].ownerShieldExpiresAtMs=0;
        state.itemEffects.shieldExpiresAtMs=Date.now()-1;
        renderCities();return qa.read();
      })()`);
      assert(after.every(r => !r.shield && !r.blocked), "Expired or previous-owner shield still shown");
      for (const [level, expected, troopsPerHour] of [[1,200,162],[25,25000,3514],[26,27412,3677],
        [50,250000,8097],[51,264255,8286],[75,1000000,13315],[76,1044924,13545],
        [100,3000000,19034],[101,3030867,19264],[150,6200000,31606],[200,11340888,45436]]) {
        const detail = await evaluate(`(() => {
          const city=wallQa.cities[2];city.level=${level};
          showCityInfoModal(city.id);
          modalBody.querySelector('[data-cd-value="walls"]').scrollIntoView({block:'center',behavior:'instant'});
          return {base:getCityStats(city).baseCityWalls,expectedLabel:formatNumber(${expected}),
            text:modalBody.querySelector('[data-cd-value="walls"]').textContent.replace(/,/g,''),
            troopsPerHour:getCityStats(city).baseTroopProductionPerHour,
            expectedProductionLabel:formatNumber(${troopsPerHour})+'/h',
            productionText:modalBody.querySelector('[data-cd-value="production"]').textContent.replace(/,/g,''),
            overflow:modal.scrollWidth>modal.clientWidth+1};
        })()`);
        assert.equal(detail.base, expected);
        assert(detail.text.startsWith(detail.expectedLabel + ' '), JSON.stringify(detail));
        assert.equal(detail.troopsPerHour, troopsPerHour);
        assert(detail.productionText.startsWith(detail.expectedProductionLabel + ' '), JSON.stringify(detail));
        assert(!detail.overflow, "Wall or production value overflowed City Info");
      }
      await wait(250);
      const detailsShot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(dir, `${width}x${height}-city-walls.png`), Buffer.from(detailsShot.data, "base64"));
      for (const expired of [false, true]) {
        const detail = await evaluate(`(() => {
          const expiresAtMs=Date.now()+(${expired} ? -1000 : 86400000);
          applyServerProfilePatch({troopProduction25Exclusion:{startsAtMs:expiresAtMs-1728000000,expiresAtMs}});
          const city=wallQa.cities[2];city.level=100;showCityInfoModal(city.id);
          return {rate:getCityStats(city).baseTroopProductionPerHour,reward:getLevelUpTroopReward(100),
            walls:getCityStats(city).baseCityWalls,label:modalBody.querySelector('[data-cd-value="production"]').textContent,
            expected:formatNumber(${expired ? 19034 : 15227})+'/h',overflow:modal.scrollWidth>modal.clientWidth+1};
        })()`);
        assert.equal(detail.rate, expired ? 19034 : 15227);
        assert.equal(detail.reward, (expired ? 19034 : 15227) * 54);
        assert.equal(detail.walls, 3000000);
        assert(detail.label.startsWith(detail.expected), JSON.stringify(detail));
        assert(!detail.overflow);
      }
      await evaluate("state.troopProduction25Exclusion=null");
      await evaluate("modal.close()");
      results.push({ width, height, before, repaired, after });
      console.log(`City wall shields browser passed at ${width}x${height}: production and wall values, own/rival cities, automatic repair, attack feedback, expiry and ownership.`);
    }
    fs.writeFileSync(path.join(dir, "browser.json"), JSON.stringify(results, null, 2));
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
