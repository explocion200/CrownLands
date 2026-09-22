"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const artifacts = path.resolve(__dirname, "../release-artifacts/incoming-threats-runtime");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [], failedResources = [], checks = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Network.responseReceived", event => { if (event.response.status >= 400) failedResources.push(event.response.url); });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw Error("Timed out waiting for " + expression);
    };
    const screenshot = async name => {
      const result = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, name + ".png"), Buffer.from(result.data, "base64"));
    };
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});
      await ready('window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready"');
      await delay(300);
      await evaluate(`(() => {
        __CROWNLANDS_BENCHMARK__.closeModal();
        const target=playerCities()[0], original=getIncomingAttacks();
        window.__incomingOriginal=getIncomingAttacks;
        const seed=original[0] || {};
        window.__incomingFixture=Array.from({length:18},(_,i)=>({
          ...seed,id:"incoming-ui-"+i,key:"incoming-ui-"+i,toId:target.id,fromId:state.cities.find(c=>c.id!==target.id).id,
          owner:"enemy",ownerUid:"draft-enemy-"+i,attackerName:i===3?"Duke Rowan of the Eastern Marches":"Lord Aldric "+i,
          fromName:"Greyhaven",source:{name:i===3?"The Royal Borough of West Ravenwatch":"Greyhaven"},
          kind:i%4===1?"scout":"attack",eventKind:i===2?CITADEL_ASSAULT_EVENT_KIND:"",
          target:{...target,name:i===3?"Saint Alderwick's Fortified Crossing":target.name,troops:12400,level:18},
          targetRegionId:getCityRegionId(target),troopVisibility:"estimate",troopEstimateMin:8000,troopEstimateMax:12000,troops:9876,
          remaining:90+i*131
        }));
        getIncomingAttacks=()=>window.__incomingFixture;
        showIncomingAttacksModal();
      })()`);
      await ready('!!document.querySelector(".incoming-threats-ledger .threat-row")');
      await evaluate('toast.classList.remove("visible")');
      const metrics=await evaluate(`(() => {
        const list=modalBody.querySelector(".threat-list"),r=modal.getBoundingClientRect();
        return {fits:r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,overflow:list.scrollWidth>list.clientWidth+1,rows:list.querySelectorAll(".threat-row").length,buttons:[...list.querySelectorAll(".locate")].every(b=>b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44),color:getComputedStyle(list.querySelector(".city h3")).color};
      })()`);
      assert(metrics.fits&&!metrics.overflow&&metrics.buttons,JSON.stringify({width,...metrics}));
      assert.equal(metrics.rows,18);
      assert(!await evaluate('modalBody.querySelector(".force").textContent.includes("9876")'),"Exact hostile amount leaked");
      assert(await evaluate('modalBody.querySelector(".force").textContent.includes("Estimated")'));
      await evaluate('showIncomingAttacksModal();toast.classList.remove("visible")');
      await delay(100);
      assert(await evaluate('modal.open'), "Incoming panel closed before capture");
      await screenshot("standard-"+width);
      await evaluate('modalBody.querySelector("[data-incoming-filter=scout]").click()');
      assert.equal(await evaluate('modalBody.querySelectorAll(".threat-row").length'),5);
      await evaluate('modalBody.querySelector("[data-incoming-filter=attack]").click()');
      assert.equal(await evaluate('modalBody.querySelectorAll(".threat-row").length'),13);
      assert.equal(await evaluate('modalBody.querySelectorAll(".legion").length'),1);
      await evaluate('modalBody.querySelector("[data-incoming-filter=all]").click()');
      // Text-only countdown ticks must preserve the actual pressed button and scrolled DOM.
      assert(await evaluate(`(() => {
        const list=modalBody.querySelector(".threat-list"),button=list.querySelector(".threat-row:last-child .locate"),root=modalBody.firstElementChild;
        button.scrollIntoView({block:"center"});button.focus({preventScroll:true});const scroll=list.scrollTop;
        window.__incomingFixture.forEach(row=>row.remaining-=1);renderIncomingAttacksModalContent();
        return root===modalBody.firstElementChild&&button===document.activeElement&&list.scrollTop===scroll;
      })()`),"Countdown changed focus or scroll");
      // A membership/row change retains scroll and focus on the same surviving identity.
      assert(await evaluate(`(() => {
        const list=modalBody.querySelector(".threat-list"),scroll=list.scrollTop;
        const id=document.activeElement.closest("[data-threat]").dataset.threat;
        window.__incomingFixture.unshift({...window.__incomingFixture[0],id:"new-row",key:"new-row",remaining:1});
        renderIncomingAttacksModalContent();
        return modalBody.querySelector(".threat-list").scrollTop===scroll&&document.activeElement.closest("[data-threat]")?.dataset.threat===id;
      })()`));
      // Failed navigation keeps the list; rapid input starts only one request with saved map identity.
      await evaluate(`window.__realReportFocus=focusBattleReportTarget;window.__navCalls=[];focusBattleReportTarget=(id,region)=>new Promise(resolve=>{window.__navCalls.push({id,region});window.__finishNav=resolve;});
        modalBody.querySelector(".threat-row:last-child .locate").click();
        modalBody.querySelector(".threat-row:last-child .locate").click();`);
      assert.equal(await evaluate('window.__navCalls.length'),1);
      assert.equal(await evaluate('window.__navCalls[0].region'),await evaluate('window.__incomingFixture.at(-1).targetRegionId'));
      await evaluate('window.__finishNav(false)');
      await ready('!incomingThreatsNavigationPending');
      assert(await evaluate('modal.open && !modalBody.querySelector(".locate").disabled'));
      await evaluate('modalBody.querySelector(".locate").click();modal.close();window.__finishNav(true)');
      await ready('!incomingThreatsNavigationPending');
      assert.equal(await evaluate('modal.open'),false);
      await evaluate('focusBattleReportTarget=window.__realReportFocus;showIncomingAttacksModal()');
      // Off-map/pending intelligence, unknown estimate, and non-city target presentation.
      await evaluate(`window.__incomingFixture=[{...window.__incomingFixture[0],troops:0,troopVisibility:"hidden",troopEstimateMin:0,troopEstimateMax:0,target:{...window.__incomingFixture[0].target,incomingSnapshotPending:true}}];renderIncomingAttacksModalContent();`);
      assert(await evaluate('!!modalBody.querySelector(".pending-note") && !modalBody.querySelector(".city-stats")'));
      assert.equal(await evaluate('modalBody.querySelector(".force strong").textContent'),"Unknown");
      await screenshot("pending-"+width);
      await evaluate(`window.__incomingFixture=[{...window.__incomingFixture[0],target:{...window.__incomingFixture[0].target,incomingSnapshotPending:false,targetType:"camp",kind:"camp",campType:"gold",type:"camp"}}];renderIncomingAttacksModalContent();`);
      assert(await evaluate('isRewardCampTarget(window.__incomingFixture[0].target) && !modalBody.querySelector(".level") && modalBody.querySelector(".locate span").textContent === "Locate"'));
      await evaluate('window.__incomingFixture=[];renderIncomingAttacksModalContent()');
      assert(await evaluate('modalBody.textContent.includes("The watch is quiet")'));
      await evaluate('updateIncomingAttackUi()');
      assert.equal(await evaluate('modal.open'),false);
      checks.push({width,height,...metrics});
      console.log("Incoming Threats runtime passed at "+width+"x"+height);
    }
    assert.deepEqual(errors,[]);
    // The benchmark server intentionally has no /play/ update-check endpoint.
    const updateProbes = failedResources.filter(url => new URL(url).pathname === "/play/" && new URL(url).searchParams.has("updateCheck"));
    assert.deepEqual(failedResources.filter(url => !updateProbes.includes(url)),[]);
    fs.writeFileSync(path.join(artifacts,"checks.json"),JSON.stringify({checks,errors,failedResources:[],benchmarkOnlyUpdateProbes:updateProbes},null,2));
  } finally {
    if (client) { await client.send("Browser.close").catch(()=>{}); client.close(); }
    if (session) {
      if (!await waitForProcessExit(session.browserProcess)) {session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}
      await removeBrowserProfile(session.profilePath);
    }
    await server.close();
  }
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
module.exports={run:main};
