"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Store } = require("../../local-backend/store");
const { AuthService, secret } = require("../../local-backend/auth");

const ROLE = "crownlands-auth-rehearsal";
const snippet = `\t\t# Private account migration rehearsal; live game routing is unchanged.
\t\thandle /local-auth/* {
\t\t\t@authPreviewLocal {
\t\t\t\thost playcrownlands.com
\t\t\t\tremote_ip 127.0.0.1 ::1 192.168.1.0/24
\t\t\t}
\t\t\thandle @authPreviewLocal {
\t\t\t\trequest_body {
\t\t\t\t\tmax_size 16KB
\t\t\t\t}
\t\t\t\treverse_proxy 127.0.0.1:9190 {
\t\t\t\t\theader_up X-Crownlands-Client-IP {remote_host}
\t\t\t\t}
\t\t\t}
\t\t\trespond 404
\t\t}
`;
function prepareCaddy(before) {
  if (before.includes("/local-auth/")) throw Error("Existing account routes must be reviewed before installing a preview");
  const marker = "\t\thandle /backup-healthz {";
  if (before.split(marker).length !== 2 || !before.includes("(crownlands_routes) {")) throw Error("Unexpected Caddy configuration; preserved without modification");
  return before.replace(marker, snippet + marker);
}
async function prepareSchema({ sourceSchema, email, store }) {
  if (!/^migration_[a-z0-9_]{1,40}$/.test(sourceSchema) || !/^migration_auth_preview_[a-f0-9]{12}$/.test(store.schema)
    || sourceSchema === store.schema || typeof email !== "string" || email.length > 320) throw Error("Invalid private preview target");
  const s = store.schema;
  const client = await store.pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const account = await client.query(`SELECT a.uid,a.body,EXISTS(SELECT 1 FROM ${sourceSchema}.documents d WHERE d.path='players/'||a.uid) AS profile_found FROM ${sourceSchema}.accounts a WHERE lower(a.body->>'email')=$1`, [email.trim().toLowerCase()]);
    if (account.rowCount !== 1 || account.rows[0].body.disabled || !account.rows[0].profile_found) throw Error("The chosen owner account and player profile must exist exactly once in the source copy");
    await client.query(`CREATE SCHEMA ${s}; REVOKE ALL ON SCHEMA ${s} FROM PUBLIC;
      CREATE TABLE ${s}.accounts(uid text PRIMARY KEY,body jsonb NOT NULL);
      CREATE TABLE ${s}.rehearsal_identity(uid text PRIMARY KEY,profile_found boolean NOT NULL);`);
    const row = account.rows[0];
    await client.query(`INSERT INTO ${s}.accounts(uid,body) VALUES($1,$2)`, [row.uid, row.body]);
    await client.query(`INSERT INTO ${s}.rehearsal_identity(uid,profile_found) VALUES($1,$2)`, [row.uid, row.profile_found]);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM PUBLIC`);
    await client.query("COMMIT");
  } catch (cause) { await client.query("ROLLBACK"); throw cause; }
  finally { client.release(); }
}
function hashes(directory, root = directory) {
  const lines = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (!fs.realpathSync(file).startsWith(root + path.sep)) throw Error("Bundle symlink leaves the private bundle");
    } else if (entry.isDirectory()) lines.push(...hashes(file, root));
    else if (entry.isFile()) lines.push(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") + "  " + path.relative(root, file));
    else throw Error("Unexpected bundle file type");
  }
  return lines;
}
async function prepareBundle({ snapshot, sourceSchema, email, bundle }) {
  if (process.versions.node.split(".")[0] !== "22") throw Error("Use the installed Node 22 toolchain");
  const repo = path.resolve(__dirname, "../..");
  if (execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim()) throw Error("Commit and validate the preview before preparing an install bundle");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const privateRoot = path.join(os.homedir(), ".local/share/crownlands");
  snapshot = path.resolve(snapshot); bundle = path.resolve(bundle);
  if (!snapshot.startsWith(privateRoot + path.sep) || !bundle.startsWith(privateRoot + path.sep)
    || fs.existsSync(bundle) || (fs.statSync(snapshot).mode & 0o077)) throw Error("Use a new private Crownlands bundle directory and private snapshot");
  const schema = "migration_auth_preview_" + crypto.randomBytes(6).toString("hex");
  const config = { schema, origin: "https://playcrownlands.com", rateKey: secret(),
    expiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    hashConfig: JSON.parse(fs.readFileSync(path.join(snapshot, "auth-config.json"))).signIn.hashConfig,
    google: JSON.parse(fs.readFileSync(path.join(snapshot, "google-oauth.json"))) };
  if (!config.google.enabled || !config.google.clientSecret || !config.hashConfig.signerKey) throw Error("Private account configuration is incomplete");
  const before = fs.readFileSync("/etc/caddy/Caddyfile", "utf8"), after = prepareCaddy(before);
  const store = new Store({ schema });
  try {
    await prepareSchema({ sourceSchema, email, store });
    const auth = new AuthService({ store, hashConfig: config.hashConfig, google: config.google, rateKey: Buffer.from(config.rateKey, "base64url") });
    await auth.initialize();
    fs.mkdirSync(bundle, { mode: 0o700 });
    const write = (file, value) => fs.writeFileSync(path.join(bundle, file), value, { mode: 0o600, flag: "wx" });
    write("config.json", JSON.stringify(config));
    write("manifest.json", JSON.stringify({ commit, schema, role: ROLE, expiresAt: config.expiresAt,
      caddyBeforeHash: crypto.createHash("sha256").update(before).digest("hex") }, null, 2));
    write("Caddyfile", after);
    fs.cpSync(path.join(repo, "local-backend"), path.join(bundle, "app"), { recursive: true, verbatimSymlinks: true });
    fs.copyFileSync(process.execPath, path.join(bundle, "node"));
    fs.copyFileSync(path.join(__dirname, "install_auth_preview.py"), path.join(bundle, "install.py"));
    fs.copyFileSync(path.join(__dirname, "crownlands-auth-rehearsal.service"), path.join(bundle, "crownlands-auth-rehearsal.service"));
    write("SHA256SUMS", hashes(bundle).join("\n") + "\n");
    console.log("Private owner-only account copy and reviewed installation bundle prepared. No server or route has been started.");
  } finally { await store.close(); }
}
if (require.main === module) {
  const [snapshot, sourceSchema, email, bundle] = process.argv.slice(2);
  if (!snapshot || !sourceSchema || !email || !bundle) { console.error("Usage: node prepare_auth_preview.js PRIVATE_SNAPSHOT SOURCE_SCHEMA OWNER_EMAIL NEW_PRIVATE_BUNDLE"); process.exitCode = 1; }
  else prepareBundle({ snapshot, sourceSchema, email, bundle }).catch(() => { console.error("Preview preparation stopped. Private source, schema and partial bundle were preserved for inspection."); process.exitCode = 1; });
}
module.exports = { prepareCaddy, prepareSchema };
