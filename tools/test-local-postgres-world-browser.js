"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createStageThreeServer } = require("./map-benchmark/seamless/stage-three-server");
const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
const output = path.resolve("release-artifacts/seamless-stage-three"), sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  assert.ok(executable, "Chrome is required"); fs.mkdirSync(output, { recursive: true });
  const servers = [await createStageThreeServer({ scripted: false }), await createStageThreeServer({ crowded: true, scripted: false })];
  let session, cdp;
  try {
    const addresses = [await servers[0].listen(), await servers[1].listen()];
    session = await startBrowserSession(executable); cdp = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    for (const domain of ["Page", "Runtime", "Network", "Performance", "HeapProfiler"]) await cdp.send(domain + ".enable");
    const errors = [], external = [], performanceResults = [], payloads = [], ids = new Map();
    cdp.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    cdp.on("Network.requestWillBeSent", ({ request }) => { if (!addresses.some(a => request.url.startsWith(a.url + "/")) && !/^(blob:|data:)/.test(request.url)) external.push(request.url); });
    cdp.on("Network.responseReceived", e => { if (e.response.url.includes("/changes?")) ids.set(e.requestId, e.response.url.includes("revision=") ? "delta-request" : "snapshot-request"); });
    cdp.on("Network.loadingFinished", e => { if (ids.has(e.requestId)) { payloads.push({ kind: ids.get(e.requestId), bytes: e.encodedDataLength }); ids.delete(e.requestId); } });
    const evaluate = async (fn, arg) => {
      const result = await cdp.send("Runtime.evaluate", { expression: `(${fn.toString()})(${JSON.stringify(arg) || "undefined"})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value;
    };
    const waitFor = async predicate => { const until = Date.now() + 30000; while (Date.now() < until) { if (await evaluate(predicate).catch(() => false)) return; await sleep(40); } throw Error("Timed out: " + predicate); };
    const snapshot = () => evaluate(() => seamlessPreview.snapshot());
    const settle = async () => { await sleep(180); await waitFor(() => window.seamlessPreview && !seamlessPreview.snapshot().feed.pending && !seamlessPreview.snapshot().assets.pending && !seamlessPreview.snapshot().assets.queued); await sleep(150); };
    const rect = selector => evaluate(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, selector);
    const click = async selector => { const r = await rect(selector); assert.ok(r.width > 0 && r.height > 0, "Control is not visible: " + selector); const x = r.x + r.width / 2, y = r.y + r.height / 2; await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await sleep(100); };
    const resize = async (width, height) => { await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); await sleep(100); };
    const shot = async name => fs.writeFileSync(path.join(output, name), Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    const login = async index => {
      await cdp.send("Page.navigate", { url: addresses[index].entry });
      await waitFor(() => document.readyState === "complete");
      if (await evaluate(() => !!document.getElementById("test-login"))) {
        await evaluate(c => { document.getElementById("email").value = c.email; document.getElementById("password").value = c.password; }, servers[index].credentials[0]);
        await click("#test-login button");
      }
      await waitFor(() => window.seamlessPreview && seamlessPreview.snapshot().feed.objects > 0); await settle();
    };
    const bounds = s => { assert.ok(s.assets.full <= 4); assert.ok(s.assets.thumbnails <= 16); assert.ok(s.assets.pending <= 2); assert.ok(s.feed.sections <= 16); };
    await resize(1440, 900); await login(0); const initial = await snapshot(); bounds(initial);
    const castle = await evaluate(() => { const s = seamlessPreview.scene, h = s.sections.find(section => section.id === s.homeSectionId); return s.objects.find(o => o.kind === "castle" && o.sectionId === h.id); });
    await evaluate(o => seamlessPreview.view(o.x, o.y), castle); await settle(); await click(`[data-key=${JSON.stringify(castle.key)}]`);
    assert.equal((await snapshot()).selected, castle.key);
    const beforeUpdateCamera = (await snapshot()).camera;
    const row = servers[0].realm.initial.find(r => r.key === castle.key);
    await servers[0].realm.change([{ key: row.key, row: { ...row, body: { ...row.body, owner: "Updated owner · sample", troops: 24680 } } }]);
    await evaluate(() => seamlessPreview.refresh()); await settle(); assert.equal((await snapshot()).selected, castle.key);
    assert.equal(await evaluate(() => document.getElementById("owner").textContent), "Updated owner · sample");
    assert.deepEqual((await snapshot()).camera, beforeUpdateCamera);
    await shot("desktop-authenticated.png");
    // Selection survives eviction; authoritative deletion inside the area clears it.
    await evaluate(() => seamlessPreview.view(724, 543)); await settle(); assert.equal((await snapshot()).selected, castle.key);
    await evaluate(o => seamlessPreview.view(o.x, o.y), castle); await settle();
    await servers[0].realm.change([{ key: row.key }]); await evaluate(() => seamlessPreview.refresh()); await settle();
    assert.equal((await snapshot()).selected, null); assert.equal(await evaluate(() => document.getElementById("inspector").hidden), true);
    await servers[0].realm.change([{ key: row.key, row }]); await evaluate(() => seamlessPreview.refresh()); await settle();
    await click(`[data-key=${JSON.stringify(castle.key)}]`); assert.equal((await snapshot()).selected, castle.key);
    await evaluate(() => seamlessPreview.view(724, 543)); await settle();
    await servers[0].realm.change([{ key: row.key }]);
    assert.equal((await snapshot()).selected, castle.key, "Unloaded selection should retain last-received details");
    await evaluate(o => seamlessPreview.view(o.x, o.y), castle); await settle();
    assert.equal((await snapshot()).selected, null, "Returning snapshot must clear a selected city deleted while unloaded");
    await servers[0].realm.change([{ key: row.key, row }]); await evaluate(() => seamlessPreview.refresh()); await settle();
    // Authenticated march interpolation and following cross a section join.
    const march = await evaluate(() => seamlessPreview.scene.marches[0]);
    await evaluate(m => { seamlessPreview.view(m.position.x, m.position.y); seamlessPreview.select(m.key); }, march); await settle(); await click("#follow");
    for (const fraction of [.2, .8]) {
      await evaluate(({ m, fraction }) => seamlessPreview.time((m.path.length * fraction - m.path.length * m.phase) / m.speed), { m: march, fraction }); await sleep(200);
      const s = await snapshot(), p = s.marches.find(m => m.key === march.key).position;
      assert.equal(s.following, march.key); assert.ok(Math.abs(s.camera.x - p.x) < .1 && Math.abs(s.camera.y - p.y) < .1);
    }
    const marchRow = servers[0].realm.initial.find(r => r.key === march.key);
    await servers[0].realm.change([{ key: march.key, row: { ...marchRow, viewers: ["sample-alder"] } }]); await evaluate(() => seamlessPreview.refresh()); await settle();
    assert.equal((await snapshot()).following, null); assert.equal((await snapshot()).selected, null);
    await evaluate(() => seamlessPreview.time(null)); await click("#home"); await settle();
    // Overview drops all datasets. Returning requires a snapshot, not a delta
    // applied to an empty cache (a regression specific to resumable feeds).
    await click("#fit"); await settle(); assert.equal((await snapshot()).feed.objects, 0);
    await click("#home"); await settle(); assert.ok((await snapshot()).feed.objects > 0);
    const beforeOffline = (await snapshot()).feed.snapshots;
    await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaluate(() => seamlessPreview.refresh()); await waitFor(() => seamlessPreview.snapshot().feed.failed);
    assert.ok((await snapshot()).feed.objects > 0);
    await servers[0].realm.tick(2);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 200, downloadThroughput: 250000, uploadThroughput: 125000 });
    await click("#retry"); await waitFor(() => !seamlessPreview.snapshot().feed.failed); await settle(); assert.equal((await snapshot()).feed.snapshots, beforeOffline);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    for (const [width, height] of [[844, 390], [568, 320]]) {
      await resize(width, height); await click("#home"); await settle();
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
      const r = await rect("#viewport"), s = await snapshot(), x = r.width / 2, y = r.y + r.height / 2;
      const touch = (type, gap) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: gap ? [{ id: 0, x: x - gap, y }, { id: 1, x: x + gap, y }] : [] });
      await touch("touchStart", 40); await touch("touchMove", 65); await touch("touchEnd", 0); await settle();
      assert.ok((await snapshot()).camera.zoom > s.camera.zoom * 1.5); assert.ok(Math.abs((await snapshot()).camera.x - s.camera.x) < .1);
      await evaluate(o => seamlessPreview.view(o.x, o.y), castle); await settle(); await click(`[data-key=${JSON.stringify(castle.key)}]`);
      const inspector = await rect("#inspector"); assert.ok(inspector.y + inspector.height <= height);
      assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await shot(`landscape-${width}.png`); await click("#close");
    }
    // Repeat area eviction/loading and check retained heap, DOM and listeners.
    await resize(1440, 900); const samples = [];
    for (let pass = 0; pass < 4; pass++) {
      for (const [x, y] of [[724,543],[12308,543],[12308,9231],[724,9231]]) { await evaluate(p => seamlessPreview.view(...p), [x,y]); await settle(); bounds(await snapshot()); }
      await click("#home"); await settle(); await cdp.send("HeapProfiler.collectGarbage");
      const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name,m.value]));
      samples.push({ nodes: metrics.Nodes, listeners: metrics.JSEventListeners, heap: metrics.JSHeapUsedSize });
    }
    assert.ok(samples.at(-1).nodes <= samples[0].nodes + 100); assert.ok(samples.at(-1).listeners <= samples[0].listeners + 5); assert.ok(samples.at(-1).heap <= samples[0].heap * 1.25 + 1048576);
    for (const [width,height,crowded,rate] of [[1440,900,false,1],[1440,900,true,1],[1440,900,false,4],[1440,900,true,4],[844,390,false,4],[844,390,true,4],[568,320,false,4],[568,320,true,4]]) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate }); await resize(width,height); await login(crowded ? 1 : 0); await click("#home"); await settle();
      await evaluate(() => { seamlessPreview.time(null); seamlessPreview.resetMetrics(); return new Promise(resolve => { const start=performance.now(), home=seamlessPreview.scene.sections.find(s=>s.id===seamlessPreview.scene.homeSectionId), zoom=SeamlessModel.forWorld(seamlessPreview.scene).limits(seamlessPreview.snapshot().size).home;
        function frame(now) { const t=(now-start)/1000; seamlessPreview.view(home.x+724+600*Math.sin(t*1.8),home.y+543+400*Math.cos(t*1.4),zoom*(.85+.2*Math.sin(t*2))); if(t<6) requestAnimationFrame(frame); else resolve(); } requestAnimationFrame(frame); }); });
      const s=await snapshot(), sorted=[...s.frameTimes].sort((a,b)=>a-b); bounds(s); assert.ok(sorted.length>50);
      const result={width,height,crowded,cpuSlowdown:rate,fps:+(1000*sorted.length/sorted.reduce((a,b)=>a+b,0)).toFixed(1),frameP95:+sorted[Math.floor(sorted.length*.95)].toFixed(1),nodes:s.nodes,areas:s.feed.sections,marches:s.feed.marches}; performanceResults.push(result);
      console.log(`Authenticated preview ${width}×${height} ${crowded?'crowded':'normal'} ${rate}x: ${result.fps} FPS, p95 ${result.frameP95}ms.`);
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate:1 }); await login(0);
    await servers[0].store.pool.query(`DELETE FROM ${servers[0].store.schema}.auth_sessions`);
    await evaluate(() => seamlessPreview.refresh()); await waitFor(() => seamlessPreview.snapshot().feed.authExpired);
    assert.equal((await snapshot()).feed.objects,0); assert.equal((await snapshot()).feed.marches,0); assert.equal((await snapshot()).selected,null);
    await waitFor(() => !document.getElementById("retry").hidden && document.getElementById("retry").textContent === "Sign in");
    await click("#retry"); await waitFor(() => !!document.getElementById("test-login"));
    assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
    fs.writeFileSync(path.join(output,"report.json"),JSON.stringify({measuredAt:new Date().toISOString(),browser:(await cdp.send("Browser.getVersion")).product,performance:performanceResults,payloads,retention:samples,errors,externalRequests:external,limitation:"Temporary authenticated PostgreSQL fixture realm, conservative sample army permissions, headless synthetic CPU slowdown. No production realm, physical-phone measurement or full multiplayer capacity claim."},null,2)+"\n");
    console.log("Authenticated browser passed: sign-in, incremental ownership, authoritative deletion, follow/visibility loss, overview restoration, disconnected delta resume, landscape touch, bounded repeated area visits and revocation.");
  } finally {
    if(cdp){await cdp.send("Browser.close").catch(()=>{});cdp.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill("SIGKILL");await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    for(const server of servers) await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
