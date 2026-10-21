"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const model = require("../world/model");
const sizes = [[1440,900],[844,390],[568,320]];
const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
module.exports = async function checkZoomLimit(page, source, select, output) {
  // Anchoring and the floor must remain independent of catalog growth.
  for (const sections of [3,12,30]) for (const [width,height] of sizes) {
    const size={width,height}, world={width:sections*1448,height:sections*1086}, M=model.forWorld(world), range=M.limits(size);
    assert(range.min>range.detail && range.min<range.home);
    const camera={x:world.width/2,y:world.height/2,zoom:range.home}, anchor={x:width*.6,y:height*.4};
    const before=M.unproject(camera,anchor,size), after=M.zoomAt(camera,size,anchor,range.min/100);
    assert.equal(after.zoom,range.min);
    const projected=M.project(after,before,size);
    assert(Math.hypot(projected.x-anchor.x,projected.y-anchor.y)<1e-8,"Zoom at the floor loses its anchor");
    assert.equal(M.clamp({...camera,zoom:0},size).zoom,range.min);
    assert.equal(M.clamp({...camera,zoom:range.max*100},size).zoom,range.max);
  }
  const results=[];
  async function check(input) {
    await frames(page);
    await page.waitForFunction(() => {
      const f=nativeContinuousWorld.view.snapshot().feed;
      return f.ids.length && !f.pending && !f.failed;
    });
    const sample=await page.evaluate(() => {
      const v=nativeContinuousWorld.view, s=v.snapshot(), root=nativeContinuousWorld.root;
      const cities=[...root.querySelectorAll(".object.castle")].filter(n=>{
        const r=n.getBoundingClientRect();
        return r.width>0 && r.height>0 && r.right>0 && r.bottom>0 && r.left<s.size.width && r.top<s.size.height && getComputedStyle(n).display!=="none";
      }).length;
      return {zoom:s.camera.zoom,range:SeamlessModel.forWorld(v.scene).limits(s.size),size:s.size,cities,areas:s.feed.ids.length,overview:root.querySelector("#world").classList.contains("overview"),assets:s.assets};
    });
    assert(Math.abs(sample.zoom-sample.range.min)<1e-8,`Zoom input bypassed the floor: ${input}; actual ${sample.zoom}, expected ${sample.range.min}`);
    assert(sample.zoom>sample.range.detail && !sample.overview && sample.cities>0 && sample.areas>0,"Zoom hides cities or stops their feed: "+input);
    assert(sample.assets.full<=4 && sample.assets.peakRequests<=2);
    results.push({input,...sample});
  }
  try {
    // The harness owns two separate player tabs. Deliver native input to the
    // tab under test, including on the stable Chrome used by GitHub runners.
    console.log("Zoom input tab",await page.evaluate(()=>({focused:document.hasFocus(),visibility:document.visibilityState})));
    await page.bringToFront();
    await page.evaluate(()=>{modal.close();clearSelection(false);nativeContinuousWorld.view.clear();});
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height}); await frames(page);
      await select(page,source);
      await page.evaluate(()=>{const v=nativeContinuousWorld.view,o=v.getObject(v.selectedKey);clearSelection(false);v.clear();v.view(o.x,o.y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).home);});
      await frames(page);
      const viewport=page.locator("#continuous-game-surface #viewport"), box=await viewport.boundingBox();
      const center={x:box.x+box.width/2,y:box.y+box.height/2};
      await page.mouse.move(center.x,center.y);
      const hit=await page.evaluate(p=>{const host=document.elementFromPoint(p.x,p.y),n=host?.shadowRoot?.elementFromPoint(p.x,p.y)||host;return {inViewport:n?.getRootNode()===nativeContinuousWorld.root&&!!n?.closest('#viewport'),tag:n?.tagName,id:n?.id,classes:n?.className,focused:document.hasFocus(),visibility:document.visibilityState};},center);
      assert(hit.inViewport,`Wheel target intercepted at ${width}x${height}: ${JSON.stringify(hit)}`);
      for(let i=0;i<8;i++){
        const previous=await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera.zoom);
        await page.mouse.wheel(0,600);
        // Playwright dispatch completes before Chrome consumes wheel input.
        // Observe the camera instead of assuming two frames drain the queue.
        try{await page.waitForFunction(previous=>{const v=nativeContinuousWorld.view,s=v.snapshot();return s.camera.zoom<previous||Math.abs(s.camera.zoom-SeamlessModel.forWorld(v.scene).limits(s.size).min)<1e-8;},previous);}
        catch(error){console.error("Wheel delivery",{width,height,center,previous,hit,current:await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera)});throw error;}
        await frames(page);
      }
      await check("wheel");
      await page.screenshot({path:path.join(output,`zoom-limit-${width}.png`)});
      // Native controls use the same floor even though their prototype toolbar
      // is hidden in the restored game HUD.
      await page.evaluate(()=>{for(let i=0;i<20;i++)nativeContinuousWorld.root.querySelector("#minus").click();});
      await check("minus control");
      await page.evaluate(()=>nativeContinuousWorld.root.querySelector("#plus").click());await frames(page);
      assert(await page.evaluate(()=>{const v=nativeContinuousWorld.view,s=v.snapshot();return s.camera.zoom>SeamlessModel.forWorld(v.scene).limits(s.size).min;}),"Zoom-in stuck at floor");
      const cdp=await page.context().newCDPSession(page);
      try {
        for(let i=0;i<3;i++){
          const points=distance=>[{x:center.x-distance,y:center.y,id:1},{x:center.x+distance,y:center.y,id:2}];
          await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:points(90)});
          for(const distance of [65,40,15,5]){await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:points(distance)});await frames(page);}
          await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
        }
      } finally { await cdp.detach(); }
      await check("pinch");
      // Panning and Home remain usable after repeated clamped gestures.
      const before=await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera);
      await page.mouse.move(center.x,center.y);await page.mouse.down();await page.mouse.move(center.x+65,center.y+15,{steps:8});await page.mouse.up();
      const after=await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera);
      assert(Math.hypot(after.x-before.x,after.y-before.y)>1,"Panning stuck at minimum zoom");
      await check("drag at floor");
      await page.evaluate(()=>{const v=nativeContinuousWorld.view,c=v.snapshot().camera;v.view(c.x,c.y,0.000001);});
      await check("navigation clamp");
      await page.setViewportSize({width:width+20,height:height+10});await check("resize");
      await page.setViewportSize({width,height});await check("resize back");
      await page.evaluate(()=>nativeContinuousWorld.view.home());await frames(page);
      assert(await page.evaluate(()=>{const v=nativeContinuousWorld.view,s=v.snapshot();return Math.abs(s.camera.zoom-SeamlessModel.forWorld(v.scene).limits(s.size).home)<1e-8;}),"Home no longer restores the fitted view");
    }
    fs.writeFileSync(path.join(output,"zoom-limit-checks.json"),JSON.stringify(results,null,2));
  } finally {
    await page.setViewportSize({width:1440,height:900});await frames(page);
    await page.evaluate(()=>nativeContinuousWorld.view.home());await select(page,source);
  }
};
