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
const firestoreIndexes = fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8");
const callableAccessCheck = fs.readFileSync(path.join(root, "tools", "validate-clan-callable-access.js"), "utf8");
const showProfileSkillsSource = client.slice(
  client.indexOf("function showProfileSkills()"),
  client.indexOf("function showProfileSettings()")
);
const updateArmyTokenElementSource = client.slice(
  client.indexOf("function updateArmyTokenElement("),
  client.indexOf("function hasRenderableArmyWork()")
);

function requires(source, pattern, message) {
  assert.match(source, pattern, message);
}

requires(server, /CLAN_UNLOCK_LEVEL\s*=\s*10/, "Clan unlock must be Hero Level 10.");
requires(server, /CLAN_CREATE_GOLD_COST\s*=\s*100_000/, "Clan creation must cost 100,000 gold.");
requires(server, /CLAN_NAME_CHANGE_GOLD_COST\s*=\s*500_000/, "Clan renaming must cost 500,000 gold.");
requires(server, /CLAN_NAME_CHANGE_COOLDOWN_MS\s*=\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, "Clan renaming must have a seven-day cooldown.");
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
  "sendClanGift",
  "claimClanGiftPool",
  "claimClanQuestReward",
].forEach(name => requires(server, new RegExp(`exports\\.${name}\\s*=\\s*onCall`), `Missing ${name} callable.`));

requires(firebaseConfig, /postdeploy[\s\S]*?validate-clan-callable-access\.js/, "Function deploys do not verify clan callable access.");
[
  "applyToClan",
  "joinOpenClan",
  "reviewClanApplication",
  "sendClanGift",
  "claimClanGiftPool",
  "claimClanQuestReward",
].forEach(name => requires(callableAccessCheck, new RegExp(`"${name}"`), `Callable access check is missing ${name}.`));
requires(callableAccessCheck, /assert\.notEqual\(response\.status,\s*403/, "Callable access check does not detect private Cloud Run services.");
requires(callableAccessCheck, /payload\?\.error\?\.status[\s\S]*?"UNAUTHENTICATED"/, "Callable access check does not verify Firebase authentication.");

requires(server, /safeString\(attackerProfile\.clanId,\s*128\)[\s\S]*?safeString\(defenderPowerData\.clanId,\s*128\)[\s\S]*?cannot scout or attack a clan ally/i, "Army launch does not reject clan allies.");
requires(server, /const becameClanAllies[\s\S]*?createAlliedTargetReturnMovement\(army,\s*nowMs\)[\s\S]*?status:\s*"returning"[\s\S]*?outcome:\s*"allied_return_started"/, "Active armies do not begin a routed return when their target becomes allied.");
requires(server, /rebuildClanPowerOnPlayerStats\s*=\s*onDocumentWritten/, "Clan King Power is not updated from authoritative player stats.");
requires(server, /function clanIdentitySnapshotFields[\s\S]*?ownerClanIdentityRevision/, "Clan asset snapshots do not store a monotonic clan identity revision.");
requires(server, /syncClanIdentityOnMembershipChange\s*=\s*onDocumentWritten[\s\S]*?latestProfile\.clanIdentityRevision/, "Clan membership changes do not trigger durable identity propagation.");
requires(server, /clanIdentityRevisionPatch\(nowMs\)/, "Clan membership transactions do not advance the clan identity revision.");
requires(server, /CLAN_GIFT_COOLDOWN_MS\s*=\s*5\s*\*\s*60\s*\*\s*60\s*\*\s*1000[\s\S]*?CLAN_GIFT_PRODUCTION_MINUTES\s*=\s*30/, "Clan gift cadence must be 30 production minutes every five hours.");
requires(server, /CLAN_QUEST_REWARDS\s*=\s*Object\.freeze\(\[[\s\S]*?captures:\s*25[\s\S]*?productionMinutes:\s*30[\s\S]*?captures:\s*2000[\s\S]*?rewardType:\s*"troops"[\s\S]*?productionMinutes:\s*360/, "Clan conquest rewards do not contain the approved 10-tier weekly track.");
requires(server, /exports\.sendClanGift[\s\S]*?memberDoc\.id\s*!==\s*uid[\s\S]*?FieldValue\.increment\(CLAN_GIFT_PRODUCTION_MINUTES\)/, "Clan gifts do not exclude the sender and fan out 30 production minutes.");
requires(server, /exports\.claimClanGiftPool[\s\S]*?getRewardedAdBaseRates\(economy\)\.goldPerHour[\s\S]*?pendingGiftGoldMinutes:\s*0/, "Clan gift collection does not use current permanent base gold production and clear the pool.");
requires(server, /exports\.claimClanQuestReward[\s\S]*?joinedAtMs\s*>=\s*unlockedAtMs[\s\S]*?getRewardedAdBaseRates\(economy\)[\s\S]*?creditLevelUpTroopsToMainCity/, "Clan quest claims do not enforce unlock eligibility and current base production rewards.");
requires(server, /function recordClanConquest[\s\S]*?targetType\s*!==\s*"city"[\s\S]*?safeString\(change\.reason,\s*64\)\s*!==\s*"city_captured"[\s\S]*?!beforeOwnerUid[\s\S]*?clanQuestCaptureReceiptRef[\s\S]*?receiptSnap\.exists/, "Clan conquest capture processing is not filtered and receipt-idempotent.");
requires(server, /async function removeClanMember[\s\S]*?assertClanRole\(actor,\s*\["leader"\]\)[\s\S]*?transaction\.delete\(clanMemberRewardsRef\(clanId,\s*targetUid\)\)/, "Clan removal must be leader-only and forfeit the departing member's rewards.");
assert.doesNotMatch(server, /exports\.(?:sendClanMessage|reportClanMessage|cleanupClanMessages)\s*=/, "Retired clan chat Functions are still exported.");
requires(server, /function normalizeClanShield[\s\S]*?CLAN_SHIELD_SHAPES[\s\S]*?CLAN_SHIELD_DIVISIONS[\s\S]*?CLAN_SHIELD_CHARGES/, "Clan shield schema is not validated server-side.");
requires(server, /exports\.updateClanProfile[\s\S]*?assertClanRole\(memberSnap\.data\(\), \["leader"\]\)[\s\S]*?const shield = normalizeClanShield/, "Clan shield edits are not leader-only.");
requires(server, /exports\.updateClanProfile[\s\S]*?nameChanged[\s\S]*?getClanNameChangeCooldownUntilMs\(clan\)[\s\S]*?prepareEconomyCollection[\s\S]*?CLAN_NAME_CHANGE_GOLD_COST[\s\S]*?writePreparedEconomy/, "Clan renaming is not charging authoritative gold behind the weekly leader gate.");
requires(server, /exports\.updateClanProfile[\s\S]*?clanNameReservationRef\(requestedName\.normalized\)[\s\S]*?already in use[\s\S]*?clanNameReservationRef\(clan\.normalizedName\)[\s\S]*?CLAN_RESERVATION_RELEASE_MS/, "Clan renaming does not transactionally reserve the new name and release the previous one.");
requires(server, /exports\.updateClanProfile[\s\S]*?membersSnap\.docs\.forEach[\s\S]*?clanName:\s*requestedName\.display[\s\S]*?clanIdentityRevisionPatch\(nowMs\)[\s\S]*?writeClanLeaderboard/, "Clan renaming does not propagate the canonical identity to members and leaderboard snapshots.");
requires(server, /writeClanAudit\(transaction,\s*clanId,\s*uid,\s*"clan_renamed"[\s\S]*?goldCost:\s*CLAN_NAME_CHANGE_GOLD_COST/, "Clan renaming does not create a cost-bearing audit event.");
requires(server, /writeClanLeaderboard[\s\S]*?shield,[\s\S]*?banner:\s*clanShieldLegacyBanner/, "Clan leaderboard snapshots do not include heraldic shields.");

requires(rules, /match \/clans\/\{clanId\}[\s\S]*?allow create, update, delete: if false;/, "Clan writes must be server-owned.");
requires(rules, /match \/clans\/\{clanId\}[\s\S]*?allow read: if signedIn\(\)(?:\s*&&\s*isCurrentGeneration\(resource\.data\))?;/, "Signed-in nonmembers cannot view public clan identities and shields.");
requires(rules, /match \/questProgress\/\{periodId\}[\s\S]*?allow get: if clanMember\(clanId\)[\s\S]*?resource\.data\.questPeriodId == periodId[\s\S]*?request\.time\s*<\s*resource\.data\.weekEndAt[\s\S]*?allow list: if false[\s\S]*?allow create, update, delete: if false;/, "Current clan members cannot safely read only the active weekly quest progress.");
requires(rules, /match \/memberRewards\/\{uid\}[\s\S]*?request\.auth\.uid == uid[\s\S]*?allow create, update, delete: if false;/, "Clan reward state is not restricted to its member.");
requires(rules, /match \/questCaptureReceipts\/\{eventId\}[\s\S]*?allow read, create, update, delete: if false;/, "Clan capture receipts are not server-only.");
requires(rules, /match \/messages\/\{messageId\}[\s\S]*?allow read, create, update, delete: if false;/, "Legacy clan messages are still accessible.");
requires(rules, /profileFieldUnchanged\('clanId'\)/, "Players can mutate canonical clan membership directly.");
requires(rules, /profileFieldUnchanged\('clanIdentityRevision'\)/, "Players can mutate the server-owned clan identity revision.");

requires(firebaseClient, /createClan[\s\S]*?joinOpenClan[\s\S]*?reviewClanApplication[\s\S]*?sendClanGift[\s\S]*?claimClanGiftPool[\s\S]*?claimClanQuestReward/, "Firebase client does not expose clan membership, gift, and quest callables.");
requires(firebaseClient, /function subscribeClanSocialState[\s\S]*?memberRewards[\s\S]*?worldBenefits[\s\S]*?function subscribeClanQuestProgress/, "Firebase client is missing realtime clan gift and benefit state.");
requires(firebaseClient, /function subscribeClanQuestProgress[\s\S]*?questPeriodId[\s\S]*?questProgress[\s\S]*?onSnapshot/, "Firebase client is missing separate realtime weekly quest state.");
assert.doesNotMatch(firebaseClient, /sendClanMessage|reportClanMessage|subscribeClanMessages/, "Firebase client still exposes retired clan chat APIs.");
requires(firebaseClient, /function subscribeClanApplications[\s\S]*?where\("resetGeneration",\s*"==",\s*RESET_GENERATION\)[\s\S]*?where\("worldId",\s*"==",\s*ONLINE_WORLD_ID\)[\s\S]*?where\("status",\s*"==",\s*"pending"\)[\s\S]*?onSnapshot/, "Clan managers do not have a rule-compatible realtime application inbox.");
requires(firebaseClient, /async function loadClanApplications[\s\S]*?where\("resetGeneration",\s*"==",\s*RESET_GENERATION\)[\s\S]*?where\("worldId",\s*"==",\s*ONLINE_WORLD_ID\)/, "The clan application fallback query does not prove current-realm access to Firestore rules.");
requires(firestoreIndexes, /"collectionGroup":\s*"applications"[\s\S]*?"fieldPath":\s*"resetGeneration"[\s\S]*?"fieldPath":\s*"worldId"[\s\S]*?"fieldPath":\s*"status"[\s\S]*?"fieldPath":\s*"createdAtMs"/, "Clan applications are missing their current-realm manager inbox index.");
requires(firebaseClient, /async function loadClanMembers[\s\S]*?where\("resetGeneration",\s*"==",\s*RESET_GENERATION\)[\s\S]*?where\("worldId",\s*"==",\s*ONLINE_WORLD_ID\)[\s\S]*?orderBy\("joinedAtMs"/, "Public clan rosters do not use a rule-compatible current-realm member query.");
requires(firebaseClient, /function subscribeClanState[\s\S]*?collection\(client\.db,\s*"clans",\s*safeClanId,\s*"members"\)[\s\S]*?where\("resetGeneration",\s*"==",\s*RESET_GENERATION\)[\s\S]*?where\("worldId",\s*"==",\s*ONLINE_WORLD_ID\)/, "The live clan member listener does not prove current-realm access to Firestore rules.");
requires(firestoreIndexes, /"collectionGroup":\s*"members"[\s\S]*?"fieldPath":\s*"resetGeneration"[\s\S]*?"fieldPath":\s*"worldId"[\s\S]*?"fieldPath":\s*"joinedAtMs"/, "Clan member rosters are missing their current-realm joined-date index.");
requires(firebaseClient, /dispatch\("player-clan"[\s\S]*?function subscribeClanState[\s\S]*?snapshot\.docChanges\(\)/, "Firebase client is missing event-driven player and roster clan updates.");
requires(html, /id="clanTabBtn"[\s\S]*?id="clanView"/, "Profile UI is missing its Clan tab.");
requires(html, /id="leaderboardBtn"[\s\S]*?id="clanHudBtn"/, "The Clan HUD button is not beside the leaderboard.");
requires(html, /id="profileKingdomFlag"[\s\S]*?id="profileClanAffiliation"/, "Player profiles do not keep clan shields separate from kingdom flags.");
requires(client, /function isClanAllyCity[\s\S]*?function getClanFriendlyBlockReason/, "Client is missing clan-allied city detection.");
requires(client, /clanRosterReady[\s\S]*?clanMemberUidSet\.has/, "Allied-city rendering does not use the event-maintained clan member UID set.");
requires(client, /function applyClanMembersSnapshot[\s\S]*?\["added", "removed"\][\s\S]*?refreshClanRelationshipPresentation/, "Roster events do not refresh allied cities only when membership changes.");
requires(client, /function isCurrentClanmateArmy[\s\S]*?clanMemberUidSet\.has\(ownerUid\)[\s\S]*?identity\?\.clanId/, "Allied march paths do not use current event-driven clan membership with an identity fallback.");
requires(client, /function getArmyRouteRelationshipClass[\s\S]*?player-route[\s\S]*?enemy-route[\s\S]*?mission\?\.returning[\s\S]*?mission\?\.reinforcementReturn[\s\S]*?mission\?\.campReturn[\s\S]*?mission\?\.kind === "transfer"[\s\S]*?mission\?\.kind === "reinforce"[\s\S]*?clan-support-route[\s\S]*?clan-hostile-route/, "March relationship classification does not distinguish personal, enemy, allied support/returns, and allied hostile routes.");
requires(client, /function renderPaths[\s\S]*?getArmyRouteRelationshipClass\(attack\)[\s\S]*?classList\.add\("army-route-ribbon", ownerClass, kindClass\)[\s\S]*?classList\.add\("army-route-flow", ownerClass, kindClass\)/, "Rendered route ribbons and flows do not use the current clan relationship class.");
requires(client, /function refreshClanRelationshipPresentation[\s\S]*?pathRenderSignature\s*=\s*""[\s\S]*?renderPaths\(\)/, "Clan membership events do not immediately invalidate and redraw march paths.");
assert.doesNotMatch(updateArmyTokenElementSource, /clan-support-route|clan-hostile-route|isCurrentClanmateArmy/, "Clan path colors must not recolor moving army markers.");
requires(client, /function showClanHub[\s\S]*?showProfileClan\(\)/, "The Clan HUD button does not open the Clan area directly.");
requires(client, /CLAN_MOBILE_SECTIONS\s*=\s*Object\.freeze\(\["overview",\s*"warroom",\s*"rewards",\s*"members"\]\)[\s\S]*?activeClanMobileSection\s*=\s*"overview"/, "The mobile clan hub is missing its four-section state.");
requires(client, /function showProfileClan\(\)[\s\S]*?enteringClan[\s\S]*?activeClanMobileSection\s*=\s*"overview"/, "Opening the Clan area does not reset mobile navigation to Overview.");
requires(client, /function handleOnlinePlayerClanSnapshot[\s\S]*?previousClanId\s*!==\s*state\.clanId[\s\S]*?activeClanMobileSection\s*=\s*"overview"/, "Changing clans does not reset mobile navigation to Overview.");
requires(
  client,
  /function renderClanSectionNavigation[\s\S]*?key:\s*"overview"[\s\S]*?key:\s*"warroom"[\s\S]*?key:\s*"rewards"[\s\S]*?key:\s*"members"[\s\S]*?role="tablist"[\s\S]*?data-clan-section="\$\{section\.key\}"[\s\S]*?aria-selected[\s\S]*?aria-controls/,
  "The mobile clan section bar is incomplete or missing accessible tab state."
);
requires(
  client,
  /id="clanOverviewPanel"[\s\S]*?role="tabpanel"[\s\S]*?id="clanMembersPanel"[\s\S]*?role="tabpanel"[\s\S]*?id="clanRewardsPanel"[\s\S]*?role="tabpanel"[\s\S]*?id="clanWarroomPanel"[\s\S]*?role="tabpanel"/,
  "The clan Overview, Members, War Room, and Rewards panels are not exposed as tab panels."
);
requires(client, /function renderClanOverviewPanel[\s\S]*?<span>War Room<\/span>[\s\S]*?Gold gifts[\s\S]*?Weekly conquest[\s\S]*?Roster/, "The clan Overview is missing its four activity summaries.");
requires(
  client,
  /CLAN_BROWSER_SECTIONS\s*=\s*Object\.freeze\(\["discover",\s*"create"\]\)[\s\S]*?function renderClanBrowserNavigation[\s\S]*?key:\s*"discover"[\s\S]*?key:\s*"create"[\s\S]*?data-clan-browser-section="\$\{section\.key\}"[\s\S]*?id="clanBrowserCreatePanel"[\s\S]*?id="clanBrowserDiscoverPanel"/,
  "The no-clan mobile flow is missing its Find Clan and Create Clan views."
);
requires(client, /function handleClanNavigationKeydown[\s\S]*?ArrowLeft[\s\S]*?ArrowRight[\s\S]*?Home[\s\S]*?End[\s\S]*?clanContent\.addEventListener\("keydown",\s*handleClanNavigationKeydown\)/, "Clan section tabs are missing keyboard navigation.");
requires(client, /function startClanApplicationSubscription[\s\S]*?onApplications[\s\S]*?clanApplications\s*=[\s\S]*?renderClanView/, "Clan applications do not appear live for leaders and officers.");
requires(client, /data-clan-action="cancel-application"[\s\S]*?"cancel-application":\s*"cancelClanApplication"/, "Applicants cannot cancel a pending clan application.");
requires(showProfileSkillsSource, /clanView\.hidden\s*=\s*true;/, "Switching from Clan to Skills does not hide the Clan panel.");
requires(client, /function renderProfileClanAffiliation[\s\S]*?renderClanShield/, "Player profiles do not render a separate clan shield affiliation.");
requires(client, /clanSearchResults\.map\(clan =>[\s\S]*?renderClanShield\(clan\.shield \|\| clan\.banner/, "Clan discovery results do not show each clan's public shield.");
requires(server, /exports\.getCombatPlayerIdentity[\s\S]*?clanPublicSnapshot\(profileClanId,\s*clanData\)[\s\S]*?clanShield:\s*clan\?\.shield[\s\S]*?\bclan,/, "Public player identities do not include the shield from the player's canonical clan.");
requires(client, /function normalizePublicPlayerProfile[\s\S]*?const clan = raw\.clan[\s\S]*?clanShield:\s*clan\?\.shield[\s\S]*?function renderPublicPlayerProfile[\s\S]*?renderClanShield\(clan\.shield \|\| clan\.banner \|\| profile\.clanShield/, "Public player profiles do not display the shield returned for that player's clan.");
requires(client, /clanSearchResults\.map\(clan =>[\s\S]*?class="clan-name-link"[\s\S]*?data-public-clan-id="\$\{escapeHtml\(clan\.id\)\}"/, "Clan names in discovery do not open their public clan profile.");
requires(client, /function showPublicClanDetails[\s\S]*?Promise\.all\(\[api\.loadClan\(id\), api\.loadClanMembers\(id\)\]\)[\s\S]*?class="public-clan-roster"[\s\S]*?renderPlayerNameLink[\s\S]*?member\.kingPower/, "Public clan profiles do not list clickable member names with King Power.");
requires(client, /btn\.classList\.add\("clan-ally"\)/, "Allied cities do not receive their map class.");
requires(client, /You cannot scout or attack a clan ally/, "Clan-friendly action explanation is missing.");
requires(client, /function renderClanShield[\s\S]*?renderClanShieldField[\s\S]*?renderClanShieldCharges/, "Client is missing the vector clan shield renderer.");
requires(client, /function renderClanRosterMember[\s\S]*?data-clan-action="select-member"[\s\S]*?Demote[\s\S]*?Promote[\s\S]*?Remove[\s\S]*?renderClanMemberFlag/, "Clan roster is missing flags or leader-selected member controls.");
requires(client, /function renderClanGiftPanel[\s\S]*?Send \.5h Gold Gift[\s\S]*?Collect \$\{hours\}h Gold[\s\S]*?function renderClanQuestPanel[\s\S]*?Weekly Conquest[\s\S]*?Joined too late/, "Clan gift and weekly conquest quest panels are incomplete.");
assert.doesNotMatch(client, /Clan Chat|sendClanMessage|reportClanMessage|data-clan-action="mute"/, "Retired clan chat or mute UI remains in the client.");
requires(client, /data-clan-action="edit-shield"/, "Leader clan shield editor entry point is missing.");
requires(client, /function renderClanRenameEditor[\s\S]*?500,000 gold[\s\S]*?data-clan-form="rename"/, "Leader clan rename form is missing.");
requires(client, /data-clan-action="rename-clan"/, "Leader clan rename entry point is missing.");
requires(client, /function getClanNameChangeCooldownMs[\s\S]*?CLAN_NAME_CHANGE_COOLDOWN_MS[\s\S]*?function updateClanNameChangeCountdown[\s\S]*?data-clan-name-cooldown[\s\S]*?data-clan-rename-submit/, "Clan rename cooldown feedback is incomplete.");
requires(client, /kind === "rename"[\s\S]*?updateClanProfile\(\{\s*name:\s*requestedName\s*\}\)[\s\S]*?state\.gold\s*=\s*Number\(result\.gold\)[\s\S]*?state\.clanName\s*=\s*result\.clan\.name/, "Clan rename submissions do not retain the authoritative name and gold balance.");
requires(client, /function saveClanShieldEditor[\s\S]*?updateClanProfile\(\{\s*shield\s*\}\)[\s\S]*?result\?\.clan\?\.shield[\s\S]*?clanSnapshot\s*=\s*\{[\s\S]*?savedShield/, "Clan shield editor does not retain the server-confirmed saved shield.");
requires(client, /data-clan-action="shield-tab"[\s\S]*?data-shield-panel="field"[\s\S]*?data-shield-panel="colors"[\s\S]*?data-shield-panel="charges"[\s\S]*?data-shield-panel="details"/, "Mobile clan shield editor tabs are incomplete.");
requires(client, /CLAN_SHIELD_SHAPES[\s\S]*?CLAN_SHIELD_DIVISIONS[\s\S]*?CLAN_SHIELD_CHARGES[\s\S]*?CLAN_SHIELD_FINISHES/, "Clan shield editor options are incomplete.");
requires(styles, /\.city-node\.clan-ally \.city-ring[\s\S]*?\.clan-ally-label/, "Green accessible allied-city styling is missing.");
requires(styles, /\.army-route-ribbon\.clan-support-route\s*\{\s*fill:\s*rgba\(43,\s*139,\s*70,/, "Allied support route ribbons do not use the city UI's dark green.");
requires(styles, /\.army-route-flow\.clan-support-route\s*\{\s*stroke:\s*rgba\(143,\s*226,\s*165,/, "Allied support route flows do not use the city UI's light green.");
requires(styles, /\.army-route-ribbon\.clan-hostile-route\s*\{\s*fill:\s*rgba\(239,\s*62,\s*57,/, "Allied hostile route ribbons do not retain the hostile red.");
requires(styles, /\.army-route-flow\.clan-hostile-route\s*\{\s*stroke:\s*rgba\(121,\s*216,\s*149,/, "Allied hostile route flows do not identify the clanmate in green.");
requires(styles, /\.army-route-flow\.scout-route\s*\{\s*stroke-dasharray:\s*8\s+15/, "Allied scouts cannot retain the scout dash pattern.");
requires(
  styles,
  /\.city-node\.clan-ally\.targeted:not\(\.stronghold-node\)::before[\s\S]*?stroke='%2379d895'[\s\S]*?\.city-node\.clan-ally \.foreign-selected-level[\s\S]*?\.city-node\.clan-ally \.foreign-selected-crest[\s\S]*?\.clan-ally-action-wheel \.city-wheel-ring/,
  "Selected clan-allied holdings can fall back to rival red styling."
);
requires(
  client,
  /wheel\.className = "city-action-wheel foreign-city-action-wheel";\s*if \(clanAlly\) wheel\.classList\.add\("clan-ally-action-wheel"\)[\s\S]*?wheel\.className = "gold-camp-action-wheel stronghold-objective-action-wheel";\s*if \(clanAlly\) wheel\.classList\.add\("clan-ally-action-wheel"\)[\s\S]*?wheel\.className = "gold-camp-action-wheel";\s*if \(clanAlly\) wheel\.classList\.add\("clan-ally-action-wheel"\)/,
  "Selected allied cities, Strongholds, and camps do not retain the green action treatment."
);
requires(client, /const clanAllyStatus = clanAlly[\s\S]*?<span class="clan-ally-label">Clan Ally<\/span>[\s\S]*?const rivalOwnerRow[\s\S]*?city-ruler-row[\s\S]*?crownBadge[\s\S]*?\$\{clanAllyStatus\}[\s\S]*?<strong class="city-name">/, "City labels do not show ruler, optional Clan Ally status, Citadel crown, and city name in the required order.");
assert.doesNotMatch(client, /foreign-ruler-name foreign-ruler-name-inline"\)\}\$\{clanIdentity\.clanTag/, "Floating city labels must not insert clan tags between the ruler name and Clan Ally status.");
requires(styles, /\.clan-hud-btn[\s\S]*?\.profile-clan-affiliation/, "Clan HUD and profile shield styling is missing.");
requires(styles, /\.public-clan-roster[\s\S]*?\.public-clan-member[\s\S]*?\.public-clan-member-power[\s\S]*?\.clan-name-link/, "Public clan roster and discovery profile links are not styled.");
requires(styles, /\.clan-shield-size-editor[\s\S]*?\.clan-shield-editor-controls[\s\S]*?\.clan-shield-swatch-grid/, "Clan shield editor styling is missing.");
requires(styles, /\.clan-rename-card[\s\S]*?\.clan-rename-form[\s\S]*?\.clan-rename-actions/, "Clan rename management UI is not styled.");
requires(
  styles,
  /@media \(max-width:\s*900px\)[\s\S]*?\.clan-section-nav[\s\S]*?position:\s*sticky[\s\S]*?grid-template-columns:\s*repeat\(4,[\s\S]*?min-height:\s*44px[\s\S]*?\.clan-section-panel[\s\S]*?display:\s*none[\s\S]*?\.clan-section-panel\.active[\s\S]*?display:\s*block/,
  "The clan hub is missing its sticky four-tab mobile layout and touch targets."
);
requires(
  styles,
  /\.clan-content:not\(\.shield-editor-open\) \.clan-columns,[\s\S]*?\.clan-social-panels,[\s\S]*?\.clan-browser[\s\S]*?display:\s*contents[\s\S]*?\.clan-roster[\s\S]*?max-height:\s*none[\s\S]*?overflow:\s*visible/,
  "Mobile clan sections do not collapse to a single scroll container."
);
requires(styles, /\.clan-overview-grid[\s\S]*?repeat\(4,[\s\S]*?\.clan-rewards-panel\.active[\s\S]*?grid-template-columns/, "The clan Overview summaries or responsive Rewards layout are missing.");
requires(
  styles,
  /\.clan-gift-actions[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*?\.clan-gift-actions button[\s\S]*?min-width:\s*0[\s\S]*?@media \(max-width:\s*900px\)[\s\S]*?\.clan-gift-actions\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  "Clan gift actions can overflow into Conquest Quests at compact Rewards widths."
);
requires(styles, /\.clan-content\.shield-editor-open[\s\S]*?\.clan-shield-editor-preview[\s\S]*?\.clan-shield-editor-workspace[\s\S]*?\.clan-shield-editor-controls[\s\S]*?overflow-y:\s*auto/, "Mobile shield editor does not keep a fixed preview beside scrollable controls.");
requires(styles, /\.clan-member-row[\s\S]*?\.clan-member-selection[\s\S]*?\.clan-gift-panel[\s\S]*?\.clan-quest-grid[\s\S]*?\.clan-quest-card/, "Compact roster, gift, and conquest quest styling is missing.");

console.log("Validated clan gates, weekly paid renaming, event-driven roster and allied route updates, gifts, weekly conquest quests, HUD access, profiles, friendly combat, rankings, allied-city UI, and leader-owned heraldic shields.");
