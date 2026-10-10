"use strict";
// Verify saved originals, optimized derivatives and independently illustrated subjects.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/art-sources/guild-master/manifest.json"), "utf8"));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const read = relative => {
  const file = path.resolve(root, relative);
  assert(file.startsWith(root + path.sep), "Asset path stays inside repository");
  return fs.readFileSync(file);
};
const ids = new Set(), hashes = new Set();
let total = 0;
for (const asset of manifest.assets) {
  assert(!ids.has(asset.id), "Unique asset identity"); ids.add(asset.id);
  const source = read(asset.source), runtime = read(asset.runtime);
  assert(source.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), "Original is PNG");
  assert.equal(runtime.toString("ascii", 0, 4), "RIFF");
  assert.equal(runtime.toString("ascii", 8, 12), "WEBP");
  assert.equal(hash(source), asset.sourceSha256, "Original matches recorded generation");
  assert.equal(hash(runtime), asset.runtimeSha256, "Derivative matches saved review");
  assert(!hashes.has(asset.sourceSha256), "Subjects have independent source images"); hashes.add(asset.sourceSha256);
  assert.equal(runtime.length, asset.bytes);
  assert(runtime.length <= asset.maxKiB * 1024, "Individual image budget");
  assert(asset.width <= asset.maxWidth && asset.height <= asset.maxHeight);
  assert(asset.prompt.length > 100 && asset.generatedFilename.endsWith(".png"), "Generation provenance retained");
  total += runtime.length;
}
assert.equal([...ids].filter(id => id.startsWith("mission-")).length, 8);
assert.equal([...ids].filter(id => id.startsWith("room-")).length, 5);
assert(ids.has("hall-v2"));
assert(!ids.has("interior") && !ids.has("journey"), "Repeated cutaway/panorama retired");
for (const retired of manifest.retiredAssets) assert.equal(hash(read(retired.source)), retired.sourceSha256);
assert.equal(total, manifest.encoding.totalBytes);
assert(total <= manifest.encoding.totalBudgetKiB * 1024, "Combined art budget");
assert.equal(manifest.encoding.precache, false);
const actual = fs.readdirSync(path.join(root, "assets/guild-master")).filter(file => file.endsWith(".webp")).sort();
assert.deepEqual(actual, manifest.assets.map(asset => path.basename(asset.runtime)).sort(), "No unused runtime artwork");
console.log(`PASS Guild art: ${ids.size} unique assets, originals/derivatives verified, ${total.toLocaleString()} bytes within budgets.`);
