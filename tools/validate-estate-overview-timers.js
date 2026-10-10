"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), http = require("node:http"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const root = path.resolve(__dirname, ".."), output = path.join(root,"release-artifacts/estate-overview-construction-timers");
const files = new Set(["inner-city-estate.js","inner-city-estate.css","estate-economy-ui.js","estate-economy-ui.css","action-buttons.css"]);
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
async function main() {
  const executable = [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable,"Chromium is required");
  const server = http.createServer((req,res) => {
    const url = new URL(req.url,"http://127.0.0.1"), built = url.pathname.startsWith("/built/"), file = url.pathname.replace(/^\/(?:source\/|built\/)?/,"");
    if (!file) {
      res.writeHead(200,{"content-type":"text/html; charset=utf-8","content-security-policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'"});
      res.end('<!doctype html><html><head><link rel="stylesheet" href="inner-city-estate.css"><link rel="stylesheet" href="estate-economy-ui.css"><link rel="stylesheet" href="action-buttons.css"></head><body style="margin:0"><dialog id="modal" class="modal bailey-modal"><div class="modal-card"><header><h2 id="modalTitle">Timer fixture</h2><button id="closeModalBtn">Close</button></header><div id="modalBody"></div></div></dialog><script src="inner-city-estate.js"></script><script src="estate-economy-ui.js"></script></body></html>');
    } else if (files.has(file) || /^assets\/inner-city-estate\/[a-z0-9-]+\.webp$/.test(file)) {
      res.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"image/webp"});
      res.end(fs.readFileSync(path.join(root,built?"dist":"",file)));
    } else res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  fs.mkdirSync(output,{recursive:true});
  let session,client;
  const errors=[],results=[];
  try {
    session=await startBrowserSession(executable);
    client=await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"),client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
    const evaluate=async(fn,arg)=>{
      const r=await client.send("Runtime.evaluate",{expression:`(${fn})(${JSON.stringify(arg)})`,awaitPromise:true,returnByValue:true});
      if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
      return r.result.value;
    };
    const frames=()=>evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    for (const delivery of process.argv.includes("--source-only")?["source"]:["source","built"]) {
      for(const [width,height] of [[1440,900],[844,390],[568,320]]) {
        await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
        await client.send("Page.navigate",{url:`http://127.0.0.1:${server.address().port}/${delivery}/`});
        let ready=false;
        for(let i=0;i<100;i++){if(await evaluate(()=>document.readyState==="complete"&&!!window.CrownlandsEstateEconomy)){ready=true;break;}await delay(50);}
        assert(ready,"Fixture did not load");
        await evaluate(()=>{
          window.qaNow=1000000;
          window.qaEstate={levels:Object.fromEntries(CrownlandsEstate.buildings.map(b=>[b.key,1])),jobs:[]};
          window.qaView=CrownlandsEstate.mount(document.getElementById("modalBody"),{cityName:"QA Estate",estate:qaEstate,now:()=>qaNow,getResources:()=>({}),actions:CrownlandsEstateEconomy.mapActions(()=>'<svg></svg>',null),onBuilding:()=>{},onUpgrade:()=>{}});
          document.getElementById("modal").showModal();qaView.fit();
          window.qaJobs=keys=>{qaEstate.jobs=keys.map((building,i)=>({building,status:"running",target:2,durationMs:60000*(i+1),completesAtMs:qaNow+30000}));qaView.updateEstate(qaEstate);};
        });
        await frames();
        const check=()=>{
          const view=document.querySelector('.estate-viewport').getBoundingClientRect(),boxes=[];
          for(const job of qaEstate.jobs){
            const gauge=document.querySelector('[data-estate-construction="'+job.building+'"]'),box=gauge.getBoundingClientRect();
            if(gauge.hidden||box.width!==88||box.height!==40)throw Error('Overview timer missing/unreadable: '+job.building);
            if(box.left<view.left+5||box.top<view.top+5||box.right>view.right-5||box.bottom>view.bottom-5)throw Error('Overview timer outside view: '+job.building);
            if(getComputedStyle(gauge).pointerEvents!=='none')throw Error('Timer intercepts map gestures');
            if(boxes.some(r=>box.left<r.right&&box.right>r.left&&box.top<r.bottom&&box.bottom>r.top))throw Error('Concurrent counters overlap');
            boxes.push(box);
            const text=gauge.querySelector('[data-estate-time-left]').getBoundingClientRect();
            if(text.left<view.left||text.right>view.right||text.top<view.top||text.bottom>view.bottom)throw Error('Countdown clipped');
            for(const district of document.querySelectorAll('.estate-district:not([hidden])')){
              const r=district.querySelector('span').getBoundingClientRect(),overlap=box.left<r.right+2&&box.right>r.left-2&&box.top<r.bottom+2&&box.bottom>r.top-2;
              if(overlap&&getComputedStyle(district).visibility!=='hidden')throw Error('District covers active countdown');
            }
          }
          if([...document.querySelectorAll('.estate-nameplate')].some(e=>!e.hidden))throw Error('Overview must retain hidden name/level captions');
          return boxes.length;
        };
        const keys=await evaluate(()=>CrownlandsEstate.buildings.map(b=>b.key));
        for(const key of keys){await evaluate(k=>qaJobs([k]),key);await frames();assert.equal(await evaluate(check),1);}
        for(const keys of [['great-hall','treasury','barracks'],['quarry','mine','foresters-lodge'],['alehouse','royal-stables','guild-master']]){
          await evaluate(ks=>qaJobs(ks),keys);await frames();assert.equal(await evaluate(check),3);
        }
        await evaluate(()=>qaJobs(['great-hall','treasury','barracks']));await frames();
        const capture=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,delivery+'-'+width+'x'+height+'.png'),Buffer.from(capture.data,'base64'));
        await evaluate(()=>{qaNow+=10000;qaView.updateResources();});
        assert.equal(await evaluate(()=>document.querySelector('[data-estate-construction="great-hall"] [data-estate-time-left]').textContent),'0:20');
        await evaluate(()=>{qaNow+=20000;qaView.updateResources();});
        assert(await evaluate(()=>qaEstate.jobs.every(j=>document.querySelector('[data-estate-construction="'+j.building+'"] [data-estate-time-left]').textContent==='Finishing…')));
        await evaluate(()=>{qaJobs([]);qaView.fit();});await frames();
        assert(await evaluate(()=>![...document.querySelectorAll('.estate-construction-timer')].some(e=>!e.hidden)&&!document.querySelector('.estate-timer-obscured')),'Confirmed completion restores district labels');
        await evaluate(()=>{qaJobs(['quarry']);qaView.select('quarry');document.querySelector('[data-estate-detail-close]').click();});await frames();
        assert(await evaluate(()=>{
          const g=document.querySelector('[data-estate-construction="quarry"]'),r=g.getBoundingClientRect(),a=document.querySelector('[data-estate-site="quarry"] img').getBoundingClientRect();
          return !g.hidden&&r.width===112&&Math.abs(a.top-r.bottom-6)<.5&&g.querySelector('i').hidden;
        }),'District timer retains its fixed art anchor');
        await evaluate(()=>qaView.fit());await frames();assert.equal(await evaluate(check),1);
        await evaluate(()=>{qaView.zoom(4);qaView.select('market');document.querySelector('[data-estate-detail-close]').click();});await frames();
        assert(await evaluate(()=>document.querySelector('[data-estate-construction="quarry"]').hidden),'Offscreen projects must not float on another site');
        await evaluate(()=>{qaView.fit();qaView.destroy();});
        assert.equal(await evaluate(()=>document.querySelectorAll('.estate-construction-timers,.estate-construction-note,.estate-timer-obscured').length),0);
        results.push({delivery,width,height,sites:20,concurrentGroups:3,fitVisible:true,completion:true,zoomReturn:true,offscreen:true,cleanup:true});
        console.log(`Estate overview construction timers passed: ${delivery} ${width}x${height}.`);
      }
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({passed:true,results},null,2)+'\n');
  } finally {
    if(client){await client.send('Browser.close').catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
