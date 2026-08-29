"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const { CdpClient, fetchJson } = require("./cdp-client.js");
const { SCENARIOS } = require("./fixtures.js");
const { createMapBenchmarkServer } = require("./server.js");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const outputDirectoryArgument = process.argv.find(argument => argument.startsWith("--output-directory="));
const outputBasenameArgument = process.argv.find(argument => argument.startsWith("--output-basename="));
const OUTPUT_DIR = outputDirectoryArgument
  ? path.resolve(ROOT_DIR, outputDirectoryArgument.slice("--output-directory=".length))
  : path.join(ROOT_DIR, "benchmark-results", "map");
const OUTPUT_BASENAME = outputBasenameArgument
  ? outputBasenameArgument.slice("--output-basename=".length).replace(/[^a-z0-9._-]/gi, "-")
  : "";
const QUICK = process.argv.includes("--quick");
const PROFILE_MARCHES = process.argv.includes("--profile-marches");
const PROFILE_MARCHES_STAGE = process.argv.includes("--profile-before") ? "before" : "after";
const PROFILE_ZOOM = process.argv.includes("--profile-zoom");
const PROFILE_ZOOM_STAGE = process.argv.includes("--profile-before") ? "before" : "after";
const PHASE_1_AFTER = process.argv.includes("--phase-1-after");
const PHASE_2_AFTER = process.argv.includes("--phase-2-after");
const VERIFY_PHASE_1 = process.argv.includes("--verify-phase-1");
const VERIFY_PHASE_1_A_DESKTOP = process.argv.includes("--verify-phase-1-a-desktop");
const FRESH = process.argv.includes("--fresh");
const SAMPLE_DURATION_MS = QUICK ? 1600 : 10000;
const INTERACTION_DURATION_MS = QUICK ? 1000 : 5000;
const PROFILES = VERIFY_PHASE_1_A_DESKTOP
  ? [3, 4].map(repetition => ({
      id: `desktop-r${repetition}`,
      baseProfileId: "desktop",
      repetition,
      label: `Desktop repeat ${repetition}`,
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      cpuRate: 1,
    }))
  : VERIFY_PHASE_1
  ? [1, 2].flatMap(repetition => [
      { id: `desktop-r${repetition}`, baseProfileId: "desktop", repetition, label: `Desktop repeat ${repetition}`, width: 1440, height: 900, deviceScaleFactor: 1, cpuRate: 1 },
      { id: `mobile-landscape-r${repetition}`, baseProfileId: "mobile-landscape", repetition, label: `Mobile landscape repeat ${repetition}`, width: 844, height: 390, deviceScaleFactor: 1, cpuRate: 1, mobile: true },
    ])
  : QUICK || PROFILE_MARCHES
  ? [{ id: "desktop", label: "Desktop", width: 1440, height: 900, deviceScaleFactor: 1, cpuRate: 1 }]
  : PROFILE_ZOOM
  ? [
      { id: "desktop", label: "Desktop", width: 1440, height: 900, deviceScaleFactor: 1, cpuRate: 1 },
      { id: "mobile-landscape", label: "Mobile landscape (emulated)", width: 844, height: 390, deviceScaleFactor: 1, cpuRate: 1, mobile: true },
    ]
  : [
      { id: "desktop", label: "Desktop", width: 1440, height: 900, deviceScaleFactor: 1, cpuRate: 1 },
      { id: "mobile-landscape", label: "Mobile landscape (emulated)", width: 844, height: 390, deviceScaleFactor: 1, cpuRate: 1, mobile: true },
      { id: "mobile-landscape-4x", label: "Mobile landscape, 4x CPU slowdown (emulated)", width: 844, height: 390, deviceScaleFactor: 1, cpuRate: 4, mobile: true },
    ];

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function withWatchdog(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Profile exceeded the ${milliseconds / 1000}-second isolated run watchdog.`)), milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const chromePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!chromePath) throw new Error("Chrome or Edge was not found. Set CHROME_PATH to a Chromium executable.");
  return chromePath;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function launchChrome(chromePath, debugPort, profilePath) {
  const args = [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=Translate,MediaRouter,OptimizationHints",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "about:blank",
  ];
  return childProcess.spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Page evaluation failed.";
    throw new Error(description);
  }
  return result.result?.value;
}

async function waitUntilReady(client, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await evaluate(client, `({
      ready: document.documentElement?.dataset.crownlandsBenchmarkReady === "true",
      failed: document.documentElement?.dataset.crownlandsBenchmarkError === "true",
      detail: window.__CROWNLANDS_BENCHMARK__?.getStatus?.() || null
    })`);
    if (state.failed) throw new Error(state.detail?.error || "Benchmark fixture failed to start.");
    if (state.ready) return state.detail;
    await delay(100);
  }
  throw new Error(`Benchmark page did not become ready within ${timeoutMs} ms.`);
}

function performanceMetricMap(result) {
  return Object.fromEntries((result.metrics || []).map(metric => [metric.name, metric.value]));
}

function performanceDelta(before, after) {
  const millisecondMetrics = ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"];
  const result = {};
  for (const name of millisecondMetrics) result[`${name.replace("Duration", "")}Ms`] = ((after[name] || 0) - (before[name] || 0)) * 1000;
  result.LayoutCount = (after.LayoutCount || 0) - (before.LayoutCount || 0);
  result.RecalcStyleCount = (after.RecalcStyleCount || 0) - (before.RecalcStyleCount || 0);
  return result;
}

async function measuredSample(client, name, action) {
  const before = performanceMetricMap(await client.send("Performance.getMetrics"));
  await evaluate(client, `window.__CROWNLANDS_BENCHMARK__.beginSample(${JSON.stringify(name)})`);
  const actionResult = await action();
  const frame = await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.endSample()");
  const after = performanceMetricMap(await client.send("Performance.getMetrics"));
  return { name, durationMs: frame.durationMs, frame, browserMainThread: performanceDelta(before, after), actionResult };
}

async function panMap(client, durationMs) {
  const bounds = await evaluate(client, `(() => { const rect = document.querySelector("#mapFrame").getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })()`);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: centerX, y: centerY, button: "left", buttons: 1, clickCount: 1 });
  const startedAt = Date.now();
  while (Date.now() - startedAt < durationMs) {
    const progress = (Date.now() - startedAt) / durationMs;
    const radians = progress * Math.PI * 4;
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: centerX + Math.sin(radians) * Math.min(240, bounds.width * 0.28),
      y: centerY + Math.sin(radians / 2) * Math.min(100, bounds.height * 0.22),
      button: "left",
      buttons: 1,
    });
    await delay(40);
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: centerX, y: centerY, button: "left", buttons: 0, clickCount: 1 });
}

async function zoomMap(client, durationMs) {
  const bounds = await evaluate(client, `(() => { const rect = document.querySelector("#mapFrame").getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })()`);
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const startedAt = Date.now();
  let step = 0;
  while (Date.now() - startedAt < durationMs) {
    await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: step % 2 ? 110 : -110 });
    step += 1;
    await delay(120);
  }
}

async function readTraceStream(client, streamHandle) {
  let traceJson = "";
  while (true) {
    const chunk = await client.send("IO.read", { handle: streamHandle });
    traceJson += chunk.base64Encoded
      ? Buffer.from(chunk.data || "", "base64").toString("utf8")
      : chunk.data || "";
    if (chunk.eof) break;
  }
  await client.send("IO.close", { handle: streamHandle });
  return JSON.parse(traceJson);
}

async function startZoomTrace(client) {
  await client.send("Tracing.start", {
    categories: [
      "devtools.timeline",
      "blink",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-blink.debug.invalidationTracking",
    ].join(","),
    options: "sampling-frequency=10000",
    transferMode: "ReturnAsStream",
  });
}

async function stopZoomTrace(client) {
  const completed = new Promise(resolve => {
    const remove = client.on("Tracing.tracingComplete", event => {
      remove();
      resolve(event);
    });
  });
  await client.send("Tracing.end");
  const event = await completed;
  if (!event.stream) return { traceEvents: [] };
  return readTraceStream(client, event.stream);
}

function summarizeZoomTrace(trace) {
  const trackedNames = new Set([
    "EventDispatch",
    "FireAnimationFrame",
    "FunctionCall",
    "UpdateLayoutTree",
    "RecalculateStyles",
    "Layout",
    "PrePaint",
    "Paint",
    "CompositeLayers",
    "ScheduleStyleInvalidationTracking",
    "StyleRecalcInvalidationTracking",
    "StyleInvalidatorInvalidationTracking",
    "LayoutInvalidationTracking",
  ]);
  const events = (trace.traceEvents || []).filter(event => trackedNames.has(event.name));
  const byName = Object.create(null);
  for (const event of events) {
    const record = byName[event.name] || (byName[event.name] = { count: 0, durationMs: 0, maxDurationMs: 0 });
    const durationMs = Math.max(0, Number(event.dur) || 0) / 1000;
    record.count += 1;
    record.durationMs += durationMs;
    record.maxDurationMs = Math.max(record.maxDurationMs, durationMs);
  }

  const invalidationDetails = events
    .filter(event => event.name.includes("Invalidation"))
    .map(event => ({
      name: event.name,
      timestampUs: event.ts,
      data: event.args?.data || event.args?.beginData || event.args || null,
    }));
  const invalidationReasons = Object.create(null);
  for (const event of invalidationDetails) {
    const data = event.data || {};
    const reason = data.reason || data.invalidationReason || data.type || "unspecified";
    const node = data.nodeName || data.node || data.selectorPart || data.changedId || "";
    const key = `${event.name}: ${reason}${node ? ` | ${node}` : ""}`;
    invalidationReasons[key] = (invalidationReasons[key] || 0) + 1;
  }

  const wheelDispatches = events.filter(event => event.name === "EventDispatch" && event.args?.data?.type === "wheel");
  return {
    sourceEventCount: trace.traceEvents?.length || 0,
    trackedEventCount: events.length,
    byName,
    wheelDispatchCount: wheelDispatches.length,
    invalidationReasonCounts: Object.entries(invalidationReasons)
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => ({ reason, count })),
    invalidationDetails: invalidationDetails.slice(0, 500),
  };
}

function summarizeNetwork(requests, origin) {
  const completed = [...requests.values()].filter(request => request.finished);
  const external = [...requests.values()].filter(request => !request.url.startsWith(origin));
  const externalHosts = [...new Set(external.map(request => {
    try { return new URL(request.url).host || new URL(request.url).protocol; } catch (_error) { return "non-url"; }
  }))].sort();
  const productionBackendRequests = [...requests.values()].filter(request => /(?:firebaseio\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|firebaseapp\.com)/i.test(request.url));
  return {
    requestCount: requests.size,
    completedRequestCount: completed.length,
    failedRequestCount: [...requests.values()].filter(request => request.failed).length,
    encodedBytes: Math.round(completed.reduce((sum, request) => sum + (request.encodedDataLength || 0), 0)),
    externalRequestCount: external.length,
    externalHosts,
    productionBackendRequestCount: productionBackendRequests.length,
    mapAssetRequests: [...requests.values()].filter(request => request.url.includes("/assets/worlds/")).length,
    byType: [...requests.values()].reduce((result, request) => {
      result[request.type || "Other"] = (result[request.type || "Other"] || 0) + 1;
      return result;
    }, {}),
  };
}

async function runProfileScenario(client, serverAddress, scenario, profile) {
  const requests = new Map();
  const consoleErrors = [];
  const removeRequest = client.on("Network.requestWillBeSent", event => requests.set(event.requestId, {
    url: event.request.url,
    type: event.type,
    startedAt: event.timestamp,
  }));
  const removeResponse = client.on("Network.responseReceived", event => {
    const request = requests.get(event.requestId);
    if (request) Object.assign(request, { status: event.response.status, mimeType: event.response.mimeType, fromDiskCache: event.response.fromDiskCache });
  });
  const removeFinished = client.on("Network.loadingFinished", event => {
    const request = requests.get(event.requestId);
    if (request) Object.assign(request, { finished: true, encodedDataLength: event.encodedDataLength, finishedAt: event.timestamp });
  });
  const removeFailed = client.on("Network.loadingFailed", event => {
    const request = requests.get(event.requestId);
    if (request) Object.assign(request, { failed: true, errorText: event.errorText });
  });
  const removeException = client.on("Runtime.exceptionThrown", event => consoleErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Unknown exception"));

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.deviceScaleFactor,
    mobile: Boolean(profile.mobile),
    screenWidth: profile.width,
    screenHeight: profile.height,
  });
  await client.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuRate });
  const profileQuery = PROFILE_MARCHES ? "&profile=marches" : PROFILE_ZOOM ? "&profile=zoom" : "";
  await client.send("Page.navigate", { url: `${serverAddress.url}/__benchmark__/?scenario=${scenario.id}${profileQuery}` });
  const status = await waitUntilReady(client, profile.cpuRate > 1 ? 180000 : 60000);
  const progressPrefix = `${scenario.id}/${profile.id}`;
  console.log(`  ${progressPrefix}: authenticated fixture ready`);
  const initialRuntime = await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getMetrics()");
  if (initialRuntime.dataCityCount !== scenario.cityCount || initialRuntime.dataMarchCount !== scenario.marchCount) {
    throw new Error(
      `Fixture count mismatch: expected ${scenario.cityCount}/${scenario.marchCount}, `
      + `received ${initialRuntime.dataCityCount}/${initialRuntime.dataMarchCount} in ${initialRuntime.regionId || "unknown region"}. `
      + `Regions: ${JSON.stringify(initialRuntime.worldRegionIds || [])}. `
      + `Online state: ${JSON.stringify(initialRuntime.onlineState || {})}; main city: ${initialRuntime.mainCityId || "none"}. `
      + `Operations: ${JSON.stringify(initialRuntime.realtime?.operations || [])}.`
    );
  }

  if (PROFILE_MARCHES) {
    await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.resetMarchProfile()");
    const idle = await measuredSample(client, "march-profile-idle", () => delay(10000));
    const marchProfile = await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getMarchProfile({ stop: true })");
    const runtime = await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getMetrics()");
    const heap = await client.send("Runtime.getHeapUsage");
    for (const remove of [removeRequest, removeResponse, removeFinished, removeFailed, removeException]) remove();
    return {
      scenario,
      profile,
      initialRegionLoadLatencyMs: status.regionLoadLatencyMs,
      initialRuntime,
      runtime,
      idle,
      marchProfile,
      heap,
      network: summarizeNetwork(requests, serverAddress.url),
      consoleErrors,
    };
  }

  if (PROFILE_ZOOM) {
    await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.resetZoomProfile()");
    await startZoomTrace(client);
    const zoom = await measuredSample(client, "scenario-c-zoom-profile", () => zoomMap(client, INTERACTION_DURATION_MS));
    await delay(400);
    const trace = summarizeZoomTrace(await stopZoomTrace(client));
    const zoomProfile = await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getZoomProfile({ stop: true })");
    const runtime = await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getMetrics()");
    const heap = await client.send("Runtime.getHeapUsage");
    for (const remove of [removeRequest, removeResponse, removeFinished, removeFailed, removeException]) remove();
    return {
      scenario,
      profile,
      initialRegionLoadLatencyMs: status.regionLoadLatencyMs,
      initialRuntime,
      runtime,
      zoom,
      zoomProfile,
      trace,
      heap,
      network: summarizeNetwork(requests, serverAddress.url),
      consoleErrors,
    };
  }

  const idle = await measuredSample(client, "idle-with-marches", () => delay(SAMPLE_DURATION_MS));
  console.log(`  ${progressPrefix}: idle sample complete`);
  const pan = await measuredSample(client, "pan", () => panMap(client, INTERACTION_DURATION_MS));
  console.log(`  ${progressPrefix}: pan sample complete`);
  const zoom = await measuredSample(client, "zoom", () => zoomMap(client, INTERACTION_DURATION_MS));
  console.log(`  ${progressPrefix}: zoom sample complete`);
  const cityInfo = await measuredSample(client, "city-selection-and-info", () => evaluate(client, "window.__CROWNLANDS_BENCHMARK__.selectAndOpenCities(5)"));
  console.log(`  ${progressPrefix}: City Info sample complete`);
  const mapSwitch = await measuredSample(client, "neighbor-switch-and-return", () => evaluate(client, "window.__CROWNLANDS_BENCHMARK__.switchNeighborAndReturn()"));
  console.log(`  ${progressPrefix}: region switch sample complete`);
  const runtime = await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getMetrics()");
  const heap = await client.send("Runtime.getHeapUsage");
  const finalPerformance = performanceMetricMap(await client.send("Performance.getMetrics"));

  for (const remove of [removeRequest, removeResponse, removeFinished, removeFailed, removeException]) remove();
  return {
    scenario,
    profile,
    initialRegionLoadLatencyMs: status.regionLoadLatencyMs,
    initialRuntime,
    runtime,
    heap: {
      usedSize: heap.usedSize,
      totalSize: heap.totalSize,
      embedderHeapUsedSize: heap.embedderHeapUsedSize,
      backingStorageSize: heap.backingStorageSize,
    },
    finalBrowserMetrics: {
      JSHeapUsedSize: finalPerformance.JSHeapUsedSize,
      JSHeapTotalSize: finalPerformance.JSHeapTotalSize,
      Nodes: finalPerformance.Nodes,
      Documents: finalPerformance.Documents,
      Frames: finalPerformance.Frames,
    },
    samples: { idle, pan, zoom, cityInfo, mapSwitch },
    network: summarizeNetwork(requests, serverAddress.url),
    consoleErrors,
    limitations: {
      paintAndCompositeTiming: "Unavailable from stable headless CDP Performance metrics; capture a DevTools trace for layer-level attribution.",
      physicalMobile: false,
      cpuThrottle: profile.cpuRate > 1 ? `${profile.cpuRate}x CDP CPU slowdown` : "none",
    },
  };
}

function round(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function markdownReport(report) {
  const rows = report.runs.map(run => {
    const switchResult = run.samples.mapSwitch.actionResult;
    const initialCities = run.initialRuntime?.dom.visibleCityNodes ?? run.scenario.cityCount;
    const initialMarches = run.initialRuntime?.dom.visibleMarchNodes ?? run.scenario.marchCount;
    return `| ${run.scenario.id} | ${run.profile.id} | ${run.runtime.dom.totalNodes} | ${run.runtime.dom.mapWorldNodes} | ${initialCities} | ${initialMarches} | ${round(run.heap.usedSize / 1048576)} | ${round(run.samples.idle.frame.fps)} | ${round(run.samples.idle.frame.p95FrameTimeMs)} | ${round(run.samples.pan.frame.fps)} | ${round(run.samples.zoom.frame.fps)} | ${round(run.initialRegionLoadLatencyMs)} | ${round(switchResult.neighborLatencyMs)} / ${round(switchResult.returnLatencyMs)} | ${run.runtime.realtime.listeners.active} |`;
  });
  const failureRows = (report.failures || []).map(failure => `| ${failure.scenarioId} | ${failure.profileId} | ${failure.reason.replaceAll("|", "\\|")} |`);
  const failureSection = failureRows.length
    ? `\n\n## Unavailable profiles\n\nThese profiles exceeded the isolated watchdog or failed setup. They count as performance-budget failures and are not assigned invented metric values.\n\n| Scenario | Profile | Reason |\n|---|---|---|\n${failureRows.join("\n")}`
    : "";
  const title = report.mode.includes("Phase 2")
    ? "Crownlands Map Phase 2 Machine Results"
    : report.mode.includes("Phase 1")
      ? "Crownlands Map Phase 1 Machine Results"
      : "Crownlands Map Phase 0 Machine Baseline";
  return `# ${title}\n\nGenerated: ${report.generatedAt}\n\nMode: ${report.mode}. Seed: \`${report.seed}\`. This is a loopback, authenticated-equivalent, deterministic fixture; it contains no production player data and makes no production Firebase requests.\n\n| Scenario | Profile | DOM | Map DOM | Initial cities | Initial marches | Heap MiB | Idle FPS | Idle p95 ms | Pan FPS | Zoom FPS | Initial load ms | Switch out/back ms | Active listeners |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows.join("\n")}${failureSection}\n\n## Method and limitations\n\nEach full run samples 10 seconds of idle animation, 5 seconds of real pointer panning, 5 seconds of real wheel zooming, five City Info open/close cycles, and a real neighboring-region switch and return through the production map runtime. Every profile runs in a fresh browser process and temporary profile. Mobile sizes and the 4x CPU profile are Chrome DevTools emulations, not measurements from physical hardware. Style, layout, script, long tasks, networking, timers, listeners, DOM/SVG, animation, and heap are present in the JSON. Stable headless CDP does not expose defensible paint/composite duration counters, so those fields are explicitly unavailable rather than estimated.\n`;
}

async function closeIsolatedChrome(client, chrome, profilePath) {
  if (client) {
    try { await Promise.race([client.send("Browser.close"), delay(1500)]); } catch (_error) { /* The socket normally closes before the response. */ }
    client.close();
  }
  await Promise.race([
    new Promise(resolve => chrome.once("exit", resolve)),
    delay(3000),
  ]);
  if (chrome.exitCode === null) {
    if (process.platform === "win32") {
      childProcess.spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      chrome.kill("SIGKILL");
    }
  }
  const resolvedTemp = path.resolve(os.tmpdir());
  const resolvedProfile = path.resolve(profilePath);
  if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`) && path.basename(resolvedProfile).startsWith("crownlands-map-benchmark-")) {
    await fsp.rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function runIsolated(serverAddress, chromePath, scenario, profile) {
  const debugPort = await getFreePort();
  const profilePath = await fsp.mkdtemp(path.join(os.tmpdir(), "crownlands-map-benchmark-"));
  const chrome = launchChrome(chromePath, debugPort, profilePath);
  let client;
  try {
    const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
    const pageTarget = targets.find(target => target.type === "page");
    if (!pageTarget) throw new Error("Chrome did not expose a page target.");
    client = await CdpClient.connect(pageTarget.webSocketDebuggerUrl);
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
      client.send("Performance.enable"),
    ]);
    const browserVersion = await client.send("Browser.getVersion");
    const watchdogMs = profile.cpuRate > 1 ? 180000 : 240000;
    const run = await withWatchdog(runProfileScenario(client, serverAddress, scenario, profile), watchdogMs);
    return { run, browserVersion };
  } finally {
    await closeIsolatedChrome(client, chrome, profilePath);
  }
}

function buildReport(chromePath, browserVersion, runs, failures = [], partial = false) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: partial
      ? VERIFY_PHASE_1_A_DESKTOP ? "partial Phase 1 A desktop verification checkpoint"
        : VERIFY_PHASE_1 ? "partial Phase 1 verification checkpoint"
        : PHASE_2_AFTER ? "partial Phase 2 after checkpoint"
        : PHASE_1_AFTER ? "partial Phase 1 after checkpoint" : "partial full-baseline checkpoint"
      : PROFILE_MARCHES ? "Phase 1 march profile"
        : PROFILE_ZOOM ? `Phase 2 zoom profile (${PROFILE_ZOOM_STAGE})`
        : VERIFY_PHASE_1_A_DESKTOP ? "Phase 1 A desktop verification repeats"
        : VERIFY_PHASE_1 ? "Phase 1 nominal verification repeats"
        : PHASE_2_AFTER ? "Phase 2 after optimization"
        : PHASE_1_AFTER ? "Phase 1 after optimization"
          : QUICK ? "quick smoke run" : "full baseline",
    seed: "crownlands-map-phase-0-v1",
    environment: {
      platform: process.platform,
      release: os.release(),
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model || "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
      browser: browserVersion?.product || "unknown",
      browserUserAgent: browserVersion?.userAgent || "unknown",
      browserExecutable: chromePath,
      headless: true,
      runIsolation: "fresh browser process and temporary profile per scenario/profile",
    },
    durations: { idleMs: SAMPLE_DURATION_MS, interactionMs: INTERACTION_DURATION_MS },
    runs,
    failures,
  };
}

async function main() {
  const benchmarkServer = createMapBenchmarkServer();
  const serverAddress = await benchmarkServer.listen(0);
  const chromePath = findChrome();
  let browserVersion;
  try {
    const scenarioIds = PROFILE_MARCHES ? ["B"] : PROFILE_ZOOM ? ["C"] : VERIFY_PHASE_1_A_DESKTOP ? ["A"] : VERIFY_PHASE_1 ? ["A", "B", "D"] : QUICK ? ["A"] : Object.keys(SCENARIOS);
    let runs = [];
    let failures = [];
    await fsp.mkdir(OUTPUT_DIR, { recursive: true });
    const partialPath = path.join(
      OUTPUT_DIR,
      OUTPUT_BASENAME ? `${OUTPUT_BASENAME}.partial.json`
        : VERIFY_PHASE_1_A_DESKTOP ? "phase-1-verification-a-desktop.partial.json"
        : VERIFY_PHASE_1 ? "phase-1-verification.partial.json"
        : PHASE_2_AFTER ? "phase-2-after.partial.json"
        : PHASE_1_AFTER ? "phase-1-after.partial.json" : "baseline.partial.json"
    );
    if (!QUICK && !PROFILE_MARCHES && !FRESH && fs.existsSync(partialPath)) {
      const checkpoint = JSON.parse(await fsp.readFile(partialPath, "utf8"));
      runs = Array.isArray(checkpoint.runs) ? checkpoint.runs : [];
      failures = Array.isArray(checkpoint.failures) ? checkpoint.failures : [];
      browserVersion = checkpoint.environment?.browser && checkpoint.environment.browser !== "unknown"
        ? { product: checkpoint.environment.browser, userAgent: checkpoint.environment.browserUserAgent }
        : undefined;
      console.log(`Resuming from ${runs.length} completed profiles and ${failures.length} recorded failures.`);
    }
    const finishedKeys = new Set([
      ...runs.map(run => `${run.scenario.id}/${run.profile.id}`),
      ...failures.map(failure => `${failure.scenarioId}/${failure.profileId}`),
    ]);
    for (const scenarioId of scenarioIds) {
      for (const profile of PROFILES) {
        const runKey = `${scenarioId}/${profile.id}`;
        if (finishedKeys.has(runKey)) continue;
        console.log(`Benchmarking scenario ${scenarioId} on ${profile.id}...`);
        try {
          const result = await runIsolated(serverAddress, chromePath, SCENARIOS[scenarioId], profile);
          const run = result.run;
          browserVersion ||= result.browserVersion;
          runs.push(run);
          if (PROFILE_MARCHES) {
            console.log(`  ${round(run.idle.frame.fps)} idle FPS, ${round(run.marchProfile.functions.renderArmies?.averageMs)} ms average renderArmies`);
          } else if (PROFILE_ZOOM) {
            console.log(`  ${round(run.zoom.frame.fps)} zoom FPS, ${round(run.zoom.browserMainThread.RecalcStyleMs)} ms style recalculation`);
          } else {
            console.log(`  ${round(run.samples.idle.frame.fps)} idle FPS, ${round(run.heap.usedSize / 1048576)} MiB heap`);
          }
        } catch (error) {
          const failure = {
            scenarioId,
            profileId: profile.id,
            at: new Date().toISOString(),
            reason: error?.message || String(error),
            outcome: "unavailable; treated as a failed performance budget, not assigned a synthetic metric",
          };
          failures.push(failure);
          console.error(`  FAILED: ${failure.reason}`);
        }
        finishedKeys.add(runKey);
        if (!QUICK && !PROFILE_MARCHES && !PROFILE_ZOOM) {
          const checkpoint = buildReport(chromePath, browserVersion, runs, failures, true);
          await fsp.writeFile(partialPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
        }
      }
    }
    const report = buildReport(chromePath, browserVersion, runs, failures);
    const basename = OUTPUT_BASENAME || (PROFILE_MARCHES
      ? `phase-1-profile-${PROFILE_MARCHES_STAGE}`
      : PROFILE_ZOOM ? `phase-2-zoom-profile-${PROFILE_ZOOM_STAGE}`
      : VERIFY_PHASE_1_A_DESKTOP ? "phase-1-verification-a-desktop"
      : VERIFY_PHASE_1 ? "phase-1-verification"
      : PHASE_2_AFTER ? "phase-2-after"
      : PHASE_1_AFTER ? "phase-1-after"
        : QUICK ? "quick-latest" : "baseline");
    if (PROFILE_MARCHES || PROFILE_ZOOM) {
      await fsp.writeFile(path.join(OUTPUT_DIR, `${basename}.json`), `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Wrote ${path.relative(ROOT_DIR, path.join(OUTPUT_DIR, `${basename}.json`))}`);
      return;
    }
    await Promise.all([
      fsp.writeFile(path.join(OUTPUT_DIR, `${basename}.json`), `${JSON.stringify(report, null, 2)}\n`),
      fsp.writeFile(path.join(OUTPUT_DIR, `${basename}.md`), markdownReport(report)),
    ]);
    console.log(`Wrote ${path.relative(ROOT_DIR, path.join(OUTPUT_DIR, `${basename}.json`))}`);
    console.log(`Wrote ${path.relative(ROOT_DIR, path.join(OUTPUT_DIR, `${basename}.md`))}`);
    if (!QUICK) await fsp.rm(partialPath, { force: true });
  } finally {
    await benchmarkServer.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
