"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const policy = require(path.join(root, "functions", "authoritative-route-policy.js"));

assert.equal(policy.AUTHORITATIVE_ROUTES_VERSION, 1);
assert.equal(policy.BULK_ORDERS_VERSION, 1);
assert.equal(policy.BULK_ORDER_IDEMPOTENCY_MS, 24 * 60 * 60 * 1000);
assert.equal(policy.NEARBY_SCOUT_RADIUS, 420);
assert.equal(policy.REGROUP_RADIUS, 680);
assert.equal(policy.getAuthoritativeTerrainBlockers("west")[0].rot, -0.2);
assert.deepEqual(policy.normalizeBulkCityIds(["b", "a", "b"], 5), ["b", "a"]);
assert.equal(policy.isWithinRadius({ x: 0, y: 0 }, { x: 420, y: 0 }, policy.NEARBY_SCOUT_RADIUS), true);
assert.equal(policy.isWithinRadius({ x: 0, y: 0 }, { x: 421, y: 0 }, policy.NEARBY_SCOUT_RADIUS), false);
assert.equal(
  policy.createBulkRequestSignature("scout", { b: 2, a: 1 }),
  policy.createBulkRequestSignature("scout", { a: 1, b: 2 }),
  "Bulk request signatures must be stable across object-key order."
);
assert.equal(
  policy.createBulkMovementId("u", "nearby_scout", "request_123", "city", 0),
  policy.createBulkMovementId("u", "nearby_scout", "request_123", "city", 0),
  "Retry movement ids must be deterministic."
);

assert.match(server, /authoritativeRoutesVersion:\s*AUTHORITATIVE_ROUTES_VERSION/);
assert.match(server, /bulkOrdersVersion:\s*BULK_ORDERS_VERSION/);
assert.match(server, /exports\.previewArmyRoute\s*=\s*timedCallable/);
assert.match(server, /exports\.sendNearbyScouts\s*=\s*timedCallable/);
assert.match(server, /exports\.sendRegroupOrders\s*=\s*timedCallable/);

const previewStart = server.indexOf("exports.previewArmyRoute");
const previewEnd = server.indexOf("function normalizeBulkOrderRequestId", previewStart);
const previewSource = server.slice(previewStart, previewEnd);
assert.match(previewSource, /buildServerGeneratedArmyRoute\(source, target\)/);
assert.doesNotMatch(previewSource, /prepareEconomyCollection/,
  "Route previews must not scan every owned city, active army, and camp.");
assert.match(previewSource, /const troops = kind === "scout" \? 1 : order\.requestedTroops/,
  "Route previews must use the validated requested troop count for travel-band accuracy.");
assert.doesNotMatch(previewSource, /clampInt\(order\.requestedTroops/,
  "Route previews must not clamp against a stale checkpointed source troop count.");
assert.match(previewSource, /durationMs[\s\S]*?arrivesAtMs/);

const sendStart = server.indexOf('exports.sendArmyOrder = timedCallable("sendArmyOrder"');
const sendEnd = server.indexOf("async function resolveArmyOrderById", sendStart);
const sendSource = server.slice(sendStart, sendEnd);
assert.match(sendSource, /minInstances:\s*1/,
  "Direct competitive march launches must keep one warm server instance.");
assert.match(sendSource, /buildServerGeneratedArmyRoute\(source, target\)/,
  "Online launches must rebuild their route from trusted server data.");
assert.doesNotMatch(sendSource, /validateArmyRoute\(order, source, target\)/,
  "Online launch timing must not trust client-supplied geometry.");
assert.match(sendSource, /reserveArmyLaunchRateLimit\(transaction, launchRateSnap, uid, nowMs\)/);
assert.match(sendSource, /order\.acceptedAttackProtection && order\.protectionHandling !== "auto_cap"/,
  "Instant clients must auto-cap while legacy clients retain quote reconfirmation.");
assert.match(sendSource, /requestedTroops[\s\S]*?acceptedTroops:\s*troops[\s\S]*?adjustedByProtection/,
  "Launch responses must explain authoritative troop-cap adjustments.");
assert.match(sendSource, /queueIncomingArmyNotification\(transaction, movement\.id/,
  "Incoming push delivery must be queued outside the launch response path.");
assert.doesNotMatch(sendSource, /await sendIncomingArmyNotification/,
  "Direct march acceptance must not wait for push delivery.");

function callableSource(exportName, nextExportName) {
  const start = server.indexOf(`exports.${exportName}`);
  const end = server.indexOf(`exports.${nextExportName}`, start + 1);
  assert.ok(start >= 0 && end > start, `Could not locate ${exportName} callable source.`);
  return server.slice(start, end);
}

const relinquishSource = callableSource("relinquishCity", "relocateMainCity");
assert.match(relinquishSource, /buildServerGeneratedArmyRoute\(source, destination\)/,
  "Relinquishment transfers must persist a canonical server-generated route.");
assert.doesNotMatch(relinquishSource, /validateArmyRoute\(/,
  "Relinquishment transfers must not trust client-supplied geometry.");

const createRallySource = callableSource("createClanRally", "joinClanRally");
assert.match(createRallySource, /buildServerGeneratedArmyRoute\(source, target\)/,
  "Rally formation must persist a canonical server-generated route.");
assert.match(createRallySource, /validatedRouteVersion:\s*AUTHORITATIVE_ROUTES_VERSION/);
assert.doesNotMatch(createRallySource, /validateArmyRoute\(/,
  "Rally formation must not trust client-supplied geometry.");

const joinRallySource = callableSource("joinClanRally", "withdrawClanRallyContribution");
assert.match(joinRallySource, /buildServerGeneratedArmyRoute\(source, assembly\)/,
  "Rally contributions must persist a canonical server-generated route.");
assert.doesNotMatch(joinRallySource, /validateArmyRoute\(/,
  "Rally contributions must not trust client-supplied geometry.");

const launchRallySource = callableSource("launchClanRally", "previewArmyProtection");
assert.match(launchRallySource, /minInstances:\s*1/,
  "Final rally attacks must keep one warm server instance.");
assert.match(launchRallySource, /buildServerGeneratedArmyRoute\(assembly, target\)/,
  "Rally launch must rebuild its route from current authoritative world data.");
assert.match(launchRallySource, /transaction\.set\(rallyRef,[\s\S]*?path:\s*validatedRoute\.path[\s\S]*?pathSegments:\s*validatedRoute\.pathSegments[\s\S]*?routeRegionIds:\s*validatedRoute\.routeRegionIds[\s\S]*?pathLength:\s*validatedRoute\.pathLength/,
  "The launched rally record must replace its forming route with canonical launch geometry.");
assert.doesNotMatch(launchRallySource, /validateArmyRoute\(/,
  "Rally launch must not trust stored or client-supplied geometry.");
assert.match(launchRallySource, /queueIncomingArmyNotification\(transaction, movement\.id/,
  "Rally launch responses must not wait for push delivery.");

assert.match(server, /const \{ getMessaging \} = require\("firebase-admin\/messaging"\)/,
  "Firebase Messaging must use the modular Admin SDK entry point.");
assert.match(server, /exports\.deliverIncomingArmyNotification = onDocumentCreated/,
  "The private incoming-army notification outbox trigger is missing.");

const scoutStart = server.indexOf("exports.sendNearbyScouts");
const scoutEnd = server.indexOf("exports.sendRegroupOrders", scoutStart);
const scoutSource = server.slice(scoutStart, scoutEnd);
assert.match(scoutSource, /NEARBY_SCOUT_GOLD_COST/);
assert.match(scoutSource, /isWithinRadius\(source, target, NEARBY_SCOUT_RADIUS\)/);
assert.match(scoutSource, /chargeBulkOrderCost/);
assert.match(scoutSource, /writePreparedEconomy/);
assert.match(scoutSource, /bulkOrderRequestRef/);
assert.match(scoutSource, /reserveArmyLaunchRateLimit\(transaction, launchRateSnap, uid, nowMs, armies\.length\)/,
  "Scout Nearby must charge launch-throttle weight for every created army.");
assert.match(scoutSource, /Promise\.all\(targetOwnerUids\.map\(async defenderUid =>/,
  "Scout Nearby must load defender snapshots concurrently before transaction writes.");
assert.match(scoutSource, /armies\.map\(army => transaction\.get\(canonicalArmyRef\(army\.id\)\)\)[\s\S]*?already-exists/,
  "Expired Scout Nearby idempotency records must never permit canonical movement overwrite.");

const regroupStart = server.indexOf("exports.sendRegroupOrders");
const regroupEnd = server.indexOf("exports.sendArmyOrder", regroupStart);
const regroupSource = server.slice(regroupStart, regroupEnd);
assert.match(regroupSource, /REGROUP_GOLD_COST/);
assert.match(regroupSource, /isWithinRadius\(source, target, REGROUP_RADIUS\)/);
assert.match(regroupSource, /patch:\s*\{ troops:\s*0/,
  "Regroup must send every currently available troop from each confirmed source.");
assert.match(regroupSource, /bulkOrderRequestRef/);
assert.match(regroupSource, /reserveArmyLaunchRateLimit\(transaction, launchRateSnap, uid, nowMs, armies\.length\)/,
  "Regroup must charge launch-throttle weight for every created army.");
assert.match(regroupSource, /armies\.map\(army => transaction\.get\(canonicalArmyRef\(army\.id\)\)\)[\s\S]*?already-exists/,
  "Expired Regroup idempotency records must never permit canonical movement overwrite.");

assert.match(server, /LEGACY_PROFILE_SCOUT_REPORT_LIMIT\s*=\s*120/);
assert.match(server, /SCHEDULED_ARMY_RESOLVE_MAX_PAGES\s*=\s*4/);
assert.match(server, /backlogOldestLateByMs/);
assert.match(server, /options\.checkpointWriteBudget/);
assert.match(server, /ARMY_SETTLEMENT_ECONOMY_CHECKPOINT_WRITE_BUDGET\s*=\s*96/);
assert.match(server, /RALLY_MAX_PARTICIPANTS\s*=\s*3/);
assert.match(server, /RALLY_CANCEL_PARTICIPANT_CHECKPOINT_WRITE_BUDGET\s*=\s*80/);
assert.match(server, /sharedCheckpointWriteBudget\.remaining\s*=\s*Math\.max/,
  "Shared economy checkpoint budgets must be consumed across participants.");
assert.match(server, /priorityCheckpointPaths\.has\(rightPath\)/,
  "Economy checkpoints must prioritize the cities involved in the current operation.");
assert.match(server, /cityPatches\.push\([\s\S]*?\.\.\.mandatoryCheckpoints,[\s\S]*?\.\.\.optionalCheckpoints\.slice/,
  "Mandatory main-city repair writes must be preserved ahead of optional production checkpoints.");

const settlementStart = server.indexOf("async function resolveArmyOrderById");
const settlementEnd = server.indexOf("function getScheduledArmyTarget", settlementStart);
const settlementSource = server.slice(settlementStart, settlementEnd);
assert.match(settlementSource, /const settlementCheckpointWriteBudget\s*=\s*\{[\s\S]*?remaining:\s*ARMY_SETTLEMENT_ECONOMY_CHECKPOINT_WRITE_BUDGET/);
assert.match(settlementSource, /Math\.floor\(ARMY_SETTLEMENT_ECONOMY_CHECKPOINT_WRITE_BUDGET \/ 2\)/,
  "Distinct attacker and defender economies must each reserve half of the settlement checkpoint budget.");
assert.match(settlementSource, /checkpointWriteBudget:\s*settlementParticipantCheckpointWriteBudget[\s\S]*?sharedCheckpointWriteBudget:\s*settlementCheckpointWriteBudget[\s\S]*?checkpointPriorityRefs:/,
  "Army settlement must share one bounded checkpoint budget and prioritize source/target cities.");

const cancelRallyStart = server.indexOf("async function cancelClanRallyRequest");
const cancelRallyEnd = server.indexOf("exports.launchClanRally", cancelRallyStart);
const cancelRallySource = server.slice(cancelRallyStart, cancelRallyEnd);
assert.match(cancelRallySource, /checkpointWriteBudget:\s*RALLY_CANCEL_PARTICIPANT_CHECKPOINT_WRITE_BUDGET/,
  "Rally cancellation must cap each of its at-most-three participant economy checkpoints.");
assert.match(cancelRallySource, /checkpointPriorityRefs:\s*\[participantSourceRef, assemblyRef\]/);

const dueLoaderStart = server.indexOf("async function loadDueArmyTargets");
const dueLoaderEnd = server.indexOf("async function loadDueArmyBacklogSnapshot", dueLoaderStart);
const dueLoaderSource = server.slice(dueLoaderStart, dueLoaderEnd);
assert.match(dueLoaderSource, /query\.startAfter\(cursor\)/,
  "Scheduled resolution must advance a query cursor instead of rescanning the earliest failures.");
assert.match(dueLoaderSource, /nextCursor\s*=\s*doc/);
const dueResolverStart = server.indexOf("exports.resolveDueArmyOrders");
const dueResolverEnd = server.indexOf("async function handleCitadelAssaultSelection", dueResolverStart);
const dueResolverSource = server.slice(dueResolverStart, dueResolverEnd);
assert.match(dueResolverSource, /cursor:\s*scanCursor[\s\S]*?scanCursor\s*=\s*page\.cursor/);
assert.match(server, /ARMY_LAUNCH_RATE_WEIGHT_LIMIT\s*=\s*80/);
assert.match(server, /acceptedWeight \+ weight > ARMY_LAUNCH_RATE_WEIGHT_LIMIT/);
assert.match(server, /\.filter\(event => event\.atMs > windowStartedAtMs\)/,
  "Transaction retries must retain newer committed launch events.");
assert.match(server, /Math\.min\(nowMs, Math\.max\(0, acceptedEvents\[0\]\?\.atMs \|\| nowMs\)\)/,
  "Only retry timing may clamp future launch timestamps.");
assert.match(server, /updatedAtMs:\s*Math\.max\(timestampToMs\(data\.updatedAtMs\), nowMs\)/,
  "An older transaction retry must not move throttle metadata backward.");
assert.match(server, /BULK_ORDER_CLEANUP_MAX_PAGES\s*=\s*4/);
assert.match(server, /backlogOldestExpiredByMs/);
assert.match(server, /expiresAt:\s*Timestamp\.fromMillis\(nowMs \+ BULK_ORDER_IDEMPOTENCY_MS\)/,
  "Bulk idempotency records must include a Firestore TTL-compatible timestamp.");
assert.match(server, /createAuthoritativeRoutePlanner/);
assert.match(server, /AUTHORITATIVE_ROUTE_PLANNER\.calculate/,
  "Authoritative launches must use the canonical grid route planner.");
assert.equal(
  fs.existsSync(path.join(root, "functions", "canonical-route-engine.js")),
  true,
  "The canonical server route engine is missing."
);
assert.equal(
  fs.existsSync(path.join(root, "tools", "validate-server-route-parity.js")),
  true,
  "The exhaustive server/client route parity validator is missing."
);

const emulatorTestPath = path.join(root, "functions", "test", "emulator-bulk-army-orders.js");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "crownlands-release-gate.yml"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "functions", "package.json"), "utf8"));
const emulatorRunner = fs.readFileSync(path.join(root, "functions", "test", "run-emulator-gates.js"), "utf8");
assert.equal(fs.existsSync(emulatorTestPath), true, "Bulk-order emulator coverage is missing.");
const emulatorTest = fs.readFileSync(emulatorTestPath, "utf8");
[
  "duplicate Scout Nearby",
  "Concurrent Regroup",
  "Concurrent distinct Scout Nearby",
  "Insufficient gold",
  "Insufficient troops",
  "canonical movement guard",
  "Weighted launch throttling",
].forEach(marker => assert.match(emulatorTest, new RegExp(marker, "i")));
assert.match(emulatorRunner, /readdirSync\(testDirectory\)/,
  "The release gate must automatically discover bulk-order emulator coverage.");
assert.match(packageJson.scripts?.["test:emulators"] || "", /run-emulator-gates\.js/,
  "The release gate must execute the discovered emulator coverage.");
assert.match(packageJson.scripts?.["gate:static"] || "", /test:route-parity/,
  "The release gate must execute exhaustive server/client route parity coverage.");
assert.match(workflow, /pnpm run gate:static/,
  "GitHub Actions must execute the shared static release gate.");

console.log("Validated authoritative route previews and launches, atomic paid bulk orders, bounded idempotency, launch throttling, and army backlog health guards.");
