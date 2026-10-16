"use strict";
const { randomUUID } = require("node:crypto");

// Firestore events are delivered at least once. Read the current receipt rather
// than the immutable creation event, and retain per-device successes on retry.
async function deliverNotificationOutbox(ref, { db, send, fieldValue, now = Date.now, leaseMs = 120000 }) {
  const leaseId = randomUUID();
  const record = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const current = snapshot.data();
    if (["delivered", "skipped"].includes(current.status)) return null;
    const nowMs = now();
    if (Number(current.expiresAtMs) > 0 && current.expiresAtMs <= nowMs) {
      transaction.update(ref, { status: "skipped", skipReason: "expired", updatedAt: fieldValue.serverTimestamp() });
      return null;
    }
    if (Number(current.deliveryLeaseUntilMs) > nowMs) throw new Error("Notification delivery is already in progress.");
    transaction.update(ref, {
      status: "processing", deliveryLeaseId: leaseId, deliveryLeaseUntilMs: nowMs + leaseMs,
      attempts: Math.max(0, Number(current.attempts) || 0) + 1, updatedAt: fieldValue.serverTimestamp(),
    });
    return current;
  });
  if (!record) return;
  let result;
  try {
    result = await send(record.notification || {}, record.completedTokenIds || []);
  } catch (error) {
    result = { retryError: error };
  }
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data().deliveryLeaseId !== leaseId) return;
    const current = snapshot.data();
    const deliveredTokenIds = [...new Set([...(current.deliveredTokenIds || []), ...(result.deliveredTokenIds || [])])];
    const completedTokenIds = [...new Set([...(current.completedTokenIds || []), ...(result.completedTokenIds || [])])];
    transaction.update(ref, {
      status: result.retryError ? "pending" : deliveredTokenIds.length ? "delivered" : "skipped",
      deliveredTokenIds, completedTokenIds,
      deliveryLeaseId: fieldValue.delete(), deliveryLeaseUntilMs: fieldValue.delete(),
      lastError: result.retryError ? String(result.retryError.code || "delivery-failed").slice(0, 100) : fieldValue.delete(),
      ...(result.retryError ? {} : { deliveredAtMs: now() }),
      updatedAt: fieldValue.serverTimestamp(),
    });
  });
  if (result.retryError) throw result.retryError;
}

function incomingArmyData(notification = {}) {
  const safeString = (value, max) => String(value || "").trim().slice(0, max);
  const data = {
    type: "incoming_army",
    title: safeString(notification.title, 80),
    body: safeString(notification.body, 180),
    kind: safeString(notification.kind, 16),
    armyId: safeString(notification.armyId, 96),
    cityId: safeString(notification.cityId, 96),
    sourceCityId: safeString(notification.sourceCityId, 96),
    targetRegionId: safeString(notification.targetRegionId, 80),
    sourceRegionId: safeString(notification.sourceRegionId, 80),
    targetName: safeString(notification.targetName, 60),
    sourceName: safeString(notification.sourceName, 60),
    attackerName: safeString(notification.attackerName, 60),
    troopVisibility: safeString(notification.troopVisibility, 16),
    troopEstimateMin: safeString(notification.troopEstimateMin, 32),
    troopEstimateMax: safeString(notification.troopEstimateMax, 32),
    troopEstimateLabel: safeString(notification.troopEstimateLabel, 40),
    arrivesAtMs: safeString(notification.arrivesAtMs, 32),
    url: safeString(notification.url || "/play/", 160),
  };
  if (notification.troops !== undefined) {
    data.troops = safeString(notification.troops, 32);
  }
  return data;
}

module.exports = { deliverNotificationOutbox, incomingArmyData };
