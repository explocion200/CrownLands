"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  readWindowData,
  getTerrainBlockers,
  createMapModels,
  createWorker,
  createJob,
  buildLegs,
} = require("./validate-all-city-routes.js");
const layout = require("../functions/world-layout.json");
const {
  createAuthoritativeRoutePlanner,
  imagePointToWorld,
  normalizeRouteResult,
} = require("../functions/authoritative-route-planner.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const MAX_ROUTE_POINTS_PER_SEGMENT = 160;

function json(value) {
  return JSON.stringify(value);
}

function assertJsonEqual(actual, expected, message) {
  assert.equal(json(actual), json(expected), message);
}

function canonicalEngineSourceFromWorker() {
  let source = fs.readFileSync(path.join(ROOT_DIR, "route-worker.js"), "utf8").replace(/\r\n/g, "\n");
  source = source
    .replace(
      '"use strict";\n',
      '"use strict";\n\nconst routeWorkerScope = typeof self === "undefined" ? { postMessage() {} } : self;\n'
    )
    .replace(/\bself\.onmessage\b/g, "routeWorkerScope.onmessage")
    .replace(/\bself\.postMessage\b/g, "routeWorkerScope.postMessage");
  return `${source}\n\nmodule.exports = Object.freeze({ calculateRoute, normalizeConstants });\n`;
}

function getServerCities(model) {
  return (Array.isArray(model?.map?.cities) ? model.map.cities : []).map((city, index) => {
    const point = imagePointToWorld(model, city?.point && typeof city.point === "object" ? city.point : city);
    return {
      id: String(city?.id || `${model.id}_${index + 1}`),
      regionId: model.id,
      x: Math.round(point.x),
      y: Math.round(point.y),
    };
  });
}

function comparablePortals(portals = []) {
  return portals.map(portal => ({
    id: portal.id,
    targetRegionId: portal.targetRegionId,
    targetPortalId: portal.targetPortalId,
    side: portal.side,
    x: portal.x,
    y: portal.y,
  }));
}

function validatePlannerModels(planner, clientModels) {
  let cityCount = 0;
  for (const [regionId, clientModel] of clientModels) {
    const serverModel = planner.getModel(regionId);
    assert(serverModel, `Server route planner is missing ${regionId}.`);
    assertJsonEqual(serverModel.dimensions, clientModel.dimensions, `${regionId} image dimensions drifted.`);
    assertJsonEqual(serverModel.bounds, clientModel.bounds, `${regionId} map bounds drifted.`);
    assertJsonEqual(serverModel.workerRegion, clientModel.workerRegion, `${regionId} terrain/grid model drifted.`);
    assertJsonEqual(serverModel.obstacles, clientModel.obstacles, `${regionId} structure obstacles drifted.`);
    assertJsonEqual(
      comparablePortals(serverModel.portals),
      comparablePortals(clientModel.portals),
      `${regionId} portal geometry or linkage drifted.`
    );
    const serverCities = getServerCities(serverModel);
    const clientCities = clientModel.cities.map(city => ({
      id: city.id,
      regionId: city.regionId,
      x: city.x,
      y: city.y,
    }));
    assertJsonEqual(serverCities, clientCities, `${regionId} authoritative city coordinates drifted.`);
    cityCount += serverCities.length;
  }
  assert.equal(clientModels.size, 15, "Route parity must cover all 15 maps.");
  assert.equal(cityCount, 1050, "Route parity must cover all 1,050 cities.");
  return cityCount;
}

function validateRoutePair({ planner, clientWorker, clientModels, worldSize, worldConfig, source, target, label }) {
  const serverJob = planner.buildJob(source, target);
  const clientLegs = buildLegs(clientModels, source, target);
  assert(serverJob, `${label}: server route job could not be built.`);
  assert(clientLegs?.length, `${label}: client route legs could not be built.`);
  const clientJob = createJob(clientModels, worldSize, worldConfig, clientLegs);
  const serverRoute = planner.calculate(source, target);
  const clientRoute = normalizeRouteResult(clientWorker(clientJob));
  assert(serverRoute, `${label}: server returned no route.`);
  assert(clientRoute, `${label}: client worker returned no route.`);
  assertJsonEqual(serverRoute, clientRoute, `${label}: server/client route geometry diverged.`);
  assert(
    serverRoute.pathSegments.every(segment => segment.points.length <= MAX_ROUTE_POINTS_PER_SEGMENT),
    `${label}: authoritative route exceeds the persisted point budget.`
  );
  return serverRoute;
}

function main() {
  const vendoredEngineSource = fs.readFileSync(
    path.join(ROOT_DIR, "functions", "canonical-route-engine.js"),
    "utf8"
  ).replace(/\r\n/g, "\n");
  const normalizedVendoredEngineSource = vendoredEngineSource.trimEnd();
  const expectedVendoredEngineSource = canonicalEngineSourceFromWorker().trimEnd();
  let engineDifferenceIndex = 0;
  while (
    engineDifferenceIndex < normalizedVendoredEngineSource.length
    && normalizedVendoredEngineSource[engineDifferenceIndex] === expectedVendoredEngineSource[engineDifferenceIndex]
  ) engineDifferenceIndex += 1;
  assert.equal(
    normalizedVendoredEngineSource,
    expectedVendoredEngineSource,
    `The server's canonical route engine differs from route-worker.js at byte ${engineDifferenceIndex}.`
  );

  const worldConfig = readWindowData(path.join(ROOT_DIR, "world-config.js"), "CROWNLANDS_WORLD_CONFIG");
  const editorData = readWindowData(
    path.join(ROOT_DIR, "assets", "map-editor-data.js"),
    "CROWNLANDS_MAP_EDITOR_DATA"
  );
  const terrainBlockers = getTerrainBlockers();
  const { models: clientModels, worldSize } = createMapModels(worldConfig, editorData, terrainBlockers);
  const planner = createAuthoritativeRoutePlanner(layout);
  const clientWorker = createWorker();
  const cityCount = validatePlannerModels(planner, clientModels);
  const regionIds = [...clientModels.keys()];
  const startedAtMs = Date.now();
  let localRoutes = 0;
  let crossMapRoutes = 0;
  let directedMapPairs = 0;

  for (let regionIndex = 0; regionIndex < regionIds.length; regionIndex += 1) {
    const regionId = regionIds[regionIndex];
    const model = clientModels.get(regionId);
    const nextRegionId = regionIds[(regionIndex + 1) % regionIds.length];
    const nextTarget = clientModels.get(nextRegionId)?.cities[0];
    const gateway = model.portals[0];
    assert(gateway, `${regionId} has no route gateway.`);
    const localTarget = {
      id: `portal:${regionId}:${gateway.id}`,
      regionId,
      x: gateway.x,
      y: gateway.y,
    };
    for (let cityIndex = 0; cityIndex < model.cities.length; cityIndex += 1) {
      const source = model.cities[cityIndex];
      validateRoutePair({
        planner,
        clientWorker,
        clientModels,
        worldSize,
        worldConfig,
        source,
        target: localTarget,
        label: `${regionId}:${source.id}->${gateway.id}`,
      });
      localRoutes += 1;
      validateRoutePair({
        planner,
        clientWorker,
        clientModels,
        worldSize,
        worldConfig,
        source,
        target: nextTarget,
        label: `${regionId}:${source.id}->${nextRegionId}:${nextTarget.id}`,
      });
      crossMapRoutes += 1;
    }
    console.log(`Route parity covered ${model.cities.length} cities in ${model.label}.`);
  }

  for (const sourceRegionId of regionIds) {
    for (const targetRegionId of regionIds) {
      if (sourceRegionId === targetRegionId) continue;
      const source = clientModels.get(sourceRegionId)?.cities[0];
      const target = clientModels.get(targetRegionId)?.cities[0];
      validateRoutePair({
        planner,
        clientWorker,
        clientModels,
        worldSize,
        worldConfig,
        source,
        target,
        label: `${sourceRegionId}:${source.id}->${targetRegionId}:${target.id}`,
      });
      directedMapPairs += 1;
    }
  }

  const elapsedSeconds = ((Date.now() - startedAtMs) / 1000).toFixed(2);
  console.log(
    `Server route parity passed: ${cityCount} cities, ${clientModels.size} maps, `
    + `${localRoutes} local city routes, ${crossMapRoutes} per-city cross-map routes, `
    + `${directedMapPairs} directed map chains in ${elapsedSeconds}s.`
  );
}

main();
