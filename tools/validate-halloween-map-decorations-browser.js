"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.resolve(__dirname, "../release-artifacts/halloween-map-decorations");
  fs.mkdirSync(output, { recursive: true });
  const results = [], errors = [], requests = [];
  let browser, client;
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.halloweenTestMonth=10;Date.prototype.getUTCMonth=function(){return window.halloweenTestMonth;}" });
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Network.requestWillBeSent", event => { if (event.request.url.includes("/assets/optimized/halloween-map-")) requests.push(event.request.url); });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 300; i++) { if (await evaluate(expression)) return; await delay(50); }
      throw Error("Timed out: " + expression);
    };
    for (const [width, height] of [[1440, 900], [844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      requests.length = 0;
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready' && mapBg.querySelector('.island-art-map.active') && !isMapInteractionBlocked()");
      assert.equal(requests.length, 0, "No seasonal bytes should load outside October");
      await evaluate("__CROWNLANDS_BENCHMARK__.closeModal();halloweenTestMonth=9;renderHalloweenMapDecorations(getActiveMapRegionId(),mapImageSwapToken)");
      await wait("!!mapBg.querySelector('.halloween-map-decorations img')");
      const ids = await evaluate("(()=>{const ids=[...REGION_CATALOG_SUMMARIES_BY_ID.keys()].filter(id=>/aurum-keep|crown-citadel|north-west-holding|warband-camp/.test(id)).concat(['new-lands-l01-p001','new-lands-l02-p032']);applyCoreExpansionRealmState({coreExpansion:{activeRegionIds:ids.filter(id=>id.startsWith('new-lands-'))}});return ids;})()");
      const traversal = [];
      for (const id of ids) {
        await wait("!isMapInteractionBlocked()");
        await evaluate(`(async()=>{
          const id=${JSON.stringify(id)}, fixture=__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
          await ensureRegionDefinitionLoaded(id);
          fixture.citiesByRegion[id]=getPlayableBaseCitiesByRegion(id).map(base=>({...createNeutralCityFromBase(base),level:125}));
          if(id!==getActiveMapRegionId() && !await switchOnlineIsland(id,{fromMapPicker:true}))throw Error('Could not switch map '+id+' from '+getActiveMapRegionId());
        })()`);
        await wait(`!isMapInteractionBlocked() && mapBg.querySelector('.halloween-map-decorations')?.dataset.regionId===${JSON.stringify(id)}`);
        const check = await evaluate(`(async()=>{
          const layer=mapBg.querySelector('.halloween-map-decorations');
          await Promise.all([...layer.children].map(image=>image.decode()));
          renderCities(true);
          const props=[...layer.children];
          const decodedBytes=[...new Map(props.map(p=>[p.src,p.naturalWidth*p.naturalHeight*4])).values()].reduce((sum,bytes)=>sum+bytes,0);
          const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
          const boxes=[...cityLayer.querySelectorAll('.city-castle,.stronghold-building,.holding-tower-node'),...mapBg.querySelectorAll('.illustrated-map-scenery:not(.halloween-map-decorations) img')].map(rect);
          const collides=(a,b)=>a.w>0&&b.w>0&&a.h>0&&b.h>0&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
          return {count:props.length,variety:new Set(props.map(p=>p.getAttribute('src'))).size,decodedBytes,missing:props.filter(p=>!p.naturalWidth).length,animations:layer.getAnimations({subtree:true}).length,
            overlaps:props.flatMap(p=>boxes.filter(b=>collides(rect(p),b))).length,
            clicks:props.every(p=>getComputedStyle(p).pointerEvents==='none'),layers:mapBg.querySelectorAll('.halloween-map-decorations').length};
        })()`);
        assert(check.count >= 1 && check.count <= 24, JSON.stringify({ id, check }));
        assert.equal(check.variety, 7, `${id}: all seven prop types should be present`);
        assert(check.decodedBytes <= 768 * 1024, `${id}: decoded decoration textures exceed the existing three-sprite 256px budget`);
        assert.equal(check.missing, 0); assert.equal(check.animations, 0); assert.equal(check.overlaps, 0, `${id}: decoration covers scenery or maximum city art`);
        assert(check.clicks); assert.equal(check.layers, 1);
        traversal.push({ id, ...check });
      }
      const behavior = await evaluate(`(async()=>{
        const assert=(ok,message)=>{if(!ok)throw Error(message)};
        const region=getActiveMapRegionId(), layer=mapBg.querySelector('.halloween-map-decorations'), image=layer.firstElementChild;
        assert(layer.children.length===24,'Expected full density for motion check');
        const props=[...layer.children], origin={x:camera.x,y:camera.y,zoom};
        const visibleCount=()=>props.filter(prop=>{const style=getComputedStyle(prop);return style.visibility==='visible'&&style.display!=='none'&&Number(style.opacity)>0}).length;
        let motionMutations=0;
        const motionObserver=new MutationObserver(records=>{motionMutations+=records.length});motionObserver.observe(layer,{subtree:true,attributes:true,childList:true});
        const motion=[];
        for(let cycle=0;cycle<2;cycle++)for(const zooming of [false,true]){
          const counts=[];
          for(let frame=0;frame<12;frame++){
            camera.x=origin.x+Math.sin(frame/12*Math.PI*2)*120;
            camera.y=origin.y+Math.cos(frame/12*Math.PI*2)*80;
            zoom=origin.zoom+(zooming?Math.sin(frame/12*Math.PI*2)*.08:0);
            markCameraInteraction({zooming});updateCameraTransform();
            await new Promise(requestAnimationFrame);
            counts.push(visibleCount());
          }
          assert(counts.every(count=>count===24),'Decorations disappeared during '+(zooming?'zoom':'pan'));
          camera.x=origin.x;camera.y=origin.y;zoom=origin.zoom;updateCameraTransform();
          await new Promise(resolve=>setTimeout(resolve,500));
          assert(!isCameraInteractionActive(),'Camera did not settle');
          assert(visibleCount()===24,'Decorations changed after movement settled');
          assert(props.every((prop,index)=>layer.children[index]===prop),'Camera movement replaced decoration nodes');
          motion.push({cycle,zooming,minVisible:Math.min(...counts),settledVisible:visibleCount()});
        }
        assert(motionMutations+motionObserver.takeRecords().length===0,'Camera movement mutates static decorations');motionObserver.disconnect();
        const box=image.halloweenBounds, original=getActiveHarvestBonuses;
        getActiveHarvestBonuses=id=>id===region?[{x:(box.left+box.right)/2,y:(box.top+box.bottom)/2}]:[];
        refreshHalloweenDecorationVisibility();
        assert(image.hidden&&getComputedStyle(image).display==='none','Pickup did not suppress overlapping prop');
        markCameraInteraction({zooming:true});
        assert(image.hidden&&getComputedStyle(image).display==='none','Camera movement exposed a prop behind a pickup');
        getActiveHarvestBonuses=original;refreshHalloweenDecorationVisibility();assert(!image.hidden,'Prop did not recover');
        const observer=new MutationObserver(()=>{});observer.observe(layer,{subtree:true,attributes:true,childList:true});
        const start=performance.now();for(let i=0;i<1000;i++)refreshHalloweenDecorationVisibility();const refreshMs=performance.now()-start;
        assert(observer.takeRecords().length===0,'Idle refresh mutates static scenery');observer.disconnect();
        const originalLoad=loadHalloweenMapLayouts;let release;
        loadHalloweenMapLayouts=()=>new Promise(resolve=>{release=resolve});
        const pending=renderHalloweenMapDecorations(region,mapImageSwapToken);mapImageSwapToken++;
        release(await originalLoad());await pending;assert(mapBg.querySelector('.halloween-map-decorations')===layer,'Stale art replaced current layer');
        loadHalloweenMapLayouts=originalLoad;
        const layouts=await originalLoad();
        const originalSummary=REGION_CATALOG_SUMMARIES_BY_ID.get(region), existing=layouts.maps[region];
        delete layouts.maps[region];REGION_CATALOG_SUMMARIES_BY_ID.set(region,{...originalSummary,templateRegionId:'new-lands-l02-p032'});
        await renderHalloweenMapDecorations(region,mapImageSwapToken);
        assert(mapBg.querySelector('.halloween-map-decorations img'),'Generated map did not inherit prepared template');
        layouts.maps[region]=existing;REGION_CATALOG_SUMMARIES_BY_ID.set(region,originalSummary);
        const nativeFetch=window.fetch;halloweenMapLayoutPromise=null;window.fetch=async()=>({ok:false});
        assert(await loadHalloweenMapLayouts()===null && halloweenMapLayoutPromise===null,'Missing layout did not fail open and permit retry');
        window.fetch=nativeFetch;assert(await loadHalloweenMapLayouts(),'Layout retry failed');
        await renderHalloweenMapDecorations(region,mapImageSwapToken);
        const failed=mapBg.querySelector('.halloween-map-decorations img');failed.onerror();assert(!failed.isConnected,'Broken art remains on map');
        halloweenTestMonth=10;refreshHalloweenDecorationVisibility();assert(!mapBg.querySelector('.halloween-map-decorations'),'Season end leaves decorations');
        halloweenTestMonth=9;await renderHalloweenMapDecorations(region,mapImageSwapToken);
        setZoomAroundPoint(1.5,innerWidth/2,innerHeight/2);
        const focus=mapBg.querySelector('.halloween-map-decorations img[src*="cauldron"]').halloweenBounds;
        centerOnWorldPoint({x:(focus.left+focus.right)/2,y:(focus.top+focus.bottom)/2},region);
        await Promise.all([...mapBg.querySelectorAll('.halloween-map-decorations img')].map(image=>image.decode()));
        return {refreshMs,mutations:0,motion,staleMap:true,template:true,optionalFailure:true,seasonEnd:true,pickup:true};
      })()`);
      await delay(500);
      await evaluate("markCameraInteraction({zooming:true,settleMs:2000})");
      const movingShot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `map-${width}-moving.png`), Buffer.from(movingShot.data, "base64"));
      await wait("!isCameraInteractionActive()");
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `map-${width}.png`), Buffer.from(shot.data, "base64"));
      results.push({ width, height, traversal, behavior });
      console.log(`PASS ${width}x${height}: ${traversal.length} maps, clear max-stage cities, static/click-through art, lazy loading, pickup clearance, season and stale-map guards.`);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "validation.json"), JSON.stringify({ results, errors }, null, 2));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
