"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const chrome = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(chrome, "Set CHROME_PATH");
  const server = createMapBenchmarkServer(), address = await server.listen(), errors = [];
  const directory = path.resolve("release-artifacts/beginner-xp"); fs.mkdirSync(directory, { recursive: true });
  let browser, client;
  try {
    browser = await startBrowserSession(chrome);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => { const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    for (let i = 0; i < 240 && !await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"); i++) await delay(250);
    assert(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"));
    await evaluate(`(() => {
      window.__CROWNLANDS_BENCHMARK__.closeModal(); pendingOfflineRewardsSummary=null;
      window.xpFixture={source:state.cities.find(city=>city.owner==='player'),target:state.cities.find(city=>city.owner==='neutral')};
      Object.assign(xpFixture.source,{troops:1000000,troopFloat:1000000});
      Object.assign(xpFixture.target,{level:1,troops:0,troopFloat:0,isMainCity:false,ownerUid:null,ownerKind:'neutral',owner:'neutral',ownerShieldExpiresAtMs:0,relinquishedAtMs:0,relocatedAtMs:0});
      state.upgrades={}; selectedMarchPercent=.5;
      // Synthetic benchmark markers are independent of the map's real roads.
      findRoute=(from,to)=>({length:300,points:[{x:from.x,y:from.y},{x:to.x,y:to.y}]});
    })()`);
    const results = [];
    for (const [width, height] of [[1440,900],[844,390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const level of [1,10,14,15]) {
        const result = await evaluate(`(() => {
          if(modal.open)modal.close();state.character={level:${level},xp:0,skillPoints:${level}-1};
          const preview=calculateBattlePreview(xpFixture.source,xpFixture.target,.5);
          showAttackPreview(xpFixture.source,xpFixture.target);
          const card=[...modalBody.querySelectorAll('.stat-card')].find(card=>card.querySelector('small')?.textContent==='capture XP');
          card?.scrollIntoView({block:'center'});
          const r=card?.getBoundingClientRect(),d=modal.getBoundingClientRect();
          return {level:${level},award:preview.captureXp,bonus:preview.beginnerCaptureBonus,success:preview.success,text:card?.innerText,heading:modalBody.querySelector('.battle-result')?.innerText,open:modal.open,
            inside:!!r&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
            dialogInside:d.left>=0&&d.top>=0&&d.right<=innerWidth+1&&d.bottom<=innerHeight+1};
        })()`);
        assert(result.open && result.success && result.inside && result.dialogInside, JSON.stringify(result));
        if (level < 15) { assert.equal(result.award, {1:125,10:2364,14:4444}[level]); assert(result.bonus); assert.match(result.heading,/Beginner XP bonus/); }
        else { assert.equal(result.bonus,false); assert(result.award<100); }
        results.push({width,height,...result});
        if(level===14){await delay(300);const screenshot=await client.send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(directory,`capture-${width}x${height}.png`),Buffer.from(screenshot.data,"base64"));}
      }
      const failed=await evaluate(`(() => {state.character={level:10,xp:0};const preview=calculateBattlePreviewForTroops(xpFixture.source,xpFixture.target,1);return {success:preview.success,award:preview.captureXp,bonus:preview.beginnerCaptureBonus};})()`);
      assert(!failed.success && !failed.bonus && failed.award < 100);
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(directory,"browser-results.json"),JSON.stringify(results,null,2));
    console.log("Beginner capture browser passed: actual previews, XP values, bonus/normal/defeat labels and readable desktop/landscape dialogs.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){await waitForProcessExit(browser.browserProcess);await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
