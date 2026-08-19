const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const palette = read("crownlands-palette.css");
const contrast = read("ui-contrast-correction.css");
const styles = read("styles.css");
const manuscript = read("manuscript-prototype.css");
const dailyRewards = read("daily-rewards.css");
const game = read("game.js");
const fixture = read("docs/visual-qa/targeted-ui-contrast/index.html");

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

const clanContext = ":is(.profile-screen .clan-content, .modal .modal-card)";
assert.ok(
  occurrences(contrast, `${clanContext} .clan-section-nav button[aria-selected="true"]`) >= 4,
  "The selected Clan tab's SVG, icon wrapper, label, and badge do not all own their contextual foreground.",
);
assert.match(
  contrast,
  /\.clan-section-nav button\[aria-selected="true"\] \.clan-section-nav-mark \.cl-icon\s*\{[\s\S]*?color:\s*inherit !important;[\s\S]*?fill:\s*currentColor !important;[\s\S]*?stroke:\s*currentColor !important;/,
  "Selected Clan SVG icons are not locked to the approved ivory foreground.",
);
for (const section of ["warroom", "rewards", "members"]) {
  assert.match(contrast, new RegExp(`button\\[data-clan-section="${section}"\\] > b`), `The ${section} badge lacks its semantic color rule.`);
}
assert.match(contrast, /\.clan-rallies-panel \.clan-social-heading > b\s*\{[\s\S]*?background:\s*#8f302f !important;/, "The War Room rally-count badge is not red.");
assert.ok(
  occurrences(contrast, `${clanContext} .clan-rallies-panel`) >= 3,
  "The War Room surface and typography do not outrank generic Profile text rules.",
);
assert.match(
  contrast,
  /:is\(\.profile-screen \.clan-content, \.modal \.modal-card\) \.clan-rally-card\s*\{[\s\S]*?color:\s*var\(--cl-dark-surface-text\)[\s\S]*?background:\s*rgba\(31, 30, 31, \.76\)/,
  "Future rally cards do not retain their dedicated readable dark-surface treatment.",
);

assert.match(
  palette,
  /\.modal \.modal-card :is\(\.daily-reward-card\.claimed, \.daily-mission-row\.complete, \.seasonal-achievement-row\.complete\)\s*:is\(strong, span, small, b, p\)/,
  "Completed-card descriptions do not inherit the readable success-state foreground.",
);
assert.doesNotMatch(
  `${styles}\n${manuscript}`,
  /\.daily-mission-row\.claimed\s*\{[^}]*opacity\s*:/,
  "Claimed Daily Quests still fade the entire row.",
);
assert.doesNotMatch(
  dailyRewards,
  /\.seasonal-achievement-row\.claimed\s*\{[^}]*opacity\s*:/,
  "Claimed Achievements still fade the entire row.",
);
assert.match(
  contrast,
  /\.seasonal-achievement-row:not\(\.complete\) \.seasonal-achievement-row-icon,[\s\S]*?color:\s*#ddd0ae !important;[\s\S]*?fill:\s*currentColor !important;/,
  "Unfinished Achievement icons do not retain their readable bone-on-iron foreground.",
);

const clanNavRenderer = game.slice(game.indexOf("function renderClanSectionNavigation"), game.indexOf("function renderClanBrowserNavigation"));
assert.equal(occurrences(clanNavRenderer, "<span>${section.label}</span>"), 1, "Clan tab labels are rendered more than once.");
const dailyMissionRenderer = game.slice(game.indexOf("function renderDailyMissions"), game.indexOf("function getDailyMissionById"));
assert.equal(occurrences(dailyMissionRenderer, "dailyMissionState.missions.map"), 1, "Daily Quest rows are rendered through duplicate map passes.");
assert.match(dailyMissionRenderer, /dailyMissionsList\.innerHTML\s*=\s*dailyMissionState\.missions\.map/, "Daily Quest rendering no longer replaces the list atomically.");
const achievementRenderer = game.slice(game.indexOf("function renderSeasonalAchievementTab"), game.indexOf("function bindSeasonalAchievementControls"));
assert.equal(occurrences(achievementRenderer, "const rows = filtered.map"), 1, "Achievement rows are rendered through duplicate map passes.");

for (const marker of ["clan-overview", "clan-warroom-tab", "clan-rewards", "clan-members", "war-room", "achievements", "quests"]) {
  assert.match(fixture, new RegExp(`data-qa-capture="${marker}"`), `Visual QA is missing the ${marker} state.`);
}
assert.match(
  fixture,
  /styles\.css[\s\S]*interface-theme\.css[\s\S]*daily-rewards\.css[\s\S]*common-gear-ui\.css[\s\S]*readability\.css[\s\S]*manuscript-prototype\.css[\s\S]*ui-contrast-correction\.css[\s\S]*profile-theme\.css[\s\S]*crownlands-palette\.css[\s\S]*action-buttons\.css[\s\S]*mobile-viewport\.css/,
  "The visual QA fixture does not reproduce the production stylesheet cascade.",
);

console.log("Validated targeted Clan, War Room, Achievement, and Daily Quest contrast ownership without duplicate text rendering.");
