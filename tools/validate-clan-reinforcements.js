const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("functions/index.js");
const client = read("game.js");
const firebaseClient = read("firebaseClient.js");
const rules = read("firestore.rules");
const indexes = JSON.parse(read("firestore.indexes.json"));

function requires(source, pattern, message) {
  assert.match(source, pattern, message);
}

requires(server, /ARMY_ORDER_KINDS\s*=\s*Object\.freeze\(\[[^\]]*"reinforce"/, "Server army orders do not include reinforce.");
requires(
  server,
  /resolvedKind === "reinforce"[\s\S]*?sameActiveClan[\s\S]*?status !== "active"[\s\S]*?cannot reinforce a main city/i,
  "Reinforcement launch does not validate canonical clan status and main-city protection."
);
requires(
  server,
  /CLAN_REINFORCEMENT_ACTIVE_LIMIT\s*=\s*2[\s\S]*?getActiveClanReinforcementTargetsForLaunch[\s\S]*?activeClanReinforcementTargets\.includes\(reinforcementTargetKey\)[\s\S]*?activeClanReinforcementTargets\.length >= CLAN_REINFORCEMENT_ACTIVE_LIMIT/,
  "Reinforcement launch does not enforce two active targets per sender and one contribution per holding."
);
requires(
  server,
  /activeClanReinforcementTargets:\s*\[\.\.\.activeClanReinforcementTargets, reinforcementTargetKey\][\s\S]*?clanReinforcementLimitResetGeneration:\s*RESET_GENERATION/,
  "Accepted reinforcement launches do not reserve a concurrency-safe sender slot."
);
requires(
  server,
  /resolvedKind === "reinforce" \|\| shouldDeactivatePeaceShieldForAttack[\s\S]*?shieldExpiresAtMs = 0/,
  "An accepted reinforcement launch does not remove the sender's shield."
);
requires(
  server,
  /effectiveKind === "reinforce"[\s\S]*?reinforcementRef\(attackerUid, reinforcementTargetKey\)[\s\S]*?nextContributionTroops[\s\S]*?alliedReinforcementTroops/,
  "Reinforcement arrivals do not maintain one sender-owned record per holding."
);
requires(
  server,
  /function beginReinforcementReturn[\s\S]*?getOwnedMainCityDestination[\s\S]*?createReinforcementReturnMovement/,
  "Safe full-contribution return marches are missing."
);
requires(server, /exports\.returnClanReinforcement\s*=\s*timedCallable/, "Return reinforcement callable is missing.");
requires(
  server,
  /function allocateDefenderLosses[\s\S]*?ownerLosses[\s\S]*?function allocateDefenseXp/,
  "Proportional defender loss and XP allocation is missing."
);
requires(
  server,
  /reinforcementBattleReceipts[\s\S]*?exports\.settleReinforcementBattle\s*=\s*onDocumentCreated/,
  "Idempotent contributor battle settlement is missing."
);
requires(
  server,
  /reconcileClanReinforcementsForPlayer[\s\S]*?clan_membership_changed/,
  "Membership changes do not reconcile in-flight and stationed reinforcements."
);
requires(
  server,
  /const convertedClanReinforcement[\s\S]*?convertedClanReinforcement[\s\S]*?attackProtection\.effectiveTroops[\s\S]*?returnRecalledTroops\(excess\)/,
  "Converted clan reinforcements do not return troops above the server-authoritative King Power limit."
);
requires(
  server,
  /convertedReinforcementCaptureAllowed:\s*convertedTransferReinforcement/,
  "Clan reinforcement conversions must not inherit the legacy owned-transfer capture exception."
);
requires(
  server,
  /returnReinforcementsAfterOwnershipChange[\s\S]*?beginReinforcementReturn/,
  "Ownership changes do not return stationed allied troops."
);
requires(
  server,
  /totalReinforcementTroops[\s\S]*?reinforcementTroopPower/,
  "Contributor King Power does not include stationed reinforcement troops."
);
requires(
  server,
  /finalizeReinforcementReturn[\s\S]*?releaseClanReinforcementTarget[\s\S]*?entry\.remaining <= 0[\s\S]*?releaseClanReinforcementTarget/,
  "Returned or depleted support does not release the sender's reinforcement slot."
);

requires(firebaseClient, /returnClanReinforcement[\s\S]*?subscribePlayerReinforcements/, "Firebase reinforcement callable or subscription is missing.");
requires(client, /beginClanReinforcement[\s\S]*?orderKind:\s*"reinforce"/, "Clan ally Reinforce client action is missing.");
requires(client, /Launching clan reinforcements immediately removes your Royal Peace Shield/, "Reinforcement shield warning is missing.");
requires(
  client,
  /CLAN_REINFORCEMENT_ACTIVE_LIMIT\s*=\s*2[\s\S]*?getClanReinforcementBlockReason[\s\S]*?already have one active reinforcement[\s\S]*?at most \$\{CLAN_REINFORCEMENT_ACTIVE_LIMIT\}/,
  "The client does not explain the two-active and one-per-holding reinforcement limits."
);
requires(client, /two holdings at once, with one reinforcement per holding/, "The reinforcement slider does not show the active support limit.");
requires(client, /renderHoldingReinforcementPanel[\s\S]*?Send Home[\s\S]*?Recall/, "Private Recall and Send Home controls are missing.");
requires(client, /label:\s*"Reinforcements"/, "Marches UI does not expose a Reinforcements section.");

requires(
  rules,
  /match \/reinforcements\/\{reinforcementId\}[\s\S]*?resource\.data\.ownerUid == request\.auth\.uid[\s\S]*?resource\.data\.targetOwnerUid == request\.auth\.uid[\s\S]*?allow create, update, delete: if false/,
  "Firestore reinforcement records are not private and server-owned."
);
requires(
  rules,
  /match \/reinforcementBattleReceipts\/\{resetId\}\/entries\/\{receiptId\}[\s\S]*?allow read, create, update, delete: if false/,
  "Battle settlement receipts are not server-only."
);
requires(
  rules,
  /profileFieldUnchanged\('activeClanReinforcementTargets'\)[\s\S]*?profileFieldUnchanged\('clanReinforcementLimitResetGeneration'\)/,
  "Clients can mutate the server-authoritative reinforcement slot state."
);

const reinforcementIndexes = indexes.indexes.filter(index => index.collectionGroup === "reinforcements");
const firstFields = new Set(reinforcementIndexes.map(index => index.fields?.[0]?.fieldPath));
["ownerUid", "targetOwnerUid", "targetKey"].forEach(field => {
  assert(firstFields.has(field), `Missing reinforcement index beginning with ${field}.`);
});

console.log("Validated clan reinforcement launch, lifecycle, combat settlement, privacy, and client controls.");
