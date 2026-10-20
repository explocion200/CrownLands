"use strict";
// Deliberately separate from the unrestricted, loopback-only benchmark server.
const fs = require("node:fs"), http = require("node:http"), os = require("node:os"), path = require("node:path");
const { createCatalogFeed } = require("./catalog-feed");
const { createSeamlessFixture } = require("./fixtures");
const ROOT = path.resolve(__dirname, "../../..");
const ENTRY = "/__benchmark__/seamless/";
const TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };
const HEADERS = {
  "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin", "cross-origin-opener-policy": "same-origin",
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
function ipv4(ip) {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
  const parts = ip.split(".").map(Number);
  return parts.some(p => p > 255) ? null : parts.reduce((n, p) => ((n << 8) | p) >>> 0, 0);
}
function inSubnet(ip, cidr) {
  const [base, bitsText] = cidr.split("/"), bits = Number(bitsText), value = ipv4(ip), network = ipv4(base);
  if (value === null || network === null || !/^\d+$/.test(bitsText) || bits < 8 || bits > 32) return false;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (network & mask);
}
function privateAddress(ip) { return ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].some(cidr => inSubnet(ip, cidr)); }
function createPhonePreviewServer({ host = "127.0.0.1", subnet = "127.0.0.0/8", maxAgeMs = 60 * 60 * 1000, clock = Date.now } = {}) {
  if (!privateAddress(host) || !inSubnet(host, subnet) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || maxAgeMs > 60 * 60 * 1000) throw new Error("Use a private interface/subnet and a lifetime of at most one hour.");
  const feeds = new Map([[false, createCatalogFeed(false)]]), fixtures = new Map();
  const manifest = feeds.get(false).manifest, files = new Map();
  function add(relative, image = false) {
    if (image && (!/^(assets\/|tools\/map-benchmark\/seamless\/terrain\/)/.test(relative) || !/\.(webp|png|svg)$/.test(relative))) throw new Error("Unexpected preview asset");
    const filename = fs.realpathSync(path.resolve(ROOT, relative));
    if (!filename.startsWith(ROOT + path.sep) || !fs.statSync(filename).isFile()) throw new Error("Invalid preview file");
    files.set("/" + relative, filename);
  }
  for (const name of ["model.js", "assets.js", "feed.js", "preview.js", "preview.css"]) add("tools/map-benchmark/seamless/" + name);
  add(manifest.overviewAsset, true);
  for (const section of manifest.sections) {
    add(section.terrain, true); add(section.thumbnail, true);
    const data = feeds.get(false).read([section.id], 0);
    for (const item of [...data.sections[0].objects, ...data.marches]) add(item.asset, true);
  }
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  let origin = "", startedAt = 0, timer, expired = false;
  function send(request, response, status, body, type = "text/plain; charset=utf-8") {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    response.writeHead(status, { ...HEADERS, "content-type": type, "content-length": payload.length });
    response.end(request.method === "HEAD" ? undefined : payload);
  }
  const server = http.createServer((request, response) => {
    if (expired || clock() - startedAt >= maxAgeMs) { send(request, response, 410, "Phone preview expired."); return; }
    if (!inSubnet(request.socket.remoteAddress || "", subnet) || request.headers.host !== origin.slice(7)
        || (request.headers.origin && request.headers.origin !== origin) || request.headers["sec-fetch-site"] === "cross-site") {
      send(request, response, 403, "Private home-network preview only."); return;
    }
    if (!["GET", "HEAD"].includes(request.method)) { send(request, response, 405, "Read-only preview."); return; }
    if (!request.url?.startsWith("/") || request.url.startsWith("//")) { send(request, response, 400, "Invalid path."); return; }
    try {
      const url = new URL(request.url, origin), crowded = url.searchParams.get("crowded") === "true";
      if (url.pathname === ENTRY) {
        send(request, response, 200, html.replace("<head>", `<head><meta name="crownlands-private-preview-origin" content="${origin}">`), "text/html; charset=utf-8");
      } else if ([ENTRY + "catalog", ENTRY + "areas"].includes(url.pathname)) {
        if (!feeds.has(crowded)) feeds.set(crowded, createCatalogFeed(crowded));
        const feed = feeds.get(crowded);
        if (url.pathname.endsWith("catalog")) send(request, response, 200, JSON.stringify(feed.manifest), "application/json; charset=utf-8");
        else {
          let data;
          try { data = feed.read((url.searchParams.get("ids") || "").split(","), Math.floor((clock() - startedAt) / 5000)); }
          catch (_error) { send(request, response, 400, "Choose 1–16 sample sections."); return; }
          send(request, response, 200, JSON.stringify(data), "application/json; charset=utf-8");
        }
      } else if (url.pathname === ENTRY + "fixture") {
        if (!fixtures.has(crowded)) fixtures.set(crowded, createSeamlessFixture(crowded));
        send(request, response, 200, JSON.stringify(fixtures.get(crowded)), "application/json; charset=utf-8");
      } else if (files.has(url.pathname)) {
        const filename = files.get(url.pathname);
        send(request, response, 200, fs.readFileSync(filename), TYPES[path.extname(filename)]);
      } else send(request, response, 404, "Not a preview file.");
    } catch (_error) { send(request, response, 500, "Preview unavailable."); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxConnections = 32;
  async function close() {
    expired = true; clearTimeout(timer); server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
  return {
    async listen(port = 0) {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
      origin = `http://${host}:${server.address().port}`; startedAt = clock();
      timer = setTimeout(() => { void close(); }, maxAgeMs);
      return { url: origin, expiresAt: new Date(startedAt + maxAgeMs).toISOString() };
    }, close,
  };
}
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, "").split("=")));
  const iface = Object.values(os.networkInterfaces()).flat().find(i => i.family === "IPv4" && i.address === args.host && !i.internal);
  if (!iface || !privateAddress(iface.address)) throw new Error("Pass --host=<this computer's private LAN IPv4 address>.");
  const port = Number(args.port || 8800), minutes = Number(args.minutes || 60);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose an unprivileged port.");
  const server = createPhonePreviewServer({ host: iface.address, subnet: iface.cidr, maxAgeMs: minutes * 60000 });
  const address = await server.listen(port);
  console.log(`Sample-only phone preview: ${address.url}${ENTRY}?catalog=full\nExpires: ${address.expiresAt}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void server.close(); });
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createPhonePreviewServer, inSubnet, privateAddress };
