const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "functions", "index.js");
const serverSource = fs.readFileSync(serverPath, "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const gameRulesSource = fs.readFileSync(path.join(root, "game-rules.html"), "utf8");
const privacySource = fs.readFileSync(path.join(root, "privacy.html"), "utf8");

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const signatureStart = source.indexOf("(", start);
  let parentheses = 0;
  let signatureEnd = -1;
  for (let index = signatureStart; index < source.length; index += 1) {
    if (source[index] === "(") parentheses += 1;
    if (source[index] === ")") parentheses -= 1;
    if (parentheses === 0) {
      signatureEnd = index;
      break;
    }
  }
  const bodyStart = source.indexOf("{", signatureEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

requireMatch(serverSource, /ANTI_FARM_POLICY_VERSION\s*=\s*3/, "The neutral-origin anti-farming schema is not version 3.");
requireMatch(
  serverSource,
  /ANTI_FARM_INSTALLATION_RETENTION_MS\s*=\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
  "Installation links are not retained for exactly 30 days."
);
requireMatch(
  serverSource,
  /ANTI_FARM_DIRECTION_WINDOW_MS\s*=\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
  "Directional capture history is not limited to seven days."
);
requireMatch(serverSource, /ANTI_FARM_ALLOWED_EASY_CAPTURES\s*=\s*2/, "The policy does not allow exactly two easy captures.");
requireMatch(serverSource, /ANTI_FARM_LOW_CITY_LIMIT\s*=\s*3/, "The low-city limit is not three non-main cities.");
requireMatch(serverSource, /ANTI_FARM_CONTESTED_DEFENSE_RATIO\s*=\s*0\.25/, "The contested defense threshold is not 25%.");
requireMatch(serverSource, /ANTI_FARM_MEANINGFUL_LOSS_RATIO\s*=\s*0\.2/, "The meaningful casualty threshold is not 20%.");
requireMatch(serverSource, /ANTI_FARM_MIN_MEANINGFUL_TROOPS\s*=\s*2/, "One-troop attacks are not explicitly excluded.");
requireMatch(
  serverSource,
  /ANTI_FARM_PAIR_BLOCK_MS\s*=\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
  "The directional penalty is not seven days."
);
assert.doesNotMatch(
  serverSource,
  /ANTI_FARM_FRESH_NEUTRAL_WINDOW_MS|normalizeFreshHandoffHistory|isFreshNeutralClaimTarget|getNeutralClaimCapturePatch|getNeutralClaimClearedPatch/,
  "The removed 24-hour fresh-neutral classifier is still present."
);
requireMatch(
  serverSource,
  /function getNeutralOriginOwnershipPatch[\s\S]*?!getOwnerUid\(target\)[\s\S]*?!isGivenUpNeutralCity\(target\)[\s\S]*?neutralOriginSource:\s*"combat"/,
  "Direct gray-NPC combat captures do not receive durable neutral-origin provenance."
);
requireMatch(
  serverSource,
  /deedCityPatch\s*=\s*\{[\s\S]*?getNeutralOriginClearedPatch\(\)/,
  "Deed Camp awards are not explicitly excluded from neutral-origin provenance."
);
requireMatch(
  serverSource,
  /getInactiveCityNeutralPatch[\s\S]*?getNeutralOriginClearedPatch\(\)/,
  "Inactivity neutralization does not clear neutral-origin provenance."
);
requireMatch(
  serverSource,
  /exports\.relinquishCity[\s\S]*?sourcePatch\s*=\s*\{[\s\S]*?getNeutralOriginClearedPatch\(\)/,
  "Relinquishment does not clear neutral-origin provenance."
);

requireMatch(
  serverSource,
  /exports\.registerGameInstallation[\s\S]*?antiFarmHash\(installationId\)[\s\S]*?antiFarmInstallationRef\(installationHash\)/,
  "Installation IDs are not hashed and stored in the private anti-abuse namespace."
);
requireMatch(
  serverSource,
  /cleanupExpiredAntiFarmInstallations[\s\S]*?expiresAtMs[\s\S]*?ANTI_FARM_INSTALLATION_RETENTION_MS[\s\S]*?batch\.delete/,
  "Expired installation hashes are not physically removed."
);
assert.doesNotMatch(
  extractFunction(serverSource, "evaluateAntiFarmPairData"),
  /\bip\b|x-forwarded-for|remoteAddress/i,
  "Shared networks or IP addresses must not drive the anti-farming policy."
);

const sendStart = serverSource.indexOf('exports.sendArmyOrder = timedCallable("sendArmyOrder"');
const sendEnd = serverSource.indexOf("async function resolveArmyOrderById", sendStart);
const sendSource = serverSource.slice(sendStart, sendEnd);
const sendPolicyIndex = sendSource.indexOf("evaluateHostileAntiFarmPolicy");
assert.ok(sendPolicyIndex >= 0, "Direct hostile launches do not enforce the directional policy.");
assert.ok(sendPolicyIndex < sendSource.indexOf("const useSwiftMarchOrder"), "Launch enforcement occurs after Swift March consumption.");
assert.ok(sendPolicyIndex < sendSource.indexOf("sourceTroopPatch"), "Launch enforcement occurs after troop consumption.");
requireMatch(sendSource, /status:\s*"blocked"[\s\S]*?antiFarmPolicy:/, "Blocked launches do not return the structured policy.");

const resolveSource = extractFunction(serverSource, "resolveArmyOrderById");
requireMatch(
  resolveSource,
  /effectiveKind === "attack"[\s\S]*?evaluateHostileAntiFarmPolicy[\s\S]*?phase:\s*rallyAttack\s*\?\s*"rally-arrival"\s*:\s*"arrival"/,
  "Arrival enforcement does not cover direct, converted, and rally attacks."
);
requireMatch(
  resolveSource,
  /antiFarmContext\.policy\.blocked[\s\S]*?returnRecalledTroops\(troopCount\)[\s\S]*?markResolved/,
  "Blocked direct arrivals do not return troops and resolve without combat."
);
requireMatch(
  resolveSource,
  /swiftMarchUsedAtMs[\s\S]*?shopItems\[SWIFT_MARCH_ORDER_ITEM_ID\]\s*=\s*ownedOrders\s*\+\s*1/,
  "A blocked converted Swift March is not refunded."
);
requireMatch(
  resolveSource,
  /recordDirectionalAntiFarmBattle\(transaction,\s*antiFarmContext,[\s\S]*?defenderNonMainCityCountBefore[\s\S]*?attackerKingPowerForXp[\s\S]*?defenderKingPowerForXp/,
  "Resolved PvP battles do not record authoritative city-count and power evidence."
);
requireMatch(
  resolveSource,
  /if \(result\.success\)[\s\S]*?targetPatch\s*=\s*\{[\s\S]*?getNeutralOriginOwnershipPatch\(target,\s*attackerUid,\s*nowMs,\s*"city"\)/,
  "Successful combat captures do not atomically update neutral-origin provenance."
);
requireMatch(
  serverSource,
  /exports\.registerGameInstallation[\s\S]*?normalizeAntiFarmPairState\(pairData,\s*nowMs\)[\s\S]*?directions:\s*migratedPairState\.directions[\s\S]*?recentEvents:\s*migratedPairState\.recentEvents/,
  "Installation refresh can reactivate pre-v3 directional histories during migration."
);

requireMatch(
  firebaseClientSource,
  /GAME_INSTALLATION_STORAGE_KEY\s*=\s*"crownlands-game-installation-id-v1"[\s\S]*?localStorage/,
  "The browser installation ID is not persistent per browser profile."
);
requireMatch(
  firebaseClientSource,
  /onAuthStateChanged[\s\S]*?registerGameInstallation\(\{\s*force:\s*true\s*\}\)/,
  "The browser installation is not registered after sign-in."
);
requireMatch(
  rulesSource,
  /match \/realmSecurity\/\{resetId\}\/\{document=\*\*\}[\s\S]*?allow read, create, update, delete: if false;/,
  "Anti-abuse documents are not explicitly server-only."
);
requireMatch(
  gameRulesSource,
  /captured from a gray NPC[\s\S]*?three or fewer non-main cities[\s\S]*?two easy handoffs[\s\S]*?seven days/i,
  "The public rules do not explain the gray-city handoff policy."
);
requireMatch(
  privacySource,
  /one-way hash[\s\S]*?30 days[\s\S]*?seven-day history[\s\S]*?combat power, losses, city count, direction, and outcome/,
  "The privacy notice does not disclose directional security evidence and retention."
);
assert.doesNotMatch(
  `${gameSource}\n${serverSource}`,
  /CAPTURE_XP_COOLDOWN|getCaptureCooldownRemaining|getCaptureXpCooldownRemaining|City XP cooldown|Recent capture cooldown/,
  "Capture XP cooldown code or UI remains."
);

const dayMs = 24 * 60 * 60 * 1000;
const sandbox = {
  ANTI_FARM_POLICY_VERSION: 3,
  ANTI_FARM_INSTALLATION_RETENTION_MS: 30 * dayMs,
  ANTI_FARM_DIRECTION_WINDOW_MS: 7 * dayMs,
  ANTI_FARM_ALLOWED_EASY_CAPTURES: 2,
  ANTI_FARM_PAIR_BLOCK_MS: 7 * dayMs,
  ANTI_FARM_LOW_CITY_LIMIT: 3,
  ANTI_FARM_CONTESTED_DEFENSE_RATIO: 0.25,
  ANTI_FARM_MEANINGFUL_LOSS_RATIO: 0.2,
  ANTI_FARM_MIN_MEANINGFUL_TROOPS: 2,
  ANTI_FARM_MAX_EVENT_HISTORY: 24,
  ATTACK_PROTECTION_ASSAULT_MIN_RATIO: 2,
  ONLINE_WORLD_ID: "test-world",
  RESET_GENERATION: "test-reset",
  FieldValue: {
    delete: () => "__delete__",
    serverTimestamp: () => "__timestamp__",
  },
  Date,
  Math,
  Number,
  safeString(value, maximum = 1000) {
    return String(value || "").trim().slice(0, maximum);
  },
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  timestampToMs(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  },
  getOwnerUid(target = {}) {
    return String(target.ownerUid || "");
  },
  isStronghold(target = {}) {
    return Boolean(target.kind === "stronghold" || target.strongholdType);
  },
  isCrownCitadel(target = {}) {
    return Boolean(target.id === "crown-citadel" || target.strongholdType === "crown");
  },
  isGivenUpNeutralCity(target = {}) {
    return Number(target.relinquishedAtMs || target.relocatedAtMs || 0) > 0;
  },
  normalizeRegionId(value = "") {
    return String(value || "").toLowerCase();
  },
  writeAntiFarmAudit() {},
};
vm.createContext(sandbox);
vm.runInContext(
  [
    "getAntiFarmPairUids",
    "normalizeAntiFarmBattleEvents",
    "normalizeAntiFarmDirectionState",
    "normalizeAntiFarmPairState",
    "getAntiFarmDirectionKey",
    "getOppositeAntiFarmDirectionKey",
    "isAntiFarmRegularCityTarget",
    "isDirectionalAntiFarmTarget",
    "getNeutralOriginProvenance",
    "isNeutralOriginHandoffTarget",
    "getNeutralOriginClearedPatch",
    "getNeutralOriginOwnershipPatch",
    "createAntiFarmPolicy",
    "evaluateAntiFarmPairData",
    "getAntiFarmTargetKey",
    "recordDirectionalAntiFarmBattle",
  ].map(name => extractFunction(serverSource, name)).join("\n")
    + "\nthis.normalizeAntiFarmPairState = normalizeAntiFarmPairState;"
    + "\nthis.evaluateAntiFarmPairData = evaluateAntiFarmPairData;"
    + "\nthis.recordDirectionalAntiFarmBattle = recordDirectionalAntiFarmBattle;"
    + "\nthis.getNeutralOriginProvenance = getNeutralOriginProvenance;"
    + "\nthis.getNeutralOriginOwnershipPatch = getNeutralOriginOwnershipPatch;",
  sandbox,
  { filename: serverPath }
);

const nowMs = 100 * dayMs;
const playerA = "collector";
const playerB = "feeder";
const targetB = {
  id: "city-b",
  regionId: "west",
  ownerUid: playerB,
  isMainCity: false,
  neutralOriginOwnerUid: playerB,
  neutralOriginCapturedAtMs: nowMs - 30 * dayMs,
  neutralOriginSource: "combat",
};
const establishedTargetB = { id: "city-b-old", regionId: "west", ownerUid: playerB, isMainCity: false };
const targetA = { id: "city-a", regionId: "west", ownerUid: playerA, isMainCity: false };
const pairRef = { id: "pair" };

function applyBattle(pairData, overrides = {}) {
  const writes = [];
  const transaction = {
    set(ref, data, options) {
      writes.push({ ref, data, options });
    },
  };
  const args = {
    eventId: `event-${Math.random()}`,
    attackerUid: playerA,
    defenderUid: playerB,
    target: targetB,
    targetType: "city",
    targetRegionId: "west",
    defenderCityCount: 3,
    attackerKingPower: 1000,
    defenderKingPower: 1000,
    committedTroops: 100,
    defendersAtStart: 40,
    result: {
      success: true,
      attackPower: 1000,
      defensePower: 200,
      attackerLosses: 19,
      defenderLosses: 40,
      survivors: 81,
    },
    nowMs,
    ...overrides,
  };
  const pairState = sandbox.normalizeAntiFarmPairState({
    version: 3,
    pairUids: [playerA, playerB].sort(),
    ...pairData,
  }, args.nowMs);
  const recorded = sandbox.recordDirectionalAntiFarmBattle(
    transaction,
    { pairRef, pairState },
    args
  );
  const pairWrite = writes.find(write => write.ref === pairRef);
  assert.equal(recorded, true, "Battle was not recorded.");
  assert.ok(pairWrite, "Battle did not update the pair record.");
  return pairWrite.data;
}

function directionFor(pairData, attackerUid, defenderUid, atMs = nowMs) {
  const state = sandbox.normalizeAntiFarmPairState(pairData, atMs);
  const key = attackerUid < defenderUid ? "leftToRight" : "rightToLeft";
  return state.directions[key];
}

const neutralOriginPatch = sandbox.getNeutralOriginOwnershipPatch(
  { id: "gray-city", regionId: "west", ownerUid: "", isMainCity: false },
  playerB,
  nowMs,
  "city"
);
assert.equal(neutralOriginPatch.neutralOriginOwnerUid, playerB, "A direct gray-city capture was not marked for its new owner.");
assert.equal(neutralOriginPatch.neutralOriginCapturedAtMs, nowMs, "The gray-city capture timestamp was not recorded.");
assert.equal(neutralOriginPatch.neutralOriginSource, "combat", "The gray-city provenance source was not combat.");
assert.equal(
  sandbox.getNeutralOriginOwnershipPatch(targetB, playerA, nowMs + 1000, "city").neutralOriginOwnerUid,
  "",
  "The neutral-origin marker survived the city's first player-to-player ownership change."
);
assert.equal(
  sandbox.getNeutralOriginOwnershipPatch(
    { id: "relinquished", ownerUid: "", relinquishedAtMs: nowMs - 1000 },
    playerB,
    nowMs,
    "city"
  ).neutralOriginOwnerUid,
  "",
  "A relinquished player city was treated as a gray NPC city."
);
assert.ok(
  sandbox.getNeutralOriginProvenance(targetB, "city"),
  "Neutral-origin provenance incorrectly expired with time."
);
assert.ok(
  sandbox.getNeutralOriginProvenance({
    ...establishedTargetB,
    neutralClaimOpen: true,
    neutralClaimedByUid: playerB,
    neutralClaimedAtMs: nowMs - 60 * dayMs,
    neutralClaimSource: "attack",
  }, "city"),
  "Valid legacy combat provenance was not recognized."
);
assert.equal(
  sandbox.getNeutralOriginProvenance({
    ...establishedTargetB,
    neutralClaimOpen: true,
    neutralClaimedByUid: playerB,
    neutralClaimedAtMs: nowMs - dayMs,
    neutralClaimSource: "deed_camp",
  }, "city"),
  null,
  "A legacy Deed Camp award was treated as a combat-captured gray city."
);

const establishedCapture = applyBattle({}, {
  eventId: "established-capture",
  target: establishedTargetB,
});
assert.equal(
  directionFor(establishedCapture, playerA, playerB).strikes.length,
  0,
  "An established player city generated a farming strike."
);

let pairData = applyBattle({}, { eventId: "easy-1" });
assert.equal(directionFor(pairData, playerA, playerB).strikes.length, 1, "First easy capture did not add one strike.");
assert.equal(directionFor(pairData, playerA, playerB).blockedUntilMs, 0, "First easy capture blocked too early.");
assert.equal(
  directionFor(pairData, playerA, playerB, nowMs + 7 * dayMs + 1).strikes.length,
  0,
  "A strike survived beyond the rolling seven-day window."
);

const duplicateWrites = [];
const duplicateRecorded = sandbox.recordDirectionalAntiFarmBattle(
  { set(ref, data, options) { duplicateWrites.push({ ref, data, options }); } },
  {
    pairRef,
    pairState: sandbox.normalizeAntiFarmPairState(pairData, nowMs),
  },
  {
    eventId: "easy-1",
    attackerUid: playerA,
    defenderUid: playerB,
    target: targetB,
    targetType: "city",
    targetRegionId: "west",
    defenderCityCount: 3,
    attackerKingPower: 1000,
    defenderKingPower: 1000,
    committedTroops: 100,
    defendersAtStart: 40,
    result: {
      success: true,
      attackPower: 1000,
      defensePower: 200,
      attackerLosses: 19,
      defenderLosses: 40,
    },
    nowMs,
  }
);
assert.equal(duplicateRecorded, false, "A duplicate battle event was recorded twice.");
assert.equal(duplicateWrites.length, 0, "A duplicate battle event produced Firestore writes.");

pairData = applyBattle(pairData, { eventId: "easy-2", nowMs: nowMs + 1000 });
let direction = directionFor(pairData, playerA, playerB, nowMs + 1000);
assert.equal(direction.strikes.length, 2, "Second easy capture did not retain two strikes.");
assert.equal(direction.blockedUntilMs, nowMs + 1000 + 7 * dayMs, "Second easy capture did not activate a seven-day block.");

let decision = sandbox.evaluateAntiFarmPairData({
  pairData,
  target: targetB,
  targetType: "city",
  attackerUid: playerA,
  defenderUid: playerB,
  nowMs: nowMs + 2000,
});
assert.equal(decision.policy.blocked, true, "Third A-to-B attack was not blocked.");
assert.equal(decision.policy.reason, "one-way-neutral-city-farming", "Directional block returned the wrong public reason.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData,
  target: establishedTargetB,
  targetType: "city",
  attackerUid: playerA,
  defenderUid: playerB,
  nowMs: nowMs + 2000,
});
assert.equal(decision.policy.blocked, false, "An established B city was blocked by the gray-city handoff restriction.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData,
  target: targetA,
  targetType: "city",
  attackerUid: playerB,
  defenderUid: playerA,
  nowMs: nowMs + 2000,
});
assert.equal(decision.policy.blocked, false, "B-to-A fighting was incorrectly blocked.");

let oneStrike = applyBattle({}, { eventId: "threshold-seed" });
let contested = applyBattle(oneStrike, {
  eventId: "defense-threshold",
  result: {
    success: true,
    attackPower: 1000,
    defensePower: 250,
    attackerLosses: 0,
    defenderLosses: 40,
  },
  nowMs: nowMs + 1000,
});
assert.equal(directionFor(contested, playerA, playerB, nowMs + 1000).strikes.length, 0, "Exactly 25% defense did not remove a strike.");

contested = applyBattle(oneStrike, {
  eventId: "loss-threshold",
  result: {
    success: true,
    attackPower: 1000,
    defensePower: 100,
    attackerLosses: 20,
    defenderLosses: 40,
  },
  nowMs: nowMs + 1000,
});
assert.equal(directionFor(contested, playerA, playerB, nowMs + 1000).strikes.length, 0, "Exactly 20% attacker losses did not remove a strike.");

const tokenAttack = applyBattle(oneStrike, {
  eventId: "token-attack",
  committedTroops: 1,
  defendersAtStart: 10,
  result: {
    success: false,
    attackPower: 2,
    defensePower: 100,
    attackerLosses: 1,
    defenderLosses: 0,
  },
  nowMs: nowMs + 1000,
});
assert.equal(directionFor(tokenAttack, playerA, playerB, nowMs + 1000).strikes.length, 1, "A one-troop attack erased a strike.");

const meaningfulReverse = applyBattle(oneStrike, {
  eventId: "meaningful-reverse",
  attackerUid: playerB,
  defenderUid: playerA,
  target: targetA,
  committedTroops: 100,
  defendersAtStart: 100,
  result: {
    success: false,
    attackPower: 250,
    defensePower: 1000,
    attackerLosses: 100,
    defenderLosses: 5,
  },
  nowMs: nowMs + 1000,
});
assert.equal(directionFor(meaningfulReverse, playerA, playerB, nowMs + 1000).strikes.length, 0, "Meaningful reverse combat did not remove one strike.");

const reverseCapture = applyBattle(pairData, {
  eventId: "reverse-capture",
  attackerUid: playerB,
  defenderUid: playerA,
  target: targetA,
  result: {
    success: true,
    attackPower: 1000,
    defensePower: 200,
    attackerLosses: 19,
    defenderLosses: 40,
  },
  nowMs: nowMs + 3000,
});
direction = directionFor(reverseCapture, playerA, playerB, nowMs + 3000);
assert.equal(direction.strikes.length, 0, "A reverse capture did not clear the original direction's strikes.");
assert.equal(direction.blockedUntilMs, 0, "A reverse capture did not reopen the original attack direction.");

const largeDefender = applyBattle({}, { eventId: "large-defender", defenderCityCount: 4 });
assert.equal(directionFor(largeDefender, playerA, playerB).strikes.length, 0, "A defender with more than three cities generated a strike.");

const protectedRatio = applyBattle({}, {
  eventId: "protected-ratio",
  attackerKingPower: 2000,
  defenderKingPower: 1000,
});
assert.equal(directionFor(protectedRatio, playerA, playerB).strikes.length, 0, "A 2x power mismatch entered the directional detector.");

const protectedReverseCapture = applyBattle(pairData, {
  eventId: "protected-reverse-capture",
  attackerUid: playerB,
  defenderUid: playerA,
  target: targetA,
  attackerKingPower: 2000,
  defenderKingPower: 1000,
  result: {
    success: true,
    attackPower: 2000,
    defensePower: 100,
    attackerLosses: 0,
    defenderLosses: 40,
  },
  nowMs: nowMs + 3000,
});
direction = directionFor(protectedReverseCapture, playerA, playerB, nowMs + 3000);
assert.equal(direction.strikes.length, 0, "A successful reverse capture did not clear the original direction outside the normal power band.");
assert.equal(direction.blockedUntilMs, 0, "A successful reverse capture did not clear the active directional block outside the normal power band.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData,
  target: targetB,
  targetType: "city",
  attackerUid: playerA,
  defenderUid: playerB,
  normalPowerRange: false,
  nowMs: nowMs + 2000,
});
assert.equal(
  decision.policy.blocked,
  false,
  "An active directional block overrode the existing 2x weaker-kingdom protection."
);

for (const excluded of [
  { ...targetB, isMainCity: true },
  { ...targetB, kind: "stronghold" },
  { ...targetB, id: "crown-citadel", strongholdType: "crown" },
]) {
  decision = sandbox.evaluateAntiFarmPairData({
    pairData,
    target: excluded,
    targetType: "city",
    attackerUid: playerA,
    defenderUid: playerB,
    nowMs: nowMs + 2000,
  });
  assert.equal(decision.policy.blocked, false, `${excluded.id} was incorrectly subject to the directional block.`);
}
decision = sandbox.evaluateAntiFarmPairData({
  pairData,
  target: { ...targetB, campType: "gold" },
  targetType: "camp",
  attackerUid: playerA,
  defenderUid: playerB,
  nowMs: nowMs + 2000,
});
assert.equal(decision.policy.blocked, false, "A reward camp was incorrectly subject to the directional block.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData: {
    version: 1,
    pairUids: [playerA, playerB].sort(),
    freshHandoffs: [{ eventId: "legacy" }],
    blockedUntilMs: nowMs + 7 * dayMs,
    blockReason: "repeated-fresh-neutral-handoffs",
  },
  target: targetB,
  targetType: "city",
  attackerUid: playerA,
  defenderUid: playerB,
  nowMs,
});
assert.equal(decision.policy.blocked, false, "A legacy fresh-neutral block survived the version-3 migration.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData: {
    version: 2,
    pairUids: [playerA, playerB].sort(),
    directions: {
      leftToRight: {
        strikes: [{
          eventId: "broad-v2-strike",
          atMs: nowMs,
          type: "easy-low-city-capture",
          attackerUid: playerA,
          defenderUid: playerB,
        }],
        blockedUntilMs: nowMs + 7 * dayMs,
        blockReason: "repeated-one-way-low-city-captures",
      },
    },
  },
  target: targetB,
  targetType: "city",
  attackerUid: playerA,
  defenderUid: playerB,
  nowMs,
});
assert.equal(decision.policy.blocked, false, "A broad version-2 directional block survived the version-3 migration.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData: {
    version: 2,
    pairUids: [playerA, playerB].sort(),
    sharedInstallationLastSeenAtMs: nowMs - 29 * dayMs,
  },
  target: { ...targetB, kind: "stronghold" },
  targetType: "city",
  attackerUid: playerA,
  defenderUid: playerB,
  nowMs,
});
assert.equal(decision.policy.blocked, true, "A live shared-installation link was lost during migration.");

console.log("Validated gray-city handoff farming prevention, provenance, resistance, migration, and immediate capture XP.");
