"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, execFileSync, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Store } = require("../../local-backend/store");
const { createProviderRehearsal } = require("../../local-backend/payment-provider-rehearsal");
const { orderIdFor } = require("../../functions/crown-payments");
const EVENTS = "checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired";

function readPrivate(filename) {
  const root = path.join(os.homedir(), ".local/share/crownlands"), file = fs.realpathSync(filename), stat = fs.statSync(file);
  if (!file.startsWith(root + path.sep) || !stat.isFile() || stat.mode & 0o077 || stat.size > 65536) throw Error("Private local input required");
  return fs.readFileSync(file, "utf8");
}
function listen(cli, env, port, expectedSecret) {
  const process = spawn(cli, ["listen", "--skip-update", "--events-from", "@self", "--events", EVENTS,
    "--forward-to", `http://127.0.0.1:${port}/api/local-payments/stripe/test`, "--headers", "Host:playcrownlands.com"], { env, stdio: ["ignore", "pipe", "pipe"] });
  // Do not print or retain CLI output: its banner contains the signing secret,
  // and subsequent output can contain unrelated test payment identifiers.
  const ready = new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(() => { process.kill("SIGTERM"); reject(Error("Stripe test listener did not become ready")); }, 20000);
    const data = bytes => {
      text = (text + bytes.toString()).slice(-8192);
      const found = text.match(/whsec_[A-Za-z0-9]+/);
      if (!found) return;
      clearTimeout(timer); text = "";
      if (found[0] !== expectedSecret) { process.kill("SIGTERM"); reject(Error("Stripe listener signing secret changed")); }
      else resolve();
    };
    process.stdout.on("data", data); process.stderr.on("data", data);
    process.once("error", () => { clearTimeout(timer); reject(Error("Stripe listener could not start")); });
    process.once("exit", () => { clearTimeout(timer); reject(Error("Stripe listener stopped")); });
  });
  return { process, ready };
}

async function main([authBundle, keyFile, output]) {
  const repo = path.resolve(__dirname, "../.."), root = path.join(os.homedir(), ".local/share/crownlands");
  if (process.versions.node.split(".")[0] !== "22" || execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim()) throw Error("Commit and validate the provider rehearsal first");
  const config = JSON.parse(readPrivate(path.join(authBundle, "config.json"))), key = readPrivate(keyFile).trim();
  if (!/^migration_auth_preview_[a-f0-9]{12}$/.test(config.schema) || Date.parse(config.expiresAt) < Date.now() + 3600000
    || !/^sk_test_[A-Za-z0-9]{8,200}$/.test(key)) throw Error("An unexpired owner preview and test key are required");
  output = path.resolve(output);
  if (fs.existsSync(output) || fs.realpathSync(path.dirname(output)) !== root) throw Error("Fresh private output directory required");
  const cli = path.join(os.homedir(), ".local/bin/stripe"), env = { ...process.env, STRIPE_API_KEY: key,
    STRIPE_DEVICE_NAME: "Crownlands local migration test", STRIPE_NO_AUTO_UPDATE: "1" };
  const secretOutput = await promisify(execFile)(cli, ["listen", "--skip-update", "--print-secret", "--events-from", "@self", "--events", EVENTS], { env, timeout: 20000, maxBuffer: 16384 });
  const secret = secretOutput.stdout.match(/whsec_[A-Za-z0-9]+/)?.[0];
  if (!secret) throw Error("Stripe test signing secret unavailable");
  const auth = new Store({ schema: config.schema }), source = new Store({ schema: "migration_20261015" });
  let store, runtime, forwarder, interval, deadline, stopping, checkout;
  const receipt = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), startedAt: new Date().toISOString(), mode: "test", publicEndpointChanged: false };
  const save = () => { fs.writeFileSync(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 }); };
  function stop(failed = false) {
    if (failed) process.exitCode = 1;
    if (stopping) return stopping;
    clearInterval(interval); clearTimeout(deadline); runtime?.stop(); forwarder?.process.kill("SIGTERM");
    setTimeout(() => process.exit(1), 15000).unref();
    stopping = (async () => {
      try {
        if (!checkout && store && receipt.orderId) checkout = (await store.doc("crownPaymentTestOrders/" + receipt.orderId).get()).data();
        if (receipt.orderId && !checkout?.sessionId) receipt.cleanupNeedsReview = true;
        if (runtime && checkout?.sessionId) await runtime.expireSession(checkout.sessionId);
        if (runtime) await new Promise(resolve => { runtime.server.close(resolve); runtime.server.closeIdleConnections(); });
      } catch { receipt.cleanupNeedsReview = true; process.exitCode = 1; }
      finally {
        receipt.stoppedAt = new Date().toISOString(); if (fs.existsSync(output)) save();
        await Promise.allSettled([store?.close(), auth.close(), source.close()]);
      }
    })();
    return stopping;
  }
  try {
    const owners = (await auth.pool.query(`SELECT uid FROM ${config.schema}.accounts`)).rows;
    const ownerUid = owners.length === 1 ? owners[0].uid : null;
    const catalog = (await source.doc("serverConfig/crownPayments").get()).data();
    if (!ownerUid || catalog?.enabled !== true || catalog.mode !== "test" || !catalog.testerUids?.includes(ownerUid) || catalog.packs?.length !== 1) throw Error("The existing approved tester and pack are required");
    const pack = catalog.packs[0];
    if (pack.id !== "crowns_1000" || pack.crowns !== 1000 || pack.amountMinor !== 499 || pack.currency !== "usd") throw Error("Approved test pack changed");
    fs.mkdirSync(output, { mode: 0o700 });
    const schema = "migration_game_paytest_" + crypto.randomBytes(6).toString("hex"); store = new Store({ schema });
    receipt.schema = schema; receipt.ownerUid = ownerUid; save();
    if ((await store.pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema])).rowCount) throw Error("Existing payment test schema preserved");
    await store.initialize();
    await store.doc("serverConfig/crownPayments").set({ ...catalog, testerUids: [ownerUid] });
    const profile = (await source.doc("players/" + ownerUid).get()).data();
    if (!profile) throw Error("Copied player profile required");
    await store.doc("players/" + ownerUid).set(profile);
    const profileBefore = JSON.stringify((await store.doc("players/" + ownerUid).get()).data());
    runtime = createProviderRehearsal({ store, apiKey: key, webhookSecret: secret, marker: crypto.randomBytes(16).toString("hex"), ownerUid,
      expiresAt: new Date(Date.now() + 1800000).toISOString() });
    await runtime.verifyProvider();
    await new Promise((resolve, reject) => { runtime.server.once("error", reject); runtime.server.listen(0, "127.0.0.1", resolve); });
    forwarder = listen(cli, env, runtime.server.address().port, secret); await forwarder.ready;
    forwarder.process.once("exit", () => { if (!stopping) void stop(true); });
    process.once("SIGTERM", () => { void stop(); }); process.once("SIGINT", () => { void stop(); });
    receipt.requestId = "migration-" + crypto.randomBytes(16).toString("hex"); receipt.orderId = orderIdFor(ownerUid, receipt.requestId); save();
    const result = await runtime.create(ownerUid, { requestId: receipt.requestId, packId: pack.id,
      expectedCrowns: pack.crowns, expectedAmountMinor: pack.amountMinor, expectedCurrency: pack.currency });
    checkout = (await store.doc("crownPaymentTestOrders/" + result.order.orderId).get()).data();
    receipt.orderId = result.order.orderId; receipt.checkoutUrl = result.url; receipt.sessionId = checkout.sessionId; receipt.stage = "awaiting-test-checkout"; save();
    console.log("Stripe test checkout prepared; private receipt saved. No live keys, live payment routes or playable wallet writes are enabled.");
    let checking = false;
    interval = setInterval(async () => {
      if (checking || stopping) return; checking = true;
      try {
        const order = (await store.doc("crownPaymentTestOrders/" + receipt.orderId).get()).data();
        if (order.status !== "confirmed") return;
        const wallet = () => store.doc(`players/${ownerUid}/crownPaymentSandbox/state`).get();
        if ((await wallet()).data()?.crowns !== 1000 || runtime.counts().reconciledEvents < 1) throw Error("Automatic test receipt missing");
        receipt.automaticWebhookFulfillment = true;
        await Promise.all([runtime.status(ownerUid, receipt.orderId), runtime.status(ownerUid, receipt.orderId), runtime.status(ownerUid, receipt.orderId)]);
        if ((await wallet()).data()?.crowns !== 1000 || JSON.stringify((await store.doc("players/" + ownerUid).get()).data()) !== profileBefore) throw Error("Test wallet replay or profile preservation failed");
        Object.assign(receipt, { stage: "provider-webhook-verified", completedAt: new Date().toISOString(), testCrowns: 1000, playableProfileUnchanged: true,
          repeatedStatusNoDuplicate: true, providerEvents: runtime.counts() }); save();
        console.log("Real Stripe test webhook confirmed exactly 1,000 test Crowns locally. Repeated status checks added none; copied playable profile unchanged.");
        await stop();
      } catch { console.error("Private Stripe test verification stopped; sensitive details suppressed."); await stop(true); }
      finally { checking = false; }
    }, 2000);
    deadline = setTimeout(() => { void stop(); }, 1800000);
  } catch (error) { await stop(true); throw error; }
}
if (require.main === module) main(process.argv.slice(2)).catch(() => { console.error("Private Stripe rehearsal stopped; preserve receipts for inspection. No sensitive diagnostics were logged."); process.exitCode = 1; });
module.exports = { readPrivate, listen };
