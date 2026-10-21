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
  const sections = read(catalogPath).regions;
  if (sections.length !== 81 || sections.some(s => Math.abs(s.gridX) > 4 || Math.abs(s.gridY) > 4)) throw new Error("Expected 81 prepared Core sections");
  const width = 9 * M.TILE.width, height = 9 * M.TILE.height;
  const offset = s => ({ x: (s.gridX + 4) * M.TILE.width, y: (s.gridY + 4) * M.TILE.height });
  const roads = read(roadsPath), worldRoads = [], grounds = new Map();
  // Four approved orientations, shared by all tiles. Adjacent edge pixels match.
  for (const fx of [0, 1]) for (const fy of [0, 1]) {
    let ground = sharp(path.join(root, source)).resize(M.TILE.width, M.TILE.height, { fit: "fill" });
    if (fx) ground = ground.flop(); if (fy) ground = ground.flip();
    grounds.set(`${fx}:${fy}`, await ground.png().toBuffer());
  }
  for (const section of sections) {
    const { x, y } = offset(section);
    worldRoads.push(...roads.maps.find(m => m.id === section.id).roads.map(line => line.map(([px, py, w]) => [px + x, py + y, w])));
  }
  const material = await sharp(path.join(root, dirt)).resize(384, 384).png().toBuffer();
  fs.mkdirSync(out, { recursive: true });
  const files = [];
  // Render one delivery patch at a time, with true neighboring samples in its
  // gutters. Avoid a 127-megapixel intermediate and its large SVG/memory peak.
  for (const section of sections) {
    const p = offset(section), left = p.x - 2, top = p.y - 2, pw = M.TILE.width + 4, ph = M.TILE.height + 4;
    const layers = [];
    for (const neighbor of sections) {
      const n = offset(neighbor), x = Math.max(left, n.x), y = Math.max(top, n.y);
      const right = Math.min(left + pw, n.x + M.TILE.width), bottom = Math.min(top + ph, n.y + M.TILE.height);
      if (right <= x || bottom <= y) continue;
      layers.push({ input: await sharp(grounds.get(`${(neighbor.gridX + 4) % 2}:${(neighbor.gridY + 4) % 2}`))
        .extract({ left: x - n.x, top: y - n.y, width: right - x, height: bottom - y }).png().toBuffer(), left: x - left, top: y - top });
    }
    // Keep complete contiguous road runs around this patch, with tangent padding.
    // Coordinates stay global: shoulder wear and dirt pattern phase never reset.
    const lines = [];
    for (const line of worldRoads) {
      let start = -1;
      const near = ([x,y,w]) => x >= left - w - 8 && x <= left + pw + w + 8 && y >= top - w - 8 && y <= top + ph + w + 8;
      for (let i = 0; i <= line.length; i++) {
        if (i < line.length && near(line[i])) { if (start < 0) start = Math.max(0, i - 2); }
        else if (start >= 0) { lines.push(line.slice(start, Math.min(line.length, i + 2))); start = -1; }
      }
    }
    const svg = roadsSvg(lines, material, 0).toString()
      .replaceAll('width="1448" height="1086"', `width="${width}" height="${height}"`)
      .replace(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1448 1086">`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="${left} ${top} ${pw} ${ph}">`);
    if (!svg.includes(`viewBox="${left} ${top} ${pw} ${ph}"`)) throw Error("Road renderer changed");
    const painted = await sharp({ create: { width: pw, height: ph, channels: 3, background: "#a4a15d" } })
      .composite([...layers, { input: Buffer.from(svg) }]).png().toBuffer();
    for (const [suffix, scale] of [["", 1], ["-thumb", 2]]) {
      const w = pw / scale, h = ph / scale;
      const bytes = await sharp(painted).resize(w, h).webp({ quality: 82, effort: 6 }).toBuffer();
      const name = `${section.id}${suffix}.webp`;
      fs.writeFileSync(path.join(out, name), bytes); files.push({ name, width: w, height: h, bytes: bytes.length, sha256: hash(bytes) });
    }
  }
  const inputs = [source, dirt, catalogPath, roadsPath, "tools/build-clean-map-ground.js", "tools/map-benchmark/seamless/model.js", "tools/map-benchmark/seamless/build-terrain.js"];
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ version: 2, gutter: 2, thumbnailScale: 2, width, height,
    inputs: inputs.map(file => ({ path: file, sha256: hash(fs.readFileSync(path.join(root, file))) })), files }, null, 2) + "\n");
  console.log(`Private terrain: 81 matching sections + thumbnails, ${(files.reduce((n, f) => n + f.bytes, 0) / 1024 / 1024).toFixed(2)} MiB. Production assets unchanged.`);
}
if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { build };
