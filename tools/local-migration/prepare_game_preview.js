"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Store } = require("../../local-backend/store");
const { hashes } = require("./prepare_auth_preview");
const ROLE = "crownlands-game-rehearsal";
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const snippet = `\t\t# Private game migration rehearsal; original player data remains on Firebase.
\t\thandle /api/local-game/* {
\t\t\t@gamePreviewLocal {
\t\t\t\thost playcrownlands.com
\t\t\t\tremote_ip 127.0.0.1 ::1 192.168.1.0/24
\t\t\t}
\t\t\thandle @gamePreviewLocal {
\t\t\t\trequest_body {
\t\t\t\t\tmax_size 2097152
\t\t\t\t}
\t\t\t\treverse_proxy 127.0.0.1:9191 {
\t\t\t\t\theader_up X-Crownlands-Client-IP {remote_host}
\t\t\t\t}
\t\t\t}
\t\t\trespond 404
\t\t}
`;
function prepareCaddy(before) {
  const marker = "\t\thandle /local-auth/* {";
  if (before.includes("/api/local-game/") || before.split(marker).length !== 2 || !before.includes("(crownlands_routes) {")) throw Error("Existing routes require review");
  return before.replace(marker, snippet + marker);
}
function prepareClient(source, destination) {
  if (fs.existsSync(destination)) throw Error("Refusing to replace a preview client");
  fs.cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
  const index = path.join(destination, "index.html");
  let html = fs.readFileSync(index, "utf8");
  const entryScript = /<script src="app-entry\.js(?:\?v=[A-Za-z0-9_-]+)?"><\/script>/;
  if (!entryScript.test(html) || !fs.existsSync(path.join(destination, "local-client.js"))) throw Error("Expected built game client required");
  html = html.replace(entryScript, match => '<script src="local-preview.js"></script>\n  ' + match)
    .replace(/<link rel="manifest"[^>]*>/g, "");
  fs.writeFileSync(index, html);
  fs.copyFileSync(path.join(__dirname, "local-preview.js"), path.join(destination, "local-preview.js"));
  const ads = path.join(destination, "ads-config.js");
  const config = fs.readFileSync(ads, "utf8");
  if (!config.includes("enabled: true")) throw Error("Review changed advertising configuration");
  fs.writeFileSync(ads, config.replace("enabled: true", "enabled: false"));
}
function copyRuntime(repo, destination) {
  for (const directory of ["local-backend", "functions"]) {
    const source = path.join(repo, directory);
    // This host's Functions toolchain links Node outside node_modules. The
    // system unit has its own pinned Node binary; don't copy those CLI links.
    fs.cpSync(source, path.join(destination, directory), { recursive: true, verbatimSymlinks: true,
      filter: file => !["node_modules/node", "node_modules/.bin/node"].includes(path.relative(source, file).split(path.sep).join("/")) });
  }
}
async function prepareSchema({ sourceSchema, authSchema, store }) {
  if (!/^migration_[a-z0-9_]{1,40}$/.test(sourceSchema) || !/^migration_auth_preview_[a-f0-9]{12}$/.test(authSchema)
    || !/^migration_game_preview_[a-f0-9]{12}$/.test(store.schema) || [sourceSchema, authSchema].includes(store.schema)) throw Error("Invalid isolated game copy");
  const exists = await store.pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [store.schema]);
  if (exists.rowCount) throw Error("Existing game schema preserved");
  const accounts = await store.pool.query(`SELECT uid FROM ${authSchema}.accounts`);
  if (accounts.rowCount !== 1) throw Error("Exactly one copied owner account required");
  const ownerUid = accounts.rows[0].uid;
  const sourceProfile = await store.pool.query(`SELECT 1 FROM ${sourceSchema}.documents WHERE path=$1`, ["players/" + ownerUid]);
  if (sourceProfile.rowCount !== 1) throw Error("Copied player profile required");
  await store.initialize();
  const s = store.schema, client = await store.pool.connect();
  let count;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await client.query("SET LOCAL statement_timeout='10min'");
    // Direct import creates no trigger events. Replaying every historical
    // creation would duplicate old side effects and is not a cutover strategy.
    const copied = await client.query(`INSERT INTO ${s}.documents(path,collection_id,parent_path,body,source_sha256)
      SELECT path,collection_id,parent_path,body,source_sha256 FROM ${sourceSchema}.documents`);
    count = copied.rowCount;
    if (count < 1) throw Error("Source copy is empty");
    const comparison = await client.query(`SELECT count(*) AS different FROM ${sourceSchema}.documents a FULL JOIN ${s}.documents b USING(path)
      WHERE a.path IS NULL OR b.path IS NULL OR a.body IS DISTINCT FROM b.body OR a.collection_id IS DISTINCT FROM b.collection_id
      OR a.parent_path IS DISTINCT FROM b.parent_path OR a.source_sha256 IS DISTINCT FROM b.source_sha256`);
    if (Number(comparison.rows[0].different) !== 0) throw Error("Game copy comparison failed");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  // Match query expressions for the two client collection-group listeners.
  for (const [collection, field] of [["cities", "ownerUid"], ["camps", "holderUid"]]) {
    await store.pool.query(`CREATE INDEX preview_${collection}_owner ON ${s}.documents
      (${s}.query_sort_key(body #> '{fields,${field}}')) WHERE collection_id='${collection}'`);
  }
  await store.pool.query(`ANALYZE ${s}.documents`);
  // The private proxy supplies one verified source address. Adjust only the
  // disposable copy; retain the live HMAC and all historic network evidence.
  const ingress = store.doc("realmSecurity/global/configuration/ipIngress"), before = await ingress.get();
  if (before.data()?.enabled === true) await ingress.set({ verified: true, suffixLength: 1 }, { merge: true });
  return { count, ownerUid };
}
async function prepareBundle({ authBundle, sourceSchema, secretsDirectory, bundle }) {
  const repo = path.resolve(__dirname, "../..");
  if (process.versions.node.split(".")[0] !== "22" || !path.isAbsolute(bundle) || fs.existsSync(bundle)) throw Error("Node 22 and a new absolute private bundle path required");
  if (execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim()) throw Error("Commit and validate before preparing installation");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const authBytes = fs.readFileSync(path.join(authBundle, "config.json")), auth = JSON.parse(authBytes);
  if (Date.parse(auth.expiresAt) <= Date.now() + 3600000) throw Error("The account preview must have at least one hour remaining");
  const before = fs.readFileSync("/etc/caddy/Caddyfile", "utf8"), caddy = prepareCaddy(before);
  const secrets = { LINKED_ACCOUNT_IP_HMAC_KEY: fs.readFileSync(path.join(secretsDirectory, "LINKED_ACCOUNT_IP_HMAC_KEY"), "utf8").trim() };
  if (secrets.LINKED_ACCOUNT_IP_HMAC_KEY.length < 32) throw Error("Existing network HMAC required");
  execFileSync(process.execPath, [path.join(repo, "tools/build-production-client.js")], { cwd: repo, stdio: ["ignore", "ignore", "pipe"] });
  const schema = "migration_game_preview_" + crypto.randomBytes(6).toString("hex"), store = new Store({ schema });
  try {
    const { count, ownerUid } = await prepareSchema({ sourceSchema, authSchema: auth.schema, store });
    fs.mkdirSync(bundle, { mode: 0o700 });
    const write = (file, value) => fs.writeFileSync(path.join(bundle, file), value, { mode: 0o600, flag: "wx" });
    write("config.json", JSON.stringify({ schema, authSchema: auth.schema, ownerUid, origin: auth.origin, rateKey: auth.rateKey, expiresAt: auth.expiresAt }));
    write("secrets.json", JSON.stringify(secrets));
    write("manifest.json", JSON.stringify({ commit, schema, authSchema: auth.schema, documents: count, role: ROLE, expiresAt: auth.expiresAt,
      caddyBeforeHash: hash(before), authConfigHash: hash(authBytes), sourceSchema }, null, 2));
    write("Caddyfile", caddy);
    copyRuntime(repo, path.join(bundle, "app"));
    prepareClient(path.join(repo, "dist"), path.join(bundle, "app", "client"));
    fs.copyFileSync(process.execPath, path.join(bundle, "node"));
    fs.copyFileSync(path.join(__dirname, "install_game_preview.py"), path.join(bundle, "install.py"));
    fs.copyFileSync(path.join(__dirname, ROLE + ".service"), path.join(bundle, ROLE + ".service"));
    write("SHA256SUMS", hashes(bundle).join("\n") + "\n");
    console.log(JSON.stringify({ prepared: true, documents: count, commit, expiresAt: auth.expiresAt, liveBackend: "Firebase", workersEnabled: false }));
  } finally { await store.close(); }
}
if (require.main === module) {
  const [authBundle, sourceSchema, secretsDirectory, bundle] = process.argv.slice(2);
  if (!bundle) { console.error("Usage: node prepare_game_preview.js PRIVATE_AUTH_BUNDLE SOURCE_SCHEMA PRIVATE_SECRETS NEW_PRIVATE_BUNDLE"); process.exitCode = 1; }
  else prepareBundle({ authBundle, sourceSchema, secretsDirectory, bundle }).catch(() => { console.error("Game preview preparation stopped; source, partial copy and bundle preserved. Private details were not logged."); process.exitCode = 1; });
}
module.exports = { prepareCaddy, prepareClient, prepareSchema, copyRuntime };
