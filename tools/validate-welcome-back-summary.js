const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "functions", "index.js");
const serverSource = fs.readFileSync(serverPath, "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const indexes = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"));
const readabilitySource = fs.readFileSync(path.join(root, "readability.css"), "utf8");
const profileThemeSource = fs.readFileSync(path.join(root, "profile-theme.css"), "utf8");
const paletteSource = fs.readFileSync(path.join(root, "crownlands-palette.css"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

requireMatch(extractFunction(clientSource, "showOfflineRewardsModal"), /modal\.className\s*=\s*"modal offline-reward-modal";/, "Welcome Back can retain stale modal colors or scrolling behavior.");
requireMatch(extractFunction(clientSource, "showGameServerInactivityNotice"), /modal\.className\s*=\s*"modal offline-reward-modal";/, "The inactivity Welcome Back notice can retain stale modal styling.");
requireMatch(readabilitySource, /\.offline-reward-modal \.modal-card\s*\{[\s\S]*?color:\s*#f4ead4;[\s\S]*?background:\s*linear-gradient\(180deg, #123b56, #0b2031 70%, #071722\);/, "Welcome Back lacks a readable dark modal surface.");
requireMatch(readabilitySource, /\.offline-reward-modal \.offline-reward-grid > div\s*\{[\s\S]*?background:\s*linear-gradient\(180deg, #153d55, #0b2639\);/, "Welcome Back production cards lack readable contrast.");
requireMatch(readabilitySource, /\.offline-reward-modal \.offline-collect-btn\s*\{[\s\S]*?color:\s*#fff8e8 !important;[\s\S]*?border:\s*2px solid #c69a45 !important;[\s\S]*?background:\s*linear-gradient\(180deg, #72363a, #542728\) !important;/, "Welcome Back Collect does not use the prominent burgundy, gold, and ivory primary-action treatment.");
for (const source of [profileThemeSource, paletteSource]) {
  requireMatch(source, /:not\(\.offline-collect-btn\)/, "A generic modal button rule can still repaint Welcome Back Collect as a secondary parchment control.");
}

const sandbox = {
  WELCOME_BACK_SUMMARY_VERSION: 1,
  WELCOME_BACK_MIN_AWAY_MS: 60_000,
  PENDING_AWAY_PRODUCTION_CITY_LIMIT: 320,
  Math,
  Number,
  Object,
  Date,
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  safeString(value, maxLength = 160) {
    return String(value || "").trim().slice(0, maxLength);
  },
  normalizeRegionId(value = "") {
    return String(value || "center").trim().toLowerCase() || "center";
  },
};
vm.createContext(sandbox);
vm.runInContext(
  `${extractFunction(serverSource, "normalizeWelcomeBackSession")};`
  + `${extractFunction(serverSource, "createWelcomeBackSession")};`
  + `${extractFunction(serverSource, "createEmptyPendingAwayProduction")};`
  + `${extractFunction(serverSource, "getIntegerProductionGain")};`
  + `${extractFunction(serverSource, "normalizePendingAwayProduction")};`
  + `${extractFunction(serverSource, "addPendingAwayProduction")};`
  + `${extractFunction(serverSource, "normalizeWelcomeBackSummary")};`
  + "this.normalizeWelcomeBackSession = normalizeWelcomeBackSession;"
  + "this.createWelcomeBackSession = createWelcomeBackSession;"
  + "this.createEmptyPendingAwayProduction = createEmptyPendingAwayProduction;"
  + "this.getIntegerProductionGain = getIntegerProductionGain;"
  + "this.normalizePendingAwayProduction = normalizePendingAwayProduction;"
  + "this.addPendingAwayProduction = addPendingAwayProduction;"
  + "this.normalizeWelcomeBackSummary = normalizeWelcomeBackSummary;",
  sandbox,
  { filename: serverPath }
);

const nowMs = 1_000_000;
const eligible = sandbox.createWelcomeBackSession({
  sessionId: "old-session",
  lastSeenAtMs: nowMs - 60_000,
}, "new-session", nowMs);
assert.equal(eligible.eligible, true, "A new session is not eligible at exactly one minute away.");
assert.equal(eligible.awayStartedAtMs, nowMs - 60_000);

const tooSoon = sandbox.createWelcomeBackSession({
  sessionId: "old-session",
  lastSeenAtMs: nowMs - 59_999,
}, "new-session", nowMs);
assert.equal(tooSoon.eligible, false, "Welcome back appears before one full minute away.");

const sameSession = sandbox.createWelcomeBackSession({
  sessionId: "same-session",
  lastSeenAtMs: nowMs - 300_000,
}, "same-session", nowMs);
assert.equal(sameSession.eligible, false, "Re-entering the same browser session is treated as reopening the game.");

const claimed = sandbox.normalizeWelcomeBackSession({
  welcomeBack: {
    sessionId: "claimed-session",
    sessionStartedAtMs: nowMs,
    awayStartedAtMs: nowMs - 120_000,
    eligible: true,
    claimedAtMs: nowMs + 1,
    summary: { elapsedSeconds: 120, goldGained: 12, troopsGained: 4 },
  },
});
assert.equal(claimed.eligible, false, "A claimed session can reopen the Welcome back panel.");
assert.ok(claimed.summary, "A claimed session does not retain its idempotent summary.");

assert.equal(sandbox.getIntegerProductionGain(100.9, 0.2), 1, "Fractional gold carry is not reflected in the displayed gain.");
assert.equal(sandbox.getIntegerProductionGain(100.1, 0.2), 0, "Fractional production is rounded up before reaching an integer.");
assert.equal(sandbox.getIntegerProductionGain(100.4, 2.8), 3, "Integer production delta is incorrect.");

let pending = sandbox.createEmptyPendingAwayProduction(nowMs - 180_000);
pending = sandbox.addPendingAwayProduction(pending, {
  goldGained: 7,
  troopsByCity: { "city:center:c1": 3 },
  startedAtMs: nowMs - 120_000,
}, nowMs - 60_000);
pending = sandbox.addPendingAwayProduction(pending, {
  goldGained: 5,
  troopsByCity: { "city:center:c1": 2, "city:north:n1": 4 },
}, nowMs);
assert.equal(pending.goldGained, 12, "Away gold is not accumulated across server-side collections.");
assert.equal(pending.troopsByCity["city:center:c1"], 5, "Per-city troop production is not accumulated.");
assert.equal(pending.troopsByCity["city:north:n1"], 4);
assert.equal(pending.observedAtMs, nowMs - 180_000, "The last active production observation is not preserved.");

const normalizedSummary = sandbox.normalizeWelcomeBackSummary({
  elapsedSeconds: 360,
  goldGained: 90,
  troopsGained: 40,
  lostCityCount: 3,
  lostCities: [{ id: "c1", name: "Ashford", regionId: "center", kind: "city", lostAtMs: nowMs }],
});
assert.equal(normalizedSummary.lostCityCount, 3, "The exact lost-city count is replaced by the displayed-list length.");

requireMatch(
  serverSource,
  /createWelcomeBackSession\(priorMembership, sessionId, nowMs\)[\s\S]*?transaction\.set\(membershipRef, \{ welcomeBack \}/,
  "Realm entry does not persist its one-use Welcome back session."
);
requireMatch(
  serverSource,
  /createWelcomeBackLostCityList[\s\S]*?reason[\s\S]*?city_captured/,
  "Welcome back does not filter authoritative ownership history to captured cities."
);
requireMatch(
  serverSource,
  /exports\.collectEconomy[\s\S]*?includeWelcomeBack[\s\S]*?beforeOwnerUid[\s\S]*?pendingAwayProduction:\s*createEmptyPendingAwayProduction/,
  "Economy collection does not atomically consume production and ownership history."
);
requireMatch(
  serverSource,
  /collectionStartedAtMs\s*=\s*Math\.max\(lastProductionAtMs, lastEconomyAtMs\)[\s\S]*?getIntegerProductionGain/,
  "Troop gains are still reported from the older city checkpoint."
);
requireMatch(
  serverSource,
  /heartbeatGameServerForPlayer[\s\S]*?pendingAwayProduction:\s*createEmptyPendingAwayProduction\(nowMs\)/,
  "Active heartbeats do not anchor the away-production window."
);
requireMatch(
  serverSource,
  /pendingGoldStartedAtMs\s*=\s*Math\.max\(lastEconomyAtMs, productionObservedAtMs\)[\s\S]*?pendingCollectionStartedAtMs\s*=\s*Math\.max\(collectionStartedAtMs, productionObservedAtMs\)/,
  "Away production is not trimmed to the last acknowledged active heartbeat."
);
requireMatch(
  serverSource,
  /consumePendingAwayCityTroops\(defenderEconomy,[\s\S]*?defenseAllocation\.ownerLosses,[\s\S]*?captured:\s*result\.success/,
  "Defensive losses and captures do not reduce remaining away-produced troops."
);
requireMatch(
  clientSource,
  /connectOnlineIsland\(activeRegionId,[\s\S]*?allowWelcomeBack:\s*true/,
  "Initial kingdom entry does not opt into Welcome back collection."
);
requireMatch(
  clientSource,
  /async function connectOnlineIsland[\s\S]*?allowWelcomeBack = false[\s\S]*?startActiveOnlineIslandSubscription[\s\S]*?allowWelcomeBack,/,
  "Map connections do not default-deny and forward the Welcome back permission."
);
requireMatch(
  clientSource,
  /function applyActiveOnlineCityPayload[\s\S]*?allowWelcomeBack = false[\s\S]*?shouldRequestWelcomeBack[\s\S]*?requestWelcomeBack:\s*shouldRequestWelcomeBack/,
  "Map connections are not default-denied from opening Welcome back."
);
assert.doesNotMatch(
  clientSource,
  /refreshServerEconomy\(true,\s*\{\s*showOfflineRewards:\s*true\s*\}\)/,
  "A generic map refresh can still open Welcome back."
);
requireMatch(
  clientSource,
  /awaySummary[\s\S]*?awayLostCityCount[\s\S]*?showOfflineRewardsModal/,
  "The client is not rendering the authoritative away summary."
);
requireMatch(
  firebaseClientSource,
  /async function collectEconomy[\s\S]*?sessionId:\s*getActiveSessionId\(\)/,
  "Economy collection does not bind Welcome back to the active browser session."
);
assert.doesNotMatch(
  extractFunction(rulesSource, "validPlayerProfileUpdate"),
  /'pendingAwayProduction'/,
  "Away-production state is writable by clients."
);
assert.ok(
  indexes.indexes.some(index => (
    index.collectionGroup === "ownershipChanges"
    && index.queryScope === "COLLECTION"
    && index.fields.map(field => field.fieldPath).join(",") === "beforeOwnerUid,createdAtMs"
  )),
  "The ownership-history index for lost-city summaries is missing."
);

console.log("Validated one-use Welcome back sessions, authoritative production totals, and captured-city summaries.");
