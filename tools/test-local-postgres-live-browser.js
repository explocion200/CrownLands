"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const {createFixture}=require("./map-benchmark/seamless/live-test-fixture"),{createLiveServer}=require("./map-benchmark/seamless/live-server");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main({openWorld=false}={}){
 const f=await createFixture({players:2,crowded:true,appearances:true,openWorld}),server=await createLiveServer({reader:f.reader,grants:f.grants}),address=await server.listen();
 const browsers=[],clients=[],errors=[],external=[],measurements=[];const output=path.resolve(openWorld?"release-artifacts/continuous-open-routing":"release-artifacts/continuous-live-reader");fs.mkdirSync(output,{recursive:true});
 try{
  for(let i=0;i<2;i++){
   const browser=await startBrowserSession(process.env.CHROME_PATH||"/usr/bin/google-chrome");browsers.push(browser);
   const cdp=await CdpClient.connect(browser.targets.find(t=>t.type==="page").webSocketDebuggerUrl);clients.push(cdp);
   for(const domain of ["Page","Runtime","Network"])await cdp.send(domain+".enable");
   cdp.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.text));cdp.on("Network.requestWillBeSent",e=>{if(!e.request.url.startsWith(address.url+"/")&&!/^(blob:|data:)/.test(e.request.url))external.push(e.request.url);});
  }
  const evaluate=async(i,fn,arg)=>{const r=await clients[i].send("Runtime.evaluate",{expression:`(${fn.toString()})(${JSON.stringify(arg)||"undefined"})`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async(i,fn)=>{for(let n=0;n<300;n++){if(await evaluate(i,fn).catch(()=>false))return;await sleep(100);}throw Error("Browser condition timed out: "+fn+" "+JSON.stringify(await evaluate(i,()=>({text:document.body.innerText,snapshot:window.seamlessPreview?.snapshot()}))));};
  for(let i=0;i<2;i++){
   await clients[i].send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
   await clients[i].send("Page.navigate",{url:address.entry});await wait(i,()=>document.readyState==="complete"&&!!document.getElementById("reader-login"));
   await evaluate(i,key=>{document.getElementById("key").value=key;document.querySelector("#reader-login button").click();},f.grants[i].key);
   await wait(i,()=>window.seamlessPreview?.snapshot().feed.objects>0);await wait(i,()=>!seamlessPreview.snapshot().assets.pending);
   assert.equal(await evaluate(i,()=>seamlessPreview.snapshot().assets.failed),0);
  }
  const city=await evaluate(0,()=>seamlessPreview.scene.objects.find(o=>o.kind==="castle"&&o.troopVisibility==="exact"));assert.ok(city);
  assert.equal(city.asset,require("../functions/cosmetics").item("halloween_city").assets[2]);
  const other=await evaluate(1,key=>seamlessPreview.scene.objects.find(o=>o.key===key),city.key);assert.equal(other.troopVisibility,"hidden");assert.ok(!Object.hasOwn(other,"troops"));
  for(let i=0;i<2;i++)await evaluate(i,o=>{seamlessPreview.view(o.x,o.y);seamlessPreview.select(o.key);},city);
  await sleep(250);
  assert.equal(await evaluate(0,key=>document.querySelector(`[data-key="${key}"] .preview-owner-flag`)?.dataset.flagVersion,city.key),"2");
  assert.notEqual(await evaluate(0,()=>document.getElementById("troops").textContent),await evaluate(1,()=>document.getElementById("troops").textContent));
  await sleep(1200);await wait(0,()=>!seamlessPreview.snapshot().feed.pending);
  const beforeArea=await evaluate(0,()=>seamlessPreview.snapshot().feed.snapshots);
  await evaluate(0,o=>{
    const s=seamlessPreview.snapshot(),model=SeamlessModel.forWorld(seamlessPreview.scene);
    const candidates=[1600,-1600,2400,-2400,3200,-3200].flatMap(offset=>[{...s.camera,x:s.camera.x+offset},{...s.camera,y:s.camera.y+offset}]);
    const next=candidates.find(camera=>{const ids=model.interestSections(seamlessPreview.scene.sections,camera,s.size,s.feed.ids).map(a=>a.id).sort();return ids.includes(o.sectionId)&&JSON.stringify(ids)!==JSON.stringify(s.feed.ids);});
    if(!next)throw Error("No retained-selection boundary fixture");seamlessPreview.view(next.x,next.y);
  },city);
  for(let n=0;n<40;n++){if(await evaluate(0,prior=>seamlessPreview.snapshot().feed.snapshots>prior,beforeArea))break;await sleep(100);}
  assert.ok(await evaluate(0,prior=>seamlessPreview.snapshot().feed.snapshots>prior,beforeArea),"Camera did not cross an area boundary");
  assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().selected),city.key,"Retained selection was cleared by an area change");
  await f.store.doc(`${f.island(city.sectionId)}/cities/${city.id}`).update({ownerUid:f.grants[1].uid,ownerName:"Fixture new owner"});
  // Wait explicitly with the identity in the expression; no global game data.
  for(let n=0;n<30;n++){if(await evaluate(0,key=>seamlessPreview.scene.objects.find(o=>o.key===key)?.troopVisibility==="hidden",city.key))break;await sleep(200);}
  assert.equal(await evaluate(0,key=>seamlessPreview.scene.objects.find(o=>o.key===key).troopVisibility,city.key),"hidden");
  if(openWorld){
   await evaluate(0,()=>seamlessPreview.home());await sleep(1200);
   const endpoints=await evaluate(0,()=>{
    const s=seamlessPreview.scene,home=s.sections.find(s=>s.id===seamlessPreview.scene.homeSectionId),east=s.sections.find(s=>s.x===home.x+1448&&s.y===home.y);
    const from=s.objects.filter(o=>o.kind==="castle"&&o.sectionId===home.id&&o.previewLocal.x>1300).sort((a,b)=>a.y-b.y)[0];
    const to=s.objects.filter(o=>o.kind==="castle"&&o.sectionId===east.id&&o.previewLocal.x<120).sort((a,b)=>Math.abs(a.y-from.y)-Math.abs(b.y-from.y))[0];
    return{from,to};
   });assert.ok(endpoints.from&&endpoints.to);
   await evaluate(0,o=>{seamlessPreview.view(o.x,o.y);seamlessPreview.select(o.key);document.getElementById("route-from").click();},endpoints.from);
   await evaluate(0,o=>{seamlessPreview.view(o.x,o.y);seamlessPreview.select(o.key);document.getElementById("route-to").click();},endpoints.to);
   await wait(0,()=>!!seamlessPreview.routeDraft.snapshot().route);
   const route=await evaluate(0,()=>seamlessPreview.routeDraft.snapshot().route);
   assert.deepEqual(route.points[0],{x:endpoints.from.x,y:endpoints.from.y});assert.deepEqual(route.points.at(-1),{x:endpoints.to.x,y:endpoints.to.y});
   await evaluate(0,()=>document.getElementById("route-follow").click());await sleep(400);
   assert.equal(await evaluate(0,()=>seamlessPreview.routeDraft.snapshot().following),true);
   await evaluate(0,()=>seamlessPreview.view(seamlessPreview.snapshot().camera.x+30,seamlessPreview.snapshot().camera.y));
   assert.equal(await evaluate(0,()=>seamlessPreview.routeDraft.snapshot().following),false);
   await evaluate(0,()=>{document.getElementById("route-to").click();document.getElementById("route-clear").click();});await sleep(1100);
   assert.equal(await evaluate(0,()=>seamlessPreview.routeDraft.snapshot().route),null,"Obsolete route response restored cleared state");
  }
  for(const [width,height]of[[1440,900],[844,390],[568,320]]){
   await clients[0].send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<1000});await clients[0].send("Emulation.setCPUThrottlingRate",{rate:width<1000?4:1});
   await evaluate(0,()=>seamlessPreview.home());await sleep(1100);
   if(openWorld){
    await evaluate(0,()=>{const o=seamlessPreview.scene.objects.find(o=>o.kind==="castle");seamlessPreview.select(o.key);});
    const touch=width<1000;
    const point=await evaluate(0,()=>{const r=document.getElementById("route-from").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
    if(touch){await clients[0].send("Emulation.setTouchEmulationEnabled",{enabled:true});await clients[0].send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});await clients[0].send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});}
    else{await clients[0].send("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",clickCount:1});await clients[0].send("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",clickCount:1});}
    assert.ok(await evaluate(0,()=>seamlessPreview.routeDraft.snapshot().source));
    assert.equal(await evaluate(0,()=>{const a=document.querySelector(".open-route-panel").getBoundingClientRect(),b=document.getElementById("inspector").getBoundingClientRect();return a.right>b.left&&a.bottom>b.top;}),false,"Mobile route panels overlap");
   }
   const result=await evaluate(0,async()=>{const base=seamlessPreview.snapshot().camera;seamlessPreview.resetMetrics();const start=performance.now();await new Promise(resolve=>{function move(t){const n=(t-start)/1000;seamlessPreview.view(base.x+Math.sin(n)*350,base.y+Math.cos(n)*180,base.zoom*(1+0.08*Math.sin(n)));if(n<6)requestAnimationFrame(move);else resolve();}requestAnimationFrame(move);});const s=seamlessPreview.snapshot(),frames=s.frameTimes.slice().sort((a,b)=>a-b);return{fps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),p95:frames[Math.floor(frames.length*.95)],assets:s.assets,nodes:s.nodes,listeners:s.listeners};});
   measurements.push({width,height,...result});assert.ok(result.assets.full<=4&&result.assets.thumbnails<=16&&result.assets.peakRequests<=2);assert.equal(result.assets.failed,0);
   assert.equal(await evaluate(0,()=>document.documentElement.scrollWidth>innerWidth),false);
   await clients[0].send("Emulation.setCPUThrottlingRate",{rate:1});
   fs.writeFileSync(path.join(output,`reader-${width}.png`),Buffer.from((await clients[0].send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  }
  // A real march follows recorded timestamps and stops at arrival; it never
  // ping-pongs like a sample patrol. Shared native touch/navigation suites also run.
  const march=await evaluate(0,()=>seamlessPreview.scene.marches.find(m=>m.sections.length===2));assert.ok(march);
  const route={points:march.points};
  await evaluate(0,m=>{seamlessPreview.select(m.key);document.getElementById("follow").click();seamlessPreview.time(m.departAt);},march);await sleep(100);
  const start=await evaluate(0,key=>seamlessPreview.snapshot().marches.find(m=>m.key===key).position,march.key);
  assert.ok(Math.hypot(start.x-route.points[0].x,start.y-route.points[0].y)<.01);
  await evaluate(0,m=>{seamlessPreview.time(m.arriveAt+60);},march);await sleep(1700);
  const position=await evaluate(0,key=>seamlessPreview.snapshot().marches.find(m=>m.key===key)?.position,march.key);
  const end=route.points.at(-1);assert.ok(Math.hypot(position.x-end.x,position.y-end.y)<.01);
  const followed=await evaluate(0,()=>seamlessPreview.snapshot());assert.equal(followed.following,march.key);assert.ok(Math.hypot(followed.camera.x-position.x,followed.camera.y-position.y)<.01);
  await evaluate(0,()=>{seamlessPreview.time(null);seamlessPreview.view(1000,1000);});assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().following),null);
  await evaluate(0,()=>document.getElementById("fit").click());await sleep(500);assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().feed.sections),0);assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().selected),null);
  await evaluate(0,()=>seamlessPreview.home());await sleep(1500);
  await f.store.doc(`players/${f.grants[0].uid}`).update({resetGeneration:"old"});await wait(0,()=>seamlessPreview.snapshot().feed.authExpired);
  assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().feed.objects),0);assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().selected),null);
  if(openWorld)assert.equal(await evaluate(0,()=>seamlessPreview.routeDraft.snapshot().source),null,"Revocation retained draft data");
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(output,"browser.json"),JSON.stringify({at:new Date().toISOString(),fictionalAccounts:2,measurements,errors,external},null,2));
  console.log("Two independent viewers: disclosure isolation, live ownership update, 112-section overview, desktop/mobile rendering, revoked membership and no external requests passed.");
 }finally{
  for(const c of clients){await c.send("Browser.close").catch(()=>{});c.close();}for(const b of browsers){if(!await waitForProcessExit(b.browserProcess)){b.browserProcess.kill("SIGKILL");await waitForProcessExit(b.browserProcess);}await removeBrowserProfile(b.profilePath);}
  await server.close();await f.close();
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
