/* Draft-only own-army arithmetic; no combat outcome, target data or routing. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ORDER_POWER_REVIEW = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function calculate(troops, swordmasteryPercent, equippedWeaponPercent) {
    const count = Math.max(0, Math.floor(Number(troops) || 0));
    const skill = Math.max(0, Number(swordmasteryPercent) || 0);
    const gear = Math.max(0, Number(equippedWeaponPercent) || 0);
    const basePower = count * 1.25;
    // Keep the same operation order as createAttackCombatSnapshot in Functions.
    const perTroop = 1.25 * (1 + skill / 100 + gear / 100);
    return {
      basePower,
      swordmasteryPower: basePower * skill / 100,
      weaponPower: basePower * gear / 100,
      bonusPercent: skill + gear,
      perTroop,
      totalPower: Math.floor(count * perTroop),
    };
  }
  return Object.freeze({ calculate });
});
