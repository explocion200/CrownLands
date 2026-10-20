"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { projectCampArtwork, syncCoreExpansionAssets } = require("./sync-core-expansion-assets.js");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const manifest = json("docs/visual-qa/camp-artwork-v2/assets.json");
const catalog = json("assets/worlds/core-expansion-v1/region-catalog.json");
const serverCatalog = json("functions/core-expansion-region-catalog.json");
const serverLayout = json("functions/core-expansion-world-layout.json");
const layout = projectCampArtwork(serverLayout);
const originalServer = JSON.stringify([serverCatalog, serverLayout]);
assert.deepEqual(catalog, {...projectCampArtwork(serverCatalog), assetVersion:catalog.assetVersion});
// Reverse the four path replacements: every non-presentation field must match,
// including camp IDs, locations, dimensions, defenses and reward settings.
const reverseProjection = value => {
  if (typeof value === "string") return manifest.assets.find(a => a.output === value)?.replaces || value;
  if (Array.isArray(value)) return value.map(reverseProjection);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,reverseProjection(v)]));
};
assert.deepEqual(reverseProjection(layout), serverLayout);
assert.deepEqual({...reverseProjection(catalog), assetVersion:serverCatalog.assetVersion}, serverCatalog);
syncCoreExpansionAssets({checkOnly:true});
assert.equal(JSON.stringify([json("functions/core-expansion-region-catalog.json"),json("functions/core-expansion-world-layout.json")]), originalServer);
assert.deepEqual(manifest.assets.map(a => a.type).sort(), ["deed", "gold", "items", "troops"]);
for (const asset of manifest.assets) {
  assert.equal(hash(read(asset.source)), asset.sourceSha256, "Approved painting changed");
  const bytes = read(asset.output);
  assert.equal(hash(bytes), asset.sha256);
  assert.equal(bytes.length, asset.bytes);
  assert(bytes.length <= 60 * 1024, "Each camp must fit its 60 KiB delivery limit");
  assert.equal(catalog.mapPresentation.campAssets[asset.type], asset.output);
  assert(!fs.existsSync(path.join(root, asset.replaces)), "Retired active camp art must be deleted");
  assert(!JSON.stringify(catalog).includes(asset.replaces));
  assert(!JSON.stringify(layout).includes(asset.replaces));
  const maps = layout.maps.filter(map => map.camps?.some(camp => camp.campType === asset.type));
  assert(maps.length > 0);
  for (const map of maps) {
    for (const camp of map.camps.filter(c => c.campType === asset.type)) assert.equal(camp.artSrc, asset.output);
    const region = json(`assets/worlds/core-expansion-v1/regions/${map.id}.json`);
    assert.deepEqual(region.camps, map.camps, "Lazy-map camps must retain the canonical gameplay definition");
    assert(!JSON.stringify(region).includes(asset.replaces), "Lazy map definition still uses retired art");
  }
  assert(!read("service-worker.js").toString().includes(asset.output), "Camp art must remain lazy");
  const dist = path.join(root, "dist");
  if (fs.existsSync(dist)) {
    assert.equal(hash(fs.readFileSync(path.join(dist, asset.output))), asset.sha256);
    assert(!fs.existsSync(path.join(dist, asset.replaces)), "Retired art shipped in production");
  }
}
console.log("All four approved camp paintings, active catalog/map references, hashes, deletions and lazy production packaging passed.");
