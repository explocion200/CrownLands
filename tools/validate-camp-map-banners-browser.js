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
  const artwork = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../docs/visual-qa/camp-artwork-v3/assets.json"), "utf8")).assets;
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
      campBannerQa.readFlag = (rawFlag, uid) => {
        const banner = cityLayer.querySelector(".camp-map-banner");
        const slot = banner.querySelector(".camp-type-flag, .camp-holder-flag");
        const flag = banner.querySelector(".city-kingdom-flag");
        const normalized = uid ? normalizeFlag(rawFlag, uid) : null;
        return {
          width: slot.offsetWidth, height: slot.offsetHeight,
          typeSrc: banner.querySelector(".camp-type-flag")?.getAttribute("src") || null,
          actual: flag ? {
            uid: flag.dataset.flagStableKey,
            primary: flag.style.getPropertyValue("--flag-primary"),
            secondary: flag.style.getPropertyValue("--flag-secondary"),
            symbolColor: flag.style.getPropertyValue("--flag-symbol-color"),
            pattern: [...flag.classList].find(c => c.startsWith("pattern-"))?.slice(8),
            symbol: flag.querySelector(".flag-symbol").dataset.flagSymbol,
          } : null,
          expected: normalized ? {uid, primary:normalized.primary, secondary:normalized.secondary,
            symbolColor:normalized.symbolColor, pattern:normalized.pattern, symbol:normalized.symbol} : null,
        };
      };
      if (campBannerQa.camps.some(c => !c.id || !c.regionId.startsWith("core-v2-"))) throw Error("Current Core camp fixtures required");
      // Isolated visual fixture: relocate one real type at a time to the active
      // map, without subscriptions or production writes.
      WORLD_CAMPS.length = 0; WORLD_CAMPS_BY_ID.clear(); onlineCampStates.clear();
      requestDueRewardCampPayout = async () => false;
    });
    const flagAssets = await ev(async () => {
      const results = [];
      for (const type of ["gold", "troops", "items", "deed"]) {
        const img = new Image();
        img.src = `/assets/icons/camps/camp-${type}-v2.webp`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let transparent = 0, nearOpaque = 0;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] === 0) transparent++;
          if (pixels[i] >= 245) nearOpaque++;
        }
        results.push({type, width:img.naturalWidth, height:img.naturalHeight, transparent, nearOpaque});
      }
      return results;
    });
    for (const flag of flagAssets) {
      assert.equal(flag.width, 84); assert.equal(flag.height, 106);
      assert(flag.transparent > 0 && flag.nearOpaque > flag.width * flag.height * .3, JSON.stringify(flag));
    }
    for (const asset of artwork) {
      const decoded = await ev(`(async () => {
        const img=new Image(); img.src=${JSON.stringify(asset.output)}; await img.decode();
        const canvas=document.createElement("canvas"); canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
        const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,384,384).data;
        let clearFloor=0;for(let y=193;y<384;y++)for(let x=0;x<384;x++)if(pixels[(y*384+x)*4+3]<16)clearFloor++;
        return {size:[img.naturalWidth,img.naturalHeight],clearFloor:clearFloor/(191*384)};
      })()`);
      assert.deepEqual(decoded.size, [384,384], "Camp art must decode at its bounded delivery size");
      assert(decoded.clearFloor > .55, "Actual map ground must show through most of the camp floor");
      const atlas = await ev(`(() => {
        const regions=REGION_CATALOG.regions.filter(region=>region.artPresentation?.landmarks?.some(item=>item.kind==="camp"&&item.asset===${JSON.stringify(asset.output)}));
        return regions.map(region=>{
          const node=document.createElement("div");
          node.innerHTML=renderIllustratedMapThumbnail(region.id,region.thumbnailAsset);
          return [...node.querySelectorAll(".map-thumbnail-landmark")].some(img=>img.getAttribute("href")===${JSON.stringify(asset.output)});
        });
      })()`);
      assert(atlas.length > 0 && atlas.every(Boolean), "Atlas previews must use the approved camp painting");
    }
    // Decode the shipped ground images, not just the geometry receipts: every
    // sampled road center must remain visible after compositing and WebP encoding.
    const roadProof = JSON.parse(fs.readFileSync(path.resolve(__dirname, "map-art/clearance.json"), "utf8"));
    const groundChecks = await ev(`(async () => {
      const checks=[];
      for(const map of ${JSON.stringify(roadProof.maps.map(map=>({id:map.id,roads:map.roads.map(road=>road.filter((_,i)=>i%4===0))})))}) {
        const summary=REGION_CATALOG.regions.find(r=>r.id===map.id), img=new Image();
        img.src=summary.mapAsset;await img.decode();
        const canvas=document.createElement("canvas");canvas.width=1448;canvas.height=1086;
        const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);
        const pixels=ctx.getImageData(0,0,1448,1086).data;let missed=0,total=0;
        for(const road of map.roads)for(const [x,y] of road){
          const at=(Math.min(1085,Math.max(0,Math.round(y)))*1448+Math.min(1447,Math.max(0,Math.round(x))))*4;
          const [r,g,b]=pixels.slice(at,at+3);total++;
          // Painted earth includes darker grit; distinguish its subdued tan
          // chroma from the much greener/yellower meadow, not one flat RGB fill.
          if(!(r>g+12&&g>b+25&&g-b<75&&r+g+b>290))missed++;
        }
        checks.push({id:map.id,width:img.naturalWidth,height:img.naturalHeight,total,missed});
      }
      return checks;
    })()`);
    assert.equal(groundChecks.length,81);
    for(const check of groundChecks){
      assert.equal(check.width,1448);assert.equal(check.height,1086);
      assert.equal(check.missed,0,`Missing visible road samples: ${JSON.stringify(check)}`);
    }
    // The installed server still carries the original presentation paths.
    // Exercise its real descriptor shape, twice, as at login and realm refresh.
    const oldRegions = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../functions/core-expansion-region-catalog.json"), "utf8"))
      .regions.filter(region => region.artPresentation?.landmarks?.some(item => item.kind === "camp"));
    const refreshedAtlas = await ev(`(() => {
      const descriptors=${JSON.stringify(oldRegions)};
      descriptors[0].artPresentation.landmarks.find(item=>item.kind==="camp").x+=1;
      registerCoreExpansionRegions(descriptors); registerCoreExpansionRegions(descriptors);
      return descriptors.map(region=>{
        const before=region.artPresentation.landmarks.find(item=>item.kind==="camp");
        const current=getIllustratedMapPresentation(region.id).landmarks.find(item=>item.id===before.id);
        return {old:before.asset,paint:current.asset,x:current.x,expectedX:before.x,
          preview:renderIllustratedMapThumbnail(region.id,region.thumbnailAsset)};
      });
    })()`);
    assert.equal(refreshedAtlas.length, 12);
    for (const refreshed of refreshedAtlas) {
      const asset = artwork.find(item => item.replaces === refreshed.old);
      assert(asset);
      assert.equal(refreshed.paint, asset.output);
      assert.equal(refreshed.x, refreshed.expectedX, "Server position updates must still apply");
      assert(refreshed.preview.includes(asset.output) && !refreshed.preview.includes(asset.replaces));
    }
    const verifyFlag = flag => {
      assert.equal(flag.width, 42); assert.equal(flag.height, 53);
      assert.deepEqual(flag.actual, flag.expected, "Camp must display the current holder's actual heraldry");
      assert.equal(Boolean(flag.typeSrc), !flag.expected, "Type banner is only for neutral camps");
    };
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
            r = label.getBoundingClientRect(), a = art.getBoundingClientRect(),
            snapshot = onlineCampStates.get(campBannerQa.current.id),
            typeFlag = n.querySelector(".camp-type-flag");
          return { text:label.innerText, above:r.bottom <= a.top + 13 * zoom,
            inside:r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight,
            width:label.offsetWidth, height:label.offsetHeight,
            flag:campBannerQa.readFlag(snapshot.holderUid === campBannerQa.uid ? state.flag : snapshot.holderFlag, snapshot.holderUid),
            flagLoaded:!typeFlag || (typeFlag.complete && typeFlag.naturalWidth === 84),
            ownerFlags:n.querySelectorAll(".camp-owner-marker").length,
            timerHidden:timer.hidden, timer:timer.innerText, hasDeedRing:Boolean(n.querySelector(".deed-hold-ring")),
            bounds:r.toJSON(), art:a.toJSON() };
        });
        assert(layout.above && layout.inside && layout.width<=220 && layout.height<=54, JSON.stringify(layout));
        verifyFlag(layout.flag);
        if(mode==="neutral") assert(layout.flag.typeSrc.endsWith(`camp-${["gold","troops","items","deed"][i]}-v2.webp`));
        assert(layout.flagLoaded, "Camp flag did not load");
        const painting = artwork.find(a => a.type === ["gold","troops","items","deed"][i]);
        assert.equal(await ev('cityLayer.querySelector(".camp-node .camp-art").getAttribute("src")'), painting.output);
        assert.equal(layout.timerHidden, mode==="neutral"); assert.equal(layout.ownerFlags, 0, "Small owner flag must remain removed");
        assert.equal(layout.hasDeedRing, i===3);
        if(mode==="contested") assert(/contested/i.test(layout.timer));
        // Compare against an actual castle in the same scene: sharing a few
        // class names is not enough if camp-specific overrides change the UI.
        const comparison = await ev(() => {
          const camp = cityLayer.querySelector(".camp-map-banner");
          const castle = cityLayer.querySelector(".city-node.player .player-city-label");
          if (!castle) throw Error("Player-castle reference missing");
          const paint = (root, selector, properties) => {
            const style = getComputedStyle(root.querySelector(selector));
            return Object.fromEntries(properties.map(p => [p, style[p]]));
          };
          const text = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "textShadow", "padding"];
          const checks = [
            [".city-ruler-name", text], [".city-name", text],
            [".player-city-banner", ["display", "columnGap", "alignItems"]],
            [".player-city-data", ["display", "rowGap", "justifyItems", "alignContent"]],
            [".city-army-count", ["fontFamily", "fontSize", "fontWeight", "lineHeight", "padding", "minWidth"]],
          ];
          const target = getCampTargetById(campBannerQa.current.id);
          if (target.ownerUid) {
            checks.push(
              [".city-owner-column", ["width", "minHeight", "padding", "display", "justifyItems", "alignContent", "gap", "clipPath"]],
              [".city-owner-flag", ["width", "height", "borderRadius", "borderWidth", "fontSize", "display", "placeItems"]],
              [".city-owner-flag .flag-symbol", ["fontSize"]],
            );
          }
          return {
            pairs: checks.map(([selector, properties]) => ({selector, camp:paint(camp, selector, properties), castle:paint(castle, selector, properties)})),
            frameColor: target.ownerUid ? getComputedStyle(camp.querySelector(".city-owner-column")).backgroundColor : null,
            timerColor: target.ownerUid ? getComputedStyle(camp.querySelector(".city-army-count")).backgroundColor : null,
            levelCount: camp.querySelectorAll(".city-label-level").length,
            name: camp.querySelector(".city-name").textContent, expectedName: target.name,
            ruler: camp.querySelector(".city-ruler-name").textContent,
            expectedRuler: target.ownerUid ? getCityOwnerDisplayName(target) : "Neutral camp",
            rows: [...camp.querySelector(".player-city-data").children].map(n => n.className),
          };
        });
        for (const pair of comparison.pairs) assert.deepEqual(pair.camp, pair.castle, `Castle display mismatch: ${pair.selector}`);
        assert.equal(comparison.frameColor, comparison.timerColor, "Camp flag frame must match the existing relationship color");
        assert.equal(comparison.levelCount, 0, "Camps must not acquire a city level");
        assert.equal(comparison.name, comparison.expectedName);
        assert.equal(comparison.ruler, comparison.expectedRuler);
        assert.deepEqual(comparison.rows, ["city-ruler-row", "city-name", "gold-camp-active-timer city-army-count"]);
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
        // Real camp windows and both compact UI renderers must use the same
        // painting, including an old held snapshot received before map loading.
        const surfaces = await ev(`(async () => {
          const id=campBannerQa.current.id, old=${JSON.stringify(painting.replaces)};
          const saved=WORLD_CAMPS_BY_ID.get(id), snapshot=onlineCampStates.get(id);
          onlineHeldCampStates.set(id,{...saved,...snapshot,artSrc:old});
          WORLD_CAMPS_BY_ID.delete(id);
          const held=getCampTargetById(id);
          WORLD_CAMPS_BY_ID.set(id,saved); onlineHeldCampStates.delete(id);
          const detached=document.createElement("div");
          detached.innerHTML=renderHeldCampView(held)+renderTroopOrderLocation(held,"To","",false);
          const sources=[held.artSrc,...[...detached.querySelectorAll(".camp-art,.location-art")].map(img=>img.getAttribute("src"))];
          showRewardCampInfoModal(id);
          const portrait=modalBody.querySelector(".camp-portrait img"); await portrait.decode();
          sources.push(portrait.getAttribute("src"));
          const b=modal.getBoundingClientRect();
          return {sources,overflow:modalBody.scrollWidth-modalBody.clientWidth,
            inside:b.left>=-1&&b.top>=-1&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1};
        })()`);
        assert.deepEqual(surfaces.sources, Array(4).fill(painting.output));
        assert(surfaces.inside && surfaces.overflow <= 1, JSON.stringify(surfaces));
        await delay(250); // Capture the completed modal entrance transition.
        const detailShot=await client.send("Page.captureScreenshot",{format:"png"});
        fs.writeFileSync(path.join(output,`details-${painting.type}-${width}.png`),Buffer.from(detailShot.data,"base64"));
        await ev('modal.close()');
        // Countdown ticks keep the same flag/banner DOM and update only text.
        await ev(() => {
          campBannerQa.node = cityLayer.querySelector(".camp-map-banner");
          const c=onlineCampStates.get(campBannerQa.current.id);
          c.payoutAtMs=Date.now()+65000; updateVisibleCityDynamicText();
        });
        assert(await ev('campBannerQa.node === cityLayer.querySelector(".camp-map-banner")'));
        if(mode!=="neutral") assert.equal(await ev('cityLayer.querySelector(".gold-camp-active-timer strong").textContent'), await ev('formatDuration(65)'));
        // Exercise capture/transfer and a later profile-flag edit through normal
        // render invalidation, without forcing the renderer or reloading the map.
        const transferred = await ev(() => {
          const c = onlineCampStates.get(campBannerQa.current.id);
          c.holderUid = "fixture-next-holder"; c.holderName = "Next ruler"; c.state = "held";
          c.holderFlag = {...c.holderFlag, primary:"#6E3038", secondary:"#F2E2BF", pattern:"cross", symbol:"crown"};
          playerIdentityCache.delete(c.holderUid);
          renderCities();
          return campBannerQa.readFlag(c.holderFlag, c.holderUid);
        });
        verifyFlag(transferred);
        const refreshed = await ev(() => {
          const c = onlineCampStates.get(campBannerQa.current.id);
          const flag = {...c.holderFlag, primary:"#315A8A", pattern:"diagonal", symbol:"lion"};
          rememberPlayerIdentity({uid:c.holderUid, playerName:"Next ruler", flag, updatedAtMs:Date.now()}, {force:true});
          renderCities();
          return campBannerQa.readFlag(flag, c.holderUid);
        });
        verifyFlag(refreshed);
        assert.notDeepEqual(refreshed.actual, transferred.actual, "Changed holder heraldry must repaint");
        await ev(() => {
          const c=onlineCampStates.get(campBannerQa.current.id); c.holderUid="";c.state="neutral";renderCities();
        });
        const neutralFlag = await ev('campBannerQa.readFlag(null, "")');
        verifyFlag(neutralFlag);
        assert(neutralFlag.typeSrc.endsWith(`camp-${["gold","troops","items","deed"][i]}-v2.webp`));
        assert.equal(await ev('document.querySelectorAll(".camp-owner-marker").length'),0,"Stale owner flag after neutral reset");
        assert(await ev('cityLayer.querySelector(".gold-camp-active-timer").hidden'));
        results.push({viewportWidth:width,viewportHeight:height,mode,...layout,castleStyleMatch:true});
      }
      // Both ends of normal map zoom retain an anchored, selectable type banner.
      for(const z of [.4,1]) {
        await ev(`zoom=clampZoomForViewport(${z}); centerOnWorldPoint({x:campBannerQa.current.x,y:campBannerQa.current.y-40}); renderCities(true);`);
        await delay(100);
        assert(await ev('cityLayer.querySelector(".camp-map-banner").getBoundingClientRect().bottom <= cityLayer.querySelector(".camp-art").getBoundingClientRect().top+13*zoom'));
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({results,flagAssets,groundChecks,errors},null,2));
    console.log("Camp banners: neutral type artwork, holder heraldry, capture/transfer/profile edits/neutral reset, no small pole flag, castle layout, desktop/landscape, countdown reuse, selection and zoom passed.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess))browser.browserProcess.kill();await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
