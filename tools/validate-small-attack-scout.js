"use strict";
const assert = require("node:assert/strict"), vm = require("node:vm");
const { serverSource, extractFunction } = require("./world-travel-test-fixtures");
const scope = { safeNumber: (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback,
  safeString: v => String(v || ""), getOwnerUid: c => c.ownerUid || "",
  isStronghold: c => c.kind === "stronghold" || Boolean(c.strongholdType),
  clampCityLevel: n => Math.max(1, Math.floor(Number(n) || 1)) };
vm.createContext(scope);
vm.runInContext(extractFunction(serverSource, "isSmallHostileCityAttackScout"), scope);
const army = { kind: "attack", ownerKind: "player", ownerUid: "attacker", targetType: "city", troops: 49 };
const city = { level: 61, ownerUid: "defender" };
const check = scope.isSmallHostileCityAttackScout;
for (const level of [1, 60, 61, 100, 200]) for (const troops of [0, 1, 49, 50, 100]) {
  assert.equal(check({ ...army, troops }, { ...city, level }), level > 60 && troops > 0 && troops < 50);
}
for (const patch of [
  { kind: "scout" }, { kind: "transfer" }, { kind: "reinforce" }, { kind: "rally_join" },
  { launchKind: "transfer" }, { targetType: "camp" }, { targetType: "tower" }, { targetType: "marauder" },
  { returning: true }, { recalledAtMs: 1 }, { rallyAttack: true }, { rallyJoin: true }, { rallyReturn: true },
  { rallyReturnAttack: true }, { campReturn: true }, { reinforcementReturn: true }, { relinquishTransfer: true },
  { retargetedFromKind: "reinforce" }, { eventKind: "citadel_assault" }, { ownerKind: "neutral" }, { ownerUid: "" },
]) assert.equal(check({ ...army, ...patch }, city), false, JSON.stringify(patch));
for (const patch of [{ ownerUid: "" }, { ownerUid: "attacker" }, { kind: "stronghold" }, { strongholdType: "citadel" }]) {
  assert.equal(check(army, { ...city, ...patch }), false, JSON.stringify(patch));
}
assert.equal(check(army, city, true), false);
console.log("Small attack/scout boundaries and excluded movement/target types passed.");
