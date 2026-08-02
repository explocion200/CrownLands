"use strict";

const { calculateRoute: calculateCanonicalRoute } = require("./canonical-route-engine.js");
const { getAuthoritativeTerrainBlockers } = require("./authoritative-route-policy.js");

const DEFAULT_WORLD_WIDTH = 13000;
const DEFAULT_WORLD_HEIGHT = 17000;
const DEFAULT_GRID_SIZE = 50;
const ROUTE_CELL_FALLBACK_RADIUS = 32;
const ROUTE_CELL_FALLBACK_CANDIDATES = 24;
const ROUTE_CELL_FALLBACK_PAIR_LIMIT = 16;
const ROUTE_SEARCH_MAX_VISITED_CELLS = 10000;
const ISLAND_MAP_PADDING = 560;
const EDGE_ROUTE_INSET_MIN = 24;
const EDGE_ROUTE_INSET_MAX = 58;
const CITY_CLEARANCE = 46;
const STRUCTURE_CLEARANCE = 88;
const DEFAULT_STRONGHOLD_SIZE = 154;
const DEFAULT_CAMP_SIZE = 132;
const BASE_BITMAP_REGION_IDS = new Set(["west", "north", "east", "south", "center"]);
const SIDES = Object.freeze(["north", "south", "east", "west"]);
const OPPOSITE_SIDE = Object.freeze({
  north: "south",
  south: "north",
  east: "west",
  west: "east",
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cleanRegionId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback = 1) {
  const parsed = Math.floor(Number(value));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(1, Math.floor(Number(fallback) || 1));
}

function getWorldSize(layout = {}) {
  const settings = layout?.globalSettings || {};
  return {
    width: Math.max(1, Math.floor(safeNumber(settings.worldWidth, DEFAULT_WORLD_WIDTH))),
    height: Math.max(1, Math.floor(safeNumber(settings.worldHeight, DEFAULT_WORLD_HEIGHT))),
  };
}

function getGridSize(layout = {}) {
  const settings = layout?.globalSettings || {};
  return Math.max(40, Math.floor(safeNumber(settings.gridSize ?? layout.gridSize, DEFAULT_GRID_SIZE)));
}

function getImageDimensions(map = {}) {
  const image = map?.image && typeof map.image === "object" ? map.image : {};
  return {
    width: Math.max(1, Math.floor(safeNumber(map.imageWidth ?? image.width ?? map.width, 1200))),
    height: Math.max(1, Math.floor(safeNumber(map.imageHeight ?? image.height ?? map.height, 1200))),
  };
}

function getMapBounds(map = {}, worldSize = getWorldSize()) {
  const region = map?.region || {};
  const dimensions = getImageDimensions(map);
  const aspect = Math.max(0.1, dimensions.width / Math.max(1, dimensions.height));
  const padding = Math.max(
    ISLAND_MAP_PADDING,
    Math.round(Math.max(safeNumber(region.rx, 0), safeNumber(region.ry, 0)) * 0.22)
  );
  let width;
  let height;
  if (aspect >= 1) {
    width = Math.round((safeNumber(region.rx, 1000) + padding) * 2);
    height = Math.round(width / aspect);
  } else {
    height = Math.round((safeNumber(region.ry, 800) + padding) * 2);
    width = Math.round(height * aspect);
  }
  width = clamp(width, 1, worldSize.width);
  height = clamp(height, 1, worldSize.height);
  const left = clamp(
    Math.round(safeNumber(region.x, worldSize.width / 2) - width / 2),
    0,
    Math.max(0, worldSize.width - width)
  );
  const top = clamp(
    Math.round(safeNumber(region.y, worldSize.height / 2) - height / 2),
    0,
    Math.max(0, worldSize.height - height)
  );
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function imagePointToWorld(model = {}, point = {}) {
  return {
    x: model.bounds.left + safeNumber(point.x, 0) / model.dimensions.width * model.bounds.width,
    y: model.bounds.top + safeNumber(point.y, 0) / model.dimensions.height * model.bounds.height,
  };
}

function imageSizeToWorld(model = {}, value, fallback) {
  const size = positiveInteger(value, fallback);
  return Math.max(1, Math.round(size * model.bounds.width / model.dimensions.width));
}

function getEditorPoint(item = {}) {
  return item?.point && typeof item.point === "object" ? item.point : item;
}

function getConnectionTargetId(connection = {}) {
  return cleanRegionId(connection.connectsToRegionId || connection.targetRegionId || connection.target);
}

function getConnectionMidpoint(connection = {}) {
  const start = clamp(safeNumber(connection.start, 0), 0, 1);
  const end = clamp(safeNumber(connection.end, start), 0, 1);
  return clamp((Math.min(start, end) + Math.max(start, end)) / 2, 0, 1);
}

function getConnectionLinkId(connection = {}) {
  return String(
    connection.targetConnectionId
      || connection.targetPortalId
      || connection.targetPortal
      || connection.linkedPortalId
      || connection.connectedPortalId
      || ""
  );
}

function getConnectionImagePoint(model = {}, connection = {}) {
  const side = String(connection.side || "north").toLowerCase();
  const shortestSide = Math.max(1, Math.min(model.dimensions.width, model.dimensions.height));
  const inset = clamp(Math.round(shortestSide * 0.024), EDGE_ROUTE_INSET_MIN, EDGE_ROUTE_INSET_MAX);
  const along = getConnectionMidpoint(connection);
  return {
    x: side === "west" ? inset : side === "east" ? model.dimensions.width - inset : along * model.dimensions.width,
    y: side === "north" ? inset : side === "south" ? model.dimensions.height - inset : along * model.dimensions.height,
  };
}

function createPortals(model, knownRegionIds) {
  const portals = [];
  const edgeConnections = model.map?.edgeConnections && typeof model.map.edgeConnections === "object"
    ? model.map.edgeConnections
    : {};
  for (const side of SIDES) {
    const connections = Array.isArray(edgeConnections[side]) ? edgeConnections[side] : [];
    for (const rawConnection of connections) {
      const targetRegionId = getConnectionTargetId(rawConnection);
      if (!targetRegionId || !knownRegionIds.has(targetRegionId) || rawConnection?.intentionalOuter) continue;
      const connection = { ...rawConnection, side, targetRegionId };
      const imagePoint = getConnectionImagePoint(model, connection);
      const worldPoint = imagePointToWorld(model, imagePoint);
      portals.push({
        ...connection,
        id: String(connection.id || `${model.id}-${targetRegionId}-${side}`),
        targetRegionId,
        targetPortalId: getConnectionLinkId(connection),
        x: worldPoint.x,
        y: worldPoint.y,
      });
    }
  }
  return portals;
}

function sanitizeTerrainShape(shape = {}, regionId = "") {
  const rotation = safeNumber(shape.rot, 0);
  return {
    x: safeNumber(shape.x, 0),
    y: safeNumber(shape.y, 0),
    rx: Math.max(1, safeNumber(shape.rx, 1)),
    ry: Math.max(1, safeNumber(shape.ry, 1)),
    rot: rotation,
    cos: Number.isFinite(Number(shape.cos)) ? Number(shape.cos) : Math.cos(-rotation),
    sin: Number.isFinite(Number(shape.sin)) ? Number(shape.sin) : Math.sin(-rotation),
    type: String(shape.type || ""),
    regionId,
  };
}

function createStructureObstacles(model) {
  const obstacles = [];
  const addObstacle = (target, radius) => {
    const id = String(target?.id || "");
    if (!id) return;
    const point = imagePointToWorld(model, getEditorPoint(target));
    obstacles.push({ id, x: Math.round(point.x), y: Math.round(point.y), radius });
  };
  (Array.isArray(model.map?.cities) ? model.map.cities : []).forEach(city => {
    addObstacle(city, CITY_CLEARANCE);
  });
  (Array.isArray(model.map?.objectives) ? model.map.objectives : []).forEach(objective => {
    addObstacle(
      objective,
      Math.max(STRUCTURE_CLEARANCE, imageSizeToWorld(model, objective?.size, DEFAULT_STRONGHOLD_SIZE) * 0.55)
    );
  });
  (Array.isArray(model.map?.camps) ? model.map.camps : []).forEach(camp => {
    addObstacle(
      camp,
      Math.max(STRUCTURE_CLEARANCE, imageSizeToWorld(model, camp?.size, DEFAULT_CAMP_SIZE) * 0.55)
    );
  });
  return obstacles;
}

function createAuthoritativeRouteModels(layout = {}, options = {}) {
  const maps = (Array.isArray(layout?.maps) ? layout.maps : [])
    .map(map => {
      const id = cleanRegionId(map?.id);
      return id ? { ...map, id } : null;
    })
    .filter(Boolean);
  const worldSize = getWorldSize(layout);
  const knownRegionIds = new Set(maps.map(map => map.id));
  const terrainForRegion = typeof options.getTerrainBlockers === "function"
    ? options.getTerrainBlockers
    : getAuthoritativeTerrainBlockers;
  const models = new Map();
  for (const map of maps) {
    const dimensions = getImageDimensions(map);
    const bounds = getMapBounds(map, worldSize);
    const model = {
      id: map.id,
      map,
      region: map.region || {},
      dimensions,
      bounds,
      portals: [],
      obstacles: [],
      workerRegion: null,
    };
    const isBitmap = BASE_BITMAP_REGION_IDS.has(map.id) || Boolean(map.imageSrc || map.image?.src);
    const polygon = Array.isArray(map.landPolygon) && map.landPolygon.length >= 3
      ? map.landPolygon.map(point => ({ x: safeNumber(point?.x, 0), y: safeNumber(point?.y, 0) }))
      : [];
    model.workerRegion = {
      id: map.id,
      isBitmap,
      region: {
        id: map.id,
        x: safeNumber(model.region.x, 0),
        y: safeNumber(model.region.y, 0),
        rx: safeNumber(model.region.rx, 0),
        ry: safeNumber(model.region.ry, 0),
        rot: safeNumber(model.region.rot, 0),
      },
      bounds: { ...bounds },
      dimensions: { ...dimensions },
      landPolygon: polygon,
      terrainBlockers: (terrainForRegion(map.id) || []).map(shape => sanitizeTerrainShape(shape, map.id)),
    };
    model.obstacles = createStructureObstacles(model);
    models.set(map.id, model);
  }
  for (const model of models.values()) {
    model.portals = createPortals(model, knownRegionIds);
  }
  return { layout, models, worldSize, gridSize: getGridSize(layout) };
}

function getPortalForRoute(models, regionId, targetRegionId, options = {}) {
  const sourceId = cleanRegionId(regionId);
  const destinationId = cleanRegionId(targetRegionId);
  const portals = (models.get(sourceId)?.portals || [])
    .filter(portal => portal.targetRegionId === destinationId);
  const portalId = String(options.portalId || "");
  if (portalId) {
    const exact = portals.find(portal => portal.id === portalId);
    if (exact) return exact;
  }
  const targetPortalId = String(options.targetPortalId || "");
  if (targetPortalId) {
    const linked = portals.find(portal => portal.targetPortalId === targetPortalId);
    if (linked) return linked;
  }
  return portals[0] || null;
}

function getLinkedArrivalPortal(models, sourceRegionId, targetRegionId, sourcePortal) {
  const targetModel = models.get(cleanRegionId(targetRegionId));
  if (!targetModel || !sourcePortal) return null;
  const linkedPortalId = getConnectionLinkId(sourcePortal);
  if (linkedPortalId) {
    return targetModel.portals.find(portal => portal.id === linkedPortalId) || null;
  }
  if (sourcePortal.id) {
    const backLinked = getPortalForRoute(models, targetRegionId, sourceRegionId, {
      targetPortalId: sourcePortal.id,
    });
    if (backLinked) return backLinked;
  }
  const oppositeSide = OPPOSITE_SIDE[String(sourcePortal.side || "").toLowerCase()] || "";
  const sourceMidpoint = getConnectionMidpoint(sourcePortal);
  const candidates = targetModel.portals
    .filter(portal => portal.targetRegionId === cleanRegionId(sourceRegionId))
    .filter(portal => !oppositeSide || portal.side === oppositeSide);
  if (candidates.length) {
    candidates.sort((a, b) => (
      Math.abs(getConnectionMidpoint(a) - sourceMidpoint)
      - Math.abs(getConnectionMidpoint(b) - sourceMidpoint)
    ));
    return candidates[0];
  }
  return getPortalForRoute(models, targetRegionId, sourceRegionId);
}

function findAuthoritativeRegionChain(models, sourceRegionId, targetRegionId) {
  const sourceId = cleanRegionId(sourceRegionId);
  const targetId = cleanRegionId(targetRegionId);
  if (!models.has(sourceId) || !models.has(targetId)) return null;
  if (sourceId === targetId) return [sourceId];
  const queue = [[sourceId]];
  const visited = new Set([sourceId]);
  while (queue.length) {
    const chain = queue.shift();
    const current = chain[chain.length - 1];
    for (const portal of models.get(current)?.portals || []) {
      const next = portal.targetRegionId;
      if (!models.has(next) || visited.has(next)) continue;
      const nextChain = [...chain, next];
      if (next === targetId) return nextChain;
      visited.add(next);
      queue.push(nextChain);
    }
  }
  return null;
}

function makeRoutePoint(point = {}, fallback = "point") {
  const x = safeNumber(point.x, 0);
  const y = safeNumber(point.y, 0);
  return {
    id: String(point.id || `${fallback}:${Math.round(x)},${Math.round(y)}`),
    x,
    y,
  };
}

function getTargetRegionId(target = {}) {
  return cleanRegionId(target.regionId || target.startPool || target.mapId);
}

function buildAuthoritativeRouteLegs(models, source = {}, target = {}) {
  const sourceRegionId = getTargetRegionId(source);
  const targetRegionId = getTargetRegionId(target);
  const chain = findAuthoritativeRegionChain(models, sourceRegionId, targetRegionId);
  if (!chain?.length) return null;
  let current = makeRoutePoint(source, "source");
  const legs = [];
  for (let index = 0; index < chain.length; index += 1) {
    const regionId = chain[index];
    const nextRegionId = chain[index + 1] || "";
    if (!nextRegionId) {
      legs.push({ regionId, start: current, end: makeRoutePoint(target, "target") });
      continue;
    }
    const sourcePortal = getPortalForRoute(models, regionId, nextRegionId);
    if (!sourcePortal) return null;
    legs.push({
      regionId,
      start: current,
      end: makeRoutePoint(
        { ...sourcePortal, id: `portal:${regionId}->${nextRegionId}:${sourcePortal.id || "default"}` },
        "portal"
      ),
    });
    const arrivalPortal = getLinkedArrivalPortal(models, regionId, nextRegionId, sourcePortal);
    if (!arrivalPortal) return null;
    current = makeRoutePoint(
      { ...arrivalPortal, id: `portal:${nextRegionId}<-${regionId}:${arrivalPortal.id || "default"}` },
      "portal"
    );
  }
  return legs;
}

function buildAuthoritativeRouteJob(routeData, source = {}, target = {}) {
  const legs = buildAuthoritativeRouteLegs(routeData.models, source, target);
  if (!legs?.length) return null;
  const regionIds = [...new Set(legs.map(leg => cleanRegionId(leg.regionId)))];
  const gridCols = Math.ceil(routeData.worldSize.width / routeData.gridSize);
  const gridRows = Math.ceil(routeData.worldSize.height / routeData.gridSize);
  return {
    defaultRegionId: getTargetRegionId(source),
    constants: {
      worldWidth: routeData.worldSize.width,
      worldHeight: routeData.worldSize.height,
      gridSize: routeData.gridSize,
      fallbackRadius: ROUTE_CELL_FALLBACK_RADIUS,
      fallbackCandidates: ROUTE_CELL_FALLBACK_CANDIDATES,
      fallbackPairLimit: ROUTE_CELL_FALLBACK_PAIR_LIMIT,
      searchMaxVisitedCells: Math.max(
        2500,
        Math.min(ROUTE_SEARCH_MAX_VISITED_CELLS, gridCols * gridRows)
      ),
    },
    regions: Object.fromEntries(regionIds.map(regionId => [
      regionId,
      routeData.models.get(regionId)?.workerRegion,
    ])),
    obstaclesByRegion: Object.fromEntries(regionIds.map(regionId => [
      regionId,
      routeData.models.get(regionId)?.obstacles || [],
    ])),
    legs,
  };
}

function normalizeRouteResult(route) {
  if (!route?.points?.length || !route?.segments?.length || !(Number(route.length) > 0)) return null;
  const pathSegments = route.segments.map(segment => ({
    regionId: cleanRegionId(segment.regionId),
    points: segment.points.map(point => ({ x: safeNumber(point.x, 0), y: safeNumber(point.y, 0) })),
    length: safeNumber(segment.length, 0),
  }));
  return {
    routeRegionIds: pathSegments.map(segment => segment.regionId),
    pathSegments,
    path: pathSegments.flatMap((segment, index) => index ? segment.points.slice(1) : segment.points),
    pathLength: safeNumber(route.length, 0),
  };
}

function createAuthoritativeRoutePlanner(layout = {}, options = {}) {
  const routeData = createAuthoritativeRouteModels(layout, options);
  return Object.freeze({
    routeData,
    getModel: regionId => routeData.models.get(cleanRegionId(regionId)) || null,
    findRegionChain: (sourceRegionId, targetRegionId) => (
      findAuthoritativeRegionChain(routeData.models, sourceRegionId, targetRegionId)
    ),
    buildLegs: (source, target) => buildAuthoritativeRouteLegs(routeData.models, source, target),
    buildJob: (source, target) => buildAuthoritativeRouteJob(routeData, source, target),
    calculate(source, target) {
      const job = buildAuthoritativeRouteJob(routeData, source, target);
      return job ? normalizeRouteResult(calculateCanonicalRoute(job)) : null;
    },
  });
}

module.exports = Object.freeze({
  CITY_CLEARANCE,
  STRUCTURE_CLEARANCE,
  DEFAULT_STRONGHOLD_SIZE,
  DEFAULT_CAMP_SIZE,
  cleanRegionId,
  getWorldSize,
  getGridSize,
  getImageDimensions,
  getMapBounds,
  imagePointToWorld,
  createAuthoritativeRouteModels,
  getPortalForRoute,
  getLinkedArrivalPortal,
  findAuthoritativeRegionChain,
  buildAuthoritativeRouteLegs,
  buildAuthoritativeRouteJob,
  normalizeRouteResult,
  createAuthoritativeRoutePlanner,
});
