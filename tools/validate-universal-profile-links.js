const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const firebaseClient = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const styles = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}`;
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "functions", "package.json"), "utf8"));

function requires(source, pattern, message) {
  assert.match(source, pattern, message);
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

requires(
  client,
  /function renderPlayerNameLink[\s\S]*?role="button"[\s\S]*?tabindex="0"[\s\S]*?data-player-profile-uid/,
  "Player identity links are not standardized on the public-player route."
);
requires(
  client,
  /function renderClanIdentityLink[\s\S]*?data-public-clan-id[\s\S]*?type="button"/,
  "Clan identity links are not standardized on the public-clan route."
);
requires(
  client,
  /document\.addEventListener\("click"[\s\S]*?\[data-player-profile-uid\][\s\S]*?stopPropagation\(\)[\s\S]*?\[data-public-clan-id\]/,
  "Delegated identity navigation does not isolate links from parent controls."
);
requires(
  client,
  /document\.addEventListener\("keydown"[\s\S]*?event\.key !== "Enter" && event\.key !== " "[\s\S]*?\[data-player-profile-uid\]/,
  "Non-button player identity links are not keyboard operable."
);
requires(styles, /\.player-name-link:focus-visible[\s\S]*?outline:\s*2px/, "Player links lack a visible keyboard focus indicator.");
requires(styles, /\.clan-name-link:focus-visible[\s\S]*?outline:\s*2px/, "Clan text links lack a visible keyboard focus indicator.");
requires(styles, /\.clan-shield-link:focus-visible[\s\S]*?outline:\s*2px/, "Clan shield links lack a visible keyboard focus indicator.");

const roster = between(client, "function renderClanRosterMember", "function renderClanMembersPanel");
requires(roster, /class="clan-member-select"[\s\S]*?data-clan-action="select-member"/, "Leader roster names no longer open inline management.");
requires(roster, /class="clan-member-profile-link"[\s\S]*?data-player-profile-uid/, "Leader roster management lacks View Profile.");

const floatingCityLabels = between(client, "function renderCities", "function renderScoutNearbyRadius");
assert.doesNotMatch(
  floatingCityLabels,
  /renderPlayerNameLink|data-player-profile-uid|player-name-link/,
  "Floating player names above cities must remain plain, non-interactive text."
);
requires(
  floatingCityLabels,
  /city-ruler-row[\s\S]*?escapeHtml\(ownerName\)[\s\S]*?escapeHtml\(state\.playerName\)/,
  "Floating city labels no longer render escaped ruler names."
);

[
  ["function showPublicClanDetails", "function getPlayerIdentitySignature", /renderPlayerNameLink\(member\.uid \|\| member\.id/, "Public clan roster names are not linked."],
  ["function renderClanRallyCard", "function confirmClanRallyAction", /renderPlayerNameLink\(participant\.uid \|\| participant\.ownerUid[\s\S]*?renderPlayerNameLink\(rally\.leaderUid/, "Rally participants or leader are not linked."],
  ["function confirmClanRallyAction", "async function runClanRallyAction", /renderPlayerNameLink\(participant\.uid \|\| participant\.ownerUid/, "Rally confirmation participants are not linked."],
  ["function showRewardCampInfoModal", "function showScoutReportModal", /renderPlayerNameLink\(controllerUid/, "Reward-camp holders are not linked."],
  ["function showScoutReportModal", "function scoutBreakdownRow", /renderPlayerNameLink\(currentPlayerUid[\s\S]*?renderPlayerNameLink\(reportedOwnerUid/, "Detailed scout identities are not linked."],
  ["function crownCitadelReignLeaderboardMarkup", "function renderHoldingReinforcementPanel", /renderPlayerNameLink\(entry\.playerId/, "Citadel reign rulers are not linked."],
  ["function renderHoldingReinforcementPanel", "function bindHoldingReinforcementButtons", /renderPlayerNameLink\(entry\.ownerUid/, "Stationed reinforcement owners are not linked."],
  ["function renderIncomingAttackCard", "async function focusIncomingAttackCity", /renderPlayerNameLink\(attack\.ownerUid/, "Incoming army owners are not linked."],
  ["function renderReinforcementOperationCard", "function renderHeldCampsOperationPanel", /renderPlayerNameLink\(entry\.ownerUid[\s\S]*?renderPlayerNameLink\(entry\.targetOwnerUid/, "Reinforcement activity identities are not linked."],
  ["function renderOutgoingAttackCard", "async function focusOutgoingMarchLocation", /renderPlayerNameLink\(city\.ownerUid/, "Outgoing march target owners are not linked."],
  ["function renderBattleReportCard", "function applyBattleReportTargetFlags", /renderPlayerNameLink\(report\.opponentUid/, "Compact battle opponents are not linked."],
  ["function renderBattleHeroSide", "function renderBattleReportHero", /renderPlayerNameLink\(primary\.ownerUid,\s*primary\.ownerName/, "Visual battle sides do not link their primary rulers."],
].forEach(([start, end, pattern, message]) => requires(between(client, start, end), pattern, message));

requires(client, /function deedCampHistoryMarkup[\s\S]*?renderPlayerNameLink\(entry\.awardedToPlayerId/, "Deed Camp reward recipients are not linked.");
requires(client, /function showCityInfoModal[\s\S]*?renderPlayerNameLink\(city\.ownerUid/, "City and objective owners are not linked.");
requires(client, /function renderLeaderboardRow[\s\S]*?renderPlayerNameLink\(entry\.uid/, "Player leaderboard names are not linked.");

requires(client, /function renderProfileClanAffiliation[\s\S]*?dataset\.publicClanId\s*=\s*state\.clanId/, "The current player's clan affiliation does not open its public page.");
requires(client, /function renderClanOverviewPanel[\s\S]*?clan-hero-shield-link[\s\S]*?renderClanIdentityLink/, "The current clan Overview shield or identity is not linked.");
requires(client, /clanSearchResults\.map\(clan =>[\s\S]*?clan-shield-link[\s\S]*?renderClanIdentityLink/, "Clan discovery shield or identity is not linked.");
requires(client, /function renderObjectiveClanAffiliation[\s\S]*?data-public-clan-id/, "Objective clan identities are not linked.");
assert.doesNotMatch(client, /function renderBattleClanIdentity/, "Compact battle details still render removed clan branding.");
requires(client, /function normalizeLeaderboardEntry[\s\S]*?clanId[\s\S]*?clanName[\s\S]*?clanTag/, "Leaderboard normalizers discard canonical clan identity.");
requires(client, /function renderLeaderboardRow[\s\S]*?renderClanIdentityLink\([\s\S]*?display:\s*"tag"/, "Player leaderboard clan tags are not linked.");
requires(client, /async function refreshClanLeaderboardRows[\s\S]*?clan-leaderboard-shield-link[\s\S]*?renderClanIdentityLink/, "Clan leaderboard shield, tag, or name is not linked.");
requires(firebaseClient, /function cleanLeaderboardEntry[\s\S]*?clanId[\s\S]*?clanName[\s\S]*?clanTag/, "Firebase leaderboard compatibility drops clan identity fields.");

requires(server, /function makeReport\(\{[\s\S]*?opponentUid\s*=\s*""[\s\S]*?opponentUid:\s*safeString\(opponentUid,\s*128\)/, "Authoritative compact reports do not preserve opponent UIDs.");
requires(client, /function normalizeBattleReports[\s\S]*?opponentUid:\s*String\(report\.opponentUid/, "The client report normalizer drops opponent UIDs.");
requires(server, /reinforcementBattleReceipts[\s\S]*?opponentUid:\s*attackerUid/, "Reinforcement contributor receipts do not preserve the attacker UID.");
requires(server, /receiptKind:\s*"rally_battle"[\s\S]*?opponentUid:\s*defenderUid/, "Rally contributor receipts do not preserve the defender UID.");
requires(server, /settleReinforcementBattleReceipt[\s\S]*?opponentUid:\s*receipt\.opponentUid/, "Reinforcement contributor reports drop the opponent UID.");
requires(server, /settleRallyBattleReceipt[\s\S]*?opponentUid:\s*receipt\.opponentUid/, "Rally contributor reports drop the opponent UID.");

const namedOpponentLines = server.split(/\r?\n/).flatMap((line, index, lines) => (
  /opponentName:\s*(?:attackerName|defenderName|defenderUid\s*\?)/.test(line)
    ? [{ line, context: lines.slice(Math.max(0, index - 8), index + 1).join("\n") }]
    : []
));
assert(namedOpponentLines.length >= 18, "Expected authoritative player-opponent report constructors were not found.");
namedOpponentLines.forEach(({ line, context }) => {
  assert.match(context, /opponentUid:/, `A player report/receipt lacks opponentUid near: ${line.trim()}`);
});

assert.doesNotMatch(
  between(client, "function renderPublicPlayerProfile", "async function showPublicPlayerProfile"),
  /data-player-profile-uid/,
  "The public player page's own heading became self-interactive."
);
requires(
  between(client, "async function showPublicClanDetails", "function getPlayerIdentitySignature"),
  /class="public-clan-identity"[\s\S]*?renderClanShield\([\s\S]*?<h3>\[\$\{escapeHtml\(clan\.tag/,
  "The public clan page's own heading should remain a plain destination heading."
);

assert.ok(
  packageJson.scripts.test.includes("validate-universal-profile-links.js"),
  "The universal identity-link validator is not in the Functions validation suite."
);

console.log("Validated universal player/clan identity routes, interaction isolation, report UIDs, legacy fallbacks, and accessibility styling.");
