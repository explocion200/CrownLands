"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto"),path=require("node:path");
const {imageToGame}=require("../local-backend/world/catalog");
module.exports=async function checkNpcTimers(page,pilot,output){
 const solo=pilot.reader.sections.get("new-lands-l01-p001"),boss=[...pilot.reader.sections.values()].find(s=>s.gridX===solo.gridX&&s.gridY===solo.gridY+1);
 const now=Date.now(),refs=[],rows=[];
 for(const [section,classification,slot,y,delay]of [[solo,"solo",1,810,120000],[boss,"boss",0,276,1800000]]){
  const id="marauder_"+crypto.createHash("sha256").update(section.id).digest("hex").slice(0,12)+"_"+String(slot).padStart(2,"0");
  const row={...pilot.identity,id,regionId:section.id,spawnId:crypto.randomUUID(),slot,classification,level:classification==="boss"?90:30,status:"defeated",name:"Respawn fixture "+classification,
   targetType:"marauder",ownerKind:"neutral",ownerUid:"",balanceVersion:2,respawnAtMs:now+delay,...imageToGame(section,{x:724,y})};
  const ref=pilot.store.doc(`islands/${pilot.identity.worldId}--${pilot.identity.realmShardId}--${section.id}/marauders/${id}`);
  const prior=await ref.get();refs.push({ref,prior});rows.push(row);await ref.set(row);
 }
 try{
  await page.evaluate(now=>{const api=getOnlineApi();window.npcTimerQA={now,clock:getArmyClockNowMs,wake:api.refreshMarauderRespawn,calls:[]};getArmyClockNowMs=()=>npcTimerQA.now;
   api.refreshMarauderRespawn=async data=>{npcTimerQA.calls.push(data);throw Error("Fixture offline wake");};},now);
  const keys=rows.map(r=>r.regionId+":"+r.id);
  for(const [width,height]of [[1440,900],[844,390],[568,320]]){
   await page.setViewportSize({width,height});
   await page.evaluate(({x,y})=>{const v=CrownlandsContinuousWorld.view,{size}=v.snapshot();v.view(x,y,SeamlessModel.forWorld(v.scene).limits(size).home);},{x:solo.x+724,y:boss.y});
   await page.waitForFunction(keys=>keys.every(key=>CrownlandsContinuousWorld.view.getObject(key)&&[...CrownlandsContinuousWorld.root.querySelectorAll(".object.npc")].some(n=>n.dataset.key===key&&n.querySelector("[data-npc-respawn]"))),keys);
   const read=()=>page.evaluate(keys=>{renderCombatTimers();return keys.map(key=>{const n=[...CrownlandsContinuousWorld.root.querySelectorAll(".object.npc")].find(n=>n.dataset.key===key);return {label:n.querySelector("[data-npc-respawn]").textContent,aria:n.getAttribute("aria-label"),selectable:CrownlandsContinuousWorld.view.getObject(key).selectable};});},keys);
   await page.evaluate(now=>{npcTimerQA.now=now;},now);
   assert.deepEqual((await read()).map(x=>x.label),["Respawn 2:00","Respawn 30:00"]);
   await page.evaluate(()=>{npcTimerQA.now+=1000;});
   const ticking=await read();assert.deepEqual(ticking.map(x=>x.label),["Respawn 1:59","Respawn 29:59"]);
   assert(ticking.every(x=>!x.selectable&&x.aria.includes("Defeated")));
   await page.screenshot({path:path.join(output,`npc-timers-${width}.png`)});
  }
  await page.evaluate(now=>{npcTimerQA.now=now+1800000;renderCombatTimers();renderCombatTimers();},now);
  await page.waitForFunction(()=>npcTimerQA.calls.length===2);
  const calls=await page.evaluate(()=>npcTimerQA.calls);
  assert.deepEqual(calls.map(c=>c.regionId).sort(),rows.map(r=>r.regionId).sort(),"Wake every visible section, not only the active legacy section");
  assert(calls.every(c=>rows.some(r=>r.id===c.id&&r.spawnId===c.spawnId)));
  await page.evaluate(()=>{renderCombatTimers();CrownlandsContinuousWorld.view.invalidate();});
  await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>npcTimerQA.calls.length),2,"Failed wake must not spam on later ticks or snapshots");
  // The server replaces the same slot, but with a fresh immutable spawn.
  const next={...rows[0],status:"active",respawnAtMs:0,spawnId:crypto.randomUUID()};await refs[0].ref.set(next);
  await page.waitForFunction(({key,spawn})=>CrownlandsContinuousWorld.view.getObject(key)?.spawnId===spawn,{key:keys[0],spawn:next.spawnId});
  await page.waitForFunction(key=>![...CrownlandsContinuousWorld.root.querySelectorAll(".object.npc")].find(n=>n.dataset.key===key)?.querySelector("[data-npc-respawn]"),keys[0]);
  assert(await page.evaluate(key=>CrownlandsContinuousWorld.view.getObject(key).selectable,keys[0]));
  await refs[0].ref.update({status:"retired"});
  await page.waitForFunction(key=>!CrownlandsContinuousWorld.view.getObject(key),keys[0]);
  assert.equal(await page.evaluate(key=>[...CrownlandsContinuousWorld.root.querySelectorAll(".object.npc")].filter(n=>n.dataset.key===key).length,keys[0]),0);
 }finally{
  await page.evaluate(()=>{getArmyClockNowMs=npcTimerQA.clock;getOnlineApi().refreshMarauderRespawn=npcTimerQA.wake;delete window.npcTimerQA;});
  for(const {ref,prior}of refs){if(prior.exists)await ref.set(prior.data());else await ref.delete();}
  await page.setViewportSize({width:1440,height:900});
 }
};
