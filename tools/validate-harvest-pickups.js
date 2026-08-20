const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gameSource = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "functions", "index.js"), "utf8");
const styleSource = `${fs.readFileSync(path.resolve(__dirname, "..", "styles.css"), "utf8")}\n${fs.readFileSync(path.resolve(__dirname, "..", "interface-theme.css"), "utf8")}`;

assert.match(
  styleSource,
  /\.harvest-bonus-node\s*\{[\s\S]{0,280}?--pickup-glow-core:\s*rgba\(255, 205, 54, \.88\);/,
  "Gold pickups must define a bright gold map glow.",
);
assert.match(
  styleSource,
  /\.harvest-bonus-node\.harvest-bonus-troops\s*\{[\s\S]{0,280}?--pickup-glow-core:\s*rgba\(255, 63, 54, \.9\);/,
  "Troop pickups must override the map glow with red.",
);
assert.match(
  styleSource,
  /\.harvest-bonus-icon\s*\{[\s\S]{0,320}?drop-shadow\(0 0 9px rgba\(255, 222, 92, \.98\)\)/,
  "Gold pickup artwork must retain its gold halo.",
);
assert.match(
  styleSource,
  /\.harvest-bonus-node\.harvest-bonus-troops \.harvest-bonus-icon\s*\{[\s\S]{0,320}?drop-shadow\(0 0 9px rgba\(255, 105, 92, \.98\)\)/,
  "Troop pickup artwork must retain its red halo.",
);

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

const serverRewardSource = extractFunction(serverSource, "getHarvestBonusReward");
assert.match(
  serverRewardSource,
  /const rates = getRewardedAdBaseRates\(economy\);/,
  "Server pickup rewards must use the canonical raw rewarded-ad base-rate helper.",
);
assert.match(
  serverRewardSource,
  /rates\.goldPerHour \* HARVEST_BONUS_GOLD_SECONDS \/ 3600/,
  "Gold pickups must be calculated from raw hourly Gold production.",
);
assert.match(
  serverRewardSource,
  /rates\.troopsPerHour \* HARVEST_BONUS_TROOP_SECONDS \/ 3600/,
  "Troop pickups must be calculated from raw hourly troop production.",
);
assert.doesNotMatch(
  serverSource,
  /function getHarvestEconomyRates\(/,
  "The obsolete boosted pickup-rate helper must not remain available.",
);

const serverRewardContext = {
  HARVEST_BONUS_GOLD_SECONDS: 3600,
  HARVEST_BONUS_TROOP_SECONDS: 3600,
  HARVEST_BONUS_MIN_GOLD: 250,
  HARVEST_BONUS_MIN_TROOPS: 250,
  HARVEST_BONUS_MAX_TROOPS: Number.MAX_SAFE_INTEGER,
  rawRates: { goldPerHour: 10_000, troopsPerHour: 7_200 },
  getRewardedAdBaseRates() { return serverRewardContext.rawRates; },
  clampInt(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Math.floor(Number(value) || 0)));
  },
};
vm.createContext(serverRewardContext);
vm.runInContext(serverRewardSource, serverRewardContext);
assert.equal(serverRewardContext.getHarvestBonusReward({}, "gold"), 10_000);
assert.equal(serverRewardContext.getHarvestBonusReward({}, "troops"), 7_200);
serverRewardContext.rawRates = { goldPerHour: 10_000.9, troopsPerHour: 7_200.9 };
assert.equal(serverRewardContext.getHarvestBonusReward({}, "gold"), 10_000, "Gold pickup rewards must floor fractional production.");
assert.equal(serverRewardContext.getHarvestBonusReward({}, "troops"), 7_200, "Troop pickup rewards must floor fractional production.");
serverRewardContext.rawRates = { goldPerHour: 100, troopsPerHour: 100 };
assert.equal(serverRewardContext.getHarvestBonusReward({}, "gold"), 250, "Gold pickup minimums must remain intact.");
assert.equal(serverRewardContext.getHarvestBonusReward({}, "troops"), 250, "Troop pickup minimums must remain intact.");

const localCities = [
  { baseGold: 10_000, baseTroops: 7_200, boostedGold: 19_000, boostedTroops: 13_000 },
];
const localStatOptions = [];
const localRewardContext = {
  HARVEST_BONUS_GOLD_SECONDS: 3600,
  HARVEST_BONUS_TROOP_SECONDS: 3600,
  HARVEST_BONUS_MIN_GOLD: 250,
  HARVEST_BONUS_MIN_TROOPS: 250,
  HARVEST_BONUS_MAX_TROOPS: Number.MAX_SAFE_INTEGER,
  playerRegularCities: () => localCities.filter(city => !city.isStronghold),
  getCityStats(city, options) {
    localStatOptions.push(options);
    return {
      baseGoldProductionPerHour: city.baseGold,
      baseTroopProductionPerHour: city.baseTroops,
      goldProductionPerHour: city.boostedGold,
      troopProductionPerHour: city.boostedTroops,
    };
  },
  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  },
};
vm.createContext(localRewardContext);
for (const functionName of [
  "getHarvestBonusBaseRates",
  "getHarvestBonusGoldReward",
  "getHarvestBonusTroopReward",
]) {
  vm.runInContext(extractFunction(gameSource, functionName), localRewardContext);
}
assert.equal(localRewardContext.getHarvestBonusGoldReward(), 10_000, "Local Gold pickups must ignore the 19,000/hour boosted rate.");
assert.equal(localRewardContext.getHarvestBonusTroopReward(), 7_200, "Local troop pickups must ignore the 13,000/hour boosted rate.");
assert.deepEqual(
  JSON.parse(JSON.stringify(localStatOptions.at(-1))),
  { includeSkillBoosts: false, includeStrongholdBoosts: false, includeTimedItemBoosts: false },
  "Local pickup base-rate calculation must explicitly disable every local production-bonus category.",
);
localCities.push({ baseGold: 2_500, baseTroops: 1_200, boostedGold: 9_999_999, boostedTroops: 9_999_999 });
assert.equal(localRewardContext.getHarvestBonusGoldReward(), 12_500, "A normal-city raw production increase must increase the local Gold pickup.");
assert.equal(localRewardContext.getHarvestBonusTroopReward(), 8_400, "A normal-city raw production increase must increase the local troop pickup.");
localCities.push({ isStronghold: true, baseGold: 5_000_000, baseTroops: 5_000_000, boostedGold: 9_999_999, boostedTroops: 9_999_999 });
assert.equal(localRewardContext.getHarvestBonusGoldReward(), 12_500, "Stronghold production must not increase the local Gold pickup.");
assert.equal(localRewardContext.getHarvestBonusTroopReward(), 8_400, "Stronghold production must not increase the local troop pickup.");

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
