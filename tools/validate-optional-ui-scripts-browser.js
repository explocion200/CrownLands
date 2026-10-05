"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const {CdpClient} = require("./map-benchmark/cdp-client");
const {createMapBenchmarkServer} = require("./map-benchmark/server");
const {startBrowserSession, waitForProcessExit, removeBrowserProfile} = require("./validate-focused-browser-smoke");
const dailyModel = require("../functions/dailyLoginRewards");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable);
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/runtime-cleanup"); fs.mkdirSync(artifacts, {recursive: true});
  let browser, client; const errors = [], results = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const ev = async expression => {
      const result = await client.send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {for (let i = 0; i < 400; i++) {if (await ev(expression)) return; await delay(100);} throw Error(expression + " " + errors.join("\n"));};
    const close = () => ev("new Promise(resolve => { if (!modal.open) return resolve(); modal.addEventListener('close', resolve, {once:true}); modal.close(); })");
    for (const [width, height] of [[1440, 900], [844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: height < 600});
      await client.send("Page.navigate", {url: address.url + "/__benchmark__/?scenario=A&visualMarches=0"});
      await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
      await close();
      const startup = await ev(`(() => {
        const deferred = [...document.querySelectorAll('[data-optional-ui-script]')].map(entry => new URL(entry.dataset.src, document.baseURI).href);
        const styles = [...document.querySelectorAll('link[data-optional-ui-style]')].map(entry => entry.href);
        return {deferred:deferred.length, styles:styles.length, downloaded:performance.getEntriesByType('resource').filter(entry => [...deferred,...styles].includes(entry.name)).map(entry => entry.name)};
      })()`);
      assert.equal(startup.deferred, 17); assert.deepEqual(startup.downloaded, []);
      assert.equal(startup.styles, 17, "All optional screen styles must remain deferred at startup");
      const dailyStatus = dailyModel.status(dailyModel.sync({}).state);
      await ev(`dailyLoginRewardStatus=normalizeDailyLoginRewardStatus(${JSON.stringify(dailyStatus)});dailyLoginRewardStatusLoading=false;dailyLoginRewardClaimInFlight=false`);
      const screens = [
        ["help", "showHelpModal()", "Boolean(window.CrownlandsHelpHandbookUi)"],
        ["bag", "showInventoryModal()", "typeof renderItemBagPanel === 'function'"],
        ...["treasury", "barracks", "gatehouse", "royal-stables"].map(id => [id, `showCommonGearBuilding(${JSON.stringify(id)}); if (!modal.open) modal.showModal()`, "Boolean(modalBody.querySelector('[data-gear-back]'))"]),
        ...["quests", "achievements", "rewards"].map(id => [id,
          `modal.className='modal daily-login-reward-modal'; modal.showModal(); activeDailyRewardModalTab=${JSON.stringify(id)}; renderDailyLoginRewardModal()`,
          `Boolean(window.${id === "quests" ? "CrownlandsQuestsUI" : id === "achievements" ? "CrownlandsAchievementsUI" : "CrownlandsDailyLoginUI"})`]),
        ["battle-report", "state.battleReports=[{id:'qa-battle',type:'attack',outcome:'victory',cityId:state.cities[0].id,cityName:'Test battle',cityLevel:1,createdAtMs:Date.now(),sentTroops:100,troopCount:80,summary:'Victory'}];showBattleReportDetail('qa-battle')", "Boolean(modalBody.querySelector('.report-shell'))"],
      ];
      for (const [name, open, loaded] of screens) {
        const retryStyles = name === "quests" && width === 1440;
        if (retryStyles) await client.send("Network.setBlockedURLs", {urls:["*quests-ui.css*"]});
        await ev(open);
        if (retryStyles) {
          await ready("Boolean(modalBody.querySelector('.optional-ui-loading button:not([hidden])'))");
          await client.send("Network.setBlockedURLs", {urls:[]});
          await ev("modalBody.querySelector('.optional-ui-loading button').click()");
        }
        await ready(`modal.open && (${loaded}) && !modalBody.querySelector('.optional-ui-loading')`);
        const style = ["treasury", "barracks", "gatehouse", "royal-stables"].includes(name) ? name + "-gear" : name === "rewards" ? "daily-login" : name;
        assert(await ev(`(() => {const link=document.querySelector('link[data-optional-ui-style="${style}"]');return link?.dataset.ready==='true' && Boolean(link.sheet)})()`), name + " rendered before its stylesheet loaded");
        await ev("Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getTiming().iterations)).map(animation => animation.finished.catch(() => {})))");
        const bounds = await ev("(() => {const r=modal.getBoundingClientRect();return {fits:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:modal.scrollWidth>modal.clientWidth+1};})()");
        assert(bounds.fits && !bounds.overflow, JSON.stringify({width, name, bounds}));
        results.push({width, height, name, passed: true});
        if (["quests", "help", "treasury", "rewards"].includes(name)) fs.writeFileSync(path.join(artifacts, `${width}-${name}.png`), Buffer.from((await client.send("Page.captureScreenshot", {format: "png"})).data, "base64"));
        await close();
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, "optional-screens.json"), JSON.stringify({results, errors}, null, 2));
    console.log("Optional screens passed: no deferred scripts downloaded at startup; Help, Bag, four gear screens, Quests, Achievements and Daily Login open on desktop and landscape mobile without errors.");
  } finally {
    if (client) {await client.send("Browser.close").catch(() => {}); client.close();}
    if (browser) {await waitForProcessExit(browser.browserProcess); await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
