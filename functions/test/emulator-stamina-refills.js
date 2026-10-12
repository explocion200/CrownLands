"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app"), { getFirestore } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { createStaminaService } = require("../stamina-service"), { createCosmeticsService } = require("../cosmetics-service");
const M = require("../marauder-rules"), C = require("../cosmetics");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Emulator only");
initializeApp({ projectId: process.env.GCLOUD_PROJECT || "crown-land-b15e0" });
const db = getFirestore();
const uid = `stamina_${crypto.randomBytes(10).toString("hex")}`;
let now = Date.UTC(2026, 9, 12, 12), enabled = true;
const assertCurrentPlayerProfile = profile => { if (profile.resetGeneration !== "test-current") throw new HttpsError("failed-precondition", "Stale account"); };
const wallet = createCosmeticsService({ db, HttpsError, runTransaction: action => db.runTransaction(action), assertCurrentPlayerProfile });
const stamina = createStaminaService({ db, HttpsError, runTransaction: action => db.runTransaction(action), assertCurrentPlayerProfile,
  cosmeticService: wallet, clock: () => now, readAvailability: async () => enabled });
const profileRef = db.doc(`players/${uid}`), stateRef = stamina.stateRef(uid), walletRef = wallet.stateRef(uid);
let sequence = 0;
const request = offer => ({ requestId: `refill_test_${++sequence}`, offer });
async function seed(value, crowns, paidDay = "") {
  await Promise.all([stateRef.set({ version: 1, value, recoveredAtMs: now, revision: sequence, paidDay }),
    walletRef.set(C.normalize({ crowns, revision: sequence }))]);
}
async function snapshot() { return { state: (await stateRef.get()).data(), wallet: (await walletRef.get()).data() }; }
async function main() {
  await profileRef.set({ resetGeneration: "test-current", character: { level: 1 } });
  const initialized = await stamina.load(uid);
  assert.equal(initialized.state.value, 100);
  for (const value of [0, 70, 99, 100]) for (const crowns of [29, 30, 120]) {
    await seed(value, crowns);
    const offer = (await stamina.load(uid)).offer, purchase = request(offer), before = await snapshot();
    if (value === 100 || crowns < 30) {
      await assert.rejects(stamina.purchase(uid, purchase), /full|Crowns/);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await stamina.receiptRef(uid, purchase.requestId).get()).exists, false);
    } else {
      const result = await stamina.purchase(uid, purchase);
      assert.equal(result.state.value, 100); assert.equal(result.crowns, crowns - 30);
      assert.equal(result.receipt.restored, 100 - value); assert.equal(result.state.paidRefillsToday, 1);
      const committed = await snapshot();
      const replay = await stamina.purchase(uid, purchase); // Response lost; identical retry.
      assert.equal(replay.replayed, true); assert.deepEqual(await snapshot(), committed);
      await assert.rejects(stamina.purchase(uid, { ...purchase, offer: { ...offer, price: 1 } }), /another refill/);
    }
  }
  await seed(70, 120);
  const concurrent = request((await stamina.load(uid)).offer);
  const duplicates = await Promise.all([stamina.purchase(uid, concurrent), stamina.purchase(uid, concurrent)]);
  assert.equal(duplicates.filter(result => !result.replayed).length, 1);
  assert.equal((await snapshot()).wallet.crowns, 90);
  await seed(0, 120);
  const quote = (await stamina.load(uid)).offer;
  const race = await Promise.allSettled([stamina.purchase(uid, request(quote)), stamina.purchase(uid, request(quote))]);
  assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await snapshot()).wallet.crowns, 90);
  await db.runTransaction(async transaction => { const changes = await stamina.prepareChange(transaction, [uid], -10, now); stamina.writeChanges(transaction, changes); });
  await assert.rejects(stamina.purchase(uid, request((await stamina.load(uid)).offer)), /used today/);
  // Parent replacement models map/season profile initialization; private state survives.
  await profileRef.set({ resetGeneration: "test-current", newSeason: true });
  assert.equal((await stamina.load(uid)).state.paidRefillsToday, 1);
  now = Date.UTC(2026, 9, 13) - 1;
  await seed(0, 120, "2026-10-12");
  const oldDayOffer = (await stamina.load(uid)).offer;
  now++;
  const beforeRollover = await snapshot();
  await assert.rejects(stamina.purchase(uid, request(oldDayOffer)), /offer changed/);
  assert.deepEqual(await snapshot(), beforeRollover);
  assert.equal((await stamina.purchase(uid, request((await stamina.load(uid)).offer))).crowns, 90);
  // Regeneration, spending, and wallet changes all invalidate reviewed values.
  for (const mutate of [
    async () => { now += M.RECOVERY_MS; },
    async () => db.runTransaction(async transaction => { const changes = await stamina.prepareChange(transaction, [uid], -10, now); stamina.writeChanges(transaction, changes); }),
    async () => walletRef.update({ crowns: 119, revision: sequence + 1 }),
  ]) {
    await seed(70, 120); const offer = (await stamina.load(uid)).offer;
    await mutate(); const before = await snapshot();
    await assert.rejects(stamina.purchase(uid, request(offer)), /offer changed/);
    assert.deepEqual(await snapshot(), before);
  }
  // A cosmetic purchase races a refill against the same playable wallet.
  await seed(0, 620);
  const cosmeticRace = await Promise.allSettled([
    stamina.purchase(uid, request((await stamina.load(uid)).offer)),
    wallet.purchase(uid, { requestId: `skin_race_${sequence}`, offerId: "templar_city", catalogVersion: 1, expectedPrice: 600 }, now),
  ]);
  assert.equal(cosmeticRace.filter(result => result.status === "fulfilled").length, 1);
  assert([20, 590].includes((await snapshot()).wallet.crowns));
  // Use the real Crown pickup reducer; the live-payment suite also races its verified credit service against a refill.
  for (const credit of [1]) {
    await seed(70, 120); const offer = (await stamina.load(uid)).offer;
    const results = await Promise.allSettled([stamina.purchase(uid, request(offer)), db.runTransaction(async transaction => {
      const account = await wallet.read(transaction, uid);
      transaction.set(account.ref, C.collectCrown(account.state, now));
    })]);
    assert.equal(results[1].status, "fulfilled");
    assert.equal((await snapshot()).wallet.crowns, 120 + credit - (results[0].status === "fulfilled" ? 30 : 0));
  }
  await seed(70, 120);
  const huntRace = await Promise.allSettled([stamina.purchase(uid, request((await stamina.load(uid)).offer)), db.runTransaction(async transaction => {
    const changes = await stamina.prepareChange(transaction, [uid], -10, now); stamina.writeChanges(transaction, changes);
  })]);
  assert.equal(huntRace[1].status, "fulfilled");
  const afterHunt = await snapshot();
  assert.equal(afterHunt.state.value, huntRace[0].status === "fulfilled" ? 90 : 60);
  assert.equal(afterHunt.wallet.crowns, huntRace[0].status === "fulfilled" ? 90 : 120);
  await seed(99, 120, M.day(now));
  await db.runTransaction(async transaction => { const changes = await stamina.prepareChange(transaction, [uid], 10, now); stamina.writeChanges(transaction, changes); });
  assert.equal((await snapshot()).state.value, 100);
  assert.equal((await snapshot()).state.paidDay, M.day(now));
  await seed(70, 120); const disabledRequest = request((await stamina.load(uid)).offer); enabled = false;
  const beforeDisabled = await snapshot(); await assert.rejects(stamina.purchase(uid, disabledRequest), /not available/);
  assert.deepEqual(await snapshot(), beforeDisabled);
  console.log("Stamina refill transactions passed: values, wallets, UTC rollover, retries, resets, concurrency and refunds.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
