const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_SIZE = 1254;
const BUILD_ID = "20260823-item-bag-shop-theme-r2";

const expected = [
  ["item-common-gear-box", "assets/gear/common-gear-box.png", 192, "gear-box"],
  ["item-common-gear-box-open", "assets/gear/common-gear-box-open.png", 256, "gear-box"],
  ["item-peace-shield", "assets/royal-peace-shield-icon.webp", 160, "item"],
  ["item-war-drums", "assets/war-drums-icon.webp", 160, "item"],
  ["item-royal-tax-decree", "assets/royal-tax-decree-icon.webp", 160, "item"],
  ["item-veil-of-silence", "assets/veil-of-silence-icon.webp", 160, "item"],
  ["item-swift-march", "assets/swift-march-order-icon.webp", 160, "item"],
  ["item-recall-horn", "assets/recall-horn-icon.webp", 160, "item"],
  ["pickup-gold", "assets/gold-pickup.png", 192, "pickup"],
  ["pickup-troops", "assets/troop-pickup.png", 192, "pickup"],
  ["status-peace-shield-field", "assets/royal-peace-shield-icon.webp", 192, "status"],
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function pngMetadata(buffer) {
  assert.equal(buffer.toString("hex", 0, 8), "89504e470d0a1a0a", "Source master must be a PNG payload.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), colorType: buffer[25] };
}

function sourceMetadata(buffer) {
  return buffer.toString("hex", 0, 8) === "89504e470d0a1a0a"
    ? { ...pngMetadata(buffer), hasAlpha: pngMetadata(buffer).colorType === 6 }
    : webpMetadata(buffer);
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpMetadata(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  let offset = 12;
  let hasAlpha = false;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === "VP8X") {
      return {
        width: readUInt24LE(buffer, data + 4) + 1,
        height: readUInt24LE(buffer, data + 7) + 1,
        hasAlpha: Boolean(buffer[data] & 0x10),
      };
    }
    if (type === "ALPH") hasAlpha = true;
    if (type === "VP8L") {
      const b1 = buffer[data + 1];
      const b2 = buffer[data + 2];
      const b3 = buffer[data + 3];
      const b4 = buffer[data + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
        hasAlpha: hasAlpha || Boolean(b4 & 0x10),
      };
    }
    offset = data + size + (size % 2);
  }
  throw new Error("Unsupported WebP payload.");
}

const manifest = JSON.parse(read("assets/optimized/manifest.json"));
const manifestById = new Map(manifest.assets.map(asset => [asset.id, asset]));
const game = `${read("game.js")}\n${read("common-gear-ui.js")}`;
const index = read("index.html");
const guide = read("daily-rewards-guide.html");
const styles = `${read("styles.css")}\n${read("interface-theme.css")}`;
const optimizer = read("tools/optimize-game-art.py");
const serviceWorker = read("service-worker.js");
const shippedReferences = `${game}\n${index}\n${guide}`;

for (const [id, sourcePath, runtimeSize, category] of expected) {
  const sourceBuffer = fs.readFileSync(path.join(ROOT, sourcePath));
  const source = sourceMetadata(sourceBuffer);
  assert.equal(source.width, SOURCE_SIZE, `${sourcePath} source width must remain canonical.`);
  assert.equal(source.height, SOURCE_SIZE, `${sourcePath} source height must remain canonical.`);
  assert(source.hasAlpha, `${sourcePath} must preserve RGBA transparency.`);

  const asset = manifestById.get(id);
  assert(asset, `${id} is missing from the optimized manifest.`);
  assert.equal(asset.width, runtimeSize, `${id} runtime width drifted.`);
  assert.equal(asset.height, runtimeSize, `${id} runtime height drifted.`);
  assert.equal(asset.category, category, `${id} has the wrong fixed-layout category.`);
  assert(asset.hasAlpha, `${id} must preserve transparent padding.`);
  const webp = webpMetadata(fs.readFileSync(path.join(ROOT, asset.output)));
  assert.deepEqual(webp, { width: runtimeSize, height: runtimeSize, hasAlpha: true }, `${id} encoded output drifted.`);
  assert(shippedReferences.includes(asset.output), `${id} optimized output is not referenced by a shipped UI context.`);
}

for (const category of ["gear-box", "item", "pickup", "status"]) {
  assert.match(optimizer, new RegExp(`FIXED_LAYOUT_CATEGORIES[\\s\\S]*?"${category}"`), `${category} must remain fixed-layout.`);
}
assert.match(game, /const COMMON_GEAR_BOX_OPEN_ART = "assets\/optimized\/item-common-gear-box-open-/);
assert.match(game, /class="gear-box-closed-state"/);
assert.match(game, /class="gear-box-open-state"/);
assert.match(styles, /@keyframes commonGearLatch/);
assert.match(styles, /@keyframes commonGearBoxOpened/);
assert.match(styles, /@keyframes commonGearCardSettle/);
assert.match(styles, /@keyframes harvestMapNotation/);
assert.match(styles, /@keyframes cityShieldAuthority/);
assert.match(styles, /\.city-node\.peace-shielded \.city-shield-field img\s*\{[^}]*drop-shadow\(0 0 1px rgba\(255, 255, 255, \.98\)\)[^}]*drop-shadow\(0 0 3px rgba\(255, 255, 255, \.76\)\)/s);
assert.match(styles, /@keyframes crownlandsVfxRewardStamp/);
assert(index.includes(`<meta name="crownlands-build" content="${BUILD_ID}"`), "Index build ID is stale.");
assert(serviceWorker.includes(`const CACHE_VERSION = "${BUILD_ID}";`), "Service-worker cache version is stale.");

const retiredHashes = [
  "0f7ac5409316", "dcb8dddc35ea", "48ecb3c2150b", "eaa5b941fe82", "5d50be41ce93",
  "f1cb9c8471ca", "eb20879b085e", "13064480d6c7", "866b66c49b83", "5b5b95051830",
  "5fd9cc116a40", "d7e2adb1b120", "1e09f4efdbff", "9392b160d654",
];
for (const hash of retiredHashes) {
  assert(!shippedReferences.includes(hash), `Retired Pass 3F asset hash ${hash} is still referenced.`);
}

console.log("Validated Pass 3F item art: 11 RGBA masters, fixed-layout optimized outputs, live references, physical reveal states, grounded pickups, shield field, and cache version.");
