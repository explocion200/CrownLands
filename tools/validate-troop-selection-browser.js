"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/troop-selection-live");
(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client;
  const errors = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    await client.send("Network.setBlockedURLs", { urls: ["https://*", "http://*.googleapis.com/*"] });
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); } throw Error("Timed out: " + expression + JSON.stringify(errors)); };
    const enter = value => evaluate(`document.getElementById("troopExactAmount").focus();document.getElementById("troopExactAmount").value=${JSON.stringify(value)};document.getElementById("troopExactAmount").dispatchEvent(new Event("input",{bubbles:true}));`);
    const key = async (key, code) => { await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code }); await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code }); };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await wait('window.__CROWNLANDS_BENCHMARK__?.getStatus().status==="ready"');
    await evaluate(`(() => {
      modal.close(); clearSelection(false); setAnimationModePreference('off');
      const source=playerCities().find(c=>c.troops>0), target=state.cities.find(c=>c.owner==='neutral'&&!isStronghold(c)&&!isProtectedMainCity(c)&&getCityRegionId(c)===getCityRegionId(source));
      if(!source||!target)throw Error('Missing troop selection fixtures');
      window.selectionQa={source:{...source},target:{...target},cap:null,sent:[],routeRequests:[],authority:false};
      const q=selectionQa, lookupCity=cityById, lookupTarget=getArmyTargetById;
      cityById=id=>id===source.id?q.source:id===target.id?q.target:lookupCity(id);
      getArmyTargetById=id=>id===target.id?q.target:lookupTarget(id);
      q.baseRoute={points:[{x:source.x,y:source.y},{x:target.x,y:target.y}],length:1000};
      // Vary the permitted limit independently of the benchmark's random opponents.
      getTroopSliderSendLimit=s=>Math.min(s.troops,q.cap??s.troops);
      isClanAllyCity=c=>c?.id===q.target.id&&q.kind==='reinforce';
      getClanReinforcementBlockReason=()=>'';getPeaceShieldAttackBlockReason=()=>'';
      supportsAuthoritativeArmyRoutes=()=>q.authority;
      requestAuthoritativeOrderRoute=async (_s,_t,_k,n)=>{q.routeRequests.push(n);return {...q.baseRoute,previewStatus:'authoritative',authoritativeDurationSeconds:30,authoritativeRequestedTroops:n,authoritativeSpeedMultiplier:1};};
      launchAttack=(...args)=>{q.sent.push(args);return false;};
      q.open=kind=>{
        cancelAuthoritativeRoutePreviewRefresh();clearSelection(false);
        q.kind=kind;q.authority=false;q.cap=null;q.sent=[];q.routeRequests=[];q.source.troops=1250000;
        q.target.owner=kind==='transfer'?'player':'neutral';
        selectedSourceId=q.source.id;selectedTargetId=q.target.id;selectedTroopAmount=750000;sendMode=true;troopSliderActive=true;
        showTroopSliderModalWithRoute(q.source,q.target,{...q.baseRoute},{orderKind:kind});
      };
      q.refresh=()=>updateTroopSliderModal(q.source,q.target,activeTroopSliderRoute.route);
    })()`);
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width,height,deviceScaleFactor:1,mobile:height<600 });
      for (const kind of ["attack","transfer","reinforce"]) {
        await evaluate(`selectionQa.open(${JSON.stringify(kind)})`);
        await wait('!!document.getElementById("troopExactAmount")');
        assert.equal(await evaluate('activeTroopOrderKind'),kind);
        assert.equal(await evaluate('modalBody.querySelector(".troop-slider-panel").dataset.orderKind'),kind);
        for (const [fraction,expected] of [[.25,312500],[.5,625000],[1,1250000]]) {
          await evaluate(`document.querySelector('[data-troop-fraction="${fraction}"]').click()`);
          assert.equal(await evaluate("selectedTroopAmount"),expected);
          assert(await evaluate('document.getElementById("troopSliderRemaining").textContent===formatMarchesNumber(selectionQa.source.troops-selectedTroopAmount)'));
        }
        await enter("123,456"); assert.equal(await evaluate("selectedTroopAmount"),123456);
        await key("Enter",13); assert.equal(await evaluate('document.getElementById("troopExactAmount").value'),"123,456");
        assert.equal(await evaluate("selectionQa.sent.length"),0);
        await enter("4321"); await key("Escape",27); assert(await evaluate("selectedTroopAmount===123456&&modal.open"),JSON.stringify({width,kind,details:await evaluate('({amount:selectedTroopAmount,open:modal.open,focused:document.activeElement.id,raw:document.getElementById("troopExactAmount")?.value,source:selectionQa.source.troops})')}));
        for (const bad of ["","0","-1","1.5","1e3","12,34","1250001","abc"]) {
          await enter(bad);
          assert(await evaluate('document.getElementById("troopSliderConfirm").disabled'),bad);
          await evaluate("confirmTroopSliderOrder()"); assert.equal(await evaluate("selectionQa.sent.length"),0);
        }
        await evaluate('document.getElementById("troopExactAmount").blur();document.querySelector(\'[data-troop-fraction="0.5"]\').click()');
        assert(await evaluate('selectedTroopAmount===625000&&!document.getElementById("troopSliderConfirm").disabled'));
        await enter("500,000");
        await evaluate('selectionQa.source.troops=400000;selectionQa.refresh()');
        assert(await evaluate('document.activeElement.id==="troopExactAmount"&&document.getElementById("troopExactAmount").value==="500,000"&&document.getElementById("troopSliderConfirm").disabled'));
        await evaluate("confirmTroopSliderOrder()"); assert.equal(await evaluate("selectionQa.sent.length"),0);
        await evaluate('selectionQa.source.troops=600000;selectionQa.refresh()');
        assert(await evaluate('selectedTroopAmount===500000&&document.getElementById("troopExactAmount").value==="500,000"&&!document.getElementById("troopSliderConfirm").disabled'),"Recovered availability must restore the typed count, not dispatch an earlier clamped amount.");
        await evaluate('selectionQa.source.troops=400000;selectionQa.refresh()');
        await evaluate('document.getElementById("troopExactAmount").blur();document.querySelector(\'[data-troop-fraction="1"]\').click();confirmTroopSliderOrder()');
        assert.equal(await evaluate("selectionQa.sent[0][4]"),400000);
        await evaluate('selectionQa.source.troops=0;selectionQa.refresh()');
        assert(await evaluate('document.getElementById("troopSliderConfirm").disabled&&[...document.querySelectorAll("[data-troop-fraction]")].every(b=>b.disabled)'));
        await evaluate(`selectionQa.open(${JSON.stringify(kind)});document.querySelector('[data-troop-fraction="0.5"]').click()`);
        await delay(350); // Let the existing modal entrance animation finish before measuring hit targets.
        const layout=await evaluate(`(()=>{const d=modal.getBoundingClientRect(),b=document.getElementById('troopSliderConfirm').getBoundingClientRect(),p=modalBody.querySelector('.force-column');return {fits:d.x>=0&&d.y>=0&&d.right<=innerWidth+1&&d.bottom<=innerHeight+1,footer:b.y>=0&&b.bottom<=innerHeight&&b.height>=44,overflow:p.scrollWidth>p.clientWidth+1,rootClass:modal.className,sizes:[...document.querySelectorAll('[data-troop-fraction],#troopExactAmount')].map(e=>({id:e.id,height:e.getBoundingClientRect().height,min:getComputedStyle(e).minHeight})),targets:[...document.querySelectorAll('[data-troop-fraction],#troopExactAmount')].every(e=>e.getBoundingClientRect().height>=44)}})()`);
        assert(layout.fits&&layout.footer&&!layout.overflow&&layout.targets,JSON.stringify({width,kind,layout}));
        fs.writeFileSync(path.join(artifacts,`${width}-${kind}.png`),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
      }
      await evaluate('selectionQa.open("attack");selectionQa.cap=350000;selectionQa.refresh();document.querySelector(\'[data-troop-fraction="1"]\').click()');
      assert.equal(await evaluate("selectedTroopAmount"),350000);
      await enter("350001"); assert(await evaluate('document.getElementById("troopSliderConfirm").disabled'));
      await evaluate('selectionQa.open("transfer");selectionQa.authority=true;activeTroopSliderRoute.route.previewStatus="estimated"');
      await enter("1");
      await wait("selectionQa.routeRequests.includes(1)&&isOrderRouteReady(activeTroopSliderRoute.route)");
      await enter("1000000");
      assert(await evaluate('document.getElementById("troopSliderConfirm").disabled'));
      await wait("selectionQa.routeRequests.includes(1000000)&&isOrderRouteReady(activeTroopSliderRoute.route)");
      assert.equal(await evaluate('document.getElementById("troopExactAmount").value'),"1000000");
      await evaluate('selectionQa.open("rally_create")');
      assert(await evaluate('!document.getElementById("troopExactAmount")&&!!document.getElementById("rallyTroopNumber")'));
      await evaluate('document.getElementById("rallyTroopNumber").value="1003";document.getElementById("rallyTroopNumber").dispatchEvent(new Event("input",{bubbles:true}))');
      assert(await evaluate('selectedTroopAmount===1003&&document.getElementById("troopAmountSlider").value==="1003"'),"Existing Rally numeric input must still update its slider.");
    }
    assert.deepEqual(errors,[]);
    console.log("Actual-game troop selection: Attack/Transfer/Reinforce, desktop/mobile, exact input, presets, live limits, dispatch guards, route bands and Rally compatibility passed.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
