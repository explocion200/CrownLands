const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

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
  safeString(value, limit = 120) {
    return String(value || "").trim().slice(0, limit);
  },
};
vm.createContext(sandbox);
vm.runInContext(
  `${extractFunction("getActiveArmyTargetDisposition")}; this.getActiveArmyTargetDisposition = getActiveArmyTargetDisposition;`,
  sandbox
);

const transfer = { kind: "transfer", ownerUid: "sender" };
assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.getActiveArmyTargetDisposition(transfer, "captor"))),
  {
    kind: "attack",
    converted: true,
    convertedToAttack: true,
    targetOwnerUid: "captor",
  },
  "A reinforcement must become an attack when another player captures its destination."
);
assert.equal(
  sandbox.getActiveArmyTargetDisposition({ kind: "attack", ownerUid: "sender" }, "sender").kind,
  "transfer",
  "An attack must become a reinforcement if its sender retakes the destination before arrival."
);
assert.equal(
  sandbox.getActiveArmyTargetDisposition({ kind: "attack", ownerUid: "sender" }, "third-player").kind,
  "attack",
  "An attack must remain an attack when a third player captures the destination."
);
assert.equal(
  sandbox.getActiveArmyTargetDisposition({ kind: "scout", ownerUid: "sender" }, "captor").kind,
  "scout",
  "Ownership changes must not turn scouts into attacks."
);
assert.equal(
  sandbox.getActiveArmyTargetDisposition({ ...transfer, returning: true }, "captor").kind,
  "transfer",
  "Recalled armies must not become attacks."
);
assert.equal(
  sandbox.getActiveArmyTargetDisposition({ ...transfer, relinquishTransfer: true }, "captor").kind,
  "transfer",
  "Relinquishment returns must preserve their reroute behavior."
);

const refreshSource = extractFunction("refreshActiveArmyTargetOwner");
assert.match(refreshSource, /kind:\s*disposition\.kind/, "Retargeting must persist the new army kind.");
assert.match(
  refreshSource,
  /lastIncomingNotificationOwnerUid[\s\S]*?createIncomingArmyNotification/,
  "Retargeted attacks must queue one incoming notification for the new defender."
);

const resolveSource = serverSource.slice(
  serverSource.indexOf("async function resolveArmyOrderById"),
  serverSource.indexOf("exports.resolveArmyOrder")
);
assert.match(
  resolveSource,
  /const effectiveKind = army\.kind === "scout"[\s\S]*?defenderUid === attackerUid[\s\S]*?"transfer"[\s\S]*?"attack"/,
  "Arrival resolution must re-check current destination ownership."
);
assert.match(
  resolveSource,
  /convertedReinforcement[\s\S]*?createServerAttackProtectionSnapshot/,
  "Converted reinforcements must receive server-authoritative attack protection."
);

assert.match(
  clientSource,
  /const effectiveKind = rawKind === "transfer"[\s\S]*?targetOwnerUid !== ownerUid[\s\S]*?\? "attack"/,
  "The client must defensively display stale transferred armies as incoming attacks."
);

console.log("Validated reinforcement-to-attack retargeting and incoming notifications.");
