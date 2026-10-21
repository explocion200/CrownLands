"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
// Uses only the caller's disposable fictional PostgreSQL realm.
module.exports=async(page,pilot,city,output)=>{
  const ref=pilot.cityRef(city),saved=(await ref.get()).data().level,key=city.regionId+":"+city.id,results=[];
  const camera=await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera);
  const marker=page.locator(`#continuous-game-surface .castle[data-key="${key}"]`);
  await marker.evaluate(n=>n.dataset.stageTestIdentity="same-node");
  try{
    for(const level of [1,24,25,49,50,74,75,99,100,125,1]){
      await ref.update({level});
      await page.waitForFunction(({key,level})=>nativeContinuousWorld.view.getObject(key)?.level===level,{key,level},{timeout:20000});
      await marker.locator("img").waitFor({state:"visible"});
      await marker.locator("img").evaluate(img=>img.decode());
      for(const [width,height]of [[1440,900],[844,390],[568,320]]){
        await page.setViewportSize({width,height});
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        for(const edge of ["max","min"]){
          await page.evaluate(({key,edge})=>{const v=nativeContinuousWorld.view,o=v.getObject(key);v.view(o.x,o.y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size)[edge]);},{key,edge});
          await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
          const sample=await marker.evaluate((node,key)=>{const v=nativeContinuousWorld.view,o=v.getObject(key),s=v.snapshot(),b=node.getBoundingClientRect(),img=node.firstChild;
            return {width:b.width,height:b.height,zoom:s.camera.zoom,stage:getCastleStage(o.level),asset:o.asset,imageLoaded:img.complete&&img.naturalWidth>0&&!img.hidden,center:[o.left+o.width/2,o.top+o.height/2],position:[o.x,o.y],identity:node.dataset.stageTestIdentity};},key);
          assert(Math.abs(sample.width-56*(.5+.1*sample.stage)*sample.zoom)<.1,"Mounted city did not resize for its stage");
          assert(Math.abs(sample.width-sample.height)<.01,"Square city dimensions differ beyond browser subpixel rounding");assert.deepEqual(sample.center,sample.position);
          assert.equal(sample.identity,"same-node","Stage changes must update the existing city node");
          assert(sample.asset.includes(require("../local-backend/world/catalog").catalog.mapPresentation.cityStageAssets[sample.stage]),"Stage artwork did not update");
          assert(sample.imageLoaded,"Stage artwork must finish loading");
          results.push({level,viewport:{width,height},edge,...sample});
          if(width===844&&edge==='max'&&[1,25,50,75,100].includes(level))await page.screenshot({path:path.join(output,`city-stage-${level}.png`)});
        }
      }
    }
    // Selection uses the shrunken visible city and keeps the exact identity.
    await page.evaluate(key=>{const v=nativeContinuousWorld.view,o=v.getObject(key);v.clear();v.view(o.x,o.y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).max);},key);
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const target=await marker.boundingBox();assert(target);
    await page.mouse.click(target.x+target.width/2,target.y+target.height/2);await page.waitForFunction(key=>nativeContinuousWorld.view.selectedKey===key,key);
    assert(await marker.evaluate(n=>n.classList.contains('selected')));
    assert.equal(await page.evaluate(()=>nativeContinuousWorld.view.snapshot().following),null);
    // Repeated area refreshes must derive dimensions from unmodified packets.
    await new Promise(r=>setTimeout(r,2100));
    assert.equal(await page.evaluate(key=>nativeContinuousWorld.view.getObject(key).width,key),33.6);
  }finally{
    await ref.update({level:saved});await page.setViewportSize({width:1440,height:900});
    await page.waitForFunction(({key,saved})=>nativeContinuousWorld.view.getObject(key)?.level===saved,{key,saved},{timeout:20000});
    await page.evaluate(({camera,key})=>{const v=nativeContinuousWorld.view;v.view(camera.x,camera.y,camera.zoom);v.select(key);},{camera,key});
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    await page.waitForFunction(()=>!nativeContinuousWorld.bridge.running);
  }
  fs.writeFileSync(path.join(output,"city-stage-checks.json"),JSON.stringify(results,null,2));
};
