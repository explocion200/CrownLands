"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
const net = require("node:net");
const { secret } = require("./auth");

const COOKIE = "__Host-crownlands_session", CSRF = "__Host-crownlands_csrf", OAUTH = "__Host-crownlands_oauth";
const error = (code, status = 400) => Object.assign(Error(code), { code, status });
function cookies(header = "") {
  const result = Object.create(null);
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (Object.hasOwn(result, name)) throw error("duplicate-cookie");
    result[name] = part.slice(index + 1).trim();
  }
  return result;
}
const cookie = (name, value, seconds, httpOnly = true) => `${name}=${value}; Path=/; Secure; SameSite=Lax; Max-Age=${seconds}${httpOnly ? "; HttpOnly" : ""}`;
function equal(a, b) { return typeof a === "string" && typeof b === "string" && /^[A-Za-z0-9_-]{43}$/.test(a) && /^[A-Za-z0-9_-]{43}$/.test(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
async function jsonBody(req) {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") throw error("json-required", 415);
  if (req.headers["content-encoding"]) throw error("encoding-not-supported", 415);
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 16384) throw error("request-too-large", 413); chunks.push(chunk); }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw error("invalid-json"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw error("invalid-json");
  return value;
}
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
function actionPage(nonce) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Crownlands account</title>
<style nonce="${nonce}">body{font:18px system-ui;background:#172622;color:#f5eedb;margin:0;min-height:100vh;display:grid;place-items:center}main{width:min(85vw,430px);padding:32px}h1{font-size:28px}label,input,button{display:block}input,button{box-sizing:border-box;width:100%;padding:14px;margin:14px 0;font:inherit;border-radius:8px;border:1px solid #b7a879}button{background:#d6b86e;color:#172622;font-weight:600;cursor:pointer}a{color:#edcf86}#message{min-height:3em;line-height:1.5}</style>
<main><h1 id="title">Crownlands account</h1><p id="message" role="status">Preparing your account link…</p><form id="form" hidden><label id="label">New password<input id="password" type="password" minlength="12" maxlength="1024" autocomplete="new-password"></label><button id="submit">Continue</button></form><a href="/play/">Return to Crownlands</a></main>
<script nonce="${nonce}">
const params=new URLSearchParams(location.search),mode=params.get('mode'),token=params.get('token');
history.replaceState(null,'','/local-auth/action');
const form=document.getElementById('form'),message=document.getElementById('message'),password=document.getElementById('password'),button=document.getElementById('submit');
let csrf;
if(!['verifyEmail','resetPassword'].includes(mode)||!token){message.textContent='This account link is invalid. Request a new link from the sign-in screen.';}
else fetch('/local-auth/v1/session',{credentials:'same-origin'}).then(r=>r.json()).then(data=>{
csrf=data.csrf;if(!csrf)throw Error();form.hidden=false;document.getElementById('title').textContent=mode==='verifyEmail'?'Verify your email':'Set a new password';
document.getElementById('label').hidden=mode==='verifyEmail';password.required=mode==='resetPassword';
message.textContent=mode==='verifyEmail'?'Select Verify email to confirm this address.':'Use at least 12 characters. Your other sessions will be signed out.';button.textContent=mode==='verifyEmail'?'Verify email':'Save password';
}).catch(()=>{message.textContent='We could not open this link. Please try again shortly.';});
form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;
try{const response=await fetch('/local-auth/v1/email-action',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Crownlands-CSRF':csrf},body:JSON.stringify({token,mode,password:password.value})});
if(!response.ok)throw Error();form.hidden=true;password.value='';message.textContent=mode==='verifyEmail'?'Your email is verified. Return to Crownlands to continue.':'Your password was saved. Return to Crownlands and sign in.';
}catch{message.textContent='This link could not be used. It may have expired. Request a new link from the sign-in screen.';button.disabled=false;}});
</script></html>`;
}

function createAuthServer({ auth, trustLoopbackProxy = false, maxConcurrent = 12, maxPasswordConcurrent = 2,
  beforeRoute, afterSignInPath = "/play/?localAuth=complete" }) {
  const origin = new URL(auth.origin); let active = 0, hashing = 0;
  if (origin.protocol !== "https:") throw Error("Authentication requires an HTTPS origin");
  if (!/^\/(?!\/)[A-Za-z0-9_/?=&-]+$/.test(afterSignInPath)) throw Error("Sign-in return path must be a local path");
  const handler = async (req, res) => {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    let counted = false, hashCounted = false;
    try {
      if (req.headers.host !== origin.host) throw error("invalid-host", 421);
      if (active >= maxConcurrent) throw error("unavailable", 503);
      active++; counted = true;
      const url = new URL(req.url, origin), path = url.pathname;
      if (url.origin !== origin.origin) throw error("invalid-url");
      const jar = cookies(req.headers.cookie), token = jar[COOKIE];
      let ip = req.socket.remoteAddress;
      if (trustLoopbackProxy) {
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip) || !net.isIP(req.headers["x-crownlands-client-ip"])) throw error("invalid-proxy", 403);
        ip = req.headers["x-crownlands-client-ip"];
      }
      if (beforeRoute && await beforeRoute(req, res, { ip, path, token })) return;
      if (req.method === "GET" && path === "/local-auth/health") { await auth.pool.query("SELECT 1"); return send(res, 200, { ready: true, rehearsal: true }); }
      if (req.method === "GET" && path === "/local-auth/v1/session") {
        const csrf = /^[A-Za-z0-9_-]{43}$/.test(jar[CSRF] || "") ? jar[CSRF] : secret();
        res.setHeader("Set-Cookie", cookie(CSRF, csrf, 30 * 86400, false));
        const current = await auth.session(token);
        return send(res, 200, { user: current?.user || null, authTime: current?.authTime || null, csrf });
      }
      if (req.method === "GET" && path === "/local-auth/action") {
        const nonce = secret();
        res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(actionPage(nonce));
      }
      if (req.method === "GET" && path === "/local-auth/google/callback") {
        await auth.rateLimit("oauth-callback-ip", ip, 40);
        const signed = await auth.googleFinish({ state: url.searchParams.get("state"), binding: jar[OAUTH], code: url.searchParams.get("code") });
        res.setHeader("Set-Cookie", [cookie(COOKIE, signed.token, 30 * 86400), cookie(OAUTH, "", 0)]);
        res.writeHead(303, { Location: afterSignInPath }); return res.end();
      }
      if (req.method !== "POST" || !path.startsWith("/local-auth/v1/")) throw error("not-found", 404);
      if (req.headers.origin !== origin.origin || !equal(jar[CSRF], req.headers["x-crownlands-csrf"])) throw error("csrf-rejected", 403);
      if (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin") throw error("cross-site-rejected", 403);
      const data = await jsonBody(req);
      const operation = path.slice("/local-auth/v1/".length);
      if (["login", "register", "password-link", "email-action"].includes(operation)) {
        if (hashing >= maxPasswordConcurrent) throw error("auth/too-many-requests", 429);
        hashing++; hashCounted = true;
      }
      let result;
      if (operation === "login") result = await auth.passwordSignIn(data.email, data.password, ip);
      else if (operation === "register") result = await auth.createPasswordAccount(data.email, data.password, ip);
      else if (operation === "logout") { await auth.signOut(token); res.setHeader("Set-Cookie", cookie(COOKIE, "", 0)); result = { completed: true }; }
      else if (operation === "reset-request") result = await auth.requestPasswordReset(data.email, ip);
      else if (operation === "verification-request") result = await auth.requestVerification(token, ip);
      else if (operation === "password-link") result = { user: await auth.addPassword(token, data.password) };
      else if (operation === "email-action") { await auth.rateLimit("email-action-ip", ip, 20); result = await auth.finishEmailAction(data.token, data.mode, data.password); }
      else if (operation === "google-start") {
        await auth.rateLimit("oauth-start-ip", ip, 20);
        if (data.reauthenticate && !token) throw error("auth/user-token-expired", 401);
        const binding = secret();
        result = { url: await auth.googleStart(binding, data.reauthenticate ? token : null) };
        res.setHeader("Set-Cookie", cookie(OAUTH, binding, 600));
      } else throw error("not-found", 404);
      if (result?.token) { res.setHeader("Set-Cookie", cookie(COOKIE, result.token, 30 * 86400)); result = { user: result.user }; }
      return send(res, 200, result);
    } catch (cause) {
      const allowed = new Set(["auth/invalid-credential", "auth/invalid-email", "auth/weak-password", "auth/too-many-requests", "auth/operation-not-allowed", "auth/email-already-in-use", "auth/account-exists-with-different-credential", "auth/migration-account-unavailable", "auth/user-token-expired", "auth/user-mismatch", "auth/requires-recent-login", "auth/provider-already-linked", "auth/invalid-action-code"]);
      const code = allowed.has(cause.code) || cause.status ? cause.code : "unavailable";
      const status = cause.status || (code === "auth/too-many-requests" ? 429 : allowed.has(code) ? 400 : 503);
      if (status === 429 || status === 503) res.setHeader("Retry-After", "30");
      // No URLs, request bodies, tokens, private database failures or credentials in logs.
      if (!res.headersSent) send(res, status, { error: { code, message: "The request could not be completed. Please try again." } });
      else res.destroy();
    } finally { if (counted) active--; if (hashCounted) hashing--; }
  };
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 15000, headersTimeout: 10000 }, handler);
  server.maxRequestsPerSocket = 100; server.keepAliveTimeout = 5000;
  return server;
}

module.exports = { createAuthServer, cookies, COOKIE, CSRF, OAUTH };
