"use strict";
const crypto = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const passwords = require("./passwords");
const digest = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const secret = () => crypto.randomBytes(32).toString("base64url");
const fail = (code, message = "Sign-in could not be completed.") => Object.assign(Error(message), { code: "auth/" + code });
const emailKey = value => {
  if (typeof value !== "string" || value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw fail("invalid-email");
  return value.trim().toLowerCase();
};
const safeUser = (body, provider) => ({ uid: body.localId, email: body.email || null, emailVerified: body.emailVerified === true,
  displayName: body.displayName || null, photoURL: body.photoUrl || null,
  providerData: (body.providerUserInfo || []).map(item => ({ providerId: item.providerId, uid: item.rawId || body.localId,
    email: item.email || body.email || null, displayName: item.displayName || body.displayName || null, photoURL: item.photoUrl || null })),
  signInProvider: provider });

class AuthService {
  constructor({ store, hashConfig, google, origin = "https://playcrownlands.com", rateKey, allowRegistration = false, googleClient }) {
    if (!store?.schema?.startsWith("migration_")) throw Error("Account migration is limited to rehearsal schemas");
    if (!Buffer.isBuffer(rateKey) || rateKey.length < 32) throw Error("A private authentication rate-limit key is required");
    this.store = store; this.pool = store.pool; this.schema = store.schema; this.hashConfig = hashConfig;
    this.origin = new URL(origin).origin; this.rateKey = rateKey; this.allowRegistration = allowRegistration;
    this.googleConfig = google;
    this.google = googleClient || (google?.clientId && google?.clientSecret ? new OAuth2Client({ clientId: google.clientId,
      clientSecret: google.clientSecret, redirectUri: this.origin + "/local-auth/google/callback" }) : null);
  }
  async initialize({ createTables = true } = {}) {
    const s = this.schema;
    if (createTables) await this.pool.query(`CREATE TABLE IF NOT EXISTS ${s}.accounts (uid text PRIMARY KEY,body jsonb NOT NULL);
      CREATE INDEX IF NOT EXISTS accounts_email ON ${s}.accounts (lower(body->>'email'));
      CREATE TABLE IF NOT EXISTS ${s}.auth_sessions (token_hash text PRIMARY KEY,uid text NOT NULL REFERENCES ${s}.accounts(uid),provider text NOT NULL,epoch bigint NOT NULL,auth_time timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL);
      CREATE TABLE IF NOT EXISTS ${s}.auth_limits (key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz NOT NULL);
      CREATE TABLE IF NOT EXISTS ${s}.auth_actions (token_hash text PRIMARY KEY,uid text NOT NULL REFERENCES ${s}.accounts(uid),purpose text NOT NULL,expires_at timestamptz NOT NULL);
      CREATE TABLE IF NOT EXISTS ${s}.auth_mail (id text PRIMARY KEY,recipient text NOT NULL,purpose text NOT NULL,action_url text NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT clock_timestamp());
      CREATE TABLE IF NOT EXISTS ${s}.auth_oauth (state_hash text PRIMARY KEY,binding_hash text NOT NULL,nonce text NOT NULL,verifier text NOT NULL,reauth_uid text,reauth_token_hash text,expires_at timestamptz NOT NULL);
      REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM PUBLIC;`);
    this.dummy = await passwords.createLocalPassword(secret());
  }
  async transaction(callback) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const client = await this.pool.connect();
      try { await client.query("BEGIN"); const result = await callback(client); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK").catch(() => {}); if (error.code !== "40P01" || attempt === 4) throw error; }
      finally { client.release(); }
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
  async rateLimit(kind, identifier, maximum = 10, seconds = 900) {
    const key = crypto.createHmac("sha256", this.rateKey).update(kind + ":" + identifier).digest("hex");
    const result = await this.pool.query(`INSERT INTO ${this.schema}.auth_limits(key,count,expires_at) VALUES($1,1,clock_timestamp()+$2*interval '1 second')
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_limits.expires_at<clock_timestamp() THEN 1 ELSE auth_limits.count+1 END,
      expires_at=CASE WHEN auth_limits.expires_at<clock_timestamp() THEN clock_timestamp()+$2*interval '1 second' ELSE auth_limits.expires_at END RETURNING count`, [key, seconds]);
    if (result.rows[0].count > maximum) throw fail("too-many-requests", "Wait a few minutes before trying again.");
  }
  async newSession(client, body, provider) {
    if (body.disabled) throw fail("invalid-credential");
    const token = secret();
    await client.query(`INSERT INTO ${this.schema}.auth_sessions(token_hash,uid,provider,epoch,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '30 days')`,
      [digest(token), body.localId, provider, Number(body.localAuthEpoch || 0)]);
    return { token, user: safeUser(body, provider) };
  }
  async session(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const result = await this.pool.query(`SELECT a.body,s.provider,s.auth_time,s.epoch FROM ${this.schema}.auth_sessions s JOIN ${this.schema}.accounts a ON a.uid=s.uid WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp()`, [digest(token)]);
    const row = result.rows[0];
    if (!row || row.body.disabled || Number(row.epoch) !== Number(row.body.localAuthEpoch || 0)) return null;
    let custom = {};
    try { custom = JSON.parse(row.body.customAttributes || "{}"); } catch { throw fail("invalid-credential"); }
    return { user: safeUser(row.body, row.provider), authTime: Math.floor(row.auth_time.getTime() / 1000),
      auth: { uid: row.body.localId, token: { ...custom, sub: row.body.localId, uid: row.body.localId,
        email: row.body.email, email_verified: row.body.emailVerified === true,
        auth_time: Math.floor(row.auth_time.getTime() / 1000), firebase: { sign_in_provider: row.provider } } } };
  }
  async signOut(token) { if (typeof token === "string") await this.pool.query(`DELETE FROM ${this.schema}.auth_sessions WHERE token_hash=$1`, [digest(token)]); }
  async passwordSignIn(email, password, ip) {
    email = emailKey(email);
    await this.rateLimit("password-ip", ip, 30);
    await this.rateLimit("password-account", email, 10);
    const result = await this.pool.query(`SELECT body FROM ${this.schema}.accounts WHERE lower(body->>'email')=$1`, [email]);
    const body = result.rows.length === 1 ? result.rows[0].body : null;
    let valid = false;
    if (body && !body.disabled && (body.localPassword || body.passwordHash)) {
      valid = body.localPassword ? await passwords.verifyLocalPassword(password, body.localPassword)
        : await passwords.verifyImportedPassword(password, body, this.hashConfig);
    } else await passwords.verifyLocalPassword(password, this.dummy);
    if (!valid) throw fail("invalid-credential", "Email or password was not accepted.");
    const replacement = body.localPassword || await passwords.createLocalPassword(password);
    return this.transaction(async client => {
      const locked = await client.query(`SELECT body FROM ${this.schema}.accounts WHERE uid=$1 FOR UPDATE`, [body.localId]);
      const current = locked.rows[0]?.body;
      if (!current || current.disabled || JSON.stringify(current.localPassword) !== JSON.stringify(body.localPassword)
          || current.passwordHash !== body.passwordHash || current.localAuthEpoch !== body.localAuthEpoch) throw fail("invalid-credential");
      current.localPassword = replacement;
      delete current.passwordHash; delete current.salt;
      await client.query(`UPDATE ${this.schema}.accounts SET body=$2 WHERE uid=$1`, [current.localId, current]);
      return this.newSession(client, current, "password");
    });
  }
  async createPasswordAccount(email, password, ip) {
    if (!this.allowRegistration) throw fail("operation-not-allowed", "New accounts are disabled during migration testing.");
    email = emailKey(email);
    if (typeof password !== "string" || password.length < 12) throw fail("weak-password");
    await this.rateLimit("register-ip", ip, 5, 3600);
    const localPassword = await passwords.createLocalPassword(password);
    return this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["email:" + email]);
      if ((await client.query(`SELECT 1 FROM ${this.schema}.accounts WHERE lower(body->>'email')=$1`, [email])).rowCount) throw fail("email-already-in-use");
      const uid = crypto.randomUUID(), body = { localId: uid, email, emailVerified: false, localPassword,
        providerUserInfo: [{ providerId: "password", email }], createdAt: String(Date.now()), localAuthEpoch: 0 };
      await client.query(`INSERT INTO ${this.schema}.accounts(uid,body) VALUES($1,$2)`, [uid, body]);
      return this.newSession(client, body, "password");
    });
  }
  async queueEmailAction(client, body, purpose) {
    const token = secret(), id = crypto.randomUUID();
    // Only the private outbox holds the URL token. No mail is sent by this class.
    await client.query(`DELETE FROM ${this.schema}.auth_actions WHERE uid=$1 AND purpose=$2`, [body.localId, purpose]);
    await client.query(`UPDATE ${this.schema}.auth_mail SET status='superseded',action_url='' WHERE recipient=$1 AND purpose=$2 AND status='pending'`, [body.email, purpose]);
    await client.query(`INSERT INTO ${this.schema}.auth_actions(token_hash,uid,purpose,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')`, [digest(token), body.localId, purpose]);
    const url = this.origin + "/local-auth/action?mode=" + encodeURIComponent(purpose) + "&token=" + encodeURIComponent(token);
    await client.query(`INSERT INTO ${this.schema}.auth_mail(id,recipient,purpose,action_url) VALUES($1,$2,$3,$4)`, [id, body.email, purpose, url]);
    return id;
  }
  async requestPasswordReset(email, ip) {
    email = emailKey(email);
    await this.rateLimit("reset-ip", ip, 20, 3600);
    await this.rateLimit("reset-account", email, 3, 3600);
    await this.transaction(async client => {
      const result = await client.query(`SELECT body FROM ${this.schema}.accounts WHERE lower(body->>'email')=$1 FOR UPDATE`, [email]);
      if (result.rows.length === 1 && !result.rows[0].body.disabled) await this.queueEmailAction(client, result.rows[0].body, "resetPassword");
    });
    return { accepted: true };
  }
  async requestVerification(token, ip) {
    const current = await this.session(token);
    if (!current) throw fail("user-token-expired");
    await this.rateLimit("verify-ip", ip, 20, 3600);
    await this.rateLimit("verify-account", current.user.uid, 3, 3600);
    await this.transaction(async client => {
      const result = await client.query(`SELECT body FROM ${this.schema}.accounts WHERE uid=$1 FOR UPDATE`, [current.user.uid]);
      const body = result.rows[0]?.body;
      if (!body) throw fail("user-token-expired");
      await this.assertLockedSession(client, digest(token), body);
      if (body && !body.disabled && !body.emailVerified) await this.queueEmailAction(client, body, "verifyEmail");
    });
    return { accepted: true };
  }
  async finishEmailAction(token, purpose, password) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(String(token)) || !["resetPassword", "verifyEmail"].includes(purpose)) throw fail("invalid-action-code");
    if (purpose === "resetPassword" && (typeof password !== "string" || password.length < 12)) throw fail("weak-password");
    const localPassword = purpose === "resetPassword" ? await passwords.createLocalPassword(password) : null;
    await this.transaction(async client => {
      const action = await client.query(`SELECT uid FROM ${this.schema}.auth_actions WHERE token_hash=$1 AND purpose=$2 AND expires_at>clock_timestamp()`, [digest(token), purpose]);
      if (!action.rowCount) throw fail("invalid-action-code");
      const uid = action.rows[0].uid, row = await client.query(`SELECT body FROM ${this.schema}.accounts WHERE uid=$1 FOR UPDATE`, [uid]);
      const body = row.rows[0]?.body;
      if (!body || body.disabled) throw fail("invalid-action-code");
      const consumed = await client.query(`DELETE FROM ${this.schema}.auth_actions WHERE token_hash=$1 AND purpose=$2 AND expires_at>clock_timestamp()`, [digest(token), purpose]);
      if (!consumed.rowCount) throw fail("invalid-action-code");
      body.emailVerified = true;
      if (localPassword) {
        body.localPassword = localPassword; body.localAuthEpoch = Number(body.localAuthEpoch || 0) + 1;
        delete body.passwordHash; delete body.salt;
        if (!(body.providerUserInfo || []).some(p => p.providerId === "password")) body.providerUserInfo = [...(body.providerUserInfo || []), { providerId: "password", email: body.email }];
        await client.query(`DELETE FROM ${this.schema}.auth_sessions WHERE uid=$1`, [uid]);
      }
      await client.query(`UPDATE ${this.schema}.accounts SET body=$2 WHERE uid=$1`, [uid, body]);
    });
    return { completed: true };
  }
  async googleStart(binding, reauthenticateToken = null) {
    if (!this.google || !/^[A-Za-z0-9_-]{43}$/.test(binding)) throw fail("operation-not-allowed");
    const session = reauthenticateToken ? await this.session(reauthenticateToken) : null;
    if (reauthenticateToken && !session) throw fail("user-token-expired");
    const state = secret(), nonce = secret(), verifier = secret();
    await this.pool.query(`INSERT INTO ${this.schema}.auth_oauth(state_hash,binding_hash,nonce,verifier,reauth_uid,reauth_token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '10 minutes')`,
      [digest(state), digest(binding), nonce, verifier, session?.user.uid || null, reauthenticateToken ? digest(reauthenticateToken) : null]);
    return this.google.generateAuthUrl({ access_type: "online", scope: ["openid", "email", "profile"], state, nonce,
      code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", prompt: "select_account" });
  }
  async googleFinish({ state, binding, code }) {
    if (!this.google || !/^[A-Za-z0-9_-]{43}$/.test(String(state)) || !/^[A-Za-z0-9_-]{43}$/.test(String(binding)) || typeof code !== "string" || code.length > 4096) throw fail("invalid-credential");
    const consumed = await this.pool.query(`DELETE FROM ${this.schema}.auth_oauth WHERE state_hash=$1 AND binding_hash=$2 AND expires_at>clock_timestamp() RETURNING nonce,verifier,reauth_uid,reauth_token_hash`, [digest(state), digest(binding)]);
    const flow = consumed.rows[0];
    if (!flow) throw fail("invalid-credential");
    let payload;
    try {
      const { tokens } = await this.google.getToken({ code, codeVerifier: flow.verifier });
      const ticket = await this.google.verifyIdToken({ idToken: tokens.id_token, audience: this.googleConfig.clientId });
      payload = ticket.getPayload();
    } catch { throw fail("invalid-credential"); }
    if (!payload?.sub || payload.nonce !== flow.nonce || payload.email_verified !== true) throw fail("invalid-credential");
    return this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["google:" + payload.sub]);
      const matched = await client.query(`SELECT a.body FROM ${this.schema}.accounts a WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(a.body->'providerUserInfo','[]'::jsonb)) p WHERE p->>'providerId'='google.com' AND p->>'rawId'=$1) FOR UPDATE`, [payload.sub]);
      // Matching email alone must never take over an existing account.
      if (matched.rows.length > 1) throw fail("invalid-credential");
      let body = matched.rows[0]?.body;
      if (!body) {
        if (!this.allowRegistration || flow.reauth_uid) throw fail("migration-account-unavailable", "This Google account has not been migrated yet.");
        const email = emailKey(payload.email);
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["email:" + email]);
        if ((await client.query(`SELECT 1 FROM ${this.schema}.accounts WHERE lower(body->>'email')=$1`, [email])).rowCount) throw fail("account-exists-with-different-credential", "Sign in with your existing account method.");
        body = { localId: crypto.randomUUID(), email, emailVerified: true, displayName: typeof payload.name === "string" ? payload.name.slice(0, 256) : "",
          photoUrl: typeof payload.picture === "string" && payload.picture.startsWith("https://") ? payload.picture.slice(0, 2048) : "",
          providerUserInfo: [{ providerId: "google.com", rawId: payload.sub, email }], createdAt: String(Date.now()), localAuthEpoch: 0 };
        await client.query(`INSERT INTO ${this.schema}.accounts(uid,body) VALUES($1,$2)`, [body.localId, body]);
      }
      if (body.disabled || (flow.reauth_uid && flow.reauth_uid !== body.localId)) throw fail("user-mismatch");
      if (flow.reauth_uid) await this.assertLockedSession(client, flow.reauth_token_hash, body);
      return this.newSession(client, body, "google.com");
    });
  }
  async assertLockedSession(client, tokenHash, body) {
    const valid = await client.query(`SELECT 1 FROM ${this.schema}.auth_sessions WHERE token_hash=$1 AND uid=$2 AND epoch=$3 AND expires_at>clock_timestamp() FOR UPDATE`,
      [tokenHash, body.localId, Number(body.localAuthEpoch || 0)]);
    if (!valid.rowCount || body.disabled) throw fail("user-token-expired");
  }
  async addPassword(token, password) {
    const session = await this.session(token);
    if (!session || !session.user.emailVerified || session.user.signInProvider !== "google.com") throw fail("user-mismatch");
    if (Date.now() / 1000 - session.authTime > 300) throw fail("requires-recent-login");
    if (typeof password !== "string" || password.length < 12) throw fail("weak-password");
    const localPassword = await passwords.createLocalPassword(password);
    await this.transaction(async client => {
      const row = await client.query(`SELECT body FROM ${this.schema}.accounts WHERE uid=$1 FOR UPDATE`, [session.user.uid]);
      const body = row.rows[0]?.body;
      if (!body || body.disabled) throw fail("user-mismatch");
      await this.assertLockedSession(client, digest(token), body);
      if (body.localPassword || body.passwordHash) throw fail("provider-already-linked");
      body.localPassword = localPassword;
      body.providerUserInfo = [...(body.providerUserInfo || []), { providerId: "password", email: body.email }];
      await client.query(`UPDATE ${this.schema}.accounts SET body=$2 WHERE uid=$1`, [body.localId, body]);
    });
    return (await this.session(token)).user;
  }
}

module.exports = { AuthService, safeUser, digest, secret };
