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
  /resolvedKind === "reinforce"[\s\S]*?sameActiveClan[\s\S]*?status !== "active"[\s\S]*?getActiveClanReinforcementAssignmentsForLaunch/,
  "Reinforcement launch does not validate canonical clan status."
);
assert.doesNotMatch(
  server,
  /resolvedKind === "reinforce"[\s\S]{0,1200}?cannot reinforce a main city/i,
  "Server launch still blocks proactive reinforcement of an allied main city."
);
assert.doesNotMatch(
  server,
  /effectiveKind === "reinforce"[\s\S]{0,1200}?outcome:\s*"main_city_return"/,
  "Server arrival still returns reinforcement sent to an allied main city."
);
requires(
  server,
  /CLAN_REINFORCEMENT_PER_RECIPIENT_LIMIT\s*=\s*2[\s\S]*?getActiveClanReinforcementAssignmentsForLaunch[\s\S]*?entry\.targetKey === reinforcementTargetKey[\s\S]*?entry\.recipientUid === targetOwnerUid[\s\S]*?recipientAssignmentCount >= CLAN_REINFORCEMENT_PER_RECIPIENT_LIMIT/,
  "Reinforcement launch does not enforce two assignments per clanmate and one contribution per holding."
);
requires(
  server,
  /activeClanReinforcementAssignments:[\s\S]*?assignmentToken[\s\S]*?clanReinforcementLimitResetGeneration:\s*RESET_GENERATION[\s\S]*?clanReinforcementLimitVersion:\s*REINFORCEMENT_MODEL_VERSION/,
  "Accepted reinforcement launches do not reserve a concurrency-safe sender slot."
);
requires(
  server,
  /ORDINARY_CITY_REINFORCEMENT_CAPACITY\s*=\s*5[\s\S]*?reserveOrdinaryCityReinforcementSlot[\s\S]*?resource-exhausted[\s\S]*?reinforcement-city-capacity/,
  "Ordinary-city launch capacity is not reserved transactionally at five contributors."
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
  /function beginReinforcementReturn[\s\S]*?getReinforcementReturnDestination[\s\S]*?createReinforcementReturnMovement/,
  "Original-source reinforcement return marches are missing."
);
requires(
  server,
  /const returnInitiatorRole[\s\S]*?returnInitiatorRole === "holder"[\s\S]*?returnInitiatorRole === "contributor"[\s\S]*?currentUser:/,
  "Holding-owner dismissal can expose or apply the troop contributor's private player snapshot."
);
requires(
  server,
  /targetUpdate = contribution\.targetType === "camp"[\s\S]*?cityUpdates:\s*\[\{\s*id:\s*target\.id,\s*regionId:\s*contribution\.targetRegionId,\s*\.\.\.patch\s*\}\]/,
  "City reinforcement returns do not provide an immediate client-compatible garrison update."
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
  /finalizeReinforcementReturn[\s\S]*?releaseClanReinforcementAssignment[\s\S]*?entry\.remaining <= 0[\s\S]*?releaseClanReinforcementAssignment/,
  "Returned or depleted support does not release the sender's reinforcement slot."
);
requires(
  server,
  /reconcileReinforcementTargetCapacity[\s\S]*?slice\(0, ORDINARY_CITY_REINFORCEMENT_CAPACITY\)[\s\S]*?slice\(ORDINARY_CITY_REINFORCEMENT_CAPACITY\)\.reverse\(\)[\s\S]*?beginOutboundReinforcementReturn/,
  "Capacity repair does not retain the oldest five assignments and return newer overflow."
);
requires(
  server,
  /reinforcementSourceId[\s\S]*?reinforcementSourceRegionId[\s\S]*?reinforcementSourceCityName[\s\S]*?lastArrivalArmyId/,
  "Reinforcement source snapshots and legacy arrival recovery are missing."
);

requires(firebaseClient, /returnClanReinforcement[\s\S]*?subscribePlayerReinforcements/, "Firebase reinforcement callable or subscription is missing.");
requires(client, /beginClanReinforcement[\s\S]*?orderKind:\s*"reinforce"/, "Clan ally Reinforce client action is missing.");
requires(client, /Launching clan reinforcements immediately removes your Royal Peace Shield/, "Reinforcement shield warning is missing.");
requires(
  client,
  /const attackBlockLabel = clanAlly \? "Reinforce"[\s\S]*?aria-label="\$\{clanAlly \? `Reinforce/,
  "Allied main-city markers do not expose the proactive Reinforce action."
);
assert.doesNotMatch(
  client,
  /clan ally's home city cannot be reinforced|Home cities cannot be reinforced|Clan allies cannot reinforce a home city/i,
  "Client still routes allied main-city support into the protected-home UI."
);
requires(
  client,
  /CLAN_REINFORCEMENT_PER_RECIPIENT_LIMIT\s*=\s*2[\s\S]*?getClanReinforcementBlockReason[\s\S]*?already have one active reinforcement[\s\S]*?active reinforcement assignments with this clanmate/,
  "The client does not explain the per-clanmate and one-per-holding reinforcement limits."
);
requires(client, /assignments with \$\{escapeHtml\(reinforcementRecipientName\)\}[\s\S]*?reinforcement slots/, "The reinforcement slider does not show recipient and city usage.");
requires(client, /renderHoldingReinforcementPanel[\s\S]*?Send Home[\s\S]*?Recall/, "Private Recall and Send Home controls are missing.");
requires(client, /label:\s*"Reinforcements"/, "Marches UI does not expose a Reinforcements section.");
requires(
  client,
  /getIncomingClanReinforcementMarches[\s\S]*?incomingClanReinforcement[\s\S]*?Stationed with allies[\s\S]*?Defending your holdings/,
  "Marches UI does not distinguish incoming, sent, and received clan support."
);
requires(
  client,
  /Stationed troops remain at their destination until recalled, sent home, invalidated, or lost in battle/,
  "Marches UI does not explain that stationed troops remain at their holding."
);

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
  /profileFieldUnchanged\('activeClanReinforcementTargets'\)[\s\S]*?profileFieldUnchanged\('activeClanReinforcementAssignments'\)[\s\S]*?profileFieldUnchanged\('clanReinforcementLimitVersion'\)/,
  "Clients can mutate the server-authoritative reinforcement slot state."
);
requires(
  rules,
  /match \/reinforcementCapacity\/\{resetId\}\/cities\/\{capacityId\}[\s\S]*?allow read, create, update, delete: if false/,
  "Reinforcement capacity identities are not server-only."
);

const reinforcementIndexes = indexes.indexes.filter(index => index.collectionGroup === "reinforcements");
const firstFields = new Set(reinforcementIndexes.map(index => index.fields?.[0]?.fieldPath));
["ownerUid", "targetOwnerUid", "targetKey"].forEach(field => {
  assert(firstFields.has(field), `Missing reinforcement index beginning with ${field}.`);
});
const armyIndexes = indexes.indexes.filter(index => index.collectionGroup === "armies");
assert(
  armyIndexes.some(index => index.fields?.[0]?.fieldPath === "reinforcementTargetKey"),
  "Missing active reinforcement movement index by target key."
);

console.log("Validated per-clanmate reinforcement capacity, source returns, repair, privacy, and client controls.");
