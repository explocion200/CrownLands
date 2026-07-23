const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

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

const sandbox = {
  getOwnerUid(target = {}) {
    return String(target.ownerUid || "");
  },
  isStronghold(target = {}) {
    return target.kind === "stronghold" || Boolean(target.strongholdType) || target.id === "center_crown_citadel";
  },
};
vm.createContext(sandbox);
vm.runInContext(readFunction(serverSource, "canUseSwiftMarchOrderOnTransfer"), sandbox);

const uid = "player-one";
const ownedCity = { id: "city-1", ownerUid: uid };
const secondOwnedCity = { id: "city-2", ownerUid: uid };
const ownedStronghold = { id: "west_gold_stronghold", kind: "stronghold", ownerUid: uid };
const ownedCitadel = { id: "center_crown_citadel", kind: "stronghold", strongholdType: "crown", ownerUid: uid };
const baseArmy = { kind: "transfer", targetType: "city", ownerUid: uid };

assert.equal(
  sandbox.canUseSwiftMarchOrderOnTransfer(baseArmy, ownedCity, secondOwnedCity, uid),
  true,
  "Owned city transfers should remain eligible."
);
assert.equal(
  sandbox.canUseSwiftMarchOrderOnTransfer(baseArmy, ownedCity, ownedStronghold, uid),
  true,
  "Reinforcing an owned Stronghold should be eligible."
);
assert.equal(
  sandbox.canUseSwiftMarchOrderOnTransfer(baseArmy, ownedCity, ownedCitadel, uid),
  true,
  "Reinforcing the owned Crown Citadel should be eligible."
);
assert.equal(
  sandbox.canUseSwiftMarchOrderOnTransfer(baseArmy, ownedStronghold, secondOwnedCity, uid),
  false,
  "Moving troops from a Stronghold to a regular city should remain ineligible."
);
assert.equal(
  sandbox.canUseSwiftMarchOrderOnTransfer({ ...baseArmy, targetType: "camp" }, ownedCity, ownedStronghold, uid),
  false,
  "Camp reinforcements should remain ineligible."
);
assert.equal(
  sandbox.canUseSwiftMarchOrderOnTransfer({ ...baseArmy, kind: "attack" }, ownedCity, ownedStronghold, uid),
  false,
  "Stronghold attacks should remain ineligible."
);
assert.equal(
  sandbox.canUseSwiftMarchOrderOnTransfer(baseArmy, ownedCity, { ...ownedStronghold, ownerUid: "rival" }, uid),
  false,
  "Enemy Strongholds should remain ineligible."
);

assert.match(
  serverSource,
  /exports\.useSwiftMarchOrder[\s\S]*?canUseSwiftMarchOrderOnTransfer\(army, source, target, uid\)/,
  "The callable must enforce the shared server-side eligibility rule."
);
assert.match(
  clientSource,
  /function isSwiftMarchOrderEligible[\s\S]*?if \(isStronghold\(target\)\) return true;[\s\S]*?return !isStronghold\(source\);/,
  "The active-march UI must expose Swift March for owned Stronghold and Citadel reinforcements."
);

console.log("Validated Swift March Orders for owned-city transfers and owned Stronghold reinforcements.");
