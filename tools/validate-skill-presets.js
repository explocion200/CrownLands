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
  "shieldwallDiscipline",
  "stoneworks",
  "taxStewardship",
  "royalGranaries",
  "guildCharters",
  "marchOrders",
  "fieldMedics",
];
const SKILL_PRESET_SLOTS = Object.freeze([
  { slot: 1, unlockLevel: 25 },
  { slot: 2, unlockLevel: 50 },
  { slot: 3, unlockLevel: 75 },
  { slot: 4, unlockLevel: 100 },
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
  SKILL_PRESET_MODEL_VERSION: 4,
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
assert.deepEqual(Array.from(defaults.slots, slot => slot.unlockLevel), [25, 50, 75, 100]);
assert.deepEqual(Array.from(defaults.slots, slot => slot.name), ["Preset 1", "Preset 2", "Preset 3", "Preset 4"]);
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
const upgradedV3 = context.normalizeSkillPresets({
  modelVersion: 3,
  activeSlot: secondActive.activeSlot,
  slots: secondActive.slots.slice(0, 3),
});
assert.equal(upgradedV3.modelVersion, 4);
assert.equal(upgradedV3.slots.length, 4);
assert.equal(upgradedV3.slots[0].name, "War Build");
assert.equal(upgradedV3.slots[1].name, "Duplicate Build");
assert.equal(upgradedV3.slots[3].saved, false);
assert.equal(upgradedV3.activeSlot, 2);

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

assert.match(serverSource, /const SKILL_PRESET_SLOTS = Object\.freeze\(\[[\s\S]*?slot: 1, unlockLevel: 25[\s\S]*?slot: 2, unlockLevel: 50[\s\S]*?slot: 3, unlockLevel: 75[\s\S]*?slot: 4, unlockLevel: 100[\s\S]*?\]\);/);
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
assert.match(applyCallable, /prepareEconomyCollection[\s\S]*?isValidSkillPresetAllocation[\s\S]*?if \(economy\.gold < SKILL_PRESET_APPLY_COST\)[\s\S]*?gold = Math\.max\(0, economy\.gold - SKILL_PRESET_APPLY_COST\)/, "Applying does not always enforce the dedicated preset price.");
assert.match(applyCallable, /writePreparedEconomy\([\s\S]*?upgrades,[\s\S]*?skillPresets,[\s\S]*?gold/, "Applying is not an atomic gold/allocation write.");
assert.doesNotMatch(applyCallable, /freeResetConsumed = changed|freeSkillResetCreditsAfter/, "Preset application can consume a legacy Reset Skills credit.");
assert.match(applyCallable, /goldCharged: SKILL_PRESET_APPLY_COST[\s\S]*?freeResetConsumed: false/, "Apply metadata does not report the unconditional gold charge.");
assert.match(applyCallable, /setActiveSkillPresetSlot\(currentPresets, definition\.slot\)/, "Applying does not record one authoritative active preset.");
assert.match(applyCallable, /remainingSkillPoints: character\.skillPoints/, "Apply metadata omits remaining points.");

const spendStart = serverSource.indexOf("exports.spendSkillPoint");
const resetStart = serverSource.indexOf("exports.resetSkills", spendStart);
assert.match(serverSource.slice(spendStart, resetStart), /setActiveSkillPresetSlot\(economy\.profileAfter\.skillPresets, 0\)/, "Spending a point does not clear the active preset.");
assert.doesNotMatch(serverSource.slice(spendStart, resetStart), /replaceSkillPresetSlot/, "Spending a point overwrites a saved preset.");
assert.match(serverSource.slice(resetStart, saveStart), /spentPoints > 0[\s\S]*?setActiveSkillPresetSlot\(economy\.profileAfter\.skillPresets, 0\)/, "Reset Skills does not clear the active preset.");
assert.match(serverSource.slice(resetStart, saveStart), /freeResetConsumed = spentPoints > 0 && freeSkillResetCredits > 0[\s\S]*?freeSkillResetCreditsAfter/, "Reset Skills does not consume the legacy credit atomically.");
assert.doesNotMatch(serverSource.slice(resetStart, saveStart), /replaceSkillPresetSlot/, "Reset Skills overwrites a saved preset.");

for (const endpoint of ["saveSkillPreset", "renameSkillPreset", "applySkillPreset"]) {
  assert.match(firebaseSource, new RegExp(`async function ${endpoint}\\([\\s\\S]*?callServerFunction\\("${endpoint}"`), `Missing ${endpoint} client wrapper.`);
  assert.match(firebaseSource, new RegExp(`window\\.CrownlandsOnline = \\{[\\s\\S]*?${endpoint},`), `${endpoint} is not exported to the game.`);
}
assert.match(firebaseSource, /delete cleanProfile\.skillPresets;/, "Cloud-profile saves can overwrite server presets.");
assert.match(firebaseSource, /delete cleanProfile\.freeSkillResetGrantVersion;[\s\S]*?delete cleanProfile\.freeSkillResetCredits;/, "Cloud-profile saves can overwrite server reset credits.");
assert.match(rulesSource, /validPlayerProfileCreate[\s\S]*?'skillPresets'/, "Creation rules do not protect presets.");
assert.match(rulesSource, /validPlayerProfileUpdate[\s\S]*?profileFieldUnchanged\('skillPresets'\)/, "Update rules do not protect presets.");
assert.match(rulesSource, /validPlayerProfileUpdate[\s\S]*?profileFieldUnchanged\('freeSkillResetGrantVersion'\)[\s\S]*?profileFieldUnchanged\('freeSkillResetCredits'\)/, "Update rules do not protect legacy reset credits.");

assert.match(gameSource, /renderSkillPresetPanel[\s\S]*?skill-preset-tabs[\s\S]*?Save Current Build[\s\S]*?data-apply-skill-preset/, "Skills UI does not include all preset controls.");
assert.match(extractFunction(gameSource, "renderSkillPresetPanel"), /presets\.activeSlot === selected\.slot[\s\S]*?presets\.activeSlot === slot\.slot/, "The UI does not limit the active marker to one explicit preset slot.");
assert.doesNotMatch(extractFunction(gameSource, "renderSkillPresetPanel"), /!valid \|\| active/, "The active preset cannot be deliberately applied for the configured price.");
assert.match(extractFunction(gameSource, "renderSkillPresetPanel"), /Applying costs[\s\S]*?SKILL_PRESET_APPLY_COST[\s\S]*?Apply · \$\{formatNumber\(SKILL_PRESET_APPLY_COST\)\}/, "The preset panel does not show the unconditional price.");
assert.match(extractFunction(gameSource, "renderProfileSkills"), /isSkillPresetNameEditorActive\(\)[\s\S]*?return;/, "Periodic profile refreshes can replace the focused preset name input and dismiss the mobile keyboard.");
assert.match(extractFunction(gameSource, "bindSkillPresetControls"), /event\.currentTarget\.blur\(\)[\s\S]*?renameSkillPreset/, "Submitting a preset rename with Enter does not intentionally release the keyboard before refreshing.");
assert.match(extractFunction(gameSource, "confirmSkillPresetAction"), /Overwrite[\s\S]*?Every preset application costs[\s\S]*?including an active or identical build/, "Preset confirmation does not explain unconditional charging.");
assert.match(gameSource, /applySavedSkillPreset[\s\S]*?usesServerEconomyAuthority[\s\S]*?api\.applySkillPreset[\s\S]*?state\.gold =/, "Local and server-authoritative application paths are not both present.");
assert.doesNotMatch(extractFunction(gameSource, "applySavedSkillPreset"), /already active|freeResetAvailable|allocationChanges/, "The client can bypass the unconditional preset price.");
assert.match(extractFunction(gameSource, "applySavedSkillPreset"), /if \(!state \|\| skillActionInFlight\) return false;[\s\S]*?skillActionInFlight = true/, "The client does not suppress rapid duplicate Apply actions.");
assert.match(gameSource, /const SKILL_GROUPS = Object\.freeze\([\s\S]*?Attack[\s\S]*?swordmastery[\s\S]*?marchOrders[\s\S]*?fieldMedics[\s\S]*?Defense[\s\S]*?shieldwallDiscipline[\s\S]*?stoneworks[\s\S]*?Utility[\s\S]*?taxStewardship[\s\S]*?royalGranaries[\s\S]*?guildCharters/, "Skills are not grouped into the approved roles.");
assert.match(stylesSource, /\.skill-preset-tabs[\s\S]*?grid-template-columns: repeat\(4,[\s\S]*?@media \(max-width: 640px\)[\s\S]*?\.skill-preset-tabs \{ grid-template-columns: repeat\(2,/, "Four preset tabs are not responsive as a mobile 2x2 grid.");
assert.match(gameSource, /renderSkillPresetAllocation[\s\S]*?SKILL_GROUPS\.map[\s\S]*?skill-preset-allocation-group/, "Saved allocations are not grouped by role.");
assert.match(extractFunction(gameSource, "renderProfileSkills"), /SKILL_GROUPS\.map[\s\S]*?profile-skill-group/, "The current skill list is not grouped by role.");

assert.match(howToSource, /preset tabs unlock at Hero Levels 25, 50, 75, and 100[\s\S]*?Every confirmed[\s\S]*?1,000,000 gold/i);
assert.match(gameRulesSource, /preset slots unlock at Hero Levels 25, 50, 75, and 100[\s\S]*?Every confirmed Apply costs 1,000,000 gold[\s\S]*?never overwrites a preset automatically/i);
const expectedBuild = "20260810-daily-mission-camp-fix-v1";
const expectedRelease = "crownlands-2026-08-02-single-active-skill-preset-v1";
assert.ok(indexSource.includes(expectedBuild) && workerSource.includes(expectedBuild), "Frontend and service-worker builds do not match.");
assert.ok(releaseSource.includes(expectedRelease) && functionsRelease.releaseId === expectedRelease, "Frontend and Functions realm releases do not match.");
assert.equal(Number(economyConfig.playerCosts.skillResetGold), 1_000_000, "Reset Skills is not using the configured 1,000,000-gold cost.");
assert.equal(Number(economyConfig.playerCosts.skillPresetApplyGold), 1_000_000, "Preset Apply is not using its dedicated 1,000,000-gold cost.");

console.log("Validated four private v4 skill presets, role grouping, unconditional paid application, legacy-credit isolation, mobile UI, rules, and release IDs.");
