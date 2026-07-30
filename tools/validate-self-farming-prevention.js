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

requireMatch(serverSource, /ANTI_FARM_POLICY_VERSION\s*=\s*1/, "The anti-farming schema is not versioned.");
requireMatch(
  serverSource,
  /ANTI_FARM_INSTALLATION_RETENTION_MS\s*=\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
  "Installation links are not retained for exactly 30 days."
);
requireMatch(
  serverSource,
  /ANTI_FARM_FRESH_NEUTRAL_WINDOW_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
  "Fresh neutral provenance is not limited to exactly 24 hours."
);
requireMatch(
  serverSource,
  /ANTI_FARM_ALLOWED_FRESH_HANDOFFS\s*=\s*2/,
  "The pair policy does not tolerate exactly two fresh-neutral handoffs."
);
requireMatch(
  serverSource,
  /ANTI_FARM_PAIR_BLOCK_MS\s*=\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
  "The repeated-handoff penalty is not exactly seven days."
);
requireMatch(
  serverSource,
  /exports\.registerGameInstallation[\s\S]*?antiFarmHash\(installationId\)[\s\S]*?antiFarmInstallationRef\(installationHash\)/,
  "Installation IDs are not hashed and stored in the private anti-abuse namespace."
);
requireMatch(
  serverSource,
  /antiFarmInstallationRef[\s\S]*?realmSecurity\/\$\{RESET_GENERATION\}\/installations[\s\S]*?antiFarmAccountRef/,
  "Hashed installation records are not stored in the private anti-abuse namespace."
);
requireMatch(
  serverSource,
  /exports\.registerGameInstallation[\s\S]*?normalizeAntiFarmInstallationEntries[\s\S]*?installations,/,
  "Recent installation hashes are not retained per account."
);
requireMatch(
  serverSource,
  /cleanupExpiredAntiFarmInstallations[\s\S]*?expiresAtMs[\s\S]*?ANTI_FARM_INSTALLATION_RETENTION_MS[\s\S]*?batch\.delete/,
  "Expired installation hashes are not physically removed."
);
requireMatch(
  serverSource,
  /exports\.cleanupAntiFarmInstallations\s*=\s*onSchedule[\s\S]*?every 24 hours/,
  "Installation-link cleanup is not scheduled daily."
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
assert.ok(sendPolicyIndex >= 0, "Direct hostile launches do not enforce the pair policy.");
assert.ok(
  sendPolicyIndex < sendSource.indexOf("const useSwiftMarchOrder"),
  "Direct launch enforcement happens after Swift March item consumption."
);
assert.ok(
  sendPolicyIndex < sendSource.indexOf("sourceTroopPatch"),
  "Direct launch enforcement happens after troop consumption."
);
requireMatch(
  sendSource,
  /return\s*\{\s*ok:\s*false,\s*status:\s*"blocked"[\s\S]*?antiFarmPolicy:/,
  "Blocked direct launches do not return the structured anti-farm result."
);

const rallyLaunchStart = serverSource.indexOf('exports.launchClanRally = timedCallable("launchClanRally"');
const rallyLaunchEnd = serverSource.indexOf("exports.previewArmyProtection", rallyLaunchStart);
const rallyLaunchSource = serverSource.slice(rallyLaunchStart, rallyLaunchEnd);
requireMatch(
  rallyLaunchSource,
  /targetOwnerUid[\s\S]*?evaluateHostileAntiFarmPolicy[\s\S]*?status:\s*"blocked"/,
  "Rally leaders are not checked against the current defender before launch."
);

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
  /antiFarmContext\.policy\.blocked[\s\S]*?RALLY_STATUS_RECALLING[\s\S]*?antiFarmPolicy/,
  "Blocked rally arrivals do not turn the combined army around."
);
requireMatch(
  resolveSource,
  /swiftMarchUsedAtMs[\s\S]*?shopItems\[SWIFT_MARCH_ORDER_ITEM_ID\]\s*=\s*ownedOrders\s*\+\s*1/,
  "A converted Swift March transfer is not refunded when arrival enforcement cancels it."
);
requireMatch(
  resolveSource,
  /recordSuccessfulFreshNeutralHandoff\(transaction,\s*antiFarmContext/,
  "Successful fresh-neutral captures are not recorded atomically with resolution."
);
requireMatch(
  serverSource,
  /getNeutralClaimCapturePatch\(target,\s*attackerUid,\s*nowMs,\s*"attack"\)/,
  "Ordinary neutral captures do not record provenance."
);
requireMatch(
  serverSource,
  /getNeutralClaimCapturePatch\(deedCityAward\.city,\s*holderUid,\s*nowMs,\s*"deed_camp"\)/,
  "Deed Camp city awards do not record provenance."
);
requireMatch(
  serverSource,
  /getInactiveCityNeutralPatch[\s\S]*?getNeutralClaimClearedPatch\(nowMs\)/,
  "Inactivity neutralization does not clear provenance."
);
requireMatch(
  serverSource,
  /exports\.relinquishCity[\s\S]*?getNeutralClaimClearedPatch\(nowMs\)/,
  "Relinquishment does not clear provenance."
);
requireMatch(
  serverSource,
  /writeAntiFarmAudit[\s\S]*?neutralClaimedByUid[\s\S]*?blockedUntilMs/,
  "Private moderation evidence does not include provenance, reason, and expiration."
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
  firebaseClientSource,
  /heartbeatGameServer[\s\S]*?registerGameInstallation\(\)/,
  "Active play does not periodically refresh installation registration."
);
requireMatch(
  firebaseClientSource,
  /sendArmyOrder[\s\S]*?antiFarmPolicy\?\.blocked[\s\S]*?functions\/failed-precondition/,
  "Blocked launches are not surfaced to the existing order error UI."
);
requireMatch(
  firebaseClientSource,
  /launchClanRally[\s\S]*?antiFarmPolicy\?\.blocked[\s\S]*?functions\/failed-precondition/,
  "Blocked rally launches are not surfaced to the clan UI."
);
requireMatch(
  gameSource,
  /applyServerArmyResult[\s\S]*?antiFarmPolicy\?\.blocked[\s\S]*?showToast/,
  "Arrival-time policy cancellations are not shown to the player."
);
requireMatch(
  rulesSource,
  /match \/realmSecurity\/\{resetId\}\/\{document=\*\*\}[\s\S]*?allow read, create, update, delete: if false;/,
  "Anti-abuse documents are not explicitly server-only."
);
requireMatch(
  gameRulesSource,
  /Multiple accounts are permitted[\s\S]*?two successful captures[\s\S]*?seven-day period/,
  "The public rules do not explain the targeted multi-account policy."
);
requireMatch(
  privacySource,
  /persistent random game-installation identifier[\s\S]*?one-way hash[\s\S]*?30 days/,
  "The privacy notice does not disclose installation-link retention."
);

const dayMs = 24 * 60 * 60 * 1000;
const sandbox = {
  ANTI_FARM_INSTALLATION_RETENTION_MS: 30 * dayMs,
  ANTI_FARM_FRESH_NEUTRAL_WINDOW_MS: dayMs,
  ANTI_FARM_HANDOFF_WINDOW_MS: 7 * dayMs,
  ANTI_FARM_ALLOWED_FRESH_HANDOFFS: 2,
  ANTI_FARM_PAIR_BLOCK_MS: 7 * dayMs,
  ANTI_FARM_MAX_HANDOFF_HISTORY: 24,
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
};
vm.createContext(sandbox);
vm.runInContext(
  [
    "normalizeFreshHandoffHistory",
    "isFreshNeutralClaimTarget",
    "getNeutralClaimCapturePatch",
    "normalizeAntiFarmPairState",
    "createAntiFarmPolicy",
    "evaluateAntiFarmPairData",
  ].map(name => extractFunction(serverSource, name)).join("\n")
    + "\nthis.evaluateAntiFarmPairData = evaluateAntiFarmPairData;"
    + "\nthis.getNeutralClaimCapturePatch = getNeutralClaimCapturePatch;"
    + "\nthis.normalizeFreshHandoffHistory = normalizeFreshHandoffHistory;",
  sandbox,
  { filename: serverPath }
);

const nowMs = 100 * dayMs;
const defenderUid = "feeder";
const attackerUid = "collector";
const freshCity = {
  id: "gray-city",
  ownerUid: defenderUid,
  neutralClaimOpen: true,
  neutralClaimedByUid: defenderUid,
  neutralClaimedAtMs: nowMs - 23 * 60 * 60 * 1000,
};
const handoffs = [0, 1].map(index => ({
  eventId: `handoff-${index}`,
  atMs: nowMs - (index + 1) * 60 * 60 * 1000,
  attackerUid: index ? defenderUid : attackerUid,
  defenderUid: index ? attackerUid : defenderUid,
  targetKey: `city:west:${index}`,
  neutralClaimedAtMs: nowMs - 2 * 60 * 60 * 1000,
}));

let decision = sandbox.evaluateAntiFarmPairData({
  pairData: { freshHandoffs: handoffs.slice(0, 1) },
  target: freshCity,
  attackerUid,
  defenderUid,
  nowMs,
});
assert.equal(decision.policy.blocked, false, "The second qualifying handoff was blocked.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData: { freshHandoffs: handoffs },
  target: freshCity,
  attackerUid,
  defenderUid,
  nowMs,
});
assert.equal(decision.policy.blocked, true, "The third qualifying attempt was not blocked.");
assert.equal(decision.activatesPairBlock, true, "The third attempt did not activate the pair penalty.");
assert.equal(decision.policy.blockedUntilMs, nowMs + 7 * dayMs, "The pair penalty is not exactly seven days.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData: {
    freshHandoffs: handoffs,
    blockedUntilMs: nowMs + 4 * dayMs,
    blockReason: "repeated-fresh-neutral-handoffs",
  },
  target: { ...freshCity, neutralClaimedAtMs: nowMs - 2 * dayMs },
  attackerUid: defenderUid,
  defenderUid: attackerUid,
  nowMs,
});
assert.equal(decision.policy.blocked, true, "The reverse direction did not honor the active pair penalty.");
assert.equal(
  decision.policy.blockedUntilMs,
  nowMs + 4 * dayMs,
  "A blocked attempt incorrectly extended the existing penalty."
);

decision = sandbox.evaluateAntiFarmPairData({
  pairData: { sharedInstallationLastSeenAtMs: nowMs - 29 * dayMs },
  target: { id: "established", ownerUid: defenderUid },
  attackerUid,
  defenderUid,
  nowMs,
});
assert.equal(decision.policy.blocked, true, "An active shared-installation link did not block established-city PvP.");
assert.equal(
  decision.policy.blockedUntilMs,
  nowMs + dayMs,
  "The shared-installation block did not preserve its original 30-day expiry."
);

decision = sandbox.evaluateAntiFarmPairData({
  pairData: { sharedInstallationLastSeenAtMs: nowMs - 30 * dayMs },
  target: { id: "established", ownerUid: defenderUid },
  attackerUid,
  defenderUid,
  nowMs,
});
assert.equal(decision.policy.blocked, false, "An expired shared-installation link still blocked PvP.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData: { freshHandoffs: handoffs },
  target: { ...freshCity, neutralClaimedAtMs: nowMs - dayMs },
  attackerUid,
  defenderUid,
  nowMs,
});
assert.equal(decision.policy.blocked, false, "A city at or beyond 24 hours was treated as fresh.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData: { freshHandoffs: handoffs },
  target: { id: "legacy-city", ownerUid: defenderUid },
  attackerUid,
  defenderUid,
  nowMs,
});
assert.equal(decision.policy.blocked, false, "An existing city without provenance was treated as fresh.");

decision = sandbox.evaluateAntiFarmPairData({
  pairData: { freshHandoffs: handoffs },
  target: { ...freshCity, kind: "stronghold" },
  attackerUid,
  defenderUid,
  nowMs,
});
assert.equal(decision.policy.blocked, false, "Stronghold captures incorrectly counted as fresh-gray handoffs.");

assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.getNeutralClaimCapturePatch(
    { id: "neutral-city", ownerUid: "" },
    attackerUid,
    nowMs,
    "attack"
  ))),
  {
    neutralClaimOpen: true,
    neutralClaimedByUid: attackerUid,
    neutralClaimedAtMs: nowMs,
    neutralClaimSource: "attack",
    neutralClaimClosedAtMs: 0,
  },
  "Neutral capture provenance was not opened for the original claimant."
);
assert.equal(
  sandbox.getNeutralClaimCapturePatch({ ownerUid: defenderUid }, attackerUid, nowMs).neutralClaimOpen,
  false,
  "A player-to-player capture did not close neutral provenance."
);
assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.getNeutralClaimCapturePatch(
    { ownerUid: "", kind: "stronghold" },
    attackerUid,
    nowMs
  ))),
  {},
  "Strongholds must not receive neutral-city provenance."
);

const rolling = sandbox.normalizeFreshHandoffHistory([
  ...handoffs,
  {
    eventId: "expired",
    atMs: nowMs - 7 * dayMs,
    attackerUid,
    defenderUid,
    targetKey: "city:west:expired",
  },
], nowMs);
assert.equal(rolling.length, 2, "The rolling seven-day history retained an expired handoff.");

console.log("Validated targeted shared-installation and fresh-neutral self-farming prevention.");
