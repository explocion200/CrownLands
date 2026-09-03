"use strict";

const crypto = require("node:crypto");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const towers = require("../holding-towers.js");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");
if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function donateInTransaction(stateRef, operationId, currentRawBaseGoldPerHour, amount, donationDayUtc) {
  try {
    return await db.runTransaction(async transaction => {
      const receiptRef = stateRef.collection("receipts").doc(operationId);
      const [stateSnap, receiptSnap] = await Promise.all([
        transaction.get(stateRef),
        transaction.get(receiptRef),
      ]);
      if (receiptSnap.exists) return { ...receiptSnap.data(), duplicate: true };
      const state = stateSnap.data() || {};
      const result = towers.applyTreasuryDonation({
        usage: state.usage || {},
        currentRawBaseGoldPerHour,
        donationDayUtc,
        amount,
        personalGold: state.personalGold,
        treasury: state.treasury || {},
      });
      transaction.set(stateRef, {
        usage: result.usage,
        personalGold: result.personalGold,
        treasury: result.treasury,
      });
      transaction.create(receiptRef, {
        operationId,
        amount,
        rawGoldPerHourSnapshot: result.usage.rawGoldPerHourSnapshot,
      });
      return { ok: true, ...result };
    });
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function main() {
  const nonce = crypto.randomBytes(6).toString("hex");
  const donationDayUtc = "2026-08-22";

  // Simultaneous first donations must establish one snapshot and cannot double-spend Gold.
  const firstStateRef = db.doc(`towerDonationConcurrency/${nonce}_first`);
  await firstStateRef.set({
    usage: {},
    personalGold: 150_000,
    treasury: { balance: 0, totalDonated: 0, totalSpent: 0 },
  });
  const firstRace = await Promise.all([
    donateInTransaction(firstStateRef, "first-20k", 20_000, 100_000, donationDayUtc),
    donateInTransaction(firstStateRef, "first-30k", 30_000, 100_000, donationDayUtc),
  ]);
  assert(firstRace.filter(result => result.ok).length === 1, "Simultaneous first donations did not produce one valid Gold spend.");
  const firstState = (await firstStateRef.get()).data() || {};
  assert([20_000, 30_000].includes(firstState.usage?.rawGoldPerHourSnapshot), "The first donation race stored an invalid snapshot.");
  assert(
    firstState.usage?.dailyDonationCap === firstState.usage?.rawGoldPerHourSnapshot * 12,
    "The first donation race stored a cap inconsistent with its snapshot."
  );
  assert(firstState.usage?.donatedToday === 100_000, "The first donation race double-counted daily usage.");
  assert(firstState.personalGold === 50_000, "The first donation race double-spent personal Gold.");
  assert(firstState.treasury?.balance === 100_000, "The first donation race double-credited the Treasury.");

  // Concurrent retries with the same operation ID must return one receipt-backed result.
  const retryStateRef = db.doc(`towerDonationConcurrency/${nonce}_retry`);
  await retryStateRef.set({
    usage: {},
    personalGold: 500_000,
    treasury: { balance: 0, totalDonated: 0, totalSpent: 0 },
  });
  const retryRace = await Promise.all([
    donateInTransaction(retryStateRef, "same-operation", 20_000, 50_000, donationDayUtc),
    donateInTransaction(retryStateRef, "same-operation", 20_000, 50_000, donationDayUtc),
  ]);
  assert(retryRace.every(result => result.ok !== false), "An idempotent donation retry failed unexpectedly.");
  assert(retryRace.filter(result => result.duplicate).length === 1, "The idempotent race did not reuse exactly one receipt.");
  const retryState = (await retryStateRef.get()).data() || {};
  assert(retryState.usage?.donatedToday === 50_000, "The idempotent race double-counted daily usage.");
  assert(retryState.personalGold === 450_000, "The idempotent race double-spent personal Gold.");
  assert(retryState.treasury?.balance === 50_000, "The idempotent race double-credited Treasury Gold.");

  // An allowance race at the daily boundary must allow only one transaction.
  const allowanceStateRef = db.doc(`towerDonationConcurrency/${nonce}_allowance`);
  await allowanceStateRef.set({
    usage: {
      donationDayUtc,
      rawGoldPerHourSnapshot: 20_000,
      dailyDonationCap: 240_000,
      donatedToday: 230_000,
    },
    personalGold: 100_000,
    treasury: { balance: 0, totalDonated: 0, totalSpent: 0 },
  });
  const allowanceRace = await Promise.all([
    donateInTransaction(allowanceStateRef, "cap-a", 90_000, 10_000, donationDayUtc),
    donateInTransaction(allowanceStateRef, "cap-b", 5_000, 10_000, donationDayUtc),
  ]);
  assert(allowanceRace.filter(result => result.ok).length === 1, "The allowance race exceeded the locked daily cap.");
  const allowanceState = (await allowanceStateRef.get()).data() || {};
  assert(allowanceState.usage?.rawGoldPerHourSnapshot === 20_000, "The allowance race changed the locked snapshot.");
  assert(allowanceState.usage?.donatedToday === 240_000, "The allowance race exceeded or under-counted the daily cap.");
  assert(allowanceState.personalGold === 90_000, "The allowance race deducted personal Gold more than once.");
  assert(allowanceState.treasury?.balance === 10_000, "The allowance race credited Treasury Gold more than once.");

  console.log("Emulator Holding Tower donation concurrency passed: simultaneous first donations, idempotent retries, allowance race, and Gold race remain atomic.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
