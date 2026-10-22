"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
module.exports=async(page,pilot,output)=>{
 const saved=await page.evaluate(()=>nativeContinuousWorld.view.snapshot()),results=[];
 const sectionId="core-v2-east-support-p2-p0",island=`islands/${pilot.identity.worldId}--${pilot.identity.realmShardId}--${sectionId}`;
 const documents=(await pilot.store.collection(island+"/cities").get()).docs,savedCities=documents.map(d=>({ref:d.ref,data:d.data()}));
 try{
  // Exercise the densest template with fully upgraded, owned castles and long
  // ruler/clan banners, not just the small neutral Level-1 fixture labels.
  const batch=pilot.store.batch();for(const {ref}of savedCities)batch.update(ref,{level:100,ownerUid:pilot.players[1].uid,ownerKind:"player",ownerName:"The Northern Sovereign",ownerClanTag:"CROWN"});await batch.commit();
  await page.evaluate(()=>{modal.close();clearSelection(false);nativeContinuousWorld.view.clear();});
  for(const [width,height]of [[1440,900],[844,390],[568,320]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   await page.evaluate(()=>{const v=nativeContinuousWorld.view,s=v.scene.sections.find(s=>s.id==="core-v2-east-support-p2-p0");v.view(s.x+s.width/2,s.y+s.height/2,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size).home);});
   await page.waitForFunction(()=>{const v=nativeContinuousWorld.view,f=v.snapshot().feed;return !f.pending&&!f.failed&&f.ids.includes("core-v2-east-support-p2-p0")&&v.scene.objects.some(o=>o.sectionId==="core-v2-east-support-p2-p0");});
   await page.waitForTimeout(400);
   await page.waitForFunction(id=>nativeContinuousWorld.view.scene.objects.filter(o=>o.kind==="castle"&&o.sectionId===id).every(o=>o.level===100),sectionId);
   const result=await page.evaluate(()=>{
    const root=nativeContinuousWorld.root,labels=[...root.querySelectorAll('.object .city-label')].filter(n=>getComputedStyle(n).visibility!=="hidden").map(n=>({key:n.closest('[data-key]').dataset.key,r:n.getBoundingClientRect().toJSON()}));
    const art=[...root.querySelectorAll('.object')].map(n=>({key:n.dataset.key,r:n.getBoundingClientRect().toJSON()}));
    const overlap=(a,b)=>a.left<b.right-.1&&a.right>b.left+.1&&a.top<b.bottom-.1&&a.bottom>b.top+.1;
    const collisions=[];
    for(let i=0;i<labels.length;i++){
     for(let j=i+1;j<labels.length;j++)if(overlap(labels[i].r,labels[j].r))collisions.push([labels[i].key,labels[j].key]);
     for(const o of art)if(overlap(labels[i].r,o.r))collisions.push([labels[i].key,"art:"+o.key]);
    }
    return {labels:labels.length,collisions,hiddenCastles:[...root.querySelectorAll('.castle .city-label')].filter(n=>getComputedStyle(n).visibility==="hidden").length};
   });
   assert(result.labels>25,"Crowded section did not render");assert.equal(result.hiddenCastles,0,"Crowded owned-city names disappeared");assert.deepEqual(result.collisions,[],"Actual browser labels overlap: "+width);
   results.push({width,height,...result});await page.screenshot({path:path.join(output,`spacing-${width}.png`)});
  }
  // Observe actual authenticated empty polls. They must update the clock and
  // cursor without replacing display objects. No network/auth simulation here.
  const idle=await page.evaluate(async()=>{
   const prototype=SeamlessDeltaFeed.DeltaFeed.prototype,refresh=prototype.refresh;let noops=0,rebuilds=0;
   prototype.refresh=async function(...args){const before=this.data,scene=nativeContinuousWorld.view.scene.objects,count=this.deltas;await refresh.apply(this,args);if(this.deltas>count&&this.data.sections===before.sections){noops++;if(nativeContinuousWorld.view.scene.objects!==scene)rebuilds++;}};
   try{for(let i=0;i<8&&noops<3;i++){await nativeContinuousWorld.view.refresh();await new Promise(r=>setTimeout(r,800));}}finally{prototype.refresh=refresh;}
   return {noops,rebuilds};
  });
  assert(idle.noops>=2,"No unchanged authenticated polls observed");assert.equal(idle.rebuilds,0,"Unchanged polls rebuilt display objects");
  fs.writeFileSync(path.join(output,"spacing-checks.json"),JSON.stringify({results,idle},null,2));
 }finally{
  const restore=pilot.store.batch();for(const {ref,data}of savedCities)restore.set(ref,data);await restore.commit();
  await page.setViewportSize(saved.size);await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  await page.evaluate(c=>nativeContinuousWorld.view.view(c.x,c.y,c.zoom),saved.camera);
  await page.waitForTimeout(300);
 }
};
