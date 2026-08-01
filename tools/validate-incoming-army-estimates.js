const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

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

const DELETE_FIELD = Symbol("delete-field");
const serverSandbox = {
  ARMY_TROOP_ESTIMATE_DECADE_MAX: 1_000_000,
  FieldValue: { delete: () => DELETE_FIELD },
  safeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
};
vm.createContext(serverSandbox);
vm.runInContext(readFunction(serverSource, "formatTroopEstimateBound"), serverSandbox);
vm.runInContext(readFunction(serverSource, "getIncomingTroopEstimate"), serverSandbox);
vm.runInContext(readFunction(serverSource, "isEstimatedAttackMovement"), serverSandbox);
vm.runInContext(readFunction(serverSource, "isPrivateTransferMovement"), serverSandbox);
serverSandbox.ARMY_TROOP_VISIBILITY_VERSION = 2;
vm.runInContext(readFunction(serverSource, "createArmyPublicProjection"), serverSandbox);

const clientSandbox = {
  currentUid: "viewer-1",
  getCurrentOnlineUid() {
    return this.currentUid;
  },
};
vm.createContext(clientSandbox);
vm.runInContext(readFunction(clientSource, "formatTroopEstimateBound"), clientSandbox);
vm.runInContext(readFunction(clientSource, "getIncomingTroopEstimate"), clientSandbox);
vm.runInContext(readFunction(clientSource, "isPersonalArmy"), clientSandbox);
vm.runInContext(readFunction(clientSource, "isPrivateTransferMovement"), clientSandbox);
vm.runInContext(readFunction(clientSource, "canViewArmyTroopAmount"), clientSandbox);

const boundaryCases = [
  [0, "1\u201310"],
  [1, "1\u201310"],
  [10, "1\u201310"],
  [11, "10\u2013100"],
  [100, "10\u2013100"],
  [101, "100\u20131K"],
  [1_000, "100\u20131K"],
  [1_001, "1K\u201310K"],
  [10_000, "1K\u201310K"],
  [100_000, "10K\u2013100K"],
  [1_000_000, "100K\u20131M"],
  [1_000_001, "1M\u20135M"],
  [5_000_000, "1M\u20135M"],
  [5_000_001, "5M\u201310M"],
  [10_000_000, "5M\u201310M"],
  [10_000_001, "10M\u201320M"],
  [20_000_000, "10M\u201320M"],
  [20_000_001, "20M\u201350M"],
  [50_000_000, "20M\u201350M"],
  [50_000_001, "50M\u2013100M"],
  [100_000_000, "50M\u2013100M"],
  [100_000_001, "100M\u2013200M"],
  [200_000_000, "100M\u2013200M"],
  [200_000_001, "200M\u2013500M"],
  [500_000_000, "200M\u2013500M"],
  [500_000_001, "500M\u20131B"],
  [1_000_000_000, "500M\u20131B"],
  [1_000_000_001, "1B\u20132B"],
  [2_000_000_000, "1B\u20132B"],
  [2_000_000_001, "2B\u20135B"],
  [5_000_000_000, "2B\u20135B"],
  [5_000_000_001, "5B\u201310B"],
];

for (const [troops, expected] of boundaryCases) {
  assert.equal(
    serverSandbox.getIncomingTroopEstimate(troops).label,
    expected,
    `Server estimate for ${troops.toLocaleString("en-US")} troops must use the expected lower-inclusive band.`
  );
  assert.equal(
    clientSandbox.getIncomingTroopEstimate(troops).label,
    expected,
    `Client fallback for ${troops.toLocaleString("en-US")} troops must match the server.`
  );
}

const attackProjection = serverSandbox.createArmyPublicProjection({
  id: "army-1",
  kind: "attack",
  troops: 12_000_000,
  requestedTroops: 12_000_000,
  attackProtection: { active: true },
  demoAttack: { active: true },
});
assert.equal(attackProjection.troopVisibility, "estimate");
assert.equal(attackProjection.troopEstimateLabel, "10M\u201320M");
assert.equal(attackProjection.troops, DELETE_FIELD, "Public attacks must delete the exact troop count.");
assert.equal(attackProjection.requestedTroops, DELETE_FIELD, "Public attacks must delete the requested troop count.");
assert.equal(attackProjection.attackProtection, DELETE_FIELD, "Public attacks must not expose private protection snapshots.");
assert.equal(attackProjection.demoAttack, DELETE_FIELD, "Public attacks must not expose private demo-attack snapshots.");

const transferProjection = serverSandbox.createArmyPublicProjection({
  id: "army-2",
  kind: "transfer",
  troops: 250,
});
assert.equal(transferProjection.troopVisibility, "hidden");
assert.equal(transferProjection.troops, DELETE_FIELD, "Public owned-city transfers must delete the exact troop count.");
assert.equal(transferProjection.requestedTroops, DELETE_FIELD, "Public owned-city transfers must delete the requested troop count.");

const reinforcementProjection = serverSandbox.createArmyPublicProjection({
  id: "army-3",
  kind: "reinforce",
  troops: 400,
});
assert.equal(reinforcementProjection.troopVisibility, "exact");
assert.equal(reinforcementProjection.troops, 400, "Clan reinforcements preserve their existing exact troop behavior.");

assert.equal(clientSandbox.canViewArmyTroopAmount({
  kind: "transfer",
  owner: "enemy",
  ownerUid: "viewer-2",
  troops: 250,
}), false, "Another player must not see a transfer count even from a legacy exact projection.");
assert.equal(clientSandbox.canViewArmyTroopAmount({
  kind: "transfer",
  owner: "player",
  ownerUid: "viewer-1",
  troops: 250,
}), true, "The transfer owner must still see their own troop count.");
assert.equal(clientSandbox.canViewArmyTroopAmount({
  kind: "transfer",
  owner: "player",
  ownerUid: "viewer-1",
  troopVisibility: "hidden",
  troops: null,
}), false, "A public hidden projection must not render a fake zero before the private owner view arrives.");

assert.match(
  firebaseClientSource,
  /collection\(client\.db, "players", uid, "incomingArmies"\)/,
  "Defenders must subscribe to their private incoming-army projections."
);
assert.match(
  clientSource,
  /Estimated troops: \$\{escapeHtml\(estimatedTroops\)\}/,
  "The incoming-threat modal must label the range as an estimate."
);
assert.match(
  clientSource,
  /function isArmyTroopEstimate\(attack\)[\s\S]*?attack\.troopVisibility === "estimate"[\s\S]*?attack\.kind === "attack" && !isPersonalArmy\(attack\)/,
  "Hostile attacks must remain estimated during mixed-version rollout."
);
assert.match(
  clientSource,
  /function updateArmyTokenElement\([\s\S]*?getArmyTroopDisplayText\(attack\)/,
  "Map tokens must share the estimate display helper."
);
assert.match(
  clientSource,
  /else if \(countElement\.textContent\) \{\s*countElement\.textContent = "";/,
  "Hidden transfer tokens must clear any previously rendered troop count from the DOM."
);
assert.match(
  rulesSource,
  /match \/incomingArmies\/\{armyId\} \{[\s\S]*?allow read: if ownsPlayerDoc\(uid\) && isCurrentGeneration\(resource\.data\);[\s\S]*?allow create, update, delete: if false;/,
  "Only the owning player may read a current-generation incoming-army projection."
);

const canonicalRulesStart = rulesSource.indexOf("match /armies/{armyId}");
const canonicalRulesEnd = rulesSource.indexOf("match /reinforcements/{reinforcementId}", canonicalRulesStart);
const canonicalArmyRules = rulesSource.slice(canonicalRulesStart, canonicalRulesEnd);
assert.ok(canonicalRulesStart >= 0 && canonicalRulesEnd > canonicalRulesStart, "Canonical army rules must exist.");
assert.match(
  canonicalArmyRules,
  /resource\.data\.ownerUid == request\.auth\.uid[\s\S]*?\|\| \(resource\.data\.rallyAttack == true\s*&& resource\.data\.targetOwnerUid == request\.auth\.uid\)[\s\S]*?participantUids/,
  "Canonical exact armies must stay private to their owner and rally participants, with a defender exception only for launched rallies."
);
assert.match(
  serverSource,
  /is attacking \$\{targetName\} with an estimated \$\{troopEstimate\.label\} troops/,
  "Attack push notifications must use the same estimate."
);
assert.match(
  serverSource,
  /async function backfillActiveArmyVisibilityViews[\s\S]*?writeArmyMovementCopies\(transaction, army,/,
  "Active armies must be backfilled into sanitized public and private projections."
);

console.log("Validated private transfer counts, secure incoming-army estimates, and all 1-2-5 boundaries.");
