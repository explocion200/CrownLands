"use strict";
// Development-only review: real estate renderer, isolated sample Guild state.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const {createServer}=require("./estate-building-ui-preview");
const root=path.resolve(__dirname,".."),output=path.join(root,"release-artifacts/guild-master-missions/game-preview");
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const server=createServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;const errors=[],results=[];
  try{
    browser=await chromium.launch({channel:"chrome",headless:true});
    for(const [width,height]of [[1440,900],[844,390],[568,320]]){
      const context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce",hasTouch:width<900});
      const page=await context.newPage();
      page.on("pageerror",error=>errors.push(error.message));
      page.on("response",r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
      await page.goto(origin+"/docs/visual-qa/guild-master/game.html");
      await page.waitForFunction(()=>document.documentElement.dataset.guildGameReady==="true");
      const action=(name)=>page.locator(`#guildPreview [data-guild="${name}"]`);
      const tab=name=>page.locator(`#guildPreview nav [data-tab="${name}"]`).click();
      const snapshot=()=>page.evaluate(()=>guildGamePreview.snapshot());
      const checkArt=async(selector,expected)=>{
        const images=page.locator(selector);
        const files=await images.evaluateAll(nodes=>nodes.map(image=>new URL(image.src).pathname.split("/").pop()));
        assert.deepEqual(files,expected,"Each mission/room uses its own matching artwork");
        assert.equal(new Set(files).size,files.length,"Cards do not reuse cropped artwork");
        for(const image of await images.all()){
          await image.scrollIntoViewIfNeeded();await image.evaluate(node=>node.decode());
          const geometry=await image.evaluate(node=>({natural:node.naturalWidth/node.naturalHeight,rendered:node.clientWidth/node.clientHeight,fit:getComputedStyle(node).objectFit}));
          assert(Math.abs(geometry.natural-geometry.rendered)<.02||geometry.fit==="contain","Artwork remains uncropped and undistorted");
        }
        await page.locator("#guildPreview .guild-body").evaluate(node=>node.scrollTop=0);
      };
      const layout=async()=>{
        const m=await page.evaluate(()=>{
          const d=document.querySelector("#guildPreview"),body=d.querySelector(".guild-body"),r=d.getBoundingClientRect();
          return {dialog:r.toJSON(),overflow:body.scrollWidth-body.clientWidth,footer:d.querySelector("footer").getBoundingClientRect().toJSON(),buttons:[...d.querySelectorAll("button")].filter(b=>b.checkVisibility()).map(b=>b.getBoundingClientRect().toJSON())};
        });
        assert(m.dialog.x>=0&&m.dialog.y>=0&&m.dialog.right<=width+1&&m.dialog.bottom<=height+1,"Dialog fits viewport");
        assert(m.overflow<=1,"No horizontal content overflow");
        assert(m.footer.bottom<=height&&m.footer.top>=0,"Footer remains on-screen");
        assert(m.buttons.every(b=>b.width>=44&&b.height>=44),"Buttons retain 44px targets");
      };
      await page.locator(".guild-hall-art img").evaluate(image=>image.decode());
      await checkArt(".guild-hall-art img",["hall-v2.webp"]);
      await layout();await page.screenshot({path:path.join(output,`hall-${width}x${height}.png`)});
      const camera=await page.evaluate(()=>guildGamePreview.estate.snapshot());
      await action("recruits").click();await layout();
      let s=await snapshot();const original=structuredClone(s.offers);
      assert.equal(s.offers[0].type,"guard");assert.equal(s.offers[1].type,"guard");
      for(const c of s.offers){const bounds=await page.evaluate(type=>GuildReviewModel.types[type].base,c.type);assert(c.base.every((n,i)=>n>=bounds[i]-2&&n<=bounds[i]+2));}
      await action("refresh").click();assert.deepEqual((await snapshot()).offers,original,"Refresh cannot reroll offers");
      await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.guildGameReady==="true");
      await action("recruits").click();assert.deepEqual((await snapshot()).offers,original,"Reload preserves starting rolls");
      await page.screenshot({path:path.join(output,`recruits-${width}x${height}.png`)});
      const gold=s.gold;await page.locator('[data-guild="recruit"][data-id="offer-maren"]').click();
      s=await snapshot();assert.equal(s.gold,gold-57);assert.deepEqual(s.members.find(c=>c.id==="hired-offer-maren").base,original[0].base,"Recruit keeps exactly advertised rolls");
      assert(await page.locator('[data-guild="recruit"][data-id="offer-maren"]').isDisabled());
      await action("returnGuild").click();await layout();
      await page.locator('[data-field="type"]').selectOption("guard");assert.equal(await page.locator(".guild-member").count(),2);
      await page.locator('[data-field="type"]').selectOption("all");
      await tab("contracts");await layout();
      await checkArt(".guild-contract img",["escort","muster","equipment","quarry","timber","workshop","waymark","ledger"].map(id=>`mission-${id}.webp`));
      await page.screenshot({path:path.join(output,`contracts-${width}x${height}.png`)});
      await page.locator('[data-guild="mission"][data-id="escort"]').click();
      await checkArt(".guild-planning-art",["room-planning.webp"]);
      const before=await page.locator("[data-forecast]").textContent();
      await page.locator('[data-field="route"]').focus();
      await page.locator('[data-field="route"]').selectOption("remote");
      assert.notEqual(await page.locator("[data-forecast]").textContent(),before,"Preparation updates forecast immediately");
      assert.equal(await page.locator('[data-field="route"]').evaluate(e=>e===document.activeElement),true,"Changing route keeps focus");
      await page.locator('[data-field="partyName"]').fill("Western Watch");await action("saveParty").click();
      await action("refresh").click();assert.equal(await page.locator('[data-field="route"]').inputValue(),"remote");
      assert.equal((await snapshot()).saved[0].name,"Western Watch");await layout();
      await page.screenshot({path:path.join(output,`planning-${width}x${height}.png`)});
      const beforeReport=await snapshot();await action("report").click();await action("skip").click();
      await checkArt(".guild-report>img",["mission-escort.webp"]);
      assert.equal(await page.locator(".guild-report h2").textContent(),"Rewards");assert.deepEqual(await snapshot(),beforeReport,"Report replay/skip has no economic effect");
      await tab("infirmary");await layout();assert(await page.locator("[data-recovery]").count());
      await checkArt(".guild-room-image",["room-infirmary.webp"]);
      await page.screenshot({path:path.join(output,`infirmary-${width}x${height}.png`)});
      await tab("training");await layout();await checkArt(".guild-room-image",["room-training.webp"]);
      await page.screenshot({path:path.join(output,`training-${width}x${height}.png`)});
      await tab("archive");await layout();await checkArt(".guild-room-image",["room-archive.webp"]);
      await tab("improvements");await layout();
      await checkArt(".guild-room-card img",["contracts","planning","infirmary","training","archive"].map(id=>`room-${id}.webp`));
      await page.screenshot({path:path.join(output,`improvements-${width}x${height}.png`)});
      for(const id of ["contracts","planning","infirmary","training","archive"]){
        await page.locator(`[data-guild="room"][data-id="${id}"]`).click();
        await checkArt(".guild-upgrade-head img",[`room-${id}.webp`]);await tab("improvements");
      }
      await page.locator('[data-guild="room"][data-id="infirmary"]').click();await layout();
      await page.screenshot({path:path.join(output,`improvement-${width}x${height}.png`)});
      const roomGold=(await snapshot()).gold;await action("improve").click();s=await snapshot();assert.equal(s.gold,roomGold-72);assert.equal(s.roomJob.id,"infirmary");
      await page.locator('[data-guild="room"][data-id="archive"]').click();assert(await action("improve").isDisabled(),"No second room job can queue");
      await page.keyboard.press("Escape");assert.equal(await page.locator("#guildPreview").evaluate(e=>e.open),false);
      assert.deepEqual(await page.evaluate(()=>guildGamePreview.estate.snapshot()),camera,"Guild round trip preserves estate camera");
      const enter=page.locator('.estate-detail [data-estate-enter="guild-master"]');if(width<900)await enter.tap();else await enter.click();
      await page.waitForFunction(()=>document.querySelector("#guildPreview").open);await layout();
      await page.locator('#guildPreview header [data-guild="close"]').click();
      await page.locator('[data-estate-fit]').click();
      await page.locator('[data-estate-directory-toggle]').click();
      await page.locator('.estate-directory [data-estate-enter="alehouse"]').click();
      assert.equal(await page.locator("#guildTitle").textContent(),"Alehouse","Real estate directory enters recruitment preview");
      assert.deepEqual((await snapshot()).offers[1].base,original[1].base);
      await page.goto(origin+"/docs/visual-qa/guild-master/index.html");
      for(const id of ["contracts","planning","infirmary","training","archive"]){
        await page.locator(`[data-room="${id}"]`).click();
        assert((await page.locator(".hall-art img").getAttribute("src")).endsWith(`room-${id}.webp`));
        await page.locator(".hall-art img").evaluate(node=>node.decode());
      }
      await page.goto(origin+"/docs/estate-economy/guild-master-balance-review.html");
      assert((await page.locator("body").textContent()).includes("Groups 1–2 remain proposed"),"Art review cannot approve gameplay balance");
      results.push({width,height,status:"passed",independentMissionImages:8,independentRoomImages:5,uncroppedArtwork:true,reducedMotion:true,offersStable:true,exactRecruitStats:true,forecastUpdates:true,reportNoRewards:true,oneRoomJob:true,cameraRestored:true});
      await context.close();
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({scope:"Local fixture UI only; no production mechanics or server authority validated",results},null,2)+"\n");
    console.log("PASS Guild game preview: three viewport sizes, real estate entry/return, 44px controls, stable random offers, exact recruited stats, planning/focus retention, harmless report replay and single sample room improvement.");
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
