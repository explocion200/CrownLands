#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { classifyGitDiff, STATIC_PUBLIC_PAGES } = require("./change-risk-classifier");
const { CdpClient, fetchJson } = require("./map-benchmark/cdp-client");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const BROWSER_EXIT_TIMEOUT_MS = 3000;
const PROFILE_CLEANUP_ATTEMPTS = 6;
const PROFILE_CLEANUP_RETRY_MS = 100;
const RETRYABLE_PROFILE_CLEANUP_ERRORS = new Set(["EBUSY", "EMFILE", "ENFILE", "ENOTEMPTY", "EPERM"]);
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
]);

function parseArguments(args) {
  const options = { baseRef: "origin/main", headRef: "HEAD" };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--base") options.baseRef = args[++index];
    else if (args[index] === "--head") options.headRef = args[++index];
    else throw new Error(`Unknown option: ${args[index]}`);
    if (!args[index]) throw new Error(`${args[index - 1]} requires a value.`);
  }
  return options;
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CROWNLANDS_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error("Chrome, Chromium, or Edge was not found. Set CHROME_PATH to a Chromium executable.");
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

function createStaticServer() {
  assert.ok(fs.existsSync(dist), "dist must be built before the focused browser smoke test.");
  return http.createServer((request, response) => {
    const requestedUrl = new URL(request.url || "/", "http://127.0.0.1");
    let relativePath;
    try {
      relativePath = decodeURIComponent(requestedUrl.pathname).replace(/^\/+/, "") || "index.html";
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    const absolutePath = path.resolve(dist, relativePath.replace(/\//g, path.sep));
    if (absolutePath !== dist && !absolutePath.startsWith(`${dist}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": MIME_TYPES.get(path.extname(absolutePath).toLowerCase()) || "application/octet-stream",
    });
    fs.createReadStream(absolutePath).pipe(response);
  });
}

function focusedPages(paths) {
  const pages = new Set();
  for (const filePath of paths) {
    if (STATIC_PUBLIC_PAGES.has(filePath)) pages.add(filePath);
    if (/^(?:public-site\.js|site-info\.css)$/i.test(filePath)) pages.add("home.html");
    if (/^roadmap(?:-data)?\.js$|^roadmap\.css$/i.test(filePath)) pages.add("roadmap.html");
    if (/^patch-notes\.js$/i.test(filePath)) pages.add("updates.html");
    if (/\.css$/i.test(filePath) && !/^(?:battle-economy-guide|daily-rewards|roadmap|site-info)\.css$/i.test(filePath)) {
      pages.add("index.html");
    }
    if (/^(?:animation-manager|audio-manager|ui-layout-config|ui-layout-runtime)\.js$/i.test(filePath)) {
      pages.add("index.html");
    }
    if (/\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i.test(filePath)) pages.add("index.html");
  }
  if (!pages.size) pages.add("index.html");
  return [...pages].sort().slice(0, 4);
}

function launchBrowser(executable, debugPort, profilePath) {
  return childProcess.spawn(executable, [
    "--headless=new",
    "--no-sandbox",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=MediaRouter,OptimizationHints,Translate",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
}

function waitForProcessExit(browserProcess, timeoutMs = BROWSER_EXIT_TIMEOUT_MS) {
  if (!browserProcess || browserProcess.exitCode !== null || browserProcess.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise(resolve => {
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      browserProcess.removeListener("exit", onExit);
      resolve(browserProcess.exitCode !== null || browserProcess.signalCode !== null);
    }, timeoutMs);
    browserProcess.once("exit", onExit);
  });
}

async function removeBrowserProfile(profilePath, options = {}) {
  const expectedPrefix = path.join(os.tmpdir(), "crownlands-browser-smoke-");
  if (!profilePath.startsWith(expectedPrefix)) {
    throw new Error(`Refusing to clean unexpected browser profile: ${profilePath}`);
  }
  const remove = options.remove || fs.promises.rm;
  const attempts = options.attempts || PROFILE_CLEANUP_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? PROFILE_CLEANUP_RETRY_MS;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await remove(profilePath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!RETRYABLE_PROFILE_CLEANUP_ERRORS.has(error.code) || attempt === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
    }
  }
}

function waitForEvent(client, method, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${method}.`));
    }, timeoutMs);
    const unsubscribe = client.on(method, value => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(value);
    });
  });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed.");
  }
  return result.result?.value;
}

async function loadScenario(client, baseUrl, page, viewport) {
  const runtimeErrors = [];
  const removeExceptionListener = client.on("Runtime.exceptionThrown", event => {
    runtimeErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Unknown runtime exception");
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = waitForEvent(client, "Page.loadEventFired");
  const targetUrl = `${baseUrl}/${page}?validation-smoke=${viewport.name}`;
  const navigation = await client.send("Page.navigate", { url: targetUrl });
  assert.ok(!navigation.errorText, `${page} failed navigation: ${navigation.errorText}`);
  await loaded;
  await new Promise(resolve => setTimeout(resolve, 250));
  const metrics = await evaluate(client, `(() => ({
    bodyTextLength: (document.body?.innerText || "").trim().length,
    documentHeight: document.documentElement?.scrollHeight || 0,
    documentWidth: document.documentElement?.scrollWidth || 0,
    hasExpectedRoot: ${JSON.stringify(page)} === "index.html"
      ? Boolean(document.querySelector("#setupScreen"))
      : Boolean(document.querySelector("main, article, .public-page, .site-shell")),
    readyState: document.readyState,
    styleSheetCount: document.styleSheets.length,
    title: document.title.trim(),
    viewportHeight: innerHeight,
    viewportWidth: innerWidth
  }))()`);
  removeExceptionListener();

  assert.equal(metrics.readyState, "complete", `${page} did not reach a complete browser document.`);
  assert.ok(metrics.title, `${page} rendered without a title.`);
  assert.ok(metrics.bodyTextLength >= 40, `${page} rendered too little visible content.`);
  assert.ok(metrics.hasExpectedRoot, `${page} did not render its expected page root.`);
  assert.ok(metrics.styleSheetCount >= 1, `${page} loaded no stylesheets.`);
  assert.equal(metrics.viewportWidth, viewport.width, `${page} missed the ${viewport.name} viewport width.`);
  assert.equal(metrics.viewportHeight, viewport.height, `${page} missed the ${viewport.name} viewport height.`);
  if (runtimeErrors.length) {
    throw new Error(`${page} raised browser runtime exceptions:\n- ${runtimeErrors.join("\n- ")}`);
  }
  console.log(`[Crownlands] Browser smoke passed: ${page} at ${viewport.width}x${viewport.height}.`);
}

async function closeBrowser(client, browserProcess, profilePath) {
  try {
    if (client) {
      await client.send("Browser.close").catch(() => {});
      client.close();
    }
    let exited = await waitForProcessExit(browserProcess);
    if (!exited) {
      browserProcess.kill();
      exited = await waitForProcessExit(browserProcess);
    }
    if (!exited) {
      browserProcess.kill("SIGKILL");
      await waitForProcessExit(browserProcess, 1000);
    }
  } finally {
    await removeBrowserProfile(profilePath);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const classification = classifyGitDiff(root, options);
  const pages = focusedPages(classification.files.map(item => item.path));
  const executable = findBrowser();
  const debugPort = await getFreePort();
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-browser-smoke-"));
  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browserProcess = launchBrowser(executable, debugPort, profilePath);
  let client;
  try {
    const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
    const target = targets.find(item => item.type === "page" && item.webSocketDebuggerUrl);
    assert.ok(target, "Chrome did not expose a page target for the browser smoke test.");
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
    ]);
    for (const page of pages) {
      for (const viewport of [
        { name: "desktop", width: 1440, height: 900 },
        { name: "landscape-mobile", width: 844, height: 390 },
      ]) {
        await loadScenario(client, baseUrl, page, viewport);
      }
    }
    console.log(`[Crownlands] Focused production-browser smoke passed for ${pages.join(", ")} in desktop and landscape-mobile viewports.`);
  } finally {
    server.close();
    await closeBrowser(client, browserProcess, profilePath);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[Crownlands] Focused browser smoke failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { focusedPages, removeBrowserProfile, waitForProcessExit };
