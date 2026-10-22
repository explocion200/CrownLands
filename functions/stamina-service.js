"use strict";
const M = require("./marauder-rules");

function createStaminaService({ db, HttpsError, runTransaction, assertCurrentPlayerProfile, cosmeticService,
  clock = Date.now, readAvailability = async () => true }) {
  const recoveryPolicyRef = db.doc("staminaPolicy/recovery-stop-v2");
  const stateRef = uid => db.doc(`players/${uid}/stamina/state`);
  const receiptRef = (uid, id) => db.doc(`players/${uid}/staminaReceipts/${id}`);
  function translate(action) {
    try { return action(); } catch (error) { throw new HttpsError(error.code || "internal", error.message); }
  }
  async function read(transaction, uid, now) {
    const ref = stateRef(uid), snap = await transaction.get(ref);
    const raw = snap.exists ? snap.data() : null;
    const policy = raw?.version === 1 ? (await transaction.get(recoveryPolicyRef)).data() : null;
    const state = translate(() => M.stamina(raw, now, policy?.version === M.STAMINA_VERSION ? policy.stoppedAtMs : undefined));
    return { ref, exists: snap.exists, migrated: raw?.version === 1, state };
  }
  function response(account, wallet, now, receipt = null, replayed = false) {
    const state = M.view(account, now), utcDay = M.day(now), price = M.refillPrice(state.value);
    return { state, crowns: wallet.crowns, walletRevision: wallet.revision, receipt, replayed,
      offer: { version: M.REFILL_VERSION, price, stamina: state.value, staminaRevision: state.revision,
        walletRevision: wallet.revision, utcDay },
      unavailable: state.value === M.MAX_STAMINA ? "Stamina full" : state.paidRefillsToday ? "Refill used today"
        : wallet.crowns < price ? "Not enough Crowns" : "" };
  }
  async function load(uid) {
    return runTransaction(async transaction => {
      const now = clock();
      const [account, wallet, profile, enabled] = await Promise.all([read(transaction, uid, now), cosmeticService.read(transaction, uid), transaction.get(db.doc(`players/${uid}`)), readAvailability(transaction)]);
      if (!profile.exists) throw new HttpsError("failed-precondition", "Load your kingdom first.");
      assertCurrentPlayerProfile(profile.data());
      if (!account.exists) transaction.create(account.ref, account.state);
      else if (account.migrated) transaction.set(account.ref, account.state);
      return { ...response(account.state, wallet.state, now), huntingEnabled: enabled };
    });
  }
  async function purchase(uid, request) {
    const id = request.requestId;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{8,96}$/.test(id)) throw new HttpsError("invalid-argument", "A valid refill request ID is required.");
    const offer = request.offer || {};
    const signature = JSON.stringify([offer.version, offer.price, offer.stamina, offer.staminaRevision, offer.walletRevision, offer.utcDay]);
    return runTransaction(async transaction => {
      const now = clock(), receipt = receiptRef(uid, id);
      const [saved, account, wallet, profile, enabled] = await Promise.all([transaction.get(receipt), read(transaction, uid, now), cosmeticService.read(transaction, uid), transaction.get(db.doc(`players/${uid}`)), readAvailability(transaction)]);
      if (!profile.exists) throw new HttpsError("failed-precondition", "Load your kingdom first.");
      assertCurrentPlayerProfile(profile.data());
      if (saved.exists) {
        if (saved.data().signature !== signature) throw new HttpsError("invalid-argument", "This request ID already belongs to another refill.");
        return response(account.state, wallet.state, now, saved.data(), true);
      }
      if (!enabled) throw new HttpsError("failed-precondition", "Hunting is not available in this realm yet.");
      const price = M.refillPrice(account.state.value);
      if (offer.version !== M.REFILL_VERSION || offer.price !== price || offer.utcDay !== M.day(now)
        || offer.stamina !== account.state.value || offer.staminaRevision !== account.state.revision
        || offer.walletRevision !== wallet.state.revision) throw new HttpsError("failed-precondition", "Your refill offer changed. Review the updated values before buying.");
      const preview = response(account.state, wallet.state, now);
      if (preview.unavailable) throw new HttpsError("failed-precondition", preview.unavailable);
      const next = { ...account.state, value: M.MAX_STAMINA, recoveredAtMs: now,
        revision: account.state.revision + 1, paidDay: M.day(now) };
      const nextWallet = { ...wallet.state, crowns: wallet.state.crowns - price, revision: wallet.state.revision + 1 };
      const record = { requestId: id, signature, version: M.REFILL_VERSION, purchasedAtMs: now, utcDay: M.day(now),
        price, restored: M.MAX_STAMINA - account.state.value,
        staminaBefore: account.state.value, staminaAfter: M.MAX_STAMINA, crownsBefore: wallet.state.crowns, crownsAfter: nextWallet.crowns };
      transaction.set(wallet.ref, nextWallet);
      transaction.set(account.ref, next);
      transaction.create(receipt, record);
      return response(next, nextWallet, now, record);
    });
  }
  // Read every participant before any writes. The caller writes these prepared
  // changes only with its successful departure/settlement transaction.
  async function prepareChange(transaction, uids, delta, now) {
    const unique = [...new Set(uids)];
    const accounts = await Promise.all(unique.map(uid => read(transaction, uid, now)));
    return accounts.map((account, i) => ({ uid: unique[i], ref: account.ref,
      state: translate(() => M.changeStamina(account.state, delta, now)) }));
  }
  function writeChanges(transaction, changes) { changes.forEach(entry => transaction.set(entry.ref, entry.state)); }
  return { stateRef, receiptRef, read, load, purchase, prepareChange, writeChanges };
}
module.exports = { createStaminaService };
