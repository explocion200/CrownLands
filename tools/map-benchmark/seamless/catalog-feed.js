"use strict";
// Fictional read-only transport. Never imports accounts or a database client.
const { createSeamlessFixture } = require("./fixtures");
function createCatalogFeed(crowded = false) {
  const scene = createSeamlessFixture(crowded, true);
  const bySection = new Map(scene.sections.map(s => [s.id, scene.objects.filter(o => o.sectionId === s.id)]));
  const paths = new Map();
  const marches = scene.marches.map(m => {
    const routeId = m.sections.join("|");
    if (!paths.has(routeId)) paths.set(routeId, { id: routeId, points: m.points });
    const { points, ...actor } = m; return { ...actor, routeId };
  });
  const { objects, marches: _marches, ...metadata } = scene;
  const manifest = { ...metadata, overviewAsset: "tools/map-benchmark/seamless/terrain/catalog-overview.webp", objectCount: objects.length,
    cityCount: objects.filter(o => o.kind === "castle").length, marchCount: marches.length };
  function read(ids, revision) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 16 || new Set(ids).size !== ids.length || ids.some(id => !bySection.has(id))) throw new Error("Invalid section subscription");
    const wanted = new Set(ids);
    const actors = marches.filter(m => m.sections.some(id => wanted.has(id))).map(m => ({ ...m, troops: m.troops + revision % 5 * 100 }));
    const routes = [...new Set(actors.map(m => m.routeId))].map(id => paths.get(id));
    return { revision, sections: ids.map(id => ({ id, objects: bySection.get(id).map((o, i) => i === 0 ? { ...o, owner: revision % 2 ? "House Willow · sample" : o.owner, troops: o.troops + revision % 5 * 100 } : o) })), marches: actors, routes };
  }
  return { manifest, read };
}
module.exports = { createCatalogFeed };
