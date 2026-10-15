"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { createRehearsalServer, localAddress } = require("../local-backend/rehearsal-server");
const { COOKIE } = require("../local-backend/auth-http");
const { secret } = require("../local-backend/auth");
const { prepareCaddy } = require("./local-migration/prepare_auth_preview");

(async () => {
  let now = Date.now(), statusReads = 0;
  const token = secret(), user = { uid: "synthetic-owner-only" };
  const auth = { origin: "https://playcrownlands.com", schema: "migration_fixture",
    session: async value => value === token ? { user } : null,
    pool: { query: async (sql, values) => { if (sql.includes("rehearsal_identity")) { statusReads++; assert.deepEqual(values, [user.uid]); return { rowCount: 1, rows: [{ profile_found: true }] }; } return {}; } },
    rateLimit: async () => {}, googleFinish: async () => ({ token, user }),
  };
  const server = createRehearsalServer({ auth, expiresAt: new Date(now + 10000).toISOString(), now: () => now });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const request = (path, headers = {}, method = "GET") => new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path, method,
      headers: { Host: "playcrownlands.com", "X-Crownlands-Client-IP": "192.168.1.145", ...headers } }, res => {
      let body = ""; res.setEncoding("utf8"); res.on("data", chunk => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on("error", reject); req.end();
  });
  try {
    for (const ip of ["127.0.0.1", "192.168.1.145", "::1", "::ffff:192.168.1.145"]) assert.equal(localAddress(ip), true);
    for (const ip of ["192.168.2.1", "8.8.8.8", "192.168.1.145,8.8.8.8", undefined]) assert.equal(localAddress(ip), false);
    const page = await request("/local-auth/rehearsal"); assert.equal(page.status, 200);
    assert.match(page.body, /live game and your progress still use Firebase/);
    assert.match(page.headers["content-security-policy"], /script-src 'nonce-/);
    assert.equal(page.headers["x-robots-tag"], "noindex, nofollow, noarchive");
    assert.ok(!page.body.includes(token));
    for (const ip of ["8.8.8.8", "2001:4860:4860::8888"]) {
      assert.equal((await request("/local-auth/rehearsal", { "X-Crownlands-Client-IP": ip, "X-Forwarded-For": "192.168.1.145" })).status, 404);
      assert.equal((await request("/local-auth/google/callback?code=fixture", { "X-Crownlands-Client-IP": ip })).status, 404);
    }
    assert.equal((await request("/local-auth/health", { Host: "origin.playcrownlands.com" })).status, 421);
    assert.equal((await request("/local-auth/health", { "X-Crownlands-Client-IP": "invalid" })).status, 403);
    assert.equal((await request("/local-auth/rehearsal/status")).status, 401); assert.equal(statusReads, 0);
    const status = await request("/local-auth/rehearsal/status?uid=someone-else", { Cookie: `${COOKIE}=${token}` });
    assert.deepEqual(JSON.parse(status.body), { identityPreserved: true, profileFound: true });
    assert.ok(!status.body.includes(user.uid));
    for (const operation of ["register", "reset-request", "verification-request", "password-link", "email-action"]) {
      assert.equal((await request("/local-auth/v1/" + operation, {}, "POST")).status, 404);
    }
    assert.equal((await request("/local-auth/action?token=fixture")).status, 404);
    const callback = await request("/local-auth/google/callback?state=fixture&code=fixture");
    assert.equal(callback.status, 303); assert.equal(callback.headers.location, "/local-auth/rehearsal");
    now += 10001;
    assert.equal((await request("/local-auth/v1/session", { Cookie: `${COOKIE}=${token}` })).status, 404);
    assert.throws(() => createRehearsalServer({ auth, expiresAt: "invalid" }), /expire/);
    assert.throws(() => createRehearsalServer({ auth, expiresAt: new Date(Date.now() + 8 * 86400000).toISOString() }), /expire/);
    const before = "(crownlands_routes) {\n\troute {\n\t\thandle /backup-healthz {\n\t\t\trespond ok 200\n\t\t}\n\t}\n}\n";
    const after = prepareCaddy(before);
    assert.ok(after.endsWith(before.slice(before.indexOf("\t\thandle /backup-healthz"))));
    assert.ok(after.includes("remote_ip 127.0.0.1 ::1 192.168.1.0/24"));
    assert.ok(after.includes("header_up X-Crownlands-Client-IP {remote_host}"));
    assert.throws(() => prepareCaddy(after), /Existing/);
    assert.throws(() => prepareCaddy("unknown configuration"), /Unexpected/);
    console.log("Account rehearsal: LAN and host restrictions, untrusted forwarding headers, expiry, blocked account changes/email, session-owned profile check, local callback return and additive Caddy routing passed.");
  } finally { await new Promise(resolve => server.close(resolve)); }
  const actionServer = createRehearsalServer({ auth, expiresAt: new Date(Date.now() + 60000).toISOString(), allowEmailActionTest: true });
  await new Promise(resolve => actionServer.listen(0, "127.0.0.1", resolve));
  try {
    const actionRequest = (url, options = {}) => new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: actionServer.address().port, path: url, method: options.method || "GET",
        headers: { Host: "playcrownlands.com", "X-Crownlands-Client-IP": "192.168.1.145", ...options.headers } }, res => {
        let body = ""; res.setEncoding("utf8"); res.on("data", chunk => body += chunk);
        res.on("end", () => resolve({ status: res.statusCode, text: async () => body }));
      }); req.on("error", reject); req.end();
    });
    const action = await actionRequest("/local-auth/action?token=fixture"); assert.equal(action.status, 200);
    const body = await action.text(); assert.match(body, /live Firebase password is unchanged/); assert.match(body, /Return to sign-in test/);
    assert.equal((await actionRequest("/local-auth/v1/email-action", { method: "POST" })).status, 403);
    for (const operation of ["register", "reset-request", "verification-request", "password-link"]) {
      assert.equal((await actionRequest("/local-auth/v1/" + operation, { method: "POST" })).status, 404);
    }
    assert.equal((await actionRequest("/local-auth/action", { headers: { "X-Crownlands-Client-IP": "8.8.8.8" } })).status, 404);
    console.log("Account action preview: explicit opt-in, private-copy notice, retained CSRF/LAN boundaries and blocked email-request routes passed.");
  } finally { await new Promise(resolve => actionServer.close(resolve)); }
})().catch(cause => { console.error(cause); process.exitCode = 1; });
