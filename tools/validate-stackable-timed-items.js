const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

const activationSource = serverSource.slice(
  serverSource.indexOf("exports.activateInventoryItem"),
  serverSource.indexOf("exports.useSwiftMarchOrder")
);

assert.match(
  activationSource,
  /itemId === WAR_DRUMS_ITEM_ID[\s\S]*?expiresAtMs = Math\.max\(nowMs, currentExpiresAtMs\) \+ WAR_DRUMS_DURATION_MS;/,
  "War Drums must extend the active server timer instead of replacing it."
);
assert.match(
  activationSource,
  /itemId === ROYAL_TAX_DECREE_ITEM_ID[\s\S]*?expiresAtMs = Math\.max\(nowMs, currentExpiresAtMs\) \+ ROYAL_TAX_DECREE_DURATION_MS;/,
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
  /activeRemainingSeconds > 0 && !isStackableTimedInventoryItem\(item\)/,
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
  /async function useWarDrums[\s\S]*?Math\.max\(nowMs, currentExpiresAtMs\) \+ WAR_DRUMS_DURATION_MS/,
  "The local War Drums fallback must stack duration."
);
assert.match(
  clientSource,
  /async function useRoyalTaxDecree[\s\S]*?Math\.max\(nowMs, currentExpiresAtMs\) \+ ROYAL_TAX_DECREE_DURATION_MS/,
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
