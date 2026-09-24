"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildAcceptance, buildFindings, markdownReport, summarizeMatrixReport } = require("./stability-audit-report.js");
const { bounded, sourceIdentity } = require("./stability-audit-runtime.js");

const { CdpClient, fetchJson } = require("./map-benchmark/cdp-client.js");
const { loadAuthoritativeRealmContract } = require("./map-benchmark/realm-contract.js");
const { createMapBenchmarkServer } = require("./map-benchmark/server.js");

const HARNESS_ROOT = path.resolve(__dirname, "..");
const ROOT_DIR = process.env.CROWNLANDS_BENCHMARK_ROOT
  ? path.resolve(process.env.CROWNLANDS_BENCHMARK_ROOT) : HARNESS_ROOT;
const args = new Set(process.argv.slice(2));
const FULL = args.has("--full");
const NO_PRODUCTION = args.has("--no-production");
const outputArgument = [...args].find(value => value.startsWith("--output-directory="));
const OUTPUT_DIR = path.resolve(ROOT_DIR, outputArgument?.split("=").slice(1).join("=")
  || `release-artifacts/stability-audit/${new Date().toISOString().replace(/[:.]/g, "-")}`);
if (args.has("--refresh-public-only")) throw new Error("Historical baselines are immutable. Run a new audit with a unique output directory.");

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
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
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
    worldTopology: releaseConfig.worldTopology,
    staticFallback: { resetGeneration: releaseConfig.resetGeneration, worldId: releaseConfig.worldId },
    apiContractHash: releaseConfig.apiContractHash,
    buildId,
    cacheVersion,
    skillPointSystemVersion: authoritativeRealm.skillPointSystemVersion,
    realmSourceHash: authoritativeRealm.sourceHash,
    sourceTemplate: { buildId, cacheVersion, buildMatchesCache: buildId === cacheVersion,
      note: "Source tokens are rewritten by the production build. Validate the built artifact and deployed manifest separately." },
    parity: {
      browserReleaseMatchesServer: browserReleaseId === releaseConfig.releaseId,
      browserContractMatchesServer: browserContractHash === releaseConfig.apiContractHash,
      gameAssetMatchesServiceWorker: gameAssetToken === swGameToken,
      firebaseAssetMatchesServiceWorker: firebaseAssetToken === swFirebaseToken,
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
  return /(?:firebaseio\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|cloudfunctions\.net|firebaseapp\.com|\.run\.app)/i.test(url);
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
    await client.send("Network.setBlockedURLs", { urls: ["*://firestore.googleapis.com/*", "*://*.firestore.googleapis.com/*", "*://*.cloudfunctions.net/*", "*://*.firebaseio.com/*", "*://identitytoolkit.googleapis.com/*", "*://securetoken.googleapis.com/*", "*://*.run.app/*"] });
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

    async function runCaseUnchecked({ id, query = "", expected = "ready", width = 1440, height = 900, mobile = false, cpuRate = 1, network = "normal", actions = null, metricsAfterActions = true }) {
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
      console.log(`Running browser case ${id}...`);
      await client.send("Page.navigate", { url });
      await client.send("Page.bringToFront");
      await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
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

    let stoppedBrowser = false;
    async function runCase(options) {
      try {
        if (stoppedBrowser) throw new Error("Not run: browser stopped after a watchdog failure.");
        return await bounded(runCaseUnchecked(options), 300000 + (options.id === "cold-desktop" ? SOAK_MINUTES * 60000 : 0), `Browser case ${options.id}`);
      }
      catch (error) {
        if (/watchdog/.test(error.message) && !stoppedBrowser) {
          stoppedBrowser = true;
          client.rejectPending(error);
          client.close();
        }
        return { id: options.id, expected: options.expected || "ready", passed: false,
          environment: { width: options.width || 1440, height: options.height || 900, cpuRate: options.cpuRate || 1 },
          outcome: { ready: false, failed: true, elapsedMs: null, error: String(error.message).slice(0, 1000) },
          uncaughtExceptions: [...caseState.exceptions], runtimeErrors: [], performance: null,
          network: { productionBackendRequestCount: [...caseState.requests.values()].filter(item => isProductionBackendUrl(item.url)).length },
        };
      }
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
    ["game-entry", "https://playcrownlands.com/play/"],
    ["manifest", "https://playcrownlands.com/manifest.webmanifest"],
    ["service-worker", "https://playcrownlands.com/service-worker.js"],
    ["release-config", "https://playcrownlands.com/release-config.js"],
    ["release-manifest", "https://playcrownlands.com/release-manifest.js"],
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

async function runMapMatrixRepetitions() {
  if (!FULL) return { status: "not-run", reason: "Use --full to run the A-E matrix three times.", repetitions: [] };
  const outputDirectory = path.join(OUTPUT_DIR, "matrix");
  await fsp.mkdir(outputDirectory, { recursive: true });
  const repetitions = [];
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    try {
      const basename = `matrix-r${repetition}`;
      console.log(`Running A-E map capacity matrix repetition ${repetition} of 3...`);
      await execFile(process.execPath, [
        path.join(__dirname, "map-benchmark", "run-map-benchmark.js"),
        "--fresh",
        `--output-directory=${outputDirectory}`,
        `--output-basename=${basename}`,
      ]);
      const matrixReport = JSON.parse(await fsp.readFile(path.join(outputDirectory, `${basename}.json`), "utf8"));
      repetitions.push(summarizeMatrixReport(repetition, matrixReport));
    } catch (error) {
      repetitions.push({ repetition, runCount: 0, runs: [], failures: [{ reason: error.message }],
        budgets: { regression: { passed: false, failures: [error.message] }, capacity: { passed: false, failures: [error.message] } } });
    }
    await fsp.writeFile(path.join(outputDirectory, "repetitions.json"), JSON.stringify(repetitions, null, 2));
  }
  return { status: repetitions.some(item => item.failures.length) ? "incomplete" : "complete", repetitions };
}

async function gitOutput(args) {
  return new Promise((resolve, reject) => {
    childProcess.execFile("git", args, { cwd: ROOT_DIR, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim()));
      else resolve(String(stdout).trim());
    });
  });
}

async function sourceDigest() {
  const files = (await gitOutput(["ls-files", "--cached", "--others", "--exclude-standard"]))
    .split("\n").filter(file => /\.(?:js|json|css|html|rules|ya?ml)$/.test(file)
      && !file.startsWith("benchmark-results/") && !file.startsWith("docs/"));
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file).update("\0");
    hash.update(await fsp.readFile(path.join(ROOT_DIR, file)).catch(() => Buffer.from("<deleted>")));
  }
  return hash.digest("hex");
}

async function main() {
  // Refuse to overwrite evidence, including the old tracked baseline and narrative.
  if (fs.existsSync(OUTPUT_DIR)) throw new Error(`Output directory already exists: ${OUTPUT_DIR}. Choose a new run directory.`);
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const inputDigest = await sourceDigest();
  const source = { commit: await gitOutput(["rev-parse", "HEAD"]), branch: await gitOutput(["branch", "--show-current"]),
    dirtyDuringAudit: Boolean(await gitOutput(["status", "--short"])), inputDigest, startedAt };
  source.harness = sourceIdentity(HARNESS_ROOT);
  console.log("Running isolated Crownlands stability browser audit...");
  const [localBrowser, productionAnonymous] = await Promise.all([
    runBrowserAudit(), NO_PRODUCTION ? Promise.resolve([]) : anonymousProductionChecks(),
  ]);
  // Persist startup/fault evidence before a potentially long matrix or soak fails.
  await fsp.writeFile(path.join(OUTPUT_DIR, "browser.json"), JSON.stringify(localBrowser, null, 2));
  const mapMatrix = await runMapMatrixRepetitions();
  source.inputsUnchanged = inputDigest === await sourceDigest()
    && source.harness.inputDigest === sourceIdentity(HARNESS_ROOT).inputDigest;
  const report = {
    schemaVersion: 2, generatedAt: new Date().toISOString(), source,
    auditProfile: { full: FULL, soakMinutes: SOAK_MINUTES, mapSwitches: MAP_SWITCHES, foregroundCycles: FOREGROUND_CYCLES, reconnectCycles: RECONNECT_CYCLES },
    repository: repositoryIdentity(), localBrowser, mapMatrix, productionAnonymous,
  };
  report.acceptance = buildAcceptance(report);
  report.findings = buildFindings(report);
  await fsp.writeFile(path.join(OUTPUT_DIR, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  await fsp.writeFile(path.join(OUTPUT_DIR, "audit.md"), markdownReport(report));
  console.log(`Wrote ${path.relative(ROOT_DIR, OUTPUT_DIR)}: ${report.acceptance.status}`);
  process.exitCode = report.acceptance.exitCode;
}

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
