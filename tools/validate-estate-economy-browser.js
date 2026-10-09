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
    const closeSheet = async () => {
      await evaluate(() => {
        __estateTest.sheetClosed = new Promise(resolve =>
          document.querySelector('.estate-economy-dialog').addEventListener('close',()=>resolve(true),{once:true}));
      });
      await click('[data-economy-action="close"]');
      assert.equal(await evaluate(()=>__estateTest.sheetClosed),true);
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
            && e.textContent === (e.dataset.estateUpgrade ? innerCastleEconomy.snapshot().estate.levels[e.dataset.estateUpgrade] > 0 ? 'Upgrade' : 'Build' : 'Enter')
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
    const firstBuildEstate=structuredClone(estate);firstBuildEstate.levels.mine=0;
    const firstBuildQuote=E.constructionQuote(firstBuildEstate,'mine',1);
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/inner-city-estate/index.html?estateUi=1&scene=initial&visualMarches=0"});
      await wait(()=>document.documentElement?.dataset.estateQa==="ready");
      await evaluate(async payload => {
        await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="inner-city-estate.js?economy-test=1";script.onload=resolve;script.onerror=reject;document.head.append(script);});
        window.__estateTest={state:payload.snapshot,quotes:payload.quotes,firstBuildQuote:payload.firstBuildQuote,overview:payload.overview,benefitsAt1:payload.benefitsAt1,commits:[],loads:0,failOnce:true,scope:"estate-test"};
        const result=()=>{
          const estate=structuredClone(__estateTest.state),serverNowMs=Date.now();
          // The benchmark uses a fixed browser epoch. Rebase the synthetic
          // server deadline instead of mixing it with the host's wall clock.
          if(Number.isFinite(estate.projection?.untilMs))estate.projection.untilMs+=serverNowMs-estate.serverNowMs;
          estate.serverNowMs=serverNowMs;
          estate.recruitOffers=__estateTest.offers||{offers:[]};
          return{estate,champions:__estateTest.champions||{},serverNowMs,upgradeOverview:structuredClone(__estateTest.overview)};
        };
        const receipts=new Map(),issued=new Map();
        window.__estateTestApi={
          getEstateState:async includeOverview=>{__estateTest.loads++;__estateTest.overviewLoads=(__estateTest.overviewLoads||0)+(includeOverview?1:0);const value=result();if(!includeOverview)delete value.upgradeOverview;return value;},
          getEstateQuote:async input=>{
            (__estateTest.quoteRequests ||= []).push(input);
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
            if(q.nonrefundable && request.acceptPermanentCredit!==true)throw Error('Permanent credit acceptance is required.');
            if(receipts.has(request.requestId))return{ok:true,replayed:true,receipt:receipts.get(request.requestId)};
            if(q.action==='fund'&&__estateTest.holdFund){
              __estateTest.holdFund=false;
              await new Promise(resolve=>{__estateTest.releaseFund=resolve;});
            }
            if(q.action==='fund'&&__estateTest.rejectFund){const message=__estateTest.rejectFund;__estateTest.rejectFund='';throw Error(message);}
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
      },{snapshot:E.snapshot(estate,estate.settledAtMs),quotes,firstBuildQuote,overview:E.upgradeOverview(estate,1e9,285),benefitsAt1:Object.fromEntries(E.C.buildings.map(b=>[b.key,{current:E.benefit(b.key,1),next:E.benefit(b.key,2)}]))});
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
      assert.equal(await evaluate(()=>__estateTest.overviewLoads||0),0,'Ordinary map refreshes use the lightweight estate path');
      const output=path.join(root,"release-artifacts/estate-economy");fs.mkdirSync(output,{recursive:true});
      // Management tools are separate from painted artwork and spending actions.
      await click('[data-estate-status]');
      await wait(()=>document.querySelector('#estateEconomyTitle')?.textContent==='Estate overview');
      await wait(()=>__estateTest.overviewLoads>0);
      assert(await evaluate(()=>document.querySelector('.estate-status-totals').textContent.includes('builders free')));
      await click('[data-economy-action="guide"]');
      const hidden=await evaluate(()=>!document.querySelector('.estate-starter-guide'));
      assert.equal(await evaluate(()=>localStorage.getItem('crownlands-estate-guide-v1:'+(getCurrentOnlineUid()||__estateTest.scope))==='dismissed'),hidden);
      await click('[data-economy-action="guide"]');
      assert.equal(await evaluate(()=>!!document.querySelector('.estate-starter-guide')),hidden,'The guide can always be reopened');
      if(!hidden)await click('[data-economy-action="guide"]');
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-starter-guide li').length),7);
      await evaluate(()=>document.querySelector('.estate-economy-content').scrollTop=0);
      const overviewCapture=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'estate-overview-'+width+'.png'),Buffer.from(overviewCapture.data,'base64'));
      await click('[data-economy-action="close"]');
      await evaluate(()=>{
        __estateTest.managementBefore={state:structuredClone(__estateTest.state),overview:structuredClone(__estateTest.overview)};
        const q=__estateTest.quotes.quarry.jobs[0];
        __estateTest.state.deposits.quarry={target:q.target,deposited:{...q.materials}};
        __estateTest.overview.quarry={status:'ready',ready:true,reason:'Ready to review and start.',bill:{...q,remaining:{}}};
        __estateTest.state.levels.mine=0;__estateTest.overview.mine={status:'blocked',unbuilt:true,ready:false,reason:'Construct this source.'};
        __estateTest.state.levels.smithy=0;
        __estateTest.state.jobs=[{building:'smithy',target:1,status:'running',startedAtMs:Date.now(),durationMs:3600000,completesAtMs:Date.now()+3600000}];
        __estateTest.overview.smithy={status:'constructing',ready:false,reason:'Finish this project.'};
        return innerCastleEconomy.refresh();
      });
      await click('[data-estate-directory-toggle]');
      await wait(()=>!document.querySelector('.estate-directory').hidden&&document.activeElement.matches('[data-estate-filter]'));
      for(const [filter,expected] of [['ready',['quarry']],['constructing',['smithy']],['unbuilt',['mine']]]){
        await evaluate(value=>{const e=document.querySelector('[data-estate-filter]');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));},filter);
        assert.deepEqual(await evaluate(()=>[...document.querySelectorAll('.estate-directory-site')].filter(e=>!e.hidden).map(e=>e.querySelector('[data-estate-directory-building]').dataset.estateDirectoryBuilding)),expected);
      }
      await evaluate(()=>{const e=document.querySelector('[data-estate-filter]');e.value='materials';e.dispatchEvent(new Event('change',{bubbles:true}));});
      assert(await evaluate(()=>[...document.querySelectorAll('.estate-directory-site')].filter(e=>!e.hidden).every(e=>!e.querySelector('[data-estate-directory-building="quarry"],[data-estate-directory-building="mine"],[data-estate-directory-building="smithy"]'))));
      await evaluate(()=>{
        __estateTest.state=__estateTest.managementBefore.state;__estateTest.overview=__estateTest.managementBefore.overview;
        const e=document.querySelector('[data-estate-filter]');e.value='all';e.dispatchEvent(new Event('change',{bubbles:true}));return innerCastleEconomy.refresh();
      });
      assert.equal(await evaluate(()=>[...document.querySelectorAll('.estate-directory-site')].filter(e=>!e.hidden).length),20);
      const managementDirectoryCapture=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'estate-directory-'+width+'.png'),Buffer.from(managementDirectoryCapture.data,'base64'));
      await click('[data-estate-directory-toggle]');
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
      await evaluate(()=>document.querySelector('.estate-upgrade-requirements').scrollIntoView({block:"center"}));
      const requirements=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(output,"upgrade-"+width+".png"),Buffer.from(requirements.data,"base64"));
      const quoteCount=await evaluate(()=>{__estateTest.holdFund=true;return __estateTest.quoteRequests.length;});
      await click('[data-economy-action="fund"]');
      await wait(()=>__estateTest.commits.some(c=>c.action==='fund'));
      assert(await evaluate(()=>document.querySelector('[data-economy-action="fund"]').disabled&&!document.querySelector('[data-economy-permanent],[data-economy-action="confirm"]')),'Upgrade starts directly without a payment checkbox or confirmation screen');
      await click('[data-economy-action="fund"]');
      assert.equal(await evaluate(()=>__estateTest.commits.filter(c=>c.action==='fund').length),1,'Double clicks cannot submit another upgrade');
      await evaluate(()=>__estateTest.releaseFund());
      await wait(()=>document.querySelector('[role="alert"]')?.textContent.includes("Connection interrupted"));
      assert.equal(await evaluate(()=>__estateTest.quoteRequests.length),quoteCount,'Start submits the exact requirements quote already displayed');
      assert.equal(await evaluate(()=>document.querySelector('[data-economy-action="fund"]').textContent),'Retry same upgrade');
      await click('[data-economy-action="fund"]');
      await wait(()=>innerCastleEconomy.snapshot().estate.jobs.length===1);
      const ids=await evaluate(()=>__estateTest.commits.filter(x=>x.action==="fund").map(x=>x.requestId));assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
      assert(await evaluate(()=>{const requests=__estateTest.commits.filter(x=>x.action==='fund');return requests.every(r=>r.acceptPermanentCredit===true)&&requests[0].quoteId===requests[1].quoteId;}),'Lost-acknowledgment retry retains its quote and permanent-credit acceptance');
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
      await evaluate(()=>{
        __estateTest.state.commissions.treasury={rarity:'common',name:'Helm',completesAtMs:Date.now()+250};
        return innerCastleEconomy.refresh();
      });
      await wait(()=>document.querySelector('[data-economy-action="claimCommission"]')?.disabled===false);
      assert.equal(await evaluate(()=>!!innerCastleEstateView),false,'Commission readiness refresh must keep Gear open and the map suspended');
      await click('[data-economy-action="close"]');
      // The native dialog close event restores the replacement opener in a
      // later browser task; dispatching the click is not that completion signal.
      await wait(()=>!document.querySelector('.estate-economy-dialog').open&&document.activeElement.dataset.estateOfficerManage==='treasury');
      assert.equal(await evaluate(()=>document.activeElement.dataset.estateOfficerManage),'treasury','Refresh replaces the Gear opener; Close focuses its current equivalent');
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
      await closeSheet();
      const beforeEnter=await evaluate(()=>innerCastleEstateView.snapshot());
      await evaluate(()=>document.querySelector('.estate-enter-target[data-estate-enter="mine"]').focus());
      assert.equal(await evaluate(()=>document.activeElement?.dataset.estateEnter),'mine');
      await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",text:"\r",unmodifiedText:"\r",windowsVirtualKeyCode:13});
      await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
      await wait(()=>document.querySelector('#estateEconomyTitle')?.textContent==='Mine');
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-economy-action="fund"],[data-economy-deposit]').length),0);
      await closeSheet();
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
      // First construction says Build in every control and the existing
      // Gold-only review; only confirmed completion changes it to Upgrade.
      await evaluate(()=>{
        __estateTest.beforeBuild={quote:structuredClone(__estateTest.quotes.mine),jobs:structuredClone(__estateTest.state.jobs)};
        __estateTest.quotes.mine=structuredClone(__estateTest.firstBuildQuote);
        __estateTest.state.levels.mine=0;return innerCastleEconomy.refresh();
      });
      await evaluate(()=>innerCastleEstateView.select('mine'));
      assert(await evaluate(()=>[...document.querySelectorAll('[data-estate-enter="mine"]')].every(e=>e.disabled)));
      const checkBuildLabel=async name=>assert(await evaluate(expected=>[...document.querySelectorAll('[data-estate-upgrade="mine"]')].length===3
        &&[...document.querySelectorAll('[data-estate-upgrade="mine"]')].every(e=>(e.querySelector('.wheel-action-name')||e).textContent===expected
          &&e.title.includes(expected.toLowerCase()+' requirements')&&e.getAttribute('aria-label')===e.title),name),'Construction label and accessible descriptions: '+name);
      await checkBuildLabel('Build');await normalActions('.estate-detail .estate-site-action');
      await click('.estate-detail [data-estate-upgrade="mine"]');
      await wait(()=>document.querySelector('[data-economy-action="fund"]')&&!document.querySelector('[data-economy-action="fund"]').disabled);
      assert.equal(await evaluate(()=>document.querySelector('#estateEconomyTitle').textContent),'Mine · Build');
      assert.equal(await evaluate(()=>document.querySelector('[data-economy-action="fund"]').textContent),'Build Level 1');
      assert(await evaluate(()=>document.querySelector('.estate-economy-content').textContent.includes('First construction requires Gold only.')&&!document.querySelector('[data-economy-deposit]')));
      await evaluate(()=>{__estateTest.rejectFund='This quote expired. Review a fresh quote.';});
      await click('[data-economy-action="fund"]');
      await wait(()=>document.querySelector('[role="alert"]')?.textContent.includes('quote expired'));
      assert(await evaluate(()=>!__estateTest.state.jobs.some(j=>j.building==='mine')),'An expired quote cannot start construction');
      await click('[data-economy-action="refresh"]');
      await wait(()=>document.querySelector('[data-economy-action="fund"]')?.disabled===false);
      assert(await evaluate(()=>!__estateTest.state.jobs.some(j=>j.building==='mine')),'Refreshing rejected requirements never starts work automatically');
      const firstBuildCommits=await evaluate(()=>__estateTest.commits.length);
      await click('[data-economy-action="fund"]');
      await wait(()=>__estateTest.state.jobs.some(j=>j.building==='mine'));
      assert.equal(await evaluate(()=>__estateTest.commits.length),firstBuildCommits+1,'Gold-only first construction starts with one click');
      assert(await evaluate(()=>!document.querySelector('[data-economy-permanent],[data-economy-action="confirm"]')));
      await closeSheet();
      await evaluate(()=>{
        window.__estateBuildButton=document.querySelector('.estate-detail [data-estate-upgrade="mine"]');__estateBuildButton.focus({preventScroll:true});
        return innerCastleEconomy.refresh();
      });
      await checkBuildLabel('Build');
      assert(await evaluate(()=>innerCastleEstateView.debug().siteStates.mine==='constructing'&&document.activeElement===__estateBuildButton));
      await evaluate(()=>{__estateTest.state.jobs=structuredClone(__estateTest.beforeBuild.jobs);__estateTest.state.levels.mine=1;return innerCastleEconomy.refresh();});
      await checkBuildLabel('Upgrade');
      assert(await evaluate(()=>document.activeElement===__estateBuildButton&&document.querySelector('.estate-detail [data-estate-upgrade="mine"]')===__estateBuildButton),'First completion updates labels without replacing or blurring the control');
      await evaluate(()=>{__estateTest.state.levels.mine=24;__estateTest.quotes.mine=__estateTest.beforeBuild.quote;return innerCastleEconomy.refresh();});
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
        for(const key of ['guild-master','alehouse','wagon-yard'])s.benefits[key]=__estateTest.benefitsAt1[key];
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
        return a.height>=44&&b.height>=44&&(a.right<=b.left||a.bottom<=b.top||b.bottom<=a.top);
      })),'Party selection and Bench controls need separate touch targets');
      await evaluate(()=>{__estateTest.champions.champion_one.xp=10;return innerCastleEconomy.refresh();});
      assert(await evaluate(()=>{
        const card=document.querySelector('[data-champion-card="champion_one"]'),bar=card.querySelector('progress');
        return bar.max===4&&bar.value===4&&card.textContent.includes('10 / 4 XP')&&card.textContent.includes('Extra XP stays banked');
      }),'Cards retain banked XP while the display bar stops at its level threshold');
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
      await evaluate(()=>{__estateTest.state.jobs=[];__estateTest.state.levels['builders-yard']=9;innerCastleEconomy.building('builders-yard');});
      await wait(()=>document.querySelector('.estate-milestone')?.textContent.includes('Second builder'));
      assert(await evaluate(()=>document.querySelector('.estate-milestone progress').max===10));
      await click('[data-economy-action="close"]');
      await evaluate(()=>{
        const s=__estateTest.state;s.resources.iron.status='Waiting for inputs or reserves';s.resources.ore.available=0;s.reserves.ore=10;
        innerCastleEconomy.resource('iron');
      });
      await wait(()=>document.querySelector('.estate-economy-content').textContent.includes('needs usable Iron Ore'));
      assert(await evaluate(()=>!!document.querySelector('[data-economy-action="source"][data-id="mine"]')));
      assert(await evaluate(()=>document.querySelector('.estate-economy-content').textContent.includes('protected by your shared reserve')));
      await click('[data-economy-action="close"]');
      await evaluate(()=>{__estateTest.state.resources.iron.status='Storage full';innerCastleEconomy.resource('iron');});
      await wait(()=>!!document.querySelector('[data-economy-action="source"][data-id="storehouse"]'));
      await click('[data-economy-action="close"]');
      await evaluate(()=>{__estateTest.state.resources.planks.status='Source not built';innerCastleEconomy.resource('planks');});
      await wait(()=>!!document.querySelector('[data-economy-action="upgradeSite"][data-id="sawmill"]'));
      await click('[data-economy-action="close"]');
      await evaluate(()=>{
        __estateTest.state.levels.quarry=26;__estateTest.state.levels['great-hall']=26;__estateTest.state.commissions.treasury={name:'Helm',completesAtMs:Date.now()-1};
        __estateTest.state.parcels=[{id:'ready_parcel',rewards:{timber:50}}];return innerCastleEconomy.refresh();
      });
      await wait(()=>!document.querySelector('.estate-completion-feedback').hidden);
      assert(await evaluate(()=>document.querySelector('.estate-completion-feedback').textContent.includes('Quarry Level 26 completed')));
      await click('.estate-completion-feedback button');
      await evaluate(()=>innerCastleEconomy.refresh());
      assert(await evaluate(()=>document.querySelector('.estate-completion-feedback').hidden),'Repeated same-level snapshots never repeat completion feedback');
      await click('[data-estate-status]');
      await wait(()=>!!document.querySelector('[data-economy-action="source"][data-id="treasury"]'));
      assert(await evaluate(()=>document.querySelector('.estate-status-totals').textContent.replace(/\s/g,'').includes('2rewardstoreview')));
      assert(await evaluate(()=>!!document.querySelector('[data-economy-action="source"][data-id="guild-master"]')));
      await click('[data-economy-action="source"][data-id="treasury"]');
      await wait(()=>document.querySelector('#estateEconomyTitle')?.textContent==='Treasury');
      assert.equal(await evaluate(()=>__estateTest.commits.filter(c=>c.action==='claimCommission').length),0,'Status navigation never claims automatically');
      await click('[data-economy-action="close"]');
      await evaluate(()=>{clearInnerCastleModalState();modal.close();});
      assert.equal(await evaluate(()=>document.querySelectorAll(".estate-economy-dialog").length),0);
      assert.equal(await evaluate(()=>document.querySelectorAll('.estate-construction-timers,.estate-construction-note').length),0,'Estate teardown removes all timer elements');
      assert.equal(await evaluate(()=>document.querySelectorAll('[data-estate-status],[data-estate-filter],.estate-completion-feedback').length),0,'Management layers are cleaned up with the estate');
    }
    assert.deepEqual(errors,[]);
    console.log("Estate desktop/landscape UI passed: all 20 sites, deposits/retry, map actions, camera/touch/keyboard, timers/Gear/focus and services; management overview and readiness filters, guide dismissal/reopening, production guidance, milestones, champion cards, lightweight versus rich requests, confirmed completion feedback and cleanup.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
