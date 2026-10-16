"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { JobQueue } = require("./jobs");
const { WorkerLoop, privateWorkerRoutes } = require("./worker-loop");
const { WorkerDiagnostics } = require("./worker-diagnostics");
const { describe } = require("./platform");
const ROLE = "crownlands-worker-rehearsal";
const reportFailure = console.error.bind(console);

function readConfig(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.mode & 0o007 || stat.size > 8192) throw Error("Private worker configuration required");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Object.keys(config).sort().join() !== "expiresAt,schema" || !/^migration_game_preview_[a-f0-9]{12}$/.test(config.schema)
    || !Number.isFinite(Date.parse(config.expiresAt)) || Date.parse(config.expiresAt) <= Date.now()
    || Date.parse(config.expiresAt) > Date.now() + 7 * 86400000) throw Error("An unexpired private game copy is required");
  return config;
}
async function assertWorkerRole(store) {
  const result = (await store.pool.query(`SELECT current_user AS name,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
    has_schema_privilege(current_user,$1,'CREATE') AS creates FROM pg_roles r WHERE r.rolname=current_user`, [store.schema])).rows[0];
  if (!result || result.name !== ROLE || ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "creates"].some(key => result[key] !== false)) throw Error("Restricted private worker role required");
  // Startup must never create/alter tables. The reviewed operator preparation
  // initializes them; the service owns no schema objects or account tables.
  await store.pool.query(`SELECT id,status,lease_token FROM ${store.schema}.work_jobs LIMIT 0`);
  await store.pool.query(`SELECT name,signature,last_minute FROM ${store.schema}.work_schedules LIMIT 0`);
}
function writeStatus(directory, status) {
  const file = path.join(directory, "status.json"), temp = file + ".next";
  fs.writeFileSync(temp, JSON.stringify(status), { mode: 0o600 });
  fs.renameSync(temp, file);
}
async function start(configFile, secretsFile, directory) {
  const config = readConfig(configFile);
  const info = fs.statSync(directory);
  if (!info.isDirectory() || info.mode & 0o077) throw Error("Private worker state directory required");
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = config.schema;
  process.env.CROWNLANDS_REHEARSAL_SECRET_FILE = secretsFile;
  const diagnostics = new WorkerDiagnostics(); diagnostics.capture();
  let store, loop, timer, stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true; clearTimeout(timer); loop?.stop();
    // Keep both the privacy filter and the unreferenced hard deadline until
    // process exit: a timed-out handler may still have JavaScript/timers alive.
    setTimeout(() => process.exit(1), 15000).unref();
    try {
      await loop?.settle();
      if (loop) writeStatus(directory, { ...await loop.status(), recordedAt: new Date().toISOString(), handlerLogs: diagnostics.snapshot() });
      await store?.close();
    } catch { process.exitCode = 1; }
  };
  try {
    const game = require("../functions"); store = require("../functions/platform").store;
    await assertWorkerRole(store);
    const queue = new JobQueue({ store, routes: privateWorkerRoutes(describe(game)), maxActive: 2 });
    loop = new WorkerLoop({ queue, expiresAt: config.expiresAt });
    const report = async () => {
      if (stopping) return;
      if (Date.now() >= loop.expiry) { await stop(); return; }
      try { writeStatus(directory, { ...await loop.status(), recordedAt: new Date().toISOString(), handlerLogs: diagnostics.snapshot() }); }
      catch { await stop(); process.exitCode = 1; return; }
      if (!stopping) timer = setTimeout(report, 5000);
    };
    process.once("SIGTERM", () => { void stop(); }); process.once("SIGINT", () => { void stop(); });
    loop.start(); await report();
    return { loop, stop };
  } catch (error) { await stop(); throw error; }
}
if (require.main === module) {
  const credentials = process.env.CREDENTIALS_DIRECTORY, state = process.env.STATE_DIRECTORY;
  if (!credentials || !state) { console.error("Private system service credentials and state required"); process.exitCode = 1; }
  else start(path.join(credentials, "config"), path.join(credentials, "secrets"), state)
    .catch(() => { reportFailure("Private worker stopped; private error details were not logged."); process.exitCode = 1; });
}
module.exports = { readConfig, assertWorkerRole, writeStatus };
