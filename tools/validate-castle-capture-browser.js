"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.resolve(__dirname, "../release-artifacts/castle-capture", process.env.CROWNLANDS_BENCHMARK_ROOT ? "built" : "source");
  fs.mkdirSync(output, { recursive: true });
  let session, client;
  const results = [], errors = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Runtime.consoleAPICalled", event => { if (event.type === "warning" || event.type === "error") console.log(event.args.map(arg => arg.description || arg.value).join(" ")); });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=B` });
      for (let i = 0; i < 600 && !await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"); i++) await delay(100);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"), "ready");
      await evaluate(`(() => {
        __CROWNLANDS_BENCHMARK__.closeModal();
        selectedSourceId = selectedTargetId = null; sendMode = false;
        const dimensions=getActiveMapDimensions();
        const distance=city=>{const p=worldToMapPoint(city);return Math.hypot(p.x-dimensions.width/2,p.y-dimensions.height/2);};
        window.captureFixture = state.cities.filter(city => city.owner === 'enemy' && !isStronghold(city)).sort((a,b)=>distance(a)-distance(b))[0];
        captureFixture.level = 150;
        captureFixture.ownerFlag = normalizeFlag({primary:'#7d3434',secondary:'#d6b96b',symbolColor:'#eee5cc',pattern:'quartered',symbol:'lion'},captureFixture.ownerUid);
        renderCities(true); zoom = 2; centerOnCity(captureFixture.id);
        CrownlandsAnimations.clearAll(); CrownlandsAnimations.setMode('full');
        window.captureBefore = {...getCityVfxSnapshot(captureFixture),ownerUid:'previous-ruler',ownerFlag:null};
        window.captureAfter = {...getCityVfxSnapshot(captureFixture),lastCapturedAtMs:Date.now()};
        window.startCaptureTest = id => playCityCaptureAnimation(captureBefore,captureAfter,{eventId:id});
        window.seekCaptureTest = time => {
          const effect = document.querySelector('.crownlands-vfx--city-capture');
          if (!effect) throw Error('Capture effect missing: '+JSON.stringify({mode:getEffectiveAnimationMode(),after:captureAfter,actual:cityById(captureAfter.id)?.ownerUid,target:!!cityLayer.querySelector('[data-city-id="'+captureAfter.id+'"]'),anchor:getWorldAnimationAnchor(captureFixture),seen:[...seenWorldAnimationEventIds.keys()],stats:CrownlandsAnimations.getDebugState()}));
          effect.getAnimations({subtree:true}).forEach(animation => {animation.pause();animation.currentTime=time;});
          return effect;
        };
      })()`);
      await delay(300);
      await evaluate("startCaptureTest('capture-full');startCaptureTest('capture-full')");
      for (let i=0;i<30 && !await evaluate("!!document.querySelector('.crownlands-vfx--city-capture')");i++) await delay(100);
      const full = await evaluate(`(() => {
        const effect=seekCaptureTest(610), flag=effect.querySelector('.capture-owner-cloth');
        const sword=effect.querySelector('.crownlands-vfx__part--capture-sword-left');
        const art=cityLayer.querySelector('[data-city-id="'+captureFixture.id+'"] .city-art');
        const a=art.getBoundingClientRect(), b=effect.getBoundingClientRect();
        return {count:document.querySelectorAll('.crownlands-vfx--city-capture').length,swords:effect.querySelectorAll('[class*="__part--capture-sword-"]').length,
          swordOpacity:Number(getComputedStyle(sword).opacity),symbol:flag.querySelector('.flag-symbol').dataset.flagSymbol,
          expectedSymbol:normalizeFlag(captureAfter.ownerFlag,captureAfter.ownerUid).symbol,
          primary:flag.style.getPropertyValue('--flag-primary'),expectedPrimary:captureAfter.ownerFlag.primary,
          pattern:flag.classList.contains('pattern-'+captureAfter.ownerFlag.pattern),stableKey:flag.dataset.flagStableKey,ownerUid:captureAfter.ownerUid,
          sizeDelta:Math.abs(a.width-b.width),centerDelta:Math.abs(a.x+a.width/2-b.x-b.width/2)+Math.abs(a.y+a.height/2-b.y-b.height/2),
          pointerEvents:getComputedStyle(effect).pointerEvents,ariaHidden:effect.getAttribute('aria-hidden'),duration:effect.style.getPropertyValue('--vfx-duration')};
      })()`);
      assert.equal(full.count, 1, "Duplicate capture receipts must coalesce.");
      assert.equal(full.swords, 2); assert(full.swordOpacity > .9);
      assert.equal(full.symbol, full.expectedSymbol); assert.equal(full.primary, full.expectedPrimary);
      assert(full.pattern); assert.equal(full.stableKey, full.ownerUid);
      assert(full.sizeDelta < 2 && full.centerDelta < 2, JSON.stringify(full));
      assert.equal(full.pointerEvents, "none"); assert.equal(full.ariaHidden, "true"); assert.equal(full.duration, "4000ms");
      let shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `clash-${width}x${height}.png`), Buffer.from(shot.data, "base64"));
      const drape = await evaluate(`(() => {const effect=seekCaptureTest(2800),d=effect.querySelector('.crownlands-vfx__part--capture-drape');return {opacity:getComputedStyle(d).opacity,clip:getComputedStyle(d).clipPath,swordOpacity:getComputedStyle(effect.querySelector('.crownlands-vfx__part--capture-sword-left')).opacity};})()`);
      assert.equal(drape.opacity, "1"); assert.match(drape.clip, /^inset\((?:0(?:px|%)?\s*)+\)$/); assert.equal(drape.swordOpacity, "0");
      shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `drape-${width}x${height}.png`), Buffer.from(shot.data, "base64"));
      await evaluate("CrownlandsAnimations.cancelScope('map:'+captureAfter.regionId)");
      assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-capture').length"), 0);
      assert.equal(await evaluate("mapVfxLayer.classList.contains('crownlands-capture-active')"), false);
      await evaluate("CrownlandsAnimations.setMode('reduced');startCaptureTest('capture-reduced')");
      for (let i=0;i<30 && !await evaluate("!!document.querySelector('.crownlands-vfx--city-capture')");i++) await delay(50);
      const reduced = await evaluate(`(() => {const effect=seekCaptureTest(200);return {swords:effect.querySelectorAll('[class*="__part--capture-sword-"]').length,particles:effect.querySelectorAll('.crownlands-vfx__particle').length,clothAnimation:getComputedStyle(effect.querySelector('.capture-owner-cloth')).animationName,duration:effect.style.getPropertyValue('--vfx-duration'),flag:!!effect.querySelector('.flag-symbol svg')};})()`);
      assert.deepEqual(reduced, {swords:0,particles:0,clothAnimation:"none",duration:"520ms",flag:true});
      await delay(850);
      assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-capture').length"), 0, "Capture watchdog must remove nodes.");
      await evaluate("CrownlandsAnimations.setMode('off');startCaptureTest('capture-off')");
      await delay(280);
      assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-capture').length"), 0);
      // Hydration, old events, Deed awards, other maps and superseded owners never animate.
      await evaluate(`(() => {
        CrownlandsAnimations.setMode('full');
        const previous=new Map([[captureFixture.id,captureBefore]]);
        emitOnlineCityStateAnimations(previous,[{...captureFixture,lastCapturedAtMs:Date.now()}],false);
        emitOnlineCityStateAnimations(previous,[{...captureFixture,lastCapturedAtMs:Date.now()-120000}],true);
        playCityCaptureAnimation(captureBefore,{...captureAfter,neutralClaimSource:'deed_camp'},{eventId:'deed'});
        playCityCaptureAnimation(captureBefore,{...captureAfter,regionId:'another-map'},{eventId:'elsewhere'});
        playCityCaptureAnimation(captureBefore,{...captureAfter,ownerUid:'superseded-owner'},{eventId:'superseded'});
      })()`);
      await delay(300);
      assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-capture').length"), 0);
      await evaluate("CrownlandsAnimations.setMode('auto')");
      await client.send("Emulation.setEmulatedMedia", { features: [{name:"prefers-reduced-motion",value:"reduce"}] });
      assert.equal(await evaluate("CrownlandsAnimations.getEffectiveMode()"), "reduced");
      await client.send("Emulation.setEmulatedMedia", { features: [{name:"prefers-reduced-motion",value:"no-preference"}] });
      results.push({width,height,full,drape,reduced});
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,"validation.json"),JSON.stringify({results,errors},null,2));
    console.log("Castle capture passed: saved heraldry, sword/drape timing, map anchoring, deduplication, stale-event guards, motion modes and cleanup at three viewports.");
  } finally {
    if (client) {await client.send("Browser.close").catch(()=>{});client.close();}
    if (session) {if (!await waitForProcessExit(session.browserProcess)) {session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().then(() => {
  if (process.env.CROWNLANDS_BENCHMARK_ROOT) return;
  const dist = path.resolve(__dirname, "../dist");
  assert(fs.existsSync(path.join(dist, "animation-manager.js")), "Build the production client before checking its delivered animation.");
  const result = spawnSync(process.execPath, [__filename], { stdio: "inherit", windowsHide: true,
    env: { ...process.env, CROWNLANDS_BENCHMARK_ROOT: dist } });
  assert.equal(result.status, 0, "The shipped animation must pass the same capture behavior checks.");
}).catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
