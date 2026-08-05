const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "game.js");
const serverPath = path.join(root, "functions", "index.js");
const gameSource = fs.readFileSync(gamePath, "utf8");
const serverSource = fs.readFileSync(serverPath, "utf8");
const firebaseSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const howToSource = fs.readFileSync(path.join(root, "how-to-play.html"), "utf8");
const gameRulesSource = fs.readFileSync(path.join(root, "game-rules.html"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const workerSource = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const releaseSource = fs.readFileSync(path.join(root, "release-config.js"), "utf8");
const functionsRelease = JSON.parse(fs.readFileSync(path.join(root, "functions", "release-config.json"), "utf8"));
const economyConfig = JSON.parse(fs.readFileSync(path.join(root, "functions", "economy-config.json"), "utf8"));

const SKILL_ORDER = [
  "swordmastery",
  "stoneworks",
  "taxStewardship",
  "royalGranaries",
  "guildCharters",
  "marchOrders",
  "fieldMedics",
];
const SKILL_PRESET_SLOTS = Object.freeze([
  { slot: 1, unlockLevel: 50 },
  { slot: 2, unlockLevel: 75 },
  { slot: 3, unlockLevel: 100 },
]);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.ok(bodyStart >= 0, `Missing ${name} body.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const maxLevels = Object.fromEntries(SKILL_ORDER.map(skill => {
  const config = economyConfig.skills[skill];
  return [skill, Math.ceil(Number(config.maxPercent) / Number(config.percentPerLevel))];
}));
const context = {
  Math,
  Number,
  String,
  SKILL_ORDER,
  SKILL_PRESET_MODEL_VERSION: 2,
  SKILL_PRESET_NAME_MAX_LENGTH: 24,
  SKILL_PRESET_SLOTS,
  normalizeTimestampMs: value => Math.max(0, Math.floor(Number(value) || 0)),
  getSkillMaxLevel: skill => maxLevels[skill] || 0,
  getEarnedSkillPoints: character => Math.max(0, Math.floor(Number(character?.level) || 1) - 1),
  state: { character: { level: 1 } },
};
vm.createContext(context);
vm.runInContext([
  extractFunction(gameSource, "normalizeSkillPresetName"),
  extractFunction(gameSource, "normalizeSkillPresetAllocation"),
  extractFunction(gameSource, "createDefaultSkillPresets"),
  extractFunction(gameSource, "normalizeSkillPresets"),
  extractFunction(gameSource, "replaceLocalSkillPresetSlot"),
  extractFunction(gameSource, "setActiveSkillPresetSlot"),
  extractFunction(gameSource, "skillPresetAllocationsMatch"),
  extractFunction(gameSource, "isValidLocalSkillPresetAllocation"),
].join("\n"), context, { filename: gamePath });

const defaults = context.createDefaultSkillPresets();
assert.deepEqual(Array.from(defaults.slots, slot => slot.unlockLevel), [50, 75, 100]);
assert.deepEqual(Array.from(defaults.slots, slot => slot.name), ["Preset 1", "Preset 2", "Preset 3"]);
assert.ok(defaults.slots.every(slot => !slot.saved && slot.upgrades === null));
assert.equal(defaults.activeSlot, 0);
assert.equal(context.normalizeSkillPresetName("  War   Build  ", 1), "War Build");
assert.equal([...context.normalizeSkillPresetName("1234567890123456789012345", 1)].length, 24);

const partial = Object.fromEntries(SKILL_ORDER.map(skill => [skill, 0]));
partial.swordmastery = 12;
partial.stoneworks = 7;
assert.equal(context.isValidLocalSkillPresetAllocation(partial, { level: 50 }), true);
assert.equal(context.isValidLocalSkillPresetAllocation({ ...partial, swordmastery: maxLevels.swordmastery + 1 }, { level: 100 }), false);
assert.equal(context.isValidLocalSkillPresetAllocation(Object.fromEntries(SKILL_ORDER.map(skill => [skill, 25])), { level: 100 }), false);
assert.equal(context.skillPresetAllocationsMatch(partial, { ...partial }), true);
assert.equal(context.skillPresetAllocationsMatch(partial, { ...partial, stoneworks: 8 }), false);
const saved = context.replaceLocalSkillPresetSlot(defaults, {
  slot: 1,
  name: "War Build",
  saved: true,
  upgrades: partial,
  savedAtMs: 1234,
});
assert.equal(saved.slots[0].spentPoints, 19);
assert.equal(context.getEarnedSkillPoints({ level: 60 }) - saved.slots[0].spentPoints, 40, "Later-earned points were not left unspent.");
const duplicateSaved = context.replaceLocalSkillPresetSlot(saved, {
  slot: 2,
  name: "Duplicate Build",
  saved: true,
  upgrades: partial,
  savedAtMs: 2345,
});
const firstActive = context.setActiveSkillPresetSlot(duplicateSaved, 1);
const secondActive = context.setActiveSkillPresetSlot(firstActive, 2);
assert.equal(firstActive.activeSlot, 1);
assert.equal(secondActive.activeSlot, 2);
assert.equal(secondActive.slots.filter(slot => slot.slot === secondActive.activeSlot).length, 1, "More than one preset can be active.");
assert.equal(context.setActiveSkillPresetSlot(secondActive, 0).activeSlot, 0, "Manual skill changes cannot clear the active preset.");

const focusedPresetInput = {};
const focusContext = {
  Boolean,
  skillsView: { querySelector: selector => selector === "#skillPresetNameInput" ? focusedPresetInput : null },
  document: { activeElement: focusedPresetInput },
};
vm.createContext(focusContext);
vm.runInContext(extractFunction(gameSource, "isSkillPresetNameEditorActive"), focusContext, { filename: gamePath });
assert.equal(focusContext.isSkillPresetNameEditorActive(), true, "A focused preset name editor was not detected.");
focusContext.document.activeElement = {};
assert.equal(focusContext.isSkillPresetNameEditorActive(), false, "Preset rendering stayed blocked after the editor lost focus.");

assert.match(serverSource, /const SKILL_PRESET_SLOTS = Object\.freeze\(\[[\s\S]*?slot: 1, unlockLevel: 50[\s\S]*?slot: 2, unlockLevel: 75[\s\S]*?slot: 3, unlockLevel: 100[\s\S]*?\]\);/);
assert.match(serverSource, /createFreshResetPlayerProfile[\s\S]*?skillPresets: normalizeSkillPresets\(\)/, "New profiles do not receive default preset slots.");
assert.match(extractFunction(serverSource, "createEconomyResponse"), /skillPresets: normalizeSkillPresets\(/, "Economy snapshots omit presets.");

const saveStart = serverSource.indexOf("exports.saveSkillPreset");
const renameStart = serverSource.indexOf("exports.renameSkillPreset");
const applyStart = serverSource.indexOf("exports.applySkillPreset");
const applyEnd = serverSource.indexOf("exports.syncPlayerIdentity", applyStart);
assert.ok(saveStart > 0 && renameStart > saveStart && applyStart > renameStart && applyEnd > applyStart, "Missing preset callables.");
const saveCallable = serverSource.slice(saveStart, renameStart);
const renameCallable = serverSource.slice(renameStart, applyStart);
const applyCallable = serverSource.slice(applyStart, applyEnd);
assert.match(saveCallable, /requireUnlockedSkillPresetSlot[\s\S]*?normalizeSkillUpgrades\(profile\.upgrades\)[\s\S]*?goldCharged: 0/, "Saving is not a free authoritative snapshot.");
assert.match(saveCallable, /setActiveSkillPresetSlot\(replaceSkillPresetSlot[\s\S]*?definition\.slot\)/, "Saving does not make the saved tab the sole active preset.");
assert.match(renameCallable, /requireSkillPresetName[\s\S]*?goldCharged: 0/, "Renaming is not validated and free.");
assert.match(applyCallable, /prepareEconomyCollection[\s\S]*?isValidSkillPresetAllocation[\s\S]*?const resetCost = changed \? SKILL_RESET_COST : 0/, "Applying does not settle first, validate, and waive the active-build charge.");
assert.match(applyCallable, /if \(economy\.gold < resetCost\)[\s\S]*?writePreparedEconomy\([\s\S]*?upgrades,[\s\S]*?skillPresets,[\s\S]*?gold/, "Applying is not an atomic gold/allocation write.");
assert.match(applyCallable, /setActiveSkillPresetSlot\(currentPresets, definition\.slot\)/, "Applying does not record one authoritative active preset.");
assert.match(applyCallable, /remainingSkillPoints: character\.skillPoints/, "Apply metadata omits remaining points.");

const spendStart = serverSource.indexOf("exports.spendSkillPoint");
const resetStart = serverSource.indexOf("exports.resetSkills", spendStart);
assert.match(serverSource.slice(spendStart, resetStart), /setActiveSkillPresetSlot\(economy\.profileAfter\.skillPresets, 0\)/, "Spending a point does not clear the active preset.");
assert.doesNotMatch(serverSource.slice(spendStart, resetStart), /replaceSkillPresetSlot/, "Spending a point overwrites a saved preset.");
assert.match(serverSource.slice(resetStart, saveStart), /spentPoints > 0[\s\S]*?setActiveSkillPresetSlot\(economy\.profileAfter\.skillPresets, 0\)/, "Reset Skills does not clear the active preset.");
assert.doesNotMatch(serverSource.slice(resetStart, saveStart), /replaceSkillPresetSlot/, "Reset Skills overwrites a saved preset.");

for (const endpoint of ["saveSkillPreset", "renameSkillPreset", "applySkillPreset"]) {
  assert.match(firebaseSource, new RegExp(`async function ${endpoint}\\([\\s\\S]*?callServerFunction\\("${endpoint}"`), `Missing ${endpoint} client wrapper.`);
  assert.match(firebaseSource, new RegExp(`window\\.CrownlandsOnline = \\{[\\s\\S]*?${endpoint},`), `${endpoint} is not exported to the game.`);
}
assert.match(firebaseSource, /delete cleanProfile\.skillPresets;/, "Cloud-profile saves can overwrite server presets.");
assert.match(rulesSource, /validPlayerProfileCreate[\s\S]*?'skillPresets'/, "Creation rules do not protect presets.");
assert.match(rulesSource, /validPlayerProfileUpdate[\s\S]*?profileFieldUnchanged\('skillPresets'\)/, "Update rules do not protect presets.");

assert.match(gameSource, /renderSkillPresetPanel[\s\S]*?skill-preset-tabs[\s\S]*?Save Current Build[\s\S]*?data-apply-skill-preset/, "Skills UI does not include all preset controls.");
assert.match(extractFunction(gameSource, "renderSkillPresetPanel"), /presets\.activeSlot === selected\.slot[\s\S]*?presets\.activeSlot === slot\.slot/, "The UI does not limit the active marker to one explicit preset slot.");
assert.match(extractFunction(gameSource, "renderProfileSkills"), /isSkillPresetNameEditorActive\(\)[\s\S]*?return;/, "Periodic profile refreshes can replace the focused preset name input and dismiss the mobile keyboard.");
assert.match(extractFunction(gameSource, "bindSkillPresetControls"), /event\.currentTarget\.blur\(\)[\s\S]*?renameSkillPreset/, "Submitting a preset rename with Enter does not intentionally release the keyboard before refreshing.");
assert.match(gameSource, /confirmSkillPresetAction[\s\S]*?Overwrite[\s\S]*?costs <strong>/, "Preset overwrite/apply confirmations are incomplete.");
assert.match(gameSource, /applySavedSkillPreset[\s\S]*?usesServerEconomyAuthority[\s\S]*?api\.applySkillPreset[\s\S]*?state\.gold =/, "Local and server-authoritative application paths are not both present.");
assert.match(stylesSource, /\.skill-preset-tabs[\s\S]*?grid-template-columns: repeat\(3,[\s\S]*?@media \(max-width: 640px\)[\s\S]*?\.skill-preset-allocation[\s\S]*?repeat\(2,/, "Preset tabs are not responsive on mobile.");

assert.match(howToSource, /preset tabs unlock at Hero Levels 50, 75, and 100[\s\S]*?1,000,000 gold/i);
assert.match(gameRulesSource, /Private preset slots unlock at Hero Levels 50, 75, and 100[\s\S]*?never overwrites a preset automatically/i);
const expectedBuild = "20260804-combat-forecast-v1";
const expectedRelease = "crownlands-2026-08-02-single-active-skill-preset-v1";
assert.ok(indexSource.includes(expectedBuild) && workerSource.includes(expectedBuild), "Frontend and service-worker builds do not match.");
assert.ok(releaseSource.includes(expectedRelease) && functionsRelease.releaseId === expectedRelease, "Frontend and Functions realm releases do not match.");
assert.equal(Number(economyConfig.playerCosts.skillResetGold), 1_000_000, "Preset switching is not using the configured 1,000,000-gold reset cost.");

console.log("Validated three private skill presets, one authoritative active slot, exact allocations, atomic charging, mobile UI, rules, and release IDs.");
