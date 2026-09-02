"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  createAuthoritativeRoutePlanner,
  imagePointToWorld,
} = require("../functions/authoritative-route-planner.js");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = relativePath => JSON.parse(read(relativePath));

function readBrowserCatalog() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read("assets/worlds/core-expansion-v1/region-catalog.js"), sandbox);
  return sandbox.window.CROWNLANDS_REGION_CATALOG;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getClientWorldPoint(catalog, region, point) {
  const compatibility = region.compatibilityRegion;
  const dimensions = { width: region.width, height: region.height };
  const aspect = dimensions.width / dimensions.height;
  const padding = Math.max(560, Math.round(Math.max(compatibility.rx, compatibility.ry) * 0.22));
  let width;
  let height;
  if (aspect >= 1) {
    width = Math.round((compatibility.rx + padding) * 2);
    height = Math.round(width / aspect);
  } else {
    height = Math.round((compatibility.ry + padding) * 2);
    width = Math.round(height * aspect);
  }
  width = clamp(width, 1, catalog.globalSettings.worldWidth);
  height = clamp(height, 1, catalog.globalSettings.worldHeight);
  const left = clamp(
    Math.round(compatibility.x - width / 2),
    0,
    catalog.globalSettings.worldWidth - width,
  );
  const top = clamp(
    Math.round(compatibility.y - height / 2),
    0,
    catalog.globalSettings.worldHeight - height,
  );
  return {
    x: Math.round(left + point.x / dimensions.width * width),
    y: Math.round(top + point.y / dimensions.height * height),
  };
}

const layout = readJson("functions/core-expansion-world-layout.json");
const serverCatalog = readJson("functions/core-expansion-region-catalog.json");
const browserCatalog = readBrowserCatalog();
assert.equal(JSON.stringify(browserCatalog.globalSettings), JSON.stringify(serverCatalog.globalSettings));
assert.deepEqual(layout.globalSettings, serverCatalog.globalSettings,
  "Functions and the browser must use identical Core/New Lands world dimensions.");
assert.equal(layout.version, 2026090201,
  "The corrected layout needs a new seed version so existing island coordinates refresh safely.");

const regionId = "new-lands-l01-p001";
const sourceId = `${regionId}-city-02`;
const targetId = `${regionId}-city-13`;
const region = browserCatalog.regions.find(entry => entry.id === regionId);
const definition = readJson(region.regionDefinitionPath);
const planner = createAuthoritativeRoutePlanner(layout);
const model = planner.getModel(regionId);
const comparable = id => {
  const serverCity = model.map.cities.find(city => city.id === id);
  const clientCity = definition.cities.find(city => city.id === id);
  const serverPoint = imagePointToWorld(model, serverCity);
  const clientPoint = getClientWorldPoint(browserCatalog, region, clientCity);
  assert.deepEqual(
    { x: Math.round(serverPoint.x), y: Math.round(serverPoint.y) },
    clientPoint,
    `${id} route and marker coordinates drifted.`,
  );
  return clientPoint;
};
const source = { id: sourceId, regionId, ...comparable(sourceId) };
const target = { id: targetId, regionId, ...comparable(targetId) };
const route = planner.calculate(source, target);
assert(route?.pathSegments?.length);
assert.deepEqual(route.pathSegments[0].points[0], { x: source.x, y: source.y });
assert.deepEqual(route.pathSegments.at(-1).points.at(-1), { x: target.x, y: target.y });

const serverSource = read("functions/index.js");
assert.match(
  serverSource,
  /function getCanonicalArmyRouteEndpoint[\s\S]*?serverImagePointToWorld[\s\S]*?function buildServerGeneratedArmyRoute[\s\S]*?getCanonicalArmyRouteEndpoint\(source[\s\S]*?getCanonicalArmyRouteEndpoint\(target/,
  "Army launches must replace stale stored endpoint coordinates with the official map layout.",
);
const clientSource = read("game.js");
assert.match(clientSource, /function getMissionDisplayRouteSegments[\s\S]*?let start = from[\s\S]*?let end = to/,
  "The client must align already-moving routes to currently rendered city markers.");
assert.match(clientSource, /function getMissionSegmentsForRegion[\s\S]*?getMissionDisplayRouteSegments\(mission\)/,
  "Visible route lines must use endpoint-aligned segments.");
assert.match(clientSource, /function getMissionPointAtProgress[\s\S]*?getMissionDisplayRouteSegments\(mission\)/,
  "Army tokens must use the same endpoint-aligned segments as their route lines.");

console.log("Validated shared 23,000 x 23,000 route geometry, canonical launch endpoints, and in-flight marker alignment.");
