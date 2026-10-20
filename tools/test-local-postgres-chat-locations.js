"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_locations_" + crypto.randomBytes(4).toString("hex");
const game = require("../functions/index"), db = require("../functions/platform").store;
let identity = {};
async function call(name, actor, data = {}) {
  return game[name]({ auth: { uid: actor.uid, token: { email_verified: true, firebase: { sign_in_provider: "google.com" } } },
    data: { ...data, clientReleaseId: identity.releaseId, clientWorldId: identity.worldId,
      clientResetGeneration: identity.resetGeneration, clientRealmShardId: identity.realmShardId } });
}
(async () => {
  try {
    await db.initialize();
    await require("../functions/test/chat-location-scenarios")({ db, call,
      createActor: async () => ({ uid: "location-" + crypto.randomBytes(5).toString("hex") }), setIdentity: value => { identity = value; } });
  } finally { await db.pool.query("DROP SCHEMA IF EXISTS " + db.schema + " CASCADE"); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
