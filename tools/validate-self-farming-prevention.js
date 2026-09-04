#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const policy = require("../functions/anti-handoff-policy.js");
const migration = require("./anti-handoff-v2-migration.js");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const migrationScript = fs.readFileSync(path.join(root, "tools", "admin-migrate-anti-handoff-v2.js"), "utf8");
const gameRules = fs.readFileSync(path.join(root, "game-rules.html"), "utf8");
const guide = fs.readFileSync(path.join(root, "battle-economy-guide.html"), "utf8");
const master = fs.readFileSync(path.join(root, "docs", "CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md"), "utf8");

function contains(source, expression, message) {
  assert.match(source, expression, message);
}

function absent(source, expression, message) {
  assert.doesNotMatch(source, expression, message);
}

assert.equal(policy.ANTI_HANDOFF_POLICY_VERSION, 2);
assert.equal(policy.ANTI_HANDOFF_RAPID_WINDOW_MS, 20 * 60 * 1000);
assert.equal(policy.ANTI_HANDOFF_ROLLING_WINDOW_MS, 24 * 60 * 60 * 1000);
assert.equal(policy.ANTI_HANDOFF_SUCCESS_LIMIT, 7);
assert.equal(policy.ANTI_HANDOFF_NOTICE_START_COUNT, 4);

const nowMs = Date.UTC(2026, 8, 4, 12, 0, 0);
const fromUid = "neutral-claimer-a";
const toUid = "capturer-b";

function rapidCity(eventId, claimedAtMs = nowMs - 19 * 60 * 1000 - 59 * 1000, overrides = {}) {
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
    neutralClaimPolicyVersion: 2,
    ...overrides,
  };
}

let decision = policy.evaluateAntiHandoff({
  pairData: {},
  target: rapidCity("claim-1959"),
  fromUid,
  toUid,
  atMs: nowMs,
});
assert.equal(decision.qualifying, true, "A transfer at 19:59 must qualify.");

decision = policy.evaluateAntiHandoff({
  pairData: {},
  target: rapidCity("claim-after-2000", nowMs - policy.ANTI_HANDOFF_RAPID_WINDOW_MS - 1),
  fromUid,
  toUid,
  atMs: nowMs,
});
assert.equal(decision.qualifying, false, "A transfer after 20:00 must not qualify.");

let pairData = {};
for (let count = 1; count <= 7; count += 1) {
  const eventAtMs = nowMs + count * 1000;
  decision = policy.evaluateAntiHandoff({
    pairData,
    target: rapidCity(`claim-${count}`, eventAtMs - 60 * 1000),
    fromUid,
    toUid,
    atMs: eventAtMs,
  });
  assert.equal(decision.blocked, false, `Qualifying event ${count} was blocked.`);
  const appended = policy.appendSuccessfulEvent(decision, `city:west:city-${count}`);
  assert.equal(appended.recorded, true, `Qualifying event ${count} was not recorded.`);
  pairData = { events: appended.events };
  if (count === 4) assert.equal(decision.warning, true, "The fourth event did not warn.");
  if (count === 7) assert.equal(decision.finalWarning, true, "The seventh event did not issue the final warning.");
}
decision = policy.evaluateAntiHandoff({
  pairData,
  target: rapidCity("claim-8", nowMs + 7001 - 60 * 1000),
  fromUid,
  toUid,
  atMs: nowMs + 7001,
});
assert.equal(decision.blocked, true, "The eighth qualifying event was not blocked.");
assert.equal(decision.count, 7);

decision = policy.evaluateAntiHandoff({
  pairData: {
    events: pairData.events.map((entry, index) => index === 6 ? { ...entry, atMs: nowMs + 9000 } : entry),
  },
  target: rapidCity("older-transaction-retry", nowMs - 60 * 1000),
  fromUid,
  toUid,
  atMs: nowMs + 8000,
});
assert.equal(decision.blocked, true,
  "An older transaction retry ignored a concurrently committed seventh event.");

const rollingNowMs = nowMs + policy.ANTI_HANDOFF_ROLLING_WINDOW_MS + 1001;
decision = policy.evaluateAntiHandoff({
  pairData,
  target: rapidCity("claim-after-expiry", rollingNowMs - 60 * 1000),
  fromUid,
  toUid,
  atMs: rollingNowMs,
});
assert.equal(decision.blocked, false, "Natural rolling-window expiry did not free a slot.");
assert.equal(decision.count, 6, "Exactly one old event should have left the rolling window.");

const duplicateEvent = pairData.events[0];
decision = policy.evaluateAntiHandoff({
  pairData,
  target: rapidCity(duplicateEvent.neutralClaimEventId, nowMs - 60 * 1000),
  fromUid,
  toUid,
  atMs: nowMs + 8000,
});
assert.equal(decision.duplicate, true, "A repeated neutral claim event was not detected.");
assert.equal(decision.blocked, false, "A duplicate claim event incorrectly consumed an eighth slot.");
assert.equal(policy.appendSuccessfulEvent(decision, "city:west:duplicate").recorded, false);

for (const [label, target, targetType] of [
  ["established city", rapidCity("old", nowMs - policy.ANTI_HANDOFF_RAPID_WINDOW_MS - 1), "city"],
  ["main city", rapidCity("main", nowMs - 1000, { isMainCity: true }), "city"],
  ["Stronghold", rapidCity("stronghold", nowMs - 1000, { kind: "stronghold" }), "city"],
  ["camp", rapidCity("camp", nowMs - 1000, { campType: "gold" }), "camp"],
  ["Holding Tower", rapidCity("tower", nowMs - 1000), "tower"],
]) {
  assert.equal(policy.evaluateAntiHandoff({
    pairData, target, targetType, fromUid, toUid, atMs: nowMs,
  }).qualifying, false, `${label} was treated as a qualifying regular-city handoff.`);
}

const lineageClaim = policy.getLineageCapturePatch({
  target: { id: "neutral", regionId: "west", ownerUid: "" },
  nextOwnerUid: fromUid,
  atMs: nowMs,
  source: "attack",
  neutralClaimEventId: "server-claim-1",
});
assert.equal(lineageClaim.neutralClaimEventId, "server-claim-1");
const preservedLineage = policy.getLineageCapturePatch({
  target: { id: "neutral", regionId: "west", ownerUid: fromUid, ...lineageClaim },
  nextOwnerUid: toUid,
  atMs: nowMs + 60 * 1000,
  source: "attack",
});
assert.equal(preservedLineage.neutralClaimEventId, "server-claim-1");
assert.equal(preservedLineage.neutralClaimedByUid, fromUid);
assert.equal(preservedLineage.neutralClaimPreviousOwnerUid, fromUid);
assert.equal(preservedLineage.neutralClaimCurrentOwnerUid, toUid);
const intermediateUid = "intermediate-owner-c";
const consecutiveLineage = policy.getLineageCapturePatch({
  target: { id: "neutral", regionId: "west", ownerUid: toUid, ...preservedLineage },
  nextOwnerUid: intermediateUid,
  atMs: nowMs + 2 * 60 * 1000,
  source: "attack",
});
assert.equal(consecutiveLineage.neutralClaimedByUid, fromUid);
assert.equal(consecutiveLineage.neutralClaimPreviousOwnerUid, toUid);
assert.equal(consecutiveLineage.neutralClaimCurrentOwnerUid, intermediateUid);
assert.equal(policy.evaluateAntiHandoff({
  pairData: {},
  target: { id: "neutral", regionId: "west", ownerUid: intermediateUid, ...consecutiveLineage },
  fromUid,
  toUid,
  atMs: nowMs + 3 * 60 * 1000,
}).qualifying, false, "A-to-B counted while the neutral claimant did not own the city.");
const returnedToClaimantLineage = policy.getLineageCapturePatch({
  target: { id: "neutral", regionId: "west", ownerUid: intermediateUid, ...consecutiveLineage },
  nextOwnerUid: fromUid,
  atMs: nowMs + 3 * 60 * 1000,
  source: "attack",
});
assert.equal(policy.evaluateAntiHandoff({
  pairData: {},
  target: { id: "neutral", regionId: "west", ownerUid: fromUid, ...returnedToClaimantLineage },
  fromUid,
  toUid,
  atMs: nowMs + 4 * 60 * 1000,
}).qualifying, true, "Rapid ownership changes erased the restored claimant's original lineage.");
assert.equal(policy.evaluateAntiHandoff({
  pairData: {},
  target: { id: "neutral", regionId: "west", ownerUid: intermediateUid, ...consecutiveLineage },
  fromUid: toUid,
  toUid: fromUid,
  atMs: nowMs + 3 * 60 * 1000,
}).qualifying, false, "The reverse direction reused A-to-B lineage.");

const legacySharedAndFresh = migration.planLegacyPairCleanup({
  freshHandoffs: [{ eventId: "old" }],
  lastFreshHandoffAtMs: nowMs,
  blockedUntilMs: nowMs + 1000,
  blockReason: migration.LEGACY_FRESH_HANDOFF_REASON,
  sharedInstallationLastSeenAtMs: nowMs,
}, nowMs);
assert.equal(legacySharedAndFresh.action, "update");
assert.equal(legacySharedAndFresh.preservesSharedInstallation, true);
assert(legacySharedAndFresh.deleteFields.includes("blockedUntilMs"));
assert(!legacySharedAndFresh.deleteFields.includes("sharedInstallationLastSeenAtMs"));
assert.equal(migration.planLegacyPairCleanup({ sharedInstallationLastSeenAtMs: nowMs }, nowMs).action, "none");
assert.equal(migration.planLegacyPairCleanup({
  freshHandoffs: [{}], blockedUntilMs: nowMs + 1000, blockReason: "manual-review",
}, nowMs).action, "ambiguous");

contains(server, /const ANTI_FARM_POLICY_VERSION = 2/,
  "The combined anti-abuse schema was not advanced to v2.");
contains(server, /ANTI_FARM_INSTALLATION_RETENTION_MS = 30 \* 24 \* 60 \* 60 \* 1000/,
  "The independent shared-installation retention changed.");
contains(server, /registerGameInstallation[\s\S]*?sharedInstallationLastSeenAtMs:[\s\S]*?sharedInstallationExpiresAtMs:/,
  "Shared-installation protection is no longer persisted independently.");
contains(server, /evaluateAntiFarmPairData[\s\S]*?sharedInstallationUntilMs[\s\S]*?linked-account-activity/,
  "Shared-installation attacks are no longer blocked.");
contains(rules, /match \/realmSecurity\/\{resetId\}\/\{document=\*\*\}[\s\S]*?allow read, create, update, delete: if false/,
  "Private anti-abuse records are not denied to clients.");

contains(server, /antiHandoffPairRef[\s\S]*?antiHandoffPairs/,
  "Directed v2 pair records are missing.");
contains(server, /evaluateHostileAntiFarmPolicy[\s\S]*?ANTI_HANDOFF\.evaluateAntiHandoff/,
  "The shared transaction helper does not evaluate v2.");
contains(server, /sendArmyOrder[\s\S]*?handoffAtMs:\s*arrivesAtMs/,
  "Regular launch prechecks do not use the authoritative arrival timestamp.");
contains(server, /sendHoldingTowerArmyOrder[\s\S]*?phase:\s*"tower-origin-launch"[\s\S]*?handoffAtMs:\s*arrivesAtMs/,
  "Holding Tower origins do not use the shared launch precheck.");
contains(server, /launchClanRally[\s\S]*?phase:\s*"rally-launch"[\s\S]*?handoffAtMs:\s*arrivesAtMs/,
  "Clan Rally attacks do not use the shared launch precheck.");
contains(server, /resolveArmyOrderById[\s\S]*?evaluateHostileAntiFarmPolicy[\s\S]*?phase:[\s\S]*?"arrival"/,
  "Arrival does not atomically recheck v2.");
contains(server, /antiFarmContext\.policy\.blocked[\s\S]*?restoreAntiHandoffShield[\s\S]*?returnRecalledTroops\(troopCount\)[\s\S]*?refundedSwiftMarchOrders/,
  "A blocked arrival does not restore eligible shields, return troops, and refund applicable march items.");
contains(server, /if \(result\.success\)[\s\S]*?recordSuccessfulRapidNeutralHandoff\(transaction, antiFarmContext/,
  "Only successful ownership transfers should record a v2 event.");
contains(server, /writeAntiHandoffNotice\(transaction,[\s\S]*?uid: attackerUid[\s\S]*?writeAntiHandoffNotice\(transaction,[\s\S]*?uid: directionFromUid/,
  "Both directed-pair players do not receive persistent reports.");
contains(server, /neutralClaimEventId[\s\S]*?neutralClaimCurrentOwnerUid[\s\S]*?neutralClaimPreviousOwnerUid[\s\S]*?neutralClaimOwnershipChangedAtMs/,
  "Neutral-city lineage is incomplete.");
contains(server, /cleanupExpiredAntiFarmInstallations[\s\S]*?antiHandoffPairs[\s\S]*?antiHandoffAudit/,
  "Expired v2 operational and audit data is not cleaned.");

contains(migrationScript, /--apply requires --confirm-plan-hash from a fresh dry run/,
  "The migration lacks dry-run hash confirmation.");
contains(migrationScript, /--realm-shard[\s\S]*?explicitly confirmed realm shard/,
  "The migration does not fail closed on realm-shard identity.");
contains(migrationScript, /affectedPlayerCount/,
  "The migration dry run does not report the number of affected players.");
contains(migrationScript, /ambiguous[\s\S]*?Refusing migration/,
  "The migration does not fail closed on ambiguous combined restrictions.");
contains(migrationScript, /currentDocument:\s*\{ updateTime: target\.updateTime \}/,
  "The migration lacks optimistic concurrency protection.");
absent(migrationScript, /players\//,
  "The legacy pair cleanup must never write player progress documents.");

contains(client, /anti_handoff_v2_notice[\s\S]*?FINAL WARNING/,
  "The player-facing report UI does not identify final warnings.");
contains(client, /anti_handoff_v2_notice[\s\S]*?report\.summary/,
  "The report detail does not display the persistent directed count and next-slot summary.");

for (const source of [server, gameRules, guide, master]) {
  absent(source, /allows? only two qualifying captures|two-in-seven|fresh for 24 hours|seven-day pair restriction/i,
    "Obsolete fresh-neutral handoff wording remains.");
}

console.log("Validated Anti-Handoff Policy v2 timing, directed rolling limit, lineage, warnings, shared-installation isolation, Tower origins, safe cancellation, migration, cleanup, and UI reporting.");
