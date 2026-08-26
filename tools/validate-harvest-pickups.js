const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gameSource = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "functions", "index.js"), "utf8");
const styleSource = `${fs.readFileSync(path.resolve(__dirname, "..", "styles.css"), "utf8")}\n${fs.readFileSync(path.resolve(__dirname, "..", "interface-theme.css"), "utf8")}`;
const economyConfigContext = { window: {} };
vm.createContext(economyConfigContext);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", "economy-config.js"), "utf8"), economyConfigContext);
const economyConfig = economyConfigContext.window.CROWNLANDS_ECONOMY_CONFIG;
const serverEconomyConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "functions", "economy-config.json"), "utf8"));

assert.deepEqual(serverEconomyConfig.pickups, JSON.parse(JSON.stringify(economyConfig.pickups)), "Client and server pickup timing configuration must remain identical.");
assert.equal(economyConfig.pickups.initialSpawnDelayMinutes, 3, "The first pickup must retain its three-minute delay.");
assert.equal(economyConfig.pickups.respawnAfterCollectionMinutes, 1, "Successful collections must start a one-minute respawn.");
assert.equal(economyConfig.pickups.expireMinutes, 20, "Pickup expiration must remain twenty minutes.");

assert.match(
  styleSource,
  /\.harvest-bonus-node\s*\{[\s\S]{0,280}?--pickup-glow-core:\s*rgba\(255, 205, 54, \.88\);/,
  "Gold pickups must define a bright gold map glow.",
);
assert.match(
  styleSource,
  /\.harvest-bonus-node\s*\{[\s\S]{0,260}?width:\s*var\(--map-hit-size, 66px\);[\s\S]{0,80}?height:\s*var\(--map-hit-size, 66px\);/,
  "Pickup hit targets must use the zoom-aware map hit size at low, medium, and high zoom.",
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
  const paramsStart = source.indexOf("(", start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    if (source[index] === "(") paramsDepth += 1;
    if (source[index] === ")") paramsDepth -= 1;
    if (paramsDepth === 0) {
      paramsEnd = index;
      break;
    }
  }
  assert.ok(paramsEnd > paramsStart, `Could not parse ${name} parameters.`);
  const bodyStart = source.indexOf("{", paramsEnd);
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
assert.match(collectSource, /resetHarvestRespawnTimer\(\)/, "Local pickup claims must start the dedicated collection respawn timer.");
assert.match(collectSource, /getHarvestBonusRespawnToastSuffix/, "Successful pickup messages must include the collection respawn notice.");
assert.match(extractFunction(gameSource, "getHarvestBonusRespawnToastSuffix"), /Next pickup in/, "The collection respawn notice must tell the player when the next pickup arrives.");
assert.match(
  collectSource,
  /catch \(error\) \{[\s\S]*?state\.harvestBonuses\.splice\(Math\.min\(index, state\.harvestBonuses\.length\), 0, bonus\);[\s\S]*?Could not collect harvest bonus/,
  "Failed server collections must restore the pickup instead of consuming it or restarting its timer."
);

const reserveStart = serverSource.indexOf("exports.reserveHarvestBonusSpawn =");
const reserveEnd = serverSource.indexOf("exports.repairMainCityAssignment =", reserveStart);
const reserveSource = serverSource.slice(reserveStart, reserveEnd);
assert.match(reserveSource, /if \(nowMs < currentNextSpawnAtMs\)/, "The server must reject early pickup spawn reservations.");
assert.match(reserveSource, /activeBonuses\.length >= HARVEST_BONUS_MAX_ACTIVE_PER_PLAYER/, "The server must retain the one-active-pickup gate.");

const serverCollectStart = serverSource.indexOf("exports.collectHarvestBonus =");
const serverCollectEnd = serverSource.indexOf("function normalizeSkillSpendAllocations", serverCollectStart);
const serverCollectSource = serverSource.slice(serverCollectStart, serverCollectEnd);
assert.match(
  serverCollectSource,
  /const harvestNextSpawnAtMs = nowMs \+ HARVEST_BONUS_RESPAWN_SECONDS \* 1000;/,
  "The server must anchor the next pickup to the successful collection time."
);
assert.match(
  serverCollectSource,
  /harvestSpawnTimer: HARVEST_BONUS_RESPAWN_SECONDS/,
  "The authoritative collection response must return the one-minute respawn timer."
);
assert.match(
  serverCollectSource,
  /if \(!activeBonus\) \{[\s\S]*?throw new HttpsError[\s\S]*?if \(getHarvestBonusRemaining\(type, daily\) <= 0\) \{[\s\S]*?throw new HttpsError[\s\S]*?const harvestNextSpawnAtMs/,
  "Expired pickups and daily-cap failures must stop before the collection timer is changed."
);

const initialStateSource = extractFunction(gameSource, "newGame");
assert.match(initialStateSource, /harvestSpawnTimer: HARVEST_BONUS_INITIAL_SPAWN_SECONDS/, "New local games must start with the initial delay.");
assert.match(initialStateSource, /HARVEST_BONUS_INITIAL_SPAWN_SECONDS \* 1000/, "The local initial deadline must use the three-minute setting.");
assert.match(serverSource, /harvestSpawnTimer: HARVEST_BONUS_INITIAL_SPAWN_SECONDS,[\s\S]*?harvestNextSpawnAtMs: nowMs \+ HARVEST_BONUS_INITIAL_SPAWN_SECONDS \* 1000/, "New server profiles must start with the initial delay.");

const timerContext = {
  HARVEST_BONUS_INITIAL_SPAWN_SECONDS: 180,
  HARVEST_BONUS_MAX_TIMER_SECONDS: 180,
  timestampToMs(value) { return Math.max(0, Number(value) || 0); },
  clampInt(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, Math.floor(Number(value) || 0))); },
};
vm.createContext(timerContext);
vm.runInContext(extractFunction(serverSource, "getHarvestNextSpawnAtMs"), timerContext);
vm.runInContext(extractFunction(serverSource, "getHarvestSpawnTimerFromNextAt"), timerContext);
assert.equal(timerContext.getHarvestNextSpawnAtMs({}, 10_000), 190_000, "A profile without pickup timing state must receive the three-minute initial delay.");
assert.equal(timerContext.getHarvestNextSpawnAtMs({ harvestSpawnTimer: 60 }, 10_000), 70_000, "Legacy timer state must preserve a one-minute remaining cooldown.");
assert.equal(timerContext.getHarvestSpawnTimerFromNextAt(70_000, 10_000), 60, "The server response must report one minute remaining from its absolute deadline.");

const createPointSource = extractFunction(gameSource, "createHarvestBonusPoint");
const pruneSource = extractFunction(gameSource, "pruneExpiredHarvestBonuses");
assert.match(createPointSource, /getIslandMapBounds\(activeRegionId\)/, "Pickup placement must use the destination map's own bounds.");
assert.match(createPointSource, /bounds\.left \+ bounds\.width \/ 2/, "Pickup placement must calculate the map's horizontal center.");
assert.match(createPointSource, /bounds\.top \+ bounds\.height \/ 2/, "Pickup placement must calculate the map's vertical center.");
assert.match(createPointSource, /HARVEST_BONUS_CENTER_SEARCH_FRACTIONS/, "Pickup placement must expand through center-biased search zones.");
assert.match(createPointSource, /HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE/, "Each center search zone must distribute attempts around the full map center instead of relying on random clustering.");
assert.match(createPointSource, /\(attempt \+ 0\.5\) \/ HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE/, "Each center search zone must distribute attempts across its full radius.");
assert.doesNotMatch(createPointSource, /OwnedCity|owned city|anchors/, "New pickup placement must not depend on an owned-city anchor.");
assert.doesNotMatch(pruneSource, /NearOwnedCity|OwnedCity/, "Cleanup must not delete centered or legacy pickups merely because they are away from an owned city.");
assert.match(pruneSource, /isHarvestBonusTerrainSafePoint/, "Cleanup must retain terrain safety validation.");

const mapEditorContext = { window: {} };
vm.createContext(mapEditorContext);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", "assets", "map-editor-data.js"), "utf8"), mapEditorContext);
const currentMaps = mapEditorContext.window.CROWNLANDS_MAP_EDITOR_DATA.maps;
assert.ok(currentMaps.length >= 5, "Pickup placement validation needs the current map catalog.");
const currentMapBounds = Object.fromEntries(currentMaps.map(map => {
  const region = map.region;
  return [map.id, {
    left: region.x - region.rx,
    top: region.y - region.ry,
    width: region.rx * 2,
    height: region.ry * 2,
  }];
}));
const centerPlacementContext = {
  HARVEST_BONUS_CENTER_SEARCH_FRACTIONS: [0.15, 0.25, 0.35],
  HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE: 300,
  HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE: Math.PI * (3 - Math.sqrt(5)),
  normalizeRegionId: value => String(value || ""),
  getIslandMapBounds: regionId => currentMapBounds[regionId],
  isValidHarvestBonusPoint: () => true,
};
vm.createContext(centerPlacementContext);
vm.runInContext(createPointSource, centerPlacementContext);
for (const map of currentMaps) {
  const point = centerPlacementContext.createHarvestBonusPoint(map.id);
  const bounds = currentMapBounds[map.id];
  assert.equal(point.x, bounds.left + bounds.width / 2, `${map.id} did not choose its own horizontal map center.`);
  assert.equal(point.y, bounds.top + bounds.height / 2, `${map.id} did not choose its own vertical map center.`);
}

let randomSeed = 0x5f3759df;
const deterministicMath = {
  PI: Math.PI,
  cos: Math.cos,
  sin: Math.sin,
  sqrt: Math.sqrt,
  max: Math.max,
  min: Math.min,
  random() {
    randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
    return randomSeed / 0x100000000;
  },
};
const obstructedCenterContext = {
  Math: deterministicMath,
  Number,
  HARVEST_BONUS_CENTER_SEARCH_FRACTIONS: [0.15, 0.25, 0.35],
  HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE: 300,
  HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE: Math.PI * (3 - Math.sqrt(5)),
  normalizeRegionId: value => String(value || ""),
  getIslandMapBounds: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
  isValidHarvestBonusPoint(x, y) {
    const distance = Math.hypot(x - 500, y - 400);
    return distance >= 140 && distance <= 170;
  },
};
vm.createContext(obstructedCenterContext);
vm.runInContext(createPointSource, obstructedCenterContext);
const expandedPoint = obstructedCenterContext.createHarvestBonusPoint("obstructed");
const expandedDistance = Math.hypot(expandedPoint.x - 500, expandedPoint.y - 400);
assert.ok(expandedDistance >= 140 && expandedDistance <= 170, "An obstructed center did not expand outward to the nearest safe center zone.");
assert.ok(expandedDistance <= 800 * 0.25, "Center placement expanded beyond the second search zone unnecessarily.");

const thirdZoneContext = {
  Math: deterministicMath,
  Number,
  HARVEST_BONUS_CENTER_SEARCH_FRACTIONS: [0.15, 0.25, 0.35],
  HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE: 300,
  HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE: Math.PI * (3 - Math.sqrt(5)),
  normalizeRegionId: value => String(value || ""),
  getIslandMapBounds: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
  isValidHarvestBonusPoint(x, y) {
    const distance = Math.hypot(x - 500, y - 400);
    return distance >= 225 && distance <= 255;
  },
};
vm.createContext(thirdZoneContext);
vm.runInContext(createPointSource, thirdZoneContext);
const thirdZonePoint = thirdZoneContext.createHarvestBonusPoint("third-zone");
const thirdZoneDistance = Math.hypot(thirdZonePoint.x - 500, thirdZonePoint.y - 400);
assert.ok(thirdZoneDistance >= 225 && thirdZoneDistance <= 255, "An obstructed center did not expand into the 35% search zone.");
assert.ok(thirdZoneDistance > 800 * 0.25 && thirdZoneDistance <= 800 * 0.35, "The third-zone fallback escaped the 35% center boundary.");

const noSafePointContext = {
  Math: deterministicMath,
  Number,
  HARVEST_BONUS_CENTER_SEARCH_FRACTIONS: [0.15, 0.25, 0.35],
  HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE: 300,
  HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE: Math.PI * (3 - Math.sqrt(5)),
  normalizeRegionId: value => String(value || ""),
  getIslandMapBounds: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
  isValidHarvestBonusPoint: () => false,
};
vm.createContext(noSafePointContext);
vm.runInContext(createPointSource, noSafePointContext);
assert.equal(noSafePointContext.createHarvestBonusPoint("blocked"), null, "A fully blocked center search must return null for the five-second retry path.");

const serverUpdateSource = extractFunction(gameSource, "updateServerHarvestBonuses");
const localUpdateSource = extractFunction(gameSource, "updateHarvestBonuses");
assert.match(serverUpdateSource, /relocateActive:[\s\S]*?createHarvestBonusPoint\(activeRegionId\)/, "Server-backed map relocation must use center-biased placement.");
assert.match(localUpdateSource, /createHarvestBonusPoint\(activeRegionId\)/, "Local map relocation must use center-biased placement.");
assert.match(localUpdateSource, /spawned \? HARVEST_BONUS_RESPAWN_SECONDS : HARVEST_BONUS_SERVER_RETRY_SECONDS/, "A failed local placement must use the short retry rather than the collection cooldown.");

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
