"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { Store } = require("./store");
const { WebPushSender, failure } = require("./web-push");
const { WebPushLoop, validateScope } = require("./web-push-loop");
const ROLE = "crownlands-push-rehearsal";
function privateFile(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd), directory = "/run/credentials/" + ROLE + ".service";
    let managed = false;
    if (process.env.CREDENTIALS_DIRECTORY === directory && ["config", "vapid"].some(name => file === directory + "/" + name)
      && stat.uid === 0 && stat.gid === 0 && (stat.mode & 0o7777) === 0o440) {
      const parent = fs.lstatSync(directory);
      managed = parent.isDirectory() && parent.uid === 0 && parent.gid === 0 && (parent.mode & 0o7777) === 0o550 && fs.realpathSync(file) === file;
    }
    if (!stat.isFile() || stat.size > 8192 || (stat.mode & 0o077 && !managed)) throw failure();
    return JSON.parse(fs.readFileSync(fd, "utf8"));
  } finally { fs.closeSync(fd); }
}
async function assertPushRole(store) {
  const row = (await store.pool.query(`SELECT current_user AS name,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
    has_schema_privilege(current_user,$1,'CREATE') AS creates,
    EXISTS(SELECT 1 FROM pg_namespace WHERE nspname LIKE 'migration_%' AND nspname<>$1 AND has_schema_privilege(current_user,oid,'USAGE')) AS other_schemas
    FROM pg_roles r WHERE r.rolname=current_user`, [store.schema])).rows[0];
  if (!row || row.name !== ROLE || Object.entries(row).some(([key, value]) => key !== "name" && value !== false)) throw failure();
  await store.pool.query(`SELECT path,body FROM ${store.schema}.documents LIMIT 0`);
}
function writeStatus(directory, status) {
  const file = path.join(directory, "status.json"), temporary = file + ".next";
  fs.writeFileSync(temporary, JSON.stringify(status), { mode: 0o600 }); fs.renameSync(temporary, file);
}
async function start(configFile, keyFile, directory) {
  const scope = validateScope(privateFile(configFile)), keys = privateFile(keyFile);
  const stat = fs.statSync(directory);
  if (!stat.isDirectory() || stat.mode & 0o077) throw failure();
  const sender = new WebPushSender({ keys, expiresAt: scope.expiresAt });
  const pool = new Pool({ host: "/var/run/postgresql", database: "crownlands_migration", max: 2,
    application_name: ROLE, connectionTimeoutMillis: 5000, statement_timeout: 10000, idle_in_transaction_session_timeout: 15000 });
  const store = new Store({ schema: scope.schema, pool });
  let loop, timer, reporting = Promise.resolve(), stopping;
  function stop(failed = false) {
    if (failed) process.exitCode = 1;
    if (stopping) return stopping;
    clearTimeout(timer); loop?.stop(); sender.stop();
    setTimeout(() => process.exit(1), 15000).unref();
    stopping = (async () => {
      try { await loop?.settle(); await reporting; if (loop) writeStatus(directory, await loop.status()); }
      catch { process.exitCode = 1; }
      finally { await store.close().catch(() => { process.exitCode = 1; }); }
    })(); return stopping;
  }
  pool.on("error", () => { void stop(true); });
  try {
    await assertPushRole(store); loop = new WebPushLoop({ store, sender, scope });
    const report = async () => {
      if (stopping) return;
      reporting = loop.status().then(status => writeStatus(directory, status));
      try { await reporting; } catch { void stop(true); return; }
      if (loop.stopped) { void stop(); return; }
      if (!stopping) timer = setTimeout(report, 5000);
    };
    process.once("SIGTERM", () => { void stop(); }); process.once("SIGINT", () => { void stop(); });
    loop.start(); await report(); return { loop, stop };
  } catch { await stop(true); throw failure(); }
}
if (require.main === module) {
  const credentials = process.env.CREDENTIALS_DIRECTORY, state = process.env.STATE_DIRECTORY;
  if (!credentials || !state) { console.error("Private notification service credentials required."); process.exitCode = 1; }
  else start(path.join(credentials, "config"), path.join(credentials, "vapid"), state).catch(() => {
    console.error("Private notification service stopped; sensitive diagnostics suppressed."); process.exitCode = 1;
  });
}
module.exports = { privateFile, assertPushRole, writeStatus };
