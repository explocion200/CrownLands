"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { Store } = require("../local-backend/store");
const { AuthService } = require("../local-backend/auth");
const { createPlatform } = require("../local-backend/platform");
const { createGameServer } = require("../local-backend/game-http");
const { staticPreview } = require("../local-backend/preview-static");
const { prepareSchema, prepareCaddy, prepareClient, copyRuntime } = require("./local-migration/prepare_game_preview");
const { hashes } = require("./local-migration/prepare_auth_preview");
const root = path.resolve(__dirname, "..");

(async () => {
  const source = new Store({ schema: "migration_preview_source_" + crypto.randomBytes(4).toString("hex") });
  const target = new Store({ schema: "migration_game_preview_" + crypto.randomBytes(6).toString("hex") });
  const authStore = new Store({ schema: "migration_auth_preview_" + crypto.randomBytes(6).toString("hex") });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-game-preview-"));
  let server;
  try {
    execFileSync("python3", [path.join(__dirname, "local-migration/test_game_preview_update.py")], { stdio: "pipe" });
    await source.initialize(); await authStore.initialize();
    const auth = new AuthService({ store: authStore, rateKey: crypto.randomBytes(32) }); await auth.initialize();
    await authStore.pool.query(`INSERT INTO ${authStore.schema}.accounts(uid,body) VALUES('fixture-owner',$1)`, [{ localId: "fixture-owner" }]);
    await source.doc("players/fixture-owner").set({ gold: 500, nested: { source: true } });
    await source.doc("realmSecurity/global/configuration/ipIngress").set({ enabled: true, verified: true, suffixLength: 2 });
    await source.doc("deletedParent/absent/children/record").set({ preserved: true });
    const copied = await prepareSchema({ sourceSchema: source.schema, authSchema: authStore.schema, store: target });
    assert.equal(copied.count, 3); assert.equal(copied.ownerUid, "fixture-owner");
    assert.equal((await target.doc("deletedParent/absent/children/record").get()).data().preserved, true);
    assert.equal((await target.doc("realmSecurity/global/configuration/ipIngress").get()).data().suffixLength, 1);
    assert.equal((await source.doc("realmSecurity/global/configuration/ipIngress").get()).data().suffixLength, 2);
    await target.doc("players/fixture-owner").update({ gold: 600 }); assert.equal((await source.doc("players/fixture-owner").get()).data().gold, 500);
    await assert.rejects(prepareSchema({ sourceSchema: source.schema, authSchema: authStore.schema, store: target }), /preserved/);
    const platform = createPlatform({ store: target, secrets: { LINKED_ACCOUNT_IP_HMAC_KEY: "x".repeat(32) } });
    assert.equal(platform.defineSecret("LINKED_ACCOUNT_IP_HMAC_KEY").value(), "x".repeat(32));
    assert.throws(() => platform.defineSecret("STRIPE_CROWNS_LIVE_SECRET_KEY").value(), { code: "failed-precondition" });
    assert.throws(() => createPlatform({ store: target, secrets: { STRIPE_CROWNS_LIVE_SECRET_KEY: "x".repeat(32) } }), /Unexpected/);
    const before = "(crownlands_routes) {\n\troute {\n\t\thandle /local-auth/* {\n\t\t}\n\t}\n}";
    const after = prepareCaddy(before); assert(after.includes("remote_ip 127.0.0.1 ::1 192.168.1.0/24"));
    assert(after.includes("max_size 2097152"));
    assert(after.includes("header_up X-Crownlands-Client-IP {remote_host}")); assert.throws(() => prepareCaddy(after), /review/);
    const built = path.join(temp, "built"), publicDir = path.join(temp, "client"); fs.mkdirSync(built);
    fs.writeFileSync(path.join(built, "index.html"), '<html><script src="app-entry.js?v=fixture-sha"></script><link rel="manifest" href="manifest.webmanifest"></html>');
    fs.writeFileSync(path.join(built, "local-client.js"), "// fixture"); fs.writeFileSync(path.join(built, "ads-config.js"), "enabled: true");
    prepareClient(built, publicDir); assert.throws(() => prepareClient(built, publicDir), /replace/);
    assert(!fs.readFileSync(path.join(publicDir, "index.html"), "utf8").includes('rel="manifest"'));
    const outside = path.join(temp, "outside.js"); fs.writeFileSync(outside, "private fixture"); fs.symlinkSync(outside, path.join(publicDir, "escape.js"));
    server = createGameServer({ store: target, auth, routes: [], ownerUid: "fixture-owner", expiresAt: new Date(Date.now() + 60000).toISOString(), preview: staticPreview(publicDir) });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const request = (resource, ip = "192.168.1.145") => new Promise((resolve, reject) => {
      const req = http.get({ hostname: "127.0.0.1", port: server.address().port, path: resource,
        headers: { Host: "playcrownlands.com", "X-Crownlands-Client-IP": ip } }, res => {
        let text = ""; res.on("data", chunk => text += chunk); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
      }); req.on("error", reject);
    });
    const entry = "/api/local-game/rehearsal/";
    assert.equal((await request(entry + "?updateCheck=1")).status, 200);
    assert.equal((await request(entry + "local-client.js?v=test")).status, 200);
    for (const resource of ["escape.js", "%2e%2e%2foutside.js", ".env", "config.json"]) assert.equal((await request(entry + resource)).status, 404);
    assert.equal((await request(entry, "203.0.113.3")).status, 404);
    const page = await request(entry); assert.equal(page.headers["cache-control"], "no-store"); assert.match(page.headers["content-security-policy"], /connect-src 'self'/);
    assert(!page.text.includes("private fixture"));
    const fakeRepo = path.join(temp, "repo"), copiedRuntime = path.join(temp, "runtime");
    fs.mkdirSync(path.join(fakeRepo, "functions/node_modules/.bin"), { recursive: true }); fs.mkdirSync(path.join(fakeRepo, "local-backend"));
    fs.symlinkSync(outside, path.join(fakeRepo, "functions/node_modules/node")); fs.symlinkSync(outside, path.join(fakeRepo, "functions/node_modules/.bin/node"));
    fs.writeFileSync(path.join(fakeRepo, "functions/handler.js"), "// fixture handler");
    copyRuntime(fakeRepo, copiedRuntime);
    assert(!fs.existsSync(path.join(copiedRuntime, "functions/node_modules/node")));
    assert.equal(hashes(copiedRuntime).length, 1);
    fs.symlinkSync(outside, path.join(copiedRuntime, "functions/unexpected.js"));
    assert.throws(() => hashes(copiedRuntime), /symlink leaves/);

    const storage = () => {
      const values = new Map([["crownlands-save", "live"], ["crownlands-active-session-id", "live-session"]]);
      return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(String(key), String(value)), removeItem: key => values.delete(key) };
    };
    const local = storage(), session = storage(), window = { localStorage: local, sessionStorage: session };
    vm.runInNewContext(fs.readFileSync(path.join(publicDir, "local-preview.js"), "utf8"), { window, location: { origin: auth.origin, pathname: entry }, addEventListener() {} });
    assert.equal(window.localStorage.getItem("crownlands-save"), null);
    window.localStorage.setItem("crownlands-save", "private"); window.sessionStorage.setItem("crownlands-active-session-id", "private-session");
    assert.equal(local.getItem("crownlands-save"), "live"); assert.equal(session.getItem("crownlands-active-session-id"), "live-session");
    assert.equal(window.localStorage.key(0), "crownlands-save"); window.localStorage.clear(); assert.equal(local.getItem("crownlands-save"), "live");
    const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
    const helpers = worker.slice(worker.indexOf("function isCacheableResponse"), worker.indexOf("function isStaticAssetRequest"));
    const cache = vm.runInNewContext(helpers + ";({isCacheableResponse,isApiOrServerRequest})", { self: { location: { origin: auth.origin } } });
    for (const control of ["no-store", "private", "max-age=300, private", 'private="Set-Cookie"']) assert.equal(cache.isCacheableResponse({ status: 200, type: "basic", headers: new Headers({ "Cache-Control": control }) }), false);
    assert.equal(cache.isCacheableResponse({ status: 200, type: "basic", headers: new Headers({ "Cache-Control": "public, max-age=300" }) }), true);
    assert(cache.isApiOrServerRequest(new URL(auth.origin + "/local-auth/v1/session")));
    assert(cache.isApiOrServerRequest(new URL(auth.origin + entry)));
    console.log("Private game preview: isolated exact copy, overwrite refusal, source preservation, HMAC-only integration, LAN/proxy boundary, static traversal/symlink protection, no-store caching and separate browser storage passed.");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    for (const store of [source, target, authStore]) { await store.pool.query(`DROP SCHEMA IF EXISTS ${store.schema} CASCADE`); await store.close(); }
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error("Private game preview integration failed:", error.stack); process.exitCode = 1; });
