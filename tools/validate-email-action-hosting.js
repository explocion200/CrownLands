"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { checkHosting, readClientConfig } = require("./check-email-action-hosting");
const config = { projectId: "fixture-project", appId: "fixture-app", authDomain: "fixture-project.firebaseapp.com", apiKey: "fixture-key-do-not-log" };
const json = value => new Response(JSON.stringify(value), { headers: { "content-type": "application/json; charset=utf-8" } });

async function main() {
  const requested = [];
  const healthy = async (url, options) => {
    const route = new URL(url).pathname;
    requested.push(route);
    assert.equal(new URL(url).search, "", "The probe must not carry action codes or API keys.");
    assert.equal(options.method, "GET", "The probe must never mutate accounts or send mail.");
    assert.equal(options.redirect, "manual", "A redirect must not masquerade as healthy Firebase configuration.");
    assert.equal(options.cache, "no-store");
    assert(options.signal instanceof AbortSignal);
    if (route === "/__/firebase/init.json") return json(config);
    if (route === "/__/auth/action") return new Response("<html></html>", { headers: { "content-type": "text/html" } });
    assert.equal(route, "/__/auth/action.js");
    return new Response("/* fixture action helper */", { headers: { "content-type": "text/javascript; charset=utf-8" } });
  };
  const options = { attempts: 1, fetchImpl: healthy };
  assert.equal((await checkHosting(config, options)).attempts, 1);
  assert.deepEqual(requested, ["/__/firebase/init.json", "/__/auth/action", "/__/auth/action.js"]);
  for (const status of [301, 302, 404, 500]) {
    await assert.rejects(checkHosting(config, { ...options, fetchImpl: async () => new Response("private upstream data", { status,
      headers: { location: "https://game.example/?private=do-not-log" } }) }), error => error.message.includes(`HTTP ${status}`)
        && !/private|game\.example/.test(error.message));
  }
  await assert.rejects(checkHosting(config, { ...options, fetchImpl: async () => new Response("game landing page") }), /content type/);
  await assert.rejects(checkHosting(config, { ...options, fetchImpl: async () => new Response("bad JSON private payload", {
    headers: { "content-type": "application/json" },
  }) }), error => error.message.endsWith("JSON is invalid."));
  for (const key of Object.keys(config)) {
    await assert.rejects(checkHosting(config, { ...options, fetchImpl: async () => json({ ...config, [key]: "private-wrong-value" }) }),
      error => error.message.includes(key) && !/private|fixture-key/.test(error.message));
    const missing = { ...config }; delete missing[key];
    await assert.rejects(checkHosting(config, { ...options, fetchImpl: async () => json(missing) }), /does not match/);
  }
  await assert.rejects(checkHosting(config, { ...options, fetchImpl: async () => { throw Error("token=private"); } }),
    error => error.message.endsWith("could not be read."));
  for (const failed of ["/__/auth/action", "/__/auth/action.js"]) {
    await assert.rejects(checkHosting(config, { ...options, fetchImpl: (url, requestOptions) => new URL(url).pathname === failed
      ? new Response("Not found", { status: 404 }) : healthy(url, requestOptions) }), /HTTP 404/);
  }
  let tries = 0, sleeps = 0;
  const retry = { attempts: 3, sleep: async () => { sleeps++; }, fetchImpl: (url, requestOptions) => {
    if (new URL(url).pathname.endsWith("init.json") && ++tries < 3) return new Response("", { status: 301 });
    return healthy(url, requestOptions);
  } };
  assert.equal((await checkHosting(config, retry)).attempts, 3);
  assert.equal(sleeps, 2);
  tries = 0; sleeps = 0;
  await assert.rejects(checkHosting(config, { ...retry, fetchImpl: async () => { tries++; return new Response("", { status: 301 }); } }), /HTTP 301/);
  assert.equal(tries, 3); assert.equal(sleeps, 2);
  await assert.rejects(checkHosting({ ...config, authDomain: "other.example/path" }, options), /Firebase-hosted/);

  const root = path.resolve(__dirname, "..");
  const hosting = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8")).hosting;
  assert(hosting.postdeploy.includes("node tools/check-email-action-hosting.js"));
  assert.equal(hosting.public, "firebase-hosting-redirect", "Keep the canonical game on its existing web host.");
  // Use the matcher used by the locked Firebase CLI's Hosting server.
  const firebaseRequire = createRequire(require.resolve("../functions/node_modules/firebase-tools/package.json"));
  const { configMatcher } = firebaseRequire("superstatic/lib/utils/patterns");
  const redirects = route => hosting.redirects.filter(rule => configMatcher(route, rule));
  for (const route of ["/__", "/__/", "/__/firebase/init.json", "/__/firebase/init.js",
    "/__/firebase/init.js?useEmulator=true", "/__/auth/action", "/__/auth/action.js", "/__/auth/handler", "/__/auth/iframe"]) {
    assert.equal(redirects(route.split("?")[0]).length, 0, `Reserved endpoint ${route} is captured by a game redirect.`);
  }
  for (const route of ["/", "/play/", "/index.html", "/old/path", "/.well-known/other", "/__other/path", "/a/__/b"]) {
    const rules = redirects(route);
    assert(rules.length > 0, `Normal game URL ${route} lost its redirect.`);
    assert.equal(rules[0].destination, "https://crownland.netlify.app");
    assert.equal(rules[0].type, 301);
  }
  const client = readClientConfig();
  assert.equal(client.authDomain, `${client.projectId}.firebaseapp.com`);
  console.log("Email action hosting checks passed: bootstrap redirects, missing/wrong config, action assets, retry bounds, read-only requests, private-data redaction, and deployment hook.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
