const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("functions/index.js");
const client = read("game.js");
const styles = `${read("styles.css")}\n${read("interface-theme.css")}`;
const firebaseClient = read("firebaseClient.js");
const rules = read("firestore.rules");
const packageJson = JSON.parse(read("functions/package.json"));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parameterStart = source.indexOf("(", start);
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
  assert.ok(parameterEnd >= 0, `Could not parse ${name} parameters.`);
  const bodyStart = source.indexOf("{", parameterEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function requires(source, pattern, message) {
  assert.match(source, pattern, message);
}

const benefitContext = {
  RESET_GENERATION: "test-reset",
  CROWN_CITADEL_ID: "crown-citadel",
  CLAN_SHARED_OBJECTIVE_MULTIPLIER: 0.5,
  CROWN_CITADEL_GOLD_BONUS_PERCENT: 10,
  CROWN_CITADEL_TROOP_BONUS_PERCENT: 10,
  CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT: 10,
  CROWN_CITADEL_DEFENSE_BONUS_PERCENT: 10,
  CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT: 10,
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  safeString: (value, maxLength = 256) => String(value || "").slice(0, maxLength),
  isStronghold: city => ["crown", "gold", "training", "speed", "defense"].includes(city?.type),
  isCrownCitadel: city => city?.type === "crown" || city?.strongholdType === "crown_citadel",
  isGoldStronghold: city => city?.type === "gold",
  isTrainingStronghold: city => city?.type === "training",
  isSpeedStronghold: city => city?.type === "speed",
  isDefenseStronghold: city => city?.type === "defense",
  getStrongholdBonusPercent: city => Number(city?.bonusPercent) || 0,
};
vm.createContext(benefitContext);
[
  "emptyObjectiveBonuses",
  "normalizeObjectiveBonuses",
  "addObjectiveBonuses",
  "subtractObjectiveBonuses",
  "scaleObjectiveBonuses",
  "objectiveBonusForCity",
  "getOwnedStrongholdBonuses",
  "buildClanSharedObjectiveBonuses",
  "combinePlayerObjectiveBonuses",
].forEach(name => {
  vm.runInContext(extractFunction(server, name), benefitContext, { filename: "functions/index.js" });
});

const goldObjective = { id: "gold", type: "gold", bonusPercent: 8, ownerUid: "gold-holder" };
const trainingObjective = { id: "training", type: "training", bonusPercent: 8, ownerUid: "trainer" };
const citadelObjective = { id: "crown-citadel", type: "crown", ownerUid: "citadel-holder" };

const ordinaryShared = benefitContext.buildClanSharedObjectiveBonuses([goldObjective, trainingObjective]);
const ordinaryBenefits = {
  resetGeneration: benefitContext.RESET_GENERATION,
  revision: 1,
  ...ordinaryShared,
};
const goldHolder = benefitContext.combinePlayerObjectiveBonuses("gold-holder", [goldObjective], ordinaryBenefits);
assert.equal(goldHolder.goldBonusPercent, 8, "A Stronghold holder must keep the full 8% personal bonus.");
assert.equal(goldHolder.troopBonusPercent, 4, "A Stronghold holder must receive other shared objectives.");
assert.equal(goldHolder.personalGoldBonusPercent, 8);
assert.equal(goldHolder.sharedGoldBonusPercent, 0, "A holder must not receive their own Stronghold twice.");
const ordinaryMember = benefitContext.combinePlayerObjectiveBonuses("member", [], ordinaryBenefits);
assert.equal(ordinaryMember.goldBonusPercent, 4);
assert.equal(ordinaryMember.troopBonusPercent, 4);

const citadelShared = benefitContext.buildClanSharedObjectiveBonuses([
  citadelObjective,
  goldObjective,
  trainingObjective,
]);
const citadelBenefits = {
  resetGeneration: benefitContext.RESET_GENERATION,
  revision: 2,
  ...citadelShared,
};
const citadelHolder = benefitContext.combinePlayerObjectiveBonuses(
  "citadel-holder",
  [citadelObjective, { ...goldObjective, ownerUid: "citadel-holder" }],
  citadelBenefits
);
assert.equal(citadelHolder.goldBonusPercent, 14, "Citadel + personally held Gold Stronghold must total 14% gold.");
assert.equal(citadelHolder.troopBonusPercent, 10);
assert.equal(citadelHolder.sharedGoldBonusPercent, 0);
const differentStrongholdHolder = benefitContext.combinePlayerObjectiveBonuses(
  "gold-holder",
  [goldObjective],
  citadelBenefits
);
assert.equal(differentStrongholdHolder.goldBonusPercent, 13, "A different Stronghold holder must keep 8% plus shared Citadel 5%.");
assert.equal(differentStrongholdHolder.troopBonusPercent, 5);
const citadelClanmate = benefitContext.combinePlayerObjectiveBonuses("member", [], citadelBenefits);
assert.equal(citadelClanmate.goldBonusPercent, 5);
assert.equal(citadelClanmate.troopBonusPercent, 5);
assert.equal(citadelClanmate.marchSpeedBonusPercent, 5);
assert.equal(citadelClanmate.cityDefenseBonusPercent, 5);
assert.equal(citadelClanmate.upgradeCostReductionPercent, 5);

const defenseContext = {
  Map,
  Date,
  SIEGE_COMBAT_VERSION: 1,
  DEFENSE_COMBAT_VERSION: 1,
  BASE_TROOP_DEFENSE_POWER: 1.3,
  REINFORCEMENT_CITY_WALL_SHARE: 0.25,
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  safeString: (value, maxLength = 256) => String(value || "").slice(0, maxLength),
  normalizePlayerName: value => String(value || "Ruler").slice(0, 18),
  getOwnerUid: target => String(target?.ownerUid || ""),
  getOwnerName: target => String(target?.ownerName || ""),
  getTargetOwnerTroops: target => Math.max(0, Math.floor(Number(target?.troops) || 0)),
  getSkillLevel: (profile, skill) => skill === "shieldwallDiscipline" ? Math.max(0, Number(profile?.shieldwallLevel) || 0) : 0,
  getSkillPercent: (profile, skill) => skill === "stoneworks"
    ? Math.max(0, Number(profile?.stoneworksPercent) || 0)
    : skill === "shieldwallDiscipline"
      ? Math.max(0, Number(profile?.shieldwallPercent) || 0)
      : 0,
  getObjectiveTroopDefenseBonusPercent(value = {}) {
    return Math.max(0, Number(
      value.objectiveTroopDefenseBonusPercent
      ?? value.strongholdDefenseBonusPercent
      ?? value.cityDefenseBonusPercent
    ) || 0);
  },
  usesSiegeCombat: (version, targetType) => targetType !== "camp" && Number(version) >= 1,
  usesSoldierDefenseModel: (version, target) => target?.type !== "camp" && Number(version) >= 1,
  getFortificationSnapshot(target, stats) {
    return {
      modelVersion: 1,
      fullWallPower: 363,
      currentWallPower: 363,
      integrityBps: 10_000,
      repairAtMs: 0,
    };
  },
  getCityStats(target, profile, bonuses, options = {}) {
    assert.equal(target.alliedReinforcementTroops, 0, "The holder package included allied troops.");
    assert.equal(target.troops, 500);
    assert.equal(profile.playerName, "Holder");
    assert.equal(bonuses.cityDefenseBonusPercent, 10);
    const modern = Number(options.defenseCombatVersion) >= 1;
    return {
      totalDefense: modern ? 1_208 : 1_100,
      strongholdDefenseBonus: 100,
      strongholdDefenseBonusPercent: 10,
      defensePercent: modern ? 0 : 40,
      baseCityWalls: 300,
      cityWalls: 330,
      stoneworksPercent: 10,
      baseTroopDefense: modern ? 650 : 500,
      troopDefense: modern ? 845 : 670,
      shieldwallDisciplineLevel: modern ? 10 : 0,
      shieldwallDisciplinePercent: modern ? 20 : 0,
    };
  },
};
vm.createContext(defenseContext);
vm.runInContext(extractFunction(server, "calculateReinforcementFortificationDefense"), defenseContext, {
  filename: "functions/index.js",
});
vm.runInContext(extractFunction(server, "calculateDefenderArmyPackages"), defenseContext, {
  filename: "functions/index.js",
});
const packages = defenseContext.calculateDefenderArmyPackages({
  target: { ownerUid: "holder", ownerName: "Holder", troops: 500 },
  ownerProfile: { playerName: "Holder", flag: { symbol: "lion" } },
  ownerBonuses: { cityDefenseBonusPercent: 10 },
  contributions: [{ id: "r1", ownerUid: "ally", ownerName: "Ally", troops: 100 }],
  contributorProfiles: new Map([["ally", { playerName: "Ally", flag: { symbol: "castle" }, stoneworksPercent: 25 }]]),
  contributorStats: new Map([["ally", {
    strongholdDefenseBonusPercent: 5,
    personalStrongholdDefenseBonusPercent: 0,
    sharedClanDefenseBonusPercent: 5,
  }]]),
});
assert.equal(packages.owner.effectivePower, 1_100);
assert.equal(packages.reinforcements[0].cityWallDefense, 75, "Reinforcements must receive one quarter of the destination's 300 base walls.");
assert.equal(packages.reinforcements[0].stoneworksBonus, 75, "A contributor's full 25% Stoneworks bonus must use all 300 base walls.");
assert.equal(packages.reinforcements[0].fortificationPower, 150);
assert.equal(packages.reinforcements[0].basePower, 250, "Reinforcement base power must include troops, quarter walls, and full Stoneworks.");
assert.equal(packages.reinforcements[0].effectivePower, 262, "A reinforcement's 5% objective bonus must apply to its complete defense package.");
assert.equal(packages.reinforcements[0].sharedBonusPercent, 5);
assert.equal(packages.totalDefense, 1_362);

const siegePackages = defenseContext.calculateDefenderArmyPackages({
  target: { ownerUid: "holder", ownerName: "Holder", troops: 500 },
  ownerProfile: { playerName: "Holder", flag: { symbol: "lion" }, shieldwallLevel: 10, shieldwallPercent: 20 },
  ownerBonuses: { cityDefenseBonusPercent: 10 },
  contributions: [{ id: "r1", ownerUid: "ally", ownerName: "Ally", troops: 100 }],
  contributorProfiles: new Map([["ally", { playerName: "Ally", flag: { symbol: "castle" }, stoneworksPercent: 25, shieldwallLevel: 10, shieldwallPercent: 20 }]]),
  contributorStats: new Map([["ally", {
    strongholdDefenseBonusPercent: 5,
    personalStrongholdDefenseBonusPercent: 0,
    sharedClanDefenseBonusPercent: 5,
  }]]),
  siegeCombatVersion: 1,
});
assert.equal(siegePackages.owner.basePower, 650, "The owner's soldiers must use the 1.30 defense base.");
assert.equal(siegePackages.owner.effectivePower, 845, "Shieldwall and objective defense must add against the owner's 1.30 base.");
assert.equal(siegePackages.reinforcements[0].basePower, 130, "Siege reinforcements must use the 1.30 soldier base without duplicate walls.");
assert.equal(siegePackages.reinforcements[0].cityWallDefense, 0, "Siege reinforcements cannot add a second wall layer.");
assert.equal(siegePackages.reinforcements[0].stoneworksBonus, 0, "A reinforcement sender's Stoneworks cannot duplicate the holding wall.");
assert.equal(siegePackages.reinforcements[0].effectivePower, 162, "Reinforcements must use their own Shieldwall and objective support.");
assert.equal(siegePackages.totalGarrisonDefense, 1_007);
assert.equal(siegePackages.totalDefense, 1_370, "Siege defense must be one Stoneworks-only wall plus the combined garrison.");

requires(
  server,
  /function rebuildClanWorldBenefits[\s\S]*?cumulativeGoldPercentMs[\s\S]*?cumulativeTroopPercentMs[\s\S]*?lastIntegratedAtMs[\s\S]*?revision:/,
  "Clan benefit state does not preserve percentage-time production counters and a monotonic revision."
);
requires(
  server,
  /function prepareEconomyCollection[\s\S]*?resolvePlayerObjectiveBenefits[\s\S]*?productionBonuses/,
  "Economy collection does not use authoritative percentage-time clan benefits."
);
requires(
  server,
  /SERVER_WORLD_OBJECTIVE_TARGET_KEYS[\s\S]*?objectiveOwnershipChanged[\s\S]*?rebuildClanBenefitsAndMemberStats/,
  "Ordinary city captures unnecessarily rebuild every clan member's objective benefits."
);
requires(
  server,
  /function calculateDefenderArmyPackages[\s\S]*?usesSiegeCombat[\s\S]*?totalGarrisonDefense[\s\S]*?fortification\?\.currentWallPower/,
  "The current defense model does not combine one wall with independently calculated garrison packages."
);
requires(
  server,
  /function calculateReinforcementFortificationDefense[\s\S]*?REINFORCEMENT_CITY_WALL_SHARE[\s\S]*?getSkillPercent\(profile, "stoneworks"\)[\s\S]*?cityWallDefense \+ stoneworksBonus/,
  "Reinforcements do not receive one quarter of destination base walls plus their contributor's full Stoneworks bonus."
);
requires(
  server,
  /const REINFORCEMENT_CITY_WALL_SHARE\s*=\s*0\.25;/,
  "The reinforcement destination-wall share is not fixed at one quarter."
);
requires(
  server,
  /function createDetailedBattleSnapshot[\s\S]*?participantUids[\s\S]*?reinforcements:[\s\S]*?captureThresholdPower/,
  "Detailed participant-only battle snapshots are incomplete."
);
requires(
  server,
  /writeDetailedBattleSnapshot\(transaction,[\s\S]*?battleId:\s*currentBattleId/,
  "Resolved combat does not persist a detailed battle snapshot."
);
requires(
  rules,
  /match \/worldBenefits\/\{resetId\}[\s\S]*?clanMember\(clanId\)[\s\S]*?allow create, update, delete: if false/,
  "Current clan benefits are not member-readable and server-owned."
);
requires(
  rules,
  /match \/battleSnapshots\/\{resetId\}\/entries\/\{battleId\}[\s\S]*?request\.auth\.uid in resource\.data\.participantUids[\s\S]*?allow create, update, delete: if false/,
  "Battle snapshots are not restricted to battle participants."
);
assert.doesNotMatch(
  extractFunction(rules, "validPlayerProfileUpdate"),
  /'clanObjectiveAccrual'|'pendingClanObjectiveAccrual'/,
  "Clients can mutate server-authoritative objective accrual baselines."
);
requires(
  firebaseClient,
  /function loadBattleSnapshot[\s\S]*?battleSnapshots[\s\S]*?RESET_GENERATION[\s\S]*?entries/,
  "The client cannot load participant-protected battle snapshots."
);
requires(
  firebaseClient,
  /subscribeClanSocialState[\s\S]*?worldBenefits[\s\S]*?onWorldBenefits/,
  "The client does not subscribe once to current-world clan benefits."
);
requires(
  client,
  /function renderDetailedBattleReport[\s\S]*?renderBattleReportHero[\s\S]*?renderBattleComparisonSections/,
  "The report UI does not render the heraldic side-by-side comparison."
);
requires(
  client,
  /function getDetailedBattleSideParticipants[\s\S]*?snapshot\.attackers[\s\S]*?snapshot\.reinforcements/,
  "Visual battle reports do not aggregate rally attackers and reinforcements."
);
requires(
  client,
  /function renderBattleHeroSide[\s\S]*?renderBattleKingdomFlag[\s\S]*?renderPlayerNameLink[\s\S]*?participantSummary/,
  "Visual battle sides do not retain the primary ruler flag, profile link, and aggregate participant count."
);
assert.doesNotMatch(
  extractFunction(client, "renderDetailedBattleReport"),
  /renderBattleClanIdentity|renderClanShield|renderBattleReinforcementRow|renderBattleAttackerRow/,
  "Visual battle details still repeat clan branding or individual participant rosters."
);
const compactReportCard = extractFunction(client, "renderBattleReportCard");
assert.doesNotMatch(
  compactReportCard,
  /report\.summary|getBattleReportSummary|<small>\$\{escapeHtml\(report/,
  "Compact report rows expose battle detail text beneath the target name."
);
requires(
  compactReportCard,
  /data-battle-report-target-flag[\s\S]*?battle-report-opponent[\s\S]*?renderPlayerNameLink\(report\.opponentUid,\s*opponent/,
  "Compact report rows do not limit the target identity to its optional kingdom flag and name."
);
requires(
  client,
  /function applyBattleReportTargetFlags[\s\S]*?FlagRenderer\.render\(flag, report\.opponentFlag, \{[\s\S]*?stableKey:\s*report\.opponentUid \|\| report\.opponentName,[\s\S]*?context:\s*"battle-report-list",[\s\S]*?size:\s*"small",[\s\S]*?\}\)/,
  "Compact report target flags are not hydrated from report snapshots against the stable opponent identity."
);
requires(
  server,
  /function makeReport[\s\S]*?opponentFlag:\s*normalizeServerFlag\(opponentFlag, opponentUid\)/,
  "Authoritative battle reports do not preserve and normalize the opponent kingdom flag against the stable opponent identity."
);
requires(
  styles,
  /\.battle-report-opponent\s*\{[\s\S]*?display:\s*flex[\s\S]*?\.battle-report-target-flag\s*\{/,
  "Compact report target flags are not aligned with the target name."
);
requires(
  client,
  /function renderObjectiveClanAffiliation[\s\S]*?renderClanShield[\s\S]*?data-public-clan-id/,
  "Objective panels do not show a clickable controlling-clan shield."
);
assert.ok(
  packageJson.scripts.test.includes("validate-clan-objective-battles.js"),
  "The clan objective battle validator is not part of the Functions validation suite."
);

console.log("Validated clan objective precedence, legacy and single-wall siege defense packages, private snapshots, and visual report presentation.");
