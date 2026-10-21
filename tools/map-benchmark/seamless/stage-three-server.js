"use strict";
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), crypto = require("node:crypto");
const { Store } = require("../../../local-backend/store");
const { AuthService } = require("../../../local-backend/auth");
const { createLocalPassword } = require("../../../local-backend/passwords");
const { FixtureRealm } = require("./realm-store");
const ROOT = path.resolve(__dirname, "../../.."), ENTRY = "/__benchmark__/seamless/", COOKIE = "crownlands_world3_session";
const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "same-origin", "cross-origin-opener-policy": "same-origin",
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };
async function createStageThreeServer({ crowded = false, clock = Date.now, maxAgeMs = 2 * 60 * 60 * 1000, scripted = true } = {}) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 2 * 60 * 60 * 1000) throw Error("Private test lifetime must be at most two hours");
  const schema = "migration_world3_" + crypto.randomBytes(6).toString("hex"), store = new Store({ schema });
  const credentials = ["rowan", "alder"].map(name => ({ uid: "sample-" + name, email: name + "@example.test", password: crypto.randomBytes(24).toString("base64url") }));
  const auth = new AuthService({ store, rateKey: crypto.randomBytes(32) }), realm = new FixtureRealm(store, { crowded, clock });
  let cookieName = COOKIE, origin = "", expired = false, timer, ticker, ticking = null, step = 0, closing = null, scriptHealthy = true;
  const files = new Map();
  function add(relative) {
    const file = fs.realpathSync(path.join(ROOT, relative));
    if (!file.startsWith(ROOT + path.sep) || !fs.statSync(file).isFile()) throw Error("Invalid preview file");
    files.set("/" + relative, file);
  }
  try {
    await store.initialize(); await auth.initialize(); await realm.initialize();
    for (const c of credentials) await store.pool.query(`INSERT INTO ${schema}.accounts(uid,body) VALUES($1,$2)`, [c.uid,
      { localId: c.uid, email: c.email, emailVerified: true, displayName: c.uid + " · private fixture", providerUserInfo: [{ providerId: "password" }], localPassword: await createLocalPassword(c.password) }]);
    for (const name of ["model.js", "assets.js", "feed.js", "delta-feed.js", "preview.js", "preview.css", "stage-three-login.js"]) add("tools/map-benchmark/seamless/" + name);
    const assets = new Set([realm.manifest.overviewAsset]);
    for (const s of realm.manifest.sections) { assets.add(s.terrain); assets.add(s.thumbnail); }
    for (const row of realm.initial) assets.add(row.body.asset);
    for (const asset of assets) {
      if (!/^(assets\/|tools\/map-benchmark\/seamless\/terrain\/)/.test(asset) || !/\.(webp|png|svg)$/.test(asset)) throw Error("Unexpected fixture image");
      add(asset);
    }
  } catch (error) { await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await store.close(); throw error; }
  function send(req, res, status, body, type = "application/json", extra = {}) {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    res.writeHead(status, { ...HEADERS, ...extra, "content-type": type, "content-length": bytes.length }); res.end(req.method === "HEAD" ? undefined : bytes);
  }
  function token(req) { return (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(cookieName + "="))?.slice(cookieName.length + 1) || ""; }
  async function body(req) {
    let bytes = 0, data = "";
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 4096) throw Error("Body too large"); data += chunk; }
    return JSON.parse(data);
  }
  const login = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crownlands private realm sign-in</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/tools/map-benchmark/seamless/preview.css"><script defer src="/tools/map-benchmark/seamless/stage-three-login.js"></script></head><body class="fixture-login"><main><h1>Private world test</h1><p>Sample accounts only. Your live game account is not connected.</p><form id="test-login"><label>Test account<input id="email" type="email" value="rowan@example.test" autocomplete="username" required></label><label>Test password<input id="password" type="password" autocomplete="current-password" required></label><button>Open private world</button></form><p id="login-status" role="status">Use the temporary credentials saved on this computer.</p></main></body></html>`;
  const server = http.createServer(async (req, res) => {
    try {
      if (expired) { send(req, res, 410, { error: "Private test expired" }); return; }
      if (req.socket.remoteAddress !== "127.0.0.1" || req.headers.host !== origin.slice(7) || (req.headers.origin && req.headers.origin !== origin) || req.headers["sec-fetch-site"] === "cross-site") { send(req, res, 403, { error: "Loopback and same-origin access required" }); return; }
      if (!req.url?.startsWith("/") || req.url.startsWith("//") || req.url.length > 8192) { send(req, res, 400, { error: "Invalid path" }); return; }
      const url = new URL(req.url, origin);
      if (req.method === "POST") {
        if (![ENTRY + "login", ENTRY + "logout"].includes(url.pathname)) { send(req, res, 405, { error: "Inspect and navigate only" }); return; }
        if (req.headers.origin !== origin || req.headers["content-type"] !== "application/json") { send(req, res, 403, { error: "Same-origin JSON required" }); return; }
        if (url.pathname.endsWith("logout")) {
          await auth.signOut(token(req)); send(req, res, 200, { ok: true }, undefined, { "set-cookie": `${cookieName}=; Path=${ENTRY}; HttpOnly; SameSite=Strict; Max-Age=0` }); return;
        }
        const data = await body(req);
        let signed;
        try { signed = await auth.passwordSignIn(data.email, data.password, "127.0.0.1"); }
        catch (_error) { send(req, res, 401, { error: "Test account or password was not accepted" }); return; }
        // Dedicated temporary cookie; never reuses the production cookie/domain.
        send(req, res, 200, { ok: true }, undefined, { "set-cookie": `${cookieName}=${signed.token}; Path=${ENTRY}; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}` }); return;
      }
      if (!["GET", "HEAD"].includes(req.method)) { send(req, res, 405, { error: "Read-only realm" }); return; }
      if (url.pathname === ENTRY + "login") { send(req, res, 200, login, "text/html"); return; }
      if (files.has(url.pathname)) { const file = files.get(url.pathname); send(req, res, 200, fs.readFileSync(file), TYPES[path.extname(file)]); return; }
      if (![ENTRY, ENTRY + "catalog", ENTRY + "changes"].includes(url.pathname)) { send(req, res, 404, { error: "Not a private preview route" }); return; }
      const session = await auth.session(token(req));
      if (!session || !credentials.some(c => c.uid === session.auth.uid)) { send(req, res, url.pathname === ENTRY ? 302 : 401, { error: "Sign in to the private test" }, undefined, url.pathname === ENTRY ? { location: ENTRY + "login" } : {}); return; }
      if (url.pathname === ENTRY) {
        const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8")
          .replace("<head>", '<head><meta name="crownlands-stage-three" content="private">')
          .replace('<script defer src="/tools/map-benchmark/seamless/preview.js">', '<script defer src="/tools/map-benchmark/seamless/delta-feed.js"></script><script defer src="/tools/map-benchmark/seamless/preview.js">');
        send(req, res, 200, html, "text/html"); return;
      }
      if (url.pathname.endsWith("catalog")) { send(req, res, 200, realm.manifest); return; }
      let result;
      try {
        const revision = url.searchParams.get("revision"), epoch = url.searchParams.get("epoch");
        if (revision !== null && !/^\d{1,10}$/.test(revision)) throw Error("Invalid cursor");
        if (url.searchParams.get("realm") !== realm.manifest.realmId) throw Error("Wrong realm");
        result = await realm.read(session.auth.uid, (url.searchParams.get("ids") || "").split(","), revision === null ? null : { revision: Number(revision), epoch });
      } catch (_error) { send(req, res, 400, { error: "Invalid private area request" }); return; }
      // Revocation during a snapshot must not leak its in-flight result.
      if (!(await auth.session(token(req)))) { send(req, res, 401, { error: "Private test session ended" }); return; }
      send(req, res, 200, { ...result, scriptHealthy });
    } catch (_error) { if (!res.headersSent) send(req, res, 500, { error: "Private test unavailable" }); else res.destroy(); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxConnections = 16;
  async function close() {
    if (closing) return closing;
    expired = true; clearTimeout(timer); clearInterval(ticker);
    closing = (async () => {
      server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve));
      await ticking;
      await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await store.close();
    })(); return closing;
  }
  return { credentials, realm, auth, store, close, async listen(port = 0) {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); }); origin = `http://127.0.0.1:${server.address().port}`; cookieName = COOKIE + "_" + server.address().port;
    timer = setTimeout(() => { void close(); }, maxAgeMs);
    if (scripted) ticker = setInterval(() => { if (!ticking) ticking = realm.tick(++step).catch(() => { scriptHealthy = false; clearInterval(ticker); console.error("Private fixture updates paused after a database error."); }).finally(() => { ticking = null; }); }, 5000);
    return { url: origin, entry: origin + ENTRY + "?catalog=full" };
  } };
}
async function main() {
  const portArg = process.argv.find(a => a.startsWith("--port=")), port = Number(portArg?.slice(7) || 8801);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Choose an unprivileged port");
  const server = await createStageThreeServer({ crowded: process.argv.includes("--crowded") });
  const folder = path.join(ROOT, "release-artifacts/seamless-stage-three-session");
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 }); fs.chmodSync(folder, 0o700);
  const file = path.join(folder, `credentials-${port}.json`);
  try {
    const address = await server.listen(port);
    fs.writeFileSync(file, JSON.stringify({ ...server.credentials[0], url: address.entry }), { mode: 0o600 }); fs.chmodSync(file, 0o600);
    console.log(`Private authenticated fixture realm: ${address.entry}\nTemporary credentials: ${file}\nExpires in two hours; no production accounts or data are connected.`);
  } catch (error) { await server.close(); throw error; }
  const stop = async () => { await server.close(); fs.rmSync(file, { force: true }); };
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop(); });
  // Remove the saved credentials after the same maximum session lifetime.
  const cleanup = setTimeout(() => { fs.rmSync(file, { force: true }); }, 2 * 60 * 60 * 1000); cleanup.unref();
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createStageThreeServer, ENTRY, COOKIE };
