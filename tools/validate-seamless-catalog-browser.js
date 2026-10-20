"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const output = path.resolve("release-artifacts/seamless-catalog");
const executablePath = [process.env.CHROME_PATH, process.env.CROWNLANDS_CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(p => p && fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b) => assert.ok(Math.abs(a - b) < .1, `${a} != ${b}`);
async function main() {
  if (!executablePath) throw new Error("Chrome/Chromium is required; set CHROME_PATH.");
  fs.mkdirSync(output, { recursive: true });
  let clock = 100000;
  const server = createMapBenchmarkServer({ clock: () => clock }), address = await server.listen();
  const session = await startBrowserSession(executablePath).catch(async error => { await server.close(); throw error; });
  const cdp = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
  const errors = [], external = [], results = [], areaBytes = [];
  cdp.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
  cdp.on("Network.requestWillBeSent", ({ request }) => { if (!request.url.startsWith(address.url) && !request.url.startsWith("blob:") && !request.url.startsWith("data:")) external.push(request.url); });
  const areas = new Set();
  cdp.on("Network.responseReceived", e => { if (e.response.url.includes("/seamless/areas?")) areas.add(e.requestId); });
  cdp.on("Network.loadingFinished", e => { if (areas.delete(e.requestId)) areaBytes.push(e.encodedDataLength); });
  for (const domain of ["Page", "Runtime", "Network", "Performance", "HeapProfiler"]) await cdp.send(`${domain}.enable`);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  const evaluate = async (fn, arg) => {
    const r = await cdp.send("Runtime.evaluate", { expression: `(${fn.toString()})(${JSON.stringify(arg) || "undefined"})`, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async fn => { const until = Date.now() + 30000; while (Date.now() < until) { if (await evaluate(fn).catch(() => false)) return; await sleep(50); } throw new Error(`Timed out: ${fn}`); };
  const snapshot = () => evaluate(() => seamlessPreview.snapshot());
  const settle = async () => { await sleep(180); await waitFor(() => !seamlessPreview.snapshot().feed.pending && !seamlessPreview.snapshot().assets.pending); await sleep(150); };
  const navigate = async crowded => { await cdp.send("Page.navigate", { url: `${address.url}/__benchmark__/seamless/?catalog=full&crowded=${crowded ? 1 : 0}` }); await sleep(80); await waitFor(() => !!window.seamlessPreview); await settle(); };
  const resize = async (width, height) => { await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); await sleep(100); };
  const rect = selector => evaluate(selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height }; }, selector);
  const click = async (selector, touch = false) => {
    const r = await rect(selector); assert.ok(r && r.width && r.height, `Missing ${selector}`); const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (touch) { await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 0 }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
    else { await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }); await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }); }
    await sleep(150);
  };
  const shot = async name => fs.writeFileSync(path.join(output, name), Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  const bounds = s => { assert.ok(s.feed.sections <= 16 && s.feed.peakSections <= 16); assert.ok(s.assets.full <= 4 && s.assets.peakFull <= 4); assert.ok(s.assets.thumbnails <= 16 && s.assets.peakThumbnails <= 16); assert.ok(s.assets.peakRequests <= 2); assert.ok(s.nodes < 2000); };
  const view = async p => { await evaluate(p => seamlessPreview.view(p.x, p.y, p.zoom), p); await sleep(150); };
  const metrics = async () => { await cdp.send("HeapProfiler.collectGarbage"); return Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value])); };
  try {
    await resize(1440, 900); await navigate(false);
    const initial = await snapshot(); bounds(initial); assert.ok(initial.feed.objects < 8244); assert.equal(initial.feed.failed, false);
    const sections = await evaluate(() => seamlessPreview.scene.sections); assert.equal(sections.length, 81);
    const castle = await evaluate(() => seamlessPreview.scene.objects.find(o => o.kind === "castle" && o.sectionId === seamlessPreview.scene.homeSectionId));
    await view({ x: castle.x, y: castle.y, zoom: initial.camera.zoom * 2 }); await settle();
    await click(`[data-key=${JSON.stringify(castle.key)}]`); assert.equal((await snapshot()).selected, castle.key);
    const owner = await evaluate(() => document.querySelector("#owner").textContent), troops = await evaluate(() => document.querySelector("#troops").textContent), camera = (await snapshot()).camera;
    clock += 5000; await evaluate(() => seamlessPreview.refresh()); await settle();
    assert.notEqual(await evaluate(() => document.querySelector("#owner").textContent), owner);
    assert.notEqual(await evaluate(() => document.querySelector("#troops").textContent), troops);
    assert.deepEqual((await snapshot()).camera, camera, "Updates moved the camera");
    await view({ x: sections.at(-1).x + 724, y: sections.at(-1).y + 543 }); await settle();
    assert.equal((await snapshot()).selected, castle.key); assert.ok(await evaluate(() => document.querySelector("#section").textContent.includes("last received")));
    await view(camera); await settle(); assert.equal((await snapshot()).selected, castle.key);
    assert.ok(!await evaluate(() => document.querySelector("#section").textContent.includes("last received")));
    await shot("selection-and-updates.png");
    // Every join and four-section corner stays continuous, without camera resets.
    let seams = 0, corners = 0;
    for (const s of sections) for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (!sections.some(n => n.gridX === s.gridX + dx && n.gridY === s.gridY + dy)) continue;
      const p = { x: s.x + (dx ? 1448 : 724), y: s.y + (dy ? 1086 : 543), zoom: initial.camera.zoom * 2 };
      for (const sign of [-1, 1]) { await view({ ...p, x: p.x + dx * sign * 3, y: p.y + dy * sign * 3 }); const snap = await snapshot(); near(snap.camera.x, p.x + dx * sign * 3); near(snap.camera.y, p.y + dy * sign * 3); assert.equal(snap.selected, castle.key); bounds(snap); }
      seams++;
    }
    for (let x = 1; x < 9; x++) for (let y = 1; y < 9; y++) { await view({ x: x * 1448, y: y * 1086 }); const s = await snapshot(); near(s.camera.x, x * 1448); near(s.camera.y, y * 1086); assert.equal(s.selected, castle.key); corners++; }
    assert.equal(seams, 144); assert.equal(corners, 64);
    const gaps = await evaluate(() => {
      const tiles = [...document.querySelectorAll(".tile")].map(n => ({ id: n.dataset.section, rect: n.getBoundingClientRect() }));
      return seamlessPreview.scene.sections.flatMap(s => [[1, 0], [0, 1]].map(([dx, dy]) => {
        const n = seamlessPreview.scene.sections.find(n => n.gridX === s.gridX + dx && n.gridY === s.gridY + dy); if (!n) return 0;
        const a = tiles.find(t => t.id === s.id).rect, b = tiles.find(t => t.id === n.id).rect; return dx ? b.left - a.right : b.top - a.bottom;
      }));
    }); assert.ok(Math.max(...gaps) < .01, "Rendering gap between tiles");
    console.log("Full-world browser: all 144 joins, 64 corners, selection retention and synthetic ownership/troop updates passed.");
    await click("#close"); await click("#home"); await settle(); await evaluate(() => seamlessPreview.time(0)); await sleep(180);
    const march = await evaluate(() => { const s = seamlessPreview.snapshot(), v = SeamlessModel.visible(s.camera, s.size); const m = seamlessPreview.scene.marches.find(m => m.position.x > v.left + 100 && m.position.x < v.right - 100 && m.position.y > v.top + 100 && m.position.y < v.bottom - 100); return { key: m.key, points: m.points, length: m.path.length, speed: m.speed, phase: m.phase, sections: m.sections }; });
    await evaluate(key => seamlessPreview.select(key), march.key); await click("#follow");
    for (const fraction of [.1, .9]) { await evaluate(t => seamlessPreview.time(t), (march.length * (2 + fraction) - march.length * march.phase) / march.speed); await settle(); const s = await snapshot(), p = s.marches.find(m => m.key === march.key).position; assert.equal(s.following, march.key); near(s.camera.x, p.x); near(s.camera.y, p.y); }
    await click("#home"); assert.equal((await snapshot()).following, null); await click("#close");
    await click("#fit"); await settle(); const overview = await snapshot(); bounds(overview); assert.equal(overview.feed.sections, 0); assert.equal(overview.assets.full, 0); assert.equal(overview.assets.thumbnails, 0); assert.equal(overview.nodes, 0); await shot("overview-81-sections.png");
    await click("#home"); await settle(); await shot("desktop.png");
    // Actual network disconnect, recovery and a delayed obsolete area request.
    await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaluate(() => seamlessPreview.refresh()); await waitFor(() => seamlessPreview.snapshot().feed.failed);
    const offline = await snapshot(); assert.ok(offline.feed.objects > 0); await click("#plus"); assert.ok((await snapshot()).camera.zoom > offline.camera.zoom);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 200, downloadThroughput: 250000, uploadThroughput: 125000 });
    clock += 5000; await click("#retry"); await waitFor(() => !seamlessPreview.snapshot().feed.failed && !seamlessPreview.snapshot().feed.pending); await settle();
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    let held, releaseHeld; const paused = new Promise(r => { releaseHeld = r; });
    const off = cdp.on("Fetch.requestPaused", async e => { if (!held) { held = e; releaseHeld(); } else await cdp.send("Fetch.continueRequest", { requestId: e.requestId }).catch(() => {}); });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/seamless/areas?*" }] });
    await view({ x: 724, y: 543, zoom: initial.camera.zoom * 2 }); await paused;
    await view({ x: 12308, y: 9231 }); await settle(); const newIds = (await snapshot()).feed.ids;
    await cdp.send("Fetch.continueRequest", { requestId: held.requestId }).catch(() => {}); await sleep(250);
    assert.deepEqual((await snapshot()).feed.ids, newIds); assert.ok(await evaluate(() => seamlessPreview.scene.objects.every(o => seamlessPreview.snapshot().feed.ids.includes(o.sectionId))));
    await cdp.send("Fetch.disable"); off();
    // Native touch pinch/drag and exact selection at both landscape sizes.
    for (const [width, height] of [[844, 390], [568, 320]]) {
      await resize(width, height); await click("#home"); await settle(); const s = await snapshot(), r = await rect("#viewport"), x = s.size.width / 2, y = r.y + s.size.height / 2;
      const touch = (type, gap) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: gap ? [{ x: x - gap, y, id: 0 }, { x: x + gap, y, id: 1 }] : [] });
      await touch("touchStart", 40); await touch("touchMove", 70); await touch("touchEnd", 0); await sleep(160);
      const zoomed = await snapshot(); near(zoomed.camera.x, s.camera.x); near(zoomed.camera.y, s.camera.y); assert.ok(zoomed.camera.zoom > s.camera.zoom * 1.5);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 120, y, id: 0 }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 190, y, id: 0 }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      assert.ok((await snapshot()).camera.x < zoomed.camera.x);
      await view({ x: castle.x, y: castle.y, zoom: s.camera.zoom * 3 }); await settle(); await click(`[data-key=${JSON.stringify(castle.key)}]`, true); assert.equal((await snapshot()).selected, castle.key);
      const inspector = await rect("#inspector"); assert.ok(inspector.y >= 0 && inspector.y + inspector.height <= height); await shot(`landscape-${width}.png`); await click("#close");
      await click("#fit"); await settle();
      assert.ok(await evaluate(() => [...document.querySelectorAll(".tile")].every(n => n.lastChild.getBoundingClientRect().width <= n.getBoundingClientRect().width * .91)), "Overview labels overlap neighboring sections");
      await shot(`overview-${width}.png`);
    }
    console.log("Full-world browser: follow across areas, overview eviction, slow/offline/reconnect, stale request and native landscape touch passed.");
    // Warm every asset, then compare repeated trips after garbage collection.
    await resize(1440, 900); await navigate(true); await evaluate(() => seamlessPreview.time(0));
    const soakSeconds = Math.max(30, Number(process.env.CROWNLANDS_SEAMLESS_SOAK_SECONDS) || 30), samples = [];
    const trip = async () => { for (const s of sections) { await view({ x: s.x + 724, y: s.y + 543, zoom: initial.camera.zoom }); await settle(); bounds(await snapshot()); } await click("#home"); await settle(); await evaluate(() => seamlessPreview.time(0)); await sleep(200); return { snapshot: await snapshot(), metrics: await metrics() }; };
    const baseline = await trip(); samples.push({ at: 0, nodes: baseline.snapshot.nodes, heap: baseline.metrics.JSHeapUsedSize });
    const started = Date.now(); let passes = 0;
    do { const current = await trip(); passes++; const elapsed = (Date.now() - started) / 1000;
      assert.equal(current.snapshot.nodes, baseline.snapshot.nodes); assert.equal(current.snapshot.listeners, baseline.snapshot.listeners);
      for (const key of ["Nodes", "JSEventListeners"]) assert.ok(current.metrics[key] <= baseline.metrics[key] + 20, `${key} grew after world trip`);
      assert.ok(current.metrics.JSHeapUsedSize <= baseline.metrics.JSHeapUsedSize * 1.25 + 1024 * 1024, "Retained heap accumulated");
      samples.push({ at: +elapsed.toFixed(1), nodes: current.snapshot.nodes, heap: current.metrics.JSHeapUsedSize }); console.log(`World soak: ${passes} repeated full-catalog trip(s), ${elapsed.toFixed(0)}s, ${current.snapshot.nodes} home nodes, ${(current.metrics.JSHeapUsedSize / 1048576).toFixed(1)} MiB retained heap.`);
    } while (Date.now() - started < soakSeconds * 1000);
    // Six-second continuous camera motion windows; never claim physical-device FPS.
    for (const [width, height, crowded, rate] of [[1440,900,false,1],[1440,900,true,1],[1440,900,false,4],[1440,900,true,4],[844,390,false,4],[844,390,true,4],[568,320,false,4],[568,320,true,4]]) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate }); await resize(width, height); await navigate(crowded);
      await evaluate(() => { seamlessPreview.resetMetrics(); return new Promise(resolve => { const start = performance.now(), scene = seamlessPreview.scene, home = scene.sections.find(s => s.id === scene.homeSectionId), zoom = SeamlessModel.forWorld(scene).limits(seamlessPreview.snapshot().size).home; function step(now) { const t = (now - start) / 1000; seamlessPreview.view(home.x + 724 + 600 * Math.sin(t * 1.8), home.y + 543 + 400 * Math.cos(t * 1.4), zoom * (.85 + .2 * Math.sin(t * 2))); if (t < 6) requestAnimationFrame(step); else resolve(); } requestAnimationFrame(step); }); });
      const s = await snapshot(), percentile = (xs, p) => [...xs].sort((a,b) => a-b)[Math.floor((xs.length - 1) * p)]; bounds(s); assert.ok(s.frameTimes.length > 50, "Navigation stalled");
      const result = { width, height, crowded, cpuSlowdown: rate, fps: +(1000 * s.frameTimes.length / s.frameTimes.reduce((a,b) => a+b,0)).toFixed(1), frameP50: +percentile(s.frameTimes,.5).toFixed(1), frameP95: +percentile(s.frameTimes,.95).toFixed(1), frameMax: +Math.max(...s.frameTimes).toFixed(1), workP95: +percentile(s.workTimes,.95).toFixed(1), nodes: s.nodes, areas: s.feed.sections, objects: s.feed.objects, marches: s.feed.marches, assets: s.assets }; results.push(result);
      console.log(`Full catalog ${width}×${height} ${crowded ? "crowded" : "normal"} ${rate}x CPU: ${result.fps} FPS, p95 ${result.frameP95}ms, work p95 ${result.workP95}ms.`);
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ measuredAt: new Date().toISOString(), browser: (await cdp.send("Browser.getVersion")).product, sections: 81, cities: 3720, seams, corners, soak: { requestedSeconds: soakSeconds, passes, samples }, performance: results, maxAreaResponseBytes: Math.max(...areaBytes), errors, externalRequests: external, limitation: "Synthetic private fixtures and headless CPU slowdown, not physical-phone, production bandwidth, active-map count or multiplayer capacity." }, null, 2) + "\n");
    console.log("Full catalog browser checks passed; report and screenshots saved to release-artifacts/seamless-catalog.");
  } finally {
    await cdp.send("Browser.close").catch(() => {}); cdp.close(); if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill("SIGKILL"); await waitForProcessExit(session.browserProcess); }
    await removeBrowserProfile(session.profilePath); await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
