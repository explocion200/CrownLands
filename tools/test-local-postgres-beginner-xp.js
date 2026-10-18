"use strict";
const assert = require("node:assert/strict"), { randomBytes } = require("node:crypto");
(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_beginner_" + randomBytes(4).toString("hex");
  const game = require("../functions"), db = require("../functions/platform").store;
  try {
    await db.initialize();
    const seasons = require("../functions/season-rewards");
    const prior = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
    await seasons.arm(db, prior, seasons.seasonInfo(prior).startsAtMs + 1);
    const actor = { uid: "beginner-xp-fixture" }, auth = { uid: actor.uid, token: { email_verified: true, firebase: { sign_in_provider: "google.com" } } };
    const info = await game.getRealmInfo({ auth, data: {} }); assert.equal(info.worldTopology, "core-expansion-v1");
    const identity = { clientReleaseId: info.currentReleaseId, clientWorldId: info.worldId, clientResetGeneration: info.resetGeneration, clientRealmShardId: info.sharedRealmId };
    await require("../functions/test/beginner-capture-xp-cases")({ db, actor, call: (name, data = {}) => game[name]({ auth, data: { ...identity, ...data } }) });
    const { Access } = require("../local-backend/access"), target = `players/${actor.uid}`;
    const before = (await db.doc(target).get()).data();
    await db.runTransaction(async transaction => {
      const access = await new Access({store:db,transaction,auth,now:Date.now()}).initialize();
      assert.equal(await access.canWrite(target,before,{...before,character:{...before.character,beginnerNpcCaptures:0}}),false,"Client must not reset its bonus counter");
    });
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
