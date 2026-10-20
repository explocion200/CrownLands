"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), http = require("node:http");
const { createPhonePreviewServer, inSubnet, privateAddress } = require("./map-benchmark/seamless/phone-server");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  assert.ok(inSubnet("192.168.1.42", "192.168.1.145/24"));
  for (const address of ["192.168.2.42", "100.114.92.30", "8.8.8.8", "::1", "192.168.1.999"]) assert.ok(!inSubnet(address, "192.168.1.145/24"));
  assert.ok(!privateAddress("0.0.0.0") && !privateAddress("8.8.8.8"));
  assert.throws(() => createPhonePreviewServer({ host: "0.0.0.0" }));
  assert.throws(() => createPhonePreviewServer({ maxAgeMs: 3600001 }));
  let now = 100000;
  const server = createPhonePreviewServer({ host: "127.0.0.2", clock: () => now }), address = await server.listen();
  let session, cdp;
  try {
    const get = route => fetch(address.url + route);
    const entry = "/__benchmark__/seamless/";
    const html = await get(entry); assert.equal(html.status, 200);
    assert.match(await html.text(), new RegExp(`crownlands-private-preview-origin" content="${address.url}"`));
    assert.match(html.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.equal(html.headers.get("cross-origin-resource-policy"), "same-origin");
    const manifest = await (await get(entry + "catalog")).json(); assert.equal(manifest.sections.length, 81);
    assert.equal((await (await get(entry + "fixture")).json()).sections.length, 9);
    const section = manifest.sections[0];
    assert.equal((await get("/" + section.terrain)).status, 200);
    assert.equal((await get("/" + manifest.overviewAsset)).status, 200);
    assert.equal((await (await get(entry + "areas?ids=" + section.id)).json()).revision, 0);
    now += 5000; assert.equal((await (await get(entry + "areas?ids=" + section.id)).json()).revision, 1);
    assert.equal((await get(entry + "areas?ids=unknown")).status, 400);
    for (const route of ["/", "/.git/config", "/AGENTS.md", "/game.js", "/firebaseClient.js", "/tools/map-benchmark/server.js", "/tools/map-benchmark/seamless/phone-server.js", "/__benchmark__/", "/__benchmark__/requests", "/local-api/health", "/assets/worlds/core-expansion-v1/region-catalog.json", "/tools/map-benchmark/seamless/terrain/catalog-overview.json", "/%2e%2e/.git/config"]) assert.equal((await get(route)).status, 404, route);
    assert.equal((await fetch(address.url + entry, { method: "POST" })).status, 405);
    assert.equal((await fetch(address.url + entry, { method: "HEAD" })).status, 200);
    for (const headers of [{ origin: "https://example.com" }, { "sec-fetch-site": "cross-site" }]) assert.equal((await fetch(address.url + entry, { headers })).status, 403);
    const badHost = await new Promise((resolve, reject) => { const req = http.get(address.url + entry, { headers: { host: "example.com" } }, res => { res.resume(); resolve(res.statusCode); }); req.on("error", reject); });
    assert.equal(badHost, 403);
    const executable = [process.env.CHROME_PATH, process.env.CROWNLANDS_CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(p => p && fs.existsSync(p));
    assert.ok(executable, "Chrome is required for the phone-server browser smoke test");
    session = await startBrowserSession(executable);
    cdp = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    const errors = [], external = [], rejected = [];
    cdp.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.text));
    cdp.on("Network.requestWillBeSent", ({ request }) => { if (!request.url.startsWith(address.url) && !/^(blob:|data:)/.test(request.url)) external.push(request.url); });
    cdp.on("Network.responseReceived", ({ response }) => { if (response.status >= 400) rejected.push(response.url); });
    await cdp.send("Runtime.enable"); await cdp.send("Network.enable"); await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
    await cdp.send("Page.navigate", { url: address.url + entry + "?catalog=full" });
    let snapshot;
    for (let i = 0; i < 300; i++) {
      const result = await cdp.send("Runtime.evaluate", { expression: "window.seamlessPreview?.snapshot()", returnByValue: true });
      snapshot = result.result.value;
      if (snapshot?.feed.sections && !snapshot.feed.pending && !snapshot.assets.pending) break;
      await sleep(100);
    }
    assert.ok(snapshot?.feed.sections > 0 && snapshot.nodes > 0, "Phone endpoint failed to load the scene");
    assert.equal(snapshot.assets.failed, 0); assert.equal(snapshot.feed.failed, false);
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(rejected, []);
    now += 3600000; assert.equal((await get(entry)).status, 410);
  } finally {
    if (cdp) { try { await cdp.send("Browser.close"); } catch (_error) {} cdp.close(); }
    if (session) {
      if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill("SIGKILL"); await waitForProcessExit(session.browserProcess); }
      await removeBrowserProfile(session.profilePath);
    }
    await server.close();
  }
  await assert.rejects(fetch(address.url));
  const short = createPhonePreviewServer({ maxAgeMs: 50 }), expiring = await short.listen();
  await sleep(100); await assert.rejects(fetch(expiring.url)); await short.close();
  console.log("Temporary phone preview: fixed asset allowlist, private subnet/host/origin, read-only sample data, denied repository/live routes, mobile browser load and timed shutdown passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
