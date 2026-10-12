"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {CdpClient} = require("./map-benchmark/cdp-client");
const {startBrowserSession, waitForProcessExit, removeBrowserProfile} = require("./validate-focused-browser-smoke");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "release-artifacts/estate-camera-performance");
const measureOnly = process.argv.includes("--measure-only");
const files = new Set(["inner-city-estate.js", "inner-city-estate.css", "estate-economy-ui.js", "estate-economy-ui.css", "action-buttons.css"]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(chrome, "A Chromium browser is required");
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const built = pathname.startsWith("/built/");
    const file = pathname.replace(/^\/(?:source\/|built\/)?/, "");
    if (!file) {
      response.writeHead(200, {"content-type":"text/html; charset=utf-8", "content-security-policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'"});
      response.end('<!doctype html><html><head><link rel="stylesheet" href="inner-city-estate.css"><link rel="stylesheet" href="estate-economy-ui.css"><link rel="stylesheet" href="action-buttons.css"></head><body style="margin:0"><dialog id="modal" class="modal bailey-modal"><div class="modal-card"><header><button id="closeModalBtn">Close</button></header><div id="modalBody"></div></div></dialog><script src="inner-city-estate.js"></script><script src="estate-economy-ui.js"></script></body></html>');
    } else if (files.has(file) || /^assets\/(?:inner-city-estate\/[a-z0-9-]+|optimized\/inner-castle-[a-z0-9-]+)\.webp$/.test(file)) {
      response.writeHead(200, {"content-type":file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "image/webp"});
      response.end(fs.readFileSync(path.join(root, built ? "dist" : "", file)));
    } else response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  fs.mkdirSync(output,{recursive:true});
  const errors = [], results = [];
  let session, client;
  const close = async () => {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();client=null;}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);session=null;}
  };
  try {
    for(const delivery of process.argv.includes("--source-only") ? ["source"] : ["source","built"]) {
      for(const [width,height] of [[1440,900],[844,390],[568,320]]) {
        session = await startBrowserSession(chrome);
        client = await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
        await Promise.all([client.send("Page.enable"),client.send("Runtime.enable"),client.send("Performance.enable")]);
        client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
        await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
        const evaluate = async (fn,arg) => {
          const r = await client.send("Runtime.evaluate",{expression:`(${fn})(${JSON.stringify(arg)})`,awaitPromise:true,returnByValue:true});
          if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
          return r.result.value;
        };
        await client.send("Page.navigate",{url:`http://127.0.0.1:${server.address().port}/${delivery}/`});
        let ready = false;
        for(let i=0;i<200;i++){ready=await evaluate(()=>!!window.CrownlandsEstateEconomy);if(ready)break;await delay(25);}
        assert(ready,"Fixture did not load");
        for(const scenario of [{name:"inspection",zoom:3},{name:"overview",zoom:1.5},{name:"construction",zoom:3,jobs:true},{name:"overview-construction",zoom:1.5,jobs:true}]) {
          await evaluate(async scenario=>{
            window.scene={levels:Object.fromEntries(CrownlandsEstate.buildings.map(b=>[b.key,25])),jobs:scenario.jobs?["treasury","workshop","barracks"].map(building=>({building,status:"running",target:26,durationMs:60000,completesAtMs:1030000})):[]};
            window.options={estate:scene,cityName:"Camera QA",selectedKey:"",now:()=>1000000,getResources:()=>({}),actions:CrownlandsEstateEconomy.mapActions(()=>'<svg aria-hidden="true"></svg>',null)};
            window.view=CrownlandsEstate.mount(document.getElementById("modalBody"),options);
            document.getElementById("modal").showModal();view.fit();view.zoom(scenario.zoom);
            if(scenario.jobs){view.select("mine",false);document.querySelector('[data-estate-detail-close]').click();}
            await Promise.all([...document.images].filter(i=>i.src).map(i=>i.decode().catch(()=>{})));
            await document.fonts.ready;
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          },scenario);
          await client.send("Emulation.setCPUThrottlingRate",{rate:4});
          const metrics = async()=>Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map(m=>[m.name,m.value]));
          const before=await metrics();
          const interaction=await evaluate(async()=>{
            const viewport=document.querySelector('.estate-viewport'),world=document.querySelector('.estate-world'),bounds=viewport.getBoundingClientRect();
            let transforms=0;const intervals=[],eventCosts=[];
            const observer=new MutationObserver(records=>{transforms+=records.length;});observer.observe(world,{attributes:true,attributeFilter:['style']});
            let previous=performance.now();
            for(let frame=0;frame<30;frame++) {
              await new Promise(requestAnimationFrame);
              const now=performance.now();intervals.push(now-previous);previous=now;
              const begin=performance.now();
              for(let i=0;i<4;i++)viewport.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:frame<15?-2:2,clientX:bounds.left+bounds.width*.55,clientY:bounds.top+bounds.height*.45}));
              eventCosts.push(performance.now()-begin);
              transforms+=observer.takeRecords().length;
            }
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            transforms+=observer.takeRecords().length;observer.disconnect();
            intervals.sort((a,b)=>a-b);eventCosts.sort((a,b)=>a-b);
            return {frames:30,events:120,transforms,frameP95:intervals[Math.floor(intervals.length*.95)],eventP95:eventCosts[Math.floor(eventCosts.length*.95)],camera:view.snapshot()};
          });
          const after=await metrics();
          const row={delivery,width,height,scenario:scenario.name,cpuSlowdown:4,...interaction,layouts:after.LayoutCount-before.LayoutCount,styleRecalculations:after.RecalcStyleCount-before.RecalcStyleCount,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000};
          console.log(JSON.stringify(row));results.push(row);
          if(!measureOnly){assert(row.transforms>=row.frames-1&&row.transforms<=row.frames+2,"Wheel bursts must produce one camera paint per frame");assert(row.layouts<=row.frames*3+12,"Camera motion must not repeatedly force label layout");}
          assert(Math.abs(row.camera.zoom-scenario.zoom)<1e-8,"Reversed wheel input must preserve the complete zoom delta");
          await client.send("Emulation.setCPUThrottlingRate",{rate:1});
          await delay(250);
          const image=await client.send("Page.captureScreenshot",{format:"png"});
          fs.writeFileSync(path.join(output,`${measureOnly?'before':'after'}-${delivery}-${width}-${scenario.name}.png`),Buffer.from(image.data,"base64"));
          if(scenario.name==="inspection") {
            // A real press establishes pointer capture; a burst of move events
            // then exercises high-rate input without CDP round trips pacing it.
            const start=await evaluate(()=>{
              const viewport=document.querySelector('.estate-viewport'),r=viewport.getBoundingClientRect();
              viewport.addEventListener('pointerdown',event=>{window.dragId=event.pointerId;},{once:true});
              return {x:r.left+r.width/2,y:r.top+r.height/2};
            });
            await client.send("Input.dispatchMouseEvent",{type:"mousePressed",...start,button:"left",buttons:1,clickCount:1});
            const pan=await evaluate(async start=>{
              const viewport=document.querySelector('.estate-viewport'),world=document.querySelector('.estate-world'),before=view.snapshot();
              let transforms=0,x=start.x;const observer=new MutationObserver(records=>{transforms+=records.length;});
              observer.observe(world,{attributes:true,attributeFilter:['style']});
              for(let frame=0;frame<30;frame++){
                await new Promise(requestAnimationFrame);
                for(let i=0;i<4;i++){x+=frame<15?-1:1;viewport.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:dragId,pointerType:'mouse',buttons:1,clientX:x,clientY:start.y}));}
              }
              await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
              transforms+=observer.takeRecords().length;observer.disconnect();
              const after=view.snapshot();
              // Overshoot and reverse before a paint: clamping must happen per
              // event, otherwise the overshoot swallows the reversal.
              const scale=world.getBoundingClientRect().width/CrownlandsEstate.width;
              for(const dx of [-10000,20]){x+=dx;viewport.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:dragId,pointerType:'mouse',buttons:1,clientX:x,clientY:start.y}));}
              const expected=CrownlandsEstate.width-viewport.clientWidth/(2*scale)-20/scale;
              const edgeError=Math.abs(view.snapshot().x-expected);
              view.fit();
              await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
              return {transforms,before,after,edgeError,fit:view.snapshot(),center:CrownlandsEstate.width/2};
            },start);
            await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",...start,button:"left",buttons:0,clickCount:1});
            if(!measureOnly)assert(pan.transforms>=28&&pan.transforms<=31,"Drag bursts must paint once per frame");
            assert(pan.edgeError<1e-7,"Reversing a drag at the boundary must respond immediately");
            assert(Math.abs(pan.after.x-pan.before.x)<1e-7,"Reversed drag input must preserve every movement delta");
            assert.equal(pan.fit.zoom,1,"Fit must supersede a queued camera frame");
            assert.equal(pan.fit.x,pan.center);
            await evaluate(()=>{view.select("mine");document.querySelector('[data-estate-detail-close]').click();});
            const checkLabels=async()=>{
              const labels=await evaluate(()=>[...document.querySelectorAll('.estate-nameplate:not([hidden])')].map(label=>{
                const r=label.getBoundingClientRect(),art=document.querySelector(`[data-estate-site="${label.dataset.estateNameplate}"]>img`).getBoundingClientRect();
                return Math.abs((r.left+r.right-art.left-art.right)/2);
              }));
              assert(labels.length>0,"An isolated building must retain its nameplate");
              assert(labels.every(error=>error<1),"Cached nameplate dimensions must follow responsive and content changes");
            };
            await client.send("Emulation.setDeviceMetricsOverride",{width,height:height>550?500:600,deviceScaleFactor:1,mobile:false});
            await evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
            await checkLabels();
            await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
            await evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
            await evaluate(()=>{scene.levels.mine=100;view.updateEstate(scene);});
            await checkLabels();
            await evaluate(()=>{
              document.querySelectorAll('.estate-nameplate').forEach(label=>{label.style.fontSize='14px';});
              document.fonts.dispatchEvent(new Event('loadingdone'));
            });
            await checkLabels();
          }
          const idle=await evaluate(async()=>{
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            let mutations=0;const observer=new MutationObserver(records=>{mutations+=records.length;});
            observer.observe(document.getElementById('modalBody'),{subtree:true,attributes:true,childList:true});
            await new Promise(r=>setTimeout(r,250));mutations+=observer.takeRecords().length;observer.disconnect();return mutations;
          });
          assert.equal(idle,0,"The still estate must do no idle animation or layout writes");
          const cleanup=await evaluate(async()=>{
            const viewport=document.querySelector('.estate-viewport');
            viewport.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-10}));view.destroy();
            let mutations=0;const observer=new MutationObserver(records=>{mutations+=records.length;});observer.observe(document.getElementById('modalBody'),{subtree:true,attributes:true,childList:true});
            document.fonts.dispatchEvent(new Event('loadingdone'));
            await new Promise(r=>setTimeout(r,300));mutations+=observer.takeRecords().length;observer.disconnect();return mutations;
          });
          assert.equal(cleanup,0,"Closing an estate must cancel pending camera work");
        }
        await close();
      }
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,measureOnly?"before.json":"after.json"),JSON.stringify(results,null,2));
  } finally {await close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
