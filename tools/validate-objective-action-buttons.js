const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("action-buttons.css");
const legacyCss = read("styles.css");
const interfaceCss = read("interface-theme.css");
const game = read("game.js");
const index = read("index.html");
const worker = read("service-worker.js");
const builder = read("tools/build-production-client.js");
const manifestBuilder = read("tools/generate-release-manifest.js");
const artifactValidator = read("tools/validate-production-artifact.js");
const visualFixture = read("docs/visual-qa/action-buttons/index.html");
const responsiveFixture = read("docs/visual-qa/action-buttons/responsive.html");

function extractFunction(name) {
  const start = game.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = game.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < game.length; index += 1) {
    if (game[index] === "{") depth += 1;
    if (game[index] === "}") depth -= 1;
    if (depth === 0) return game.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function ruleBody(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `Missing CSS rule ${selector}.`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }
  throw new Error(`Could not parse CSS rule ${selector}.`);
}

assert.ok(Buffer.byteLength(css) <= 16 * 1024, "The shared action-button system exceeds its 16 KiB budget.");
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, "The shared action-button CSS has unbalanced braces.");

for (const declaration of [
  "--cl-action-info-bg: linear-gradient(180deg, #e7d6b4, #d0b98e)",
  "--cl-action-info-border: #997643",
  "--cl-action-info-text: #2f2113",
  "--cl-action-send-bg: linear-gradient(180deg, #5f7888, #3e5664)",
  "--cl-action-attack-bg: linear-gradient(180deg, #9b4a42, #6d2927)",
  "--cl-action-reinforce-bg: linear-gradient(180deg, #74875a, #52633c)",
  "--cl-action-rally-bg: linear-gradient(180deg, #786581, #55445e)",
  "--cl-action-scout-bg: linear-gradient(180deg, #a63b30, #4f1515)",
  "--cl-action-scout-border: #d66b64",
  "--cl-action-scout-text: #fff8e8",
  "--cl-action-disabled-bg: #c7b99b",
  "--cl-action-disabled-border: #a59070",
  "--cl-action-disabled-text: #8c8373",
]) assert.ok(css.includes(declaration), `Missing approved action palette declaration ${declaration}.`);

assert.match(css, /:is\(\.city-wheel-action, \.gold-camp-wheel-action\)\.cl-action-button\s*\{[\s\S]*?width:\s*var\(--cl-action-size\) !important;[\s\S]*?height:\s*var\(--cl-action-size\) !important;[\s\S]*?border:\s*0 !important;[\s\S]*?clip-path:\s*var\(--cl-action-shape\);[\s\S]*?background:\s*var\(--cl-action-border\) !important;/, "Cities and objectives do not share one 64px bordered hex construction.");
assert.match(css, /\.cl-action-button::before\s*\{[\s\S]*?inset:\s*var\(--cl-action-border-width\);[\s\S]*?clip-path:\s*var\(--cl-action-shape\);[\s\S]*?var\(--cl-action-bg\) !important;/, "The semantic action color does not fill the complete hex face inside its border.");
assert.match(css, /\.cl-action-button:disabled:not\(\.is-pending\):not\(\.busy\):not\(\[aria-busy="true"\]\)[\s\S]*?--cl-action-bg:\s*linear-gradient\(180deg, var\(--cl-action-disabled-bg\), var\(--cl-action-disabled-bg\)\);[\s\S]*?--cl-action-border:\s*var\(--cl-action-disabled-border\);/, "Disabled objectives do not share one state treatment.");
assert.match(css, /\.cl-action-button\.cl-action-scout:is\(\.armed, \.active, \.is-pending, \.busy, \[aria-busy="true"\]\)[\s\S]*?--cl-action-bg:\s*var\(--cl-action-scout-bg\);[\s\S]*?--cl-action-border:\s*var\(--cl-action-scout-border\);/, "Armed, pending, and busy scouting can leave the dedicated red family.");
assert.match(css, /\.cl-action-button:focus-visible,[\s\S]*?drop-shadow\(0 0 7px var\(--cl-action-border\)\)/, "Shared action buttons are missing a visible color-family keyboard focus state.");
assert.match(css, /data-qa-state="pressed"[\s\S]*?transform:\s*translateY\(1px\);/, "Pressed hex buttons do not move their visual face by one pixel.");
assert.match(css, /@media \(max-width: 780px\)[\s\S]*?--cl-action-size:\s*64px;/, "Mobile action controls do not retain their touch target size.");
assert.match(legacyCss, /\.map-frame\.detail-far \.map-world\s*\{\s*--map-hit-size:\s*110px;/, "Far-zoom map actions do not retain their zoom-aware touch target.");

for (const [selector, forbidden] of [
  [".city-wheel-action", /(?:width|height|padding|border|clip-path|color|background|filter)\s*:/],
  [".gold-camp-wheel-action", /(?:width|height|padding|border|border-radius|color|background|box-shadow|font-family|filter)\s*:/],
  [".camp-recall-action", /(?:color|background|border)\s*:/],
  [".camp-order-action", /(?:color|background|border)\s*:/],
  [".camp-report-action", /(?:color|background|border)\s*:/],
  [".camp-rally-action", /(?:color|background|border)\s*:/],
]) assert.doesNotMatch(ruleBody(legacyCss, selector), forbidden, `${selector} still owns duplicate visual styling.`);

for (const obsoleteRule of [
  /\.city-wheel-action\s*\{[\s\S]*?background:/,
  /\.gold-camp-wheel-action\s*\{[\s\S]*?background:/,
  /\.wheel-send,\s*\.wheel-attack\s*\{[\s\S]*?background:/,
  /\.wheel-level,\s*\.wheel-scout-nearby\.armed\s*\{[\s\S]*?background:/,
  /\.camp-scout-action\s*\{[\s\S]*?background:/,
  /\.wheel-reinforce,\s*\.clan-reinforce-action\s*\{[\s\S]*?background:/,
]) assert.doesNotMatch(interfaceCss, obsoleteRule, "interface-theme.css still contains an objective-specific action color override.");
assert.doesNotMatch(legacyCss, /\.city-wheel-action::before|\.gold-camp-wheel-action::before/, "The obsolete circular action-button pseudo layer is still active.");

const wheelFunctions = [
  extractFunction("renderSelectedCityWheel"),
  extractFunction("renderSelectedForeignWheel"),
  extractFunction("renderSelectedStrongholdWheel"),
  extractFunction("renderSelectedRewardCampWheel"),
];
for (const source of wheelFunctions) {
  const actionTags = [...source.matchAll(/<button class="([^"]*(?:city-wheel-action|gold-camp-wheel-action)[^"]*)"/g)];
  assert.ok(actionTags.length >= 3, "An action wheel no longer exposes its expected controls.");
  for (const [, classes] of actionTags) assert.match(classes, /cl-action-button/, `Action button is outside the shared system: ${classes}`);
}

const ownedCity = wheelFunctions[0];
assert.match(ownedCity, /cl-action-royal wheel-level/, "City Level is missing its royal action token.");
assert.match(ownedCity, /cl-action-send wheel-send/, "City Send is missing its movement token.");
assert.match(ownedCity, /cl-action-info wheel-info/, "City Info is missing its information token.");
assert.match(ownedCity, /cl-action-scout wheel-scout-nearby/, "Nearby Scout is missing its red scouting token.");
assert.match(ownedCity, /cl-action-send wheel-regroup/, "Regroup is missing its movement token.");

const foreignCity = wheelFunctions[1];
assert.match(foreignCity, /cl-action-scout wheel-scout/, "Foreign-city Scout is missing its red scouting token.");
assert.match(foreignCity, /cl-action-reinforce wheel-reinforce[\s\S]*?cl-action-attack/, "Foreign-city Reinforce and Attack are not semantically separated.");
assert.match(foreignCity, /cl-action-info wheel-report/, "City scout reports are missing the shared information token.");
assert.match(foreignCity, /is-pending[\s\S]*?aria-busy/, "Pending city scouting is not exposed as a persistent red busy state.");

for (const [label, source] of [["Stronghold/Citadel", wheelFunctions[2]], ["Camp", wheelFunctions[3]]]) {
  for (const variant of ["cl-action-scout", "cl-action-info", "cl-action-reinforce", "cl-action-attack", "cl-action-rally"]) {
    assert.ok(source.includes(variant), `${label} actions are missing ${variant}.`);
  }
  assert.match(source, /is-pending[\s\S]*?aria-busy/, `${label} pending scouting is not exposed as a persistent red state.`);
}
assert.ok(wheelFunctions[2].includes("cl-action-send"), "Owned Stronghold/Citadel Send is missing its movement token.");
assert.ok(wheelFunctions[3].includes("cl-action-send camp-recall-action"), "Held Camp Recall is missing its movement token.");

const releaseId = "20260814-readability-r38";
const cacheVersion = "20260816-officer-equipment-ui-r4";
const styleTag = `action-buttons.css?v=${releaseId}`;
assert.ok(index.includes(styleTag), "The shared action-button stylesheet is not loaded by the game.");
assert.ok(index.indexOf(styleTag) > index.indexOf("profile-theme.css"), "The shared action-button stylesheet must load after legacy and Profile theme layers.");
assert.ok(worker.includes(`/${styleTag}`), "The shared action-button stylesheet is missing from the offline shell.");
assert.ok(worker.includes(`CACHE_VERSION = "${cacheVersion}"`), "The action-button release does not restart stale clients.");
for (const source of [builder, manifestBuilder, artifactValidator]) {
  assert.ok(source.includes("action-buttons.css"), "The shared action-button stylesheet is missing from production packaging.");
}
for (const variant of ["info", "send", "attack", "reinforce", "rally", "scout", "royal"]) {
  assert.ok(visualFixture.includes(`cl-action-${variant}`), `The visual matrix is missing the ${variant} action variant.`);
}
assert.match(visualFixture, /cl-action-scout is-pending[\s\S]*?aria-busy="true" disabled/, "The visual matrix is missing pending red scouting.");
assert.match(visualFixture, /cl-action-(?:send|attack|info)" disabled/, "The visual matrix is missing the shared disabled treatment.");
for (const state of ["hover", "pressed", "focus"]) assert.ok(visualFixture.includes(`data-qa-state="${state}"`), `The visual matrix is missing the ${state} state.`);
for (const stylesheet of ["styles.css", "interface-theme.css", "ui-contrast-correction.css", "profile-theme.css", "crownlands-palette.css", "action-buttons.css", "mobile-viewport.css"]) {
  assert.ok(visualFixture.includes(`../../../${stylesheet}`), `The visual matrix does not load the production ${stylesheet} cascade layer.`);
}
assert.match(visualFixture, /Normal Report and Scout Report[\s\S]*?detailed-battle-report[\s\S]*?detailed-scout-report/, "The visual matrix does not compare normal and Scout reports side by side.");
assert.match(visualFixture, /Map Troop Counters[\s\S]*?city-army-count[\s\S]*?Neutral city[\s\S]*?Enemy city[\s\S]*?Clan city/, "The visual matrix does not cover owned, neutral, enemy, and clan map labels.");
assert.match(responsiveFixture, /#portraitFrame\s*\{[\s\S]*?width:\s*390px;[\s\S]*?height:\s*844px;/, "The visual QA is missing its exact portrait mobile frame.");
assert.match(responsiveFixture, /#landscapeFrame\s*\{[\s\S]*?width:\s*844px;[\s\S]*?height:\s*390px;/, "The visual QA is missing its exact landscape mobile frame.");

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
for (const [name, foreground, background] of [
  ["information", "2f2113", "d0b98e"],
  ["movement", "f2e2bf", "3e5664"],
  ["attack", "f2e2bf", "6d2927"],
  ["reinforce", "f2e2bf", "52633c"],
  ["rally", "f2e2bf", "55445e"],
  ["scout", "fff8e8", "4f1515"],
]) assert.ok(contrast(foreground, background) >= 4.5, `${name} action text does not meet WCAG body-text contrast.`);

console.log("Validated one medieval action-button construction across cities, Camps, Strongholds, and the Citadel, including persistent red scouting states.");
