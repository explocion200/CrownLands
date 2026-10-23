"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
// Real authenticated production area packets, only disposable fixture data.
module.exports=async(pages,pilot,city,output,harness,{checkActions=false}={})=>{
 const [page,other]=pages,ref=pilot.cityRef(city),saved=(await ref.get()).data(),key=city.regionId+":"+city.id;
 const profiles=pilot.players.map(p=>pilot.store.doc(`players/${p.uid}`));
 const effects=await Promise.all(profiles.map(async p=>(await p.get()).data().itemEffects||{}));
 const camera=await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera),results=[];
 const marker=p=>p.locator(`#continuous-game-surface .castle[data-key="${key}"]`);
 const center=async(p,edge="max")=>{
  await p.evaluate(()=>{modal.close();clearSelection(false);});
  const section=pilot.reader.sections.get(city.regionId);
  await p.evaluate(({x,y})=>nativeContinuousWorld.view.view(x,y),{x:section.x+724,y:section.y+543});
  await p.waitForFunction(key=>!!nativeContinuousWorld.view.getObject(key),key);
  await p.evaluate(({key,edge})=>{const v=nativeContinuousWorld.view,o=v.getObject(key);v.clear();v.view(o.x,o.y,SeamlessModel.forWorld(v.scene).limits(v.snapshot().size)[edge]);},{key,edge});
  await marker(p).waitFor({state:"visible"});
  await p.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  assert(!await p.evaluate(()=>modal.open),"A login dialog must not obscure the visual check");
 };
 const has=(p,shown)=>p.waitForFunction(({key,shown})=>{const n=nativeContinuousWorld.root.querySelector(`[data-key="${key}"]`);return n&&n.classList.contains("peace-shielded")===shown&&n.querySelectorAll(".city-shield-field").length===Number(shown);},{key,shown},{timeout:15000});
 const action=async shown=>{
  if(!checkActions)return;
  await other.waitForFunction(shown=>{const b=document.querySelector("#continuous-game-actions .wheel-attack");return b&&b.disabled===shown&&b.textContent.includes(shown?"Shielded":"Attack");},shown,{timeout:15000}).catch(async error=>{
    console.error("Shield action fixture",await other.evaluate(key=>{const v=nativeContinuousWorld.view,c=getArmyTargetById(v.getObject(key).id),o=v.getObject(key);return {key,cityRegion:getCityRegionId(c),owner:c.owner,ownerMatch:c.ownerUid===o.ownerUid,itemKind:o.kind,expires:o.peaceShieldExpiresAtMs,now:v.serverNowMs(),helper:getCityPeaceShieldExpiresAtMs(c),protected:isCityProtectedByPeaceShield(c)};},key));throw error;
  });
 };
 try{
  const ownerExpiry=Date.now()+120000;
  await profiles[0].update({"itemEffects.shieldExpiresAtMs":ownerExpiry});
  await profiles[1].update({"itemEffects.shieldExpiresAtMs":0});
  // A previously captured city can still have zero in the denormalized copy.
  await ref.update({ownerUid:pilot.players[0].uid,ownerShieldExpiresAtMs:0,fortificationState:null});
  for(const p of pages){await center(p);await has(p,true);}
  if(checkActions){await marker(other).click();await action(true);}
  for(const [width,height]of [[1440,900],[844,390],[568,320]]){
   await page.setViewportSize({width,height});
   const sizes=[];
   for(const edge of ["max","min"]){
    await center(page,edge);await has(page,true);
    const field=marker(page).locator(".city-shield-field");await field.locator("img").evaluate(img=>img.decode());
    const measured=await field.evaluate(n=>{const b=n.getBoundingClientRect(),city=n.parentElement.getBoundingClientRect(),style=getComputedStyle(n);return {width:b.width,height:b.height,cityWidth:city.width,x:b.x,y:b.y,pointerEvents:style.pointerEvents,animation:style.animationName,visible:b.bottom>0&&b.top<innerHeight&&b.right>0&&b.left<innerWidth};});
    assert(measured.visible);assert.equal(measured.pointerEvents,"none");assert.equal(measured.animation,"none");assert(Math.abs(measured.width/measured.cityWidth-.68)<.02);
    sizes.push(measured.width);results.push({width,height,edge,...measured});
    await page.screenshot({path:path.join(output,`city-shield-${width}-${edge}.png`)});
    if(edge==="max"){
     await page.mouse.click(measured.x+measured.width/2,measured.y+measured.height/2);
     await page.waitForFunction(key=>nativeContinuousWorld.view.selectedKey===key,key);
     await page.waitForFunction(()=>!nativeContinuousWorld.bridge.running);
    }
   }
   assert(sizes[1]<sizes[0],"Shield must shrink with its castle, never enlarge on zoom-out");
  }
  await page.setViewportSize({width:844,height:390});await center(page);
  // A stationary view must gain protection when walls finish without a write.
  const repairAtMs=Date.now()+5000;
  await ref.update({fortificationState:{version:1,integrityBps:5000,lastDamagedAtMs:Date.now()-5000,repairAtMs}});
  for(const p of pages)await has(p,false);
  await action(false);
  for(const p of pages)await has(p,true);
  await action(true);
  // New damage, shield cancellation and capture must remove stale artwork.
  await ref.update({fortificationState:{version:1,integrityBps:9999,lastDamagedAtMs:Date.now(),repairAtMs:Date.now()+60000}});await has(page,false);
  await ref.update({fortificationState:null});await has(page,true);
  await profiles[0].update({"itemEffects.shieldExpiresAtMs":0});for(const p of pages)await has(p,false);
  await action(false);
  await profiles[0].update({"itemEffects.shieldExpiresAtMs":ownerExpiry});for(const p of pages)await has(p,true);
  await action(true);
  await ref.update({ownerUid:pilot.players[1].uid,ownerShieldExpiresAtMs:0});for(const p of pages)await has(p,false);
  const expires=Date.now()+5000;await profiles[1].update({"itemEffects.shieldExpiresAtMs":expires});for(const p of pages)await has(p,true);
  // Simulate failed polls and a badly skewed phone clock. Expiry uses the last
  // authoritative server clock and does not need camera motion or a new packet.
  const read=harness.worldData.read;
  harness.worldData.read=async(...args)=>{if(args[1]==="areas")throw Object.assign(Error("Fixture disconnect"),{status:503});return read(...args);};
  await page.evaluate(()=>{window.shieldQaDateNow=Date.now;Date.now=()=>window.shieldQaDateNow()-3600000;});
  try{await has(page,false);assert(Date.now()>=expires-200);}finally{harness.worldData.read=read;await page.evaluate(()=>{Date.now=window.shieldQaDateNow;delete window.shieldQaDateNow;});}
  await ref.update({ownerUid:"",ownerShieldExpiresAtMs:Date.now()+60000});
  await page.waitForFunction(key=>nativeContinuousWorld.view.getObject(key)?.ownerUid===""&&nativeContinuousWorld.view.getObject(key)?.peaceShieldExpiresAtMs===0,key);await has(page,false);
  assert.equal(await page.evaluate(key=>nativeContinuousWorld.view.getObject(key).peaceShieldExpiresAtMs,key),0);
 }finally{
  for(const [i,p]of profiles.entries())await p.update({itemEffects:effects[i]});
  await ref.set(saved);await page.setViewportSize({width:1440,height:900});
  await page.evaluate(camera=>nativeContinuousWorld.view.view(camera.x,camera.y,camera.zoom),camera);
 }
 fs.writeFileSync(path.join(output,"city-shield-checks.json"),JSON.stringify(results,null,2));
 console.log("Continuous shield browser: two viewers, desktop/mobile, zoom, missing city timer, repair, new damage, cancellation, capture, neutral exclusion and offline/skewed-clock expiry passed.");
};
