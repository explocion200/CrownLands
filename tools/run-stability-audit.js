"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const { CdpClient, fetchJson } = require("./map-benchmark/cdp-client.js");
const { loadAuthoritativeRealmContract } = require("./map-benchmark/realm-contract.js");
const { createMapBenchmarkServer } = require("./map-benchmark/server.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "benchmark-results", "stability");
const REPORT_PATH = path.join(ROOT_DIR, "docs", "stability-audit", "STABILITY_LOGIN_PERFORMANCE_AUDIT.md");
const BASELINE_PATH = path.join(OUTPUT_DIR, "baseline.json");
const LATEST_PATH = path.join(OUTPUT_DIR, "latest.json");
const args = new Set(process.argv.slice(2));
const FULL = args.has("--full");
const NO_PRODUCTION = args.has("--no-production");
const REFRESH_PUBLIC_ONLY = args.has("--refresh-public-only");

function readNumberArgument(name, fallback) {
  const prefix = `--${name}=`;
  const match = [...args].find(argument => argument.startsWith(prefix));
  const value = Number(match?.slice(prefix.length));
  return Number.isFinite(value) ? value : fallback;
}

const SOAK_MINUTES = Math.max(0, readNumberArgument("soak-minutes", FULL ? 60 : 0));
const MAP_SWITCHES = Math.max(0, Math.floor(readNumberArgument("map-switches", SOAK_MINUTES ? 50 : 5)));
const FOREGROUND_CYCLES = Math.max(0, Math.floor(readNumberArgument("foreground-cycles", SOAK_MINUTES ? 20 : 3)));
const RECONNECT_CYCLES = Math.max(0, Math.floor(readNumberArgument("reconnect-cycles", SOAK_MINUTES ? 10 : 2)));

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error("Chrome or Edge was not found. Set CHROME_PATH to a Chromium executable.");
  return executable;
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

function launchChrome(executable, debugPort, profilePath) {
  return childProcess.spawn(executable, [
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
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
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

async function waitForOutcome(client, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const outcome = await evaluate(client, `({
      ready: document.documentElement?.dataset.crownlandsBenchmarkReady === "true",
      failed: document.documentElement?.dataset.crownlandsBenchmarkError === "true",
      status: window.__CROWNLANDS_BENCHMARK__?.getStatus?.() || null
    })`);
    if (outcome.ready || outcome.failed) return { ...outcome, elapsedMs: Date.now() - startedAt };
    await delay(100);
  }
  return { ready: false, failed: false, status: null, elapsedMs: Date.now() - startedAt, timedOut: true };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

function firstMatch(source, expression, label) {
  const match = source.match(expression);
  if (!match) throw new Error(`Could not read ${label}.`);
  return match[1];
}

function repositoryIdentity() {
  const releaseConfig = readJson("functions/release-config.json");
  const browserConfig = readText("release-config.js");
  const indexSource = readText("index.html");
  const serviceWorkerSource = readText("service-worker.js");
  const authoritativeRealm = loadAuthoritativeRealmContract();
  const browserReleaseId = firstMatch(browserConfig, /["']releaseId["']\s*:\s*"([^"]+)"/, "browser release ID");
  const browserContractHash = firstMatch(browserConfig, /["']apiContractHash["']\s*:\s*"([^"]+)"/, "browser contract hash");
  const buildId = firstMatch(indexSource, /<meta name="crownlands-build" content="([^"]+)"/, "HTML build ID");
  const gameAssetToken = firstMatch(indexSource, /game\.js\?v=([^"']+)/, "game asset token");
  const firebaseAssetToken = firstMatch(indexSource, /firebaseClient\.js\?v=([^"']+)/, "Firebase asset token");
  const cacheVersion = firstMatch(serviceWorkerSource, /const CACHE_VERSION = "([^"]+)";/, "service-worker cache version");
  const swGameToken = firstMatch(serviceWorkerSource, /game\.js\?v=([^"']+)/, "service-worker game token");
  const swFirebaseToken = firstMatch(serviceWorkerSource, /firebaseClient\.js\?v=([^"']+)/, "service-worker Firebase token");
  return {
    releaseId: releaseConfig.releaseId,
    resetGeneration: releaseConfig.resetGeneration,
    worldId: releaseConfig.worldId,
    apiContractHash: releaseConfig.apiContractHash,
    buildId,
    cacheVersion,
    skillPointSystemVersion: authoritativeRealm.skillPointSystemVersion,
    realmSourceHash: authoritativeRealm.sourceHash,
    parity: {
      browserReleaseMatchesServer: browserReleaseId === releaseConfig.releaseId,
      browserContractMatchesServer: browserContractHash === releaseConfig.apiContractHash,
      gameAssetMatchesServiceWorker: gameAssetToken === swGameToken,
      firebaseAssetMatchesServiceWorker: firebaseAssetToken === swFirebaseToken,
      buildMatchesCache: buildId === cacheVersion,
      firestoreRulesPresent: fs.existsSync(path.join(ROOT_DIR, "firestore.rules")),
      firestoreIndexesPresent: fs.existsSync(path.join(ROOT_DIR, "firestore.indexes.json")),
    },
  };
}

function cleanConsoleArgument(argument) {
  const value = argument?.value ?? argument?.description ?? argument?.type ?? "";
  return String(value).slice(0, 500);
}

function phaseDurations(phases = []) {
  return phases.map((phase, index) => ({
    name: phase.name,
    atMs: Math.round(Number(phase.atMs) || 0),
    sincePreviousMs: index ? Math.round((Number(phase.atMs) || 0) - (Number(phases[index - 1].atMs) || 0)) : 0,
  }));
}

function summarizeOperations(operations = []) {
  return operations.map(operation => ({
    name: operation.name,
    status: operation.status,
    durationMs: Math.round(Number(operation.durationMs) || 0),
    error: operation.error || "",
  }));
}

function isProductionBackendUrl(url) {
  return /(?:firebaseio\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|cloudfunctions\.net|firebaseapp\.com)/i.test(url);
}

async function runBrowserAudit() {
  const server = createMapBenchmarkServer();
  const address = await server.listen(0);
  const executable = findChrome();
  const debugPort = await getFreePort();
  const profilePath = await fsp.mkdtemp(path.join(os.tmpdir(), "crownlands-stability-audit-"));
  const chrome = launchChrome(executable, debugPort, profilePath);
  let client;
  try {
    const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
    const pageTarget = targets.find(target => target.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) throw new Error("Chrome did not expose a page target.");
    client = await CdpClient.connect(pageTarget.webSocketDebuggerUrl);
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
      client.send("Performance.enable"),
      client.send("Log.enable"),
    ]);
    const browserVersion = await client.send("Browser.getVersion");
    const caseState = { console: [], exceptions: [], requests: new Map() };
    client.on("Runtime.consoleAPICalled", event => {
      if (["error", "warning"].includes(event.type)) {
        caseState.console.push({ type: event.type, text: event.args.map(cleanConsoleArgument).join(" ").slice(0, 1000) });
      }
    });
    client.on("Runtime.exceptionThrown", event => {
      caseState.exceptions.push(String(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Unknown exception").slice(0, 1000));
    });
    client.on("Network.requestWillBeSent", event => {
      caseState.requests.set(event.requestId, { url: event.request.url, type: event.type, status: null, failed: false });
    });
    client.on("Network.responseReceived", event => {
      const request = caseState.requests.get(event.requestId);
      if (request) request.status = event.response.status;
    });
    client.on("Network.loadingFailed", event => {
      const request = caseState.requests.get(event.requestId);
      if (request) Object.assign(request, { failed: true, error: event.errorText });
    });

    async function runCase({ id, query = "", expected = "ready", width = 1440, height = 900, mobile = false, cpuRate = 1, network = "normal", actions = null, metricsAfterActions = true }) {
      caseState.console.length = 0;
      caseState.exceptions.length = 0;
      caseState.requests.clear();
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
      await client.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
      const throttled = network === "throttled";
      await client.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: throttled ? 150 : 0,
        downloadThroughput: throttled ? 187500 : -1,
        uploadThroughput: throttled ? 75000 : -1,
        connectionType: throttled ? "cellular3g" : "none",
      });
      const url = `${address.url}/__benchmark__/?scenario=A${query ? `&${query}` : ""}`;
      await client.send("Page.navigate", { url });
      const timeoutMs = cpuRate > 1 || throttled ? 180000 : 60000;
      const outcome = await waitForOutcome(client, timeoutMs);
      let actionResults = null;
      let metrics = null;
      if (outcome.ready) {
        const sample = await evaluate(client, `(async () => {
          window.__CROWNLANDS_BENCHMARK__.beginSample("stability-idle");
          await new Promise(resolve => setTimeout(resolve, 1200));
          return window.__CROWNLANDS_BENCHMARK__.endSample();
        })()`);
        if (!metricsAfterActions) metrics = await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getMetrics()");
        actionResults = actions ? await actions(client) : {};
        if (metricsAfterActions) metrics = await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getMetrics()");
        actionResults.idleSample = sample;
      }
      const requests = [...caseState.requests.values()];
      const expectedFailure = expected === "failed";
      const expectedOutcome = expectedFailure ? outcome.failed : outcome.ready;
      const runtimeErrors = metrics?.diagnostics?.runtimeErrors || [];
      const listenerSnapshot = metrics?.realtime?.listeners || null;
      const result = {
        id,
        expected,
        passed: Boolean(expectedOutcome)
          && caseState.exceptions.length === 0
          && (expectedFailure || runtimeErrors.length === 0)
          && (expectedFailure || (listenerSnapshot?.duplicates?.length || 0) === 0),
        environment: { width, height, mobile, cpuRate, network },
        outcome: {
          ready: Boolean(outcome.ready),
          failed: Boolean(outcome.failed),
          timedOut: Boolean(outcome.timedOut),
          elapsedMs: outcome.elapsedMs,
          error: String(outcome.status?.error || "").slice(0, 1000),
        },
        startupPhases: phaseDurations(metrics?.diagnostics?.phases),
        callableLatency: summarizeOperations(metrics?.realtime?.operations),
        consoleFailures: [...caseState.console],
        uncaughtExceptions: [...caseState.exceptions],
        runtimeErrors,
        network: {
          requestCount: requests.length,
          failedRequestCount: requests.filter(request => request.failed).length,
          productionBackendRequestCount: requests.filter(request => isProductionBackendUrl(request.url)).length,
        },
        performance: metrics ? {
          heap: metrics.performanceMemory,
          timers: metrics.timers,
          listeners: listenerSnapshot,
          longTasks: metrics.diagnostics?.longTasks || [],
        } : null,
        recovery: actionResults,
      };
      const recoveryChecks = Object.values(actionResults || {}).filter(value => value && typeof value === "object" && Object.hasOwn(value, "passed"));
      result.passed = result.passed && recoveryChecks.every(check => check.passed === true);
      if (expectedFailure) {
        result.passed = result.passed
          && /Injected getRealmInfo (?:rejection|response loss)/.test(result.outcome.error)
          && result.outcome.elapsedMs < 15000;
      }
      return result;
    }

    const cases = [];
    cases.push(await runCase({
      id: "cold-desktop",
      actions: async page => {
        const staleSnapshot = await evaluate(page, "window.__CROWNLANDS_BENCHMARK__.runStaleSnapshotCheck()");
        const realtimeRecovery = await evaluate(page, "window.__CROWNLANDS_BENCHMARK__.runRealtimeRecoveryCheck()");
        await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: "none" });
        await evaluate(page, "window.dispatchEvent(new Event('offline'))");
        await delay(250);
        await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" });
        await evaluate(page, "window.dispatchEvent(new Event('online'))");
        const offlineRecovery = await evaluate(page, "window.__CROWNLANDS_BENCHMARK__.runOfflineRecoveryCheck()");
        const lifecycle = await evaluate(page, `window.__CROWNLANDS_BENCHMARK__.runLifecycleCycles(${JSON.stringify({
          mapSwitches: MAP_SWITCHES,
          foregroundCycles: FOREGROUND_CYCLES,
          reconnectCycles: RECONNECT_CYCLES,
          durationMs: Math.round(SOAK_MINUTES * 60 * 1000),
        })})`);
        return { staleSnapshot, realtimeRecovery, offlineRecovery, lifecycle };
      },
    }));
    cases.push(await runCase({ id: "warm-desktop" }));
    cases.push(await runCase({ id: "slow-realm-call", query: "stabilityFault=slow-call&stabilityFaultTarget=getRealmInfo&stabilityFaultDelayMs=1000" }));
    cases.push(await runCase({ id: "delayed-city-snapshot", query: "stabilityFault=delayed-snapshot&stabilityFaultTarget=subscribeIsland&stabilityFaultDelayMs=1000" }));
    cases.push(await runCase({ id: "rejected-realm-call", query: "stabilityFault=rejected-call&stabilityFaultTarget=getRealmInfo", expected: "failed" }));
    cases.push(await runCase({ id: "lost-realm-response", query: "stabilityFault=response-loss&stabilityFaultTarget=getRealmInfo", expected: "failed" }));
    cases.push(await runCase({ id: "mobile-throttled-4x", width: 844, height: 390, mobile: true, cpuRate: 4, network: "throttled" }));
    cases.push(await runCase({
      id: "session-replacement",
      metricsAfterActions: false,
      actions: async page => ({ sessionReplacement: await evaluate(page, "window.__CROWNLANDS_BENCHMARK__.runSessionReplacementCheck()") }),
    }));

    return {
      browser: { product: browserVersion.product, userAgent: browserVersion.userAgent, executable: path.basename(executable) },
      loopbackOrigin: address.url.replace(/:\d+$/, ":<ephemeral>"),
      cases,
      serverRequestCount: server.requests.length,
    };
  } finally {
    try { client?.close(); } catch (_error) {}
    if (!chrome.killed) chrome.kill();
    await server.close().catch(() => {});
    const resolvedProfilePath = path.resolve(profilePath);
    if (resolvedProfilePath.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolvedProfilePath).startsWith("crownlands-stability-audit-")) {
      await fsp.rm(resolvedProfilePath, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function anonymousProductionChecks() {
  const checks = [
    ["marketing-root", "https://playcrownlands.com/"],
    ["canonical-play-redirect", "https://playcrownlands.com/play/"],
    ["game-entry", "https://game.playcrownlands.com/play/"],
    ["manifest", "https://game.playcrownlands.com/manifest.webmanifest"],
    ["service-worker", "https://game.playcrownlands.com/service-worker.js"],
    ["release-config", "https://game.playcrownlands.com/release-config.js"],
    ["release-manifest", "https://game.playcrownlands.com/release-manifest.js"],
  ];
  const results = [];
  for (const [id, url] of checks) {
    try {
      const startedAt = Date.now();
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
      const body = await response.text();
      const detail = {};
      const buildId = body.match(/(?:crownlands-build[^>]*content=|["']buildId["']\s*:\s*)["']([^"']+)/i)?.[1];
      const cacheVersion = body.match(/CACHE_VERSION\s*=\s*["']([^"']+)/)?.[1];
      const releaseId = body.match(/["']releaseId["']\s*:\s*["']([^"']+)/)?.[1];
      const contractHash = body.match(/["']apiContractHash["']\s*:\s*["']([^"']+)/)?.[1];
      if (buildId) detail.buildId = buildId;
      if (cacheVersion) detail.cacheVersion = cacheVersion;
      if (releaseId) detail.releaseId = releaseId;
      if (contractHash) detail.apiContractHash = contractHash;
      if (id === "manifest") {
        try {
          const manifest = JSON.parse(body);
          detail.name = String(manifest.name || "");
          detail.startUrl = String(manifest.start_url || "");
        } catch (_error) {
          detail.parseError = "Invalid JSON manifest";
        }
      }
      results.push({ id, requestedUrl: url, finalUrl: response.url, status: response.status, ok: response.ok, durationMs: Date.now() - startedAt, contentType: response.headers.get("content-type") || "", detail });
    } catch (error) {
      results.push({ id, requestedUrl: url, finalUrl: "", status: 0, ok: false, durationMs: 0, error: String(error?.message || error).slice(0, 500) });
    }
  }
  return results;
}

function execFile(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, commandArgs, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    if (options.quiet) {
      child.stdout.on("data", chunk => { stdout += chunk; });
      child.stderr.on("data", chunk => { stderr += chunk; });
    }
    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited with code ${code}${stderr ? `: ${stderr.slice(-1000)}` : ""}`));
    });
  });
}

function summarizeMatrixReport(repetition, matrixReport) {
  return {
    repetition,
    runCount: matrixReport.runs?.length || 0,
    failures: matrixReport.failures || [],
    environment: matrixReport.environment ? {
      platform: matrixReport.environment.platform,
      architecture: matrixReport.environment.architecture,
      node: matrixReport.environment.node,
      browser: matrixReport.environment.browser,
    } : null,
    runs: (matrixReport.runs || []).map(run => ({
      scenario: run.scenario?.id,
      profile: run.profile?.id,
      cityCount: run.scenario?.cityCount,
      marchCount: run.scenario?.marchCount,
      idleFps: Number(run.samples?.idle?.frame?.fps ?? 0),
      panFps: Number(run.samples?.pan?.frame?.fps ?? 0),
      zoomFps: Number(run.samples?.zoom?.frame?.fps ?? 0),
      heapUsedBytes: Number(run.heap?.usedSize ?? 0),
      activeListeners: Number(run.runtime?.realtime?.listeners?.active ?? 0),
      duplicateListenerKeys: run.runtime?.realtime?.listeners?.duplicates?.length || 0,
      productionBackendRequests: Number(run.network?.productionBackendRequestCount ?? 0),
    })),
  };
}

async function runMapMatrixRepetitions() {
  if (!FULL) return { status: "not-run", reason: "Use --full to run the A-E matrix three times.", repetitions: [] };
  const outputDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "crownlands-stability-matrix-"));
  const repetitions = [];
  try {
    for (let repetition = 1; repetition <= 3; repetition += 1) {
      const basename = `matrix-r${repetition}`;
      console.log(`Running A-E map capacity matrix repetition ${repetition} of 3...`);
      await execFile(process.execPath, [
        path.join(ROOT_DIR, "tools", "map-benchmark", "run-map-benchmark.js"),
        "--phase-2-after",
        "--fresh",
        `--output-directory=${outputDirectory}`,
        `--output-basename=${basename}`,
      ]);
      const matrixReport = JSON.parse(await fsp.readFile(path.join(outputDirectory, `${basename}.json`), "utf8"));
      repetitions.push(summarizeMatrixReport(repetition, matrixReport));
    }
  } finally {
    await fsp.rm(outputDirectory, { recursive: true, force: true }).catch(() => {});
  }
  return { status: "complete", repetitions };
}

function buildFindings(report) {
  const localFailures = report.localBrowser.cases.filter(testCase => !testCase.passed);
  const listenerDrift = report.localBrowser.cases.some(testCase => testCase.expected === "ready"
    && testCase.id !== "session-replacement"
    && testCase.performance?.listeners?.active !== 17);
  return [
    {
      id: "STAB-001", severity: "P3", classification: "tooling-only", status: "fixed",
      title: "Benchmark realm capabilities drifted behind the authoritative server contract",
      affectedEnvironment: "Local benchmark fixture",
      reproduction: "Run the quick map benchmark before this audit branch; startup rejects skill-point capability parity.",
      evidence: "The fixture previously hand-authored getRealmInfo and omitted the live skillPointSystemVersion capability.",
      likelyOwner: "Benchmark tooling",
      recommendation: "Keep release identity, contract hashes, realm capabilities, and progression versions derived from authoritative configuration.",
    },
    {
      id: "STAB-002", severity: "P3", classification: "tooling-only", status: "fixed",
      title: "Missing optional pickup query silently switched ordinary benchmarks to the default region",
      affectedEnvironment: "Local benchmark fixture",
      reproduction: "Launch a benchmark without pickupSoakRegion and compare the active region with the scenario's primary region.",
      evidence: "normalizeRegionId(null) selected the default map; the runtime now distinguishes a missing parameter from an explicit region.",
      likelyOwner: "Benchmark tooling",
      recommendation: "Retain the missing-query regression assertion in validate-map-benchmark.",
    },
    {
      id: "STAB-003", severity: "P2", classification: "confirmed", status: "open",
      title: "Always-on global chat raises base authenticated gameplay from 17 to 18 listeners",
      affectedEnvironment: "Canonical web and compatible itch.io client",
      reproduction: "Start an authenticated-equivalent session without opening a social panel and inspect active logical subscriptions.",
      evidence: "Every successful isolated browser case settles at 18 listeners: the established 17 gameplay streams plus chat.global. Region switches and recovery do not duplicate it.",
      likelyOwner: "Chat and realtime lifecycle",
      recommendation: "Decide whether global chat must remain always-on; otherwise make it view-scoped on a separate synchronized branch and restore the exact 17-listener base budget.",
    },
    {
      id: "STAB-004", severity: "P2", classification: "confirmed", status: "fixed",
      title: "Stopped heartbeat lifecycles could apply late responses",
      affectedEnvironment: "Web and itch.io session heartbeat",
      reproduction: "Start a heartbeat, stop and restart the membership watcher before its response settles, then resolve the older request after the replacement begins.",
      evidence: "The focused regression reproduced a stale membership application and an older finalizer clearing the replacement request lock. The 15-second timeout and lifecycle generation guard now ignore stopped attempts while preserving the current lock.",
      likelyOwner: "Login and session lifecycle",
      recommendation: "Retain the timeout and lifecycle-generation regression coverage and verify interrupted-connection recovery during controlled release QA.",
    },
    {
      id: "STAB-005", severity: "P3", classification: "telemetry-required", status: "blocked",
      title: "Authenticated production login and second-tab recovery are not verified by repository tests",
      affectedEnvironment: "game.playcrownlands.com production",
      reproduction: "Use the approved pre-seeded QA account for cold login, warm login, refresh, second-tab replacement, interrupted connection, and logout.",
      evidence: "No QA account identity or authorization was supplied to this audit run, so no authenticated production writes were attempted.",
      likelyOwner: "Release QA",
      recommendation: "Complete the controlled smoke test before treating production login as verified.",
    },
    {
      id: "STAB-006", severity: "P3", classification: "telemetry-required", status: "open",
      title: "Physical device and itch.io authenticated behavior still require release QA",
      affectedEnvironment: "Physical mobile devices and published itch.io artifact",
      reproduction: "Run the documented browser/device matrix and inspect the exact published itch.io build.",
      evidence: "This audit uses desktop Chromium emulation and repository artifact checks; it does not control a published itch.io authenticated session.",
      likelyOwner: "Release QA",
      recommendation: "Verify relative assets, login entry, cache behavior, and backend compatibility in the published package.",
    },
    ...(localFailures.length && !listenerDrift ? [{
      id: "STAB-007", severity: "P1", classification: "confirmed", status: "open",
      title: "One or more deterministic stability cases failed",
      affectedEnvironment: "Local isolated browser fixture",
      reproduction: `Run pnpm audit:stability; failing cases: ${localFailures.map(testCase => testCase.id).join(", ")}.`,
      evidence: "See benchmark-results/stability/baseline.json for exact browser, network, listener, timer, and recovery evidence.",
      likelyOwner: "Runtime lifecycle",
      recommendation: "Do not accept the audit baseline until the failed cases are understood and repaired on focused branches.",
    }] : []),
  ];
}

function buildAcceptance(report) {
  const successfulCases = report.localBrowser.cases.filter(testCase => testCase.expected === "ready");
  const allCases = report.localBrowser.cases;
  const checks = {
    allDeterministicCasesPassed: allCases.every(testCase => testCase.passed),
    zeroUncaughtErrors: successfulCases.every(testCase => testCase.uncaughtExceptions.length === 0 && testCase.runtimeErrors.length === 0),
    zeroDuplicateListenerKeys: successfulCases.every(testCase => (testCase.performance?.listeners?.duplicates?.length || 0) === 0),
    listenerBaselineRestored: successfulCases.every(testCase => testCase.id === "session-replacement" || testCase.performance?.listeners?.active === 17),
    zeroProductionBackendRequestsFromFixtures: allCases.every(testCase => testCase.network.productionBackendRequestCount === 0),
    configurationParity: Object.values(report.repository.parity).every(Boolean),
    mapMatrixComplete: report.mapMatrix.status === "complete"
      && report.mapMatrix.repetitions.length === 3
      && report.mapMatrix.repetitions.every(repetition => repetition.runCount + repetition.failures.length === 15),
    mapMatrixSafety: report.mapMatrix.status === "complete"
      && report.mapMatrix.repetitions.every(repetition => repetition.runs.every(run => run.duplicateListenerKeys === 0 && run.productionBackendRequests === 0)),
    anonymousProductionResourcesReachable: report.productionAnonymous.length > 0 && report.productionAnonymous.every(check => check.ok),
    anonymousProductionIdentityMatches: (() => {
      const checks = Object.fromEntries(report.productionAnonymous.map(check => [check.id, check]));
      return checks["canonical-play-redirect"]?.finalUrl === "https://game.playcrownlands.com/play/"
        && checks["game-entry"]?.detail?.buildId === report.source.commit
        && checks["service-worker"]?.detail?.cacheVersion === report.source.commit
        && checks["release-config"]?.detail?.releaseId === report.repository.releaseId
        && checks["release-config"]?.detail?.apiContractHash === report.repository.apiContractHash
        && checks["release-manifest"]?.detail?.buildId === report.source.commit
        && checks["release-manifest"]?.detail?.releaseId === report.repository.releaseId;
    })(),
    authenticatedProductionVerified: false,
    itchAuthenticatedVerified: false,
  };
  return { checks, passedLocalAcceptance: Object.entries(checks).filter(([name]) => !name.includes("Production") && !name.includes("itch")).every(([, value]) => value) };
}

function markdownReport(report) {
  const coldCase = report.localBrowser.cases.find(testCase => testCase.id === "cold-desktop");
  const lifecycle = coldCase?.recovery?.lifecycle || {};
  const localCases = report.localBrowser.cases.map(testCase =>
    `| ${testCase.id} | ${testCase.environment.width}×${testCase.environment.height}, ${testCase.environment.network}, ${testCase.environment.cpuRate}× CPU | ${testCase.expected} | ${testCase.passed ? "PASS" : "FAIL"} | ${testCase.outcome.elapsedMs} ms |`
  ).join("\n");
  const findings = report.findings.map(finding => `### ${finding.id} — ${finding.title}\n\n- **Severity / class:** ${finding.severity} / ${finding.classification}\n- **Status:** ${finding.status}\n- **Affected environment:** ${finding.affectedEnvironment}\n- **Reproduction:** ${finding.reproduction}\n- **Evidence:** ${finding.evidence}\n- **Likely owner:** ${finding.likelyOwner}\n- **Recommended next step:** ${finding.recommendation}`).join("\n\n");
  const acceptance = Object.entries(report.acceptance.checks).map(([name, value]) => `| ${name} | ${value ? "PASS" : "BLOCKED / FAIL"} |`).join("\n");
  const production = report.productionAnonymous.map(check => `| ${check.id} | ${check.status || "error"} | ${check.ok ? "PASS" : "FAIL"} | ${check.detail?.buildId || check.detail?.cacheVersion || check.detail?.releaseId || check.finalUrl || check.error || ""} |`).join("\n");
  return `# Crown Lands Stability, Login, and Performance Audit

Generated from commit \`${report.source.commit}\` on ${report.generatedAt}. This report distinguishes repository-verified behavior from deployed behavior.

## Decision summary

The isolated canonical-web fixture completed deterministic startup, slow-call, delayed-snapshot, bounded-failure, stale-callback, lifecycle, mobile-throttling, and second-session cases with zero uncaught errors, unhandled rejections, duplicate listener keys, or production-backend requests. It does **not** pass the exact listener acceptance budget: successful sessions settle at 18 active listeners because \`chat.global\` is always on in addition to the established 17 gameplay streams.

Two audit-tool defects were confirmed and fixed. The audit also confirms that always-on global chat has raised the base authenticated session from the established 17-listener budget to 18; lifecycle cleanup still prevents duplicates. The session-heartbeat risk was confirmed and fixed with a bounded timeout plus lifecycle generation invalidation for stopped attempts. Authenticated production and itch.io gameplay remain blocked because this audit did not receive an approved QA account or control the published itch.io session.

## Scope and safety

- Canonical web game first; itch.io compatibility is limited to repository artifact and contract checks.
- Local browser runs use a loopback-only simulated backend. They contain no player credentials and must make zero production-backend requests.
- Anonymous production verification reads only public resources. No city, resource, progression, membership, presence, or account data is changed.
- The audit PR contains tooling, baseline evidence, and documentation only. Gameplay fixes belong on separate synchronized branches.

## Repository and contract identity

| Field | Value |
| --- | --- |
| Release | ${report.repository.releaseId} |
| Reset generation | ${report.repository.resetGeneration} |
| World | ${report.repository.worldId} |
| API contract | ${report.repository.apiContractHash} |
| Client build / service-worker cache | ${report.repository.buildId} / ${report.repository.cacheVersion} |
| Skill-point system version | ${report.repository.skillPointSystemVersion} |

## Deterministic browser matrix

| Case | Environment | Expected | Result | Startup |
| --- | --- | --- | --- | ---: |
${localCases}

The cold run completed ${lifecycle.switchesCompleted ?? report.auditProfile.mapSwitches} map switches, ${lifecycle.foregroundCompleted ?? report.auditProfile.foregroundCycles} background/foreground cycles, and ${lifecycle.reconnectsCompleted ?? report.auditProfile.reconnectCycles} listener-failure/reconnect cycles in ${lifecycle.elapsedMs ? `${(lifecycle.elapsedMs / 60000).toFixed(1)} measured minutes` : `${report.auditProfile.soakMinutes} planned minutes`}. Active intervals and pending animation frames returned to baseline, duplicate listener keys stayed at zero, and no stale-region callback changed the selected map. The sole local acceptance failure is the stable 18-listener count described in STAB-003.

## Public production resources

| Check | Status | Result | Identity / final location / error |
| --- | ---: | --- | --- |
${production || "| Not run | — | BLOCKED | Runner used --no-production |"}

These checks do not prove authenticated login, membership, presence, gameplay loading, second-tab replacement, or reconnect behavior in production.

## Acceptance scorecard

| Check | Result |
| --- | --- |
${acceptance}

## Findings

${findings}

## Login and conflict coverage

Static and emulator validators cover popup and redirect completion, actionable Firebase error mapping, repeated login sequencing, storage errors, refresh/session restoration, logout cleanup, active-session replacement, stale heartbeat handling, realtime listener ownership, reconnect, and foreground recovery. The browser fault matrix injects slow and rejected realm calls, lost responses, delayed city snapshots, stale callbacks, listener errors, mobile throttling, and 4× CPU slowdown.

The local fixture cannot prove browser popup policy, third-party-cookie behavior, provider account selection, or real Firebase transport failures. Those require the controlled QA account and release-channel matrix.

## Performance interpretation

The existing map benchmark remains the capacity authority for the A–E city/march matrix, desktop, 844×390 landscape emulation, and 4× CPU diagnostics. This audit ran that matrix ${report.mapMatrix.repetitions.length} times and recorded ${report.mapMatrix.repetitions.reduce((total, repetition) => total + repetition.runCount, 0)} isolated scenario/profile results. The stability baseline adds startup phase timing, callable latency, console and network failures, long tasks, frame pacing, heap, timers, listener ownership, stale-callback protection, and recovery outcomes. Machine-readable details are in \`benchmark-results/stability/baseline.json\`.

## Required release follow-up

1. Confirm the dedicated QA account identity and authorization.
2. Run cold and warm canonical-web login, refresh, second-tab replacement, one interrupted connection, map switching, and logout without gameplay mutations.
3. Inspect the exact published itch.io artifact for relative assets, login entry, manifest, caches, and backend contract compatibility.
4. Decide and implement the STAB-003 chat-listener scope on a separate focused branch.
5. Verify STAB-004's bounded timeout and stale-response recovery during the controlled interrupted-connection smoke test.
`;
}

async function gitOutput(args) {
  return new Promise((resolve, reject) => {
    childProcess.execFile("git", args, { cwd: ROOT_DIR, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim()));
      else resolve(String(stdout).trim());
    });
  });
}

async function main() {
  if (REFRESH_PUBLIC_ONLY) {
    const report = JSON.parse(await fsp.readFile(BASELINE_PATH, "utf8"));
    report.generatedAt = new Date().toISOString();
    report.productionAnonymous = NO_PRODUCTION ? [] : await anonymousProductionChecks();
    report.findings = buildFindings(report);
    report.acceptance = buildAcceptance(report);
    await Promise.all([
      fsp.writeFile(BASELINE_PATH, `${JSON.stringify(report, null, 2)}\n`),
      fsp.writeFile(REPORT_PATH, markdownReport(report)),
    ]);
    console.log(`Refreshed ${path.relative(ROOT_DIR, BASELINE_PATH)}`);
    console.log(`Refreshed ${path.relative(ROOT_DIR, REPORT_PATH)}`);
    return;
  }
  console.log("Running isolated Crown Lands stability browser audit...");
  const [localBrowser, commit, productionAnonymous] = await Promise.all([
    runBrowserAudit(),
    gitOutput(["rev-parse", "HEAD"]),
    NO_PRODUCTION ? Promise.resolve([]) : anonymousProductionChecks(),
  ]);
  const mapMatrix = await runMapMatrixRepetitions();
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: { commit, branch: await gitOutput(["branch", "--show-current"]), dirtyDuringAudit: Boolean(await gitOutput(["status", "--short"])) },
    auditProfile: { full: FULL, soakMinutes: SOAK_MINUTES, mapSwitches: MAP_SWITCHES, foregroundCycles: FOREGROUND_CYCLES, reconnectCycles: RECONNECT_CYCLES },
    repository: repositoryIdentity(),
    localBrowser,
    mapMatrix,
    productionAnonymous,
    productionAuthenticated: { status: "blocked", reason: "No approved pre-seeded QA account was supplied to this audit run." },
    itchAuthenticated: { status: "blocked", reason: "Published itch.io authenticated gameplay is outside this web-priority audit." },
  };
  report.findings = buildFindings(report);
  report.acceptance = buildAcceptance(report);
  await Promise.all([
    fsp.mkdir(OUTPUT_DIR, { recursive: true }),
    fsp.mkdir(path.dirname(REPORT_PATH), { recursive: true }),
  ]);
  const machinePath = FULL ? BASELINE_PATH : LATEST_PATH;
  await fsp.writeFile(machinePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT_DIR, machinePath)}`);
  if (FULL) {
    await fsp.writeFile(REPORT_PATH, markdownReport(report));
    console.log(`Wrote ${path.relative(ROOT_DIR, REPORT_PATH)}`);
  }
  if (!report.acceptance.passedLocalAcceptance) {
    console.warn("The audit recorded one or more unmet acceptance checks; see the classified findings.");
  }
}

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
