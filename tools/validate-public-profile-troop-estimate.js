const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const stylesSource = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}`;
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "functions", "package.json"), "utf8"));

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}.`);
  const bodyStart = source.indexOf(") {", start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const totalsSandbox = {
  safeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
};
vm.createContext(totalsSandbox);
vm.runInContext(readFunction(serverSource, "getTotalMilitaryTroopsFromGlobalStats"), totalsSandbox);

assert.equal(totalsSandbox.getTotalMilitaryTroopsFromGlobalStats({
  totalTroops: 300,
  totalMarchingTroops: 200,
  totalReinforcementTroops: 100,
  totalRallyTroops: 50,
}), 650, "The public estimate must include stationed, marching, reinforcement, and rally troops.");
assert.equal(totalsSandbox.getTotalMilitaryTroopsFromGlobalStats({
  totalTroops: -10,
  totalMarchingTroops: 3.9,
  totalReinforcementTroops: "4",
  totalRallyTroops: null,
}), 7, "Troop totals must clamp invalid values and use whole troops.");
assert.equal(totalsSandbox.getTotalMilitaryTroopsFromGlobalStats({
  totalTroops: Number.MAX_SAFE_INTEGER,
  totalMarchingTroops: 1,
}), Number.MAX_SAFE_INTEGER, "Troop totals must not exceed JavaScript's safe integer range.");

const globalStatsFunction = readFunction(serverSource, "createGlobalStatsSnapshot");
assert.match(globalStatsFunction, /totalCityTroops \+= troopCount[\s\S]*?if \(isStronghold\(city\)\)/, "Stronghold garrisons must be counted before holdings are categorized.");
assert.match(globalStatsFunction, /totalCampTroops \+= troopCount/, "Held reward-camp troops must be included.");
assert.match(globalStatsFunction, /const marchingById = new Map\(\)[\s\S]*?if \(army\.rallyAttack === true\) return;[\s\S]*?marchingById\.has\(key\)/, "Active armies must be deduplicated and launched rallies must not be counted twice.");
assert.match(globalStatsFunction, /getTotalMilitaryTroopsFromGlobalStats\(\{[\s\S]*?totalReinforcementTroops:[\s\S]*?totalRallyTroops:/, "The canonical total must include reinforcement and committed-rally aggregates.");

const callable = between(serverSource, "exports.getCombatPlayerIdentity", "async function ensureMainIslandForPlayer");
assert.match(callable, /includePublicProfile !== true/, "Combat-only identity lookups must not calculate a public troop estimate.");
assert.match(callable, /activeArmiesQueryForPlayer\(targetUid\)\.get\(\)[\s\S]*?heldRewardCampsQueryForPlayer\(targetUid\)\.get\(\)/, "Opening a public profile must load current canonical armies and held camps.");
assert.match(callable, /createGlobalStatsSnapshot\(\{[\s\S]*?getIncomingTroopEstimate\(getTotalMilitaryTroopsFromGlobalStats\(troopStats\)\)/, "The public profile must reuse the canonical troop aggregation and incoming-attack estimate bands.");
assert.match(callable, /let troopEstimate = null;[\s\S]*?catch \(error\)[\s\S]*?troopEstimate,/, "A failed estimate must leave the rest of the public profile available.");

const responseStart = callable.lastIndexOf("  return {");
assert.ok(responseStart >= 0, "The public profile response was not found.");
const publicResponse = callable.slice(responseStart);
assert.match(publicResponse, /troopEstimate,/, "The public profile response must include the estimate.");
assert.doesNotMatch(publicResponse, /totalTroops|totalMilitaryTroops|troopStats/, "The public profile response must not return an exact troop total or private aggregate.");

const publicProfileClient = between(clientSource, "function normalizePublicPlayerProfile", "async function focusPublicPlayerMainCity");
assert.match(publicProfileClient, /raw\.troopEstimate[\s\S]*?troopEstimateMin[\s\S]*?troopEstimateMax/, "The client must validate the server estimate bounds.");
assert.match(publicProfileClient, /public-profile-troop-estimate[\s\S]*?Estimated troops/, "The Kingdom section must render the estimated troop row.");
assert.match(publicProfileClient, /profile\.troopEstimate \? escapeHtml\(profile\.troopEstimate\.label\) : "Unavailable"/, "Missing estimates must render as unavailable.");
assert.equal((publicProfileClient.match(/loadPublicPlayerProfile/g) || []).length, 1, "The public profile must make one estimate-bearing request when opened.");
assert.match(publicProfileClient, /profile\.clan = clan;[\s\S]*?renderPublicPlayerProfile\(profile\)/, "The later clan refresh must reuse the original troop estimate.");

assert.match(firebaseClientSource, /async function loadPublicPlayerProfile[\s\S]*?includePublicProfile: true/, "The Firebase client must request the on-demand public profile snapshot.");
assert.doesNotMatch(firebaseClientSource, /subscribePublicPlayerProfile|watchPublicPlayerProfile/, "The estimate must not introduce a realtime profile subscription.");
assert.match(stylesSource, /\.public-profile-troop-estimate\s*\{\s*margin-top:/, "The estimate row needs compact profile spacing.");
assert.match(stylesSource, /@media \(max-width: 720px\)[\s\S]*?\.public-player-profile \{ grid-template-columns: 1fr; \}/, "The estimate must retain the one-column mobile profile layout.");
assert.ok(packageJson.scripts.test.includes("validate-public-profile-troop-estimate.js"), "The public troop-estimate validator is not in the complete validation suite.");

console.log("Validated on-demand public troop estimates, complete troop aggregation, privacy, fallback behavior, and mobile layout.");
