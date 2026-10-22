"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_locations_" + crypto.randomBytes(4).toString("hex");
const game = require("../functions/index"), db = require("../functions/platform").store;
let identity = {}, resolveRetryChecked = false;
async function call(name, actor, data = {}) {
  const request = { auth: { uid: actor.uid, token: { email_verified: true, firebase: { sign_in_provider: "google.com" } } },
    data: { ...data, clientReleaseId: identity.releaseId, clientWorldId: identity.worldId,
      clientResetGeneration: identity.resetGeneration, clientRealmShardId: identity.realmShardId } };
  if (name === "sendChatMessage" && data.action === "resolveLocation" && !resolveRetryChecked) {
    resolveRetryChecked = true;
    const original = db.runTransaction;
    let result;
    for (const code of ["permission-denied", "aborted"]) {
      let attempts = 0;
      db.runTransaction = function (operation, options) {
        attempts++;
        assert.equal(options?.readOnly, true, "Location lookup must remain read-only");
        if (attempts === 1) throw Object.assign(new Error("Synthetic location transaction failure"), { code });
        return original.call(this, operation, options);
      };
      try {
        if (code === "permission-denied") {
          await assert.rejects(game[name](request), { code });
          assert.equal(attempts, 1, "Authorization failures must not retry");
        } else {
          result = await game[name](request);
          assert.equal(attempts, 2, "Transient location failure must retry through the actual callable");
          assert.equal(result.status, "available");
        }
      } finally { db.runTransaction = original; }
    }
    console.log("Location lookup recovered from a transient failure without retrying authorization failures.");
    return result;
  }
  return game[name](request);
}
(async () => {
  try {
    await db.initialize();
    await require("../functions/test/chat-location-scenarios")({ db, call,
      createActor: async () => ({ uid: "location-" + crypto.randomBytes(5).toString("hex") }), setIdentity: value => { identity = value; } });
    assert(resolveRetryChecked, "The actual location retry path was not exercised");
  } finally { await db.pool.query("DROP SCHEMA IF EXISTS " + db.schema + " CASCADE"); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
