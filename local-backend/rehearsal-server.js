"use strict";
// A temporary, LAN-only sign-in test. This process has no game API or workers.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { Store } = require("./store");
const { AuthService, secret } = require("./auth");
const { createAuthServer } = require("./auth-http");

const ENTRY = "/local-auth/rehearsal";
const permitted = new Set(["GET /local-auth/health", "GET /local-auth/v1/session", "GET /local-auth/google/callback",
  "POST /local-auth/v1/login", "POST /local-auth/v1/logout", "POST /local-auth/v1/google-start"]);
const lan = new net.BlockList();
lan.addAddress("127.0.0.1"); lan.addAddress("::1", "ipv6"); lan.addSubnet("192.168.1.0", 24);
function localAddress(ip) {
  if (typeof ip !== "string") return false;
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const family = net.isIP(ip);
  return family !== 0 && lan.check(ip, family === 6 ? "ipv6" : "ipv4");
}
function page(nonce) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Crownlands sign-in test</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{font:17px system-ui;margin:0;background:#172622;color:#f5eedb;min-height:100vh;display:grid;place-items:center}main{width:min(100%,600px);padding:28px}h1{font-size:30px;margin:0 0 14px}p{line-height:1.5}label{display:block;margin:14px 0 6px}input,button{font:inherit;width:100%;padding:12px;border:1px solid #b7a879;border-radius:7px}input{background:#fffaf0}button{background:#d6b86e;color:#172622;font-weight:600;margin-top:14px;cursor:pointer}button:disabled{opacity:.6;cursor:wait}a{color:#edcf86}#message{padding:14px;border:1px solid #8b9c91;border-radius:7px}#complete{color:#c9eccf}[hidden]{display:none!important}</style>
<main><h1>Test your local sign-in</h1><p>This checks the account copy on your Crownlands computer. The live game and your progress still use Firebase.</p><p id="message" role="status">Preparing the sign-in test…</p>
<section id="signin" hidden><button id="google" type="button">Continue with Google</button><p>Or use your existing Crownlands password.</p><form id="form"><label for="email">Email</label><input id="email" type="email" autocomplete="username" required maxlength="320"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required maxlength="1024"><button type="submit">Test password sign-in</button></form></section>
<section id="complete" hidden><h2>Local sign-in worked</h2><p id="identity"></p><p id="profile"></p><button id="logout" type="button">Sign out of the test</button></section><p><a href="/play/">Return to the live game</a></p></main>
<script nonce="${nonce}">
let csrf;const message=document.getElementById('message'),signin=document.getElementById('signin'),complete=document.getElementById('complete');
async function post(operation,data){const response=await fetch('/local-auth/v1/'+operation,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Crownlands-CSRF':csrf},body:JSON.stringify(data)});if(!response.ok)throw Error();return response.json();}
async function refresh(){const session=await fetch('/local-auth/v1/session',{credentials:'same-origin'});if(!session.ok)throw Error();const data=await session.json();csrf=data.csrf;
if(!data.user){signin.hidden=false;complete.hidden=true;message.textContent='Use your existing Crownlands account. This test does not change your live account.';return;}
const response=await fetch('/local-auth/rehearsal/status',{credentials:'same-origin'});if(!response.ok)throw Error();const result=await response.json();signin.hidden=true;complete.hidden=false;
document.getElementById('identity').textContent=result.identityPreserved?'Your original account ID is preserved.':'Account identity could not be confirmed.';
document.getElementById('profile').textContent=result.profileFound?'Your existing player profile was found in the migration copy.':'No player profile was found in this snapshot. Tell Codex before continuing.';
message.textContent='Account test complete. Gameplay testing comes next.';}
document.getElementById('google').onclick=async()=>{const button=document.getElementById('google');button.disabled=true;try{const result=await post('google-start',{});const url=new URL(result.url);if(url.origin!=='https://accounts.google.com')throw Error();location.assign(url.href);}catch{message.textContent='Google sign-in could not start. Tell Codex what happened.';button.disabled=false;}};
document.getElementById('form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await post('login',{email:document.getElementById('email').value,password:document.getElementById('password').value});document.getElementById('password').value='';await refresh();}catch{message.textContent='Sign-in was not completed. Check your existing account details or tell Codex.';}finally{button.disabled=false;}};
document.getElementById('logout').onclick=async()=>{try{await post('logout',{});await refresh();}catch{message.textContent='Sign-out could not finish. Please try again.';}};
refresh().catch(()=>{message.textContent='The private sign-in test is unavailable. Tell Codex before trying again.';});
</script></html>`;
}

function createRehearsalServer({ auth, expiresAt, trustLoopbackProxy = true, now = Date.now, allowEmailActionTest = false }) {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now() || expiry > now() + 7 * 86400000) throw Error("Rehearsal must expire within seven days");
  return createAuthServer({ auth, trustLoopbackProxy, afterSignInPath: ENTRY, emailActionRehearsal: allowEmailActionTest === true,
    beforeRoute: async (req, res, { ip, path: requestPath, token }) => {
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      if (!localAddress(ip) || now() >= expiry) { res.writeHead(404); res.end(); return true; }
      if (req.method === "GET" && requestPath === ENTRY) {
        const nonce = secret();
        res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(page(nonce)); return true;
      }
      if (req.method === "GET" && requestPath === ENTRY + "/status") {
        const session = await auth.session(token);
        if (!session) { res.writeHead(401); res.end(); return true; }
        const result = await auth.pool.query(`SELECT profile_found FROM ${auth.schema}.rehearsal_identity WHERE uid=$1`, [session.user.uid]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ identityPreserved: result.rowCount === 1, profileFound: result.rows[0]?.profile_found === true })); return true;
      }
      const actionTest = allowEmailActionTest === true && ["GET /local-auth/action", "POST /local-auth/v1/email-action"].includes(req.method + " " + requestPath);
      if (!actionTest && !permitted.has(req.method + " " + requestPath)) { res.writeHead(404); res.end(); return true; }
      return false;
    } });
}

async function start(configPath) {
  const stat = fs.statSync(configPath);
  if (!stat.isFile() || (stat.mode & 0o007) || stat.size > 65536) throw Error("Private service configuration is required");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (config.origin !== "https://playcrownlands.com" || !/^migration_auth_preview_[a-f0-9]{12}$/.test(config.schema)
    || !/^[A-Za-z0-9_-]{43}$/.test(config.rateKey)) throw Error("Invalid private rehearsal configuration");
  const store = new Store({ schema: config.schema });
  try {
    const privileges = (await store.pool.query(`SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,
      has_schema_privilege(current_user,$1,'CREATE') AS creates FROM pg_roles r WHERE r.rolname=current_user`, [config.schema])).rows[0];
    if (!privileges || privileges.rolsuper || privileges.rolcreatedb || privileges.rolcreaterole || privileges.creates) throw Error("Rehearsal needs a restricted runtime database role");
    const auth = new AuthService({ store, origin: config.origin, hashConfig: config.hashConfig, google: config.google,
      rateKey: Buffer.from(config.rateKey, "base64url"), allowRegistration: false });
    await auth.initialize({ createTables: false });
    if (Number((await store.pool.query(`SELECT count(*) AS n FROM ${config.schema}.accounts`)).rows[0].n) !== 1) throw Error("The owner-only rehearsal needs exactly one account copy");
    const server = createRehearsalServer({ auth, expiresAt: config.expiresAt, allowEmailActionTest: config.allowEmailActionTest });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(9190, "127.0.0.1", resolve); });
    let stopping = false;
    const shutdown = () => { if (stopping) return; stopping = true; server.close(() => store.close().then(() => process.exit(0)));
      setTimeout(() => process.exit(1), 10000).unref(); };
    process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown);
    console.log("Private Crownlands sign-in rehearsal is ready on loopback; no game workers or email delivery are enabled.");
    return { server, store };
  } catch (cause) { await store.close(); throw cause; }
}
if (require.main === module) {
  const directory = process.env.CREDENTIALS_DIRECTORY;
  if (!directory) { console.error("System service credentials are required."); process.exitCode = 1; }
  else start(path.join(directory, "config")).catch(() => { console.error("Private sign-in rehearsal could not start; configuration and database details were not logged."); process.exitCode = 1; });
}
module.exports = { createRehearsalServer, localAddress, start };
