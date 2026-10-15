"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const { Store } = require("../../local-backend/store");
const { PROJECT, validateScope } = require("../../local-backend/chat-translation-rehearsal");
const { readPrivate } = require("./rehearse_stripe_payments");
const { reserveProjectAllowance, initializeLocalAllowance } = require("./translation_allowance");

async function main([directory, approval]) {
  // This flag is an execution guard, not a substitute for human authorization.
  if (approval !== "--reserve-approved-allowance" || process.env.FIRESTORE_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR) throw Error("Explicit approved reservation required");
  const repo = path.resolve(__dirname, "../.."), bundle = fs.realpathSync(directory);
  const manifest = JSON.parse(readPrivate(path.join(bundle, "manifest.json")));
  const scope = validateScope(JSON.parse(readPrivate(path.join(bundle, "scope.json"))));
  if (process.versions.node.split(".")[0] !== "22" || execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim()
    || execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() !== manifest.commit
    || JSON.stringify(scope) !== JSON.stringify(validateScope(manifest.scope))) throw Error("Prepared translation identity changed");
  const fromFunctions = createRequire(path.join(repo, "functions/package.json"));
  const fromAdmin = createRequire(fromFunctions.resolve("firebase-admin/firestore"));
  const { Firestore } = fromAdmin("@google-cloud/firestore"), { OAuth2Client } = fromAdmin("google-auth-library");
  const accessToken = execFileSync("gcloud", ["auth", "print-access-token", "--account=ricmontalvan@gmail.com", `--project=${PROJECT}`],
    { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (!accessToken || /\s/.test(accessToken)) throw Error("Google operator login required");
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: accessToken, expiry_date: Date.now() + 10 * 60000 });
  const source = new Firestore({ projectId: PROJECT, databaseId: "(default)", authClient, preferRest: true });
  const store = new Store({ schema: scope.schema });
  try {
    // Confirm the existing copy before touching the source ledger. Never create
    // a schema or copy player messages as part of this operation.
    const owner = await store.doc("players/" + scope.ownerUid).get();
    if (!owner.exists) throw Error("Existing copied owner required");
    const receipt = await reserveProjectAllowance({ db: source, scope });
    const receiptFile = path.join(bundle, "source-reservation.json");
    if (fs.existsSync(receiptFile)) {
      if (!isDeepStrictEqual(JSON.parse(readPrivate(receiptFile)), receipt)) throw Error("Existing receipt requires review");
    } else fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await initializeLocalAllowance({ store, scope, receipt });
    console.log("Approved translation allowance reserved once in the shared source ledger and initialized locally. No translation request sent.");
  } finally { await source.terminate(); await store.close(); }
}
if (require.main === module) main(process.argv.slice(2)).catch(() => {
  console.error("Translation reservation stopped; preserve the prepared scope and receipts. Retry only the same reviewed reservation after inspection. Private details suppressed."); process.exitCode = 1;
});
module.exports = { main };
