"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const sizes = [[1440,900],[844,390],[568,320]];
const frames = page => page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
async function tap(page, locator, touch) {
  const box=await locator.boundingBox(); assert(box);
  if (!touch) return page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]}); await cdp.detach();
}
exports.march = async (page, march, output) => {
  const key="march:"+march.id, results=[];
  for(const [width,height] of sizes){
    await page.setViewportSize({width,height});
    for(const fraction of [1,.5,.2]){
      await page.evaluate(({key,fraction})=>{
        const v=nativeContinuousWorld.view,m=v.getObject(key),p=m.position;
        v.view(p.x,p.y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).max*fraction);
      },{key,fraction});
      await frames(page);
      const marker=page.locator(`#continuous-game-surface .troop[data-key="${key}"]`);
      await marker.waitFor();
      const sample=await marker.evaluate((node,key)=>{
        const root=nativeContinuousWorld.root,v=nativeContinuousWorld.view,m=v.getObject(key),box=node.getBoundingClientRect();
        const lines=[...root.querySelector(`[data-march-key="${key}"]`).children];
        return {width:box.width,height:box.height,following:v.snapshot().following,inspector:!root.querySelector("#inspector"),
          path:lines.every(l=>l.getAttribute("points")===m.points.map(p=>`${p.x},${p.y}`).join(" ")&&getComputedStyle(l).stroke!=="none"&&getComputedStyle(l).display!=="none"),
          sections:m.sections.length,count:node.querySelector(".army-token-count").textContent,timer:node.querySelector(".army-token-time").textContent};
      },key);
      assert(Math.abs(sample.height-30*fraction)<.1,"March grows beyond its original 30px close-up height");
      assert(sample.path&&sample.sections>1,"Accepted cross-section path must be drawn exactly");
      assert(sample.count&&sample.timer); assert(sample.inspector);assert.equal(sample.following,null);
      results.push({viewport:{width,height},fraction,...sample});
      if(fraction!==1)continue;
      await tap(page,marker,width<1000);
      await page.waitForFunction(key=>nativeContinuousWorld.view.selectedKey===key,key);
      assert(await page.locator("#continuous-game-surface #inspector").isHidden());
      await marker.locator(".army-token-nav").waitFor({state:"visible",timeout:3000});
      await page.screenshot({path:path.join(output,`march-restored-${width}.png`)});
      for(const endpoint of ["from","to"]){
        if(endpoint==="to"){
          await page.evaluate(key=>{const v=nativeContinuousWorld.view,m=v.getObject(key);v.focus(m.position);v.select(key);},key);
          await frames(page);
        }
        const expected=await page.evaluate(({key,endpoint})=>{
          const v=nativeContinuousWorld.view,m=v.getObject(key),s=v.snapshot();
          return SeamlessModel.forWorld(v.scene).clamp({...s.camera,...(endpoint==="from"?m.points[0]:m.points.at(-1))},s.size);
        },{key,endpoint});
        await tap(page,marker.locator(`[data-army-endpoint="${endpoint}"]`),width<1000); await frames(page);
        const actual=await page.evaluate(()=>nativeContinuousWorld.view.snapshot());
        assert(Math.hypot(actual.camera.x-expected.x,actual.camera.y-expected.y)<.1,"From/To did not navigate the recorded endpoint");
        assert.equal(actual.selected,null);assert.equal(actual.following,null);
      }
    }
  }
  // Navigation remains available with keyboard, and drag must not select.
  await page.evaluate(key=>{const v=nativeContinuousWorld.view,m=v.getObject(key);v.focus(m.position);},key);await frames(page);
  const marker=page.locator(`#continuous-game-surface .troop[data-key="${key}"]`);
  await marker.focus();await page.keyboard.press("Enter");await frames(page);
  assert(await marker.locator(".army-token-nav").isVisible());
  await page.keyboard.press("Escape");await frames(page);assert(await marker.locator(".army-token-nav").isHidden());
  const box=await marker.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+80,box.y+25,{steps:6});await page.mouse.up();
  assert.equal(await page.evaluate(()=>nativeContinuousWorld.view.selectedKey),null);
  fs.writeFileSync(path.join(output,"march-presentation-checks.json"),JSON.stringify(results,null,2));
  await page.setViewportSize({width:1440,height:900});
};
exports.pickup = async (page,bonus,output) => {
  const results=[],button=page.locator(`#continuous-world-pickups [data-harvest-bonus-id="${bonus.id}"]`);
  for(const [width,height] of sizes){
    await page.setViewportSize({width,height});
    await frames(page);
    await page.evaluate(()=>updateServerHarvestBonuses());
    await page.waitForFunction(id=>{const b=getAllActiveHarvestBonuses().find(b=>b.id===id);return b&&isHarvestBonusPlacementSafe(b)&&!harvestSpawnRequestInFlight;},bonus.id);
    await button.waitFor({state:"attached"});
    for(const fraction of [1,.5,.2]){
      await button.evaluate((node,fraction)=>{const v=nativeContinuousWorld.view;v.view(node.worldPoint.x,node.worldPoint.y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).max*fraction);},fraction);
      await frames(page);
      const sample=await button.evaluate(node=>{
        const b=node.getBoundingClientRect(),i=node.querySelector("img").getBoundingClientRect();
        const overlaps=[...nativeContinuousWorld.root.querySelectorAll(".object>img,.object .city-label")].filter(n=>{
          const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none"&&r.left<i.right&&r.right>i.left&&r.top<i.bottom&&r.bottom>i.top;
        }).length;
        return {width:b.width,height:b.height,art:i.width,ring:getComputedStyle(node,"::before").width,safe:isHarvestBonusPlacementSafe(node.bonus),overlaps};
      });
      assert(sample.safe,"Pickup overlaps current map artwork");
      assert.equal(sample.overlaps,0,"Pickup overlaps a rendered image or label");
      assert(Math.abs(sample.width-44*.8*fraction)<.1,"Pickup hit area/glow ignores its smaller camera scale");
      assert(Math.abs(sample.art-62*.8*fraction)<.1,"Pickup artwork ignores its smaller camera scale");
      results.push({viewport:{width,height},fraction,...sample});
      if(width===844&&fraction!==.5)await page.screenshot({path:path.join(output,`pickup-${bonus.type}-${fraction===1?"close":"overview"}.png`)});
    }
  }
  fs.writeFileSync(path.join(output,`pickup-${bonus.type}-scale-checks.json`),JSON.stringify(results,null,2));
  await page.setViewportSize({width:1440,height:900});
  await button.evaluate(node=>{const v=nativeContinuousWorld.view;v.view(node.worldPoint.x,node.worldPoint.y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).max);});await frames(page);
};
