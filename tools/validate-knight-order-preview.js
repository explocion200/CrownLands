"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

async function main() {
  const root = path.resolve(__dirname, "..");
  const directory = "docs/visual-qa/knight-order-city-skins";
  const orders = ["templar", "hospitaller", "teutonic", "santiago"];
  const prompts = JSON.parse(fs.readFileSync(path.join(root, directory, "prompts.json"), "utf8"));
  assert.deepEqual(prompts.assets.map(asset => asset.slug), orders);
  for (const order of orders) {
    const png = fs.readFileSync(path.join(root, directory, "art", order + ".png"));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png[25], 6, "City art must retain RGBA transparency");
    assert(png.readUInt32BE(16) >= 1024 && png.readUInt32BE(20) >= 1024);
  }
  const executable = [process.env.CHROME_PATH, process.env.CROWNLANDS_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(value => value && fs.existsSync(value));
  assert(executable, "Chromium is required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.join(root, "release-artifacts/knight-order-city-skins");
  fs.mkdirSync(output, { recursive: true });
  let browser, client;
  const errors = [], external = [], failed = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Runtime.enable"); await client.send("Page.enable"); await client.send("Network.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Network.requestWillBeSent", event => { if (!event.request.url.startsWith(address.url) && /^https?:/.test(event.request.url)) external.push(event.request.url); });
    client.on("Network.responseReceived", event => { if (event.response.status >= 400 && !event.response.url.endsWith("/favicon.ico")) failed.push(event.response.url); });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let attempt = 0; attempt < 160; attempt++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw Error("Timed out: " + expression);
    };
    const settle = () => evaluate("new Promise(resolve => setTimeout(resolve, 180))");
    const click = async selector => {
      const point = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        element.scrollIntoView({ block: "center", behavior: "instant" });
        const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!element.contains(hit)) throw Error("Obscured control: " + element.outerHTML);
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
    };
    const selectEffects = value => evaluate(`document.querySelector('#effects').value = ${JSON.stringify(value)}; document.querySelector('#effects').dispatchEvent(new Event('change'))`);
    const snapshot = () => evaluate("document.querySelector('canvas').toDataURL()");
    const capture = async (name, fullPage = false) => {
      const height = await evaluate("document.documentElement.scrollHeight");
      const width = await evaluate("innerWidth");
      const options = fullPage ? { captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } } : {};
      fs.writeFileSync(path.join(output, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png", ...options })).data, "base64"));
    };
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/${directory}/index.html` });
      await wait("document.readyState === 'complete' && !!document.querySelector('canvas')");
      for (const order of orders) {
        await click(`[data-order-choice="${order}"]`);
        await wait(`document.querySelector('.skin-card').dataset.order === ${JSON.stringify(order)} && document.querySelector('.art').complete`);
        await evaluate("Promise.all([...document.images].map(image => image.decode()))");
        await settle();
        assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "No horizontal overflow at " + viewport.width);
        assert(await evaluate("[...document.querySelectorAll('button,select')].every(e => e.getBoundingClientRect().height >= 44)"), "Touch targets stay at least 44px tall");
        assert(await evaluate("(() => { const c = document.querySelector('.city').getBoundingClientRect(), s = document.querySelector('.stage').getBoundingClientRect(); return Math.abs(c.width-c.height)<1 && c.left>=s.left && c.right<=s.right+1 && c.top>=s.top && c.bottom<=s.bottom+1; })()"), "Complete square art fits its stage");
        assert(await evaluate("(() => { const image=document.querySelector('.art'), c=document.createElement('canvas'); c.width=image.naturalWidth; c.height=image.naturalHeight; const ctx=c.getContext('2d'); ctx.drawImage(image,0,0); return ctx.getImageData(0,0,1,1).data[3]===0; })()"), "Transparent city corner");
      }
      await click('[data-order-choice="teutonic"]');
      await evaluate("document.querySelector('.stage').scrollIntoView({block:'center'})");
      await settle();
      const moving = await snapshot(); await settle();
      assert.notEqual(await snapshot(), moving, "Full effects animate");
      await click("#pause"); await settle();
      const paused = await snapshot(); await settle();
      assert.equal(await snapshot(), paused, "Pause freezes particles");
      assert(await evaluate("document.querySelector('.skin-card').getAnimations({subtree:true}).every(animation => animation.playState === 'paused')"), "Pause freezes CSS light effects");
      await click("#pause");
      await selectEffects("subtle"); await settle();
      const subtle = await snapshot(); await settle();
      assert.equal(await snapshot(), subtle, "Subtle effects are static");
      await selectEffects("off");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('canvas')).display"), "none");
      await selectEffects("full");
      await click('[data-view="scale"]'); await settle();
      assert.equal(await evaluate("document.querySelector('.city').getBoundingClientRect().width"), 160);
      await click('[data-view="compare"]'); await settle();
      assert.equal(await evaluate("document.querySelectorAll('.skin-card').length"), 4);
      assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Compare stays within viewport");
      if (viewport.width === 1440) { await evaluate("scrollTo(0,0)"); await capture("compare-desktop", true); }
      await click('[data-view="inspect"]'); await click('[data-order-choice="santiago"]');
      await evaluate("document.querySelector('.stage').scrollIntoView({block:'center'})"); await settle();
      await capture("inspect-" + viewport.width);
    }
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await client.send("Page.reload");
    await wait("document.readyState === 'complete' && document.documentElement.dataset.effects === 'subtle'");
    assert.equal(await evaluate("document.querySelector('#effects').value"), "subtle", "Reduced motion defaults to static effects");
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(failed, []);
    console.log("Four-order preview passed: transparent art, all choices, desktop/landscape/portrait fit, animated/pause/subtle/off effects, comparison, 160px city scale, reduced motion, no external requests or runtime errors.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { await waitForProcessExit(browser.browserProcess); await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
