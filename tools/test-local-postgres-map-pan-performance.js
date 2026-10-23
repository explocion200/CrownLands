"use strict";
// Identical crowded routes for source/baseline diagnosis and the packaged client.
// All HTTP traffic is intercepted; the database and accounts are disposable.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {chromium}=require("playwright");
const {createGameplayPilot}=require("./map-benchmark/seamless/gameplay-pilot");
const {createAuthenticatedNativeHarness}=require("./map-benchmark/seamless/native-auth-harness");
const baseline=process.argv.find(a=>a.startsWith("--baseline="))?.slice(11),source=process.argv.includes("--source");
const crowded=!process.argv.includes("--normal");
const soakSeconds=Number(process.env.CROWNLANDS_MAP_SOAK_SECONDS||0);
if(!Number.isInteger(soakSeconds)||soakSeconds<0||soakSeconds>3600)throw Error("Invalid soak duration");
const ref=baseline&&execFileSync("git",["rev-parse","--verify",baseline+"^{commit}"],{encoding:"utf8"}).trim();
const output=path.resolve("release-artifacts/map-pan-performance",(ref?"baseline":source?"source":"packaged")+(crowded?"":"-normal")+(soakSeconds?"-soak":""));
(async()=>{
 const pilot=await createGameplayPilot({productionRouting:true});let world,harness,browser;
 const results=[],errors=[];fs.mkdirSync(output,{recursive:true});
 try{
  // Varied stage sizes and long owned banners across the same nine Core maps.
  const sections=pilot.reader.manifest.sections.filter(s=>s.gridX>=-2&&s.gridX<=0&&s.gridY>=-2&&s.gridY<=0);
  if(crowded)for(const s of sections){const docs=(await pilot.store.collection(`islands/${pilot.identity.worldId}--${pilot.identity.realmShardId}--${s.id}/cities`).get()).docs,batch=pilot.store.batch();
   docs.forEach((d,i)=>batch.update(d.ref,{level:[1,25,50,75,100][i%5],ownerUid:pilot.players[i%2].uid,ownerKind:"player",ownerName:i%2?"The Northern Sovereign":"Pilot Rowan",ownerClanTag:"CROWN",ownerFlag:require("../functions/playerFlagConfig").DEFAULT_FLAG}));await batch.commit();}
  world=require("../local-backend/world/service").createWorldService({store:pilot.store,readPool:pilot.reader.pool,deployment:require("./map-benchmark/seamless/production-test-policy").productionTestPolicy(pilot.store),directory:path.resolve("release-artifacts/map-pan-performance/terrain"),enabled:true});
  await world.prepare(pilot.players[0].uid);harness=await createAuthenticatedNativeHarness(pilot,{productionWorld:world});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,hasTouch:true,serviceWorkers:"block"});await context.addCookies(harness.cookies(0));
  await context.route("**/*",async route=>{
   const req=route.request(),pathname=new URL(req.url()).pathname,base=new URL(harness.url).pathname;
   const file=pathname.startsWith(base)?pathname.slice(base.length):pathname.slice(1);
   if((ref||source)&&/^world\/[a-z-]+\.(js|css|html)$/.test(file))return route.fulfill({status:200,contentType:file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html",body:ref?execFileSync("git",["show",`${ref}:${file}`]):fs.readFileSync(file)});
   await route.fulfill(await harness.request(req.url(),req.method(),await req.allHeaders(),req.postDataBuffer()));
  });
  const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));await page.goto(harness.url);
  await page.getByRole("button",{name:"Keep analytics off"}).click();await page.waitForFunction(()=>!document.getElementById("enterKingdomBtn")?.disabled);await page.locator("#enterKingdomBtn").click();
  await page.waitForFunction(()=>!!window.CrownlandsContinuousWorld&&!isMapInteractionBlocked(),null,{timeout:90000});
  if(source)assert.equal(await page.evaluate(()=>typeof CrownlandsContinuousWorld.view.snapshot().pooledNodes),"number","Source renderer must actually be loaded");
  const cdp=await context.newCDPSession(page);await cdp.send("Performance.enable");
  for(const [width,height,cpu]of [[844,390,4],[568,320,4],[1440,900,1]]){
   await page.setViewportSize({width,height});await cdp.send("Emulation.setCPUThrottlingRate",{rate:cpu});
   for(const zoom of ["home","min"]){
    await page.evaluate(zoom=>{if(modal.open)modal.close();clearSelection(false);const v=CrownlandsContinuousWorld.view,s=v.scene.sections.find(s=>s.name==="Stoneward");v.view(s.x+724,s.y+543,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size)[zoom]);},zoom);
    await page.waitForTimeout(2000);
    // Startup can deliver a welcome/reward dialog after the initial enter.
    // An intentionally obscured renderer is not a meaningful pan measurement.
    await page.evaluate(()=>{if(modal.open)modal.close();});
    // Warm the identical route first. Initial authentication and artwork decode
    // are separate from sustained pan performance; residency stays bounded.
    await page.evaluate(async()=>{const v=CrownlandsContinuousWorld.view,c=v.snapshot().camera;let start;await new Promise(done=>{function move(t){start??=t;const e=t-start;v.view(c.x+Math.sin(e/1400)*1200,c.y+Math.sin(e/2000)*800,c.zoom);if(e<6500)requestAnimationFrame(move);else {v.view(c.x,c.y,c.zoom);done();}}requestAnimationFrame(move);});});
    await page.waitForTimeout(1000);
    await page.evaluate(()=>{if(modal.open)modal.close();});
    await page.waitForFunction(()=>isMapPresentationVisible());
    const tracing=process.env.CROWNLANDS_MAP_TRACE==="1"&&width===844&&zoom==="min",events=[];
    const collect=packet=>events.push(...packet.value);if(tracing){cdp.on("Tracing.dataCollected",collect);await cdp.send("Tracing.start",{categories:"devtools.timeline",transferMode:"ReportEvents"});}
    const before=(await cdp.send("Performance.getMetrics")).metrics;
    const sample=await page.evaluate(async()=>{
     const v=CrownlandsContinuousWorld.view,c=v.snapshot().camera;v.resetMetrics();let start;
     await new Promise(done=>{function move(t){start??=t;const e=t-start;v.view(c.x+Math.sin(e/1400)*1200,c.y+Math.sin(e/2000)*800,c.zoom);if(e<6500)requestAnimationFrame(move);else done();}requestAnimationFrame(move);});
     const s=v.snapshot(),p=(a,q)=>[...a].sort((a,b)=>a-b)[Math.floor(a.length*q)];return{fps:1000/(s.frameTimes.reduce((a,b)=>a+b,0)/s.frameTimes.length),frameP95:p(s.frameTimes,.95),frameP99:p(s.frameTimes,.99),workP95:p(s.workTimes,.95),longFrames:s.frameTimes.filter(t=>t>50).length,frames:s.frameTimes.length,nodes:s.nodes,pooledNodes:s.pooledNodes,assets:s.assets,renderer:s.renderer,labels:SeamlessAppearance.stats?.(),feed:{pending:s.feed.pending,failed:s.feed.failed,sections:s.feed.sections,requests:s.feed.requests}};
    });
    const after=(await cdp.send("Performance.getMetrics")).metrics,perf={};for(const name of ["TaskDuration","ScriptDuration","LayoutDuration","RecalcStyleDuration","JSHeapUsedSize"]){const a=after.find(m=>m.name===name)?.value,b=before.find(m=>m.name===name)?.value;perf[name]=name==="JSHeapUsedSize"?a:a-b;}
    if(tracing){const ended=new Promise(resolve=>cdp.once("Tracing.tracingComplete",resolve));await cdp.send("Tracing.end");await ended;cdp.off("Tracing.dataCollected",collect);const durations={};for(const e of events)if(e.ph==="X"&&e.dur)durations[e.name]=(durations[e.name]||0)+e.dur/1000;fs.writeFileSync(path.join(output,"diagnostic-trace.json"),JSON.stringify(durations,null,2));}
    assert(sample.frames>0&&Number.isFinite(sample.fps),"Pan measurement was obscured or did not produce frames");
    assert(sample.assets.full<=4&&sample.assets.thumbnails<=16&&sample.assets.peakRequests<=2);assert(!sample.feed.failed);assert(sample.nodes<2400);assert((sample.pooledNodes||0)<=512);
    if(sample.assets.sprites!==undefined)assert(sample.assets.sprites<=sample.assets.requestedSprites+64);
    if(sample.renderer)assert(sample.renderer.tiles<=1&&sample.renderer.tileBytes<=48*1024*1024);
    if(sample.labels)assert(sample.labels.measurements<=2048&&sample.labels.placements<=16);
    await page.screenshot({path:path.join(output,`${width}-${zoom}.png`)});results.push({width,height,cpu,zoom,...sample,perf});console.log(JSON.stringify(results.at(-1)));
   }
  }
  if(!ref){
   await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});await page.setViewportSize({width:844,height:390});
   const target=await page.evaluate(()=>{const v=CrownlandsContinuousWorld.view,s=v.scene.sections.find(s=>s.name==="Stoneward");v.view(s.x+724,s.y+543,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).max);return s.id;});
   await page.waitForFunction(id=>{const v=CrownlandsContinuousWorld.view;return !v.snapshot().feed.pending&&v.scene.objects.some(o=>o.sectionId===id&&o.kind==="castle");},target);
   const probe=await page.evaluate(id=>{const v=CrownlandsContinuousWorld.view,s=v.scene.sections.find(s=>s.id===id),o=v.scene.objects.filter(o=>o.sectionId===id&&o.kind==="castle").sort((a,b)=>Math.hypot(a.x-s.x-724,a.y-s.y-543)-Math.hypot(b.x-s.x-724,b.y-s.y-543))[0];v.view(o.x,o.y);return o;},target);
   const marker=`#continuous-game-surface .object[data-key="${probe.key}"]`;
   await page.locator(marker).waitFor();await page.locator(marker).evaluate(n=>{window.__retainedMarker=n;});
   const camera=await page.evaluate(()=>CrownlandsContinuousWorld.view.snapshot().camera);
   await page.evaluate(c=>CrownlandsContinuousWorld.view.view(c.x+650,c.y,c.zoom),camera);await page.locator(marker).waitFor({state:"detached"});
   await page.evaluate(c=>CrownlandsContinuousWorld.view.view(c.x,c.y,c.zoom),camera);await page.locator(marker).waitFor();
   assert(await page.locator(marker).evaluate(n=>n===window.__retainedMarker),"A returning authorized marker must reuse its node");
   await pilot.store.doc(`islands/${pilot.identity.worldId}--${pilot.identity.realmShardId}--${probe.sectionId}/cities/${probe.id}`).update({name:"Updated cache fixture"});
   await page.evaluate(()=>CrownlandsContinuousWorld.view.refresh());await page.locator(marker).getByText("Updated cache fixture",{exact:true}).waitFor();
   await page.evaluate(()=>{document.fonts.dispatchEvent(new Event("loadingdone"));CrownlandsContinuousWorld.view.invalidate();delete window.__retainedMarker;});
   await page.waitForFunction(()=>SeamlessAppearance.stats().measurements>0);
   {
    const geometry=await page.evaluate(()=>CrownlandsContinuousWorld.view.snapshot().geometryUpdates);
    await pilot.store.doc(`islands/${pilot.identity.worldId}--${pilot.identity.realmShardId}--${probe.sectionId}/cities/${probe.id}`).update({name:"Single incremental update"});
    await page.evaluate(()=>CrownlandsContinuousWorld.view.refresh());await page.locator(marker).getByText("Single incremental update",{exact:true}).waitFor();
    assert((await page.evaluate(()=>CrownlandsContinuousWorld.view.snapshot().geometryUpdates))-geometry<5,"One city update rebuilt the scene");
    const projection=await page.locator(marker).evaluate((n,key)=>{const v=CrownlandsContinuousWorld.view,s=v.snapshot(),o=v.getObject(key),p=SeamlessModel.project(s.camera,{x:o.left,y:o.top},s.size),r=n.getBoundingClientRect(),vp=CrownlandsContinuousWorld.root.querySelector("#viewport").getBoundingClientRect();return {dx:r.x-vp.x-p.x,dy:r.y-vp.y-p.y,width:s.surface.width*s.camera.zoom,height:s.surface.height*s.camera.zoom,size:s.size};},probe.key);
    assert(Math.abs(projection.dx)<1&&Math.abs(projection.dy)<1,"Presentation rebasing changed object coordinates");
    assert(projection.width<=projection.size.width+385&&projection.height<=projection.size.height+385,"World surface is unbounded");
    await page.evaluate(()=>modal.showModal());await page.waitForTimeout(100);
    const paused=await page.evaluate(()=>CrownlandsContinuousWorld.view.snapshot());await page.waitForTimeout(1700);
    const hidden=await page.evaluate(()=>CrownlandsContinuousWorld.view.snapshot());assert.equal(hidden.presentationFrames,paused.presentationFrames,"Obscured map kept painting");assert(hidden.feed.requests>paused.feed.requests,"Obscured map stopped authorization refreshes");
    await page.evaluate(()=>modal.close());await page.waitForFunction(n=>CrownlandsContinuousWorld.view.snapshot().presentationFrames>n,paused.presentationFrames);
   }
  }
  if(soakSeconds){
   await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});
   const soak=[];for(let elapsed=0;elapsed<soakSeconds;elapsed+=30){
    await page.evaluate(async()=>{const v=CrownlandsContinuousWorld.view,s=v.scene.sections.find(s=>s.name==="Stoneward");let start;await new Promise(done=>{function move(t){start??=t;const e=t-start;v.view(s.x+724+Math.sin(e/3000)*2600,s.y+543+Math.sin(e/4100)*1800,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).min);if(e<30000)requestAnimationFrame(move);else done();}requestAnimationFrame(move);});});
    if(elapsed%300===0||elapsed+30>=soakSeconds)await cdp.send("HeapProfiler.collectGarbage");
    const s=await page.evaluate(()=>{const v=CrownlandsContinuousWorld.view.snapshot();return {nodes:v.nodes,pooledNodes:v.pooledNodes,listeners:v.listeners,assets:v.assets,renderer:v.renderer,labels:SeamlessAppearance.stats?.()};});
    s.memory=await cdp.send("Memory.getDOMCounters");s.heapBytes=(await cdp.send("Performance.getMetrics")).metrics.find(m=>m.name==="JSHeapUsedSize").value;
    assert(s.nodes<2400&&(s.pooledNodes||0)<=512&&s.assets.full<=4&&s.assets.thumbnails<=16);
    assert(s.assets.sprites<=s.assets.requestedSprites+64&&s.renderer.tileBytes<=48*1024*1024&&s.labels.measurements<=2048&&s.labels.placements<=16);
    if(soak.length)assert.equal(s.listeners,soak[0].listeners);soak.push(s);
    fs.writeFileSync(path.join(output,"soak.json"),JSON.stringify({seconds:elapsed+30,samples:soak},null,2));console.log(`Soak ${elapsed+30}/${soakSeconds}s: ${s.nodes} active nodes, ${s.pooledNodes||0} retained.`);
   }
  }
  if(!ref){
   await page.evaluate(()=>{if(!modal.open)modal.showModal();});
   await pilot.store.doc("players/"+pilot.players[0].uid).update({worldId:"retired-fixture-world"});
   await page.evaluate(()=>CrownlandsContinuousWorld.view.refresh());
   await page.waitForFunction(()=>!window.CrownlandsContinuousWorld||CrownlandsContinuousWorld.view.snapshot().nodes===0);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,"report.json"),JSON.stringify({baseline:ref||null,source,crowded,traced:process.env.CROWNLANDS_MAP_TRACE==="1",results},null,2));
 }finally{await browser?.close();await harness?.close();await world?.close();await pilot.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
