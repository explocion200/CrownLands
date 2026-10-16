"use strict";
const crypto = require("node:crypto");
const webpush = require("web-push");
const { incomingArmyData } = require("../functions/notification-delivery");
const PREFIX = "clwp1.";
const GAME_PATH = "/api/local-game/rehearsal/";
function failure(code = "push-unavailable") { return Object.assign(Error("Browser notification delivery is unavailable."), { code }); }
function bytes(value, size) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 100) throw failure("push-invalid-subscription");
  const result = Buffer.from(value, "base64url");
  if (result.length !== size || result.toString("base64url") !== value) throw failure("push-invalid-subscription");
  return result;
}
function publicKey(value) {
  const key = bytes(value, 65);
  try { crypto.ECDH.convertKey(key, "prime256v1"); } catch { throw failure("push-invalid-subscription"); }
  if (key[0] !== 4) throw failure("push-invalid-subscription");
  return key;
}
function endpoint(value) {
  if (typeof value !== "string" || value.length > 1100) throw failure("push-invalid-subscription");
  let url; try { url = new URL(value); } catch { throw failure("push-invalid-subscription"); }
  // These are browser-operated delivery services, never an arbitrary URL from
  // a player document. Redirects and proxy environment variables are not used.
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || url.search || url.href !== value
    || !(url.hostname === "fcm.googleapis.com" && /^\/(?:fcm\/send|wp)\/[A-Za-z0-9_:-]+$/.test(url.pathname)
      || url.hostname === "updates.push.services.mozilla.com" && /^\/wpush\/v2\/[A-Za-z0-9_-]+$/.test(url.pathname)
      || url.hostname === "web.push.apple.com" && /^\/[A-Za-z0-9_/-]+$/.test(url.pathname))) throw failure("push-invalid-subscription");
  return value;
}
function subscription(token, vapidKey) {
  try {
    if (typeof token !== "string" || token.length > 2048 || !token.startsWith(PREFIX)) throw failure();
    const text = token.slice(PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/.test(text) || Buffer.from(text, "base64url").toString("base64url") !== text) throw failure();
    const value = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 4 || value[3] !== vapidKey) throw failure();
    publicKey(value[1]); publicKey(value[3]); bytes(value[2], 16);
    return { endpoint: endpoint(value[0]), keys: { p256dh: value[1], auth: value[2] } };
  } catch { throw failure("push-invalid-subscription"); }
}
class WebPushSender {
  constructor({ keys, expiresAt, deployment, fetchImpl = fetch, now = Date.now }) {
    const permanent = require("./deployment-policy").isPolicy(deployment, "migration_game_live");
    this.deployment = deployment; this.expiry = permanent ? Infinity : Date.parse(expiresAt); this.now = now; this.fetch = fetchImpl;
    if ((deployment && !permanent) || (!permanent && (!Number.isFinite(this.expiry) || this.expiry <= now() || this.expiry > now() + 7 * 86400000))) throw failure();
    if (!keys || Object.keys(keys).sort().join() !== "privateKey,publicKey") throw failure();
    const pair = crypto.createECDH("prime256v1");
    try { pair.setPrivateKey(bytes(keys?.privateKey, 32)); } catch { throw failure(); }
    if (!pair.getPublicKey().equals(publicKey(keys?.publicKey))) throw failure();
    this.keys = { ...keys }; this.controller = new AbortController(); this.active = false;
    if (Number.isFinite(this.expiry)) { this.timer = setTimeout(() => this.stop(), this.expiry - now()); this.timer.unref(); }
  }
  assertActive() { if (this.controller.signal.aborted || this.now() >= this.expiry) throw failure("push-stopped"); }
  async send(token, notification, { reserve = async () => {}, signal, topic } = {}) {
    if (this.active) throw failure("push-busy");
    this.assertActive();
    const target = subscription(token, this.keys.publicKey);
    const data = { ...incomingArmyData(notification), url: this.deployment ? "/play/" : GAME_PATH };
    const payload = JSON.stringify({ data, expiresAt: Math.min(this.expiry, this.now() + 1800000) });
    if (Buffer.byteLength(payload) > 3000 || !/^[A-Za-z0-9_-]{1,32}$/.test(topic || "")) throw failure("push-invalid-payload");
    this.active = true;
    try {
      const request = webpush.generateRequestDetails(target, payload, {
        TTL: Math.max(1, Math.min(1800, Math.floor((this.expiry - this.now()) / 1000))),
        urgency: data.kind === "attack" ? "high" : "normal", topic, contentEncoding: "aes128gcm",
        vapidDetails: { subject: "https://playcrownlands.com/support", ...this.keys },
      });
      await reserve(); this.assertActive(); if (signal?.aborted) throw failure("push-stopped");
      await this.deployment?.assertActive();
      const response = await this.fetch(request.endpoint, { method: "POST", headers: request.headers, body: request.body,
        redirect: "error", signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(8000), ...(signal ? [signal] : [])]) });
      // No provider body or URL can reach game records, logs or error messages.
      void response.body?.cancel().catch(() => {});
      if (response.status >= 200 && response.status < 300) return { accepted: true };
      if ([404, 410].includes(response.status)) return { gone: true };
      throw failure([401, 403].includes(response.status) ? "push-provider-auth" : "push-provider-unavailable");
    } catch (error) {
      if (["push-stopped", "push-limit", "push-provider-auth", "push-provider-unavailable"].includes(error.code)) throw failure(error.code);
      throw failure();
    } finally { this.active = false; }
  }
  stop() { this.controller.abort(); clearTimeout(this.timer); }
}
module.exports = { PREFIX, GAME_PATH, subscription, endpoint, publicKey, failure, WebPushSender };
