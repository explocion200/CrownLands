"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const { createFixture, SCENARIOS } = require("./fixtures.js");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const HOST = "127.0.0.1";
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".wav", "audio/wav"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function send(response, status, body, contentType, extraHeaders = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": payload.length,
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    ...extraHeaders,
  });
  response.end(payload);
}

function getScenarioId(requestUrl) {
  const id = String(requestUrl.searchParams.get("scenario") || "A").toUpperCase();
  return SCENARIOS[id] ? id : "A";
}

function applyVisualQaOverrides(fixture, requestUrl) {
  const rawMarchCount = requestUrl.searchParams.get("visualMarches");
  const visualKinds = requestUrl.searchParams.get("visualKinds") === "true";
  if (rawMarchCount === null && !visualKinds) return fixture;
  const requestedCount = visualKinds ? 5 : Math.floor(Number(rawMarchCount));
  const marchCount = Number.isFinite(requestedCount)
    ? Math.max(0, Math.min(fixture.scenario.marchCount, requestedCount))
    : fixture.scenario.marchCount;
  fixture.scenario = {
    ...fixture.scenario,
    marchCount,
    visualKinds,
    visualQa: true,
  };
  const visualSnapshots = fixture.citiesByRegion?.[fixture.primaryRegionId] || [];
  const shieldedSnapshot = visualSnapshots.find(snapshot => snapshot.ownerUid && snapshot.ownerUid !== fixture.player.uid);
  if (shieldedSnapshot) shieldedSnapshot.ownerShieldExpiresAtMs = fixture.fixedEpochMs + 24 * 60 * 60 * 1000;
  const primaryMap = fixture.mapData?.maps?.find(map => map.id === fixture.primaryRegionId);
  const sourceObjective = fixture.mapData?.maps
    ?.flatMap(map => map.objectives || [])
    .find(objective => objective.type === "gold");
  if (primaryMap && sourceObjective) {
    primaryMap.objectives = [{
      ...sourceObjective,
      id: `${fixture.primaryRegionId}_benchmark_gold_stronghold`,
      name: "Benchmark Gold Stronghold",
      x: 720,
      y: 502,
      xNorm: Number((720 / 1448).toFixed(6)),
      yNorm: Number((502 / 1086).toFixed(6)),
    }];
  }
  return fixture;
}

function browserFixture(fixture) {
  const { mapData: _mapData, ...safeFixture } = fixture;
  return safeFixture;
}

function createBenchmarkIndex(scenarioId, fixture) {
  let source = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
  const queryParams = new URLSearchParams({ scenario: scenarioId });
  if (fixture.scenario.visualQa) queryParams.set("visualMarches", String(fixture.scenario.marchCount));
  if (fixture.scenario.visualKinds) queryParams.set("visualKinds", "true");
  const query = queryParams.toString();
  source = source.replace(
    /<script src="assets\/map-editor-data\.js[^>]*><\/script>/,
    `<script src="/__benchmark__/early-instrumentation.js?${query}"></script>\n  <script src="/__benchmark__/map-editor-data.js?${query}"></script>`
  );
  source = source.replace(/<script src="release-manifest\.js"><\/script>/, `<script src="/__benchmark__/release-manifest.js?${query}"></script>`);
  source = source.replace(/<script src="firebaseClient\.js[^>]*><\/script>/, `<script src="/__benchmark__/mock-firebase.js?${query}"></script>`);
  source = source.replace(/<script src="game\.js[^>]*><\/script>/, `<script src="/__benchmark__/game.js?${query}"></script>`);
  return source;
}

function createVisualQaShell(requestUrl) {
  const width = Math.max(320, Math.min(1920, Math.floor(Number(requestUrl.searchParams.get("width")) || 1440)));
  const height = Math.max(240, Math.min(1080, Math.floor(Number(requestUrl.searchParams.get("height")) || 900)));
  const scale = Math.min(1, 1200 / width, 680 / height);
  const fixtureParams = new URLSearchParams(requestUrl.searchParams);
  fixtureParams.delete("width");
  fixtureParams.delete("height");
  const fixtureUrl = `/__benchmark__/?${fixtureParams.toString().replaceAll("&", "&amp;")}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Crownlands Phase 2 Visual QA</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-width: 100%; min-height: 100%; background: #07131f; }
    body { display: grid; place-items: start center; padding: 0; overflow: hidden; }
    .qa-frame-shell { width: ${width * scale}px; height: ${height * scale}px; overflow: hidden; }
    iframe { display: block; width: ${width}px; height: ${height}px; transform: scale(${scale}); transform-origin: 0 0; border: 0; background: #07131f; }
  </style>
</head>
<body><div class="qa-frame-shell"><iframe id="qa-frame" title="Crownlands ${width} by ${height} visual QA" src="${fixtureUrl}"></iframe></div></body>
</html>`;
}

function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_error) {
    return null;
  }
  const relative = decoded.replace(/^[/\\]+/, "");
  const resolved = path.resolve(ROOT_DIR, relative);
  return resolved.startsWith(`${ROOT_DIR}${path.sep}`) ? resolved : null;
}

function createMapBenchmarkServer() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const hostHeader = String(request.headers.host || "");
    if (!hostHeader.startsWith("127.0.0.1:") && hostHeader !== "127.0.0.1") {
      send(response, 403, "Benchmark server is loopback-only.", "text/plain; charset=utf-8");
      return;
    }
    const requestUrl = new URL(request.url || "/", `http://${hostHeader || HOST}`);
    const scenarioId = getScenarioId(requestUrl);
    const fixture = applyVisualQaOverrides(createFixture(scenarioId), requestUrl);
    requests.push({ at: new Date().toISOString(), method: request.method, path: requestUrl.pathname, scenarioId });

    if (request.method !== "GET" && request.method !== "HEAD") {
      send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
      return;
    }

    if (requestUrl.pathname === "/__benchmark__/visual-shell") {
      send(response, 200, createVisualQaShell(requestUrl), "text/html; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/" || requestUrl.pathname === "/__benchmark__/") {
      send(response, 200, createBenchmarkIndex(scenarioId, fixture), "text/html; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__benchmark__/early-instrumentation.js") {
      const prefix = `window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__ = Object.freeze(${JSON.stringify(browserFixture(fixture))});\n`;
      const source = prefix + fs.readFileSync(path.join(__dirname, "early-instrumentation.js"), "utf8");
      send(response, 200, source, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__benchmark__/map-editor-data.js") {
      send(response, 200, `window.CROWNLANDS_MAP_EDITOR_DATA = ${JSON.stringify(fixture.mapData)};\n`, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__benchmark__/release-manifest.js") {
      const manifest = {
        buildId: "phase-0-benchmark",
        contractHash: fixture.releaseConfig.apiContractHash,
        generatedAt: "2040-01-01T12:00:00.000Z",
      };
      send(response, 200, `window.CROWNLANDS_RELEASE_MANIFEST = Object.freeze(${JSON.stringify(manifest)});\n`, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__benchmark__/mock-firebase.js") {
      send(response, 200, fs.readFileSync(path.join(__dirname, "mock-firebase.js")), "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__benchmark__/game.js") {
      let gameSource = fs.readFileSync(path.join(ROOT_DIR, "game.js"), "utf8");
      gameSource = gameSource.replace("registerCrownlandsServiceWorker();", "/* Phase 0 benchmark: service worker registration disabled in loopback fixture. */");
      gameSource += fs.readFileSync(path.join(__dirname, "injected-runtime.js"), "utf8");
      send(response, 200, gameSource, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__benchmark__/requests") {
      send(response, 200, JSON.stringify({ requests }, null, 2), "application/json; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/service-worker.js") {
      send(response, 404, "Benchmark service worker disabled.", "text/plain; charset=utf-8");
      return;
    }

    const filePath = resolveStaticPath(requestUrl.pathname);
    if (!filePath) {
      send(response, 403, "Forbidden", "text/plain; charset=utf-8");
      return;
    }
    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile()) throw new Error("Not a file");
      const body = await fsp.readFile(filePath);
      const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
      send(response, 200, request.method === "HEAD" ? Buffer.alloc(0) : body, contentType);
    } catch (_error) {
      send(response, 404, "Not found", "text/plain; charset=utf-8");
    }
  });

  return {
    requests,
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, HOST, () => {
          server.off("error", reject);
          const address = server.address();
          resolve({ host: HOST, port: address.port, url: `http://${HOST}:${address.port}` });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

if (require.main === module) {
  const portArgument = process.argv.find(argument => argument.startsWith("--port="));
  const port = portArgument ? Number(portArgument.split("=")[1]) : 8798;
  const fixtureServer = createMapBenchmarkServer();
  fixtureServer.listen(port).then(address => {
    console.log(`Crownlands Phase 0 benchmark server: ${address.url}/__benchmark__/?scenario=A`);
  });
}

module.exports = { createMapBenchmarkServer };
