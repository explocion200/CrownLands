"use strict";
// Real Home/realm verification/navigation with a loopback-only online adapter.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/home-navigation");
  fs.mkdirSync(artifacts, { recursive: true });
  let browser, client;
  const results = [], errors = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 500; i++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error(`Timed out: ${expression}`);
    };
    const load = async () => {
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'");
      await evaluate(`(async () => {
        __CROWNLANDS_BENCHMARK__.closeModal();
        const homeRegion=WORLD_REGIONS.find(region=>/^new-lands-l01-/.test(region.id));
        await ensureRegionDefinitionLoaded(homeRegion.id);
        const cities=getPlayableBaseCitiesByRegion(homeRegion.id).map(createNeutralCityFromBase);
        const city=cities.find(candidate=>!isStronghold(candidate));
        Object.assign(city,{owner:'player',ownerKind:'player',ownerUid:getCurrentOnlineUid(),isMainCity:true,troops:1000});
        __CROWNLANDS_BENCHMARK_BOOTSTRAP__.citiesByRegion[homeRegion.id]=cities;
        onlineOwnedCitiesCache.push({...city,islandId:getOnlineIslandId(homeRegion.id)});
        state.mainCityId=city.id;
        Object.assign(state.online,{mainCityId:city.id,mainRegionId:homeRegion.id,mainIslandId:getOnlineIslandId(homeRegion.id)});
        const api={...getOnlineApi()}, original=api.getRealmInfo;
        getOnlineApi=()=>api;
        window.homeQa={homeRegion:homeRegion.id,cityId:city.id,origin:getActiveMapRegionId(),calls:0,mode:'open',release:null};
        api.getRealmInfo=async()=>{
          homeQa.calls++;
          if(homeQa.mode==='fail')throw Error('Fixture connection failed');
          const realm=await original();
          if(homeQa.mode==='defer')await new Promise(resolve=>homeQa.release=resolve);
          return {...realm,coreExpansion:{revision:99,activeRegionIds:homeQa.mode==='closed'?[]:[homeQa.homeRegion],regions:[]}};
        };
        updateMainCityReturnButton();
      })()`);
    };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await load();
      const recovered = await evaluate(`(async () => {
        if(!getOnlineApi()?.isSignedIn?.())throw Error('Home fixture must be signed in');
        if(isWorldRegionRuntimeActive(homeQa.homeRegion))throw Error('Fixture must begin with stale active maps');
        await returnToMainCity();
        if(getActiveMapRegionId()!==homeQa.homeRegion || selectedSourceId!==homeQa.cityId)throw Error('Home rejected an already-open server map instead of refreshing stale activation state: '+JSON.stringify({qa:homeQa,active:getActiveMapRegionId(),selected:selectedSourceId,toast:toast.textContent,error:onlineLastError,blocked:isMapInteractionBlocked()}));
        if(homeQa.calls!==1)throw Error('Expected one authoritative realm refresh');
        await returnToMainCity();
        if(homeQa.calls!==1)throw Error('Returning within the current home map added a server request');
        return {region:getActiveMapRegionId(),focused:selectedSourceId,realmChecks:homeQa.calls};
      })()`);
      await wait("!isMapInteractionBlocked()");
      await delay(700);
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, `returned-${width}.png`), Buffer.from(shot.data, "base64"));

      await load();
      const failureRecovery = await evaluate(`(async () => {
        homeQa.mode='fail';await returnToMainCity();
        if(getActiveMapRegionId()!==homeQa.origin || isWorldRegionRuntimeActive(homeQa.homeRegion) || !toast.textContent.includes('Please try again'))throw Error('Failed refresh did not leave a retryable home action on the current map');
        homeQa.mode='open';await returnToMainCity();
        if(getActiveMapRegionId()!==homeQa.homeRegion || selectedSourceId!==homeQa.cityId || homeQa.calls!==2)throw Error('Home retry did not recover');
        return true;
      })()`);
      await load();
      const closed = await evaluate(`(async () => {
        homeQa.mode='closed';await returnToMainCity();
        if(getActiveMapRegionId()!==homeQa.origin || isWorldRegionRuntimeActive(homeQa.homeRegion) || !toast.textContent.includes('has not opened yet'))throw Error('Home bypassed server map activation');
        return true;
      })()`);

      await load();
      const point = await evaluate(`(() => {
        homeQa.mode='defer';
        const rect=mainCityReturnBtn.getBoundingClientRect();
        if(mainCityReturnBtn.hidden || !rect.width || rect.top<0 || rect.right>innerWidth || rect.bottom>innerHeight)throw Error('Home is not visible');
        return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
      })()`);
      for (let i = 0; i < 2; i++) {
        await client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
        await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
      }
      await wait("typeof homeQa.release === 'function'");
      assert(await evaluate("homeQa.calls===1 && getActiveMapRegionId()===homeQa.origin && toast.textContent.includes('Checking your home map')"), "Repeated taps did not share one pending check");
      await evaluate("homeQa.release()");
      await wait("getActiveMapRegionId()===homeQa.homeRegion && selectedSourceId===homeQa.cityId && !mainCityReturnRequestScope");

      await load();
      await evaluate("homeQa.mode='defer';homeQa.pending=returnToMainCity();");
      await wait("typeof homeQa.release === 'function'");
      const staleSession = await evaluate(`(async () => {
        const realm=verifiedRealmInfo;
        onlineSessionGeneration++;
        homeQa.release();await homeQa.pending;
        if(getActiveMapRegionId()!==homeQa.origin || isWorldRegionRuntimeActive(homeQa.homeRegion) || verifiedRealmInfo!==realm)throw Error('Old Home request changed the next session');
        return true;
      })()`);

      await load();
      await evaluate("homeQa.mode='defer';homeQa.pending=returnToMainCity();");
      await wait("typeof homeQa.release === 'function'");
      const newerNavigation = await evaluate(`(async () => {
        const next=__CROWNLANDS_BENCHMARK_BOOTSTRAP__.neighborRegionId;
        if(!await switchOnlineIsland(next))throw Error('Fixture could not navigate to the neighboring map');
        homeQa.release();await homeQa.pending;
        if(getActiveMapRegionId()!==next)throw Error('A delayed Home check replaced newer navigation');
        return true;
      })()`);
      await load();
      const warm = await evaluate(`(async () => {
        applyCoreExpansionRealmState({coreExpansion:{activeRegionIds:[homeQa.homeRegion]}});
        await returnToMainCity();
        if(getActiveMapRegionId()!==homeQa.homeRegion || selectedSourceId!==homeQa.cityId || homeQa.calls!==0)throw Error('Already-known Home navigation added a realm request');
        return true;
      })()`);
      results.push({ width, height, recovered, failureRecovery, closed, repeatedTaps:true, staleSession, newerNavigation, warm });
      console.log(JSON.stringify(results.at(-1)));
    }
    assert.deepEqual(errors, [], "Unexpected browser errors");
    fs.writeFileSync(path.join(artifacts, "validation.json"), JSON.stringify({ results, errors }, null, 2));
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (browser) { await waitForProcessExit(browser.browserProcess); await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
