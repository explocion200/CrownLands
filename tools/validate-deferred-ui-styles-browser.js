"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/deferred-ui-styles");
  fs.mkdirSync(artifacts, { recursive: true });
  let browser, client, pausedHelp, rejectShop = true;
  const errors = [], requests = [], records = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
    await client.send("Network.setBlockedURLs", { urls: ["*firestore.googleapis.com*", "*identitytoolkit.googleapis.com*", "*cloudfunctions.net*", "*firebaseio.com*", "*.run.app/*"] });
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Network.requestWillBeSent", event => requests.push(event.request.url));
    client.on("Fetch.requestPaused", event => {
      if (event.request.url.includes("/help-handbook-ui.css")) pausedHelp = event.requestId;
      else void client.send(rejectShop ? "Fetch.failRequest" : "Fetch.continueRequest",
        rejectShop ? { requestId: event.requestId, errorReason: "InternetDisconnected" } : { requestId: event.requestId })
        .catch(error => errors.push(error.message));
    });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async (condition, label) => {
      const started = Date.now();
      while (Date.now() - started < 90000) { if (await condition()) return; await delay(100); }
      throw Error(`Timed out: ${label}`);
    };
    const ready = expression => until(() => evaluate(expression), expression);
    const screenshot = async name => fs.writeFileSync(path.join(artifacts, `${name}.png`),
      Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      requests.length = 0; pausedHelp = null; rejectShop = true;
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
      const deferred = await evaluate('Array.from(document.querySelectorAll("link[data-optional-ui-style]")).map(link => link.href)');
      assert.equal(deferred.length, 9);
      assert.equal(requests.filter(url => deferred.includes(url)).length, 0, "Optional screens must not download their styles at startup");
      await client.send("Fetch.enable", { patterns: [{ urlPattern: "*help-handbook-ui.css*" }, { urlPattern: "*/shop-ui.css*" }] });
      await evaluate("showHelpModal()");
      await until(() => Boolean(pausedHelp), "held Help stylesheet");
      assert(await evaluate('modal.open && !!modalBody.querySelector(".optional-ui-loading")'));
      await evaluate("showInventoryModal()");
      await ready('modal.classList.contains("inventory-modal") && !modalBody.querySelector(".optional-ui-loading")');
      await client.send("Fetch.continueRequest", { requestId: pausedHelp });
      await ready('document.querySelector("link[data-optional-ui-style=help]").dataset.ready === "true"');
      assert(await evaluate('modal.classList.contains("inventory-modal")'), "Late Help loading replaced the Bag");
      await screenshot(`${width}-bag`);
      await evaluate("modal.close();showHelpModal()");
      await ready('modalBody.dataset.helpReady === "true"');
      await evaluate("modal.close();showHelpModal()");
      await delay(100);
      assert(await evaluate('modal.open && modal.classList.contains("help-handbook-modal") && modalBody.dataset.helpReady === "true"'), "A queued close event removed the newly opened Help view");
      await screenshot(`${width}-help`);
      await evaluate("modal.close();showShopModal()");
      await ready('!!modalBody.querySelector(".optional-ui-loading button:not([hidden])")');
      assert(await evaluate('modal.open && modal.classList.contains("shop-modal")'));
      rejectShop = false;
      await evaluate('modalBody.querySelector(".optional-ui-loading button").click()');
      await ready('!!modalBody.querySelector(".rs-shop-shell")');
      await screenshot(`${width}-shop`);
      await evaluate("modal.close()");
      await client.send("Fetch.disable");
      assert(!requests.some(url => /(?:firestore\.googleapis|identitytoolkit\.googleapis|cloudfunctions\.net|firebaseio\.com|\.run\.app)/i.test(url)), "Synthetic UI checks attempted a production backend request");
      records.push({ width, height, initialDeferredRequests: 0, staleLoadIgnored: true, failedLoadRetry: true });
      console.log(`Deferred screens ${width}x${height}: lazy requests, safe handoff, close/reopen and retry passed.`);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, "validation.json"), JSON.stringify({ records, errors }, null, 2));
    console.log("Deferred styles browser passed: no startup requests, safe screen handoff, offline-load retry, and three desktop/landscape layouts.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { await waitForProcessExit(browser.browserProcess); await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
