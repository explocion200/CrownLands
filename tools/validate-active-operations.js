const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const readabilitySource = fs.readFileSync(path.join(root, "readability.css"), "utf8");
const visualQaSource = fs.readFileSync(path.join(root, "docs", "visual-qa", "report-leaderboard-readability", "index.html"), "utf8");
const stylesSource = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}\n${fs.readFileSync(path.join(root, "ui-contrast-correction.css"), "utf8")}`;
const indexes = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"));

assert.match(firebaseSource, /function subscribePlayerCamps[\s\S]*?collectionGroup\(client\.db, "camps"\)[\s\S]*?where\("holderUid", "==", client\.user\.uid\)/, "Held camps should use one ownership-only collection-group listener.");
assert.match(gameSource, /function getActiveOperationsSnapshot[\s\S]*?marches:[\s\S]*?camps:[\s\S]*?strongholds:/, "Kingdom activity should expose marches, camps, and strongholds.");
assert.match(gameSource, /function showIncomingAttacksModal\(\)[\s\S]*?modal\.className\s*=\s*"modal incoming-attack-modal";/, "Incoming Threats can retain a stale modal layout that clips marches.");
assert.match(gameSource, /function showOutgoingAttacksModal\(\)[\s\S]*?modal\.className\s*=\s*"modal outgoing-attack-modal";/, "Kingdom Activity can retain a stale modal layout that clips marches.");
assert.match(gameSource, /data-active-operations-tab="\$\{tab\.id\}"/, "Kingdom activity should render category tabs.");
assert.match(gameSource, /function renderHeldCampOperationCard[\s\S]*?timerLabel[\s\S]*?renderActiveOperationLocationButton/, "Held camp cards should include their timer and location control.");
assert.match(gameSource, /function renderHeldStrongholdOperationCard[\s\S]*?Held[\s\S]*?renderActiveOperationLocationButton/, "Held stronghold cards should include a location control without a timer.");
assert.match(gameSource, /function getHeldStrongholdsForActiveOperations[\s\S]*?getCrownCitadelHolderUid\(\) === currentUid[\s\S]*?onlineOwnedCitiesCache = onlineOwnedCitiesCache\.filter\(city => !isCrownCitadel\(city\)\)/, "Kingdom Activity should evict a stale Citadel after authoritative control changes.");
assert.match(stylesSource, /\.active-operations-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/, "The three activity categories should use a stable segmented layout.");
assert.match(stylesSource, /:is\(\.incoming-attack-modal,\.outgoing-attack-modal,\.battle-report-modal,\.scout-report-modal\) \.modal-card #modalBody\s*\{[\s\S]*?overflow-y:\s*auto !important;/, "Incoming and outgoing march lists must remain vertically scrollable.");
assert.match(readabilitySource, /:is\(\.modal\.incoming-attack-modal, \.modal\.outgoing-attack-modal\)[\s\S]*?:is\(\.incoming-attack-card, \.outgoing-attack-card\)[\s\S]*?:is\(strong, span, small, b, \.player-name-link\)[\s\S]*?color:\s*#fff8e8 !important;/, "Incoming and outgoing march-card text can still be repainted brown over dark command surfaces.");
assert.match(visualQaSource, /data-qa-march="incoming"[\s\S]*?data-qa-march="outgoing"/, "Responsive visual QA does not cover both incoming and outgoing march cards.");

const campHolderIndex = (indexes.fieldOverrides || []).find(index => (
  index.collectionGroup === "camps"
  && index.fieldPath === "holderUid"
  && (index.indexes || []).some(entry => entry.queryScope === "COLLECTION_GROUP")
));
assert.ok(campHolderIndex, "Firestore needs a collection-group holderUid index for held camp activity.");

console.log("Validated categorized kingdom activity and the indexed held-camp subscription.");
