const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("functions/index.js");
const client = read("game.js");
const firebaseClient = read("firebaseClient.js");
const rules = read("firestore.rules");
const styles = read("styles.css");
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

requires(server, /RALLY_MAX_PARTICIPANTS\s*=\s*3[\s\S]*?CLAN_FORMING_RALLY_LIMIT\s*=\s*3/, "Rally participant or clan forming limits changed.");
requires(server, /ARMY_TRAVEL_KIND_MULTIPLIERS\s*=\s*\{[^}]*rally_join:\s*0\.95/, "The server rally assembly travel multiplier is missing.");
requires(client, /ARMY_TRAVEL_KIND_MULTIPLIERS\s*=\s*\{[^}]*rally_join:\s*0\.95/, "The client rally assembly travel multiplier drifted from the server.");
requires(server, /isRallyObjectiveTarget[\s\S]*?getRewardCampConfig\(target\)[\s\S]*?isStronghold\(target\)/, "Rallies are not restricted to reward camps and Strongholds.");
requires(server, /state\.leaderUids\.includes\(uid\)[\s\S]*?state\.leaderUids\.length >= CLAN_FORMING_RALLY_LIMIT/, "Leader and clan rally limits are not transactionally enforced.");
requires(server, /activeRallyParticipants\(rally\)\.length >= RALLY_MAX_PARTICIPANTS/, "The three-player participant limit is missing.");
requires(server, /getRallyParticipant\(rally,\s*uid\)[\s\S]*?duplicate:\s*true/, "Duplicate contributions are not idempotent.");
requires(server, /validateArmyRoute\(order,\s*source,\s*target\)[\s\S]*?validateArmyRoute\(joinOrder,\s*source,\s*assembly\)/, "Leader and ally rally routes are not server validated.");
requires(server, /getRallyShieldDeactivation[\s\S]*?shieldExpiresAtMs\s*=\s*0/, "Committing rally troops does not remove the Peace Shield.");
requires(server, /status:\s*RALLY_STATUS_FORMING[\s\S]*?validatedRouteVersion:\s*1[\s\S]*?participants/, "Private forming rally state is incomplete.");
requires(server, /inboundParticipants[\s\S]*?createAlliedTargetReturnMovement[\s\S]*?returnedInbound/, "Launching does not turn inbound contributions around.");
requires(server, /Only the rally leader may launch it[\s\S]*?Only the rally leader may cancel it|Only the rally leader may cancel it[\s\S]*?Only the rally leader may launch it/, "Leader-only launch and cancel controls are missing.");
requires(server, /army\.rallyAttack[\s\S]*?rally\.leaderUid !== uid[\s\S]*?rally\.armyId !== armyId/, "Recall Horn use is not restricted to the rally leader.");
requires(server, /isRallyTargetFriendly[\s\S]*?rally_friendly_return_started/, "Launched rallies do not return when the target becomes friendly.");
requires(server, /getRallyAttackPackages[\s\S]*?attackPower:\s*totalAttackPower/, "Combat does not combine snapshotted participant attack power.");
requires(server, /rallyBattleReceipts[\s\S]*?exports\.settleRallyBattle\s*=\s*onDocumentCreated/, "Idempotent ally battle settlement is missing.");
requires(server, /committedRallyTroops[\s\S]*?totalMilitaryTroops[\s\S]*?rallyTroopPower/, "Committed rally troops are missing from King Power.");
requires(server, /if \(army\.rallyAttack === true\) return;/, "The combined army is counted as the leader's personal marching troops.");
requires(server, /reconcileClanRalliesBeforeDeparture[\s\S]*?cancelClanRallyRequest[\s\S]*?withdrawClanRallyContributionRequest/, "Clan departures do not cancel or withdraw forming rallies.");
requires(server, /previousClanId[\s\S]*?previousClanId !== currentClanId[\s\S]*?reconcileClanRalliesBeforeDeparture\(uid,\s*previousClanId\)/, "Membership changes do not retry rally departure reconciliation.");
requires(server, /writeRallyJoinMovementCopies[\s\S]*?rallyJoinPublicMovement/, "Assembly marches do not use a redacted public projection.");
assert.doesNotMatch(
  server.slice(server.indexOf("function rallyJoinPublicMovement"), server.indexOf("function writeRallyJoinMovementCopies")),
  /rallyId|rallyClanId|targetName|targetX|targetY/,
  "The public assembly march projection exposes private rally objective metadata."
);

const casualtySource = extractFunction(server, "allocateRallyAttackerLosses", "allocateRallyAttackXp");
const xpSource = extractFunction(server, "allocateRallyAttackXp", "createRallyParticipantSnapshot");
const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
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
const xp = allocateXp(301, packages);
assert.equal([...xp.values()].reduce((total, value) => total + value, 0), 301, "Rally XP allocation does not preserve the XP pool.");
assert(xp.get("leader") > xp.get("ally-b"), "Rally XP is not weighted by effective contribution power.");

requires(firebaseClient, /createClanRally[\s\S]*?joinClanRally[\s\S]*?withdrawClanRallyContribution[\s\S]*?launchClanRally[\s\S]*?cancelClanRally/, "Firebase rally callable wrappers are incomplete.");
requires(firebaseClient, /function subscribeClanRallies[\s\S]*?where\("status",\s*"in",\s*\["forming",\s*"launched",\s*"recalling"\]\)/, "Realtime clan rally subscription is missing.");
requires(client, /beginCreateClanRally[\s\S]*?beginJoinClanRallyContribution/, "Map rally creation or ally joining is missing.");
requires(client, /inbound contributions will automatically turn around:[\s\S]*?Launch Assembled Troops/, "Launch confirmation does not disclose inbound returns.");
requires(client, /bindClanRallyControls[\s\S]*?data-rally-action/, "Role-appropriate rally controls are not bound.");
requires(client, /camp-rally-action[\s\S]*?beginCreateClanRally/, "Eligible objective action wheels do not expose Rally.");
requires(client, /mission\?\.kind === "rally_join"[\s\S]*?clan-support-route/, "Assembly routes do not use clan support styling.");
requires(styles, /\.clan-rally-card[\s\S]*?\.clan-rally-confirmation/, "Rally card or confirmation styling is missing.");
requires(styles, /\.camp-rally-action/, "Rally map action styling is missing.");

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
requires(rules, /profileFieldUnchanged\('committedRallyTroops'\)[\s\S]*?profileFieldUnchanged\('rallyResetGeneration'\)/, "Clients can mutate committed rally troop state.");

const rallyIndexes = indexes.indexes.filter(index => index.collectionGroup === "rallies");
assert(rallyIndexes.some(index => index.queryScope === "COLLECTION"), "The live clan rally query index is missing.");
assert(
  rallyIndexes.some(index => index.queryScope === "COLLECTION_GROUP"
    && index.fields?.some(field => field.fieldPath === "participantUids" && field.arrayConfig === "CONTAINS")),
  "The participant reconciliation rally index is missing."
);

console.log("Validated clan rally limits, privacy, lifecycle, deterministic settlement, King Power, and client controls.");
