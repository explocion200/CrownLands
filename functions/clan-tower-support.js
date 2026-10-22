"use strict";
const crypto = require("node:crypto");
const T = require("./holding-towers");
const B = require("./clan-tower-buildings");
const VERSION = 1;
const INTEL_MS = 10 * 60_000;
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const current = (data, realm) => Boolean(data && data.worldId === realm.worldId
  && data.resetGeneration === realm.resetGeneration && (data.realmShardId || "legacy") === realm.realmShardId);
const memberActive = (member, uid, clanId, realm) => current(member, realm)
  && member.uid === uid && member.status === "active" && (!member.clanId || member.clanId === clanId);
const sortNewest = (a, b) => b.scoutedAtMs - a.scoutedAtMs || a.key.localeCompare(b.key);
function activeEntries(board, now, capacity) {
  return (Array.isArray(board?.entries) ? board.entries : []).filter(e => e.expiresAtMs > now)
    .sort(sortNewest).slice(0, capacity);
}
function applyStables(existingMultiplier, nominalPercent, capPercent = 200) {
  const before = Math.min(1 + capPercent / 100, existingMultiplier);
  const speedMultiplier = Math.min(1 + capPercent / 100, existingMultiplier + nominalPercent / 100);
  return { speedMultiplier, effectivePercent: Math.max(0, Math.round((speedMultiplier - before) * 1000000) / 10000) };
}
// Only fields already disclosed by successful scouts may enter the clan copy.
const SNAPSHOT_FIELDS = new Set(("targetType targetSpawnId cityId regionId ownerUid ownerName ownerFlag owner ownerKind clanId clanName towerId towerName towerOwnershipKey level balanceVersion troops ownerTroops reinforcementTroops reinforcements ownerDefensePower totalDefense baseTotalDefense totalDefenseBonus siegeCombatVersion defenseCombatVersion baseDefensePowerPerTroop gearWallStrengthPercent gearDefenderStrengthPercent fortification cityLevel defensePercent baseAttackPercent baseCityWalls cityWalls troopDefense cityDefenseBonus objectiveTroopDefenseBonusPercent strongholdDefenseBonusPercent strongholdDefenseBonus stoneworksBonus wallLevel wallIntegrityBps fullWallPower currentWallPower wallDefense scoutedAtMs expiresAtMs").split(" "));
for (const skill of ["swordmastery", "marchOrders", "taxStewardship", "royalGranaries", "shieldwallDiscipline", "stoneworks", "fieldMedics", "guildCharters"]) {
  SNAPSHOT_FIELDS.add(skill + "Level"); SNAPSHOT_FIELDS.add(skill + "Percent");
}
function snapshotOf(report, uid, realm, now, fail) {
  const raw = report?.scoutReport;
  if (!current(report, realm) || report.uid !== uid || report.type !== "scout" || report.outcome !== "scout" || !raw
    || !Number.isSafeInteger(raw.scoutedAtMs) || raw.scoutedAtMs > now
    || !Number.isSafeInteger(raw.expiresAtMs) || raw.expiresAtMs <= now || raw.expiresAtMs > raw.scoutedAtMs + INTEL_MS) {
    throw fail("failed-precondition", "Only your current successful scout reports can be shared.");
  }
  const targetType = raw.targetType || report.targetType;
  if (!["city", "camp", "tower", "marauder"].includes(targetType) || !id(report.cityId) || !id(report.regionId)
    || (targetType === "marauder" && !id(raw.targetSpawnId))) throw fail("failed-precondition", "This report has no valid recorded target.");
  const snapshot = Object.fromEntries(Object.entries(raw).filter(([key]) => SNAPSHOT_FIELDS.has(key)));
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 64 * 1024) throw fail("resource-exhausted", "This report is too large to share.");
  const location = { regionId: report.regionId, targetId: report.cityId, targetType,
    ...(targetType === "marauder" ? { spawnId: raw.targetSpawnId } : {}),
    ...(Number.isFinite(report.targetLocation?.x) && Number.isFinite(report.targetLocation?.y)
      ? { x: report.targetLocation.x, y: report.targetLocation.y } : {}) };
  const key = hash([realm.worldId, realm.resetGeneration, realm.realmShardId, location.regionId, targetType, location.targetId, location.spawnId || ""]);
  return { key, targetName: String(report.cityName || report.cityId).slice(0, 80), location,
    scoutedAtMs: raw.scoutedAtMs, expiresAtMs: raw.expiresAtMs, snapshot };
}

function createService({ db, HttpsError, realm, assertWorld, validateProfile, towerRef, normalizeTower, transact }) {
  const fail = (code, message) => new HttpsError(code, message);
  async function context(tx, uid, profile, now) {
    const r = realm(), clanId = profile?.clanId;
    if (!current(profile, r) || !id(clanId)) return { reason: "no-clan", realm: r };
    const [clan, member, ...towers] = await Promise.all([
      tx.get(db.doc(`clans/${clanId}`)), tx.get(db.doc(`clans/${clanId}/members/${uid}`)),
      ...T.TOWERS.map(tower => tx.get(towerRef(tower.id))),
    ]);
    if (!current(clan.data(), r) || clan.data()?.status !== "active" || !memberActive(member.data(), uid, clanId, r)) {
      return { reason: "membership", realm: r };
    }
    const owned = towers.flatMap((snap, i) => current(snap.data(), r) && snap.data()?.ownerKind === "clan" && snap.data()?.clanId === clanId
      ? [normalizeTower(snap, T.TOWERS[i].id, now)] : []);
    const eligibility = T.getEligibility(member.data(), now, clanId);
    const base = { realm: r, clanId, member: member.data(), eligibleAtMs: eligibility.eligibleAtMs };
    if (owned.length !== 1) return { ...base, reason: owned.length ? "ambiguous-tower" : "no-tower" };
    const tower = owned[0];
    return { ...base, tower, reason: eligibility.eligible ? "" : "probation" };
  }
  async function movement(tx, { uid, profile, kind, target, targetType, rally, nowMs }) {
    if (!["reinforce", "rally_join"].includes(kind) || (kind === "reinforce" && target?.ownerUid === uid)) return null;
    const c = await context(tx, uid, profile, nowMs);
    if (!c.clanId) return null;
    if (kind === "rally_join") {
      if (!current(rally, c.realm) || rally.status !== "forming" || rally.clanId !== c.clanId
        || rally.assemblyCityId !== target?.id || (targetType === "tower" ? target.clanId !== c.clanId : target.ownerUid !== rally.leaderUid)) return null;
    } else if (targetType === "tower") {
      if (!current(target, c.realm) || target.ownerKind !== "clan" || target.clanId !== c.clanId || target.id !== c.tower?.id) return null;
    } else {
      if (!id(target?.ownerUid) || !current(target, c.realm)) return null;
      const [recipient, member] = await Promise.all([tx.get(db.doc(`players/${target.ownerUid}`)), tx.get(db.doc(`clans/${c.clanId}/members/${target.ownerUid}`))]);
      if (!current(recipient.data(), c.realm) || recipient.data()?.clanId !== c.clanId || !memberActive(member.data(), target.ownerUid, c.clanId, c.realm)) return null;
    }
    const level = B.level(c.tower?.buildings?.stables), reason = c.reason || (!level ? "unbuilt" : "");
    return { version: VERSION, clanId: c.clanId, towerId: c.tower?.id || "", ownershipRevision: c.tower?.ownershipRevision || 0,
      level, nominalPercent: reason ? 0 : B.bonus("stables", level), buildingPercent: B.bonus("stables", level), reason,
      eligibleAtMs: c.eligibleAtMs, resolvedAtMs: nowMs };
  }
  async function authorize(tx, uid, now) {
    assertWorld();
    const profile = (await tx.get(db.doc(`players/${uid}`))).data();
    validateProfile(profile || {});
    const c = await context(tx, uid, profile, now);
    if (c.reason) throw fail("permission-denied", c.reason === "probation" ? "Scout Lodge access unlocks after one hour in your clan." : "Your clan must currently own a Tower to use its Scout Lodge.");
    const capacity = B.intelligenceCapacity(c.tower.buildings.scout_lodge);
    if (!capacity) throw fail("failed-precondition", "Build the Scout Lodge to share and read clan intelligence.");
    const scope = hash([c.realm, c.clanId, c.tower.id, c.tower.ownershipRevision]);
    return { ...c, uid, profile, capacity, scope, boardRef: db.doc(`clans/${c.clanId}/scoutIntelligence/${scope}`) };
  }
  async function intelligence(uid, input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("invalid-argument", "Choose a valid intelligence action.");
    const action = input.action || "list";
    const permitted = { list: ["action"], detail: ["action", "key"], share: ["action", "reportId", "scoutedAtMs", "operationId"], remove: ["action", "key", "operationId"] }[action];
    if (!permitted || Object.keys(input).some(key => !permitted.includes(key)) || Buffer.byteLength(JSON.stringify(input)) > 1024
      || (["detail", "remove"].includes(action) && !/^[a-f0-9]{64}$/.test(input.key || ""))
      || (["share", "remove"].includes(action) && !id(input.operationId))
      || (action === "share" && (!id(input.reportId) || !Number.isSafeInteger(input.scoutedAtMs)))) throw fail("invalid-argument", "Choose a valid scout report or intelligence entry.");
    return transact(async tx => {
      const now = Date.now(), c = await authorize(tx, uid, now), board = (await tx.get(c.boardRef)).data() || {};
      let entries = activeEntries(board, now, c.capacity);
      const base = { ok: true, version: VERSION, scope: c.scope, clanId: c.clanId, towerId: c.tower.id, ownershipRevision: c.tower.ownershipRevision,
        capacity: c.capacity, serverTimeMs: now };
      const allowedRemove = entry => entry.sharedByUid === uid || ["leader", "officer"].includes(c.member.role);
      if (action === "list") return { ...base, entries: entries.map(entry => ({ ...entry, canRemove: allowedRemove(entry) })) };
      const targetRef = key => c.boardRef.collection("scoutIntelTargets").doc(key);
      if (action === "detail") {
        const entry = entries.find(row => row.key === input.key);
        if (!entry) throw fail("not-found", "This intelligence expired or is no longer available.");
        const stored = (await tx.get(targetRef(entry.key))).data();
        if (!stored || stored.expiresAtMs <= now || stored.scoutedAtMs !== entry.scoutedAtMs) throw fail("not-found", "This intelligence is no longer available.");
        return { ...base, entry: { ...entry, canRemove: allowedRemove(entry), snapshot: stored.snapshot } };
      }
      const receiptRef = c.boardRef.collection("scoutIntelReceipts").doc(hash([uid, input.operationId]));
      const receipt = (await tx.get(receiptRef)).data();
      const requestKey = hash([action, input.key || "", input.reportId || "", input.scoutedAtMs || 0]);
      if (receipt) {
        if (receipt.requestKey !== requestKey) throw fail("already-exists", "This request was already used for another action.");
        if (receipt.expiresAtMs <= now) throw fail("failed-precondition", "This intelligence has expired.");
        return { ...base, duplicate: true, key: receipt.key };
      }
      let saved = null, key = input.key;
      if (action === "share") {
        const original = (await tx.get(db.doc(`players/${uid}/serverReports/${input.reportId}`))).data();
        saved = snapshotOf(original, uid, c.realm, now, fail);
        if (saved.scoutedAtMs !== input.scoutedAtMs) throw fail("failed-precondition", "Your report changed. Reopen it before sharing.");
        key = saved.key;
        const previous = entries.find(row => row.key === key);
        if (previous && previous.scoutedAtMs > saved.scoutedAtMs) throw fail("failed-precondition", "Your clan already has newer intelligence for this target.");
        if (previous && previous.scoutedAtMs === saved.scoutedAtMs) {
          tx.create(receiptRef, { ...c.realm, requestKey, key, expiresAtMs: saved.expiresAtMs });
          return { ...base, duplicate: true, key };
        }
        if (!previous && entries.length >= c.capacity) throw fail("resource-exhausted", `Scout Lodge full (${entries.length} / ${c.capacity}). Remove an entry or upgrade the Lodge.`);
        const { snapshot, ...summary } = saved;
        saved = { ...saved, ...c.realm, scope: c.scope };
        entries = entries.filter(row => row.key !== key).concat({ ...summary, troops: snapshot.troops ?? null,
          sharedByUid: uid, scoutName: String(c.profile.playerName || "Ruler").slice(0, 40), sourceReportId: input.reportId }).sort(sortNewest);
      } else {
        const entry = entries.find(row => row.key === key);
        if (entry && !allowedRemove(entry)) throw fail("permission-denied", "Only the contributor, Leader or Officers may remove this intelligence.");
        entries = entries.filter(row => row.key !== key);
      }
      // Discard expired or over-capacity copies while serializing this bounded index.
      for (const old of board.entries || []) if (old.key !== key && !entries.some(entry => entry.key === old.key)) tx.delete(targetRef(old.key));
      // Serialize all capacity decisions through this bounded, private index.
      tx.set(c.boardRef, { ...c.realm, clanId: c.clanId, towerId: c.tower.id, ownershipRevision: c.tower.ownershipRevision,
        expiresAtMs: Math.max(now, ...entries.map(entry => entry.expiresAtMs)), entries });
      if (saved) tx.set(targetRef(key), saved); else tx.delete(targetRef(key));
      tx.create(receiptRef, { ...c.realm, requestKey, key, expiresAtMs: saved?.expiresAtMs || now + INTEL_MS });
      tx.set(db.doc(`clans/${c.clanId}/scoutIntelSignals/current`), { ...c.realm, towerId: c.tower.id,
        ownershipRevision: c.tower.ownershipRevision, revision: crypto.randomUUID() });
      return { ...base, key, count: entries.length };
    }, "clanIntelligence");
  }
  async function cleanup(now = Date.now()) {
    const r = realm();
    const snapshots = await Promise.all(["scoutIntelligence", "scoutIntelTargets", "scoutIntelReceipts"].map(collection => db.collectionGroup(collection)
      .where("worldId", "==", r.worldId).where("resetGeneration", "==", r.resetGeneration)
      .where("realmShardId", "==", r.realmShardId).where("expiresAtMs", "<=", now).limit(100).get()));
    const writer = db.bulkWriter();
    const deletions = snapshots.flatMap(snapshot => snapshot.docs).map(doc => writer.delete(doc.ref, { lastUpdateTime: doc.updateTime }).then(() => 1, () => 0));
    await writer.close();
    return { deleted: (await Promise.all(deletions)).reduce((sum, n) => sum + n, 0) };
  }
  return Object.freeze({ context, movement, intelligence, cleanup });
}
module.exports = { VERSION, INTEL_MS, current, memberActive, activeEntries, applyStables, snapshotOf, createService };
