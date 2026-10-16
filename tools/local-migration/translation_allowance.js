"use strict";
const { validateScope, reservationPath, matchesScope } = require("../../local-backend/chat-translation-rehearsal");
const { MONTHLY_CHARACTER_LIMIT } = require("../../functions/chat-translation");

// Operator-only: this writes the LIVE project ledger. Call only after the owner
// approves the exact prepared scope. Firebase game requests use the same ledger,
// so a parallel local test cannot create a second project-wide allowance.
async function reserveProjectAllowance({ db, scope: input, now = Date.now }) {
  const scope = validateScope(input, now());
  return db.runTransaction(async tx => {
    validateScope(scope, now());
    const usageRef = db.doc(`chatTranslationUsage/${scope.month}`);
    const receiptRef = db.doc(`chatTranslationRehearsals/${scope.reservationId}`);
    const [usage, existing] = await tx.getAll(usageRef, receiptRef);
    const current = usage.exists ? usage.data().reservedCharacters : 0;
    if (!Number.isSafeInteger(current) || current < 0 || current > MONTHLY_CHARACTER_LIMIT) throw Error("Project translation usage requires review");
    if (existing.exists) {
      const receipt = existing.data();
      if (!matchesScope(receipt, scope) || !Number.isSafeInteger(receipt.sourceReservedCharacters)
        || receipt.sourceReservedCharacters < scope.characterLimit || receipt.sourceReservedCharacters > current
        || !Number.isSafeInteger(receipt.reservedAtMs)) throw Error("Existing translation reservation requires review");
      return receipt;
    }
    if (current + scope.characterLimit > MONTHLY_CHARACTER_LIMIT) throw Error("Project translation allowance is insufficient");
    const receipt = { ...scope, sourceReservedCharacters: current + scope.characterLimit, reservedAtMs: now() };
    tx.set(usageRef, { ...(usage.data() || {}), month: scope.month, reservedCharacters: receipt.sourceReservedCharacters,
      limit: MONTHLY_CHARACTER_LIMIT, updatedAtMs: receipt.reservedAtMs });
    tx.create(receiptRef, receipt);
    return receipt;
  });
}

// The operator initializes once, after receiving the source transaction's
// committed receipt. Repeated setup/restarts must never replenish the budget.
async function initializeLocalAllowance({ store, scope: input, receipt, now = Date.now }) {
  const scope = validateScope(input, now());
  if (store.schema !== scope.schema || !matchesScope(receipt, scope)
    || !Number.isSafeInteger(receipt.sourceReservedCharacters) || receipt.sourceReservedCharacters < scope.characterLimit
    || receipt.sourceReservedCharacters > MONTHLY_CHARACTER_LIMIT || !Number.isSafeInteger(receipt.reservedAtMs)
    || new Date(receipt.reservedAtMs).toISOString().slice(0, 7) !== scope.month || receipt.reservedAtMs > now()) throw Error("Committed source allowance receipt required");
  await store.runTransaction(async tx => {
    const ref = store.doc(reservationPath(scope)), existing = await tx.get(ref);
    if (existing.exists) {
      const data = existing.data();
      if (!matchesScope(data, scope) || data.sourceReservedCharacters !== receipt.sourceReservedCharacters || data.reservedAtMs !== receipt.reservedAtMs
        || !Number.isSafeInteger(data.usedCharacters) || data.usedCharacters < 0 || data.usedCharacters > scope.characterLimit) throw Error("Local translation allowance requires review");
      return;
    }
    tx.create(ref, { ...receipt, usedCharacters: 0 });
  });
}

module.exports = { reserveProjectAllowance, initializeLocalAllowance };
