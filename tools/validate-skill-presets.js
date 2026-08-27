const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "game.js");
const serverPath = path.join(root, "functions", "index.js");
const gameSource = `${fs.readFileSync(path.join(root, "instant-economy-actions.js"), "utf8")}\n${fs.readFileSync(gamePath, "utf8")}`;
const serverSource = fs.readFileSync(serverPath, "utf8");
const firebaseSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const stylesSource = ["styles.css", "interface-theme.css", "crownlands-palette.css"]
  .map(file => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
const howToSource = fs.readFileSync(path.join(root, "how-to-play.html"), "utf8");
const gameRulesSource = fs.readFileSync(path.join(root, "game-rules.html"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const workerSource = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const visualQaSource = fs.readFileSync(path.join(root, "docs", "visual-qa", "skill-preset-draft-editor", "index.html"), "utf8");
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
  SKILL_FINAL_DOUBLE_COST_LEVELS: 5,
  SKILL_STANDARD_POINT_COST: 1,
  SKILL_FINAL_POINT_COST: 2,
  SKILL_PRESET_MODEL_VERSION: 5,
  SKILL_PRESET_NAME_MAX_LENGTH: 24,
  SKILL_PRESET_SLOTS,
  normalizeTimestampMs: value => Math.max(0, Math.floor(Number(value) || 0)),
  getSkillMaxLevel: skill => maxLevels[skill] || 0,
  normalizeSkillUpgradeLevel: (skill, value) => Math.min(
    Math.max(0, Math.floor(Number(value) || 0)),
    maxLevels[skill] || 0
  ),
  normalizeUpgrades: upgrades => Object.fromEntries(SKILL_ORDER.map(skill => [
    skill,
    Math.min(Math.max(0, Math.floor(Number(upgrades?.[skill]) || 0)), maxLevels[skill] || 0),
  ])),
  getEarnedSkillPoints: character => Math.max(0, Math.floor(Number(character?.level) || 1) - 1),
  state: { character: { level: 1 } },
};
vm.createContext(context);
vm.runInContext([
  extractFunction(gameSource, "getSkillPointCost"),
  extractFunction(gameSource, "getSkillUpgradePointCost"),
  extractFunction(gameSource, "getSpentSkillPoints"),
  extractFunction(gameSource, "createDefaultSkills"),
  extractFunction(gameSource, "normalizeSkillPresetName"),
  extractFunction(gameSource, "normalizeSkillPresetAllocation"),
  extractFunction(gameSource, "createDefaultSkillPresets"),
  extractFunction(gameSource, "normalizeSkillPresets"),
  extractFunction(gameSource, "replaceLocalSkillPresetSlot"),
  extractFunction(gameSource, "setActiveSkillPresetSlot"),
  extractFunction(gameSource, "skillPresetAllocationsMatch"),
  extractFunction(gameSource, "isValidLocalSkillPresetAllocation"),
  extractFunction(gameSource, "getSkillPresetStoredSignature"),
  extractFunction(gameSource, "createSkillPresetDraft"),
  extractFunction(gameSource, "isSkillPresetDraftDirty"),
].join("\n"), context, { filename: gamePath });

for (const skill of SKILL_ORDER) {
  const maxLevel = maxLevels[skill];
  assert.equal(context.getSkillPointCost(skill, maxLevel - 6), 1, `${skill}'s pre-final-tier upgrade must cost 1 point.`);
  assert.equal(context.getSkillPointCost(skill, maxLevel - 5), 2, `${skill}'s final five upgrades must begin at a 2-point cost.`);
  assert.equal(context.getSkillPointCost(skill, maxLevel - 1), 2, `${skill}'s cap upgrade must cost 2 points.`);
  assert.equal(context.getSkillPointCost(skill, maxLevel), 0, `${skill} must have no cost after its cap.`);
  assert.equal(context.getSkillUpgradePointCost(skill, 0, maxLevel), maxLevel + 5, `${skill}'s complete point cost must include five extra points.`);
}

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
assert.equal(upgradedV3.modelVersion, 5);
assert.equal(upgradedV3.slots.length, 4);
assert.equal(upgradedV3.slots[0].name, "War Build");
assert.equal(upgradedV3.slots[1].name, "Duplicate Build");
assert.equal(upgradedV3.slots[3].saved, false);
assert.equal(upgradedV3.activeSlot, 2);
const emptyDraft = context.createSkillPresetDraft(defaults.slots[0]);
assert.equal(emptyDraft.name, "Preset 1");
assert.ok(SKILL_ORDER.every(skill => emptyDraft.upgrades[skill] === 0), "An empty preset draft did not start from zero.");
assert.equal(context.isSkillPresetDraftDirty(emptyDraft), false, "A new untouched preset draft started dirty.");
emptyDraft.upgrades.swordmastery = 1;
assert.equal(context.isSkillPresetDraftDirty(emptyDraft), true, "Adding a draft point did not mark the preset dirty.");
emptyDraft.upgrades.swordmastery = 0;
emptyDraft.name = "Border Guard";
assert.equal(context.isSkillPresetDraftDirty(emptyDraft), true, "Editing a draft name did not mark the preset dirty.");
const savedDraft = context.createSkillPresetDraft(saved.slots[0]);
assert.equal(context.isSkillPresetDraftDirty(savedDraft), false, "A saved preset did not open as a clean draft.");
assert.ok(SKILL_ORDER.every(skill => savedDraft.upgrades[skill] === partial[skill]), "A saved preset draft did not load its stored allocation.");

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
assert.match(serverSource, /const SKILL_POINT_SYSTEM_VERSION = 2;[\s\S]*?const SKILL_POINT_SYSTEM_RESET_ID = "skill-point-system-v2";/, "The versioned skill reset marker is missing.");
assert.match(extractFunction(serverSource, "createSkillPointSystemReset"), /needsSkillPointSystemReset[\s\S]*?character\.skillPoints = getEarnedSkillPoints\(character\)[\s\S]*?skillPresets: normalizeSkillPresets\(\)[\s\S]*?freeSkillResetCredits: 0/, "The one-time reset does not refund derived points and clear presets.");
assert.doesNotMatch(extractFunction(serverSource, "normalizeSkillUpgrades"), /legacy|striker|prosperous|guardian|rusher|fearless|brave|source\.attack|source\.income/, "The current server normalizer can revive legacy skill fields.");
assert.doesNotMatch(extractFunction(gameSource, "normalizeUpgrades"), /oldAttack|oldIncome|striker|prosperous|guardian|rusher|fearless|brave/, "The client normalizer can revive legacy skill fields.");
assert.match(extractFunction(serverSource, "writePreparedEconomy"), /createSkillPointSystemBackup[\s\S]*?transaction\.update\(economy\.profileRef[\s\S]*?skillPointSystemVersion: SKILL_POINT_SYSTEM_VERSION/, "The reset is not backed up or does not replace the authoritative skill maps.");
assert.match(serverSource, /exports\.syncSkillPointSystem[\s\S]*?migrateSkillPointSystemForPlayer/, "Players cannot trigger the idempotent reset during sign-in.");
assert.match(serverSource, /exports\.resetAllPlayerSkills[\s\S]*?dryRun[\s\S]*?SKILL_POINT_SYSTEM_RESET_ID[\s\S]*?migrateSkillPointSystemForPlayer/, "The paged admin reset or its dry-run confirmation is missing.");
assert.match(serverSource, /exports\.rollbackPlayerSkillPointSystem[\s\S]*?skillPointSystemBackupRef[\s\S]*?writePreparedEconomy/, "The per-player rollback path is missing.");

const saveStart = serverSource.indexOf("exports.saveSkillPreset");
const renameStart = serverSource.indexOf("exports.renameSkillPreset");
const applyStart = serverSource.indexOf("exports.applySkillPreset");
const applyEnd = serverSource.indexOf("exports.syncPlayerIdentity", applyStart);
assert.ok(saveStart > 0 && renameStart > saveStart && applyStart > renameStart && applyEnd > applyStart, "Missing preset callables.");
const saveCallable = serverSource.slice(saveStart, renameStart);
const renameCallable = serverSource.slice(renameStart, applyStart);
const applyCallable = serverSource.slice(applyStart, applyEnd);
assert.match(saveCallable, /requireUnlockedSkillPresetSlot[\s\S]*?hasRequestedAllocation[\s\S]*?isValidSkillPresetAllocation[\s\S]*?normalizeSkillPresetAllocation[\s\S]*?: normalizeSkillUpgrades\(profile\.upgrades\)/, "Saving does not validate a complete draft while retaining slot-only compatibility.");
assert.match(saveCallable, /hasRequestedName[\s\S]*?requireSkillPresetSaveName[\s\S]*?replaceSkillPresetSlot\(currentPresets[\s\S]*?goldCharged: 0/, "Saving does not atomically persist the draft name and allocation for free.");
assert.doesNotMatch(saveCallable, /setActiveSkillPresetSlot/, "Saving a preset can change the active preset identity.");
assert.match(renameCallable, /requireSkillPresetName[\s\S]*?goldCharged: 0/, "Renaming is not validated and free.");
assert.match(applyCallable, /prepareEconomyCollection[\s\S]*?isValidSkillPresetAllocation[\s\S]*?if \(economy\.gold < SKILL_PRESET_APPLY_COST\)[\s\S]*?gold = Math\.max\(0, economy\.gold - SKILL_PRESET_APPLY_COST\)/, "Applying does not always enforce the dedicated preset price.");
assert.match(applyCallable, /writePreparedEconomy\([\s\S]*?upgrades,[\s\S]*?skillPresets,[\s\S]*?gold/, "Applying is not an atomic gold/allocation write.");
assert.doesNotMatch(applyCallable, /freeResetConsumed = changed|freeSkillResetCreditsAfter/, "Preset application can consume a legacy Reset Skills credit.");
assert.match(applyCallable, /goldCharged: SKILL_PRESET_APPLY_COST[\s\S]*?freeResetConsumed: false/, "Apply metadata does not report the unconditional gold charge.");
assert.match(applyCallable, /setActiveSkillPresetSlot\(currentPresets, definition\.slot\)/, "Applying does not record one authoritative active preset.");
assert.match(applyCallable, /remainingSkillPoints: character\.skillPoints/, "Apply metadata omits remaining points.");

const spendStart = serverSource.indexOf("exports.spendSkillPoint");
const resetStart = serverSource.indexOf("exports.resetSkills", spendStart);
const adjustStart = serverSource.indexOf("exports.adjustSkillLevels");
const adjustEnd = serverSource.indexOf("async function spendSkillAllocations", adjustStart);
assert.ok(adjustStart > 0 && adjustEnd > adjustStart, "Missing signed skill adjustment callable.");
const adjustCallable = serverSource.slice(adjustStart, adjustEnd);
assert.match(adjustCallable, /requestId[\s\S]*?normalizeSkillLevelAdjustments[\s\S]*?requestSignature[\s\S]*?skillLevelAdjustmentRequestRef/, "Signed skill adjustments are not request-ID-backed.");
assert.match(adjustCallable, /transaction\.get\(requestRef\)[\s\S]*?replayed: true[\s\S]*?prepareEconomyCollection/, "Signed skill adjustments are not replay safe.");
assert.match(adjustCallable, /levelDelta[\s\S]*?getSkillUpgradePointCost[\s\S]*?getSkillDowngradePointRefund[\s\S]*?getSpentSkillPoints\(nextUpgrades\) > getEarnedSkillPoints/, "Signed adjustments do not enforce weighted spend, refund, and complete-allocation limits.");
assert.match(adjustCallable, /setActiveSkillPresetSlot\(economy\.profileAfter\.skillPresets, 0\)[\s\S]*?spentSkillPoints[\s\S]*?refundedSkillPoints[\s\S]*?transaction\.set\(requestRef/, "Signed adjustments do not clear the active marker or store their authoritative receipt.");
const spendHelper = extractFunction(serverSource, "spendSkillAllocations");
assert.match(spendHelper, /prepareEconomyCollection[\s\S]*?setActiveSkillPresetSlot\(economy\.profileAfter\.skillPresets, 0\)[\s\S]*?writePreparedEconomy/, "Skill spending does not settle production and clear the active preset atomically.");
assert.match(spendHelper, /getSkillUpgradePointCost[\s\S]*?totalPointCost[\s\S]*?character\.skillPoints < totalPointCost/, "Server skill spending does not enforce the final-tier point cost.");
assert.doesNotMatch(spendHelper, /replaceSkillPresetSlot/, "Spending points overwrites a saved preset.");
assert.match(serverSource.slice(spendStart, resetStart), /exports\.spendSkillPoints[\s\S]*?normalizeSkillSpendAllocations[\s\S]*?spendSkillAllocations/, "The batched skill callable is missing its shared authoritative path.");
assert.match(serverSource.slice(resetStart, saveStart), /spentPoints > 0[\s\S]*?setActiveSkillPresetSlot\(economy\.profileAfter\.skillPresets, 0\)/, "Reset Skills does not clear the active preset.");
assert.match(serverSource.slice(resetStart, saveStart), /freeResetConsumed = false[\s\S]*?resetCost = 0[\s\S]*?freeSkillResetCreditsAfter = freeSkillResetCredits/, "Reset Skills is not free or can still consume a legacy credit.");
assert.doesNotMatch(serverSource.slice(resetStart, saveStart), /economy\.gold - resetCost|economy\.gold < resetCost/, "Reset Skills can still charge Gold.");
assert.doesNotMatch(serverSource.slice(resetStart, saveStart), /replaceSkillPresetSlot/, "Reset Skills overwrites a saved preset.");

for (const endpoint of ["saveSkillPreset", "renameSkillPreset", "applySkillPreset"]) {
  assert.match(firebaseSource, new RegExp(`async function ${endpoint}\\([\\s\\S]*?callServerFunction\\("${endpoint}"`), `Missing ${endpoint} client wrapper.`);
  assert.match(firebaseSource, new RegExp(`window\\.CrownlandsOnline = \\{[\\s\\S]*?${endpoint},`), `${endpoint} is not exported to the game.`);
}
assert.match(firebaseSource, /async function spendSkillPoints\([\s\S]*?callServerFunction\("spendSkillPoints"/, "Missing batched skill client wrapper.");
assert.match(firebaseSource, /window\.CrownlandsOnline = \{[\s\S]*?spendSkillPoint,[\s\S]*?spendSkillPoints,/, "The batched skill wrapper is not exported to the game.");
assert.match(firebaseSource, /async function adjustSkillLevels\([\s\S]*?callServerFunction\("adjustSkillLevels"/, "Missing signed skill adjustment client wrapper.");
assert.match(firebaseSource, /window\.CrownlandsOnline = \{[\s\S]*?adjustSkillLevels,/, "The signed skill adjustment wrapper is not exported to the game.");
assert.match(
  rulesSource,
  /match \/skillLevelAdjustmentRequests\/\{document=\*\*\} \{\s*allow read, create, update, delete: if false;/,
  "Skill adjustment receipts must remain server-only."
);
assert.match(firebaseSource, /async function syncSkillPointSystem\([\s\S]*?callServerFunction\("syncSkillPointSystem"/, "Missing skill reset sync wrapper.");
assert.match(firebaseSource, /window\.CrownlandsOnline = \{[\s\S]*?syncSkillPointSystem,/, "The skill reset sync wrapper is not exported to the game.");
assert.match(firebaseSource, /delete cleanProfile\.skillPresets;/, "Cloud-profile saves can overwrite server presets.");
assert.match(firebaseSource, /delete cleanProfile\.skillPointSystemVersion;[\s\S]*?delete cleanProfile\.skillPointSystemResetAtMs;/, "Cloud-profile saves can overwrite the reset marker.");
assert.match(firebaseSource, /delete cleanProfile\.freeSkillResetGrantVersion;[\s\S]*?delete cleanProfile\.freeSkillResetCredits;/, "Cloud-profile saves can overwrite server reset credits.");
assert.match(rulesSource, /validPlayerProfileCreate[\s\S]*?'skillPresets'/, "Creation rules do not protect presets.");
assert.match(rulesSource, /validPlayerProfileCreate[\s\S]*?'skillPointSystemVersion'[\s\S]*?'skillPointSystemResetAtMs'/, "Creation rules do not protect the skill reset marker.");
const playerProfileUpdateRule = extractFunction(rulesSource, "validPlayerProfileUpdate");
assert.match(playerProfileUpdateRule, /affected\.hasOnly\(/, "Profile updates are not bounded by a changed-field allowlist.");
assert.doesNotMatch(playerProfileUpdateRule, /skillPresets|freeSkillResetGrantVersion|freeSkillResetCredits/, "Client profile updates can change presets or legacy reset credits.");

assert.match(gameSource, /renderSkillPresetPanel[\s\S]*?skill-preset-tabs[\s\S]*?Current Build[\s\S]*?Save Preset[\s\S]*?data-apply-skill-preset/, "Skills UI does not include the Current Build and preset draft controls.");
assert.match(extractFunction(gameSource, "renderSkillPresetPanel"), /data-skill-preset-slot="0"[\s\S]*?presets\.activeSlot === slot\.slot/, "The UI does not separate Current Build selection from the active preset identity.");
assert.doesNotMatch(extractFunction(gameSource, "renderSkillPresetPanel"), /!valid \|\| active/, "The active preset cannot be deliberately applied for the configured price.");
assert.match(extractFunction(gameSource, "renderSkillPresetPanel"), /Save these changes before applying[\s\S]*?Applying costs[\s\S]*?SKILL_PRESET_APPLY_COST[\s\S]*?Apply · \$\{formatNumber\(SKILL_PRESET_APPLY_COST\)\}/, "The preset panel does not distinguish dirty drafts from paid application.");
assert.match(extractFunction(gameSource, "renderProfileSkills"), /nextPresetSignature !== skillPresetMarkupSignature && !isSkillPresetNameEditorActive\(\)/, "Periodic profile refreshes can replace the focused preset name input and dismiss the mobile keyboard.");
assert.match(extractFunction(gameSource, "bindSkillPresetControls"), /data-skill-preset-slot[\s\S]*?requestSkillPresetDraftExit[\s\S]*?event\.target\.blur\(\)[\s\S]*?saveCurrentSkillPreset/, "Preset selection and keyboard submission do not protect or save dirty drafts.");
assert.match(extractFunction(gameSource, "confirmSkillPresetAction"), /Every preset application costs[\s\S]*?including an active or identical build[\s\S]*?Apply for/, "Preset confirmation does not explain unconditional charging.");
assert.match(extractFunction(gameSource, "saveCurrentSkillPreset"), /getSkillPresetDraft[\s\S]*?api\.saveSkillPreset\(\{ slot: slot\.slot, name, upgrades \}\)[\s\S]*?replaceLocalSkillPresetSlot/, "The client does not save the isolated draft through both authority paths.");
assert.doesNotMatch(extractFunction(gameSource, "saveCurrentSkillPreset"), /setActiveSkillPresetSlot|state\.upgrades\s*=/, "Saving a preset can activate it or change live skills.");
assert.match(gameSource, /applySavedSkillPreset[\s\S]*?usesServerEconomyAuthority[\s\S]*?api\.applySkillPreset[\s\S]*?state\.gold =/, "Local and server-authoritative application paths are not both present.");
assert.match(extractFunction(gameSource, "applySavedSkillPreset"), /isSkillPresetDraftDirty[\s\S]*?Save this preset before applying/, "Apply does not reject unsaved draft edits.");
assert.doesNotMatch(extractFunction(gameSource, "applySavedSkillPreset"), /already active|freeResetAvailable|allocationChanges/, "The client can bypass the unconditional preset price.");
assert.match(extractFunction(gameSource, "applySavedSkillPreset"), /if \(!state \|\| skillActionInFlight\) return false;[\s\S]*?skillActionInFlight = true/, "The client does not suppress rapid duplicate Apply actions.");
assert.match(gameSource, /const SKILL_GROUPS = Object\.freeze\([\s\S]*?Attack[\s\S]*?swordmastery[\s\S]*?marchOrders[\s\S]*?fieldMedics[\s\S]*?Defense[\s\S]*?shieldwallDiscipline[\s\S]*?stoneworks[\s\S]*?Utility[\s\S]*?taxStewardship[\s\S]*?royalGranaries[\s\S]*?guildCharters/, "Skills are not grouped into the approved roles.");
assert.match(stylesSource, /\.skill-preset-tabs[\s\S]*?grid-template-columns: repeat\(5,[\s\S]*?@media \(max-width: 640px\)[\s\S]*?\.skill-preset-tabs \{ grid-template-columns: repeat\(2,[\s\S]*?skill-current-build-tab/, "Current Build and four preset tabs are not responsive on mobile.");
assert.match(extractFunction(gameSource, "skillRow"), /data-skill-decrement[\s\S]*?data-skill-cost[\s\S]*?data-skill=/, "Skill rows do not expose the shared minus, cost, and plus control.");
assert.match(stylesSource, /\.skill-row-actions[\s\S]*?grid-template-columns: minmax\(44px, 1fr\) minmax\(58px, auto\) minmax\(44px, 1fr\)/, "The segmented skill control is not responsive.");
assert.match(stylesSource, /\.profile-skill-list \.skill-row button \{[^}]*min-height: 44px;/, "Preset point controls do not meet the mobile touch-target height.");
assert.match(visualQaSource, /display: grid !important[\s\S]*?skill-current-build-tab selected[\s\S]*?data-qa-applied-preset[\s\S]*?Free\. Returns 61 spent points\.[\s\S]*?data-skill-decrement[\s\S]*?data-skill-cost>2 PTS[\s\S]*?data-skill-cost>MAX[\s\S]*?skill-preset-exit-dialog[\s\S]*?view"\) === "active"[\s\S]*?classList\.add\("selected"\)/, "The responsive skill-control visual-QA fixture is incomplete.");
assert.match(extractFunction(gameSource, "adjustSkillPresetDraft"), /direction[\s\S]*?currentLevel - 1[\s\S]*?getSkillPointCost[\s\S]*?getAvailableSkillPoints[\s\S]*?currentLevel \+ 1/, "Draft point controls do not enforce refunds, caps, and weighted point costs locally.");
assert.match(gameSource, /skillPresetExitDialog\.addEventListener\("close"[\s\S]*?decision === "discard"[\s\S]*?decision === "save"/, "Dirty draft exits do not offer Save, Discard, and Cancel behavior.");
assert.match(gameSource, /renderSkillPresetAllocation[\s\S]*?SKILL_GROUPS\.map[\s\S]*?skill-preset-allocation-group/, "Saved allocations are not grouped by role.");
assert.match(extractFunction(gameSource, "renderProfileSkills"), /SKILL_GROUPS\.map[\s\S]*?profile-skill-group/, "The current skill list is not grouped by role.");
assert.match(extractFunction(gameSource, "flushSkillSpendQueue"), /pendingSkillSpendAllocations[\s\S]*?enqueueInstantEconomyAction/, "Queued skill spending is not routed through the shared instant-action queue.");
assert.match(extractFunction(gameSource, "executeInstantSkillSpend"), /adjustSkillLevelsWithSpendFallback[\s\S]*?renderCities: false[\s\S]*?renderProfile: false[\s\S]*?refundedSkillPoints/, "Signed skill settlement is not batched or is forcing broad renders.");
assert.doesNotMatch(extractFunction(gameSource, "buySkill"), /skillActionInFlight = true|renderAll\(/, "A skill-point click still blocks the full Skills UI or forces a full map render.");
assert.match(extractFunction(gameSource, "refundSkill"), /getDisplayedSkillLevel[\s\S]*?pendingSkillSpendAllocations\.set\(skill,[\s\S]*?- 1[\s\S]*?setActiveSkillPresetSlot/, "Current Build minus does not queue a free live refund and clear the active marker.");
assert.match(extractFunction(gameSource, "updateProfileSkillState"), /setTextIfChanged[\s\S]*?button\.disabled[\s\S]*?row\?\.classList\.toggle/, "Skill clicks are not patched into stable row nodes.");
assert.match(extractFunction(gameSource, "updateProfileSkillState"), /getSkillPointCost[\s\S]*?data-skill-cost[\s\S]*?points < nextPointCost[\s\S]*?"MAX"[\s\S]*?"PT" : "PTS"/, "Skills UI does not display and enforce the next upgrade's point cost.");
assert.match(extractFunction(gameSource, "buySkill"), /getSkillPointCost[\s\S]*?getDisplayedSkillPoints\(\) < pointCost[\s\S]*?state\.character\.skillPoints -= pointCost/, "Skill purchase paths do not spend the displayed tier cost.");
assert.doesNotMatch(gameSource, /Final \$\{SKILL_FINAL_DOUBLE_COST_LEVELS\} levels cost|profile-skill-cost-note/, "The removed final-tier explanatory UI text is still rendered.");
assert.match(stylesSource, /skill-preset-tabs button\.active:not\(\.locked\)[\s\S]*?var\(--cl-header-bg\)[\s\S]*?selected:not\(\.active\)[\s\S]*?var\(--cl-gold\)[\s\S]*?active\.selected[\s\S]*?0 0 0 2px/, "Applied, viewed, and combined preset states are not distinct in the final palette.");

assert.match(howToSource, /Current Build[\s\S]*?minus, cost, and plus[\s\S]*?freely refunds[\s\S]*?Reset Skills[\s\S]*?free clear-all[\s\S]*?1,000,000 gold/i);
assert.match(gameRulesSource, /Current Build changes live skills immediately[\s\S]*?minus, cost, and plus[\s\S]*?minus is free[\s\S]*?Reset Skills is also free[\s\S]*?1,000,000 gold/i);
const expectedBuild = "20260827-skill-controls-live-refunds-r1";
const expectedRelease = "crownlands-2026-09-monthly-sharded-realms-v1";
assert.ok(indexSource.includes(expectedBuild) && workerSource.includes(expectedBuild), "Frontend and service-worker builds do not match.");
assert.ok(releaseSource.includes(expectedRelease) && functionsRelease.releaseId === expectedRelease, "Frontend and Functions realm releases do not match.");
assert.equal(Number(economyConfig.playerCosts.skillResetGold), 0, "Reset Skills is not configured as free.");
assert.equal(Number(economyConfig.playerCosts.skillPresetApplyGold), 1_000_000, "Preset Apply is not using its dedicated 1,000,000-gold cost.");

console.log("Validated signed live skill refunds, free resets, weighted costs, shared controls, preset drafts, readable tab states, compatibility, and rules.");
