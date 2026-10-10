"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

const root = path.resolve(__dirname, "..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const files = new Set(["inner-city-estate.js", "inner-city-estate.css", "estate-economy-ui.js", "estate-economy-ui.css", "action-buttons.css"]);
const out = path.join(root, "release-artifacts/estate-building-hit-areas");

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "A Chromium browser is required.");
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const built = url.pathname.startsWith("/built/");
    const file = url.pathname.replace(/^\/(?:built\/|source\/)?/, "");
    if (!file) {
      response.writeHead(200, { "content-type":"text/html; charset=utf-8", "content-security-policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'" });
      response.end('<!doctype html><html><head><link rel="stylesheet" href="inner-city-estate.css"><link rel="stylesheet" href="estate-economy-ui.css"><link rel="stylesheet" href="action-buttons.css"></head><body style="margin:0"><dialog id="modal" class="modal bailey-modal"><div class="modal-card"><header><h2 id="modalTitle">Estate input fixture</h2><button id="closeModalBtn">Close</button></header><div id="modalBody"></div></div></dialog><script src="inner-city-estate.js"></script><script src="estate-economy-ui.js"></script></body></html>');
    } else if (files.has(file) || /^assets\/(?:inner-city-estate\/[a-z0-9-]+|optimized\/inner-castle-[a-z0-9-]+)\.webp$/.test(file)) {
      response.writeHead(200, { "content-type":file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "image/webp" });
      response.end(fs.readFileSync(path.join(root, built ? "dist" : "", file)));
    } else response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fs.mkdirSync(out, { recursive:true });
  let session, client;
  const errors = [], results = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async (fn, arg) => {
      const result = await client.send("Runtime.evaluate", { expression:`(${fn})(${JSON.stringify(arg)})`, awaitPromise:true, returnByValue:true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async fn => {
      for (let i = 0; i < 200; i++) { if (await evaluate(fn)) return; await delay(25); }
      throw Error("Timed out: " + fn);
    };
    const frames = () => evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const box = selector => evaluate(s => document.querySelector(s).getBoundingClientRect().toJSON(), selector);
    const mouse = (type, x, y) => client.send("Input.dispatchMouseEvent", { type, x, y, button:"left", buttons:type === "mouseReleased" ? 0 : 1, clickCount:type === "mouseMoved" ? 0 : 1 });
    const clickAt = async (x, y) => { await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); };
    const click = async selector => {
      const b = await box(selector), x = b.x + b.width / 2, y = b.y + b.height / 2;
      assert(await evaluate(({ selector, x, y }) => document.querySelector(selector).contains(document.elementFromPoint(x, y)), { selector, x, y }), "Covered control: " + selector);
      await clickAt(x, y);
    };
    const touch = (type, points = []) => client.send("Input.dispatchTouchEvent", { type, touchPoints:points });
    const tap = async selector => {
      const b = await box(selector);
      await touch("touchStart", [{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]);
      await touch("touchEnd");
    };
    const selectSite = async key => {
      await evaluate(k => { qaView.zoom(4); qaView.select(k); }, key);
      await click("[data-estate-detail-close]");
      await frames();
    };
    const assertPan = async (before, after, dx, dy) => {
      const geometry = await evaluate(() => {
        const viewport = document.querySelector(".estate-viewport").getBoundingClientRect();
        const world = document.querySelector(".estate-world").getBoundingClientRect();
        return {width:viewport.width,height:viewport.height,scale:world.width/CrownlandsEstate.width,mapWidth:CrownlandsEstate.width,mapHeight:CrownlandsEstate.height};
      });
      const clamp = (value, size, screen) => Math.max(screen/(2*geometry.scale),Math.min(size-screen/(2*geometry.scale),value));
      assert(Math.abs(after.x-clamp(before.x-dx/geometry.scale,geometry.mapWidth,geometry.width))<.1, "Drag must track the horizontal pointer distance without a jump.");
      assert(Math.abs(after.y-clamp(before.y-dy/geometry.scale,geometry.mapHeight,geometry.height))<.1, "Drag must track the vertical pointer distance without a jump.");
      assert(!after.detailOpen, "Dragging must not select/open a building.");
    };

    for (const delivery of process.argv.includes("--source-only") ? ["source"] : ["source", "built"]) {
      for (const [width, height] of [[1440,900],[844,390],[568,320]]) {
        await client.send("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:1,mobile:false});
        await client.send("Page.navigate", {url:`http://127.0.0.1:${server.address().port}/${delivery}/`});
        await wait(() => !!window.CrownlandsEstateEconomy);
        await evaluate(() => {
          window.qaEstate = {levels:Object.fromEntries(CrownlandsEstate.buildings.map(b=>[b.key,0])),jobs:[]};
          window.qaSelected = "great-hall";
          window.qaView = CrownlandsEstate.mount(document.getElementById("modalBody"), {
            cityName:"QA Estate",estate:qaEstate, now:()=>1000000,
            getResources:()=>({gold:100000,crowns:100,timber:1000,stone:1000,ore:1000,grain:1000,planks:1000,iron:1000,tools:1000,food:1000}),
            actions:CrownlandsEstateEconomy.mapActions(()=>'<svg aria-hidden="true"></svg>',null),
            onSelect:key=>{qaSelected=key;}, onBuilding:key=>{window.qaEntered=key;}, onUpgrade:key=>{window.qaUpgraded=key;},
          });
          document.getElementById("modal").showModal();qaView.fit();
        });
        await frames();
        const keys = await evaluate(() => CrownlandsEstate.buildings.map(b=>b.key));
        let offCenterClicks = 0;
        for (const state of ["unbuilt","constructing","completed"]) {
          await evaluate(next => {
            qaEstate.levels=Object.fromEntries(CrownlandsEstate.buildings.map(b=>[b.key,next==="completed"?1:0]));
            qaEstate.jobs=next==="constructing"?CrownlandsEstate.buildings.map(b=>({building:b.key,status:"running",target:1,durationMs:60000,completesAtMs:1060000})):[];
            qaView.updateEstate(qaEstate);
          }, state);
          for (const key of keys) {
            await selectSite(key);
            const art = await box(`[data-estate-site="${key}"]>img`);
            const target = await box(`[data-inner-castle-building="${key}"]`);
            assert(target.width>=44 && target.height>=44, key+" must retain a minimum touch target.");
            assert(target.left<=art.left+.1 && target.right>=art.right-.1 && target.top<=art.top+.1 && target.bottom>=art.bottom-.1, key+" target must cover its complete "+state+" artwork.");
            assert(await evaluate(k => !document.querySelector(`[data-inner-castle-building="${k}"]`).hidden,key), key+" must be selectable when centered at inspection zoom.");
            for (const [u,v] of [[.1,.5],[.9,.5],[.5,.1],[.5,.9]]) {
              const other = key === "great-hall" ? "treasury" : "great-hall";
              await evaluate(k => qaView.select(k,false),other);
              await click("[data-estate-detail-close]");
              const x=art.left+art.width*u,y=art.top+art.height*v;
              const hit=await evaluate(({key,x,y})=>{const element=document.elementFromPoint(x,y);return {correct:document.querySelector(`[data-inner-castle-building="${key}"]`).contains(element),element:element?.tagName+"."+element?.className};},{key,x,y});
              assert(hit.correct,`${delivery} ${width}x${height} ${state} ${key} edge ${u},${v} at ${x},${y} covered by ${hit.element}`);
              await clickAt(x,y);
              assert.equal(await evaluate(()=>qaSelected),key,state+" edge click must select "+key);
              if(Math.abs(x-art.left-art.width/2)>22 || Math.abs(y-art.top-art.height/2)>22)offCenterClicks++;
              await click("[data-estate-detail-close]");
            }
          }
        }
        assert(offCenterClicks>0,"Must exercise artwork outside the old 44px center hotspot.");
        await selectSite("royal-stables");
        const startBox=await box('[data-inner-castle-building="royal-stables"]');
        const x=startBox.x+startBox.width/2,y=startBox.y+startBox.height/2;
        const before=await evaluate(()=>qaView.snapshot());
        await mouse("mousePressed",x,y);
        // The first move deliberately leaves the viewport. Capture must retain
        // the gesture and its release, rather than losing the next drag/tap.
        await mouse("mouseMoved",-25,y+20);
        await mouse("mouseReleased",-25,y+20);
        await assertPan(before,await evaluate(()=>qaView.snapshot()),-25-x,20);
        assert.equal(await evaluate(()=>qaSelected),"royal-stables");
        await click("[data-estate-fit]");await click('[data-estate-district="city"]');
        assert.equal(await evaluate(()=>qaView.snapshot().zoom),2.5,"A tap after dragging must still activate the district.");
        await selectSite("royal-stables");
        const jitter=await box('[data-inner-castle-building="royal-stables"]'),jx=jitter.x+jitter.width/2,jy=jitter.y+jitter.height/2;
        const jitterBefore=await evaluate(()=>qaView.snapshot());
        await mouse("mousePressed",jx,jy);await mouse("mouseMoved",jx+2,jy);
        assert.equal(await evaluate(()=>qaView.snapshot().x),jitterBefore.x,"Small click jitter must not move the camera.");
        await mouse("mouseReleased",jx+2,jy);
        assert.equal(await evaluate(()=>qaView.snapshot().detailOpen),true,"Small click jitter must still select the building.");
        await selectSite("royal-stables");
        const slowBefore=await evaluate(()=>qaView.snapshot());
        await mouse("mousePressed",jx,jy);
        for(const dx of [2,6,10,30,60])await mouse("mouseMoved",jx+dx,jy);
        await mouse("mouseReleased",jx+60,jy);
        await assertPan(slowBefore,await evaluate(()=>qaView.snapshot()),60,0);
        await selectSite("royal-stables");
        const terrain=await evaluate(()=>{
          const viewport=document.querySelector('.estate-viewport'),r=viewport.getBoundingClientRect();
          for(let y=r.top+30;y<r.bottom-70;y+=30)for(let x=r.left+30;x<r.right-30;x+=30)if(document.elementFromPoint(x,y)===viewport)return {x,y};
        });
        assert(terrain,"Must find open terrain to exercise background dragging.");
        const terrainBefore=await evaluate(()=>qaView.snapshot());
        await mouse("mousePressed",terrain.x,terrain.y);await mouse("mouseMoved",terrain.x-50,terrain.y-30);await mouse("mouseReleased",terrain.x-50,terrain.y-30);
        await assertPan(terrainBefore,await evaluate(()=>qaView.snapshot()),-50,-30);
        const keyboardBefore=await evaluate(()=>qaView.snapshot());
        await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
        await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
        await assertPan(keyboardBefore,await evaluate(()=>qaView.snapshot()),-70,0);
        await selectSite("royal-stables");
        await client.send("Emulation.setTouchEmulationEnabled",{enabled:true});
        const t=await box('[data-inner-castle-building="royal-stables"]'),tx=t.x+t.width/2,ty=t.y+t.height/2;
        const touchBefore=await evaluate(()=>qaView.snapshot());
        await touch("touchStart",[{x:tx,y:ty,id:1}]);
        for(let i=1;i<=6;i++){await touch("touchMove",[{x:tx-60*i/6,y:ty+12*i/6,id:1}]);await delay(16);}
        await touch("touchEnd");
        await assertPan(touchBefore,await evaluate(()=>qaView.snapshot()),-60,12);
        await selectSite("royal-stables");
        await touch("touchStart",[{x:tx,y:ty,id:1}]);
        await touch("touchMove",[{x:tx-10,y:ty,id:1}]);await touch("touchCancel");
        await tap("[data-estate-fit]");await tap('[data-estate-district="city"]');
        assert.equal(await evaluate(()=>qaView.snapshot().zoom),2.5,"Cancellation must not poison the next touch gesture.");
        await selectSite("royal-stables");
        await evaluate(()=>qaView.zoom(2.5));
        const p=await box('[data-inner-castle-building="royal-stables"]'),px=p.x+p.width/2,py=p.y+p.height/2;
        await touch("touchStart",[{x:px-8,y:py,id:1},{x:px+8,y:py,id:2}]);
        await touch("touchMove",[{x:px-24,y:py,id:1},{x:px+24,y:py,id:2}]);await touch("touchEnd");
        assert.equal(await evaluate(()=>qaView.snapshot().zoom),4,"Pinching across a building must zoom without selecting it.");
        assert.equal(await evaluate(()=>qaView.snapshot().detailOpen),false);
        await client.send("Emulation.setTouchEmulationEnabled",{enabled:false});
        await click("[data-estate-fit]");await click('[data-estate-district="city"]');
        await selectSite("mine");
        const actionsBefore=await evaluate(()=>qaView.snapshot());
        for(const action of ["upgrade","enter"]){
          const selector=`.estate-${action}-target[data-estate-${action}="mine"]`;
          assert(await evaluate(s=>!document.querySelector(s).hidden,selector),"Selected map actions must remain visible beside an isolated building.");
          await click(selector);
          assert.equal(await evaluate(a=>a==="upgrade"?qaUpgraded:qaEntered,action),"mine","Map action must keep its callback.");
          assert.deepEqual(await evaluate(()=>qaView.snapshot()),actionsBefore,"Map action click must not initiate a pan or building selection.");
        }
        await selectSite("great-hall");
        await evaluate(()=>{qaView.select("treasury",false);document.querySelector('[data-estate-detail-close]').click();document.querySelector('[data-inner-castle-building="great-hall"]').focus();});
        await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r"});
        await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
        assert.equal(await evaluate(()=>qaSelected),"great-hall","Expanded target must remain keyboard accessible.");
        await click("[data-estate-detail-close]");
        const capture=await client.send("Page.captureScreenshot",{format:"png"});
        fs.writeFileSync(path.join(out,`${delivery}-${width}x${height}.png`),Buffer.from(capture.data,"base64"));
        await evaluate(()=>qaView.destroy());
        results.push({delivery,width,height,sites:20,states:3,offCenterClicks,mouse:true,touch:true,cancel:true,pinch:true,keyboard:true,mapActions:true});
        console.log(`Estate footprint clicks and pointer gestures passed: ${delivery} ${width}x${height}.`);
      }
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,"verification.json"),JSON.stringify({passed:true,results},null,2)+"\n");
  } catch(error) {
    if(client){const capture=await client.send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(out,"failure.png"),Buffer.from(capture.data,"base64"));}
    throw error;
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
