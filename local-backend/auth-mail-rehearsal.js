"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { Store } = require("./store");
const { ResendRehearsalSender } = require("./auth-mail");
const { AuthMailLoop } = require("./auth-mail-loop");
const ROLE = "crownlands-mail-rehearsal";

function privateFile(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.mode & 0o007 || stat.size > 8192) throw Error("Private mail credentials required");
  return fs.readFileSync(file, "utf8");
}
function readConfig(file) {
  const config = JSON.parse(privateFile(file));
  if (Object.keys(config).sort().join() !== "allowedRecipients,expiresAt,schema"
    || !/^migration_auth_preview_[a-f0-9]{12}$/.test(config.schema)
    || !Number.isFinite(Date.parse(config.expiresAt)) || Date.parse(config.expiresAt) <= Date.now()
    || Date.parse(config.expiresAt) > Date.now() + 7 * 86400000
    || !Array.isArray(config.allowedRecipients) || config.allowedRecipients.length !== 1) throw Error("An expiring one-owner mail preview is required");
  new ResendRehearsalSender({ apiKey: "re_validation_only", allowedRecipients: config.allowedRecipients });
  return config;
}
async function assertMailRole(store) {
  const row = (await store.pool.query(`SELECT current_user AS name,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
    has_schema_privilege(current_user,$1,'CREATE') AS creates,
    (has_any_column_privilege(current_user,$1||'.accounts','SELECT,INSERT,UPDATE')
      OR has_table_privilege(current_user,$1||'.accounts','DELETE')) AS accounts,
    (has_any_column_privilege(current_user,$1||'.auth_sessions','SELECT,INSERT,UPDATE')
      OR has_table_privilege(current_user,$1||'.auth_sessions','DELETE')) AS sessions,
    (has_any_column_privilege(current_user,$1||'.auth_mail','INSERT')
      OR has_table_privilege(current_user,$1||'.auth_mail','DELETE')) AS queues,
    (has_any_column_privilege(current_user,$1||'.auth_actions','INSERT,UPDATE')
      OR has_table_privilege(current_user,$1||'.auth_actions','DELETE')) AS actions,
    EXISTS(SELECT 1 FROM pg_namespace WHERE nspname LIKE 'migration_%' AND nspname<>$1
      AND has_schema_privilege(current_user,oid,'USAGE')) AS other_schemas
    FROM pg_roles r WHERE r.rolname=current_user`, [store.schema])).rows[0];
  if (!row || row.name !== ROLE || Object.entries(row).some(([key, value]) => key !== "name" && value !== false)) throw Error("Restricted private mail role required");
  await store.pool.query(`SELECT uid,email,disabled FROM ${store.schema}.auth_mail_accounts LIMIT 0`);
  await store.pool.query(`SELECT id,status,lease_token FROM ${store.schema}.auth_mail_delivery LIMIT 0`);
}
function writeStatus(directory, status) {
  const file = path.join(directory, "status.json"), temporary = file + ".next";
  fs.writeFileSync(temporary, JSON.stringify(status), { mode: 0o600 }); fs.renameSync(temporary, file);
}
async function start(configFile, keyFile, directory) {
  const config = readConfig(configFile), sender = new ResendRehearsalSender({ apiKey: privateFile(keyFile).trim(), allowedRecipients: config.allowedRecipients });
  const stat = fs.statSync(directory);
  if (!stat.isDirectory() || stat.mode & 0o077) throw Error("Private mail state directory required");
  const pool = new Pool({ host: "/var/run/postgresql", database: "crownlands_migration", max: 2,
    application_name: ROLE, connectionTimeoutMillis: 5000, statement_timeout: 15000, idle_in_transaction_session_timeout: 20000 });
  // Pool background failures must never print connection details or credentials.
  pool.on("error", () => { void stop(true); });
  const store = new Store({ schema: config.schema, pool });
  let loop, timer, reporting = Promise.resolve(), stopping;
  function stop(failed = false) {
    if (failed) process.exitCode = 1;
    if (stopping) return stopping;
    clearTimeout(timer); loop?.stop();
    const deadline = setTimeout(() => process.exit(1), 15000); deadline.unref();
    stopping = (async () => {
      try {
        await loop?.settle(); await reporting;
        if (loop) writeStatus(directory, await loop.status());
      } catch { process.exitCode = 1; }
      finally { await store.close().catch(() => { process.exitCode = 1; }); }
    })();
    return stopping;
  }
  try {
    await assertMailRole(store);
    loop = new AuthMailLoop({ store, sender, expiresAt: config.expiresAt });
    const report = async () => {
      if (stopping) return;
      reporting = loop.status().then(status => writeStatus(directory, status));
      try { await reporting; } catch { void stop(true); return; }
      if (loop.stopped) { void stop(); return; }
      if (!stopping) timer = setTimeout(report, 5000);
    };
    process.once("SIGTERM", () => { void stop(); }); process.once("SIGINT", () => { void stop(); });
    loop.start(); await report();
    return { loop, stop };
  } catch (error) { await stop(true); throw error; }
}
if (require.main === module) {
  const credentials = process.env.CREDENTIALS_DIRECTORY, state = process.env.STATE_DIRECTORY;
  if (!credentials || !state) { console.error("Private mail system-service credentials and state required"); process.exitCode = 1; }
  else start(path.join(credentials, "config"), path.join(credentials, "resend"), state).catch(() => {
    console.error("Private account mail stopped; sensitive diagnostics suppressed."); process.exitCode = 1;
  });
}
module.exports = { readConfig, assertMailRole, writeStatus };
