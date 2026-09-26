"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const directory = path.resolve(__dirname, "../release-artifacts/troop-selection");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(directory, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  const errors = [], failedAssets = [], externalRequests = [], results = [];
  let browser, client;
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
    const wait = async expression => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error("Preview not ready: " + JSON.stringify(errors));
    };
    const capture = async name => fs.writeFileSync(path.join(directory, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    const enter = async value => evaluate(`document.getElementById("exactAmount").focus();document.getElementById("exactAmount").value=${JSON.stringify(value)};document.getElementById("exactAmount").dispatchEvent(new Event("input",{bubbles:true}));`);
    const measure = () => evaluate(`(() => {
      const d=dialog.getBoundingClientRect(), f=confirm.getBoundingClientRect(), c=document.getElementById("close").getBoundingClientRect();
      return {fits:d.x>=0&&d.y>=0&&d.right<=innerWidth+1&&d.bottom<=innerHeight+1,footer:f.bottom<=innerHeight&&f.height>=44,close:c.top>=0&&c.bottom<=innerHeight,
        overflow:body.scrollWidth>body.clientWidth+1||document.querySelector(".window-header").scrollWidth>document.querySelector(".window-header").clientWidth+1,
        controls:[...document.querySelectorAll("[data-fraction],#exactAmount")].every(n=>n.getBoundingClientRect().height>=44)};
    })()`);
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/troop-selection/preview.html" });
      await wait('document.documentElement?.dataset.selectionReady==="true"&&[...document.images].every(image=>image.complete&&image.naturalWidth)');
      for (const sample of ["attack", "transfer", "reinforce", "limited", "unknown", "long", "one", "calculating", "error"]) {
        await evaluate(`setSample(${JSON.stringify(sample)})`);
        const layout = await measure();
        assert(layout.fits && layout.footer && layout.close && !layout.overflow && layout.controls, JSON.stringify({ width, sample, layout }));
        for (const fraction of [0.25, 0.5, 1]) {
          await evaluate(`document.querySelector('[data-fraction="${fraction}"]').click()`);
          assert(await evaluate(`amount===Math.max(1,Math.floor(permittedMaximum()*${fraction}))`));
          assert(await evaluate('document.getElementById("remainingValue").textContent===num(current.troops-amount)'));
        }
        if (["calculating", "error"].includes(sample)) assert(await evaluate("confirm.disabled"));
        await evaluate(`setSample(${JSON.stringify(sample)})`);
        if (["attack", "transfer", "reinforce", "limited", "long"].includes(sample)) await capture(`${width}-${sample}`);
      }
      await evaluate('setSample("attack")');
      await enter("123456");
      assert(await evaluate('amount===123456&&!confirm.disabled&&document.getElementById("troopRange").value==="123456"'));
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      assert.equal(await evaluate('document.getElementById("exactAmount").value'), "123,456");
      assert(!(await evaluate('document.getElementById("actionNotice").textContent.includes("Order previewed")')));
      await enter("4321");
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      assert(await evaluate("amount===123456&&dialog.open"));
      for (const invalid of ["", "0", "-10", "1.5", "1e3", "12,34", "1250001", "abc"]) {
        await enter(invalid);
        assert(await evaluate('confirm.disabled&&!document.getElementById("amountError").hidden&&amount===123456'));
      }
      await capture(`${width}-invalid`);
      await evaluate('document.getElementById("exactAmount").blur();document.querySelector(\'[data-fraction="0.5"]\').click()');
      assert(await evaluate('amount===625000&&!confirm.disabled&&document.getElementById("exactAmount").value==="625,000"'));
      await enter("125,000");
      assert(await evaluate("amount===125000&&!confirm.disabled"));
      await evaluate('document.getElementById("exactAmount").blur();document.getElementById("troopRange").value="42";document.getElementById("troopRange").dispatchEvent(new Event("input"));confirm.click()');
      assert(await evaluate('amount===42&&document.getElementById("exactAmount").value==="42"&&document.getElementById("liveStatus").textContent.includes("Draft only:")'));
      await evaluate('setSample("limited")'); await enter("350001");
      assert(await evaluate("confirm.disabled&&amount===175000"));
      await evaluate('setSample("error");document.getElementById("retryRoute").click()');
      assert(await evaluate("!confirm.disabled&&current.route===\"ready\""));
      await evaluate('setSample("protected")'); assert(await evaluate("confirm.hidden"));
      results.push({ width, height, passed: true });
    }
    await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/troop-selection/index.html?viewport=landscape&sample=transfer" });
    await wait('document.getElementById("preview")?.contentDocument?.documentElement.dataset.selectionReady==="true"');
    await evaluate('document.querySelector(\'[data-viewport="small"]\').click();document.getElementById("sample").value="limited";document.getElementById("sample").dispatchEvent(new Event("change"))');
    await wait('document.getElementById("preview").contentDocument.getElementById("reportDialog").dataset.sample==="limited"');
    assert.equal(await evaluate('document.getElementById("preview").style.width'), "568px");
    assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []); assert.deepEqual(externalRequests, []);
    fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify({ results, errors, failedAssets, externalRequests }, null, 2));
    console.log("Troop selection draft: desktop, two landscape sizes, presets, limits, exact entry, recovery and review controls passed.");
  } finally {
    if (client) { try { await client.send("Browser.close"); } catch {} client.close(); }
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
      await removeBrowserProfile(browser.profilePath);
    }
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
