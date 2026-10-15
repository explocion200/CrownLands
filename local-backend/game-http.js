"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
const net = require("node:net");
const { ClientData } = require("./client-data");
const { cookies, COOKIE, CSRF } = require("./auth-http");
const { localAddress } = require("./rehearsal-server");
const statusFor = Object.freeze({ "invalid-argument": 400, unauthenticated: 401, "permission-denied": 403, "not-found": 404,
  "already-exists": 409, aborted: 409, "failed-precondition": 400, "resource-exhausted": 429, unavailable: 503, "deadline-exceeded": 504 });
const fail = (code, status) => Object.assign(Error("The game request could not be completed."), { code, status });
function csrfEqual(left, right) { return typeof left === "string" && typeof right === "string" && /^[A-Za-z0-9_-]{43}$/.test(left) && /^[A-Za-z0-9_-]{43}$/.test(right) && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right)); }
async function body(req) {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json" || req.headers["content-encoding"]) throw fail("invalid-argument", 415);
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 262144) throw fail("resource-exhausted", 413); chunks.push(chunk); }
  let value; try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw fail("invalid-argument"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail("invalid-argument"); return value;
}
function send(res, status, value) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); }
function createGameServer({ store, auth, routes, ownerUid, expiresAt, preview, trustLoopbackProxy = true, maxConcurrent = 12, requestBudgetMs = 60000, now = Date.now }) {
  const data = new ClientData(store), origin = new URL(auth.origin), expiry = Date.parse(expiresAt), callables = new Map();
  if (origin.protocol !== "https:" || !/^[^/\0]{1,128}$/.test(ownerUid || "") || !Number.isFinite(expiry) || expiry <= now() || expiry > now() + 7 * 86400000) throw Error("Explicit private owner and expiring HTTPS game rehearsal required");
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 32) throw Error("Invalid concurrency bound");
  if (!Number.isInteger(requestBudgetMs) || requestBudgetMs < 10 || requestBudgetMs > 120000) throw Error("Invalid request deadline");
  for (const route of routes) if (route.kind === "callable") {
    if (callables.has(route.name) || !/^[A-Za-z][A-Za-z0-9]{1,100}$/.test(route.name) || typeof route.handler !== "function") throw Error("Invalid callable inventory");
    callables.set(route.name, route);
  }
  let active = 0;
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer"); res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive"); res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    let counted = false, timer, operationPromise, timedOut = false, disconnected = false;
    res.on("close", () => { if (!res.writableEnded) disconnected = true; });
    try {
      if (req.headers.host !== origin.host) throw fail("invalid-argument", 421);
      let ip = req.socket.remoteAddress;
      if (trustLoopbackProxy) {
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip) || !net.isIP(req.headers["x-crownlands-client-ip"])) throw fail("permission-denied");
        ip = req.headers["x-crownlands-client-ip"];
      }
      if (!localAddress(ip) || now() >= expiry) throw fail("not-found");
      const url = new URL(req.url, origin);
      if (url.origin !== origin.origin) throw fail("invalid-argument");
      if (preview && await preview(req, res, url)) return;
      if (url.search) throw fail("invalid-argument");
      if (active >= maxConcurrent) throw fail("resource-exhausted"); active++; counted = true;
      if (req.method === "GET" && url.pathname === "/api/local-game/health") { await store.pool.query("SELECT 1"); return send(res, 200, { ready: true, rehearsal: true }); }
      if (req.method !== "POST" || !url.pathname.startsWith("/api/local-game/v1/")) throw fail("not-found");
      const jar = cookies(req.headers.cookie);
      if (req.headers.origin !== origin.origin || !csrfEqual(jar[CSRF], req.headers["x-crownlands-csrf"])
        || (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin")) throw fail("permission-denied");
      await auth.rateLimit("game-ip", ip, 300, 60);
      const token = jar[COOKIE], session = await auth.session(token);
      if (!session) throw fail("unauthenticated");
      if (session.user.uid !== ownerUid) throw fail("permission-denied");
      await auth.rateLimit("game-account", session.user.uid, 240, 60);
      const input = await body(req);
      const operation = url.pathname.slice("/api/local-game/v1/".length);
      // Only the verified cookie supplies identity. Client-supplied auth/app/IP
      // objects never become a callable context or an anti-farming signal.
      let result;
      const guard = async client => {
        if (timedOut || disconnected) throw fail("deadline-exceeded");
        if (now() >= expiry) throw fail("unavailable");
        const current = await auth.session(token, client);
        if (!current || current.user.uid !== ownerUid) throw fail("unauthenticated");
      };
      operationPromise = store.withTransactionGuard(guard, async () => {
        if (operation === "read" || operation === "watch") {
          if (Object.keys(input).some(key => key !== "targets")) throw fail("invalid-argument");
          result = await data.read(session.auth, input.targets, { partial: operation === "watch" });
        } else if (operation === "write") {
          if (Object.keys(input).some(key => !["writes", "checks"].includes(key))) throw fail("invalid-argument");
          result = await data.write(session.auth, input.writes, input.checks);
        } else if (operation.startsWith("call/")) {
          if (Object.keys(input).some(key => key !== "data")) throw fail("invalid-argument");
          const route = callables.get(operation.slice(5)); if (!route) throw fail("not-found");
          if (input.data != null && (typeof input.data !== "object" || Array.isArray(input.data))) throw fail("invalid-argument");
          result = await route.handler({ auth: session.auth, data: input.data || {},
            rawRequest: { headers: { "x-forwarded-for": ip, "user-agent": String(req.headers["user-agent"] || "").slice(0, 512) }, ip } });
        } else throw fail("not-found");
      });
      await Promise.race([operationPromise, new Promise((_, reject) => {
        timer = setTimeout(() => { timedOut = true; reject(fail("deadline-exceeded")); }, requestBudgetMs);
      })]);
      return send(res, 200, { result: result ?? null });
    } catch (cause) {
      const code = cause.code === "auth/too-many-requests" ? "resource-exhausted" : Object.hasOwn(statusFor, cause.code) ? cause.code : "internal";
      const status = cause.status || statusFor[code] || 500;
      if (status === 429 || status === 503) res.setHeader("Retry-After", "10");
      const error = { status: code.toUpperCase().replaceAll("-", "_"), code: "functions/" + code,
        message: code === "internal" ? "The game request could not be completed." : cause.message };
      if (cause.details !== undefined && code !== "internal") error.details = cause.details;
      if (!res.headersSent) send(res, status, { error }); else res.destroy();
    } finally {
      clearTimeout(timer);
      // Keep a timed-out handler counted until it actually stops. Its inherited
      // transaction guard rejects late writes, and hung handlers cannot admit
      // an unbounded number of new executions.
      if (counted && timedOut && operationPromise) operationPromise.then(() => { active--; }, () => { active--; });
      else if (counted) active--;
    }
  });
  server.maxRequestsPerSocket = 100; server.keepAliveTimeout = 5000;
  return server;
}
module.exports = { createGameServer };
