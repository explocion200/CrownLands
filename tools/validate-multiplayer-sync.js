"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebase = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
function extract(source, name, indent = "") {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, `Missing ${name}`);
  const end = source.indexOf(`\n${indent}}`, match.index);
  assert.ok(end > match.index);
  return source.slice(match.index, end + indent.length + 2);
}

async function validate() {
  for (const kind of ["daily", "seasonal"]) {
    const daily = kind === "daily";
    const prefix = daily ? "dailyMission" : "seasonalAchievement";
    const cycle = daily ? "cycleKey" : "seasonId";
    const subscribe = daily ? "subscribeDailyMissionCycle" : "subscribeSeasonalAchievementCycle";
    const apiSubscribe = daily ? "subscribeDailyMissionState" : "subscribeSeasonalAchievementState";
    const clear = daily ? "clearDailyMissionSubscription" : "clearSeasonalAchievementSubscription";
    const refresh = daily ? "refreshDailyMissionStatus" : "refreshSeasonalAchievementStatus";
    const requests = [];
    const listeners = [];
    let scopeKey = "account-a:session-1";
    let recovery = 0;
    const scope = {
      console: { warn() {} }, Date, Map, Set, Math,
      getOnlineRequestScope: () => scopeKey,
      getOnlineApi: () => ({
        isSignedIn: () => true,
        [apiSubscribe]: (_key, handlers) => { listeners.push(handlers); return () => {}; },
        [daily ? "getDailyMissionStatus" : "getSeasonalAchievementStatus"]: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
      }),
      [prefix + "State"]: { [cycle]: "current", serverTimeMs: 1 },
      [prefix + "Unsubscribe"]: null,
      [prefix + (daily ? "SubscribedCycleKey" : "SubscribedSeasonId")]: "",
      [prefix + "Error"]: "", [prefix + "StatusPromise"]: null,
      [prefix + "StatusLoading"]: false,
      [daily ? "supportsDailyMissions" : "supportsSeasonalAchievements"]: () => true,
      [daily ? "normalizeDailyMissionState" : "normalizeSeasonalAchievementState"]: value => value,
      [daily ? "getDailyMissionNowMs" : "getSeasonalAchievementNowMs"]: () => 1,
      [daily ? "applyDailyMissionStatus" : "applySeasonalAchievementStatus"]: value => { scope[prefix + "State"] = value; return value; },
      markOnlineRealtimeRecoveryNeeded: () => { recovery += 1; },
      renderDailyMissions() {}, updateDailyLoginRewardHudState() {}, showToast() {},
      announceSeasonalAchievementCompletions() {}, seasonalAchievementHydrated: true,
      modal: { open: false }, profileScreen: null,
    };
    vm.createContext(scope);
    for (const name of [clear, subscribe, refresh]) vm.runInContext(extract(game, name), scope);
    scope[subscribe]("current");
    listeners[0].onError(new Error("permission-denied"));
    scope[subscribe]("current");
    assert.equal(listeners.length, 2, `${kind}: a terminated listener blocks reconnect to the same cycle`);
    assert.equal(recovery, 1, `${kind}: listener failure does not request recovery`);

    const older = scope[refresh]({ force: true });
    const newer = scope[refresh]({ force: true });
    requests[1].resolve({ [prefix + "State"]: { [cycle]: "current", value: "new" } });
    await newer;
    requests[0].resolve({ [prefix + "State"]: { [cycle]: "current", value: "old" } });
    await older;
    assert.equal(scope[prefix + "State"].value, "new", `${kind}: an older request overwrites a newer reward state`);
    const retired = scope[refresh]({ force: true });
    scopeKey = "account-b:session-2";
    requests[2].resolve({ [prefix + "State"]: { value: "wrong-account" } });
    await retired;
    assert.equal(scope[prefix + "State"].value, "new", `${kind}: a retired session overwrites reward state`);
  }
  const callbacks = [];
  const client = { user: { uid: "reader" }, activeSessionId: "session", activeSessionActivationGeneration: 1,
    modules: { firestore: { onSnapshot: (_ref, next, error) => { callbacks.push({ next, error }); return () => {}; } } } };
  const snapshotScope = { client, RESET_GENERATION: "current", ONLINE_WORLD_ID: "world", REALM_SHARD_ID: "shard" };
  vm.runInNewContext(extract(firebase, "subscribeScopedSnapshot", "  "), snapshotScope);
  let deliveries = 0;
  const stop = snapshotScope.subscribeScopedSnapshot({}, () => { deliveries++; }, () => { deliveries++; });
  callbacks[0].next({});
  stop(); callbacks[0].next({}); callbacks[0].error({});
  assert.equal(deliveries, 1, "A stopped subscription changed the replacement session");
  snapshotScope.subscribeScopedSnapshot({}, () => { deliveries++; });
  client.activeSessionActivationGeneration++;
  callbacks[1].next({});
  assert.equal(deliveries, 1, "Same-account session takeover delivered old data");
  snapshotScope.subscribeScopedSnapshot({}, () => { deliveries++; });
  snapshotScope.REALM_SHARD_ID = "another";
  callbacks[2].next({});
  assert.equal(deliveries, 1, "Realm rollover delivered old data");

  let reportListener;
  let finishRead;
  const statusText = {}, retry = {}, empty = {};
  const panel = { hidden: true, querySelector: selector => selector === "button" ? retry : statusText };
  const reportScope = {
    state: {}, onlineReportRequestGeneration: 0, onlineReportSyncState: "loading", onlineServerReportsUnsubscribe: null,
    audioServerReportsHydrated: false, battleReportFilter: "all", console: { warn() {} },
    modalBody: { querySelector: selector => selector === "[data-report-sync]" ? panel : empty },
    getOnlineRequestScope: () => "reader:session", withTimeout: value => value,
    getOnlineApi: () => ({ isSignedIn: () => true,
      loadServerReports: () => new Promise((resolve, reject) => { finishRead = { resolve, reject }; }),
      subscribeServerReports: handlers => { reportListener = handlers; return () => {}; },
    }),
    mergeServerReports: () => false, usesServerEconomyAuthority: () => true,
    markOnlineRealtimeRecoveryNeeded() {},
  };
  vm.createContext(reportScope);
  for (const name of ["setOnlineReportSyncState", "clearOnlineServerReportWatcher", "loadServerReportsOnce", "subscribeOnlineServerReports"]) {
    vm.runInContext(extract(game, name), reportScope);
  }
  reportScope.subscribeOnlineServerReports();
  reportListener.onReports([], { fromCache: true });
  assert.equal(panel.hidden, false);
  assert.equal(retry.disabled, false);
  assert.match(empty.textContent, /Waiting/, "Cached empty results incorrectly claim there are no reports");
  const reportRead = reportScope.loadServerReportsOnce();
  assert.equal(retry.disabled, true);
  reportListener.onReports([], { fromCache: false });
  finishRead.reject(new Error("An earlier read failed"));
  assert.equal(await reportRead, true, "A stale request failure invalidated a successful live server read");
  assert.equal(panel.hidden, true);
  assert.equal(reportScope.onlineReportSyncState, "ready");
  reportListener.onError(new Error("permission-denied"));
  assert.equal(panel.hidden, false);
  assert.equal(retry.disabled, false);
  assert.match(statusText.textContent, /reconnecting/);
  const recovery = reportScope.loadServerReportsOnce();
  finishRead.resolve([]);
  assert.equal(await recovery, true);
  assert.equal(panel.hidden, true);

  const verifyPublished = require("./verify-published-report-read");
  const identity = { resetGeneration: "current", worldId: "world", realmShardId: "shard" };
  let closed = 0;
  const probeScope = { window: {
    CROWNLANDS_RELEASE_MANIFEST: { buildId: "build" },
    CrownlandsOnline: { isSignedIn: () => true, getRealmIdentity: () => identity,
      loadServerReports: async () => [identity],
      subscribeServerReports: handlers => { queueMicrotask(() => handlers.onReports([identity], { fromCache: false })); return () => { closed++; }; },
    },
  }, setTimeout, clearTimeout, Date };
  vm.runInNewContext(verifyPublished.toString(), probeScope);
  const receipt = await probeScope.verifyPublishedReportRead("build");
  assert.equal(receipt.authenticated, true); assert.equal(receipt.liveReportCount, 1); assert.equal(closed, 1);
  await assert.rejects(probeScope.verifyPublishedReportRead("wrong-build"), /does not match/);
  probeScope.window.CrownlandsOnline.loadServerReports = async () => [{ ...identity, realmShardId: "foreign" }];
  await assert.rejects(probeScope.verifyPublishedReportRead("build"), /another realm/);
  console.log("Multiplayer sync regressions passed: reward recovery, session isolation, Reports sync feedback, stale-read recovery, and published authenticated-read verification.");
}
if (require.main === module) validate().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { validate, extract };
