"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const directory = path.resolve(__dirname, "../release-artifacts/clan-treasury");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  fs.mkdirSync(directory, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client;
  const errors = [], failedAssets = [], externalRequests = [], records = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Network.responseReceived", event => { if (event.response.status >= 400) failedAssets.push(event.response.url); });
    client.on("Network.requestWillBeSent", event => { if (/^https?:/.test(event.request.url) && !event.request.url.startsWith(address.url + "/")) externalRequests.push(event.request.url); });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); } throw Error("Preview not ready: " + expression); };
    const capture = async name => fs.writeFileSync(path.join(directory, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    const measure = () => evaluate(`(() => {
      const r = dialog.getBoundingClientRect(), b = $("#reviewDonation").getBoundingClientRect(), c = $("#closeTreasury").getBoundingClientRect();
      return { fits: r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
        actionVisible: b.y >= 0 && b.bottom <= innerHeight && b.height >= 44,
        actionHit: $("#reviewDonation").contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)),
        closeVisible: c.y >= 0 && c.bottom <= innerHeight && c.width >= 44,
        overflow: [...document.querySelectorAll(".window-header,.scroll-panel,.donation-footer")].some(n => n.scrollWidth > n.clientWidth + 1) };
    })()`);
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/clan-treasury/preview.html" });
      await wait('document.documentElement?.dataset.treasuryReady === "true" && [...document.images].every(image => image.complete && image.naturalWidth)');
      const layout = await measure();
      assert(layout.fits && layout.actionVisible && layout.actionHit && layout.closeVisible && !layout.overflow, JSON.stringify({ width, layout }));
      await capture(width + "-ready");
      // The daily allowance and rules remain reachable without moving the footer off screen.
      await evaluate('$("#allowanceNote").scrollIntoView({block:"end"});$(".treasury-rules").open=true;$(".treasury-rules p:last-child").scrollIntoView({block:"end"})');
      assert(await evaluate('(() => { const r=$("#allowanceNote").getBoundingClientRect(),p=$(".donation-panel").getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom+1; })()'));
      assert((await measure()).actionVisible);
      await capture(width + "-allowance");
      await evaluate('reset("ready");$("#max").click();$("#reviewDonation").click()');
      assert.equal(await evaluate('$("#confirmAmount").textContent'), "18,000,000");
      assert.equal(await evaluate('$("#confirmPersonal").textContent'), "14,400,000");
      assert(await evaluate('(() => {const r=$("#confirmDonation").getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight&&r.height>=44;})()'), "Confirmation action must fit.");
      await capture(width + "-confirmation");
      await evaluate('$("#cancelDonation").click()');
      assert.equal(await evaluate('model.personal'), 32400000);
      assert(await evaluate('document.activeElement===$("#reviewDonation")'));
      // Slider and precise amount input agree, and one confirmation donates once.
      await evaluate('$("#amountSlider").value="1234567";$("#amountSlider").dispatchEvent(new Event("input"));$("#reviewDonation").click();$("#confirmDonation").click();$("#confirmDonation").click()');
      await wait('!model.pending');
      assert.deepEqual(await evaluate('({personal:model.personal,balance:model.balance,donated:model.donated,total:model.totalDonated})'), { personal: 31165433, balance: 85484567, donated: 7234567, total: 135484567 });
      await capture(width + "-success");
      for (const sample of ["empty", "exhausted", "unavailable"]) {
        await evaluate(`reset(${JSON.stringify(sample)})`);
        assert(await evaluate('$("#amount").disabled && $("#amountSlider").disabled && $("#max").disabled'));
        assert.equal(await evaluate('$("#reviewDonation").disabled'), sample !== "unavailable");
        assert((await measure()).actionVisible);
      }
      await evaluate('$("#reviewDonation").click()');
      assert(!await evaluate('model.unavailable'));
      records.push({ width, height, ...layout, allowanceReachable: true, donationAndConfirmation: true, emptyStates: true });
    }
    // Amount limits apply to both the personal balance and the daily allowance.
    await evaluate('reset("low");$("#max").click()');
    assert.equal(await evaluate('selected()'), 1200000);
    for (const amount of ["", "0", "-1", "1.5", "1200001"]) {
      await evaluate(`$("#amount").value=${JSON.stringify(amount)};$("#amount").dispatchEvent(new Event("input"))`);
      assert(await evaluate('$("#reviewDonation").disabled'), "Invalid donation enabled: " + amount);
    }
    await evaluate('reset("first");$("#reviewDonation").click()');
    assert(await evaluate('$("#confirmAllowance").textContent.includes("first donation locks")'));
    await evaluate('$("#confirmDonation").click()'); await wait('!model.pending');
    assert(await evaluate('model.locked && model.cap===24000000'));
    await evaluate('reset("error");$("#reviewDonation").click();$("#confirmDonation").click()'); await wait('!model.pending');
    assert.equal(await evaluate('model.personal'), 32400000);
    assert(await evaluate('$("#feedback").textContent.includes("No Gold was spent")'));
    await capture("568-failed");
    await evaluate('$("#reviewDonation").click();$("#confirmDonation").click()'); await wait('!model.pending');
    assert.equal(await evaluate('model.personal'), 27900000);
    // Reset and close invalidate simulated replies from a previous example.
    await evaluate('reset("ready");$("#reviewDonation").click();$("#confirmDonation").click();reset("low")');
    await delay(750); assert.equal(await evaluate('model.personal'), 1200000);
    await evaluate('closeTreasury();$("#reopen").click()'); assert(await evaluate('dialog.open'));
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/clan-treasury/index.html?viewport=landscape" });
    await wait('document.getElementById("preview")?.contentDocument?.documentElement?.dataset.treasuryReady === "true"');
    assert.equal(await evaluate('getComputedStyle(document.getElementById("preview")).transform'), "none");
    await evaluate('document.querySelector("[data-viewport=small]").click();document.getElementById("sample").value="first";document.getElementById("sample").dispatchEvent(new Event("change"))');
    await wait('document.getElementById("preview").contentDocument.getElementById("allowanceBadge").textContent==="Allowance preview"');
    assert.equal(await evaluate('document.getElementById("preview").getBoundingClientRect().width'), 568);
    assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []); assert.deepEqual(externalRequests, []);
    fs.writeFileSync(path.join(directory, "checks.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), records, errors, failedAssets, externalRequests }, null, 2));
    console.log(JSON.stringify({ passed: true, viewports: records.length, errors, failedAssets, externalRequests }));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
