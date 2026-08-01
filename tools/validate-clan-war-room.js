const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("functions/index.js");
const client = read("game.js");
const firebase = read("firebaseClient.js");
const rules = read("firestore.rules");
const indexes = read("firestore.indexes.json");
const styles = read("styles.css");
const docs = ["README.md", "game-rules.html", "how-to-play.html", "privacy.html", "FIREBASE_SETUP.md"]
  .map(read)
  .join("\n");

function requires(source, pattern, message) {
  assert.match(source, pattern, message);
}

requires(server, /CLAN_WAR_ROOM_VERSION\s*=\s*1/, "Realm is missing Clan War Room version 1.");
requires(server, /CLAN_WAR_ROOM_MAX_ACTIVE_OPERATIONS\s*=\s*5/, "Active operation limit is missing.");
requires(server, /CLAN_WAR_ROOM_MAX_ORDERS\s*=\s*12/, "Order limit is missing.");
requires(server, /CLAN_WAR_ROOM_MAX_ASSIGNMENTS\s*=\s*60/, "Assignment limit is missing.");
requires(server, /CLAN_WAR_ROOM_MAX_ACCEPTED_PER_MEMBER\s*=\s*6/, "Per-member accepted assignment limit is missing.");
requires(server, /CLAN_WAR_ROOM_MAX_SHARED_REPORTS\s*=\s*50/, "Shared report limit is missing.");
requires(server, /CLAN_WAR_ROOM_MIN_WINDOW_MS\s*=\s*5 \* 60 \* 1000[\s\S]*?CLAN_WAR_ROOM_MAX_WINDOW_MS\s*=\s*60 \* 60 \* 1000/, "Arrival window limits are missing.");
requires(server, /CLAN_WAR_ROOM_MAX_OPERATION_MS\s*=\s*72 \* 60 \* 60 \* 1000/, "Operation horizon is missing.");
requires(server, /CLAN_WAR_ROOM_EXPIRY_DELAY_MS\s*=\s*6 \* 60 \* 60 \* 1000/, "Six-hour expiry delay is missing.");
requires(server, /CLAN_WAR_ROOM_HISTORY_RETENTION_MS\s*=\s*7 \* 24 \* 60 \* 60 \* 1000/, "Seven-day history retention is missing.");
requires(server, /"requested",[\s\S]*?"accepted",[\s\S]*?"needs_reconfirm",[\s\S]*?"launched",[\s\S]*?"resolved",[\s\S]*?"declined",[\s\S]*?"missed",[\s\S]*?"withdrawn"/, "Assignment lifecycle states are incomplete.");

[
  "createClanOperation",
  "updateClanOperation",
  "setClanOperationStatus",
  "setClanOperationAssignment",
  "linkClanOperationRally",
  "shareClanOperationReport",
].forEach(name => requires(server, new RegExp(`exports\\.${name}\\s*=\\s*timedCallable`), `Missing ${name} callable.`));

requires(server, /assertClanWarRoomManager\(actor\)/, "Manager-only operation mutations are not enforced.");
requires(server, /materialKey[\s\S]*?needs_reconfirm[\s\S]*?order_changed/, "Material edits do not invalidate assignments and reminders.");
requires(server, /getClanWarRoomAttentionUids[\s\S]*?attentionUids/, "Compact per-operation attention badges are missing.");
requires(server, /buildServerGeneratedArmyRoute\(source, target\)[\s\S]*?calculateTravelTime[\s\S]*?recommendedLaunchAtMs[\s\S]*?latestLaunchAtMs/, "Assignments do not use authoritative route travel timing.");
requires(server, /order\.action === "scout"[\s\S]*?\? 1/, "Scout assignments are not forced to one troop.");
requires(server, /exports\.sendArmyOrder[\s\S]*?operationContext[\s\S]*?war-room-assignment-stale[\s\S]*?status: "launched"/, "Army launch is not bound to an accepted War Room assignment.");
requires(server, /delete projection\.operationContext/, "Private operation context leaks into public army projections.");
requires(server, /writeClanWarRoomAssignmentResolution\(transaction, army/, "Army resolution does not settle assignments idempotently.");
requires(server, /sanitizeClanWarRoomReport[\s\S]*?safeString\(report\.summary[\s\S]*?shareClanOperationReport/, "Shared reports are not sanitized server copies.");
requires(server, /sendDueClanWarRoomReminders[\s\S]*?status: valid \? "sent" : "cancelled"[\s\S]*?sendClanWarRoomNotification/, "Reminder receipts are not claimed idempotently.");
requires(server, /exports\.maintainClanWarRoom\s*=\s*onSchedule[\s\S]*?every 1 minutes/, "Scheduled War Room maintenance is missing.");
requires(server, /reconcileClanWarRoomBeforeDeparture[\s\S]*?clan_departure[\s\S]*?cancelClanWarRoomForDisband[\s\S]*?clan_disbanded/, "Clan departure and disband cleanup are missing.");
requires(server, /clanWarRoomVersion:\s*CLAN_WAR_ROOM_VERSION/, "Realm information does not advertise Clan War Room support.");

requires(rules, /match \/operations\/\{operationId\}[\s\S]*?clanManager\(clanId\)[\s\S]*?resource\.data\.visibility == 'clan'[\s\S]*?allow create, update, delete: if false/, "Operation reads/writes are not protected correctly.");
requires(rules, /match \/orders\/\{orderId\}[\s\S]*?match \/assignments\/\{assignmentId\}[\s\S]*?match \/sharedReports\/\{reportId\}/, "Nested War Room rules are incomplete.");
requires(rules, /match \/clanOperationReminders\/\{reminderId\}[\s\S]*?allow read, create, update, delete: if false/, "Reminder receipts are not server-only.");
requires(indexes, /"collectionGroup": "operations"[\s\S]*?"fieldPath": "expiresAtMs"/, "Operation expiry index is missing.");
requires(indexes, /"collectionGroup": "assignments"[\s\S]*?"fieldPath": "uid"[\s\S]*?"fieldPath": "status"/, "Accepted assignment limit index is missing.");
requires(indexes, /"collectionGroup": "clanOperationReminders"[\s\S]*?"fieldPath": "dueAtMs"/, "Reminder due index is missing.");

requires(firebase, /function subscribeClanOperations[\s\S]*?function subscribeClanOperationDetails/, "Bounded operation and detail subscriptions are missing.");
requires(firebase, /where\("status", "==", "active"\)[\s\S]*?limit\(5\)[\s\S]*?where\("status", "in", \["completed", "cancelled", "expired"\]\)[\s\S]*?limit\(20\)/, "Operation subscriptions are not bounded for active pins and history.");
requires(firebase, /function subscribeClanOperationDetails[\s\S]*?slice\(0, 12\)[\s\S]*?targetStates/, "Cross-region target watches are not bounded to the operation order limit.");
requires(firebase, /function loadClanOperationDetails/, "Manual report sharing cannot load an operation's orders.");
requires(client, /CLAN_MOBILE_SECTIONS[\s\S]*?"warroom"/, "Clan navigation is missing the War Room tab.");
requires(client, /function renderClanWarRoomPanel[\s\S]*?\/5/, "War Room panel is missing.");
requires(client, /function showClanOperationEditor[\s\S]*?Add Order[\s\S]*?12/, "Multi-order operation editor is missing.");
requires(client, /function showWarRoomAssignmentModal[\s\S]*?Scouts always use exactly one troop/, "Source/troop assignment UI is missing.");
requires(client, /function beginWarRoomAssignmentLaunch[\s\S]*?operationContext/, "Guided manual launch does not include assignment context.");
requires(client, /Early: recommended launch begins[\s\S]*?Late: the recommended launch window ended[\s\S]*?You may still launch/, "Early/late advisory warning is missing.");
requires(client, /function renderWarRoomPins[\s\S]*?action-[\s\S]*?warRoomPin/, "Clan-private numbered map pins are missing.");
requires(client, /function bindBattleReportWarRoomShareButton[\s\S]*?shareClanOperationReport/, "Manual owner report sharing UI is missing.");
requires(styles, /\.war-room-map-pin[\s\S]*?action-scout[\s\S]*?action-reinforce/, "Attack, scout, and reinforcement pin colors are missing.");
requires(styles, /@media \(max-width: 720px\)[\s\S]*?war-room-editor-order/, "War Room mobile layout is missing.");
requires(docs, /War Room[\s\S]*?does not recall|does not recall[\s\S]*?War Room/i, "Player documentation does not explain War Room launch/cancellation safety.");

console.log("Validated Clan War Room privacy, lifecycle, assignments, timing, launch binding, reminders, reports, pins, and responsive UI.");
