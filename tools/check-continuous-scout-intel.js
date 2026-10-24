"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
module.exports=async function checkScoutIntel(page,other,pilot,source,target,select,output){
  const key=target.regionId+":"+target.id;
  const banner=p=>p.locator(`#continuous-game-surface [data-key="${key}"] .foreign-garrison`);
  await select(page,target);await select(other,target);
  await banner(page).waitFor();assert.equal(await banner(page).textContent(),"? troops");
  assert.equal(await banner(other).textContent(),"? troops");
  await page.locator("#continuous-game-actions .wheel-scout").click();
  let scout;
  for(let n=0;n<150&&!scout;n++){
    scout=(await pilot.store.collection("armies").where("ownerUid","==",pilot.players[0].uid).where("kind","==","scout").get()).docs.find(d=>d.data().toId===target.id);
    if(!scout)await new Promise(r=>setTimeout(r,100));
  }
  assert(scout,"Normal Scout button must dispatch an authoritative scout");
  await pilot.store.doc("armies/"+scout.id).update({arrivesAtMs:Date.now()-1000});await pilot.settle();
  // No new selection, camera movement or manual report reload: the private
  // subscription must update the already selected connected-map banner.
  await page.waitForFunction(id=>!!state.scoutReports[id],target.id);
  const expected=await page.evaluate(id=>formatNumber(state.scoutReports[id].troops)+" troops",target.id);
  await page.waitForFunction(({key,expected})=>nativeContinuousWorld.root.querySelector(`[data-key="${key}"] .foreign-garrison`)?.textContent===expected,{key,expected});
  assert.equal(await banner(other).textContent(),"? troops","Another account must not receive the scout snapshot");
  const snapshot=await page.evaluate(({id,key})=>({report:state.scoutReports[id],object:nativeContinuousWorld.view.getObject(key),selected:nativeContinuousWorld.view.selectedKey}),{id:target.id,key});
  assert.equal(snapshot.selected,key);assert.equal(snapshot.object.troopVisibility,"hidden");assert(!Number.isFinite(snapshot.object.troops));
  assert(await page.locator("#continuous-game-actions .wheel-scout").isVisible(),"Scout delivery moved the wheel into the hidden legacy map");
  // Targeted presentation uses normalized private state without altering the
  // area DTO or rebuilding geometry. Restore the real report afterwards.
  await page.evaluate(({id,key})=>{
    window.scoutBannerQA={original:state.scoutReports[id],object:nativeContinuousWorld.view.getObject(key),node:nativeContinuousWorld.root.querySelector(`[data-key="${key}"]`)};
    state.scoutReports[id]={...state.scoutReports[id],troops:0};scheduleScoutPresentation([id]);
  },{id:target.id,key});
  await page.waitForFunction(key=>nativeContinuousWorld.root.querySelector(`[data-key="${key}"] .foreign-garrison`)?.textContent==="0 troops",key);
  assert(await page.evaluate(key=>scoutBannerQA.object===nativeContinuousWorld.view.getObject(key)&&scoutBannerQA.node===nativeContinuousWorld.root.querySelector(`[data-key="${key}"]`),key),"Count-only updates replaced the map object/node");
  const checks=[];
  for(const [width,height]of [[1440,900],[844,390],[568,320]]){
    await page.setViewportSize({width,height});
    await page.evaluate(id=>{state.scoutReports[id]=scoutBannerQA.original;scheduleScoutPresentation([id]);},target.id);
    await select(page,target);
    await page.waitForFunction(({key,expected})=>nativeContinuousWorld.root.querySelector(`[data-key="${key}"] .foreign-garrison`)?.textContent===expected,{key,expected});
    assert(await banner(page).isVisible());
    const boxes=await page.evaluate(key=>{
      const node=nativeContinuousWorld.root.querySelector(`[data-key="${key}"]`),label=node.querySelector(".foreign-garrison"),flag=node.querySelector(".foreign-city-shield");
      return {count:label.textContent,level:node.querySelector(".city-label-level").textContent,rect:label.getBoundingClientRect().toJSON(),flag:flag.getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll("#continuous-game-actions button")].map(b=>b.getBoundingClientRect().toJSON())};
    },key);
    assert(boxes.rect.width>0&&boxes.rect.left>=0&&boxes.rect.right<=width&&boxes.rect.top>=0);
    for(const b of boxes.buttons)assert(boxes.rect.right<=b.left||boxes.rect.left>=b.right||boxes.rect.bottom<=b.top||boxes.rect.top>=b.bottom,"A castle button covers the troop count");
    await page.screenshot({path:path.join(output,`scout-banner-${width}.png`)});checks.push({width,height,...boxes});
  }
  // The ordinary one-second lifecycle must remove expired intelligence while
  // the player leaves the camera/selection still. Only fictional state changes.
  await page.evaluate(id=>{
    const r={...scoutBannerQA.original,expiresAtMs:Date.now()+1200,expiresAt:state.gameSeconds+1.2};
    state.scoutReports[id]=r;scheduleScoutPresentation([id]);
  },target.id);
  await page.waitForFunction(key=>nativeContinuousWorld.root.querySelector(`[data-key="${key}"] .foreign-garrison`)?.textContent==="? troops",key,{timeout:7000});
  assert(await page.locator("#continuous-game-actions .wheel-scout").isVisible());
  await page.evaluate(id=>{state.scoutReports[id]=scoutBannerQA.original;scheduleScoutPresentation([id]);delete window.scoutBannerQA;},target.id);
  await page.setViewportSize({width:1440,height:900});await select(page,source);
  fs.writeFileSync(path.join(output,"scout-banner-checks.json"),JSON.stringify({actualScout:true,otherAccountHidden:true,sharedObjectHidden:true,immediateZeroUpdate:true,idleExpiry:true,viewports:checks},null,2));
};
