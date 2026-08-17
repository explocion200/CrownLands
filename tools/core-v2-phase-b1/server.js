"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { createFixture } = require("./fixture.js");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const HOST = "127.0.0.1";
const PREFIX = "/__core_b1__";
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"], [".ogg", "audio/ogg"], [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"], [".wav", "audio/wav"],
  [".webmanifest", "application/manifest+json; charset=utf-8"], [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function send(response, status, body, contentType) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": payload.length,
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
  });
  response.end(payload);
}

function browserFixture(fixture) {
  const { mapData: _mapData, regionCatalog: _regionCatalog, ...safeFixture } = fixture;
  return safeFixture;
}

function compatibilityMapToRegionDefinition(map = {}) {
  return {
    id: map.id,
    name: map.label,
    type: map.type,
    gridX: map.gridX,
    gridY: map.gridY,
    width: map.imageWidth,
    height: map.imageHeight,
    imagePath: map.imageSrc,
    thumbnailPath: map.thumbnailSrc,
    cityCapacity: map.cityCapacity,
    cities: map.cities || [],
    strongholds: (map.objectives || []).map(objective => ({
      ...objective,
      strongholdType: objective.sourceStrongholdType || objective.strongholdType || objective.type,
      bonusType: objective.bonus,
      bonusAmount: objective.bonusPercent,
    })),
    camps: map.camps || [],
    edgeConnections: map.edgeConnections || {},
  };
}

function createRuntimeIndex() {
  let source = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
  source = source.replace(
    /<script src="region-catalog\.js[^>]*><\/script>/,
    `<script src="${PREFIX}/early-instrumentation.js"></script>\n  <script src="region-catalog.js?v=core-v2-phase-b1"></script>`,
  );
  source = source.replace(/<script src="world-config\.js"><\/script>/, `<script src="${PREFIX}/world-config.js"></script>`);
  source = source.replace(
    /<script src="assets\/worlds\/world_01\/region-catalog\.js[^>]*><\/script>/,
    `<script src="${PREFIX}/region-catalog.js"></script>`,
  );
  source = source.replace(/<script src="release-manifest\.js"><\/script>/, `<script src="${PREFIX}/release-manifest.js"></script>`);
  source = source.replace(/<script src="firebaseClient\.js[^>]*><\/script>/, `<script src="${PREFIX}/mock-firebase.js"></script>`);
  source = source.replace(/<script src="game\.js[^>]*><\/script>/, `<script src="${PREFIX}/game.js"></script>`);
  return source;
}

function resolveStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (_error) { return null; }
  const resolved = path.resolve(ROOT_DIR, decoded.replace(/^[/\\]+/, ""));
  return resolved.startsWith(`${ROOT_DIR}${path.sep}`) ? resolved : null;
}

function createCoreB1Server() {
  const fixture = createFixture();
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const hostHeader = String(request.headers.host || "");
    if (!hostHeader.startsWith("127.0.0.1:") && hostHeader !== "127.0.0.1") {
      send(response, 403, "Core v2 Phase B1 server is loopback-only.", "text/plain; charset=utf-8");
      return;
    }
    const requestUrl = new URL(request.url || "/", `http://${hostHeader || HOST}`);
    requests.push({ at: new Date().toISOString(), method: request.method, path: requestUrl.pathname });
    if (request.method !== "GET" && request.method !== "HEAD") {
      send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/" || requestUrl.pathname === `${PREFIX}/`) {
      send(response, 200, createRuntimeIndex(), "text/html; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === `${PREFIX}/early-instrumentation.js`) {
      const prefix = `window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__ = Object.freeze(${JSON.stringify(browserFixture(fixture))});\n`;
      send(response, 200, prefix + fs.readFileSync(path.join(ROOT_DIR, "tools/map-benchmark/early-instrumentation.js"), "utf8"), "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === `${PREFIX}/region-catalog.js`) {
      send(response, 200, `window.CROWNLANDS_REGION_CATALOG = Object.freeze(${JSON.stringify(fixture.regionCatalog)});\n`, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === `${PREFIX}/world-config.js`) {
      const worldConfig = { version: 1, width: 13000, height: 17000, gridSize: 50, cityCountPerRegion: 70, regions: [], landBridges: [], developmentOnly: true };
      send(response, 200, `window.CROWNLANDS_WORLD_CONFIG = Object.freeze(${JSON.stringify(worldConfig)});\n`, "text/javascript; charset=utf-8");
      return;
    }
    const regionMatch = requestUrl.pathname.match(/^\/__core_b1__\/regions\/([^/]+)\.json$/);
    if (regionMatch) {
      const map = fixture.mapData.maps.find(candidate => candidate.id === regionMatch[1]);
      if (!map) {
        send(response, 404, "Region definition not found", "text/plain; charset=utf-8");
        return;
      }
      send(response, 200, `${JSON.stringify(compatibilityMapToRegionDefinition(map))}\n`, "application/json; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === `${PREFIX}/release-manifest.js`) {
      const manifest = { buildId: "core-v2-phase-b1", contractHash: fixture.releaseConfig.apiContractHash, generatedAt: "2041-01-01T12:00:00.000Z" };
      send(response, 200, `window.CROWNLANDS_RELEASE_MANIFEST = Object.freeze(${JSON.stringify(manifest)});\n`, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === `${PREFIX}/mock-firebase.js`) {
      send(response, 200, fs.readFileSync(path.join(ROOT_DIR, "tools/map-benchmark/mock-firebase.js")), "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === `${PREFIX}/game.js`) {
      let source = fs.readFileSync(path.join(ROOT_DIR, "game.js"), "utf8");
      source = source.replace("registerCrownlandsServiceWorker();", "/* Core v2 Phase B1: service worker disabled in loopback fixture. */");
      source += fs.readFileSync(path.join(ROOT_DIR, "tools/map-benchmark/injected-runtime.js"), "utf8");
      source += fs.readFileSync(path.join(ROOT_DIR, "tools/core-v2-phase-a1/injected-runtime.js"), "utf8");
      source += fs.readFileSync(path.join(ROOT_DIR, "tools/core-v2-phase-b1/injected-runtime.js"), "utf8");
      send(response, 200, source, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === `${PREFIX}/fixture.json`) {
      send(response, 200, `${JSON.stringify(browserFixture(fixture), null, 2)}\n`, "application/json; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === `${PREFIX}/requests`) {
      send(response, 200, JSON.stringify({ requests }, null, 2), "application/json; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/service-worker.js") {
      send(response, 404, "Core v2 Phase B1 service worker disabled.", "text/plain; charset=utf-8");
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
      send(response, 200, request.method === "HEAD" ? Buffer.alloc(0) : body, MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream");
    } catch (_error) {
      send(response, 404, "Not found", "text/plain; charset=utf-8");
    }
  });
  return {
    fixture,
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
  const port = portArgument ? Number(portArgument.split("=")[1]) : 8812;
  createCoreB1Server().listen(port).then(address => console.log(`Crownlands Core v2 Phase B1 runtime QA: ${address.url}${PREFIX}/`));
}

module.exports = { createCoreB1Server };
