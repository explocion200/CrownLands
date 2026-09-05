"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const realm = require("../release-config.json");
const { createTravelFixture, canonicalCity } = require("../../tools/world-travel-test-fixtures.js");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("This test requires the Firestore emulator.");
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore();
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
let functionsHost;
let identity = { releaseId: realm.releaseId, resetGeneration: realm.resetGeneration, worldId: realm.worldId, realmShardId: "legacy" };
const fixture = createTravelFixture(26);

async function user(label) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `travel-${label}-${randomUUID()}@example.test`, password: "Travel-Emulator-Only-123!", returnSecureToken: true }),
  });
  const body = await response.json();
  assert(response.ok, "Emulator auth signup failed.");
  return { uid: body.localId, token: body.idToken, label };
}

async function call(name, actor, data = {}) {
  if (!functionsHost) {
    const hub = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB || "127.0.0.1:4400"}/emulators`).then(response => response.json());
    functionsHost = `${hub.functions.host}:${hub.functions.port}`;
  }
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST", headers: { authorization: `Bearer ${actor.token}`, "content-type": "application/json" },
    body: JSON.stringify({ data: { ...data, clientReleaseId: identity.releaseId, clientResetGeneration: identity.resetGeneration,
      clientWorldId: identity.worldId, clientRealmShardId: identity.realmShardId } }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name}: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

function cityRef(city) {
  return db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${city.regionId}/cities/${city.id}`);
}

async function own(city, actor, troops = 1_000) {
  await cityRef(city).set({ ...city, ...identity, ownerKind: "player", owner: "player", ownerUid: actor.uid,
    ownerName: actor.label, troops, troopFloat: troops, isMainCity: false, productionUpdatedAtMs: Date.now() + 3_600_000 }, { merge: true });
}

async function neutral(city) {
  await cityRef(city).set({ ...city, ...identity, ownerKind: "neutral", owner: "neutral", ownerUid: "", ownerName: "Neutral",
    kind: "city", isStronghold: false, isMainCity: false, level: 1, troops: 100, troopFloat: 100,
    productionUpdatedAtMs: Date.now() + 3_600_000 }, { merge: true });
}

async function main() {
 const actor = await user("Release QA");
 const info = await call("getRealmInfo", actor);
 identity = { releaseId: info.currentReleaseId, worldId: info.worldId, resetGeneration: info.resetGeneration, realmShardId: info.sharedRealmId };
 const claim = await call("claimStartingCity", actor, { playerName: actor.label });
 const other = await user("Other reward holder");
 const otherClaim = await call("claimStartingCity", other, { playerName: other.label });
 await db.doc(`realmGenerations/${identity.resetGeneration}/expansion/current`).set({
   activeRegionIds: fixture.activeRegionIds, admittingRegionIds: fixture.activeRegionIds,
   nextActivationOrdinal: fixture.activeRegionIds.length }, {merge:true});
 // Materialize the full currently active production topology in this isolated
 // emulator so the transaction also covers the observed 51-map pool size.
 for (let i = 0; i < fixture.descriptors.length; i += 4) {
   await Promise.all(fixture.descriptors.slice(i,i+4).map(region => call("ensureMainIsland", actor, {regionId:region.id})));
 }
 const mainIds = new Set([claim.cityId, otherClaim.cityId]);
 const candidates = Array.from({length:30}, (_,i) => canonicalCity(fixture.planner, fixture.activeRegionIds[0], i + 10))
   .filter(city => !mainIds.has(city.id));
 const source = candidates[0];
 await own(source, actor, 1000);
 await db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`).update({ troops: 0, troopFloat: 0, productionUpdatedAtMs: Date.now() + 3600000 });
 const profileRef = db.doc(`players/${actor.uid}`);
 await profileRef.set({ gold: 1000000, goldFloat: 1000000, economyUpdatedAtMs: Date.now() + 3600000 }, { merge: true });
 const targets = candidates.slice(1,7);
 for (const target of targets) { await neutral(target); await cityRef(target).update({ x: source.x + 50, y: source.y + 50 }); }
 const { extractFunction, clientSource } = require("../../tools/world-travel-test-fixtures");
 const vm = require("node:vm"); const scope = { Promise }; vm.createContext(scope);
 vm.runInContext(extractFunction(clientSource, "createScoutResolutionQueue"), scope);
 const queue = scope.createScoutResolutionQueue();
 const timings = [];
 for (const count of [1,5]) {
   await db.doc(`serverRateLimits/armyLaunch_${actor.uid}`).delete();
   const before = (await profileRef.get()).data();
   const beforeTroops = (await cityRef(source).get()).data().troops;
   const request = { sourceRegionId: source.regionId, sourceCityId: source.id,
     targetCityIds: targets.slice(0,count).map(t => t.id), requestId: "release_" + randomUUID().replaceAll("-", "") };
   const began = performance.now();
   const batch = await call("sendNearbyScouts", actor, request);
   const launchMs = Math.round(performance.now() - began);
   const replay = await call("sendNearbyScouts", actor, request);
   assert.equal(replay.duplicate, true);
   assert.deepEqual(replay.armies.map(a => a.id), batch.armies.map(a => a.id));
   const after = (await profileRef.get()).data();
   const cost = require("../economy-config.json").playerCosts.nearbyScoutGold;
   assert.equal(before.goldFloat - after.goldFloat, cost, "Launch/replay charged twice.");
   assert.equal((await cityRef(source).get()).data().troops, beforeTroops - count);
   for (const army of batch.armies) {
     assert.equal(army.arrivesAtMs - army.launchedAtMs, Math.ceil(army.total * 1000));
   }
   const dueAt = Date.now() - 1;
   await Promise.all(batch.armies.map(a => db.doc(`armies/${a.id}`).update({ arrivesAtMs: dueAt })));
   const started = performance.now(); const delivered = new Map();
   let stop = db.collection(`players/${actor.uid}/serverReports`).onSnapshot(snapshot => {
     for (const doc of snapshot.docs) if (doc.data().createdAtMs >= dueAt && !delivered.has(doc.id)) delivered.set(doc.id, Math.round(performance.now() - started));
   });
   const completed = [];
   await Promise.all(batch.armies.map(a => queue(async () => {
     const result = await call("resolveArmyOrder", actor, { armyId: a.id, routeRegionIds: a.routeRegionIds });
     assert.equal(result.status, "resolved");
     assert.equal(result.reports.length, 1);
     completed.push(Math.round(performance.now() - started));
     assert.equal(result.reports[0].scoutReport.expiresAtMs - result.reports[0].scoutReport.scoutedAtMs, 600000);
   })));
   stop();
   // Reopen the report subscription independently of the map's army listener.
   await new Promise((resolve, reject) => {
     stop = db.collection(`players/${actor.uid}/serverReports`).onSnapshot(snapshot => {
       const current = snapshot.docs.filter(doc => doc.data().createdAtMs >= dueAt);
       if (current.length === count) resolve();
     }, reject);
   }); stop();
   const retry = await call("resolveArmyOrder", actor, { armyId: batch.armies[0].id, routeRegionIds: batch.armies[0].routeRegionIds });
   assert(["resolved", "already-resolved"].includes(retry.status));
   timings.push({ count, launchMs, intendedMs: batch.armies.map(a => Math.ceil(a.total * 1000)), resolutionMs: completed, reportDeliveryMs: [...delivered.values()] });
 }
 console.log("Scout timing (emulator): " + JSON.stringify(timings));

 // Mixed arrival outcomes: a not-yet-due target must not stop a due report.
 await db.doc(`serverRateLimits/armyLaunch_${actor.uid}`).delete();
 const mixed = await call("sendNearbyScouts", actor, { sourceRegionId: source.regionId, sourceCityId: source.id,
   targetCityIds: targets.slice(0,2).map(t => t.id), requestId: "mixed_" + randomUUID().replaceAll("-", "") });
 await db.doc(`armies/${mixed.armies[1].id}`).update({ arrivesAtMs: Date.now() - 1 });
 const mixedResults = await Promise.allSettled(mixed.armies.map(a => queue(() => call("resolveArmyOrder", actor, { armyId: a.id, routeRegionIds: a.routeRegionIds }))));
 assert.equal(mixedResults.filter(r => r.status === "fulfilled").length, 1);
 assert.equal(mixedResults.filter(r => r.status === "rejected").length, 1);


 // Deed selection and empty-pool recovery use the real transaction code with
 // the current topology. All destructive setup below is emulator-only.
 const layout = require("../core-expansion-world-layout.json");
 const deeds = layout.maps.flatMap(map => (map.camps || []).filter(c => c.campType === "deed").map(c => ({ ...c, regionId: map.id })));
 const camp = deeds[0];
 const campRef = db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${camp.regionId}/camps/${camp.id}`);
 async function hold() {
   const now = Date.now(), held = now - 3601000;
   await campRef.set({ ...camp, ...identity, ownerUid: actor.uid, ownerKind: "player", holderUid: actor.uid, holderName: actor.label,
     troops: 100, currentGarrison: 100, alliedReinforcementTroops: 0, heldSinceMs: held, lastCapturedAtMs: held,
     payoutAtMs: now - 1000, payoutPending: true, returnSourceCityId: source.id, returnSourceRegionId: source.regionId,
     activeArmyIds: [], state: "held" }, { merge: true });
 }
 await hold();
 await campRef.update({ payoutAtMs: Date.now() + 60000 });
 const early = await call("resolveRewardCampPayout", actor, { campId: camp.id, regionId: camp.regionId });
 assert.equal(early.status, "not-due");
 await hold();
 const pair = await Promise.all([1,2].map(() => call("resolveRewardCampPayout", actor, { campId: camp.id, regionId: camp.regionId })));
 const paid = pair.filter(r => r.status === "paid");
 assert.equal(paid.length, 1, "Concurrent payout awarded more than one city.");
 const awarded = await db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${paid[0].awardedCity.regionId}/cities/${paid[0].awardedCity.id}`).get();
 assert.equal(awarded.data().ownerUid, actor.uid);
 assert.equal(awarded.data().troops, 0);
 assert.equal(awarded.data().isMainCity, false);
 assert(awarded.data().productionUpdatedAtMs > 0);
 assert(paid[0].globalStats.totalCities >= 3, "Deed city was not counted in ownership/production stats.");
 const allCities = await db.collectionGroup("cities").where("worldId", "==", identity.worldId).get();
 for (let i = 0; i < allCities.docs.length; i += 400) {
   const batch = db.batch();
   allCities.docs.slice(i,i+400).forEach(doc => { if (!doc.data().ownerUid) batch.update(doc.ref, { ownerUid: "unavailable-qa" }); });
   await batch.commit();
 }
 await db.doc(`players/${actor.uid}/objectiveStats/deedCamp`).delete();
 await hold();
 const empty = await call("resolveRewardCampPayout", actor, { campId: camp.id, regionId: camp.regionId });
 assert.equal(empty.status, "no-eligible-city");
 const pending = await db.collection(`rewardCampPayoutReceipts/${identity.resetGeneration}/entries`).where("pendingCity", "==", true).get();
 assert.equal(pending.size, 1, "An earned city was lost when the pool was empty.");
 assert.equal((await db.doc(`players/${actor.uid}/objectiveStats/deedCamp`).get()).data().count, 1);
 assert.equal((await campRef.get()).data().payoutPending, false);
 // A later holder must not receive or cancel the prior holder's reserved city.
 await campRef.update({ holderUid: "later-holder", ownerUid: "later-holder" });
 await neutral(targets[5]);
 async function scheduled(name) {
   const { execFile } = require("node:child_process");
   await new Promise((resolve, reject) => execFile(process.execPath,
     ["-e", `require('./index.js').${name}.run({scheduleTime:new Date().toISOString()}).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})`],
     { cwd: require("node:path").resolve(__dirname, ".."), env: { ...process.env, GCLOUD_PROJECT: projectId }, timeout: 120000, windowsHide: true },
     (error, stdout, stderr) => error ? reject(new Error(stderr || stdout || error.message)) : resolve()));
 }
 await scheduled("resolveDueRewardCampPayouts");
 assert.equal((await pending.docs[0].ref.get()).data().pendingCity, false);
 assert.equal((await cityRef(targets[5]).get()).data().ownerUid, actor.uid);
 await scheduled("resolveDueRewardCampPayouts");
 assert.equal((await cityRef(targets[5]).get()).data().ownerUid, actor.uid);
 assert.equal((await campRef.get()).data().holderUid, "later-holder");

 // Two earned rewards compete for the one remaining eligible city.
 await neutral(targets[4]);
 await db.doc(`players/${actor.uid}/objectiveStats/deedCamp`).delete();
 await hold();
 const secondCamp = deeds[1];
 const secondRef = db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${secondCamp.regionId}/camps/${secondCamp.id}`);
 await secondRef.set({ ...(await campRef.get()).data(), ...secondCamp, holderUid: other.uid, ownerUid: other.uid,
   holderName: other.label }, { merge: true });
 const competing = await Promise.all([
   call("resolveRewardCampPayout", actor, {campId:camp.id,regionId:camp.regionId}),
   call("resolveRewardCampPayout", other, {campId:secondCamp.id,regionId:secondCamp.regionId}),
 ]);
 assert.equal(competing.filter(result => result.status === "paid").length, 1);
 assert.equal(competing.filter(result => result.status === "no-eligible-city").length, 1);
 assert.equal((await cityRef(targets[4]).get()).data().ownerUid, competing.find(result => result.status === "paid").holderUid);

 // Race the pending reward against another ownership transaction (capture).
 await neutral(targets[3]);
 await Promise.all([scheduled("resolveDueRewardCampPayouts"), db.runTransaction(async transaction => {
   const city = await transaction.get(cityRef(targets[3]));
   if (!city.data().ownerUid) transaction.update(city.ref, {ownerUid:"capture-qa"});
 })]);
 const racedOwner = (await cityRef(targets[3]).get()).data().ownerUid;
 const remaining = await db.collection(`rewardCampPayoutReceipts/${identity.resetGeneration}/entries`).where("pendingCity", "==", true).get();
 assert.equal(remaining.size, racedOwner === "capture-qa" ? 1 : 0, "A capture lost ownership or consumed a reward without a city.");

 const clanId = "release_clan_" + randomUUID().replaceAll("-", "");
 await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: actor.uid });
 await db.doc(`clans/${clanId}/members/${actor.uid}`).set({ ...identity, uid: actor.uid, status: "active" });
 await profileRef.set({ clanId }, { merge: true });
 const sent = await call("sendChatMessage", actor, { channel: "clan", text: "Persistent QA history", requestId: "chat_" + randomUUID().replaceAll("-", "") });
 const storedClan = await db.doc(`clans/${clanId}/messages/${sent.messageId}`).get();
 assert(!Object.hasOwn(storedClan.data(), "expiresAt"));
 assert(!Object.hasOwn(storedClan.data(), "expiresAtMs"));
 const storageId = identity.resetGeneration + "--" + identity.realmShardId;
 const expiredRef = db.doc(`globalChat/${storageId}/messages/expired-qa`);
 const freshRef = db.doc(`globalChat/${storageId}/messages/fresh-qa`);
 await expiredRef.set({ ...identity, channel: "global", createdAtMs: Date.now() - 86400001, expiresAtMs: Date.now() + 604800000 });
 await freshRef.set({ ...identity, channel: "global", createdAtMs: Date.now() - 1000 });
 await storedClan.ref.update({ createdAtMs: 1, expiresAtMs: 2 });
 await scheduled("cleanupExpiredChat");
 assert.equal((await expiredRef.get()).exists, false, "Old Global message survived because of its legacy seven-day expiry.");
 assert.equal((await freshRef.get()).exists, true);
 assert.equal((await storedClan.ref.get()).exists, true, "Shared cleanup deleted Clan history.");
 await expiredRef.set({ channel:"global", createdAtMs:Date.now()-86400001 });
 const { execFile } = require("node:child_process");
 const runMigration = () => new Promise((resolve, reject) => execFile(process.execPath,
   ["../tools/admin-migrate-chat-retention.js", "--project", projectId, "--apply"],
   {cwd:require("node:path").resolve(__dirname,".."),env:process.env,windowsHide:true},
   (error, stdout, stderr) => error ? reject(new Error(stderr || stdout)) : resolve(JSON.parse(stdout.trim()))));
 const migrated = await runMigration();
 assert(migrated.expiredGlobalDeleted >= 1);
 assert(migrated.clanExpiryRemoved >= 1);
 const preserved = (await storedClan.ref.get()).data();
 assert.equal(preserved.text, "Persistent QA history");
 assert(!Object.hasOwn(preserved, "expiresAtMs"));
 assert.equal((await expiredRef.get()).exists,false);
 const repeatedMigration = await runMigration();
 assert.equal(repeatedMigration.clanExpiryRemoved,0);
 assert.equal(repeatedMigration.expiredGlobalDeleted,0);
 console.log("Coordinated emulator passed: accepted travel timing, scout delivery/replay/mixed outcomes/reconnect, Deed concurrency and durable empty-pool recovery, Global cleanup and Clan preservation.");
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
