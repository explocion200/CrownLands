const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireMatch = (source, pattern, message) => assert.match(source, pattern, message);

const server = read("functions/index.js");
const client = read("firebaseClient.js");
const game = read("game.js");
const html = read("index.html");
const styles = read("styles.css");
const rules = read("firestore.rules");
const serviceWorker = read("service-worker.js");
const serverConfig = JSON.parse(read("functions/economy-config.json"));
const browserContext = { window: {} };
vm.runInNewContext(read("economy-config.js"), browserContext);
const browserConfig = JSON.parse(JSON.stringify(browserContext.window.CROWNLANDS_ECONOMY_CONFIG));

assert.deepEqual(browserConfig, serverConfig, "Browser/server economy configuration drifted.");
const schedule = serverConfig.dailyLoginRewards;
assert.equal(schedule.schemaVersion, 2, "Daily login reward schema must be version 2.");
assert.equal(schedule.cycleLengthDays, 30, "Daily login reward cycle must contain 30 days.");
assert.equal(schedule.maxPendingRewards, 2, "Exactly two earned rewards may wait for collection.");
assert.equal(schedule.days.length, 30, "Daily login reward schedule is incomplete.");
assert.deepEqual(schedule.days.map(entry => entry.day), Array.from({ length: 30 }, (_, index) => index + 1));

const rewardTypeCount = reward => [
  Number(reward.goldHours) > 0,
  Number(reward.troopHours) > 0,
  Object.keys(reward.items || {}).length > 0,
].filter(Boolean).length;
assert.ok(schedule.days.every(reward => rewardTypeCount(reward) === 1), "Every day must contain exactly one reward.");
assert.equal(schedule.days.reduce((sum, entry) => sum + entry.goldHours, 0), 111, "Daily gold-hour budget changed.");
assert.equal(schedule.days.reduce((sum, entry) => sum + entry.troopHours, 0), 111, "Daily troop-hour budget changed.");
assert.equal(
  schedule.days.reduce((sum, entry) => (
    sum + Object.values(entry.items || {}).reduce((itemSum, quantity) => itemSum + quantity, 0)
  ), 0),
  6,
  "The cycle must contain six item rewards."
);
assert.deepEqual(
  schedule.days.filter(entry => Object.keys(entry.items || {}).length).map(entry => entry.day),
  [5, 10, 15, 20, 25, 30],
  "Daily item milestones changed."
);
assert.deepEqual(
  schedule.days.filter(entry => entry.items?.shield_12h).map(entry => entry.day),
  [30],
  "Royal Peace Shield must only be guaranteed on day 30."
);
assert.deepEqual(
  schedule.days.filter(entry => Object.keys(entry.items || {}).length).map(entry => entry.items),
  [
    { war_drums_30m: 1 },
    { veil_of_silence_30m: 1 },
    { royal_tax_decree_30m: 1 },
    { swift_march_order: 1 },
    { recall_horn: 1 },
    { shield_12h: 1 },
  ],
  "Item milestone order changed."
);

const stateBlockStart = server.indexOf("function normalizeDailyLoginRewardReceipt");
const stateBlockEnd = server.indexOf("function assertCurrentPlayerProfile");
assert.ok(stateBlockStart >= 0 && stateBlockEnd > stateBlockStart, "Daily reward state model could not be extracted.");
const stateContext = {
  DAILY_LOGIN_REWARD_SCHEMA_VERSION: 2,
  DAILY_LOGIN_REWARD_CYCLE_DAYS: 30,
  DAILY_LOGIN_REWARD_MAX_PENDING: 2,
  SHOP_ITEMS: Object.fromEntries([
    "shield_12h",
    "war_drums_30m",
    "royal_tax_decree_30m",
    "veil_of_silence_30m",
    "swift_march_order",
    "recall_horn",
  ].map(id => [id, { id }])),
  clampInt: (value, min, max) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0))),
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  timestampToMs: value => Math.max(0, Number(value) || 0),
  safeString: (value, max = 80) => String(value || "").trim().slice(0, max),
  getCurrentDateKey: date => date.toISOString().slice(0, 10),
  getNextUtcDayStartMs: nowMs => {
    const date = new Date(nowMs);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  },
};
vm.createContext(stateContext);
vm.runInContext(
  `${server.slice(stateBlockStart, stateBlockEnd)}
  globalThis.dailyRewardModel = {
    normalizeDailyLoginRewardState,
    syncDailyLoginRewardAttendance,
    createDailyLoginRewardStatus,
    getDailyLoginRewardPosition
  };`,
  stateContext
);
const model = stateContext.dailyRewardModel;
const utc = value => Date.parse(`${value}T12:00:00.000Z`);

let attendance = model.syncDailyLoginRewardAttendance({}, utc("2026-07-01"));
assert.equal(attendance.state.nextClaimOrdinal, 1);
assert.equal(attendance.state.earnedThroughOrdinal, 1);
assert.equal(model.createDailyLoginRewardStatus(attendance.state, utc("2026-07-01")).pendingCount, 1);
const sameDay = model.syncDailyLoginRewardAttendance(attendance.state, utc("2026-07-01"));
assert.equal(sameDay.state.earnedThroughOrdinal, 1, "Repeated status reads must not earn extra rewards.");

attendance = model.syncDailyLoginRewardAttendance(sameDay.state, utc("2026-07-02"));
assert.equal(model.createDailyLoginRewardStatus(attendance.state, utc("2026-07-02")).pendingCount, 2);
attendance = model.syncDailyLoginRewardAttendance(attendance.state, utc("2026-07-03"));
let status = model.createDailyLoginRewardStatus(attendance.state, utc("2026-07-03"));
assert.equal(status.pendingCount, 2, "The earned queue must remain capped at two.");
assert.equal(status.attendanceDeferred, true, "A full queue must remember today's attendance.");

const afterOldestClaim = model.normalizeDailyLoginRewardState({
  ...attendance.state,
  nextClaimOrdinal: attendance.state.nextClaimOrdinal + 1,
});
attendance = model.syncDailyLoginRewardAttendance(afterOldestClaim, utc("2026-07-03"));
status = model.createDailyLoginRewardStatus(attendance.state, utc("2026-07-03"));
assert.equal(status.pendingCount, 2, "Claiming on a deferred day must immediately fill the freed slot.");
assert.equal(status.attendanceDeferred, false);
assert.equal(status.earnedThroughOrdinal, 3);

const afterTwoClaims = model.normalizeDailyLoginRewardState({
  ...attendance.state,
  nextClaimOrdinal: 3,
});
attendance = model.syncDailyLoginRewardAttendance(afterTwoClaims, utc("2026-07-06"));
assert.equal(attendance.state.earnedThroughOrdinal, 4, "Missing UTC days must pause instead of skipping rewards.");
assert.equal(attendance.state.lastAttendanceDayKey, "2026-07-06");

const migrated = model.normalizeDailyLoginRewardState({
  schemaVersion: 1,
  cycle: 2,
  nextDay: 4,
  lastClaimDayKey: "2026-06-30",
  totalClaims: 33,
});
assert.equal(migrated.nextClaimOrdinal, 34, "Legacy cycle progress must migrate without resetting.");
assert.equal(migrated.earnedThroughOrdinal, 33);
assert.equal(migrated.lastAttendanceDayKey, "2026-06-30");
assert.deepEqual(
  JSON.parse(JSON.stringify(model.getDailyLoginRewardPosition(31))),
  { ordinal: 31, cycle: 2, day: 1 },
  "Day 30 must roll into the next cycle."
);
const clamped = model.normalizeDailyLoginRewardState({
  schemaVersion: 2,
  nextClaimOrdinal: 10,
  earnedThroughOrdinal: 999,
});
assert.equal(clamped.earnedThroughOrdinal, 11, "Stored pending rewards must be clamped to the queue limit.");

requireMatch(server, /DAILY_LOGIN_REWARD_DAYS[\s\S]*dailyLoginRewards[\s\S]*maxPendingRewards/, "Functions do not load the shared 30-day schedule.");
requireMatch(server, /createFreshResetPlayerProfile[\s\S]*dailyLoginReward:\s*createDefaultDailyLoginRewardState\(\)/, "Fresh reset profiles do not initialize daily rewards.");
requireMatch(
  server,
  /exports\.getDailyLoginRewardStatus\s*=\s*timedCallable[\s\S]*runTransaction[\s\S]*syncDailyLoginRewardAttendance[\s\S]*attendanceRecorded/,
  "The authoritative status callable does not record attendance transactionally."
);
requireMatch(
  server,
  /exports\.claimDailyLoginReward\s*=\s*timedCallable[\s\S]*claimId[\s\S]*expectedOrdinal[\s\S]*lastClaimRequestId[\s\S]*replayed:\s*true/,
  "Daily claims are not idempotent and ordinal-guarded."
);
requireMatch(
  server,
  /expectedOrdinal !== statusBefore\.nextClaimOrdinal[\s\S]*Daily rewards changed/,
  "Stale multi-device claims are not rejected."
);
requireMatch(
  server,
  /nextClaimOrdinal:\s*claimedPosition\.ordinal \+ 1[\s\S]*syncDailyLoginRewardAttendance\(claimedState,\s*nowMs\)/,
  "Claiming does not consume the oldest reward and fill deferred attendance."
);
requireMatch(server, /getRewardedAdBaseRates\(economy\)[\s\S]*reward\.goldHours[\s\S]*reward\.troopHours/, "Daily claims do not use permanent base production rates.");
requireMatch(
  server,
  /getCanonicalMainCityEntry\(economy\.profileAfter,\s*economy\.cityEntries\)[\s\S]*Verify your current-world main city/,
  "Daily rewards do not require a valid current-world main city."
);
requireMatch(server, /creditLevelUpTroopsToMainCity\(economy,[\s\S]*dailyLoginReward:\s*nextState/, "Daily troop rewards do not credit the canonical main city atomically.");
requireMatch(server, /operationResultMetrics[\s\S]*pendingRewards[\s\S]*attendanceDeferred/, "Daily reward workload logging is incomplete.");

requireMatch(client, /getDailyLoginRewardStatus[\s\S]*callServerFunction\("getDailyLoginRewardStatus"/, "Firebase client does not expose daily status.");
requireMatch(client, /claimDailyLoginReward[\s\S]*callServerFunction\("claimDailyLoginReward",\s*payload\)/, "Firebase client does not forward guarded claim payloads.");
requireMatch(client, /delete cleanProfile\.dailyLoginReward/, "Client profile saves do not strip protected daily reward state.");
requireMatch(client, /dispatch\("daily-login-reward"[\s\S]*profile\.dailyLoginReward/, "Realtime profile updates do not publish daily reward state.");

requireMatch(html, /id="clanHudBtn"[\s\S]*id="dailyLoginRewardBtn"/, "Daily reward icon is not immediately after the clan icon.");
requireMatch(game, /DAILY_LOGIN_REWARD_AUTO_OPEN_PREFIX[\s\S]*localStorage[\s\S]*showDailyLoginRewardsModal/, "Once-per-device UTC auto-open behavior is missing.");
requireMatch(game, /getDailyLoginRewardCardState[\s\S]*"queued"[\s\S]*getDailyLoginRewardPresentation/, "The reward track does not render claimed, ready, and queued single-reward states.");
requireMatch(game, /createDailyLoginRewardClaimId[\s\S]*expectedOrdinal[\s\S]*api\.claimDailyLoginReward\(dailyLoginRewardPendingClaim\)/, "Client claims are not guarded against retry and multi-device races.");
requireMatch(game, /refreshDailyLoginRewardStatus\(\{\s*autoOpen:\s*true,\s*silent:\s*true\s*\}\)/, "Gameplay startup does not record attendance and auto-open rewards.");
requireMatch(game, /visibilitychange[\s\S]*refreshDailyLoginRewardStatus/, "Visible sessions do not refresh daily reward eligibility.");
requireMatch(styles, /\.daily-login-reward-btn[\s\S]*dailyRewardHudGlow/, "Daily reward HUD styles are incomplete.");
requireMatch(styles, /\.daily-reward-grid[\s\S]*repeat\(6,[\s\S]*@media \(max-width: 700px\)[\s\S]*repeat\(5,[\s\S]*@media \(max-width: 520px\)[\s\S]*repeat\(3,/, "Daily reward grid must use 6, 5, and 3 responsive columns.");
requireMatch(styles, /\.daily-reward-card\.queued[\s\S]*\.daily-reward-check/, "Queued and claimed reward visuals are missing.");
requireMatch(html, /name="crownlands-build"\s+content="20260729-weekly-clan-quests-v2"/, "The frontend build marker no longer includes the attendance reward release.");
requireMatch(serviceWorker, /CACHE_VERSION = "20260729-weekly-clan-quests-v2"/, "The PWA cache no longer includes the attendance reward release.");
requireMatch(rules, /'dailyLoginReward'/, "Firestore rules do not protect daily reward state.");
requireMatch(
  read("tools/validate-clan-callable-access.js"),
  /"getDailyLoginRewardStatus"[\s\S]*"claimDailyLoginReward"/,
  "The deployment callable-access gate must include both daily reward endpoints."
);

console.log("Validated the attendance-based repeating 30-day daily reward track.");
