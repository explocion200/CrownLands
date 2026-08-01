const admin = require("firebase-admin");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

const scheduled = require("../index.js").maintainClanWarRoom;
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(path) {
  return (await db.doc(path).get()).exists;
}

async function run() {
  const suffix = Date.now().toString(36);
  const clanId = `retired-war-room-${suffix}`;
  const operationId = `operation-${suffix}`;
  const operationPath = `clans/${clanId}/operations/${operationId}`;
  const armyPath = `armies/retired-war-room-${suffix}`;
  const reminderPath = `clanOperationReminders/retired-war-room-${suffix}`;
  const auditPath = `clans/${clanId}/audit/retired-war-room-${suffix}`;
  const statePath = `clans/${clanId}/operationState/current`;
  const batch = db.batch();
  batch.set(db.doc(operationPath), { status: "active", title: "Retired operation" });
  batch.set(db.doc(`${operationPath}/orders/order-1`), { action: "attack" });
  batch.set(db.doc(`${operationPath}/assignments/assignment-1`), { uid: "member-1" });
  batch.set(db.doc(`${operationPath}/sharedReports/report-1`), { summary: "retired" });
  batch.set(db.doc(statePath), { activeCount: 1 });
  batch.set(db.doc(reminderPath), { status: "pending" });
  batch.set(db.doc(auditPath), { action: "war_room_operation_created" });
  batch.set(db.doc(armyPath), {
    status: "active",
    operationContext: { operationId, clanId },
    operationTiming: { recommendedLaunchAtMs: Date.now() },
  });
  await batch.commit();

  assert(typeof scheduled?.run === "function", "Scheduled retirement worker is not directly testable.");
  await scheduled.run({ scheduleTime: new Date().toISOString() });
  await scheduled.run({ scheduleTime: new Date().toISOString() });

  for (const path of [
    operationPath,
    `${operationPath}/orders/order-1`,
    `${operationPath}/assignments/assignment-1`,
    `${operationPath}/sharedReports/report-1`,
    statePath,
    reminderPath,
    auditPath,
  ]) {
    assert(!(await exists(path)), `Retired War Room data still exists at ${path}.`);
  }

  const army = (await db.doc(armyPath).get()).data() || {};
  assert(!Object.prototype.hasOwnProperty.call(army, "operationContext"), "Army operation context was not removed.");
  assert(!Object.prototype.hasOwnProperty.call(army, "operationTiming"), "Army operation timing was not removed.");
  const marker = (await db.doc(`realmMaintenance/${realm.resetGeneration}/retirements/clanWarRoomV1`).get()).data() || {};
  assert(marker.complete === true, "Retirement marker did not reach complete after the idempotency pass.");

  console.log("Clan War Room retirement purge removed legacy data and completed idempotently.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
