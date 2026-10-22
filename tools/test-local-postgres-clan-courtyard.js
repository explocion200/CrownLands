"use strict";
// Actual production renderer and scoped Tower subscriptions, fictional accounts only.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {chromium}=require("playwright");
const {createGameplayPilot}=require("./map-benchmark/seamless/gameplay-pilot");
const {createAuthenticatedNativeHarness}=require("./map-benchmark/seamless/native-auth-harness");
const Buildings=require("../clan-tower-buildings"),Towers=require("../functions/holding-towers");
const {fixture,imageToGame}=require("../local-backend/world/catalog");
const overlap=(a,b)=>a.left<b.left+b.width-.01&&a.left+a.width>b.left+.01&&a.top<b.top+b.height-.01&&a.top+a.height>b.top+.01;
const output=path.resolve("release-artifacts/clan-courtyard");fs.mkdirSync(output,{recursive:true});
const levels=n=>Object.fromEntries(Buildings.DEFINITIONS.map(b=>[b.id,n]));
const context={window:{CrownlandsClanTowerBuildings:Buildings},document:{}};
vm.createContext(context);vm.runInContext(fs.readFileSync("world/appearance.js","utf8"),context);
const {geometry,courtyard}=context.window.SeamlessAppearance;
for(const raw of fixture.objects.filter(o=>o.kind==="tower")){
  const tower=geometry({...raw,ownerClanId:"sample"});
  assert.equal(tower.width,raw.width*.5);assert.equal(tower.x,raw.x);assert.equal(tower.y,raw.y);
  const children=courtyard(tower,{ownerKind:"clan",clanId:"sample",buildings:levels(10)}),parts=[tower,...children.filter(o=>o.kind!=="courtyard")];
  assert.equal(parts.length,7);
  for(const part of children){assert(part.left>=raw.left&&part.top>=raw.top&&part.left+part.width<=raw.left+raw.width&&part.top+part.height<=raw.top+raw.height,"Compound exceeds old Tower clearance");}
  for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++)assert(!overlap(parts[i],parts[j]),"Tower/building hit areas overlap");
  for(const p of parts)for(const o of fixture.objects.filter(o=>o.sectionId===raw.sectionId&&o.kind!=="scenery"&&o.key!==raw.key))assert(!overlap(p,o),"Compound collides with catalog structure");
  assert.equal(courtyard(tower,{ownerKind:"neutral",buildings:levels(10)}).length,0);
  assert.equal(courtyard(tower,{ownerKind:"clan",clanId:"stale-owner",buildings:levels(10)}).length,0);
  assert.equal(courtyard(tower,{ownerKind:"clan",clanId:"sample",buildings:{}}).length,0);
  const building=courtyard(tower,{ownerKind:"clan",clanId:"sample",buildingProject:{buildingId:"stables"}}).find(o=>o.kind==="tower-building");
  assert(building.constructing&&building.level===0&&building.asset.endsWith("stables-1.webp"));
}
(async()=>{
 const pilot=await createGameplayPilot({productionRouting:true});let world,harness,browser,page;
 const errors=[],external=[],results=[];
 try{
  const refs=[];
  for(const [i,t]of Towers.TOWERS.entries()){
   const section=pilot.reader.sections.get(t.regionId),ref=pilot.store.doc("holdingTowers/"+t.id),clanId=i?"courtyard-clan-"+i:"pilot-clan";
   if(i)await pilot.store.doc("clans/"+clanId).set({...pilot.identity,status:"active",name:"Sample Clan "+i,tag:"TEST"});
   await ref.set({...Towers.createNeutralTowerState(t.id,pilot.identity),...pilot.identity,...imageToGame(section,{x:t.reservedX,y:t.reservedY}),ownerKind:"clan",clanId,clanName:"Sample Clan",ownershipRevision:1,buildings:levels(10)});refs.push(ref);
  }
  const deployment=require("./map-benchmark/seamless/production-test-policy").productionTestPolicy(pilot.store);
  world=require("../local-backend/world/service").createWorldService({store:pilot.store,readPool:pilot.reader.pool,deployment,directory:path.join(output,"terrain"),enabled:true});
  await world.prepare(pilot.players[0].uid);
  harness=await createAuthenticatedNativeHarness(pilot,{productionWorld:world});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
  const ctx=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true,serviceWorkers:"block"});
  await ctx.addCookies(harness.cookies(0));
  await ctx.route("**/*",async route=>{
   const r=route.request();if(!r.url().startsWith("https://playcrownlands.com/"))external.push(r.url());
   try{await route.fulfill(await harness.request(r.url(),r.method(),await r.allHeaders(),r.postDataBuffer()));}catch(e){errors.push(e.message);await route.abort();}
  });
  page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.stack||e.message));
  await page.goto(harness.url);await page.getByRole("button",{name:"Keep analytics off"}).click();
  await page.waitForFunction(()=>!document.getElementById("enterKingdomBtn")?.disabled);await page.locator("#enterKingdomBtn").click();
  await page.waitForFunction(()=>!!window.CrownlandsContinuousWorld&&!isMapInteractionBlocked(),null,{timeout:90000});
  const frame=async(t,edge="max")=>{
   const s=pilot.reader.sections.get(t.regionId);
   await page.evaluate(({s,edge})=>{modal.close();clearSelection(false);const v=CrownlandsContinuousWorld.view;v.clear();const z=SeamlessModel.forWorld(v.scene).limits(v.snapshot().size)[edge];v.view(s.x+724,s.y+470,z);},{s,edge});
   await page.waitForFunction(id=>CrownlandsContinuousWorld.view.scene.objects.some(o=>o.id===id),t.id);
   await page.evaluate(id=>{const v=CrownlandsContinuousWorld.view,o=v.scene.objects.find(o=>o.id===id);const c=v.snapshot();v.view(o.x,o.y+10,c.camera.zoom);},t.id);
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   await page.waitForFunction(id=>{const root=CrownlandsContinuousWorld.root,n=[...root.querySelectorAll('.object.tower-building')].filter(n=>CrownlandsContinuousWorld.view.getObject(n.dataset.key)?.towerId===id);return n.length===6&&n.every(n=>n.firstChild.naturalWidth>0&&!n.firstChild.hidden);},t.id,{timeout:30000});
  };
  for(const [width,height]of [[1440,900],[844,390],[568,320]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(100);
   for(const t of Towers.TOWERS){
    await frame(t);
    const check=await page.evaluate(id=>{
     const v=CrownlandsContinuousWorld.view,root=CrownlandsContinuousWorld.root,t=v.scene.objects.find(o=>o.id===id);
     const parts=v.scene.objects.filter(o=>o.key===t.key||o.towerId===id);
     const boxes=parts.map(o=>{const r=root.querySelector(`[data-key='${o.key}']`).getBoundingClientRect();return {id:o.id,left:r.left,top:r.top,width:r.width,height:r.height};});
     const collisions=[];for(const a of parts)for(const b of v.scene.objects.filter(o=>o.kind!=="scenery"&&o.kind!=="courtyard"&&!parts.includes(o)))if(a.left<b.left+b.width&&a.left+a.width>b.left&&a.top<b.top+b.height&&a.top+a.height>b.top)collisions.push([a.id,b.id]);
     const banner=root.querySelector(`[data-key='${t.key}'] .city-label`).getBoundingClientRect();
     return {boxes,collisions,banner:{left:banner.left,top:banner.top,width:banner.width,height:banner.height},hidden:getComputedStyle(root.querySelector(`[data-key='${t.key}'] .map-banner`)).visibility==="hidden"};
    },t.id);
    assert.equal(check.boxes.length,7);assert.deepEqual(check.collisions,[]);assert(!check.hidden);
    for(const box of check.boxes)assert(!overlap(box,check.banner),"Tower label overlaps courtyard");
    results.push({width,height,tower:t.id,...check});
   }
   const t=Towers.TOWERS[0];await frame(t);
   // Test every visible sprite stage through the actual Tower subscription.
   for(const level of [1,4,7,10]){
    await refs[0].update({buildings:levels(level)});
    await page.waitForFunction(({id,level})=>{const v=CrownlandsContinuousWorld.view,items=v.scene.objects.filter(o=>o.towerId===id);return items.length===6&&items.every(o=>o.level===level);},{id:t.id,level},{timeout:30000});
    await page.waitForFunction(()=>[...CrownlandsContinuousWorld.root.querySelectorAll('.tower-building>img')].every(n=>n.naturalWidth>0&&!n.hidden));
   }
   // Actual mouse / touch selects a building and opens its original building UI.
   for(const building of Buildings.DEFINITIONS){
    await frame(t);
    const point=await page.evaluate(({id,building})=>{
     const v=CrownlandsContinuousWorld.view,o=v.scene.objects.find(o=>o.towerId===id&&o.buildingId===building),c=v.snapshot();
     // Pan the tapped building clear of the unchanged HUD on small landscapes.
     v.view(o.x-(c.size.width*.65-c.size.width/2)/c.camera.zoom,o.y-(c.size.height*.47-c.size.height/2)/c.camera.zoom,c.camera.zoom);
     return o.key;
    },{id:t.id,building:building.id});
    await page.waitForTimeout(100);
    const node=page.locator(`[data-key='${point}']`);
    if(width<1000)await node.tap();else await node.click();
    await page.waitForFunction(id=>modal.open&&holdingTowerDetailsTab==="buildings"&&holdingTowerBuildingSelection===id,building.id);
    await page.evaluate(()=>modal.close());
   }
   await frame(t);await page.screenshot({path:path.join(output,`courtyard-${width}.png`)});
   await page.evaluate(id=>CrownlandsContinuousWorld.view.select(CrownlandsContinuousWorld.view.scene.objects.find(o=>o.id===id).key),t.id);
   await page.waitForFunction(()=>!CrownlandsContinuousWorld.bridge.running);
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   const controls=await page.locator('#continuous-game-actions button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};}));
   assert(controls.length>0);
   await page.screenshot({path:path.join(output,`actions-${width}.png`)});
   const labels=await page.locator('#continuous-game-surface .city-label').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).visibility!=="hidden").map(n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};}));
   for(const c of controls)for(const label of labels)assert(!overlap(c,label),"Tower actions overlap a map label: "+width+JSON.stringify({c,label}));
   const art=await page.locator('#continuous-game-surface .tower-building').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};}));
   for(const c of controls)for(const b of art)assert(!overlap(c,b),"Tower actions obscure a building");
   const large=await page.locator('#continuous-game-surface .object.tower').first().boundingBox();
   await frame(t,"min");
   const little=await page.locator('#continuous-game-surface .object.tower').first().boundingBox();
   assert(little.width<large.width*.3,"Courtyard grows when zooming out: "+JSON.stringify({large,little}));
   const small=await page.evaluate(id=>CrownlandsContinuousWorld.view.scene.objects.find(o=>o.id===id).width,t.id);
   assert(Math.abs(small-fixture.objects.find(o=>o.id===t.id).width*.5)<.01,"Zoom or subscription progressively changes size");
  }
  const t=Towers.TOWERS[0];await page.setViewportSize({width:1440,height:900});await frame(t);
  const dragNode=page.locator('#continuous-game-surface .object.tower-building').first(),drag=await dragNode.boundingBox();
  await page.mouse.move(drag.x+drag.width/2,drag.y+drag.height/2);await page.mouse.down();
  await page.mouse.move(drag.x+drag.width/2+50,drag.y+drag.height/2+15,{steps:5});await page.mouse.up();
  assert(!await page.evaluate(()=>modal.open),"Dragging from a building opened its panel");
  await refs[0].update({clanId:"courtyard-clan-1",clanName:"New Sample Owner",ownershipRevision:2,buildings:levels(9)});
  await page.waitForFunction(()=>{const v=CrownlandsContinuousWorld.view,t=v.scene.objects.find(o=>o.id==="core-v2-holding-tower-1"),a=v.scene.objects.filter(o=>o.towerId===t.id);return t.ownerClanId==="courtyard-clan-1"&&a.length===6&&a.every(o=>o.level===9);});
  await refs[0].update({clanId:"pilot-clan",ownershipRevision:3,buildings:levels(0),buildingProject:{id:"sample-project",buildingId:"stables",targetLevel:1,remainingMs:1800000,progressStartedAtMs:Date.now()}});
  await page.waitForFunction(()=>{const a=CrownlandsContinuousWorld.view.scene.objects.filter(o=>o.towerId==="core-v2-holding-tower-1");return a.length===1&&a[0].constructing&&a[0].level===0;});
  await refs[0].update({ownerKind:"neutral",clanId:"",ownershipRevision:4,buildingProject:null,buildings:levels(0)});
  await page.waitForFunction(()=>!CrownlandsContinuousWorld.view.scene.objects.some(o=>o.towerId==="core-v2-holding-tower-1"));
  const stable=await page.evaluate(async()=>{const v=CrownlandsContinuousWorld.view,a=v.scene.objects;for(let i=0;i<3;i++){renderCities();await new Promise(requestAnimationFrame);}return a===v.scene.objects;});
  assert(stable,"Unchanged game renders rebuild the scene");
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  const stats=await page.evaluate(()=>CrownlandsContinuousWorld.view.snapshot());assert(stats.assets.peakRequests<=2&&stats.assets.full<=4);
  fs.writeFileSync(path.join(output,"report.json"),JSON.stringify({results,errors,external,assets:stats.assets},null,2));
  console.log("Clan courtyard passed: four Towers, six buildings, four stages, three viewports, mouse/touch, live completion/neutralization, existing subscriptions and bounded assets.");
 }catch(e){if(page){await page.screenshot({path:path.join(output,"failure.png")}).catch(()=>{});console.error(await page.evaluate(()=>({text:document.body.innerText.slice(-1000),towers:[...holdingTowerSnapshots.values()].map(t=>({id:t.id,ownerKind:t.ownerKind,clanId:t.clanId,buildings:t.buildings})),scene:window.CrownlandsContinuousWorld?.view.scene.objects.filter(o=>o.kind==="tower"||o.kind==="tower-building").map(o=>({id:o.id,ownerClanId:o.ownerClanId,kind:o.kind}))})).catch(()=>null));}console.error(errors,harness?.errors.slice(-4));throw e;
 }finally{await browser?.close();await harness?.close();await world?.close();await pilot.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
