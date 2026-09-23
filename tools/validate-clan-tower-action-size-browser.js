"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const directory = path.resolve(__dirname, "../release-artifacts/clan-tower-action-size");
fs.mkdirSync(directory, { recursive: true });
(async () => {
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client;
  const errors = [], records = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error("Preview not ready: " + expression + " " + JSON.stringify(errors));
    };
    const capture = async name => fs.writeFileSync(path.join(directory, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    const game = code => evaluate(`document.getElementById("game").contentWindow.eval(${JSON.stringify(code)})`);
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/clan-tower-action-size/preview.html?sample=rival" });
      await wait('document.documentElement?.dataset.actionSizeReady === "true"');
      await wait('(()=>{const d=document.getElementById("game").contentDocument;return [...d.querySelectorAll(".holding-tower-building-node>img,.holding-tower-art")].filter(image=>{const r=image.getBoundingClientRect();return r.bottom>0&&r.top<d.defaultView.innerHeight&&r.width>0&&r.height>0;}).every(image=>image.complete&&image.naturalWidth>0);})()');
      await wait('!document.getElementById("game").contentDocument.querySelector("#toast.visible")');
      for (const size of [56, 64, 72]) {
        for (const percent of [40, 70, 100]) {
          await game(`CrownlandsActionSizeReview.set({size:${size},zoom:${percent}})`);
          const result = await game(`(() => {
            const measurement = CrownlandsActionSizeReview.measure();
            const frame = document.getElementById("mapFrame") || document.querySelector(".map-frame");
            const buildings = [...document.querySelectorAll(".holding-tower-building-node,.ctb-map-label")];
            const bottom = Math.max(...buildings.map(node => node.getBoundingClientRect().bottom));
            return {...measurement, clearance: measurement.buttons[0].y-bottom,
              hit: measurement.buttons.every(button => document.querySelector('[data-clan-tower-map-action="'+button.id+'"]').contains(document.elementFromPoint(button.x+button.width/2,button.y+button.height/2))),
              towerWidth:document.querySelector(".holding-tower-node").getBoundingClientRect().width,
              frameWidth:frame.getBoundingClientRect().width};
          })()`);
          assert.deepEqual(result.buttons.map(button => button.id), ["scout", "info", "rally-attack"]);
          assert(Math.abs(result.zoom - Math.max(percent / 100, result.minimumZoom)) < .001, "Requested map zoom was not applied within the game's bounds");
          assert(result.hit, `A control is obscured at ${width} × ${height}, ${size}px, ${percent}%`);
          assert(Math.abs(result.clearance - 8) < .2, "Keep 8px clearance beneath building labels");
          assert(Math.abs(result.frameWidth - width) < 1, "Preview is not at native viewport width");
          result.buttons.forEach((button, index) => {
            assert(Math.abs(button.width - size) < .1 && Math.abs(button.height - size) < .1, "Button scaled with map");
            assert(button.x >= 0 && button.y >= 0 && button.x + button.width <= width && button.y + button.height <= height, "Control outside viewport");
            if (index) assert(Math.abs(button.x - result.buttons[index - 1].x - size - 4) < .1, "Keep 4px action gaps");
          });
          records.push({ width, height, size, percent, ...result });
        }
        await game(`CrownlandsActionSizeReview.set({size:${size},zoom:${height < 600 ? 40 : 60}})`);
        await delay(150);
        await capture(`${width}-${size}px`);
      }
      await game('CrownlandsCastlePositionReview.settings({sample:"owned",level:4})');
      await game('CrownlandsActionSizeReview.set({size:64,zoom:60})');
      assert.deepEqual((await game("CrownlandsActionSizeReview.measure()")).buttons.map(button => button.id), ["store", "info", "send"]);
    }
    for (const size of [56, 64, 72]) {
      const low = records.find(record => record.width === 1440 && record.size === size && record.percent === 40);
      const high = records.find(record => record.width === 1440 && record.size === size && record.percent === 100);
      assert(Math.abs(high.towerWidth / low.towerWidth - high.zoom / low.zoom) < .01, "Map art should zoom normally");
    }
    // Check the actual chooser and its native-size iframe, not just the fixture API.
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/clan-tower-action-size/index.html?viewport=landscape" });
    await wait('document.documentElement?.dataset.actionSizeReviewReady === "true"');
    for (const size of [64, 72, 56]) {
      await evaluate(`document.querySelector('[data-size="${size}"]').click()`);
      await wait(`document.getElementById("measurement").textContent.includes("${size} × ${size} px")`);
    }
    await evaluate('document.getElementById("zoom").value=40;document.getElementById("zoom").dispatchEvent(new Event("input",{bubbles:true}))');
    await wait('document.getElementById("measurement").textContent.includes("Map 40%")');
    const frame = await evaluate('(()=>{const frame=document.getElementById("preview"),r=frame.getBoundingClientRect();return{width:r.width,height:r.height,transform:getComputedStyle(frame).transform};})()');
    assert.deepEqual(frame, { width: 844, height: 390, transform: "none" });
    await evaluate(`document.querySelector('[data-size="64"]').click();document.getElementById("zoom").value=60;document.getElementById("zoom").dispatchEvent(new Event("input",{bubbles:true}))`);
    await wait('document.getElementById("measurement").textContent.includes("64 × 64 px")&&document.getElementById("measurement").textContent.includes("Map 60%")');
    await delay(200);
    await capture("size-chooser");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(directory, "checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), records, errors, chooserAtNativeScale: frame }, null, 2));
    console.log(JSON.stringify({ passed: true, measuredCombinations: records.length, viewports: ["1440×900", "844×390", "568×320"], choices: [56, 64, 72], zoom: [40, 70, 100], errors }));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
      await removeBrowserProfile(browser.profilePath);
    }
    await server.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
