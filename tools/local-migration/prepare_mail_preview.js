"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { Store } = require("../../local-backend/store");
const { AuthMailDispatcher, ResendRehearsalSender } = require("../../local-backend/auth-mail");
const { readConfig } = require("../../local-backend/auth-mail-rehearsal");
const { hashes } = require("./prepare_auth_preview");
const ROLE = "crownlands-mail-rehearsal";
async function prepare(original, keyFile, bundle, email) {
  const repo = path.resolve(__dirname, "../.."), root = path.join(os.homedir(), ".local/share/crownlands");
  if (process.versions.node.split(".")[0] !== "22" || execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim()) throw Error("Clean validated Node 22 workspace required");
  const read = filename => {
    const file = fs.realpathSync(filename), stat = fs.statSync(file);
    if (!file.startsWith(root + path.sep) || !stat.isFile() || stat.mode & 0o077 || stat.size > 65536) throw Error("Private Crownlands input required");
    return fs.readFileSync(file);
  };
  const authBytes = read(path.join(original, "config.json")), auth = JSON.parse(authBytes), key = read(keyFile);
  if (auth.origin !== "https://playcrownlands.com" || !/^migration_auth_preview_[a-f0-9]{12}$/.test(auth.schema)
    || Date.parse(auth.expiresAt) < Date.now() + 3600000) throw Error("Current private account preview required");
  new ResendRehearsalSender({ apiKey: key.toString().trim(), allowedRecipients: [email] });
  bundle = path.resolve(bundle);
  if (fs.existsSync(bundle) || fs.realpathSync(path.dirname(bundle)) !== root) throw Error("Fresh private installation directory required");
  const store = new Store({ schema: auth.schema });
  try {
    const accounts = (await store.pool.query(`SELECT body->>'email' AS email FROM ${auth.schema}.accounts`)).rows;
    if (accounts.length !== 1 || accounts[0].email !== email
      || (await store.pool.query(`SELECT 1 FROM ${auth.schema}.auth_mail WHERE status='pending' LIMIT 1`)).rowCount) throw Error("One matching owner and an empty pending queue are required");
    // Only the schema owner prepares the projection and existing outbox table.
    await new AuthMailDispatcher({ store, sender: { send: () => { throw Error("Preparation cannot send"); } } }).initialize();
    fs.mkdirSync(bundle, { mode: 0o700 });
    const write = (name, data) => fs.writeFileSync(path.join(bundle, name), data, { mode: 0o600, flag: "wx" });
    write("config.json", JSON.stringify({ schema: auth.schema, expiresAt: auth.expiresAt, allowedRecipients: [email] })); readConfig(path.join(bundle, "config.json"));
    // Installer compares the whole expected protected auth configuration; it
    // does not replace it or enable browser registration/email-request routes.
    write("expected-auth.json", JSON.stringify({ ...auth, allowEmailActionTest: true }));
    write("resend-api-key", key);
    write("manifest.json", JSON.stringify({ commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), role: ROLE }));
    const app = path.join(bundle, "app"); fs.mkdirSync(app, { mode: 0o755 });
    for (const name of ["store.js", "values.js", "auth-mail.js", "auth-mail-loop.js", "auth-mail-rehearsal.js", "package.json", "pnpm-lock.yaml"]) {
      fs.copyFileSync(path.join(repo, "local-backend", name), path.join(app, name)); fs.chmodSync(path.join(app, name), 0o644);
    }
    fs.cpSync(path.join(repo, "local-backend/node_modules"), path.join(app, "node_modules"), { recursive: true, verbatimSymlinks: true });
    fs.copyFileSync(process.execPath, path.join(bundle, "node"));
    fs.copyFileSync(path.join(__dirname, "install_mail_preview.py"), path.join(bundle, "install.py"));
    fs.copyFileSync(path.join(__dirname, ROLE + ".service"), path.join(bundle, ROLE + ".service"));
    write("SHA256SUMS", hashes(bundle).join("\n") + "\n");
    console.log("Private account mail bundle prepared. Empty queue verified; no email sent or route changed.");
  } finally { await store.close(); }
}
if (require.main === module) prepare(...process.argv.slice(2)).catch(() => {
  console.error("Private mail preparation stopped; retained files preserved, sensitive diagnostics suppressed."); process.exitCode = 1;
});
module.exports = { prepare };
