"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/labeled-hud-draft");
  fs.mkdirSync(artifacts, { recursive: true });
  let browser, client;
  const errors = [], failed = [], writes = [], records = [];
  try {
    const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "C:/Program Files/Google/Chrome/Application/chrome.exe", require("playwright").chromium.executablePath()].find(p => p && fs.existsSync(p));
    assert(executable, "Chromium is required");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    client.on("Network.responseReceived", e => {
      // The synthetic server has no public /play/ update-probe route; validate
      // the rendered page/assets rather than that unrelated release lookup.
      if (e.response.url.startsWith(address.url) && e.response.status >= 400 && ["Document", "Script", "Image", "Stylesheet"].includes(e.type)) failed.push(e.response.url);
    });
    client.on("Network.requestWillBeSent", e => { if (!["GET", "HEAD"].includes(e.request.method)) writes.push({ method: e.request.method, url: e.request.url }); });
    const ev = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const wait = async expression => { for (let i = 0; i < 600; i++) { if (await ev(expression)) return; await pause(100); } throw Error("Preview did not load: " + JSON.stringify(errors)); };
    const shot = async name => fs.writeFileSync(path.join(artifacts, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/labeled-hud-buttons/preview.html" });
    await wait('document.documentElement.dataset.hudDraftReady === "true"');
    await ev('window.draftGame = document.getElementById("game").contentWindow; void 0');
    const measure = () => ev(`(() => {
      const d = draftGame.document;
      return [...d.querySelectorAll('.profile-action-row > .profile-rank-btn')].map(b => {
        const r = b.getBoundingClientRect(), label = b.querySelector('.hud-draft-label'), l = label.getBoundingClientRect();
        const art = b.querySelector('img') || b.querySelector('.clan-hud-icon'), a = art.getBoundingClientRect();
        return { id:b.id, text:label.textContent, x:r.x, right:r.right, y:r.y, bottom:r.bottom, width:r.width, height:r.height,
          labelFits:l.x >= r.x && l.right <= r.right && l.bottom <= r.bottom && label.scrollWidth <= label.clientWidth,
          imageFits:a.x >= r.x && a.right <= r.right && a.y >= r.y && a.bottom <= l.y + 1,
          hit:b.contains(d.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
          source:b.querySelector('img')?.getAttribute('src'), labelVisible:draftGame.getComputedStyle(label).display !== 'none' };
      });
    })()`);
    const original = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await ev('draftGame.LabeledHudDraft.apply({look:"draft",clan:"amber",badges:true})'); await pause(200);
      const layout = await measure();
      assert.deepEqual(layout.map(x => x.text), ["Leaderboard", "Clan", "Daily", "Inner Castle"]);
      for (const button of layout) {
        assert(button.width >= 44 && button.height >= 44 && button.x >= 0 && button.right <= width, `Touch target: ${width} ${button.id}`);
        assert(button.labelFits && button.imageFits && button.hit && button.labelVisible, `Layout: ${width} ${JSON.stringify(button)}`);
        if (button.source) assert(original.includes(`src="${button.source}"`), "Draft must reuse current HUD art");
      }
      for (let i = 1; i < layout.length; i++) assert(layout[i].x > layout[i - 1].right, "Buttons overlap");
      assert(await ev('draftGame.getComputedStyle(draftGame.document.getElementById("dailyLoginRewardBadge")).display !== "none"'));
      await shot(width + "-draft");
      const amber = await ev('draftGame.document.getElementById("clanHudIcon").innerHTML');
      await ev('draftGame.LabeledHudDraft.apply({look:"draft",clan:"raven",badges:false})');
      const raven = await ev('draftGame.document.getElementById("clanHudIcon").innerHTML');
      assert.notEqual(amber, raven, "Changing clans must change the rendered shield");
      assert.match(await ev('draftGame.document.getElementById("clanHudBtn").getAttribute("aria-label")'), /Raven Guard/);
      assert.equal(await ev('draftGame.getComputedStyle(draftGame.document.getElementById("dailyLoginRewardBadge")).display'), "none");
      await ev('draftGame.LabeledHudDraft.apply({look:"draft",clan:"none",badges:false})');
      assert.equal(await ev('draftGame.document.getElementById("clanHudBtn").getAttribute("aria-label")'), "Find a clan");
      assert((await measure()).every(x => x.labelVisible && x.labelFits && x.imageFits));
      await shot(width + "-no-clan");
      await ev('draftGame.LabeledHudDraft.apply({look:"current",clan:"amber",badges:true})');
      assert((await measure()).every(x => !x.labelVisible)); await shot(width + "-current");
      await ev('draftGame.LabeledHudDraft.apply({look:"draft",clan:"amber",badges:true}); for (const id of ["leaderboardBtn","clanHudBtn","dailyLoginRewardBtn","innerCityHudBtn"]) draftGame.document.getElementById(id).click();');
      assert(await ev('!draftGame.document.getElementById("modal").open'), "Draft buttons must not open real game actions");
      records.push({ width, height, layout, currentComparison:true, clanChanges:true, noClan:true, badges:true, isolatedClicks:true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(writes, [], "The draft must not send account/game writes");
    fs.writeFileSync(path.join(artifacts, "checks.json"), JSON.stringify({ passed:true, records, errors, failed, writes }, null, 2));
    console.log(JSON.stringify({ passed:true, sizes:records.map(x => [x.width,x.height]), sameAssets:true, dynamicClanShield:true, noNetworkWrites:true }));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
