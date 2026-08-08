const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8");
const constantNames = [
  "KING_POWER_ARMY_TROOP_VALUE",
  "KING_POWER_REPLACEMENT_HOURS",
  "KING_POWER_DEFENSIVE_ADVANTAGE_WEIGHT",
];

function readConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  if (!match) throw new Error(`Missing ${name}.`);
  return Number(match[1]);
}

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

const config = Object.fromEntries(constantNames.map(name => {
  const serverValue = readConstant(serverSource, name);
  const clientValue = readConstant(clientSource, name);
  if (serverValue !== clientValue) {
    throw new Error(`${name} differs between server (${serverValue}) and client (${clientValue}).`);
  }
  return [name, serverValue];
}));

const serverVersion = readConstant(serverSource, "GLOBAL_PLAYER_STATS_VERSION");
const clientVersion = readConstant(clientSource, "KING_POWER_AUTHORITY_VERSION");
if (serverVersion !== clientVersion || serverVersion !== 11) {
  throw new Error(`King Power authority versions differ or are stale (server ${serverVersion}, client ${clientVersion}).`);
}

const legacyConstants = [
  "KING_POWER_TERRITORY_PER_CITY",
  "KING_POWER_GOLD_PRODUCTION_SQRT_MULTIPLIER",
  "KING_POWER_STRONGHOLD_BASE",
  "KING_POWER_TROOP_EXPONENT",
];
legacyConstants.forEach(name => {
  if (serverSource.includes(name) || clientSource.includes(name)) {
    throw new Error(`Legacy King Power input ${name} is still active.`);
  }
});

const militaryFormula = serverSource.slice(
  serverSource.indexOf("function getTroopKingPower"),
  serverSource.indexOf("function playerGlobalStatsRef")
);
if (!militaryFormula.includes("getCityProductionStats(city, {}, bonuses")) {
  throw new Error("King Power replacement capacity is not skill-neutral.");
}
if (!militaryFormula.includes("getCityStats(city, null, bonuses)")) {
  throw new Error("King Power defense is not skill-neutral.");
}
if (/gold|taxStewardship|royalGranaries|stoneworks|warDrumsExpiresAtMs/i.test(militaryFormula)) {
  throw new Error("A skill, item, or gold input leaked into the King Power formula.");
}
if (!serverSource.includes('where("holderUid", "=="')) {
  throw new Error("Held reward camps are not queried for King Power.");
}
if (!serverSource.includes("heldCamps: economy.heldCamps")) {
  throw new Error("Prepared economy snapshots omit held reward camps.");
}
if (!serverSource.includes('if (targetType === "camp")')) {
  throw new Error("Camp ownership changes do not rebuild holder King Power.");
}
if (!indexSource.includes('"fieldPath": "holderUid"')) {
  throw new Error("The camps.holderUid collection-group index is missing.");
}
if (!serverSource.includes("if (ownsCrownCitadel)")) {
  throw new Error("Crown Citadel non-stacking behavior is missing.");
}
const strongholdBonusFormula = serverSource.slice(
  serverSource.indexOf("function getOwnedStrongholdBonuses"),
  serverSource.indexOf("function getCityUpgradePrestigeMultiplier")
);
if (!strongholdBonusFormula.includes('source: "crown_citadel"')
  || !strongholdBonusFormula.includes("crownCitadelControlled: true")
  || strongholdBonusFormula.indexOf("if (ownsCrownCitadel)") > strongholdBonusFormula.indexOf("return cities.reduce")) {
  throw new Error("Crown Citadel must exclusively replace individual Stronghold bonuses.");
}
if (!serverSource.includes("strongholdBonusesAuthoritative: true")
  || !clientSource.includes("getAuthoritativePlayerStrongholdBonuses")
  || !clientSource.includes("globalStats?.strongholdBonusesAuthoritative")) {
  throw new Error("The client is not consuming the server-authoritative all-map Stronghold bonus snapshot.");
}
if (!serverSource.includes("isTrainingStronghold(city)") || !serverSource.includes("isDefenseStronghold(city)")) {
  throw new Error("Military stronghold bonuses are missing.");
}

const strongholdContext = {
  CROWN_CITADEL_GOLD_BONUS_PERCENT: readConstant(serverSource, "CROWN_CITADEL_GOLD_BONUS_PERCENT"),
  CROWN_CITADEL_TROOP_BONUS_PERCENT: readConstant(serverSource, "CROWN_CITADEL_TROOP_BONUS_PERCENT"),
  CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT: readConstant(serverSource, "CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT"),
  CROWN_CITADEL_DEFENSE_BONUS_PERCENT: readConstant(serverSource, "CROWN_CITADEL_DEFENSE_BONUS_PERCENT"),
  CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT: readConstant(serverSource, "CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT"),
  isCrownCitadel: city => city?.type === "crown",
  isGoldStronghold: city => city?.type === "gold",
  isTrainingStronghold: city => city?.type === "training",
  isSpeedStronghold: city => city?.type === "speed",
  isDefenseStronghold: city => city?.type === "defense",
  getStrongholdBonusPercent: city => Number(city?.bonusPercent) || 0,
};
vm.createContext(strongholdContext);
vm.runInContext(
  extractFunction(serverSource, "getOwnedStrongholdBonuses"),
  strongholdContext,
  { filename: path.join(root, "functions", "index.js") }
);
const citadelBonuses = strongholdContext.getOwnedStrongholdBonuses([
  { city: { type: "crown" } },
  { city: { type: "gold", bonusPercent: 8 } },
  { city: { type: "training", bonusPercent: 8 } },
  { city: { type: "speed", bonusPercent: 8 } },
  { city: { type: "defense", bonusPercent: 8 } },
]);
assert.equal(citadelBonuses.source, "crown_citadel");
assert.equal(citadelBonuses.crownCitadelControlled, true);
assert.equal(citadelBonuses.goldBonusPercent, strongholdContext.CROWN_CITADEL_GOLD_BONUS_PERCENT);
assert.equal(citadelBonuses.troopBonusPercent, strongholdContext.CROWN_CITADEL_TROOP_BONUS_PERCENT);
assert.equal(citadelBonuses.marchSpeedBonusPercent, strongholdContext.CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT);
assert.equal(citadelBonuses.cityDefenseBonusPercent, strongholdContext.CROWN_CITADEL_DEFENSE_BONUS_PERCENT);
assert.equal(citadelBonuses.upgradeCostReductionPercent, strongholdContext.CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT);
const individualBonuses = strongholdContext.getOwnedStrongholdBonuses([
  { city: { type: "gold", bonusPercent: 8 } },
  { city: { type: "training", bonusPercent: 8 } },
  { city: { type: "speed", bonusPercent: 8 } },
  { city: { type: "defense", bonusPercent: 8 } },
]);
assert.equal(individualBonuses.source, "individual");
assert.equal(individualBonuses.crownCitadelControlled, false);
assert.equal(individualBonuses.goldBonusPercent, 8);
assert.equal(individualBonuses.troopBonusPercent, 8);
assert.equal(individualBonuses.marchSpeedBonusPercent, 8);
assert.equal(individualBonuses.cityDefenseBonusPercent, 8);

function cityMilitaryComponents(level, troops, bonuses = {}) {
  const victoryPoints = Math.floor(6 + level * 4 + Math.pow(level, 1.35) * 2);
  const sustainableTroopPerHour = victoryPoints * 3 * (1 + (bonuses.troop || 0) / 100);
  const replacementPower = Math.floor(sustainableTroopPerHour * config.KING_POWER_REPLACEMENT_HOURS);
  const levelOffset = level - 1;
  const walls = 200 + 28858 * levelOffset;
  const troopDefense = Math.floor(troops * 1.30 * (1 + (bonuses.defense || 0) / 100));
  const totalDefense = walls + troopDefense;
  const defensivePower = Math.floor(
    Math.max(0, totalDefense - troops) * config.KING_POWER_DEFENSIVE_ADVANTAGE_WEIGHT
  );
  return { replacementPower, defensivePower };
}

function kingdomPower(cities, marchingTroops = 0, campTroops = 0) {
  const stationedTroops = cities.reduce((total, city) => total + city.troops, campTroops);
  const armyPower = Math.floor(
    (stationedTroops + marchingTroops) * config.KING_POWER_ARMY_TROOP_VALUE
  );
  const components = cities.map(city => cityMilitaryComponents(city.level, city.troops, city.bonuses));
  return {
    armyPower,
    replacementPower: components.reduce((total, item) => total + item.replacementPower, 0),
    defensivePower: components.reduce((total, item) => total + item.defensivePower, 0),
    total: armyPower
      + components.reduce((total, item) => total + item.replacementPower + item.defensivePower, 0),
  };
}

const concentratedArmy = kingdomPower([{ level: 100, troops: 10_000_000 }]);
const broadKingdom = kingdomPower(Array.from({ length: 10 }, () => ({ level: 75, troops: 100_000 })));
if (concentratedArmy.total <= broadKingdom.total) {
  throw new Error("A 10M military can still rank below a broadly developed 1M military kingdom.");
}
if (kingdomPower([{ level: 50, troops: 2_000_000 }]).total <= kingdomPower([{ level: 50, troops: 1_000_000 }]).total) {
  throw new Error("Additional controlled troops must always increase King Power.");
}
const campPower = kingdomPower([{ level: 30, troops: 100_000 }], 0, 50_000);
const noCampPower = kingdomPower([{ level: 30, troops: 100_000 }]);
if (campPower.armyPower - noCampPower.armyPower !== 50_000 * config.KING_POWER_ARMY_TROOP_VALUE) {
  throw new Error("Camp garrisons are not counted exactly once as controlled troops.");
}
const transferBefore = kingdomPower([
  { level: 50, troops: 100_000 },
  { level: 50, troops: 25_000 },
]);
const transferMarching = kingdomPower([
  { level: 50, troops: 80_000 },
  { level: 50, troops: 25_000 },
], 20_000);
const transferArrived = kingdomPower([
  { level: 50, troops: 80_000 },
  { level: 50, troops: 45_000 },
]);
if (transferBefore.armyPower !== transferMarching.armyPower
  || transferMarching.armyPower !== transferArrived.armyPower) {
  throw new Error("Troop King Power changes while an owned-city transfer is marching or arriving.");
}
if (!serverSource.includes("addActiveArmies: [movement]")
  || !serverSource.includes("excludeArmyIds: [armyId]")
  || !serverSource.includes("statsCityPatches: [{ ref: targetRef, city: target, patch: targetTroopPatch }]")) {
  throw new Error("Transfer launch and arrival do not atomically move troops between garrisons and active armies.");
}
const base = cityMilitaryComponents(75, 1_000_000);
const training = cityMilitaryComponents(75, 1_000_000, { troop: 15 });
const defense = cityMilitaryComponents(75, 1_000_000, { defense: 15 });
const crown = cityMilitaryComponents(75, 1_000_000, { troop: 10, defense: 8 });
if (training.replacementPower <= base.replacementPower || training.defensivePower !== base.defensivePower) {
  throw new Error("Training Stronghold must affect replacement capacity only.");
}
if (defense.defensivePower <= base.defensivePower || defense.replacementPower !== base.replacementPower) {
  throw new Error("Defense Stronghold must affect defense only.");
}
if (crown.replacementPower <= base.replacementPower || crown.defensivePower <= base.defensivePower) {
  throw new Error("Crown Citadel must affect both military components.");
}

console.log(
  `Validated King Power v${serverVersion}: 1x L100 + 10M troops = ${concentratedArmy.total.toLocaleString()}, `
    + `10x L75 + 1M troops = ${broadKingdom.total.toLocaleString()}.`
);
