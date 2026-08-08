const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");

function extractFunction(source, name) {
  const regularStart = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 && (regularStart < 0 || asyncStart < regularStart)
    ? asyncStart
    : regularStart;
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      parametersEnd = index;
      break;
    }
  }
  assert.ok(parametersEnd >= 0, `Could not parse ${name} parameters.`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function functionSource(name) {
  return extractFunction(game, name);
}

assert.match(game, /const FOREGROUND_LONG_RESUME_MS = 60 \* 1000;/, "Long foreground catch-up must start after 60 seconds.");
assert.match(game, /const FOREGROUND_RESUME_RETRY_DELAYS_MS = Object\.freeze\(\[2000, 8000\]\);/, "Foreground retries must use the planned 2s and 8s delays.");
for (const eventName of ["visibilitychange", "pagehide", "pageshow", "focus", "freeze", "resume", "online"]) {
  assert.match(game, new RegExp(`addEventListener\\("${eventName}"`), `Missing ${eventName} lifecycle handling.`);
}

const foregroundSync = functionSource("synchronizeForegroundGame");
for (const operation of [
  "refreshServerEconomy(true",
  "refreshAllOwnedCities(true)",
  "loadOnlineRegionCitiesForResolution(targetRegionId)",
  "loadServerReportsOnce()",
  "heartbeatGameServerMembership()",
  "publishOnlinePresence(true)",
  "retryOverdueOnlineArmyResolutions()",
  "renderAll()",
]) {
  assert.ok(foregroundSync.includes(operation), `Foreground synchronization is missing ${operation}.`);
}
assert.ok(
  foregroundSync.includes("awayMs >= FOREGROUND_LONG_RESUME_MS")
    && foregroundSync.includes("longRefresh || onlineRealtimeRecoveryNeeded"),
  "Foreground synchronization does not separate silent short resumes from long/listener recovery."
);

const realtimeRestart = functionSource("restartOnlineRealtimeSubscriptionsForResume");
for (const watcher of [
  "startActiveOnlineIslandSubscription",
  "subscribeOnlineArmyWatchers",
  "subscribeOnlineReinforcements",
  "subscribeOnlineHeldCamps",
  "subscribeOnlineServerReports",
  "subscribeOnlineGlobalStats",
  "subscribeOnlineCrownCitadel",
  "watchGameServerMembership",
  "refreshClanState",
]) {
  assert.ok(realtimeRestart.includes(watcher), `Long resume does not re-arm ${watcher}.`);
}
assert.ok(
  realtimeRestart.includes("clearOnlineArmyWatchers({ clear: false })")
    && realtimeRestart.includes("clearOnlineCrownCitadelWatcher({ clear: false })"),
  "Realtime recovery must preserve cached world state until replacement snapshots arrive."
);

const localCatchUp = functionSource("applyLocalForegroundCatchUp");
assert.ok(
  localCatchUp.includes("pendingOfflineProgressSeconds")
    && localCatchUp.includes("applyPendingOfflineProgress({ showSummary: awayMs >= FOREGROUND_LONG_RESUME_MS })"),
  "Non-authoritative sessions do not reuse the offline production path."
);

const economyContext = {
  state: {},
  ONLINE_WORLD_ID: "world",
  RESET_GENERATION: "reset",
  serverEconomyRefreshInFlight: false,
  serverEconomyRefreshQueued: false,
  serverEconomyRefreshPromise: null,
  serverEconomyRefreshActiveOptions: null,
  serverEconomyRefreshQueuedOptions: null,
  serverEconomyLastSyncAt: 0,
  serverEconomyLastToastAt: 0,
  onlineLastError: "",
  usesServerEconomyAuthority: () => true,
  updateOnlineUi: () => {},
  showToast: () => {},
  console,
};
const economyRequests = [];
const appliedResults = [];
economyContext.getOnlineApi = () => ({
  collectEconomy: () => new Promise(resolve => economyRequests.push(resolve)),
});
economyContext.applyServerEconomyResult = (result, options) => appliedResults.push({ result, options });
vm.createContext(economyContext);
for (const name of [
  "mergeServerEconomyRefreshOptions",
  "performServerEconomyRefresh",
  "refreshServerEconomy",
]) {
  vm.runInContext(functionSource(name), economyContext, { filename: "game.js" });
}

async function validateAsyncBehavior() {
  const initialRefresh = economyContext.refreshServerEconomy(false, { renderCities: false });
  const resumeRefresh = economyContext.refreshServerEconomy(true, { showOfflineRewards: true });
  assert.equal(initialRefresh, resumeRefresh, "Concurrent economy callers must share one draining promise.");
  assert.equal(economyRequests.length, 1, "Resume started a duplicate economy request before the active request settled.");

  economyRequests[0]({ ok: true, production: { goldGained: 120, troopsGained: 45, elapsedSeconds: 1200 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(economyRequests.length, 2, "A forced resume during a poll must queue exactly one follow-up request.");
  assert.equal(appliedResults[0].options.showOfflineRewards, true, "The active economy result lost the queued Welcome Back option.");

  economyRequests[1]({ ok: true, production: { goldGained: 0, troopsGained: 0, elapsedSeconds: 0 } });
  assert.equal(await initialRefresh, true, "The shared economy drain did not report success.");
  assert.equal(economyContext.serverEconomyRefreshInFlight, false, "Economy refresh remained locked after draining.");

  let nowMs = 1_201_000;
  let nextTimerId = 1;
  const timers = new Map();
  let performedResumes = 0;
  const lifecycleContext = {
    Date: { now: () => nowMs },
    document: { visibilityState: "visible" },
    window: {
      setTimeout: callback => {
        const id = nextTimerId++;
        timers.set(id, callback);
        return id;
      },
      clearTimeout: id => timers.delete(id),
    },
    FOREGROUND_LONG_RESUME_MS: 60_000,
    FOREGROUND_RESUME_COALESCE_MS: 150,
    gameBackgroundedAtMs: 1000,
    foregroundResumeAwayMs: 0,
    foregroundResumeLongRefresh: false,
    foregroundResumeRequested: false,
    foregroundResumeInFlight: null,
    foregroundResumeCoalesceTimer: 0,
    foregroundResumeRetryTimer: 0,
    foregroundResumeRetryIndex: 0,
    onlineRealtimeRecoveryNeeded: false,
    performGameForegroundResume: () => { performedResumes += 1; },
  };
  vm.createContext(lifecycleContext);
  vm.runInContext(functionSource("scheduleGameForegroundResume"), lifecycleContext, { filename: "game.js" });
  assert.equal(lifecycleContext.scheduleGameForegroundResume("visibilitychange"), true);
  assert.equal(lifecycleContext.foregroundResumeLongRefresh, true, "A 20-minute suspension was not classified as a long resume.");
  assert.equal(lifecycleContext.scheduleGameForegroundResume("focus"), true);
  assert.equal(timers.size, 1, "Foreground event burst was not coalesced into one timer.");
  [...timers.values()][0]();
  assert.equal(performedResumes, 1, "Foreground event burst executed more than one resume.");

  const shownSummaries = [];
  const modalContext = {
    modal: { open: true },
    pendingOfflineRewardsSummary: null,
    screenRewardAnimationBlockUntilMs: 0,
    showOfflineRewardsModal: summary => shownSummaries.push(summary),
    window: { setTimeout: callback => callback() },
    Date,
    Map,
    Math,
    Number,
    String,
  };
  vm.createContext(modalContext);
  for (const name of ["mergeOfflineRewardsSummaries", "deferWhileScreenRewardAnimationRuns", "queueOfflineRewardsSummary", "showPendingOfflineRewardsSummary"]) {
    vm.runInContext(functionSource(name), modalContext, { filename: "game.js" });
  }
  modalContext.queueOfflineRewardsSummary({ goldGained: 10, troopsGained: 5, elapsed: 60, lostCities: [] });
  assert.equal(shownSummaries.length, 0, "Welcome Back summary replaced an active command modal.");
  modalContext.modal.open = false;
  assert.equal(modalContext.showPendingOfflineRewardsSummary(), true);
  assert.equal(shownSummaries.length, 1, "Deferred Welcome Back summary was not shown after the modal closed.");
}

validateAsyncBehavior()
  .then(() => console.log("Validated coalesced foreground resume, authoritative catch-up, listener recovery, retries, and safe summaries."))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
