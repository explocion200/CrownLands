const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const stylesSource = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}`;
const indexes = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"));

assert.match(firebaseSource, /function subscribePlayerCamps[\s\S]*?collectionGroup\(client\.db, "camps"\)[\s\S]*?where\("holderUid", "==", client\.user\.uid\)/, "Held camps should use one ownership-only collection-group listener.");
assert.match(gameSource, /function getActiveOperationsSnapshot[\s\S]*?marches:[\s\S]*?camps:[\s\S]*?strongholds:/, "Kingdom activity should expose marches, camps, and strongholds.");
assert.match(gameSource, /data-active-operations-tab="\$\{tab\.id\}"/, "Kingdom activity should render category tabs.");
assert.match(gameSource, /function renderHeldCampOperationCard[\s\S]*?timerLabel[\s\S]*?renderActiveOperationLocationButton/, "Held camp cards should include their timer and location control.");
assert.match(gameSource, /function renderHeldStrongholdOperationCard[\s\S]*?Held[\s\S]*?renderActiveOperationLocationButton/, "Held stronghold cards should include a location control without a timer.");
assert.match(gameSource, /function getHeldStrongholdsForActiveOperations[\s\S]*?getCrownCitadelHolderUid\(\) === currentUid[\s\S]*?onlineOwnedCitiesCache = onlineOwnedCitiesCache\.filter\(city => !isCrownCitadel\(city\)\)/, "Kingdom Activity should evict a stale Citadel after authoritative control changes.");
assert.match(stylesSource, /\.active-operations-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/, "The three activity categories should use a stable segmented layout.");

const campHolderIndex = (indexes.fieldOverrides || []).find(index => (
  index.collectionGroup === "camps"
  && index.fieldPath === "holderUid"
  && (index.indexes || []).some(entry => entry.queryScope === "COLLECTION_GROUP")
));
assert.ok(campHolderIndex, "Firestore needs a collection-group holderUid index for held camp activity.");

console.log("Validated categorized kingdom activity and the indexed held-camp subscription.");
