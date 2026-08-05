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
const emulatorResetGate = read("functions/test/emulator-reset-gate.js");
const serverConfig = JSON.parse(read("functions/economy-config.json"));
const browserContext = { window: {} };
vm.runInNewContext(read("economy-config.js"), browserContext);
const browserConfig = JSON.parse(JSON.stringify(browserContext.window.CROWNLANDS_ECONOMY_CONFIG));

assert.deepEqual(browserConfig, serverConfig, "Browser/server economy configuration drifted.");
const schedule = serverConfig.dailyLoginRewards;
assert.equal(schedule.schemaVersion, 3, "Daily login reward schema must be version 3.");
assert.equal(schedule.maxPendingRewards, 2, "Exactly two earned rewards may wait for collection.");
assert.deepEqual(
  schedule.itemOrder,
  [
    "war_drums_30m",
    "veil_of_silence_30m",
    "royal_tax_decree_30m",
    "swift_march_order",
    "recall_horn",
    "shield_12h",
  ],
  "Monthly item milestone order changed."
);

function buildTrack(monthLength) {
  const configured = schedule.tracksByMonthLength[String(monthLength)];
  assert.ok(configured, `Missing ${monthLength}-day reward track.`);
  const itemMap = new Map(configured.itemDays.map((day, index) => [day, schedule.itemOrder[index]]));
  let goldIndex = 0;
  let troopIndex = 0;
  let resource = "gold";
  const days = Array.from({ length: monthLength }, (_, index) => {
    const day = index + 1;
    if (itemMap.has(day)) return { day, goldHours: 0, troopHours: 0, items: { [itemMap.get(day)]: 1 } };
    const reward = resource === "gold"
      ? { day, goldHours: configured.goldHours[goldIndex++], troopHours: 0, items: {} }
      : { day, goldHours: 0, troopHours: configured.troopHours[troopIndex++], items: {} };
    resource = resource === "gold" ? "troops" : "gold";
    return reward;
  });
  assert.equal(goldIndex, configured.goldHours.length, `${monthLength}-day gold slots drifted.`);
  assert.equal(troopIndex, configured.troopHours.length, `${monthLength}-day troop slots drifted.`);
  return days;
}

const tracks = Object.fromEntries([28, 29, 30, 31].map(monthLength => {
  const days = buildTrack(monthLength);
  const rewardTypeCount = reward => [
    Number(reward.goldHours) > 0,
    Number(reward.troopHours) > 0,
    Object.keys(reward.items || {}).length > 0,
  ].filter(Boolean).length;
  assert.ok(days.every(reward => rewardTypeCount(reward) === 1), `${monthLength}-day track has an invalid reward day.`);
  assert.equal(days.reduce((sum, reward) => sum + reward.goldHours, 0), 111, `${monthLength}-day gold budget changed.`);
  assert.equal(days.reduce((sum, reward) => sum + reward.troopHours, 0), 111, `${monthLength}-day troop budget changed.`);
  assert.deepEqual(
    days.filter(reward => Object.keys(reward.items).length).map(reward => reward.day),
    schedule.tracksByMonthLength[String(monthLength)].itemDays,
    `${monthLength}-day item milestones drifted.`
  );
  assert.deepEqual(
    days.filter(reward => Object.keys(reward.items).length).map(reward => reward.items),
    schedule.itemOrder.map(itemId => ({ [itemId]: 1 })),
    `${monthLength}-day item order drifted.`
  );
  assert.deepEqual(
    days.filter(reward => reward.items.shield_12h).map(reward => reward.day),
    [monthLength],
    `${monthLength}-day Shield must be the final reward.`
  );
  return [String(monthLength), days];
}));

const stateBlockStart = server.indexOf("function getDailyLoginRewardMonthInfo");
const stateBlockEnd = server.indexOf("function assertCurrentPlayerProfile");
assert.ok(stateBlockStart >= 0 && stateBlockEnd > stateBlockStart, "Daily reward state model could not be extracted.");
const stateContext = {
  DAILY_LOGIN_REWARD_SCHEMA_VERSION: 3,
  LEGACY_DAILY_LOGIN_REWARD_CYCLE_DAYS: 30,
  DAILY_LOGIN_REWARD_MAX_PENDING: 2,
  DAILY_LOGIN_REWARD_TRACKS: tracks,
  SHOP_ITEMS: Object.fromEntries(schedule.itemOrder.map(id => [id, { id }])),
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
    getDailyLoginRewardMonthInfo
  };`,
  stateContext
);
const model = stateContext.dailyRewardModel;
const utc = value => Date.parse(`${value}T12:00:00.000Z`);

let attendance = model.syncDailyLoginRewardAttendance({}, utc("2026-07-01"));
assert.equal(attendance.state.monthKey, "2026-07");
assert.equal(attendance.state.monthLengthDays, 31);
assert.equal(attendance.state.nextDay, 1);
assert.equal(attendance.state.earnedThroughDay, 1);
assert.equal(model.createDailyLoginRewardStatus(attendance.state, utc("2026-07-01")).pendingCount, 1);
const sameDay = model.syncDailyLoginRewardAttendance(attendance.state, utc("2026-07-01"));
assert.equal(sameDay.state.earnedThroughDay, 1, "Repeated status reads must not earn extra rewards.");

attendance = model.syncDailyLoginRewardAttendance(sameDay.state, utc("2026-07-02"));
assert.equal(model.createDailyLoginRewardStatus(attendance.state, utc("2026-07-02")).pendingCount, 2);
attendance = model.syncDailyLoginRewardAttendance(attendance.state, utc("2026-07-03"));
let status = model.createDailyLoginRewardStatus(attendance.state, utc("2026-07-03"));
assert.equal(status.pendingCount, 2, "The earned queue must remain capped at two.");
assert.equal(status.attendanceDeferred, true, "A full queue must remember today's attendance.");

const afterOldestClaim = model.normalizeDailyLoginRewardState({
  ...attendance.state,
  nextDay: attendance.state.nextDay + 1,
  nextClaimOrdinal: attendance.state.nextClaimOrdinal + 1,
}, utc("2026-07-03"));
attendance = model.syncDailyLoginRewardAttendance(afterOldestClaim, utc("2026-07-03"));
status = model.createDailyLoginRewardStatus(attendance.state, utc("2026-07-03"));
assert.equal(status.pendingCount, 2, "Claiming on a deferred day must immediately fill the freed slot.");
assert.equal(status.attendanceDeferred, false);
assert.equal(status.earnedThroughDay, 3);

const afterTwoClaims = model.normalizeDailyLoginRewardState({
  ...attendance.state,
  nextDay: 3,
  nextClaimOrdinal: 3,
}, utc("2026-07-03"));
attendance = model.syncDailyLoginRewardAttendance(afterTwoClaims, utc("2026-07-06"));
assert.equal(attendance.state.earnedThroughDay, 4, "Missing UTC days must pause instead of skipping rewards.");
assert.equal(attendance.state.lastAttendanceDayKey, "2026-07-06");

const migrated = model.normalizeDailyLoginRewardState({
  schemaVersion: 2,
  cycle: 2,
  nextDay: 4,
  nextClaimOrdinal: 34,
  earnedThroughOrdinal: 33,
  lastClaimDayKey: "2026-06-30",
  totalClaims: 33,
}, utc("2026-08-05"));
assert.equal(migrated.monthKey, "2026-08");
assert.equal(migrated.nextDay, 4, "Version-2 progress must migrate without restarting at Day 1.");
assert.equal(migrated.nextClaimOrdinal, 34);
assert.equal(migrated.earnedThroughDay, 3);

const februaryClamp = model.normalizeDailyLoginRewardState({
  schemaVersion: 2,
  nextDay: 30,
  nextClaimOrdinal: 30,
  earnedThroughOrdinal: 29,
}, utc("2027-02-10"));
assert.equal(februaryClamp.monthLengthDays, 28);
assert.equal(februaryClamp.nextDay, 29, "Progress past February's track must migrate as complete.");

const january = model.normalizeDailyLoginRewardState({
  schemaVersion: 3,
  monthKey: "2026-01",
  monthLengthDays: 31,
  nextDay: 10,
  earnedThroughDay: 11,
  nextClaimOrdinal: 10,
  earnedThroughOrdinal: 11,
  lastAttendanceDayKey: "2026-01-31",
}, utc("2026-01-31"));
const february = model.normalizeDailyLoginRewardState(january, utc("2026-02-01"));
assert.equal(february.monthKey, "2026-02");
assert.equal(february.nextDay, 1);
assert.equal(february.earnedThroughDay, 0);
assert.equal(february.lastAttendanceDayKey, "");
assert.ok(february.nextClaimOrdinal > january.nextClaimOrdinal, "Month rollover must invalidate stale claim ordinals.");
assert.equal(model.getDailyLoginRewardMonthInfo(utc("2028-02-01")).monthLengthDays, 29, "Leap-year February must have 29 rewards.");

requireMatch(server, /tracksByMonthLength[\s\S]*DAILY_LOGIN_REWARD_TRACKS/, "Functions do not load all calendar-month tracks.");
requireMatch(server, /dailyLoginRewardVersion:\s*DAILY_LOGIN_REWARD_SCHEMA_VERSION/, "Realm info does not advertise monthly rewards.");
requireMatch(server, /createFreshResetPlayerProfile[\s\S]*dailyLoginReward:\s*createDefaultDailyLoginRewardState\(\)/, "Fresh reset profiles do not initialize daily rewards.");
requireMatch(server, /expectedMonthKey !== statusBefore\.monthKey[\s\S]*new UTC month/, "Stale cross-month claims are not rejected.");
requireMatch(server, /expectedOrdinal !== statusBefore\.nextClaimOrdinal[\s\S]*Daily rewards changed/, "Stale multi-device claims are not rejected.");
requireMatch(server, /nextDay:\s*claimedPosition\.day \+ 1[\s\S]*syncDailyLoginRewardAttendance\(claimedState,\s*nowMs\)/, "Claims do not consume the oldest reward and fill deferred attendance.");
requireMatch(server, /getRewardedAdBaseRates\(economy\)[\s\S]*reward\.goldHours[\s\S]*reward\.troopHours/, "Daily claims do not use permanent base production rates.");
requireMatch(server, /creditLevelUpTroopsToMainCity\(economy,[\s\S]*dailyLoginReward:\s*nextState/, "Daily troops are not credited atomically.");
requireMatch(emulatorResetGate, /buildDailyRewardClaimRequest[\s\S]*expectedMonthKey/, "Emulator claims do not use the authoritative UTC month guard.");
requireMatch(emulatorResetGate, /prepareDailyRewardClaim[\s\S]*getDailyLoginRewardStatus/, "Emulator claims do not refresh authoritative reward status.");
assert.doesNotMatch(
  emulatorResetGate,
  /callFunction\("claimDailyLoginReward",\s*[^,\n)]+\)/,
  "An emulator daily-reward claim omits its guarded payload."
);

requireMatch(client, /getDailyLoginRewardStatus[\s\S]*callServerFunction\("getDailyLoginRewardStatus"/, "Firebase client does not expose daily status.");
requireMatch(client, /claimDailyLoginReward[\s\S]*callServerFunction\("claimDailyLoginReward",\s*payload\)/, "Firebase client does not forward guarded claims.");
requireMatch(client, /delete cleanProfile\.dailyLoginReward/, "Client saves do not strip protected reward state.");
requireMatch(client, /dispatch\("daily-login-reward"[\s\S]*profile\.dailyLoginReward/, "Realtime profile updates do not publish reward state.");

requireMatch(html, /id="clanHudBtn"[\s\S]*id="dailyLoginRewardBtn"/, "Daily reward icon is not immediately after the clan icon.");
requireMatch(game, /expectedMonthKey:\s*dailyLoginRewardStatus\.monthKey/, "Client claims are not guarded by UTC month.");
requireMatch(game, /unclaimed rewards expire when[\s\S]*UTC month boundary/, "Monthly expiry is not explained in the UI.");
requireMatch(game, /DAILY_LOGIN_REWARD_TRACKS\[String\(status\.monthLengthDays\)\]/, "UI does not select the live month-length track.");
requireMatch(game, /getDailyLoginRewardCardState[\s\S]*"queued"[\s\S]*getDailyLoginRewardPresentation/, "Reward cards lost their queue states.");
requireMatch(game, /refreshDailyLoginRewardStatus\(\{\s*autoOpen:\s*true,\s*silent:\s*true\s*\}\)/, "Startup does not record attendance.");
requireMatch(game, /visibilitychange[\s\S]*handleGameForegroundSignal/, "Visible sessions do not refresh attendance.");
requireMatch(styles, /\.daily-login-reward-btn[\s\S]*dailyRewardHudGlow/, "Daily reward HUD styles are incomplete.");
requireMatch(styles, /\.daily-reward-grid[\s\S]*repeat\(6,[\s\S]*@media \(max-width: 700px\)[\s\S]*repeat\(5,[\s\S]*@media \(max-width: 520px\)[\s\S]*repeat\(3,/, "Daily reward grid responsiveness changed.");
requireMatch(html, /economy-config\.js\?v=20260805-monthly-rewards-v3/, "Frontend does not load the monthly reward economy release.");
requireMatch(serviceWorker, /economy-config\.js\?v=20260805-monthly-rewards-v3/, "Offline shell does not cache the monthly reward economy release.");
requireMatch(rules, /'dailyLoginReward'/, "Firestore rules do not protect daily reward state.");
requireMatch(
  read("tools/validate-clan-callable-access.js"),
  /"getDailyLoginRewardStatus"[\s\S]*"claimDailyLoginReward"/,
  "Deployment callable-access gate must include daily reward endpoints."
);

console.log("Validated UTC calendar-month daily rewards for 28, 29, 30, and 31 days.");
