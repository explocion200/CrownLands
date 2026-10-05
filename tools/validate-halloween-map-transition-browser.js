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
      const parts=[...element.children],bats=[...element.querySelectorAll('.crownlands-map-bat')];
      return {theme:element.dataset.theme,phase:element.dataset.phase,parts:parts.length,
        blocked:isMapInteractionBlocked(),opacity:Number(getComputedStyle(mist).opacity),
        background:getComputedStyle(mist).backgroundImage,
        art:parts.slice(-2).map(part=>getComputedStyle(part).backgroundImage),
        filters:parts.slice(-2).map(part=>getComputedStyle(part).filter),
        blend:parts.slice(-2).map(part=>getComputedStyle(part).mixBlendMode),
        shown:parts.slice(-2).map(part=>getComputedStyle(part).display!=='none'),
        bats:bats.length, wings:element.querySelectorAll('.crownlands-map-bat__left,.crownlands-map-bat__right').length,
        batTransforms:bats.map(bat=>getComputedStyle(bat).transform),
        wingTransforms:bats.map(bat=>getComputedStyle(bat.querySelector('.crownlands-map-bat__left')).transform),
        clickThrough:parts.every(part=>getComputedStyle(part).pointerEvents==='none')};
    })()`);
    const screenshot = async name => {
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, name), Buffer.from(shot.data, "base64"));
    };
    for (const [width, height] of [[1440, 900], [844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: height < 600 ? 2 : 1, mobile: height < 600 });
      await load();
      const directions = [];
      for (const direction of ["east", "west", "north", "south"]) {
        await begin("halloween", direction);
        await delay(160);
        const flight = await evaluate(`(()=>{const bat=halloweenTransition.element.querySelector('.crownlands-map-bat');const matrix=new DOMMatrix(getComputedStyle(bat).transform);return {x:matrix.m41,y:matrix.m42}})()`);
        const axis = ["east", "west"].includes(direction) ? "x" : "y";
        assert(flight[axis] * (["east", "south"].includes(direction) ? 1 : -1) > 0, "Bats must enter from the selected map direction");
        if (direction === "east") await screenshot(`cover-${width}.png`);
        await delay(500);
        const held = await inspect();
        assert.equal(held.theme, "halloween"); assert.equal(held.parts, 5); assert(held.blocked && held.clickThrough);
        assert.equal(held.opacity, 1, "A slow map load must stay fully covered");
        assert.equal(held.bats, width < 900 ? 6 : 10, "Keep a bounded flock with fewer bats on mobile");
        assert.equal(held.wings, held.bats * 2, "Every bat needs independently flapping wings");
        assert(held.art[0].includes("map-transition-halloween-512x512-") && held.art[1] === "none", "Keep faint painted atmosphere behind the animated foreground");
        assert.deepEqual(held.filters, ["none", "none"], "Theme filters must not wash out the bats");
        assert.deepEqual(held.blend, ["normal", "normal"], "The flock must retain its dark silhouette");
        assert(held.batTransforms.every(transform => transform.startsWith("matrix")), "Directional bat flight must use valid transforms");
        await delay(65);
        assert.notDeepEqual((await inspect()).wingTransforms, held.wingTransforms, "Bats must keep flapping while a slow map loads");
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
      assert.equal(clouds.bats, 0, "The retained cloud transition must not allocate a flock");
      await evaluate("halloweenTransition.cancel('cloud-review');CrownlandsAnimations.setMode('reduced',{persist:false})");
      await begin("halloween");
      await wait("getComputedStyle(halloweenTransition.element.querySelector('.crownlands-map-transition__part--mist')).opacity==='1'");
      const reduced = await inspect(); assert.equal(reduced.opacity, 1); assert.deepEqual(reduced.shown, [false, false]);
      assert.equal(reduced.bats, 0, "Reduced motion must not create any bats");
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
      // Exercise the real current-Core navigation path, including its map-picker direction.
      const navigation = await evaluate(`(async()=>{
        const themes=[],manager=CrownlandsAnimations,original=manager.getMapTransitionTheme;
        manager.getMapTransitionTheme=()=> 'halloween';
        const unsubscribe=manager.on('effectstart',event=>{if(event.type==='map-transition')themes.push(manager.mapTransition.handle.element.dataset.theme)});
        try{return {...await __CROWNLANDS_BENCHMARK__.switchNeighborAndReturn(),themes};}
        finally{unsubscribe();manager.getMapTransitionTheme=original;}
      })()`);
      assert(navigation.neighborResult && navigation.returnResult, "Current Core navigation must complete in both directions");
      assert.deepEqual(navigation.themes, ["halloween", "halloween"]);
      assert.equal(await evaluate("isMapInteractionBlocked() || !!mapFrame.querySelector('.crownlands-map-bat')"), false);
      // A lost completion must recover through the existing watchdog.
      await evaluate("CrownlandsAnimations.beginMapTransition({root:mapFrame,stage:mapTransitionStage,theme:'halloween',watchdogMs:500})");
      await wait("!isMapInteractionBlocked() && !mapFrame.querySelector('.crownlands-map-bat')");
      await begin("halloween");
      await evaluate("CrownlandsAnimations.setMode('off',{persist:false})");
      assert.equal(await evaluate("isMapInteractionBlocked() || !!mapFrame.querySelector('.crownlands-map-bat')"), false);
      await evaluate("CrownlandsAnimations.setMode('full',{persist:false})");
      results.push({ width, height, directions, navigation, cloudsRetained: true, reducedMotion: true, off: true, earlyFinish: true, supersede: true, repeatCleanup: true, watchdog: true, midflightOff: true });
      console.log(`PASS ${width}x${height}: four directions, slow/fast cover, retained clouds, reduced/off, supersede and cleanup.`);
    }
    // Missing seasonal artwork cannot strand navigation: the opaque veil is independent.
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    await client.send("Network.setBlockedURLs", { urls: ["*map-transition-halloween-*"] });
    await load(); await begin("halloween"); await delay(600);
    assert.equal((await inspect()).opacity, 1);
    await evaluate("halloweenTransition.finish()"); await wait("!isMapInteractionBlocked()");
    await client.send("Network.setBlockedURLs", { urls: [] });
    const previewSizes = [];
    await client.send("Page.navigate", { url: address.url + "/docs/art-sources/halloween-map-transition/preview.html" });
    await wait("!document.getElementById('play').disabled");
    // The preview must fit a landscape game inside portrait side panels without hiding the game's real orientation guard.
    for (const [width, height] of [[858, 1244], [400, 800], [1440, 900], [844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await wait(`(()=>{const frame=document.getElementById('game'),viewport=document.getElementById('viewport'),rect=frame.getBoundingClientRect(),bounds=viewport.getBoundingClientRect(),gameWidth=Math.max(844,viewport.clientWidth),gameHeight=Math.max(390,Math.min(viewport.clientHeight,gameWidth*9/16));return innerWidth===${width} && innerHeight===${height} && frame.contentWindow.innerWidth===gameWidth && Math.abs(frame.contentWindow.innerHeight-gameHeight)<1 && frame.contentWindow.innerWidth>frame.contentWindow.innerHeight && rect.left>=bounds.left-1 && rect.right<=bounds.right+1 && rect.top>=bounds.top-1 && rect.bottom<=bounds.bottom+1})()`);
      const dimensions = await evaluate(`(()=>{const frame=document.getElementById('game'),runtime=frame.contentWindow;return {width:runtime.innerWidth,height:runtime.innerHeight,warning:runtime.getComputedStyle(runtime.document.querySelector('.rotate-warning')).display}})()`);
      assert.equal(dimensions.warning, "none", "Preview must not show the game's portrait warning");
      await evaluate("document.getElementById('hold').click()");
      await wait("document.getElementById('game').contentWindow.CrownlandsAnimations.mapTransition?.handle.element.dataset.phase==='loading'");
      assert.equal(await evaluate("document.getElementById('hold').textContent"), "Reveal map");
      assert.equal(await evaluate("document.getElementById('game').contentDocument.querySelectorAll('.crownlands-map-bat').length"), dimensions.width < 900 ? 6 : 10);
      await screenshot(`preview-${width}x${height}.png`);
      await evaluate("document.getElementById('hold').click()");
      await wait("!document.getElementById('game').contentWindow.CrownlandsAnimations.mapTransition");
      previewSizes.push({ width, height, game: dimensions, fitted: true, controls: true });
    }
    await evaluate("document.getElementById('theme').value='clouds';document.getElementById('play').click()");
    await wait("document.getElementById('game').contentWindow.CrownlandsAnimations.mapTransition?.handle.element.dataset.theme==='clouds'");
    await wait("!document.getElementById('game').contentWindow.CrownlandsAnimations.mapTransition");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "validation.json"), JSON.stringify({ results, missingArtFallback: true, previewControls: true, previewSizes, errors }, null, 2) + "\n");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
