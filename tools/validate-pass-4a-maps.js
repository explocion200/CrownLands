const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath));
const readJson = relativePath => JSON.parse(read(relativePath).toString("utf8").replace(/^\uFEFF/, ""));
const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const sides = ["north", "east", "south", "west"];
const opposite = { north: "south", east: "west", south: "north", west: "east" };
const offsets = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const buildId = "20260812-pre-pass-4a-gameplay-maps-r2";

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpMetadata(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", "WebP is missing RIFF.");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP", "WebP is missing WEBP.");
  let offset = 12;
  let hasAlpha = false;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === "VP8X") return {
      width: readUInt24LE(buffer, data + 4) + 1,
      height: readUInt24LE(buffer, data + 7) + 1,
      hasAlpha: Boolean(buffer[data] & 0x10),
    };
    if (type === "VP8 ") return {
      width: buffer.readUInt16LE(data + 6) & 0x3fff,
      height: buffer.readUInt16LE(data + 8) & 0x3fff,
      hasAlpha,
    };
    if (type === "VP8L") {
      const b1 = buffer[data + 1];
      const b2 = buffer[data + 2];
      const b3 = buffer[data + 3];
      const b4 = buffer[data + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
        hasAlpha: Boolean(b4 & 0x10),
      };
    }
    if (type === "ALPH") hasAlpha = true;
    offset = data + size + (size % 2);
  }
  throw new Error("Unsupported WebP frame.");
}

function pngMetadata(buffer) {
  assert.equal(buffer.toString("hex", 0, 8), "89504e470d0a1a0a", "PNG signature is invalid.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), hasAlpha: buffer[25] === 4 || buffer[25] === 6 };
}

const layout = readJson("assets/worlds/world_01/world-layout.json");
const mapManifest = readJson("assets/worlds/world_01/map-manifest.json");
const thumbnailManifest = readJson("assets/worlds/world_01/thumbnail-manifest.json");
const optimizedManifest = readJson("assets/optimized/manifest.json");
assert.equal(layout.regions.length, 15, "Pass 4A-R requires exactly 15 regional maps.");
assert.equal(thumbnailManifest.thumbnails.length, 15, "Pass 4A-R requires exactly 15 thumbnail entries.");

const byGrid = new Map(layout.regions.map(region => [`${region.gridX},${region.gridY}`, region]));
const byId = new Map(layout.regions.map(region => [region.id, region]));
let fullMapBytes = 0;
let thumbnailBytes = 0;

for (const region of layout.regions) {
  assert.equal(region.width, 1448, `${region.id} layout width drifted.`);
  assert.equal(region.height, 1086, `${region.id} layout height drifted.`);
  const mapBuffer = read(region.imagePath);
  const mapMeta = webpMetadata(mapBuffer);
  assert.deepEqual(mapMeta, { width: 1448, height: 1086, hasAlpha: false }, `${region.id} map metadata drifted.`);
  assert(mapBuffer.length <= 750 * 1024, `${region.id} exceeds the 750 KiB mobile map budget.`);
  fullMapBytes += mapBuffer.length;

  const mapEntry = mapManifest.maps.find(entry => entry.id === region.id);
  assert(mapEntry, `${region.id} is missing from the immutable gameplay-map manifest.`);
  assert.equal(mapEntry.output, region.imagePath, `${region.id} layout does not use the current gameplay-map fingerprint.`);
  assert.equal(sha256(mapBuffer), mapEntry.sha256, `${region.id} runtime map differs from its manifest hash.`);
  assert.equal(sha256(mapBuffer), sha256(read(mapEntry.source)), `${region.id} runtime map differs from its restored source.`);
  const archivedPath = `docs/visual-qa/pass-4a/old-assets/${path.basename(mapEntry.source)}`;
  assert(fs.existsSync(path.join(root, archivedPath)), `${region.id} is missing its rollback source.`);
  assert.equal(sha256(mapBuffer), sha256(read(archivedPath)), `${region.id} does not match the restored pre-Pass-4A source.`);

  const sourceThumb = `assets/worlds/world_01/thumbnails/${region.id}-thumb.webp`;
  const sourceThumbBuffer = read(sourceThumb);
  assert.deepEqual(webpMetadata(sourceThumbBuffer), { width: 420, height: 315, hasAlpha: false }, `${region.id} source thumbnail drifted.`);
  const thumbEntry = thumbnailManifest.thumbnails.find(entry => entry.id === region.id);
  assert(thumbEntry, `${region.id} is missing from thumbnail-manifest.json.`);
  assert.equal(thumbEntry.source, sourceThumb, `${region.id} source thumbnail path drifted.`);
  assert.equal(thumbEntry.output, region.thumbnailPath, `${region.id} layout does not use the current fingerprint.`);
  const versionedThumb = read(thumbEntry.output);
  assert.deepEqual(webpMetadata(versionedThumb), { width: 420, height: 315, hasAlpha: false }, `${region.id} versioned thumbnail drifted.`);
  assert.equal(sha256(sourceThumbBuffer), sha256(versionedThumb), `${region.id} versioned thumbnail differs from its source.`);
  thumbnailBytes += versionedThumb.length;

  const data = readJson(region.regionPath);
  assert.equal(data.id, region.id, `${region.id} region data id drifted.`);
  assert.equal(data.imagePath, region.imagePath, `${region.id} region image mapping drifted.`);
  assert.equal(data.thumbnailPath, region.thumbnailPath, `${region.id} region thumbnail mapping drifted.`);
  for (const side of sides) {
    const [dx, dy] = offsets[side];
    const neighbor = byGrid.get(`${region.gridX + dx},${region.gridY + dy}`);
    const routes = Array.isArray(data.edgeConnections?.[side]) ? data.edgeConnections[side] : [];
    assert.equal(routes.length, neighbor ? 1 : 0, `${region.id} ${side} must have ${neighbor ? "exactly one" : "no"} edge route.`);
    if (!neighbor) continue;
    const route = routes[0];
    assert.equal(route.side, side, `${region.id} ${side} route side drifted.`);
    assert.equal(route.type, "road", `${region.id} ${side} route must remain a road.`);
    assert.equal(route.connectsToRegionId, neighbor.id, `${region.id} ${side} route targets the wrong neighbor.`);
    assert(Number(route.start) >= 0 && Number(route.end) <= 1 && Number(route.start) < Number(route.end), `${region.id} ${side} route interval is invalid.`);
    const neighborData = readJson(neighbor.regionPath);
    const reciprocal = neighborData.edgeConnections?.[opposite[side]] || [];
    assert.equal(reciprocal.length, 1, `${neighbor.id} is missing the reciprocal ${opposite[side]} route.`);
    assert.equal(reciprocal[0].connectsToRegionId, region.id, `${neighbor.id} reciprocal route targets the wrong region.`);
  }
}

const versionedFiles = fs.readdirSync(path.join(root, "assets/worlds/world_01/thumbnails/versioned"))
  .filter(name => /-thumb-[0-9a-f]{12}\.webp$/.test(name));
assert.equal(versionedFiles.length, 15, "Stale fingerprinted world thumbnails remain in production assets.");
const versionedMapFiles = fs.readdirSync(path.join(root, "assets/worlds/world_01/maps/versioned"))
  .filter(name => /-[0-9a-f]{12}\.webp$/.test(name));
assert.equal(versionedMapFiles.length, 15, "Stale fingerprinted gameplay maps remain in production assets.");
assert(thumbnailBytes < fullMapBytes * 0.1, "Map thumbnails must remain below 10% of full-map payload.");

for (const id of ["center", "east", "north", "south", "west"]) {
  const legacy = read(`assets/${id}-island.webp`);
  const archivedLegacy = read(`docs/visual-qa/pass-4a/old-assets/legacy/${id}-island.webp`);
  assert.equal(sha256(legacy), sha256(archivedLegacy), `${id} legacy editor fallback does not match its pre-Pass-4A source.`);
}

const mistSource = read("assets/map-transition-clouds.png");
assert.deepEqual(pngMetadata(mistSource), { width: 1254, height: 1254, hasAlpha: true }, "Transition mist source contract drifted.");
assert.equal(
  sha256(mistSource),
  sha256(read("docs/visual-qa/pass-4a/old-assets/map-transition-clouds.png")),
  "Transition clouds do not match the restored pre-Pass-4A source.",
);
const mist = optimizedManifest.assets.find(asset => asset.id === "map-transition-clouds");
assert(mist, "Optimized transition mist is missing.");
assert.equal(mist.width, 448, "Transition mist runtime width drifted.");
assert.equal(mist.height, 448, "Transition mist runtime height drifted.");
assert.equal(mist.hasAlpha, true, "Transition mist lost alpha.");
const html = read("index.html").toString("utf8");
const css = `${read("styles.css").toString("utf8")}\n${read("interface-theme.css").toString("utf8")}`;
const worker = read("service-worker.js").toString("utf8");
const game = read("game.js").toString("utf8");
for (const match of game.matchAll(/assets\/worlds\/world_01\/thumbnails\/versioned\/[\w-]+-[0-9a-f]{12}\.webp/g)) {
  assert(fs.existsSync(path.join(root, match[0])), `game.js references missing immutable thumbnail ${match[0]}.`);
}
assert(html.includes(mist.output) && css.includes(mist.output), "Runtime transition mist references are stale.");
assert(html.includes(buildId) && worker.includes(`CACHE_VERSION = "${buildId}"`), "Pass 4A PWA cache version is stale.");

console.log(`Pass 4A-R map correction validation passed: 15 maps, 18 reciprocal edge pairs, ${fullMapBytes.toLocaleString()} map bytes, ${thumbnailBytes.toLocaleString()} thumbnail bytes.`);
