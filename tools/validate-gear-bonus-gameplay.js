const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const clientUiSource = fs.readFileSync(path.join(root, "common-gear-ui.js"), "utf8");
const commonGear = require(path.join(root, "common-gear.js"));

function extractFunction(source, name) {
  const functionStart = source.indexOf(`function ${name}(`);
  assert.ok(functionStart >= 0, `Missing ${name}.`);
  const start = source.slice(Math.max(0, functionStart - 6), functionStart) === "async "
    ? functionStart - 6
    : functionStart;
  const parameterStart = source.indexOf("(", functionStart);
  let parameterDepth = 0;
  let parameterEnd = -1;
  for (let index = parameterStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      parameterEnd = index;
      break;
    }
  }
  const bodyStart = source.indexOf("{", parameterEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function createGearProfile(equippedEntries = [], storedEntries = []) {
  const state = commonGear.createDefaultState();
  [...equippedEntries, ...storedEntries].forEach((entry, index) => {
    const definition = commonGear.getDefinition(entry.gearKey);
    assert.ok(definition, `Unknown test gear ${entry.gearKey}.`);
    const instanceId = entry.instanceId || `gear_test_${index}`;
    state.instances[instanceId] = {
      instanceId,
      gearKey: entry.gearKey,
      level: entry.level || 1,
    };
    if (index < equippedEntries.length) state.equipped[definition.buildingId][definition.slot] = instanceId;
  });
  return { gear: commonGear.normalizeState(state) };
}

const gearKeys = Object.fromEntries(commonGear.DEFINITIONS.map(definition => [
  `${definition.buildingId}:${definition.slot}`,
  definition.gearKey,
]));

function equipped(buildingId, slot, level = 1, instanceId = "") {
  return { gearKey: gearKeys[`${buildingId}:${slot}`], level, instanceId };
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function safeString(value, maxLength = 256) {
  return String(value || "").slice(0, maxLength);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function assertClose(actual, expected, message = "Values differ") {
  assert.ok(Math.abs(Number(actual) - Number(expected)) < 1e-9, `${message}: ${actual} !== ${expected}`);
}

async function main() {
  const allOfficerProfile = createGearProfile([
    equipped("barracks", "head", 1),
    equipped("treasury", "head", 2),
    equipped("treasury", "necklace", 1),
    equipped("royal-stables", "head", 3),
    equipped("royal-stables", "weapon", 4),
    equipped("royal-stables", "necklace", 5),
    equipped("gatehouse", "head", 2),
    equipped("gatehouse", "weapon", 3),
    equipped("gatehouse", "necklace", 4),
  ], [
    equipped("royal-stables", "necklace", 5, "unequipped_duplicate"),
  ]);
  const allBonuses = commonGear.getBonuses(allOfficerProfile);
  assert.equal(allBonuses.troopProductionAllCities, 0.25);
  assert.equal(allBonuses.goldProductionMainCity, 0.5);
  assert.equal(allBonuses.goldProductionAllCities, 0.25);
  assert.equal(allBonuses.ownedMarchSpeed, 0.8);
  assert.equal(allBonuses.enemyMarchSpeed, 1.15);
  assert.equal(allBonuses.scoutSpeed, 1.5, "An unequipped duplicate affected scouting speed.");
  assert.equal(allBonuses.wallStrength, 0.5);
  assert.equal(allBonuses.defenderStrength, 0.8);
  assert.equal(allBonuses.wallRepairSpeed, 1.15);

  const stableInstanceId = "stable_upgrade_instance";
  const levelOneProfile = createGearProfile([
    equipped("royal-stables", "weapon", 1, stableInstanceId),
  ]);
  const upgradedState = commonGear.normalizeState(levelOneProfile.gear);
  upgradedState.instances[stableInstanceId].level = 2;
  const upgradedProfile = { gear: commonGear.normalizeState(upgradedState) };
  assert.equal(commonGear.getBonuses(levelOneProfile).enemyMarchSpeed, 0.25);
  assert.equal(commonGear.getBonuses(upgradedProfile).enemyMarchSpeed, 0.5);
  assert.equal(upgradedProfile.gear.equipped["royal-stables"].weapon, stableInstanceId);
  const unequippedState = commonGear.normalizeState(upgradedProfile.gear);
  unequippedState.equipped["royal-stables"].weapon = "";
  assert.equal(commonGear.getBonuses({ gear: unequippedState }).enemyMarchSpeed, 0);

  const movementContext = {
    COMMON_GEAR: commonGear,
    ARMY_TRAVEL_KIND_MULTIPLIERS: { scout: 0.35, transfer: 0.95, reinforce: 0.95, rally_join: 0.95, attack: 1, rally: 1 },
    ARMY_TRAVEL_TROOP_BAND_LIMITS: [100, 1_000, 10_000, 100_000, Number.MAX_SAFE_INTEGER],
    ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS: [1, 1.08, 1.2, 1.35, 1.55],
    ARMY_TRAVEL_SECONDS_PER_MAP_UNIT: 0.13,
    ARMY_TRAVEL_MIN_SECONDS: 30,
    ARMY_TRAVEL_SCOUT_MIN_SECONDS: 10,
    ARMY_TRAVEL_MAX_SECONDS: 1_800,
    ONLINE_WORLD_ID: "world_test",
    RESET_GENERATION: "reset_test",
    GLOBAL_PLAYER_STATS_VERSION: 1,
    RALLY_MODEL_VERSION: 1,
    Math,
    Number,
    Date,
    console,
    safeNumber,
    safeString,
    clamp,
    getCommonGearBonuses(profile) {
      return commonGear.getBonuses(profile);
    },
    skillMultiplier() {
      return 1.6;
    },
    normalizeDemoAttackSnapshot() {
      return null;
    },
    createPreparedEconomyStatsSnapshot() {
      return { kingPower: 100 };
    },
    normalizeRallyId(value) {
      return safeString(value, 96);
    },
    normalizeRegionId(value) {
      return safeString(value, 80);
    },
  };
  vm.createContext(movementContext);
  vm.runInContext([
    extractFunction(serverSource, "getTroopTravelBandIndex"),
    extractFunction(serverSource, "getTroopTravelMultiplier"),
    extractFunction(serverSource, "addCommonGearMarchSpeed"),
    extractFunction(serverSource, "calculateTravelTime"),
    extractFunction(serverSource, "createRallyAssemblyMovement"),
    "this.addCommonGearMarchSpeed = addCommonGearMarchSpeed;",
    "this.calculateTravelTime = calculateTravelTime;",
    "this.createRallyAssemblyMovement = createRallyAssemblyMovement;",
  ].join("\n"), movementContext, { filename: "functions/index.js" });

  const movementProfiles = {
    none: createGearProfile([]),
    armor: createGearProfile([equipped("royal-stables", "head", 5)]),
    weapon: createGearProfile([equipped("royal-stables", "weapon", 5)]),
    necklace: createGearProfile([equipped("royal-stables", "necklace", 5)]),
  };
  const serverTravel = (profile, kind, troopCount = 100) => movementContext.calculateTravelTime({
    pathLength: 2_000,
    troopCount,
    kind,
    speedMultiplier: movementContext.addCommonGearMarchSpeed(profile, kind, 1.6 * 1.08),
  });
  assertClose(
    movementContext.addCommonGearMarchSpeed(movementProfiles.weapon, "attack", 1.6 * 1.08),
    1.6 * 1.08 + 0.015,
    "Max March Orders no longer preserves (capped skill × objective) + gear."
  );
  assert.ok(serverTravel(movementProfiles.necklace, "scout", 1) < serverTravel(movementProfiles.none, "scout", 1));
  assert.equal(serverTravel(movementProfiles.weapon, "scout", 1), serverTravel(movementProfiles.none, "scout", 1));
  for (const kind of ["transfer", "reinforce"]) {
    assert.ok(serverTravel(movementProfiles.armor, kind) < serverTravel(movementProfiles.none, kind));
    assert.equal(serverTravel(movementProfiles.weapon, kind), serverTravel(movementProfiles.none, kind));
  }
  for (const kind of ["attack", "rally", "rally_join"]) {
    assert.ok(serverTravel(movementProfiles.weapon, kind) < serverTravel(movementProfiles.none, kind));
    assert.equal(serverTravel(movementProfiles.armor, kind), serverTravel(movementProfiles.none, kind));
  }

  let activeClientMovementProfile = movementProfiles.none;
  const clientMovementContext = {
    ARMY_TRAVEL_KIND_MULTIPLIERS: movementContext.ARMY_TRAVEL_KIND_MULTIPLIERS,
    ARMY_TRAVEL_TROOP_BAND_LIMITS: movementContext.ARMY_TRAVEL_TROOP_BAND_LIMITS,
    ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS: movementContext.ARMY_TRAVEL_TROOP_BAND_MULTIPLIERS,
    ARMY_TRAVEL_SECONDS_PER_MAP_UNIT: movementContext.ARMY_TRAVEL_SECONDS_PER_MAP_UNIT,
    ARMY_TRAVEL_MIN_SECONDS: movementContext.ARMY_TRAVEL_MIN_SECONDS,
    ARMY_TRAVEL_SCOUT_MIN_SECONDS: movementContext.ARMY_TRAVEL_SCOUT_MIN_SECONDS,
    ARMY_TRAVEL_MAX_SECONDS: movementContext.ARMY_TRAVEL_MAX_SECONDS,
    Math,
    Number,
    clamp,
    getCommonGearBonuses() {
      return commonGear.getBonuses(activeClientMovementProfile);
    },
    skillMultiplier() {
      return 1.6;
    },
    getStrongholdMarchSpeedMultiplier() {
      return 1.08;
    },
    normalizeDemoAttackSnapshot() {
      return null;
    },
  };
  vm.createContext(clientMovementContext);
  vm.runInContext([
    extractFunction(clientSource, "getTroopTravelBandIndex"),
    extractFunction(clientSource, "getTroopTravelMultiplier"),
    extractFunction(clientSource, "travelTime"),
    "this.travelTime = travelTime;",
  ].join("\n"), clientMovementContext, { filename: "game.js" });
  const source = { x: 0, y: 0 };
  const target = { x: 2_000, y: 0 };
  for (const [kind, profile, troops] of [
    ["scout", movementProfiles.necklace, 1],
    ["transfer", movementProfiles.armor, 100],
    ["reinforce", movementProfiles.armor, 100],
    ["attack", movementProfiles.weapon, 100],
    ["rally_join", movementProfiles.weapon, 100],
  ]) {
    activeClientMovementProfile = profile;
    const clientSeconds = clientMovementContext.travelTime(source, target, "player", 2_000, troops, kind);
    assert.equal(clientSeconds, serverTravel(profile, kind, troops), `${kind} client/server ETA drifted.`);
  }

  const rallyNowMs = 10_000;
  const rallyMovement = movementContext.createRallyAssemblyMovement({
    order: { id: "assembly_1", sourceRegionId: "region_test" },
    rally: { id: "rally_1", clanId: "clan_1", assemblyRegionId: "region_test", assemblyCityId: "assembly", leaderUid: "leader" },
    participant: { uid: "ally", ownerName: "Ally", troops: 100, ownerKingPower: 100 },
    source: { id: "source", name: "Source" },
    assembly: { id: "assembly", name: "Assembly" },
    profile: movementProfiles.weapon,
    economy: { bonuses: { marchSpeedBonusPercent: 8 } },
    validatedRoute: { pathLength: 2_000, path: [], pathSegments: [], routeRegionIds: ["region_test"] },
    nowMs: rallyNowMs,
  });
  assert.equal(rallyMovement.total, serverTravel(movementProfiles.weapon, "rally_join", 100));
  assert.equal(rallyMovement.arrivesAtMs, rallyNowMs + Math.ceil(rallyMovement.total * 1_000));
  const armorRallyMovement = movementContext.createRallyAssemblyMovement({
    order: { id: "assembly_2", sourceRegionId: "region_test" },
    rally: { id: "rally_1", clanId: "clan_1", assemblyRegionId: "region_test", assemblyCityId: "assembly", leaderUid: "leader" },
    participant: { uid: "ally", ownerName: "Ally", troops: 100, ownerKingPower: 100 },
    source: { id: "source", name: "Source" },
    assembly: { id: "assembly", name: "Assembly" },
    profile: movementProfiles.armor,
    economy: { bonuses: { marchSpeedBonusPercent: 8 } },
    validatedRoute: { pathLength: 2_000, path: [], pathSegments: [], routeRegionIds: ["region_test"] },
    nowMs: rallyNowMs,
  });
  assert.equal(armorRallyMovement.total, serverTravel(movementProfiles.none, "rally_join", 100));

  let previewRequest = null;
  const previewContext = {
    console,
    ONLINE_WORLD_ID: "world_test",
    RESET_GENERATION: "reset_test",
    selectedTroopAmount: 100,
    supportsAuthoritativeArmyRoutes() { return true; },
    getOnlineApi() {
      return {
        async previewArmyRoute(request) {
          previewRequest = request;
          return { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
        },
      };
    },
    getCityRegionId() { return "region_test"; },
    isRewardCampTarget() { return false; },
    normalizeAuthoritativeRoutePreview(result) { return result; },
  };
  vm.createContext(previewContext);
  vm.runInContext(`${extractFunction(clientSource, "requestAuthoritativeOrderRoute")}; this.requestAuthoritativeOrderRoute = requestAuthoritativeOrderRoute;`, previewContext, { filename: "game.js" });
  await previewContext.requestAuthoritativeOrderRoute({ id: "source" }, { id: "assembly" }, "rally_join", 100);
  assert.equal(previewRequest.kind, "rally_join", "The client still previews rally assembly as a transfer.");

  const productionProfile = createGearProfile([
    equipped("barracks", "head", 1),
    equipped("treasury", "head", 2),
    equipped("treasury", "necklace", 1),
  ]);
  productionProfile.mainCityId = "main_city";
  const productionContext = {
    CITY_LEVEL_STATS: { victoryPointsBase: 100, victoryPointsPerLevel: 0, victoryPointsExponent: 1, victoryPointsExponentScale: 0, troopProductionPerVictoryPoint: 10 },
    WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT: 30,
    ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT: 50,
    Date,
    Math,
    Number,
    safeNumber,
    safeString,
    isStronghold() { return false; },
    getStrongholdDefenseLevel() { return 1; },
    clampCityLevel(value) { return Math.max(1, Math.floor(Number(value) || 1)); },
    getCommonGearBonuses(profile) { return commonGear.getBonuses(profile); },
    getSkillPercent(profile, skill) {
      if (skill === "royalGranaries") return Number(profile?.testRoyalGranariesPercent) || 0;
      if (skill === "taxStewardship") return Number(profile?.testTaxStewardshipPercent) || 0;
      return 0;
    },
    getMillionLordsPassiveGoldPerHour() { return 1_000; },
  };
  vm.createContext(productionContext);
  vm.runInContext([
    extractFunction(serverSource, "calculateGoldProductionRates"),
    extractFunction(serverSource, "calculateTroopProductionRates"),
    extractFunction(serverSource, "getCityProductionStats"),
    "this.getCityProductionStats = getCityProductionStats;",
  ].join("\n"), productionContext, { filename: "functions/index.js" });
  const mainProduction = productionContext.getCityProductionStats({ id: "main_city", level: 1 }, productionProfile, {}, { includeWarDrums: false, includeRoyalTaxDecree: false, nowMs: 1 });
  const otherProduction = productionContext.getCityProductionStats({ id: "other_city", level: 1 }, productionProfile, {}, { includeWarDrums: false, includeRoyalTaxDecree: false, nowMs: 1 });
  assert.equal(mainProduction.gearTroopProductionPercent, 0.25);
  assert.equal(otherProduction.gearTroopProductionPercent, 0.25);
  assert.equal(mainProduction.gearGoldProductionPercent, 0.75);
  assert.equal(otherProduction.gearGoldProductionPercent, 0.25);
  assertClose(mainProduction.troopProductionPerHour, mainProduction.baseTroopProductionPerHour * 1.0025);
  assertClose(mainProduction.goldProductionPerHour, mainProduction.baseGoldProductionPerHour * 1.0075);
  assertClose(otherProduction.goldProductionPerHour, otherProduction.baseGoldProductionPerHour * 1.0025);
  assertClose(mainProduction.troopProductionPerSecond * 3_600, mainProduction.troopProductionPerHour);
  assertClose(mainProduction.goldProductionPerSecond * 3_600, mainProduction.goldProductionPerHour);

  const combinedProductionProfile = {
    ...productionProfile,
    testRoyalGranariesPercent: 15,
    testTaxStewardshipPercent: 12,
    itemEffects: {
      warDrumsExpiresAtMs: 10_000,
      royalTaxDecreeExpiresAtMs: 10_000,
    },
  };
  const combinedMainProduction = productionContext.getCityProductionStats(
    { id: "main_city", level: 1 },
    combinedProductionProfile,
    { troopBonusPercent: 8, goldBonusPercent: 8 },
    { nowMs: 1 }
  );
  const combinedOtherProduction = productionContext.getCityProductionStats(
    { id: "other_city", level: 1 },
    combinedProductionProfile,
    { troopBonusPercent: 8, goldBonusPercent: 8 },
    { nowMs: 1 }
  );
  assertClose(
    combinedMainProduction.troopProductionPerHour,
    combinedMainProduction.baseTroopProductionPerHour * (1 + (15 + 0.25 + 8 + 30) / 100),
    "Royal Granaries, Barracks gear, objective support, and War Drums did not stack additively."
  );
  assertClose(
    combinedMainProduction.goldProductionPerHour,
    combinedMainProduction.baseGoldProductionPerHour * (1 + (12 + 0.75 + 8 + 50) / 100),
    "Tax Stewardship, both Treasury scopes, objective support, and Royal Tax did not stack additively in the main city."
  );
  assertClose(
    combinedOtherProduction.goldProductionPerHour,
    combinedOtherProduction.baseGoldProductionPerHour * (1 + (12 + 0.25 + 8 + 50) / 100),
    "A non-main city included Treasury main-city gear or lost an all-city source."
  );

  const maxProductionProfile = createGearProfile([
    ...["head", "chest", "pants", "boots", "gloves", "belt"].map(slot => equipped("barracks", slot, 5)),
    ...["head", "chest", "pants", "boots", "gloves", "belt", "weapon", "necklace"].map(slot => equipped("treasury", slot, 5)),
  ]);
  maxProductionProfile.mainCityId = "main_city";
  maxProductionProfile.testRoyalGranariesPercent = 75;
  maxProductionProfile.testTaxStewardshipPercent = 75;
  const maxMainProduction = productionContext.getCityProductionStats(
    { id: "main_city", level: 1 },
    maxProductionProfile,
    {},
    { includeWarDrums: false, includeRoyalTaxDecree: false, nowMs: 1 }
  );
  const maxOtherProduction = productionContext.getCityProductionStats(
    { id: "other_city", level: 1 },
    maxProductionProfile,
    {},
    { includeWarDrums: false, includeRoyalTaxDecree: false, nowMs: 1 }
  );
  assert.equal(maxMainProduction.gearTroopProductionPercent, 9);
  assert.equal(maxMainProduction.gearGoldProductionPercent, 12);
  assert.equal(maxOtherProduction.gearGoldProductionPercent, 1.5);
  assertClose(maxMainProduction.troopProductionPerHour, maxMainProduction.baseTroopProductionPerHour * 1.84, "Barracks gear was clamped by max Royal Granaries.");
  assertClose(maxMainProduction.goldProductionPerHour, maxMainProduction.baseGoldProductionPerHour * 1.87, "Treasury gear was clamped by max Tax Stewardship in the main city.");
  assertClose(maxOtherProduction.goldProductionPerHour, maxOtherProduction.baseGoldProductionPerHour * 1.765, "All-city Treasury gear was clamped by max Tax Stewardship.");

  const defenseProfile = createGearProfile([
    equipped("gatehouse", "weapon", 5),
    equipped("gatehouse", "head", 5),
  ]);
  const defenseContext = {
    DEFENSE_COMBAT_VERSION: 1,
    SIEGE_COMBAT_VERSION: 1,
    BASE_TROOP_DEFENSE_POWER: 1.3,
    REWARD_CAMP_TROOP_POWER: 1,
    CITY_LEVEL_STATS: { victoryPointsBase: 0, victoryPointsPerLevel: 0, victoryPointsExponent: 1, victoryPointsExponentScale: 0 },
    Math,
    Number,
    Date,
    Map,
    safeNumber,
    safeString,
    isStronghold() { return false; },
    isRewardCamp() { return false; },
    getStrongholdDefenseLevel() { return 1; },
    clampCityLevel(value) { return Math.max(1, Math.floor(Number(value) || 1)); },
    getBaseCityWalls() { return 1_000; },
    getCommonGearBonuses(profile) { return commonGear.getBonuses(profile); },
    getSkillPercent(profile, skill) {
      if (skill === "shieldwallDiscipline") return Number(profile?.testShieldwallPercent) || 0;
      if (skill === "stoneworks") return Number(profile?.testStoneworksPercent) || 0;
      return 0;
    },
    getSkillLevel(profile, skill) {
      return skill === "shieldwallDiscipline" ? Math.floor((Number(profile?.testShieldwallPercent) || 0) / 2) : 0;
    },
    getObjectiveTroopDefenseBonusPercent(value) { return Math.max(0, Number(value?.objectiveTroopDefenseBonusPercent) || 0); },
    usesSiegeCombat() { return true; },
    usesSoldierDefenseModel() { return true; },
    getTargetOwnerTroops(target) { return Math.max(0, Math.floor(Number(target?.troops) || 0)); },
    getFortificationSnapshot() { return null; },
    getOwnerUid(target) { return String(target?.ownerUid || ""); },
    getOwnerName(target) { return String(target?.ownerName || "Owner"); },
    normalizePlayerName(value, fallback = "Ruler") { return String(value || fallback); },
    calculateReinforcementFortificationDefense() { return { baseCityWalls: 0, cityWallSharePercent: 0, cityWallDefense: 0, stoneworksPercent: 0, stoneworksBonus: 0, totalDefense: 0 }; },
  };
  vm.createContext(defenseContext);
  vm.runInContext([
    extractFunction(serverSource, "usesSoldierDefenseModel"),
    extractFunction(serverSource, "getCityStats"),
    extractFunction(serverSource, "calculateDefenderArmyPackages"),
    "this.getCityStats = getCityStats;",
    "this.calculateDefenderArmyPackages = calculateDefenderArmyPackages;",
  ].join("\n"), defenseContext, { filename: "functions/index.js" });
  const defenseTarget = { ownerUid: "owner", ownerName: "Owner", level: 1, troops: 2_000 };
  const defensePackages = defenseContext.calculateDefenderArmyPackages({
    target: defenseTarget,
    ownerProfile: defenseProfile,
    contributions: [{ id: "reinforcement", ownerUid: "ally", ownerName: "Ally", troops: 2_000 }],
    contributorProfiles: new Map([["ally", {}]]),
    contributorStats: new Map([["ally", {}]]),
    siegeCombatVersion: 1,
    defenseCombatVersion: 1,
  });
  assert.equal(defensePackages.owner.gearDefenderStrengthPercent, 1.5);
  assert.equal(defensePackages.reinforcements[0].gearDefenderStrengthPercent, 1.5);
  assert.equal(defensePackages.owner.effectivePower, 2_639);
  assert.equal(defensePackages.reinforcements[0].effectivePower, 2_639);
  assert.equal(defensePackages.totalGarrisonDefense, 5_278);
  const noGearPackages = defenseContext.calculateDefenderArmyPackages({
    target: defenseTarget,
    ownerProfile: createGearProfile([]),
    contributions: [{ id: "reinforcement", ownerUid: "ally", ownerName: "Ally", troops: 2_000 }],
    contributorProfiles: new Map([["ally", {}]]),
    contributorStats: new Map([["ally", {}]]),
    siegeCombatVersion: 1,
    defenseCombatVersion: 1,
  });
  assert.equal(noGearPackages.totalGarrisonDefense, 5_200);

  const combinedDefenseProfile = {
    ...defenseProfile,
    testShieldwallPercent: 10,
    testStoneworksPercent: 15,
  };
  const combinedDefensePackages = defenseContext.calculateDefenderArmyPackages({
    target: defenseTarget,
    ownerProfile: combinedDefenseProfile,
    ownerBonuses: { objectiveTroopDefenseBonusPercent: 8, personalDefenseBonusPercent: 8 },
    contributions: [{ id: "reinforcement", ownerUid: "ally", ownerName: "Ally", troops: 2_000 }],
    contributorProfiles: new Map([["ally", { testShieldwallPercent: 20 }]]),
    contributorStats: new Map([["ally", {
      objectiveTroopDefenseBonusPercent: 4,
      personalObjectiveTroopDefenseBonusPercent: 4,
    }]]),
    siegeCombatVersion: 1,
    defenseCombatVersion: 1,
  });
  assert.equal(combinedDefensePackages.owner.effectivePower, 3_107, "Owner Shieldwall, objective support, and Gatehouse gear did not stack.");
  assert.equal(combinedDefensePackages.reinforcements[0].effectivePower, 3_263, "Allied Shieldwall, objective support, and destination-owner Gatehouse gear did not stack.");
  assert.equal(combinedDefensePackages.owner.cityWalls, 1_165, "Stoneworks and Gatehouse armor did not stack against base walls.");
  assert.equal(combinedDefensePackages.totalGarrisonDefense, 6_370);

  const maxDefenseProfile = createGearProfile([
    ...["head", "chest", "pants", "boots", "gloves", "belt"].map(slot => equipped("gatehouse", slot, 5)),
    equipped("gatehouse", "weapon", 5),
  ]);
  maxDefenseProfile.testShieldwallPercent = 60;
  maxDefenseProfile.testStoneworksPercent = 75;
  const maxDefensePackages = defenseContext.calculateDefenderArmyPackages({
    target: defenseTarget,
    ownerProfile: maxDefenseProfile,
    contributions: [{ id: "reinforcement", ownerUid: "ally", ownerName: "Ally", troops: 2_000 }],
    contributorProfiles: new Map([["ally", { testShieldwallPercent: 60 }]]),
    contributorStats: new Map([["ally", {}]]),
    siegeCombatVersion: 1,
    defenseCombatVersion: 1,
  });
  assert.equal(maxDefensePackages.owner.gearDefenderStrengthPercent, 1.5);
  assert.equal(maxDefensePackages.owner.effectivePower, 4_199, "Gatehouse defender gear was clamped by max Shieldwall Discipline.");
  assert.equal(maxDefensePackages.reinforcements[0].effectivePower, 4_199, "Owner Gatehouse gear did not stack above max allied Shieldwall.");
  assert.equal(maxDefensePackages.totalGarrisonDefense, 8_398);
  assert.equal(maxDefensePackages.owner.cityWalls, 1_840, "Gatehouse wall gear was clamped by max Stoneworks.");

  let activeClientStatsProfile = defenseProfile;
  let activeClientSkillPercents = {};
  const clientStatsContext = {
    DEFENSE_COMBAT_VERSION: 1,
    BASE_TROOP_DEFENSE_POWER: 1.3,
    REWARD_CAMP_TROOP_POWER: 1,
    CITY_LEVEL_STATS: { victoryPointsBase: 100, victoryPointsPerLevel: 0, victoryPointsExponent: 1, victoryPointsExponentScale: 0, troopProductionPerVictoryPoint: 10 },
    ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT: 50,
    state: { mainCityId: "main_city" },
    Date,
    Math,
    Number,
    isStronghold() { return false; },
    isRewardCampTarget() { return false; },
    getStrongholdDefenseLevel() { return 1; },
    clampCityLevel(value) { return Math.max(1, Math.floor(Number(value) || 1)); },
    supportsDefenseCombat() { return true; },
    getBaseCityWalls() { return 1_000; },
    getCommonGearBonuses() { return commonGear.getBonuses(activeClientStatsProfile); },
    getSkillPercent(skill) { return Math.max(0, Number(activeClientSkillPercents[skill]) || 0); },
    getSkillLevel(skill) {
      const perLevel = ["stoneworks", "taxStewardship", "royalGranaries"].includes(skill) ? 3 : 2;
      return Math.floor((Number(activeClientSkillPercents[skill]) || 0) / perLevel);
    },
    getControlledStrongholdGoldBonusPercent() { return 0; },
    getControlledStrongholdTroopBonusPercent() { return 0; },
    getControlledObjectiveBonusBreakdown() {
      return { totalPercent: 0, personalPercent: 0, sharedPercent: 0, otherPercent: 0, source: "" };
    },
    getControlledObjectiveTroopDefenseBonusPercentForCity() { return 0; },
    getWarDrumsTroopProductionBonusPercent() { return 0; },
    getActiveRoyalTaxDecreeExpiresAtMs() { return 0; },
    getMillionLordsCityProductionVp() { return 0; },
    getMillionLordsPassiveGoldPerHour() { return 1_000; },
  };
  vm.createContext(clientStatsContext);
  vm.runInContext([
    extractFunction(clientSource, "calculateGoldProductionRates"),
    extractFunction(clientSource, "calculateTroopProductionRates"),
    extractFunction(clientSource, "getCityStats"),
    "this.getCityStats = getCityStats;",
  ].join("\n"), clientStatsContext, { filename: "game.js" });
  activeClientStatsProfile = productionProfile;
  const clientMainProduction = clientStatsContext.getCityStats({ id: "main_city", owner: "player", level: 1, troops: 0 });
  const clientOtherProduction = clientStatsContext.getCityStats({ id: "other_city", owner: "player", level: 1, troops: 0 });
  assertClose(clientMainProduction.troopProductionPerHour, mainProduction.troopProductionPerHour, "Main-city troop preview/server drift");
  assertClose(clientMainProduction.goldProductionPerHour, mainProduction.goldProductionPerHour, "Main-city gold preview/server drift");
  assertClose(clientOtherProduction.goldProductionPerHour, otherProduction.goldProductionPerHour, "Other-city gold preview/server drift");
  activeClientStatsProfile = defenseProfile;
  const clientDefense = clientStatsContext.getCityStats({ id: "defended", owner: "player", level: 1, troops: 2_000, alliedReinforcementTroops: 2_000 });
  assert.equal(clientDefense.troopDefense, defensePackages.totalGarrisonDefense, "Client defense preview does not match the authoritative owner-gear rule.");
  assert.equal(clientDefense.cityWalls, 1_015, "Gatehouse armor did not increase owned-city wall strength.");
  activeClientStatsProfile = createGearProfile([]);
  const clientNoGearDefense = clientStatsContext.getCityStats({ id: "defended", owner: "player", level: 1, troops: 2_000, alliedReinforcementTroops: 2_000 });
  assert.equal(clientNoGearDefense.troopDefense, noGearPackages.totalGarrisonDefense);
  activeClientStatsProfile = defenseProfile;
  const enemyDestination = clientStatsContext.getCityStats({ id: "enemy", owner: "enemy", level: 1, troops: 2_000, alliedReinforcementTroops: 2_000 });
  assert.equal(enemyDestination.gearDefenderStrengthPercent, 0, "The local ruler's Gatehouse gear affected an enemy destination.");
  activeClientStatsProfile = maxProductionProfile;
  activeClientSkillPercents = { royalGranaries: 75, taxStewardship: 75 };
  const clientMaxMainProduction = clientStatsContext.getCityStats({ id: "main_city", owner: "player", level: 1, troops: 0 });
  const clientMaxOtherProduction = clientStatsContext.getCityStats({ id: "other_city", owner: "player", level: 1, troops: 0 });
  assertClose(clientMaxMainProduction.troopProductionPerHour, maxMainProduction.troopProductionPerHour, "Max Royal Granaries + gear client/server drift");
  assertClose(clientMaxMainProduction.goldProductionPerHour, maxMainProduction.goldProductionPerHour, "Max Tax Stewardship + main-city gear client/server drift");
  assertClose(clientMaxOtherProduction.goldProductionPerHour, maxOtherProduction.goldProductionPerHour, "Max Tax Stewardship + all-city gear client/server drift");
  activeClientStatsProfile = maxDefenseProfile;
  activeClientSkillPercents = { shieldwallDiscipline: 60, stoneworks: 75 };
  const clientMaxDefense = clientStatsContext.getCityStats({ id: "defended", owner: "player", level: 1, troops: 2_000, alliedReinforcementTroops: 2_000 });
  assert.equal(clientMaxDefense.troopDefense, maxDefensePackages.totalGarrisonDefense, "Max Shieldwall + Gatehouse gear client/server drift");
  assert.equal(clientMaxDefense.cityWalls, maxDefensePackages.owner.cityWalls, "Max Stoneworks + Gatehouse gear client/server drift");

  const wallBreakdownContext = {
    Math,
    Number,
    safeNumber,
    clampInt(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, Math.floor(Number(value) || 0)));
    },
  };
  vm.createContext(wallBreakdownContext);
  vm.runInContext([
    extractFunction(serverSource, "splitBattleObjectiveBonusPower"),
    extractFunction(serverSource, "createBattleWallPowerBreakdown"),
    "this.createBattleWallPowerBreakdown = createBattleWallPowerBreakdown;",
  ].join("\n"), wallBreakdownContext, { filename: "functions/index.js" });
  const wallBreakdown = wallBreakdownContext.createBattleWallPowerBreakdown(
    { startingWallPower: 1_015, startingIntegrityBps: 10_000 },
    { fortifications: { baseCityWalls: 1_000, cityWalls: 1_015, stoneworksPercent: 0, gearWallStrengthPercent: 1.5 } },
    { personalDefenseBonusPercent: 0, sharedDefenseBonusPercent: 0 }
  );
  assert.equal(wallBreakdown.baseWallPower, 1_000);
  assert.equal(wallBreakdown.stoneworksWallBonusPower, 0);
  assert.equal(wallBreakdown.gearWallStrengthBonusPower, 15);
  assert.equal(wallBreakdown.personalObjectiveBonusPower, 0, "Wall rounding was mislabeled as an objective bonus.");
  assert.equal(wallBreakdown.totalWallPower, 1_015);

  const attackContext = {
    BASE_TROOP_ATTACK_POWER: 1.25,
    getCommonGearBonuses(profile) { return commonGear.getBonuses(profile); },
    skillMultiplier(profile) { return 1 + (Number(profile?.testSwordmasteryPercent) || 0) / 100; },
  };
  vm.createContext(attackContext);
  vm.runInContext(`${extractFunction(serverSource, "getAttackPower")}; this.getAttackPower = getAttackPower;`, attackContext, { filename: "functions/index.js" });
  const attackGearProfile = createGearProfile([equipped("barracks", "weapon", 5)]);
  assert.equal(attackContext.getAttackPower(1_000, createGearProfile([])), 1_250);
  assertClose(attackContext.getAttackPower(1_000, attackGearProfile), 1_268.75);
  const combinedAttackProfile = { ...attackGearProfile, testSwordmasteryPercent: 60 };
  assertClose(
    attackContext.getAttackPower(1_000, combinedAttackProfile),
    1_000 * 1.25 * (1 + (60 + 1.5) / 100),
    "Swordmastery and Barracks weapon gear did not stack additively."
  );
  const clientAttackContext = {
    BASE_TROOP_ATTACK_POWER: 1.25,
    getCommonGearBonuses() { return commonGear.getBonuses(combinedAttackProfile); },
    skillMultiplier() { return 1.6; },
  };
  vm.createContext(clientAttackContext);
  vm.runInContext(`${extractFunction(clientSource, "getAttackPower")}; this.getAttackPower = getAttackPower;`, clientAttackContext, { filename: "game.js" });
  assertClose(
    clientAttackContext.getAttackPower(1_000, "player"),
    attackContext.getAttackPower(1_000, combinedAttackProfile),
    "Max Swordmastery + attack gear client/server drift"
  );

  let casualtySkillPercent = 50;
  const capContext = {
    COMMON_GEAR: commonGear,
    getSkillPercent() { return casualtySkillPercent; },
    getCommonGearBonuses() { return { casualtyEfficiency: 1.5 }; },
  };
  vm.createContext(capContext);
  vm.runInContext(`${extractFunction(serverSource, "getCasualtyRecoveryPercent")}; this.getCasualtyRecoveryPercent = getCasualtyRecoveryPercent;`, capContext, { filename: "functions/index.js" });
  assert.equal(capContext.getCasualtyRecoveryPercent({}), 51.5, "Barracks casualty gear did not stack above max Field Medics.");
  casualtySkillPercent = 74;
  assert.equal(capContext.getCasualtyRecoveryPercent({}), 75, "Field Medics plus gear exceeded the 75% casualty cap.");

  const casualtySnapshotContext = {
    BASE_TROOP_ATTACK_POWER: 1.25,
    RALLY_PARTICIPANT_INBOUND: "inbound",
    Date,
    Math,
    Number,
    safeNumber,
    normalizeRallyParticipant(value) { return { ...value }; },
    normalizePlayerName(value, fallback = "Ruler") { return String(value || fallback); },
    normalizeRegionId(value) { return String(value || ""); },
    getSkillLevel() { return 0; },
    getSkillPercent(profile, skill) { return skill === "fieldMedics" ? Number(profile?.fieldMedicsPercent) || 0 : 0; },
    skillMultiplier() { return 1; },
    getCommonGearBonuses(profile) { return commonGear.getBonuses(profile); },
    getCasualtyRecoveryPercent(profile) {
      return Math.min(75, (Number(profile?.fieldMedicsPercent) || 0) + commonGear.getBonuses(profile).casualtyEfficiency);
    },
  };
  vm.createContext(casualtySnapshotContext);
  vm.runInContext(`${extractFunction(serverSource, "createRallyParticipantSnapshot")}; this.createRallyParticipantSnapshot = createRallyParticipantSnapshot;`, casualtySnapshotContext, { filename: "functions/index.js" });
  const casualtyProfileAtCommit = createGearProfile([equipped("barracks", "necklace", 1)]);
  casualtyProfileAtCommit.fieldMedicsPercent = 10;
  const rallyCasualtySnapshot = casualtySnapshotContext.createRallyParticipantSnapshot({
    uid: "ally",
    profile: casualtyProfileAtCommit,
    source: { id: "source", name: "Source" },
    troops: 100,
  });
  assert.equal(rallyCasualtySnapshot.fieldMedicsPercent, 10.25, "Rally casualty recovery was not snapshotted at commitment.");
  const laterCasualtyProfile = createGearProfile([equipped("barracks", "necklace", 2)]);
  laterCasualtyProfile.fieldMedicsPercent = 20;
  assert.equal(casualtySnapshotContext.getCasualtyRecoveryPercent(laterCasualtyProfile), 20.5);
  assert.equal(rallyCasualtySnapshot.fieldMedicsPercent, 10.25, "A committed rally's casualty snapshot changed with later gear.");

  const citySourceContext = {
    formatNumber: value => String(Math.floor(Number(value) || 0)),
    getObjectiveTroopDefenseBonusPercent: stats => Math.max(0, Number(stats?.objectiveTroopDefenseBonusPercent) || 0),
    getControlledObjectiveBonusBreakdown() {
      return { totalPercent: 0, personalPercent: 0, sharedPercent: 0, otherPercent: 0 };
    },
    getControlledCrownCitadel() { return null; },
  };
  vm.createContext(citySourceContext);
  vm.runInContext(`${extractFunction(clientSource, "getCityStatBonusSources")}; this.getCityStatBonusSources = getCityStatBonusSources;`, citySourceContext, { filename: "game.js" });
  assert.match(citySourceContext.getCityStatBonusSources({ gearTroopProductionPercent: 0.25 }, "troops"), /Barracks gear \+0\.25%/);
  assert.match(citySourceContext.getCityStatBonusSources({ gearGoldProductionMainCityPercent: 0.5, gearGoldProductionAllCitiesPercent: 0.25 }, "gold"), /Treasury main-city gear \+0\.5%[\s\S]*Treasury all-city gear \+0\.25%/);
  assert.match(citySourceContext.getCityStatBonusSources({ gearWallStrengthPercent: 1.5 }, "walls"), /Gatehouse gear \+1\.5%/);
  assert.match(citySourceContext.getCityStatBonusSources({ shieldwallDisciplinePercent: 20, objectiveTroopDefenseBonusPercent: 8, gearDefenderStrengthPercent: 0.8 }, "defense"), /Shieldwall Discipline \+20%[\s\S]*Objective soldier defense \+8%[\s\S]*Gatehouse gear \+0\.8%/);
  assert.match(citySourceContext.getCityStatBonusSources({ stoneworksPercent: 75, gearWallStrengthPercent: 9 }, "walls"), /Stoneworks \+75%[\s\S]*Gatehouse gear \+9%/);
  assert.match(citySourceContext.getCityStatBonusSources({ shieldwallDisciplinePercent: 60, gearDefenderStrengthPercent: 1.5 }, "defense"), /Shieldwall Discipline \+60%[\s\S]*Gatehouse gear \+1\.5%/);
  assert.match(citySourceContext.getCityStatBonusSources({ royalGranariesPercent: 75, gearTroopProductionPercent: 9 }, "troops"), /Royal Granaries \+75%[\s\S]*Barracks gear \+9%/);
  assert.match(citySourceContext.getCityStatBonusSources({ taxStewardshipPercent: 75, gearGoldProductionMainCityPercent: 10.5, gearGoldProductionAllCitiesPercent: 1.5 }, "gold"), /Tax Stewardship \+75%[\s\S]*Treasury main-city gear \+10\.5%[\s\S]*Treasury all-city gear \+1\.5%/);
  assert.match(clientUiSource, /Attack sources: Swordmastery[\s\S]*?War Captain gear/);
  assert.match(clientUiSource, /March Orders[\s\S]*?Royal Stables gear[\s\S]*?combined speed/);
  assert.match(clientSource, /Casualty recovery[\s\S]*?Field Medics \+ Barracks gear[\s\S]*?75% combined cap[\s\S]*?main city/);

  assert.match(commonGear.getDefinition(gearKeys["gatehouse:necklace"]).statLabel, /new wall damage/i);
  assert.match(commonGear.getDefinition(gearKeys["barracks:necklace"]).statLabel, /Field Medics.*75% combined cap.*main city/i);

  console.log("Validated equipped-only gear aggregation, immediate upgrade/unequip effects, movement and rally ETA parity, scoped production, owner-wide allied defense, attribution, and casualty caps.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
