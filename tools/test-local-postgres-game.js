"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { createRequire } = require("node:module");
const { Store, DocumentSnapshot } = require("../local-backend/store");
const { createPlatform, describe } = require("../local-backend/platform");
const { JobQueue } = require("../local-backend/jobs");
const { privateWorkerRoutes } = require("../local-backend/worker-loop");
const requireFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));

(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST, "Test needs a clean backend selection");
  const defaultPlatform = require("../functions/platform");
  for (const [file, names] of [
    ["firebase-functions/v2/https", ["onCall", "onRequest", "HttpsError"]],
    ["firebase-functions/v2/firestore", ["onDocumentCreated", "onDocumentWritten"]],
    ["firebase-functions/v2/scheduler", ["onSchedule"]],
    ["firebase-admin/firestore", ["getFirestore", "FieldValue", "FieldPath", "Filter", "Timestamp"]],
  ]) for (const name of names) assert.equal(defaultPlatform[name], requireFunctions(file)[name], "Default Firebase adapter changed " + name);
  assert.equal(defaultPlatform.admin, requireFunctions("firebase-admin"));
  assert.throws(() => createPlatform({ store: new Store({ schema: "migration_retained" }) }), /separate/);
  delete require.cache[require.resolve("../functions/platform")];
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_test_" + crypto.randomBytes(5).toString("hex");
  const originalNow = Date.now; Date.now = () => Date.parse("2026-10-15T12:00:00Z");
  const game = require("../functions"), platform = require("../functions/platform"), db = platform.store;
  const routes = describe(game), counts = {};
  for (const route of routes) counts[route.kind] = (counts[route.kind] || 0) + 1;
  assert.deepEqual(counts, { callable: 122, created: 8, written: 2, schedule: 16, http: 3 });
  const privateRoutes = privateWorkerRoutes(routes);
  assert.equal(privateRoutes.length, 25); assert(!privateRoutes.some(route => route.name === "deliverIncomingArmyNotification"));
  const queue = new JobQueue({ store: db, routes });
  try {
    await db.initialize(); await queue.initialize();
    assert.throws(() => platform.defineSecret("STRIPE_CROWNS_LIVE_SECRET_KEY").value(), { code: "failed-precondition" });
    assert.throws(() => platform.getMessaging().send({}), { code: "failed-precondition" });
    assert.throws(() => platform.getApp().options.credential.getAccessToken(), { code: "failed-precondition" });
    await assert.rejects(game.getRealmInfo({ data: {} }), { code: "unauthenticated" });
    await assert.rejects(game.getRealmInfo({ auth: { uid: "fixture-owner", token: { email_verified: false, firebase: { sign_in_provider: "password" } } }, data: {} }), { code: "permission-denied" });
    const auth = { uid: "fixture-owner", token: { email_verified: true, firebase: { sign_in_provider: "google.com" } } };
    const R = require("../functions/season-rewards"), season = R.seasonInfo("realm-2026-09");
    const priorScope = { resetGeneration: season.seasonId, worldId: season.worldId, realmShardId: season.realmShardId };
    await db.doc("players/season-owner").set({ ...priorScope, mainCityId: "fixture-city", gear: { commonGearBoxes: 2, uncommonGearBoxes: 3 } });
    await R.arm(db, season.seasonId, season.startsAtMs + 1);
    for (const [uid, power] of [["season-owner", 500], ["z-last", 100], ["a-first", 100]]) {
      await db.runTransaction(tx => R.guardTransaction(db, tx, buffer => {
        R.prefetchTransaction(buffer, season.seasonId);
        buffer.set(db.doc(`leaderboards/${season.boardId}/entries/${uid}`), { ...priorScope, uid, kingPower: power });
      }, priorScope, () => season.startsAtMs + 2));
    }
    const realm = await game.getRealmInfo({ auth, data: {} });
    assert.equal(realm.ok, true); assert.equal(realm.worldTopology, "core-expansion-v1");
    assert.equal(realm.realmShardId, "shard_0001");
    assert.equal((await db.doc("realmConfig/current").get()).data().worldId, realm.worldId);
    await assert.rejects(game.getCommonGearStatus({ auth, data: { clientReleaseId: "stale-release" } }), { code: "failed-precondition" });
    // The unchanged real PvP trigger runs through the PostgreSQL outbox, then a
    // duplicate delivery exercises its existing atomic award receipt.
    const scope = { worldId: realm.worldId, resetGeneration: realm.resetGeneration, realmShardId: realm.realmShardId };
    const boardId = scope.resetGeneration + "--" + scope.realmShardId;
    const eventRef = db.doc(`pvpKillEvents/${boardId}/events/fixture-battle`);
    await eventRef.set({ ...scope, version: 1, battleId: "fixture-battle", occurredAtMs: Date.now(), credits: [{ uid: "fixture-owner", kills: 17 }] });
    while (await queue.dispatchChanges(1000)) { /* drain the synthetic world initialization */ }
    let job;
    for (let i = 0; i < 10; i++) {
      job = await queue.claim(); assert(job);
      if (job.handler === "applyPvpKillEvent") break;
      await db.withTransactionGuard(queue.guard(job), async () => game[job.handler](await queue.event(job)));
      await queue.finish(job);
    }
    assert.equal(job.handler, "applyPvpKillEvent");
    const event = await queue.event(job);
    await db.withTransactionGuard(queue.guard(job), () => game.applyPvpKillEvent(event)); await queue.finish(job);
    await Promise.all([game.applyPvpKillEvent(event), game.applyPvpKillEvent(event)]);
    assert.equal((await db.doc(`pvpLeaderboards/${boardId}/entries/fixture-owner`).get()).data().pvpKills, 17);
    // Exercise the real previous-season freeze/publish/claim service on a
    // synthetic season: deterministic ranks and one reward under concurrency.
    await Promise.all([R.capture(db, season.seasonId, season.endsAtMs), R.capture(db, season.seasonId, season.endsAtMs)]);
    assert.deepEqual((await db.doc(`seasonResults/${season.seasonId}/boards/players`).get()).data().entries.map(row => row.id), ["season-owner", "a-first", "z-last"]);
    await assert.rejects(db.runTransaction(tx => R.guardTransaction(db, tx, buffer => buffer.update(db.doc(`leaderboards/${season.boardId}/entries/season-owner`), { kingPower: 99999 }), priorScope, () => season.endsAtMs + 1)), /closed/);
    await Promise.all([R.finalize(db, season.seasonId), R.finalize(db, season.seasonId)]);
    const award = (await R.awardRef(db, "season-owner", season.seasonId).get()).data();
    await db.doc("players/season-owner").update(scope);
    const claims = await Promise.all(Array.from({ length: 6 }, () => R.claim(db, "season-owner", season.seasonId, crypto.randomUUID())));
    assert.equal(claims.filter(claim => !claim.replayed).length, 1);
    assert.equal((await db.doc("players/season-owner").get()).data().gear.commonGearBoxes, 2 + award.commonGearBoxes);
    assert.equal((await db.doc("players/season-owner").get()).data().gear.uncommonGearBoxes, 3 + award.uncommonGearBoxes);
    assert(event.data instanceof DocumentSnapshot);
    console.log("Local game: all 151 exports registered; Firebase default preserved; local auth/release gates, current realm, real PvP trigger replay and concurrent season awards passed.");
  } finally { Date.now = originalNow; await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error("Local game integration failed:", error.message); process.exitCode = 1; });
