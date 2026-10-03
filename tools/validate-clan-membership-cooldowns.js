"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("functions/index.js"), client = read("game.js");
const HOUR = 3_600_000, NOW = Date.UTC(2026, 9, 3, 12);
const section = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
};
class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const contexts = [server, client].map((source, index) => {
  const context = vm.createContext({ HttpsError, Date, Math, Number,
    timestampToMs: value => Number(value) || 0, normalizeTimestampMs: value => Number(value) || 0,
    safeString: value => String(value || ""), state: {} });
  vm.runInContext(source.match(/const CLAN_JOIN_COOLDOWN_MS = [^;]+;/)[0], context);
  assert.equal(vm.runInContext("CLAN_JOIN_COOLDOWN_MS", context), HOUR);
  vm.runInContext(section(source, "function getClanJoinCooldownUntilMs(", index ? "function formatClanJoinCooldown(" : "function assertClanRole("), context);
  return context;
});
const [backend, frontend] = contexts;
const departure = (start, duration) => ({clanIdentityUpdatedAtMs: start, clanJoinCooldownUntilMs: start + duration});
for (const [label, profile, expected] of [
  ["new departure", departure(NOW, HOUR), NOW + HOUR],
  ["new half elapsed", departure(NOW - HOUR / 2, HOUR), NOW + HOUR / 2],
  ["old half elapsed", departure(NOW - HOUR / 2, 24 * HOUR), NOW + HOUR / 2],
  ["old already elapsed", departure(NOW - 2 * HOUR, 24 * HOUR), NOW - HOUR],
  ["old exact boundary", departure(NOW - HOUR, 24 * HOUR), NOW],
  ["missing start", {clanJoinCooldownUntilMs: NOW + HOUR}, NOW + HOUR],
  ["different duration", departure(NOW, 2 * HOUR), NOW + 2 * HOUR],
  ["missing deadline", {clanIdentityUpdatedAtMs: NOW}, 0],
  ["empty", {}, 0],
]) {
  for (const context of contexts) assert.equal(context.getClanJoinCooldownUntilMs(profile), expected, label);
  frontend.state.clanJoinCooldownUntilMs = frontend.getClanJoinCooldownUntilMs(profile);
  assert.equal(frontend.getClanJoinCooldownRemainingMs(NOW), Math.max(0, expected - NOW), label);
  if (expected > NOW) assert.throws(() => backend.assertNoClan(profile, NOW), error =>
    error.code === "failed-precondition" && error.details.cooldownUntilMs === expected, label);
  else assert.doesNotThrow(() => backend.assertNoClan(profile, NOW), label);
}
const current = departure(NOW, HOUR);
assert.throws(() => backend.assertNoClan(current, NOW + HOUR - 1), /wait before joining/);
assert.doesNotThrow(() => backend.assertNoClan(current, NOW + HOUR));
assert.throws(() => backend.assertNoClan({clanId:"current"}, NOW), /already in a clan/);
assert.throws(() => backend.assertNoClan({pendingClanApplicationId:"other"}, NOW), /Cancel your existing/);
assert.doesNotThrow(() => backend.assertNoClan({pendingClanApplicationId:"allowed"}, NOW, "allowed"));
assert.match(client, /state\.clanJoinCooldownUntilMs = getClanJoinCooldownUntilMs\(profile\)/);
assert.match(client, /state\.clanJoinCooldownUntilMs = getClanJoinCooldownUntilMs\(detail\)/);
assert.match(read("firebaseClient.js"), /clanIdentityUpdatedAtMs: isCurrentRealm \? timestampToMs\(profile.clanIdentityUpdatedAtMs\) : 0/);
for (const file of ["game.js", "clan-shop-ui.js", "clan-tower-details-ui.js", "clan-tower-buildings-ui.js", "holding-tower-ui.js", "help-handbook-content.js"]) {
  const source = read(file);
  assert(!/24-hour (?:clan cooldown|access probation)|(?:wait|after|requires) 24 hours (?:in|before)/.test(source), file + ": stale membership wait");
}
console.log("PASS one-hour clan cooldown: backend/client parity, exact boundary, saved 24-hour conversion, missing metadata, current membership and application guards.");
