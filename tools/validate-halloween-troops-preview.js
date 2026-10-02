"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const out = path.resolve(__dirname, "../release-artifacts/halloween-troops-preview");
  fs.mkdirSync(out, { recursive: true });
  let session, client; const errors = [];
  try {
    const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(browser, "Chromium required"); session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Runtime.enable"), client.send("Page.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const media = value => client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value }] });
    const viewport = (width, height) => client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await media("no-preference"); await viewport(1200, 1000);
    await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/halloween-troops/preview.html" });
    for (let n = 0; n < 100 && !await evaluate("document.documentElement.dataset.previewReady"); n++) await delay(100);
    assert.equal(await evaluate("document.documentElement.dataset.previewReady"), "true", "All artwork must load");
    const atlas = await evaluate("(()=>{const img=document.querySelector('.atlas'),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {width:c.width,height:c.height,cells:[0,1,2,3].map(i=>{const x=(i%2)*c.width/2,y=Math.floor(i/2)*c.height/2,p=ctx.getImageData(x,y,c.width/2,c.height/2).data;let opaque=0;for(let a=3;a<p.length;a+=4)if(p[a]>128)opaque++;return {corner:p[3],opaque}})}})()");
    assert.equal(atlas.width % 2, 0); assert.equal(atlas.width, atlas.height);
    atlas.cells.forEach(cell => { assert.equal(cell.corner, 0, "Sprite exterior must be transparent"); assert(cell.opaque > 10000, "Each walking pose must contain visible art"); });
    await delay(100);
    const before = await evaluate("[getComputedStyle(document.querySelector('#map-scene .atlas')).transform,getComputedStyle(document.querySelector('.route-axis')).transform]");
    await delay(220);
    const after = await evaluate("[getComputedStyle(document.querySelector('#map-scene .atlas')).transform,getComputedStyle(document.querySelector('.route-axis')).transform]");
    assert.notEqual(after[0], before[0], "Walking pose must change"); assert.notEqual(after[1], before[1], "Troops must advance along the route");
    assert.equal(await evaluate("document.querySelector('.sizes').getAnimations({subtree:true}).length"), 0, "Size samples must remain still");
    assert.equal(await evaluate("document.getAnimations().length"), 3, "Only two sprite previews and the sample route animate");
    for (const relation of ["player", "ally", "enemy"]) {
      await evaluate("controls.relationship.value='" + relation + "';updatePreview()");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.troop-count')).display==='none'"), relation !== "player", "Other players' exact counts must not be exposed");
    }
    await evaluate("controls.mission.value='transfer';controls.direction.value='return';updatePreview()");
    assert.equal(await evaluate("document.querySelector('.mission-icon').alt"), "Transfer");
    assert(await evaluate("document.querySelector('.mission-icon').src.endsWith('/marching-banner.svg')"));
    assert(await evaluate("getComputedStyle(document.querySelector('.facing')).transform.startsWith('matrix(-1')"), "Returning artwork must face back toward its origin");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.army-badge')).transform"), "none", "Text must not mirror");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.route-axis')).animationDirection"), "reverse");
    await evaluate("controls.motion.checked=false;updatePreview()");
    assert(await evaluate("document.getAnimations().every(a=>a.playState==='paused')"), "Pause control must stop all motion");
    await evaluate("controls.motion.checked=true;updatePreview()");
    await media("reduce"); await delay(100);
    assert(await evaluate("document.getAnimations().every(a=>a.playState==='paused')"), "Reduced motion must stop all motion");
    await media("no-preference");
    await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
    assert(await evaluate("document.getAnimations().every(a=>a.playState==='paused')"), "Background lifecycle must stop motion");
    await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));controls.relationship.value='player';controls.mission.value='attack';controls.direction.value='outbound';updatePreview()");
    for (const [width, height] of [[1200, 1000], [844, 390], [360, 740]]) {
      await viewport(width, height); await evaluate("window.scrollTo(0,0)"); await delay(150);
      const metrics = await evaluate("({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,loaded:[...document.images].every(i=>i.complete&&i.naturalWidth>0),controls:[...document.querySelectorAll('select')].every(e=>e.getBoundingClientRect().height>=40)})");
      assert(metrics.width <= width, "No horizontal overflow at " + width); assert(metrics.loaded); assert(metrics.controls, "Touch controls must remain usable");
      const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: metrics.height, scale: 1 } });
      fs.writeFileSync(path.join(out, "preview-" + width + ".png"), Buffer.from(screenshot.data, "base64"));
    }
    await evaluate("window.scrollTo(0,document.documentElement.scrollHeight)"); await delay(150);
    assert.equal(await evaluate("document.getElementById('map-scene').dataset.motion"), "off", "Offscreen route must pause");
    await evaluate("window.scrollTo(0,0)"); await delay(150);
    assert.equal(await evaluate("document.getElementById('map-scene').dataset.motion"), "on", "Visible route must resume");
    assert.deepEqual(errors, []);
    console.log("Halloween troops preview passed: transparent four-pose atlas, walking and route motion, independent mission/count labels, return direction, pause/reduced-motion/background/offscreen guards, and desktop/landscape/portrait layouts.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
