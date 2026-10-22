"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const {createGameplayPilot}=require("./map-benchmark/seamless/gameplay-pilot");
const {createAuthenticatedNativeHarness}=require("./map-benchmark/seamless/native-auth-harness");
(async()=>{
 const pilot=await createGameplayPilot({productionRouting:true}),output=path.resolve("release-artifacts/castle-selection");fs.mkdirSync(output,{recursive:true});
 let world,harness,browser;const pages=[],errors=[],outside=[],results=[];
 const frames=p=>p.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 try{
  const deployment=require("./map-benchmark/seamless/production-test-policy").productionTestPolicy(pilot.store);
  world=require("../local-backend/world/service").createWorldService({store:pilot.store,readPool:pilot.reader.pool,deployment,directory:path.join(output,"terrain"),enabled:true});
  await world.prepare(pilot.players[0].uid);harness=await createAuthenticatedNativeHarness(pilot,{productionWorld:world});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block"});
   await context.addInitScript(()=>Object.defineProperty(window,"nativeContinuousWorld",{get:()=>window.CrownlandsContinuousWorld}));
   await context.addCookies(harness.cookies(i));
   await context.route("**/*",async route=>{const r=route.request();if(!r.url().startsWith("https://playcrownlands.com/"))outside.push(r.url());
    try{await route.fulfill(await harness.request(r.url(),r.method(),await r.allHeaders(),r.postDataBuffer()));}catch(error){errors.push(error.message);await route.abort();}});
   const page=await context.newPage();pages.push(page);page.on("pageerror",e=>errors.push(e.message));await page.goto(harness.url);
   await page.getByRole("button",{name:"Keep analytics off"}).click();await page.waitForFunction(()=>!document.getElementById("enterKingdomBtn")?.disabled);
   await page.locator("#enterKingdomBtn").click();await page.waitForFunction(()=>!!window.nativeContinuousWorld&&!isMapInteractionBlocked(),null,{timeout:90000});
   await page.evaluate(()=>{modal.close();clearSelection(false);nativeContinuousWorld.view.clear();
    window.selectionQa={attachments:[]};selectionQa.observer=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes){if(!n.matches?.('.continuous-castle-wheel'))continue;
     const v=nativeContinuousWorld.view,s=v.snapshot(),rendered=new DOMMatrixReadOnly(getComputedStyle(nativeContinuousWorld.root.querySelector('#world')).transform).a;
     selectionQa.attachments.push({zoom:s.camera.zoom,rendered,max:SeamlessModel.forWorld(v.scene).limits(s.size).max});}});
    selectionQa.observer.observe(document.getElementById('continuous-game-actions'),{childList:true});
   });
  }
  const source=pilot.pair[0],other=pilot.assignments[2][0],key=c=>c.regionId+":"+c.id;
  const at=async(p,c,fraction=.2)=>{
   await p.evaluate(()=>{modal.close();clearSelection(false);nativeContinuousWorld.view.clear();});
   const section=pilot.reader.sections.get(c.regionId);
   await p.evaluate(({x,y})=>{const v=nativeContinuousWorld.view;v.view(x,y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).home);},{x:section.x+724,y:section.y+543});await frames(p);
   await p.waitForFunction(key=>{const v=nativeContinuousWorld.view,s=v.snapshot();return !s.feed.pending&&!s.feed.failed&&!!v.getObject(key);},key(c));
   await p.evaluate(({key,fraction})=>{const v=nativeContinuousWorld.view,o=v.getObject(key);v.view(o.x,o.y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).max*fraction);},{key:key(c),fraction});await frames(p);
   await p.waitForFunction(()=>!nativeContinuousWorld.view.snapshot().feed.pending);
   return p.locator(`#continuous-game-surface .castle[data-key="${key(c)}"]`);
  };
  const tapped=async(p,node,touch)=>{
   const r=await node.boundingBox();assert(r);const x=r.x+r.width/2,y=r.y+r.height/2;
   if(touch){const cdp=await p.context().newCDPSession(p);try{await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:1}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});}finally{await cdp.detach();}}
   else await p.mouse.click(x,y);
  };
  const selected=async(p,c)=>{
   await p.waitForFunction(key=>{const v=nativeContinuousWorld.view;return v.selectedKey===key&&!nativeContinuousWorld.bridge.running&&document.querySelector('#continuous-game-actions .continuous-castle-wheel');},key(c));await frames(p);
   return p.evaluate(key=>{const v=nativeContinuousWorld.view,s=v.snapshot(),o=v.getObject(key),max=SeamlessModel.forWorld(v.scene).limits(s.size).max,expected=SeamlessModel.forWorld(v.scene).clamp({x:o.x,y:o.y,zoom:max},s.size);
    const buttons=[...document.querySelectorAll('#continuous-game-actions .continuous-castle-wheel button')].map(n=>n.getBoundingClientRect().width);
    return {camera:s.camera,max,expected,buttons};},key(c));
  };
  const close=sample=>{assert(Math.abs(sample.camera.zoom-sample.max)<1e-6);assert(Math.hypot(sample.camera.x-sample.expected.x,sample.camera.y-sample.expected.y)<1);};
  const page=pages[0];await page.bringToFront();
  for(const [width,height]of [[1440,900],[844,390],[568,320]]){
   await page.setViewportSize({width,height});
   for(const city of [source,other]){
    const node=await at(page,city);await tapped(page,node,width<1000);const sample=await selected(page,city);close(sample);
    assert(sample.buttons.every(w=>Math.abs(w-(height<=500?44:56))<.1));results.push({width,height,key:key(city),...sample});
    await page.screenshot({path:path.join(output,`selected-${width}-${city===source?'own':'foreign'}.png`)});
    // A second close-up selection retains zoom and the exact same identity.
    await tapped(page,node,width<1000);close(await selected(page,city));
   }
   const node=await at(page,source),r=await node.boundingBox(),before=await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera);
   await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+50,r.y+r.height/2+20,{steps:8});await page.mouse.up();await frames(page);
   assert(await page.evaluate(zoom=>!nativeContinuousWorld.view.selectedKey&&Math.abs(nativeContinuousWorld.view.snapshot().camera.zoom-zoom)<1e-6,before.zoom),'Dragging must not select or zoom');
   // City List selection uses the same close-up before attaching the menu.
   await at(page,source);await page.evaluate(c=>focusCityListLocation(c.id,c.regionId),source);close(await selected(page,source));
   await page.evaluate(()=>nativeContinuousWorld.root.querySelector('#viewport').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await frames(page);
   assert(await page.evaluate(()=>!nativeContinuousWorld.view.selectedKey&&!document.getElementById('continuous-game-actions').childElementCount));
  }
  // All camera inputs retain the existing zoom floor; wheel/pinch also dismiss menus.
  await require("./check-continuous-zoom-limit")(page,source,async(p,c)=>{await at(p,c);await p.evaluate(key=>nativeContinuousWorld.view.select(key),key(c));await selected(p,c);},output);
  // Keyboard selection and a second authenticated viewer follow the same rule.
  const node=await at(pages[1],source);await node.focus();await node.press('Enter');close(await selected(pages[1],source));
  // Cancel a slow section resolution: it must not resurrect the chosen menu.
  await at(page,source);await page.evaluate(key=>{const b=nativeContinuousWorld.bridge,resolve=b.resolve;window.selectionResolve=resolve;b.resolve=async(...args)=>{await new Promise(r=>setTimeout(r,200));return resolve(...args);};nativeContinuousWorld.view.select(key);nativeContinuousWorld.root.querySelector('#viewport').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));},key(source));
  await page.waitForTimeout(300);assert(await page.evaluate(()=>!nativeContinuousWorld.view.selectedKey&&!document.getElementById('continuous-game-actions').childElementCount));
  await page.evaluate(()=>{nativeContinuousWorld.bridge.resolve=selectionResolve;delete window.selectionResolve;});
  // A destination click remains an order draft, without forcing close-up or sending troops.
  await page.setViewportSize({width:1440,height:900});const home=await at(page,source);await tapped(page,home,false);await selected(page,source);
  await page.locator('#continuous-game-actions .wheel-send').click();
  const destination=pilot.pair[1];
  await page.evaluate(key=>{const v=nativeContinuousWorld.view,o=v.getObject(key);if(!o)throw Error("Fixture destination missing");v.view(o.x,o.y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).min);},key(destination));await frames(page);
  const zoom=await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera.zoom);
  await tapped(page,page.locator(`#continuous-game-surface .castle[data-key="${key(destination)}"]`),false);
  await page.waitForFunction(()=>modal.open&&!!document.querySelector('#troopSliderConfirm'));
  assert.equal(await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera.zoom),zoom);assert.equal(await page.evaluate(()=>selectedTargetId),destination.id);
  // No close-up menu ever appears over an unzoomed map, even for async selection.
  for(const p of pages){const records=await p.evaluate(()=>selectionQa.attachments);assert(records.length>0);for(const r of records){assert(Math.abs(r.zoom-r.max)<1e-6);assert(Math.abs(r.rendered-r.max)<.00001,'Menu attached before camera paint');}}
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  await harness.auth.signOut(harness.sessions[0].token);await page.waitForFunction(()=>!window.nativeContinuousWorld||nativeContinuousWorld.view.snapshot().feed.authExpired);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,results,errors,outside},null,2));
  console.log('Castle selection passed: mouse/touch/keyboard, two viewers, three viewports, close-up before controls, native City List, drag/cancellation, and unchanged troop destination zoom.');
 }catch(error){for(const [i,p]of pages.entries())await p.screenshot({path:path.join(output,`failure-${i}.png`)}).catch(()=>{});throw error;}
 finally{await browser?.close();await harness?.close();await world?.close();await pilot.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
