const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = `${fs.readFileSync(path.join(root, "instant-economy-actions.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}`;
const stylesSource = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}`;

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

const clientSandbox = {
  isRewardCampTarget(target = {}) {
    return target.targetType === "camp" || target.kind === "camp";
  },
  isStronghold: sandbox.isStronghold,
};
vm.createContext(clientSandbox);
vm.runInContext(readFunction(clientSource, "canUseSwiftMarchOrderOnLaunch"), clientSandbox);

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

const clientOwnedCity = { id: "city-1", owner: "player" };
const clientSecondOwnedCity = { id: "city-2", owner: "player" };
const clientOwnedStronghold = { id: "west_gold_stronghold", kind: "stronghold", owner: "player" };
assert.equal(
  clientSandbox.canUseSwiftMarchOrderOnLaunch(clientOwnedCity, clientSecondOwnedCity),
  true,
  "The launch slider should allow regular owned-city transfers."
);
assert.equal(
  clientSandbox.canUseSwiftMarchOrderOnLaunch(clientOwnedCity, clientOwnedStronghold),
  true,
  "The launch slider should allow owned Stronghold reinforcements."
);
assert.equal(
  clientSandbox.canUseSwiftMarchOrderOnLaunch(clientOwnedStronghold, clientSecondOwnedCity),
  false,
  "The launch slider should reject Stronghold-to-city transfers."
);
assert.equal(
  clientSandbox.canUseSwiftMarchOrderOnLaunch(clientOwnedCity, { ...clientOwnedStronghold, owner: "enemy" }),
  false,
  "The launch slider should reject enemy destinations."
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
assert.match(
  clientSource,
  /useSwiftMarchOrder: Boolean\(mission\.useSwiftMarchOrder\)/,
  "The client army payload must carry the launch-time Swift March request."
);
assert.match(
  clientSource,
  /<strong>Swift March Order<\/strong>[\s\S]*?Available: \$\{formatNumber\(swiftMarchOrderCount\)\}[\s\S]*?id="swiftMarchLaunchToggle"/,
  "The slider must show the text-only Swift March option, available count, and toggle."
);
const launchOptionMarkupStart = clientSource.indexOf('<div class="swift-march-launch-option');
assert.ok(launchOptionMarkupStart >= 0, "The launch option markup must exist.");
assert.doesNotMatch(
  clientSource.slice(launchOptionMarkupStart, launchOptionMarkupStart + 900),
  /<img\b/i,
  "The launch option must not show an item icon."
);
assert.match(
  clientSource,
  /const travel = activeSwiftMarchOrderSelected[\s\S]*?baseTravel \* SWIFT_MARCH_REMAINING_TIME_MULTIPLIER/,
  "The slider preview must apply the Swift March multiplier."
);
assert.match(
  serverSource,
  /useSwiftMarchOrder: raw\.useSwiftMarchOrder === true \|\| data\.useSwiftMarchOrder === true/,
  "The server must normalize the optional launch-time Swift March flag."
);
assert.match(
  serverSource,
  /if \(useSwiftMarchOrder\) \{[\s\S]*?canUseSwiftMarchOrderOnTransfer\(swiftMarchArmy, source, target, uid\)[\s\S]*?ownedSwiftMarchOrders <= 0[\s\S]*?attackerEconomy\.shopItems\[SWIFT_MARCH_ORDER_ITEM_ID\] = ownedSwiftMarchOrders - 1;/,
  "The server launch transaction must validate eligibility and consume one owned order."
);
assert.match(
  serverSource,
  /\.\.\.\(useSwiftMarchOrder \? \{[\s\S]*?swiftMarchUsedAtMs: nowMs,[\s\S]*?swiftMarchOriginalArrivesAtMs: originalArrivesAtMs,[\s\S]*?swiftMarchRemainingMultiplier: SWIFT_MARCH_REMAINING_TIME_MULTIPLIER/,
  "A launch-time boost must store the same metadata used to prevent a second boost."
);
assert.match(
  stylesSource,
  /\.swift-march-launch-option \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*?\.swift-march-launch-toggle/,
  "The compact launch option must use a mobile-safe flexible layout."
);

console.log("Validated launch-time and active-march Swift March Orders.");
