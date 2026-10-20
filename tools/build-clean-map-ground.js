"use strict";

// Offline artwork authoring only. The imagegen painting supplies the terrain;
// canonical road samples supply the road layer without moving gameplay paths.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require(process.env.CROWNLANDS_SHARP_MODULE || "sharp");
const root = path.resolve(__dirname, "..");
const W = 1448, H = 1086;
const assetRoot = "assets/worlds/core-expansion-v1";
const source = "docs/art-sources/clean-map-ground/ground.png";
const roadMaterial = "docs/art-sources/blended-dirt-roads/dirt-material.png";
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const write = (file, value) => fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
const n = value => Number(value.toFixed(3));

// A variable-width ribbon and round joins reproduce the measured road envelope.
// All roads share a single mask, so crossings have no internal outline seams.
function ribbon(points) {
  const shapes = [];
  points.forEach(([x, y, width], i) => {
    shapes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(width / 2)}"/>`);
    if (!i) return;
    const [px, py, pw] = points[i - 1];
    const length = Math.hypot(x - px, y - py);
    if (!length) return;
    const nx = (y - py) / length, ny = (px - x) / length;
    const corners = [[px + nx * pw / 2, py + ny * pw / 2], [x + nx * width / 2, y + ny * width / 2],
      [x - nx * width / 2, y - ny * width / 2], [px - nx * pw / 2, py - ny * pw / 2]];
    shapes.push(`<polygon points="${corners.map(p => p.map(n).join(",")).join(" ")}"/>`);
  });
  return shapes.join("");
}

function roadsSvg(roads, material, seed = 0) {
  const phase = (seed % 65536) / 1000;
  // Uneven, translucent shoulders stay inside the existing road envelope. The
  // underlying meadow shows between worn dirt patches; there is no outline.
  const shoulders = [[1, 32], [.97, 100], [.91, 181], [.84, 232], [.73, 255]].map(([scale, shade]) => {
    const painted = roads.map(points => ribbon(points.map(([x, y, width]) => {
      const wear = Math.max(0, .8 + .65 * Math.sin(x * .61 + y * .37 + phase)
        + .35 * Math.sin(x * 1.37 - y * .83 - phase));
      return [x, y, width * scale - wear];
    }))).join("");
    return `<g fill="rgb(${shade},${shade},${shade})">${painted}</g>`;
  }).join("");
  const tracks = roads.flatMap(points => [-1, 1].map(side => {
    const line = points.map(([x, y, width], i) => {
      const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
      const dx = after[0] - before[0], dy = after[1] - before[1], len = Math.hypot(dx, dy) || 1;
      return `${n(x + side * dy / len * width * .22)},${n(y - side * dx / len * width * .22)}`;
    }).join(" ");
    return `<polyline points="${line}" fill="none" stroke="#8a743f" stroke-width=".8" stroke-dasharray="3 29 7 41" stroke-dashoffset="${seed % 29}" opacity=".12"/>`;
  })).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <mask id="road">${shoulders}</mask>
      <pattern id="earth" width="384" height="384" patternUnits="userSpaceOnUse" x="${seed % 384}" y="${(seed >>> 8) % 384}">
        <image href="data:image/png;base64,${material.toString("base64")}" width="384" height="384"/>
      </pattern>
    </defs>
    <g mask="url(#road)">
      <rect width="${W}" height="${H}" fill="#c8ae70"/>
      <rect width="${W}" height="${H}" fill="url(#earth)" opacity=".65"/>
      ${tracks}
    </g>
  </svg>`);
}

async function build() {
  const catalog = read(`${assetRoot}/region-catalog.json`);
  const proof = read("tools/map-art/clearance.json");
  const receipt = read(`${assetRoot}/illustrated-art-receipt.json`);
  const material = await sharp(path.join(root, roadMaterial)).resize(384, 384).png().toBuffer();
  const selected = process.argv.find(arg => arg.startsWith("--map="))?.slice(6);
  if (selected && !proof.maps.some(map => map.id === selected)) throw new Error(`Unknown map ${selected}`);
  for (const [index, map] of proof.maps.entries()) {
    if (selected && map.id !== selected) continue;
    const summary = catalog.regions.find(region => region.id === map.id);
    const previous = receipt.maps.find(item => item.id === map.id);
    if (!summary || !previous) throw new Error(`Missing prepared map ${map.id}`);
    const terrain = sharp(path.join(root, source)).resize(W, H, { fit: "fill" });
    // Avoid identical small texture marks between maps while keeping the same palette.
    if (previous.seed & 1) terrain.flop();
    if (previous.seed & 2) terrain.flip();
    const bytes = await terrain.composite([{ input: roadsSvg(map.roads, material, previous.seed) }])
      .webp({ quality: 64, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(root, summary.mapAsset), bytes);
    const scenery = [];
    for (const prop of summary.artPresentation.scenery) scenery.push({
      input: await sharp(path.join(root, prop.asset)).resize(Math.round(prop.w), Math.round(prop.h)).png().toBuffer(),
      left: Math.round(prop.x - prop.w / 2), top: Math.round(prop.y - prop.h / 2),
    });
    const decorated = await sharp(bytes).composite(scenery).png().toBuffer();
    await sharp(decorated).resize(362, 272).webp({ quality: 82, effort: 6 }).toFile(path.join(root, summary.thumbnailAsset));
    previous.backgroundSha256 = hash(bytes);
    console.log(`${index + 1}/${proof.maps.length} ${map.id}: ${(bytes.length / 1024).toFixed(1)} KiB`);
  }
  // A one-map preview never claims the complete set is rebuilt.
  if (selected) return;
  receipt.groundPresentation = {
    style: "clean-meadow-connected-roads-v2", source, sourceSha256: hash(fs.readFileSync(path.join(root, source))),
    roadSamples: "tools/map-art/clearance.json", roadSamplesSha256: hash(fs.readFileSync(path.join(root, "tools/map-art/clearance.json"))),
    delivery: "1448x1086 WebP quality 64; thumbnails 362x272 quality 82",
    roadSurface: { style: "blended-painted-dirt-v1", source: roadMaterial, sourceSha256: hash(fs.readFileSync(path.join(root, roadMaterial))) },
  };
  write(`${assetRoot}/illustrated-art-receipt.json`, receipt);
  require("./sync-core-expansion-assets").syncCoreExpansionAssets();
}

if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { roadsSvg };
