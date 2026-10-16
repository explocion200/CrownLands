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
    let executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(p => p && fs.existsSync(p));
    // CI supplies Chrome directly; the local optional fallback must be lazy.
    if (!executable) { try { const candidate = require("playwright").chromium.executablePath(); if (fs.existsSync(candidate)) executable = candidate; } catch (_) {} }
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
        const r = b.getBoundingClientRect(), art = b.querySelector('.hud-draft-image'), a = art.getBoundingClientRect();
        const shield = b.querySelector('.clan-hud-icon > :is(.clan-shield-size-small, .clan-heraldry-size-small)')?.getBoundingClientRect();
        return { id:b.id, text:b.dataset.draftLabel, x:r.x, right:r.right, y:r.y, bottom:r.bottom, width:r.width, height:r.height,
          clanRibbonClear:b.id !== 'clanHudBtn' || !!shield && shield.x >= r.x && shield.right <= r.right && shield.y >= r.y && shield.bottom <= r.y + r.height * 0.75,
          imageFits:a.x >= r.x && a.right <= r.right && a.y >= r.y && a.bottom <= r.bottom,
          decoded:art.complete && art.naturalWidth > 100, separateText:!!b.querySelector('.hud-draft-label'),
          transparent:draftGame.getComputedStyle(b).backgroundColor === 'rgba(0, 0, 0, 0)' && draftGame.getComputedStyle(b).backgroundImage === 'none',
          hit:b.contains(d.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
          source:art.getAttribute('src'), imageVisible:draftGame.getComputedStyle(art).display !== 'none' };
      });
    })()`);
    const original = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
    assert(!original.includes("labeled-hud-buttons"), "Draft must not enter the game entry");
    const geometry = rows => rows.map(({id,x,right,y,bottom,width,height}) => ({id,x,right,y,bottom,width,height}));
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await ev('draftGame.LabeledHudDraft.apply({look:"current",clan:"amber",badges:true})'); await pause(200);
      const baseline = await measure();
      await ev('draftGame.LabeledHudDraft.apply({look:"draft",clan:"amber",badges:true})'); await pause(200);
      const layout = await measure();
      assert.deepEqual(geometry(layout), geometry(baseline), "Original button positions, dimensions and spacing must remain identical");
      assert.deepEqual(layout.map(x => x.text), ["Leaderboard", "Clan", "Daily", "Inner Castle"]);
      for (const button of layout) {
        assert(button.width >= 44 && button.height >= 44 && button.x >= 0 && button.right <= width, `Touch target: ${width} ${button.id}`);
        assert(button.imageFits && button.hit && button.imageVisible && button.decoded && button.transparent && button.clanRibbonClear && !button.separateText, `Layout: ${width} ${JSON.stringify(button)}`);
        assert.match(button.source, /labeled-hud-buttons\/images\/[a-z-]+-button\.png$/);
        const png = fs.readFileSync(path.resolve(__dirname, "..", button.source.slice(1)));
        assert.equal(png.subarray(1, 4).toString(), "PNG");
        assert.equal(png[25], 6, "Image buttons must retain RGBA transparency");
      }
      for (let i = 1; i < layout.length; i++) assert(layout[i].x > layout[i - 1].right, "Buttons overlap");
      assert(await ev('draftGame.getComputedStyle(draftGame.document.getElementById("dailyLoginRewardBadge")).display !== "none"'));
      await shot(width + "-draft");
      const amber = await ev('draftGame.document.getElementById("clanHudIcon").innerHTML');
      await ev('draftGame.LabeledHudDraft.apply({look:"draft",clan:"raven",badges:false})');
      const raven = await ev('draftGame.document.getElementById("clanHudIcon").innerHTML');
      assert.notEqual(amber, raven, "Changing clans must change the rendered shield");
      assert((await measure()).every(x => x.clanRibbonClear), "Changed clan shield must leave the Clan ribbon visible");
      assert.match(await ev('draftGame.document.getElementById("clanHudBtn").getAttribute("aria-label")'), /Raven Guard/);
      assert.equal(await ev('draftGame.getComputedStyle(draftGame.document.getElementById("dailyLoginRewardBadge")).display'), "none");
      await ev('draftGame.LabeledHudDraft.apply({look:"draft",clan:"none",badges:false})');
      assert.equal(await ev('draftGame.document.getElementById("clanHudBtn").getAttribute("aria-label")'), "Find a clan");
      assert((await measure()).every(x => x.imageVisible && x.imageFits && x.clanRibbonClear && !x.separateText));
      await shot(width + "-no-clan");
      await ev('draftGame.LabeledHudDraft.apply({look:"current",clan:"amber",badges:true})');
      assert((await measure()).every(x => !x.imageVisible)); await shot(width + "-current");
      await ev('draftGame.LabeledHudDraft.apply({look:"draft",clan:"amber",badges:true}); for (const id of ["leaderboardBtn","clanHudBtn","dailyLoginRewardBtn","innerCityHudBtn"]) draftGame.document.getElementById(id).click();');
      assert(await ev('!draftGame.document.getElementById("modal").open'), "Draft buttons must not open real game actions");
      records.push({ width, height, layout, baseline, originalGeometry:true, currentComparison:true, clanChanges:true, noClan:true, badges:true, isolatedClicks:true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(writes, [], "The draft must not send account/game writes");
    fs.writeFileSync(path.join(artifacts, "checks.json"), JSON.stringify({ passed:true, records, errors, failed, writes }, null, 2));
    console.log(JSON.stringify({ passed:true, sizes:records.map(x => [x.width,x.height]), originalGeometry:true, rasterLabels:true, dynamicClanShield:true, noNetworkWrites:true }));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
