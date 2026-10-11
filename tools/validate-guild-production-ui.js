"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {openGuildBrowser}=require("./guild-browser-harness"),{createServer}=require("./guild-production-preview");
(async()=>{
  for(const built of [false,true]){
  const server=createServer({built});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin="http://127.0.0.1:"+server.address().port,out=path.resolve(__dirname,"../release-artifacts/guild-master-missions/production-ui"+(built?"-built":""));fs.mkdirSync(out,{recursive:true});
  let browser;const errors=[];
  try{for(const [width,height] of [[1440,900],[844,390],[568,320]]){
    browser=await openGuildBrowser({width,height,errors});const p=browser.page;
    await p.goto(origin+"/docs/visual-qa/guild-master/production.html");await p.waitForFunction(()=>document.documentElement.dataset.guildProductionReady==="true"&&document.querySelector(".guild-window[open]"));
    const control=(action,id)=>p.locator('.guild-window [data-guild="'+action+'"]'+(id?'[data-id="'+id+'"]':""));
    const tab=async id=>{await control("tab",id).first().click();await p.waitForFunction(()=>document.querySelector(".guild-body").getAttribute("aria-busy")==="false");};
    const idle=()=>p.waitForFunction(()=>document.querySelector(".guild-body").getAttribute("aria-busy")==="false");
    async function layout(name){
      const g=await p.evaluate(()=>{const d=document.querySelector(".guild-window"),b=d.querySelector(".guild-body");return {rect:d.getBoundingClientRect().toJSON(),overflow:b.scrollWidth-b.clientWidth,buttons:[...d.querySelectorAll("button")].filter(el=>el.getClientRects().length).map(el=>({text:el.textContent,height:el.getBoundingClientRect().height}))};});
      assert(g.rect.x>=0&&g.rect.y>=0&&g.rect.right<=width+1&&g.rect.bottom<=height+1,name+" fits");
      assert(g.overflow<=1,name+" has no horizontal overflow: "+g.overflow);
      assert(g.buttons.every(b=>b.height>=43.9),name+" has 44px targets: "+JSON.stringify(g.buttons.filter(b=>b.height<43.9)));
      await p.locator(".guild-window img").evaluateAll(nodes=>{nodes.forEach(node=>node.loading="eager");return Promise.all(nodes.map(node=>node.decode()));});
      await p.screenshot({path:path.join(out,width+"-"+height+"-"+name+".png")});
    }
    await layout("hall");assert.equal(await p.locator('.guild-window nav [data-id="planning"]').count(),0,"No planning tab before choosing a contract");
    for(const name of ["members","contracts","infirmary","training","archive","improvements"]){await tab(name);await layout(name);}
    await tab("members");await control("compare","qa-champion-0").click();await control("compare","qa-champion-1").click();assert((await p.locator(".guild-body").textContent()).includes("Member comparison"));
    await p.locator('[data-field="memberFilter"]').selectOption("medic");assert.equal(await p.locator(".guild-member").count(),1,"Type filter narrows the roster");
    await tab("training");await p.locator('[data-field="mentorId"]').selectOption("qa-champion-0");await p.locator('[data-field="pupilId"]').selectOption("qa-champion-2");await control("assignMentor").click();await idle();await control("confirm").click();await idle();
    assert.equal(await p.evaluate(()=>guildProductionPreview.snapshot().estate.guild.mentoring.pupilId),"qa-champion-2");
    await tab("contracts");await control("choose","introduction").click();
    await control("toggleMember","qa-champion-1").click();await p.waitForFunction(()=>!document.querySelector('[data-guild="reviewMission"]').disabled);
    await control("reviewMission").click();await idle();assert((await p.locator(".guild-body").textContent()).includes("5 min"));
    await control("confirm").click();await idle();
    let snapshot=await p.evaluate(()=>guildProductionPreview.snapshot());assert.equal(snapshot.estate.guild.missions.length,1);assert.equal(snapshot.estate.stock.food,9999);
    await p.evaluate(()=>guildProductionPreview.advance(5*60000+100));await idle();
    snapshot=await p.evaluate(()=>guildProductionPreview.snapshot());assert.equal(snapshot.estate.guild.missions.length,0);assert(snapshot.champions["qa-champion-1"].recoveryUntilMs>snapshot.serverNowMs);
    await tab("archive");await control("report").first().click();await idle();await control("reportSkip").click();await layout("report");
    const xp=snapshot.champions["qa-champion-1"].xp;await control("reportNext").click();await control("reportSkip").click();assert.equal(await p.evaluate(()=>guildProductionPreview.snapshot().champions["qa-champion-1"].xp),xp,"Replay cannot award XP");
    await p.evaluate(()=>guildProductionPreview.advance(2*60000));await tab("contracts");await control("choose","escort").click();
    await control("toggleMember","qa-champion-0").click();await control("toggleMember","qa-champion-1").click();await p.waitForFunction(()=>!document.querySelector('[data-guild="reviewMission"]').disabled);
    await p.locator('[data-field="partyName"]').fill("Road wardens");await control("saveParty").click();await idle();await control("confirm").click();await idle();
    assert.equal(await p.evaluate(()=>guildProductionPreview.snapshot().estate.guild.savedParties[0].name),"Road wardens");
    await p.locator('[data-field="route"]').selectOption("patrolled");await p.waitForFunction(()=>!document.querySelector('[data-guild="reviewMission"]').disabled);
    await control("refresh").click();await idle();await p.waitForFunction(()=>!document.querySelector('[data-guild="reviewMission"]').disabled);assert.equal(await p.locator('[data-field="route"]').evaluate(el=>el.value),"patrolled","Refresh preserves preparation");
    await layout("planning");await control("reviewMission").click();await idle();await layout("departure");
    await control("confirm").click();await idle();snapshot=await p.evaluate(()=>guildProductionPreview.snapshot());const mission=snapshot.estate.guild.missions[0];assert.equal(mission.route,"patrolled");
    await p.evaluate(ms=>guildProductionPreview.advance(ms),mission.durationMs+100);await idle();snapshot=await p.evaluate(()=>guildProductionPreview.snapshot());assert(snapshot.estate.guild.rewards.length);
    await tab("archive");await control("report").first().click();await idle();await control("reportNext").click();await control("reportNext").click();assert((await p.locator(".guild-body").textContent()).includes("relevant stats"),"Report preserves individual contributions");await tab("hall");
    await control("claim").first().click();await idle();await control("confirm").click();await idle();assert.equal(await p.evaluate(()=>guildProductionPreview.snapshot().estate.guild.rewards.length),0);
    await tab("improvements");await control("improve","infirmary").click();await idle();await control("confirm").click();await idle();
    assert.equal(await p.evaluate(()=>guildProductionPreview.snapshot().estate.guild.roomJob.room),"infirmary");
    await p.evaluate(()=>guildProductionPreview.advance(10*60000));await idle();assert.equal(await p.evaluate(()=>guildProductionPreview.snapshot().estate.guild.rooms.infirmary),1);
    await tab("hall");await control("tab","recruits").click();await layout("recruits");await control("recruit").first().click();await idle();
    await p.evaluate(()=>{const api=guildProductionPreview.api,commit=api.commitEstateAction;let lose=true;api.commitEstateAction=async input=>{const result=await commit(input);if(lose){lose=false;throw Error("Connection lost after sending. Retry the same request.");}return result;};});
    await control("confirm").click();await idle();assert((await control("confirm").textContent()).includes("Retry same request"));
    await control("close").first().click();await p.evaluate(()=>guildProductionPreview.economy.building("alehouse"));await idle();
    assert((await control("confirm").textContent()).includes("Retry same request"),"Closing retains unresolved request identity");
    await control("confirm").click();await idle();
    assert.equal(await p.evaluate(()=>guildProductionPreview.snapshot().estate.activeChampionIds.length),8);
    await control("close").first().focus();await p.keyboard.press("Enter");assert.equal(await p.locator(".guild-window[open]").count(),0,"Keyboard close returns to estate");
    assert.equal(await p.locator("#modal[open]").count(),1);
    await p.evaluate(()=>guildProductionPreview.economy.building("guild-master"));await idle();assert.equal(await p.locator(".guild-window").count(),1,"Reopening reuses one controller");
    await p.keyboard.press("Escape");await p.evaluate(()=>guildProductionPreview.economy.destroy());assert.equal(await p.locator(".guild-window").count(),0,"Cleanup removes Guild dialog");
    await browser.close();browser=null;console.log("Production Guild UI passed "+(built?"built ":"source ")+width+"×"+height);
  }assert.deepEqual(errors,[],"No missing art or browser exceptions");}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
