"use strict";
// Recompose the existing imagegen paintings + code-native roads as one private
// surface, then cut delivery tiles. Never write production artwork or catalogs.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const sharp = require(process.env.CROWNLANDS_SHARP_MODULE || "sharp");
const { roadsSvg } = require("../../build-clean-map-ground");
const M = require("./model");
const root = path.resolve(__dirname, "../../.."), out = path.join(__dirname, "terrain");
const source = "docs/art-sources/clean-map-ground/ground.png";
const dirt = "docs/art-sources/blended-dirt-roads/dirt-material.png";
const catalogPath = "assets/worlds/core-expansion-v1/region-catalog.json", roadsPath = "tools/map-art/clearance.json";
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
async function build() {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file)));
  if (read("functions/release-config.json").worldTopology !== "core-expansion-v1") throw new Error("Unexpected active topology");
  const sections = read(catalogPath).regions.filter(r => r.gridX >= -2 && r.gridX <= 0 && r.gridY >= -2 && r.gridY <= 0);
  if (sections.length !== 9) throw new Error("Expected nine private sections");
  const roads = read(roadsPath), layers = [], worldRoads = [];
  for (const section of sections) {
    const { x, y } = M.offset(section);
    const ground = sharp(path.join(root, source)).resize(M.TILE.width, M.TILE.height, { fit: "fill" });
    // Adjacent copies share the same edge pixels. No unrelated seed can flip
    // one side of a join; the four-section corners also share identical ground.
    if ((section.gridX + 2) % 2) ground.flop();
    if ((section.gridY + 2) % 2) ground.flip();
    layers.push({ input: await ground.png().toBuffer(), left: x, top: y });
    worldRoads.push(...roads.maps.find(m => m.id === section.id).roads.map(line => line.map(([px, py, w]) => [px + x, py + y, w])));
  }
  const material = await sharp(path.join(root, dirt)).resize(384, 384).png().toBuffer();
  // One road mask/material phase crosses the entire plane, including joins.
  const svg = roadsSvg(worldRoads, material, 0).toString()
    .replaceAll('width="1448" height="1086"', `width="${M.WORLD.width}" height="${M.WORLD.height}"`)
    .replace('viewBox="0 0 1448 1086"', `viewBox="0 0 ${M.WORLD.width} ${M.WORLD.height}"`);
  if (!svg.includes(`viewBox="0 0 ${M.WORLD.width} ${M.WORLD.height}"`)) throw new Error("Road renderer dimensions changed");
  const painted = await sharp({ create: { ...M.WORLD, channels: 3, background: "#a4a15d" } })
    .composite([...layers, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
  // Matching gutters preserve the underlying samples through fractional zoom.
  // Bounded WebP compression keeps this private preview lightweight to load.
  const full = await sharp(painted).extend({ top: 2, bottom: 2, left: 2, right: 2, extendWith: "copy" }).png().toBuffer();
  const low = await sharp(painted).resize(M.WORLD.width / 2, M.WORLD.height / 2).extend({ top: 1, bottom: 1, left: 1, right: 1, extendWith: "copy" }).png().toBuffer();
  fs.mkdirSync(out, { recursive: true });
  const files = [];
  for (const s of sections) {
    const p = M.offset(s);
    for (const [suffix, buffer, scale, gutter] of [["", full, 1, 2], ["-thumb", low, 2, 1]]) {
      const width = M.TILE.width / scale + 2 * gutter, height = M.TILE.height / scale + 2 * gutter;
      const bytes = await sharp(buffer).extract({ left: p.x / scale, top: p.y / scale, width, height }).webp({ quality: 82, effort: 6 }).toBuffer();
      const name = `${s.id}${suffix}.webp`;
      fs.writeFileSync(path.join(out, name), bytes); files.push({ name, width, height, bytes: bytes.length, sha256: hash(bytes) });
    }
  }
  const inputs = [source, dirt, catalogPath, roadsPath, "tools/build-clean-map-ground.js", "tools/map-benchmark/seamless/model.js", "tools/map-benchmark/seamless/build-terrain.js"];
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ version: 1, gutter: 2, thumbnailScale: 2, width: M.WORLD.width, height: M.WORLD.height,
    inputs: inputs.map(file => ({ path: file, sha256: hash(fs.readFileSync(path.join(root, file))) })), files }, null, 2) + "\n");
  console.log(`Private terrain: nine matching sections + thumbnails, ${(files.reduce((n, f) => n + f.bytes, 0) / 1024 / 1024).toFixed(2)} MiB. Production assets unchanged.`);
}
if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { build };
