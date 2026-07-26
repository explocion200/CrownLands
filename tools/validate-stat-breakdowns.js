const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
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
}

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
  /profileGoldProductionStat\.textContent = formatBaseAndBonusStat/,
  "Profile gold production does not use the shared base-plus-bonus display."
);
requireMatch(
  clientSource,
  /profileTroopProductionStat\.textContent = formatBaseAndBonusStat/,
  "Profile troop production does not use the shared base-plus-bonus display."
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

console.log("Validated base-plus-bonus stats across profile, city, Stronghold, camp, and report data.");
