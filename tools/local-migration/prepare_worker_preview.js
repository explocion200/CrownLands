"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { hashes } = require("./prepare_auth_preview");
const { copyRuntime } = require("./prepare_game_preview");
const { readConfig } = require("../../local-backend/worker-rehearsal");
const { Store } = require("../../local-backend/store");
const ROLE = "crownlands-worker-rehearsal";
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
async function prepare(gameBundle, bundle) {
  const repo = path.resolve(__dirname, "../..");
  if (process.versions.node.split(".")[0] !== "22" || !path.isAbsolute(bundle) || fs.existsSync(bundle)
    || execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim()) throw Error("A clean validated Node 22 workspace and new private bundle are required");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const gameBytes = fs.readFileSync(path.join(gameBundle, "config.json")), game = JSON.parse(gameBytes);
  if (fs.statSync(path.join(gameBundle, "config.json")).mode & 0o077 || game.origin !== "https://playcrownlands.com"
    || !/^migration_game_preview_[a-f0-9]{12}$/.test(game.schema) || Date.parse(game.expiresAt) < Date.now() + 3600000) throw Error("Existing private game configuration required");
  const secretBytes = fs.readFileSync(path.join(gameBundle, "secrets.json")), secrets = JSON.parse(secretBytes);
  if (Object.keys(secrets).join() !== "LINKED_ACCOUNT_IP_HMAC_KEY" || typeof secrets.LINKED_ACCOUNT_IP_HMAC_KEY !== "string") throw Error("Only the existing private network HMAC is allowed");
  const store = new Store({ schema: game.schema });
  try {
    const jobs = (await store.pool.query(`SELECT status,count(*) FROM ${store.schema}.work_jobs GROUP BY status`)).rows;
    if (!jobs.some(row => row.status === "complete") || jobs.some(row => row.status === "dead" || row.status === "running")) throw Error("Inspect finite rehearsal jobs before service preparation");
  } finally { await store.close(); }
  fs.mkdirSync(bundle, { mode: 0o700 });
  const write = (name, data) => fs.writeFileSync(path.join(bundle, name), data, { mode: 0o600, flag: "wx" });
  write("config.json", JSON.stringify({ schema: game.schema, expiresAt: game.expiresAt })); readConfig(path.join(bundle, "config.json"));
  write("secrets.json", secretBytes);
  write("manifest.json", JSON.stringify({ commit, role: ROLE, schema: game.schema, expiresAt: game.expiresAt,
    gameConfigHash: hash(gameBytes), gameSecretsHash: hash(secretBytes) }));
  copyRuntime(repo, path.join(bundle, "app"));
  fs.copyFileSync(process.execPath, path.join(bundle, "node"));
  fs.copyFileSync(path.join(__dirname, "install_worker_preview.py"), path.join(bundle, "install.py"));
  fs.copyFileSync(path.join(__dirname, ROLE + ".service"), path.join(bundle, ROLE + ".service"));
  write("SHA256SUMS", hashes(bundle).join("\n") + "\n");
  console.log(JSON.stringify({ prepared: true, commit, expiresAt: game.expiresAt, publicRoutesChanged: false, liveBackend: "Firebase" }));
}
if (require.main === module) prepare(path.resolve(process.argv[2] || ""), path.resolve(process.argv[3] || ""))
  .catch(() => { console.error("Private worker preparation stopped; inspect retained files. No private payload was logged."); process.exitCode = 1; });
module.exports = { prepare };
