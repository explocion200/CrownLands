const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClient = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireMatch(source, expression, message) {
  assert(expression.test(source), message);
}

function extractBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert(startIndex >= 0, `Missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const payout = extractBetween(
  server,
  "async function resolveRewardCampPayoutByRef",
  "async function resolveRewardCampPayoutAndStats"
);
const callable = extractBetween(
  server,
  "exports.resolveRewardCampPayout =",
  "exports.resolveGoldCampPayout ="
);
const recall = extractBetween(
  server,
  "exports.recallRewardCampGarrison =",
  "function getScheduledArmyTarget"
);
const troopCredit = extractBetween(payout, "let troopReward =", "let returnArmy = null");

requireMatch(
  payout,
  /callerUid\s*&&\s*holderUid\s*&&\s*callerUid !== holderUid[\s\S]*?permission-denied/,
  "A signed-in outsider can still resolve another holder's Camp payout."
);
requireMatch(
  callable,
  /requireKnownWorldRegionId[\s\S]*?getServerWorldCampIds\(regionId\)\.has\(campId\)/,
  "The Camp payout callable does not restrict requests to authoritative Camp locations."
);
requireMatch(
  payout,
  /heldSinceMs[\s\S]*?payoutAtMs <= heldSinceMs[\s\S]*?stationedTroops <= 0[\s\S]*?status: "invalid-hold"/,
  "Camp payout does not reject incomplete or empty hold state."
);
requireMatch(
  payout,
  /rewardCampPayoutReceiptRef\(holdCycleId\)[\s\S]*?transaction\.get\(payoutReceiptRef\)[\s\S]*?payoutReceiptSnap\?\.exists[\s\S]*?transaction\.set\(payoutReceiptRef/,
  "Camp payout is missing its transaction-backed idempotency receipt."
);
requireMatch(
  payout,
  /payoutPending: false[\s\S]*?alliedReinforcementTroops: 0[\s\S]*?dailyRewardClaims: FieldValue\.delete\(\)/,
  "Completed Camp reset does not atomically clear public reward metadata and allied troop state."
);
assert(
  !/dailyRewardClaims:\s*\{/.test(payout),
  "Completed Camp rewards are still copied into the publicly readable Camp document."
);
assert(
  !/islandReportRef\(camp\.regionId, report\.id\)/.test(payout),
  "Private Camp payout reports are still copied into the public island report collection."
);
assert(
  !/productionUpdatedAtMs\s*:/.test(troopCredit),
  "Warband Camp payout still discards uncheckpointed troop production."
);
requireMatch(
  recall,
  /payoutPending: false[\s\S]*?alliedReinforcementTroops: 0[\s\S]*?dailyRewardClaims: FieldValue\.delete\(\)/,
  "Abandoned Camp reset does not clear reward and reinforcement state."
);
requireMatch(
  rules,
  /match \/rewardCampPayoutReceipts\/\{resetId\}\/entries\/\{receiptId\}[\s\S]*?allow read, create, update, delete: if false;/,
  "Camp payout receipts are not server-private."
);
requireMatch(
  rules,
  /match \/rewardHistory\/\{entryId\}[\s\S]*?resource\.data\.awardedToPlayerId == request\.auth\.uid;/,
  "Deed Camp reward history is visible to players other than its recipient."
);
requireMatch(
  rules,
  /match \/reports\/\{reportId\}[\s\S]*?!reportId\.matches\('\.\*_hold_\.\*'\)/,
  "Legacy public Camp payout reports remain readable."
);
requireMatch(
  server,
  /async function cleanupLegacyRewardCampPublicMetadata[\s\S]*?dailyRewardClaims: FieldValue\.delete\(\)[\s\S]*?rewardCampPrivacyCleanup/,
  "Legacy public Camp reward metadata has no one-time server cleanup."
);
requireMatch(
  firebaseClient,
  /where\("awardedToPlayerId",\s*"==",\s*uid\)/,
  "The client does not issue an owner-scoped Deed Camp reward-history query."
);
requireMatch(
  client,
  /function getDeedCampHistoryCacheKey[\s\S]*?getCurrentOnlineUid\(\)[\s\S]*?Your Rewards/,
  "Private Deed Camp history is not isolated by player in the client cache and UI."
);

console.log("Validated Camp completion gating, private rewards, idempotency, abandonment, reinforcement reset, and troop-production preservation.");
