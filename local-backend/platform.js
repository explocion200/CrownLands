"use strict";
const storage = require("./store");
const ROUTE = Symbol("crownlands-local-handler");
class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.name = "HttpsError"; this.code = code; this.details = details; }
}
function unavailable() { throw new HttpsError("failed-precondition", "This external integration is disabled in the isolated migration rehearsal."); }
function registration(kind) {
  return (options, handler) => {
    if (typeof options === "function") { handler = options; options = {}; }
    if (!options || typeof options !== "object" || typeof handler !== "function") throw Error("Invalid local handler registration");
    const registered = (...args) => handler(...args);
    Object.defineProperty(registered, ROUTE, { value: Object.freeze({ kind, options: Object.freeze({ ...options }), handler }) });
    return registered;
  };
}
function createPlatform({ store }) {
  if (!(store instanceof storage.Store) || !/^migration_game_[a-z0-9_]{1,30}$/.test(store.schema)) throw Error("Game runtime requires a separate migration_game_* rehearsal schema");
  return Object.freeze({
    ...storage, HttpsError, backend: "postgres-rehearsal", store,
    admin: Object.freeze({ initializeApp: () => {} }),
    getFirestore: () => store,
    getApp: () => ({ options: { credential: { getAccessToken: unavailable } } }),
    getMessaging: () => ({ send: unavailable, sendEach: unavailable, sendEachForMulticast: unavailable }),
    defineSecret: name => {
      if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(name)) throw Error("Invalid secret declaration");
      return Object.freeze({ value: unavailable });
    },
    onCall: registration("callable"), onRequest: registration("http"), onSchedule: registration("schedule"),
    onDocumentCreated: registration("created"), onDocumentWritten: registration("written"),
  });
}
function describe(exports) {
  return Object.entries(exports).map(([name, value]) => {
    const route = value?.[ROUTE];
    if (!route || !/^[A-Za-z][A-Za-z0-9]{1,100}$/.test(name)) throw Error("Unexpected game export; migration inventory must be reviewed");
    return { name, ...route };
  });
}
function fromEnvironment() {
  const schema = process.env.CROWNLANDS_REHEARSAL_SCHEMA;
  if (process.env.CROWNLANDS_BACKEND !== "postgres-rehearsal" || !/^migration_game_[a-z0-9_]{1,30}$/.test(schema || "")) throw Error("An isolated game schema must be selected explicitly");
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR) throw Error("Do not mix PostgreSQL rehearsal and Firebase emulator runtimes");
  return createPlatform({ store: new storage.Store({ schema }) });
}
module.exports = { createPlatform, fromEnvironment, describe, HttpsError };
