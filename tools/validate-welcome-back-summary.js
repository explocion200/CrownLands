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
const ledger = require("../reward-ledger-ui.js");

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
const receiptMarkup = ledger.renderOffline({ goldGained: 123456789, troopsGained: 80 }, { gold: "gold.webp", troops: "troops.webp" }, {
  elapsedText: "3m", lostCities: [{ name: '<img src=x onerror="fail()">', regionLabel: "Northern realm" }], totalLost: 3,
});
assert(receiptMarkup.includes("+123,456,789") && receiptMarkup.includes("+80"), "The receipt must retain exact totals.");
assert(receiptMarkup.includes("2 additional city names unavailable."), "Unlisted losses must stay visible.");
assert(!receiptMarkup.includes('<img src=x'), "Player city names must remain escaped.");
assert(receiptMarkup.includes("&lt;img"), "Escaped city names must remain readable.");
assert(!receiptMarkup.includes("No cities lost"), "A loss receipt must not claim safety.");

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

// Exercise the real summary builders, rather than only checking their call sites.
sandbox.getServerWorldCityNode = (regionId, id) => ({ id, regionId, name: id, kind: "city" });
sandbox.getServerCanonicalCityName = city => city.name || city.id;
sandbox.timestampToMs = value => Number(value) || 0;
sandbox.isStronghold = () => false;
for (const name of [
  "getReinforcementTargetKey",
  "consumePendingAwayCityTroops",
  "createWelcomeBackLostCityList",
  "createWelcomeBackSummary",
]) vm.runInContext(extractFunction(serverSource, name), sandbox, { filename: serverPath });

const cityEntry = (id, regionId, troops) => ({ city: { id, regionId, troops } });
const lossEvent = (id, regionId = "center", reason = "city_captured", targetType = "city") => ({
  data: () => ({ targetId: id, regionId, reason, targetType, createdAtMs: nowMs - 1 }),
});
const returnSession = {
  sessionId: "returning",
  sessionStartedAtMs: nowMs,
  awayStartedAtMs: nowMs - 180_000,
  eligible: true,
};
const returnEconomy = {
  pendingAwayProduction: {
    goldGained: 123456789,
    troopsByCity: { "city:center:kept": 80, "city:north:kept": 30, "city:center:lost": 900 },
  },
  cityEntries: [cityEntry("kept", "center", 50), cityEntry("kept", "north", 90)],
};
const losses = { docs: [
  lossEvent("lost"), lossEvent("lost"), // repeated capture history is one lost city
  lossEvent("kept"), // recaptured: currently owned, so no longer lost
  lossEvent("lost", "north"), // same local ID, different map
  lossEvent("released", "center", "inactivity_surrender"),
  lossEvent("camp", "center", "city_captured", "camp"),
] };
const returnSummary = sandbox.createWelcomeBackSummary(returnEconomy, returnSession, losses);
assert.equal(returnSummary.elapsedSeconds, 180, "Away time must use the session boundaries.");
assert.equal(returnSummary.goldGained, 123456789, "Summary Gold must preserve the recorded integer total.");
assert.equal(returnSummary.troopsGained, 80, "Only surviving troops in currently owned cities may appear.");
assert.equal(returnSummary.lostCityCount, 2, "Lost-city reporting must deduplicate by city and map and exclude retaken cities.");
assert.equal(returnSummary.lostCities.length, 2);
assert.deepEqual(Array.from(returnSummary.lostCities, city => city.regionId).sort(), ["center", "north"]);
assert.equal(sandbox.createWelcomeBackSummary(returnEconomy, null, losses), null);
assert.equal(sandbox.createWelcomeBackSummary({
  ...returnEconomy, cityEntries: [],
}, returnSession, losses).troopsGained, 0, "Lost-city troops must never be included.");

const manyLosses = { docs: Array.from({ length: 55 }, (_, index) => lossEvent(`lost-${index}`)) };
const manySummary = sandbox.createWelcomeBackSummary({ cityEntries: [], pendingAwayProduction: {} }, returnSession, manyLosses);
assert.equal(manySummary.lostCityCount, 55, "The total must survive the 50-name response limit.");
assert.equal(manySummary.lostCities.length, 50);

const defended = {
  profilePatch: { pendingAwayProduction: { troopsByCity: { "city:center:kept": 80 } } },
  profileAfter: {},
};
sandbox.consumePendingAwayCityTroops(defended, { id: "kept", regionId: "center" }, 25);
assert.equal(defended.profilePatch.pendingAwayProduction.troopsByCity["city:center:kept"], 55);
assert.equal(defended.profileAfter.pendingAwayProduction.troopsByCity["city:center:kept"], 55);
sandbox.consumePendingAwayCityTroops(defended, { id: "kept", regionId: "center" }, 100);
assert.equal(defended.profilePatch.pendingAwayProduction.troopsByCity["city:center:kept"], undefined,
  "Defensive losses cannot leave negative away-produced troops.");
defended.profilePatch.pendingAwayProduction.troopsByCity["city:center:kept"] = 80;
sandbox.consumePendingAwayCityTroops(defended, { id: "kept", regionId: "center" }, 0, { captured: true });
assert.equal(defended.profilePatch.pendingAwayProduction.troopsByCity["city:center:kept"], undefined,
  "Capture must remove the city's entire away-produced troop balance.");

const displayedSummaries = [];
const clientSandbox = {
  addLog() {},
  formatNumber: value => String(value),
  queueOfflineRewardsSummary: summary => displayedSummaries.push(summary),
};
vm.createContext(clientSandbox);
vm.runInContext(extractFunction(clientSource, "applyServerEconomyResult"), clientSandbox, { filename: "game.js" });
const displayOptions = { requestWelcomeBack: true, showOfflineRewards: true, render: false };
const noEarningsLoss = { elapsedSeconds: 60, goldGained: 0, troopsGained: 0, lostCityCount: 2, lostCities: [] };
clientSandbox.applyServerEconomyResult({ awaySummary: noEarningsLoss }, displayOptions);
assert.equal(displayedSummaries.length, 1, "Zero earnings must not hide lost cities.");
assert.equal(displayedSummaries[0].lostCityCount, 2);
clientSandbox.applyServerEconomyResult({ awaySummary: { ...noEarningsLoss, lostCityCount: 0 } }, displayOptions);
clientSandbox.applyServerEconomyResult({ awaySummary: { ...noEarningsLoss, elapsedSeconds: 59 } }, displayOptions);
clientSandbox.applyServerEconomyResult({ awaySummary: returnSummary }, { ...displayOptions, requestWelcomeBack: false });
clientSandbox.applyServerEconomyResult({ awaySummary: returnSummary }, { ...displayOptions, showOfflineRewards: false });
assert.equal(displayedSummaries.length, 1, "Empty, short, hidden, or ordinary map refresh summaries must not open the modal.");
clientSandbox.applyServerEconomyResult({
  awaySummary: returnSummary,
  production: { elapsedSeconds: 999, goldGained: 999, troopsGained: 999 },
}, { ...displayOptions, resumeCatchUp: true });
assert.equal(displayedSummaries[1].goldGained, returnSummary.goldGained, "Welcome Back must prefer the authoritative away receipt.");
assert.equal(displayedSummaries[1].elapsed, 180);
assert.equal(displayedSummaries[1].troopsGained, 80);

vm.runInContext(extractFunction(clientSource, "mergeOfflineRewardsSummaries"), clientSandbox, { filename: "game.js" });
const lossReceipt = (cities, count = cities.length) => ({
  goldGained: 10, troopsGained: 5, elapsed: 60, lostCities: cities, lostCityCount: count,
});
const knownLoss = { id: "lost", regionId: "center", name: "Ashford" };
const mergedSameCity = clientSandbox.mergeOfflineRewardsSummaries(lossReceipt([knownLoss]), lossReceipt([knownLoss]));
assert.equal(mergedSameCity.lostCities.length, 1);
assert.equal(mergedSameCity.lostCityCount, 1, "Queued receipts must not count the same named lost city twice.");
assert.equal(mergedSameCity.goldGained, 20, "Separate production intervals must still add together.");
assert.equal(mergedSameCity.troopsGained, 10);
assert.equal(mergedSameCity.elapsed, 120);
const differentMaps = clientSandbox.mergeOfflineRewardsSummaries(
  lossReceipt([knownLoss]), lossReceipt([{ ...knownLoss, regionId: "north" }]),
);
assert.equal(differentMaps.lostCities.length, 2, "Local city IDs from different maps must remain distinct.");
assert.equal(differentMaps.lostCityCount, 2);
const partialLists = clientSandbox.mergeOfflineRewardsSummaries(lossReceipt([knownLoss], 3), lossReceipt([knownLoss], 2));
assert.equal(partialLists.lostCityCount, 4, "Known overlaps must be removed without discarding unlisted losses.");

// Execute the real callable with an in-memory transaction boundary. This checks
// session binding and saved-receipt retries; it is not a Firestore concurrency test.
async function validateWelcomeBackRetry() {
  let membership = { welcomeBack: { ...returnSession } };
  let currentEconomy = returnEconomy;
  let lossReads = 0;
  const writes = [];
  const membershipRef = { kind: "membership" };
  const query = {
    kind: "losses", where() { return this; }, orderBy() { return this; },
  };
  const transaction = {
    async get(ref) {
      if (ref.kind === "membership") return { exists: true, data: () => membership };
      lossReads += 1;
      return losses;
    },
    set(ref, patch) { assert.equal(ref, membershipRef); membership = { ...membership, ...patch }; },
  };
  Object.assign(sandbox, {
    exports: {},
    timedCallable: (_name, _options, handler) => handler,
    requireAuth: () => "fixture-player",
    requireGameServerSessionId: id => id,
    getRealmStorageId: () => "fixture-realm",
    db: { doc: () => membershipRef, collection: () => query },
    runTransactionWithInfrastructureRetry: callback => callback(transaction),
    prepareEconomyCollection: async () => currentEconomy,
    writePreparedEconomy: (_transaction, _economy, patch) => writes.push(patch),
    createEconomyResponse: (_economy, meta) => ({ ok: true, ...meta }),
  });
  const start = serverSource.indexOf('exports.collectEconomy = timedCallable(');
  const end = serverSource.indexOf('\nexports.getDailyLoginRewardStatus', start);
  assert(start >= 0 && end > start);
  vm.runInContext(serverSource.slice(start, end), sandbox, { filename: serverPath });
  const request = { data: { includeWelcomeBack: true, sessionId: "returning" } };
  const first = await sandbox.exports.collectEconomy(request);
  assert.equal(first.awaySummary.goldGained, 123456789);
  assert.equal(membership.welcomeBack.eligible, false, "Successful collection must consume eligibility.");
  assert(membership.welcomeBack.claimedAtMs > 0);
  assert.equal(writes[0].pendingAwayProduction.goldGained, 0);
  assert.equal(Object.keys(writes[0].pendingAwayProduction.troopsByCity).length, 0);
  currentEconomy = { cityEntries: [], pendingAwayProduction: { goldGained: 999 } };
  const retry = await sandbox.exports.collectEconomy(request);
  assert.deepEqual(retry.awaySummary, first.awaySummary, "Retry must return the saved receipt, not recompute the reward.");
  assert.equal(lossReads, 1, "A receipt retry must not collect city losses again.");
  const wrongSession = await sandbox.exports.collectEconomy({
    data: { includeWelcomeBack: true, sessionId: "other-session" },
  });
  assert.equal(wrongSession.awaySummary, undefined, "A different session cannot receive this receipt.");
  const ordinary = await sandbox.exports.collectEconomy({ data: {} });
  assert.equal(ordinary.awaySummary, undefined, "An ordinary economy refresh cannot request Welcome Back.");
}

validateWelcomeBackRetry()
  .then(() => console.log("Validated Welcome Back session retries, surviving troop totals, captured/retaken cities, exact counts, and production summary guards."))
  .catch(error => { console.error(error); process.exitCode = 1; });
