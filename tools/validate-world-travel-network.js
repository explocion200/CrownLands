"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { root, network, runtime, topology, serverSource, clientSource, extractFunction,
  createTravelFixture, canonicalCity, createClientScope } = require("./world-travel-test-fixtures.js");

async function main() {
  const fixture = createTravelFixture();
  assert.equal(fixture.maps.length, 49);
  assert.deepEqual(network.validateConnections(fixture.maps), []);
  const client = createClientScope(fixture);
  const source = { ...canonicalCity(fixture.planner, fixture.activeRegionIds[0]), owner: "player", troops: 200, name: "Brookbridge" };
  client.ownedCities = [source];
  client.lastSelectedOwnedCityId = source.id;
  const destination = canonicalCity(fixture.planner, fixture.activeRegionIds[12]);
  let pairCount = 0;
  for (const start of fixture.maps) {
    const editorMap = client.getEditorMap(start.id);
    assert.deepEqual(JSON.parse(JSON.stringify(editorMap.edgeConnections)), JSON.parse(JSON.stringify(start.edgeConnections)), `${start.id}: cold client/server roads differ.`);
    for (const end of fixture.maps) {
      const chain = client.findEditorPortalRouteRegionChain(start.id, end.id);
      assert(chain?.length, `${start.id} -> ${end.id}: cold client graph is disconnected.`);
      assert.equal(new Set(chain).size, chain.length, "Map traversal contains a cycle.");
      assert.equal(JSON.stringify(chain), JSON.stringify(fixture.planner.findRegionChain(start.id, end.id)));
      pairCount += 1;
    }
  }
  assert(client.findPreferredAttackSource(destination), "Remembered city with troops must be able to attack through unloaded maps.");
  assert(client.buildRouteWorkerLegs(source, destination)?.length > 4);
  assert.equal(client.findEditorPortalRouteRegionChain(source.regionId, "deprecated-map"), null);

  // Execute the actual action entry point, including the screenshot's rejection branch.
  let opened = 0;
  let rejected = "";
  Object.assign(client, {
    cityById: id => id === destination.id ? destination : source,
    isClanAllyCity: () => false, getMainCityAttackBlockReason: () => "", getPeaceShieldAttackBlockReason: () => "",
    getNeutralCaptureBlockReason: () => "", rejectGameAction: message => { rejected = message; },
    rememberOwnedAttackSource: () => {}, renderAll: () => {}, showTroopSliderModal: () => { opened += 1; },
  });
  vm.runInContext(extractFunction(clientSource, "attackForeignCity"), client);
  client.attackForeignCity(destination.id);
  assert.equal(opened, 1);
  assert.equal(rejected, "");
  source.troops = 0;
  client.attackForeignCity(destination.id);
  assert.match(rejected, /no troops available/);
  assert.doesNotMatch(rejected, /road|portal/);
  source.troops = 200;
  const sourceDescriptor = fixture.descriptors.find(region => region.id === source.regionId);
  const originalConnections = sourceDescriptor.connections;
  sourceDescriptor.connections = {};
  client.attackForeignCity(destination.id);
  assert.match(rejected, /No connected road route/);
  assert.doesNotMatch(rejected, /no troops/);
  sourceDescriptor.connections = originalConnections;

  const loader = runtime.createRegionDefinitionLoader({ catalog: { regions: fixture.descriptors }, cacheLimit: 4,
    fetchJson: file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) });
  for (const descriptor of fixture.descriptors) {
    await loader.ensure(descriptor.id);
    client.regionDefinitionCache = loader.cache;
    assert(loader.cache.size <= 4);
    assert(client.findPreferredAttackSource(destination), `Cache eviction at ${descriptor.id} destroyed connectivity.`);
    assert.equal(JSON.stringify(client.getEditorMap(descriptor.id).edgeConnections),
      JSON.stringify(fixture.planner.getModel(descriptor.id).map.edgeConnections));
  }

  let roadCount = 0;
  for (const map of fixture.maps) {
    const model = fixture.planner.getModel(map.id);
    const city = canonicalCity(fixture.planner, map.id);
    for (const portal of model.portals) {
      const job = fixture.planner.buildJob(city, { ...portal, regionId: map.id });
      const result = require("../functions/canonical-route-engine.js").calculateRoute(job);
      assert(result?.length > 0 && Number.isFinite(result.length), `${map.id}.${portal.id}: road has no terrain travel segment.`);
      roadCount += 1;
    }
  }
  assert.equal(roadCount, 168, "The active 7×7 world must have 84 reciprocal road connections.");
  for (const [fromIndex, toIndex] of [[0, 1], [0, 2], [0, 12], [3, 15]]) {
    const from = canonicalCity(fixture.planner, fixture.activeRegionIds[fromIndex]);
    const to = canonicalCity(fixture.planner, fixture.activeRegionIds[toIndex]);
    const forward = fixture.planner.calculate(from, to);
    const reverse = fixture.planner.calculate(to, from);
    assert(forward && reverse);
    assert(Math.abs(forward.pathLength - reverse.pathLength) < 0.01, "Reversing a road journey changed its distance.");
    assert.equal(new Set(forward.routeRegionIds).size, forward.routeRegionIds.length);
    assert.equal(forward.pathLength, forward.pathSegments.reduce((sum, segment) => sum + segment.length, 0));
  }

  // Activate generated Layer 3 through the exact runtime generator, including templates.
  const future = createTravelFixture(24 + 32 + 40);
  const futureClient = createClientScope(future);
  assert.equal(future.maps.length, 121);
  assert.deepEqual(network.validateConnections(future.maps), []);
  const cornerA = future.descriptors.find(region => region.gridX === -5 && region.gridY === -5);
  const cornerB = future.descriptors.find(region => region.gridX === 5 && region.gridY === 5);
  const futureSource = canonicalCity(future.planner, cornerA.id);
  const futureTarget = canonicalCity(future.planner, cornerB.id);
  assert.equal(futureClient.findEditorPortalRouteRegionChain(cornerA.id, cornerB.id).length, 21);
  const futureRoute = future.planner.calculate(futureSource, futureTarget);
  assert(futureRoute?.pathSegments.length > 20, "Layer 3 route must exceed the old persistence limit.");
  assert.equal(new Set(futureRoute.routeRegionIds).size, futureRoute.routeRegionIds.length);
  const templateLoader = runtime.createRegionDefinitionLoader({ catalog: { regions: future.descriptors },
    fetchJson: file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) });
  const futureLoaded = await templateLoader.ensure(cornerA.id);
  const futureReloaded = await templateLoader.ensure(cornerA.id);
  assert.equal(futureLoaded.id, cornerA.id);
  assert.deepEqual(futureLoaded.edgeConnections, futureReloaded.edgeConnections);
  assert(futureLoaded.cities.every(city => city.id.startsWith(cornerA.id)));
  const normalization = { normalizeRegionId: id => id, safeNumber: (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f,
    CORE_EXPANSION: topology };
  vm.createContext(normalization);
  vm.runInContext(["MAX_ROUTE_REGION_COUNT", "MAX_ROUTE_SEGMENT_COUNT", "MAX_ROUTE_POINTS_PER_SEGMENT"]
    .map(name => serverSource.match(new RegExp(`const ${name} = [^;]+;`))[0]).join("\n"), normalization);
  vm.runInContext(["normalizePoint", "normalizePath", "routeLength", "normalizePathSegments", "normalizeRegionIds"]
    .map(name => extractFunction(serverSource, name)).join("\n"), normalization);
  const reloaded = JSON.parse(JSON.stringify(futureRoute));
  assert.equal(normalization.normalizePathSegments(reloaded.pathSegments).length, futureRoute.pathSegments.length);
  assert.equal(normalization.normalizeRegionIds(reloaded.routeRegionIds).length, futureRoute.routeRegionIds.length);

  const broken = JSON.parse(JSON.stringify(fixture.maps.slice(0, 2)));
  assert(network.validateConnections(broken).some(error => /unknown destination/.test(error)));
  const duplicate = JSON.parse(JSON.stringify(fixture.maps));
  const road = Object.values(duplicate[0].edgeConnections).find(edges => edges.length);
  road.push({ ...road[0], start: NaN });
  assert(network.validateConnections(duplicate).some(error => /duplicate/.test(error)));
  assert(network.validateConnections(duplicate).some(error => /geometry/.test(error)));
  const oneWay = JSON.parse(JSON.stringify(fixture.maps));
  oneWay[0].edgeConnections = {};
  assert(network.validateConnections(oneWay).some(error => /reciprocal/.test(error)));
  const badLink = JSON.parse(JSON.stringify(fixture.maps));
  Object.values(badLink[0].edgeConnections).find(edges => edges.length)[0].targetConnectionId = "missing";
  assert(network.validateConnections(badLink).some(error => /broken destination/.test(error)));

  // The cheapest route may cross more maps than the first BFS chain.
  const portals = new Map([
    ["a", [{ id: "ab", targetRegionId: "b", targetPortalId: "ba", x: 100, y: 0 }, { id: "ac", targetRegionId: "c", targetPortalId: "ca", x: 1, y: 0 }]],
    ["b", [{ id: "ba", targetRegionId: "a", targetPortalId: "ab", x: 100, y: 0 }, { id: "bd", targetRegionId: "d", targetPortalId: "db", x: 1, y: 0 }]],
    ["c", [{ id: "ca", targetRegionId: "a", targetPortalId: "ac", x: 1, y: 0 }, { id: "cd", targetRegionId: "d", targetPortalId: "dc", x: 2, y: 0 }]],
    ["d", [{ id: "dc", targetRegionId: "c", targetPortalId: "cd", x: 1, y: 0 }, { id: "db", targetRegionId: "b", targetPortalId: "bd", x: 2, y: 0 }]],
  ]);
  const shortest = network.findShortestRoute(portals.keys(), id => portals.get(id),
    { id: "source", regionId: "a", x: 0, y: 0 }, { id: "target", regionId: "b", x: 0, y: 0 },
    (regionId, start, end) => ({ regionId, points: [start, end], length: Math.hypot(end.x - start.x, end.y - start.y) }));
  assert.equal(shortest.length, 4);
  assert.deepEqual(shortest.segments.map(segment => segment.regionId), ["a", "c", "d", "b"]);
  assert.equal(network.findShortestRoute(["isolated", "a"], () => [],
    { regionId: "isolated", x: 0, y: 0 }, { regionId: "a", x: 1, y: 1 }, () => null), null);
  const loop = network.findShortestRoute(portals.keys(), id => portals.get(id),
    { id: "source", regionId: "a", x: 0, y: 0 }, { id: "target", regionId: "a", x: 101, y: 0 },
    (regionId, start, end) => ({ regionId, points: [start, end], length: Math.hypot(end.x - start.x, end.y - start.y) }));
  assert.deepEqual(loop.segments.map(segment => segment.regionId), ["a"], "A cheaper cycle must not revisit the source map.");

  client.supportsAuthoritativeArmyRoutes = () => true;
  client.getTroopTravelBandIndex = troops => troops > 100 ? 1 : 0;
  const quote = { points: [{ x: 1, y: 1 }], previewStatus: "authoritative", authoritativeDurationSeconds: 120, authoritativeRequestedTroops: 50 };
  assert(client.isOrderRouteReady(quote, 50));
  assert(!client.isOrderRouteReady(quote, 500));
  assert(!client.isOrderRouteReady({ ...quote, previewStatus: "estimated" }, 50));
  assert(!client.isOrderRouteReady({ ...quote, authoritativeError: "No safe route" }, 50));
  assert(!client.isOrderRouteReady({ ...quote, authoritativeDurationSeconds: Infinity }, 50));
  console.log(`Validated ${pairCount} cold-client map pairs, ${roadCount} road terrain legs, attack entry, cache eviction, shortest routes, invalid/circular graphs, and ${futureRoute.pathSegments.length}-map Layer 3 persistence.`);
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
