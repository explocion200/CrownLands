"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const ENTRY = "/api/local-game/rehearsal/";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".woff2": "font/woff2", ".txt": "text/plain" };
function staticPreview(directory) {
  const root = fs.realpathSync(directory);
  if (!fs.existsSync(path.join(root, "local-preview.js"))) throw Error("Prepared private client required");
  return async (req, res, url) => {
    if (!url.pathname.startsWith(ENTRY)) return false;
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); res.end(); return true; }
    let relative;
    try { relative = decodeURIComponent(url.pathname.slice(ENTRY.length)) || "index.html"; } catch { relative = ""; }
    if (!relative || relative.split("/").some(part => !part || part.startsWith(".") || part.includes("\\")) || !types[path.extname(relative)]) {
      res.writeHead(404); res.end(); return true;
    }
    const file = path.join(root, relative);
    let actual, stat;
    try { actual = fs.realpathSync(file); stat = fs.statSync(actual); } catch { /* Return a neutral missing resource. */ }
    if (!actual?.startsWith(root + path.sep) || !stat?.isFile() || stat.size > 32 * 1024 * 1024) { res.writeHead(404); res.end(); return true; }
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleusercontent.com; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader("Cache-Control", "no-store");
    res.writeHead(200, { "Content-Type": types[path.extname(relative)], "Content-Length": stat.size });
    if (req.method === "HEAD") res.end(); else await pipeline(fs.createReadStream(actual), res);
    return true;
  };
}
module.exports = { staticPreview, ENTRY };
