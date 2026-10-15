"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { Store } = require("../../local-backend/store");
const { AuthService } = require("../../local-backend/auth");
const { AuthMailDispatcher, ResendRehearsalSender } = require("../../local-backend/auth-mail");

async function sendOwnerResetTest({ store, auth, dispatcher, expectedEmail, expiresAt }) {
  if (!/^migration_auth_preview_[a-f0-9]{12}$/.test(store.schema) || Date.parse(expiresAt) <= Date.now()
    || !Number.isFinite(Date.parse(expiresAt))) throw Error("An unexpired owner account preview is required");
  const accounts = (await store.pool.query(`SELECT body FROM ${store.schema}.accounts`)).rows;
  if (accounts.length !== 1 || accounts[0].body.email !== expectedEmail || accounts[0].body.disabled
    || accounts[0].body.emailVerified !== true) throw Error("The verified owner account must match the approved recipient");
  if ((await store.pool.query(`SELECT 1 FROM ${store.schema}.auth_mail WHERE status='pending' LIMIT 1`)).rowCount) {
    throw Error("A pending account email already exists; inspect it before another test");
  }
  await dispatcher.initialize();
  await auth.requestPasswordReset(expectedEmail, "operator-approved-private-account-test");
  const queued = (await store.pool.query(`SELECT id,recipient,purpose FROM ${store.schema}.auth_mail WHERE status='pending'`)).rows;
  if (queued.length !== 1 || queued[0].recipient !== expectedEmail || queued[0].purpose !== "resetPassword") throw Error("The queued owner test changed; no email was sent");
  const result = await dispatcher.deliverOne();
  if (result.state !== "accepted") throw Error("Owner test was not acknowledged; preserve its outbox and inspect before retrying");
  const receipt = (await store.pool.query(`SELECT provider_id FROM ${store.schema}.auth_mail_delivery WHERE id=$1 AND status='accepted'`, [queued[0].id])).rows[0];
  if (!receipt) throw Error("Owner test receipt is missing");
  return { acceptedAt: new Date().toISOString(), purpose: "resetPassword", mailId: queued[0].id, providerId: receipt.provider_id, deliveryConfirmed: false };
}

function privateFile(filename, root) {
  const absolute = fs.realpathSync(filename), stat = fs.statSync(absolute);
  if (!absolute.startsWith(root + path.sep) || !stat.isFile() || (stat.mode & 0o077) || stat.size > 65536) throw Error("Private local credentials required");
  return fs.readFileSync(absolute, "utf8");
}
async function main([bundle, keyFile, output, email, approval]) {
  if (approval !== "--send-approved-owner-test" || process.versions.node.split(".")[0] !== "22") throw Error("Use Node 22 and explicit approval for the owner test");
  const repo = path.resolve(__dirname, "../.."), root = path.join(os.homedir(), ".local/share/crownlands");
  if (execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim()) throw Error("Commit and validate the email test first");
  const config = JSON.parse(privateFile(path.join(bundle, "config.json"), root));
  const key = privateFile(keyFile, root).trim();
  output = path.resolve(output);
  if (!output.startsWith(root + path.sep) || fs.existsSync(output) || fs.realpathSync(path.dirname(output)) !== root) throw Error("Use a fresh private receipt directory");
  const previewReady = await new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port: 9190, path: "/local-auth/action", timeout: 3000,
      headers: { Host: "playcrownlands.com", "X-Crownlands-Client-IP": "127.0.0.1" } }, response => {
      let text = ""; response.on("data", chunk => { text += chunk; if (text.length > 20000) request.destroy(Error("Response limit")); });
      response.on("end", () => resolve(response.statusCode === 200 && text.includes("live Firebase password is unchanged")));
      response.on("error", reject);
    }); request.on("timeout", () => request.destroy(Error("Timeout"))); request.on("error", reject);
  });
  if (!previewReady) throw Error("Install and verify the private account-action route first");
  fs.mkdirSync(output, { mode: 0o700 });
  const store = new Store({ schema: config.schema });
  try {
    const auth = new AuthService({ store, hashConfig: config.hashConfig, rateKey: Buffer.from(config.rateKey, "base64url") });
    await auth.initialize({ createTables: false });
    const sender = new ResendRehearsalSender({ apiKey: key, allowedRecipients: [email] });
    const receipt = await sendOwnerResetTest({ store, auth, dispatcher: new AuthMailDispatcher({ store, sender }), expectedEmail: email, expiresAt: config.expiresAt });
    receipt.commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    fs.writeFileSync(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log("One private-copy password-reset email was accepted by Resend. Confirm receipt and complete it on the Crownlands computer; no live Firebase password was changed.");
  } finally { await store.close(); }
}
if (require.main === module) main(process.argv.slice(2)).catch(() => {
  console.error("Private account email test stopped. Preserve its receipt directory/outbox and inspect before retrying; sensitive diagnostics suppressed."); process.exitCode = 1;
});
module.exports = { sendOwnerResetTest };
