const admin = require("firebase-admin");
const crypto = require("node:crypto");
const realm = require("../release-config.json");
const world = require("../world-layout.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST;
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatHost(host, port) {
  const value = String(host || "127.0.0.1");
  return `${value.includes(":") && !value.startsWith("[") ? `[${value}]` : value}:${port}`;
}

async function resolveFunctionsHost() {
  if (configuredFunctionsHost) return configuredFunctionsHost;
  if (!functionsHostPromise) {
    functionsHostPromise = (async () => {
      const hubHost = String(process.env.FIREBASE_EMULATOR_HUB || "");
      if (!hubHost) return "127.0.0.1:5001";
      const response = await fetch(`http://${hubHost}/emulators`);
      const emulators = await response.json();
      const entry = emulators?.functions || {};
      const listen = Array.isArray(entry.listen) ? entry.listen[0] : entry.listen;
      return formatHost(entry.host || listen?.address, Number(entry.port || listen?.port));
    })();
  }
  return functionsHostPromise;
}

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `war-room-callable-${label}-${nonce}@example.test`,
      password: `WarRoom-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function invokeFunction(name, user, data = {}) {
  const functionsHost = await resolveFunctionsHost();
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${user.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
      },
    }),
  });
  const body = await response.json();
  return { ok: response.ok && !body.error, result: body.result || null, error: body.error || null };
}

async function callFunction(name, user, data = {}) {
  const response = await invokeFunction(name, user, data);
  if (!response.ok) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`);
  return response.result;
}

function operationOrder(target, overrides = {}) {
  const start = Date.now() + 35 * 60 * 1000;
  return {
    id: overrides.id || "order_1",
    action: overrides.action || "scout",
    targetType: "city",
    targetId: target.id,
    targetRegionId: target.regionId,
    note: overrides.note || "Verify the northern approach.",
    requestedTroops: overrides.requestedTroops || 1,
    participantSlots: overrides.participantSlots || 2,
    windowStartAtMs: overrides.windowStartAtMs || start,
    windowEndAtMs: overrides.windowEndAtMs || start + 10 * 60 * 1000,
  };
}

function reminderId(clanId, operationId, assignmentId) {
  return crypto.createHash("sha256")
    .update(`${realm.resetGeneration}|${clanId}|${operationId}|${assignmentId}`)
    .digest("hex")
    .slice(0, 48);
}

async function main() {
  const [leader, officer, member, outsider] = await Promise.all([
    createAuthUser("leader"),
    createAuthUser("officer"),
    createAuthUser("member"),
    createAuthUser("outsider"),
  ]);
  const clanId = `war_room_callables_${crypto.randomBytes(5).toString("hex")}`;
  const map = world.maps.find(entry => entry.id === "west") || world.maps[0];
  const sourceSeed = map.cities[0];
  const targetSeed = map.cities[1];
  const source = { ...sourceSeed, regionId: map.id };
  const target = { ...targetSeed, regionId: map.id };
  const current = { worldId: realm.worldId, resetGeneration: realm.resetGeneration };
  const nowMs = Date.now();
  const batch = db.batch();
  batch.set(db.doc(`clans/${clanId}`), {
    ...current,
    status: "active",
    leaderUid: leader.uid,
    memberCount: 3,
  });
  [[leader, "leader", "War Leader"], [officer, "officer", "War Officer"], [member, "member", "War Member"]].forEach(([user, role, playerName]) => {
    batch.set(db.doc(`clans/${clanId}/members/${user.uid}`), {
      ...current,
      uid: user.uid,
      clanId,
      role,
      status: "active",
      displayName: playerName,
    });
    batch.set(db.doc(`players/${user.uid}`), {
      ...current,
      uid: user.uid,
      clanId,
      clanRole: role,
      playerName,
      displayName: playerName,
      character: { level: 20, xp: 0, skillPoints: 0 },
      gold: 0,
      goldFloat: 0,
      economyUpdatedAtMs: nowMs,
      lastSeenAtMs: nowMs,
      ...(user.uid === member.uid ? { mainCityId: source.id, mainRegionId: source.regionId } : {}),
    });
  });
  batch.set(db.doc(`players/${outsider.uid}`), { ...current, uid: outsider.uid, playerName: "Outsider" });
  batch.set(db.doc(`islands/${realm.worldId}-${source.regionId}/cities/${source.id}`), {
    ...current,
    ...source,
    ownerKind: "player",
    ownerUid: member.uid,
    ownerName: "War Member",
    isMainCity: true,
    level: 5,
    defense: 100,
    troops: 1000,
    troopFloat: 1000,
    productionUpdatedAtMs: nowMs,
  });
  batch.set(db.doc(`players/${member.uid}/serverReports/owned_report`), {
    ...current,
    id: "owned_report",
    uid: member.uid,
    type: "scout",
    outcome: "scouted",
    cityId: target.id,
    cityName: target.name,
    regionId: target.regionId,
    troopCount: 125,
    summary: "The northern city was scouted.",
    createdAtMs: nowMs,
  });
  await batch.commit();

  const deniedCreate = await invokeFunction("createClanOperation", member, {
    clanId,
    title: "Forbidden Member Draft",
    status: "draft",
    orders: [operationOrder(target)],
  });
  assert(!deniedCreate.ok, "A regular member created a clan operation.");

  const created = await callFunction("createClanOperation", leader, {
    clanId,
    title: "Northern Lantern",
    note: "Coordinate the scout before the main force.",
    status: "active",
    orders: [operationOrder(target)],
  });
  const operationId = created.operation?.id;
  assert(operationId && created.operation.status === "active", "The leader could not create an active operation.");
  const order = created.orders?.[0];
  assert(order?.targetId === target.id && created.operation.mapTargets?.length === 1, "The operation target summary is incomplete.");

  const deniedRequest = await invokeFunction("setClanOperationAssignment", member, {
    clanId,
    operationId,
    orderId: order.id,
    action: "request",
    targetUid: officer.uid,
  });
  assert(!deniedRequest.ok, "A regular member requested another clan member.");
  const requested = await callFunction("setClanOperationAssignment", officer, {
    clanId,
    operationId,
    orderId: order.id,
    action: "request",
    targetUid: member.uid,
  });
  assert(requested.assignment?.status === "requested", "The officer request did not create a requested assignment.");
  const assignmentId = requested.assignment.id;
  const accepted = await callFunction("setClanOperationAssignment", member, {
    clanId,
    operationId,
    orderId: order.id,
    assignmentId,
    action: "accept",
    sourceId: source.id,
    sourceRegionId: source.regionId,
    troops: 99,
  });
  assert(accepted.assignment?.status === "accepted", "The member could not accept the assignment.");
  assert(accepted.assignment.troops === 1, "A scout assignment used more than one troop.");
  assert(accepted.assignment.estimatedTravelSeconds > 0, "The server did not calculate authoritative travel time.");
  assert(accepted.assignment.latestLaunchAtMs > accepted.assignment.recommendedLaunchAtMs, "The launch window is invalid.");

  const shiftedOrder = operationOrder(target, {
    id: order.id,
    windowStartAtMs: order.windowStartAtMs + 60_000,
    windowEndAtMs: order.windowEndAtMs + 60_000,
  });
  const updated = await callFunction("updateClanOperation", leader, {
    clanId,
    operationId,
    expectedRevision: created.operation.revision,
    title: created.operation.title,
    note: created.operation.note,
    orders: [shiftedOrder],
  });
  assert(updated.invalidatedOrderIds?.includes(order.id), "A timing change did not invalidate the order.");
  let assignment = (await db.doc(`clans/${clanId}/operations/${operationId}/assignments/${assignmentId}`).get()).data() || {};
  assert(assignment.status === "needs_reconfirm", "An accepted assignment did not require reconfirmation after a timing change.");
  const reminderRef = db.doc(`clanOperationReminders/${reminderId(clanId, operationId, assignmentId)}`);
  let reminder = (await reminderRef.get()).data() || {};
  assert(reminder.status === "cancelled", "A material edit did not cancel the prior reminder.");

  const reconfirmed = await callFunction("setClanOperationAssignment", member, {
    clanId,
    operationId,
    orderId: order.id,
    assignmentId,
    action: "reconfirm",
    sourceId: source.id,
    sourceRegionId: source.regionId,
    troops: 500,
  });
  assert(reconfirmed.assignment?.status === "accepted" && reconfirmed.assignment.troops === 1, "The stale scout assignment was not reconfirmed correctly.");
  reminder = (await reminderRef.get()).data() || {};
  assert(reminder.status === "pending", "Reconfirmation did not schedule a fresh reminder.");

  const shared = await callFunction("shareClanOperationReport", member, {
    clanId,
    operationId,
    orderId: order.id,
    reportId: "owned_report",
  });
  assert(shared.report?.ownerUid === member.uid && !shared.report.createdAt, "The sanitized report copy is invalid.");
  const duplicateShare = await callFunction("shareClanOperationReport", member, {
    clanId,
    operationId,
    orderId: order.id,
    reportId: "owned_report",
  });
  assert(duplicateShare.duplicate === true, "Sharing the same report twice was not idempotent.");
  const deniedShare = await invokeFunction("shareClanOperationReport", outsider, {
    clanId,
    operationId,
    orderId: order.id,
    reportId: "owned_report",
  });
  assert(!deniedShare.ok, "A nonmember shared a report into the operation.");

  const departure = await callFunction("leaveClan", member);
  assert(departure.ok && !departure.disbanded, "The assigned member could not leave the clan.");
  assignment = (await db.doc(`clans/${clanId}/operations/${operationId}/assignments/${assignmentId}`).get()).data() || {};
  assert(assignment.status === "withdrawn" && assignment.withdrawnReason === "clan_departure", "Clan departure did not withdraw an unlaunched assignment.");
  const leaderRequest = await callFunction("setClanOperationAssignment", officer, {
    clanId,
    operationId,
    orderId: order.id,
    action: "request",
    targetUid: leader.uid,
  });
  assert(leaderRequest.assignment?.status === "requested", "A replacement request could not fill the departed member's slot.");

  const deniedClose = await invokeFunction("setClanOperationStatus", member, { clanId, operationId, status: "completed" });
  assert(!deniedClose.ok, "A regular member completed the operation.");
  const completed = await callFunction("setClanOperationStatus", officer, { clanId, operationId, status: "completed" });
  assert(completed.operation?.status === "completed", "An officer could not complete the operation.");
  assignment = (await db.doc(`clans/${clanId}/operations/${operationId}/assignments/${assignmentId}`).get()).data() || {};
  assert(assignment.status === "withdrawn", "Completing an operation rewrote a departed member's assignment.");
  const missedReplacement = (await db.doc(`clans/${clanId}/operations/${operationId}/assignments/${leaderRequest.assignment.id}`).get()).data() || {};
  assert(missedReplacement.status === "missed", "An unlaunched request was not marked missed when the operation completed.");

  const tooShort = await invokeFunction("createClanOperation", leader, {
    clanId,
    title: "Too Short",
    status: "active",
    orders: [operationOrder(target, {
      windowStartAtMs: Date.now() + 60_000,
      windowEndAtMs: Date.now() + 6 * 60_000,
    })],
  });
  assert(!tooShort.ok, "An operation shorter than 15 minutes was accepted.");

  for (let index = 0; index < 5; index += 1) {
    await callFunction("createClanOperation", leader, {
      clanId,
      operationId: `limit_${index}`,
      title: `Limit ${index + 1}`,
      status: "active",
      orders: [operationOrder(target, { id: `order_${index + 1}` })],
    });
  }
  const overLimit = await invokeFunction("createClanOperation", leader, {
    clanId,
    operationId: "limit_6",
    title: "Limit 6",
    status: "active",
    orders: [operationOrder(target)],
  });
  assert(!overLimit.ok, "A sixth active operation bypassed the clan limit.");

  const kicked = await callFunction("kickClanMember", leader, { targetUid: officer.uid });
  assert(kicked.ok && !kicked.disbanded, "The remaining officer could not be removed before the disband test.");
  const disbanded = await callFunction("disbandClan", leader);
  assert(disbanded.ok && disbanded.disbanded, "The solo leader could not disband the clan.");
  const cancelledOperation = (await db.doc(`clans/${clanId}/operations/limit_0`).get()).data() || {};
  assert(cancelledOperation.status === "cancelled" && cancelledOperation.archiveAtMs > Date.now(), "Clan disbanding did not close and retain active operation history.");
  const operationState = (await db.doc(`clans/${clanId}/operationState/${realm.resetGeneration}`).get()).data() || {};
  assert(Array.isArray(operationState.activeOperationIds) && operationState.activeOperationIds.length === 0, "Clan disbanding left active operation ids behind.");

  console.log("Emulator Clan War Room callables passed: roles, limits, scout timing, reconfirmation, reminders, report ownership, departure, disbanding, and lifecycle.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
