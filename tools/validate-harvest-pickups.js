const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gameSource = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "functions", "index.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const context = {};
vm.createContext(context);
vm.runInContext(extractFunction(gameSource, "currentDailyDateKey"), context);
vm.runInContext(extractFunction(serverSource, "getCurrentDateKey"), context);

const utcRollover = new Date("2026-07-22T00:30:00.000Z");
assert.equal(context.currentDailyDateKey(utcRollover), "2026-07-22");
assert.equal(context.getCurrentDateKey(utcRollover), "2026-07-22");

const collectStart = gameSource.indexOf("async function collectHarvestBonus");
const collectEnd = gameSource.indexOf("function getOfflineProgressSeconds", collectStart);
assert.ok(collectStart >= 0 && collectEnd > collectStart, "Pickup collection flow must exist.");
const collectSource = gameSource.slice(collectStart, collectEnd);
assert.match(collectSource, /applyServerEconomyResult\(result, \{ renderCities: false \}\)/, "Pickup claims must avoid a full city-map rebuild.");
assert.doesNotMatch(collectSource, /renderCities\(true\)/, "Pickup claims must not force-render all visible cities.");
assert.match(collectSource, /result\?\.currentUser\?\.daily/, "Pickup count messages must use the authoritative server counter.");
assert.match(collectSource, /destinationRegionId:\s*type === "troops" \? String\(result\?\.targetRegionId/, "Troop pickups must use the server-confirmed Main City region for their animation.");
assert.match(serverSource, /targetRegionId:\s*normalizeRegionId\(mainEntry\.city\.regionId \|\| mainInfo\.regionId\)/, "The pickup response must identify the credited Main City region.");

const profileButton = { id: "profile-button" };
const profileTroopTotal = { id: "profile-troops", hidden: false, getClientRects: () => [] };
const renderedMainCity = {
  getClientRects: () => [{}],
  getBoundingClientRect: () => ({ left: 100, right: 140, top: 100, bottom: 140 }),
};
const mapFrame = {
  getClientRects: () => [{}],
  getBoundingClientRect: () => ({ left: 0, right: 500, top: 0, bottom: 500 }),
};
const destinationContext = {
  state: { mainCityId: "main-city", online: { mainRegionId: "south" } },
  activeRegionId: "north",
  mainCity: { id: "main-city", regionId: "south" },
  profileBtn: profileButton,
  profileTroopsStat: profileTroopTotal,
  profileScreen: { classList: { contains: () => false } },
  cityLayer: { querySelector: () => renderedMainCity },
  mapFrame,
  CSS: { escape: value => String(value) },
  normalizeRegionId: value => String(value || "north"),
  getActiveMapRegionId: () => destinationContext.activeRegionId,
  cityById: id => id === destinationContext.mainCity.id ? destinationContext.mainCity : null,
  getOwnedCitySnapshotById: id => id === destinationContext.mainCity.id ? destinationContext.mainCity : null,
  getCityRegionId(city) { return String(city?.regionId || ""); },
  getGlobalStatsSnapshot: () => ({ mainRegionId: destinationContext.state.online.mainRegionId }),
};
vm.createContext(destinationContext);
for (const functionName of [
  "getVisibleTroopRewardDestination",
  "getTroopRewardDestinationRegionId",
  "getVisibleMainCityTroopRewardDestination",
]) {
  vm.runInContext(extractFunction(gameSource, functionName), destinationContext);
}

assert.equal(
  destinationContext.getVisibleMainCityTroopRewardDestination("main-city", "south"),
  null,
  "An off-region Main City must not receive a map animation."
);
assert.equal(destinationContext.getVisibleTroopRewardDestination(), profileButton);
destinationContext.activeRegionId = "south";
assert.equal(
  destinationContext.getVisibleMainCityTroopRewardDestination("main-city", "south"),
  renderedMainCity,
  "A visible Main City in the active region must receive the troop animation."
);
renderedMainCity.getBoundingClientRect = () => ({ left: 700, right: 740, top: 100, bottom: 140 });
assert.equal(
  destinationContext.getVisibleMainCityTroopRewardDestination("main-city", "south"),
  null,
  "An off-screen Main City must fall back to the profile UI."
);
destinationContext.profileScreen.classList.contains = value => value === "open";
profileTroopTotal.getClientRects = () => [{}];
assert.equal(destinationContext.getVisibleTroopRewardDestination(), profileTroopTotal);

console.log("Validated UTC pickup counters, authoritative Main City crediting, and cross-region profile animation routing.");
