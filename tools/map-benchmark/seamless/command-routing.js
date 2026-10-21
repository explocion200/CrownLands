"use strict";
// Explicitly injected into disposable PostgreSQL command rehearsals only.
// This file is outside every installed/published game runtime.
const { createHash } = require("node:crypto");
const { buildCatalog, fixture, gameToImage, imageToGame } = require("./live-catalog");
const { createDisplayLayout } = require("./open-world-layout");
const { createRouteService } = require("./open-route-service");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const error = (code, message) => Object.assign(new Error(message), { code });

function createCommandRouting() {
  const worlds = new Map();
  let enabled = false, closed = false;
  function world(context) {
    if (closed) throw error("unavailable", "Private route worker is closed.");
    if (!Array.isArray(context?.activeRegionIds)) throw error("failed-precondition", "Active private realm required.");
    const activeRegionIds = [...new Set(context.activeRegionIds)].sort();
    const key = hash([context.worldId, context.resetGeneration, context.sharedRealmId, activeRegionIds]);
    if (!worlds.has(key)) {
      if (worlds.size >= 2) {
        const disposable = [...worlds].find(([, entry]) => !entry.service.stats().pending);
        if (!disposable) throw error("unavailable", "Private route workers are busy.");
        worlds.delete(disposable[0]); void disposable[1].service.close();
      }
      const { manifest } = buildCatalog(context, { ...context, realmShardId: context.sharedRealmId,
        topologyVersion: "core-expansion-v1", activeRegionIds });
      const display = createDisplayLayout(manifest, fixture);
      const geometryId = hash(display.geometry);
      worlds.set(key, { display, geometryId, service: createRouteService(display.geometry) });
    }
    return worlds.get(key);
  }
  function point(display, endpoint) {
    const section = display.sections.get(endpoint.regionId);
    const local = section && gameToImage(section, endpoint);
    if (!local) throw error("failed-precondition", "Endpoint is outside the active private world.");
    const projected = display.project(section, local);
    return { x: section.x + projected.x, y: section.y + projected.y };
  }
  return {
    get enabled() { return enabled && !closed; },
    setEnabled(value) { enabled = value === true; },
    nearbySections(endpoint, radius, context) {
      const { display } = world(context), p = point(display, endpoint);
      const pixels = radius / display.geometry.unitsPerPixel;
      return [...display.sections.values()].filter(s => Math.hypot(Math.max(s.x-p.x, 0, p.x-s.x-s.width), Math.max(s.y-p.y, 0, p.y-s.y-s.height)) <= pixels).map(s => s.id);
    },
    distance(source, target, context) {
      const { display } = world(context);
      const a = point(display, source), b = point(display, target);
      return Math.hypot(a.x - b.x, a.y - b.y) * display.geometry.unitsPerPixel;
    },
    async calculate(source, target, context) {
      const { display, geometryId, service } = world(context);
      const result = await service.route(point(display, source), point(display, target));
      if (result.status !== "ok") throw error(
        ["busy", "unavailable", "budget-exceeded"].includes(result.status) ? "unavailable" : "failed-precondition",
        `Private route ${result.status}.`);
      const pathSegments = result.segments.map(segment => {
        const section = display.sections.get(segment.sectionId);
        const points = segment.points.map(p => imageToGame(section, { x: p.x - section.x, y: p.y - section.y }));
        return { regionId: section.id, routingVersion: result.version, geometryId, points,
          length: points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0) };
      });
      return { pathSegments, routeRegionIds: [...new Set(pathSegments.map(s => s.regionId))],
        path: pathSegments.flatMap((s, i) => i ? s.points.slice(1) : s.points).slice(0, 160),
        pathLength: pathSegments.reduce((sum, s) => sum + s.length, 0) };
    },
    stats: () => ({ worlds: worlds.size, workers: [...worlds.values()].map(w => w.service.stats()) }),
    async close() { closed = true; await Promise.all([...worlds.values()].map(w => w.service.close())); worlds.clear(); },
  };
}
module.exports = { createCommandRouting };
