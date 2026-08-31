const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const firestoreIndexes = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"));
const worldLayout = JSON.parse(fs.readFileSync(path.join(root, "functions", "world-layout.json"), "utf8"));
const economyConfig = JSON.parse(fs.readFileSync(path.join(root, "functions", "economy-config.json"), "utf8"));

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
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

const deedCamps = (worldLayout.maps || []).flatMap(map => (map.camps || [])
  .filter(camp => camp.campType === "deed")
  .map(camp => ({ ...camp, regionId: map.id })));
if (deedCamps.length !== 1 || deedCamps[0].id !== "region_9_deed_camp") {
  throw new Error("The world layout must contain exactly one Deed Camp in Stonebrook Farms.");
}

for (const source of [serverSource, clientSource]) {
  requireMatch(source, /deed:\s*\{[\s\S]*?rewardType:\s*"city"[\s\S]*?baseReward:\s*1/, "Missing Deed Camp city reward configuration.");
}
if (!Number.isFinite(Number(economyConfig.camps?.deed?.holdMinutes))) {
  throw new Error("Deed Camp hold time is missing from the economy configuration.");
}
requireMatch(serverSource, /DEED_CAMP_HOLD_DURATION_MS\s*=\s*economyNumber\("camps\.deed\.holdMinutes"/, "Server Deed Camp hold time is not configurable.");
requireMatch(clientSource, /DEED_CAMP_HOLD_SECONDS\s*=\s*economyNumber\("camps\.deed\.holdMinutes"/, "Client Deed Camp hold time is not configurable.");
requireMatch(serverSource, /deed:\s*\{[\s\S]*?objectiveStatsId:\s*"deedCamp"/, "Deed Camp is missing its per-player daily claim record.");
requireMatch(serverSource, /deedDailyLimitReached\s*=\s*isDeedCamp\s*&&\s*priorClaims\s*>=\s*1/, "Deed Camp is not limited to one city award per player per UTC day.");
requireMatch(serverSource, /status:\s*isDeedCamp[\s\S]*?"daily-limit"[\s\S]*?"no-eligible-city"/, "Deed Camp payout does not report its daily limit cleanly.");
requireMatch(serverSource, /findEligibleDeedCampCity[\s\S]*?getServerWorldRegularCityIds[\s\S]*?where\("ownerUid",\s*"==",\s*null\)/, "Deed Camp payout is not using a bounded neutral-city query.");
requireMatch(serverSource, /DEED_CAMP_EXCLUDED_REGION_ID\s*=\s*"center"/, "Crownlands Heart is not excluded from Deed Camp city awards.");
requireMatch(serverSource, /function getDeedCampCandidateRegionIds[\s\S]*?SERVER_WORLD_MAPS[\s\S]*?regionId !== DEED_CAMP_EXCLUDED_REGION_ID[\s\S]*?stableDeedCampHash/, "Deed Camp candidate maps are not randomized across the full world outside Crownlands Heart.");
requireMatch(serverSource, /getDeedCampCandidateRegionIds\([\s\S]*?camp,[\s\S]*?holderUid,[\s\S]*?payoutAtMs,[\s\S]*?selectionEntropy,[\s\S]*?activeRegionIds/, "Deed Camp map randomization is not seeded to the payout transaction.");
requireMatch(serverSource, /async function resolveRewardCampPayoutByRef[\s\S]*?crypto\.randomBytes\(16\)[\s\S]*?runTransactionWithInfrastructureRetry[\s\S]*?findEligibleDeedCampCity\(transaction, camp, holderUid, payoutAtMs, deedSelectionEntropy\)/, "Deed Camp selection does not use retry-stable random entropy created outside the transaction.");
requireMatch(serverSource, /missingTargetCamp[\s\S]*?getAuthoritativeRewardCampSeed[\s\S]*?transaction\.set\(targetRef,[\s\S]*?missingTargetCamp/, "Missing authoritative camp documents are not repaired before an army launches.");

const crownlandsHeart = worldLayout.maps.find(map => map.label === "Crownlands Heart");
assert.equal(crownlandsHeart?.id, "center", "The validator could not identify Crownlands Heart.");
const candidateSandbox = {
  DEED_CAMP_EXCLUDED_REGION_ID: crownlandsHeart.id,
  SERVER_WORLD_MAPS: worldLayout.maps,
  STATIC_ACTIVE_SERVER_REGION_IDS: new Set(worldLayout.maps.map(map => map.id)),
  normalizeRegionId(value) { return String(value || "").trim().toLowerCase(); },
  safeString(value, limit = 160) { return String(value || "").slice(0, limit); },
  safeNumber(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; },
  getServerWorldRegularCityIds(regionId) {
    const map = worldLayout.maps.find(entry => entry.id === regionId);
    return new Set((map?.cities || []).map(city => city.id).filter(Boolean));
  },
};
vm.createContext(candidateSandbox);
vm.runInContext(readFunction(serverSource, "stableDeedCampHash"), candidateSandbox);
vm.runInContext(readFunction(serverSource, "getDeedCampCandidateRegionIds"), candidateSandbox);
const eligibleMapIds = worldLayout.maps
  .filter(map => map.id !== crownlandsHeart.id && (map.cities || []).length)
  .map(map => map.id)
  .sort();
const candidateOrders = Array.from({ length: 32 }, (_, index) => Array.from(
  candidateSandbox.getDeedCampCandidateRegionIds({ id: "region_9_deed_camp" }, "holder-1", 1_000_000, `selection-${index}`)
));
candidateOrders.forEach(order => {
  assert.deepEqual([...order].sort(), eligibleMapIds, "Every non-Heart map with regular cities must be eligible for a Deed Camp award.");
  assert(!order.includes(crownlandsHeart.id), "Crownlands Heart appeared in a Deed Camp candidate order.");
});
assert(new Set(candidateOrders.map(order => order[0])).size >= 4, "Deed Camp payout seeds do not randomize the first candidate map.");
assert.deepEqual(
  Array.from(candidateSandbox.getDeedCampCandidateRegionIds({ id: "region_9_deed_camp" }, "holder-1", 1_000_000, "selection-0")),
  candidateOrders[0],
  "Deed Camp candidate order must remain stable during a transaction retry."
);

const cityOwnerIndex = (firestoreIndexes.fieldOverrides || []).find(index => (
  index.collectionGroup === "cities" && index.fieldPath === "ownerUid"
));
const cityOwnerScopes = new Set((cityOwnerIndex?.indexes || []).map(index => index.queryScope));
if (!cityOwnerScopes.has("COLLECTION") || !cityOwnerScopes.has("COLLECTION_GROUP")) {
  throw new Error("cities.ownerUid must support both collection and collection-group queries for Deed Camp payouts and global ownership reads.");
}

const payoutStart = serverSource.indexOf("async function resolveRewardCampPayoutByRef");
const payoutEnd = serverSource.indexOf("async function resolveRewardCampPayoutAndStats", payoutStart);
const payoutSource = serverSource.slice(payoutStart, payoutEnd);
if (!payoutSource) throw new Error("Missing reward camp payout transaction.");
requireMatch(payoutSource, /deedCityPatch[\s\S]*?ownerUid:\s*holderUid[\s\S]*?isMainCity:\s*false/, "Deed Camp does not transfer a regular city to its holder.");
requireMatch(payoutSource, /source:\s*"deed_camp"/, "Deed Camp payout history is missing its source marker.");
requireMatch(payoutSource, /rewardHistory\//, "Deed Camp payout does not create its holder-owned history entry.");
requireMatch(payoutSource, /const deedCityName = getServerCanonicalCityName\(deedCityAward\.city,\s*deedCityAward\.regionId\)[\s\S]*?name:\s*deedCityName[\s\S]*?cityName:\s*safeString\(deedCityName/, "Deed Camp payouts expose numbered layout city names.");
requireMatch(payoutSource, /campReportReward = deedCityPatch[\s\S]*?rewardType: "city"[\s\S]*?cityName: deedHistoryEntry\.cityName[\s\S]*?cityRegionName: deedHistoryEntry\.regionName[\s\S]*?campReward: campReportReward/, "Deed Camp reports do not record the awarded city and location.");
requireMatch(payoutSource, /!deedCityPatch[\s\S]*?"no-eligible-city"/, "Deed Camp has no safe no-city payout result.");
if (/neutralCaptures/.test(payoutSource)) throw new Error("Deed Camp payout must not use the normal neutral capture counter.");
if (/buildPlayerProgressPatch|xpAwarded:\s*[1-9]/.test(payoutSource)) throw new Error("Deed Camp payout must not award battle XP.");

requireMatch(serverSource, /DEED_CAMP_HISTORY_LIMIT\s*=\s*10/, "Deed Camp server metadata does not cap reward history at 10 awards.");
requireMatch(firebaseClientSource, /loadRewardCampHistory\(\{[\s\S]*?limitCount\s*=\s*10[\s\S]*?where\("awardedToPlayerId",\s*"==",\s*uid\)[\s\S]*?sort\([\s\S]*?slice\(0, safeLimit\)/, "Client history query is not holder-filtered, ordered, and capped at 10 awards.");
requireMatch(rulesSource, /match \/rewardHistory\/\{entryId\}[\s\S]*?allow read: if signedIn\(\)[\s\S]*?resource\.data\.awardedToPlayerId == request\.auth\.uid;[\s\S]*?allow create, update, delete: if false;/, "Deed Camp history is not restricted to its awarded player.");
requireMatch(clientSource, /Your Rewards/, "Deed Camp UI is missing its player-private rewards tab.");
requireMatch(clientSource, /DEED_CAMP_HISTORY_DISPLAY_LIMIT\s*=\s*10[\s\S]*?function deedCampHistoryMarkup[\s\S]*?slice\(0, DEED_CAMP_HISTORY_DISPLAY_LIMIT\)[\s\S]*?your latest[\s\S]*?city awards/i, "Deed Camp UI does not enforce or explain the private latest-10 award cap.");
requireMatch(clientSource, /data-deed-history-jump[\s\S]*?focusBattleReportTarget/, "Deed Camp history does not provide cross-map city navigation.");
requireMatch(clientSource, /function getDeedCampHistoryCityName[\s\S]*?getCanonicalCityName[\s\S]*?const cityName = getDeedCampHistoryCityName\(entry\)/, "Existing Deed Camp history entries do not resolve canonical city names.");
requireMatch(clientSource, /function renderCampReportRewardMetrics[\s\S]*?renderBattleMetric\("City"[\s\S]*?renderBattleMetric\("Location"/, "Deed Camp report rewards do not show the city and location.");
requireMatch(clientSource, /Capture and hold the Deed Camp for \$\{formatNumber\(holdMinutes\)\} minutes[\s\S]*?any map except Crownlands Heart[\s\S]*?one Deed Camp city per UTC day[\s\S]*?No Deed Token or inventory item is given[\s\S]*?normal neutral-city capture limit still applies/, "Deed Camp help text is incomplete or not driven by its configured timer.");

console.log("Validated Deed Camp placement, all-map random award outside Crownlands Heart, payout authority, history, and capture-limit isolation.");
