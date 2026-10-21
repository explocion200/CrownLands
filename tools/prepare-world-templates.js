"use strict";
// Freeze the reviewed artwork positions, not fictional accounts or marches.
const fs = require("node:fs"), path = require("node:path");
const { createSeamlessFixture } = require("./map-benchmark/seamless/fixtures");
const scene = createSeamlessFixture(false, true);
const data = {
  version: 1, homeSectionId: scene.homeSectionId,
  assets: fs.readdirSync(path.resolve(__dirname, "../assets"), { recursive: true }).filter(file => /\.(webp|png|svg)$/.test(file)).map(file => "assets/" + file).sort(),
  sections: scene.sections.map(({ id, name, gridX, gridY, x, y, width, height, templateId }) => ({ id, name, gridX, gridY, x, y, width, height, templateId: templateId || id })),
  objects: scene.objects.map(({ key, id, sectionId, sectionName, name, kind, local, previewLocal, artLocal, x, y, left, top, width, height, asset, selectable }) =>
    ({ key, id, sectionId, sectionName, name, kind, local, previewLocal, artLocal, x, y, left, top, width, height, asset, selectable })),
};
const file = path.resolve(__dirname, "../local-backend/world/templates.json");
const bytes = JSON.stringify(data) + "\n";
if (process.argv.includes("--check")) {
  if (fs.readFileSync(file, "utf8") !== bytes) throw Error("Continuous world templates differ from reviewed placements");
} else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
console.log(`World templates: ${data.sections.length} sections; no player or march data.`);
