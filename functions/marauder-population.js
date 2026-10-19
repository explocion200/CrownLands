"use strict";
const crypto = require("node:crypto");
const M = require("./marauder-rules");
const MAP_EDGE_INSET = 0.20;
const NPC_CLEARANCE = 64;
const NPC_SEPARATION_FRACTION = 0.25;
const PLACEMENT_VERSION = 4;
const slotId = (regionId, slot) => `marauder_${crypto.createHash("sha256").update(regionId).digest("hex").slice(0, 12)}_${String(slot).padStart(2, "0")}`;

function minimumEnemySeparation(bounds) {
  return Math.max(NPC_CLEARANCE * 2, Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top) * NPC_SEPARATION_FRACTION);
}

function spawnLevelRange(slot, previous, initialHigh = false) {
  if (slot.classification !== "solo" || slot.slot !== 1) return { min: slot.min, max: slot.max };
  const high = previous?.level >= 11 && previous.level <= 39
    || !(previous?.level >= 11 && previous.level <= 79) && initialHigh;
  return high ? { min: 40, max: 79 } : { min: 11, max: 39 };
}

function placementBounds(bounds, radius = NPC_CLEARANCE) {
  if (!bounds || ![bounds.left, bounds.top, bounds.right, bounds.bottom, radius].every(Number.isFinite)
    || radius <= 0) return null;
  const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
  if (width <= 0 || height <= 0) return null;
  const insetX = Math.max(radius, width * MAP_EDGE_INSET), insetY = Math.max(radius, height * MAP_EDGE_INSET);
  const result = { left: Math.ceil(bounds.left + insetX), top: Math.ceil(bounds.top + insetY),
    right: Math.floor(bounds.right - insetX), bottom: Math.floor(bounds.bottom - insetY) };
  return result.left <= result.right && result.top <= result.bottom ? result : null;
}

function isClear(point, { bounds, rectangles = [], structures = [], enemies = [], walkable }, radius = NPC_CLEARANCE) {
  const placement = placementBounds(bounds, radius);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !placement
    || point.x < placement.left || point.x > placement.right
    || point.y < placement.top || point.y > placement.bottom) return false;
  if (rectangles.some(rect => point.x + radius > rect.left && point.x - radius < rect.right
    && point.y + radius > rect.top && point.y - radius < rect.bottom)) return false;
  if (structures.some(other => Math.hypot(point.x - other.x, point.y - other.y)
    < radius + Math.max(NPC_CLEARANCE, Number(other.clearance) || NPC_CLEARANCE))) return false;
  if (enemies.some(other => Math.hypot(point.x - other.x, point.y - other.y) < minimumEnemySeparation(bounds))) return false;
  return Boolean(walkable?.(point, radius));
}

function roadPlacementPoints(geometry) {
  const bounds = placementBounds(geometry.bounds);
  if (!bounds) return [];
  return (geometry.roadPoints || []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y)
    && point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom);
}

function createMarauderPopulation({ db, runTransaction, context, activeRegions, descriptor, layout, islandId }) {
  const rolloutRef = () => db.doc(`marauderPopulation/${context().storageId}`);
  const mapRef = regionId => rolloutRef().collection("maps").doc(regionId);
  async function populate(regionId, now, expected = null) {
    const spec = descriptor(regionId), slots = M.slots(spec);
    if (!slots.length) return { spawned: 0, blocked: 0, retired: 0 };
    const world = context(), island = db.doc(`islands/${islandId(regionId)}`);
    const geometry = layout(regionId);
    const roadPoints = roadPlacementPoints(geometry);
    return runTransaction(async transaction => {
      // A viewer may wake one due identity, never create vacancies or choose a spawn.
      if (expected) {
        const row = (await transaction.get(island.collection("marauderCombat").doc(expected.id))).data();
        if (!row || row.spawnId !== expected.spawnId || row.status !== "defeated"
          || row.worldId !== world.worldId || row.resetGeneration !== world.resetGeneration
          || row.realmShardId !== world.realmShardId || row.regionId !== regionId
          || !Number.isFinite(row.respawnAtMs) || row.respawnAtMs > now || row.respawnRetryAtMs > now) {
          return { spawned: 0, blocked: 0, retired: 0 };
        }
      }
      const [rollout, rows, cities, islandSnap] = await Promise.all([
        transaction.get(rolloutRef()), transaction.get(island.collection("marauderCombat")),
        transaction.get(island.collection("cities")), transaction.get(island),
      ]);
      if (rollout.data()?.enabled !== true || !islandSnap.exists) return { spawned: 0, blocked: 0, retired: 0 };
      const existing = new Map(rows.docs.map(doc => [doc.id, doc.data()]));
      const allowed = new Map(slots.map(slot => [slotId(regionId, slot.slot), slot])), enemies = [];
      let retired = 0;
      // Reconcile the approved smaller population before filling vacancies.
      // Retired identities invalidate old marches, which settle through the
      // existing no-loss return/stamina/consumable-refund path at arrival.
      for (const [id, row] of [...existing].sort(([a], [b]) => a.localeCompare(b))) {
        if (expected) { if (row.status === "active") enemies.push(row); continue; }
        const slot = allowed.get(id);
        const invalidActive = row.status === "active" && (!slot || row.slot !== slot.slot
          || row.classification !== slot.classification || row.level < slot.min || row.level > slot.max
          || enemies.some(other => Math.hypot(row.x - other.x, row.y - other.y) < minimumEnemySeparation(geometry.bounds)));
        if ((!slot || invalidActive) && row.status !== "retired") {
          const patch = { status: "retired", respawnAtMs: 0, retiredAtMs: now, retirementPolicyVersion: PLACEMENT_VERSION };
          transaction.set(island.collection("marauders").doc(id), patch, { merge: true });
          transaction.set(island.collection("marauderCombat").doc(id), patch, { merge: true });
          existing.set(id, { ...row, ...patch }); retired++;
        } else if (row.status === "active") enemies.push(row);
      }
      const structures = [...geometry.structures, ...cities.docs.map(doc => ({ ...doc.data(), clearance: 132 }))];
      let spawned = 0, blocked = 0;
      for (const slot of slots) {
        const id = slotId(regionId, slot.slot), previous = existing.get(id);
        if (expected && id !== expected.id) continue;
        if (previous?.status === "active" || previous?.respawnAtMs > now) continue;
        if (enemies.length >= slots.length) { blocked++; continue; }
        // Crowded Core interiors need more chances; keep each slot's search bounded.
        const maxAttempts = slot.classification === "boss" ? 512 : 48;
        // This slot's remains disappear atomically with its replacement. Only
        // other remains still occupy space; buildings and living NPCs keep
        // their existing clearance. Never reuse the exact previous position.
        const obstacles = [...structures, ...[...existing.entries()]
          .filter(([otherId, row]) => otherId !== id && row.status === "defeated").map(([, row]) => row)];
        let point = null;
        for (let attempt = 0; roadPoints.length && attempt < maxAttempts; attempt++) {
          const candidate = { ...roadPoints[crypto.randomInt(roadPoints.length)], regionId };
          if (previous && candidate.x === previous.x && candidate.y === previous.y) continue;
          if (!isClear(candidate, { ...geometry, structures: obstacles, enemies })) continue;
          if (!geometry.accessible(candidate)) continue;
          point = candidate; break;
        }
        if (!point) {
          blocked++;
          if (previous?.status === "defeated") transaction.set(island.collection("marauderCombat").doc(id),
            { respawnRetryAtMs: now + 60000 }, { merge: true });
          continue;
        }
        const range = spawnLevelRange(slot, previous, crypto.randomInt(2) === 1);
        const level = crypto.randomInt(range.min, range.max + 1), balance = M.balance(level, M.BALANCE_VERSION);
        const row = { id, ...point, slot: slot.slot, spawnId: crypto.randomUUID(), level,
          classification: slot.classification, balanceVersion: balance.version, placementVersion: PLACEMENT_VERSION, status: "active",
          name: `${slot.classification === "boss" ? "Clan Boss" : "Marauder"} Lv. ${level}`,
          worldId: world.worldId, resetGeneration: world.resetGeneration, realmShardId: world.realmShardId,
          targetType: "marauder", ownerKind: "neutral", ownerUid: "", spawnedAtMs: now, respawnAtMs: 0 };
        transaction.set(island.collection("marauders").doc(id), row);
        transaction.set(island.collection("marauderCombat").doc(id), { ...row, troops: balance.defenders });
        existing.set(id, row);
        enemies.push(row); spawned++;
      }
      if (!expected) transaction.set(mapRef(regionId), { regionId, placementVersion: PLACEMENT_VERSION, initialized: blocked === 0,
        retryAtMs: blocked ? now + 60000 : 0, updatedAtMs: now });
      return { spawned, blocked, retired };
    }, "populateMarauders");
  }
  async function refresh({ regionId, id, spawnId } = {}, now = Date.now()) {
    const empty = { spawned: 0, blocked: 0, retired: 0 };
    if (typeof regionId !== "string" || regionId.length > 160 || typeof spawnId !== "string"
      || !spawnId || spawnId.length > 128 || !M.slots(descriptor(regionId)).some(slot => slotId(regionId, slot.slot) === id)) return empty;
    if (!new Set(await activeRegions()).has(regionId)) return empty;
    return populate(regionId, now, { id, spawnId });
  }
  async function maintain(now = Date.now()) {
    const rollout = await rolloutRef().get();
    if (rollout.data()?.enabled !== true) return { enabled: false, spawned: 0 };
    const world = context(), regions = [...await activeRegions()].filter(id => M.slots(descriptor(id)).length);
    const states = new Map();
    // Map metadata is small, and startup work is bounded independently of the
    // number of active New Lands. Closed admission maps remain in this list.
    const start = Math.max(0, Number(rollout.data()?.cursor) || 0) % Math.max(1, regions.length);
    const candidates = Array.from({ length: Math.min(24, regions.length) }, (_, i) => regions[(start + i) % regions.length]);
    if (candidates.length) (await db.getAll(...candidates.map(mapRef))).forEach(doc => states.set(doc.id, doc.data()));
    const due = await db.collectionGroup("marauderCombat").where("worldId", "==", world.worldId)
      .where("resetGeneration", "==", world.resetGeneration).where("realmShardId", "==", world.realmShardId)
      .where("status", "==", "defeated").where("respawnAtMs", "<=", now).orderBy("respawnAtMs").limit(36).get();
    const active = new Set(regions);
    const selected = [...new Set([...due.docs.map(doc => doc.data().regionId).filter(id => active.has(id)),
      ...candidates.filter(id => !states.get(id)?.initialized || states.get(id)?.placementVersion !== PLACEMENT_VERSION)])].slice(0, 36);
    let spawned = 0, blocked = 0, retired = 0;
    for (const id of selected) {
      const result = await populate(id, now); spawned += result.spawned; blocked += result.blocked; retired += result.retired;
    }
    await rolloutRef().set({ cursor: (start + candidates.length) % Math.max(1, regions.length) }, { merge: true });
    return { enabled: true, spawned, blocked, retired, checkedMaps: selected.length, dueSlots: due.size };
  }
  return { rolloutRef, populate, refresh, maintain };
}
module.exports = { MAP_EDGE_INSET, minimumEnemySeparation, spawnLevelRange, placementBounds, roadPlacementPoints, isClear, createMarauderPopulation };
