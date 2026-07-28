const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  generateMedievalCityName,
  getCanonicalLayoutCityName,
  isGenericCityName,
} = require("./city-name-utils");

const root = path.resolve(__dirname, "..");
const serverLayoutPath = path.join(root, "functions", "world-layout.json");
const editorDataPath = path.join(root, "assets", "map-editor-data.js");
const regionDirectory = path.join(root, "assets", "worlds", "world_01", "regions");
const writeChanges = process.argv.includes("--write");
const releaseVersion = 202607270001;
const releaseUpdatedAt = "2026-07-27T00:01:00.000Z";

function readEditorLayout() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(editorDataPath, "utf8"), context, {
    filename: editorDataPath,
    timeout: 1000,
  });
  return JSON.parse(JSON.stringify(context.window.CROWNLANDS_MAP_EDITOR_DATA || {}));
}

function canonicalizeMapCities(map = {}) {
  const usedNames = new Set();
  const collisionTitles = ["Keep", "Abbey", "Cross", "Gate", "March", "Market", "Mead", "Moor", "Rest", "Rise", "Watch"];
  let changed = 0;
  (Array.isArray(map.cities) ? map.cities : []).forEach((city, index) => {
    let name = getCanonicalLayoutCityName(city, map.id, index);
    if (usedNames.has(name.toLowerCase())) {
      const baseName = generateMedievalCityName(map.id, index, city.id);
      name = collisionTitles
        .map(title => `${baseName} ${title}`)
        .find(candidate => !usedNames.has(candidate.toLowerCase()));
      if (!name) throw new Error(`Could not create a unique name for ${map.id}/${city.id}.`);
    }
    usedNames.add(name.toLowerCase());
    if (city.name !== name) {
      city.name = name;
      changed += 1;
    }
  });
  return changed;
}

function canonicalizeLayout(layout = {}) {
  let changed = 0;
  (Array.isArray(layout.maps) ? layout.maps : []).forEach(map => {
    changed += canonicalizeMapCities(map);
  });
  if (changed > 0) {
    layout.version = Math.max(releaseVersion, Number(layout.version) || 0);
    layout.updatedAt = releaseUpdatedAt;
  }
  return changed;
}

function assertNoGenericNames(layout = {}, label = "layout") {
  const generic = (Array.isArray(layout.maps) ? layout.maps : []).flatMap(map => (
    (Array.isArray(map.cities) ? map.cities : [])
      .filter(city => isGenericCityName(city.name, city.id))
      .map(city => `${map.id}/${city.id}:${city.name}`)
  ));
  if (generic.length) {
    throw new Error(`${label} still contains generic city names: ${generic.slice(0, 10).join(", ")}`);
  }
}

const serverLayout = JSON.parse(fs.readFileSync(serverLayoutPath, "utf8"));
const editorLayout = readEditorLayout();
const serverChanges = canonicalizeLayout(serverLayout);
const editorChanges = canonicalizeLayout(editorLayout);

if (serverChanges !== editorChanges) {
  throw new Error(`World manifests disagree on the number of generic names (${serverChanges} vs ${editorChanges}).`);
}
assertNoGenericNames(serverLayout, "server world layout");
assertNoGenericNames(editorLayout, "map editor data");

if (writeChanges) {
  fs.writeFileSync(serverLayoutPath, `${JSON.stringify(serverLayout, null, 2)}\n`);
  fs.writeFileSync(
    editorDataPath,
    `window.CROWNLANDS_MAP_EDITOR_DATA = ${JSON.stringify(editorLayout, null, 2)};\n`
  );

  const canonicalNamesByRegion = new Map(serverLayout.maps.map(map => [
    map.id,
    new Map((map.cities || []).map(city => [city.id, city.name])),
  ]));
  for (const [regionId, namesById] of canonicalNamesByRegion) {
    const regionPath = path.join(regionDirectory, `${regionId}.json`);
    const region = JSON.parse(fs.readFileSync(regionPath, "utf8"));
    let regionChanged = false;
    (region.cities || []).forEach(city => {
      const canonicalName = namesById.get(city.id);
      if (canonicalName && city.name !== canonicalName) {
        city.name = canonicalName;
        regionChanged = true;
      }
    });
    if (regionChanged) fs.writeFileSync(regionPath, `${JSON.stringify(region, null, 2)}\n`);
  }
}

console.log(`${writeChanges ? "Normalized" : "Validated"} ${serverChanges} generic city names across ${serverLayout.maps.length} maps.`);
