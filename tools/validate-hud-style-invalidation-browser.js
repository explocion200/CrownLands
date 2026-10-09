"use strict";

const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const measureOnly = process.argv.includes("--measure-only");

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "A Chromium browser is required.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise:true, returnByValue:true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await client.send("Emulation.setDeviceMetricsOverride", {width:568,height:320,deviceScaleFactor:1,mobile:false});
    await client.send("Page.navigate", {url:address.url+"/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick"});
    let ready = false;
    for (let i=0;i<300;i++) { if (await evaluate("document.documentElement?.dataset.crownlandsBenchmarkReady==='true'")) { ready=true;break; } await delay(100); }
    assert(ready, "HUD fixture must become ready.");
    await evaluate("__CROWNLANDS_BENCHMARK__.closeModal();combatTimers.hidden=false;getComputedStyle(goldText).color");
    await client.send("Tracing.start", {
      categories:"devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline",
      transferMode:"ReturnAsStream",
    });
    // Force a style flush after each ordinary HUD text update. This gives a
    // deterministic invalidation check without claiming production frame rates.
    await evaluate(`(() => {
      getComputedStyle(goldText).color;
      performance.mark('hud-style-refresh:start');
      for(let i=0;i<10;i++){goldText.textContent=String(500000+i);getComputedStyle(goldText).color;}
      performance.mark('hud-style-refresh:end');
    })()`);
    const completed = new Promise(resolve => { const remove=client.on("Tracing.tracingComplete", event=>{remove();resolve(event);}); });
    await client.send("Tracing.end");
    const event = await completed;assert(event.stream, "Chromium must return its invalidation trace.");
    let data="";
    while(true){const chunk=await client.send("IO.read",{handle:event.stream});data+=chunk.base64Encoded?Buffer.from(chunk.data,"base64").toString("utf8"):chunk.data||"";if(chunk.eof)break;}
    await client.send("IO.close",{handle:event.stream});
    const trace=JSON.parse(data);
    const start=trace.traceEvents.find(e=>e.name==='hud-style-refresh:start'),end=trace.traceEvents.find(e=>e.name==='hud-style-refresh:end');
    assert(start&&end,"The trace must contain the synchronous measurement boundaries.");
    const updates=trace.traceEvents.filter(e=>e.name==="UpdateLayoutTree"&&e.ts>=start.ts&&e.ts<=end.ts);
    const measurement={forcedTextUpdates:10,styleUpdateCount:updates.length,
      styleMs:updates.reduce((sum,e)=>sum+(e.dur||0)/1000,0),
      largestStyleUpdate:Math.max(0,...updates.map(e=>e.args?.elementCount||e.args?.beginData?.elementCount||e.args?.data?.elementCount||0))};
    const output=path.resolve(__dirname,"../release-artifacts/hud-style-health");fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,measureOnly?"before.json":"after.json"),JSON.stringify({measurement,updates},null,2));
    console.log(JSON.stringify(measurement));
    assert(measurement.styleUpdateCount>=10&&measurement.largestStyleUpdate>0,"Chromium must measure the forced style updates.");
    if(!measureOnly)assert(measurement.largestStyleUpdate<250,"HUD text updates must keep style work within the small HUD subtree, not the whole page: "+JSON.stringify(measurement));
    // The compact arrangement must follow timer and both alert visibility,
    // including transitions between states without a reload.
    for(const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      const layouts=await evaluate(`(() => {
        const nav=document.querySelector('.bottom-nav'), incoming=document.getElementById('incomingAttackBtn'),outgoing=document.getElementById('outgoingAttackBtn');
        return [[false,false,false],[true,true,true],[false,true,true],[true,false,true],[true,true,false],[true,true,true]].map(([timers,incomingVisible,outgoingVisible])=>{
          combatTimers.hidden=!timers;incoming.hidden=!incomingVisible;outgoing.hidden=!outgoingVisible;
          const style=getComputedStyle(nav);
          return {timers,incomingVisible,outgoingVisible,width:style.getPropertyValue('--cl-operation-button-width').trim(),display:style.display,
            incomingRow:getComputedStyle(incoming).gridRowStart,outgoingRow:getComputedStyle(outgoing).gridRowStart,reportsRow:getComputedStyle(logBtn).gridRowStart};
        });
      })()`);
      for(const layout of layouts) {
        const compact=height<=360&&layout.timers&&layout.incomingVisible&&layout.outgoingVisible;
        assert.equal(layout.width==="92px",compact,JSON.stringify({width,height,layout}));
        if(compact)assert.deepEqual([layout.display,layout.incomingRow,layout.outgoingRow,layout.reportsRow],["grid","1","1","2"]);
      }
    }
    assert.deepEqual(errors,[]);
    console.log(measureOnly?"HUD invalidation baseline recorded; visibility layouts passed.":"HUD invalidation and desktop/landscape alert visibility layouts passed.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
