"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), { execFileSync } = require("node:child_process");
const { setup, crowded } = require("./validate-halloween-troop-skin-browser");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function precisionChecks() {
  const qa = __troopQA, check = (ok, message) => { if (!ok) throw Error(message); };
  getArmyClockNowMs = () => qa.clock;
  const savedZoom = zoom;
  let writes = 0, largestError = 0;
  for (const testZoom of [.4, 1.1, 2.5]) {
    zoom = testZoom; centerOnWorldPoint({ x:qa.cx, y:qa.cy }); qa.clock = qa.now; const token = qa.render();
    const observer = new MutationObserver(() => {});
    observer.observe(token, { attributes: true, attributeFilter: ["style"] });
    for (let n = 1; n <= 144; n++) {
      qa.clock = qa.now + n * 1000 / 144;
      renderVisibleArmyMotion();
      const motion = visibleArmyMotion.get(qa.base.id), parts = getArmyTokenParts(token);
      const exact = worldToMapPoint(getMissionPointAtProgress(motion.army, getArmyTravelProgress(motion.army, qa.clock)).point);
      check(Math.abs(exact.x - motion.point.x) < 1e-9 && Math.abs(exact.y - motion.point.y) < 1e-9, "Exact route state must remain unrounded");
      const error = Math.max(Math.abs(parts.x-exact.x), Math.abs(parts.y-exact.y)) * zoom * devicePixelRatio;
      largestError = Math.max(largestError, error);
      check(error <= .125001, "Display error exceeds one eighth of a device pixel per axis");
    }
    const count = observer.takeRecords().length; writes += count;
    check(count < 144 / 2, "Slow marches must avoid redundant style writes at every zoom");
    renderVisibleArmyMotion(); renderVisibleArmyMotion();
    check(observer.takeRecords().length === 0, "Unchanged position must not rewrite transforms");
    observer.disconnect();
  }
  zoom = savedZoom; centerOnWorldPoint({ x:qa.cx, y:qa.cy }); qa.clock = qa.now;
  // Fast routes, Swift March, recall and region handoff still use the same clock.
  for (const patch of [
    { launchedAtMs:qa.now-100, arrivesAtMs:qa.now+100 },
    { swiftMarchUsedAtMs:qa.now-1000, swiftMarchProgressAtUse:.3, arrivesAtMs:qa.now+1000 },
    { returning:true, recalledAtMs:qa.now-1000, returnStartProgress:.7, arrivesAtMs:qa.now+1000 },
  ]) {
    qa.render(patch);
    const motion = visibleArmyMotion.get(qa.base.id), exact = worldToMapPoint(getMissionPointAtProgress(motion.army,getArmyTravelProgress(motion.army,qa.clock)).point);
    check(Math.abs(motion.point.x-exact.x)<1e-9, "Speed changes and recalls must adopt authoritative positions");
  }
  const token = qa.render(), motion = visibleArmyMotion.get(qa.base.id);
  motion.segments = [{ regionId: "other-region", points:[{x:0,y:0},{x:100,y:0}],length:100 }];
  renderVisibleArmyMotion(); check(token.hidden,"March leaving this region must hide");
  qa.render(); check(!token.hidden,"March entering this region must show");
  return { sampledFrames:432, transformWrites:writes, maxDevicePixelError:largestError };
}

async function coveredChecks() {
  const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
  const original = renderVisibleArmyMotion; let calls = 0;
  renderVisibleArmyMotion = (...args) => { calls++; return original(...args); };
  try {
    for (const cover of ["profile", "modal", "hidden"]) {
      if (cover === "profile") profileScreen.classList.add("open");
      if (cover === "modal") modal.showModal();
      if (cover === "hidden") Object.defineProperty(document,"hidden",{configurable:true,value:true});
      calls = 0; await wait(350);
      if (calls !== 0) throw Error("Covered map still updates troop positions: " + cover);
      profileScreen.classList.remove("open"); modal.close(); delete document.hidden;
      __troopQA.clock += 1000;
      for (let n=0;n<20&&!calls;n++) await wait(100);
      if (!calls) throw Error("Troops did not resume after " + cover + " " + JSON.stringify({hidden:document.hidden,profile:profileScreen.className,modal:modal.open,state:!!state,lastFrameTime,now:performance.now()}));
      const motion = visibleArmyMotion.get(__troopQA.base.id);
      const exact = worldToMapPoint(getMissionPointAtProgress(motion.army,getArmyTravelProgress(motion.army,__troopQA.clock)).point);
      if (Math.abs(motion.point.x-exact.x)>1e-9) throw Error("Resume must catch up to the current clock");
    }
    return { profile:true, modal:true, hidden:true, resumesAtCurrentPosition:true };
  } finally { renderVisibleArmyMotion = original; profileScreen.classList.remove("open"); modal.close(); delete document.hidden; }
}

async function main() {
  const root = path.resolve(__dirname,".."), out = path.join(root,"release-artifacts/march-frame-performance");
  fs.mkdirSync(out,{recursive:true});
  const baselineIndex = process.argv.indexOf("--baseline"), baseline = baselineIndex < 0 ? "" : process.argv[baselineIndex+1];
  let baselineSource = "";
  if (baseline) {
    // Optional local comparison only; CI has no dependency on historical Git objects.
    const source = execFileSync("git",["show",baseline+":game.js"],{cwd:root,encoding:"utf8",maxBuffer:8*1024*1024});
    baselineSource = ["frame","updateArmyTokenElement","renderArmiesUncached","renderVisibleArmyMotion"].map(name => {
      const start = source.indexOf("function "+name+"("), end = source.indexOf("\nfunction ",start+1);
      assert(start>=0 && end>start,"Missing baseline function " + name);
      return source.slice(start,end);
    }).join("\n");
  }
  const server = createMapBenchmarkServer(), address = await server.listen(); let session,client;
  const errors=[], checks=[], samples=[];
  try {
    const browser=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));
    session=await startBrowserSession(browser); client=await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
    await Promise.all(["Runtime.enable","Page.enable","Performance.enable"].map(m=>client.send(m)));
    client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
    client.on("Runtime.consoleAPICalled",e=>{if(e.type==="warning"||e.type==="error"){const message=e.args.map(a=>a.description||a.value).join(" ");errors.push(message);console.error(message);}});
    const evaluate=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    const metrics=async()=>Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map(m=>[m.name,m.value]));
    const load=async()=>{
      await client.send("Emulation.setCPUThrottlingRate",{rate:1});
      await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});
      for(let n=0;n<400&&!await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");n++)await delay(100);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"),"ready");
      await evaluate("("+setup.toString()+")()"); await delay(500);
      // This fixture defaults to legacy local economy. Isolate the production online
      // render path identically in both versions; all network APIs remain local mocks.
      await evaluate("usesServerEconomyAuthority=()=>true;usesServerArmyAuthority=()=>true");
    };
    for (const [width,height,dpr] of [[1440,900,1],[844,390,2]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:dpr,mobile:false});
      await load();
      const precision=await evaluate("("+precisionChecks.toString()+")()");
      const covered=await evaluate("("+coveredChecks.toString()+")()");
      checks.push({width,height,dpr,precision,covered});
      // Optional A/B measurements use identical content, authority, camera and CPU.
      // Preserve real crowded-map safeguards instead of forcing animation on.
      if (!baseline) continue;
      for (const rate of [1,4]) for (const skin of [false,true]) for (const version of [baseline,"current"]) {
        await load();
        if(version!=="current") await evaluate(baselineSource);
        await evaluate("cosmeticState=COSMETIC_CATALOG.normalize({owned:{halloween_troops:true}})");
        const population=await evaluate("("+crowded.toString()+")("+skin+")");
        await delay(500); await client.send("Emulation.setCPUThrottlingRate",{rate}); await delay(250);
        const before=await metrics();
        const frames=await evaluate("new Promise(resolve=>{let last=performance.now(),start=last;const times=[];function tick(now){times.push(now-last);last=now;if(now-start<4000)requestAnimationFrame(tick);else resolve({elapsed:now-start,times:times.slice(1).sort((a,b)=>a-b)})}requestAnimationFrame(tick)})");
        const after=await metrics();
        samples.push({width,height,dpr,rate,skin,version,...population,elapsedMs:frames.elapsed,frames:frames.times.length,p95Ms:frames.times[Math.floor(frames.times.length*.95)],taskMs:(after.TaskDuration-before.TaskDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,styleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000});
        console.log(JSON.stringify(samples.at(-1)));
      }
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,"validation.json"),JSON.stringify({baseline,checks,samples,errors},null,2)+"\n");
    console.log("March frame performance checks passed: bounded pixel error, fewer mutations and covered-map resume.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
