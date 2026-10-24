"use strict";
const assert=require("node:assert/strict"),path=require("node:path");
const frames=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
module.exports=async function checkAtmosphere(page,output,width){
  const snapshot=()=>page.evaluate(()=>{
    const v=CrownlandsContinuousWorld.view,root=CrownlandsContinuousWorld.root;
    return {stats:v.snapshot().atmosphere,nodes:[...root.querySelectorAll(".map-clouds>i,.map-cloud-shadows>i")].map(n=>{
      const css=getComputedStyle(n),r=n.getBoundingClientRect();return{transform:n.style.transform,opacity:Number(css.opacity),pointer:css.pointerEvents,filter:css.filter,width:r.width,height:r.height};
    })};
  });
  const resetPreference=()=>page.evaluate(()=>{volatileAnimationModePreference="";localStorage.removeItem(ANIMATION_MODE_STORAGE_KEY);localStorage.removeItem(LEGACY_ANIMATION_MODE_STORAGE_KEY);renderAnimationModeSetting();});
  const reveal=async()=>{await page.evaluate(()=>{if(modal.open)modal.close();});await page.waitForFunction(()=>isMapPresentationVisible());await frames(page);};
  const original=await page.evaluate(()=>CrownlandsContinuousWorld.view.snapshot().camera);
  try{
    await page.emulateMedia({reducedMotion:"no-preference"});await page.evaluate(()=>setAnimationModePreference("full"));await reveal();
    const first=await snapshot();assert.equal(first.nodes.length,6);
    assert(first.nodes.every(n=>n.pointer==="none"&&n.filter==="none"&&n.width<398&&n.height<271));
    assert(first.nodes.some(n=>n.opacity>0));
    await page.screenshot({path:path.join(output,`clouds-${width}.png`)});
    // Login may asynchronously open its one-shot reward window. Dismiss it
    // before measuring visible drift; obscured presentation is tested below.
    await reveal();
    await page.waitForFunction(seconds=>CrownlandsContinuousWorld.view.snapshot().atmosphere.seconds>seconds,first.stats.seconds);
    const moving=await snapshot();
    assert(moving.nodes.some((n,i)=>n.transform!==first.nodes[i].transform),"Clouds must drift with matching shadows");
    await resetPreference();await page.emulateMedia({reducedMotion:"reduce"});await reveal();
    await page.waitForFunction(()=>CrownlandsContinuousWorld.view.snapshot().atmosphere.mode==="reduced");
    const frozen=await snapshot();await page.waitForTimeout(160);
    assert.deepEqual((await snapshot()).nodes,frozen.nodes,"Reduced motion still animates clouds");
    assert.equal((await snapshot()).stats.writes,frozen.stats.writes,"CSSOM normalization must not cause repeated idle style writes");
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.evaluate(()=>setAnimationModePreference("off"));await reveal();
    await page.waitForFunction(()=>CrownlandsContinuousWorld.view.snapshot().atmosphere.mode==="off");
    assert((await snapshot()).nodes.every(n=>n.width===0&&n.height===0),"Off setting leaves cloud effects visible");
    await page.evaluate(()=>setAnimationModePreference("full"));await frames(page);
    await page.evaluate(()=>modal.showModal());await frames(page);const obscured=await snapshot();
    await page.waitForTimeout(160);assert.equal((await snapshot()).stats.writes,obscured.stats.writes,"Clouds repaint behind opaque UI");
    await page.evaluate(()=>modal.close());await frames(page);
    await page.evaluate(()=>{const v=CrownlandsContinuousWorld.view,s=v.snapshot();v.view(s.camera.x,s.camera.y,SeamlessModel.forWorld(v.scene).limits(s.size).max);});await frames(page);
    assert((await snapshot()).nodes.every(n=>n.width===0&&n.height===0),"Clouds obscure close-up controls");
    await page.evaluate(c=>CrownlandsContinuousWorld.view.view(c.x,c.y,c.zoom),original);await frames(page);
    assert(await page.evaluate(()=>{
      const r=CrownlandsContinuousWorld.root,n=r.querySelector(".map-clouds>i"),b=n.getBoundingClientRect(),hit=r.elementFromPoint(Math.max(1,Math.min(innerWidth-1,b.x+b.width/2)),Math.max(1,Math.min(innerHeight-1,b.y+b.height/2)));
      return !hit?.closest(".map-clouds,.map-cloud-shadows");
    }),"Cloud artwork intercepts map taps");
    await page.screenshot({path:path.join(output,`clouds-${width}.png`)});
  }finally{await resetPreference();await page.emulateMedia({reducedMotion:"no-preference"});}
};
