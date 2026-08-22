"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const EXPECTED_SOURCE_HASHES = Object.freeze([
  "ca548783cec61d1bdef60d31f0dc9921a4500931a51cd930236f7332677ebea3",
  "9481bb46be6ebf290e4b09da51818d35cc93c58a0d00d9a5635d705425768b30",
  "4a2e7c2b989c01ca55e50f272616887f68d3c5b86e798710356594f94c397bda",
  "cf37d0b8bd51855cbc2090b5b5b4c2207fcd3d66048fd690a9f78d354b9861fc",
]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split("/")), "utf8");
}

function readConfig() {
  const context = { window: {} };
  vm.runInNewContext(read("objective-visual-config.js"), context, { timeout: 1000 });
  return JSON.parse(JSON.stringify(context.window.CROWNLANDS_OBJECTIVE_VISUAL_CONFIG));
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
    const chunk = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (chunk === "VP8X") {
      return { width: readUInt24LE(buffer, data + 4) + 1, height: readUInt24LE(buffer, data + 7) + 1, hasAlpha: Boolean(buffer[data] & 0x10) };
    }
    if (chunk === "ALPH") hasAlpha = true;
    if (chunk === "VP8 ") return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff, hasAlpha };
    offset = data + size + (size % 2);
  }
  throw new Error("Unsupported Holding Tower WebP.");
}

const config = readConfig();
assert.equal(config.schemaVersion, "crownlands-objective-visual-config-v2");
const towers = config.pendingCore5x5.holdingTowers;
assert.equal(towers.length, 4);
assert.deepEqual(towers.map(tower => tower.source), ["1.png", "2.png", "3.png", "4.png"]);
assert.deepEqual(towers.map(tower => tower.name), ["Ravenwatch Tower", "Highguard Tower", "Blackthorn Tower", "Stoneward Tower"]);
assert.deepEqual(towers.map(tower => tower.quadrant), ["north-west", "north-east", "south-west", "south-east"]);
assert.equal(new Set(towers.map(tower => tower.id)).size, 4);
assert.equal(new Set(towers.map(tower => tower.regionId)).size, 4);
assert.ok(towers.every(tower => tower.width === 184 && tower.anchorX === 0.5 && tower.anchorY === 0.969 && tower.visualYOffset === 0));

const fixture = JSON.parse(read("benchmark-results/map/core-v2-qa-1/staging-site/__core_b1__/fixture.json"));
const reservations = new Map(fixture.prototypes
  .filter(prototype => prototype.mapType === "HOLDING_TOWER")
  .map(prototype => [prototype.regionId, prototype.objective]));
assert.equal(reservations.size, 4);
towers.forEach(tower => {
  const reservation = reservations.get(tower.regionId);
  assert.ok(reservation, `${tower.id} lost its protected region reservation.`);
  assert.deepEqual(
    [tower.reservedX, tower.reservedY, tower.reservationRadiusX, tower.reservationRadiusY],
    [reservation.x, reservation.y, reservation.radiusX, reservation.radiusY],
    `${tower.id} moved away from the protected reservation.`,
  );
});

const preparation = JSON.parse(read("assets/holding-towers/preparation-report.json"));
assert.equal(preparation.method, "border-connected-near-black-matte-v1");
assert.deepEqual(preparation.sourceDimensions, [1254, 1254]);
assert.deepEqual(preparation.preparedDimensions, [640, 640]);
assert.deepEqual(preparation.records.map(record => record.sourceSha256), EXPECTED_SOURCE_HASHES);
assert.ok(preparation.records.every(record => record.hasAlpha && record.preparedContentSize[1] === 600));
preparation.records.forEach((record, index) => {
  const [left, top] = record.preparedOffset;
  const [width, height] = record.preparedContentSize;
  const normalized = value => Number((value / preparation.preparedDimensions[0]).toFixed(4));
  assert.deepEqual(towers[index].contentBounds, {
    left: normalized(left),
    top: normalized(top),
    right: normalized(left + width),
    bottom: normalized(top + height),
  }, `${towers[index].id} visible-pixel bounds drifted from the prepared master.`);
});

const manifest = JSON.parse(read("assets/optimized/manifest.json"));
const assets = towers.map((tower, index) => {
  const asset = manifest.assets.find(entry => entry.id === `holding-tower-${index + 1}`);
  assert.ok(asset, `Missing optimized Holding Tower ${index + 1}.`);
  assert.equal(asset.category, "holding-tower-object");
  assert.equal(asset.output, tower.artSrc);
  assert.deepEqual([asset.width, asset.height, asset.hasAlpha], [384, 384, true]);
  assert.ok(asset.bytes > 0 && asset.bytes < 64 * 1024, `${asset.id} exceeds the 64 KiB objective-art budget.`);
  const payload = fs.readFileSync(path.join(ROOT, asset.output));
  assert.deepEqual(webpMetadata(payload), { width: 384, height: 384, hasAlpha: true });
  return asset;
});
const encodedBytes = assets.reduce((total, asset) => total + asset.bytes, 0);
const decodedBytesPerActiveTower = 384 * 384 * 4;
assert.ok(encodedBytes < 128 * 1024);

const game = read("game.js");
assert.match(game, /const WORLD_HOLDING_TOWERS = generatePendingCoreHoldingTowerSlots\(\)/);
assert.match(game, /WORLD_REGIONS_BY_ID\.get\(regionId\)/);
assert.match(game, /class="holding-tower-art"[\s\S]*loading="lazy" fetchpriority="low"/);
assert.match(game, /node\.className = "holding-tower-node"/);
assert.match(game, /node\.setAttribute\("aria-label", `Open \$\{tower\.name\}`\)/);
assert.match(game, /closest\("\.holding-tower-node\[data-holding-tower-id\]"\)/);
assert.match(game, /openHoldingTower\(holdingTowerButton\.dataset\.holdingTowerId\)/);

const liveCatalog = JSON.parse(read("assets/worlds/world_01/region-catalog.json"));
assert.ok(liveCatalog.regions.every(region => !String(region.id).startsWith(config.pendingCore5x5.regionIdPrefix)));
const serviceWorker = read("service-worker.js");
towers.forEach(tower => assert.doesNotMatch(serviceWorker, new RegExp(path.posix.basename(tower.artSrc))));
const builder = read("tools/build-production-client.js");
assert.match(builder, /"objective-visual-config\.js"/);
assert.match(builder, /copyDirectoryFiles\("assets\/optimized"/);

const preview = read("tools/map-editor/core-preview.js");
assert.match(preview, /objective\.kind === "holdingTower"/);
assert.match(preview, /interactionSize > 0/);
assert.match(preview, /loading="lazy"/);

console.log(JSON.stringify({
  validatedHoldingTowers: towers.length,
  encodedBytes,
  decodedBytesPerActiveTower,
  decodedMiBPerActiveTower: Number((decodedBytesPerActiveTower / (1024 * 1024)).toFixed(3)),
  liveWorldTowerCount: 0,
  protectedReservationCount: reservations.size,
}));
