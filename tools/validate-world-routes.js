const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT_DIR = path.resolve(__dirname, "..");
const SIDES = ["north", "south", "east", "west"];
const OPPOSITE_SIDE = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

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
  const source = fs.readFileSync(filePath, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: path.basename(filePath), timeout: 1000 });
  return sandbox.window[globalName] || {};
}

function getEditorMaps(data) {
  return Array.isArray(data.maps)
    ? data.maps
        .map(map => {
          const id = cleanRegionId(map.id);
          return id ? { ...map, id } : null;
        })
        .filter(Boolean)
    : [];
}

function getMergedWorldRegions(worldConfig, editorData) {
  const regions = new Map();
  for (const region of Array.isArray(worldConfig.regions) ? worldConfig.regions : []) {
    const id = cleanRegionId(region.id);
    if (id) regions.set(id, { ...region, id });
  }
  for (const map of getEditorMaps(editorData)) {
    const existing = regions.get(map.id) || {};
    const regionPatch = map.region && typeof map.region === "object" ? map.region : {};
    regions.set(map.id, {
      ...existing,
      ...regionPatch,
      id: map.id,
      label: map.label || regionPatch.label || existing.label || map.id,
      gridX: Number.isFinite(Number(map.gridX)) ? Math.round(Number(map.gridX)) : regionPatch.gridX ?? existing.gridX,
      gridY: Number.isFinite(Number(map.gridY)) ? Math.round(Number(map.gridY)) : regionPatch.gridY ?? existing.gridY,
    });
  }
  return Array.from(regions.values());
}

function getWorldSize(worldConfig, editorData) {
  return {
    width: Math.max(1, Math.floor(Number(editorData?.globalSettings?.worldWidth || worldConfig.width) || 10000)),
    height: Math.max(1, Math.floor(Number(editorData?.globalSettings?.worldHeight || worldConfig.height) || 7600)),
  };
}

function getImageDimensions(map) {
  const image = map?.image && typeof map.image === "object" ? map.image : {};
  return {
    width: Math.max(1, Math.floor(Number(map?.imageWidth || image.width || map?.width) || 1200)),
    height: Math.max(1, Math.floor(Number(map?.imageHeight || image.height || map?.height) || 1200)),
  };
}

function getIslandMapPadding(region) {
  return Math.max(560, Math.round(Math.max(Number(region?.rx) || 0, Number(region?.ry) || 0) * 0.22));
}

function getImageIslandMapBounds(region, map, worldSize) {
  const dimensions = getImageDimensions(map);
  const aspect = Math.max(0.1, dimensions.width / Math.max(1, dimensions.height));
  const padding = getIslandMapPadding(region);
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
  const rawLeft = Math.round(Number(region.x) - width / 2);
  const rawTop = Math.round(Number(region.y) - height / 2);
  const left = clamp(rawLeft, 0, Math.max(0, worldSize.width - width));
  const top = clamp(rawTop, 0, Math.max(0, worldSize.height - height));
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    clamped: left !== rawLeft || top !== rawTop,
  };
}

function getEdgeMidpoint(zone) {
  const start = clamp(Number(zone?.start) || 0, 0, 1);
  const end = clamp(Number(zone?.end) || start, 0, 1);
  return clamp((Math.min(start, end) + Math.max(start, end)) / 2, 0, 1);
}

function getEdgeRoutePoint(map, zone, side) {
  const dimensions = getImageDimensions(map);
  const shortestSide = Math.max(1, Math.min(dimensions.width, dimensions.height));
  const inset = clamp(Math.round(shortestSide * 0.024), 24, 58);
  const along = getEdgeMidpoint(zone);
  return {
    x: side === "west" ? inset : side === "east" ? dimensions.width - inset : along * dimensions.width,
    y: side === "north" ? inset : side === "south" ? dimensions.height - inset : along * dimensions.height,
  };
}

function imagePointToWorld(point, map, bounds) {
  const dimensions = getImageDimensions(map);
  return {
    x: bounds.left + (Number(point.x) || 0) / dimensions.width * bounds.width,
    y: bounds.top + (Number(point.y) || 0) / dimensions.height * bounds.height,
  };
}

function getTargetRegionId(zone) {
  return cleanRegionId(zone?.connectsToRegionId || zone?.targetRegionId || zone?.target);
}

function getConnections(map) {
  const connections = [];
  for (const side of SIDES) {
    const zones = Array.isArray(map.edgeConnections?.[side]) ? map.edgeConnections[side] : [];
    for (const zone of zones) {
      if (zone?.intentionalOuter) continue;
      connections.push({
        mapId: map.id,
        side,
        id: String(zone?.id || `${map.id}_${side}`),
        targetRegionId: getTargetRegionId(zone),
        midpoint: getEdgeMidpoint(zone),
        zone,
      });
    }
  }
  return connections;
}

function findReachableRegions(startRegionId, connectionsBySource) {
  const seen = new Set([startRegionId]);
  const queue = [startRegionId];
  while (queue.length) {
    const current = queue.shift();
    for (const connection of connectionsBySource.get(current) || []) {
      if (!seen.has(connection.targetRegionId)) {
        seen.add(connection.targetRegionId);
        queue.push(connection.targetRegionId);
      }
    }
  }
  return seen;
}

function validateWorldRoutes() {
  const worldConfig = readWindowData(path.join(ROOT_DIR, "world-config.js"), "CROWNLANDS_WORLD_CONFIG");
  const editorData = readWindowData(path.join(ROOT_DIR, "assets", "map-editor-data.js"), "CROWNLANDS_MAP_EDITOR_DATA");
  const maps = getEditorMaps(editorData);
  const mapById = new Map(maps.map(map => [map.id, map]));
  const regions = getMergedWorldRegions(worldConfig, editorData);
  const regionById = new Map(regions.map(region => [cleanRegionId(region.id), region]));
  const worldSize = getWorldSize(worldConfig, editorData);
  const issues = [];

  if (!editorData.globalSettings) {
    issues.push("assets/map-editor-data.js is missing globalSettings, so runtime world sizing can drift from the editor.");
  }

  for (const map of maps) {
    const region = regionById.get(map.id);
    if (!region) {
      issues.push(`${map.id} has no merged world region.`);
      continue;
    }
    if (!Number.isFinite(Number(region.x)) || !Number.isFinite(Number(region.y))) {
      issues.push(`${map.id} has invalid runtime x/y coordinates.`);
      continue;
    }
    const bounds = getImageIslandMapBounds(region, map, worldSize);
    if (bounds.clamped) {
      issues.push(`${map.id} map bounds are clamped by the ${worldSize.width}x${worldSize.height} world.`);
    }
  }

  const allConnections = maps.flatMap(getConnections);
  const connectionsBySource = new Map();
  for (const connection of allConnections) {
    if (!connectionsBySource.has(connection.mapId)) connectionsBySource.set(connection.mapId, []);
    connectionsBySource.get(connection.mapId).push(connection);
  }

  for (const connection of allConnections) {
    if (!mapById.has(connection.targetRegionId)) {
      issues.push(`${connection.mapId}.${connection.side}.${connection.id} targets missing region ${connection.targetRegionId}.`);
      continue;
    }
    const reciprocal = (connectionsBySource.get(connection.targetRegionId) || [])
      .filter(candidate => candidate.targetRegionId === connection.mapId);
    if (!reciprocal.length) {
      issues.push(`${connection.mapId}.${connection.side}.${connection.id} has no reciprocal connection from ${connection.targetRegionId}.`);
      continue;
    }
    const expectedSide = OPPOSITE_SIDE[connection.side];
    const oppositeMatches = reciprocal.filter(candidate => candidate.side === expectedSide);
    if (!oppositeMatches.length) {
      issues.push(`${connection.mapId}.${connection.side}.${connection.id} should return through ${connection.targetRegionId}.${expectedSide}.`);
    } else {
      const best = oppositeMatches
        .slice()
        .sort((a, b) => Math.abs(a.midpoint - connection.midpoint) - Math.abs(b.midpoint - connection.midpoint))[0];
      if (Math.abs(best.midpoint - connection.midpoint) > 0.35) {
        issues.push(`${connection.mapId}.${connection.side}.${connection.id} midpoint is far from ${connection.targetRegionId}.${best.side}.${best.id}.`);
      }
    }

    const map = mapById.get(connection.mapId);
    const region = regionById.get(connection.mapId);
    const bounds = getImageIslandMapBounds(region, map, worldSize);
    const routePoint = getEdgeRoutePoint(map, connection.zone, connection.side);
    const worldPoint = imagePointToWorld(routePoint, map, bounds);
    if (worldPoint.x < bounds.left || worldPoint.x > bounds.right || worldPoint.y < bounds.top || worldPoint.y > bounds.bottom) {
      issues.push(`${connection.mapId}.${connection.side}.${connection.id} route point lands outside its map bounds.`);
    }
  }

  for (const map of maps) {
    const reachable = findReachableRegions(map.id, connectionsBySource);
    if (reachable.size !== maps.length) {
      issues.push(`${map.id} can only reach ${reachable.size}/${maps.length} regions through edge connections.`);
    }
  }

  console.log(`World route validation: ${maps.length} maps, ${allConnections.length} edge connections, ${worldSize.width}x${worldSize.height} world.`);
  if (issues.length) {
    console.error("Route issues found:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log("No route issues found.");
}

validateWorldRoutes();
