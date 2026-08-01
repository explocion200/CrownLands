const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      parametersEnd = index;
      break;
    }
  }
  assert.ok(parametersEnd >= 0, `Could not parse ${name} parameters.`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

for (const [source, label] of [[clientSource, "Client"], [serverSource, "Server"]]) {
  requireMatch(
    source,
    /const baseTotalDefense = Math\.floor\(baseCityWalls \+ troopDefense\)/,
    `${label} defense base still includes skill-enhanced walls.`
  );
  requireMatch(
    source,
    /const totalDefenseBonus = Math\.max\(0, totalDefense - baseTotalDefense\)|totalDefenseBonus: Math\.max\(0, totalDefense - baseTotalDefense\)/,
    `${label} does not expose the added defense bonus.`
  );
  requireMatch(
    source,
    /baseTroopProductionPerHour/,
    `${label} does not expose base troop production.`
  );
  requireMatch(
    source,
    /baseGoldProductionPerHour/,
    `${label} does not expose base gold production.`
  );

  const goldProductionContext = {};
  vm.createContext(goldProductionContext);
  vm.runInContext(
    extractFunction(source, "calculateGoldProductionRates"),
    goldProductionContext,
    { filename: label === "Client" ? path.join(root, "game.js") : path.join(root, "functions", "index.js") }
  );
  const rates = goldProductionContext.calculateGoldProductionRates(100, 75, 10, 50);
  assert.equal(rates.baseGoldProductionPerHour, 100, `${label} changed the raw gold baseline.`);
  assert.equal(rates.untimedGoldProductionPerHour, 185, `${label} compounds permanent gold bonuses.`);
  assert.equal(rates.goldProductionPerHour, 235, `${label} compounds Royal Tax with other gold bonuses.`);
  assert.equal(rates.goldProductionBonusPerHour, 135, `${label} reports an incorrect total gold bonus.`);
}

requireMatch(
  serverSource,
  /stats\.goldProductionPerSecond \* goldElapsedSeconds\s*\+ stats\.baseGoldProductionPerHour \/ 3600\s*\* taxDecreeOverlapSeconds\s*\* ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT \/ 100/,
  "Authoritative Royal Tax credit is not based solely on raw city gold production."
);

requireMatch(
  serverSource,
  /baseGoldPerHour \+= Math\.max\(0, safeNumber\(stats\.baseGoldProductionPerHour, 0\)\)/,
  "Global gold production base is not truly unboosted."
);
requireMatch(
  serverSource,
  /baseTroopPerHour \+= Math\.max\(0, safeNumber\(stats\.baseTroopProductionPerHour, 0\)\)/,
  "Global troop production base is not truly unboosted."
);
requireMatch(
  serverSource,
  /untimedGoldPerHour[\s\S]*?untimedTroopPerHour/,
  "Permanent camp reward production was not preserved separately."
);
requireMatch(
  serverSource,
  /baseKingPower[\s\S]*?kingPowerBonus/,
  "Server King Power does not expose its Stronghold bonus contribution."
);
requireMatch(
  serverSource,
  /baseTotalDefense: normalizedBaseDefense[\s\S]*?totalDefenseBonus:/,
  "Server battle reports do not persist defense breakdowns."
);
requireMatch(
  clientSource,
  /profileKingPowerStat\.textContent = formatBaseAndBonusStat/,
  "Profile King Power does not use the shared base-plus-bonus display."
);
requireMatch(
  clientSource,
  /renderProfileProductionStat\(\s*profileGoldProductionStat,\s*summary\.baseGoldProductionPerHour,\s*summary\.goldProductionPerHour/,
  "Profile gold production does not show final production with the full bonus contribution."
);
requireMatch(
  clientSource,
  /renderProfileProductionStat\(\s*profileTroopProductionStat,\s*summary\.baseTroopProductionPerHour,\s*summary\.troopProductionPerHour/,
  "Profile troop production does not show final production with the full bonus contribution."
);
requireMatch(
  clientSource,
  /untimedGoldProductionPerHour[\s\S]*?untimedTroopProductionPerHour/,
  "Client production summaries do not preserve normal untimed rates."
);
requireMatch(
  clientSource,
  /Total defense<\/span><strong>\$\{formatBaseAndBonusStat/,
  "City and report defense panels do not use the shared base-plus-bonus display."
);

const cityInfoSource = extractFunction(clientSource, "showCityInfoModal");
assert.doesNotMatch(
  cityInfoSource,
  /Victory points|City power|stats\.victoryPoints|stats\.cityPower/,
  "City and Stronghold information panels must not expose internal Victory Points."
);
assert.doesNotMatch(
  cityInfoSource,
  /<span>Stoneworks<\/span>/,
  "City information repeats Stoneworks outside the City walls bonus breakdown."
);
const scoutReportSource = extractFunction(clientSource, "showScoutReportModal");
assert.doesNotMatch(
  scoutReportSource,
  /scoutBreakdownRow\([^,]+,\s*"Stoneworks"/,
  "Scout reports repeat Stoneworks as a separate enemy defense amount."
);
assert.match(
  scoutReportSource,
  /scoutSkillRow\("Stoneworks"/,
  "Scout reports must keep Stoneworks under Enemy defense stats."
);

const formatterContext = {};
vm.createContext(formatterContext);
vm.runInContext(
  `${extractFunction(clientSource, "formatNumber")}\n${extractFunction(clientSource, "formatBaseAndBonusStat")}`,
  formatterContext,
  { filename: path.join(root, "game.js") }
);
assert.equal(formatterContext.formatBaseAndBonusStat(1_000, 1_250), "1.0K (+250)");
assert.equal(formatterContext.formatBaseAndBonusStat(900, 900, "/h"), "900/h (+0/h)");
assert.equal(formatterContext.formatBaseAndBonusStat(30, 38, "%"), "30% (+8%)");

const productionStatContext = {
  document: {
    createElement: () => ({ className: "", textContent: "" }),
  },
};
vm.createContext(productionStatContext);
vm.runInContext(
  `${extractFunction(clientSource, "formatNumber")}\n${extractFunction(clientSource, "renderProfileProductionStat")}`,
  productionStatContext,
  { filename: path.join(root, "game.js") }
);
const productionStatElement = {
  children: [],
  replaceChildren(...children) {
    this.children = children;
  },
};
productionStatContext.renderProfileProductionStat(productionStatElement, 33_000_000, 91_000_000, "/h");
assert.equal(productionStatElement.children[0].textContent, "91M/h");
assert.equal(productionStatElement.children[0].className, "profile-production-total");
assert.equal(productionStatElement.children[1].textContent, "(+58M/h)");
assert.equal(productionStatElement.children[1].className, "profile-production-bonus");

const globalStatsContext = {
  client: { user: { uid: "player-1" } },
};
vm.createContext(globalStatsContext);
vm.runInContext(
  `${extractFunction(firebaseClientSource, "timestampToMs")}\n${extractFunction(firebaseClientSource, "cleanGlobalStats")}`,
  globalStatsContext,
  { filename: path.join(root, "firebaseClient.js") }
);
const cleanedStats = globalStatsContext.cleanGlobalStats({
  uid: "player-1",
  kingPower: 1_450,
  baseKingPower: 1_000,
  kingPowerBonus: 450,
  goldPerHour: 1_500,
  baseGoldPerHour: 1_000,
  untimedGoldPerHour: 1_250,
  troopPerHour: 3_000,
  baseTroopPerHour: 2_000,
  untimedTroopPerHour: 2_500,
  replacementPower: 600,
  baseReplacementPower: 400,
  defensivePower: 500,
  baseDefensivePower: 450,
});
assert.equal(cleanedStats.baseGoldPerHour, 1_000, "Firebase live stats dropped base gold production.");
assert.equal(cleanedStats.untimedGoldPerHour, 1_250, "Firebase live stats dropped permanent gold bonuses.");
assert.equal(cleanedStats.baseTroopPerHour, 2_000, "Firebase live stats dropped base troop production.");
assert.equal(cleanedStats.untimedTroopPerHour, 2_500, "Firebase live stats dropped permanent troop bonuses.");
assert.equal(cleanedStats.baseKingPower, 1_000, "Firebase live stats dropped base King Power.");
assert.equal(cleanedStats.baseReplacementPower, 400, "Firebase live stats dropped base replacement power.");
assert.equal(cleanedStats.baseDefensivePower, 450, "Firebase live stats dropped base defensive power.");

console.log("Validated base-plus-bonus stats across profile, city, Stronghold, camp, and report data.");
