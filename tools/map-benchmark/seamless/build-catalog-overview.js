"use strict";
// Delivery atlas of existing approved artwork; no new painting or live asset edits.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const sharp = require(process.env.CROWNLANDS_SHARP_MODULE || "sharp");
const { createSeamlessFixture } = require("./fixtures");
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
async function build() {
  const scene = createSeamlessFixture(false, true), layers = [], inputs = [];
  if (scene.sections.length !== 81 || scene.sections.some(s => s.gridX < -4 || s.gridX > 4 || s.gridY < -4 || s.gridY > 4)) throw new Error("Review atlas dimensions for the changed catalog.");
  for (const s of scene.sections) {
    const bytes = fs.readFileSync(s.terrain); inputs.push({ path: s.terrain, sha256: hash(bytes) });
    const source = sharp(bytes);
    if (s.gutter) source.extract({ left: s.gutter, top: s.gutter, width: s.width, height: s.height });
    layers.push({ input: await source.resize(180, 135).png().toBuffer(), left: (s.gridX + 4) * 180, top: (s.gridY + 4) * 135 });
  }
  const bytes = await sharp({ create: { width: 1620, height: 1215, channels: 3, background: "#a4a15d" } }).composite(layers).webp({ quality: 82 }).toBuffer();
  const output = "tools/map-benchmark/seamless/terrain/catalog-overview.webp";
  fs.writeFileSync(output, bytes);
  for (const file of ["assets/worlds/core-expansion-v1/region-catalog.json", "tools/map-benchmark/seamless/build-catalog-overview.js", "tools/map-benchmark/seamless/fixtures.js", "tools/map-benchmark/seamless/model.js"]) inputs.push({ path: file, sha256: hash(fs.readFileSync(file)) });
  fs.writeFileSync(path.join(__dirname, "terrain/catalog-overview.json"), JSON.stringify({ width: 1620, height: 1215, sections: scene.sections.length, inputs, output: { path: output, bytes: bytes.length, sha256: hash(bytes) } }, null, 2) + "\n");
  console.log(`Private catalog overview: ${bytes.length} bytes, 81 existing terrain images.`);
}
if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { build };
