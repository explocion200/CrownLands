"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { createStaminaService } = require("../stamina-service"), { createCosmeticsService } = require("../cosmetics-service");
const M = require("../marauder-rules"), C = require("../cosmetics");
module.exports = async function staminaRefillCases({ db, HttpsError }) {
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
  for (const [value, price] of [[0, 30], [66, 30], [67, 30], [70, 30], [99, 30], [100, 0]]) for (const crowns of new Set([0, Math.max(0, price - 1), price, price + 1, 29, 30, 120])) {
    await seed(value, crowns);
    const offer = (await stamina.load(uid)).offer, purchase = request(offer), before = await snapshot();
    assert.equal(offer.price, price); assert.equal(offer.version, M.REFILL_VERSION);
    if (value === 100 || crowns < price) {
      await assert.rejects(stamina.purchase(uid, purchase), /full|Crowns/);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await stamina.receiptRef(uid, purchase.requestId).get()).exists, false);
    } else {
      const result = await stamina.purchase(uid, purchase);
      assert.equal(result.state.value, 100); assert.equal(result.crowns, crowns - price);
      assert.equal(result.receipt.price, price); assert.equal(result.receipt.crownsBefore - result.receipt.crownsAfter, price);
      assert.equal(result.receipt.restored, 100 - value); assert.equal(result.state.paidRefillsToday, 1);
      const committed = await snapshot();
      const replay = await stamina.purchase(uid, purchase); // Response lost; identical retry.
      assert.equal(replay.replayed, true); assert.deepEqual(await snapshot(), committed);
      await assert.rejects(stamina.purchase(uid, { ...purchase, offer: { ...offer, price: price + 1 } }), /another refill/);
    }
  }
  await seed(70, 120);
  const concurrent = request((await stamina.load(uid)).offer);
  const duplicates = await Promise.all([stamina.purchase(uid, concurrent), stamina.purchase(uid, concurrent)]);
  assert.equal(duplicates.filter(result => !result.replayed).length, 1);
  assert.equal((await snapshot()).wallet.crowns, 90);
  // Previously committed flat and proportional purchases replay without another refill.
  for (const [version, price] of [[1,30],[2,9]]) {
  await seed(90, 120-price, M.day(now));
  const legacyOffer = { version, price, stamina: 70, staminaRevision: 0, walletRevision: 0, utcDay: M.day(now) };
  const legacyRequest = request(legacyOffer);
  const legacyReceipt = { requestId: legacyRequest.requestId, version, price, restored: 30,
    purchasedAtMs: now, utcDay: M.day(now), staminaBefore: 70, staminaAfter: 100, crownsBefore: 120, crownsAfter: 120-price,
    signature: JSON.stringify([version, price, 70, 0, 0, M.day(now)]) };
  await stamina.receiptRef(uid, legacyRequest.requestId).set(legacyReceipt);
  const legacyBefore = await snapshot(), legacyReplay = await stamina.purchase(uid, legacyRequest);
  assert.equal(legacyReplay.replayed, true); assert.deepEqual(legacyReplay.receipt, legacyReceipt);
  assert.deepEqual(await snapshot(), legacyBefore);
  }
  // Reject old proportional/flat-price quotes and forged prices without charging or consuming the day.
  for (const patch of [{ version: 1, price: 30 }, { version: 2, price: 9 }, { price: 9 }, { price: 8 }, { price: 0 }, { price: -1 }, { price: 9.1 }]) {
    await seed(70, 120); const offer = { ...(await stamina.load(uid)).offer, ...patch };
    const before = await snapshot(), purchase = request(offer);
    await assert.rejects(stamina.purchase(uid, purchase), /offer changed/);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await stamina.receiptRef(uid, purchase.requestId).get()).exists, false);
  }
  // Time, including offline days, never restores stamina. Old timestamps remain readable.
  await seed(66, 120); const initialState = await snapshot();
  for (const elapsed of [12 * 60000, 86400000, 31 * 86400000]) {
    now += elapsed;
    const loaded = await stamina.load(uid);
    assert.equal(loaded.state.value, 66); assert.equal(loaded.offer.price, 30);
    assert.equal(loaded.state.nextPointAtMs, null); assert.equal(loaded.state.fullAtMs, null);
    assert.deepEqual(await snapshot(), initialState);
  }
  const restored = await stamina.purchase(uid, request((await stamina.load(uid)).offer));
  assert.equal(restored.receipt.restored, 34); assert.equal(restored.crowns, 90);
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
  assert.equal((await stamina.load(uid)).state.value, 90);
  now = Date.UTC(2026, 9, 13) - 1;
  await seed(0, 120, "2026-10-12");
  const oldDayOffer = (await stamina.load(uid)).offer;
  now++;
  const beforeRollover = await snapshot();
  assert.equal((await stamina.load(uid)).state.value, 0, "Midnight only renews purchase allowance");
  await assert.rejects(stamina.purchase(uid, request(oldDayOffer)), /offer changed/);
  assert.deepEqual(await snapshot(), beforeRollover);
  assert.equal((await stamina.purchase(uid, request((await stamina.load(uid)).offer))).crowns, 90);
  // Spending and wallet changes invalidate reviewed values.
  for (const mutate of [
    async () => db.runTransaction(async transaction => { const changes = await stamina.prepareChange(transaction, [uid], -10, now); stamina.writeChanges(transaction, changes); }),
    async () => walletRef.update({ crowns: 119, revision: sequence + 1 }),
  ]) {
    await seed(70, 120); const offer = (await stamina.load(uid)).offer;
    await mutate(); const before = await snapshot();
    await assert.rejects(stamina.purchase(uid, request(offer)), /offer changed/);
    assert.deepEqual(await snapshot(), before);
  }
  // A cosmetic purchase races a refill against the same playable wallet.
  for (const [value, crowns, price] of [[0, 620, 30], [70, 620, 30]]) {
    await seed(value, crowns);
    const cosmeticRace = await Promise.allSettled([
      stamina.purchase(uid, request((await stamina.load(uid)).offer)),
      wallet.purchase(uid, { requestId: `skin_race_${sequence}`, offerId: "templar_city", catalogVersion: 1, expectedPrice: 600 }, now),
    ]);
    assert.equal(cosmeticRace.filter(result => result.status === "fulfilled").length, 1);
    assert([crowns - 600, crowns - price].includes((await snapshot()).wallet.crowns));
  }
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
  const beforeRefund = await snapshot();
  await assert.rejects(db.runTransaction(async transaction => { const changes = await stamina.prepareChange(transaction, [uid], 10, now); stamina.writeChanges(transaction, changes); }), /30-Crown refill/);
  assert.deepEqual(await snapshot(), beforeRefund);
  assert.equal((await snapshot()).state.paidDay, M.day(now));
  await seed(70, 120); const disabledRequest = request((await stamina.load(uid)).offer); enabled = false;
  const beforeDisabled = await snapshot(); await assert.rejects(stamina.purchase(uid, disabledRequest), /not available/);
  assert.deepEqual(await snapshot(), beforeDisabled);
  console.log("Stamina refill transactions passed: values, wallets, UTC rollover, retries, resets, concurrency and rejected non-purchase restoration.");
}
await main();
};
