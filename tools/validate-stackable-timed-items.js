const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = `${fs.readFileSync(path.join(root, "instant-economy-actions.js"), "utf8")}\n${fs.readFileSync(path.join(root, "game.js"), "utf8")}`;

const activationSource = serverSource.slice(
  serverSource.indexOf("exports.activateInventoryItem"),
  serverSource.indexOf("exports.useSwiftMarchOrder")
);

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

const overlapContext = {
  Date,
  Math,
  Number,
  safeNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  },
  timestampToMs(value) {
    return Math.max(0, Number(value) || 0);
  },
  clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  },
};
vm.createContext(overlapContext);
vm.runInContext([
  readFunction(serverSource, "getTimedProductionBoostOverlapSeconds"),
  readFunction(serverSource, "resolveTimedProductionBoostStartedAtMs"),
  "this.getTimedProductionBoostOverlapSeconds = getTimedProductionBoostOverlapSeconds;",
  "this.resolveTimedProductionBoostStartedAtMs = resolveTimedProductionBoostStartedAtMs;",
].join("\n"), overlapContext);

const itemDurationMs = 30 * 60 * 1000;
const effectStartedAtMs = 10_000_000;
for (const quantity of [1, 2, 3]) {
  const effectExpiresAtMs = effectStartedAtMs + itemDurationMs * quantity;
  assert.equal(
    overlapContext.getTimedProductionBoostOverlapSeconds(
      effectStartedAtMs,
      effectExpiresAtMs,
      effectStartedAtMs,
      effectExpiresAtMs
    ),
    itemDurationMs * quantity / 1000,
    `${quantity} stacked timed items did not credit their complete active interval.`
  );
}
const tripleExpiresAtMs = effectStartedAtMs + itemDurationMs * 3;
for (let windowIndex = 0; windowIndex < 3; windowIndex += 1) {
  const windowStartMs = effectStartedAtMs + itemDurationMs * windowIndex;
  assert.equal(
    overlapContext.getTimedProductionBoostOverlapSeconds(
      windowStartMs,
      windowStartMs + itemDurationMs,
      effectStartedAtMs,
      tripleExpiresAtMs
    ),
    itemDurationMs / 1000,
    `Stacked timed items did not credit active window ${windowIndex + 1}.`
  );
}
assert.equal(
  overlapContext.getTimedProductionBoostOverlapSeconds(
    effectStartedAtMs - itemDurationMs,
    effectStartedAtMs,
    effectStartedAtMs,
    tripleExpiresAtMs
  ),
  0,
  "Production before timed-item activation was boosted."
);
assert.equal(
  overlapContext.getTimedProductionBoostOverlapSeconds(
    tripleExpiresAtMs,
    tripleExpiresAtMs + itemDurationMs,
    effectStartedAtMs,
    tripleExpiresAtMs
  ),
  0,
  "Production after timed-item expiry was boosted."
);
assert.equal(
  overlapContext.resolveTimedProductionBoostStartedAtMs(0, tripleExpiresAtMs, effectStartedAtMs),
  effectStartedAtMs,
  "A legacy active timer did not migrate from the safe economy checkpoint."
);

assert.match(
  activationSource,
  /itemId === WAR_DRUMS_ITEM_ID[\s\S]*?itemEffects\.warDrumsStartedAtMs = nowMs;[\s\S]*?expiresAtMs = Math\.max\(nowMs, currentExpiresAtMs\) \+ WAR_DRUMS_DURATION_MS \* requestedQuantity;/,
  "War Drums must extend the active server timer instead of replacing it."
);
assert.match(
  activationSource,
  /itemId === ROYAL_TAX_DECREE_ITEM_ID[\s\S]*?itemEffects\.royalTaxDecreeStartedAtMs = nowMs;[\s\S]*?expiresAtMs = Math\.max\(nowMs, currentExpiresAtMs\) \+ ROYAL_TAX_DECREE_DURATION_MS \* requestedQuantity;/,
  "Royal Tax Decrees must extend the active server timer instead of replacing it."
);
for (const label of ["War Drums", "Royal Tax Decree"]) {
  const branchStart = activationSource.indexOf(`} else if (itemId === ${label === "War Drums" ? "WAR_DRUMS_ITEM_ID" : "ROYAL_TAX_DECREE_ITEM_ID"})`);
  const nextBranch = activationSource.indexOf("} else if", branchStart + 10);
  const branch = activationSource.slice(branchStart, nextBranch);
  assert.doesNotMatch(branch, /already active/, `${label} still rejects use while active on the server.`);
}
assert.match(
  activationSource,
  /effectDurationAddedMs:[\s\S]*?WAR_DRUMS_DURATION_MS[\s\S]*?ROYAL_TAX_DECREE_DURATION_MS/,
  "Stackable timed-item responses must report their added duration."
);

assert.match(
  clientSource,
  /function isStackableTimedInventoryItem[\s\S]*?WAR_DRUMS_ITEM_ID \|\| itemId === ROYAL_TAX_DECREE_ITEM_ID/,
  "The inventory must recognize both stackable timed items."
);
assert.match(
  clientSource,
  /selectedEntryActiveRemaining > 0 && !selectedEntryIsStackable \? "disabled" : ""/,
  "Active stackable items must remain usable in the Bag."
);
assert.match(
  clientSource,
  /selectedEntryActiveRemaining > 0[\s\S]*?selectedEntryIsStackable \? `Add \$\{formatDuration\([\s\S]*?\)\}` : "Active"[\s\S]*?: "Use"/,
  "The Bag must show Use before activation and Add 30m while a stackable timer is active."
);
assert.match(
  clientSource,
  /!isStackableTimedInventoryItem\(item\) && projectedActive > Date\.now\(\)/,
  "The generic active-item guard must allow stackable item use."
);
assert.match(
  clientSource,
  /if \(inventory\[item\.id\] <= 0 && selectedInventoryItemId === item\.id\) \{\s*selectedInventoryItemId = "";/,
  "The selected stackable item must only be cleared after its final copy is consumed."
);
assert.match(
  clientSource,
  /const selectedEntry = slots\.find\([\s\S]*?selectedInventoryItemId\) \|\| null;\s*if \(!selectedEntry\) selectedInventoryItemId = "";/,
  "The Bag must clear a selection once the selected item no longer has an inventory slot."
);
assert.match(
  clientSource,
  /async function useWarDrums[\s\S]*?Math\.max\(nowMs, currentExpiresAtMs\) \+ WAR_DRUMS_DURATION_MS[\s\S]*?effects\.warDrumsStartedAtMs = nowMs/,
  "The local War Drums fallback must stack duration."
);
assert.match(
  clientSource,
  /async function useRoyalTaxDecree[\s\S]*?Math\.max\(nowMs, currentExpiresAtMs\) \+ ROYAL_TAX_DECREE_DURATION_MS[\s\S]*?effects\.royalTaxDecreeStartedAtMs = nowMs/,
  "The local Royal Tax Decree fallback must stack duration."
);
const serverUseSource = clientSource.slice(
  clientSource.indexOf("async function useServerInventoryItem"),
  clientSource.indexOf("async function useRoyalPeaceShield")
);
assert.match(
  serverUseSource,
  /if \(modal\?\.open && modal\.classList\.contains\("inventory-modal"\)\) \{\s*if \(isStackableTimedInventoryItem\(item\)\) showInventoryModal\(\);\s*else modal\.close\(\);\s*\}/,
  "Successful server uses must re-render the open Bag for stackable items and retain normal closing behavior for other items."
);
for (const [functionName, nextFunctionName] of [
  ["useWarDrums", "useRoyalTaxDecree"],
  ["useRoyalTaxDecree", "useVeilOfSilence"],
]) {
  const localUseSource = clientSource.slice(
    clientSource.indexOf(`async function ${functionName}`),
    clientSource.indexOf(`async function ${nextFunctionName}`)
  );
  assert.match(
    localUseSource,
    /if \(modal\?\.open && modal\.classList\.contains\("inventory-modal"\)\) showInventoryModal\(\);/,
    `${functionName} must keep and refresh the Bag after a local activation.`
  );
  assert.doesNotMatch(localUseSource, /modal\.close\(\)/, `${functionName} must not close the Bag.`);
}
assert.match(clientSource, /Using more adds their duration to the active timer\./);

console.log("Stackable War Drums and Royal Tax Decree validation passed.");
