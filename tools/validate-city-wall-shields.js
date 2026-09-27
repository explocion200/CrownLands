"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const now = 1_800_000_000_000;

function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const body = source.indexOf(") {", start) + 2;
  let depth = 0;
  for (let i = body; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw Error(`Unclosed ${name}`);
}

function policy(file, client) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const scope = {
    Date, FORTIFICATION_STATE_VERSION: 1,
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0)),
    clampInt: (value, min, max) => Math.min(max, Math.max(min, Math.floor(Number(value) || 0))),
    safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    safeString: value => String(value || ""),
    timestampToMs: value => Number(value) || 0,
    normalizeTimestampMs: value => Number(value) || 0,
    isStronghold: city => city?.kind === "stronghold",
    getOwnerUid: city => city.ownerKind === "player" ? city.ownerUid || "" : "",
    getActivePeaceShieldExpiresAtMs: () => now + 120_000,
    formatNumber: value => String(value),
  };
  vm.createContext(scope);
  const names = ["normalizeFortificationState", "getFortificationIntegrityBpsAt",
    ...(client ? ["getCityPeaceShieldExpiresAtMs", "isCityProtectedByPeaceShield", "formatWallIntegrity"] : ["getShieldExpiresAtMs", "isCityShielded"])];
  vm.runInContext(names.map(name => extract(source, name)).join("\n"), scope);
  return { scope, shielded: client
    ? (city, time) => scope.isCityProtectedByPeaceShield(city, time)
    : (city, time) => scope.isCityShielded(city, "attacker", time) };
}

const server = policy("functions/index.js", false), client = policy("game.js", true);
assert.equal(client.scope.formatWallIntegrity(9999), "99.9%", "Partial repair must never display 100%");
assert.equal(client.scope.formatWallIntegrity(10_000), "100%");
const city = { id: "target", owner: "enemy", ownerKind: "player", ownerUid: "defender", ownerShieldExpiresAtMs: now + 120_000 };
const damaged = { ...city, fortificationState: {
  version: 1, integrityBps: 5000, lastDamagedAtMs: now - 60_000, repairAtMs: now + 60_000,
} };
const cases = [
  ["intact", city, now, true],
  ["repair pending", damaged, now, false],
  ["not rounded up early", damaged, now + 59_999, false],
  ["exact repair deadline", damaged, now + 60_000, true],
  ["offline repair", damaged, now + 90_000, true],
  ["exact shield expiry", damaged, now + 120_000, false],
  ["shield expires before repair", { ...damaged, ownerShieldExpiresAtMs: now + 30_000 }, now + 60_000, false],
  ["ownership changed and old timer cleared", { ...damaged, ownerUid: "new-owner", ownerShieldExpiresAtMs: 0 }, now + 60_000, false],
  ["neutral city", { ...city, owner: "neutral", ownerKind: "neutral", ownerUid: null }, now, false],
  ["Stronghold excluded", { ...city, kind: "stronghold" }, now, false],
  ["new damage postpones protection", { ...damaged, fortificationState: { ...damaged.fortificationState, lastDamagedAtMs: now + 50_000, repairAtMs: now + 110_000 } }, now + 60_000, false],
];
for (const [label, target, time, expected] of cases) {
  assert.equal(server.shielded(target, time), expected, `Server: ${label}`);
  assert.equal(client.shielded(target, time), expected, `Client: ${label}`);
}
assert.equal(server.scope.isCityShielded(city, "defender", now), false, "Own city is not a hostile shield block");
assert.equal(client.shielded({ ...damaged, owner: "player", ownerShieldExpiresAtMs: 0 }, now), false);
assert.equal(client.shielded({ ...damaged, owner: "player", ownerShieldExpiresAtMs: 0 }, now + 60_000), true,
  "The current player's active item timer covers a repaired city");
assert.equal(damaged.fortificationState.integrityBps, 5000, "Eligibility checks must not rewrite stored wall state");
console.log("City wall shields passed: client/server parity, exact repair and expiry boundaries, offline recovery, ownership changes, later damage and objective exclusions.");
