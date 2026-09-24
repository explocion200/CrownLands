"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");
const { createMapBenchmarkServer } = require("./map-benchmark/server.js");
const { CORE_EXPANSION_RUNTIME_BUDGET } = require("./map-benchmark/budgets.js");
const { bounded, sourceIdentity } = require("./stability-audit-runtime.js");
const root = process.env.CROWNLANDS_BENCHMARK_ROOT
  ? path.resolve(process.env.CROWNLANDS_BENCHMARK_ROOT) : path.resolve(__dirname, "..");
const output = path.resolve(root, process.argv.find(v => v.startsWith("--output-directory="))?.slice(19)
  || `release-artifacts/stability-compatibility/${new Date().toISOString().replace(/[:.]/g, "-")}`);
const engines = { chrome: [chromium, "chrome"], edge: [chromium, "msedge"], firefox: [firefox], webkit: [webkit] };
const selected = process.argv.find(v => v.startsWith("--engines="))?.slice(10).split(",") || Object.keys(engines);
const backend = url => /(?:firestore\.googleapis|identitytoolkit\.googleapis|cloudfunctions\.net|firebaseio\.com|\.run\.app)/i.test(url);

async function sampleFrames(page, durationMs) {
  return bounded(page.evaluate(duration => new Promise(resolve => {
    const start = performance.now(); let count = 0, id;
    const tick = () => { count++; id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    setTimeout(() => { cancelAnimationFrame(id); resolve({ count, durationMs: performance.now() - start,
      visibility: document.visibilityState, focused: document.hasFocus() }); }, duration);
  }), durationMs), durationMs + 30000, "Frame calibration");
}

async function main() {
  for (const name of selected) if (!engines[name]) throw Error(`Unknown browser: ${name}`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output, { recursive: false });
  const server = createMapBenchmarkServer(), address = await server.listen();
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), source: sourceIdentity(root), limitations: [
    "Synthetic loopback gameplay; no authenticated production transport.",
    "WebKit on Windows is not physical iOS Safari; viewport changes are not hardware orientation locks.",
    "PWA install and operating-system suspension require separate device verification.",
  ], browsers: [] };
  report.source.harness = sourceIdentity(path.resolve(__dirname, ".."));
  try {
    for (const name of selected) {
      const result = { name, cases: [], status: "failed" }; let browser;
      try {
        const [engine, channel] = engines[name];
        browser = await engine.launch({ headless: true, channel, timeout: 30000 });
        result.version = browser.version();
        for (const [width, height] of [[1440, 900], [1920, 1080], [844, 390], [568, 320]]) {
          const context = await browser.newContext({ viewport: { width, height }, hasTouch: height < 600 });
          const page = await context.newPage(), errors = [], requests = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.route("**/*", route => {
            if (backend(route.request().url())) { requests.push("blocked production backend request"); return route.abort(); }
            return route.continue();
          });
          const item = { width, height, status: "failed", errors, productionBackendRequests: requests };
          try {
            await page.setContent("<html><body>Frame calibration</body></html>");
            item.controlFrames = await sampleFrames(page, 3000);
            await page.goto(`${address.url}/__benchmark__/?scenario=A`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.documentElement.dataset.crownlandsBenchmarkReady === "true", null, { timeout: 90000 });
            item.gameFrames = await sampleFrames(page, 10000);
            item.recovery = await bounded(page.evaluate(async () => {
              const api = window.__CROWNLANDS_BENCHMARK__;
              await api.selectAndOpenCities(2);
              await api.switchNeighborAndReturn();
              return { staleSnapshot: await api.runStaleSnapshotCheck(), realtime: await api.runRealtimeRecoveryCheck(),
                offline: await api.runOfflineRecoveryCheck() };
            }), 180000, "Compatibility recovery actions");
            if (height < 600) {
              await page.setViewportSize({ width: height, height: width });
              await page.waitForTimeout(300);
              await page.setViewportSize({ width, height });
            }
            const metrics = await bounded(page.evaluate(() => window.__CROWNLANDS_BENCHMARK__.getMetrics()), 30000, "Compatibility metrics");
            item.listeners = metrics.realtime.listeners;
            item.runtimeErrors = metrics.diagnostics.runtimeErrors;
            item.status = errors.length === 0 && requests.length === 0 && item.runtimeErrors.length === 0
              && Object.values(item.recovery).every(value => value.passed)
              && item.listeners.active === CORE_EXPANSION_RUNTIME_BUDGET.activeListeners && item.listeners.duplicates.length === 0 ? "passed" : "failed";
            await page.waitForTimeout(1500);
            await page.screenshot({ path: path.join(output, `${name}-${width}x${height}.png`) });
          } catch (error) { item.error = error.message; }
          finally { await context.close(); }
          result.cases.push(item);
          console.log(`${name} ${width}x${height}: ${item.status}`);
        }
        result.status = result.cases.length === 4 && result.cases.every(item => item.status === "passed") ? "passed" : "failed";
      } catch (error) {
        result.error = error.message;
        if (!browser) result.status = "unverified";
      }
      finally { if (browser) await browser.close(); }
      report.browsers.push(result);
      await fs.writeFile(path.join(output, "compatibility.json"), JSON.stringify(report, null, 2));
    }
  } finally { await server.close(); }
  report.source.inputsUnchanged = report.source.inputDigest === sourceIdentity(root).inputDigest
    && report.source.harness.inputDigest === sourceIdentity(path.resolve(__dirname, "..")).inputDigest;
  await fs.writeFile(path.join(output, "compatibility.json"), JSON.stringify(report, null, 2));
  process.exitCode = report.source.inputsUnchanged && report.browsers.every(item => item.status === "passed") ? 0 : 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
