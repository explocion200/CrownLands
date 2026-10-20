"use strict";

// References are untrusted input. Labels, positions and season identity always
// come from the public map on the server, never from a chat sender.
function reference(value, fail = (code, message) => Object.assign(Error(message), { code })) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["kind", "id", "regionId", "spawnId"].includes(key))
    || !["city", "camp", "tower", "marauder"].includes(value.kind)
    || typeof value.id !== "string" || typeof value.regionId !== "string"
    || !/^[A-Za-z0-9_-]{1,96}$/.test(value.id || "")
    || !/^[A-Za-z0-9_-]{1,80}$/.test(value.regionId || "")
    || (value.kind === "marauder" ? typeof value.spawnId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.spawnId) : value.spawnId !== undefined)) {
    throw fail("invalid-argument", "Choose a current location on the map.");
  }
  return { kind: value.kind, id: value.id, regionId: value.regionId,
    ...(value.kind === "marauder" ? { spawnId: value.spawnId } : {}) };
}

function createService({ readTarget, realm, fail }) {
  function fromTarget(ref, target) {
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)
      || (ref.kind === "marauder" && (target.status !== "active" || target.spawnId !== ref.spawnId))) {
      throw fail("failed-precondition", "That location is no longer available. Choose it again on the map.");
    }
    return { version: 1, ...ref, ...realm(), name: String(target.name || ref.id).slice(0, 80),
      mapName: String(target.mapName || ref.regionId).slice(0, 80),
      label: String(target.label || "Location").slice(0, 32),
      level: Number.isSafeInteger(target.level) ? Math.max(0, target.level) : 0,
      x: target.x, y: target.y, relocatedAtMs: Math.max(0, Number(target.relocatedAtMs) || 0) };
  }
  async function snapshot(tx, input) {
    const ref = reference(input, fail);
    return fromTarget(ref, await readTarget(tx, ref));
  }
  async function resolve(tx, saved) {
    if (!saved || saved.version !== 1) return { status: "unavailable" };
    if (Object.entries(realm()).some(([key, value]) => saved[key] !== value)) return { status: "old-season" };
    const ref = reference({ kind: saved.kind, id: saved.id, regionId: saved.regionId,
      ...(saved.kind === "marauder" ? { spawnId: saved.spawnId } : {}) }, fail);
    const target = await readTarget(tx, ref);
    if (!target || (ref.kind === "marauder" && (target.status !== "active" || target.spawnId !== ref.spawnId))) return { status: "unavailable" };
    if (target.x !== saved.x || target.y !== saved.y
      || Math.max(0, Number(target.relocatedAtMs) || 0) !== saved.relocatedAtMs) return { status: "moved" };
    return { status: "available", location: fromTarget(ref, target) };
  }
  return { snapshot, resolve };
}
module.exports = { reference, createService };
