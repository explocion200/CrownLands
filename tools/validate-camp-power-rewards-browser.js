"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const executable = [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable,"A Chromium browser is required");
  const output = path.resolve(__dirname,"../release-artifacts/camp-power-rewards");
  fs.mkdirSync(output,{recursive:true});
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors=[], results=[];
  try {
    session=await startBrowserSession(executable);
    client=await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
    const evaluate=async expression=>{
      const r=await client.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
      assert(!r.exceptionDetails,r.exceptionDetails?.exception?.description||r.exceptionDetails?.text);
      return r.result.value;
    };
    await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});
    let ready=false;
    for(let i=0;i<400;i++){
      if(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'")){ready=true;break;}
      await delay(100);
    }
    assert(ready,"Fixture did not load");
    await evaluate(`(() => {
      __CROWNLANDS_BENCHMARK__.closeModal();clearOnlineServerReportWatcher();
      usesServerEconomyAuthority=()=>true;
      const original=getOnlineApi();
      getOnlineApi=()=>({...original,isSignedIn:()=>true,loadRewardCampProgress:async()=>({date:currentUtcDateKey(),count:0})});
      window.setCampPowerFixture=(power)=>{state.globalStats={uid:getCurrentOnlineUid(),version:12,worldId:ONLINE_WORLD_ID,
        resetGeneration:RESET_GENERATION,kingPower:power,baseGoldPerHour:100000,baseTroopPerHour:100000,
        goldPerHour:999999,troopPerHour:999999,updatedAtMs:Date.now()};};
    })()`);
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      for(const type of ["gold","troops"]){
        for(const [power,tier,multiplier,hours,amount] of [[7813452,"Weak",3,"1.5",150000],[7813453,"Middle",1,"0.5",50000],[192405410,"Strong",0.5,"0.25",25000]]){
          await evaluate(`(() => {modal.close();setCampPowerFixture(${power});
            window.campPowerFixture=[...WORLD_CAMPS_BY_ID.values()].find(c=>c.campType===${JSON.stringify(type)});
            if(!campPowerFixture)throw Error('Missing Camp');showRewardCampInfoModal(campPowerFixture.id);})()`);
          await delay(180);
          const result=await evaluate(`(() => {const r=modal.getBoundingClientRect();return {
            summary:modalBody.querySelector('.camp-next-reward').innerText,overflow:modalBody.scrollWidth-modalBody.clientWidth,
            bounds:{left:r.left,top:r.top,right:r.right,bottom:r.bottom}};})()`);
          assert(result.summary.includes(`${tier} tier · ${multiplier}×`),result.summary);
          assert(result.summary.includes(`${hours} hours of raw production`),result.summary);
          assert(result.summary.includes(amount.toLocaleString("en-US")),result.summary);
          assert(result.bounds.left>=0&&result.bounds.top>=0&&result.bounds.right<=width+1&&result.bounds.bottom<=height+1);
          assert(result.overflow<=1,`Overflow at ${width}`);
          await evaluate("modalBody.querySelector('[data-camp-info-tab=reward]').click()");
          await delay(80);
          const rewardText=await evaluate("modalBody.querySelector('[data-camp-reward-panel]').innerText");
          assert(rewardText.toLowerCase().includes(`${hours}h raw production`),rewardText);
          assert(rewardText.includes("guaranteed minimums still apply"));
          if(type==="gold"){
            const shot=await client.send("Page.captureScreenshot",{format:"png"});
            fs.writeFileSync(path.join(output,`${tier.toLowerCase()}-${width}.png`),Buffer.from(shot.data,"base64"));
          }
          results.push({width,height,type,tier,...result});
        }
        await evaluate("setCampPowerFixture(1);updateVisibleCityDynamicText()");
        assert((await evaluate("modalBody.querySelector('.camp-next-reward').innerText")).includes("Weak tier"),"Open panel did not refresh after a power change");
        await evaluate("state.globalStats=null;updateVisibleCityDynamicText()");
        assert((await evaluate("modalBody.querySelector('.camp-next-reward').innerText")).includes("Power estimate unavailable"));
        assert(!(await evaluate("modalBody.querySelector('.camp-next-reward').innerText")).includes("Weak tier"));
      }
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,"browser-verification.json"),JSON.stringify({results,errors},null,2)+"\n");
    console.log("Gold/Warband tier summaries, fractional hours, raw estimates, changing and missing power passed at desktop and two landscape sizes.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
