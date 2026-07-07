"use strict";

const routeCache = new Map();
const routeEdgePassableCache = new Map();

self.onmessage = event => {
  const message = event.data || {};
  if (message.type !== "route") return;
  try {
    const route = calculateRoute(message.job || {});
    self.postMessage({ type: "route", id: message.id, ok: true, route });
  } catch (error) {
    self.postMessage({
      type: "route",
      id: message.id,
      ok: false,
      error: error?.message || String(error),
    });
  }
};

function calculateRoute(job) {
  const constants = normalizeConstants(job.constants);
  const legs = Array.isArray(job.legs) ? job.legs : [];
  if (!legs.length) return null;

  const segments = [];
  const points = [];
  let length = 0;

  for (const leg of legs) {
    const route = findLandRouteForLeg(job, constants, leg);
    if (!route?.points?.length) return null;
    const segment = {
      regionId: normalizeRegionId(job, leg.regionId),
      points: route.points.map(point => ({ x: point.x, y: point.y })),
      length: route.length,
    };
    segments.push(segment);
    length += route.length;
    if (!points.length) points.push(...segment.points);
    else points.push(...segment.points.slice(1));
  }

  return { points, segments, length };
}

function normalizeConstants(raw = {}) {
  const worldWidth = Math.max(1, Math.floor(Number(raw.worldWidth) || 10000));
  const worldHeight = Math.max(1, Math.floor(Number(raw.worldHeight) || 7600));
  const gridSize = Math.max(20, Math.floor(Number(raw.gridSize) || 50));
  return {
    worldWidth,
    worldHeight,
    gridSize,
    gridCols: Math.max(1, Math.ceil(worldWidth / gridSize)),
    gridRows: Math.max(1, Math.ceil(worldHeight / gridSize)),
    fallbackRadius: Math.max(1, Math.floor(Number(raw.fallbackRadius) || 32)),
    fallbackCandidates: Math.max(1, Math.floor(Number(raw.fallbackCandidates) || 24)),
    fallbackPairLimit: Math.max(1, Math.floor(Number(raw.fallbackPairLimit) || 16)),
    searchMaxVisitedCells: Math.max(2500, Math.floor(Number(raw.searchMaxVisitedCells) || 24000)),
  };
}

function normalizeRegionId(job, regionId) {
  const value = String(regionId || "").trim();
  return job.regions?.[value]?.id || value || String(job.defaultRegionId || "center");
}

function makeRoutePoint(point = {}, fallback = "point") {
  return {
    id: String(point.id || `${fallback}:${Math.round(Number(point.x) || 0)},${Math.round(Number(point.y) || 0)}`),
    x: Number(point.x) || 0,
    y: Number(point.y) || 0,
  };
}

function getRoutePointId(point = {}, fallback = "point") {
  return point.id || `${fallback}:${Math.round(Number(point.x) || 0)},${Math.round(Number(point.y) || 0)}`;
}

function findLandRouteForLeg(job, constants, leg) {
  const regionId = normalizeRegionId(job, leg.regionId);
  const source = makeRoutePoint(leg.start, "source");
  const target = makeRoutePoint(leg.end, "target");
  const searchBudget = { visited: 0, max: constants.searchMaxVisitedCells };
  const context = createRouteContext(job, regionId, source, target, false);
  const primary = findLandRouteWithContext(job, constants, source, target, regionId, context, searchBudget);
  if (primary) return primary;
  if (context.obstacles.length) {
    const terrainOnlyContext = createRouteContext(job, regionId, source, target, true);
    return findLandRouteWithContext(job, constants, source, target, regionId, terrainOnlyContext, searchBudget);
  }
  return null;
}

function createRouteContext(job, regionId, source, target, ignoreCityObstacles) {
  const ignoredIds = new Set([source?.id, target?.id].filter(Boolean));
  const obstacles = ignoreCityObstacles
    ? []
    : (job.obstaclesByRegion?.[regionId] || [])
      .filter(obstacle => !ignoredIds.has(obstacle.id))
      .map(obstacle => ({
        id: String(obstacle.id || ""),
        x: Number(obstacle.x) || 0,
        y: Number(obstacle.y) || 0,
        radius: Math.max(0, Number(obstacle.radius) || 0),
      }));
  return {
    regionId,
    obstacles,
    cacheKey: `${ignoreCityObstacles ? "terrain-only" : "cityblock"}:${regionId}:${Array.from(ignoredIds).sort().join(",")}`,
  };
}

function findLandRouteWithContext(job, constants, source, target, regionId, context, searchBudget) {
  const cacheKey = `land-worker-v1:${regionId}:${context.cacheKey}:${getRoutePointId(source, "source")}|${getRoutePointId(target, "target")}`;
  if (routeCache.has(cacheKey)) return cloneRoute(routeCache.get(cacheKey));
  const reverseKey = `land-worker-v1:${regionId}:${context.cacheKey}:${getRoutePointId(target, "target")}|${getRoutePointId(source, "source")}`;
  if (routeCache.has(reverseKey)) {
    const reverse = reverseRoute(routeCache.get(reverseKey));
    routeCache.set(cacheKey, cloneRoute(reverse));
    return reverse;
  }

  const startPoint = { x: source.x, y: source.y };
  const endPoint = { x: target.x, y: target.y };
  if (linePassableInRegion(job, constants, startPoint, endPoint, regionId, context)) {
    const direct = {
      points: [startPoint, endPoint],
      segments: [{ regionId, points: [startPoint, endPoint], length: Math.hypot(source.x - target.x, source.y - target.y) }],
      length: Math.hypot(source.x - target.x, source.y - target.y),
    };
    routeCache.set(cacheKey, cloneRoute(direct));
    return direct;
  }

  const start = nearestWalkableCellInRegion(job, constants, source.x, source.y, regionId, context);
  const goal = nearestWalkableCellInRegion(job, constants, target.x, target.y, regionId, context);
  const triedCellPairs = new Set();
  const tryCells = (candidateStart, candidateGoal) => {
    if (!candidateStart || !candidateGoal) return null;
    const pairKey = `${getRouteCellKey(candidateStart)}|${getRouteCellKey(candidateGoal)}`;
    if (triedCellPairs.has(pairKey)) return null;
    triedCellPairs.add(pairKey);
    return findGridRouteInRegion(job, constants, candidateStart, candidateGoal, startPoint, endPoint, regionId, context, searchBudget);
  };

  const primaryRoute = tryCells(start, goal);
  if (primaryRoute) return commitRoute(cacheKey, primaryRoute);

  const startCandidates = getWalkableCellCandidatesInRegion(job, constants, source.x, source.y, regionId, context);
  const goalCandidates = getWalkableCellCandidatesInRegion(job, constants, target.x, target.y, regionId, context);
  for (const startCandidate of startCandidates) {
    const route = tryCells(startCandidate, goal);
    if (route) return commitRoute(cacheKey, route);
  }
  for (const goalCandidate of goalCandidates) {
    const route = tryCells(start, goalCandidate);
    if (route) return commitRoute(cacheKey, route);
  }

  let pairAttempts = 0;
  for (const startCandidate of startCandidates) {
    for (const goalCandidate of goalCandidates) {
      if (pairAttempts >= constants.fallbackPairLimit) return null;
      pairAttempts += 1;
      const route = tryCells(startCandidate, goalCandidate);
      if (route) return commitRoute(cacheKey, route);
    }
  }

  return null;
}

function commitRoute(cacheKey, route) {
  routeCache.set(cacheKey, cloneRoute(route));
  if (routeCache.size > 6000) routeCache.clear();
  return route;
}

function worldToGrid(constants, x, y) {
  return {
    gx: clamp(Math.floor(x / constants.gridSize), 0, constants.gridCols - 1),
    gy: clamp(Math.floor(y / constants.gridSize), 0, constants.gridRows - 1),
  };
}

function gridToWorld(constants, gx, gy) {
  return {
    x: gx * constants.gridSize + constants.gridSize / 2,
    y: gy * constants.gridSize + constants.gridSize / 2,
  };
}

function nearestWalkableCellInRegion(job, constants, x, y, regionId, context) {
  const start = worldToGrid(constants, x, y);
  if (isWalkableCellForRegion(job, constants, start.gx, start.gy, regionId, context)) return start;

  for (let radius = 1; radius <= 12; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const gx = start.gx + dx;
        const gy = start.gy + dy;
        if (isWalkableCellForRegion(job, constants, gx, gy, regionId, context)) return { gx, gy };
      }
    }
  }
  return null;
}

function getWalkableCellCandidatesInRegion(job, constants, x, y, regionId, context) {
  const start = worldToGrid(constants, x, y);
  const seen = new Set();
  const candidates = [];
  const maxRadius = constants.fallbackRadius;
  const maxCandidates = constants.fallbackCandidates;
  const addCandidate = (gx, gy, radius) => {
    if (gx < 0 || gy < 0 || gx >= constants.gridCols || gy >= constants.gridRows) return;
    const key = `${gx},${gy}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!isWalkableCellForRegion(job, constants, gx, gy, regionId, context)) return;
    const point = gridToWorld(constants, gx, gy);
    candidates.push({
      gx,
      gy,
      radius,
      distance: Math.hypot(point.x - x, point.y - y),
    });
  };

  addCandidate(start.gx, start.gy, 0);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        addCandidate(start.gx + dx, start.gy + dy, radius);
      }
    }
  }

  return candidates
    .sort((a, b) => a.distance - b.distance || a.radius - b.radius)
    .slice(0, maxCandidates)
    .map(({ gx, gy }) => ({ gx, gy }));
}

function isWalkableCellForRegion(job, constants, gx, gy, regionId, context) {
  if (gx < 0 || gy < 0 || gx >= constants.gridCols || gy >= constants.gridRows) return false;
  const point = gridToWorld(constants, gx, gy);
  return isRouteWalkablePointInRegion(job, point.x, point.y, regionId, context, 0);
}

function isRouteWalkablePointInRegion(job, x, y, regionId, context, padding = 0) {
  return isRegionWalkablePoint(job, x, y, regionId, padding)
    && !isRouteCityBlockedPoint(x, y, context, padding);
}

function isRouteCityBlockedPoint(x, y, context, padding = 0) {
  if (!context?.obstacles?.length) return false;
  for (const obstacle of context.obstacles) {
    const radius = obstacle.radius + padding;
    const dx = obstacle.x - x;
    const dy = obstacle.y - y;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

function isRegionWalkablePoint(job, x, y, regionId, padding = 0) {
  const region = job.regions?.[regionId];
  if (!region) return false;
  const samples = padding > 0
    ? [[0, 0], [padding, 0], [-padding, 0], [0, padding], [0, -padding]]
    : [[0, 0]];

  for (const [dx, dy] of samples) {
    if (!isRegionLandPoint(job, x + dx, y + dy, regionId, 0)) return false;
  }

  if (region.isBitmap) {
    return !isBitmapTerrainBlockedForRegion(job, x, y, regionId, padding);
  }

  return !(region.terrainBlockers || []).some(shape => {
    const extra = shape.type === "mountain" ? 20 : 10;
    return pointInEllipse(x, y, shape, padding + extra);
  });
}

function isRegionLandPoint(job, x, y, regionId, padding = 0) {
  const region = job.regions?.[regionId];
  if (!region) return false;
  if (region.isBitmap) return isBitmapRegionLandPoint(job, x, y, regionId, padding);
  return pointInEllipse(x, y, {
    x: region.region?.x,
    y: region.region?.y,
    rx: (Number(region.region?.rx) || 0) + padding,
    ry: (Number(region.region?.ry) || 0) + padding,
    rot: Number(region.region?.rot) || 0,
  });
}

function isBitmapRegionLandPoint(job, x, y, regionId, padding = 0) {
  const region = job.regions?.[regionId];
  const bounds = region?.bounds || {};
  const dimensions = region?.dimensions || {};
  if (x < bounds.left - padding || x > bounds.right + padding || y < bounds.top - padding || y > bounds.bottom + padding) return false;
  const point = worldToIslandImagePoint(region, x, y);
  if (point.x < 0 || point.y < 0 || point.x > dimensions.width || point.y > dimensions.height) return false;
  const polygon = Array.isArray(region.landPolygon) ? region.landPolygon : [];
  return polygon.length ? pointInPolygon(point.x, point.y, polygon) : true;
}

function isBitmapTerrainBlockedForRegion(job, x, y, regionId, padding = 0) {
  const region = job.regions?.[regionId];
  const point = worldToIslandImagePoint(region, x, y);
  return (region?.terrainBlockers || []).some(shape => pointInImageEllipse(point, shape, padding));
}

function linePassableInRegion(job, constants, a, b, regionId, context) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const steps = Math.max(2, Math.ceil(distance / 22));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!isRouteWalkablePointInRegion(job, x, y, regionId, context, 6)) return false;
  }
  return true;
}

function gridEdgePassableInRegion(job, constants, cx, cy, nx, ny, regionId, context) {
  const currentIndex = cy * constants.gridCols + cx;
  const nextIndex = ny * constants.gridCols + nx;
  const baseKey = currentIndex < nextIndex ? `${currentIndex}|${nextIndex}` : `${nextIndex}|${currentIndex}`;
  const key = `${regionId}:${context?.cacheKey || "terrain"}:${baseKey}`;
  if (routeEdgePassableCache.has(key)) return routeEdgePassableCache.get(key);
  if (routeEdgePassableCache.size > 400000) routeEdgePassableCache.clear();
  const passable = linePassableInRegion(job, constants, gridToWorld(constants, cx, cy), gridToWorld(constants, nx, ny), regionId, context);
  routeEdgePassableCache.set(key, passable);
  return passable;
}

function findGridRouteInRegion(job, constants, start, goal, startPoint, endPoint, regionId, context, searchBudget) {
  if (!start || !goal) return null;
  const startIndex = start.gy * constants.gridCols + start.gx;
  const goalIndex = goal.gy * constants.gridCols + goal.gx;
  const open = new RoutePriorityQueue();
  open.push(startIndex, 0);
  const gScore = new Map([[startIndex, 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];

  while (open.length) {
    const current = open.pop();
    if (!current || closed.has(current.index)) continue;
    if (searchBudget.visited >= searchBudget.max) return null;
    if (current.index === goalIndex) {
      return buildRouteFromCells(job, constants, cameFrom, current.index, startPoint, endPoint, regionId, context);
    }

    closed.add(current.index);
    searchBudget.visited += 1;
    const cx = current.index % constants.gridCols;
    const cy = Math.floor(current.index / constants.gridCols);
    const currentG = gScore.get(current.index) || 0;

    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkableCellForRegion(job, constants, nx, ny, regionId, context)) continue;
      if (dx && dy && (!isWalkableCellForRegion(job, constants, cx + dx, cy, regionId, context) || !isWalkableCellForRegion(job, constants, cx, cy + dy, regionId, context))) continue;
      if (!gridEdgePassableInRegion(job, constants, cx, cy, nx, ny, regionId, context)) continue;
      const nextIndex = ny * constants.gridCols + nx;
      if (closed.has(nextIndex)) continue;
      const tentative = currentG + cost;
      if (tentative >= (gScore.get(nextIndex) ?? Infinity)) continue;
      cameFrom.set(nextIndex, current.index);
      gScore.set(nextIndex, tentative);
      const h = Math.hypot(goal.gx - nx, goal.gy - ny);
      open.push(nextIndex, tentative + h);
    }
  }
  return null;
}

function buildRouteFromCells(job, constants, cameFrom, currentIndex, startPoint, endPoint, regionId, context) {
  const cells = [];
  let current = currentIndex;
  cells.push(current);
  while (cameFrom.has(current)) {
    current = cameFrom.get(current);
    cells.push(current);
  }
  cells.reverse();

  let points = [
    startPoint,
    ...cells.map(index => gridToWorld(constants, index % constants.gridCols, Math.floor(index / constants.gridCols))),
    endPoint,
  ];
  points = simplifyRoute(job, constants, points, regionId, context);
  return { points, length: routeLength(points) };
}

function simplifyRoute(job, constants, points, regionId, context) {
  if (points.length <= 2) return points;
  const simplified = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = points.length - 1;
    while (next > anchor + 1) {
      if (linePassableInRegion(job, constants, points[anchor], points[next], regionId, context)) break;
      next -= 1;
    }
    simplified.push(points[next]);
    anchor = next;
  }
  return simplified;
}

function routeLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return length;
}

function reverseRoute(route) {
  const reversed = cloneRoute(route);
  reversed.points.reverse();
  if (Array.isArray(reversed.segments)) {
    reversed.segments.reverse();
    reversed.segments.forEach(segment => segment.points.reverse());
  }
  return reversed;
}

function cloneRoute(route) {
  return {
    length: Number(route.length) || routeLength(route.points || []),
    points: (route.points || []).map(point => ({ x: point.x, y: point.y })),
    segments: Array.isArray(route.segments)
      ? route.segments.map(segment => ({
          regionId: segment.regionId,
          length: Number(segment.length) || routeLength(segment.points || []),
          points: (segment.points || []).map(point => ({ x: point.x, y: point.y })),
        }))
      : [],
  };
}

function getRouteCellKey(cell) {
  return `${cell?.gx ?? -1},${cell?.gy ?? -1}`;
}

function worldToIslandImagePoint(region, x, y) {
  const bounds = region?.bounds || {};
  const dimensions = region?.dimensions || {};
  return {
    x: (x - bounds.left) / Math.max(1, bounds.width) * Math.max(1, dimensions.width),
    y: (y - bounds.top) / Math.max(1, bounds.height) * Math.max(1, dimensions.height),
  };
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = Number(polygon[i]?.x) || 0;
    const yi = Number(polygon[i]?.y) || 0;
    const xj = Number(polygon[j]?.x) || 0;
    const yj = Number(polygon[j]?.y) || 0;
    const denominator = yj - yi || Number.EPSILON;
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / denominator + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInEllipse(x, y, shape, padding = 0) {
  const rot = Number(shape?.rot) || 0;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const dx = x - (Number(shape?.x) || 0);
  const dy = y - (Number(shape?.y) || 0);
  const xr = dx * cos - dy * sin;
  const yr = dx * sin + dy * cos;
  const rx = Math.max(1, (Number(shape?.rx) || 0) + padding);
  const ry = Math.max(1, (Number(shape?.ry) || 0) + padding);
  return ((xr * xr) / (rx * rx)) + ((yr * yr) / (ry * ry)) <= 1;
}

function pointInImageEllipse(point, shape, padding = 0) {
  const dx = point.x - (Number(shape?.x) || 0);
  const dy = point.y - (Number(shape?.y) || 0);
  const cos = Number.isFinite(Number(shape?.cos)) ? Number(shape.cos) : Math.cos(-(Number(shape?.rot) || 0));
  const sin = Number.isFinite(Number(shape?.sin)) ? Number(shape.sin) : Math.sin(-(Number(shape?.rot) || 0));
  const xr = dx * cos - dy * sin;
  const yr = dx * sin + dy * cos;
  const rx = Math.max(1, (Number(shape?.rx) || 0) + padding);
  const ry = Math.max(1, (Number(shape?.ry) || 0) + padding);
  return ((xr * xr) / (rx * rx)) + ((yr * yr) / (ry * ry)) <= 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class RoutePriorityQueue {
  constructor() {
    this.items = [];
  }

  get length() {
    return this.items.length;
  }

  push(index, f) {
    const item = { index, f };
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (!this.items.length) return null;
    const top = this.items[0];
    const end = this.items.pop();
    if (this.items.length && end) {
      this.items[0] = end;
      this.sinkDown(0);
    }
    return top;
  }

  bubbleUp(index) {
    const item = this.items[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.items[parentIndex];
      if (item.f >= parent.f) break;
      this.items[parentIndex] = item;
      this.items[index] = parent;
      index = parentIndex;
    }
  }

  sinkDown(index) {
    const length = this.items.length;
    const item = this.items[index];
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let swapIndex = -1;

      if (leftIndex < length && this.items[leftIndex].f < item.f) swapIndex = leftIndex;
      if (rightIndex < length) {
        const right = this.items[rightIndex];
        const left = swapIndex === -1 ? item : this.items[leftIndex];
        if (right.f < left.f) swapIndex = rightIndex;
      }
      if (swapIndex === -1) break;
      this.items[index] = this.items[swapIndex];
      this.items[swapIndex] = item;
      index = swapIndex;
    }
  }
}
