/* Compare the rendered own-army total to the existing server launch snapshot. */
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const server = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
const gear = require("../common-gear");
const functionSource = (source, name) => { const start = source.indexOf(`function ${name}(`); assert(start >= 0); return source.slice(start, source.indexOf("\n}", start) + 2); };
const element = { innerHTML: "" };
const context = {
  modalBody: { querySelector: () => element }, state: {}, COMMON_GEAR: gear,
  BASE_TROOP_ATTACK_POWER: 1.25, ATTACK_COMBAT_SNAPSHOT_VERSION: 1,
  normalizeCombatForecast: value => value, normalizeAttackCombatSnapshot: value => value,
  normalizeCommonGearState: gear.normalizeState,
  getCommonGearBonuses: profile => gear.getBonuses(profile || context.state),
  getSkillPercent: profile => Math.min(60, profile.upgrades.swordmastery * 2),
  getSkillLevel: profile => profile.upgrades.swordmastery,
  skillMultiplier: profile => Number((1 + Math.min(60, profile.upgrades.swordmastery * 2) / 100).toFixed(3)),
  safeNumber: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  usesServerArmyAuthority: () => true, escapeHtml: value => String(value),
  formatMarchesNumber: value => Math.floor(value).toLocaleString("en-US"),
};
vm.createContext(context);
vm.runInContext(functionSource(server, "createAttackCombatSnapshot"), context);
vm.runInContext(fs.readFileSync(path.join(root, "troop-orders-ui.js"), "utf8"), context);
let vectors = 0;
for (const troops of [1, 17, 999, 750000, 4294967295]) for (const skill of [0, 1, 20, 30]) for (const level of [1, 2, 3, 4, 5]) for (const equipped of [false, true]) {
  context.state = { upgrades: { swordmastery: skill }, gear: gear.normalizeState({ instances: { sword: { gearKey: "barracks_weapon_common_01", level } }, equipped: { barracks: { weapon: equipped ? "sword" : "" } } }) };
  const snapshot = context.createAttackCombatSnapshot(troops, context.state);
  context.activeCombatForecastPreview = snapshot;
  context.selectedTroopAmount = troops;
  context.updateTroopOrderPower();
  assert(element.innerHTML.includes(`<strong>${context.formatMarchesNumber(snapshot.launchAttackPower)}</strong>`), "Displayed total differs from the server launch snapshot");
  assert.equal(element.innerHTML.includes("Equipped · Level"), equipped, "Stored weapons must not be presented as equipped");
  assert(!element.innerHTML.includes("casualty"), "Recovery does not add attack power");
  vectors++;
}
context.activeCombatForecastPreview = { ...context.activeCombatForecastPreview, attackStrengthPercent: 0.25 };
context.updateTroopOrderPower();
assert(element.innerHTML.includes("Forecast bonus · +0.25%"), "A stale local item cannot label a different authoritative bonus");
context.activeCombatForecastPreview = null;
context.getSkillPercent = () => 40;
context.getSkillLevel = () => 20;
context.getAttackPower = () => 1.75;
context.updateTroopOrderPower();
assert(element.innerHTML.includes("ESTIMATE"), "Local fallback must disclose its provenance");
const update = functionSource(game, "updateTroopSliderModal");
assert(update.indexOf("updateTroopOrderPower()") < update.indexOf("if (!isOrderRouteReady(route))"), "Own power must render without enemy intelligence or a ready route");
assert(game.includes("decorateTroopOrderView(source, target, orderKind, commandLabel)"));
assert(game.includes('addEventListener("click", confirmTroopSliderOrder)'), "Existing authoritative launch handler must remain bound");
console.log(`Military UI: ${vectors} rendered attack totals match server launch snapshots; stored gear, stale item metadata and local fallback disclosure pass.`);
