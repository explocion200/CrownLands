"use strict";
// Explicitly invoked migration library. Importing this file never starts a worker
// or sends email. The rehearsal transport requires a recipient allowlist.
const crypto = require("node:crypto");
const FROM = "Crownlands <accounts@mail.playcrownlands.com>";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const address = value => typeof value === "string" && value.length <= 320
  && /^[^\s@<>,;\x00-\x1f\x7f]+@[^\s@<>,;\x00-\x1f\x7f]+\.[^\s@<>,;\x00-\x1f\x7f]+$/.test(value);
const failure = (code, retryable = false, retryAfter = 30) => Object.assign(Error("Account email delivery could not be completed."), { code, retryable, retryAfter });
const codes = new Set(["network", "provider-busy", "provider-rejected", "invalid-response", "recipient-blocked", "invalid-message"]);

function message(mail, origin) {
  if (!UUID.test(mail.id) || !address(mail.recipient) || !["verifyEmail", "resetPassword"].includes(mail.purpose)) throw failure("invalid-message");
  let link;
  try { link = new URL(mail.action_url); } catch { throw failure("invalid-message"); }
  const token = link.searchParams.get("token");
  if (link.origin !== origin || link.pathname !== "/local-auth/action" || link.username || link.password || link.hash
    || link.searchParams.get("mode") !== mail.purpose || !/^[A-Za-z0-9_-]{43}$/.test(token || "")
    || [...link.searchParams.keys()].sort().join(",") !== "mode,token") throw failure("invalid-message");
  const verification = mail.purpose === "verifyEmail";
  return { token, payload: { from: FROM, to: [mail.recipient],
    subject: verification ? "Verify your Crownlands email" : "Reset your Crownlands password",
    text: (verification ? "Confirm your email address to continue to Crownlands." : "Use this link to choose a new Crownlands password.")
      + "\n\n" + link.href + "\n\nThis link expires one hour after it was requested and can be used once."
      + "\n\nIf you did not request this email, you can ignore it. Your account will not change.\n" } };
}

class ResendRehearsalSender {
  constructor({ apiKey, allowedRecipients, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
    if (typeof apiKey !== "string" || !/^re_[A-Za-z0-9_-]{8,200}$/.test(apiKey)
      || !Array.isArray(allowedRecipients) || !allowedRecipients.length || allowedRecipients.some(item => !address(item))
      || !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 15000) throw failure("invalid-message");
    this.apiKey = apiKey; this.recipients = new Set(allowedRecipients.map(value => value.toLowerCase()));
    this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
  }
  async send({ id, payload }) {
    if (!UUID.test(id) || !payload || payload.from !== FROM || !Array.isArray(payload.to) || payload.to.length !== 1
      || !address(payload.to[0]) || typeof payload.subject !== "string" || typeof payload.text !== "string"
      || payload.subject.length > 100 || payload.text.length > 4096
      || Object.keys(payload).sort().join(",") !== "from,subject,text,to") throw failure("invalid-message");
    if (!this.recipients.has(payload.to[0].toLowerCase())) throw failure("recipient-blocked");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: controller.signal,
        headers: { Authorization: "Bearer " + this.apiKey, "Content-Type": "application/json", "Idempotency-Key": "crownlands-auth/" + id },
        body: JSON.stringify(payload) });
      if (!response.ok) {
        // Never copy provider messages, response bodies or request data to errors.
        await response.body?.cancel();
        const retryable = [408, 409, 429].includes(response.status) || response.status >= 500;
        const delay = Number(response.headers.get("retry-after"));
        throw failure(retryable ? "provider-busy" : "provider-rejected", retryable,
          Number.isFinite(delay) && delay > 0 ? Math.min(900, Math.max(30, Math.ceil(delay))) : 30);
      }
      let bytes = 0, body = "";
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 4096) { controller.abort(); throw failure("invalid-response", true); }
        body += Buffer.from(chunk).toString("utf8");
      }
      let result;
      try { result = JSON.parse(body); } catch { throw failure("invalid-response", true); }
      if (!UUID.test(result?.id)) throw failure("invalid-response", true);
      return result.id;
    } catch (error) {
      if (codes.has(error?.code)) throw failure(error.code, error.retryable === true, error.retryAfter);
      throw failure("network", true);
    } finally { clearTimeout(timeout); }
  }
}

class AuthMailDispatcher {
  constructor({ store, sender, origin = "https://playcrownlands.com" }) {
    if (!/^migration_[a-z0-9_]+$/.test(store?.schema || "") || !sender || typeof sender.send !== "function"
      || origin !== "https://playcrownlands.com") throw failure("invalid-message");
    this.pool = store.pool; this.schema = store.schema; this.sender = sender; this.origin = origin;
  }
  async initialize() {
    // Run explicitly as a schema owner during preparation, never on runtime boot.
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.auth_mail_delivery (
      id text PRIMARY KEY REFERENCES ${this.schema}.auth_mail(id), payload jsonb,
      attempts integer NOT NULL DEFAULT 0, lease_token text, lease_until timestamptz,
      next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      status text NOT NULL DEFAULT 'pending', last_code text, provider_id text, accepted_at timestamptz);
      REVOKE ALL ON ${this.schema}.auth_mail_delivery FROM PUBLIC;`);
  }
  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'");
      const result = await callback(client); await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async claim() {
    return this.transaction(async client => {
      // Clear stale URL-bearing payloads even when a newer request superseded
      // an in-flight message. Locks follow the same mail-then-delivery order.
      const retired = await client.query(`SELECT m.id FROM ${this.schema}.auth_mail m
        JOIN ${this.schema}.auth_mail_delivery d ON d.id=m.id WHERE d.payload IS NOT NULL
        AND m.status<>'pending' ORDER BY m.created_at,m.id LIMIT 100 FOR UPDATE OF m SKIP LOCKED`);
      for (const row of retired.rows) await client.query(`UPDATE ${this.schema}.auth_mail_delivery
        SET payload=NULL,status='superseded',lease_token=NULL,lease_until=NULL WHERE id=$1`, [row.id]);
      const result = await client.query(`SELECT m.*, d.payload, coalesce(d.attempts,0) AS attempts,
        m.created_at > clock_timestamp()-interval '1 hour' AS fresh
        FROM ${this.schema}.auth_mail m LEFT JOIN ${this.schema}.auth_mail_delivery d ON d.id=m.id
        WHERE m.status='pending' AND (d.id IS NULL OR (d.status='pending' AND d.next_attempt_at<=clock_timestamp()
          AND (d.lease_until IS NULL OR d.lease_until<clock_timestamp())))
        ORDER BY m.created_at,m.id LIMIT 1 FOR UPDATE OF m SKIP LOCKED`);
      const mail = result.rows[0];
      if (!mail) return null;
      let prepared, reason;
      try { prepared = message(mail, this.origin); } catch { reason = "invalid-message"; }
      if (!mail.fresh) reason = "expired";
      else if (mail.attempts >= 8) reason = "attempts-exhausted";
      if (!reason) {
        const valid = await client.query(`SELECT 1 FROM ${this.schema}.auth_actions a JOIN ${this.schema}.accounts u ON u.uid=a.uid
          WHERE a.token_hash=$1 AND a.purpose=$2 AND a.expires_at>clock_timestamp()
          AND u.body->>'email'=$3 AND coalesce((u.body->>'disabled')::boolean,false)=false`,
        [crypto.createHash("sha256").update(prepared.token).digest("hex"), mail.purpose, mail.recipient]);
        if (valid.rowCount !== 1) reason = "superseded";
      }
      if (reason) {
        await client.query(`UPDATE ${this.schema}.auth_mail SET status=$2,action_url='' WHERE id=$1`, [mail.id, reason]);
        await client.query(`UPDATE ${this.schema}.auth_mail_delivery SET status=$2,payload=NULL,lease_token=NULL,lease_until=NULL,last_code=$2 WHERE id=$1`, [mail.id, reason]);
        return { discarded: true };
      }
      const lease = crypto.randomUUID();
      // Freeze the exact provider payload before the first network request. A
      // restart/template edit must reuse the original payload and idempotency key.
      const claimed = await client.query(`INSERT INTO ${this.schema}.auth_mail_delivery(id,payload,attempts,lease_token,lease_until)
        VALUES($1,$2,1,$3,clock_timestamp()+interval '1 minute') ON CONFLICT(id) DO UPDATE SET
        attempts=auth_mail_delivery.attempts+1,lease_token=$3,lease_until=clock_timestamp()+interval '1 minute'
        RETURNING payload,attempts`, [mail.id, prepared.payload, lease]);
      return { id: mail.id, lease, payload: claimed.rows[0].payload, attempts: claimed.rows[0].attempts };
    });
  }
  async deliverOne() {
    const claimed = await this.claim();
    if (!claimed) return { state: "idle" };
    if (claimed.discarded) return { state: "discarded" };
    let provider, problem;
    try { provider = await this.sender.send({ id: claimed.id, payload: claimed.payload });
      if (!UUID.test(provider)) throw failure("invalid-response", true);
    } catch (error) {
      problem = codes.has(error?.code) ? failure(error.code, error.retryable === true, error.retryAfter) : failure("network", true);
    }
    return this.transaction(async client => {
      // Lock in the same order as claim/supersession. A reclaimed lease fences
      // late completions; provider idempotency handles an ambiguous first send.
      await client.query(`SELECT id FROM ${this.schema}.auth_mail WHERE id=$1 FOR UPDATE`, [claimed.id]);
      const current = await client.query(`SELECT 1 FROM ${this.schema}.auth_mail_delivery WHERE id=$1 AND lease_token=$2 FOR UPDATE`, [claimed.id, claimed.lease]);
      if (!current.rowCount) return { state: "lease-lost" };
      const retry = problem?.retryable && claimed.attempts < 8;
      const state = !problem ? "accepted" : retry ? "pending" : "failed";
      const delay = Math.max(Math.min(900, 30 * 2 ** (claimed.attempts - 1)), Math.min(900, Number(problem?.retryAfter) || 30));
      await client.query(`UPDATE ${this.schema}.auth_mail_delivery SET status=$3,lease_token=NULL,lease_until=NULL,
        payload=CASE WHEN $3='pending' THEN payload ELSE NULL END,last_code=$4,provider_id=$5,
        accepted_at=CASE WHEN $3='accepted' THEN clock_timestamp() ELSE NULL END,
        next_attempt_at=clock_timestamp()+$6*interval '1 second' WHERE id=$1 AND lease_token=$2`,
      [claimed.id, claimed.lease, state, problem?.code || null, provider || null, delay]);
      if (!retry) await client.query(`UPDATE ${this.schema}.auth_mail SET status=$2,action_url='' WHERE id=$1 AND status='pending'`, [claimed.id, state]);
      return { state: state === "pending" ? "retry" : state };
    });
  }
}

module.exports = { AuthMailDispatcher, ResendRehearsalSender, message };
