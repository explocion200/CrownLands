"use strict";
const crypto = require("node:crypto");
const M = require("./marauder-rules");

function isClear(point, { bounds, rectangles = [], structures = [], enemies = [], walkable }, radius = 64) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !bounds
    || point.x < bounds.left + radius || point.x > bounds.right - radius
    || point.y < bounds.top + radius || point.y > bounds.bottom - radius) return false;
  if (rectangles.some(rect => point.x + radius > rect.left && point.x - radius < rect.right
    && point.y + radius > rect.top && point.y - radius < rect.bottom)) return false;
  if ([...structures, ...enemies].some(other => Math.hypot(point.x - other.x, point.y - other.y)
    < radius + Math.max(64, Number(other.clearance) || 64))) return false;
  return Boolean(walkable?.(point, radius));
}

function createMarauderPopulation({ db, runTransaction, context, activeRegions, descriptor, layout, islandId }) {
  const rolloutRef = () => db.doc(`marauderPopulation/${context().storageId}`);
  const mapRef = regionId => rolloutRef().collection("maps").doc(regionId);
  async function populate(regionId, now) {
    const spec = descriptor(regionId), slots = M.slots(spec);
    if (!slots.length) return { spawned: 0, blocked: 0 };
    const world = context(), island = db.doc(`islands/${islandId(regionId)}`);
    const geometry = layout(regionId);
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
        let point = null;
        for (let attempt = 0; attempt < 48; attempt++) {
          const candidate = { x: crypto.randomInt(Math.ceil(geometry.bounds.left + 100), Math.floor(geometry.bounds.right - 100)),
            y: crypto.randomInt(Math.ceil(geometry.bounds.top + 100), Math.floor(geometry.bounds.bottom - 100)), regionId };
          if (!isClear(candidate, { ...geometry, structures, enemies: previous ? [...enemies, previous] : enemies })) continue;
          if (!geometry.accessible(candidate)) continue;
          point = candidate; break;
        }
        if (!point) { blocked++; continue; }
        const level = crypto.randomInt(slot.min, slot.max + 1), balance = M.balance(level);
        const row = { id, ...point, slot: slot.slot, spawnId: crypto.randomUUID(), level,
          classification: slot.classification, balanceVersion: M.VERSION, status: "active",
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
module.exports = { isClear, createMarauderPopulation };
