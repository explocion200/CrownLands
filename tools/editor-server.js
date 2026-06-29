const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");
const vm = require("vm");

const ROOT_DIR = path.resolve(__dirname, "..");
const EDITOR_DIR = path.join(__dirname, "map-editor");
const WORLD_CONFIG_PATH = path.join(ROOT_DIR, "world-config.js");
const GITHUB_WORLD_CONFIG_URL = "https://raw.githubusercontent.com/explocion200/crownlands-game/main/world-config.js";
const HOST = "127.0.0.1";
const START_PORT = Number(process.env.PORT) || 8791;
const MAX_BODY_BYTES = 1024 * 1024;
const ROOT_STATIC_FILES = new Set([
  "/firebaseClient.js",
  "/game.js",
  "/index.html",
  "/styles.css",
  "/world-config.js",
]);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendText(response, status, text) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0] || "");
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, "");
  const resolved = path.resolve(root, normalized);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

async function serveFile(response, filePath) {
  try {
    const stats = await fsp.stat(filePath);
    const finalPath = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const data = await fsp.readFile(finalPath);
    response.writeHead(200, {
      "content-type": MIME_TYPES.get(path.extname(finalPath).toLowerCase()) || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(data);
  } catch (error) {
    sendText(response, 404, "Not found");
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function readWorldConfig() {
  const source = await fsp.readFile(WORLD_CONFIG_PATH, "utf8");
  return parseWorldConfigSource(source, "world-config.js");
}

function parseWorldConfigSource(source, filename = "world-config.js") {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename, timeout: 1000 });
  return sanitizeWorldConfig(context.window.CROWNLANDS_WORLD_CONFIG || {});
}

function cleanString(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 80);
}

function cleanId(value, fallback) {
  return cleanString(value, fallback).replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || fallback;
}

function number(value, fallback, min = -Infinity, max = Infinity) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeWorldConfig(config) {
  const safe = {
    version: Math.max(1, Math.floor(number(config.version, 23))),
    name: cleanString(config.name, "Five Island Crownlands"),
    width: Math.floor(number(config.width, 10000, 1000, 50000)),
    height: Math.floor(number(config.height, 7600, 1000, 50000)),
    gridSize: Math.floor(number(config.gridSize, 50, 20, 400)),
    cityCountPerRegion: Math.floor(number(config.cityCountPerRegion, 50, 1, 250)),
    strongholdReserveRatio: number(config.strongholdReserveRatio, 0.3, 0, 0.8),
    regions: [],
    landBridges: [],
  };

  const regions = Array.isArray(config.regions) ? config.regions : [];
  safe.regions = regions.map((region, index) => {
    const id = cleanId(region.id, `region-${index + 1}`);
    return {
      id,
      label: cleanString(region.label, id),
      x: Math.round(number(region.x, safe.width / 2, 0, safe.width)),
      y: Math.round(number(region.y, safe.height / 2, 0, safe.height)),
      rx: Math.round(number(region.rx, 1000, 100, safe.width)),
      ry: Math.round(number(region.ry, 800, 100, safe.height)),
      cityRx: Math.round(number(region.cityRx, region.rx || 800, 50, safe.width)),
      cityRy: Math.round(number(region.cityRy, region.ry || 600, 50, safe.height)),
      rot: number(region.rot, 0, -Math.PI, Math.PI),
      palette: cleanId(region.palette, "heartland"),
    };
  });

  const bridges = Array.isArray(config.landBridges) ? config.landBridges : [];
  safe.landBridges = bridges.map((bridge, index) => ({
    id: cleanId(bridge.id, `bridge-${index + 1}`),
    from: {
      x: Math.round(number(bridge.from?.x, safe.width / 2, 0, safe.width)),
      y: Math.round(number(bridge.from?.y, safe.height / 2, 0, safe.height)),
    },
    to: {
      x: Math.round(number(bridge.to?.x, safe.width / 2, 0, safe.width)),
      y: Math.round(number(bridge.to?.y, safe.height / 2, 0, safe.height)),
    },
    width: Math.round(number(bridge.width, 360, 40, 2000)),
  }));

  return safe;
}

async function writeWorldConfig(config) {
  const safe = sanitizeWorldConfig(config);
  const body = `window.CROWNLANDS_WORLD_CONFIG = ${JSON.stringify(safe, null, 2)};\n`;
  const tempPath = `${WORLD_CONFIG_PATH}.tmp`;
  await fsp.writeFile(tempPath, body, "utf8");
  await fsp.rename(tempPath, WORLD_CONFIG_PATH);
  return safe;
}

async function downloadGithubWorldConfig() {
  const sourceUrl = `${GITHUB_WORLD_CONFIG_URL}?t=${Date.now()}`;
  const response = await fetch(sourceUrl, {
    headers: {
      "accept": "text/plain",
      "user-agent": "crownlands-local-editor",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub map download failed: ${response.status} ${response.statusText}`);
  }
  const source = await response.text();
  const config = parseWorldConfigSource(source, "github-world-config.js");
  const saved = await writeWorldConfig(config);
  return { config: saved, sourceUrl: GITHUB_WORLD_CONFIG_URL };
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/world-config" && request.method === "GET") {
    const config = await readWorldConfig();
    sendJson(response, 200, { config, path: WORLD_CONFIG_PATH });
    return;
  }

  if (pathname === "/api/world-config" && request.method === "POST") {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody || "{}");
    const config = await writeWorldConfig(payload.config);
    sendJson(response, 200, { ok: true, config, path: WORLD_CONFIG_PATH });
    return;
  }

  if (pathname === "/api/world-config/import-github" && request.method === "POST") {
    const result = await downloadGithubWorldConfig();
    sendJson(response, 200, { ok: true, path: WORLD_CONFIG_PATH, ...result });
    return;
  }

  sendJson(response, 404, { error: "Unknown API route." });
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${HOST}`);
      const pathname = url.pathname;

      if (pathname.startsWith("/api/")) {
        await handleApi(request, response, pathname);
        return;
      }

      if (pathname === "/" || pathname === "/editor") {
        response.writeHead(302, { location: "/editor/" });
        response.end();
        return;
      }

      if (pathname === "/tools/editor" || pathname === "/tools/editor/" || pathname.startsWith("/tools/editor/")) {
        response.writeHead(302, { location: "/editor/" });
        response.end();
        return;
      }

      if (pathname === "/tools/map-editor" || pathname === "/tools/map-editor/") {
        response.writeHead(302, { location: "/editor/" });
        response.end();
        return;
      }

      if (pathname.startsWith("/tools/map-editor/")) {
        const editorPath = pathname.replace(/^\/tools\/map-editor\/?/, "");
        response.writeHead(302, { location: `/editor/${editorPath}` });
        response.end();
        return;
      }

      if (pathname.startsWith("/editor/")) {
        const filePath = safeJoin(EDITOR_DIR, pathname.replace(/^\/editor\/?/, ""));
        if (!filePath) {
          sendText(response, 403, "Forbidden");
          return;
        }
        await serveFile(response, filePath);
        return;
      }

      if (pathname.startsWith("/assets/") || ROOT_STATIC_FILES.has(pathname)) {
        const filePath = safeJoin(ROOT_DIR, pathname);
        if (!filePath) {
          sendText(response, 403, "Forbidden");
          return;
        }
        await serveFile(response, filePath);
        return;
      }

      if (pathname === "/game" || pathname === "/game/") {
        await serveFile(response, path.join(ROOT_DIR, "index.html"));
        return;
      }

      if (pathname.startsWith("/game/")) {
        const filePath = safeJoin(ROOT_DIR, pathname.replace(/^\/game\/?/, ""));
        if (!filePath) {
          sendText(response, 403, "Forbidden");
          return;
        }
        await serveFile(response, filePath);
        return;
      }

      sendText(response, 404, "Not found");
    } catch (error) {
      sendJson(response, 500, { error: error.message || String(error) });
    }
  });
}

function listenWithFallback(server, port) {
  server.once("error", error => {
    if (error.code === "EADDRINUSE" && port < START_PORT + 20) {
      listenWithFallback(createServer(), port + 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });

  server.listen(port, HOST, () => {
    console.log(`Crownlands editor running at http://${HOST}:${port}/editor/`);
    console.log(`Game preview running at http://${HOST}:${port}/game/`);
  });
}

listenWithFallback(createServer(), START_PORT);
