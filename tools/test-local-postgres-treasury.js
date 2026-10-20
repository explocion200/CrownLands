"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_treasury_" + crypto.randomBytes(4).toString("hex");
const game = require("../functions/index");
const db = require("../functions/platform").store;
const { Access } = require("../local-backend/access");
let identity = {};
const auth = actor => ({ uid: actor.uid, token: { email_verified: true, firebase: { sign_in_provider: "google.com" } } });
async function call(name, actor, data = {}) {
  return game[name]({ auth: auth(actor), data: { ...data, clientReleaseId: identity.releaseId,
    clientWorldId: identity.worldId, clientResetGeneration: identity.resetGeneration, clientRealmShardId: identity.realmShardId } });
}
async function privateAccess(owner, outsider, paths) {
  await db.runTransaction(async transaction => {
    for (const actor of [owner, outsider]) {
      const access = new Access({ store: db, transaction, auth: auth(actor) });
      await access.initialize();
      for (const path of paths) {
        const before = (await transaction.get(db.doc(path))).data();
        assert.equal(await access.canRead(path, before), false);
        assert.equal(await access.canRead(path, before, "list"), false);
        assert.equal(await access.canWrite(path, before, { ...before, donatedToday: 0 }), false);
        assert.equal(await access.canWrite(path, null, { donatedToday: 0 }), false);
      }
    }
  });
}
(async () => {
  try {
    await db.initialize();
    await require("../functions/test/treasury-donation-scenarios")({ db, call,
      createActor: async () => ({ uid: "treasury-" + crypto.randomBytes(5).toString("hex") }),
      setIdentity: value => { identity = value; }, privateAccess });
    console.log("Local Treasury allowance PostgreSQL checks passed.");
  } finally { await db.pool.query("DROP SCHEMA IF EXISTS " + db.schema + " CASCADE"); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
