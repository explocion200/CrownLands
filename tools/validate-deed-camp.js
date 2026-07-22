const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const firestoreIndexes = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"));
const worldLayout = JSON.parse(fs.readFileSync(path.join(root, "functions", "world-layout.json"), "utf8"));

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
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
requireMatch(serverSource, /DEED_CAMP_HOLD_DURATION_MS\s*=\s*60\s*\*\s*60\s*\*\s*1000/, "Server Deed Camp hold time is not one hour.");
requireMatch(clientSource, /DEED_CAMP_HOLD_SECONDS\s*=\s*60\s*\*\s*60/, "Client Deed Camp hold time is not one hour.");
requireMatch(serverSource, /deed:\s*\{[\s\S]*?objectiveStatsId:\s*"deedCamp"/, "Deed Camp is missing its per-player daily claim record.");
requireMatch(serverSource, /deedDailyLimitReached\s*=\s*isDeedCamp\s*&&\s*priorClaims\s*>=\s*1/, "Deed Camp is not limited to one city award per player per UTC day.");
requireMatch(serverSource, /status:\s*isDeedCamp[\s\S]*?"daily-limit"[\s\S]*?"no-eligible-city"/, "Deed Camp payout does not report its daily limit cleanly.");
requireMatch(serverSource, /findEligibleDeedCampCity[\s\S]*?getServerWorldRegularCityIds[\s\S]*?where\("ownerUid",\s*"==",\s*null\)/, "Deed Camp payout is not using a bounded neutral-city query.");
requireMatch(serverSource, /getDeedCampCandidateRegionIds[\s\S]*?mapType === "starter" \|\| mapType === "midgame"/, "Deed Camp fallback regions are not restricted to connected activity maps.");
requireMatch(serverSource, /missingTargetCamp[\s\S]*?getAuthoritativeRewardCampSeed[\s\S]*?transaction\.set\(targetRef,[\s\S]*?missingTargetCamp/, "Missing authoritative camp documents are not repaired before an army launches.");

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
requireMatch(payoutSource, /rewardHistory\//, "Deed Camp payout does not create a public history entry.");
requireMatch(payoutSource, /!deedCityPatch[\s\S]*?"no-eligible-city"/, "Deed Camp has no safe no-city payout result.");
if (/neutralCaptures/.test(payoutSource)) throw new Error("Deed Camp payout must not use the normal neutral capture counter.");
if (/buildPlayerProgressPatch|xpAwarded:\s*[1-9]/.test(payoutSource)) throw new Error("Deed Camp payout must not award battle XP.");

requireMatch(firebaseClientSource, /loadRewardCampHistory\(\{[\s\S]*?limitCount\s*=\s*25[\s\S]*?orderBy\("awardedAtMs",\s*"desc"\)/, "Client history query is not ordered and bounded.");
requireMatch(rulesSource, /match \/rewardHistory\/\{entryId\}[\s\S]*?allow read: if signedIn\(\);[\s\S]*?allow create, update, delete: if false;/, "Deed Camp history is not publicly readable and server-owned.");
requireMatch(clientSource, /Reward History/, "Deed Camp UI is missing its public Reward History tab.");
requireMatch(clientSource, /data-deed-history-jump[\s\S]*?focusBattleReportTarget/, "Deed Camp history does not provide cross-map city navigation.");
requireMatch(clientSource, /Capture and hold the Deed Camp for 1 hour[\s\S]*?one Deed Camp city per UTC day[\s\S]*?No Deed Token or inventory item is given[\s\S]*?normal neutral-city capture limit still applies/, "Deed Camp help text is incomplete.");

console.log("Validated Deed Camp placement, payout authority, neutral-city award, public history, navigation, and capture-limit isolation.");
