"use strict";

const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function safePath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return ""; }
  if (decoded.includes("\0") || decoded.includes("\\")) return "";
  const relative = decoded.replace(/^\/+/, "");
  const target = path.resolve(root, ...relative.split("/"));
  const boundary = path.relative(root, target);
  if (boundary === ".." || boundary.startsWith(`..${path.sep}`) || path.isAbsolute(boundary)) return "";
  return target;
}

function createReadOnlyPreviewServer(projectRoot) {
  const root = path.resolve(projectRoot);
  return http.createServer(async (request, response) => {
    try {
      if (!request.url || !["GET", "HEAD"].includes(request.method || "")) {
        response.writeHead(405, { allow: "GET, HEAD" });
        response.end();
        return;
      }
      const url = new URL(request.url, "http://127.0.0.1");
      let pathname = url.pathname;
      if (pathname === "/" || pathname === "/editor" || pathname === "/editor/") pathname = "/tools/map-editor/index.html";
      else if (pathname.startsWith("/editor/")) pathname = `/tools/map-editor/${pathname.slice("/editor/".length)}`;
      const target = safePath(root, pathname);
      if (!target) {
        response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }
      const stat = await fsp.stat(target);
      if (!stat.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
      const data = await fsp.readFile(target);
      const headers = {
        "cache-control": "no-store",
        "content-type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
        "content-security-policy": CSP,
        "x-content-type-options": "nosniff",
      };
      response.writeHead(200, headers);
      response.end(request.method === "HEAD" ? undefined : data);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.code === "ENOENT" ? "Not found" : "Preview error");
    }
  });
}

module.exports = { CSP, createReadOnlyPreviewServer, safePath };
