"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const E = require("../functions/estate-economy");
const root = path.resolve(__dirname, "..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "A Chromium browser is required.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client; const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async (fn, input) => {
      const result = await client.send("Runtime.evaluate", { expression: "(" + fn.toString() + ")(" + JSON.stringify(input) + ")", awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async (fn, input) => {
      for (let i = 0; i < 300; i++) { if (await evaluate(fn, input)) return; await delay(100); }
      throw Error("Timeout: " + fn + "\n" + errors.join("\n"));
    };
    const click = async selector => {
      await evaluate(s => document.querySelector(s)?.scrollIntoView({ block: "nearest" }), selector);
      const b = await evaluate(s => document.querySelector(s)?.getBoundingClientRect().toJSON(), selector);
      assert(b?.width > 0, selector);
      assert(await evaluate(({ selector, x, y }) => document.querySelector(selector).contains(document.elementFromPoint(x,y)),
        {selector,x:b.x+b.width/2,y:b.y+b.height/2}), "Covered: " + selector);
      await client.send("Input.dispatchMouseEvent",{type:"mousePressed",x:b.x+b.width/2,y:b.y+b.height/2,button:"left",clickCount:1});
      await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:b.x+b.width/2,y:b.y+b.height/2,button:"left",clickCount:1});
    };
    const estate = E.initial(Date.now()); for (const key in estate.levels) estate.levels[key] = 24;
    estate.levels["great-hall"] = 25; for (const key of E.KEYS) estate.stock[key] = 10000;
    const quotes = Object.fromEntries(E.C.buildings.filter(b => b.key !== "great-hall").map(b => [b.key,E.constructionQuote(estate,b.key,1)]));
    for (const [width,height] of [[1440,900],[844,390]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/inner-city-estate/index.html?estateUi=1&scene=initial&visualMarches=0"});
      await wait(()=>document.documentElement?.dataset.estateQa==="ready");
      await evaluate(async payload => {
        await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="inner-city-estate.js?economy-test=1";script.onload=resolve;script.onerror=reject;document.head.append(script);});
        window.__estateTest={state:payload.snapshot,quotes:payload.quotes,commits:[],loads:0,failOnce:true,scope:"estate-test"};
        const result=()=>{
          const estate=structuredClone(__estateTest.state),serverNowMs=Date.now();
          // The benchmark uses a fixed browser epoch. Rebase the synthetic
          // server deadline instead of mixing it with the host's wall clock.
          if(Number.isFinite(estate.projection?.untilMs))estate.projection.untilMs+=serverNowMs-estate.serverNowMs;
          estate.serverNowMs=serverNowMs;
          return{estate,champions:{},serverNowMs};
        };
        const receipts=new Map();
        window.__estateTestApi={
          getEstateState:async()=>{__estateTest.loads++;return result();},
          getEstateQuote:async input=>({...result(),quote:{id:"quote_test_001",value:__estateTest.quotes[input.building],input}}),
          commitEstateAction:async request=>{
            __estateTest.commits.push(request);
            if(receipts.has(request.requestId))return{ok:true,replayed:true,receipt:receipts.get(request.requestId)};
            const q=__estateTest.quotes.quarry;
            __estateTest.state.jobs=[{...q.jobs[0],id:request.requestId,status:"running",completesAtMs:Date.now()+600000}];
            __estateTest.state.revision++;receipts.set(request.requestId,{action:"fund"});
            if(__estateTest.failOnce){__estateTest.failOnce=false;throw Error("Connection interrupted. Retry the same request.");}
            return result();
          },
          getEstateChampions:async()=>({champions:[],nextCursor:""}),
          subscribeEstateChanges:()=>()=>{},
          viewCommonGearBuilding:async()=>({}),
        };
        getOnlineApi=()=>__estateTestApi;
        getCommonGearActionScope=()=>__estateTest.scope;
        clearInnerCastleModalState();openInnerCastle(getMainCityReference().id);
      },{snapshot:E.snapshot(estate,estate.settledAtMs),quotes});
      await wait(()=>!!innerCastleEconomy?.snapshot()?.estate);
      await wait(()=>!!document.querySelector('[data-estate-resource="timber"]'));
      assert.equal(await evaluate(()=>document.querySelector('[data-estate-resource="timber"] dd').textContent),"10K");
      const loads = await evaluate(() => {
        const snapshot = innerCastleEconomy.snapshot();
        snapshot.estate.projection = { stock: { timber:100 }, net:{ timber:60 }, untilMs:snapshot.serverNowMs+3600000 };
        snapshot.receivedAtMs -= 120000;
        return __estateTest.loads;
      });
      await wait(()=>document.querySelector('[data-estate-resource="timber"] dd').textContent === "102").catch(async error=>{throw Error(error.message+"\nCounter diagnostics: "+JSON.stringify(await evaluate(()=>({hidden:document.hidden,view:!!innerCastleEstateView,balances:innerCastleEconomy.balances(),counter:document.querySelector('[data-estate-resource="timber"] dd').textContent,loads:__estateTest.loads,projection:innerCastleEconomy.snapshot().estate.projection}))));});
      assert.equal(await evaluate(()=>__estateTest.loads),loads,"Counter updates must not poll the server");
      await evaluate(()=>innerCastleEconomy.refresh());
      await evaluate(()=>innerCastleEstateView.select("quarry"));
      const camera = await evaluate(()=>innerCastleEstateView.snapshot());
      await click("[data-estate-manage-building=quarry]");
      await wait(()=>document.querySelector(".estate-economy-dialog")?.open);
      await click('[data-economy-action="fund"]');
      await wait(()=>!!document.querySelector("[data-economy-permanent]"));
      await click('[data-economy-action="confirm"]');
      assert.equal(await evaluate(()=>__estateTest.commits.length),0,"Unconfirmed permanent credit cannot submit");
      await click("[data-economy-permanent]");
      await click('[data-economy-action="confirm"]');
      await wait(()=>document.querySelector('[role="alert"]')?.textContent.includes("Connection interrupted"));
      await click("[data-economy-permanent]");
      await click('[data-economy-action="confirm"]');
      await wait(()=>innerCastleEconomy.snapshot().estate.jobs.length===1);
      const ids=await evaluate(()=>__estateTest.commits.map(x=>x.requestId));assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
      await click('[data-economy-action="close"]');
      assert.deepEqual(await evaluate(()=>innerCastleEstateView.snapshot()),camera);
      assert.equal(await evaluate(()=>document.querySelector('[data-estate-site="quarry"]').dataset.siteState),"constructing");
      await click('[data-estate-resource="timber"]');
      await wait(()=>document.querySelector("#estateEconomyTitle")?.textContent==="Timber ledger");
      assert(await evaluate(()=>document.querySelector(".estate-economy-dialog").textContent.includes("Factory inputs")));
      await click('[data-economy-action="close"]');
      await evaluate(()=>innerCastleEstateView.select("treasury",true,true));
      await wait(()=>!!document.querySelector("[data-estate-officer-manage]"));
      await click("[data-estate-officer-manage]");
      await wait(()=>document.querySelector("#estateEconomyTitle")?.textContent==="Treasury");
      assert(await evaluate(()=>document.querySelector(".estate-economy-dialog").textContent.includes("Officer commissions")));
      await click('[data-economy-action="close"]');
      await click("[data-gear-back]");
      await wait(()=>!!innerCastleEstateView);
      assert.equal(await evaluate(()=>innerCastleEstateView.debug().siteStates.quarry),"constructing");
      const output=path.join(root,"release-artifacts/estate-economy");fs.mkdirSync(output,{recursive:true});
      await evaluate(()=>innerCastleEconomy.building("quarry"));
      const capture=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(output,"building-"+width+".png"),Buffer.from(capture.data,"base64"));
      // Keyboard dismissal closes only the nested panel.
      await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
      await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
      await wait(()=>!document.querySelector(".estate-economy-dialog").open);
      assert(await evaluate(()=>modal.open));
      await evaluate(()=>{clearInnerCastleModalState();modal.close();});
      assert.equal(await evaluate(()=>document.querySelectorAll(".estate-economy-dialog").length),0);
    }
    assert.deepEqual(errors,[]);
    console.log("Estate desktop/landscape UI passed: quotes, confirmation, lost-ack retry, camera, construction artwork, ledgers, Gear returns, keyboard and cleanup.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
