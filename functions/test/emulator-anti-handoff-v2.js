"use strict";

const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const realm = require("../release-config.json");
const policy = require("../anti-handoff-policy.js");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pairId(fromUid, toUid) {
  return crypto.createHash("sha256")
    .update(`anti-handoff-v2\n${fromUid}\n${toUid}`)
    .digest("hex");
}

function target(fromUid, eventId, claimedAtMs) {
  return {
    id: `city-${eventId}`,
    regionId: "west",
    ownerKind: "player",
    ownerUid: fromUid,
    isMainCity: false,
    neutralClaimOpen: true,
    neutralClaimEventId: eventId,
    neutralClaimedByUid: fromUid,
    neutralClaimedAtMs: claimedAtMs,
    neutralClaimSource: "attack",
    neutralClaimCurrentOwnerUid: fromUid,
    neutralClaimPreviousOwnerUid: "",
    neutralClaimOwnershipChangedAtMs: claimedAtMs,
    neutralClaimPolicyVersion: policy.ANTI_HANDOFF_POLICY_VERSION,
  };
}

async function main() {
  const fromUid = `a-${crypto.randomBytes(5).toString("hex")}`;
  const toUid = `b-${crypto.randomBytes(5).toString("hex")}`;
  const nowMs = Date.now();
  const ref = db.doc(`realmSecurity/${realm.resetGeneration}/antiHandoffPairs/${pairId(fromUid, toUid)}`);
  const initialEvents = Array.from({ length: 6 }, (_, index) => ({
    neutralClaimEventId: `seed-${index + 1}`,
    atMs: nowMs - (6 - index) * 1000,
    fromUid,
    toUid,
    targetKey: `city:west:seed-${index + 1}`,
  }));
  await ref.set({
    policyVersion: 2,
    worldId: realm.worldId,
    resetGeneration: realm.resetGeneration,
    fromUid,
    toUid,
    events: initialEvents,
    count: 6,
    expiresAtMs: nowMs + policy.ANTI_HANDOFF_ROLLING_WINDOW_MS,
  });

  const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => db.runTransaction(async transaction => {
    const atMs = nowMs + 10_000 + index;
    const eventId = `race-${index + 1}`;
    const snapshot = await transaction.get(ref);
    const decision = policy.evaluateAntiHandoff({
      pairData: snapshot.data() || {},
      target: target(fromUid, eventId, atMs - 60_000),
      targetType: "city",
      fromUid,
      toUid,
      atMs,
    });
    if (decision.blocked) return { blocked: true, eventId };
    const appended = policy.appendSuccessfulEvent(decision, `city:west:${eventId}`);
    assert(appended.recorded, "An allowed transaction did not produce a counted event.");
    transaction.set(ref, {
      policyVersion: 2,
      worldId: realm.worldId,
      resetGeneration: realm.resetGeneration,
      fromUid,
      toUid,
      events: appended.events,
      count: appended.count,
      expiresAtMs: appended.events.at(-1).atMs + policy.ANTI_HANDOFF_ROLLING_WINDOW_MS,
    }, { merge: false });
    return { blocked: false, eventId };
  })));

  const allowed = attempts.filter(attempt => !attempt.blocked);
  const blocked = attempts.filter(attempt => attempt.blocked);
  assert(allowed.length === 1, `Concurrent transactions allowed ${allowed.length} new handoffs instead of one.`);
  assert(blocked.length === 7, `Concurrent transactions blocked ${blocked.length} attempts instead of seven.`);
  const after = (await ref.get()).data() || {};
  assert(after.count === 7, `The atomic directed counter ended at ${after.count} instead of seven.`);
  assert(Array.isArray(after.events) && after.events.length === 7, "The counter retained more than seven active events.");

  const duplicateDecision = policy.evaluateAntiHandoff({
    pairData: after,
    target: target(fromUid, allowed[0].eventId, nowMs + 20_000),
    targetType: "city",
    fromUid,
    toUid,
    atMs: nowMs + 21_000,
  });
  assert(duplicateDecision.duplicate, "The successful concurrent event was not replay-safe.");
  assert(!duplicateDecision.blocked, "A duplicate retry was treated as an eighth event.");

  console.log("Emulator Anti-Handoff v2 concurrency passed: eight simultaneous candidates produced one seventh success, seven blocks, and a replay-safe seven-event counter.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
