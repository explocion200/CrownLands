const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClient = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const firebaseConfig = fs.readFileSync(path.join(root, "firebase.json"), "utf8");
const callableAccessCheck = fs.readFileSync(path.join(root, "tools", "validate-clan-callable-access.js"), "utf8");
const showProfileSkillsSource = client.slice(
  client.indexOf("function showProfileSkills()"),
  client.indexOf("function showProfileSettings()")
);

function requires(source, pattern, message) {
  assert.match(source, pattern, message);
}

requires(server, /CLAN_UNLOCK_LEVEL\s*=\s*20/, "Clan unlock must be Hero Level 20.");
requires(server, /CLAN_CREATE_GOLD_COST\s*=\s*100_000/, "Clan creation must cost 100,000 gold.");
requires(server, /CLAN_MEMBER_LIMIT\s*=\s*30/, "Clan member capacity must be 30.");
requires(server, /CLAN_JOIN_COOLDOWN_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, "Clan join cooldown must be 24 hours.");
requires(server, /CLAN_LEADER_INACTIVE_MS\s*=\s*14\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, "Inactive leadership claims must wait 14 days.");

[
  "createClan",
  "updateClanProfile",
  "joinOpenClan",
  "applyToClan",
  "cancelClanApplication",
  "reviewClanApplication",
  "leaveClan",
  "kickClanMember",
  "promoteClanMember",
  "demoteClanOfficer",
  "transferClanLeadership",
  "claimInactiveClanLeadership",
  "disbandClan",
  "sendClanMessage",
  "reportClanMessage",
].forEach(name => requires(server, new RegExp(`exports\\.${name}\\s*=\\s*onCall`), `Missing ${name} callable.`));

requires(firebaseConfig, /postdeploy[\s\S]*?validate-clan-callable-access\.js/, "Function deploys do not verify clan callable access.");
[
  "applyToClan",
  "joinOpenClan",
  "reviewClanApplication",
  "sendClanMessage",
].forEach(name => requires(callableAccessCheck, new RegExp(`"${name}"`), `Callable access check is missing ${name}.`));
requires(callableAccessCheck, /assert\.notEqual\(response\.status,\s*403/, "Callable access check does not detect private Cloud Run services.");
requires(callableAccessCheck, /payload\?\.error\?\.status[\s\S]*?"UNAUTHENTICATED"/, "Callable access check does not verify Firebase authentication.");

requires(server, /safeString\(attackerProfile\.clanId,\s*128\)[\s\S]*?safeString\(defenderPowerData\.clanId,\s*128\)[\s\S]*?cannot scout or attack a clan ally/i, "Army launch does not reject clan allies.");
requires(server, /const becameClanAllies[\s\S]*?outcome:\s*"allied_return"/, "Active armies do not return when their target becomes allied.");
requires(server, /rebuildClanPowerOnPlayerStats\s*=\s*onDocumentWritten/, "Clan King Power is not updated from authoritative player stats.");
requires(server, /function clanIdentitySnapshotFields[\s\S]*?ownerClanIdentityRevision/, "Clan asset snapshots do not store a monotonic clan identity revision.");
requires(server, /syncClanIdentityOnMembershipChange\s*=\s*onDocumentWritten[\s\S]*?latestProfile\.clanIdentityRevision/, "Clan membership changes do not trigger durable identity propagation.");
requires(server, /clanIdentityRevisionPatch\(nowMs\)/, "Clan membership transactions do not advance the clan identity revision.");
requires(server, /cleanupClanMessages\s*=\s*onSchedule[\s\S]*?index >= 500[\s\S]*?expiresAtMs/, "Clan chat retention is not capped at 500 messages and 30 days.");
requires(server, /function normalizeClanShield[\s\S]*?CLAN_SHIELD_SHAPES[\s\S]*?CLAN_SHIELD_DIVISIONS[\s\S]*?CLAN_SHIELD_CHARGES/, "Clan shield schema is not validated server-side.");
requires(server, /exports\.updateClanProfile[\s\S]*?assertClanRole\(memberSnap\.data\(\), \["leader"\]\)[\s\S]*?const shield = normalizeClanShield/, "Clan shield edits are not leader-only.");
requires(server, /writeClanLeaderboard[\s\S]*?shield,[\s\S]*?banner:\s*clanShieldLegacyBanner/, "Clan leaderboard snapshots do not include heraldic shields.");

requires(rules, /match \/clans\/\{clanId\}[\s\S]*?allow create, update, delete: if false;/, "Clan writes must be server-owned.");
requires(rules, /match \/clans\/\{clanId\}[\s\S]*?allow read: if signedIn\(\)(?:\s*&&\s*isCurrentGeneration\(resource\.data\))?;/, "Signed-in nonmembers cannot view public clan identities and shields.");
requires(rules, /match \/messages\/\{messageId\}[\s\S]*?allow read: if clanMember\(clanId\)(?:\s*&&\s*isCurrentGeneration\(resource\.data\))?;[\s\S]*?allow create, update, delete: if false;/, "Clan chat rules are not membership-gated and server-owned.");
requires(rules, /profileFieldUnchanged\('clanId'\)/, "Players can mutate canonical clan membership directly.");
requires(rules, /profileFieldUnchanged\('clanIdentityRevision'\)/, "Players can mutate the server-owned clan identity revision.");

requires(firebaseClient, /createClan[\s\S]*?joinOpenClan[\s\S]*?reviewClanApplication[\s\S]*?sendClanMessage/, "Firebase client does not expose the clan callables.");
requires(firebaseClient, /subscribeClanMessages/, "Firebase client is missing realtime clan chat.");
requires(firebaseClient, /dispatch\("player-clan"[\s\S]*?function subscribeClanState[\s\S]*?snapshot\.docChanges\(\)/, "Firebase client is missing event-driven player and roster clan updates.");
requires(html, /id="clanTabBtn"[\s\S]*?id="clanView"/, "Profile UI is missing its Clan tab.");
requires(html, /id="leaderboardBtn"[\s\S]*?id="clanHudBtn"/, "The Clan HUD button is not beside the leaderboard.");
requires(html, /id="profileKingdomFlag"[\s\S]*?id="profileClanAffiliation"/, "Player profiles do not keep clan shields separate from kingdom flags.");
requires(client, /function isClanAllyCity[\s\S]*?function getClanFriendlyBlockReason/, "Client is missing clan-allied city detection.");
requires(client, /clanRosterReady[\s\S]*?clanMemberUidSet\.has/, "Allied-city rendering does not use the event-maintained clan member UID set.");
requires(client, /function applyClanMembersSnapshot[\s\S]*?\["added", "removed"\][\s\S]*?refreshClanRelationshipPresentation/, "Roster events do not refresh allied cities only when membership changes.");
requires(client, /function showClanHub[\s\S]*?showProfileClan\(\)/, "The Clan HUD button does not open the Clan area directly.");
requires(showProfileSkillsSource, /clanView\.hidden\s*=\s*true;/, "Switching from Clan to Skills does not hide the Clan panel.");
requires(client, /function renderProfileClanAffiliation[\s\S]*?renderClanShield/, "Player profiles do not render a separate clan shield affiliation.");
requires(client, /clanSearchResults\.map\(clan =>[\s\S]*?renderClanShield\(clan\.shield \|\| clan\.banner/, "Clan discovery results do not show each clan's public shield.");
requires(client, /function showPublicPlayerProfile[\s\S]*?api\.loadClan\(profile\.clanId\)[\s\S]*?profile\.clanShield[\s\S]*?renderPublicPlayerProfile\(profile\)/, "Public player profiles do not load and display clan shields for nonmember viewers.");
requires(client, /btn\.classList\.add\("clan-ally"\)/, "Allied cities do not receive their map class.");
requires(client, /You cannot scout or attack a clan ally/, "Clan-friendly action explanation is missing.");
requires(client, /function renderClanShield[\s\S]*?renderClanShieldField[\s\S]*?renderClanShieldCharges/, "Client is missing the vector clan shield renderer.");
requires(client, /data-clan-action="edit-shield"/, "Leader clan shield editor entry point is missing.");
requires(client, /function saveClanShieldEditor[\s\S]*?updateClanProfile\(\{\s*shield\s*\}\)[\s\S]*?result\?\.clan\?\.shield[\s\S]*?clanSnapshot\s*=\s*\{[\s\S]*?savedShield/, "Clan shield editor does not retain the server-confirmed saved shield.");
requires(client, /data-clan-action="shield-tab"[\s\S]*?data-shield-panel="field"[\s\S]*?data-shield-panel="colors"[\s\S]*?data-shield-panel="charges"[\s\S]*?data-shield-panel="details"/, "Mobile clan shield editor tabs are incomplete.");
requires(client, /CLAN_SHIELD_SHAPES[\s\S]*?CLAN_SHIELD_DIVISIONS[\s\S]*?CLAN_SHIELD_CHARGES[\s\S]*?CLAN_SHIELD_FINISHES/, "Clan shield editor options are incomplete.");
requires(styles, /\.city-node\.clan-ally \.city-ring[\s\S]*?\.clan-ally-label/, "Green accessible allied-city styling is missing.");
requires(client, /const clanAllyStatus = clanAlly[\s\S]*?<span class="clan-ally-label">Clan Ally<\/span>[\s\S]*?const rivalOwnerRow[\s\S]*?city-ruler-row[\s\S]*?crownBadge[\s\S]*?\$\{clanAllyStatus\}[\s\S]*?<strong class="city-name">/, "City labels do not show ruler, optional Clan Ally status, Citadel crown, and city name in the required order.");
assert.doesNotMatch(client, /foreign-ruler-name foreign-ruler-name-inline"\)\}\$\{clanIdentity\.clanTag/, "Floating city labels must not insert clan tags between the ruler name and Clan Ally status.");
requires(styles, /\.clan-hud-btn[\s\S]*?\.profile-clan-affiliation/, "Clan HUD and profile shield styling is missing.");
requires(styles, /\.clan-shield-size-editor[\s\S]*?\.clan-shield-editor-controls[\s\S]*?\.clan-shield-swatch-grid/, "Clan shield editor styling is missing.");
requires(styles, /\.clan-content\.shield-editor-open[\s\S]*?\.clan-shield-editor-preview[\s\S]*?\.clan-shield-editor-workspace[\s\S]*?\.clan-shield-editor-controls[\s\S]*?overflow-y:\s*auto/, "Mobile shield editor does not keep a fixed preview beside scrollable controls.");

console.log("Validated clan gates, event-driven roster updates, revisioned identity propagation, HUD access, profiles, friendly combat, chat, rankings, allied-city UI, and leader-owned heraldic shields.");
