const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const economyConfig = JSON.parse(fs.readFileSync(path.join(root, "functions", "economy-config.json"), "utf8"));
const expectedSkillIds = [
  "swordmastery",
  "shieldwallDiscipline",
  "stoneworks",
  "taxStewardship",
  "royalGranaries",
  "guildCharters",
  "marchOrders",
  "fieldMedics",
];

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

for (const skill of expectedSkillIds) {
  const config = economyConfig.skills?.[skill];
  if (!config) throw new Error(`Missing ${skill} economy configuration.`);
  const percentPerLevel = Number(config.percentPerLevel);
  const maxPercent = Number(config.maxPercent);
  if (!Number.isFinite(percentPerLevel) || percentPerLevel <= 0 || !Number.isFinite(maxPercent) || maxPercent < 0) {
    throw new Error(`${skill} has invalid configurable bonus values.`);
  }
  for (const [source, label] of [[serverSource, "Server"], [clientSource, "Client"]]) {
    requireMatch(
      source,
      new RegExp(`${skill}:\\s*\\{[^}]*percentPerLevel:\\s*economyNumber\\("skills\\.${skill}\\.percentPerLevel"[^}]*maxPercent:\\s*economyNumber\\("skills\\.${skill}\\.maxPercent"`),
      `${label} ${skill} is not read from the economy configuration.`
    );
  }
  const maxLevel = Math.ceil(maxPercent / percentPerLevel);
  if (!Number.isFinite(maxLevel) || maxLevel < 0 || maxLevel * percentPerLevel < maxPercent) {
    throw new Error(`${skill} has an invalid cap level.`);
  }
}

requireMatch(serverSource, /function normalizeSkillUpgrades[\s\S]*?normalizeSkillLevelForSkill/, "Server skill levels are not capped during normalization.");
requireMatch(clientSource, /function normalizeUpgrades[\s\S]*?normalizeSkillUpgradeLevel/, "Client skill levels are not capped during normalization.");
requireMatch(serverSource, /function getAttackPower[\s\S]*?skillMultiplier\(attackerProfile, "swordmastery"\)/, "Swordmastery is missing from server attack power.");
requireMatch(serverSource, /function getCityStats[\s\S]*?getSkillPercent\(defenderProfile, "shieldwallDiscipline"\)[\s\S]*?BASE_TROOP_DEFENSE_POWER/, "Shieldwall Discipline is missing from server soldier defense.");
requireMatch(serverSource, /function getCityStats[\s\S]*?getSkillPercent\(defenderProfile, "stoneworks"\)/, "Stoneworks is missing from server wall defense.");
requireMatch(serverSource, /function getCityProductionStats[\s\S]*?getSkillPercent\(profile, "taxStewardship"\)/, "Tax Stewardship is missing from server city production.");
requireMatch(serverSource, /function getCityProductionStats[\s\S]*?getSkillPercent\(profile, "royalGranaries"\)/, "Royal Granaries is missing from server city production.");
requireMatch(serverSource, /exports\.upgradeCity[\s\S]*?getSkillPercent\(economy\.profileAfter, "guildCharters"\)/, "Guild Charters is missing from server upgrade costs.");
requireMatch(serverSource, /exports\.spendSkillPoint[\s\S]*?prepareEconomyCollection[\s\S]*?writePreparedEconomy/, "Skill purchases do not settle production through the server economy.");

const marchOrderUses = serverSource.match(/speedMultiplier:[^\n]*skillMultiplier\([^,]+, "marchOrders"\)/g) || [];
if (marchOrderUses.length < 5) {
  throw new Error(`March Orders is only wired into ${marchOrderUses.length} server march paths; expected at least 5.`);
}
requireMatch(serverSource, /if \(targetType === "camp"\)[\s\S]*?applyReinforcementDefenseSettlement[\s\S]*?recoverBattleLossesToMainCity\([\s\S]*?losses: battle\.attackerLosses[\s\S]*?losses: defenseAllocation\.ownerLosses/, "Field Medics is missing from camp battles or reinforcement loss allocation.");
requireMatch(serverSource, /const recoverBattleLossesToMainCity[\s\S]*?getCanonicalMainCityEntry/, "Field Medics does not use the canonical main city.");

console.log("Validated all eight skill configurations and their server-authoritative boost paths.");
