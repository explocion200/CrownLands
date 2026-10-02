"use strict";
// Real map navigation and rendering with loopback-only snapshots and delayed failures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.resolve(__dirname, "../release-artifacts/map-loading");
  fs.mkdirSync(output, {recursive:true});
  let browser, client;
  const results = [], errors = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", {expression, awaitPromise:true, returnByValue:true});
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let i=0;i<300;i++) { if (await evaluate(expression)) return; await delay(50); }
      throw Error("Timed out: " + expression);
    };
    const load = async () => {
      await client.send("Page.navigate", {url:address.url + "/__benchmark__/?scenario=A&visualMarches=0"});
      await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready' && !isMapInteractionBlocked()");
      await evaluate(`(() => {
        __CROWNLANDS_BENCHMARK__.closeModal();
        preloadNearbyIslandMaps=()=>{};
        const originalEnsure=ensureRegionDefinitionLoaded, originalArt=preloadIslandMap;
        const api={...getOnlineApi()}, originalSubscribe=api.subscribeIsland;
        getOnlineApi=()=>api;
        window.mapQa={origin:getActiveMapRegionId(),target:__CROWNLANDS_BENCHMARK_BOOTSTRAP__.neighborRegionId,definitionCalls:0,api};
        ensureRegionDefinitionLoaded=async(...args)=>{
          mapQa.definitionCalls++;
          if(mapQa.holdDefinition && args[0]===mapQa.target)await new Promise((resolve,reject)=>{mapQa.releaseDefinition=resolve;mapQa.rejectDefinition=reject;});
          return originalEnsure(...args);
        };
        preloadIslandMap=(...args)=>mapQa.failArt && args[0]===mapQa.target ? Promise.resolve(false) : originalArt(...args);
        api.subscribeIsland=(islandId,handlers)=>originalSubscribe(islandId,{
          ...handlers,
          onCities:rows=>{
            if(mapQa.holdCities && islandId===getOnlineIslandId(mapQa.target))mapQa.releaseCities=()=>handlers.onCities(rows);
            else if(mapQa.failCities && islandId===getOnlineIslandId(mapQa.target))handlers.onError(Error('Synthetic city load failure'),'cities');
            else handlers.onCities(rows);
          }
        });
      })()`);
    };
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:height<600});
      await load();
      await evaluate("mapQa.holdDefinition=true;void(mapQa.pending=switchOnlineIsland(mapQa.target,{fromMapPicker:true}))");
      await wait("!!mapQa.releaseDefinition");
      assert(await evaluate("isMapInteractionBlocked() && mapSwitchLoading"), "An uncached map must show loading and block overlapping navigation before its definition arrives");
      const repeats=await evaluate(`(async()=>({result:await switchOnlineIsland(mapQa.target,{fromMapPicker:true}),calls:mapQa.definitionCalls,active:getActiveMapRegionId()}))()`);
      assert.equal(repeats.result,false); assert.equal(repeats.calls,1);
      assert.equal(repeats.active,await evaluate("mapQa.origin"));
      await wait("Number(getComputedStyle(document.querySelector('.map-loading-panel')).opacity)===1");
      assert(await evaluate(`(()=>{
        const bounds=document.querySelector('.map-loading-panel').getBoundingClientRect();
        return bounds.left>=0 && bounds.top>=0 && bounds.right<=innerWidth && bounds.bottom<=innerHeight
          && mapLoadingLabel.textContent.includes(getRegionLabel(mapQa.target));
      })()`),"The loading message must be visible within the viewport");
      assert.equal(await evaluate("getComputedStyle(mapLoadingLabel).color"),"rgb(47, 33, 19)","Use the dark parchment text color for a readable loading message");
      const shot=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(output,`loading-${width}.png`),Buffer.from(shot.data,"base64"));
      await evaluate("mapQa.holdDefinition=false;mapQa.releaseDefinition()");
      assert(await evaluate("mapQa.pending")); await wait("!isMapInteractionBlocked()");
      assert(await evaluate("getActiveMapRegionId()===mapQa.target && onlineWorldConnected && onlineCitiesLoaded"));

      await load();
      await evaluate("mapQa.holdDefinition=true;void(mapQa.pending=switchOnlineIsland(mapQa.target))");
      await wait("!!mapQa.rejectDefinition");
      await evaluate("mapQa.holdDefinition=false;mapQa.rejectDefinition(Error('Synthetic definition failure'))");
      assert.equal(await evaluate("mapQa.pending"),false);
      assert(await evaluate("!isMapInteractionBlocked() && getActiveMapRegionId()===mapQa.origin && onlineWorldConnected"),"Definition failure must leave the original map usable");
      assert(await evaluate("switchOnlineIsland(mapQa.target)"),"A failed definition must be retryable"); await wait("!isMapInteractionBlocked()");

      for (const bodyStalled of [false,true]) {
        await load();
        const timeout = await evaluate(`(async()=>{
          const nativeFetch=window.fetch, nativeTimeout=window.setTimeout;
          const definitionPath=REGION_CATALOG_SUMMARIES_BY_ID.get(mapQa.target).regionDefinitionPath;
          regionDefinitionCache.delete(mapQa.target);
          let aborted=false, delayMs=0;
          window.setTimeout=(callback,ms,...args)=>{
            if(ms===15000){delayMs=ms;return nativeTimeout(callback,60,...args);}
            return nativeTimeout(callback,ms,...args);
          };
          window.fetch=(resource,options)=>{
            if(!String(resource).includes(definitionPath))return nativeFetch(resource,options);
            const hang=()=>new Promise((resolve,reject)=>options?.signal?.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Fixture timeout','AbortError'));}));
            return ${bodyStalled} ? Promise.resolve({ok:true,json:hang}) : hang();
          };
          let result;
          try{result=await switchOnlineIsland(mapQa.target);}finally{window.fetch=nativeFetch;window.setTimeout=nativeTimeout;}
          return {result,aborted,delayMs,stuck:REGION_DEFINITION_LOADER.loads.has(mapQa.target),blocked:isMapInteractionBlocked(),sameMap:getActiveMapRegionId()===mapQa.origin};
        })()`);
        assert.deepEqual(timeout,{result:false,aborted:true,delayMs:15000,stuck:false,blocked:false,sameMap:true},"Stalled definition headers/body must abort, release the pending load and retain the current map");
        assert(await evaluate("switchOnlineIsland(mapQa.target)"),"An aborted download must fetch again on retry"); await wait("!isMapInteractionBlocked()");
      }

      await load();
      await evaluate("mapQa.failArt=true");
      assert.equal(await evaluate("switchOnlineIsland(mapQa.target)"),false);
      assert(await evaluate("getActiveMapRegionId()===mapQa.origin && onlineWorldConnected && !isMapInteractionBlocked()"));
      await evaluate("mapQa.failArt=false");
      assert(await evaluate("switchOnlineIsland(mapQa.target)")); await wait("!isMapInteractionBlocked()");

      await load();
      await evaluate("mapQa.holdCities=true;void(mapQa.pending=switchOnlineIsland(mapQa.target))");
      await wait("!!mapQa.releaseCities");
      assert(await evaluate("getActiveMapRegionId()===mapQa.origin && isMapInteractionBlocked()"),"Do not reveal the next map before authoritative city data");
      await evaluate("mapQa.holdCities=false;mapQa.releaseCities()");
      assert(await evaluate("mapQa.pending")); await wait("!isMapInteractionBlocked()");

      await load();
      await evaluate("mapQa.failCities=true");
      assert.equal(await evaluate("switchOnlineIsland(mapQa.target)"),false);
      await wait("!isMapInteractionBlocked()");
      assert(await evaluate("getActiveMapRegionId()===mapQa.origin && onlineWorldConnected && onlineCitiesLoaded"),"City failure must reconnect the original map");
      await evaluate("mapQa.failCities=false");
      assert(await evaluate("switchOnlineIsland(mapQa.target)")); await wait("!isMapInteractionBlocked()");

      await load();
      await evaluate("mapQa.holdDefinition=true;void(mapQa.pending=switchOnlineIsland(mapQa.target))");
      await wait("!!mapQa.releaseDefinition");
      await evaluate("onlineSessionGeneration++;mapQa.holdDefinition=false;mapQa.releaseDefinition()");
      assert.equal(await evaluate("mapQa.pending"),false,"A stale map request must not navigate a replacement session");
      assert(await evaluate("getActiveMapRegionId()===mapQa.origin && !isMapInteractionBlocked()"));

      await load();
      const normal=await evaluate("__CROWNLANDS_BENCHMARK__.switchNeighborAndReturn()");
      assert(normal.neighborResult && normal.returnResult);
      assert.deepEqual(normal.after.duplicates,[]);
      const stale=await evaluate("__CROWNLANDS_BENCHMARK__.runStaleSnapshotCheck()"); assert(stale.passed);
      const regions=await evaluate(`(()=>{
        const ids=REGION_CATALOG.regions.filter(region=>region.permanentCore || /^new-lands-l0[12]-/.test(region.id)).map(region=>region.id);
        applyCoreExpansionRealmState({coreExpansion:{activeRegionIds:ids.filter(id=>id.startsWith('new-lands-'))}});
        return ids;
      })()`);
      assert.equal(regions.length,81,"Exercise the current 25 Core + 56 New Lands topology");
      const sample=width===1440 ? regions : [regions[0],regions[12],regions[24],regions[25],regions[48],regions[49],regions[80]];
      const traversal=[];
      for(const id of [...sample,regions[0]]) {
        // Materialize only this map's synthetic server rows, then evict its definition
        // so navigation must use the real loader again after cache churn.
        const switched=await evaluate(`(async()=>{
          const id=${JSON.stringify(id)}, fixture=__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
          await ensureRegionDefinitionLoaded(id);
          const snapshots=new Map((fixture.citiesByRegion[id] || []).map(city=>[city.id,city]));
          fixture.citiesByRegion[id]=getPlayableBaseCitiesByRegion(id).map(base=>snapshots.get(base.id) || createNeutralCityFromBase(base));
          if(id!==getActiveMapRegionId())regionDefinitionCache.delete(id);
          const started=performance.now();
          if(!await switchOnlineIsland(id,{fromMapPicker:true}))throw Error('Map did not open: '+id);
          const cities=state.cities.filter(city=>getCityRegionId(city)===id);
          return {id,durationMs:performance.now()-started,active:getActiveMapRegionId(),cityCount:cities.length,expectedCities:fixture.citiesByRegion[id].length,cityIds:cities.map(city=>city.id).sort(),expectedIds:fixture.citiesByRegion[id].map(city=>city.id).sort(),cached:regionDefinitionCache.size,cacheLimit:REGION_DEFINITION_CACHE_LIMIT};
        })()`);
        await wait(`!isMapInteractionBlocked() && mapBg.querySelector('.island-art-map.active')?.dataset.imageRegion===${JSON.stringify(id)}`);
        assert.equal(switched.active,id); assert.equal(switched.cityCount,switched.expectedCities,`City snapshot count for ${id}`); assert(switched.cached<=switched.cacheLimit);
        assert.deepEqual(switched.cityIds,switched.expectedIds,`City identities for ${id}`);
        delete switched.cityIds; delete switched.expectedIds;
        traversal.push(switched);
      }
      results.push({width,height,definitionLock:true,definitionTimeout:true,failureRetry:true,cityReadiness:true,rollback:true,staleSession:true,normal,stale,traversal});
      console.log(`PASS ${width}x${height}: immediate loading, repeated taps, stalled downloads, definition/art/city failure recovery, snapshot readiness, rollback, session guards and ${traversal.length} map visits.`);
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,"browser-validation.json"),JSON.stringify({results,errors},null,2));
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
