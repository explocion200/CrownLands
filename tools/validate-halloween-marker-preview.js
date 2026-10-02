"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const draft = "docs/visual-qa/halloween-city-marker";
const read = file => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
async function main() {
  const source = read(`${draft}/marker.svg`), palette = read("crownlands-palette.css");
  assert.doesNotMatch(source, /<(?:image|script|animate|filter)\b/i, "The center must remain independent static vector art");
  assert(Buffer.byteLength(source) < 10000, "Keep the compact marker draft under 10 KB");
  const server = createMapBenchmarkServer(), address = await server.listen(); let session, client;
  const errors = [], out = path.resolve(__dirname, "../release-artifacts/halloween-marker-preview"); fs.mkdirSync(out, { recursive: true });
  try {
    const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(browser, "Chromium required"); session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Runtime.enable"), client.send("Page.enable")]);
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1100, deviceScaleFactor: 1, mobile: false });
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => { const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    await client.send("Page.navigate", { url: `${address.url}/${draft}/preview.html` });
    for (let n = 0; n < 100 && !await evaluate("document.documentElement.dataset.previewReady"); n++) await delay(100);
    assert.equal(await evaluate("document.documentElement.dataset.previewReady"), "true");
    const alpha = await evaluate("(()=>{const img=document.querySelector('.ornate-frame'),canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return [ctx.getImageData(0,0,1,1).data[3],ctx.getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data[3]]})()");
    assert.deepEqual(alpha, [0, 0], "Painted frame must have a transparent exterior and center");
    const border = await evaluate("document.querySelector('#hero-marker [data-halloween-border]').innerHTML");
    const flag = await evaluate("document.querySelector('#hero-marker [data-player-flag]').innerHTML");
    for (const [state, token] of Object.entries({ owned: "player-owned", main: "main-city", clan: "clan", weaker: "enemy-weaker", equal: "enemy-equal", stronger: "enemy-stronger", neutral: "neutral" })) {
      await evaluate(`document.getElementById('relationship').value='${state}';updateMarkerPreview()`);
      const hex = palette.match(new RegExp(`--cl-${token}: (#[0-9a-f]{6})`))[1];
      const rgb = `rgb(${hex.slice(1).match(/../g).map(v => parseInt(v, 16)).join(", ")})`;
      assert.equal(await evaluate("getComputedStyle(document.querySelector('#hero-marker [data-city-fill]')).fill"), rgb);
      assert.equal(await evaluate("document.querySelector('#hero-marker [data-halloween-border]').innerHTML"), border, "Relationship must not recolor decorative art");
      assert.equal(await evaluate("document.querySelector('#hero-marker [data-player-flag]').innerHTML"), flag, "Relationship must not replace heraldry");
    }
    await evaluate("document.getElementById('relationship').value='unknown';updateMarkerPreview()");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#hero-marker [data-city-fill]')).fill"), "rgb(129, 118, 101)");
    await evaluate("document.getElementById('relationship').value='stronger';document.getElementById('primary').value='#113355';document.getElementById('secondary').value='#884422';document.getElementById('symbol').value='#ddbb77';document.getElementById('level').value='99';document.getElementById('primary').dispatchEvent(new Event('input',{bubbles:true}))");
    assert.deepEqual(await evaluate("[getComputedStyle(document.querySelector('#hero-marker [data-player-flag] rect')).fill,getComputedStyle(document.querySelector('#hero-marker [data-player-flag]>path')).stroke,getComputedStyle(document.querySelector('#hero-marker [data-flag-symbol]')).fill]"), ["rgb(17, 51, 85)", "rgb(136, 68, 34)", "rgb(221, 187, 119)"]);
    assert.equal(await evaluate("document.querySelector('#hero-marker [data-city-level]').textContent"), "99");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#hero-marker [data-city-fill]')).fill"), "rgb(75, 20, 24)");
    assert.equal(await evaluate("document.querySelector('#hero-marker [data-city-fill]').getAttribute('d')"), "M0 0H46V47.56L23 58L0 47.56Z");
    const lowerFrameFits = await evaluate(`(() => {
      const svg = document.querySelector('#hero-marker>svg'), img = document.querySelector('#hero-marker .ornate-frame');
      const marker = svg.getBoundingClientRect(), frame = img.getBoundingClientRect();
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      // Sample the actual transparent opening along both lower diagonal edges.
      return [1060, 1100, 1120].every(row => {
        const pixels = ctx.getImageData(0, row, canvas.width, 1).data;
        return [-1, 1].every(direction => {
          let column = Math.floor(canvas.width / 2);
          if (pixels[column * 4 + 3] >= 128) return false;
          while (column > 0 && column < canvas.width - 1 && pixels[column * 4 + 3] < 128) column += direction;
          column -= direction;
          const x = (frame.left - marker.left + column * frame.width / canvas.width) * 46 / marker.width;
          const y = (frame.top - marker.top + row * frame.height / canvas.height) * 58 / marker.height;
          const inset = y <= 47.56 ? 0 : 23 * (y - 47.56) / (58 - 47.56);
          return y <= 58 && x >= inset - .1 && x <= 46 - inset + .1;
        });
      });
    })()`);
    assert(lowerFrameFits, "The lower frame opening must overlap the colored marker, leaving no transparent V-shaped gap");
    await evaluate("document.getElementById('border').checked=false;document.getElementById('border').dispatchEvent(new Event('input',{bubbles:true}))");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#hero-marker [data-halloween-border]')).display"), "none");
    await evaluate("document.getElementById('primary').value='#182b3e';document.getElementById('secondary').value='#a9443b';document.getElementById('symbol').value='#eee5cd';document.getElementById('level').value='50';document.getElementById('border').checked=true;updateMarkerPreview()");
    await delay(100);
    const batBefore = await evaluate("getComputedStyle(document.querySelector('#hero-marker .border-flight')).transform");
    const wingBefore = await evaluate("getComputedStyle(document.querySelector('#hero-marker .border-wing')).transform");
    const lampBefore = await evaluate("getComputedStyle(document.querySelector('#hero-marker .lantern-glow')).opacity");
    await delay(180);
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#hero-marker .border-flight')).transform"), batBefore, "Bats must visibly travel");
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#hero-marker .border-wing')).transform"), wingBefore, "Bat wings must flap");
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#hero-marker .lantern-glow')).opacity"), lampBefore, "Lantern light must flicker");
    assert.equal(await evaluate("document.querySelector('#hero-marker>svg').getAnimations({subtree:true}).length"), 0, "Flag, center and level must not animate");
    assert.equal(await evaluate("document.querySelector('#color-examples').getAnimations({subtree:true}).length"), 0, "Comparison thumbnails must remain still");
    await evaluate("document.getElementById('motion').checked=false;document.getElementById('motion').dispatchEvent(new Event('input',{bubbles:true}))");
    assert(await evaluate("document.getAnimations().every(a=>a.playState==='paused')"), "Pause control must stop all decoration");
    await evaluate("document.getElementById('motion').checked=true;updateMarkerPreview()");
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }); await delay(100);
    assert(await evaluate("document.getAnimations().every(a=>a.playState==='paused')"), "System reduced motion must stop decoration");
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
    assert(await evaluate("document.getAnimations().every(a=>a.playState==='paused')"), "Background lifecycle must pause motion");
    await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
    for (const [width, height] of [[1200, 950], [844, 390], [360, 740]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); await delay(100);
      const metrics = await evaluate("({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,markerWidth:document.querySelector('#actual-marker').getBoundingClientRect().width,markerHeight:document.querySelector('#actual-marker').getBoundingClientRect().height,images:[...document.images].every(i=>i.complete&&i.naturalWidth>0),levelClear:document.querySelector('#hero-marker [data-city-level]').getBBox().y>34})");
      assert(metrics.width <= width, `Horizontal overflow at ${width}`); assert(metrics.images, "City art must load");
      assert.equal(metrics.markerWidth, 46); assert.equal(metrics.markerHeight, 58); assert(metrics.levelClear, "Level must stay below the flag");
      assert(await evaluate("document.getAnimations().length<=14"), "Only the two main previews may animate");
      const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: metrics.height, scale: 1 } });
      fs.writeFileSync(path.join(out, `preview-${width}.png`), Buffer.from(screenshot.data, "base64"));
    }
    await evaluate("window.scrollTo(0,document.documentElement.scrollHeight)"); await delay(150);
    assert.equal(await evaluate("document.getElementById('hero-marker').dataset.motion"), "off", "Offscreen hero must stop");
    await evaluate("window.scrollTo(0,0)"); await delay(150);
    assert.equal(await evaluate("document.getElementById('hero-marker').dataset.motion"), "on", "Visible hero must resume");
    assert.deepEqual(errors, []);
    console.log("Halloween marker preview passed: original vector center, eight color states, independent heraldry/level, transparent painted frame, animated bats and lanterns, pause/reduced-motion/background/offscreen guards, and desktop/mobile layouts.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
