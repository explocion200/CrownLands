const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  getCanonicalLayoutCityName,
  isGenericCityName,
} = require("./city-name-utils");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const editorSource = fs.readFileSync(path.join(root, "tools", "map-editor", "editor.js"), "utf8");
const editorServerSource = fs.readFileSync(path.join(root, "tools", "editor-server.js"), "utf8");
const worldLayout = JSON.parse(fs.readFileSync(path.join(root, "functions", "world-layout.json"), "utf8"));
const context = { window: {} };

vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "assets", "map-editor-data.js"), "utf8"),
  context,
  { timeout: 1000 }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.window.CROWNLANDS_MAP_EDITOR_DATA || {})),
  worldLayout,
  "Map editor data and the server world manifest must stay identical."
);

let cityCount = 0;
for (const map of worldLayout.maps || []) {
  const names = new Set();
  for (const [index, city] of (map.cities || []).entries()) {
    cityCount += 1;
    const canonicalName = getCanonicalLayoutCityName(city, map.id, index);
    assert.ok(canonicalName, `${map.id}/${city.id} has no city name.`);
    assert.equal(
      isGenericCityName(city.name, city.id),
      false,
      `${map.id}/${city.id} still uses the placeholder "${city.name}".`
    );
    assert.doesNotMatch(city.name, /\d/, `${map.id}/${city.id} includes a number in its display name.`);
    assert.equal(city.name, canonicalName, `${map.id}/${city.id} is not using its canonical name.`);
    assert.ok(!names.has(canonicalName.toLowerCase()), `${map.id} repeats the city name "${canonicalName}".`);
    names.add(canonicalName.toLowerCase());
  }
}
assert.ok(cityCount > 0, "The world manifest has no cities to validate.");

assert.match(
  serverSource,
  /getAuthoritativeIslandSeed[\s\S]*?name:\s*getServerCanonicalCityName\(/,
  "The server seed is not persisting canonical city names."
);
assert.match(
  serverSource,
  /function cleanCityUpdate[\s\S]*?getServerCanonicalCityName/,
  "Server city mutations do not repair stale placeholder names."
);
assert.match(
  clientSource,
  /function getCanonicalCityName[\s\S]*?isGenericCityName[\s\S]*?generateCityName/,
  "The game client does not reject placeholder city names."
);
assert.match(
  editorSource,
  /function getEditorCanonicalCityName[\s\S]*?generateEditorCityName/,
  "New map-editor cities do not receive real names."
);
assert.match(
  editorServerSource,
  /getCanonicalLayoutCityName[\s\S]*?function cleanCity/,
  "The map-editor server does not normalize city names."
);

console.log(`Validated ${cityCount} named cities, canonical persistence, and placeholder-free map editing.`);
