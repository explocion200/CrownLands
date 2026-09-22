"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const artifacts = path.resolve(__dirname, "../release-artifacts/incoming-threats");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [], failedResources = [], checks = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Network.responseReceived", event => { if (event.response.status >= 400) failedResources.push(event.response.url); });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw Error("Timed out waiting for " + expression);
    };
    const screenshot = async name => {
      const result = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, name + ".png"), Buffer.from(result.data, "base64"));
    };
    for (const [width, height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const sample of ["standard","many","pending","long","scouts","empty"]) {
        await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/incoming-threats/preview.html?sample=" + sample });
        await ready('!!document.querySelector("#threatDialog[open]")');
        await evaluate("document.fonts.ready");
        await delay(80);
        const metrics = await evaluate(`(() => {
          const list=document.getElementById("threatList"),dialog=document.getElementById("threatDialog"),r=dialog.getBoundingClientRect();
          return {pageOverflow:document.documentElement.scrollWidth>innerWidth,listOverflow:list.scrollWidth>list.clientWidth+1,dialogFits:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,count:document.querySelectorAll(".threat-row").length,buttons:[...document.querySelectorAll(".locate")].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})),scrolls:list.scrollHeight>list.clientHeight};
        })()`);
        assert(metrics.dialogFits && !metrics.pageOverflow && !metrics.listOverflow, JSON.stringify({width,sample,...metrics}));
        assert(metrics.buttons.every(button=>button.width>=44 && button.height>=44), "Touch targets: " + width + sample);
        if (sample === "many") {
          assert.equal(metrics.count,18);
          assert(metrics.scrolls, "Crowded list must scroll");
          await evaluate('document.querySelector(".threat-row:last-child .locate").scrollIntoView({block:"center"})');
          const hit = await evaluate(`(() => {const b=document.querySelector(".threat-row:last-child .locate"),r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,hit:b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};})()`);
          assert(hit.hit, "Last location button reachable");
          await client.send("Input.dispatchMouseEvent", {type:"mousePressed",x:hit.x,y:hit.y,button:"left",buttons:1,clickCount:1});
          await client.send("Input.dispatchMouseEvent", {type:"mouseReleased",x:hit.x,y:hit.y,button:"left",buttons:0,clickCount:1});
          assert(await evaluate('document.querySelector("#panelStatus").textContent.includes("Location preview:")'));
        }
        if (sample === "pending") {
          assert.equal(await evaluate('document.querySelectorAll(".pending-note").length'),2);
          assert.equal(await evaluate('document.querySelector(".force.unknown strong").textContent'),"Unknown");
          assert.equal(await evaluate('!!document.querySelector(".threat-row:first-child .city .city-stats")'),false);
        }
        if (sample === "standard") {
          assert.equal(metrics.count,5);
          await evaluate('document.querySelector("[data-filter=scout]").click()');
          assert.equal(await evaluate('document.querySelectorAll(".threat-row").length'),1);
          await evaluate('document.querySelector("[data-filter=attack]").click()');
          assert.equal(await evaluate('document.querySelectorAll(".threat-row").length'),4);
          assert.equal(await evaluate('document.querySelectorAll(".threat-row.legion").length'),1);
          await evaluate('document.querySelector("[data-filter=all]").click();document.querySelector(".profile").click()');
          assert(await evaluate('document.querySelector("#panelStatus").textContent.includes("Lord Aldric")'));
          await evaluate('document.querySelector("#close").click()');
          assert.equal(await evaluate('document.querySelector("#threatDialog").open'),false);
          await evaluate('document.querySelector("#reopen").click()');
          assert.equal(await evaluate('document.querySelector("#threatDialog").open'),true);
        }
        if (sample === "scouts") {
          await evaluate('document.querySelector("[data-filter=attack]").click()');
          assert.equal(await evaluate('document.querySelectorAll(".threat-row").length'),0);
          await evaluate('document.querySelector("[data-empty-action=all]").click()');
          assert.equal(await evaluate('document.querySelectorAll(".threat-row").length'),2);
        }
        if (sample === "empty") assert.equal(metrics.count,0);
        await screenshot(sample + "-" + width);
        checks.push({width,height,sample,...metrics});
      }
    }
    // Verify the review wrapper's viewport and sample controls update its actual iframe.
    await client.send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await client.send("Page.navigate", {url:address.url+"/docs/visual-qa/incoming-threats/index.html?viewport=landscape&sample=standard"});
    await ready('document.querySelector("#preview")?.contentDocument?.querySelectorAll(".threat-row").length===5 && document.getElementById("preview").style.width === "844px"');
    assert.equal(await evaluate('document.getElementById("preview").style.width'),"844px");
    await evaluate('document.querySelector("[data-viewport=small]").click();const s=document.getElementById("sample");s.value="many";s.dispatchEvent(new Event("change"));');
    await ready('document.getElementById("preview").contentDocument.querySelectorAll(".threat-row").length===18');
    assert.equal(await evaluate('document.getElementById("preview").style.width'),"568px");
    assert.deepEqual(errors,[]);
    assert.deepEqual(failedResources,[]);
    fs.writeFileSync(path.join(artifacts,"checks.json"),JSON.stringify({checks,errors,failedResources,reviewControls:"passed"},null,2));
    console.log("Incoming Threats draft passed: 18 size/state combinations, filters, exact unknown states, last-row location, profiles, close/reopen, review controls, no overflow or failed resources.");
  } finally {
    if (client) { await client.send("Browser.close").catch(()=>{}); client.close(); }
    if (session) {
      if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); }
      await removeBrowserProfile(session.profilePath);
    }
    await server.close();
  }
}
if (require.main === module) main().catch(error=>{console.error(error.stack || error);process.exitCode=1;});
module.exports = {run:main};
