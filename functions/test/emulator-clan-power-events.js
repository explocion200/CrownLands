"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {randomUUID} = require("node:crypto");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("The Firestore emulator is required.");
initializeApp({projectId: process.env.GCLOUD_PROJECT || "crown-land-b15e0"});
const db = getFirestore(), suffix = randomUUID();
const identity = {resetGeneration: `audit-${suffix}`, worldId: `audit-world-${suffix}`};
const clanId = `power-${suffix}`, members = [`a-${suffix}`, `b-${suffix}`];
const source = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");
const start = source.indexOf("exports.rebuildClanPowerOnPlayerStats =");
const end = source.indexOf("exports.createClanRally =", start);
assert(start >= 0 && end > start);
const context = vm.createContext({
  exports: {}, db, FieldValue, RESET_GENERATION: identity.resetGeneration, ONLINE_WORLD_ID: identity.worldId,
  safeString: value => String(value || ""), safeNumber: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  onDocumentWritten: (_options, handler) => handler, withDocumentRealmShard: handler => handler,
  runTransactionWithInfrastructureRetry: callback => db.runTransaction(callback),
  playerGlobalStatsRef: uid => db.doc(`players/${uid}/stats/global`),
  leaderboardEntryRef: uid => db.doc(`auditLeaderboards/${identity.resetGeneration}/entries/${uid}`),
  clanIdentityPatch: id => ({clanId: id}),
  writeClanLeaderboard: (tx, id, clan, patch) => tx.set(db.doc(`auditClanLeaderboards/${id}`), {...clan, ...patch}),
});
vm.runInContext(source.slice(start, end), context);
const handler = context.exports.rebuildClanPowerOnPlayerStats;
const snapshot = power => ({exists: true, data: () => ({...identity, kingPower: power})});
const event = (uid, before, after) => ({params: {uid}, data: {before: snapshot(before), after: snapshot(after)}});
(async () => {
  await db.doc(`clans/${clanId}`).set({...identity, totalKingPower: 1000});
  for (const [index, uid] of members.entries()) {
    await db.doc(`players/${uid}`).set({...identity, clanId});
    await db.doc(`players/${uid}/stats/global`).set({...identity, kingPower: 200 * (index + 1)});
    await db.doc(`clans/${clanId}/members/${uid}`).set({...identity, kingPower: 0, status: "active"});
  }
  await Promise.all(members.flatMap(uid => [handler(event(uid, 0, 100)), handler(event(uid, 100, 200)), handler(event(uid, 0, 100))]));
  const clanRef = db.doc(`clans/${clanId}`);
  assert.equal((await clanRef.get()).data().totalKingPower, 1600, "Concurrent members and duplicate events retain the exact aggregate");
  const before = await clanRef.get();
  await handler(event(members[0], 0, 100));
  assert((await clanRef.get()).updateTime.isEqual(before.updateTime), "Delayed events do not rewrite an already-current clan");
  await db.doc(`players/${members[0]}/stats/global`).update({kingPower: 50});
  await handler(event(members[0], 200, 50));
  await handler(event(members[0], 0, 100));
  assert.equal((await clanRef.get()).data().totalKingPower, 1450, "A legitimate decrease survives delayed historical events");
  assert.equal((await db.doc(`auditClanLeaderboards/${clanId}`).get()).data().totalKingPower, 1450);
  await db.doc(`players/${members[0]}`).update({clanId: ""});
  await handler(event(members[0], 50, 100));
  assert.equal((await clanRef.get()).data().totalKingPower, 1450, "An event cannot act using old profile membership");
  await db.doc(`players/${members[1]}/stats/global`).update({resetGeneration: "archived", kingPower: 9000});
  await handler(event(members[1], 400, 9000));
  assert.equal((await clanRef.get()).data().totalKingPower, 1450, "Cross-generation stats cannot enter the active aggregate");
  console.log("Clan power events passed against Firestore: concurrent updates, duplicates, delayed events, decreases, membership changes and generation isolation.");
})().catch(error => {console.error(error); process.exitCode = 1;});
