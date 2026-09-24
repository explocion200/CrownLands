"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { createMapBenchmarkServer } = require("./map-benchmark/server.js");
const { CORE_EXPANSION_RUNTIME_BUDGET } = require("./map-benchmark/budgets.js");
const { bounded, sourceIdentity, isProductionBackendUrl } = require("./stability-audit-runtime.js");
const root = process.env.CROWNLANDS_BENCHMARK_ROOT
  ? path.resolve(process.env.CROWNLANDS_BENCHMARK_ROOT) : path.resolve(__dirname, "..");
const argument = (name, fallback) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const output = path.resolve(root, argument("output-directory", `release-artifacts/stability-soak/${new Date().toISOString().replace(/[:.]/g, "-")}`));
const minutesOverride = argument("minutes", "");
const parallel = process.argv.includes("--parallel");
const profiles = [
  { id: "desktop", width:1440, height:900, cpuRate:1, minutes:60 },
  { id: "mobile", width:844, height:390, cpuRate:1, minutes:60 },
  { id: "mobile-4x", width:844, height:390, cpuRate:4, minutes:30 },
];
const delay = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

async function runProfile(profile, address) {
  const minutes = minutesOverride === "" ? profile.minutes : Number(minutesOverride);
  if (!Number.isFinite(minutes) || minutes <= 0) throw Error("Soak minutes must be positive.");
  const result = { ...profile, requestedMinutes: minutes, status: "failed", samples: [], batches: [], errors: [],
    productionBackendRequests: 0, limits: { expectedListeners: CORE_EXPANSION_RUNTIME_BUDGET.activeListeners },
    limitation: "Lifecycle calls use synthetic transport. No physical-device or real Firebase recovery is claimed." };
  let browser;
  const checkpoint = () => fs.writeFile(path.join(output, `${profile.id}.json`), JSON.stringify(result, null, 2));
  try {
    browser = await chromium.launch({ channel:"chrome", headless:true });
    const context = await browser.newContext({viewport:{width:profile.width,height:profile.height},hasTouch:profile.height<600});
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const evaluate = callback => bounded(page.evaluate(callback),180000,"Soak browser action");
    await cdp.send("Emulation.setCPUThrottlingRate", {rate:profile.cpuRate});
    page.on("pageerror", error => result.errors.push(error.message));
    page.on("crash", () => result.errors.push("Renderer crashed"));
    await page.route("**/*", route => {
      if (isProductionBackendUrl(route.request().url())) {
        result.productionBackendRequests++; return route.abort();
      }
      return route.continue();
    });
    await page.goto(`${address.url}/__benchmark__/?scenario=A`, {waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.documentElement.dataset.crownlandsBenchmarkReady === "true", null, {timeout:120000});
    result.status="running";
    result.browser = browser.version();
    // Populate the same region/modal caches before taking comparable retained-heap samples.
    await evaluate(async()=>{const a=window.__CROWNLANDS_BENCHMARK__;await a.switchNeighborAndReturn();await a.selectAndOpenCities(2);});
    await delay(1000);
    const start = Date.now();
    async function sample() {
      await bounded(cdp.send("HeapProfiler.collectGarbage"),30000,"Garbage collection");
      const heap = await bounded(cdp.send("Runtime.getHeapUsage"),30000,"Retained heap sample");
      const metrics = await evaluate(()=>window.__CROWNLANDS_BENCHMARK__.getMetrics());
      result.samples.push({atMs:Date.now()-start,heapBytes:heap.usedSize,dom:metrics.dom,
        timers:metrics.timers,listeners:metrics.realtime.listeners,runtimeErrors:metrics.diagnostics.runtimeErrors});
      await checkpoint();
    }
    await sample();
    for (let batch=0;batch<10;batch++) {
      const actions = { modalCycles: 0, timings: [] };
      // Bound each action independently: a slow CPU must not exhaust a watchdog shared by ten dialogs.
      let actionStart = Date.now();
      actions.lifecycle = await evaluate(()=>window.__CROWNLANDS_BENCHMARK__.runLifecycleCycles({mapSwitches:5,foregroundCycles:2,reconnectCycles:1}));
      actions.timings.push({ name: "lifecycle", durationMs: Date.now()-actionStart });
      for(let modal=0;modal<10;modal++) {
        actionStart=Date.now();
        await bounded(page.evaluate(()=>window.__CROWNLANDS_BENCHMARK__.selectAndOpenCities(1)),60000,"Open and close city dialog");
        actions.modalCycles++;
        actions.timings.push({ name: "city-dialog", durationMs: Date.now()-actionStart });
      }
      await context.setOffline(true);
      await evaluate(()=>window.dispatchEvent(new Event("offline")));
      await delay(minutesOverride === "" ? 30000 : 1000);
      await context.setOffline(false);
      await evaluate(()=>window.dispatchEvent(new Event("online")));
      actions.offlineRecovery=await evaluate(()=>window.__CROWNLANDS_BENCHMARK__.runOfflineRecoveryCheck());
      result.batches.push(actions);
      await delay(start+minutes*60000*(batch+1)/10-Date.now());
      await sample();
      console.log(`${profile.id}: batch ${batch+1}/10, ${((Date.now()-start)/60000).toFixed(1)} minutes`);
    }
    result.elapsedMs=Date.now()-start;
    const half=result.samples.filter(s=>s.atMs>=result.elapsedMs/2);
    const first=half[0],last=half.at(-1);
    const heapGrowth=last.heapBytes-first.heapBytes;
    const heapLimit=Math.max(10*1024*1024,first.heapBytes*.1);
    const baseline=result.samples[0];
    result.acceptance={
      duration:result.elapsedMs>=minutes*60000,
      actions:result.batches.length===10&&result.batches.every(b=>b.lifecycle.passed&&b.offlineRecovery.passed
        &&b.lifecycle.switchesCompleted===5&&b.lifecycle.foregroundCompleted===2&&b.lifecycle.reconnectsCompleted===1&&b.modalCycles===10),
      runtime:result.errors.length===0&&result.samples.every(s=>s.runtimeErrors.length===0),
      isolation:result.productionBackendRequests===0,
      listeners:result.samples.every(s=>s.listeners.active===result.limits.expectedListeners&&s.listeners.duplicates.length===0),
      intervals:result.samples.every(s=>s.timers.activeIntervals===baseline.timers.activeIntervals),
      heap:heapGrowth<=heapLimit,
    };
    result.retainedHeap={growthBytes:heapGrowth,limitBytes:heapLimit,lastHalfSampleCount:half.length};
    result.status=Object.values(result.acceptance).every(Boolean)?"passed":"failed";
  } catch(error) {result.status="failed";result.error=error.message;}
  finally {if(browser)await browser.close();await checkpoint();}
  return result;
}

async function main(){
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
  const source=sourceIdentity(root);
  source.harness=sourceIdentity(path.resolve(__dirname,".."));
  const server=createMapBenchmarkServer(),address=await server.listen();let results;
  try {
    const selected=argument("profiles",profiles.map(p=>p.id).join(",")).split(",");
    if(selected.some(id=>!profiles.some(p=>p.id===id)))throw Error("Unknown soak profile");
    const chosen=profiles.filter(p=>selected.includes(p.id));
    results=parallel?await Promise.all(chosen.map(p=>runProfile(p,address))):[];
    if(!parallel)for(const p of chosen)results.push(await runProfile(p,address));
  }finally{await server.close();}
  source.inputsUnchanged=source.inputDigest===sourceIdentity(root).inputDigest
    && source.harness.inputDigest===sourceIdentity(path.resolve(__dirname,"..")).inputDigest;
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),source,parallel,shortProbe:minutesOverride!=="",
    note:parallel?"Concurrent lifecycle/memory stress; these are not reference frame-rate measurements.":"Sequential lifecycle/memory soak.",results};
  await fs.writeFile(path.join(output,"soak.json"),JSON.stringify(report,null,2));
  process.exitCode=source.inputsUnchanged&&results.every(r=>r.status==="passed")?0:1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
