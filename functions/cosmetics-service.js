"use strict";
const C = require("./cosmetics");

function createCosmeticsService({ db, HttpsError, runTransaction, assertCurrentPlayerProfile, normalizeFlag }) {
  const stateRef = uid => db.doc(`players/${uid}/cosmetics/state`);
  const publicRef = uid => db.doc(`playerCosmetics/${uid}`);
  const receiptRef = (uid, id) => db.doc(`players/${uid}/cosmeticReceipts/${id}`);
  function operationId(id) {
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{8,96}$/.test(id)) throw new HttpsError("invalid-argument", "A valid cosmetic request ID is required.");
    return id;
  }
  function translate(action) {
    try { return action(); } catch (error) { throw new HttpsError(error.code || "internal", error.message); }
  }
  async function read(transaction, uid) {
    const ref = stateRef(uid), snap = await transaction.get(ref);
    return { ref, state: translate(() => C.normalize(snap.exists ? snap.data() : {})) };
  }
  async function load(uid, now = Date.now()) {
    const snap = await stateRef(uid).get();
    return { state: translate(() => C.normalize(snap.exists ? snap.data() : {})), serverNowMs: now, catalogVersion: C.VERSION };
  }
  async function purchase(uid, request, now = Date.now()) {
    const id = operationId(request.requestId), signature = JSON.stringify([request.offerId, request.expectedPrice, request.catalogVersion]);
    return runTransaction(async transaction => {
      const receipt = receiptRef(uid, id);
      const [saved, account] = await Promise.all([transaction.get(receipt), read(transaction, uid)]);
      if (saved.exists) {
        if (saved.data().signature !== signature) throw new HttpsError("invalid-argument", "This request ID was already used for a different purchase.");
        return { state: account.state, receipt: saved.data(), replayed: true, serverNowMs: now };
      }
      const result = translate(() => C.purchase(account.state, request, now));
      const record = { ...result.receipt, signature, requestId: id };
      transaction.set(account.ref, result.state);
      transaction.create(receipt, record);
      return { state: result.state, receipt: record, replayed: false, serverNowMs: now };
    });
  }
  async function equip(uid, request, now = Date.now()) {
    operationId(request.requestId);
    return runTransaction(async transaction => {
      const profileRef = db.doc(`players/${uid}`);
      const [account, profileSnap] = await Promise.all([read(transaction, uid), transaction.get(profileRef)]);
      if (!profileSnap.exists) throw new HttpsError("failed-precondition", "Load your kingdom before equipping cosmetics.");
      const profile = profileSnap.data();
      assertCurrentPlayerProfile(profile);
      if (request.expectedRevision !== account.state.revision) throw new HttpsError("failed-precondition", "Your collection changed. Review your equipped skins and retry.");
      const next = translate(() => C.equip(account.state, request.category, request.itemId));
      let flag = null, identityRevision = profile.identityRevision || 0;
      if (request.category === "flag") {
        const symbol = C.item(request.itemId)?.symbol;
        if (!symbol) throw new HttpsError("invalid-argument", "Choose a flag icon, or use the flag editor for free symbols.");
        if (request.expectedIdentityRevision !== identityRevision) throw new HttpsError("failed-precondition", "Your flag changed. Reload it before equipping a symbol.");
        flag = normalizeFlag({ ...profile.flag, symbol }, uid);
        identityRevision++;
        transaction.update(profileRef, { flag, identityRevision, updatedAtMs: now });
        next.revision++;
      }
      transaction.set(account.ref, next);
      transaction.set(publicRef(uid), { equipped: next.equipped, revision: next.revision });
      return { state: next, flag, identityRevision, serverNowMs: now };
    });
  }
  return { stateRef, publicRef, receiptRef, read, load, purchase, equip, translate };
}
module.exports = { createCosmeticsService };
