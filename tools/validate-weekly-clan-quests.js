const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getClanQuestPeriod } = require("../functions/clanQuestPeriod.js");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClient = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function iso(value) {
  return new Date(value).toISOString();
}

const sunday = getClanQuestPeriod(Date.UTC(2026, 6, 26, 23, 59, 59, 999), "reset/test");
assert.equal(iso(sunday.weekStartAtMs), "2026-07-20T00:00:00.000Z");
assert.equal(iso(sunday.weekEndAtMs), "2026-07-27T00:00:00.000Z");
assert.equal(sunday.questPeriodId, "v2_reset_test_2026-07-20");

const monday = getClanQuestPeriod(Date.UTC(2026, 6, 27, 0, 0, 0, 0), "reset/test");
assert.equal(iso(monday.weekStartAtMs), "2026-07-27T00:00:00.000Z");
assert.equal(iso(monday.weekEndAtMs), "2026-08-03T00:00:00.000Z");
assert.equal(monday.questPeriodId, "v2_reset_test_2026-07-27");

const yearBoundary = getClanQuestPeriod(Date.UTC(2027, 0, 1, 12), "reset/test");
assert.equal(iso(yearBoundary.weekStartAtMs), "2026-12-28T00:00:00.000Z");
assert.equal(iso(yearBoundary.weekEndAtMs), "2027-01-04T00:00:00.000Z");

const expectedRewards = [
  ["capture_25", 25, "gold", 30],
  ["capture_75", 75, "troops", 30],
  ["capture_150", 150, "gold", 60],
  ["capture_250", 250, "troops", 60],
  ["capture_400", 400, "gold", 90],
  ["capture_600", 600, "troops", 120],
  ["capture_850", 850, "gold", 150],
  ["capture_1150", 1150, "troops", 180],
  ["capture_1500", 1500, "gold", 240],
  ["capture_2000", 2000, "troops", 360],
];
expectedRewards.forEach(([id, captures, rewardType, productionMinutes]) => {
  const expected = `{ id: "${id}", captures: ${captures}, rewardType: "${rewardType}", productionMinutes: ${productionMinutes} }`;
  assert.ok(server.includes(expected), `Server reward track is missing ${id}.`);
  assert.ok(client.includes(expected), `Client reward track is missing ${id}.`);
});
assert.equal(
  expectedRewards.filter(([, , type]) => type === "gold").reduce((sum, entry) => sum + entry[3], 0),
  570,
  "Weekly gold rewards must total 9.5 production hours."
);
assert.equal(
  expectedRewards.filter(([, , type]) => type === "troops").reduce((sum, entry) => sum + entry[3], 0),
  750,
  "Weekly troop rewards must total 12.5 production hours."
);

assert.match(server, /getRealmInfo[\s\S]*?serverTimeMs[\s\S]*?clanQuestPeriod:\s*getClanQuestPeriod/);
assert.match(server, /questProgress\/\$\{questPeriod\.questPeriodId\}/);
assert.match(server, /captureEventAtMs[\s\S]*?getClanQuestPeriod\(captureEventAtMs,\s*RESET_GENERATION\)/);
assert.match(server, /milestoneUnlocks\[reward\.id\]\s*=\s*captureEventAtMs/);
assert.match(server, /questPeriodId:\s*questPeriod\.questPeriodId[\s\S]*?captureEventAtMs[\s\S]*?captureNumber/);
assert.match(server, /claimClanQuestReward[\s\S]*?requestedQuestPeriodId[\s\S]*?weekly quest period has expired/i);
assert.match(server, /rewards\.questPeriodId[\s\S]*?questPeriod\.questPeriodId[\s\S]*?questClaims[\s\S]*?\{\}/);
assert.match(server, /storedQuestPeriodId\s*!==\s*questPeriod\.questPeriodId[\s\S]*?clanQuestClaimHistoryRef[\s\S]*?questClaims:\s*previousClaims/);

const questListenerSource = firebaseClient.slice(
  firebaseClient.indexOf("function subscribeClanQuestProgress"),
  firebaseClient.indexOf("function subscribeClanApplications")
);
assert.match(questListenerSource, /doc\(client\.db,\s*"clans",\s*safeClanId,\s*"questProgress",\s*safeQuestPeriodId\)/);
assert.doesNotMatch(questListenerSource, /getDoc|getDocs|setInterval|setTimeout/);
assert.match(client, /function updateClanQuestCountdown[\s\S]*?startClanQuestProgressSubscription[\s\S]*?\{\s*force:\s*true\s*\}/);
assert.match(client, /captureCount\s*\/\s*CLAN_QUEST_MAX_CAPTURES/);
assert.match(client, /Weekly Conquest[\s\S]*?data-clan-quest-countdown[\s\S]*?Unclaimed rewards expire/);
assert.match(client, /claimClanQuestReward\(\{\s*rewardId,\s*questPeriodId\s*\}\)/);
assert.match(rules, /match \/questProgress\/\{periodId\}[\s\S]*?resource\.data\.questPeriodId == periodId/);
assert.match(rules, /match \/memberRewardHistory\/\{historyId\}[\s\S]*?allow read, create, update, delete: if false/);
assert.match(html, /clanQuestPeriod\.js[\s\S]*?firebaseClient\.js[\s\S]*?game\.js/);

console.log("Validated Monday UTC clan quest periods, weekly rewards, event-time capture partitioning, expiring claims, isolated realtime rollover, and the 2,000-capture UI.");
