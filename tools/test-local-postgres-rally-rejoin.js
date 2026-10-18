"use strict";
const assert = require("node:assert/strict"), { randomBytes } = require("node:crypto");
(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_rejoin_" + randomBytes(4).toString("hex");
  const game = require("../functions"), db = require("../functions/platform").store;
  try {
    await db.initialize();
    const seasons = require("../functions/season-rewards");
    const prior = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
    await seasons.arm(db, prior, seasons.seasonInfo(prior).startsAtMs + 1);
    let identity = {};
    const call = async (name, user, data = {}) => {
      const result = await game[name]({ auth: { uid: user.uid, token: { email_verified: true,
        firebase: { sign_in_provider: "google.com" } } }, data: { ...identity, ...data } });
      if (name === "getRealmInfo") identity = { clientReleaseId: result.currentReleaseId, clientWorldId: result.worldId,
        clientResetGeneration: result.resetGeneration, clientRealmShardId: result.sharedRealmId };
      return result;
    };
    await require("../functions/test/rally-recall-rejoin-cases")({ db, call,
      actor: async label => ({ uid: `recall_${randomBytes(5).toString("hex")}`, label }) });
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
