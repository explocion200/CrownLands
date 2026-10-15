"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const { JWT } = require("google-auth-library");
const { Store } = require("./store");
const { createGoogleProvider } = require("../functions/chat-translation");

const PROJECT = "crown-land-b15e0";
const ACCOUNT = `crownlands-local-translation@${PROJECT}.iam.gserviceaccount.com`;
const MAX_CHARACTERS = 1000;
const SCOPE_FIELDS = ["version", "projectId", "clientEmail", "schema", "ownerUid", "reservationId", "month", "characterLimit", "expiresAt"];
function unavailable() { throw Error("Private translation is unavailable."); }

function validateScope(value, now = Date.now()) {
  if (!value || Object.keys(value).sort().join() !== [...SCOPE_FIELDS].sort().join()
    || value.version !== 1 || value.projectId !== PROJECT || value.clientEmail !== ACCOUNT
    || !/^migration_game_(?:preview|translate)_[a-f0-9]{12}$/.test(value.schema || "")
    || typeof value.ownerUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.ownerUid)
    || !/^[a-f0-9]{32}$/.test(value.reservationId || "")
    || !Number.isSafeInteger(value.characterLimit) || value.characterLimit < 1 || value.characterLimit > MAX_CHARACTERS
    || value.month !== new Date(now).toISOString().slice(0, 7)
    || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))
    || Date.parse(value.expiresAt) <= now || Date.parse(value.expiresAt) > now + 7 * 86400000
    || new Date(Date.parse(value.expiresAt) - 1).toISOString().slice(0, 7) !== value.month) unavailable();
  return Object.freeze(Object.fromEntries(SCOPE_FIELDS.map(key => [key, value[key]])));
}
function reservationPath(scope) { return `localTranslationReservations/${scope.reservationId}`; }
function matchesScope(receipt, scope) { return receipt && SCOPE_FIELDS.every(key => receipt[key] === scope[key]); }

function readConfiguration(filename) {
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.mode & 0o077 || stat.size > 16384) unavailable();
    const value = JSON.parse(fs.readFileSync(fd, "utf8"));
    if (!value || Object.keys(value).sort().join() !== "scope,serviceAccount") unavailable();
    return value;
  } finally { fs.closeSync(fd); }
}

// The source project's allowance must be reserved by an operator BEFORE this
// receipt is created. Runtime never creates/reset receipts or contacts Firestore.
function createReservedGoogleProvider({ store, scope: input, serviceAccount, now = Date.now, fetchImpl = fetch, JWTClass = JWT }) {
  const scope = validateScope(input, now());
  if (!(store instanceof Store) || store.schema !== scope.schema
    || serviceAccount?.type !== "service_account" || serviceAccount.project_id !== PROJECT
    || serviceAccount.client_email !== ACCOUNT || serviceAccount.token_uri !== "https://oauth2.googleapis.com/token"
    || typeof serviceAccount.private_key !== "string" || serviceAccount.private_key.length > 8192
    || !/^[a-f0-9]{40}$/.test(serviceAccount.private_key_id || "")) unavailable();
  const key = crypto.createPrivateKey(serviceAccount.private_key);
  if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 2048) unavailable();
  const controller = new AbortController();
  let active = 0;
  const stop = () => { controller.abort(); clearTimeout(expiryTimer); };
  const expiryTimer = setTimeout(stop, Date.parse(scope.expiresAt) - now()); expiryTimer.unref();
  const assertActive = () => {
    if (controller.signal.aborted || now() >= Date.parse(scope.expiresAt)
      || new Date(now()).toISOString().slice(0, 7) !== scope.month) unavailable();
  };
  const jwt = new JWTClass({ email: ACCOUNT, key: serviceAccount.private_key, keyId: serviceAccount.private_key_id,
    scopes: ["https://www.googleapis.com/auth/cloud-translation"] });
  const transport = jwt.transporter;
  // Pin token exchange, disable automatic retries/redirects and bound both
  // token and provider I/O. No operator/backup credentials or ADC fallback.
  jwt.transporter = { request: options => {
    assertActive();
    if (String(options.url) !== "https://oauth2.googleapis.com/token" || options.method !== "POST") unavailable();
    return transport.request({ ...options, timeout: 8000, retry: false, retryConfig: { retry: 0 }, maxRedirects: 0,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
  } };
  const credential = { getAccessToken: async () => {
    assertActive();
    const result = await jwt.getAccessToken(); assertActive();
    if (typeof result.token !== "string" || !result.token) unavailable();
    return { access_token: result.token };
  } };
  const parent = `https://translation.googleapis.com/v3/projects/${PROJECT}/locations/global`;
  const checkReceipt = receipt => {
    if (!matchesScope(receipt, scope) || !Number.isSafeInteger(receipt.usedCharacters) || receipt.usedCharacters < 0
      || receipt.usedCharacters > scope.characterLimit) unavailable();
    return receipt;
  };
  const verifyReservation = async () => {
    assertActive(); const receipt = checkReceipt((await store.doc(reservationPath(scope)).get()).data()); assertActive();
    return { usedCharacters: receipt.usedCharacters, characterLimit: scope.characterLimit };
  };
  const google = createGoogleProvider({ projectId: PROJECT, credential, fetchImpl: async (url, options) => {
    assertActive();
    if (![parent + ":detectLanguage", parent + ":translateText"].includes(url) || options.method !== "POST") unavailable();
    const response = await fetchImpl(url, { ...options, redirect: "error", signal: AbortSignal.any([controller.signal, options.signal]) });
    assertActive(); return response;
  } });
  const provider = async (contents, targetLanguage, operation = "translate") => {
    try {
      assertActive();
      if (!Array.isArray(contents) || !contents.length || contents.length > 20
        || contents.some(text => typeof text !== "string" || !text.trim() || Array.from(text).length > 250)
        || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(targetLanguage || "")
        || !["detect", "translate"].includes(operation) || active >= 2) unavailable();
      active++;
      try {
        const characters = contents.reduce((total, text) => total + Array.from(text).length, 0);
        const ref = store.doc(reservationPath(scope));
        await store.runTransaction(async tx => {
          assertActive(); const receipt = checkReceipt((await tx.get(ref)).data()); assertActive();
          if (receipt.usedCharacters + characters > scope.characterLimit) unavailable();
          tx.update(ref, { usedCharacters: receipt.usedCharacters + characters });
        });
        // A stop during a database wait must never start provider I/O. An
        // uncertain provider response retains its durable reservation.
        assertActive(); const result = await google(contents, targetLanguage, operation); assertActive(); return result;
      } finally { active--; }
    } catch (_) { unavailable(); }
  };
  Object.defineProperties(provider, { scope: { value: scope }, stop: { value: stop }, verifyReservation: { value: verifyReservation } });
  return provider;
}

module.exports = { PROJECT, ACCOUNT, MAX_CHARACTERS, SCOPE_FIELDS, validateScope, reservationPath, matchesScope, readConfiguration, createReservedGoogleProvider };
