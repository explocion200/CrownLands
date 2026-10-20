"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const output = path.resolve("release-artifacts/seamless-world");
const near = (a, b, tolerance = 0.05) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const executablePath = [process.env.CHROME_PATH, process.env.CROWNLANDS_CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(p => p && fs.existsSync(p));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  if (!executablePath) throw new Error("Chrome/Chromium is required; set CHROME_PATH to its executable.");
  fs.mkdirSync(output, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  const session = await startBrowserSession(executablePath).catch(async error => { await server.close(); throw error; });
  const cdp = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
  const errors = [], external = [], results = [];
  cdp.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
  cdp.on("Network.requestWillBeSent", ({ request }) => { if (!request.url.startsWith(address.url) && !request.url.startsWith("blob:") && !request.url.startsWith("data:")) external.push(request.url); });
  for (const domain of ["Page", "Runtime", "Network", "Performance", "HeapProfiler"]) await cdp.send(`${domain}.enable`);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  const evaluate = async (fn, arg) => {
    const result = await cdp.send("Runtime.evaluate", { expression: `(${fn.toString()})(${JSON.stringify(arg) || "undefined"})`, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async fn => { const until = Date.now() + 20000; while (Date.now() < until) { if (await evaluate(fn).catch(() => false)) return; await sleep(40); } throw new Error(`Timed out: ${fn}`); };
  const snapshot = () => evaluate(() => seamlessPreview.snapshot());
  const nextFrame = () => evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const settle = async () => { await nextFrame(); await waitFor(() => seamlessPreview.snapshot().assets.pending === 0); await nextFrame(); };
  const resize = async ({ width, height, deviceScaleFactor = 1 }) => { await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false }); await sleep(50); };
  const navigate = async url => { await cdp.send("Page.navigate", { url }); await sleep(80); await waitFor(() => !!window.seamlessPreview); };
  const rect = selector => evaluate(selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; }, selector);
  const screenshot = async name => { const image = await cdp.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(output, name), Buffer.from(image.data, "base64")); };
  let mouseX = 0, mouseY = 0, mouseDown = false;
  const mouse = {
    async move(x, y, { steps = 1 } = {}) { const fromX = mouseX, fromY = mouseY; for (let i = 1; i <= steps; i++) {
      mouseX = fromX + (x - fromX) * i / steps; mouseY = fromY + (y - fromY) * i / steps;
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mouseX, y: mouseY, buttons: mouseDown ? 1 : 0 });
    } },
    async down() { mouseDown = true; await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", buttons: 1, clickCount: 1, x: mouseX, y: mouseY }); },
    async up() { mouseDown = false; await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", buttons: 0, clickCount: 1, x: mouseX, y: mouseY }); },
    async wheel(deltaX, deltaY) { await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: mouseX, y: mouseY, deltaX, deltaY }); }
  };
  const click = async (selector, touch = false) => { await nextFrame(); const box = await rect(selector); assert.ok(box && box.width > 0 && box.height > 0, `Missing button ${selector}`);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (touch) { await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 0 }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
    else { await mouse.move(x, y); await mouse.down(); await mouse.up(); }
    await nextFrame();
  };
  await resize({ width: 1440, height: 900 });
  try {
    // Separate, inert same-origin document: compare authored gutters before the
    // interactive preview starts. Only two temporary images are decoded at once.
    await cdp.send("Page.navigate", { url: `${address.url}/__benchmark__/seamless/fixture` });
    await sleep(100);
    const seamPixels = await evaluate(async () => {
      const scene = await (await fetch("/__benchmark__/seamless/fixture")).json();
      const results = [];
      for (const key of ["terrain", "thumbnail"]) for (const s of scene.sections) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const n = scene.sections.find(n => n.gridX === s.gridX + dx && n.gridY === s.gridY + dy); if (!n) continue;
        const overlap = key === "terrain" ? 4 : 2;
        const a = await createImageBitmap(await (await fetch(`/${s[key]}`)).blob());
        const b = await createImageBitmap(await (await fetch(`/${n[key]}`)).blob());
        const canvas = document.createElement("canvas"); canvas.width = dx ? overlap : a.width; canvas.height = dy ? overlap : a.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(a, dx ? a.width - overlap : 0, dy ? a.height - overlap : 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        const left = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(b, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        const right = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let max = 0, total = 0; for (let i = 0; i < left.length; i++) { const delta = Math.abs(left[i] - right[i]); max = Math.max(max, delta); total += delta; }
        results.push({ a: s.name, b: n.name, key, maxChannelDifference: max, meanChannelDifference: total / left.length });
        a.close(); b.close(); canvas.width = canvas.height = 0;
      }
      return results;
    });
    assert.equal(seamPixels.length, 24);
    for (const seam of seamPixels) assert.ok(seam.meanChannelDifference < 3 && seam.maxChannelDifference < 40, `Painted seam discontinuity: ${JSON.stringify(seam)}`);
    fs.writeFileSync(path.join(output, "seam-pixels.json"), JSON.stringify(seamPixels, null, 2) + "\n");
    console.log(`Terrain: all 12 full-detail and thumbnail joins match within compression tolerance; worst mean channel difference ${Math.max(...seamPixels.map(s => s.meanChannelDifference)).toFixed(2)}/255.`);
    const previewIds = new Set(require("./map-benchmark/seamless/fixtures").createSeamlessFixture().sections.map(s => s.id));
    const roadSamples = require("./map-art/clearance.json").maps.filter(m => previewIds.has(m.id));
    const roadResult = await evaluate(async maps => {
      const scene = await (await fetch("/__benchmark__/seamless/fixture")).json();
      let tested = 0; const failures = [];
      for (const s of scene.sections) {
        const bitmap = await createImageBitmap(await (await fetch(`/${s.terrain}`)).blob());
        const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (const [x, y] of maps.find(m => m.id === s.id).points) {
          const i = ((Math.min(1085, Math.round(y)) + 2) * canvas.width + Math.min(1447, Math.round(x)) + 2) * 4;
          const [r, g, b] = data.slice(i, i + 3); tested++;
          if (!(r > g + 5 && b > g * .5)) failures.push({ section: s.name, x, y, r, g, b });
        }
        bitmap.close(); canvas.width = canvas.height = 0;
      }
      return { tested, failures };
    }, roadSamples.map(m => ({ id: m.id, points: m.roads.flatMap(line => line.filter((_, i) => i % 12 === 0 || i === line.length - 1).map(([x, y]) => [x, y])) })));
    assert.deepEqual(roadResult.failures, [], "Road artwork must cover routes in all nine sections, not just the first tile");
    assert.ok(roadResult.tested > 500);
    console.log(`Terrain: ${roadResult.tested} painted road-center samples passed across all nine sections.`);
    await navigate(`${address.url}/__benchmark__/seamless/`);
    await waitFor(() => window.seamlessPreview); await settle();
    const initial = await snapshot(); assert.equal(initial.assets.peakRequests, 2); assert.equal(initial.assets.full, 4);
    const local = await rect("#viewport");
    const anchor = { x: 800, y: 380 };
    const before = await evaluate(p => SeamlessModel.unproject(seamlessPreview.snapshot().camera, p, seamlessPreview.snapshot().size), anchor);
    await mouse.move(anchor.x, local.y + anchor.y); await mouse.wheel(0, -170); await sleep(80);
    const after = await evaluate(p => SeamlessModel.unproject(seamlessPreview.snapshot().camera, p, seamlessPreview.snapshot().size), anchor);
    near(before.x, after.x); near(before.y, after.y);
    await click("#home");
    for (const kind of ["castle", "camp", "stronghold", "citadel"]) {
      const item = await evaluate(kind => seamlessPreview.scene.objects.find(o => o.kind === kind), kind);
      await evaluate(o => { const s = seamlessPreview.snapshot(); seamlessPreview.view(o.x, o.y, SeamlessModel.limits(s.size).max); }, item);
      await settle(); await click(`[data-key=${JSON.stringify(item.key)}]`);
      assert.equal((await snapshot()).selected, item.key, `Exact ${kind} selection`);
      assert.equal(await evaluate(() => document.querySelector("#name").textContent), item.name);
      await click("#close");
    }
    // Compare actual zoomed sprite pixels with the same native image drawn at
    // its final screen size, without a scaled ancestor. This catches Chrome
    // retaining a low-scale world raster even though the source has detail.
    const sharpness = [];
    for (const deviceScaleFactor of [1, 2]) {
      await resize({ width: 1440, height: 900, deviceScaleFactor });
      await click("#fit"); await settle(); await click("#home"); await settle();
      const castle = await evaluate(() => seamlessPreview.scene.objects.find(o => o.kind === "castle" && o.sectionId === seamlessPreview.scene.homeSectionId && o.asset.includes("city-city-")));
      await evaluate(o => { seamlessPreview.time(0); seamlessPreview.view(o.x, o.y, SeamlessModel.limits(seamlessPreview.snapshot().size).max); }, castle);
      await settle(); await mouse.move(5, 10);
      const selector = `[data-key=${JSON.stringify(castle.key)}]`;
      const bounds = await rect(selector), s = await snapshot();
      near(bounds.width, 56 * s.camera.zoom); near(bounds.height, 56 * s.camera.zoom);
      assert.ok(await evaluate(selector => { const n = document.querySelector(selector); return n.firstChild.naturalWidth >= n.getBoundingClientRect().width * devicePixelRatio; }, selector), "Castle must have enough native pixels at maximum zoom, including high-DPI displays");
      await screenshot(`castle-zoom-${deviceScaleFactor}x.png`);
      // Capture the untouched viewport. A clipped screenshot or a style write
      // on the real sprite can force a new raster and conceal the regression.
      const actual = (await cdp.send("Page.captureScreenshot", { format: "png" })).data;
      await evaluate(selector => {
        const n = document.querySelector(selector), r = n.getBoundingClientRect(), reference = new Image();
        reference.id = "qa-native-reference"; reference.src = n.firstChild.src;
        reference.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;object-fit:contain;z-index:100;pointer-events:none`;
        document.body.append(reference); return reference.decode();
      }, selector);
      await nextFrame();
      const reference = (await cdp.send("Page.captureScreenshot", { format: "png" })).data;
      const energy = await evaluate(async ({ samples, bounds }) => {
        const values = [];
        for (const data of samples) {
          const bitmap = new Image(); bitmap.src = `data:image/png;base64,${data}`; await bitmap.decode();
          const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0);
          const scale = bitmap.width / innerWidth, width = Math.floor(bounds.width * scale), height = Math.floor(bounds.height * scale);
          const pixels = ctx.getImageData(Math.floor(bounds.x * scale), Math.floor(bounds.y * scale), width, height).data;
          let total = 0, count = 0;
          // Ignore screenshot rounding at the outer edges.
          for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) for (let c = 0; c < 3; c++) {
            const i = (y * width + x) * 4 + c;
            total += Math.abs(pixels[i] - pixels[i + 4]) + Math.abs(pixels[i] - pixels[i + width * 4]); count += 2;
          }
          values.push(total / count); bitmap.removeAttribute("src"); canvas.width = canvas.height = 0;
        }
        return { actual: values[0], reference: values[1], ratio: values[0] / values[1] };
      }, { samples: [actual, reference], bounds });
      sharpness.push({ deviceScaleFactor, ...energy });
      assert.ok(energy.reference > 2 && energy.ratio >= .85, `Zoom raster lost native sprite detail: ${JSON.stringify(sharpness.at(-1))}`);
      await evaluate(() => document.getElementById("qa-native-reference").remove());
    }
    fs.writeFileSync(path.join(output, "zoom-sharpness.json"), JSON.stringify(sharpness, null, 2) + "\n");
    console.log(`Zoom clarity: native-size detail retained at 1x/2x display density (${sharpness.map(s => s.ratio.toFixed(2)).join(", ")}).`);
    await resize({ width: 1440, height: 900 });
    const target = await evaluate(() => seamlessPreview.scene.objects.find(o => o.kind === "tower"));
    await evaluate(o => { const s = seamlessPreview.snapshot(); seamlessPreview.view(o.x, o.y, SeamlessModel.limits(s.size).max); }, target);
    const objectSelector = `[data-key=${JSON.stringify(target.key)}]`;
    await click(objectSelector); assert.equal((await snapshot()).selected, target.key);
    await click("#close");
    const box = await rect(objectSelector);
    await mouse.move(box.x + box.width / 2, box.y + box.height / 2); await mouse.down();
    await mouse.move(box.x + box.width / 2 + 110, box.y + box.height / 2 + 35, { steps: 12 }); await mouse.up();
    assert.equal((await snapshot()).selected, null, "Drag selected its starting object");
    await evaluate(key => seamlessPreview.select(key), target.key);
    // Every internal seam and corner: camera crosses without snapping or losing identity.
    for (const x of [1448, 2896]) for (const y of [543, 1629, 2715]) for (const dx of [-3, 3]) {
      await evaluate(p => seamlessPreview.view(p.x, p.y), { x: x + dx, y }); await sleep(18);
      const s = await snapshot(); near(s.camera.x, x + dx); assert.equal(s.selected, target.key);
    }
    for (const y of [1086, 2172]) for (const x of [724, 2172, 3620]) for (const dy of [-3, 3]) {
      await evaluate(p => seamlessPreview.view(p.x, p.y), { x, y: y + dy }); await sleep(18);
      const s = await snapshot(); near(s.camera.y, y + dy); assert.equal(s.selected, target.key);
    }
    for (const x of [1448, 2896]) for (const y of [1086, 2172]) {
      await evaluate(p => seamlessPreview.view(p.x, p.y), { x, y }); await sleep(70);
      // Adjacent tile rectangles overlap, never reveal a rendering crack.
      const tiles = await evaluate(() => [...document.querySelectorAll(".tile")].map(n => ({ id: n.dataset.section, x: n.getBoundingClientRect().x, y: n.getBoundingClientRect().y, right: n.getBoundingClientRect().right, bottom: n.getBoundingClientRect().bottom })));
      const scene = await evaluate(() => seamlessPreview.scene.sections);
      for (const s of scene) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const n = scene.find(n => n.gridX === s.gridX + dx && n.gridY === s.gridY + dy); if (!n) continue;
        const a = tiles.find(t => t.id === s.id), b = tiles.find(t => t.id === n.id);
        assert.ok(dx ? a.right >= b.x - 0.01 : a.bottom >= b.y - 0.01, "Compositor gap at seam");
      }
    }
    await settle(); await click("#close");
    await screenshot("four-section-corner.png");
    await evaluate(() => { const s = seamlessPreview.snapshot(); seamlessPreview.view(2896, 1629, SeamlessModel.limits(s.size).home); });
    await settle(); await screenshot("spread-cities-seam.png");
    await click("#fit"); await settle(); assert.equal((await snapshot()).assets.full, 0);
    assert.equal(await evaluate(() => document.querySelectorAll(".object.castle").length), 540, "Overview must show the redistributed city pattern");
    await screenshot("overview.png");
    await click("#home"); await settle(); const home = await snapshot();
    near(home.camera.x, initial.camera.x); near(home.camera.y, initial.camera.y); near(home.camera.zoom, initial.camera.zoom);
    // Follow a real crossing, then leave follow using native mouse input.
    const march = await evaluate(() => { const m = seamlessPreview.scene.marches[0]; seamlessPreview.time(0); seamlessPreview.select(m.key); return m; });
    await click("#follow"); await sleep(50);
    assert.equal((await snapshot()).following, march.key);
    await evaluate(() => seamlessPreview.time(12)); await sleep(50);
    const followed = await snapshot(); near(followed.camera.x, followed.marches[0].position.x); near(followed.camera.y, followed.marches[0].position.y);
    await mouse.move(500, 330); await mouse.down(); await mouse.move(590, 350, { steps: 5 }); await mouse.up();
    assert.equal((await snapshot()).following, null);
    await click("#close");
    // Deterministic return trips: node and listener totals cannot grow.
    await evaluate(() => { seamlessPreview.home(); seamlessPreview.time(0); }); await settle(); await sleep(150);
    await cdp.send("HeapProfiler.collectGarbage");
    const baseline = await snapshot(), beforeMetrics = (await cdp.send("Performance.getMetrics")).metrics;
    for (let i = 0; i < 40; i++) {
      await evaluate(i => { const s = seamlessPreview.snapshot(); seamlessPreview.view(i % 2 ? 900 : 3000, i % 3 ? 1200 : 2300, SeamlessModel.limits(s.size).home * (i % 2 ? 0.4 : 2)); }, i);
      await sleep(17);
    }
    await evaluate(() => seamlessPreview.home()); await settle(); await sleep(150); await cdp.send("HeapProfiler.collectGarbage");
    const restored = await snapshot(), afterMetrics = (await cdp.send("Performance.getMetrics")).metrics;
    assert.equal(restored.nodes, baseline.nodes); assert.equal(restored.listeners, baseline.listeners);
    for (const name of ["Nodes", "JSEventListeners"]) assert.ok(afterMetrics.find(m => m.name === name).value <= beforeMetrics.find(m => m.name === name).value + 12, `${name} accumulated`);
    assert.ok(restored.assets.peakFull <= 4 && restored.assets.peakRequests <= 2);
    // Native touch pinch, touch dragging and selection at both landscape sizes.
    for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await resize(viewport); await click("#home"); await sleep(100);
      const viewportRect = await rect("#viewport"), s = await snapshot();
      const midpoint = { x: s.size.width / 2, y: s.size.height / 2 }, screenY = viewportRect.y + midpoint.y;
      const touch = async (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 2, radiusY: 2 })) });
      const p0 = await evaluate(p => SeamlessModel.unproject(seamlessPreview.snapshot().camera, p, seamlessPreview.snapshot().size), midpoint);
      await touch("touchStart", [[midpoint.x - 40, screenY, 0], [midpoint.x + 40, screenY, 1]]);
      for (let step = 1; step <= 6; step++) await touch("touchMove", [[midpoint.x - 40 - step * 5, screenY, 0], [midpoint.x + 40 + step * 5, screenY, 1]]);
      await touch("touchEnd", []); await sleep(50);
      const p1 = await evaluate(p => SeamlessModel.unproject(seamlessPreview.snapshot().camera, p, seamlessPreview.snapshot().size), midpoint);
      near(p0.x, p1.x, 1); near(p0.y, p1.y, 1); assert.ok((await snapshot()).camera.zoom > s.camera.zoom * 1.5);
      const panStart = await snapshot();
      await touch("touchStart", [[120, screenY, 0]]); await touch("touchMove", [[190, screenY + 10, 0]]); await touch("touchEnd", []);
      assert.ok((await snapshot()).camera.x < panStart.camera.x); assert.equal((await snapshot()).selected, null);
      const camp = await evaluate(() => seamlessPreview.scene.objects.find(o => o.kind === "camp"));
      await evaluate(o => { const s = seamlessPreview.snapshot(); seamlessPreview.view(o.x, o.y, SeamlessModel.limits(s.size).max); }, camp);
      await click(`[data-key=${JSON.stringify(camp.key)}]`, true); assert.equal((await snapshot()).selected, camp.key);
      const inspector = await rect("#inspector"); assert.ok(inspector.x >= 0 && inspector.y >= 0 && inspector.y + inspector.height <= viewport.height);
      await settle(); await screenshot(`landscape-${viewport.width}.png`); await click("#close");
    }
    // Failure + delayed obsolete loads, while input remains usable.
    await resize({ width: 1440, height: 900 });
    let failedOnce = false;
    const stopIntercept = cdp.on("Fetch.requestPaused", async ({ requestId, request }) => {
      if (request.url.endsWith("-thumb.webp")) { await cdp.send("Fetch.continueRequest", { requestId }).catch(() => {}); return; }
      await sleep(180);
      if (!failedOnce) { failedOnce = true; await cdp.send("Fetch.fulfillRequest", { requestId, responseCode: 503, body: Buffer.from("test failure").toString("base64") }); }
      else await cdp.send("Fetch.continueRequest", { requestId }).catch(() => {});
    });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/tools/map-benchmark/seamless/terrain/*.webp" }] });
    await navigate(`${address.url}/__benchmark__/seamless/`); await waitFor(() => window.seamlessPreview);
    await waitFor(() => seamlessPreview.snapshot().assets.failed === 1);
    assert.ok(await evaluate(() => [...document.querySelectorAll(".tile")].find(n => n.dataset.section === seamlessPreview.scene.homeSectionId).firstChild.src.startsWith("blob:")), "Visible terrain must retain its thumbnail on full-image failure");
    const failureCamera = (await snapshot()).camera;
    await mouse.move(700, 350); await mouse.down(); await mouse.move(810, 360, { steps: 5 }); await mouse.up();
    assert.notEqual((await snapshot()).camera.x, failureCamera.x);
    await click("#retry"); await settle(); assert.equal((await snapshot()).assets.failed, 0);
    await click("#fit"); await sleep(300); assert.equal((await snapshot()).assets.full, 0);
    await cdp.send("Fetch.disable"); stopIntercept();
    // Record steady continuous panning/zooming, including 4x CPU slowdown.
    for (const config of [
      [1440, 900, false, 1], [1440, 900, true, 1], [1440, 900, false, 4], [1440, 900, true, 4],
      [844, 390, false, 4], [844, 390, true, 4], [568, 320, false, 4], [568, 320, true, 4]
    ]) {
      const [width, height, crowded, rate] = config;
      await resize({ width, height }); await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      await navigate(`${address.url}/__benchmark__/seamless/?crowded=${crowded ? 1 : 0}`); await waitFor(() => window.seamlessPreview); await settle();
      await evaluate(() => { seamlessPreview.resetMetrics(); return new Promise(resolve => { const start = performance.now(), zoom = SeamlessModel.limits(seamlessPreview.snapshot().size).home; function step(now) {
        const t = (now - start) / 1000;
        seamlessPreview.view(2172 + 600 * Math.sin(t * 1.8), 1629 + 400 * Math.cos(t * 1.4), zoom * (0.85 + 0.2 * Math.sin(t * 2)));
        if (t < 2.5) requestAnimationFrame(step); else resolve();
      } requestAnimationFrame(step); }); });
      const s = await snapshot(), percentile = (array, p) => [...array].sort((a, b) => a - b)[Math.min(array.length - 1, Math.floor(array.length * p))];
      assert.ok(s.frameTimes.length > 20, "Navigation stalled"); assert.ok(s.assets.peakFull <= 4 && s.assets.peakRequests <= 2);
      results.push({ width, height, crowded, cpuSlowdown: rate, frames: s.frameTimes.length,
        fps: +(1000 / (s.frameTimes.reduce((a, b) => a + b, 0) / s.frameTimes.length)).toFixed(1),
        frameP50: +percentile(s.frameTimes, 0.5).toFixed(2), frameP95: +percentile(s.frameTimes, 0.95).toFixed(2), frameMax: +Math.max(...s.frameTimes).toFixed(2),
        workP95: +percentile(s.workTimes, 0.95).toFixed(2), nodes: s.nodes, assets: s.assets });
      console.log(`Measured ${width}×${height} ${crowded ? "crowded" : "normal"} ${rate}x: ${results.at(-1).fps} FPS; p95 ${results.at(-1).frameP95}ms`);
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await resize({ width: 1440, height: 900 }); await navigate(`${address.url}/__benchmark__/seamless/`); await waitFor(() => window.seamlessPreview); await settle();
    await screenshot("desktop.png");
    fs.writeFileSync(path.join(output, "performance.json"), JSON.stringify({ browser: (await cdp.send("Browser.getVersion")).product, measuredAt: new Date().toISOString(), durationPerCaseSeconds: 2.5, results, externalRequests: external, errors, note: "Synthetic local DOM fixtures and headless browser; not multiplayer capacity or physical phone measurements." }, null, 2) + "\n");
    console.log("Seamless browser: desktop/mobile, mouse/touch, all seams/corners, selection, following, resize, asset recovery and bounded residency passed.");
  } finally {
    await cdp.send("Browser.close").catch(() => {}); cdp.close();
    if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill("SIGKILL"); await waitForProcessExit(session.browserProcess); }
    await removeBrowserProfile(session.profilePath); await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
