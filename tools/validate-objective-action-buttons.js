const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("action-buttons.css");
const legacyCss = read("styles.css");
const game = read("game.js");
const index = read("index.html");
const worker = read("service-worker.js");
const builder = read("tools/build-production-client.js");
const manifestBuilder = read("tools/generate-release-manifest.js");
const artifactValidator = read("tools/validate-production-artifact.js");
const visualFixture = read("docs/visual-qa/action-buttons/index.html");

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

assert.match(css, /:is\(\.city-wheel-action, \.gold-camp-wheel-action\)\.cl-action-button\s*\{[\s\S]*?width:\s*var\(--cl-action-size\) !important;[\s\S]*?height:\s*var\(--cl-action-size\) !important;[\s\S]*?border:\s*var\(--cl-action-border-width\) solid var\(--cl-action-border\) !important;[\s\S]*?clip-path:\s*var\(--cl-action-shape\);/, "Cities and objectives do not share one physical button construction.");
assert.match(css, /\.cl-action-button:disabled:not\(\.is-pending\):not\(\.busy\):not\(\[aria-busy="true"\]\)[\s\S]*?--cl-action-bg:\s*var\(--cl-action-disabled-bg\);[\s\S]*?background:\s*var\(--cl-action-disabled-bg\) !important;/, "Disabled objectives do not share one state treatment.");
assert.match(css, /\.cl-action-button\.cl-action-scout:is\(\.armed, \.active, \.is-pending, \.busy, \[aria-busy="true"\]\)[\s\S]*?--cl-action-bg:\s*var\(--cl-action-scout-bg\);[\s\S]*?background:\s*var\(--cl-action-scout-bg\) !important;/, "Armed, pending, and busy scouting can leave the dedicated red family.");
assert.match(css, /\.cl-action-button:focus-visible[\s\S]*?outline:\s*3px solid #ffe29a;/, "Shared action buttons are missing a visible keyboard focus state.");
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

const releaseId = "20260814-crownlands-palette-r34";
const styleTag = `action-buttons.css?v=${releaseId}`;
assert.ok(index.includes(styleTag), "The shared action-button stylesheet is not loaded by the game.");
assert.ok(index.indexOf(styleTag) > index.indexOf("profile-theme.css"), "The shared action-button stylesheet must load after legacy and Profile theme layers.");
assert.ok(worker.includes(`/${styleTag}`), "The shared action-button stylesheet is missing from the offline shell.");
assert.ok(worker.includes(`CACHE_VERSION = "${releaseId}"`), "The action-button release does not restart stale clients.");
for (const source of [builder, manifestBuilder, artifactValidator]) {
  assert.ok(source.includes("action-buttons.css"), "The shared action-button stylesheet is missing from production packaging.");
}
for (const variant of ["info", "send", "attack", "reinforce", "rally", "scout", "royal"]) {
  assert.ok(visualFixture.includes(`cl-action-${variant}`), `The visual matrix is missing the ${variant} action variant.`);
}
assert.match(visualFixture, /cl-action-scout is-pending[\s\S]*?aria-busy="true" disabled/, "The visual matrix is missing pending red scouting.");
assert.match(visualFixture, /cl-action-(?:send|attack|info)" disabled/, "The visual matrix is missing the shared disabled treatment.");

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
