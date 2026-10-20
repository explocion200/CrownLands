"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "Chromium required");
  const output = path.resolve(__dirname, "../release-artifacts/camp-map-banners");
  fs.mkdirSync(output, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client; const errors = [], results = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const ev = async expression => {
      const r = await client.send("Runtime.evaluate", { expression: typeof expression === "function" ? `(${expression})()` : expression, awaitPromise: true, returnByValue: true });
      assert(!r.exceptionDetails, r.exceptionDetails?.exception?.description || r.exceptionDetails?.text);
      return r.result.value;
    };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    for (let i = 0; i < 300 && !await ev('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'); i++) await delay(100);
    assert(await ev('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'));
    await ev(() => {
      __CROWNLANDS_BENCHMARK__.closeModal(); clearOnlineServerReportWatcher();
      // The benchmark bypasses the login gesture. Model an already entered
      // game so touch selection does not also request first-entry fullscreen.
      gameDisplayEntryRequested = true;
      window.campBannerQa = {
        camps: ["gold", "troops", "items", "deed"].map(type => ({ ...WORLD_CAMPS[0], ...getCampConfigForType(type), id: "camp-banner-qa-" + type, campType: type })),
        anchor: { ...playerCities()[0] }, uid: getCurrentOnlineUid(),
      };
      if (campBannerQa.camps.some(c => !c.id || !c.regionId.startsWith("core-v2-"))) throw Error("Current Core camp fixtures required");
      // Isolated visual fixture: relocate one real type at a time to the active
      // map, without subscriptions or production writes.
      WORLD_CAMPS.length = 0; WORLD_CAMPS_BY_ID.clear(); onlineCampStates.clear();
      requestDueRewardCampPayout = async () => false;
    });
    const sprite = await ev('fetch("/assets/icons/camp-type-flags-v1.svg").then(r => {if (!r.ok) throw Error("Missing flags"); return r.text();})');
    for (const type of ["gold", "troops", "items", "deed"]) assert(sprite.includes(`id="${type}"`));
    assert(!/<script|<image|https?:\/\/(?!www.w3.org)/i.test(sprite), "Flags must be self-contained vector artwork");
    for (const [width, height] of [[1440,900], [844,390], [568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const [i, mode] of ["neutral", "player", "rival", "contested"].entries()) {
        await ev(`(() => {
          const q = campBannerQa, base = q.camps[${i}], camp = {...base, regionId:getActiveMapRegionId(), x:q.anchor.x+160, y:q.anchor.y, size:132};
          q.current = camp; WORLD_CAMPS.splice(0,WORLD_CAMPS.length,camp); WORLD_CAMPS_BY_ID.clear(); WORLD_CAMPS_BY_ID.set(camp.id,camp);
          onlineCampStates.clear(); onlineCampStates.set(camp.id, {
            holderUid:${JSON.stringify(mode)} === "neutral" ? "" : ${JSON.stringify(mode)} === "player" ? q.uid : "fixture-camp-ruler",
            holderName:"Camp ruler", holderFlag:{version:2,primary:"#315A8A",secondary:"#C69A45",symbolColor:"#F2E2BF",pattern:"split",symbol:"lion"},
            currentGarrison:20000, heldSinceMs:Date.now()-300000,payoutAtMs:Date.now()+300000,
            payoutPending:true,state:${JSON.stringify(mode)} === "contested" ? "contested" : "held"
          });
          selectedSourceId=null; selectedTargetId=null; sendMode=false;
          zoom=clampZoomForViewport(1); centerOnWorldPoint({x:camp.x,y:camp.y-40});
          cityRenderSignature=""; renderCities(true);
        })()`);
        await delay(180);
        const layout = await ev(() => {
          const n = cityLayer.querySelector(".camp-node"), label = n.querySelector(".camp-map-banner"),
            art = n.querySelector(".camp-art"), timer = n.querySelector(".gold-camp-active-timer"),
            r = label.getBoundingClientRect(), a = art.getBoundingClientRect();
          return { text:label.innerText, above:r.bottom <= a.top + 13 * zoom,
            inside:r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight,
            width:label.offsetWidth, height:label.offsetHeight, flag:n.querySelector(".camp-type-flag use").getAttribute("href"),
            ownerFlags:n.querySelectorAll(".camp-owner-marker .city-kingdom-flag").length,
            timerHidden:timer.hidden, timer:timer.innerText, hasDeedRing:Boolean(n.querySelector(".deed-hold-ring")),
            bounds:r.toJSON(), art:a.toJSON() };
        });
        assert(layout.above && layout.inside && layout.width<=220 && layout.height<=54, JSON.stringify(layout));
        assert(layout.flag.endsWith("#" + ["gold","troops","items","deed"][i]));
        assert.equal(layout.timerHidden, mode==="neutral"); assert.equal(layout.ownerFlags, mode==="neutral"?0:1);
        assert.equal(layout.hasDeedRing, i===3);
        if(mode==="contested") assert(/contested/i.test(layout.timer));
        const click = await ev(() => {
          const n=cityLayer.querySelector(".camp-map-banner"), r=n.getBoundingClientRect();
          return {x:r.x+r.width/2,y:r.y+r.height/2};
        });
        if(height<600) {
          await client.send("Emulation.setTouchEmulationEnabled",{enabled:true});
          await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...click,id:1}]});
          await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
          await client.send("Emulation.setTouchEmulationEnabled",{enabled:false});
        } else {
          await client.send("Input.dispatchMouseEvent", {type:"mousePressed",...click,button:"left",clickCount:1});
          await client.send("Input.dispatchMouseEvent", {type:"mouseReleased",...click,button:"left",clickCount:1});
        }
        assert(await ev('selectedTargetId === campBannerQa.current.id'), "Camp banner must still select the camp");
        assert(await ev('Boolean(document.querySelector(".gold-camp-action-wheel .camp-info-action"))'), "Camp actions missing");
        const shot=await client.send("Page.captureScreenshot",{format:"png"});
        fs.writeFileSync(path.join(output,`${["gold","troops","items","deed"][i]}-${width}.png`),Buffer.from(shot.data,"base64"));
        // Countdown ticks keep the same flag/banner DOM and update only text.
        await ev(() => {
          campBannerQa.node = cityLayer.querySelector(".camp-map-banner");
          const c=onlineCampStates.get(campBannerQa.current.id);
          c.payoutAtMs=Date.now()+65000; updateVisibleCityDynamicText();
        });
        assert(await ev('campBannerQa.node === cityLayer.querySelector(".camp-map-banner")'));
        if(mode!=="neutral") assert.equal(await ev('cityLayer.querySelector(".gold-camp-active-timer strong").textContent'), await ev('formatDuration(65)'));
        await ev(() => {
          const c=onlineCampStates.get(campBannerQa.current.id); c.holderUid="";c.state="neutral";renderCities(true);
        });
        assert.equal(await ev('document.querySelectorAll(".camp-owner-marker").length'),0,"Stale owner flag after neutral reset");
        assert(await ev('cityLayer.querySelector(".gold-camp-active-timer").hidden'));
        results.push({width,height,mode,...layout});
      }
      // Both ends of normal map zoom retain an anchored, selectable type banner.
      for(const z of [.4,1]) {
        await ev(`zoom=clampZoomForViewport(${z}); centerOnWorldPoint({x:campBannerQa.current.x,y:campBannerQa.current.y-40}); renderCities(true);`);
        await delay(100);
        assert(await ev('cityLayer.querySelector(".camp-map-banner").getBoundingClientRect().bottom <= cityLayer.querySelector(".camp-art").getBoundingClientRect().top+13*zoom'));
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({results,errors},null,2));
    console.log("Camp banners: four Core types, desktop/landscape, owner flags, neutral/held/contested/reset, countdown reuse, selection and zoom passed.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess))browser.browserProcess.kill();await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
