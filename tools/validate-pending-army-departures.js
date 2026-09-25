"use strict";
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { clientSource, extractFunction } = require("./world-travel-test-fixtures");
const noop = () => {};
async function main() {
  let scopeKey = "uid:realm:shard:session", clock = 10000, paints = 0, finishRoute;
  const frames = new Map(); let frameId = 0;
  const source = { id: "source", name: "Source", regionId: "map", troops: 100 };
  const target = { id: "target", name: "Target", regionId: "map" };
  const context = {
    console, Date, performance: { now: () => clock },
    state: { attacks: [], gold: 75000, clanId: "clan" },
    pendingOutgoingMissions: new Map(), armyDepartureFrame: 0, armyDepartureTargetIds: new Set(),
    armyTokenCache: new Map(), visibleArmyMotion: new Map(), onlineArmies: [], onlineArmiesByIsland: new Map(),
    onlineArmyUnsubscribes: [], onlineArmySyncFailures: new Map(), selectedArmyTokenId: "",
    holdingTowerSnapshots: new Map(), resolvedOnlineArmyIds: new Set(),
    getCurrentOnlineUid: () => "uid", getOnlineSessionRequestScope: () => scopeKey,
    getOnlineApi: () => ({ getServerNowMs: () => clock, isRetryableArmySubmissionError: e => e.code === "unavailable" }),
    getHoldingTowerTargetType: () => "city", getCityRegionId: c => c.regionId,
    getOwnedSourceCandidates: () => [{ city: source }], getRouteHeuristicDistance: () => 10,
    findRouteAsync: () => new Promise(resolve => { finishRoute = resolve; }),
    travelTime: () => 10, getRouteSegments: r => r.segments,
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    renderPaths: noop, renderArmies: () => paints++, updateVisibleCityDynamicText: noop,
    refreshScoutActionWheels: noop, renderHud: noop, updateIncomingAttackUi: noop, updateOutgoingAttackUi: noop,
    updateOnlineArmySyncBadge: noop, normalizeTimestampMs: Number, clamp: (n, a, b) => Math.min(b, Math.max(a, n)),
    worldToMapPoint: p => p, getActiveMapRegionId: () => "map",
    getMissionPointAtProgress: (_army, progress, segments) => {
      assert(segments, "Per-frame motion must reuse discovered route geometry");
      return { regionId: segments[0].regionId, point: { x: progress * 100, y: 0 } };
    },
  };
  vm.createContext(context);
  for (const name of ["getArmyClockNowMs", "beginPendingScoutDeparture", "preparePendingScoutDeparture",
    "finishPendingScoutDeparture", "scheduleArmyDeparturePresentation", "getArmyTravelProgress",
    "isArrivedScoutMission", "hasRenderableArmyWork", "clearOnlineArmyWatchers", "getArmyTokenId",
    "reconcilePendingArmyDeparture", "renderVisibleArmyMotion"]) {
    vm.runInContext((clientSource.includes(`async function ${name}(`) ? "async " : "") + extractFunction(clientSource, name), context);
  }
  const frame = async () => { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn => fn()); await Promise.resolve(); };
  const route = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], length: 100,
    segments: [{ regionId: "map", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], length: 100 }] };
  const first = context.beginPendingScoutDeparture("persisted-id", target);
  assert(context.hasRenderableArmyWork(), "First pending army never wakes presentation");
  assert.equal(context.beginPendingScoutDeparture("persisted-id", target), first, "Retry duplicated the preview");
  await frame(); assert.equal(paints, 1, "Departure did not present on the next frame");
  finishRoute(route); await Promise.resolve(); await frame();
  assert.equal(first.fromId, source.id);
  clock += 90000;
  assert.equal(context.getArmyTravelProgress(first), .08, "Unaccepted army reached its target");
  assert.equal(context.isArrivedScoutMission(first), false);
  assert.equal(context.state.gold, 75000); assert.equal(source.troops, 100);
  assert.equal(context.state.attacks.length, 0, "Provisional departure entered authoritative simulation");
  context.finishPendingScoutDeparture(first.id, { code: "unavailable" });
  assert.equal(first.serverRetrying, true); assert.equal(context.pendingOutgoingMissions.size, 1);
  context.reconcilePendingArmyDeparture({ id: first.id, ownerUid: "other" });
  assert.equal(context.pendingOutgoingMissions.size, 1);
  context.reconcilePendingArmyDeparture({ id: first.id, ownerUid: "uid" });
  context.finishPendingScoutDeparture(first.id, { code: "unavailable" });
  assert.equal(context.pendingOutgoingMissions.size, 0, "Late timeout resurrected accepted snapshot");
  context.beginPendingScoutDeparture("rejected", target);
  context.finishPendingScoutDeparture("rejected", { code: "permission-denied" });
  assert.equal(context.pendingOutgoingMissions.size, 0);

  for (let i = 0; i < 24; i++) context.beginPendingScoutDeparture(`batch:${i}`, { ...target, id: `target${i}` }, source, "batch");
  const token = { dataset: { armyTokenId: "batch:0" }, style: {} };
  context.armyTokenCache.set("batch:0", token);
  context.selectedArmyTokenId = "batch:0";
  context.reconcilePendingArmyDeparture({ id: "canonical", ownerUid: "uid", bulkRequestId: "batch", toId: "target0" });
  assert.equal(context.pendingOutgoingMissions.size, 23); assert.equal(context.armyTokenCache.get("canonical"), token);
  assert.equal(context.selectedArmyTokenId, "canonical");
  for (let i = 1; i < 24; i++) context.finishPendingScoutDeparture(`batch:${i}`);
  assert.equal(context.pendingOutgoingMissions.size, 0);

  const stale = context.beginPendingScoutDeparture("stale", target);
  await frame();
  scopeKey = "uid:other-realm:shard:new-session";
  context.clearOnlineArmyWatchers();
  finishRoute(route); await Promise.resolve(); await frame();
  assert.equal(stale.path.length, 0, "Old-session route completion changed presentation");
  assert.equal(context.pendingOutgoingMissions.size, 0); assert.equal(context.visibleArmyMotion.size, 0);

  const army = { launchedAtMs: clock, arrivesAtMs: clock + 1000 };
  const motion = { token, army, segments: [{ regionId: "map" }], correction: null };
  context.visibleArmyMotion.set("canonical", motion);
  context.renderVisibleArmyMotion(); const start = token.style.transform;
  clock += 16; context.renderVisibleArmyMotion(); assert.notEqual(token.style.transform, start, "Motion remained at label cadence");
  motion.segments[0].regionId = "other-map";
  context.renderVisibleArmyMotion(); assert.equal(token.hidden, true, "Portal crossing painted on the wrong map");
  console.log("Pending departures passed: next-frame feedback, persisted ID reuse, provisional cap, rejection/timeout, snapshot-before-response, 24-target reconciliation, session/realm cleanup, frame motion and portal isolation.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
