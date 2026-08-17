"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const { createFixture } = require("./fixture.js");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const HOST = "127.0.0.1";
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
    '<script src="/__core_a1__/early-instrumentation.js"></script>\n  <script src="region-catalog.js?v=core-v2-phase-a1"></script>'
  );
  source = source.replace(/<script src="world-config\.js"><\/script>/, '<script src="/__core_a1__/world-config.js"></script>');
  source = source.replace(
    /<script src="assets\/worlds\/world_01\/region-catalog\.js[^>]*><\/script>/,
    '<script src="/__core_a1__/region-catalog.js"></script>'
  );
  source = source.replace(/<script src="release-manifest\.js"><\/script>/, '<script src="/__core_a1__/release-manifest.js"></script>');
  source = source.replace(/<script src="firebaseClient\.js[^>]*><\/script>/, '<script src="/__core_a1__/mock-firebase.js"></script>');
  source = source.replace(/<script src="game\.js[^>]*><\/script>/, '<script src="/__core_a1__/game.js"></script>');
  return source;
}

function resolveStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (_error) { return null; }
  const relative = decoded.replace(/^[/\\]+/, "");
  const resolved = path.resolve(ROOT_DIR, relative);
  return resolved.startsWith(`${ROOT_DIR}${path.sep}`) ? resolved : null;
}

function createCoreA1Server() {
  const fixture = createFixture();
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const hostHeader = String(request.headers.host || "");
    if (!hostHeader.startsWith("127.0.0.1:") && hostHeader !== "127.0.0.1") {
      send(response, 403, "Core v2 Phase A.1 server is loopback-only.", "text/plain; charset=utf-8");
      return;
    }
    const requestUrl = new URL(request.url || "/", `http://${hostHeader || HOST}`);
    requests.push({ at: new Date().toISOString(), method: request.method, path: requestUrl.pathname });
    if (request.method !== "GET" && request.method !== "HEAD") {
      send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
      return;
    }

    if (requestUrl.pathname === "/" || requestUrl.pathname === "/__core_a1__/") {
      send(response, 200, createRuntimeIndex(), "text/html; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__core_a1__/early-instrumentation.js") {
      const prefix = `window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__ = Object.freeze(${JSON.stringify(browserFixture(fixture))});\n`;
      const source = prefix + fs.readFileSync(path.join(ROOT_DIR, "tools", "map-benchmark", "early-instrumentation.js"), "utf8");
      send(response, 200, source, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__core_a1__/region-catalog.js") {
      send(response, 200, `window.CROWNLANDS_REGION_CATALOG = Object.freeze(${JSON.stringify(fixture.regionCatalog)});\n`, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__core_a1__/world-config.js") {
      const worldConfig = {
        version: 1,
        width: 13000,
        height: 17000,
        gridSize: 50,
        cityCountPerRegion: 70,
        regions: [],
        landBridges: [],
        developmentOnly: true,
      };
      send(response, 200, `window.CROWNLANDS_WORLD_CONFIG = Object.freeze(${JSON.stringify(worldConfig)});\n`, "text/javascript; charset=utf-8");
      return;
    }
    const regionMatch = requestUrl.pathname.match(/^\/__core_a1__\/regions\/([^/]+)\.json$/);
    if (regionMatch) {
      const map = fixture.mapData.maps.find(candidate => candidate.id === regionMatch[1]);
      if (!map) {
        send(response, 404, "Region definition not found", "text/plain; charset=utf-8");
        return;
      }
      send(response, 200, `${JSON.stringify(compatibilityMapToRegionDefinition(map))}\n`, "application/json; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__core_a1__/release-manifest.js") {
      const manifest = { buildId: "core-v2-phase-a1", contractHash: fixture.releaseConfig.apiContractHash, generatedAt: "2040-01-01T12:00:00.000Z" };
      send(response, 200, `window.CROWNLANDS_RELEASE_MANIFEST = Object.freeze(${JSON.stringify(manifest)});\n`, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__core_a1__/mock-firebase.js") {
      send(response, 200, fs.readFileSync(path.join(ROOT_DIR, "tools", "map-benchmark", "mock-firebase.js")), "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__core_a1__/game.js") {
      let source = fs.readFileSync(path.join(ROOT_DIR, "game.js"), "utf8");
      source = source.replace("registerCrownlandsServiceWorker();", "/* Core v2 Phase A.1: service worker disabled in loopback fixture. */");
      source += fs.readFileSync(path.join(ROOT_DIR, "tools", "map-benchmark", "injected-runtime.js"), "utf8");
      source += fs.readFileSync(path.join(__dirname, "injected-runtime.js"), "utf8");
      send(response, 200, source, "text/javascript; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__core_a1__/fixture.json") {
      send(response, 200, `${JSON.stringify(browserFixture(fixture), null, 2)}\n`, "application/json; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/__core_a1__/requests") {
      send(response, 200, JSON.stringify({ requests }, null, 2), "application/json; charset=utf-8");
      return;
    }
    if (requestUrl.pathname === "/service-worker.js") {
      send(response, 404, "Core v2 Phase A.1 service worker disabled.", "text/plain; charset=utf-8");
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
  const port = portArgument ? Number(portArgument.split("=")[1]) : 8811;
  createCoreA1Server().listen(port).then(address => {
    console.log(`Crownlands Core v2 Phase A.1 runtime QA: ${address.url}/__core_a1__/`);
  });
}

module.exports = { createCoreA1Server };
