"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Store } = require("../../local-backend/store");
const { validateScope, budgetPath } = require("../../local-backend/web-push-loop");
const { hashes } = require("./prepare_auth_preview");
const ROLE = "crownlands-push-rehearsal";
const CLIENT = "/usr/local/lib/crownlands-game-rehearsal/app/client";
const CLIENT_FILES = ["firebaseClient.js", "local-client.js", "local-web-push.js", "local-push-worker.js", "local-preview.js"];
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
async function prepare(gameBundle, translationBundle, bundle) {
  const repo = path.resolve(__dirname, "../..");
  if (process.versions.node.split(".")[0] !== "22" || !path.isAbsolute(bundle) || fs.existsSync(bundle)
    || execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim()) throw Error("Clean reviewed Node 22 workspace and a new bundle required");
  const file = path.join(gameBundle, "config.json");
  if (fs.statSync(file).mode & 0o077) throw Error("Private game configuration required");
  const bytes = fs.readFileSync(file), game = JSON.parse(bytes);
  if (game.origin !== "https://playcrownlands.com" || Date.parse(game.expiresAt) < Date.now() + 3600000) throw Error("Current private game required");
  const translation = JSON.parse(fs.readFileSync(path.join(translationBundle, "manifest.json"))), progress = JSON.parse(fs.readFileSync(path.join(translationBundle, "activation-progress.json")));
  if (progress.installed !== true || progress.browserVerified?.translatedIntoEnglish !== true || progress.commit !== translation.commit
    || ["schema", "ownerUid", "expiresAt"].some(key => translation.scope[key] !== game[key])) throw Error("Verified installed private translation required");
  const keys = require("../../local-backend/node_modules/web-push").generateVAPIDKeys();
  const scope = validateScope({ schema: game.schema, ownerUid: game.ownerUid, notBefore: Date.now(), expiresAt: game.expiresAt,
    attemptLimit: 5, reservationId: crypto.randomBytes(16).toString("hex"), publicKey: keys.publicKey });
  const store = new Store({ schema: scope.schema });
  try {
    if (!(await store.doc("players/" + scope.ownerUid).get()).exists) throw Error("Copied owner required");
    fs.mkdirSync(bundle, { mode: 0o700 });
    const write = (name, value) => fs.writeFileSync(path.join(bundle, name), value, { mode: 0o600, flag: "wx" });
    write("config.json", JSON.stringify(scope)); write("vapid.json", JSON.stringify(keys));
    write("expected-game.json", JSON.stringify({ ...game, allowTranslationTest: true }));
    const before = Object.fromEntries(CLIENT_FILES.map(name => [name, fs.existsSync(path.join(CLIENT, name)) ? hash(fs.readFileSync(path.join(CLIENT, name))) : null]));
    if (before["local-web-push.js"] || before["local-push-worker.js"]) throw Error("Existing notification preview preserved");
    const client = path.join(bundle, "client"); fs.mkdirSync(client, { mode: 0o755 });
    for (const name of CLIENT_FILES.filter(name => name !== "local-preview.js")) fs.copyFileSync(path.join(repo, name), path.join(client, name));
    const publicConfig = JSON.stringify({ publicKey: keys.publicKey, expiresAt: scope.expiresAt });
    fs.writeFileSync(path.join(client, "local-preview.js"), fs.readFileSync(path.join(__dirname, "local-preview.js"), "utf8")
      + '\nObject.defineProperty(window, "CROWNLANDS_LOCAL_PUSH", { value: Object.freeze(' + publicConfig + ') });\n');
    const app = path.join(bundle, "app"); fs.mkdirSync(path.join(app, "local-backend"), { recursive: true, mode: 0o755 }); fs.mkdirSync(path.join(app, "functions"));
    for (const name of ["store.js", "values.js", "web-push.js", "web-push-loop.js", "web-push-rehearsal.js", "package.json", "pnpm-lock.yaml"])
      fs.copyFileSync(path.join(repo, "local-backend", name), path.join(app, "local-backend", name));
    fs.cpSync(path.join(repo, "local-backend/node_modules"), path.join(app, "local-backend/node_modules"), { recursive: true, verbatimSymlinks: true });
    fs.copyFileSync(path.join(repo, "functions/notification-delivery.js"), path.join(app, "functions/notification-delivery.js"));
    fs.copyFileSync(process.execPath, path.join(bundle, "node"));
    fs.copyFileSync(path.join(__dirname, "install_push_preview.py"), path.join(bundle, "install.py"));
    fs.copyFileSync(path.join(__dirname, ROLE + ".service"), path.join(bundle, ROLE + ".service"));
    write("manifest.json", JSON.stringify({ role: ROLE, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), clientBefore: before }));
    // Never reset or refill this reservation, including after restart/retry.
    await store.doc(budgetPath(scope)).create({ ...scope, attempts: 0 });
    write("SHA256SUMS", hashes(bundle).join("\n") + "\n");
    console.log(JSON.stringify({ prepared: true, expiresAt: scope.expiresAt, maxProviderAttempts: 5, activated: false }));
  } finally { await store.close(); }
}
if (require.main === module) prepare(path.resolve(process.argv[2] || ""), path.resolve(process.argv[3] || ""), path.resolve(process.argv[4] || "")).catch(() => {
  console.error("Private notification preparation stopped; retained private files were preserved."); process.exitCode = 1;
});
module.exports = { prepare, CLIENT_FILES };
