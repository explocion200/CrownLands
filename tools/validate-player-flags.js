const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const config = require(path.join(root, "functions", "playerFlagConfig.js"));
const game = read("game.js");
const firebaseClient = read("firebaseClient.js");
const server = read("functions/index.js");
const index = read("index.html");
const worker = read("service-worker.js");
const styles = read("styles.css");
const interfaceTheme = read("interface-theme.css");
const correction = read("ui-contrast-correction.css");
const profileTheme = read("profile-theme.css");
const palette = read("crownlands-palette.css");
const rules = read("firestore.rules");
const productionBuilder = read("tools/build-production-client.js");
const productionValidator = read("tools/validate-production-artifact.js");
const qaPage = read("docs/visual-qa/player-flags/index.html");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const baseline = {
  primary: "#A52A2A",
  secondary: "#315A8A",
  symbolColor: "#F2E2BF",
  pattern: "chevron",
  symbol: "lion",
};
assert.deepEqual(config.normalizeFlag(baseline, "owner-a"), baseline);
for (const [field, value] of Object.entries({
  primary: "#355E3B", secondary: "#C69A45", symbolColor: "#202426", pattern: "saltire", symbol: "dragon",
})) {
  const next = config.normalizeFlag({ ...baseline, [field]: value }, "owner-a");
  assert.equal(next[field], value, `${field} did not update.`);
  for (const untouched of Object.keys(baseline).filter(key => key !== field)) {
    assert.equal(next[untouched], baseline[untouched], `${field} unexpectedly changed ${untouched}.`);
  }
}

for (const fixture of [
  null,
  {},
  { primary: "bad" },
  { primary: "#A52A2A", secondary: [], symbolColor: 3, pattern: "deleted", symbol: "deleted" },
  { primaryColor: "#315A8A", accent: "#C69A45", iconColor: "#F2E2BF", patternId: "bend", symbolId: "castle" },
  { background: "#17324d", patternColor: "#d8bd78", emblemColor: "#ffffff", pattern: "split", emblem: "crown" },
]) {
  const first = config.normalizeFlag(fixture, "qa-owner");
  const second = config.normalizeFlag(fixture, "qa-owner");
  assert.deepEqual(first, second, "Fallback normalization changed between renders.");
  assert.match(first.primary, /^#[0-9A-F]{6}$/);
  assert.match(first.secondary, /^#[0-9A-F]{6}$/);
  assert.match(first.symbolColor, /^#[0-9A-F]{6}$/);
  assert.ok(config.PATTERN_KEYS.includes(first.pattern));
  assert.ok(config.SYMBOL_KEYS.includes(first.symbol));
}

assert.deepEqual(
  config.normalizeFlag({ background: "#17324d", patternColor: "#d8bd78", emblemColor: "#ffffff", pattern: "split", emblem: "crown" }, "legacy-owner"),
  { primary: "#17324D", secondary: "#D8BD78", symbolColor: "#FFFFFF", pattern: "split", symbol: "crown" },
  "The earliest persisted flag field names must migrate component by component."
);

assert.equal(config.normalizeFlag({ ...baseline, primary: "#12abEF" }, "owner-a").primary, "#12ABEF", "Valid custom historical colors must be preserved.");
assert.equal(config.normalizeSymbol("cross", "owner-a"), config.normalizeSymbol("cross", "owner-a"), "Removed-symbol fallback is not deterministic.");
assert.ok(config.SYMBOL_KEYS.includes(config.normalizeSymbol("cross", "owner-a")));
assert.ok(config.SYMBOL_KEYS.includes(config.normalizeSymbol("moon", "owner-a")));

const allCss = [styles, interfaceTheme, correction, profileTheme, palette].join("\n");
assert.equal((allCss.match(/var\(--flag-swatch\)/g) || []).length, 1, "Flag swatch fill must have one CSS source of truth.");
assert.match(styles, /\.flag-color-swatch[\s\S]*background-color:\s*var\(--flag-swatch\)/);
assert.doesNotMatch(styles.match(/\.flag-color-swatch[\s\S]*?\n\}/)?.[0] || "", /!important/, "The swatch repair must not stack another !important override.");
for (const source of [profileTheme, palette]) {
  assert.match(source, /:not\(\.flag-color-swatch\):not\(\[data-flag-color\]\)/, "A broad button theme still captures flag swatches.");
  assert.match(source, /span:not\(\.flag-symbol\)/, "A broad typography theme still captures the heraldic charge.");
}
assert.doesNotMatch(palette, /city-owner-column, \.city-army-count\)[\s\S]{0,120}\.cl-icon/, "Relationship colors still recolor a player's heraldic symbol.");
assert.match(interfaceTheme, /\.flag-symbol-icon[\s\S]*stroke:\s*var\(--flag-symbol-outline/);

const swatchRenderer = extractFunction(game, "renderFlagSwatches");
assert.match(swatchRenderer, /Current saved color/, "A valid historical color outside the curated picker is not represented.");
assert.match(swatchRenderer, /flag-color-swatch/);
assert.match(swatchRenderer, /aria-pressed="\$\{selected\}"/);
assert.match(extractFunction(game, "renderFlagEditor"), /flagDraft\.pattern[\s\S]*flagDraft\.symbol/, "Pattern and symbol controls are not independent.");
const saveFlag = extractFunction(game, "saveFlagEditor");
assert.match(saveFlag, /state\.flag = normalizeFlag\(flagDraft/);
assert.match(saveFlag, /playerCities\(\)\.forEach/);
assert.match(saveFlag, /rememberCurrentPlayerIdentity\(\)/);
assert.match(saveFlag, /syncPlayerIdentityToAllOwnedCities/);
assert.match(saveFlag, /flushOnlineSave\(true\)/);

const applyFlag = extractFunction(game, "applyFlagToElement");
assert.match(applyFlag, /--flag-primary", normalized\.primary/);
assert.match(applyFlag, /--flag-secondary", normalized\.secondary/);
assert.match(applyFlag, /--flag-symbol-color", normalized\.symbolColor/);
assert.match(applyFlag, /flagRenderSignature/, "Flag DOM composition is not cached by normalized data.");
assert.match(applyFlag, /renderCrownlandsIcon/, "Flags must reuse the shared inline SVG sprite.");
assert.doesNotMatch(applyFlag, /new Image|fetch\(|<img/, "Flag rendering creates per-city image work.");

const ownerFlag = extractFunction(game, "getCityOwnerFlag");
assert.match(ownerFlag, /city\.ownerUid/);
assert.match(ownerFlag, /resolvePlayerIdentityForUid\(city\.ownerUid, city\)/);
assert.match(ownerFlag, /normalizeFlag\(identity\.flag \|\| city\.ownerFlag, city\.ownerUid\)/);
assert.match(game, /if \(btn\._renderContent !== cityHtml\)[\s\S]{0,180}\}\s*applyCityOwnerFlags\(btn, city\);/, "Existing city nodes can retain stale flags after an owner flag changes.");
assert.match(game, /getFlagSignature\(getCityOwnerFlag\(city\), city\.ownerUid/, "The city render cache is not keyed to the resolved owner's flag.");
assert.match(game, /function normalizePlayerIdentity[\s\S]*flag:\s*normalizeFlag\(raw\.flag \|\| raw\.ownerFlag, uid\)/);
assert.match(game, /function normalizePresence[\s\S]*flag:\s*normalizeFlag\(raw\.flag, uid\)/);

assert.match(server, /function normalizeServerFlag\(flag = null, stableKey = ""\)[\s\S]*PLAYER_FLAG_CONFIG\.normalizeFlag\(flag, stableKey\)/);
assert.match(server, /getCanonicalPlayerIdentity[\s\S]*normalizeServerFlag\(rawFlag, uid\) \|\| PLAYER_FLAG_CONFIG\.createDeterministicFlag\(uid\)/);
assert.match(firebaseClient, /function cleanPlayerFlag[\s\S]*PLAYER_FLAG_CONFIG\.normalizeFlag/);
assert.match(firebaseClient, /cleanProfile\.flag = cleanPlayerFlag\(cleanProfile\.flag, uid\)/);
assert.match(firebaseClient, /ownerFlag:\s*hasPlayerOwner \? cleanPlayerFlag\(city\.ownerFlag, ownerUid\)/);
assert.match(rules, /function validPlayerFlagValue\(flag\)/);
assert.match(rules, /affected\.hasAny\(\['flag'\]\)[\s\S]*validPlayerFlagValue/);
assert.match(rules, /profileFieldUnchanged\('ownerFlag'\)[\s\S]*validPlayerFlagValue/);

for (const symbol of config.SYMBOLS) {
  assert.equal((index.match(new RegExp(`id="cl-icon-${symbol.icon}"`, "g")) || []).length, 1, `Missing or duplicated ${symbol.label} sprite.`);
}
assert.doesNotMatch(index.slice(index.indexOf("cl-icon-flag-crown"), index.indexOf("</svg>")), /<text|<image|href="https?:/i, "The flag sprite must use local silhouette geometry only.");

assert.match(styles, /@media \(max-width: 640px\) and \(orientation: portrait\)[\s\S]*\.flag-editor-view \{ grid-template-columns: minmax\(0, 1fr\)/);
assert.match(correction, /@media \(max-width: 640px\) and \(orientation: portrait\)[\s\S]*repeat\(4, minmax\(44px, 1fr\)\)/);
assert.match(index, /crownlands-build" content="20260819-welcome-report-contrast-r1"/);
assert.match(worker, /CACHE_VERSION = "20260819-welcome-report-contrast-r1"/);
for (const source of [index, worker]) assert.match(source, /functions\/playerFlagConfig\.js\?v=20260814-readability-r38/);
for (const source of [productionBuilder, productionValidator]) assert.match(source, /functions\/playerFlagConfig\.js/);

for (const token of ["Primary Color", "Accent Color", "Icon Color", "Patterns", "Symbols", "Own city", "Clan city", "Weaker enemy", "Equal enemy", "Stronger enemy", "Neutral city", "Ownership change"]) {
  assert.ok(qaPage.includes(token), `Player-flag visual QA is missing ${token}.`);
}

console.log("Validated Crownlands flag editor, migration, persistence, owner rendering, cache behavior, rules, and mobile safeguards.");
