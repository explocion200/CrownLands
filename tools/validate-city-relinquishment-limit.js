const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "game.js");
const serverPath = path.join(root, "functions", "index.js");
const firebaseClientPath = path.join(root, "firebaseClient.js");
const rulesPath = path.join(root, "firestore.rules");
const gameRulesPath = path.join(root, "game-rules.html");
const gameSource = fs.readFileSync(gamePath, "utf8");
const serverSource = fs.readFileSync(serverPath, "utf8");
const firebaseClientSource = fs.readFileSync(firebaseClientPath, "utf8");
const rulesSource = fs.readFileSync(rulesPath, "utf8");
const gameRulesSource = fs.readFileSync(gameRulesPath, "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.ok(bodyStart >= 0, `Missing ${name} body.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const serverContext = {
  Date,
  Math,
  CITY_RELINQUISH_DAILY_LIMIT: 1,
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  timestampToMs: value => Math.max(0, Math.floor(Number(value) || 0)),
};
vm.createContext(serverContext);
vm.runInContext([
  extractFunction(serverSource, "getUtcDateKey"),
  extractFunction(serverSource, "getNextUtcDayStartMs"),
  extractFunction(serverSource, "getCityRelinquishPolicy"),
].join("\n"), serverContext, { filename: serverPath });

const clientContext = {
  Date,
  Math,
  CITY_RELINQUISH_DAILY_LIMIT: 1,
  normalizeTimestampMs: value => Math.max(0, Math.floor(Number(value) || 0)),
};
vm.createContext(clientContext);
vm.runInContext([
  extractFunction(gameSource, "getUtcDateKeyAtMs"),
  extractFunction(gameSource, "getNextUtcDayStartMs"),
  extractFunction(gameSource, "getCityRelinquishPolicy"),
].join("\n"), clientContext, { filename: gamePath });

const firstUse = Date.parse("2026-07-29T08:15:00.000Z");
const beforeMidnight = Date.parse("2026-07-29T23:59:00.000Z");
const midnight = Date.parse("2026-07-30T00:00:00.000Z");
const nextDay = Date.parse("2026-07-30T00:00:01.000Z");

for (const getPolicy of [
  serverContext.getCityRelinquishPolicy,
  clientContext.getCityRelinquishPolicy,
]) {
  const unused = getPolicy(0, firstUse);
  assert.equal(unused.limit, 1);
  assert.equal(unused.utcDate, "2026-07-29");
  assert.equal(unused.used, false);
  assert.equal(unused.availableAtMs, 0);

  const used = getPolicy(firstUse, beforeMidnight);
  assert.equal(used.used, true);
  assert.equal(used.availableAtMs, midnight);
  assert.equal(used.availableAtMs - beforeMidnight, 60_000);

  const reset = getPolicy(firstUse, midnight);
  assert.equal(reset.utcDate, "2026-07-30");
  assert.equal(reset.used, false);
  assert.equal(reset.availableAtMs, 0);

  const secondDayUse = getPolicy(midnight, nextDay);
  assert.equal(secondDayUse.used, true);
  assert.equal(secondDayUse.utcDate, "2026-07-30");
}

const relinquishStart = serverSource.indexOf("exports.relinquishCity = onCall");
const relinquishEnd = serverSource.indexOf("exports.relocateMainCity", relinquishStart);
assert.ok(relinquishStart >= 0 && relinquishEnd > relinquishStart, "Missing relinquishCity callable.");
const relinquishSource = serverSource.slice(relinquishStart, relinquishEnd);
const policyCheckIndex = relinquishSource.indexOf("getCityRelinquishPolicy(");
const destinationIndex = relinquishSource.indexOf("findNearestRelinquishDestination(");
const movementWriteIndex = relinquishSource.indexOf("writeArmyMovementCopies(");
assert.ok(policyCheckIndex >= 0, "Relinquishment does not enforce the UTC-day policy.");
assert.ok(policyCheckIndex < destinationIndex, "The daily policy must run before destination and route work.");
assert.ok(policyCheckIndex < movementWriteIndex, "The daily policy must run before movement writes.");
assert.match(
  relinquishSource,
  /if \(movement\) writeArmyMovementCopies\(transaction,\s*movement,/,
  "Zero-garrison relinquishments still try to write a null movement."
);
assert.match(
  relinquishSource,
  /throw new HttpsError\([\s\S]*?\{\s*cityRelinquishPolicy\s*\}/,
  "Cooldown errors do not include structured policy details."
);
assert.match(
  relinquishSource,
  /writePreparedEconomy\([\s\S]*?\{\s*lastCityRelinquishedAtMs,\s*\}[\s\S]*?sourceEntry\.ref/,
  "The allowance is not recorded atomically with the ownership update."
);
assert.match(
  relinquishSource,
  /currentUser:\s*\{[\s\S]*?lastCityRelinquishedAtMs[\s\S]*?cityRelinquishPolicy:/,
  "Successful responses do not return the authoritative timestamp and policy."
);
assert.match(
  extractFunction(serverSource, "createEconomyResponse"),
  /lastCityRelinquishedAtMs:\s*timestampToMs\(economy\.profileAfter\.lastCityRelinquishedAtMs\)/,
  "Economy snapshots do not expose the authoritative timestamp."
);

assert.match(
  extractFunction(gameSource, "renderRelinquishCityAction"),
  /policy\.used[\s\S]*?disabled[\s\S]*?Available in/,
  "The relinquish action does not remain visible and disabled during the UTC lock."
);
assert.match(
  extractFunction(gameSource, "startCityRelinquishCountdown"),
  /setInterval\(updateCityRelinquishCountdown,\s*1000\)/,
  "The visible relinquishment reset does not update live."
);
assert.match(
  extractFunction(gameSource, "applyLocalRelinquishCity"),
  /state\.lastCityRelinquishedAtMs\s*=\s*nowMs/,
  "Local gameplay does not mirror the daily allowance."
);
assert.match(
  extractFunction(gameSource, "relinquishCity"),
  /getCityRelinquishUnavailableMessage\(\)[\s\S]*?getOnlineApi\(\)\?\.relinquishCity/,
  "The confirmation path does not recheck the local UTC-day state."
);
assert.match(
  firebaseClientSource,
  /delete cleanProfile\.lastCityRelinquishedAtMs;/,
  "Client profile saves can still submit the server-owned timestamp."
);
assert.match(
  rulesSource,
  /validPlayerProfileCreate[\s\S]*?'lastCityRelinquishedAtMs'/,
  "Profile creation rules do not reject client-supplied relinquishment timestamps."
);
assert.match(
  rulesSource,
  /validPlayerProfileUpdate[\s\S]*?profileFieldUnchanged\('lastCityRelinquishedAtMs'\)/,
  "Profile update rules do not protect the relinquishment timestamp."
);
assert.match(
  gameRulesSource,
  /one holding per UTC day[\s\S]*?Regular cities, Strongholds, and the Crown Citadel[\s\S]*?00:00 UTC/,
  "The public rules do not explain the shared UTC-day relinquishment allowance."
);

console.log("Validated the one-holding-per-UTC-day relinquishment policy, UI, and protected profile state.");
