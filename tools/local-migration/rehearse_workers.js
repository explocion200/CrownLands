"use strict";
// Finite operator rehearsal on the installed *copy*. No service, public route,
// provider delivery, live Firestore write or authoritative cutover is started.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { JobQueue } = require("../../local-backend/jobs");
const { WorkerLoop, privateWorkerRoutes } = require("../../local-backend/worker-loop");
const { describe } = require("../../local-backend/platform");
const { WorkerDiagnostics } = require("../../local-backend/worker-diagnostics");
const log = console.log.bind(console);

async function rehearse(bundle, seconds = 120) {
  if (process.versions.node.split(".")[0] !== "22" || !Number.isInteger(seconds) || seconds < 10 || seconds > 300) throw Error("Use Node 22 and a 10–300 second rehearsal");
  if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) throw Error("Commit and validate the worker before rehearsal");
  const configFile = path.join(bundle, "config.json"), stat = fs.statSync(configFile);
  if (!stat.isFile() || stat.mode & 0o077 || stat.size > 8192) throw Error("Private preview configuration required");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  if (!/^migration_game_preview_[a-f0-9]{12}$/.test(config.schema) || config.origin !== "https://playcrownlands.com"
    || Date.parse(config.expiresAt) < Date.now() + (seconds + 60) * 1000) throw Error("An unexpired installed private game copy is required");
  const output = path.join(path.dirname(bundle), "worker-rehearsal-" + crypto.randomBytes(6).toString("hex"));
  fs.mkdirSync(output, { mode: 0o700 });
  const dump = path.join(output, "before-workers.dump");
  const fd = fs.openSync(dump, "wx", 0o600);
  try { execFileSync("pg_dump", ["-h", "/var/run/postgresql", "-d", "crownlands_migration", "-Fc", "-n", config.schema], { stdio: ["ignore", fd, "pipe"] }); }
  finally { fs.closeSync(fd); }
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = config.schema;
  process.env.CROWNLANDS_REHEARSAL_SECRET_FILE = path.join(bundle, "secrets.json");
  const diagnostics = new WorkerDiagnostics();
  const restoreConsole = diagnostics.capture();
  const game = require("../../functions"), { store } = require("../../functions/platform");
  const queue = new JobQueue({ store, routes: privateWorkerRoutes(describe(game)), maxActive: 2 });
  let loop;
  const hardStop = setTimeout(() => {
    loop?.stop(); log("Finite worker rehearsal reached its shutdown deadline. Recovery files were retained."); process.exit(1);
  }, (seconds + 30) * 1000).unref();
  try {
    await queue.initialize();
    loop = new WorkerLoop({ queue, expiresAt: config.expiresAt });
    loop.start();
    log("Finite private worker rehearsal started. Provider delivery is disabled; a consistent pre-worker dump was retained.");
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    loop.stop();
    await Promise.race([loop.settle(), new Promise((_, reject) => setTimeout(() => reject(Error("Worker shutdown deadline exceeded")), 15000).unref())]);
    const status = { ...await loop.status(), handlerLogs: diagnostics.snapshot() };
    const jobs = (await store.pool.query(`SELECT handler,status,count(*) AS count,last_error_code FROM ${store.schema}.work_jobs GROUP BY handler,status,last_error_code ORDER BY handler,status`)).rows;
    fs.writeFileSync(path.join(output, "status.json"), JSON.stringify({ ...status, jobsByHandler: jobs }, null, 2), { mode: 0o600 });
    log(JSON.stringify(status));
    log("Private recovery and aggregate results: " + output);
    return status;
  } finally { loop?.stop(); await store.close(); clearTimeout(hardStop); restoreConsole(); }
}
if (require.main === module) rehearse(path.resolve(process.argv[2] || ""), Number(process.argv[3] || 120))
  .catch(() => { log("Worker rehearsal stopped. The copy and private recovery files were retained; no private error payload was printed."); process.exitCode = 1; });
module.exports = { rehearse };
