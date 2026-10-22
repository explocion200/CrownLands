"use strict";
const assert = require("node:assert/strict"), { randomBytes } = require("node:crypto");
(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  const { Store } = require("../local-backend/store");
  const { createPlatform } = require("../local-backend/platform");
  const routing = require("../local-backend/world/routing").createCommandRouting({ enabled: true });
  const db = new Store({ schema: "migration_game_worldtest_" + randomBytes(6).toString("hex") });
  const platformPath = require.resolve("../functions/platform");
  require.cache[platformPath] = { id: platformPath, filename: platformPath, loaded: true,
    exports: createPlatform({ store: db, privateWorldRouting: routing }) };
  const game = require("../functions");
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
    await require("../functions/test/member-rally-cases")({ db, call,
      actor: async label => ({ uid: `member_${randomBytes(5).toString("hex")}`, label }) });
  } finally { await routing.close(); await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
