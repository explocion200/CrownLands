"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const E = require("../functions/estate-economy");
const S = require("../functions/estate-services");
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
    const compactActions = async selector => {
      assert(await evaluate(s => {
        const buttons = [...document.querySelectorAll(s)];
        return buttons.length === 2 && buttons.every(e => {
          const b = e.getBoundingClientRect(), label = e.querySelector('.wheel-action-name');
          const text = document.createRange(); text.selectNodeContents(label);
          const r = text.getBoundingClientRect();
          return b.width === 48 && b.height === 48 && b.width >= 44
            && text.getClientRects().length === 1 && label.scrollWidth <= label.clientWidth
            && r.left >= b.left + 2 && r.right <= b.right - 2 && r.top >= b.top + 2 && r.bottom <= b.bottom - 2;
        });
      }, selector), 'Compact estate actions must retain readable labels and touch targets: ' + selector);
    };
    const normalActions = async selector => {
      assert(await evaluate(s => {
        const buttons = [...document.querySelectorAll(s)];
        return buttons.length === 2 && buttons.every(e => {
          const b = e.getBoundingClientRect(), style = getComputedStyle(e);
          const panel = e.closest('.estate-directory,.estate-detail').getBoundingClientRect();
          const text = document.createRange(); text.selectNodeContents(e);
          const r = text.getBoundingClientRect();
          return !e.classList.contains('cl-action-button') && !e.querySelector('.wheel-icon')
            && e.textContent === (e.dataset.estateUpgrade ? 'Upgrade' : 'Enter')
            && style.clipPath === 'none' && parseFloat(style.borderTopWidth) >= 1 && parseFloat(style.borderRadius) >= 3
            && parseFloat(style.fontSize) >= 12 && b.width >= 44 && b.height >= 44
            && b.left >= panel.left && b.right <= panel.right
            && text.getClientRects().length === 1 && r.left >= b.left + 2 && r.right <= b.right - 2;
        });
      }, selector), 'Estate panel actions must use readable normal buttons with touch targets: ' + selector);
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
        window.__estateTest={state:payload.snapshot,quotes:payload.quotes,benefitsAt1:payload.benefitsAt1,commits:[],loads:0,failOnce:true,scope:"estate-test"};
        const result=()=>{
          const estate=structuredClone(__estateTest.state),serverNowMs=Date.now();
          // The benchmark uses a fixed browser epoch. Rebase the synthetic
          // server deadline instead of mixing it with the host's wall clock.
          if(Number.isFinite(estate.projection?.untilMs))estate.projection.untilMs+=serverNowMs-estate.serverNowMs;
          estate.serverNowMs=serverNowMs;
          estate.recruitOffers=__estateTest.offers||{offers:[]};
          return{estate,champions:__estateTest.champions||{},serverNowMs};
        };
        const receipts=new Map(),issued=new Map();
        window.__estateTestApi={
          getEstateState:async()=>{__estateTest.loads++;return result();},
          getEstateQuote:async input=>{
            const s=__estateTest.state;
            let value;
            if(input.action==="deposit")value={...input,target:s.levels[input.building]+1,nonrefundable:true};
            else if(input.action==="processor")value={...input};
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
              s.jobs.push({...q.jobs[0],id:request.requestId,status:"running",startedAtMs:Date.now(),durationMs:600000,completesAtMs:Date.now()+600000});delete s.deposits[q.building];
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
      },{snapshot:E.snapshot(estate,estate.settledAtMs),quotes,benefitsAt1:E.snapshot(E.initial(estate.settledAtMs),estate.settledAtMs).benefits});
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
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-enter-directory').length),20);
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
      assert(await evaluate(()=>document.querySelector('.estate-economy-content').textContent.includes('Quarry → Level 25')),'Permanent credit review names its exact building and target');
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
      await wait(()=>document.querySelector('.estate-economy-content')?.getAttribute('aria-busy')==='false');
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
      assert(await evaluate(()=>document.querySelector('[data-economy-permanent]').checked),'A failed request retains the accepted credit terms for the same retry');
      await click('[data-economy-action="confirm"]');
      await wait(()=>innerCastleEconomy.snapshot().estate.jobs.length===1);
      const ids=await evaluate(()=>__estateTest.commits.filter(x=>x.action==="fund").map(x=>x.requestId));assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-action="fund"],[data-economy-deposit]').length),0,"Running work cannot queue another level");
      await click('[data-economy-action="close"]');
      assert.deepEqual(await evaluate(()=>innerCastleEstateView.snapshot()),camera);
      assert.equal(await evaluate(()=>document.querySelector('[data-estate-site="quarry"]').dataset.siteState),"constructing");
      // Saved deadlines drive the curved arc independently of material production.
      assert.equal(await evaluate(()=>document.querySelector('[data-estate-construction="quarry"]').getAttribute('aria-valuenow')),'0');
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-construction-note:not([hidden])').length),1);
      const timerLoads=await evaluate(()=>{
        const s=innerCastleEconomy.snapshot();
        __estateTimerJob=structuredClone(__estateTest.state.jobs[0]);
        s.estate.projection.net=Object.fromEntries(Object.keys(s.estate.projection.stock).map(k=>[k,0]));innerCastleEconomy.visibilityChanged();
        s.receivedAtMs-=300000;return __estateTest.loads;
      });
      await wait(()=>document.querySelector('[data-estate-construction="quarry"]').getAttribute('aria-valuenow')==='50');
      assert.equal(await evaluate(()=>__estateTest.loads),timerLoads,'Construction ticks must not poll the server');
      assert(await evaluate(()=>{
        const gauge=document.querySelector('[data-estate-construction="quarry"]');
        return Math.abs(+gauge.querySelector('.estate-timer-fill').style.strokeDashoffset-50)<1
          && /^(4:5\d|5:00)$/.test(gauge.querySelector('[data-estate-time-left]').textContent)
          && gauge.getAttribute('aria-valuetext').includes('remaining')
          && document.querySelector('[data-inner-castle-building="quarry"]').getAttribute('aria-describedby')==='estateConstructionNote-quarry';
      }),'Arc, countdown and accessible target must agree');
      await click('[data-estate-detail-close]');
      const timerLayout=()=>{
        const gauge=document.querySelector('[data-estate-construction="quarry"]');
        if(gauge.hidden)throw Error('Selected construction timer must fit above the building');
        const b=gauge.getBoundingClientRect(),art=document.querySelector('[data-estate-site="quarry"] img').getBoundingClientRect();
        if(Math.abs((b.left+b.right-art.left-art.right)/2)>.5||Math.abs(art.top-b.bottom-6)>.5)throw Error('Timer lost fixed top anchor');
        if(b.width!==112||b.height!==40)throw Error('Timer must retain readable screen size');
        for(const e of document.querySelectorAll('.estate-site>img,.estate-nameplate:not([hidden]),.estate-upgrade-targets button:not([hidden]),.estate-camera-controls')){
          const r=e.getBoundingClientRect();if(b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top)throw Error('Construction timer overlaps artwork or a control');
        }
        const caption=document.querySelector('[data-estate-nameplate="quarry"]');
        if(!caption.hidden&&caption.getBoundingClientRect().top<art.bottom)throw Error('Timer moved the bottom building caption');
        return b.toJSON();
      };
      await evaluate(timerLayout);
      const timerCapture=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'construction-timer-'+width+'.png'),Buffer.from(timerCapture.data,'base64'));
      await evaluate(()=>innerCastleEstateView.zoom(3));await evaluate(timerLayout);
      await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
      await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
      await evaluate(timerLayout);
      await client.send('Emulation.setDeviceMetricsOverride',{width:width-20,height:height-10,deviceScaleFactor:1,mobile:false});
      await delay(150);await evaluate(timerLayout);
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await delay(150);
      // Long contracts remain compact; the last minute shows individual seconds.
      assert.deepEqual(await evaluate(()=>{
        const s=innerCastleEconomy.snapshot(),job=s.estate.jobs[0],clock=innerCastleEconomy.now();
        const texts=[];
        for(const ms of [176400000,3720000,9000]){
          job.durationMs=ms;job.completesAtMs=clock+ms;innerCastleEstateView.updateResources();
          texts.push(document.querySelector('[data-estate-construction="quarry"] [data-estate-time-left]').textContent);
        }
        job.durationMs=__estateTimerJob.durationMs;job.completesAtMs=__estateTimerJob.completesAtMs;
        innerCastleEstateView.updateResources();return texts;
      }),['2d 1h','1h 2m','0:09']);
      // A client reaching zero cannot grant a level or remove scaffolding.
      await evaluate(()=>{innerCastleEconomy.snapshot().receivedAtMs-=600000;innerCastleEstateView.updateResources();});
      assert(await evaluate(()=>{
        const gauge=document.querySelector('[data-estate-construction="quarry"]');
        return gauge.getAttribute('aria-valuenow')==='100'&&gauge.querySelector('span').textContent==='Finishing…'
          &&innerCastleEstateView.debug().siteLevels.quarry===24&&innerCastleEstateView.debug().siteStates.quarry==='constructing';
      }),'Deadline waits for authoritative completion');
      await evaluate(()=>{__estateTest.state.jobs=[];__estateTest.state.levels.quarry=25;return innerCastleEconomy.refresh();});
      assert(await evaluate(()=>document.querySelector('[data-estate-construction="quarry"]').hidden
        &&document.querySelector('#estateConstructionNote-quarry').hidden&&innerCastleEstateView.debug().siteStates.quarry==='completed'));
      // Waiting legacy work has a directory status, never a running progress arc.
      await evaluate(()=>{
        __estateTest.state.levels.quarry=24;__estateTest.state.jobs=[{...__estateTimerJob,status:'paused',completesAtMs:null}];
        return innerCastleEconomy.refresh();
      });
      assert(await evaluate(()=>document.querySelector('[data-estate-construction="quarry"]').hidden
        &&document.querySelector('#estateConstructionNote-quarry').textContent==='Paid work · Paused'));
      await evaluate(()=>{__estateTest.state.jobs=[structuredClone(__estateTimerJob)];return innerCastleEconomy.refresh();});
      // Hidden scenes stop the shared tick loop, then resume from server time.
      const beforeHidden=await evaluate(()=>{
        Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
        innerCastleEconomy.snapshot().receivedAtMs-=120000;
        return document.querySelector('[data-estate-construction="quarry"] [data-estate-time-left]').textContent;
      });
      await delay(1100);
      assert.equal(await evaluate(()=>document.querySelector('[data-estate-construction="quarry"] [data-estate-time-left]').textContent),beforeHidden);
      await evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
      await wait(()=>innerCastleEconomy.snapshot().receivedAtMs>Date.now()-1000);
      await click('[data-estate-fit]');
      assert(await evaluate(()=>[...document.querySelectorAll('.estate-construction-timer:not([hidden])')].every(e=>{
        const b=e.getBoundingClientRect(),v=document.querySelector('.estate-viewport').getBoundingClientRect();
        return b.width===88&&b.left>=v.left&&b.right<=v.right&&b.top>=v.top&&b.bottom<=v.bottom;
      })),'Overview timers remain compact and in bounds');
      await click('[data-estate-directory-toggle]');
      await evaluate(()=>document.querySelector('[data-estate-directory-building="quarry"]').scrollIntoView({block:'center'}));
      assert(await evaluate(()=>{
        const note=document.querySelector('#estateConstructionNote-quarry'),entry=document.querySelector('[data-estate-directory-building="quarry"]');
        return !note.hidden&&note.textContent.includes('left')&&entry.getAttribute('aria-describedby')===note.id;
      }),'Directory exposes the countdown when the map is crowded');
      await click('[data-estate-directory-toggle]');
      await evaluate(()=>innerCastleEstateView.select('quarry'));
      // Every registry site can display a running contract, including first builds.
      // Three concurrent jobs use independent progress and collision-safe placement.
      await evaluate(()=>{
        const jobs=innerCastleEconomy.snapshot().estate.jobs;
        const sample=[{...__estateTimerJob,building:'quarry'},
          {...__estateTimerJob,building:'mine',durationMs:1200000},
          {...__estateTimerJob,building:'foresters-lodge',durationMs:1800000}];
        const snapshot={...innerCastleEconomy.snapshot().estate,jobs:sample};
        innerCastleEstateView.updateEstate(snapshot);
        const values=sample.map(j=>+document.querySelector('[data-estate-construction="'+j.building+'"]').getAttribute('aria-valuenow'));
        if(values[1]!==50||values[2]!==67)throw Error('Concurrent arcs must use each accepted duration');
        for(const building of CrownlandsEstate.buildings){
          innerCastleEstateView.updateEstate({...snapshot,jobs:[{...__estateTimerJob,building:building.key}]});
          innerCastleEstateView.select(building.key);document.querySelector('[data-estate-detail-close]').click();
          const gauge=document.querySelector('[data-estate-construction="'+building.key+'"]');
          const note=document.querySelector('#estateConstructionNote-'+building.key);
          if(gauge.getAttribute('aria-label')!==building.label+' construction to Level 25'||note.hidden)throw Error('Missing timer for '+building.key);
          if(!gauge.hidden){
            const g=gauge.getBoundingClientRect(),art=document.querySelector('[data-estate-site="'+building.key+'"] img').getBoundingClientRect();
            if(Math.abs(art.top-g.bottom-6)>.5||Math.abs((g.left+g.right-art.left-art.right)/2)>.5)throw Error('Wrong timer anchor for '+building.key);
          }
        }
        innerCastleEstateView.updateEstate({...snapshot,levels:{...snapshot.levels,mine:0},jobs:[{...__estateTimerJob,building:'mine',target:1}]});
        if(document.querySelector('[data-estate-construction="mine"]').getAttribute('aria-label')!=='Mine construction to Level 1'
          ||!document.querySelector('[data-estate-enter="mine"]').disabled)throw Error('First-build timer cannot enable Enter before completion');
        innerCastleEstateView.updateEstate({...snapshot,jobs});innerCastleEstateView.select('quarry');
      });
      await click('[data-estate-resource="timber"]');
      await wait(()=>document.querySelector("#estateEconomyTitle")?.textContent==="Timber ledger");
      assert(await evaluate(()=>document.querySelector(".estate-economy-dialog").textContent.includes("Factory inputs")));
      await click('[data-economy-action="close"]');
      await evaluate(()=>innerCastleEstateView.select("treasury"));
      await click('[data-estate-detail-close]');
      await click('[data-inner-castle-building="treasury"]');
      assert(await evaluate(()=>!!innerCastleEstateView),'Map selection must not enter Gear');
      await click('.estate-detail [data-estate-enter="treasury"]');
      await wait(()=>!!document.querySelector("[data-estate-officer-manage]"));
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-construction-timers').length),0,'Gear disposes the timer layer');
      await click("[data-estate-officer-manage]");
      await wait(()=>document.querySelector("#estateEconomyTitle")?.textContent==="Treasury");
      assert(await evaluate(()=>document.querySelector(".estate-economy-dialog").textContent.includes("Officer commissions")));
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-action="fund"],[data-economy-deposit]').length),0,"Interiors contain services only");
      await click('[data-economy-action="close"]');
      await click("[data-gear-back]");
      await wait(()=>!!innerCastleEstateView);
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-construction-timers').length),1,'Gear return mounts one timer layer');
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-construction-note').length),20,'Gear return does not accumulate countdown notes');
      assert.equal(await evaluate(()=>innerCastleEstateView.debug().siteStates.quarry),"constructing");
      await evaluate(()=>innerCastleEstateView.select("mine"));
      await click('[data-estate-detail-close]');
      const layoutCapture=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(output,"action-layout-"+width+".png"),Buffer.from(layoutCapture.data,"base64"));
      const mapAction=await evaluate(()=>{
        const arrows=[...document.querySelectorAll('.estate-upgrade-targets button')].filter(e=>!e.hidden);
        if(arrows.length!==2)throw Error('Selected building must show one Upgrade/Enter pair');
        const left=arrows[0].getBoundingClientRect(),right=arrows[1].getBoundingClientRect();
        const art=document.querySelector('[data-estate-site="mine"] img').getBoundingClientRect();
        if(arrows[0].dataset.estateUpgrade!=="mine"||arrows[1].dataset.estateEnter!=="mine"||left.right>=art.left||right.left<=art.right)throw Error('Upgrade must flank the left and Enter the right');
        for(const e of arrows){
          const b=e.getBoundingClientRect();
          const style=getComputedStyle(e),face=getComputedStyle(e,'::before');
          if(b.width!==48||b.height!==48||!style.clipPath.startsWith('polygon')||!face.backgroundImage.includes('gradient'))throw Error('Compact estate action lost shared city hex styling');
          const expected=e.dataset.estateUpgrade?'rgb(42, 25, 7)':'rgb(242, 226, 191)';
          if(getComputedStyle(e.querySelector('.wheel-action-name')).color!==expected)throw Error('Action label lost its contrasting city color');
          if(!e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)))throw Error('Inaccessible map action');
          for(const other of document.querySelectorAll('.estate-building-target:not([hidden]),.estate-nameplate:not([hidden]),.estate-upgrade-targets button:not([hidden])')){
            if(other===e)continue;const r=other.getBoundingClientRect();
            if(b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top)throw Error('Overlapping map upgrade control');
          }
        }
        const e=arrows[0];e?.focus({preventScroll:true});return e?.dataset.estateUpgrade;
      });
      assert(mapAction,"A district view exposes upgrade buttons on the map");
      await compactActions('.estate-upgrade-targets button:not([hidden])');
      const mapCapture=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(output,"map-upgrades-"+width+".png"),Buffer.from(mapCapture.data,"base64"));
      assert.equal(await evaluate(()=>document.activeElement?.dataset.estateUpgrade),mapAction,"Map upgrade retains keyboard focus");
      await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",text:"\r",unmodifiedText:"\r",windowsVirtualKeyCode:13});
      await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
      await wait(()=>document.querySelector(".estate-economy-dialog")?.open);
      assert(await evaluate(()=>document.querySelector('#estateEconomyTitle').textContent.endsWith(' · Upgrade')));
      await click('[data-economy-action="close"]');
      const arrow=await evaluate(key=>document.querySelector('.estate-upgrade-target[data-estate-upgrade="'+key+'"]').getBoundingClientRect().toJSON(),mapAction);
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:arrow.x+arrow.width/2,y:arrow.y+arrow.height/2,id:1}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await wait(()=>document.querySelector(".estate-economy-dialog")?.open);
      await click('[data-economy-action="close"]');
      const beforeEnter=await evaluate(()=>innerCastleEstateView.snapshot());
      await evaluate(()=>document.querySelector('.estate-enter-target[data-estate-enter="mine"]').focus());
      await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",text:"\r",unmodifiedText:"\r",windowsVirtualKeyCode:13});
      await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
      await wait(()=>document.querySelector('#estateEconomyTitle')?.textContent==='Mine');
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-action="fund"],[data-economy-deposit]').length),0);
      await click('[data-economy-action="close"]');
      assert.deepEqual(await evaluate(()=>innerCastleEstateView.snapshot()),beforeEnter);
      assert.equal(await evaluate(()=>document.activeElement?.dataset.estateEnter),'mine');
      // Every map site has a directory action, even when its small-screen map arrow is crowded.
      await click('[data-estate-directory-toggle]');
      for(const building of E.C.buildings){
        await normalActions('.estate-directory-site:has([data-estate-directory-building="'+building.key+'"]) > .estate-site-action');
        assert(await evaluate(key=>{
          const row=document.querySelector('[data-estate-directory-building="'+key+'"]').parentElement;
          const left=row.querySelector('[data-estate-upgrade]').getBoundingClientRect(),middle=row.querySelector('[data-estate-directory-building]').getBoundingClientRect(),right=row.querySelector('[data-estate-enter]').getBoundingClientRect();
          return left.right<=middle.left&&middle.right<=right.left;
        },building.key),'Directory keeps Upgrade left and Enter right');
        await click('.estate-upgrade-directory[data-estate-upgrade="'+building.key+'"]');
        await wait(()=>document.querySelector(".estate-economy-dialog")?.open);
        await wait(()=>document.querySelector('.estate-economy-content')?.getAttribute('aria-busy')==='false');
        assert(await evaluate(()=>document.querySelector('#estateEconomyTitle').textContent.endsWith(' · Upgrade')));
        await click('[data-economy-action="close"]');
      }
      await click('[data-estate-directory-toggle]');
      // Real building selection stays outside; Enter alone opens each menu.
      for(const building of E.C.buildings){
        await click('[data-estate-directory-toggle]');
        await click('[data-estate-directory-building="'+building.key+'"]');
        assert(await evaluate(()=>!!innerCastleEstateView&&!document.querySelector('.estate-economy-dialog').open),'Selecting a building must stay on the estate');
        await normalActions('.estate-detail .estate-site-action');
        if(building.key==='mine'){
          const capture=await client.send('Page.captureScreenshot',{format:'png'});
          fs.writeFileSync(path.join(output,'selected-actions-'+width+'.png'),Buffer.from(capture.data,'base64'));
        }
        const before=await evaluate(()=>innerCastleEstateView.snapshot());
        await click('.estate-detail [data-estate-enter="'+building.key+'"]');
        if(['treasury','barracks','gatehouse','royal-stables'].includes(building.key)){
          await wait(()=>!!document.querySelector('[data-gear-back]'));
          await click('[data-gear-back]');
          await wait(()=>!!innerCastleEstateView);
        }else{
          await wait(key=>document.querySelector('#estateEconomyTitle')?.textContent===CrownlandsEstate.buildings.find(b=>b.key===key).label,building.key);
          await click('[data-economy-action="close"]');
          assert.equal(await evaluate(()=>document.activeElement?.dataset.estateEnter),building.key,'Service refresh keeps the Enter opener for keyboard return');
        }
        assert.deepEqual(await evaluate(()=>innerCastleEstateView.snapshot()),before,'Menu return preserves camera and detail');
      }
      await click('[data-estate-directory-toggle]');
      await click('.estate-enter-directory[data-estate-enter="quarry"]');
      await wait(()=>document.querySelector('#estateEconomyTitle')?.textContent==='Quarry');
      await click('[data-economy-action="close"]');
      await click('[data-estate-directory-toggle]');
      await evaluate(()=>document.querySelector('.estate-enter-directory[data-estate-enter="treasury"]').scrollIntoView({block:'center'}));
      const directoryCapture=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'directory-actions-'+width+'.png'),Buffer.from(directoryCapture.data,'base64'));
      await click('.estate-enter-directory[data-estate-enter="treasury"]');
      await wait(()=>!!document.querySelector('[data-gear-back]'));
      await click('[data-gear-back]');
      await wait(()=>!!innerCastleEstateView);
      // Unbuilt plots cannot enter; completion enables Enter, including while
      // an already-completed building is undergoing another upgrade.
      await evaluate(()=>{__estateTest.state.levels.mine=0;return innerCastleEconomy.refresh();});
      await evaluate(()=>innerCastleEstateView.select('mine'));
      assert(await evaluate(()=>[...document.querySelectorAll('[data-estate-enter="mine"]')].every(e=>e.disabled)));
      await evaluate(()=>{__estateTest.state.levels.mine=24;return innerCastleEconomy.refresh();});
      assert(await evaluate(()=>[...document.querySelectorAll('[data-estate-enter="mine"],[data-estate-enter="quarry"]')].every(e=>!e.disabled)));
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
      // Service polish uses the actual runtime UI and server rule fixtures,
      // including locks, recipes, bench controls and refresh-safe form drafts.
      await evaluate(()=>{
        const s=__estateTest.state;s.levels['guild-master']=1;s.levels.alehouse=1;s.levels['wagon-yard']=1;
        s.benefits.alehouse=__estateTest.benefitsAt1.alehouse;
        s.activeChampionIds=['champion_one','champion_two','champion_busy'];
        __estateTest.champions=Object.fromEntries(s.activeChampionIds.map((id,i)=>[id,{id,name:'Champion '+(i+1),quality:0,level:1,xp:0,questId:i===2?'quest_busy':'',recoveryUntilMs:0}]));
        __estateTest.offers={offers:[{id:'offer_one',name:'Common Champion',quality:0,level:1,claimed:false}]};
        innerCastleEconomy.building('guild-master');
      });
      await wait(()=>document.querySelector('[data-economy-tier]')&&!document.querySelector('[data-economy-tier]').disabled);
      assert.deepEqual(await evaluate(()=>[...document.querySelector('[data-economy-tier]').options].map(o=>o.disabled)),[0,1,2,3,4].map(tier=>tier>E.rarityIndex(1)));
      assert.deepEqual(await evaluate(()=>[...document.querySelector('[data-economy-meal]').options].map(o=>o.disabled)),S.MEALS.map(meal=>meal.level>1));
      assert(await evaluate(()=>document.querySelector('[data-economy-action="bench"][data-id="champion_busy"]').disabled));
      await evaluate(()=>{
        for(const e of document.querySelectorAll('[data-economy-champion]:not(:disabled)'))e.click();
        const hours=document.querySelector('[data-economy-hours]');hours.value='8';hours.dispatchEvent(new Event('change',{bubbles:true}));
        document.querySelector('[data-economy-resource]').value='stone';
        document.querySelector('[data-economy-action="bench"][data-id="champion_two"]').focus();
      });
      assert(await evaluate(()=>document.querySelector('[data-economy-party-status]').textContent.includes('Selected 2 champions · Power 2')));
      await evaluate(()=>innerCastleEconomy.refresh());
      assert.equal(await evaluate(()=>document.querySelector('[data-economy-hours]').value),'8');
      assert.equal(await evaluate(()=>document.querySelector('[data-economy-resource]').value),'stone');
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-champion]:checked').length),2);
      assert.equal(await evaluate(()=>document.activeElement.dataset.id),'champion_two','Refresh restores the exact row control, not the first Bench button');
      assert(await evaluate(()=>[...document.querySelectorAll('.estate-economy-champion')].every(row=>!row.querySelector('label button'))),'Bench buttons must not toggle party checkboxes');
      assert(await evaluate(()=>[...document.querySelectorAll('.estate-economy-champion')].every(row=>{
        const a=row.querySelector('label').getBoundingClientRect(),b=row.querySelector('button').getBoundingClientRect();
        return a.height>=44&&b.height>=44&&a.right<=b.left;
      })),'Party selection and Bench controls need separate touch targets');
      const guildCapture=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'guild-services-'+width+'.png'),Buffer.from(guildCapture.data,'base64'));
      // A champion becoming unavailable is removed from the selected party.
      await evaluate(()=>{__estateTest.champions.champion_two.questId='quest_new';return innerCastleEconomy.refresh();});
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-champion]:checked').length),1);
      await click('[data-economy-action="close"]');
      await evaluate(()=>innerCastleEconomy.building('alehouse'));
      await wait(()=>document.querySelector('.estate-economy-content').textContent.includes('Power 1'));
      await evaluate(()=>document.querySelector('[data-economy-action="recruit"]').scrollIntoView({block:'center'}));
      const serviceCapture=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'recruit-services-'+width+'.png'),Buffer.from(serviceCapture.data,'base64'));
      await click('[data-economy-action="close"]');
      await evaluate(()=>innerCastleEconomy.building('wagon-yard'));
      await wait(()=>document.querySelector('[data-economy-pack]')&&!document.querySelector('[data-economy-pack]').disabled);
      assert.deepEqual(await evaluate(()=>[...document.querySelector('[data-economy-pack]').options].map(o=>o.disabled)),[false,true,true]);
      assert.deepEqual(await evaluate(()=>[...document.querySelector('[data-economy-resource]').options].map(o=>o.disabled)),[false,false,false,true,true,true]);
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-storage-list button').length),6);
      await click('[data-economy-action="ledger"][data-id="timber"]');
      assert.equal(await evaluate(()=>document.querySelector('#estateEconomyTitle').textContent),'Timber ledger');
      await click('[data-economy-action="close"]');
      await evaluate(()=>{
        const s=__estateTest.state;s.supplyUsage={day:new Date(innerCastleEconomy.now()).toISOString().slice(0,10),hours:1};
        innerCastleEconomy.building('market');
      });
      await wait(()=>document.querySelector('[data-economy-action="supply"]')?.disabled===true);
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-storage-list button').length),2);
      assert(await evaluate(()=>[...document.querySelector('[data-economy-pack]').options].every(o=>o.disabled)));
      await click('[data-economy-action="close"]');
      for(const [level,materialLocks,packLocks] of [[25,[false,false,false,false,false,true],[false,true,true]],[34,[false,false,false,false,false,true],[false,false,true]],[50,[false,false,false,false,false,false],[false,false,true]],[100,[false,false,false,false,false,false],[false,false,false]]]){
        const rules=E.initial(0);for(const key in rules.levels)rules.levels[key]=100;rules.levels['wagon-yard']=level;
        const locked=(resource,hours)=>{try{S.supplyQuote(rules,resource,hours,0);return false;}catch{return true;}};
        assert.deepEqual(['timber','stone','ore','planks','iron','tools'].map(key=>locked(key,.25)),materialLocks,'UI material unlocks must match authoritative supply quotes');
        assert.deepEqual([.25,.5,1].map(hours=>locked('timber',hours)),packLocks,'UI delivery unlocks must match authoritative supply quotes');
        await evaluate(level=>{
          __estateTest.state.levels['wagon-yard']=level;__estateTest.state.supplyUsage={day:'',hours:0};innerCastleEconomy.building('wagon-yard');
        },level);
        await wait(()=>document.querySelector('[data-economy-pack]')&&!document.querySelector('[data-economy-pack]').disabled);
        assert.deepEqual(await evaluate(()=>[...document.querySelector('[data-economy-resource]').options].map(o=>o.disabled)),materialLocks);
        assert.deepEqual(await evaluate(()=>[...document.querySelector('[data-economy-pack]').options].map(o=>o.disabled)),packLocks);
        await click('[data-economy-action="close"]');
      }
      await evaluate(()=>{__estateTest.state.levels['guild-master']=100;__estateTest.state.levels.alehouse=100;innerCastleEconomy.building('guild-master');});
      await wait(()=>document.querySelector('[data-economy-tier]')&&!document.querySelector('[data-economy-tier]').disabled);
      assert(await evaluate(()=>[...document.querySelector('[data-economy-tier]').options,...document.querySelector('[data-economy-meal]').options].every(o=>!o.disabled)));
      await evaluate(()=>{const e=document.querySelector('[data-economy-tier]');e.value='4';e.dispatchEvent(new Event('change',{bubbles:true}));});
      assert(await evaluate(()=>document.querySelector('[data-economy-party-status]').textContent.includes('4 champions and 600 power')));
      await click('[data-economy-action="close"]');
      await evaluate(()=>innerCastleEconomy.building('sawmill'));
      await wait(()=>document.querySelector('[data-economy-reserve="timber"]')&&!document.querySelector('[data-economy-reserve="timber"]').disabled);
      assert(await evaluate(()=>document.querySelector('.estate-economy-content').textContent.includes('Recipe per unit: 2 Timber')));
      await evaluate(()=>{const e=document.querySelector('[data-economy-reserve="timber"]');e.value='123';e.focus();return innerCastleEconomy.refresh();});
      assert.equal(await evaluate(()=>document.querySelector('[data-economy-reserve="timber"]').value),'123');
      assert.equal(await evaluate(()=>document.activeElement.dataset.economyReserve),'timber');
      await click('[data-economy-action="reserves"]');
      await wait(()=>!!document.querySelector('[data-economy-action="cancelReview"]'));
      await click('[data-economy-action="cancelReview"]');
      assert.equal(await evaluate(()=>document.querySelector('[data-economy-reserve="timber"]').value),'123','Back from review preserves the draft');
      await click('[data-economy-action="close"]');
      await evaluate(()=>{
        const s=__estateTest.state;s.commissions.treasury={rarity:'common',name:'Helm',completesAtMs:Date.now()+3600000};
        innerCastleEconomy.building('treasury');
      });
      await wait(()=>document.querySelector('[data-economy-action="claimCommission"]')?.disabled===true);
      await evaluate(()=>{__estateTest.state.commissions.treasury.completesAtMs=Date.now()-1;return innerCastleEconomy.refresh();});
      assert.equal(await evaluate(()=>document.querySelector('[data-economy-action="claimCommission"]').disabled),false,'Completed commissions become claimable');
      await click('[data-economy-action="close"]');
      await evaluate(()=>{__estateTest.state.levels.sawmill=0;innerCastleEconomy.resource('planks');});
      await wait(()=>document.querySelector('[data-economy-action="source"]'));
      await click('[data-economy-action="source"]');
      await wait(()=>document.querySelector('.estate-economy-content').textContent.includes('after Level 1 completes'));
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-action="processor"],[data-economy-action="reserves"]').length),0,'Ledger navigation cannot expose unbuilt services');
      await click('[data-economy-action="close"]');
      const dailyLoads=await evaluate(()=>{
        const data=innerCastleEconomy.snapshot(),s=data.estate;
        s.projection={stock:s.stock,net:{},untilMs:null};s.jobs=[];s.quests=[];s.commissions={};
        data.serverNowMs=(Math.floor(innerCastleEconomy.now()/86400000)+1)*86400000-250;data.receivedAtMs=Date.now();
        innerCastleEconomy.visibilityChanged();return __estateTest.loads;
      });
      await wait(loads=>__estateTest.loads===loads+1,dailyLoads);
      await evaluate(()=>{clearInnerCastleModalState();modal.close();});
      assert.equal(await evaluate(()=>document.querySelectorAll(".estate-economy-dialog").length),0);
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-construction-timers,.estate-construction-note').length),0,'Estate teardown removes all timer elements');
    }
    assert.deepEqual(errors,[]);
    console.log("Estate desktop/landscape UI passed: all 20 sites, construction/deposits/retry, map/normal actions, camera/keyboard/touch, timer lifecycle; service unlocks, party power, busy champions, recruitment, storage ledgers, shared supply allowance, recipes, refresh/review form and exact-row focus preservation, unbuilt service guard and commission readiness.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
