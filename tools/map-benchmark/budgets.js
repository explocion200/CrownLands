"use strict";

const MIB = 1024 * 1024;

const REGRESSION_PROFILES = Object.freeze({
  "A/desktop": { fps: [60, 75, 45], p95: [40, 20, 75], longTasks: [12, 8, 20], readyMs: 5000 },
  "A/mobile-landscape": { fps: [55, 70, 35], p95: [50, 20, 90], longTasks: [12, 8, 20], readyMs: 5000 },
  "D/desktop": { fps: [90, 90, 50], p95: [16.7, null, 80], longTasks: [8, 2, 40], readyMs: 5000 },
  "D/mobile-landscape": { fps: [90, 90, 50], p95: [16.7, null, 80], longTasks: [8, 2, 40], readyMs: 5000 },
  "D/mobile-landscape-4x": { fps: [10, 9, null], p95: [250, null, null], readyMs: 15000 },
  "E/desktop": { fps: [18, 28, 6], p95: [100, null, 900], readyMs: 5000 },
  "E/mobile-landscape": { fps: [9, 16, 2], p95: [900, null, 1200], readyMs: 5000 },
});

const SURFACE_BUDGETS = Object.freeze({
  A: { totalNodes: 1800, mapNodes: 1200, svg: 115, paths: 55 },
  B: { totalNodes: 2900, mapNodes: 2300, svg: 220, paths: 110 },
  D: { totalNodes: 2000, mapNodes: 1400, svg: 110, paths: 0 },
  E: { totalNodes: 3150, mapNodes: 2550, svg: 280, paths: 210 },
});

const CAPACITY_PROFILES = Object.freeze({
  "B/desktop": { fps: [30, 30, 20], idleP95: 100, readyMs: 15000 },
  "B/mobile-landscape": { fps: [24, 24, 15], idleP95: 150, readyMs: 15000 },
  "C/desktop": { fps: [20, 20, 15], idleP95: 200, readyMs: 20000 },
  "C/mobile-landscape": { fps: [15, 15, 10], idleP95: 300, readyMs: 20000 },
});

function evaluateBudgets(report) {
  const byKey = new Map(report.runs.map(run => [`${run.scenario.id}/${run.profile.id}`, run]));
  const regression = { passed: true, checks: 0, failures: [] };
  const capacity = { passed: true, checks: 0, failures: [] };

  function check(group, condition, message) {
    group.checks += 1;
    if (condition) return;
    group.passed = false;
    group.failures.push(message);
  }

  for (const [key, budget] of Object.entries(REGRESSION_PROFILES)) {
    const run = byKey.get(key);
    check(regression, Boolean(run), `${key}: required regression profile is unavailable.`);
    if (!run) continue;
    const samples = [run.samples.idle, run.samples.pan, run.samples.zoom];
    for (let index = 0; index < samples.length; index += 1) {
      if (budget.fps[index] != null) check(regression, samples[index].frame.fps >= budget.fps[index], `${key}: ${samples[index].name} FPS ${samples[index].frame.fps} < ${budget.fps[index]}.`);
      if (budget.p95[index] != null) check(regression, samples[index].frame.p95FrameTimeMs != null && samples[index].frame.p95FrameTimeMs <= budget.p95[index], `${key}: ${samples[index].name} p95 ${samples[index].frame.p95FrameTimeMs} > ${budget.p95[index]} ms.`);
      if (budget.longTasks?.[index] != null) check(regression, samples[index].frame.longTaskCount <= budget.longTasks[index], `${key}: ${samples[index].name} long tasks ${samples[index].frame.longTaskCount} > ${budget.longTasks[index]}.`);
    }
    check(regression, run.initialRegionLoadLatencyMs <= budget.readyMs, `${key}: ready latency ${run.initialRegionLoadLatencyMs} > ${budget.readyMs} ms.`);
  }

  for (const run of report.runs) {
    const key = `${run.scenario.id}/${run.profile.id}`;
    const nominal = run.profile.cpuRate === 1;
    const surface = SURFACE_BUDGETS[run.scenario.id];
    if (surface) {
      check(regression, run.runtime.dom.totalNodes <= surface.totalNodes, `${key}: DOM ${run.runtime.dom.totalNodes} > ${surface.totalNodes}.`);
      check(regression, run.runtime.dom.mapWorldNodes <= surface.mapNodes, `${key}: map DOM ${run.runtime.dom.mapWorldNodes} > ${surface.mapNodes}.`);
      check(regression, run.runtime.dom.svgElements <= surface.svg, `${key}: SVG ${run.runtime.dom.svgElements} > ${surface.svg}.`);
      check(regression, run.runtime.dom.svgPaths <= surface.paths, `${key}: SVG paths ${run.runtime.dom.svgPaths} > ${surface.paths}.`);
    }
    const initialCities = run.initialRuntime?.dataCityCount ?? run.scenario.cityCount;
    const initialMarches = run.initialRuntime?.dataMarchCount ?? run.scenario.marchCount;
    check(regression, initialCities === run.scenario.cityCount, `${key}: initial city count ${initialCities} != ${run.scenario.cityCount}.`);
    check(regression, initialMarches === run.scenario.marchCount, `${key}: initial march count ${initialMarches} != ${run.scenario.marchCount}.`);
    check(regression, run.runtime.realtime.listeners.active === 17, `${key}: active listeners ${run.runtime.realtime.listeners.active} != 17.`);
    check(regression, run.runtime.realtime.listeners.duplicates.length === 0, `${key}: duplicate listeners detected.`);
    check(regression, run.samples.mapSwitch.actionResult.after.active === 17, `${key}: listener count after switch is not 17.`);
    check(regression, run.samples.mapSwitch.actionResult.after.duplicates.length === 0, `${key}: duplicate listeners after switch.`);
    check(regression, run.network.productionBackendRequestCount === 0, `${key}: production backend request detected.`);
    check(regression, run.network.requestCount <= 80, `${key}: browser requests ${run.network.requestCount} > 80.`);
    check(regression, run.network.encodedBytes <= 8 * MIB, `${key}: encoded bytes ${run.network.encodedBytes} > 8 MiB.`);
    check(regression, run.network.mapAssetRequests <= 5, `${key}: map requests ${run.network.mapAssetRequests} > 5.`);
    check(regression, run.heap.usedSize <= (run.profile.cpuRate > 1 ? 24 : 16) * MIB, `${key}: heap exceeds budget.`);
    check(regression, run.runtime.images.decodedBytesEstimate <= 12 * MIB, `${key}: decoded image estimate exceeds 12 MiB.`);
    if (nominal) {
      check(regression, run.samples.mapSwitch.actionResult.neighborLatencyMs <= 3000, `${key}: neighbor switch exceeds 3 seconds.`);
      check(regression, run.samples.mapSwitch.actionResult.returnLatencyMs <= 3000, `${key}: return switch exceeds 3 seconds.`);
    }
  }

  for (const [key, budget] of Object.entries(CAPACITY_PROFILES)) {
    const run = byKey.get(key);
    check(capacity, Boolean(run), `${key}: required capacity profile is unavailable.`);
    if (!run) continue;
    const samples = [run.samples.idle, run.samples.pan, run.samples.zoom];
    for (let index = 0; index < samples.length; index += 1) {
      check(capacity, samples[index].frame.fps >= budget.fps[index], `${key}: ${samples[index].name} FPS ${samples[index].frame.fps} < ${budget.fps[index]}.`);
    }
    check(capacity, run.samples.idle.frame.p95FrameTimeMs != null && run.samples.idle.frame.p95FrameTimeMs <= budget.idleP95, `${key}: idle p95 ${run.samples.idle.frame.p95FrameTimeMs} > ${budget.idleP95} ms.`);
    check(capacity, run.initialRegionLoadLatencyMs <= budget.readyMs, `${key}: ready latency exceeds ${budget.readyMs} ms.`);
  }

  return { generatedAt: new Date().toISOString(), sourceGeneratedAt: report.generatedAt, regression, capacity };
}

module.exports = { CAPACITY_PROFILES, REGRESSION_PROFILES, SURFACE_BUDGETS, evaluateBudgets };
