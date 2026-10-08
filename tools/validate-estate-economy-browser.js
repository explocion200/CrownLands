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
    const quotes = Object.fromEntries(E.C.buildings.map(b => [b.key,E.constructionQuote(estate,b.key,1)]));
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
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
        const receipts=new Map(),issued=new Map();
        window.__estateTestApi={
          getEstateState:async()=>{__estateTest.loads++;return result();},
          getEstateQuote:async input=>{
            const s=__estateTest.state;
            let value;
            if(input.action==="deposit")value={...input,target:s.levels[input.building]+1,nonrefundable:true};
            else {
              if(s.jobs.some(j=>j.building===input.building))throw Error("Finish this building's paid work before its next upgrade.");
              if(input.count!==1)throw Error("Upgrades cannot be queued.");
              value=structuredClone(__estateTest.quotes[input.building]);
              const j=value.jobs[0];j.deposited={...s.deposits[input.building]?.deposited};
              j.remaining=Object.fromEntries(Object.entries(j.materials).map(([k,v])=>[k,v-(j.deposited[k]||0)]));value.materials={...j.remaining};
            }
            const quote={id:"quote_test_"+issued.size,value,input};issued.set(quote.id,quote);
            return{...result(),quote};
          },
          commitEstateAction:async request=>{
            const q=issued.get(request.quoteId).value;
            __estateTest.commits.push({...request,action:q.action});
            if(receipts.has(request.requestId))return{ok:true,replayed:true,receipt:receipts.get(request.requestId)};
            const s=__estateTest.state;
            if(q.action==="deposit"){
              const credit=s.deposits[q.building]||={target:q.target,deposited:{}};
              for(const [k,v]of Object.entries(q.amounts)){s.stock[k]-=v;credit.deposited[k]=(credit.deposited[k]||0)+v;}
            }else{
              if(Object.values(q.materials).some(v=>v>0))throw Error("Deposit all required materials.");
              if(s.jobs.length>=s.slots)throw Error("All builders are busy.");
              s.jobs.push({...q.jobs[0],id:request.requestId,status:"running",completesAtMs:Date.now()+600000});delete s.deposits[q.building];
            }
            s.revision++;receipts.set(request.requestId,{action:q.action});
            if(q.action==="fund"&&__estateTest.failOnce){__estateTest.failOnce=false;throw Error("Connection interrupted. Retry the same request.");}
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
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-upgrade-directory').length),20);
      assert(await evaluate(()=>[...document.querySelectorAll('.estate-upgrade-target')].every(e=>e.hidden)),"Overview stays clear");
      await evaluate(()=>innerCastleEstateView.select("quarry"));
      const camera = await evaluate(()=>innerCastleEstateView.snapshot());
      await click('.estate-detail [data-estate-upgrade="quarry"]');
      await wait(()=>document.querySelector(".estate-economy-dialog")?.open);
      await wait(()=>!!document.querySelector('[data-economy-deposit="stone"]'));
      assert(await evaluate(()=>document.querySelector('[data-economy-action="fund"]').disabled));
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-count]').length),0);
      await evaluate(()=>{for(const e of document.querySelectorAll('[data-economy-deposit]'))e.value=e.dataset.economyDeposit==="stone"?100:0;});
      await click('[data-economy-action="deposit"]');
      await wait(()=>!!document.querySelector("[data-economy-permanent]"));
      await click('[data-economy-action="confirm"]');
      assert.equal(await evaluate(()=>__estateTest.commits.length),0,"Unconfirmed permanent credit cannot submit");
      await click("[data-economy-permanent]");
      await click('[data-economy-action="confirm"]');
      await wait(()=>!!document.querySelector('[data-economy-deposit="stone"]'));
      assert.equal(await evaluate(()=>innerCastleEconomy.snapshot().estate.deposits.quarry.deposited.stone),100);
      assert(await evaluate(()=>document.querySelector('[data-economy-action="fund"]').disabled),"Partial credit cannot start");
      // A state refresh while reviewing must not strand Back on loading requirements.
      await click('[data-economy-action="deposit"]');
      await wait(()=>!!document.querySelector("[data-economy-permanent]"));
      await evaluate(()=>innerCastleEconomy.refresh());
      await click('[data-economy-action="cancelReview"]');
      assert(await evaluate(()=>!!document.querySelector('[data-economy-deposit="stone"]')));
      await click('[data-economy-action="deposit"]');
      await wait(()=>!!document.querySelector("[data-economy-permanent]"));
      await click("[data-economy-permanent]");
      await click('[data-economy-action="confirm"]');
      await wait(()=>document.querySelector('[data-economy-action="fund"]')?.disabled===false);
      assert.equal(await evaluate(()=>innerCastleEconomy.snapshot().estate.jobs.length),0,"Deposits never auto-start work");
      const output=path.join(root,"release-artifacts/estate-economy");fs.mkdirSync(output,{recursive:true});
      await evaluate(()=>document.querySelector('.estate-upgrade-requirements').scrollIntoView({block:"center"}));
      const requirements=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(output,"upgrade-"+width+".png"),Buffer.from(requirements.data,"base64"));
      await click('[data-economy-action="fund"]');
      await wait(()=>!!document.querySelector("[data-economy-permanent]"));
      await click("[data-economy-permanent]");
      await click('[data-economy-action="confirm"]');
      await wait(()=>document.querySelector('[role="alert"]')?.textContent.includes("Connection interrupted"));
      await click("[data-economy-permanent]");
      await click('[data-economy-action="confirm"]');
      await wait(()=>innerCastleEconomy.snapshot().estate.jobs.length===1);
      const ids=await evaluate(()=>__estateTest.commits.filter(x=>x.action==="fund").map(x=>x.requestId));assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-action="fund"],[data-economy-deposit]').length),0,"Running work cannot queue another level");
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
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-action="fund"],[data-economy-deposit]').length),0,"Interiors contain services only");
      await click('[data-economy-action="close"]');
      await click("[data-gear-back]");
      await wait(()=>!!innerCastleEstateView);
      assert.equal(await evaluate(()=>innerCastleEstateView.debug().siteStates.quarry),"constructing");
      await evaluate(()=>innerCastleEstateView.select("mine"));
      await click('[data-estate-detail-close]');
      const mapAction=await evaluate(()=>{
        const arrows=[...document.querySelectorAll('.estate-upgrade-target')].filter(e=>!e.hidden);
        for(const e of arrows){
          const b=e.getBoundingClientRect();
          if(b.width<44||b.height<44||!e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)))throw Error('Inaccessible map upgrade arrow');
          for(const other of document.querySelectorAll('.estate-building-target:not([hidden]),.estate-nameplate:not([hidden]),.estate-upgrade-target:not([hidden])')){
            if(other===e)continue;const r=other.getBoundingClientRect();
            if(b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top)throw Error('Overlapping map upgrade control');
          }
        }
        const e=arrows[0];e?.focus({preventScroll:true});return e?.dataset.estateUpgrade;
      });
      assert(mapAction,"A district view exposes upgrade buttons on the map");
      const mapCapture=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(output,"map-upgrades-"+width+".png"),Buffer.from(mapCapture.data,"base64"));
      assert.equal(await evaluate(()=>document.activeElement?.dataset.estateUpgrade),mapAction,"Map upgrade retains keyboard focus");
      await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",text:"\r",unmodifiedText:"\r",windowsVirtualKeyCode:13});
      await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
      await wait(()=>document.querySelector(".estate-economy-dialog")?.open);
      assert(await evaluate(()=>document.querySelector('#estateEconomyTitle').textContent.endsWith(' · Upgrade')));
      await click('[data-economy-action="close"]');
      const arrow=await evaluate(key=>document.querySelector('.estate-upgrade-target[data-estate-upgrade="'+key+'"]').getBoundingClientRect().toJSON(),mapAction);
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:arrow.x+22,y:arrow.y+22,id:1}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await wait(()=>document.querySelector(".estate-economy-dialog")?.open);
      await click('[data-economy-action="close"]');
      // Every map site has a directory action, even when its small-screen map arrow is crowded.
      await click('[data-estate-directory-toggle]');
      for(const building of E.C.buildings){
        await click('.estate-upgrade-directory[data-estate-upgrade="'+building.key+'"]');
        await wait(()=>document.querySelector(".estate-economy-dialog")?.open);
        await wait(()=>document.querySelector('.estate-economy-content')?.getAttribute('aria-busy')==='false');
        assert(await evaluate(()=>document.querySelector('#estateEconomyTitle').textContent.endsWith(' · Upgrade')));
        await click('[data-economy-action="close"]');
      }
      await click('[data-estate-directory-toggle]');
      // Fully credited materials remain ready while the builder is occupied.
      await evaluate(()=>{
        const s=__estateTest.state,q=__estateTest.quotes.mine.jobs[0];s.slots=1;
        s.deposits.mine={target:25,deposited:{...q.materials}};innerCastleEconomy.upgrade("mine");
      });
      await wait(()=>document.querySelector('[data-economy-upgrade-status]')?.textContent.includes('builder becomes free'));
      assert(await evaluate(()=>document.querySelector('[data-economy-action="fund"]').disabled));
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
    console.log("Estate desktop/landscape UI passed: all 20 external upgrade actions, partial/full deposits, no queues, busy builders, confirmation, lost-ack retry, camera, construction artwork, ledgers, Gear services, keyboard and cleanup.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
