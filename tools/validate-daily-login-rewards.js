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
assert.equal(schedule.schemaVersion, 1, "Daily login reward schema must be version 1.");
assert.equal(schedule.cycleLengthDays, 30, "Daily login reward cycle must contain 30 days.");
assert.equal(schedule.days.length, 30, "Daily login reward schedule is incomplete.");
assert.deepEqual(schedule.days.map(entry => entry.day), Array.from({ length: 30 }, (_, index) => index + 1));
assert.equal(schedule.days.reduce((sum, entry) => sum + entry.goldHours, 0), 95, "Daily gold-hour budget changed.");
assert.equal(schedule.days.reduce((sum, entry) => sum + entry.troopHours, 0), 96, "Daily troop-hour budget changed.");
assert.equal(
  schedule.days.reduce((sum, entry) => (
    sum + Object.values(entry.items || {}).reduce((itemSum, quantity) => itemSum + quantity, 0)
  ), 0),
  15,
  "Daily item budget changed."
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
assert.deepEqual(schedule.days[29], {
  day: 30,
  goldHours: 12,
  troopHours: 12,
  items: {
    shield_12h: 1,
    war_drums_30m: 1,
    royal_tax_decree_30m: 1,
    veil_of_silence_30m: 1,
    swift_march_order: 1,
    recall_horn: 1,
  },
});

requireMatch(server, /DAILY_LOGIN_REWARD_DAYS[\s\S]*dailyLoginRewards[\s\S]*cycleLengthDays/, "Functions do not load the shared 30-day schedule.");
requireMatch(server, /createFreshResetPlayerProfile[\s\S]*dailyLoginReward:\s*createDefaultDailyLoginRewardState\(\)/, "Fresh reset profiles do not initialize daily rewards.");
requireMatch(server, /exports\.getDailyLoginRewardStatus\s*=\s*timedCallable[\s\S]*assertCurrentPlayerProfile[\s\S]*createDailyLoginRewardStatus/, "The authoritative daily status callable is missing.");
requireMatch(
  server,
  /exports\.claimDailyLoginReward\s*=\s*timedCallable[\s\S]*statusBefore\.eligible[\s\S]*replayed:\s*true[\s\S]*prepareEconomyCollection/,
  "Daily claim does not stop before economy reads on a same-day replay."
);
requireMatch(server, /getRewardedAdBaseRates\(economy\)[\s\S]*reward\.goldHours[\s\S]*reward\.troopHours/, "Daily claims do not use permanent base production rates.");
requireMatch(
  server,
  /getCanonicalMainCityEntry\(economy\.profileAfter,\s*economy\.cityEntries\)[\s\S]*mainCityEntry\.city\.resetGeneration[\s\S]*mainCityEntry\.city\.worldId[\s\S]*Verify your current-world main city/,
  "Daily rewards do not reject accounts without a valid current-generation main city."
);
requireMatch(server, /creditLevelUpTroopsToMainCity\(economy,[\s\S]*dailyLoginReward:\s*nextState/, "Daily troop rewards do not credit the canonical main city atomically.");
requireMatch(server, /claimedDay >= DAILY_LOGIN_REWARD_CYCLE_DAYS[\s\S]*claimedCycle \+ 1[\s\S]*nextDay =/, "Day 30 does not roll into the next cycle.");
requireMatch(server, /operationResultMetrics[\s\S]*rewardTypes[\s\S]*itemKinds/, "Daily reward structured workload logging is incomplete.");

requireMatch(client, /getDailyLoginRewardStatus[\s\S]*callServerFunction\("getDailyLoginRewardStatus"/, "Firebase client does not expose daily status.");
requireMatch(client, /claimDailyLoginReward[\s\S]*callServerFunction\("claimDailyLoginReward"/, "Firebase client does not expose daily claims.");
requireMatch(client, /delete cleanProfile\.dailyLoginReward/, "Client profile saves do not strip protected daily reward state.");
requireMatch(client, /dispatch\("daily-login-reward"[\s\S]*profile\.dailyLoginReward/, "Realtime profile updates do not publish daily reward state.");

requireMatch(html, /id="clanHudBtn"[\s\S]*id="dailyLoginRewardBtn"/, "Daily reward icon is not immediately after the clan icon.");
requireMatch(html, /daily-reward-icon\.svg/, "Daily reward art is not loaded by the HUD.");
requireMatch(game, /DAILY_LOGIN_REWARD_AUTO_OPEN_PREFIX[\s\S]*localStorage[\s\S]*showDailyLoginRewardsModal/, "Once-per-device UTC auto-open behavior is missing.");
requireMatch(game, /daily-reward-grid[\s\S]*DAILY_LOGIN_REWARD_DAYS\.map/, "The 30-day reward panel is not rendered from shared configuration.");
requireMatch(game, /data-daily-reward-claim-card[\s\S]*addEventListener\("click",\s*claimDailyLoginReward\)/, "The available day card cannot be clicked to claim its reward.");
requireMatch(game, /refreshDailyLoginRewardStatus\(\{\s*autoOpen:\s*true,\s*silent:\s*true\s*\}\)/, "Gameplay startup does not refresh and auto-open daily rewards.");
requireMatch(game, /visibilitychange[\s\S]*refreshDailyLoginRewardStatus/, "Visible sessions do not refresh daily reward eligibility.");
requireMatch(styles, /\.daily-login-reward-btn[\s\S]*dailyRewardHudGlow/, "Daily reward HUD styles are incomplete.");
requireMatch(styles, /\.daily-login-reward-icon\s*\{[\s\S]*width:\s*86%[\s\S]*height:\s*86%/, "The daily reward HUD artwork was not reduced without shrinking its hit target.");
requireMatch(styles, /button\.daily-reward-card\.available[\s\S]*cursor:\s*pointer/, "The claimable day card does not expose an interactive state.");
requireMatch(styles, /\.daily-reward-grid[\s\S]*@media \(max-width: 430px\)/, "Daily reward responsive panel styles are incomplete.");
requireMatch(serviceWorker, /daily-reward-icon\.svg/, "Daily reward art is not available to the PWA cache.");
requireMatch(rules, /'dailyLoginReward'/, "Firestore rules do not protect daily reward state.");
requireMatch(
  read("tools/validate-clan-callable-access.js"),
  /"getDailyLoginRewardStatus"[\s\S]*"claimDailyLoginReward"/,
  "The deployment callable-access gate must include both daily reward endpoints."
);

console.log("Validated the server-authoritative repeating 30-day daily login reward track.");
