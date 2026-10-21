"use strict";
// No public listening port, credentials file or production database. A browser test
// routes EVERY request into this harness before opening the real client URL.
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), crypto = require("node:crypto");
const { AuthService, secret } = require("../../../local-backend/auth");
const { COOKIE, CSRF, cookies } = require("../../../local-backend/auth-http");
const { createGameServer } = require("../../../local-backend/game-http");
const { prepareTerrain } = require("./live-terrain"), { overview } = require("./live-catalog");
const { appearanceAssets } = require("./live-appearance-assets");
const ROOT = path.resolve(__dirname, "../../.."), BASE = "/api/local-game/rehearsal/", ORIGIN = "https://playcrownlands.com";
const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2" };
const fail = (status, message) => Object.assign(Error(message), { status });
async function createAuthenticatedNativeHarness(pilot, {productionWorld, chatEvents} = {}) {
  if (!require("./gameplay-pilot").isGameplayPilot(pilot)) throw Error("Disposable world capability required");
  const { store, reader } = pilot, auth = new AuthService({ store, rateKey: crypto.randomBytes(32) });
  await auth.initialize();
  const sessions = [], servers = [], calls = [], errors = [], requests = [];
  const terrain = await prepareTerrain(reader.manifest); reader.manifest = terrain.manifest;
  const atlas = await overview(reader.manifest, asset => terrain.files.get(asset) || path.join(ROOT, asset));
  const flags = appearanceAssets(ROOT);
  const worldData = productionWorld || { schema: store.schema, async read(identity, operation, input) {
    const allowed = { catalog: [], areas: ["realm", "ids", "cursor"], options: ["key"] }[operation];
    if (!allowed || Object.keys(input).some(k => !allowed.includes(k))) throw fail(400, "Invalid world request");
    if (operation === "catalog") { await reader.initialize(identity.uid); return reader.manifest; }
    if (operation === "options") { await reader.initialize(identity.uid); return pilot.execute(identity.uid, "options", input); }
    if (input.realm !== reader.manifest.realmId) throw fail(409, "World changed");
    return reader.read(identity.uid, input.ids, input.cursor);
  } };
  const close = async () => { for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
  try { for (const player of pilot.players) {
    const account = { localId: player.uid, email: `${player.name.toLowerCase()}@example.test`, emailVerified: true, displayName: player.name };
    await store.pool.query(`INSERT INTO ${store.schema}.accounts(uid,body) VALUES($1,$2)`, [player.uid, account]);
    const signed = await auth.transaction(client => auth.newSession(client, account, "password"));
    sessions.push({ ...signed, csrf: secret(), uid: player.uid });
    if(productionWorld && servers.length)continue;
    const routes = pilot.routes.map(r => r.kind !== "callable" ? r : { ...r, handler: async request => {
      const started = performance.now();
      try { const value = await r.handler(request); calls.push({ name: r.name, uid: request.auth.uid, ms: performance.now() - started }); return value; }
      catch (error) { errors.push({ name: r.name, code: error.code, message: error.message }); throw error; }
    } });
    const server = createGameServer({ store, auth, routes, worldData, chatEvents, chatHoldMs:1000, ...(productionWorld ? {deployment:productionWorld.deployment} : {ownerUid: player.uid, expiresAt: new Date(Date.now() + 3600000).toISOString()}) });
    servers.push(server);
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  } } catch (error) { await close(); throw error; }
  function response(body, status = 200, type = "application/json") {
    return { status, headers: { "content-type": type, "cache-control": "no-store" }, body: Buffer.isBuffer(body) ? body : typeof body === "string" ? Buffer.from(body) : Buffer.from(JSON.stringify(body)) };
  }
  async function request(urlString, method = "GET", headers = {}, body) {
    const url = new URL(urlString); requests.push({ path: url.pathname, method });
    if (url.origin !== ORIGIN) return response("External request blocked", 403, "text/plain");
    try {
      const jar = cookies(headers.cookie), signed = await auth.session(jar[COOKIE]);
      if (url.pathname === "/local-auth/v1/session") return response({ csrf: jar[CSRF], user: signed?.user || null, authTime: signed?.auth.token.auth_time });
      if (url.pathname.startsWith("/api/local-game/v1/") || url.pathname.startsWith("/api/local-game/world-assets/")) {
        const i = productionWorld ? 0 : Math.max(0, pilot.players.findIndex(p => p.uid === signed?.user.uid));
        return await new Promise((resolve, reject) => {
          const req = http.request({ host: "127.0.0.1", port: servers[i].address().port, path: url.pathname, method,
            headers: { ...headers, ...(productionWorld ? {"x-crownlands-deployment":productionWorld.deployment.epoch} : {}), host: "playcrownlands.com", "x-crownlands-client-ip": headers["x-crownlands-client-ip"] || "192.168.1.145", "content-length": Buffer.byteLength(body || "") } }, res => {
            const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => {
              if (res.statusCode >= 400) errors.push({ path: url.pathname, status: res.statusCode, targets: JSON.parse(body || "{}").targets });
              resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
            });
          }); req.on("error", reject); req.end(body);
        });
      }
      if (!signed || !pilot.players.some(p => p.uid === signed.user.uid)) return response("Session ended", 401);
      if (!["GET", "HEAD"].includes(method)) return response("Not a test route", 405);
      if (url.pathname === BASE || url.pathname === BASE + "index.html") {
        let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
          .replace(/<link[^>]+https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, "")
          .replace(/<link rel="manifest"[^>]*>/g, "")
          .replace('<base id="crownlandsBase" href="./" />', `<base id="crownlandsBase" href="${BASE}" />`)
          .replace("<head>", `<head><meta name="crownlands-private-preview-origin" content="${ORIGIN}"><script src="${BASE}local-preview.js"></script><script src="${BASE}native-auth-boot.js"></script>`);
        const scripts = (productionWorld ? [] : ["model", "assets", "feed", "delta-feed", "sprite-layer", "game-bridge", "appearance", "preview"])
          .map(name => `<script ${name === "preview" ? "data-manual" : ""} src="/tools/map-benchmark/seamless/${name}.js"></script>`).join("\n");
        html = html.replace(/(<script src="game\.js[^>]*><\/script>)/, scripts + "$1");
        if(productionWorld)html=html.replace("</body>",'<script src="/world/bootstrap.js"></script></body>');
        return response(html, 200, "text/html");
      }
      if (url.pathname === BASE + "native-auth-boot.js") return response('window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__={nativeWorld:true,nativeAuthenticated:true};', 200, "text/javascript");
      if (url.pathname === "/__benchmark__/seamless/flags.css") return response(flags.css, 200, "text/css");
      if (url.pathname === "/" + reader.manifest.overviewAsset) return response(atlas, 200, "image/webp");
      const relative = decodeURIComponent(url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname.slice(1));
      if (relative.split("/").some(p => !p || p.startsWith(".") || p.includes("\\"))) return response("Not found", 404);
      const ordinary = /^[\w-]+\.(js|css|json|webmanifest)$/.test(relative) || relative.startsWith("assets/")
        || (/^functions\/[\w-]+\.js$/.test(relative) && fs.readFileSync(path.join(ROOT,"index.html"),"utf8").includes(relative));
      const module = /^tools\/map-benchmark\/seamless\/[a-z-]+\.(js|css|html)$/.test(relative) || (productionWorld && /^world\/[a-z-]+\.(js|css|html)$/.test(relative));
      if (!ordinary && !module && !terrain.files.has(relative)) return response("Not found", 404);
      let file = terrain.files.get(relative) || path.join(ROOT, relative);
      if(productionWorld&&relative.startsWith("world/"))file=path.join(ROOT,"dist",relative);
      if (relative === "local-preview.js") file = path.join(ROOT, "tools/local-migration/local-preview.js");
      let bytes = fs.readFileSync(file);
      if (relative === "game.js" && !productionWorld) bytes = Buffer.concat([bytes, Buffer.from("\n"), fs.readFileSync(path.join(__dirname, "native-game.js"))]);
      if (relative === "ads-config.js") bytes = Buffer.from(bytes.toString().replace("enabled: true", "enabled: false"));
      return response(bytes, 200, MIME[path.extname(file)] || "application/octet-stream");
    } catch (error) { if (error.code === "ENOENT") return response("Not found", 404); throw error; }
  }
  return { auth, sessions, calls, errors, requests, worldData, request, url: ORIGIN + BASE,
    cookies: i => [COOKIE, CSRF].map((name, n) => ({ name, value: n ? sessions[i].csrf : sessions[i].token, domain: "playcrownlands.com", path: "/", secure: true, httpOnly: !n, sameSite: "Lax" })),
    close,
  };
}
module.exports = { createAuthenticatedNativeHarness };
