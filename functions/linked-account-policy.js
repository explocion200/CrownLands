"use strict";

const { createHash, createHmac } = require("node:crypto");
const { isIP } = require("node:net");
const WINDOW_MS = 30 * 86_400_000;
const AUDIT_MS = 90 * 86_400_000;
const ROOT = "realmSecurity/global";
const hash = value => createHash("sha256").update(String(value)).digest("hex");
const accountPath = uid => `${ROOT}/networkAccounts/${hash(uid)}`;
const pairId = (a, b) => a && b && a !== b ? hash([a, b].sort().join("\n")) : "";
const confirmedPath = (a, b) => `${ROOT}/confirmedPairs/${pairId(a, b)}`;

function normalizeIp(value) {
  let address = String(value || "").trim();
  if (address.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6 || address.includes("%")) return "";
  address = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(address);
  if (!mapped) return address;
  const words = mapped.slice(1).map(word => parseInt(word, 16));
  return [words[0] >> 8, words[0] & 255, words[1] >> 8, words[1] & 255].join(".");
}

// The verified suffix length includes the actual source address. Never trust
// Express's trust-all request.ip or a caller-controlled forwarded prefix.
function ingressIp(rawRequest, config = {}) {
  if (config.verified !== true || !Number.isInteger(config.suffixLength)
      || config.suffixLength < 1 || config.suffixLength > 8) return "";
  const header = rawRequest?.headers?.["x-forwarded-for"];
  if (typeof header !== "string" || header.length > 8192) return "";
  const entries = header.split(",");
  if (entries.length < config.suffixLength) return "";
  return normalizeIp(entries[entries.length - config.suffixLength]);
}

function fingerprint(ip, secret) {
  const normalized = normalizeIp(ip);
  if (!normalized || typeof secret !== "string" || secret.length < 32) throw new Error("Network verification unavailable.");
  return createHmac("sha256", secret).update(`linked-account-ip-v1\n${normalized}`).digest("hex");
}

function evaluate({ a, b, confirmed = {}, sharedInstallationUntilMs = 0, left = [], right = [], nowMs = Date.now() }) {
  if (!a || !b || a === b) return { restriction: null, signals: [] };
  const signals = [];
  let expiresAtMs = 0;
  if (confirmed.active === true && Array.isArray(confirmed.pairUids) && confirmed.pairUids.length === 2
      && pairId(...confirmed.pairUids) === pairId(a, b)) {
    signals.push("administrator-confirmed");
    expiresAtMs = null;
  }
  if (sharedInstallationUntilMs > nowMs) {
    signals.push("shared-installation");
    if (expiresAtMs !== null) expiresAtMs = sharedInstallationUntilMs;
  }
  const rightByHash = new Map(right.map(entry => [entry.fingerprint, entry.lastSeenAtMs]));
  for (const entry of left) {
    if (!entry.fingerprint || !rightByHash.has(entry.fingerprint)) continue;
    const sharedUntil = Math.min(Number(entry.lastSeenAtMs), Number(rightByHash.get(entry.fingerprint))) + WINDOW_MS;
    if (sharedUntil > nowMs) {
      if (!signals.includes("shared-ip")) signals.push("shared-ip");
      if (expiresAtMs !== null) expiresAtMs = Math.max(expiresAtMs, sharedUntil);
    }
  }
  return {
    restriction: signals.length ? { blocked: true, reason: "linked_account_capture", expiresAtMs } : null,
    signals,
  };
}

function createService({ db, secret, unavailable = () => new Error("Network verification unavailable.") }) {
  async function observe(uid, rawRequest, nowMs = Date.now()) {
    const config = (await db.doc(`${ROOT}/configuration/ipIngress`).get()).data() || {};
    if (config.enabled !== true) return; // Enable only after the ingress verification receipt is reviewed.
    const ip = ingressIp(rawRequest, config);
    if (!ip) throw unavailable();
    let key;
    try { key = fingerprint(ip, secret()); } catch { throw unavailable(); }
    const stateRef = db.doc(accountPath(uid));
    const observationRef = stateRef.collection("networkObservations").doc(key);
    await db.runTransaction(async transaction => {
      const [state, observation] = await Promise.all([transaction.get(stateRef), transaction.get(observationRef)]);
      const lastSeenAtMs = Math.max(nowMs, observation.data()?.lastSeenAtMs || 0);
      transaction.set(stateRef, { revision: (state.data()?.revision || 0) + 1,
        lastSeenAtMs: Math.max(lastSeenAtMs, state.data()?.lastSeenAtMs || 0) }, { merge: true });
      transaction.set(observationRef, { fingerprint: key, lastSeenAtMs, expiresAtMs: lastSeenAtMs + WINDOW_MS });
    });
  }
  async function read(transaction, a, b, sharedInstallationUntilMs, nowMs) {
    if (!pairId(a, b)) return { restriction: null, signals: [] };
    // These guards serialize a new observation with a simultaneous capture,
    // including a fingerprint document that did not exist at the initial read.
    await Promise.all([transaction.get(db.doc(accountPath(a))), transaction.get(db.doc(accountPath(b)))]);
    const [confirmed, left, right] = await Promise.all([
      transaction.get(db.doc(confirmedPath(a, b))),
      transaction.get(db.collection(`${accountPath(a)}/networkObservations`).where("lastSeenAtMs", ">", nowMs - WINDOW_MS)),
      transaction.get(db.collection(`${accountPath(b)}/networkObservations`).where("lastSeenAtMs", ">", nowMs - WINDOW_MS)),
    ]);
    return evaluate({ a, b, confirmed: confirmed.data(), sharedInstallationUntilMs,
      left: left.docs.map(doc => doc.data()), right: right.docs.map(doc => doc.data()), nowMs });
  }
  function audit(transaction, { armyId, attackerUid, defenderUid, targetKey, decision, nowMs, worldId, resetGeneration }) {
    transaction.set(db.doc(`${ROOT}/captureAudit/${hash(`${resetGeneration}\n${armyId}`)}`), {
      armyId, attackerUid, defenderUid, targetKey, worldId, resetGeneration,
      restriction: decision.restriction, signals: decision.signals,
      occurredAtMs: nowMs, expiresAtMs: nowMs + AUDIT_MS, outcome: "capture-prevented",
    });
  }
  async function cleanup(nowMs) {
    const pages = await Promise.all([
      db.collectionGroup("networkObservations").where("expiresAtMs", "<=", nowMs).limit(400).get(),
      db.collection(`${ROOT}/captureAudit`).where("expiresAtMs", "<=", nowMs).limit(400).get(),
      db.collection(`${ROOT}/networkAccounts`).where("lastSeenAtMs", "<=", nowMs - WINDOW_MS).limit(400).get(),
    ]);
    const docs = pages.flatMap(page => page.docs);
    for (let start = 0; start < docs.length; start += 400) {
      const batch = db.batch();
      for (const doc of docs.slice(start, start + 400)) batch.delete(doc.ref, { lastUpdateTime: doc.updateTime });
      await batch.commit(); // A concurrent refresh fails the precondition; fresh evidence is never deleted.
    }
    return { deleted: docs.length };
  }
  return { observe, read, audit, cleanup };
}

module.exports = { WINDOW_MS, AUDIT_MS, ROOT, hash, pairId, accountPath, confirmedPath, normalizeIp, ingressIp, fingerprint, evaluate, createService };
