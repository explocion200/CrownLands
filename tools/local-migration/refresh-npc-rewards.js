"use strict";
// Operator-only, one-time retirement. No import-time writes or automatic CLI.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const M = require("../../functions/marauder-rules");
const C = require("../../functions/coreExpansionTopology");
const catalog = require("../../functions/core-expansion-region-catalog.json");
const release = require("../../functions/release-config.json");

const REASON = "owner-requested-balance-v2-refresh";
function descriptor(id) {
  return catalog.regions.find(r => r.id === id)
    || (C.parseNewLandsRegionId(id) ? { id, permanentCore: false } : null);
}
function refs(db, realm) {
  for (const key of ["worldId", "resetGeneration", "sharedRealmId"])
    assert(/^[a-zA-Z0-9_-]{1,100}$/.test(realm[key]), "Explicit current realm required");
  assert.equal(release.worldTopology, "core-expansion-v1");
  assert.equal(M.BALANCE_VERSION, 2);
  const root = db.doc(`marauderPopulation/${realm.resetGeneration}--${realm.sharedRealmId}`);
  return { root, pointer: db.doc("realmConfig/current"),
    expansion: db.doc(`realmGenerations/${realm.resetGeneration}/expansion/current`) };
}
async function scope(tx, db, realm) {
  const r = refs(db, realm);
  const pointer = (await tx.get(r.pointer)).data();
  for (const key of ["worldId", "resetGeneration", "sharedRealmId"])
    assert.equal(pointer?.[key], realm[key], "Current realm changed");
  const expansion = (await tx.get(r.expansion)).data();
  assert(Array.isArray(expansion?.activeRegionIds), "Active map authority unavailable");
  assert.equal((await tx.get(r.root)).data()?.enabled, true, "NPC population is disabled");
  return { ...r, active: new Set([...catalog.regions.filter(r => r.permanentCore).map(r => r.id),
    ...expansion.activeRegionIds.filter(id => descriptor(id))]) };
}
function valid(row, path, realm, active) {
  if (!row || row.targetType !== "marauder" || row.ownerKind !== "neutral" || row.ownerUid !== ""
    || !active.has(row.regionId) || row.worldId !== realm.worldId
    || row.resetGeneration !== realm.resetGeneration || row.realmShardId !== realm.sharedRealmId) return false;
  const id = `marauder_${crypto.createHash("sha256").update(row.regionId).digest("hex").slice(0, 12)}_${String(row.slot).padStart(2, "0")}`;
  return row.id === id && path === `islands/${realm.worldId}--${realm.sharedRealmId}--${row.regionId}/marauderCombat/${id}`
    && typeof row.spawnId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(row.spawnId)
    && M.slots(descriptor(row.regionId)).some(s => s.slot === row.slot && s.classification === row.classification
      && Number.isInteger(row.level) && row.level >= s.min && row.level <= s.max);
}
async function inspect(tx, db, realm, current, snap) {
  const row = snap.data();
  if (!valid(row, snap.ref.path, realm, current.active) || row.status !== "active"
    || (row.balanceVersion ?? 1) !== 1) return { eligible: false };
  const publicRef = db.doc(snap.ref.path.replace("/marauderCombat/", "/marauders/"));
  const visible = (await tx.get(publicRef)).data();
  for (const key of ["id", "spawnId", "regionId", "worldId", "resetGeneration", "realmShardId", "slot", "level", "classification", "status", "x", "y", "targetType", "ownerKind", "ownerUid"])
    assert.equal(visible?.[key], row[key], "Public/private NPC mismatch: " + key);
  assert.equal(visible.balanceVersion ?? 1, row.balanceVersion ?? 1, "Public/private reward version mismatch");
  const armies = await tx.get(db.collection("armies").where("targetSpawnId", "==", row.spawnId).where("status", "==", "active"));
  const rallies = await tx.get(db.collectionGroup("rallies").where("targetSpawnId", "==", row.spawnId)
    .where("status", "in", ["forming", "launched", "recalling"]));
  const busy = armies.docs.some(d => !d.data().returning && !d.data().recalledAtMs) || !rallies.empty;
  return { eligible: true, busy, publicRef, row };
}
async function audit(db, realm) {
  return db.runTransaction(async tx => {
    const current = await scope(tx, db, realm);
    const rows = await tx.get(db.collectionGroup("marauderCombat").where("worldId", "==", realm.worldId)
      .where("resetGeneration", "==", realm.resetGeneration).where("realmShardId", "==", realm.sharedRealmId)
      .where("status", "==", "active"));
    const candidates = [], counts = { legacy: 0, current: 0, busy: 0, outsideActiveSlots: 0 };
    for (const snap of rows.docs) {
      const row = snap.data();
      if (!valid(row, snap.ref.path, realm, current.active)) { counts.outsideActiveSlots++; continue; }
      if (row.balanceVersion === 2) { counts.current++; continue; }
      assert.equal(row.balanceVersion ?? 1, 1, "Unknown NPC balance version");
      counts.legacy++;
      const status = await inspect(tx, db, realm, current, snap);
      if (status.busy) { counts.busy++; continue; }
      candidates.push({ path: snap.ref.path, spawnId: row.spawnId, updateTime: snap.updateTime.toString(),
        regionId: row.regionId, classification: row.classification });
    }
    return { reason: REASON, realm: { ...realm }, counts, candidates };
  });
}
async function retireCandidate(db, plan, candidate, now = Date.now()) {
  assert.equal(plan.reason, REASON);
  assert(plan.candidates.some(c => c.path === candidate.path && c.spawnId === candidate.spawnId
    && c.updateTime === candidate.updateTime), "Candidate was not reviewed");
  assert(Number.isSafeInteger(now) && now > 0);
  return db.runTransaction(async tx => {
    const current = await scope(tx, db, plan.realm), ref = db.doc(candidate.path), snap = await tx.get(ref);
    if (!snap.exists || snap.data().spawnId !== candidate.spawnId || snap.updateTime.toString() !== candidate.updateTime)
      return { status: "changed" };
    const status = await inspect(tx, db, plan.realm, current, snap);
    if (!status.eligible) return { status: "ineligible" };
    if (status.busy) return { status: "busy" };
    const receipt = current.root.collection("balanceRefresh").doc(candidate.spawnId);
    assert(!(await tx.get(receipt)).exists, "Retirement receipt already exists");
    // Both projections disappear together. The existing bounded population
    // scheduler selects the replacement's fresh identity, level and road point.
    const patch = { status: "retired", respawnAtMs: 0, retiredAtMs: now, retirementReason: REASON };
    tx.set(ref, patch, { merge: true }); tx.set(status.publicRef, patch, { merge: true });
    tx.set(current.root.collection("maps").doc(status.row.regionId), { initialized: false, retryAtMs: 0 }, { merge: true });
    tx.create(receipt, { reason: REASON, npcPath: ref.path, spawnId: candidate.spawnId,
      regionId: status.row.regionId, previousBalanceVersion: 1, replacementBalanceVersion: 2, retiredAtMs: now });
    return { status: "retired", classification: status.row.classification };
  });
}
module.exports = { audit, retireCandidate, REASON };
