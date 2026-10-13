"use strict";
const crypto = require("node:crypto");
const M = require("./marauder-rules");
const MAP_EDGE_INSET = 0.20;
const NPC_CLEARANCE = 64;

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
  if ([...structures, ...enemies].some(other => Math.hypot(point.x - other.x, point.y - other.y)
    < radius + Math.max(NPC_CLEARANCE, Number(other.clearance) || NPC_CLEARANCE))) return false;
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
  async function populate(regionId, now) {
    const spec = descriptor(regionId), slots = M.slots(spec);
    if (!slots.length) return { spawned: 0, blocked: 0 };
    const world = context(), island = db.doc(`islands/${islandId(regionId)}`);
    const geometry = layout(regionId);
    const roadPoints = roadPlacementPoints(geometry);
    return runTransaction(async transaction => {
      const [rollout, rows, cities, islandSnap] = await Promise.all([
        transaction.get(rolloutRef()), transaction.get(island.collection("marauderCombat")),
        transaction.get(island.collection("cities")), transaction.get(island),
      ]);
      if (rollout.data()?.enabled !== true || !islandSnap.exists) return { spawned: 0, blocked: 0 };
      const existing = new Map(rows.docs.map(doc => [doc.id, doc.data()]));
      const enemies = [...existing.values()].filter(row => row.status === "active");
      const structures = [...geometry.structures, ...cities.docs.map(doc => ({ ...doc.data(), clearance: 132 }))];
      let spawned = 0, blocked = 0;
      for (const slot of slots) {
        const id = `marauder_${crypto.createHash("sha256").update(regionId).digest("hex").slice(0, 12)}_${String(slot.slot).padStart(2, "0")}`, previous = existing.get(id);
        if (previous?.status === "active" || previous?.respawnAtMs > now) continue;
        // Crowded Core interiors need more chances; keep each slot's search bounded.
        const maxAttempts = slot.classification === "boss" ? 512 : 48;
        let point = null;
        for (let attempt = 0; roadPoints.length && attempt < maxAttempts; attempt++) {
          const candidate = { ...roadPoints[crypto.randomInt(roadPoints.length)], regionId };
          if (!isClear(candidate, { ...geometry, structures, enemies: previous ? [...enemies, previous] : enemies })) continue;
          if (!geometry.accessible(candidate)) continue;
          point = candidate; break;
        }
        if (!point) { blocked++; continue; }
        const level = crypto.randomInt(slot.min, slot.max + 1), balance = M.balance(level);
        const row = { id, ...point, slot: slot.slot, spawnId: crypto.randomUUID(), level,
          classification: slot.classification, balanceVersion: M.VERSION, placementVersion: 3, status: "active",
          name: `${slot.classification === "boss" ? "Clan Boss" : "Marauder"} Lv. ${level}`,
          worldId: world.worldId, resetGeneration: world.resetGeneration, realmShardId: world.realmShardId,
          targetType: "marauder", ownerKind: "neutral", ownerUid: "", spawnedAtMs: now, respawnAtMs: 0 };
        transaction.set(island.collection("marauders").doc(id), row);
        transaction.set(island.collection("marauderCombat").doc(id), { ...row, troops: balance.defenders });
        enemies.push(row); spawned++;
      }
      transaction.set(mapRef(regionId), { regionId, initialized: blocked === 0, retryAtMs: blocked ? now + 60000 : 0, updatedAtMs: now });
      return { spawned, blocked };
    }, "populateMarauders");
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
      ...candidates.filter(id => !states.get(id)?.initialized)])].slice(0, 36);
    let spawned = 0, blocked = 0;
    for (const id of selected) {
      const result = await populate(id, now); spawned += result.spawned; blocked += result.blocked;
    }
    await rolloutRef().set({ cursor: (start + candidates.length) % Math.max(1, regions.length) }, { merge: true });
    return { enabled: true, spawned, blocked, checkedMaps: selected.length, dueSlots: due.size };
  }
  return { rolloutRef, populate, maintain };
}
module.exports = { MAP_EDGE_INSET, placementBounds, roadPlacementPoints, isClear, createMarauderPopulation };
