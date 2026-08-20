"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const SITE = path.join(ROOT, "benchmark-results", "map", "core-v2-qa-1", "staging-site");
const HOST = "127.0.0.1";
const MIME = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"], [".webmanifest", "application/manifest+json; charset=utf-8"], [".webp", "image/webp"],
  [".woff2", "font/woff2"], [".mp3", "audio/mpeg"], [".ogg", "audio/ogg"], [".wav", "audio/wav"],
]);

function send(response, status, body, contentType) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  response.writeHead(status, { "cache-control": "no-store", "content-length": payload.length, "content-type": contentType });
  response.end(payload);
}

function resolvePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (_error) { return null; }
  const normalized = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  const resolved = path.resolve(SITE, normalized.replace(/^[/\\]+/, ""));
  return resolved.startsWith(`${SITE}${path.sep}`) ? resolved : null;
}

function createServer() {
  if (!fs.existsSync(path.join(SITE, "__core_b1__", "index.html"))) throw new Error("Run tools/core-v2-qa-1/build-staging-site.js first.");
  const server = http.createServer(async (request, response) => {
    const host = String(request.headers.host || "");
    if (!host.startsWith("127.0.0.1:") && host !== "127.0.0.1") return send(response, 403, "QA-1 fixture is loopback-only.", "text/plain; charset=utf-8");
    if (request.method !== "GET" && request.method !== "HEAD") return send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
    const target = resolvePath(new URL(request.url || "/", `http://${host}`).pathname);
    if (!target) return send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    try {
      const stat = await fsp.stat(target);
      if (!stat.isFile()) throw new Error("Not a file");
      const body = request.method === "HEAD" ? Buffer.alloc(0) : await fsp.readFile(target);
      return send(response, 200, body, MIME.get(path.extname(target).toLowerCase()) || "application/octet-stream");
    } catch (_error) {
      return send(response, 404, "Not found", "text/plain; charset=utf-8");
    }
  });
  return {
    listen(port = 8816) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, HOST, () => resolve({ url: `http://${HOST}:${server.address().port}` }));
      });
    },
    close() { return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}

if (require.main === module) {
  const portArgument = process.argv.find(argument => argument.startsWith("--port="));
  const port = portArgument ? Number(portArgument.split("=")[1]) : 8816;
  createServer().listen(port).then(address => console.log(`Crownlands Core v2 QA-1: ${address.url}/__core_b1__/`));
}

module.exports = Object.freeze({ createServer });
