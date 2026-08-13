const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("functions/index.js");
const client = read("game.js");
const firebase = read("firebaseClient.js");
const rules = read("firestore.rules");
const styles = `${read("styles.css")}\n${read("interface-theme.css")}`;
const worker = read("service-worker.js");
const docs = ["README.md", "game-rules.html", "how-to-play.html", "privacy.html", "FIREBASE_SETUP.md"]
  .map(read)
  .join("\n");

function absent(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

[
  "createClanOperation",
  "updateClanOperation",
  "setClanOperationStatus",
  "setClanOperationAssignment",
  "linkClanOperationRally",
  "shareClanOperationReport",
].forEach(name => {
  absent(server, new RegExp(`exports\\.${name}\\s*=`), `Retired ${name} callable is still exported.`);
  absent(firebase, new RegExp(`function\\s+${name}|${name}\\s*[:,]`), `Retired ${name} client API is still exposed.`);
});

absent(server, /clanWarRoomVersion/, "Retired War Room capability metadata remains in the server runtime.");
const serverWithoutTemporaryRetirement = server.replace(
  /const RETIRED_CLAN_WAR_ROOM_BATCH_SIZE[\s\S]*?(?=exports\.maintainGameServer)/,
  ""
);
absent(serverWithoutTemporaryRetirement, /operationContext|operationTiming/, "Retired operation metadata remains outside the temporary retirement worker.");
absent(firebase, /subscribeClanOperations|subscribeClanOperationDetails|loadClanOperationDetails/, "Retired operation subscriptions remain in the client API.");
absent(client, /onlineClanOperations|selectedClanOperation|renderClanWarRoomPanel|showClanOperationEditor|renderWarRoomPins|operationContext|war-room-map-pin|data-clan-section="rallies"/, "Retired operation-planner UI or separate Clan Rallies tab remains.");
absent(styles, /war-room-operation|war-room-order|war-room-assignment|war-room-map-pin|war-room-editor|battle-report-war-room/, "Retired operation-planner styling remains.");
absent(worker, /clan_war_room|assignmentId|kind === "reminder"/, "Retired War Room notifications remain in the service worker.");

assert.match(server, /exports\.createClanRally\s*=\s*timedCallable/, "Clan rally creation callable is missing.");
assert.match(server, /exports\.joinClanRally\s*=\s*timedCallable/, "Clan rally join callable is missing.");
assert.match(server, /exports\.launchClanRally\s*=\s*timedCallable/, "Clan rally launch callable is missing.");
assert.match(server, /exports\.cancelClanRally\s*=\s*timedCallable/, "Clan rally cancellation callable is missing.");
assert.match(firebase, /function subscribeClanRallies/, "Clan rally subscription is missing.");
assert.match(client, /CLAN_MOBILE_SECTIONS\s*=\s*Object\.freeze\(\["overview", "warroom", "rewards", "members"\]\)/, "Clan navigation is not using the rally-only War Room tab.");
assert.match(client, /function renderClanRallyPanel[\s\S]*?isClanSectionActive\("warroom"\)[\s\S]*?Clan campaign coordination[\s\S]*?<strong>War Room<\/strong>[\s\S]*?<strong>Rallies<\/strong>[\s\S]*?onlineClanRallies\.map\(renderClanRallyCard\)/, "War Room does not render rallies as its sole feature.");
assert.match(client, /function renderActiveOperations[\s\S]*?Rallies|data-active-operations-tab/, "Kingdom Activity rally access is missing.");
assert.match(rules, /match \/operations\/\{operationId\}[\s\S]*?allow read, create, update, delete: if false;[\s\S]*?match \/\{legacyDocument=\*\*\}[\s\S]*?allow read, create, update, delete: if false;/, "Legacy operation documents are not explicitly denied.");
assert.match(rules, /match \/clanOperationReminders\/\{reminderId\}[\s\S]*?allow read, create, update, delete: if false;/, "Legacy reminder documents are not server-only.");
assert.match(styles, /\.clan-war-room-panel[\s\S]*?\.clan-war-room-feature/, "Rally-only War Room layout is missing.");
assert.match(docs, /War Room[\s\S]*?rall(?:y|ies)/i, "Player or setup documentation does not describe the rally-only War Room.");

console.log("Validated the rally-only Clan War Room, retained rally services, legacy access denial, and operation-planner removal.");
