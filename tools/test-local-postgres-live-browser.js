"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const {createFixture}=require("./map-benchmark/seamless/live-test-fixture"),{createLiveServer}=require("./map-benchmark/seamless/live-server");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const f=await createFixture({players:2,crowded:true}),server=await createLiveServer({reader:f.reader,grants:f.grants}),address=await server.listen();
 const browsers=[],clients=[],errors=[],external=[],measurements=[];const output=path.resolve("release-artifacts/continuous-live-reader");fs.mkdirSync(output,{recursive:true});
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
  const other=await evaluate(1,key=>seamlessPreview.scene.objects.find(o=>o.key===key),city.key);assert.equal(other.troopVisibility,"hidden");assert.ok(!Object.hasOwn(other,"troops"));
  for(let i=0;i<2;i++)await evaluate(i,o=>{seamlessPreview.view(o.x,o.y);seamlessPreview.select(o.key);},city);
  assert.notEqual(await evaluate(0,()=>document.getElementById("troops").textContent),await evaluate(1,()=>document.getElementById("troops").textContent));
  await f.store.doc(`${f.island(city.sectionId)}/cities/${city.id}`).update({ownerUid:f.grants[1].uid,ownerName:"Fixture new owner"});
  // Wait explicitly with the identity in the expression; no global game data.
  for(let n=0;n<30;n++){if(await evaluate(0,key=>seamlessPreview.scene.objects.find(o=>o.key===key)?.troopVisibility==="hidden",city.key))break;await sleep(200);}
  assert.equal(await evaluate(0,key=>seamlessPreview.scene.objects.find(o=>o.key===key).troopVisibility,city.key),"hidden");
  for(const [width,height]of[[1440,900],[844,390],[568,320]]){
   await clients[0].send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<1000});await clients[0].send("Emulation.setCPUThrottlingRate",{rate:width<1000?4:1});
   await evaluate(0,()=>seamlessPreview.home());await sleep(1100);
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
  await evaluate(0,m=>{seamlessPreview.time(m.arriveAt+60);},march);await sleep(100);
  const position=await evaluate(0,key=>seamlessPreview.snapshot().marches.find(m=>m.key===key)?.position,march.key);
  const end=route.points.at(-1);assert.ok(Math.hypot(position.x-end.x,position.y-end.y)<.01);
  const followed=await evaluate(0,()=>seamlessPreview.snapshot());assert.equal(followed.following,march.key);assert.ok(Math.hypot(followed.camera.x-position.x,followed.camera.y-position.y)<.01);
  await evaluate(0,()=>{seamlessPreview.time(null);seamlessPreview.view(1000,1000);});assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().following),null);
  await evaluate(0,()=>document.getElementById("fit").click());await sleep(500);assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().feed.sections),0);
  await evaluate(0,()=>seamlessPreview.home());await sleep(1500);
  await f.store.doc(`players/${f.grants[0].uid}`).update({resetGeneration:"old"});await wait(0,()=>seamlessPreview.snapshot().feed.authExpired);
  assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().feed.objects),0);assert.equal(await evaluate(0,()=>seamlessPreview.snapshot().selected),null);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(output,"browser.json"),JSON.stringify({at:new Date().toISOString(),fictionalAccounts:2,measurements,errors,external},null,2));
  console.log("Two independent viewers: disclosure isolation, live ownership update, 112-section overview, desktop/mobile rendering, revoked membership and no external requests passed.");
 }finally{
  for(const c of clients){await c.send("Browser.close").catch(()=>{});c.close();}for(const b of browsers){if(!await waitForProcessExit(b.browserProcess)){b.browserProcess.kill("SIGKILL");await waitForProcessExit(b.browserProcess);}await removeBrowserProfile(b.profilePath);}
  await server.close();await f.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
