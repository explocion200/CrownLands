"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Store } = require("./store");
const { AuthService } = require("./auth");
const { createGameServer } = require("./game-http");
const { staticPreview } = require("./preview-static");
const { describe } = require("./platform");

async function start(configPath, secretsPath, clientDirectory) {
  const stat = fs.statSync(configPath);
  if (!stat.isFile() || stat.mode & 0o007 || stat.size > 8192) throw Error("Private game configuration required");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!/^migration_game_preview_[a-f0-9]{12}$/.test(config.schema) || !/^migration_auth_preview_[a-f0-9]{12}$/.test(config.authSchema)
    || config.origin !== "https://playcrownlands.com" || !/^[A-Za-z0-9_-]{43}$/.test(config.rateKey)) throw Error("Invalid private game configuration");
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = config.schema;
  process.env.CROWNLANDS_REHEARSAL_SECRET_FILE = secretsPath;
  const game = require("../functions"), platform = require("../functions/platform"), store = platform.store;
  const authStore = new Store({ schema: config.authSchema, pool: store.pool });
  try {
    const privileges = (await store.pool.query(`SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,
      has_schema_privilege(current_user,$1,'CREATE') OR has_schema_privilege(current_user,$2,'CREATE') AS creates
      FROM pg_roles r WHERE r.rolname=current_user`, [config.schema, config.authSchema])).rows[0];
    if (!privileges || privileges.rolsuper || privileges.rolcreatedb || privileges.rolcreaterole || privileges.creates) throw Error("Restricted game runtime role required");
    const count = await store.pool.query(`SELECT count(*) AS n FROM ${config.authSchema}.accounts WHERE uid=$1`, [config.ownerUid]);
    if (Number(count.rows[0].n) !== 1) throw Error("Copied owner account required");
    const auth = new AuthService({ store: authStore, rateKey: Buffer.from(config.rateKey, "base64url"), origin: config.origin });
    const server = createGameServer({ store, auth, routes: describe(game), ownerUid: config.ownerUid, expiresAt: config.expiresAt, preview: staticPreview(clientDirectory) });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(9191, "127.0.0.1", resolve); });
    let stopping = false;
    const stop = () => { if (stopping) return; stopping = true; server.close(() => store.close().then(() => process.exit(0))); setTimeout(() => process.exit(1), 10000).unref(); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
    console.log("Private local game preview ready on loopback. Live game and external services unchanged; background workers disabled.");
    return { server, store };
  } catch (error) { await store.close(); throw error; }
}
if (require.main === module) {
  const directory = process.env.CREDENTIALS_DIRECTORY;
  if (!directory) { console.error("System service credentials required"); process.exitCode = 1; }
  else start(path.join(directory, "config"), path.join(directory, "secrets"), path.resolve(__dirname, "../client"))
    .catch(() => { console.error("Private game preview could not start; private details were not logged."); process.exitCode = 1; });
}
module.exports = { start };
