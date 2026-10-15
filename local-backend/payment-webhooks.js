"use strict";
const http = require("node:http");
const { Store } = require("./store");
const { createLiveCrownPaymentsWebhook } = require("../functions/crown-live-payments-http");
const { createCrownPaymentsWebhook } = require("../functions/crown-payments-http");

// An uninstalled, expiring rehearsal adapter. Callers must explicitly supply
// signature verification and payment services; no keys or listeners on import.
function createPaymentWebhookServer({ store, live, test, expiresAt, now = Date.now,
  maxConcurrent = 4, requestBudgetMs = 25000, bodyBudgetMs = 5000, isEnabled = () => true }) {
  const expiry = Date.parse(expiresAt);
  if (!(store instanceof Store) || !/^migration_game_[a-z0-9_]{1,30}$/.test(store.schema)
    || !Number.isFinite(expiry) || expiry <= now() || expiry > now() + 7 * 86400000 || typeof isEnabled !== "function") throw Error("An expiring isolated payment rehearsal is required");
  for (const [value, max] of [[maxConcurrent, 16], [requestBudgetMs, 60000], [bodyBudgetMs, 15000]]) {
    if (!Number.isInteger(value) || value < 1 || value > max) throw Error("Invalid payment request bound");
  }
  const routes = new Map();
  for (const [mode, config, factory] of [["live", live, createLiveCrownPaymentsWebhook], ["test", test, createCrownPaymentsWebhook]]) {
    if (!config) continue;
    if (typeof config.verify !== "function" || typeof config.reconcile !== "function"
      || (mode === "live" && typeof config.review !== "function")) throw Error("Payment verification and reconciliation are required");
    routes.set(`/api/local-payments/stripe/${mode}`, factory(config));
  }
  if (!routes.size) throw Error("At least one explicit payment handler is required");
  let active = 0;
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    // A peer can abort after a body rejection removed its temporary listeners.
    req.on("error", () => {});
    const send = (status, message) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        Connection: "close", ...(status === 503 ? { "Retry-After": "10" } : {}) });
      res.end(message);
    };
    const handler = routes.get(req.url);
    if (req.headers.host !== "playcrownlands.com") return send(421, "Unexpected host");
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
      || !handler || now() >= expiry || !isEnabled()) return send(404, "Not found");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(405, "Method not allowed"); }
    if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json"
      || req.headers["content-encoding"]) return send(415, "JSON bytes required");
    // Duplicate security headers are ambiguous even when Node joins their values.
    const headerCount = name => req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === name).length;
    if (headerCount("host") !== 1 || headerCount("stripe-signature") !== 1
      || typeof req.headers["stripe-signature"] !== "string" || req.headers["stripe-signature"].length > 2048) return send(400, "Invalid Stripe signature");
    if (active >= maxConcurrent) return send(503, "Payment service busy");
    active++;
    let fenced = false, operation, timer;
    try {
      const rawBody = await new Promise((resolve, reject) => {
        let size = 0; const chunks = [];
        const fail = status => { cleanup(); req.resume(); reject(Object.assign(Error("Invalid payment body"), { status })); };
        const chunk = bytes => { size += bytes.length; if (size > 262144) fail(413); else chunks.push(bytes); };
        const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
        const aborted = () => fail(400);
        const cleanup = () => { clearTimeout(timer); req.off("data", chunk); req.off("end", end); req.off("aborted", aborted); req.off("error", aborted); };
        timer = setTimeout(() => fail(408), bodyBudgetMs);
        req.on("data", chunk); req.once("end", end); req.once("aborted", aborted); req.once("error", aborted);
      });
      // Preserve the original bytes. Parsing/re-encoding before Stripe verifies
      // the signature would authenticate a different payload.
      const response = { statusCode: 200, body: null, headers: {},
        set(name, value) { this.headers[name] = value; return this; },
        status(value) { this.statusCode = value; return this; },
        send(value) { this.body = value; return this; } };
      operation = store.withTransactionGuard(async () => {
        if (fenced || now() >= expiry || !isEnabled()) throw Error("Payment rehearsal request expired");
      }, () => handler({ method: req.method, rawBody, get: name => req.headers[name.toLowerCase()] }, response));
      await Promise.race([operation, new Promise((_, reject) => {
        timer = setTimeout(() => { fenced = true; reject(Object.assign(Error("Payment request expired"), { status: 504 })); }, requestBudgetMs);
      })]);
      if (response.body === null) return send(500, "Payment response unavailable");
      for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
      send(response.statusCode, response.body);
    } catch (error) {
      // Never return/log provider errors, signed bodies, payment IDs or SQL.
      const status = [400, 408, 413, 504].includes(error.status) ? error.status : 500;
      send(status, status === 413 ? "Payment body too large" : "Payment request incomplete");
    } finally {
      clearTimeout(timer);
      // Keep a timed-out provider call counted until it settles. Its inherited
      // write guard rejects a late credit; Stripe can safely retry the delivery.
      if (fenced && operation) operation.then(() => { active--; }, () => { active--; });
      else active--;
    }
  });
  server.maxRequestsPerSocket = 20; server.keepAliveTimeout = 1000;
  return server;
}
module.exports = { createPaymentWebhookServer };
