"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const { createAuthServer, COOKIE, CSRF, OAUTH } = require("../local-backend/auth-http");
const { secret } = require("../local-backend/auth");

(async () => {
  let calls = 0, loggedOut, googleBinding, release;
  const sessionToken = secret(), csrf = secret(), user = { uid: "fixture-only", emailVerified: true };
  const auth = { origin: "https://playcrownlands.com", pool: { query: async () => {} },
    session: async token => token === sessionToken ? { user, authTime: 1 } : null,
    passwordSignIn: async () => { calls++; return { token: sessionToken, user }; },
    signOut: async token => { loggedOut = token; }, rateLimit: async () => {},
    googleStart: async binding => { googleBinding = binding; return "https://accounts.google.com/fixture"; },
    googleFinish: async ({ binding }) => { assert.equal(binding, googleBinding); return { token: sessionToken, user }; },
    finishEmailAction: async () => { throw Error("private-db-details-must-not-leak"); },
  };
  const server = createAuthServer({ auth, maxPasswordConcurrent: 1 });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path, method: options.method || "GET",
      headers: { Host: "playcrownlands.com", ...options.headers } }, res => {
      let text = ""; res.setEncoding("utf8"); res.on("data", value => text += value);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) }));
    });
    req.on("error", reject); req.end(options.body);
  });
  const headers = { Origin: auth.origin, "Content-Type": "application/json", Cookie: `${CSRF}=${csrf}; ${COOKIE}=${sessionToken}`, "X-Crownlands-CSRF": csrf, "Sec-Fetch-Site": "same-origin" };
  const post = (path, data, extra = {}) => request("/local-auth/v1/" + path, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(data) });
  try {
    assert.equal((await request("/local-auth/v1/session", { headers: { Host: "attacker.example" } })).status, 421);
    const anonymous = await request("/local-auth/v1/session");
    assert.equal(anonymous.status, 200); assert.equal(anonymous.json().user, null);
    assert.match(anonymous.headers["set-cookie"][0], /Secure; SameSite=Lax/);
    const current = await request("/local-auth/v1/session", { headers: { Cookie: `${COOKIE}=${sessionToken}` } });
    assert.deepEqual(current.json().user, user); assert.ok(!current.text.includes(sessionToken));
    for (const extra of [{ Origin: "https://attacker.example" }, { "X-Crownlands-CSRF": secret() }, { "Sec-Fetch-Site": "cross-site" }]) {
      assert.equal((await post("login", { email: "fixture@example.test", password: "fixture" }, extra)).status, 403);
    }
    assert.equal(calls, 0);
    assert.equal((await post("login", {}, { Cookie: `${CSRF}=${csrf}; ${CSRF}=${csrf}` })).status, 400);
    assert.equal((await post("login", {}, { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await post("login", { password: "x".repeat(20000) })).status, 413);
    const signed = await post("login", { email: "fixture@example.test", password: "fixture" });
    assert.equal(signed.status, 200); assert.deepEqual(signed.json(), { user });
    assert.match(signed.headers["set-cookie"][0], /Path=\/; Secure; SameSite=Lax; Max-Age=2592000; HttpOnly/);
    assert.ok(!signed.text.includes(sessionToken));
    const failed = await post("email-action", {}); assert.equal(failed.status, 503); assert.ok(!failed.text.includes("private-db"));
    const oauth = await post("google-start", {}); assert.equal(oauth.status, 200); assert.match(oauth.headers["set-cookie"][0], /HttpOnly/);
    const callback = await request("/local-auth/google/callback?state=fixture&code=fixture", { headers: { Cookie: `${OAUTH}=${googleBinding}` } });
    assert.equal(callback.status, 303); assert.equal(callback.headers.location, "/play/?localAuth=complete");
    const page = await request("/local-auth/action?mode=resetPassword&token=fixture");
    assert.match(page.headers["content-security-policy"], /script-src 'nonce-/); assert.equal(page.headers["referrer-policy"], "no-referrer");
    assert.ok(page.text.includes("history.replaceState"));
    await post("logout", {}); assert.equal(loggedOut, sessionToken);
    auth.passwordSignIn = async () => { await new Promise(resolve => { release = resolve; }); return { token: sessionToken, user }; };
    const pending = post("login", {});
    while (!release) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal((await post("login", {})).status, 429); release(); await pending;
    console.log("Local auth HTTP: strict host/origin/CSRF, secure cookies, token redaction, request/concurrency limits, OAuth cookie binding, email-action headers and private error redaction passed.");
  } finally { if (release) release(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
