"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium is required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/balance-guide");
  fs.mkdirSync(artifacts, { recursive: true });
  let session, client;
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("Network.enable")]);
    await client.send("Network.setBlockedURLs", { urls: ["*googleapis.com*", "*cloudfunctions.net*", "*firebaseio.com*"] });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: address.url + "/battle-economy-guide.html" });
      let ready = false;
      for (let attempt = 0; attempt < 100 && !ready; attempt++) {
        ready = await evaluate("Boolean(document.getElementById('cityTroopHelp')?.textContent.includes('Base 13,315/h'))");
        if (!ready) await wait(50);
      }
      assert(ready, "The guide did not load the new production curve");
      for (const [level, wall] of [[1,200],[2,600],[25,25000],[26,27412],[50,250000],
        [51,264255],[75,1000000],[76,1044924],[100,3000000],[101,3030867],[150,6200000]]) {
        const text = await evaluate(`(() => { const input=document.getElementById('cityLevelNumber');input.value=${level};input.dispatchEvent(new Event('input',{bubbles:true}));return document.getElementById('cityWallHelp').textContent; })()`);
        assert(text.includes(`Base ${wall.toLocaleString("en-US")}`), `Wall at ${level}: ${text}`);
      }
      for (const [level, expected] of [[1, 162], [25, 3514], [50, 8097], [75, 13315], [100, 19034], [150, 31606], [200, 45436]]) {
        const text = await evaluate(`(() => { const input=document.getElementById('cityLevelNumber');input.value=${level};input.dispatchEvent(new Event('input',{bubbles:true}));return document.getElementById('cityTroopHelp').textContent; })()`);
        assert(text.includes(`Base ${expected.toLocaleString("en-US")}/h`), `${level}: ${text}`);
      }
      const table = await evaluate(`(() => {
        const table=document.querySelector('#special-rules table');
        scrollTo({top:table.getBoundingClientRect().top+scrollY-125,behavior:'instant'});
        return {rows:[...table.tBodies[0].rows].map(row=>[...row.cells].map(cell=>cell.textContent)),
          overflow:document.documentElement.scrollWidth>innerWidth+1 || table.scrollWidth>table.parentElement.clientWidth+1,
          cells:[...table.querySelectorAll('th,td')].every(cell=>cell.getBoundingClientRect().height>0)};
      })()`);
      assert.deepEqual(table.rows, [["1M or less", "3×", "4×"], ["10M", "2.75×", "3.5×"],
        ["100M", "2.5×", "3×"], ["1B and above", "2×", "2.5×"]]);
      assert(!table.overflow && table.cells, "Protection table creates page overflow or hidden cells");
      await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, `${width}x${height}.png`), Buffer.from(screenshot.data, "base64"));
      console.log(`Verified balance guide at ${width}x${height}: production inputs, all protection anchors and contained layout.`);
    }
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
