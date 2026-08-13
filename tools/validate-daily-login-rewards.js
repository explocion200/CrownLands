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
const styles = `${read("styles.css")}\n${read("daily-rewards.css")}`;
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
  getUtcMonthCycle: require(path.join(root, "functions", "seasonalAchievements.js")).getUtcMonthCycle,
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
requireMatch(game, /DAILY_LOGIN_REWARD_TRACKS\[String\(status\.monthLengthDays\)\]/, "UI does not select the live month-length track.");
requireMatch(game, /getDailyLoginRewardCardState[\s\S]*"queued"[\s\S]*getDailyLoginRewardPresentation/, "Reward cards lost their queue states.");
requireMatch(game, /startLoginPresentationDailyRefresh\(presentationGeneration\)[\s\S]*?markLoginPresentationMapReady\(presentationGeneration\)/, "Startup does not route attendance through the login presentation sequence.");
requireMatch(game, /visibilitychange[\s\S]*handleGameForegroundSignal/, "Visible sessions do not refresh attendance.");
const rewardTabsSource = game.slice(
  game.indexOf("function renderDailyRewardModalTabs()"),
  game.indexOf("function bindDailyRewardModalTabs()")
);
const rewardModalSource = game.slice(
  game.indexOf("function renderDailyLoginRewardModal()"),
  game.indexOf("async function showDailyLoginRewardsModal")
);
requireMatch(rewardTabsSource, /role="tablist"[\s\S]*aria-label="Daily rewards, quests, and achievements"[\s\S]*aria-selected[\s\S]*aria-controls/, "The reward modal is missing its accessible icon tabs.");
requireMatch(rewardTabsSource, /daily-reward-160x160-9bd7a936016f\.webp[\s\S]*hud-report-192x192-21644b7390fb\.webp[\s\S]*hud-achievements-192x192-1efe6767ace6\.webp/, "Reward, Quest, and Achievement tab artwork drifted.");
requireMatch(rewardTabsSource, /aria-label="\$\{accessibleLabel\}" title="\$\{tab\.label\}"[\s\S]*<img[^>]*alt=""[^>]*>[\s\S]*<\/button>/, "Reward tabs must be icon-only while retaining names, claim alerts, and tooltips.");
requireMatch(game, /\["ArrowLeft", "ArrowRight", "Home", "End"\][\s\S]*activateTab/, "Reward tabs lost keyboard arrow, Home, or End navigation.");
requireMatch(game, /async function showDailyLoginRewardsModal[\s\S]*options\.initialTab[\s\S]*:\s*"rewards"/, "Opening the modal no longer defaults to Daily Login or accept direct tab navigation.");
requireMatch(game, /function renderDailyMissionSection[\s\S]*dailyMissionsList[\s\S]*function renderDailyQuestTab[\s\S]*renderDailyMissionSection\(\)/, "Player Daily Missions are not rendered in the reward modal's Quests tab.");
requireMatch(game, /function bindDailyQuestControls[\s\S]*handleDailyMissionListClick/, "Daily Mission controls are not connected inside the reward modal.");
requireMatch(rewardModalSource, /const cardTag = isClaimableCard \? "button" : "article"[\s\S]*data-daily-reward-claim-card[\s\S]*daily-reward-card-icon[\s\S]*daily-reward-card-amount/, "Only the available reward card should expose the guarded claim control.");
requireMatch(rewardModalSource, /aria-label="Day \$\{reward\.day\}, \$\{escapeHtml\(presentation\.title\)\},[\s\S]*Ready; activate to claim/, "Reward-card accessible names no longer preserve the day, reward, and state.");
assert.doesNotMatch(rewardModalSource, /daily-reward-(?:hero|meta|status-row|receipt|progress|actions|claim-btn|card-head|card-label|check)/, "Removed calendar chrome or card text returned to the Daily Login panel.");
assert.doesNotMatch(rewardModalSource, /data-daily-reward-claim(?:\s|>)/, "A global Daily Login claim button returned.");
assert.doesNotMatch(rewardModalSource, />\s*(?:Day\s+\$\{|Claimed|Ready|Queued|Next|Locked|Collect)/, "Reward cards expose forbidden day or state text.");
const clanRewardsPanelSource = game.slice(
  game.indexOf("function renderClanRewardsPanel()"),
  game.indexOf("function getRallyParticipantForCurrentPlayer")
);
assert.match(clanRewardsPanelSource, /renderClanQuestPanel/, "Clan Weekly Conquest is missing from the Player Profile Clan Rewards panel.");
requireMatch(styles, /\.daily-login-reward-btn[\s\S]*dailyRewardHudGlow/, "Daily reward HUD styles are incomplete.");
requireMatch(styles, /\.daily-login-reward-modal \.modal-card #modalBody\s*\{[\s\S]*?overflow:\s*hidden/, "Daily rewards can still scroll inside the modal.");
requireMatch(styles, /\.daily-reward-grid\s*\{[\s\S]*repeat\(8,[\s\S]*overflow:\s*hidden[\s\S]*@media \(max-width: 700px\)[\s\S]*repeat\(7,[\s\S]*@media \(max-height: 640px\) and \(orientation: landscape\)[\s\S]*repeat\(8,/, "Daily reward grid must fit desktop, portrait phone, and short-landscape viewports without scrolling.");
requireMatch(styles, /\.daily-reward-card\s*\{[\s\S]*min-height:\s*0[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\) auto/, "Reward cards are not constrained to image-and-amount rows.");
requireMatch(styles, /\.daily-reward-card\.claimed\s*\{[\s\S]*rgba\(85, 97, 61,[\s\S]*\.daily-reward-card\.claimed::after\s*\{[\s\S]*content:\s*""[\s\S]*radial-gradient\(circle at 45% 38%, #7f372e, #4f1d1c\)/, "Collected cards lost their moss frame or wax-seal check treatment.");
requireMatch(styles, /\.daily-reward-card\.available\s*\{[\s\S]*border-color:\s*rgba\(110, 47, 53, \.82\)[\s\S]*rgba\(110, 47, 53, \.16\)/, "Claimable cards lost their oxblood-and-parchment highlight treatment.");
requireMatch(styles, /@keyframes dailyRewardClaimPulse[\s\S]*rgba\(110, 47, 53, \.12\)[\s\S]*rgba\(110, 47, 53, \.2\)/, "Claimable-card pulse no longer uses the subdued oxblood treatment.");
requireMatch(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.daily-reward-card\.available[\s\S]*animation:\s*none/, "Claimable-card motion is not disabled for reduced-motion users.");
requireMatch(styles, /\.daily-reward-tabs\s*\{[\s\S]*position:\s*absolute[\s\S]*right:\s*6rem[\s\S]*repeat\(3,\s*44px\)[\s\S]*gap:\s*1\.2rem[\s\S]*\.daily-reward-tabs button:focus-visible[\s\S]*outline:/, "Desktop icon tabs are not spaced across the upper-right with a visible focus state.");
requireMatch(styles, /@media \(max-width: 700px\)[\s\S]*\.daily-reward-tabs\s*\{[\s\S]*right:\s*5rem[\s\S]*repeat\(3,\s*38px\)[\s\S]*gap:\s*\.9rem/, "Portrait icon tabs no longer preserve clearance from the close button.");
requireMatch(styles, /@media \(max-height: 640px\) and \(orientation: landscape\)[\s\S]*\.daily-reward-tabs\s*\{[\s\S]*right:\s*5rem[\s\S]*repeat\(3,\s*34px\)[\s\S]*gap:\s*\.75rem/, "Short-landscape icon tabs no longer preserve clearance from the close button.");
requireMatch(styles, /\.daily-login-reward-modal \.modal-close\s*\{[\s\S]*z-index:\s*6/, "The close button is not kept above reward content.");
requireMatch(html, /daily-rewards\.css\?v=20260812-visual-correction-pass-4a-r1/, "The page does not request the refreshed Daily Rewards stylesheet version.");
requireMatch(
  serviceWorker,
  /function isNetworkFirstAsset[\s\S]*?\.endsWith\("\.css"\)[\s\S]*?if \(isNetworkFirstAsset\(url\)\)[\s\S]*?networkFirst\(request, null\)/,
  "The service worker does not runtime-cache the refreshed Daily Rewards stylesheet."
);
assert.doesNotMatch(html, /id="dailyMissionsSection"/, "Daily Missions are still embedded in the Player Profile UI.");
assert.doesNotMatch(`${html}\n${styles}`, /profile-dashboard/, "The removed profile dashboard structure or compact CSS returned.");
requireMatch(html, /economy-config\.js\?v=20260805-linear-walls-v1/, "Frontend does not load the current economy release.");
requireMatch(serviceWorker, /economy-config\.js\?v=20260805-linear-walls-v1/, "Offline shell does not cache the current economy release.");
requireMatch(rules, /'dailyLoginReward'/, "Firestore rules do not protect daily reward state.");
requireMatch(
  read("tools/validate-clan-callable-access.js"),
  /"getDailyLoginRewardStatus"[\s\S]*"claimDailyLoginReward"/,
  "Deployment callable-access gate must include daily reward endpoints."
);

console.log("Validated UTC calendar-month rewards, the Daily Missions quest tab, and Clan Rewards placement for Weekly Conquest.");
