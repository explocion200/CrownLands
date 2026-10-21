"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { monitorEventLoopDelay } = require("node:perf_hooks");
const { createCommandRouting } = require("./map-benchmark/seamless/command-routing");
const { createTravelFixture, canonicalCity } = require("./world-travel-test-fixtures");
const { buildCatalog, fixture, imageToGame } = require("./map-benchmark/seamless/live-catalog");
const { createDisplayLayout } = require("./map-benchmark/seamless/open-world-layout");

(async () => {
  const travel = createTravelFixture(87), routing = createCommandRouting();
  const context = { worldId: "main-realm-command-test", resetGeneration: "realm-command-test", sharedRealmId: "shard_0001", activeRegionIds: travel.activeRegionIds };
  const manifest = buildCatalog(context, { ...context, realmShardId: context.sharedRealmId, topologyVersion: "core-expansion-v1" }).manifest;
  const display = createDisplayLayout(manifest, fixture), measurements = [];
  const delay = monitorEventLoopDelay({ resolution: 10 }); delay.enable();
  try {
    for (let i = 0; i < 32; i++) {
      const a = manifest.sections[(i * 13) % 112], b = manifest.sections[(i * 29 + 19) % 112];
      const from = canonicalCity(travel.planner, a.id, i % 15), to = canonicalCity(travel.planner, b.id, (i + 8) % 15);
      const started = performance.now(), next = await routing.calculate(from, to, context);
      const ms = performance.now() - started, old = travel.planner.calculate(from, to);
      assert(next.pathLength > 0 && next.pathSegments.length);
      assert(next.routeRegionIds.every(id => display.sections.has(id)));
      for (const [endpoint, section, actual] of [[from, a, next.pathSegments[0].points[0]], [to, b, next.pathSegments.at(-1).points.at(-1)]]) {
        const bounds = section.gameBounds;
        const local = { x: (endpoint.x - bounds.left) / bounds.width * section.width, y: (endpoint.y - bounds.top) / bounds.height * section.height };
        const expected = imageToGame(section, display.project(section, local));
        assert(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-6);
      }
      const reloaded = JSON.parse(JSON.stringify(next));
      assert.deepEqual(await routing.calculate(from, to, context), reloaded, "Cache must preserve versioned geometry exactly");
      measurements.push({ sections: next.routeRegionIds.length, ms, oldDistance: old.pathLength, newDistance: next.pathLength,
        changePercent: (next.pathLength / old.pathLength - 1) * 100 });
    }
    // Fresh concurrent requests: bounded admission and explicit retry. No silent
    // fallback to the old graph when the new worker is overloaded.
    const from = canonicalCity(travel.planner, manifest.sections[2].id, 16);
    const targets = manifest.sections.slice(-8).map((s, i) => canonicalCity(travel.planner, s.id, 17 + i));
    delay.reset();
    const started = performance.now();
    const batch = await Promise.allSettled(targets.map(to => routing.calculate(from, to, context)));
    const concurrentMs = performance.now() - started;
    const concurrentEventLoopDelayMs = { p95: delay.percentile(95) / 1e6, max: delay.max / 1e6 };
    assert.equal(batch.filter(r => r.status === "fulfilled").length, 4);
    assert(batch.filter(r => r.status === "rejected").every(r => r.reason.code === "unavailable"));
    for (const [i, item] of batch.entries()) if (item.status === "rejected") assert((await routing.calculate(from, targets[i], context)).pathLength > 0);
    await assert.rejects(routing.calculate(from, { ...targets[0], regionId: "not-active" }, context), { code: "failed-precondition" });
    // Catalog changes have different stable geometry identities. Old returned
    // objects remain immutable; an evicted catalog can be rebuilt deterministically.
    const before = await routing.calculate(from, targets[0], context), saved = structuredClone(before);
    const expanded = { ...context, activeRegionIds: createTravelFixture(88).activeRegionIds };
    const changed = await routing.calculate(from, targets[0], expanded);
    assert.notEqual(changed.pathSegments[0].geometryId, before.pathSegments[0].geometryId);
    assert.deepEqual(before, saved);
    await routing.calculate(from, targets[0], { ...expanded, worldId: "main-realm-other-test" });
    assert(routing.stats().worlds <= 2);
    assert.deepEqual(await routing.calculate(from, targets[0], context), saved);
    const ordered = measurements.map(r => r.ms).sort((a, b) => a - b), changes = measurements.map(r => r.changePercent).sort((a, b) => a - b);
    const report = { passed: true, sections: 112, samples: measurements.length,
      coldRouteMs: { p50: ordered[15], p95: ordered[30], max: ordered[31] },
      distanceChangePercent: { min: changes[0], median: changes[15], max: changes[31] },
      concurrent: { requests: 8, admitted: 4, retryRequired: 4, ms: concurrentMs },
      concurrentEventLoopDelayMs, measurements };
    const output = path.resolve("release-artifacts/continuous-command-rehearsal"); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "routing.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, measurements: undefined }));
  } finally { delay.disable(); await routing.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
