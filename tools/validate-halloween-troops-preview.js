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
    await media("no-preference"); await viewport(1200, 1100);
    await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/halloween-troops/preview.html" });
    for (let n = 0; n < 100 && !await evaluate("document.documentElement?.dataset.previewReady"); n++) await delay(100);
    assert.equal(await evaluate("document.documentElement?.dataset.previewReady"), "true", "All artwork must load");
    const atlasReport = await evaluate("(async()=>{const result=[];for(const [file,sheet] of Object.entries(atlasLayout)){const img=new Image();img.src=file;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);result.push({size:[c.width,c.height],expected:[sheet.width,sheet.height],corner:ctx.getImageData(0,0,1,1).data[3],rows:sheet.rows.map(row=>row.map(f=>{const p=ctx.getImageData(f.x,f.y,f.width,f.height).data;let visible=0,hash=0;for(let i=3;i<p.length;i+=4){if(p[i]>128)visible++;hash=(hash*31+p[i])>>>0}return {visible,hash,fits:f.x>=0&&f.y>=0&&f.x+f.width<=c.width&&f.y+f.height<=c.height&&f.width<=320&&f.height<=320}}))})}return result})()");
    assert.equal(atlasReport.length, 2);
    for (const sheet of atlasReport) {
      assert.deepEqual(sheet.size, sheet.expected); assert.equal(sheet.corner, 0);
      assert.equal(sheet.rows.length, 4);
      for (const row of sheet.rows) {
        assert.equal(row.length, 4); assert.equal(new Set(row.map(f => f.hash)).size, 4, "Four distinct walking poses required");
        row.forEach(frame => { assert(frame.fits, "Artwork must fit the frame without clipping spears or feet"); assert(frame.visible > 5000); });
      }
    }
    const opposite = { N: "S", NE: "SW", E: "W", SE: "NW", S: "N", SW: "NE", W: "E", NW: "SE" };
    for (const direction of Object.keys(opposite)) {
      for (const returning of [false, true]) {
        await evaluate("controls.direction.value='" + direction + "';controls.returning.checked=" + returning + ";updatePreview(true)");
        const expected = returning ? opposite[direction] : direction;
        assert.equal(await evaluate("document.querySelector('#map-scene .formation').dataset.facing"), expected);
        assert.equal(await evaluate("document.querySelector('#detail-art .formation').dataset.facing"), expected);
        assert.equal(await evaluate("directionForVector(routePoints[1].x-routePoints[0].x,routePoints[1].y-routePoints[0].y)"), expected);
        assert.equal(await evaluate("document.querySelector('#map-scene .frame-strip').children.length"), 4);
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.army-badge')).transform"), "none", "Labels must stay upright");
      }
    }
    assert.deepEqual(await evaluate("[directionForVector(0,0,'NW'),directionForVector(100,40),directionForVector(100,50),directionForVector(-100,-50)]"), ["NW", "E", "SE", "NW"], "Zero-length and angled segments must choose stable headings");
    await evaluate("controls.direction.value='auto';controls.returning.checked=false;updatePreview(true)");
    await delay(150);
    const tour = [];
    for (let segment = 0; segment < 8; segment++) {
      assert.equal(await evaluate("segmentIndex"), segment);
      tour.push(await evaluate("currentFacing"));
      const endpoint = await evaluate("routePoints[segmentIndex+1]");
      await evaluate("routeAnimation.finish()");
      for (let attempt = 0; attempt < 20 && await evaluate("segmentIndex") === segment; attempt++) await delay(25);
      assert.deepEqual(await evaluate("routePoints[segmentIndex]"), segment === 7 ? await evaluate("routePoints[0]") : endpoint, JSON.stringify(await evaluate("({segmentIndex,state:routeAnimation.playState,time:routeAnimation.currentTime,visibility:document.hidden,motion:map.dataset.motion})")));
    }
    assert.deepEqual(tour, ["E", "SE", "S", "SW", "W", "NW", "N", "NE"], "Continuous route must turn through all eight views");
    await evaluate("controls.direction.value='SE';updatePreview(true)");
    const before = await evaluate("[getComputedStyle(document.querySelector('#map-scene .frame-strip')).transform,getComputedStyle(document.querySelector('.route-axis')).transform]");
    await delay(230);
    const after = await evaluate("[getComputedStyle(document.querySelector('#map-scene .frame-strip')).transform,getComputedStyle(document.querySelector('.route-axis')).transform]");
    assert.notEqual(after[0], before[0]); assert.notEqual(after[1], before[1], "Troops must advance along the route");
    assert.equal(await evaluate("document.querySelector('.sizes').getAnimations({subtree:true}).length"), 0);
    assert.equal(await evaluate("gallery.getAnimations({subtree:true}).length"), 0, "Direction thumbnails stay still");
    assert.equal(await evaluate("document.getAnimations().length"), 3, "Only two sprite previews and the route animate");
    await evaluate("gallery.querySelector('[data-direction=\"NW\"]').click()");
    assert.equal(await evaluate("currentFacing"), "NW", "Direction thumbnails must control the march");
    for (const relation of ["player", "ally", "enemy"]) {
      await evaluate("controls.relationship.value='" + relation + "';updatePreview()");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.troop-count')).display==='none'"), relation !== "player");
    }
    await evaluate("controls.mission.value='transfer';updatePreview()");
    assert.equal(await evaluate("document.querySelector('.mission-icon').alt"), "Transfer");
    assert(await evaluate("document.querySelector('.mission-icon').src.endsWith('/marching-banner.svg')"));
    await evaluate("controls.motion.checked=false;updatePreview()");
    assert(await evaluate("document.getAnimations().every(a=>a.playState==='paused')"), "Manual pause");
    await evaluate("controls.motion.checked=true;updatePreview()"); await media("reduce"); await delay(100);
    assert(await evaluate("document.getAnimations().every(a=>a.playState==='paused')"), "Reduced motion");
    await media("no-preference");
    await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
    assert(await evaluate("document.getAnimations().every(a=>a.playState==='paused')"), "Background pause");
    await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));controls.relationship.value='player';controls.mission.value='attack';controls.direction.value='auto';updatePreview(true)");
    for (const [width, height] of [[1200, 1100], [844, 390], [360, 740]]) {
      await viewport(width, height); await evaluate("window.scrollTo(0,0)"); await delay(150);
      const metrics = await evaluate("({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,loaded:[...document.images].every(i=>i.complete&&i.naturalWidth>0),controls:[...document.querySelectorAll('select,#direction-gallery button')].every(e=>e.getBoundingClientRect().height>=40)})");
      assert(metrics.width <= width, "No horizontal overflow at " + width); assert(metrics.loaded); assert(metrics.controls);
      assert.equal(await evaluate("directionForVector(routePoints[1].x-routePoints[0].x,routePoints[1].y-routePoints[0].y)"), "E", "Screen aspect ratio must not change the facing");
      const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: metrics.height, scale: 1 } });
      fs.writeFileSync(path.join(out, "preview-" + width + ".png"), Buffer.from(screenshot.data, "base64"));
    }
    await evaluate("window.scrollTo(0,document.documentElement.scrollHeight)"); await delay(150);
    assert.equal(await evaluate("map.dataset.motion"), "off"); assert.equal(await evaluate("routeAnimation.playState"), "paused");
    await evaluate("window.scrollTo(0,0)"); await delay(150);
    assert.equal(await evaluate("map.dataset.motion"), "on");
    assert.deepEqual(errors, []);
    console.log("Halloween troops preview passed: 32 distinct transparent poses, all eight headings and returns, continuous route turns, upright labels, three bounded animations, pause/reduced-motion/background/offscreen guards, and desktop/landscape/portrait layouts.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
