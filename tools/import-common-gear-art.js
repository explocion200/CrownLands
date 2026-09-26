/* Import the selected Common artwork from the reviewed, versioned delivery package.
 * No image processing, rarity activation or gameplay changes happen here. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const packageRoot = path.resolve(process.argv[2] || "");
assert(process.argv[2], "Usage: node tools/import-common-gear-art.js <reviewed-package-directory>");
const delivery = JSON.parse(fs.readFileSync(path.join(packageRoot, "manifest.json"), "utf8"));
const manifestPath = path.join(root, "assets/optimized/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const gear = require("../common-gear");
const buildings = {"war-captain":"barracks","master-of-coin":"treasury","cavalry-master":"royal-stables","defensive-commander":"gatehouse"};
const selected = delivery.items.filter(item => item.tier === "Common");
assert.equal(selected.length, 32);
const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const layout = {}, records = [], pending = [], replacements = [];
for (const item of selected) {
  const building = buildings[item.officer];
  assert(building && gear.SLOTS.includes(item.slot));
  const id = `gear-${building}-${item.slot}`;
  assert(!records.some(record => record.id === id), `Duplicate ${id}`);
  const source = `assets/gear/${building}/${item.slot}.png`;
  const master = fs.readFileSync(path.resolve(packageRoot, item.master.file));
  assert.equal(sha256(master), item.master.sha256);
  pending.push([source, master]);
  const variants = [];
  for (const size of [192, 384]) {
    const variant = item.variants[size];
    const payload = fs.readFileSync(path.resolve(packageRoot, variant.file));
    assert.equal(sha256(payload), variant.sha256); assert.equal(payload.length, variant.bytes);
    assert.equal(variant.width, size); assert.equal(variant.height, size); assert(variant.hasAlpha);
    for (const property of ["width", "height", "left", "top"]) assert(Number.isFinite(variant.framing[property]));
    const output = `assets/optimized/${id}${size === 384 ? "-detail" : ""}-${size}x${size}-${variant.sha256.slice(0,12)}.webp`;
    pending.push([output, payload]);
    const record = {id: id + (size === 384 ? "-detail" : ""), category: "gear-item", source, output,
      width: size, height: size, bytes: payload.length, sha256: variant.sha256, hasAlpha: true,
      preparedDelivery: true, sourceSha256: item.master.sha256,
      sourceBounds: item.master.bounds, safetyPadding: variant.safetyPadding};
    variants.push(record); records.push(record);
  }
  const definition = gear.DEFINITIONS.find(d => d.buildingId === building && d.slot === item.slot);
  replacements.push([definition.art, variants[0].output]);
  const f = item.variants[192].framing;
  assert.deepEqual(item.variants[384].framing, f, `Resolution framing differs: ${id}`);
  layout[variants[0].output] = [variants[1].output, ...[f.width, f.left, f.top].map(n => +(n * 100).toFixed(6))];
}
// All sources are checked before writes; the selected originals are copied unchanged.
for (const [file, payload] of pending) fs.writeFileSync(path.join(root, file), payload);
for (const file of ["common-gear.js", "functions/common-gear.js"]) {
  let text = fs.readFileSync(path.join(root, file), "utf8");
  for (const [before, after] of replacements) { assert(text.includes(before)); text = text.replaceAll(before, after); }
  fs.writeFileSync(path.join(root, file), text);
}
const byId = new Map(records.map(record => [record.id, record]));
const existingIds = new Set(manifest.assets.map(asset => asset.id));
manifest.assets = manifest.assets.map(asset => byId.get(asset.id) || asset)
  .concat(records.filter(record => !existingIds.has(record.id)));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const uiPath = path.join(root, "common-gear-ui.js");
let ui = fs.readFileSync(uiPath, "utf8");
const start = "// BEGIN PREPARED COMMON GEAR ART", end = "// END PREPARED COMMON GEAR ART";
const generated = `${start}\nconst COMMON_GEAR_ART_LAYOUT = Object.freeze(${JSON.stringify(layout, null, 2)});\n${end}`;
if (ui.includes(start)) ui = ui.slice(0, ui.indexOf(start)) + generated + ui.slice(ui.indexOf(end) + end.length);
else ui = generated + "\n\n" + ui;
fs.writeFileSync(uiPath, ui);
console.log(`Imported ${selected.length} Common designs (${records.length} derivatives); higher rarities remain outside the runtime.`);
