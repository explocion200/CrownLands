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
const styles = `${read("styles.css")}\n${read("interface-theme.css")}\n${read("daily-rewards.css")}`;
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

const model = require(path.join(root, "functions/dailyLoginRewards.js"));
const utc = value => Date.parse(`${value}T12:00:00.000Z`);
for (let i = 0; i < 200; i++) {
  const rewards = model.createSchedule();
  assert.equal(rewards.length, 28);
  assert.equal(rewards.reduce((sum, r) => sum + r.goldHours, 0), 111);
  assert.equal(rewards.reduce((sum, r) => sum + r.troopHours, 0), 111);
  assert.equal(rewards.reduce((sum, r) => sum + r.commonGearBoxes, 0), 4);
  assert.deepEqual(rewards.flatMap(r => Object.keys(r.items)).sort(), [...schedule.itemOrder].sort());
  for (const r of rewards) {
    const weekday = (r.day - 1) % 7 + 1;
    const hours = r.goldHours + r.troopHours;
    assert.equal(r.commonGearBoxes, weekday === 7 ? 1 : 0);
    assert.ok(weekday < 5 ? hours >= 2 && hours <= 6 : weekday < 7 ? hours >= 8 && hours <= 13 : hours === 16 || hours === 20);
    if (weekday === 6) assert.equal(Object.keys(r.items).length, 1);
  }
}
let attendance = model.sync({}, utc("2026-09-01"));
assert.equal(attendance.state.earnedThroughDay, 1);
assert.deepEqual(model.sync(attendance.state, utc("2026-09-01")).state, attendance.state);
attendance = model.sync(attendance.state, utc("2026-09-02"));
attendance = model.sync(attendance.state, utc("2026-09-09"));
assert.equal(model.pending(attendance.state), 2);
assert.equal(attendance.state.deferredAttendanceDayKey, "2026-09-09");
attendance = model.sync({ ...attendance.state, nextDay: 2, nextClaimOrdinal: 2, totalClaims: 1 }, utc("2026-09-09"));
assert.equal(attendance.state.earnedThroughDay, 3);
assert.equal(attendance.state.deferredAttendanceDayKey, "");
const afterMonth = model.normalize(attendance.state, utc("2028-02-29"));
assert.deepEqual(afterMonth, attendance.state, "A calendar or season change must preserve the entire cycle and guards.");
const beforeEnd = { ...attendance.state, nextDay: 28, earnedThroughDay: 28, nextClaimOrdinal: 28, totalClaims: 27 };
const finished = { ...beforeEnd, nextDay: 29, nextClaimOrdinal: 29, totalClaims: 28, lastReceipt: { claimId: "final" } };
let next = model.sync(finished, utc("2026-09-09")).state;
assert.equal(next.cycle, 2); assert.equal(next.nextDay, 1); assert.equal(model.pending(next), 0);
assert.equal(next.lastReceipt.claimId, "final");
assert.notEqual(next.cycleId, beforeEnd.cycleId);
assert.notDeepEqual(next.schedule, beforeEnd.schedule);
const deferredEnd = model.sync(beforeEnd, utc("2026-09-10")).state;
assert.equal(deferredEnd.deferredAttendanceDayKey, "2026-09-10");
next = model.sync({ ...deferredEnd, nextDay: 29, nextClaimOrdinal: 29, totalClaims: 28 }, utc("2026-09-10")).state;
assert.equal(model.pending(next), 1, "Only a genuinely deferred visit can fill the next cycle on rollover.");
assert.equal(model.pending(model.sync(next, utc("2026-09-10")).state), 1);
for (const [month, length] of [["2027-02",28],["2028-02",29],["2026-09",30],["2026-01",31]]) {
  const old = { schemaVersion: 3, monthKey: month, monthLengthDays: length, nextDay: length - 1,
    earnedThroughDay: length, nextClaimOrdinal: 100, totalClaims: 99, lastAttendanceDayKey: "2026-09-09" };
  const migrated = model.normalize(old, utc("2029-01-01"));
  assert.equal(migrated.nextDay, length - 1); assert.equal(model.pending(migrated), 2);
  assert.equal(migrated.cycleLengthDays, length); assert.equal(migrated.nextClaimOrdinal, 100);
  assert.deepEqual(migrated.schedule.map(({commonGearBoxes, ...r}) => r), tracks[String(length)]);
  assert.deepEqual(model.normalize(migrated, utc("2030-01-01")), migrated);
}
const ancient = model.normalize({ schemaVersion: 2, nextDay: 30, nextClaimOrdinal: 60, earnedThroughOrdinal: 60 }, utc("2027-02-01"));
assert.equal(ancient.nextDay, 30); assert.equal(ancient.schedule.length, 30);
assert.throws(() => model.normalize({schemaVersion:4, cycleId:"broken", schedule:[]}), /refusing to reroll/);

requireMatch(read("functions/dailyLoginRewards.js"), /tracksByMonthLength/, "Functions do not load all calendar-month tracks.");
requireMatch(server, /dailyLoginRewardVersion:\s*DAILY_LOGIN_REWARD_SCHEMA_VERSION/, "Realm info does not advertise monthly rewards.");
requireMatch(server, /createFreshResetPlayerProfile[\s\S]*dailyLoginReward:\s*DAILY_LOGIN\.store\(normalizeDailyLoginRewardState\(previous\.dailyLoginReward, nowMs\)\)/, "Fresh reset profiles do not initialize daily rewards.");
requireMatch(server, /expectedCycleId !== statusBefore\.cycleId[\s\S]*new cycle/, "Stale cross-month claims are not rejected.");
requireMatch(server, /expectedOrdinal !== statusBefore\.nextClaimOrdinal[\s\S]*Daily rewards changed/, "Stale multi-device claims are not rejected.");
requireMatch(server, /nextDay:\s*claimedPosition\.day \+ 1[\s\S]*syncDailyLoginRewardAttendance\(claimedState,\s*nowMs\)/, "Claims do not consume the oldest reward and fill deferred attendance.");
requireMatch(server, /getRewardedAdBaseRates\(economy\)[\s\S]*reward\.goldHours[\s\S]*reward\.troopHours/, "Daily claims do not use permanent base production rates.");
requireMatch(server, /creditLevelUpTroopsToMainCity\(economy,[\s\S]*dailyLoginReward:\s*DAILY_LOGIN\.store\(nextState\)/, "Daily troops are not credited atomically.");
requireMatch(emulatorResetGate, /buildDailyRewardClaimRequest[\s\S]*expectedCycleId/, "Emulator claims do not use the authoritative UTC month guard.");
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
requireMatch(game, /expectedCycleId:\s*dailyLoginRewardStatus\.cycleId/, "Client claims are not guarded by UTC month.");
requireMatch(game, /CrownlandsDailyLoginUI\.mount/, "UI does not select the live month-length track.");
requireMatch(game, /getDailyLoginRewardCardState[\s\S]*"queued"[\s\S]*getDailyLoginRewardPresentation/, "Reward cards lost their queue states.");
requireMatch(game, /startLoginPresentationDailyRefresh\(presentationGeneration\)[\s\S]*?markLoginPresentationMapReady\(presentationGeneration\)/, "Startup does not route attendance through the login presentation sequence.");
requireMatch(game, /visibilitychange[\s\S]*handleGameForegroundSignal/, "Visible sessions do not refresh attendance.");
const rewardTabsSource = game.slice(
  game.indexOf("function renderDailyRewardModalTabs()"),
  game.indexOf("function bindDailyRewardModalTabs()")
);
const rewardModalSource = game.slice(
  game.indexOf("function renderDailyLoginRewardModal("),
  game.indexOf("async function showDailyLoginRewardsModal")
);
requireMatch(rewardTabsSource, /role="tablist"[\s\S]*aria-label="Daily rewards, quests, and achievements"[\s\S]*aria-selected[\s\S]*aria-controls/, "The reward modal is missing its accessible icon tabs.");
requireMatch(rewardTabsSource, /reward-daily-login-r1\.svg[\s\S]*reward-daily-quests-r1\.svg[\s\S]*reward-achievements-r1\.svg/, "Reward tabs must use the approved medieval calendar, scroll, and crowned-shield artwork.");
requireMatch(rewardTabsSource, /aria-label="\$\{accessibleLabel\}" title="\$\{tab\.label\}"[\s\S]*<img[^>]*alt=""[^>]*>[\s\S]*<\/button>/, "Reward tabs must be icon-only while retaining names, claim alerts, and tooltips.");
requireMatch(game, /\["ArrowLeft", "ArrowRight", "Home", "End"\][\s\S]*activateTab/, "Reward tabs lost keyboard arrow, Home, or End navigation.");
requireMatch(html, /id="modalTitle"[\s\S]*id="modalHeaderNav" class="modal-header-nav" hidden[\s\S]*id="modalBody"/, "The shared modal is missing its unclipped header navigation slot.");
requireMatch(game, /modalHeaderNav\.innerHTML = renderDailyRewardModalTabs\(\)[\s\S]*modalHeaderNav\.hidden = false/, "Reward navigation is not mounted in the shared header slot.");
requireMatch(game, /modalHeaderNav\?\.querySelectorAll\("\[data-daily-reward-tab\]"\)[\s\S]*modalHeaderNav\?\.querySelector/, "Reward tab binding or focus escaped the shared header slot.");
requireMatch(game, /modalHeaderNav\.hidden = true[\s\S]*modalHeaderNav\.replaceChildren\(\)/, "Closing the shared modal does not clear its header navigation.");
requireMatch(game, /async function showDailyLoginRewardsModal[\s\S]*options\.initialTab[\s\S]*:\s*"rewards"/, "Opening the modal no longer defaults to Daily Login or accept direct tab navigation.");
requireMatch(game, /function renderDailyMissionSection[\s\S]*dailyMissionsList[\s\S]*function renderDailyQuestTab[\s\S]*renderDailyMissionSection\(\)/, "Player Daily Missions are not rendered in the reward modal's Quests tab.");
requireMatch(game, /function bindDailyQuestControls[\s\S]*handleDailyMissionListClick/, "Daily Mission controls are not connected inside the reward modal.");
requireMatch(rewardModalSource, /CrownlandsDailyLoginUI\.mount[\s\S]*claim: claimDailyLoginReward/, "Daily Login must use the approved presentation with the authoritative claim action.");
requireMatch(read("daily-login-ui.js"), /common-gear-chest-r1\.svg/, "The approved chest art is missing.");
const clanRewardsPanelSource = game.slice(
  game.indexOf("function renderClanRewardsPanel()"),
  game.indexOf("function getRallyParticipantForCurrentPlayer")
);
assert.match(clanRewardsPanelSource, /renderClanQuestPanel/, "Clan Weekly Conquest is missing from the Player Profile Clan Rewards panel.");
requireMatch(styles, /\.daily-login-reward-btn[\s\S]*dailyRewardHudGlow/, "Daily reward HUD styles are incomplete.");
requireMatch(styles, /\.daily-login-reward-modal \.modal-card #modalBody\s*\{[\s\S]*?overflow:\s*hidden/, "Daily rewards can still scroll inside the modal.");
requireMatch(styles, /\.daily-reward-grid\s*\{[\s\S]*repeat\(8,[\s\S]*overflow:\s*hidden[\s\S]*@media \(max-width: 700px\)[\s\S]*repeat\(7,[\s\S]*@media \(max-height: 640px\) and \(orientation: landscape\)[\s\S]*repeat\(8,/, "Daily reward grid must fit desktop, portrait phone, and short-landscape viewports without scrolling.");
requireMatch(styles, /\.daily-reward-card\s*\{[\s\S]*min-height:\s*0[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\) auto/, "Reward cards are not constrained to image-and-amount rows.");
requireMatch(styles, /\.daily-reward-card\.claimed\s*\{[\s\S]*rgba\(85, 97, 61,[\s\S]*\.daily-reward-card\.claimed::after\s*\{[\s\S]*content:\s*"✓"[\s\S]*radial-gradient\(circle at 45% 38%, #7f372e, #4f1d1c\)/, "Collected cards lost their moss frame or wax-seal check treatment.");
requireMatch(styles, /\.daily-reward-card-day\s*\{[\s\S]*position:\s*absolute[\s\S]*top:\s*\.14rem[\s\S]*font-size:\s*clamp\(\.45rem, \.82vw, \.58rem\)/, "Visible Daily Reward day numbers are missing or can overflow compact cards.");
requireMatch(styles, /\.daily-reward-card\.available\s*\{[\s\S]*border-color:\s*rgba\(110, 47, 53, \.82\)[\s\S]*rgba\(110, 47, 53, \.16\)/, "Claimable cards lost their oxblood-and-parchment highlight treatment.");
requireMatch(styles, /@keyframes dailyRewardClaimPulse[\s\S]*rgba\(110, 47, 53, \.12\)[\s\S]*rgba\(110, 47, 53, \.2\)/, "Claimable-card pulse no longer uses the subdued oxblood treatment.");
requireMatch(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.daily-reward-card\.available[\s\S]*animation:\s*none/, "Claimable-card motion is not disabled for reduced-motion users.");
requireMatch(styles, /\.daily-login-reward-modal \.modal-header-nav\s*\{[\s\S]*position:\s*absolute[\s\S]*z-index:\s*7[\s\S]*right:\s*calc\([\s\S]*--daily-header-close-size[\s\S]*--daily-header-control-gap[\s\S]*pointer-events:\s*auto/, "Reward navigation is not layered above the header with calculated close-button clearance.");
requireMatch(styles, /\.daily-reward-tabs\s*\{[\s\S]*position:\s*static[\s\S]*z-index:\s*auto[\s\S]*repeat\(3,\s*44px\)[\s\S]*gap:\s*1\.2rem[\s\S]*\.daily-reward-tabs button:focus-visible[\s\S]*outline:/, "Desktop icon tabs are not aligned inside the unclipped header slot with a visible focus state.");
requireMatch(styles, /@media \(max-width: 700px\)[\s\S]*--daily-header-nav-width:\s*calc\(114px \+ 1\.8rem\)[\s\S]*\.daily-reward-tabs\s*\{[\s\S]*repeat\(3,\s*38px\)[\s\S]*gap:\s*\.9rem/, "Portrait icon tabs no longer preserve calculated clearance from the close button.");
requireMatch(styles, /@media \(max-height: 640px\) and \(orientation: landscape\)[\s\S]*--daily-header-close-size:\s*40px[\s\S]*\.daily-reward-tabs\s*\{[\s\S]*repeat\(3,\s*34px\)[\s\S]*gap:\s*\.75rem/, "Short-landscape icon tabs no longer fit the compact shared header.");
requireMatch(styles, /\.daily-login-reward-modal \.modal-close\s*\{[\s\S]*z-index:\s*8[\s\S]*top:\s*var\(--daily-header-block-inset\)[\s\S]*right:\s*var\(--daily-header-inline-inset\)[\s\S]*place-items:\s*center[\s\S]*padding:\s*0/, "The close button is not centered and inset above the reward navigation.");
requireMatch(html, /daily-rewards\.css\?v=20260819-targeted-ui-contrast-r2/, "The page does not request the refreshed Daily Rewards stylesheet version.");
requireMatch(read("docs/visual-qa/daily-rewards-navigation/index.html"), /mobile-viewport\.css[\s\S]*Daily Login[\s\S]*Quests[\s\S]*Achievements/, "The responsive reward-navigation visual QA fixture is missing or incomplete.");
requireMatch(
  serviceWorker,
  /function isNetworkFirstAsset[\s\S]*?\.endsWith\("\.css"\)[\s\S]*?if \(isNetworkFirstAsset\(url\)\)[\s\S]*?networkFirst\(request, null, event\)/,
  "The service worker does not runtime-cache the refreshed Daily Rewards stylesheet."
);
assert.doesNotMatch(html, /id="dailyMissionsSection"/, "Daily Missions are still embedded in the Player Profile UI.");
assert.doesNotMatch(`${html}\n${styles}`, /profile-dashboard/, "The removed profile dashboard structure or compact CSS returned.");
requireMatch(html, /economy-config\.js\?v=20260904-layer1-travel-balance-r1/, "Frontend does not load the current economy release.");
requireMatch(serviceWorker, /economy-config\.js\?v=20260904-layer1-travel-balance-r1/, "Offline shell does not cache the current economy release.");
requireMatch(rules, /'dailyLoginReward'/, "Firestore rules do not protect daily reward state.");
requireMatch(
  read("tools/validate-clan-callable-access.js"),
  /"getDailyLoginRewardStatus"[\s\S]*"claimDailyLoginReward"/,
  "Deployment callable-access gate must include daily reward endpoints."
);

console.log("Validated persistent 28-day cycles, saved-track migration, attendance and replay guards, the Daily Missions quest tab, and Clan Rewards placement for Weekly Conquest.");

const protectedCycle = model.store(attendance.state);
const staleHandlerWrite = { ...protectedCycle, schemaVersion: 3, cycle: 1, nextDay: 1, earnedThroughDay: 0, lastAttendanceDayKey: "" };
assert.deepEqual(model.normalize(staleHandlerWrite, utc("2030-01-01")), attendance.state, "Older status writes cannot destroy a persisted cycle.");
assert.equal(model.sync(protectedCycle, utc("2026-09-09")).changed, false, "Unchanged status reads must not rewrite the player document.");

assert.ok(html.indexOf('<script src="daily-login-ui.js') < html.indexOf('<script src="game.js'), "The reward UI must initialize before game startup.");
assert.doesNotMatch(html, /<script[^>]*daily-login-ui\.js[^>]*defer/, "Ordered reward UI initialization must not race cached game startup.");
