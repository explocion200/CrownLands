const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = serverSource.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}.`);
  const signatureEnd = serverSource.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `Could not find the end of ${name}'s signature.`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < serverSource.length; index += 1) {
    if (serverSource[index] === "{") depth += 1;
    if (serverSource[index] === "}") depth -= 1;
    if (depth === 0) return serverSource.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}.`);
}

const sandbox = {
  ALLIED_TARGET_RETURN_REASON: "target_became_clan_ally",
  ARMY_ORDER_KINDS: ["attack", "transfer", "reinforce", "scout"],
  RECALL_HORN_MINIMUM_RETURN_MS: 1000,
  Date,
  HttpsError: class HttpsError extends Error {},
  normalizeRegionId(value) {
    return String(value || "").trim();
  },
  normalizeRegionIds(values = []) {
    return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
  },
  safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
};
vm.createContext(sandbox);
vm.runInContext(
  `${extractFunction("createAlliedTargetReturnMovement")}; this.createAlliedTargetReturnMovement = createAlliedTargetReturnMovement;`,
  sandbox
);

const nowMs = 1_700_000_100_000;
const movement = sandbox.createAlliedTargetReturnMovement({
  id: "army-1",
  kind: "attack",
  ownerUid: "attacker",
  fromId: "origin-city",
  toId: "captured-city",
  sourceRegionId: "west",
  targetRegionId: "center",
  routeRegionIds: ["west", "center"],
  troops: 2500,
  launchedAtMs: nowMs - 100_000,
  arrivesAtMs: nowMs,
  total: 100,
  status: "active",
}, nowMs);

assert.equal(movement.status, "active", "The bounced army must remain active.");
assert.equal(movement.kind, "transfer", "The bounced army must become a safe transfer.");
assert.equal(movement.launchKind, "attack", "The original attack kind must remain available for provenance.");
assert.equal(movement.retargetedFromKind, "attack", "The conversion from attack must be explicit.");
assert.equal(movement.returning, true, "The bounced army must use reverse-route rendering.");
assert.equal(movement.returnReason, "target_became_clan_ally");
assert.equal(movement.returnStartProgress, 1, "The return must begin at the destination.");
assert.equal(movement.returnDestinationId, "origin-city");
assert.equal(movement.returnDestinationRegionId, "west");
assert.equal(movement.arrivesAtMs, nowMs + 100_000, "The return must take the full original travel time.");
assert.equal(movement.troops, 2500, "Troops must stay inside the march while it returns.");

const swiftMovement = sandbox.createAlliedTargetReturnMovement({
  id: "army-swift",
  kind: "attack",
  fromId: "origin-city",
  toId: "captured-city",
  sourceRegionId: "west",
  targetRegionId: "center",
  routeRegionIds: ["west", "center"],
  troops: 500,
  launchedAtMs: nowMs - 60_000,
  arrivesAtMs: nowMs,
  swiftMarchOriginalArrivesAtMs: nowMs + 40_000,
  total: 60,
}, nowMs);
assert.equal(
  swiftMovement.arrivesAtMs,
  nowMs + 100_000,
  "A Swift March bounce must use the original route duration instead of teleporting home."
);

const resolveSource = serverSource.slice(
  serverSource.indexOf("async function resolveArmyOrderById"),
  serverSource.indexOf("exports.resolveArmyOrder")
);
const alliedBranchStart = resolveSource.indexOf("if (becameClanAllies)");
const returningBranchStart = resolveSource.indexOf("if (isReturning)", alliedBranchStart);
const alliedBranch = resolveSource.slice(alliedBranchStart, returningBranchStart);
assert.match(alliedBranch, /createAlliedTargetReturnMovement\(army,\s*nowMs\)/);
assert.match(alliedBranch, /armyRefsForRegions\(movement\.routeRegionIds,\s*armyId\)[\s\S]*?transaction\.set\(ref,\s*movementPatch/);
assert.match(alliedBranch, /addActiveArmies:\s*\[movement\]/, "The returning troops must remain in active-army power.");
assert.doesNotMatch(
  alliedBranch,
  /returnTroopsToSource|markResolved/,
  "The allied-target branch must not teleport troops or resolve the march at the enemy city."
);
assert.match(resolveSource, /const isReturning = Boolean\(army\.returning\)/);
assert.match(
  resolveSource,
  /if \(isReturning\)[\s\S]*?returnRecalledTroops\(troopCount\)[\s\S]*?markResolved/,
  "The army must be credited and resolved only after its routed return arrives."
);

console.log("Allied target return validation passed.");
