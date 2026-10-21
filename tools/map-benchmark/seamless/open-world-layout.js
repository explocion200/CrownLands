"use strict";
// Private display layout. Saved game coordinates and gameplay remain untouched.
function createDisplayLayout(manifest, fixture) {
  const templates = new Map(fixture.sections.map(s => [s.id, fixture.objects.filter(o => o.sectionId === s.id && o.kind !== "scenery")]));
  const sections = new Map(manifest.sections.map(s => [s.id, s]));
  function match(section, local, kind) {
    return templates.get(section.templateId)?.find(o => (!kind || o.kind === kind) && Math.hypot(local.x - o.local.x, local.y - o.local.y) <= 1);
  }
  function project(section, local, kind) {
    const original = match(section, local, kind);
    return original ? { ...original.previewLocal } : { ...local };
  }
  const obstacles = [], slots = [];
  for (const section of manifest.sections) for (const item of templates.get(section.templateId) || []) {
    const x = section.x + item.previewLocal.x, y = section.y + item.previewLocal.y;
    const key = `${section.id}:${item.id}`;
    // Decorative scenery does not block the existing game. Structures do.
    const radius = item.kind === "castle" ? 28 : Math.max(28, Math.min(item.width, item.height) * .38);
    obstacles.push({ key, x, y, radius });
    slots.push({ key, sectionId: section.id, x, y, kind: item.kind });
  }
  return { project, match, sections, geometry: {
    version: "open-world-draft-v1", sections: manifest.sections.map(s => ({ id:s.id, x:s.x, y:s.y, width:s.width, height:s.height })),
    obstacles, slots, unitsPerPixel: manifest.sections[0].gameBounds.width / manifest.sections[0].width,
  } };
}
module.exports = { createDisplayLayout };
