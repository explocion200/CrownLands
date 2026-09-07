// Imports the approved, separately reviewed atlas layers. This is an authoring
// tool, not a production dependency. Pass the release-map-art-v1 directory.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const sharp = require(process.env.CROWNLANDS_SHARP_MODULE || "sharp");
const root = path.resolve(__dirname, "..");
const source = path.resolve(process.argv[2] || "");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const assetRoot = "assets/worlds/core-expansion-v1";
const W = 1448, H = 1086;
const imported = new Map();

async function sprite(file, label, size) {
  const key = `${file}:${size}`;
  if (imported.has(key)) return imported.get(key);
  const bytes = await sharp(file).resize(size, size, { fit: "inside", withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toBuffer();
  const asset = `${assetRoot}/art/${label}-${hash(bytes).slice(0, 12)}.webp`;
  fs.writeFileSync(path.join(root, asset), bytes);
  imported.set(key, asset);
  return asset;
}

async function main() {
  const approved = read(path.join(source, "maps.json"));
  const layoutFile = path.join(root, "functions/core-expansion-world-layout.json");
  const catalogFile = path.join(root, "functions/core-expansion-region-catalog.json");
  const layout = read(layoutFile), catalog = read(catalogFile);
  assert.equal(approved.length, layout.maps.length, "Every prepared map needs reviewed art and a layout");
  fs.mkdirSync(path.join(root, assetRoot, "art"), { recursive: true });
  fs.mkdirSync(path.join(root, assetRoot, "thumbnails"), { recursive: true });
  const receipt = { style: "illustrated-atlas-v1", dimensions: [W, H], cityStageAssets: {}, maps: [] };
  const stageRoot = path.resolve(source, "../player-cities-v1");
  for (const s of read(path.join(stageRoot, "stages.json"))) {
    receipt.cityStageAssets[s.stage] = await sprite(path.join(stageRoot, s.key, "city-256.webp"), `city-${s.key}`, 256);
  }
  for (const m of approved) {
    const server = layout.maps.find(r => r.id === m.id), summary = catalog.regions.find(r => r.id === m.id);
    assert(server && summary, `Unknown active-topology map ${m.id}`);
    const definitionPath = path.join(root, m.sourceDefinition), definition = read(definitionPath);
    const revised = read(path.join(source, m.key, "region-layout.json"));
    assert.deepEqual(definition.cities.map(c => c.id), revised.cities.map(c => c.id));
    const coords = new Map(revised.cities.map(c => [c.id, c]));
    for (const list of [definition.cities, server.cities]) for (const c of list) {
      const p = coords.get(c.id); assert(p, `Missing city ${c.id}`);
      for (const key of ["x", "y", "xNorm", "yNorm"]) c[key] = p[key];
    }
    const scenery = [];
    for (const p of m.props) scenery.push({ id: p.id, type: p.type, x: p.x, y: p.y, w: p.w, h: p.h, asset: await sprite(p.asset, p.type, 256) });
    const landmarks = [];
    if (m.structure) {
      const asset = await sprite(m.structure, m.key, 384);
      const objective = definition.strongholds[0] || definition.camps[0];
      const id = objective?.id || `core-v2-holding-tower-${["tower-ravenwatch", "tower-highguard", "tower-blackthorn", "tower-stoneward"].indexOf(m.key) + 1}`;
      landmarks.push({ id, kind: m.group, name: m.title, asset, ...m.registration.imageRect, gate: m.registration.gate });
      for (const list of [definition.strongholds, definition.camps, server.objectives, server.camps]) for (const o of list) {
        assert.equal(o.id, id); o.artSrc = asset;
      }
    }
    const roadsFile = path.join(source, m.key, "roads-painted.png");
    const roads = await sharp(roadsFile).resize(W, H).png().toBuffer();
    // Terrain and non-interactive roads are the background. Gameplay objects
    // and scenery retain independent rendering layers in the playable map.
    const background = await sharp(m.background).resize(W, H).composite([{ input: roads }]).webp({ quality: 76, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(root, summary.mapAsset), background);
    const thumbLayers = [];
    for (const p of scenery) thumbLayers.push({ input: await sharp(path.join(root, p.asset)).resize(Math.round(p.w), Math.round(p.h)).png().toBuffer(), left: Math.round(p.x-p.w/2), top: Math.round(p.y-p.h/2) });
    const decorated = await sharp(background).composite(thumbLayers).png().toBuffer();
    const thumbnailAsset = `${assetRoot}/thumbnails/${m.id}.webp`;
    await sharp(decorated).resize(362, 272).webp({ quality: 78, effort: 6 }).toFile(path.join(root, thumbnailAsset));
    summary.thumbnailAsset = thumbnailAsset; server.thumbnailSrc = thumbnailAsset; definition.thumbnailPath = thumbnailAsset;
    summary.artPresentation = { style: receipt.style, scenery, landmarks };
    const roadPlan = read(path.join(source, m.key, "roads.json"));
    receipt.maps.push({ id: m.id, source: m.approvedSource ? "approved-personalized-roads-v1" : "extended-reviewed-countryside", template: m.template || null, backgroundSha256: hash(background), roadGeometrySha256: hash(JSON.stringify(roadPlan.paths)), seed: roadPlan.seed, cityCount: definition.cities.length, sceneryCount: scenery.length, landmarks: landmarks.map(l => l.id) });
    write(definitionPath, definition);
    console.log(`Imported ${m.id}: ${definition.cities.length} cities, ${scenery.length} scenery, ${landmarks.length} landmark`);
  }
  assert.equal(new Set(receipt.maps.map(m => m.roadGeometrySha256)).size, approved.length, "Road shapes must be individual");
  catalog.mapPresentation = { ...catalog.mapPresentation, illustratedStyle: receipt.style, cityStageAssets: receipt.cityStageAssets };
  catalog.mapPresentation.strongholdAssets = Object.fromEntries(layout.maps.flatMap(map => map.objectives.map(object => [object.type, object.artSrc])));
  catalog.mapPresentation.campAssets = Object.fromEntries(layout.maps.flatMap(map => map.camps.map(object => [object.campType, object.artSrc])));
  write(layoutFile, layout); write(catalogFile, catalog);
  write(path.join(root, assetRoot, "illustrated-art-receipt.json"), receipt);
  require("./sync-core-expansion-assets").syncCoreExpansionAssets();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
