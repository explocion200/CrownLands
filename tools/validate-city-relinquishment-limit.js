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

const cleanupContext = {
  CLAN_IDENTITY_REVISION_VERSION: 1,
  Date,
  clampCityLevel: value => Math.max(1, Math.floor(Number(value) || 1)),
  getStrongholdDefenseLevel: city => Math.max(1, Math.floor(Number(city.level) || 50)),
  isStronghold: city => Boolean(city?.kind === "stronghold" || city?.strongholdType),
};
vm.createContext(cleanupContext);
vm.runInContext([
  extractFunction(serverSource, "getNeutralClaimClearedPatch"),
  extractFunction(serverSource, "getCityRelinquishNeutralPatch"),
].join("\n"), cleanupContext, { filename: serverPath });

const cleanupAtMs = Date.parse("2026-07-29T10:30:00.000Z");
const cleanupPatch = cleanupContext.getCityRelinquishNeutralPatch({
  level: 17,
  ownerUid: "owner",
  ownerClanId: "clan",
  ownerClanName: "Old Clan",
  ownerClanTag: "OLD",
  alliedReinforcementTroops: 500,
}, cleanupAtMs);
assert.equal(cleanupPatch.ownerKind, "neutral");
assert.equal(cleanupPatch.ownerUid, null);
assert.equal(cleanupPatch.ownerName, "");
assert.equal(cleanupPatch.ownerClanId, "");
assert.equal(cleanupPatch.ownerClanName, "");
assert.equal(cleanupPatch.ownerClanTag, "");
assert.equal(cleanupPatch.ownerClanIdentityRevision, 0);
assert.equal(cleanupPatch.ownerShieldExpiresAtMs, 0);
assert.equal(cleanupPatch.alliedReinforcementTroops, 0);
assert.equal(cleanupPatch.troops, 0);
assert.equal(cleanupPatch.troopFloat, 0);
assert.equal(cleanupPatch.investedGold, 0);
assert.equal(cleanupPatch.isMainCity, false);
assert.equal(cleanupPatch.level, 17);
assert.equal(cleanupPatch.relinquishedAtMs, cleanupAtMs);
assert.equal(cleanupPatch.neutralClaimOpen, false);

const statsRebuildSource = extractFunction(serverSource, "rebuildGlobalStatsForPlayer");
const statsCityRefreshStart = statsRebuildSource.indexOf("const cityProjectionWrites = cityEntries.map");
const statsArmyRefreshStart = statsRebuildSource.indexOf("const armyProjectionWrites", statsCityRefreshStart);
assert.ok(
  statsCityRefreshStart >= 0 && statsArmyRefreshStart > statsCityRefreshStart,
  "Missing the stats-rebuild city identity refresh."
);
assert.doesNotMatch(
  statsRebuildSource.slice(statsCityRefreshStart, statsArmyRefreshStart),
  /owner(?:Kind|Uid)\s*:/,
  "A stats rebuild can restore city ownership from a stale query snapshot."
);
assert.match(
  statsRebuildSource,
  /writeCurrentOwnerPatches\(playerUid, cityProjectionWrites/,
  "Stats-rebuild city projections do not re-check their current owner."
);
assert.match(
  statsRebuildSource,
  /writeCurrentOwnerPatches\(playerUid, armyProjectionWrites/,
  "Stats-rebuild army projections do not re-check their current owner."
);

const identitySyncStart = serverSource.indexOf("exports.syncPlayerIdentity = onCall");
const identitySyncEnd = serverSource.indexOf("exports.recalculatePlayerGlobalStats", identitySyncStart);
const identitySyncSource = serverSource.slice(identitySyncStart, identitySyncEnd);
const identityCityRefreshStart = identitySyncSource.indexOf("const cityProjectionWrites = cityDocs.map");
const identityArmyRefreshStart = identitySyncSource.indexOf("const armyProjectionWrites", identityCityRefreshStart);
assert.ok(
  identitySyncStart >= 0
    && identitySyncEnd > identitySyncStart
    && identityCityRefreshStart >= 0
    && identityArmyRefreshStart > identityCityRefreshStart,
  "Missing the player-identity city refresh."
);
assert.doesNotMatch(
  identitySyncSource.slice(identityCityRefreshStart, identityArmyRefreshStart),
  /owner(?:Kind|Uid)\s*:/,
  "An identity sync can restore city ownership from a stale query snapshot."
);
assert.match(
  identitySyncSource,
  /writeCurrentOwnerPatches\(uid, cityProjectionWrites/,
  "Identity-sync city projections do not re-check their current owner."
);
assert.match(
  identitySyncSource,
  /writeCurrentOwnerPatches\(uid, armyProjectionWrites/,
  "Identity-sync army projections do not re-check their current owner."
);

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
  /buildServerGeneratedArmyRoute\(source, destination\)[\s\S]*?transaction\.get\(canonicalArmyRef\(order\.id\)\)/,
  "Relinquishment does not build and deduplicate its march from authoritative server data."
);
assert.doesNotMatch(
  relinquishSource,
  /order\.(?:kind|fromId|toId|sourceRegionId|targetRegionId)\s*!==/,
  "Relinquishment still requires a client-authored march to match the server destination."
);
assert.match(
  relinquishSource,
  /const sourcePatch = getCityRelinquishNeutralPatch\(source, nowMs\)/,
  "Relinquishment bypasses the complete ownership cleanup patch."
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
const clientRelinquishSource = extractFunction(gameSource, "relinquishCity");
const onlineRelinquishIndex = clientRelinquishSource.indexOf("getOnlineApi().relinquishCity({");
const localRouteIndex = clientRelinquishSource.indexOf("findRouteAsync(city, destination)");
assert.ok(
  onlineRelinquishIndex >= 0 && localRouteIndex > onlineRelinquishIndex,
  "Online relinquishment still waits for a client route before asking the authoritative server."
);
assert.doesNotMatch(
  clientRelinquishSource.slice(onlineRelinquishIndex, localRouteIndex),
  /army:|destinationCityId|destinationRegionId|routeRegionIds/,
  "The online city action still submits client destination or route authority."
);
assert.match(
  clientRelinquishSource,
  /if \(result\?\.movement\) adoptServerArmyMovement\(result\.movement\)/,
  "The client does not adopt the server-generated relinquishment march."
);
assert.match(
  extractFunction(gameSource, "applyLocalRelinquishCity"),
  /ownerClanId = ""[\s\S]*?alliedReinforcementTroops = 0/,
  "Local relinquishment leaves stale ownership or reinforcement metadata."
);
assert.match(
  extractFunction(gameSource, "resolveAttack"),
  /attack\.relinquishTransfer && !cityBelongsToMarchOwner\(target, attack\)[\s\S]*?resolveLocalReturningArmy\(attack\)[\s\S]*?return;/,
  "A local relinquishment march can still attack a destination after its ownership changes."
);

const resolveStart = serverSource.indexOf("async function resolveArmyOrderById");
const resolveEnd = serverSource.indexOf("exports.resolveArmyOrder", resolveStart);
const resolveSource = serverSource.slice(resolveStart, resolveEnd);
const relinquishRedirectIndex = resolveSource.indexOf("army.relinquishTransfer && defenderUid !== attackerUid");
const ordinaryTransferIndex = resolveSource.indexOf('effectiveKind === "transfer"');
assert.ok(
  relinquishRedirectIndex >= 0 && ordinaryTransferIndex > relinquishRedirectIndex,
  "A relinquishment march can still transfer into or attack a city after its ownership changes."
);
assert.match(
  resolveSource,
  /reason: defenderUid \? "captured_destination" : "released_destination"/,
  "Relinquishment reroutes do not distinguish captured and neutral destinations."
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
const profileUpdateRuleStart = rulesSource.indexOf("function validPlayerProfileUpdate");
const profileUpdateRuleEnd = rulesSource.indexOf("function ownsCityOwnerIdentity", profileUpdateRuleStart);
const profileUpdateRule = rulesSource.slice(profileUpdateRuleStart, profileUpdateRuleEnd);
assert.match(profileUpdateRule, /affected\.hasOnly\(/, "Profile updates are not bounded by an allowlist.");
assert.doesNotMatch(profileUpdateRule, /lastCityRelinquishedAtMs/, "Profile update rules allow client relinquishment timestamp changes.");
assert.match(
  gameRulesSource,
  /one holding per UTC day[\s\S]*?Regular cities, Strongholds, and the Crown Citadel[\s\S]*?00:00 UTC/,
  "The public rules do not explain the shared UTC-day relinquishment allowance."
);

console.log("Validated authoritative city relinquishment, ownership cleanup, movement rerouting, invalid cases, and the UTC-day policy.");
