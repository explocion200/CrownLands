const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("functions/index.js");
const client = read("game.js");
const firebaseClient = read("firebaseClient.js");
const rules = read("firestore.rules");
const beginnerGuide = read("how-to-play.html");
const firebaseSetup = read("FIREBASE_SETUP.md");
const styles = `${read("styles.css")}\n${read("interface-theme.css")}`;
const indexes = JSON.parse(read("firestore.indexes.json"));

function requires(source, pattern, message) {
  assert.match(source, pattern, message);
}

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert(start >= 0 && end > start, `Could not extract ${name}.`);
  return source.slice(start, end);
}

[
  "createClanRally",
  "joinClanRally",
  "withdrawClanRallyContribution",
  "launchClanRally",
  "cancelClanRally",
].forEach(name => requires(server, new RegExp(`exports\\.${name}\\s*=\\s*timedCallable`), `Missing ${name} callable.`));

requires(server, /RALLY_MIN_PARTICIPANTS\s*=\s*2[\s\S]*?RALLY_MAX_PARTICIPANTS\s*=\s*20[\s\S]*?CLAN_ACTIVE_RALLY_LIMIT\s*=\s*5/, "Confirmed Rally participant or clan active limits changed.");
requires(server, /CLAN_RALLY_CREATOR_ROLES\s*=\s*Object\.freeze\(\["leader",\s*"officer"\]\)/, "Rally creation roles must remain restricted to clan leaders and officers.");
requires(server, /exports\.createClanRally[\s\S]*?assertClanRole\(memberSnap\.data\(\),\s*CLAN_RALLY_CREATOR_ROLES\)/, "The authoritative rally callable does not enforce the leader-or-officer role.");
requires(client, /function canCurrentPlayerCreateClanRally\(\)[\s\S]*?CLAN_RALLY_CREATOR_ROLES\.includes[\s\S]*?function beginCreateClanRally[\s\S]*?Only clan leaders and officers can form rallies\./, "The rally UI does not follow the authoritative leader-or-officer role policy.");
requires(server, /ARMY_TRAVEL_KIND_MULTIPLIERS\s*=\s*\{[^}]*rally_join:\s*0\.95/, "The server rally assembly travel multiplier is missing.");
requires(client, /ARMY_TRAVEL_KIND_MULTIPLIERS\s*=\s*\{[^}]*rally_join:\s*0\.95/, "The client rally assembly travel multiplier drifted from the server.");
requires(server, /function isRallyObjectiveTarget[\s\S]*?targetType === "city" && isStronghold\(target\)/, "Rallies are not restricted to Strongholds and the Crown Citadel.");
requires(server, /activeRalliesQuery[\s\S]*?RALLY_STATUS_FORMING[\s\S]*?RALLY_STATUS_LAUNCHED[\s\S]*?RALLY_STATUS_RECALLING[\s\S]*?activeRallyIds\.length >= CLAN_ACTIVE_RALLY_LIMIT/, "The five-active-Rally clan limit is not transactionally enforced.");
requires(server, /participantLimit\s*=\s*rally\.targetType === "tower" \? CLAN_MEMBER_LIMIT : RALLY_MAX_PARTICIPANTS[\s\S]*?activeRallyParticipants\(rally\)\.length >= participantLimit/, "The established 20-player limit is not preserved for normal rallies while Tower rallies use the clan-roster limit.");
requires(server, /getRallyParticipant\(rally,\s*uid\)[\s\S]*?duplicate:\s*true/, "Duplicate contributions are not idempotent.");
requires(server, /exports\.createClanRally[\s\S]*?buildServerGeneratedArmyRoute\(source,\s*target\)[\s\S]*?exports\.joinClanRally[\s\S]*?buildServerGeneratedArmyRoute\(source,\s*assembly\)/, "Leader and ally rally routes are not rebuilt by the canonical server planner.");
assert.doesNotMatch(server.slice(server.indexOf("exports.createClanRally"), server.indexOf("exports.joinClanRally")), /getRallyShieldDeactivation/, "Creating a Rally still removes a Peace Shield.");
assert.doesNotMatch(server.slice(server.indexOf("exports.joinClanRally"), server.indexOf("async function withdrawClanRallyContributionRequest")), /getRallyShieldDeactivation/, "Joining a Rally still removes a Peace Shield.");
assert.doesNotMatch(client, /Royal Peace Shields are removed on commitment/, "The Rally preview still says commitment removes a Peace Shield.");
requires(client, /Rally commitment does not remove an active Royal Peace Shield/, "The Rally preview does not explain that commitment preserves a Peace Shield.");
requires(server, /status:\s*RALLY_STATUS_FORMING[\s\S]*?validatedRouteVersion:\s*AUTHORITATIVE_ROUTES_VERSION[\s\S]*?participants/, "Private forming rally state is incomplete.");
requires(server, /reconcileInvalidRallyParticipantsBeforeLaunch[\s\S]*?cancelClanRallyRequest[\s\S]*?withdrawClanRallyContributionRequest[\s\S]*?Invalid contributions were returned and removed/, "Invalid Rally contributors are not reconciled before launch.");
requires(server, /activeParticipants\.length < RALLY_MIN_PARTICIPANTS[\s\S]*?unreadyParticipants\.length[\s\S]*?All participants must be Ready before launch/, "Launch does not atomically require 2–20 Ready participants.");
const launchSource = server.slice(server.indexOf("exports.launchClanRally"), server.indexOf("exports.previewArmyProtection"));
assert.doesNotMatch(launchSource, /createAlliedTargetReturnMovement|returnedInbound\.push/, "Launch still turns an inbound contribution around while launching the rest.");
requires(launchSource, /const participantUids = assembledParticipants\.map[\s\S]*?collectionGroup\("cities"\)[\s\S]*?where\("ownerUid",\s*"in",\s*participantUids\)/, "A 20-player Rally launch does not load participant cities with one bounded query.");
assert.doesNotMatch(launchSource, /assembledParticipants\.map\(async participant => \{[\s\S]{0,500}?collectionGroup\("cities"\)/, "Rally launch still performs one city query per participant.");
requires(server, /Only the rally creator or Clan Leader may launch it[\s\S]*?Only the rally creator or Clan Leader may cancel it|Only the rally creator or Clan Leader may cancel it[\s\S]*?Only the rally creator or Clan Leader may launch it/, "Creator-or-Clan-Leader launch and cancel permissions are missing.");
requires(server, /army\.rallyAttack[\s\S]*?rally\.leaderUid !== uid[\s\S]*?rally\.armyId !== armyId/, "Recall Horn use is not restricted to the rally leader.");
requires(server, /isRallyTargetFriendly[\s\S]*?rally_friendly_return_started/, "Launched rallies do not return when the target becomes friendly.");
requires(server, /getRallyAttackPackages\(rallyAttack,\s*participantProfiles\)[\s\S]*?attackPower:\s*totalAttackPower/, "Rally combat does not combine participant power recalculated from battle-time profiles.");
requires(server, /function getRallyAttackPackages\(rally = \{\},\s*participantProfiles = null\)[\s\S]*?useLiveCombatProfiles[\s\S]*?getCommonGearBonuses[\s\S]*?getCasualtyRecoveryPercent/, "Rally combat no longer rebuilds each participant's live skill, gear, and casualty package.");
requires(server, /clanBenefitsSnap[\s\S]*?combinePlayerObjectiveBonuses[\s\S]*?objectiveMarchSpeedBonusPercent[\s\S]*?slowestMarchSpeedMultiplier/, "Rally launch does not recalculate every Ready participant's live objective speed before locking the slowest speed.");
requires(server, /slowestMarchSpeedMultiplier[\s\S]*?Math\.min[\s\S]*?rallyMarchSpeedMultiplier/, "Rally movement is not locked to the slowest participant.");
requires(server, /stationOnVictory[\s\S]*?REINFORCEMENT_STATUS_STATIONED[\s\S]*?stationedReinforcementTroops/, "Allied Rally survivors are not stationed as attributed reinforcements after victory.");
requires(server, /const alliedVictoryStations[\s\S]*?alliedReinforcementTroops:\s*alliedVictoryTroops[\s\S]*?transaction\.set\(stationContributionRef,[\s\S]*?status:\s*REINFORCEMENT_STATUS_STATIONED[\s\S]*?stationedAtBattle:\s*Boolean\(stationContributionRef\)[\s\S]*?reinforcementId:\s*stationContributionRef\?\.id/, "Rally capture does not atomically persist the allied garrison total, attributed survivor records, and settlement receipt linkage.");
requires(server, /if \(!result\.success\)[\s\S]*?result\.attackerLosses = troopCount[\s\S]*?result\.survivors = 0/, "A defeated Rally can retain attackers.");
requires(server, /rallyBattleReceipts[\s\S]*?exports\.settleRallyBattle\s*=\s*onDocumentCreated/, "Idempotent ally battle settlement is missing.");
requires(server, /const stationedAtBattle = Boolean\([\s\S]*?receipt\.reinforcementId[\s\S]*?if \(participant\.survivors > 0 && !stationed && !stationedAtBattle\)[\s\S]*?if \(stationed && !stationedAtBattle/, "Rally receipt settlement can duplicate atomically stationed survivors or create an unnecessary return movement.");
requires(server, /committedRallyTroops[\s\S]*?totalMilitaryTroops[\s\S]*?rallyTroopPower/, "Committed rally troops are missing from King Power.");
requires(server, /if \(army\.rallyAttack === true\) return;/, "The combined army is counted as the leader's personal marching troops.");
requires(server, /reconcileClanRalliesBeforeDeparture[\s\S]*?cancelClanRallyRequest[\s\S]*?withdrawClanRallyContributionRequest/, "Clan departures do not cancel or withdraw forming rallies.");
requires(server, /RALLY_CREATOR_DEPARTURE_RETURN_REASON\s*=\s*"rally_creator_clan_departure"[\s\S]*?function recallLaunchedRallyForCreatorDeparture[\s\S]*?createMidRouteReturnMovement[\s\S]*?status:\s*RALLY_STATUS_RECALLING[\s\S]*?automaticRecallReason:\s*RALLY_CREATOR_DEPARTURE_RETURN_REASON/, "A launched Rally is not atomically recalled when its creator departs the clan.");
requires(server, /reconcileClanRalliesBeforeDeparture[\s\S]*?RALLY_STATUS_FORMING,\s*RALLY_STATUS_LAUNCHED[\s\S]*?rally\.leaderUid === playerUid[\s\S]*?recallLaunchedRallyForCreatorDeparture/, "Creator leave, removal, or clan-change reconciliation does not recall launched Rallies.");
requires(server, /reconcileClanRalliesBeforeDisband[\s\S]*?RALLY_STATUS_FORMING,\s*RALLY_STATUS_LAUNCHED[\s\S]*?recallLaunchedRallyForCreatorDeparture/, "Clan disband can strand a launched Rally instead of recalling it.");
const automaticCreatorRecallSource = extractFunction(server, "recallLaunchedRallyForCreatorDeparture", "reconcileClanRalliesBeforeDeparture");
assert.doesNotMatch(automaticCreatorRecallSource, /RECALL_HORN_ITEM_ID|shopItems/, "Automatic creator-departure recall consumes a Recall Horn.");
requires(server, /previousClanId[\s\S]*?previousClanId !== currentClanId[\s\S]*?reconcileClanRalliesBeforeDeparture\(uid,\s*previousClanId\)/, "Membership changes do not retry rally departure reconciliation.");
requires(server, /nextRole === "member"[\s\S]*?cancelFormingRalliesCreatedBy\(targetUid,\s*clanId\)/, "Demoting an officer does not cancel Rallies they are no longer authorized to create.");
requires(server, /cancelInvalidAssemblyRalliesAfterOwnershipChange[\s\S]*?cancelFormingRalliesCreatedBy[\s\S]*?processOwnershipChange[\s\S]*?cancelledAssemblyRallies/, "Losing an assembly city does not automatically cancel its forming Rallies.");
requires(server, /function createRallySourceRecaptureMovement[\s\S]*?rallyReturnAttack:\s*true[\s\S]*?returnAttackMovement:\s*leaderReturnAttack/, "A Rally creator returning to an enemy-held assembly city does not attack it.");
const resolveArmySource = server.slice(server.indexOf("async function resolveArmyOrderById"), server.indexOf("exports.resolveArmyOrder"));
requires(resolveArmySource, /const isRallyReturn = Boolean\(army\.rallyReturn\)[\s\S]*?const isRallyReturnAttack = Boolean\(army\.rallyReturnAttack\)/, "Rally returns are not explicitly distinguished from ordinary attacks.");
requires(resolveArmySource, /continueRallyReturnToMainCity[\s\S]*?neutral_original_city[\s\S]*?clan_owned_original_city[\s\S]*?protected_main_city[\s\S]*?shielded_original_city/, "Rally returns do not redirect neutral, clan-owned, protected, or shielded former origins to the Main City.");
requires(resolveArmySource, /becameClanAllies = !isReturning[\s\S]*?&& !isRallyReturn/, "Rally return handling can still be diverted by the generic ally-return branch.");
requires(resolveArmySource, /const antiFarmContext = effectiveKind === "attack"[\s\S]*?&& !rallyAttack[\s\S]*?&& !isRallyReturn/, "Rally return attacks can still be diverted by generic anti-farm handling.");
requires(resolveArmySource, /const currentReturnRevision[\s\S]*?army\.reinforcementReturnRevision[\s\S]*?contribution\.status !== REINFORCEMENT_STATUS_RETURNING[\s\S]*?contribution\.returnArmyId[\s\S]*?currentReturnRevision !== movementReturnRevision/, "A stale reinforcement return can overwrite a newer stationed survivor record.");
requires(server, /function returnReinforcementsAfterOwnershipChange[\s\S]*?const beforeOwnerUid[\s\S]*?return !targetOwnerUid \|\| targetOwnerUid === beforeOwnerUid[\s\S]*?processWithConcurrency\(invalidatedDocs/, "Ownership cleanup can recall reinforcements already attributed to a new Rally owner.");
requires(server, /writeRallyJoinMovementCopies[\s\S]*?rallyJoinPublicMovement/, "Assembly marches do not use a redacted public projection.");
assert.doesNotMatch(
  server.slice(server.indexOf("function rallyJoinPublicMovement"), server.indexOf("function writeRallyJoinMovementCopies")),
  /rallyId|rallyClanId|targetName|targetX|targetY/,
  "The public assembly march projection exposes private rally objective metadata."
);

const casualtySource = extractFunction(server, "allocateRallyAttackerLosses", "allocateRallyAttackXp");
const xpSource = extractFunction(server, "allocateRallyAttackXp", "createRallyParticipantSnapshot");
const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const rallyPowerSource = extractFunction(server, "getRallyParticipantAttackPower", "allocateRallyAttackerLosses");
const getRallyAttackPackages = new Function(
  "safeNumber",
  "BASE_TROOP_ATTACK_POWER",
  "assembledRallyParticipants",
  "getCommonGearBonuses",
  "normalizePlayerName",
  "getSkillLevel",
  "getSkillPercent",
  "skillMultiplier",
  "getCasualtyRecoveryPercent",
  `${rallyPowerSource}; return getRallyAttackPackages;`
)(
  safeNumber,
  1.25,
  rally => rally.participants || [],
  profile => profile.gearBonuses || { attackStrength: 0, casualtyEfficiency: 0 },
  (value, fallback) => value || fallback,
  (profile, skill) => profile[`${skill}Level`] || 0,
  (profile, skill) => profile[`${skill}Percent`] || 0,
  (profile, skill) => 1 + (profile[`${skill}Percent`] || 0) / 100,
  profile => profile.casualtyRecoveryPercent || 0
);
const legacyRallyPackages = getRallyAttackPackages({
  attackPower: 320,
  participants: [
    { uid: "leader", role: "leader", troops: 60, status: "assembled", attackBonusPercent: 60 },
    { uid: "ally", role: "ally", troops: 40, status: "assembled", attackBonusPercent: 60 },
  ],
});
assert.equal(
  legacyRallyPackages.reduce((total, row) => total + row.effectivePower, 0),
  320,
  "A launched pre-rebalance rally lost its stored total attack power."
);
assert.equal(
  getRallyAttackPackages({
    participants: [{ uid: "leader", troops: 100, status: "assembled", attackBonusPercent: 60, attackPowerPerTroop: 2 }],
  })[0].effectivePower,
  200,
  "A stored Rally participant snapshot is no longer backward compatible."
);
const liveRallyPackage = getRallyAttackPackages({
  attackPower: 999,
  participants: [{ uid: "leader", troops: 100, status: "assembled", attackPowerPerTroop: 1.25 }],
}, new Map([["leader", {
  playerName: "Live Rally Leader",
  swordmasteryLevel: 30,
  swordmasteryPercent: 60,
  fieldMedicsLevel: 10,
  fieldMedicsPercent: 20,
  casualtyRecoveryPercent: 24,
  gearBonuses: { attackStrength: 10, casualtyEfficiency: 4 },
}]]))[0];
assert.equal(liveRallyPackage.effectivePower, 212, "Battle-time Rally power still uses the stored launch total.");
assert.equal(liveRallyPackage.attackBonusPercent, 60, "Battle-time Rally Swordmastery was not recalculated.");
assert.equal(liveRallyPackage.attackGearPercent, 10, "Battle-time Rally attack gear was not recalculated.");
assert.equal(liveRallyPackage.fieldMedicsPercent, 24, "Battle-time Rally casualty recovery was not recalculated.");
const allocateLosses = new Function("safeNumber", `${casualtySource}; return allocateRallyAttackerLosses;`)(safeNumber);
const allocateXp = new Function("safeNumber", `${xpSource}; return allocateRallyAttackXp;`)(safeNumber);
const packages = [
  { uid: "leader", role: "leader", troops: 100, effectivePower: 120 },
  { uid: "ally-a", role: "ally", troops: 50, effectivePower: 100 },
  { uid: "ally-b", role: "ally", troops: 50, effectivePower: 80 },
];
const firstLosses = allocateLosses(packages, 75);
const secondLosses = allocateLosses(packages, 75);
assert.deepEqual(firstLosses, secondLosses, "Rally casualty distribution is not deterministic.");
assert.equal(firstLosses.reduce((total, row) => total + row.losses, 0), 75, "Rally casualties do not preserve total losses.");
assert.equal(firstLosses.reduce((total, row) => total + row.survivors, 0), 125, "Rally casualties do not preserve survivors.");
const proportionalLosses = allocateLosses([
  { uid: "player-a", role: "leader", troops: 100 },
  { uid: "player-b", role: "ally", troops: 50 },
], 40);
assert.deepEqual(
  proportionalLosses.map(row => [row.uid, row.losses]),
  [["player-a", 27], ["player-b", 13]],
  "Rally losses are not allocated proportionally with deterministic whole-troop rounding."
);
const xp = allocateXp(301, packages);
assert.equal([...xp.values()].reduce((total, value) => total + value, 0), 301, "Rally XP allocation does not preserve the XP pool.");
assert(xp.get("leader") > xp.get("ally-b"), "Rally XP is not weighted by effective contribution power.");

const cancellationSource = server.slice(
  server.indexOf("async function cancelClanRallyRequest"),
  server.indexOf("exports.cancelClanRally =")
);
requires(cancellationSource, /receiptKind:\s*"rally_cancel"[\s\S]*?cancellationSettlementPending/, "Rally cancellation does not fan participant settlement into bounded receipts.");
assert.doesNotMatch(cancellationSource, /prepareEconomyCollection|writeArmyMovementCopies|writeRallyJoinMovementCopies/, "Rally cancellation still performs unbounded participant economy or movement writes in its parent transaction.");
requires(server, /function settleRallyCancellationReceipt[\s\S]*?receipt\.receiptKind !== "rally_cancel"[\s\S]*?status:\s*"settled"/, "Idempotent per-participant Rally cancellation settlement is missing.");

requires(firebaseClient, /createClanRally[\s\S]*?joinClanRally[\s\S]*?withdrawClanRallyContribution[\s\S]*?launchClanRally[\s\S]*?cancelClanRally/, "Firebase rally callable wrappers are incomplete.");
requires(firebaseClient, /function subscribeClanRallies[\s\S]*?where\("status",\s*"in",\s*\["forming",\s*"launched",\s*"recalling"\]\)/, "Realtime clan rally subscription is missing.");
requires(client, /beginCreateClanRally[\s\S]*?beginJoinClanRallyContribution/, "Map rally creation or ally joining is missing.");
requires(client, /Waiting for \$\{CLAN_RALLY_MIN_PARTICIPANTS\}\+ Ready[\s\S]*?Every contribution must arrive and show Ready/, "The War Room does not communicate or enforce all-Ready launch behavior.");
requires(client, /bindClanRallyControls[\s\S]*?data-rally-action/, "Role-appropriate rally controls are not bound.");
requires(client, /function getClanRallyParticipantStatusLabel[\s\S]*?rallyStatus === "recalling"[\s\S]*?participantStatus === "assembled"\) return "Marching"/, "Launched and returning rally participants do not receive truthful client status labels.");
requires(client, /renderClanRallyCard[\s\S]*?recalling \? "returning" : launched \? "marching" : "assembled"/, "Rally troop totals remain labeled assembled after launch or recall.");
requires(client, /function renderSelectedStrongholdWheel[\s\S]*?camp-rally-action[\s\S]*?beginCreateClanRally/, "Stronghold action wheels do not expose Rally.");
assert.doesNotMatch(client.slice(client.indexOf("function renderSelectedRewardCampWheel"), client.indexOf("function showRecallRewardCampConfirm")), /camp-rally-action|beginCreateClanRally/, "Reward Camps still expose Rally.");
requires(client, /function renderRallyParticipantResults[\s\S]*?Committed[\s\S]*?Losses[\s\S]*?Survivors[\s\S]*?Attack power/, "Shared Rally reports do not show clearly labeled participant results.");
requires(client, /function isHostileClanMarch[\s\S]*?mission\.kind === "attack"[\s\S]*?mission\.kind === "scout"[\s\S]*?mission\.rallyAttack[\s\S]*?function getArmyRouteRelationshipClass[\s\S]*?clan-hostile-route[\s\S]*?clan-support-route/, "Clan rally attacks do not use mixed hostile styling while rally assembly and return paths stay green.");
requires(styles, /\.clan-rally-card[\s\S]*?\.clan-rally-confirmation/, "Rally card or confirmation styling is missing.");
requires(styles, /\.camp-rally-action/, "Rally map action styling is missing.");
requires(beginnerGuide, /Rally supports 2&ndash;20 unique clan members/, "The beginner guide does not publish the 2–20-player Rally limit.");
requires(beginnerGuide, /Reward Camps and ordinary cities are not Rally targets/, "The beginner guide still exposes invalid ordinary Rally targets.");
requires(beginnerGuide, /slowest participant&rsquo;s locked march speed/, "The beginner guide does not explain the slowest-participant Rally speed.");
requires(beginnerGuide, /Committing Rally troops does not remove an active Royal Peace Shield/, "The beginner guide still documents the obsolete Rally shield behavior.");
requires(beginnerGuide, /creator leaves, is removed from, or changes clans[\s\S]*?recalls the whole Rally/, "The beginner guide omits automatic creator-departure recall.");
assert.doesNotMatch(beginnerGuide, /up to three rulers|contribution is still inbound, that contribution turns around|uses the leader&rsquo;s march bonuses/, "The beginner guide still contains pre-correction Rally behavior.");
requires(firebaseSetup, /2–20-player ordinary Rally assembly/, "Firebase setup still documents the obsolete three-player Rally limit.");
assert.doesNotMatch(firebaseSetup, /three-player rally/i, "Firebase setup still contains the obsolete Rally limit.");

const participantStatusSource = extractFunction(client, "getClanRallyParticipantStatusLabel", "renderClanRallyCard");
const getParticipantStatus = new Function(
  "normalizeTimestampMs",
  "formatDuration",
  `${participantStatusSource}; return getClanRallyParticipantStatusLabel;`
)(value => Math.max(0, Number(value) || 0), seconds => `${seconds}s`);
assert.equal(getParticipantStatus({ status: "forming" }, { status: "assembled" }, 1_000), "Ready");
assert.equal(getParticipantStatus({ status: "launched" }, { status: "assembled" }, 1_000), "Marching");
assert.equal(getParticipantStatus({ status: "launched" }, { status: "inbound" }, 1_000), "Returning");
assert.equal(getParticipantStatus({ status: "recalling" }, { status: "assembled" }, 1_000), "Returning");
assert.equal(getParticipantStatus({ status: "forming" }, { status: "inbound", arrivesAtMs: 31_000 }, 1_000), "30s");

requires(
  rules,
  /match \/rallies\/\{rallyId\}[\s\S]*?allow read: if clanMember\(clanId\)[\s\S]*?allow create, update, delete: if false/,
  "Forming rally targets are not clan-private and server-owned."
);
requires(rules, /match \/rallyState\/\{resetId\}[\s\S]*?allow read, create, update, delete: if false/, "Rally concurrency state is not server-only.");
requires(rules, /match \/rallyBattleReceipts\/\{resetId\}\/entries\/\{receiptId\}[\s\S]*?allow read, create, update, delete: if false/, "Rally settlement receipts are not server-only.");
requires(
  rules,
  /match \/armies\/\{armyId\}[\s\S]*?resource\.data\.rallyAttack == true[\s\S]*?resource\.data\.targetOwnerUid == request\.auth\.uid[\s\S]*?participantUids/,
  "Launched rally armies are not visible to their defender while preserving canonical normal-army privacy."
);
assert.doesNotMatch(
  extractFunction(rules, "validPlayerProfileUpdate", "ownsCityOwnerIdentity"),
  /'committedRallyTroops'|'rallyResetGeneration'/,
  "Clients can mutate committed rally troop state."
);

const rallyIndexes = indexes.indexes.filter(index => index.collectionGroup === "rallies");
assert(rallyIndexes.some(index => index.queryScope === "COLLECTION"), "The live clan rally query index is missing.");
assert(
  rallyIndexes.some(index => index.queryScope === "COLLECTION_GROUP"
    && index.fields?.some(field => field.fieldPath === "participantUids" && field.arrayConfig === "CONTAINS")),
  "The participant reconciliation rally index is missing."
);

console.log("Validated clan rally limits, privacy, lifecycle, deterministic settlement, King Power, and client controls.");
