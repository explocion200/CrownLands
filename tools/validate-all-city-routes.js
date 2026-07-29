const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT_DIR = path.resolve(__dirname, "..");
const SIDES = ["north", "south", "east", "west"];
const OPPOSITE_SIDE = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};
const CITY_CLEARANCE = 46;
const OBJECTIVE_CLEARANCE = 88;
const DEFAULT_STRONGHOLD_SIZE = 154;
const DEFAULT_CAMP_SIZE = 132;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cleanRegionId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readWindowData(filePath, globalName) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), sandbox, {
    filename: path.basename(filePath),
    timeout: 1000,
  });
  return sandbox.window[globalName] || {};
}

function extractObjectArgument(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Could not find ${marker}.`);
  const start = source.indexOf("{", markerIndex + marker.length);
  if (start < 0) throw new Error(`Could not find the ${marker} object.`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === "\"" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not parse the ${marker} object.`);
}

function getTerrainBlockers() {
  const gameSource = fs.readFileSync(path.join(ROOT_DIR, "game.js"), "utf8");
  const objectSource = extractObjectArgument(gameSource, "const IMAGE_TERRAIN_BLOCKERS = normalizeImageTerrainShapes(");
  return vm.runInNewContext(`(${objectSource})`, {}, { timeout: 1000 });
}

function getMaps(editorData) {
  return (Array.isArray(editorData.maps) ? editorData.maps : [])
    .map(map => {
      const id = cleanRegionId(map?.id);
      return id ? { ...map, id } : null;
    })
    .filter(Boolean);
}

function getWorldSize(worldConfig, editorData) {
  return {
    width: Math.max(1, Math.floor(Number(editorData?.globalSettings?.worldWidth || worldConfig.width) || 10000)),
    height: Math.max(1, Math.floor(Number(editorData?.globalSettings?.worldHeight || worldConfig.height) || 7600)),
  };
}

function getMergedRegions(worldConfig, maps) {
  const regions = new Map();
  for (const region of Array.isArray(worldConfig.regions) ? worldConfig.regions : []) {
    const id = cleanRegionId(region?.id);
    if (id) regions.set(id, { ...region, id });
  }
  maps.forEach((map, index) => {
    const patch = map.region && typeof map.region === "object" ? map.region : {};
    const existing = regions.get(map.id) || {};
    const fallback = {
      x: Number(worldConfig.width) / 2,
      y: Number(worldConfig.height) / 2,
      rx: 1100,
      ry: 900,
      cityRx: 900,
      cityRy: 700,
      rot: 0,
    };
    regions.set(map.id, {
      ...fallback,
      ...existing,
      ...patch,
      id: map.id,
      label: map.label || patch.label || existing.label || `Map ${index + 1}`,
    });
  });
  return regions;
}

function getImageDimensions(map) {
  const image = map?.image && typeof map.image === "object" ? map.image : {};
  return {
    width: Math.max(1, Math.floor(Number(map?.imageWidth || image.width || map?.width) || 1200)),
    height: Math.max(1, Math.floor(Number(map?.imageHeight || image.height || map?.height) || 1200)),
  };
}

function getMapBounds(region, map, worldSize) {
  const dimensions = getImageDimensions(map);
  const aspect = Math.max(0.1, dimensions.width / dimensions.height);
  const padding = Math.max(560, Math.round(Math.max(Number(region.rx) || 0, Number(region.ry) || 0) * 0.22));
  let width;
  let height;
  if (aspect >= 1) {
    width = Math.round((Number(region.rx) + padding) * 2);
    height = Math.round(width / aspect);
  } else {
    height = Math.round((Number(region.ry) + padding) * 2);
    width = Math.round(height * aspect);
  }
  width = clamp(width, 1, worldSize.width);
  height = clamp(height, 1, worldSize.height);
  const left = clamp(Math.round(Number(region.x) - width / 2), 0, Math.max(0, worldSize.width - width));
  const top = clamp(Math.round(Number(region.y) - height / 2), 0, Math.max(0, worldSize.height - height));
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

function imagePointToWorld(mapModel, point) {
  return {
    x: mapModel.bounds.left + (Number(point?.x) || 0) / mapModel.dimensions.width * mapModel.bounds.width,
    y: mapModel.bounds.top + (Number(point?.y) || 0) / mapModel.dimensions.height * mapModel.bounds.height,
  };
}

function imageSizeToWorld(mapModel, value, fallback) {
  const size = Math.max(1, Number(value) || fallback);
  return Math.max(1, Math.round(size * mapModel.bounds.width / mapModel.dimensions.width));
}

function getPoint(item) {
  const point = item?.point && typeof item.point === "object" ? item.point : item;
  return { x: Number(point?.x) || 0, y: Number(point?.y) || 0 };
}

function getTargetRegionId(zone) {
  return cleanRegionId(zone?.connectsToRegionId || zone?.targetRegionId || zone?.target);
}

function getMidpoint(zone) {
  const start = clamp(Number(zone?.start) || 0, 0, 1);
  const end = clamp(Number(zone?.end) || start, 0, 1);
  return clamp((Math.min(start, end) + Math.max(start, end)) / 2, 0, 1);
}

function getPortalPoint(mapModel, side, zone) {
  const shortestSide = Math.min(mapModel.dimensions.width, mapModel.dimensions.height);
  const inset = clamp(Math.round(shortestSide * 0.024), 24, 58);
  const along = getMidpoint(zone);
  return imagePointToWorld(mapModel, {
    x: side === "west" ? inset : side === "east" ? mapModel.dimensions.width - inset : along * mapModel.dimensions.width,
    y: side === "north" ? inset : side === "south" ? mapModel.dimensions.height - inset : along * mapModel.dimensions.height,
  });
}

function createMapModels(worldConfig, editorData, terrainBlockers) {
  const maps = getMaps(editorData);
  const worldSize = getWorldSize(worldConfig, editorData);
  const regions = getMergedRegions(worldConfig, maps);
  const models = new Map();
  for (const map of maps) {
    const region = regions.get(map.id);
    const dimensions = getImageDimensions(map);
    const bounds = getMapBounds(region, map, worldSize);
    const model = {
      id: map.id,
      label: map.label || region.label || map.id,
      map,
      region,
      dimensions,
      bounds,
      cities: [],
      objectives: [],
      camps: [],
      portals: [],
    };
    model.cities = (Array.isArray(map.cities) ? map.cities : []).map((city, index) => ({
      id: String(city?.id || `${map.id}_${index + 1}`),
      name: String(city?.name || `City ${index + 1}`),
      regionId: map.id,
      ...imagePointToWorld(model, getPoint(city)),
    }));
    model.objectives = (Array.isArray(map.objectives) ? map.objectives : []).map((objective, index) => ({
      id: String(objective?.id || `${map.id}_objective_${index + 1}`),
      name: String(objective?.name || `Objective ${index + 1}`),
      regionId: map.id,
      size: imageSizeToWorld(model, objective?.size, DEFAULT_STRONGHOLD_SIZE),
      ...imagePointToWorld(model, getPoint(objective)),
    }));
    model.camps = (Array.isArray(map.camps) ? map.camps : []).map((camp, index) => ({
      id: String(camp?.id || `${map.id}_camp_${index + 1}`),
      name: String(camp?.name || `Camp ${index + 1}`),
      regionId: map.id,
      size: imageSizeToWorld(model, camp?.size, DEFAULT_CAMP_SIZE),
      ...imagePointToWorld(model, getPoint(camp)),
    }));
    for (const side of SIDES) {
      for (const zone of Array.isArray(map.edgeConnections?.[side]) ? map.edgeConnections[side] : []) {
        const targetRegionId = getTargetRegionId(zone);
        if (!targetRegionId || zone?.intentionalOuter) continue;
        model.portals.push({
          ...zone,
          id: String(zone?.id || `${map.id}-${targetRegionId}-${side}`),
          regionId: map.id,
          targetRegionId,
          targetPortalId: String(zone?.targetConnectionId || zone?.targetPortalId || ""),
          side,
          ...getPortalPoint(model, side, zone),
        });
      }
    }
    model.workerRegion = {
      id: map.id,
      isBitmap: true,
      region: {
        id: map.id,
        x: Number(region.x) || 0,
        y: Number(region.y) || 0,
        rx: Number(region.rx) || 0,
        ry: Number(region.ry) || 0,
        rot: Number(region.rot) || 0,
      },
      bounds,
      dimensions,
      landPolygon: (Array.isArray(map.landPolygon) ? map.landPolygon : []).map(point => ({
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
      })),
      terrainBlockers: (terrainBlockers[map.id] || []).map(shape => ({
        x: Number(shape.x) || 0,
        y: Number(shape.y) || 0,
        rx: Math.max(1, Number(shape.rx) || 1),
        ry: Math.max(1, Number(shape.ry) || 1),
        rot: Number(shape.rot) || 0,
        cos: Math.cos(-(Number(shape.rot) || 0)),
        sin: Math.sin(-(Number(shape.rot) || 0)),
        type: String(shape.type || ""),
        regionId: map.id,
      })),
    };
    model.obstacles = [
      ...model.cities.map(city => ({ id: city.id, x: city.x, y: city.y, radius: CITY_CLEARANCE })),
      ...model.objectives.map(objective => ({
        id: objective.id,
        x: objective.x,
        y: objective.y,
        radius: Math.max(OBJECTIVE_CLEARANCE, objective.size * 0.55),
      })),
      ...model.camps.map(camp => ({
        id: camp.id,
        x: camp.x,
        y: camp.y,
        radius: Math.max(OBJECTIVE_CLEARANCE, camp.size * 0.55),
      })),
    ];
    models.set(map.id, model);
  }
  return { models, worldSize };
}

function getLinkedArrivalPortal(models, sourcePortal) {
  const targetModel = models.get(sourcePortal.targetRegionId);
  if (!targetModel) return null;
  if (sourcePortal.targetPortalId) {
    const exact = targetModel.portals.find(portal => portal.id === sourcePortal.targetPortalId);
    if (exact) return exact;
  }
  const backLinked = targetModel.portals.find(portal => (
    portal.targetRegionId === sourcePortal.regionId
    && portal.targetPortalId === sourcePortal.id
  ));
  if (backLinked) return backLinked;
  const oppositeSide = OPPOSITE_SIDE[sourcePortal.side];
  const candidates = targetModel.portals
    .filter(portal => portal.targetRegionId === sourcePortal.regionId)
    .filter(portal => !oppositeSide || portal.side === oppositeSide)
    .sort((a, b) => Math.abs(getMidpoint(a) - getMidpoint(sourcePortal)) - Math.abs(getMidpoint(b) - getMidpoint(sourcePortal)));
  return candidates[0]
    || targetModel.portals.find(portal => portal.targetRegionId === sourcePortal.regionId)
    || null;
}

function findRegionChain(models, sourceRegionId, targetRegionId) {
  if (sourceRegionId === targetRegionId) return [sourceRegionId];
  const queue = [[sourceRegionId]];
  const visited = new Set([sourceRegionId]);
  while (queue.length) {
    const chain = queue.shift();
    const current = chain[chain.length - 1];
    for (const portal of models.get(current)?.portals || []) {
      const next = portal.targetRegionId;
      if (!models.has(next) || visited.has(next)) continue;
      const nextChain = [...chain, next];
      if (next === targetRegionId) return nextChain;
      visited.add(next);
      queue.push(nextChain);
    }
  }
  return null;
}

function buildLegs(models, source, target) {
  if (source.regionId === target.regionId) {
    return [{ regionId: source.regionId, start: source, end: target }];
  }
  const chain = findRegionChain(models, source.regionId, target.regionId);
  if (!chain) return null;
  const legs = [];
  let current = source;
  for (let index = 0; index < chain.length; index += 1) {
    const regionId = chain[index];
    const nextRegionId = chain[index + 1] || "";
    if (!nextRegionId) {
      legs.push({ regionId, start: current, end: target });
      continue;
    }
    const sourcePortal = models.get(regionId)?.portals.find(portal => portal.targetRegionId === nextRegionId);
    if (!sourcePortal) return null;
    const arrivalPortal = getLinkedArrivalPortal(models, sourcePortal);
    if (!arrivalPortal) return null;
    legs.push({
      regionId,
      start: current,
      end: {
        id: `portal:${regionId}->${nextRegionId}:${sourcePortal.id}`,
        x: sourcePortal.x,
        y: sourcePortal.y,
      },
    });
    current = {
      id: `portal:${nextRegionId}<-${regionId}:${arrivalPortal.id}`,
      x: arrivalPortal.x,
      y: arrivalPortal.y,
    };
  }
  return legs;
}

function createWorker() {
  const sandbox = {
    console,
    self: { postMessage() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT_DIR, "route-worker.js"), "utf8"), sandbox, {
    filename: "route-worker.js",
  });
  if (typeof sandbox.calculateRoute !== "function") throw new Error("Route worker did not expose calculateRoute.");
  return sandbox.calculateRoute;
}

function createJob(models, worldSize, worldConfig, legs) {
  const regionIds = [...new Set(legs.map(leg => leg.regionId))];
  return {
    defaultRegionId: legs[0]?.regionId || "center",
    constants: {
      worldWidth: worldSize.width,
      worldHeight: worldSize.height,
      gridSize: Math.max(40, Math.floor(Number(worldConfig.gridSize) || 50)),
      fallbackRadius: 32,
      fallbackCandidates: 24,
      fallbackPairLimit: 16,
      searchMaxVisitedCells: Math.max(
        2500,
        Math.min(
          10000,
          Math.ceil(worldSize.width / Math.max(40, Number(worldConfig.gridSize) || 50))
            * Math.ceil(worldSize.height / Math.max(40, Number(worldConfig.gridSize) || 50))
        )
      ),
    },
    regions: Object.fromEntries(regionIds.map(regionId => [regionId, models.get(regionId)?.workerRegion])),
    obstaclesByRegion: Object.fromEntries(regionIds.map(regionId => [regionId, models.get(regionId)?.obstacles || []])),
    legs,
  };
}

function validateRouteResult(route, legs, label) {
  if (!route?.points?.length || route.points.length < 2) {
    throw new Error(`${label}: no route returned.`);
  }
  if (!Array.isArray(route.segments) || route.segments.length !== legs.length) {
    throw new Error(`${label}: expected ${legs.length} route segments, received ${route.segments?.length || 0}.`);
  }
  if (!Number.isFinite(Number(route.length)) || Number(route.length) < 0) {
    throw new Error(`${label}: route length is invalid.`);
  }
  for (const segment of route.segments) {
    if (!Array.isArray(segment.points) || segment.points.length < 2) {
      throw new Error(`${label}: ${segment.regionId} returned an empty segment.`);
    }
    if (segment.points.some(point => !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y)))) {
      throw new Error(`${label}: ${segment.regionId} returned a non-finite route point.`);
    }
  }
}

function runRoute(calculateRoute, models, worldSize, worldConfig, legs, label) {
  if (!legs?.length) throw new Error(`${label}: route legs could not be built.`);
  const route = calculateRoute(createJob(models, worldSize, worldConfig, legs));
  validateRouteResult(route, legs, label);
  return route;
}

function validateAllCityRoutes() {
  const worldConfig = readWindowData(path.join(ROOT_DIR, "world-config.js"), "CROWNLANDS_WORLD_CONFIG");
  const editorData = readWindowData(path.join(ROOT_DIR, "assets", "map-editor-data.js"), "CROWNLANDS_MAP_EDITOR_DATA");
  const terrainBlockers = getTerrainBlockers();
  const { models, worldSize } = createMapModels(worldConfig, editorData, terrainBlockers);
  const calculateRoute = createWorker();
  const failures = [];
  let cityPortalRoutes = 0;
  let portalTransitRoutes = 0;
  let crossMapRoutes = 0;
  const startedAt = Date.now();

  for (const model of models.values()) {
    if (!model.cities.length) failures.push(`${model.label}: map has no cities.`);
    if (!model.portals.length) failures.push(`${model.label}: map has no transit portals.`);
    const gateway = model.portals[0];
    for (const city of model.cities) {
      if (gateway) {
        const target = { id: `portal:${model.id}:${gateway.id}`, regionId: model.id, x: gateway.x, y: gateway.y };
        try {
          runRoute(
            calculateRoute,
            models,
            worldSize,
            worldConfig,
            [{ regionId: model.id, start: city, end: target }],
            `${model.label} / ${city.name} -> ${gateway.id}`
          );
          cityPortalRoutes += 1;
        } catch (error) {
          failures.push(error.message);
        }
      }
    }
    for (let startIndex = 0; startIndex < model.portals.length; startIndex += 1) {
      for (let endIndex = startIndex + 1; endIndex < model.portals.length; endIndex += 1) {
        const startPortal = model.portals[startIndex];
        const endPortal = model.portals[endIndex];
        try {
          runRoute(
            calculateRoute,
            models,
            worldSize,
            worldConfig,
            [{
              regionId: model.id,
              start: { id: `portal:${model.id}:${startPortal.id}`, x: startPortal.x, y: startPortal.y },
              end: { id: `portal:${model.id}:${endPortal.id}`, x: endPortal.x, y: endPortal.y },
            }],
            `${model.label} / ${startPortal.id} -> ${endPortal.id}`
          );
          portalTransitRoutes += 1;
        } catch (error) {
          failures.push(error.message);
        }
      }
    }
    console.log(`Checked ${model.label}: ${model.cities.length} cities and ${model.portals.length} portals.`);
  }

  for (const sourceModel of models.values()) {
    const source = sourceModel.cities[0];
    if (!source) continue;
    for (const targetModel of models.values()) {
      if (sourceModel.id === targetModel.id) continue;
      const target = targetModel.cities[0];
      if (!target) continue;
      try {
        runRoute(
          calculateRoute,
          models,
          worldSize,
          worldConfig,
          buildLegs(models, source, target),
          `${sourceModel.label} / ${source.name} -> ${targetModel.label} / ${target.name}`
        );
        crossMapRoutes += 1;
      } catch (error) {
        failures.push(error.message);
      }
    }
  }

  const cityCount = [...models.values()].reduce((total, model) => total + model.cities.length, 0);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(
    `All-city route validation: ${cityCount} cities, ${models.size} maps, `
    + `${cityPortalRoutes} city/portal routes, ${portalTransitRoutes} portal transit routes, `
    + `${crossMapRoutes} cross-map routes in ${elapsedSeconds}s.`
  );
  if (failures.length) {
    console.error(`Route failures found (${failures.length}):`);
    failures.slice(0, 100).forEach(failure => console.error(`- ${failure}`));
    if (failures.length > 100) console.error(`- ...and ${failures.length - 100} more.`);
    process.exitCode = 1;
    return;
  }
  console.log("Every city is reachable locally and through the live portal route worker.");
}

function validateRegionCityPairs(regionId) {
  const worldConfig = readWindowData(path.join(ROOT_DIR, "world-config.js"), "CROWNLANDS_WORLD_CONFIG");
  const editorData = readWindowData(path.join(ROOT_DIR, "assets", "map-editor-data.js"), "CROWNLANDS_MAP_EDITOR_DATA");
  const terrainBlockers = getTerrainBlockers();
  const { models, worldSize } = createMapModels(worldConfig, editorData, terrainBlockers);
  const model = models.get(cleanRegionId(regionId));
  if (!model) throw new Error(`Unknown route-validation region: ${regionId}`);

  const calculateRoutes = [createWorker(), createWorker()];
  const failures = [];
  let checked = 0;
  const startedAt = Date.now();
  for (let sourceIndex = 0; sourceIndex < model.cities.length; sourceIndex += 1) {
    for (let targetIndex = sourceIndex + 1; targetIndex < model.cities.length; targetIndex += 1) {
      const firstCity = model.cities[sourceIndex];
      const secondCity = model.cities[targetIndex];
      const directedRoutes = [[firstCity, secondCity], [secondCity, firstCity]];
      for (let directionIndex = 0; directionIndex < directedRoutes.length; directionIndex += 1) {
        const [source, target] = directedRoutes[directionIndex];
        try {
          runRoute(
            calculateRoutes[directionIndex],
            models,
            worldSize,
            worldConfig,
            [{ regionId: model.id, start: source, end: target }],
            `${model.label} / ${source.name} -> ${target.name}`
          );
        } catch (error) {
          failures.push(error.message);
        }
        checked += 1;
      }
    }
    if ((sourceIndex + 1) % 5 === 0) {
      console.log(`Checked ${sourceIndex + 1}/${model.cities.length} ${model.label} cities (${checked} directed routes, ${failures.length} failures).`);
    }
  }

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`Pairwise route validation: ${model.label}, ${checked} directed city routes in ${elapsedSeconds}s.`);
  if (failures.length) {
    console.error(`Pairwise route failures found (${failures.length}):`);
    failures.slice(0, 100).forEach(failure => console.error(`- ${failure}`));
    if (failures.length > 100) console.error(`- ...and ${failures.length - 100} more.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Every city pair in ${model.label} is reachable in both directions through the live route worker.`);
}

const pairwiseRegionArgument = process.argv.find(argument => argument.startsWith("--pairwise-region="));
if (pairwiseRegionArgument) {
  validateRegionCityPairs(pairwiseRegionArgument.slice("--pairwise-region=".length));
} else {
  validateAllCityRoutes();
}
