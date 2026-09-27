'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const { extractFunction } = require('./world-travel-test-fixtures');
const noop = () => {};
const drain = async () => { for (let n = 0; n < 15; n++) await Promise.resolve(); };
function fixture() {
  let now = 10000, session = 'one', calls = 0, applied = 0;
  const requests = [];
  const retries = new Map(), pending = new Map();
  const context = {
    console: { warn: noop }, Date: { now: () => now }, performance: { now: () => now },
    Math: Object.assign(Object.create(Math), { random: () => .5 }),
    state: { attacks: [] }, resolvingOnlineArmyIds: new Set(), resolvedOnlineArmyIds: new Set(),
    armyResolutionRequests: pending, armyResolutionRetries: retries,
    getOnlineSessionRequestScope: () => session, usesServerArmyAuthority: () => true,
    getOnlineApi: () => ({ isSignedIn: () => true, resolveArmyOrder: () => { calls++; return new Promise((resolve, reject) => requests.push({ resolve, reject })); } }),
    getMissionRegionIds: () => ['map'], getOnlineArmyRemainingSeconds: () => 0,
    recordMarchInteractionTiming: noop, applyServerArmyResult: () => applied++, purgeResolvedOnlineArmy: noop,
    adoptServerArmyMovement: noop, loadServerReportsOnce: noop, saveGame: noop, flushOnlineSave: noop,
    renderAll: noop, updateIncomingAttackUi: noop, updateOutgoingAttackUi: noop, scheduleScoutPresentation: noop,
    scoutPresentationFrame: 0, scoutPresentationTargetIds: new Set(), scoutReportRead: null,
    cancelAnimationFrame: noop, clearTimeout: noop, scoutEconomyRefreshTimer: 0,
    scoutEconomyRefreshStartedAt: 0, scoutEconomyRefreshRevisionMs: 0,
  };
  vm.createContext(context);
  for (const name of ['getOnlineArmyResolutionId', 'createScoutResolutionQueue', 'isServerArmyNotArrivedError',
    'deferServerArmyResolutionRetry', 'resolveServerArmyMission', 'resolveOverdueOnlineArmy',
    'resolveOverdueOnlineArmyAsync', 'clearScoutResponsivenessState', 'restartOnlineRealtimeSubscriptionsForResume']) {
    vm.runInContext((source.includes(`async function ${name}(`) ? 'async ' : '') + extractFunction(source, name), context);
  }
  context.queueScoutResolution = context.createScoutResolutionQueue();
  Object.assign(context, {
    isOnlineWorldActive: () => true, onlineWorldLoading: false, mapSwitchLoading: false,
    getActiveOnlineRegionId: () => 'map', getOnlineIslandId: () => 'island',
    ONLINE_INITIAL_CITY_LIST_TIMEOUT_MS: 10000, getRegionLabel: () => 'Map',
    startActiveOnlineIslandSubscription: async () => true,
  });
  for (const name of ['clearOnlineArmyWatchers', 'clearOnlineReinforcementWatcher', 'clearOnlineHeldCampWatcher',
    'clearOnlineServerReportWatcher', 'clearOnlineRealmActivityWatcher', 'clearOnlineCoreExpansionWatcher',
    'clearOnlineGlobalStatsWatcher', 'clearOnlineCrownCitadelWatcher', 'subscribeOnlineArmyWatchers',
    'subscribeOnlineReinforcements', 'subscribeOnlineHeldCamps', 'subscribeOnlineServerReports',
    'subscribeOnlineRealmActivity', 'subscribeOnlineCoreExpansion', 'subscribeOnlineGlobalStats',
    'subscribeOnlineCrownCitadel', 'watchGameServerMembership', 'clearDailyMissionSubscription',
    'clearSeasonalAchievementSubscription', 'subscribeDailyMissionCycle', 'subscribeSeasonalAchievementCycle']) context[name] = noop;
  return { context, requests, retries, pending, advance: ms => { now += ms; }, session: value => { session = value; },
    get calls() { return calls; }, get applied() { return applied; }, get now() { return now; } };
}
const mission = (kind, id = kind) => ({ kind, id, onlineId: id, onlineRegionIds: ['map'], toId: 'target' });
async function fail(f, order, error) {
  const result = f.context.resolveServerArmyMission(order); await drain();
  f.requests.at(-1).reject(error); await result;
}
async function main() {
  for (const kind of ['attack', 'transfer', 'reinforce', 'rally_join', 'scout']) {
    const f = fixture(), order = mission(kind);
    for (const delay of [1000, 2000, 4000, 8000, 8000]) {
      await fail(f, { ...order }, { code: 'functions/unavailable', message: 'Connection lost' });
      const before = f.calls;
      // Fresh snapshots, countdown ticks and reconnect entry points must share a cooldown.
      for (let tick = 0; tick < 50; tick++) {
        const tickRequest = f.context.resolveServerArmyMission({ ...order });
        f.context.resolveOverdueOnlineArmy({ ...order });
        const overdueRequest = f.context.resolveOverdueOnlineArmyAsync({ ...order });
        await drain();
        assert.equal(f.calls, before, `${kind}: repeated arrival failure flooded the server`); await Promise.all([tickRequest, overdueRequest]);
      }
      assert.equal(f.retries.get(order.id).retryAtMs - f.now, delay);
      f.advance(delay);
    }
    const success = f.context.resolveServerArmyMission(order); await drain();
    f.requests.at(-1).resolve({ status: 'resolved' }); await success;
    assert.equal(f.applied, 1); assert(!f.retries.has(order.id));
    assert(!f.pending.has(order.id)); assert(!f.context.resolvingOnlineArmyIds.has(order.id));

    const early = fixture();
    await fail(early, order, { code: 'functions/failed-precondition', message: 'Army has not arrived yet.' });
    const before = early.calls;
    // A replacement projection must not discard a not-arrived delay.
    const blocked = early.context.resolveServerArmyMission({ ...order }); await drain();
    assert.equal(early.calls, before, `${kind}: replacement snapshot bypassed early-arrival cooldown`); await blocked;
    early.advance(1000);
    const due = early.context.resolveServerArmyMission({ ...order }); await drain();
    assert.equal(early.calls, before + 1); early.requests.at(-1).resolve({ status: 'resolved' }); await due;

    for (const code of ['failed-precondition', 'permission-denied', 'unauthenticated', 'invalid-argument', 'not-found']) {
      const denied = fixture();
      await fail(denied, order, { code: `functions/${code}` });
      denied.advance(60000);
      const blockedAgain = denied.context.resolveServerArmyMission({ ...order }); await drain();
      assert.equal(denied.calls, 1, `${kind}: ${code} kept retrying without renewed authorization`); await blockedAgain;
      assert.equal(denied.retries.get(order.id).retryAtMs, Infinity);
      const restored = { ...order, resolveRetryAtMs: Infinity };
      denied.context.state.attacks = [restored];
      assert.equal(await denied.context.restartOnlineRealtimeSubscriptionsForResume(), true);
      assert.equal(restored.resolveRetryAtMs, 0);
      assert(!denied.retries.has(order.id), 'Reconnect did not release the authorization pause');
      const afterReconnect = denied.context.resolveServerArmyMission(restored); await drain();
      assert.equal(denied.calls, 2);
      denied.requests.at(-1).resolve({ status: 'resolved' }); await afterReconnect;
      assert.equal(denied.applied, 1);
    }

    const stale = fixture();
    const old = stale.context.resolveServerArmyMission(order); await drain();
    stale.session('two'); stale.context.clearScoutResponsivenessState();
    const current = stale.context.resolveServerArmyMission({ ...order }); await drain();
    assert.equal(stale.calls, 2, `${kind}: old session retained the resolution lock`);
    stale.requests[0].resolve({ status: 'resolved' }); await old;
    assert.equal(stale.applied, 0, 'An old session applied an arrival result');
    assert(stale.context.resolvingOnlineArmyIds.has(order.id), `${kind}: stale completion unlocked the new request`);
    const duplicate = stale.context.resolveServerArmyMission({ ...order }); await drain();
    assert.equal(stale.calls, 2); await duplicate;
    stale.requests[1].resolve({ status: 'resolved' }); await current;
    assert.equal(stale.applied, 1); assert.equal(stale.pending.size, 0);
  }
  console.log('Army arrival retry checks passed: all five kinds, snapshot/tick deduplication, bounded backoff, early arrival, permanent failures and session replacement.');
}
const watchdog = setTimeout(() => { console.error("Army retry test did not settle"); process.exit(1); }, 5000); main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
