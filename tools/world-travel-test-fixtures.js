"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const topology = require("../functions/coreExpansionTopology.js");
const network = require("../functions/world-travel-network.js");
const runtime = require("../region-catalog.js");
const routing = require("../functions/authoritative-route-planner.js");
const layout = require("../functions/core-expansion-world-layout.json");
const catalog = require("../functions/core-expansion-region-catalog.json");
const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}.`);
  const body = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = body; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (!depth) return source.slice(start, index + 1);
  }
  throw new Error(`Cannot extract ${name}.`);
}

function createTravelFixture(newLandsCount = 24) {
  const activeRegionIds = Array.from({ length: newLandsCount }, (_, index) => topology.getRegionAtActivationOrdinal(index).id);
  const scope = {
    CORE_EXPANSION: topology, WORLD_TRAVEL: network,
    CORE_STATIC_SERVER_WORLD_MAP_BY_ID: new Map(layout.maps.map(map => [map.id, map])),
    SERVER_CATALOG_REGION_BY_ID: new Map(catalog.regions.map(region => [region.id, region])),
    CORE_PERMANENT_REGION_IDS: catalog.regions.filter(region => region.permanentCore).map(region => region.id),
    CORE_TEMPLATE_WORLD_MAPS: layout.maps.filter(map => topology.parseNewLandsRegionId(map.id))
      .sort((a, b) => topology.parseNewLandsRegionId(a.id).activationOrdinal - topology.parseNewLandsRegionId(b.id).activationOrdinal),
    CORE_EXPANSION_SERVER_WORLD_LAYOUT: layout, CORE_ROUTE_PLANNER_CACHE: new Map(),
    CARDINAL_REGION_DIRECTIONS: runtime.DIRECTIONS,
    REALM_REQUEST_CONTEXT: { getStore: () => ({ activeTravelRegionIds: activeRegionIds }) },
    createAuthoritativeRoutePlanner: routing.createAuthoritativeRoutePlanner,
    getAuthoritativeTerrainBlockers: () => [], isCoreExpansionTopologyActive: () => true,
    normalizeRegionId: value => String(value || "").trim().toLowerCase(),
    safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  };
  vm.createContext(scope);
  vm.runInContext(["getServerWorldMap", "getServerCatalogRegion", "connectServerWorldMaps",
    "getCoreExpansionRegionDescriptors", "getCoreAuthoritativeRoutePlanner", "getAuthoritativeRoutePlannerForRegions"]
    .map(name => extractFunction(serverSource, name)).join("\n"), scope);
  const planner = scope.getAuthoritativeRoutePlannerForRegions(activeRegionIds);
  const descriptors = JSON.parse(JSON.stringify(scope.getCoreExpansionRegionDescriptors({ activeRegionIds })));
  return { scope, planner, descriptors, activeRegionIds, maps: [...planner.routeData.models.values()].map(model => model.map) };
}

function canonicalCity(planner, regionId, index = 0) {
  const model = planner.getModel(regionId);
  const city = model.map.cities[index];
  const point = routing.imagePointToWorld(model, city);
  return { ...city, regionId, x: Math.round(point.x), y: Math.round(point.y) };
}

function createClientScope(fixture) {
  const summaries = new Map(fixture.descriptors.map(region => [region.id, region]));
  const scope = {
    window: { CROWNLANDS_WORLD_TRAVEL: network }, console,
    CORE_EXPANSION_TOPOLOGY_ACTIVE: true, REGION_CATALOG_RUNTIME: runtime,
    REGION_CATALOG: { regions: fixture.descriptors }, REGION_CATALOG_SUMMARIES_BY_ID: summaries,
    regionDefinitionCache: new Map(), WORLD_REGIONS_BY_ID: summaries,
    DEFAULT_PORTAL_VISUAL_SIZE: 100, EDGE_TRANSITION_ROUTE_INSET_MIN: 24, EDGE_TRANSITION_ROUTE_INSET_MAX: 58,
    EDGE_TRANSITION_ARROW_INSET_MIN: 24, EDGE_TRANSITION_ARROW_INSET_MAX: 58,
    getRegionIds: () => [...summaries.keys()], getRegionLabel: id => summaries.get(id)?.name || id,
    isWorldRegionRuntimeActive: id => summaries.has(id), cleanEditorRegionId: id => String(id || "").trim().toLowerCase(),
    normalizeRegionId: id => String(id || ""), getCityRegionId: city => city.regionId,
    getIslandImageDimensions: id => fixture.planner.getModel(id).dimensions,
    islandImagePointToWorld: (id, point) => routing.imagePointToWorld(fixture.planner.getModel(id), point),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    lastSelectedOwnedCityId: "", cityById: id => scope.ownedCities.find(city => city.id === id),
    ownedCities: [], playerCities: () => scope.ownedCities,
  };
  vm.createContext(scope);
  vm.runInContext([
    "buildCatalogEditorMap", "getEditorMap", "getEditorEdgeConnectionDefinitions", "getEdgeConnectionTargetRegionId",
    "getEdgeConnectionMidpoint", "getEdgeConnectionInset", "getEdgeConnectionImagePoint", "getEdgeTransitionArrowSymbol",
    "createEditorPortalFromEdgeConnection", "getEditorPortalDefinitions", "getEditorPortalLinkId", "getEditorPortalForRoute",
    "getLinkedEditorArrivalPortal", "findEditorPortalRouteRegionChain", "getPortalRouteRegionChain", "getPortalWorldPoint",
    "getRouteHeuristicDistance", "getOwnedSourceCandidates", "findNearestOwnedSourceCandidate",
    "getLastSelectedOwnedAttackCity", "findLastSelectedAttackSource", "findPreferredAttackSource",
    "getRoutePointId", "makeRoutePoint", "buildRouteWorkerLegs", "isOrderRouteReady",
  ].map(name => extractFunction(clientSource, name)).join("\n"), scope);
  return scope;
}

module.exports = { root, network, runtime, topology, routing, catalog, layout, serverSource, clientSource,
  extractFunction, createTravelFixture, canonicalCity, createClientScope };
