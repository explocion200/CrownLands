"use strict";
const fs = require("node:fs");
const path = require("node:path");
const M = require("./model");
const { spreadCities, CASTLE_SIZE } = require("./layout");
const ROOT = path.resolve(__dirname, "../../..");
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

function createSeamlessFixture(crowded = false, fullCatalog = false) {
  const contract = read("functions/release-config.json");
  if (contract.worldTopology !== "core-expansion-v1") throw new Error("Preview requires the current Core topology.");
  const catalog = read("assets/worlds/core-expansion-v1/region-catalog.json");
  const clearance = read("tools/map-art/clearance.json");
  const halloween = read("assets/optimized/halloween-map-layouts-v3.json");
  const regions = catalog.regions.filter(r => fullCatalog || (r.gridX >= -2 && r.gridX <= 0 && r.gridY >= -2 && r.gridY <= 0));
  const minX = Math.min(...regions.map(r => r.gridX)), minY = Math.min(...regions.map(r => r.gridY));
  const sections = regions.map(r => {
    const definition = read(r.regionDefinitionPath);
    if (definition.width !== M.TILE.width || definition.height !== M.TILE.height) throw new Error("Unexpected section footprint.");
    const privateArt = fs.existsSync(path.join(ROOT, `tools/map-benchmark/seamless/terrain/${r.id}.webp`));
    return { id: r.id, name: r.name, gridX: r.gridX, gridY: r.gridY, x: (r.gridX - minX) * M.TILE.width, y: (r.gridY - minY) * M.TILE.height, width: definition.width, height: definition.height,
      terrain: privateArt ? `tools/map-benchmark/seamless/terrain/${r.id}.webp` : r.mapAsset,
      thumbnail: privateArt ? `tools/map-benchmark/seamless/terrain/${r.id}-thumb.webp` : r.thumbnailAsset,
      gutter: privateArt ? 2 : 0, cityCount: definition.cities.length, definition, art: r.artPresentation,
      roads: clearance.maps.find(m => m.id === r.id).roads };
  });
  if (sections.length !== (fullCatalog ? catalog.regions.length : 9)) throw new Error("Unexpected preview section count.");
  const objects = [];
  const owners = ["Lady Rowan · sample", "Sir Alder · sample", "House Ember · sample", "Neutral · sample"];
  function add(section, raw, kind, asset, width, height, left, top, index, previewLocal = { x: raw.x, y: raw.y }) {
    const point = M.localToWorld(section, previewLocal), dx = previewLocal.x - raw.x, dy = previewLocal.y - raw.y;
    objects.push({ key: M.identity(section.id, raw.id), id: raw.id, sectionId: section.id, sectionName: section.name,
      name: raw.name || raw.type, kind, local: { x: raw.x, y: raw.y }, previewLocal, artLocal: { x: left, y: top, width, height }, ...point,
      left: section.x + left + dx, top: section.y + top + dy, width, height, asset,
      owner: owners[index % owners.length], troops: 1250 + (index * 7919) % 850000, selectable: kind !== "scenery" });
  }
  for (const section of sections) {
    const seasonal = (halloween.maps[section.id] || []).map(([assetIndex, x, y], i) => {
      const a = halloween.assets[assetIndex]; return { id: `sample-halloween-${i}`, name: "Autumn scenery", x, y, width: a.w, height: a.h, asset: a.src };
    });
    const obstacles = [...section.art.landmarks, ...section.art.scenery.map(a => ({ x: a.x - a.w / 2, y: a.y - a.h / 2, width: a.w, height: a.h })), ...seasonal];
    const positions = spreadCities(section, obstacles);
    section.definition.cities.forEach((city, i) => {
      const stage = 1 + i % 5;
      add(section, city, "castle", catalog.mapPresentation.cityStageAssets[stage], CASTLE_SIZE, CASTLE_SIZE, city.x - CASTLE_SIZE / 2, city.y - CASTLE_SIZE / 2, i, positions.get(city.id));
    });
    section.art.landmarks.forEach((item, i) => {
      const original = [...section.definition.camps, ...section.definition.strongholds].find(o => o.id === item.id);
      const center = original || { id: item.id, name: item.name, x: item.x + item.width / 2, y: item.y + item.height / 2 };
      add(section, center, item.kind, item.asset, item.width, item.height, item.x, item.y, i);
    });
    section.art.scenery.forEach((item, i) => add(section, item, "scenery", item.asset, item.w, item.h, item.x - item.w / 2, item.y - item.h / 2, i));
    // Fixed October art fixture, independent of the host clock or live account.
    seasonal.forEach((a, i) => add(section, a, "scenery", a.asset, a.width, a.height, a.x, a.y, i));
  }
  // Six routes use the exact painted polylines approaching opposite sides of
  // three horizontal and three vertical seams. Ping-pong avoids teleport loops.
  const marches = [];
  function seamRoute(a, b, side, opposite) {
    const boundary = { west: [0, 543], east: [1448, 543], north: [724, 0], south: [724, 1086] };
    function approach(section, edge) {
      const [x, y] = boundary[edge];
      for (const line of section.roads) {
        let ordered = line;
        if (line.at(-1)[0] === x && line.at(-1)[1] === y) ordered = [...line].reverse();
        if (ordered[0][0] === x && ordered[0][1] === y) return ordered.slice(0, 85).map(([px, py]) => M.localToWorld(section, { x: px, y: py }));
      }
      throw new Error(`Missing ${edge} road: ${section.id}`);
    }
    const points = [...approach(a, side).reverse(), ...approach(b, opposite).slice(1)];
    const i = marches.length;
    marches.push({ id: `sample-march-${i + 1}`, key: M.identity(a.id, `sample-march-${i + 1}`), sectionId: a.id,
      name: `Sample patrol ${i + 1}`, kind: "troop", owner: owners[i % 3], troops: 25000 + i * 12500,
      sections: [a.id, b.id], points, speed: 42 + i * 3, phase: i * 0.13,
      asset: "assets/icons/skills/atlas-v1/marchOrders.webp" });
  }
  const at = (x, y) => sections.find(s => s.gridX === x && s.gridY === y);
  if (fullCatalog) {
    for (const s of sections) {
      if (at(s.gridX + 1, s.gridY)) seamRoute(s, at(s.gridX + 1, s.gridY), "east", "west");
      if (at(s.gridX, s.gridY + 1)) seamRoute(s, at(s.gridX, s.gridY + 1), "south", "north");
    }
  } else {
    for (let i = -2; i <= 0; i++) seamRoute(at(-2, i), at(-1, i), "east", "west");
    for (let i = -2; i <= 0; i++) seamRoute(at(i, -2), at(i, -1), "south", "north");
  }
  if (crowded) {
    const originals = [...marches];
    for (let i = originals.length; i < (fullCatalog ? originals.length * 12 : 240); i++) { const m = originals[i % originals.length]; marches.push({ ...m, id: `sample-crowded-${i}`, key: M.identity(m.sectionId, `sample-crowded-${i}`), name: `Crowded patrol ${i + 1}`, phase: (i * 0.61803398875) % 1 }); }
  }
  return { topology: contract.worldTopology, label: "Private prototype — sample data", crowded, fullCatalog,
    width: (Math.max(...regions.map(r => r.gridX)) - minX + 1) * M.TILE.width, height: (Math.max(...regions.map(r => r.gridY)) - minY + 1) * M.TILE.height,
    homeSectionId: at(-1, -1).id, sections: sections.map(({ definition, art, roads, ...s }) => s), objects, marches };
}
module.exports = { createSeamlessFixture };
