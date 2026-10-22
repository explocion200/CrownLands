"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),{createGameplayPilot}=require("./map-benchmark/seamless/gameplay-pilot"),{createAuthenticatedNativeHarness}=require("./map-benchmark/seamless/native-auth-harness");
const {createTravelFixture}=require("./world-travel-test-fixtures"),{createPlacementFixture}=require("./validate-marauder-terrain");
const {createMarauderPopulation}=require("../functions/marauder-population");
(async()=>{
 const p=await createGameplayPilot({productionRouting:true}),out=path.resolve("release-artifacts/npc-road-sites");fs.mkdirSync(out,{recursive:true});
 let world,harness,browser,page;const errors=[],outside=[],results=[];
 try{
  const travel=createTravelFixture(87),geometry=createPlacementFixture(travel,{routing:p.routing,context:p.context()});
  const regions=["core-v2-north-support-p0-m2","core-v2-north-east-holding-tower-p1-m1","core-v2-west-support-m2-p0","new-lands-l01-p005"];
  const island=id=>`islands/${p.identity.worldId}--${p.identity.realmShardId}--${id}`;
  const population=createMarauderPopulation({db:p.store,runTransaction:work=>p.store.runTransaction(work),context:()=>({...p.identity,storageId:p.identity.resetGeneration+"--"+p.identity.realmShardId}),activeRegions:async()=>regions,descriptor:travel.scope.getServerCatalogRegion,layout:geometry.geometry,islandId:id=>island(id).slice(8)});
  await population.rolloutRef().set({enabled:true});const targets=[];
  for(const id of regions){await p.store.doc(island(id)).set({...p.identity,regionId:id});const populated=await population.populate(id,Date.now());assert.equal(populated.spawned,id.startsWith("new-lands")?2:1);
   const rows=(await p.store.collection(island(id)+"/marauders").get()).docs;targets.push(...rows.map(r=>({key:id+":"+r.id,regionId:id,id:r.id})));
   const last=rows.at(-1),patch={status:"defeated",respawnAtMs:Date.now()+(id.startsWith("new-lands")?120000:1800000)};await last.ref.update(patch);await p.store.doc(island(id)+"/marauderCombat/"+last.id).update(patch);
   // Crowded player banners include ruler/clan lines, not just neutral names.
   const cities=(await p.store.collection(island(id)+"/cities").get()).docs;
   const batch=p.store.batch();for(const [i,city]of cities.entries())batch.update(city.ref,{ownerUid:p.players[i%2].uid,ownerKind:"player",ownerName:i%2?"Long Rival Ruler Name":"Long Friendly Ruler Name",ownerClanTag:"TEST",level:100});await batch.commit();
  }
  const deployment=require("./map-benchmark/seamless/production-test-policy").productionTestPolicy(p.store);
  world=require("../local-backend/world/service").createWorldService({store:p.store,readPool:p.reader.pool,deployment,directory:path.join(out,"terrain"),enabled:true});await world.prepare(p.players[0].uid);
  harness=await createAuthenticatedNativeHarness(p,{productionWorld:world});browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block"});await context.addCookies(harness.cookies(0));
  await context.addInitScript(()=>Object.defineProperty(window,"nativeContinuousWorld",{get:()=>window.CrownlandsContinuousWorld}));
  await context.route("**/*",async route=>{const r=route.request();if(!r.url().startsWith("https://playcrownlands.com/"))outside.push(r.url());try{await route.fulfill(await harness.request(r.url(),r.method(),await r.allHeaders(),r.postDataBuffer()));}catch(e){errors.push(e.message);await route.abort();}});
  page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));await page.goto(harness.url);await page.getByRole("button",{name:"Keep analytics off"}).click();await page.waitForFunction(()=>!document.getElementById("enterKingdomBtn")?.disabled);await page.locator("#enterKingdomBtn").click();await page.waitForFunction(()=>!!window.nativeContinuousWorld&&!isMapInteractionBlocked(),null,{timeout:90000});
  await page.evaluate(()=>{modal.close();clearSelection(false);nativeContinuousWorld.view.clear();});
  for(const [width,height]of [[1440,900],[844,390],[568,320]]){
   await page.setViewportSize({width,height});
   for(const target of targets){
    await page.evaluate(()=>{modal.close();clearSelection(false);nativeContinuousWorld.view.clear();});
    const s=p.reader.sections.get(target.regionId);await page.evaluate(s=>{const v=nativeContinuousWorld.view;v.view(s.x+s.width/2,s.y+s.height/2,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).home);},s);
    await page.waitForFunction(key=>{const v=nativeContinuousWorld.view;return !!v.getObject(key)&&!v.snapshot().feed.pending;},target.key);
    for(const fraction of [1,.65]){
     await page.evaluate(({key,fraction})=>{const v=nativeContinuousWorld.view,o=v.getObject(key),l=SeamlessModel.forWorld(v.scene).limits(v.snapshot().size);v.view(o.x,o.y,Math.max(l.min,l.max*fraction));},{key:target.key,fraction});
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     await page.waitForFunction(key=>{modal.close();return [...nativeContinuousWorld.root.querySelectorAll('.object')].some(n=>n.dataset.key===key);},target.key);
     const measure=await page.evaluate(key=>{const node=[...nativeContinuousWorld.root.querySelectorAll('.object')].find(n=>n.dataset.key===key),label=node.querySelector('.native-npc-label'),a=node.getBoundingClientRect(),b=label.getBoundingClientRect();
      const zoom=nativeContinuousWorld.view.snapshot().camera.zoom;
      const others=[...nativeContinuousWorld.root.querySelectorAll('.city-label')].filter(n=>n!==label&&getComputedStyle(n).visibility!=='hidden').map(n=>n.getBoundingClientRect());
      const castleScales=[...new Set([...nativeContinuousWorld.root.querySelectorAll('.castle>.map-banner')].map(n=>new DOMMatrix(getComputedStyle(n).transform).a))];
      return {castleScales,visible:getComputedStyle(label).visibility!=='hidden',dx:(b.left+b.right-a.left-a.right)/2,gap:a.top-b.bottom,zoom,labelWidth:b.width/zoom,labelHeight:b.height/zoom,overlaps:others.filter(r=>b.left<r.right-.5&&b.right>r.left+.5&&b.top<r.bottom-.5&&b.bottom>r.top+.5).length};},target.key);
     assert.deepEqual(measure.castleScales,[.72],"Castle overhead must remain 10% smaller at both zooms");
     assert(measure.visible);assert(Math.abs(measure.dx)<.5,"Detached label");assert(Math.abs(measure.gap-4*measure.zoom)<.5);assert.equal(measure.overlaps,0);assert(measure.labelWidth<=88.1&&measure.labelHeight<=27.3,"Label exceeds reserved footprint");results.push({width,height,target:target.key,fraction,...measure});
     if(fraction===1&&target===targets.at(-1))await page.screenshot({path:path.join(out,`labels-${width}.png`)});
    }
   }
   for(const uid of p.players.slice(0,2).map(player=>player.uid)){
    const key=await page.evaluate(uid=>{const v=nativeContinuousWorld.view,c=v.snapshot().camera,city=[...nativeContinuousWorld.root.querySelectorAll(".object.castle")].map(n=>v.getObject(n.dataset.key)).filter(o=>o.ownerUid===uid).sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y))[0];v.view(city.x,city.y);return city.key;},uid);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.evaluate(key=>nativeContinuousWorld.view.select(key),key);
    await page.waitForFunction(key=>!nativeContinuousWorld.bridge.running&&nativeContinuousWorld.root.querySelector(`[data-key="${key}"].selected .city-label`),key);
    const selected=await page.evaluate(key=>{const node=nativeContinuousWorld.root.querySelector(`[data-key="${key}"]`),banner=node.querySelector('.map-banner'),label=node.querySelector('.city-label'),zoom=nativeContinuousWorld.view.snapshot().camera.zoom;
     return {scale:new DOMMatrix(getComputedStyle(banner).transform).a,visible:getComputedStyle(label).visibility!=="hidden",width:label.getBoundingClientRect().width,expected:label.offsetWidth*.72*zoom,hasLevel:!!node.querySelector('.city-label-level,.foreign-selected-level')};},key);
    assert.equal(selected.scale,.72);assert(selected.visible&&selected.hasLevel);assert(Math.abs(selected.width-selected.expected)<1,"Selected-city banner paint and measurement disagree");
    if(uid===p.players[0].uid)await page.screenshot({path:path.join(out,`castle-overhead-${width}.png`)});
    await page.evaluate(()=>{nativeContinuousWorld.view.clear();clearSelection(false);});
   }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);fs.writeFileSync(path.join(out,"browser.json"),JSON.stringify({passed:true,results,errors,outside},null,2));console.log("NPC labels passed: actual population, three crowded Core maps, two-solo map, active/defeated, desktop and two landscape viewports, zoom, attached collision-free labels; isolated sample data only.");
 }catch(e){if(page)console.error(await page.evaluate(()=>({objects:nativeContinuousWorld.root.querySelectorAll('.object').length,npcs:[...nativeContinuousWorld.root.querySelectorAll('.native-npc-label')].map(n=>n.parentElement.parentElement.outerHTML.slice(0,700))})).catch(()=>({})));await page?.screenshot({path:path.join(out,"failure.png")}).catch(()=>{});throw e;}
 finally{await browser?.close();await harness?.close();await world?.close();await p.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
