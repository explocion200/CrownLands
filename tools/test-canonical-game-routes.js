"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), net = require("node:net");
const { spawn, execFileSync } = require("node:child_process");
const { prepare, redirect, paths } = require("./local-deploy/canonical_game_routes");
const before = `{
\tadmin off
\tauto_https off
}
playcrownlands.com {
\trespond "Public website and existing APIs" 200
}
game.playcrownlands.com {
\troot * /srv/crownlands/current/game
\troute {
\t\t@internal path /.git /.git/* /.env /.env.*
\t\trespond @internal 404
\t\t@unsupported not method GET HEAD OPTIONS
\t\trespond @unsupported 405
\t\t@play path /play /play/
\t\trewrite @play /play/index.html
\t\tfile_server
\t}
}
origin.playcrownlands.com {
\trespond "Origin health check" 200
}
`;
const candidate = prepare(before);
assert.equal(candidate.replace(redirect, ""), before, "Only the alternate-host redirect insertion may change");
assert(candidate.indexOf("respond @unsupported 405") < candidate.indexOf("@canonicalGameEntry"));
assert(candidate.indexOf("respond @internal 404") < candidate.indexOf("@canonicalGameEntry"));
assert.match(redirect, /method GET HEAD/);
assert.match(redirect, /not header Sec-Fetch-Dest empty/);
assert.match(redirect, /rewrite \* \/play\/\n\s+redir https:\/\/playcrownlands\.com\{uri\} 308/);
assert.throws(() => prepare(candidate), /inspect existing redirects/);
assert.throws(() => prepare(before + before), /one unchanged/);
assert.throws(() => prepare(before.replace("game.playcrownlands.com {", "other.example {")), /one unchanged/);
assert.throws(() => prepare(before.replace("respond @unsupported 405", "respond @unsupported 403")), /layout changed/);
assert.throws(() => prepare(before.replace("/srv/crownlands/current/game", "/other")), /layout changed/);

async function runCaddy() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-routing-"));
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const serverConfig = path.join(directory, "Caddyfile"), logPath = path.join(directory, "caddy.log");
  let process, log;
  try {
    for (const file of ["index.html", "home.html", "play/index.html", "service-worker.js", "app-entry.js", "manifest.webmanifest", "local-deployment.json", "assets/fixture.js"]) {
      const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, "fixture:" + file);
    }
    const alternate = candidate.match(/^game\.playcrownlands\.com \{\n[\s\S]*?^\}/m)[0]
      .replace("game.playcrownlands.com", "http://127.0.0.1:" + port).replace("/srv/crownlands/current/game", directory);
    fs.writeFileSync(serverConfig, "{\n admin off\n auto_https off\n}\n" + alternate);
    execFileSync("caddy", ["validate", "--config", serverConfig, "--adapter", "caddyfile"], { stdio: "pipe" });
    log = fs.openSync(logPath, "w");
    process = spawn("caddy", ["run", "--config", serverConfig, "--adapter", "caddyfile"], { stdio: ["ignore", log, log] });
    const origin = "http://127.0.0.1:" + port;
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { await fetch(origin + "/app-entry.js"); ready = true; break; } catch (_) { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert(ready, "Isolated Caddy did not start");
    for (const entry of paths.map(value => value.replace("*", "old-link"))) {
      for (const query of ["", "?privateConversation=fixture&note=a%26b%20c&returnTo=https%3A%2F%2Fexample.invalid"]) {
        for (const method of ["GET", "HEAD"]) {
          const response = await fetch(origin + entry + query, { method, redirect: "manual" });
          assert.equal(response.status, 308, method + " " + entry);
          assert.equal(response.headers.get("location"), "https://playcrownlands.com/play/" + query);
        }
      }
    }
    for (const [entry, content] of [["/index.html", "index.html"], ["/home.html", "home.html"], ["/play/", "play/index.html"], ["/play/index.html", "play/index.html"]]) {
      const response = await fetch(origin + entry, { redirect: "manual", headers: { "Sec-Fetch-Dest": "empty" } });
      assert.equal(response.status, 200, "Worker cache request changed: " + entry);
      assert.equal(await response.text(), "fixture:" + content);
    }
    for (const file of ["service-worker.js", "app-entry.js", "manifest.webmanifest", "local-deployment.json", "assets/fixture.js"]) {
      const response = await fetch(origin + "/" + file, { redirect: "manual" });
      assert.equal(response.status, 200); assert.equal(await response.text(), "fixture:" + file);
    }
    for (const entry of ["/", "/play/", "/index.html"]) {
      assert.equal((await fetch(origin + entry, { method: "POST", redirect: "manual" })).status, 405);
    }
    for (const entry of ["/.env", "/.git/config"]) assert.equal((await fetch(origin + entry, { redirect: "manual" })).status, 404);
    console.log("Real Caddy redirects, query preservation, worker-cache compatibility and protected routes passed.");
  } finally {
    if (process && process.exitCode === null) { process.kill("SIGTERM"); await new Promise(resolve => process.once("exit", resolve)); }
    if (log !== undefined) fs.closeSync(log);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

(async () => {
  if (process.argv.includes("--caddy")) await runCaddy();
  console.log("Canonical game route preparation and unchanged-route checks passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
