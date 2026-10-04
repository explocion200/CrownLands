"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.resolve(__dirname, "../release-artifacts/halloween-map-transition");
  fs.mkdirSync(output, { recursive: true });
  const results = [], errors = [];
  let browser, client;
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 300; i++) { if (await evaluate(expression)) return; await delay(50); }
      throw Error("Timed out: " + expression);
    };
    const load = async () => {
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready' && !isMapInteractionBlocked()");
      await evaluate("__CROWNLANDS_BENCHMARK__.closeModal();CrownlandsAnimations.setMode('full',{persist:false})");
    };
    const begin = async (theme, direction = "east") => evaluate(`window.halloweenTransition = CrownlandsAnimations.beginMapTransition({root:mapFrame,stage:mapTransitionStage,theme:${JSON.stringify(theme)},direction:${JSON.stringify(direction)}});true`);
    const inspect = () => evaluate(`(()=>{
      const element=halloweenTransition.element, mist=element.querySelector('.crownlands-map-transition__part--mist');
      const parts=[...element.children];
      return {theme:element.dataset.theme,phase:element.dataset.phase,parts:parts.length,
        blocked:isMapInteractionBlocked(),opacity:Number(getComputedStyle(mist).opacity),
        background:getComputedStyle(mist).backgroundImage,
        art:parts.slice(-2).map(part=>getComputedStyle(part).backgroundImage),
        filters:parts.slice(-2).map(part=>getComputedStyle(part).filter),
        blend:parts.slice(-2).map(part=>getComputedStyle(part).mixBlendMode),
        shown:parts.slice(-2).map(part=>getComputedStyle(part).display!=='none'),
        clickThrough:parts.every(part=>getComputedStyle(part).pointerEvents==='none')};
    })()`);
    const screenshot = async name => {
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, name), Buffer.from(shot.data, "base64"));
    };
    for (const [width, height] of [[1440, 900], [844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: height < 600 ? 2 : 1, mobile: height < 600 });
      await load();
      // Decode the same single shared tile the two artwork layers use.
      const asset = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../docs/art-sources/halloween-map-transition/asset.json"), "utf8"));
      const texture = await evaluate(`(async()=>{const image=new Image();image.src=${JSON.stringify(asset.output)};await image.decode();return {width:image.naturalWidth,height:image.naturalHeight}})()`);
      assert.equal(texture.width, 512); assert.equal(texture.height, 512);
      const directions = [];
      for (const direction of ["east", "west", "north", "south"]) {
        await begin("halloween", direction);
        if (direction === "east") { await delay(200); await screenshot(`cover-${width}.png`); }
        await delay(650);
        const held = await inspect();
        assert.equal(held.theme, "halloween"); assert.equal(held.parts, 5); assert(held.blocked && held.clickThrough);
        assert.equal(held.opacity, 1, "A slow map load must stay fully covered");
        assert(held.art.every(art => art.includes("map-transition-halloween-512x512-")), "Both layers must use the Halloween tile");
        assert.deepEqual(held.filters, ["none", "none"], "Cloud tinting must not wash out the painted bats");
        assert.deepEqual(held.blend, ["normal", "normal"], "Painted bats must retain their dark outlines");
        if (direction === "east") await screenshot(`held-${width}.png`);
        await evaluate("halloweenTransition.finish()");
        await wait("halloweenTransition.element.dataset.phase==='entering'");
        if (direction === "east") { await delay(180); await screenshot(`reveal-${width}.png`); }
        await wait("!mapFrame.querySelector('.crownlands-map-transition') && !isMapInteractionBlocked()");
        directions.push({ direction, ...held, cleanup: true });
      }
      await begin("clouds"); await delay(500);
      const clouds = await inspect();
      assert(clouds.art.every(art => art.includes("map-transition-clouds-448x448-")), "Original clouds must remain usable");
      await evaluate("halloweenTransition.cancel('cloud-review');CrownlandsAnimations.setMode('reduced',{persist:false})");
      await begin("halloween");
      await wait("getComputedStyle(halloweenTransition.element.querySelector('.crownlands-map-transition__part--mist')).opacity==='1'");
      const reduced = await inspect(); assert.equal(reduced.opacity, 1); assert.deepEqual(reduced.shown, [false, false]);
      const reducedAnimations = await evaluate("halloweenTransition.element.getAnimations({subtree:true}).map(animation=>animation.animationName)");
      assert.deepEqual(reducedAnimations, ["crownlandsMapReducedCover"], "Reduced motion must use only a stationary veil fade");
      await evaluate("halloweenTransition.finish()");
      await wait("!isMapInteractionBlocked()");
      await evaluate("CrownlandsAnimations.setMode('off',{persist:false})");
      assert.equal(await evaluate("CrownlandsAnimations.beginMapTransition({root:mapFrame,stage:mapTransitionStage,theme:'halloween'})"), null);
      await evaluate("CrownlandsAnimations.setMode('full',{persist:false})");
      // Fast completion still holds the full cover interval; superseding/cancelling releases the guard.
      await begin("halloween"); await evaluate("halloweenTransition.finish()");
      assert.equal((await inspect()).phase, "loading");
      await begin("halloween", "west");
      assert.equal(await evaluate("mapFrame.querySelectorAll('.crownlands-map-transition').length"), 1);
      await evaluate("halloweenTransition.cancel('browser-validator')");
      assert.equal(await evaluate("isMapInteractionBlocked()"), false);
      await evaluate("for(let i=0;i<30;i++){const handle=CrownlandsAnimations.beginMapTransition({root:mapFrame,stage:mapTransitionStage,theme:'halloween'});handle.cancel('repeat')} ");
      assert.equal(await evaluate("mapFrame.querySelectorAll('.crownlands-map-transition').length"), 0);
      results.push({ width, height, texture, directions, cloudsRetained: true, reducedMotion: true, off: true, earlyFinish: true, supersede: true, repeatCleanup: true });
      console.log(`PASS ${width}x${height}: four directions, slow/fast cover, retained clouds, reduced/off, supersede and cleanup.`);
    }
    // Missing seasonal artwork cannot strand navigation: the opaque veil is independent.
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    await client.send("Network.setBlockedURLs", { urls: ["*map-transition-halloween-*"] });
    await load(); await begin("halloween"); await delay(600);
    assert.equal((await inspect()).opacity, 1);
    await evaluate("halloweenTransition.finish()"); await wait("!isMapInteractionBlocked()");
    await client.send("Network.setBlockedURLs", { urls: [] });
    await client.send("Page.navigate", { url: address.url + "/docs/art-sources/halloween-map-transition/preview.html" });
    await wait("!document.getElementById('play').disabled");
    await evaluate("document.getElementById('hold').click()");
    await wait("document.getElementById('game').contentWindow.CrownlandsAnimations.mapTransition?.handle.element.dataset.theme==='halloween'");
    assert.equal(await evaluate("document.getElementById('hold').textContent"), "Reveal map");
    await evaluate("document.getElementById('hold').click()");
    await wait("!document.getElementById('game').contentWindow.CrownlandsAnimations.mapTransition");
    await evaluate("document.getElementById('theme').value='clouds';document.getElementById('play').click()");
    await wait("document.getElementById('game').contentWindow.CrownlandsAnimations.mapTransition?.handle.element.dataset.theme==='clouds'");
    await wait("!document.getElementById('game').contentWindow.CrownlandsAnimations.mapTransition");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "validation.json"), JSON.stringify({ results, missingArtFallback: true, previewControls: true, errors }, null, 2) + "\n");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
