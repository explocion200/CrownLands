const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const serverSource = read("functions/index.js");
const clientSource = read("game.js");
const firebaseClientSource = read("firebaseClient.js");
const rulesSource = read("firestore.rules");
const world = JSON.parse(read("functions/world-layout.json"));
const economyConfig = JSON.parse(read("functions/economy-config.json"));

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const relicCamps = world.maps
  .flatMap(map => (map.camps || []).map(camp => ({ ...camp, regionId: map.id })))
  .filter(camp => camp.campType === "items");
if (relicCamps.length !== 1 || relicCamps[0].name !== "Relic Camp") {
  throw new Error("The world layout must contain exactly one named Relic Camp.");
}

const expectedDrops = new Map([
  ["WAR_DRUMS_ITEM_ID", 35],
  ["VEIL_OF_SILENCE_ITEM_ID", 25],
  ["SWIFT_MARCH_ORDER_ITEM_ID", 18],
  ["ROYAL_TAX_DECREE_ITEM_ID", 12],
  ["RECALL_HORN_ITEM_ID", 8],
  ["ROYAL_PEACE_SHIELD_ITEM_ID", 2],
]);
for (const [itemId, chance] of expectedDrops) {
  requireMatch(serverSource, new RegExp(`itemId:\\s*${itemId}[\\s\\S]*?chance:\\s*${chance}`), `Relic Camp drop chance is incorrect for ${itemId}.`);
}
if ([...expectedDrops.values()].reduce((total, chance) => total + chance, 0) !== 100) {
  throw new Error("Relic Camp drop chances must total 100%.");
}

if (!Number.isFinite(Number(economyConfig.camps?.items?.holdMinutes))) {
  throw new Error("Relic Camp hold time is missing from the economy configuration.");
}
if (!Number.isFinite(Number(economyConfig.camps?.items?.maxDailyRewards))) {
  throw new Error("Relic Camp daily reward limit is missing from the economy configuration.");
}
requireMatch(serverSource, /RELIC_CAMP_HOLD_DURATION_MS\s*=\s*economyNumber\("camps\.items\.holdMinutes"/, "Server Relic Camp hold time is not configurable.");
requireMatch(clientSource, /RELIC_CAMP_HOLD_SECONDS\s*=\s*economyNumber\("camps\.items\.holdMinutes"/, "Client Relic Camp hold time is not configurable.");
requireMatch(serverSource, /RELIC_CAMP_DAILY_REWARD_LIMIT\s*=\s*economyNumber\("camps\.items\.maxDailyRewards"/, "Server Relic Camp daily reward limit is not configurable.");
requireMatch(clientSource, /RELIC_CAMP_DAILY_REWARD_LIMIT\s*=\s*economyNumber\("camps\.items\.maxDailyRewards"/, "Client Relic Camp daily reward limit is not configurable.");
requireMatch(serverSource, /items:\s*\{[\s\S]*?kind:\s*"relicCamp"[\s\S]*?rewardType:\s*"item"[\s\S]*?objectiveStatsId:\s*"relicCamp"[\s\S]*?maxDailyRewards:\s*RELIC_CAMP_DAILY_REWARD_LIMIT/, "Relic Camp server configuration is incomplete.");
requireMatch(serverSource, /crypto\.randomInt\(1,\s*totalChance\s*\+\s*1\)/, "Relic Camp item rarity is not rolled on the server.");
requireMatch(serverSource, /function cleanServerCampLayoutSeed\(camp = \{\}\)\s*\{\s*if \(!camp \|\| typeof camp !== "object"\) return \{\};/, "Missing camp seeds can still crash server army launches.");

const payoutStart = serverSource.indexOf("async function resolveRewardCampPayoutByRef");
const payoutEnd = serverSource.indexOf("async function resolveRewardCampPayoutAndStats", payoutStart);
const payoutSource = serverSource.slice(payoutStart, payoutEnd);
requireMatch(payoutSource, /relicDailyLimitReached\s*=\s*isRelicCamp\s*&&\s*priorClaims\s*>=\s*config\.maxDailyRewards/, "Relic Camp does not enforce server-authoritative daily rewards.");
requireMatch(payoutSource, /normalizeShopItems\(player\.shopItems\)[\s\S]*?rewardedShopItems\[relicRewardItem\.itemId\][\s\S]*?\+\s*1/, "Relic Camp payout does not increment the existing bag inventory.");
requireMatch(payoutSource, /rewards:\s*relicRewardsToday[\s\S]*?maxDailyRewards:\s*config\.maxDailyRewards/, "Relic Camp daily reward history is not persisted with its limit.");
requireMatch(payoutSource, /isRelicCamp\s*&&\s*relicDailyLimitReached[\s\S]*?"daily-limit"/, "Relic Camp over-limit hold does not complete with a no-reward daily-limit status.");
requireMatch(payoutSource, /rewardedShopItems\s*\?\s*\{\s*shopItems:\s*rewardedShopItems\s*\}/, "Relic Camp payout does not return updated inventory to the current player.");

requireMatch(firebaseClientSource, /normalizedType\s*===\s*"items"[\s\S]*?"relicCamp"[\s\S]*?rewards:\s*\(Array\.isArray\(data\.rewards\)/, "Relic Camp reward progress is not loaded from the player's server-owned objective stats.");
requireMatch(rulesSource, /match \/objectiveStats\/\{objectiveId\}[\s\S]*?allow read: if ownsPlayerDoc\(uid\);[\s\S]*?allow create, update, delete: if false;/, "Relic Camp objective stats are not private to their player and server-owned.");
requireMatch(clientSource, /function relicCampProgressMarkup[\s\S]*?Possible item drops[\s\S]*?Today's rewards/, "Relic Camp Reward tab is missing its drop table or daily history.");
requireMatch(clientSource, /function relicCampProgressMarkup[\s\S]*?Daily reward limit reached/, "Relic Camp Reward tab is missing its daily-limit message.");
requireMatch(clientSource, /Capture and hold the Relic Camp for \$\{formatNumber\(holdMinutes\)\} minutes[\s\S]*?No relic fragments, gold, troops, battle XP, or leaderboard points[\s\S]*?Royal Peace Shield does not protect camp ownership/, "Relic Camp help text is incomplete or not driven by its configured timer.");
requireMatch(serverSource, /ownerShieldExpiresAtMs:\s*0/, "Reward camps must remain outside Royal Peace Shield protection.");

console.log("Validated Relic Camp placement, server rarity roll, bag payout, UTC daily limit, reward history, protection rules, and themed UI.");
