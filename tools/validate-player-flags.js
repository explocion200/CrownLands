const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const config = require(path.join(root, "functions", "playerFlagConfig.js"));
const rendererModule = require(path.join(root, "functions", "flagRenderer.js"));
const game = read("game.js");
const firebaseClient = read("firebaseClient.js");
const server = read("functions/index.js");
const index = read("index.html");
const runtimeSprite = read("assets/flag-symbols/runtime.svg");
const worker = read("service-worker.js");
const styles = read("styles.css");
const interfaceTheme = read("interface-theme.css");
const editorStyles = read("player-flag-editor.css");
const manuscript = read("manuscript-prototype.css");
const profileTheme = read("profile-theme.css");
const palette = read("crownlands-palette.css");
const rules = read("firestore.rules");
const productionBuilder = read("tools/build-production-client.js");
const productionValidator = read("tools/validate-production-artifact.js");
const qaPage = read("docs/visual-qa/player-flags/index.html");
const hudResponsiveQaPage = read("docs/visual-qa/player-flags/hud-frame-responsive.html");

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

const legacy = {
  primary: "#A52A2A",
  secondary: "#315A8A",
  symbolColor: "#F2E2BF",
  pattern: "chevron",
  symbol: "lion",
};
const runtimeLegacy = config.normalizeFlag(legacy, "owner-a");
assert.deepEqual(runtimeLegacy, { version: 1, ...legacy });
assert.deepEqual(config.toStoredFlag(runtimeLegacy, "owner-a"), legacy, "Reading a v1 flag must not rewrite it as v2.");

const runtimeV2 = config.createVersion2Flag(legacy, "owner-a");
assert.deepEqual(runtimeV2, { version: 2, ...legacy });
assert.deepEqual(config.toStoredFlag(runtimeV2, "owner-a"), { ...legacy, version: 2 });
const approvedRoundTrip = config.normalizeFlag(
  JSON.parse(JSON.stringify(config.toStoredFlag({ ...runtimeV2, symbol: "war-hammer" }, "round-trip-owner"))),
  "round-trip-owner"
);
assert.equal(approvedRoundTrip.symbol, "war-hammer", "An approved symbol did not survive save/reload normalization.");
assert.equal(approvedRoundTrip.version, 2, "The saved approved symbol lost its schema version on reload.");
assert.equal(config.getFlagVersion({ version: 99 }), 1, "Unknown versions must be treated as legacy at read time.");
assert.deepEqual(Object.keys(config.toStoredFlag({ ...legacy, version: 99 }, "owner-a")).sort(), Object.keys(legacy).sort());

for (const fixture of [
  null,
  {},
  { primary: "bad" },
  { primaryColor: "#315A8A", accent: "#C69A45", iconColor: "#F2E2BF", patternId: "bend", symbolId: "castle" },
  { background: "#17324d", patternColor: "#d8bd78", emblemColor: "#ffffff", pattern: "split", emblem: "crown" },
]) {
  const first = config.normalizeFlag(fixture, "qa-owner");
  const second = config.normalizeFlag(fixture, "qa-owner");
  assert.deepEqual(first, second, "Fallback normalization changed between renders.");
  assert.ok([1, 2].includes(first.version));
  assert.match(first.primary, /^#[0-9A-F]{6}$/);
  assert.match(first.secondary, /^#[0-9A-F]{6}$/);
  assert.match(first.symbolColor, /^#[0-9A-F]{6}$/);
  assert.ok(config.PATTERN_KEYS.includes(first.pattern));
  assert.ok(config.SYMBOL_KEYS.includes(first.symbol));
}

assert.deepEqual(
  config.normalizeFlag({ background: "#17324d", patternColor: "#d8bd78", emblemColor: "#ffffff", pattern: "split", emblem: "crown" }, "legacy-owner"),
  { version: 1, primary: "#17324D", secondary: "#D8BD78", symbolColor: "#FFFFFF", pattern: "split", symbol: "crown" }
);
assert.equal(config.normalizeFlag({ ...legacy, primary: "#12abEF" }, "owner-a").primary, "#12ABEF");
assert.deepEqual(
  config.normalizeFlag({
    primary: "invalid",
    background: "#17324d",
    secondary: null,
    patternColor: "#d8bd78",
    symbolColor: "transparent",
    emblemColor: "#ffffff",
    pattern: "missing-pattern",
    patternId: "split",
    symbol: "missing-symbol",
    emblem: "crown",
  }, "mixed-legacy-owner"),
  { version: 1, primary: "#17324D", secondary: "#D8BD78", symbolColor: "#FFFFFF", pattern: "split", symbol: "crown" },
  "Invalid canonical fields must not hide valid legacy aliases."
);

const selectableSymbols = [
  "crown", "lion", "eagle", "wolf", "stag", "boar", "bear", "horse", "dragon",
  "serpent", "crossed-swords", "battle-axe", "war-hammer", "spearhead", "gauntlet",
  "tower", "castle-gate", "fleur-de-lis", "oak-tree", "sunburst", "cross",
];
const legacyOnlySymbols = ["double-eagle", "griffin", "raven", "falcon", "moon", "diamond", "guardian", "banner", "helm"];
assert.equal(config.SYMBOL_KEYS.length, 30, "The v2 catalog must contain exactly 30 stable symbol IDs.");
assert.deepEqual(config.SELECTABLE_SYMBOL_KEYS, selectableSymbols, "The editor must expose exactly the 21 approved symbols.");
assert.deepEqual(config.LEGACY_ONLY_SYMBOL_KEYS, legacyOnlySymbols, "The legacy-only compatibility set changed.");
for (const symbol of legacyOnlySymbols) assert.ok(config.SYMBOL_KEYS.includes(symbol), `Missing readable legacy-only ${symbol} ID.`);
for (let index = 0; index < 100; index += 1) {
  const repaired = config.normalizeFlag({ symbol: "future-or-corrupt-symbol" }, `repair-owner-${index}`);
  assert.ok(config.SELECTABLE_SYMBOL_KEYS.includes(repaired.symbol), "Corrupt symbol repair exposed a legacy-only editor fallback.");
}
assert.equal(config.PATTERN_KEYS.length, 14);
for (const pattern of config.PATTERN_KEYS) assert.ok(styles.includes(`pattern-${pattern}`), `Missing ${pattern} CSS geometry.`);
for (const symbol of config.SYMBOLS) {
  const source = config.SELECTABLE_SYMBOL_KEYS.includes(symbol.key) ? runtimeSprite : index;
  assert.equal((source.match(new RegExp(`id="cl-icon-${symbol.icon}"`, "g")) || []).length, 1, `Missing or duplicated ${symbol.label} SVG.`);
}
assert.doesNotMatch(`${runtimeSprite}\n${index.slice(index.indexOf("cl-icon-flag-double-eagle"), index.indexOf("</svg>"))}`, /<text|<image|href="https?:/i);

class FakeClassList {
  constructor() { this.values = new Set(["kingdom-flag"]); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
}
const symbolNode = {
  dataset: {}, hidden: false, firstElementChild: null,
  set innerHTML(value) { this.markup = value; this.firstElementChild = value ? {} : null; },
  get innerHTML() { return this.markup || ""; },
  replaceChildren() { this.innerHTML = ""; },
};
const properties = new Map();
const fakeElement = {
  dataset: {}, classList: new FakeClassList(),
  style: { setProperty: (key, value) => properties.set(key, value) },
  querySelector: selector => selector === ".flag-symbol" ? symbolNode : null,
};
const renderer = rendererModule.create({
  config,
  renderIcon: icon => `<svg data-icon="${icon}"></svg>`,
});
renderer.render(fakeElement, runtimeV2, { stableKey: "owner-a", context: "test", size: "small" });
assert.equal(properties.get("--flag-primary"), legacy.primary);
assert.equal(properties.get("--flag-secondary"), legacy.secondary);
assert.equal(properties.get("--flag-symbol-color"), legacy.symbolColor);
assert.ok(fakeElement.classList.values.has("pattern-chevron"));
assert.match(symbolNode.innerHTML, /flag-lion/);
assert.equal(fakeElement.dataset.flagVersion, "2");
assert.equal(fakeElement.dataset.flagContext, "test");

for (const symbol of legacyOnlySymbols) {
  const historicalFlag = { ...runtimeV2, symbol };
  const normalized = renderer.render(fakeElement, historicalFlag, { stableKey: `legacy-${symbol}`, context: "legacy-fixture", size: "small" });
  assert.equal(normalized.symbol, symbol, `${symbol} no longer normalizes for historical flags.`);
  assert.equal(symbolNode.dataset.flagSymbol, symbol, `${symbol} no longer reaches the shared renderer.`);
  assert.match(symbolNode.innerHTML, new RegExp(`flag-${symbol}`), `${symbol} fallback geometry no longer renders.`);
  assert.equal(config.toStoredFlag(historicalFlag, `legacy-${symbol}`).symbol, symbol, `${symbol} is rewritten when stored.`);
}

assert.match(manuscript, /button:not\(\.player-flag-editor__control\)/, "Shared manuscript buttons still capture editor controls.");
for (const theme of [profileTheme, palette]) assert.match(theme, /:not\(\.flag-color-swatch\):not\(\[data-flag-color\]\)/);
assert.match(editorStyles, /background-color:\s*var\(--flag-swatch\)/);
assert.match(editorStyles, /player-flag-editor__swatch::after/);
assert.doesNotMatch(editorStyles.match(/player-flag-editor__swatch\s*\{[\s\S]*?\n\}/)?.[0] || "", /!important/);

const hudProfileButtonRule = styles.match(/\.profile-button\s*\{[\s\S]*?\n\}/)?.[0] || "";
const hudFlagRule = styles.match(/\.profile-button \.kingdom-flag-small\s*\{[\s\S]*?\n\}/)?.[0] || "";
const hudThemeFlagRule = interfaceTheme.match(/\.profile-button \.kingdom-flag-small\s*\{[\s\S]*?\n\}/)?.[0] || "";
assert.match(hudFlagRule, /--hud-flag-aperture-inset:\s*\d+%/,
  "The HUD flag no longer defines a frame-aperture inset.");
assert.match(hudFlagRule, /--hud-flag-aperture-radius:\s*\d+%/,
  "The HUD flag no longer defines a responsive frame-aperture radius.");
assert.match(hudFlagRule, /clip-path:\s*inset\(var\(--hud-flag-aperture-inset\) round var\(--hud-flag-aperture-radius\)\)/,
  "The HUD flag is not clipped to the profile frame's rounded inner window.");
assert.match(hudFlagRule, /contain:\s*paint/,
  "HUD flag pattern and symbol paint can escape its dedicated aperture.");
assert.doesNotMatch(styles, /\.profile-button \.kingdom-flag-small\s*\{[^}]*border-radius:\s*0(?:\D|$)/,
  "A responsive HUD rule restores square flag corners inside the rounded frame.");
assert.doesNotMatch(hudProfileButtonRule, /overflow:\s*(?:hidden|clip)/,
  "The profile button must not clip the ornate frame, shadow, level badge, or focus ring.");
assert.match(hudThemeFlagRule, /--hud-flag-aperture-inset:\s*15% 9% 12%/,
  "The final production theme does not compensate for its enlarged HUD flag underlay.");
assert.match(hudThemeFlagRule, /--hud-flag-aperture-radius:\s*12%/,
  "The final production theme no longer matches the frame aperture corners.");

const swatchRenderer = extractFunction(game, "renderFlagSwatches");
assert.match(swatchRenderer, /Current saved color/);
assert.match(swatchRenderer, /background-color:var\(--flag-swatch\)/);
assert.match(swatchRenderer, /--flag-check-color/);
const editorRenderer = extractFunction(game, "renderFlagEditor");
assert.match(editorRenderer, /FlagRenderer\.render\(flagEditorPreview/);
assert.match(editorRenderer, /FlagRenderer\.render\(flagEditorSmallPreview/);
assert.match(editorRenderer, /hideSymbol:\s*true/);
assert.match(game, /const FLAG_SYMBOLS = PLAYER_FLAG_CONFIG\.SELECTABLE_SYMBOLS;/, "The editor does not use the 21-symbol selectable catalog.");
assert.match(game, /EXTERNAL_FLAG_ICON_KEYS\.has\(iconKey\)[\s\S]*?`assets\/flag-symbols\/runtime\.svg#cl-icon-\$\{iconKey\}`/, "Approved flag icons are not routed through the app-relative runtime sprite.");
assert.doesNotMatch(game, /`\/assets\/flag-symbols\/runtime\.svg#cl-icon-\$\{iconKey\}`/, "Flag symbols still use a deployment-root-only sprite URL.");
assert.match(worker, /function isStaticAssetRequest[\s\S]*?svg/, "SVG assets must be handled as cacheable static requests.");
assert.match(worker, /event\.respondWith\(\s*cacheFirst\(request\)/, "Static SVG assets must use runtime caching after their first successful load.");
assert.doesNotMatch(worker, /"\/assets\/flag-symbols\/runtime\.svg"/, "The 81 KiB flag symbol sprite must not inflate the install-time cache.");
assert.match(game, /function isFlagEditorDirty\(\)/);
assert.match(game, /flagDiscardDialog\.addEventListener\("close"/);

const saveFlag = extractFunction(game, "saveFlagEditor");
assert.match(saveFlag, /flagSaveInFlight \|\| !isFlagEditorDirty\(\)/, "Repeated saves are not guarded.");
assert.match(saveFlag, /createVersion2Flag\(flagDraft/);
assert.match(saveFlag, /api\.savePlayerProfile/);
assert.match(saveFlag, /api\.syncPlayerIdentity/);
assert.match(saveFlag, /api\.saveGameSnapshot/);
assert.match(saveFlag, /api\.savePresence/);
assert.ok(saveFlag.indexOf("await Promise.all") < saveFlag.indexOf("commitSavedPlayerFlag"), "Local state commits before persistence confirms success.");
assert.match(saveFlag, /Save failed — retry/);

assert.doesNotMatch(game, /function applyFlagToElement\(/, "The duplicated legacy renderer still exists.");
for (const context of [
  "hud", "city", "profile", "public-profile", "clan-roster", "public-clan-roster", "clan-application",
  "leaderboard", "scout-report", "battle-report-list", "battle-report-detail",
]) assert.ok(game.includes(`context: "${context}"`), `Missing shared renderer context ${context}.`);
assert.match(game, /function showPublicClanDetails[\s\S]*?data-public-clan-member-flag[\s\S]*?FlagRenderer\.render[\s\S]*?member\.flag[\s\S]*?stableKey:\s*member\.uid \|\| member\.id \|\| member\.displayName[\s\S]*?context:\s*"public-clan-roster"/, "Public clan member flags are not hydrated from member snapshots with stable legacy fallbacks.");
assert.match(game, /normalizeFlag\(report\.opponentFlag, report\.opponentUid \|\| report\.opponentName\)/, "Battle reports do not repair flags against the opponent identity.");
assert.match(game, /stableKey:\s*report\.opponentUid \|\| report\.opponentName[\s\S]*context:\s*"battle-report-list"/, "Legacy battle-report cards do not derive missing flags from their opponent identity.");
assert.match(game, /normalizeFlag\(participant\.ownerFlag, participant\.ownerUid \|\| participant\.ownerName\)/, "Detailed battle flags do not repair against the participant identity.");
assert.match(game, /normalizeFlag\(row\.ownerFlag, row\.ownerUid\)/, "Scout reinforcement flags do not repair against their owner identity.");
assert.doesNotMatch(extractFunction(game, "applyClanRosterFlags"), /\|\| createDefaultFlag\(\)/, "Clan flag fallbacks collapse missing flags to one default.");
assert.doesNotMatch(extractFunction(game, "renderLeaderboardRows"), /\|\| createDefaultFlag\(\)/, "Leaderboard flag fallbacks collapse missing flags to one default.");
assert.doesNotMatch(extractFunction(game, "applyLegacyBattleFlags"), /\|\| createDefaultFlag\(\)/, "Legacy report flag fallbacks collapse missing flags to one default.");
assert.doesNotMatch(read("chat-ui.js"), /FlagRenderer|applyFlagToElement/, "Chat flags are outside this feature scope.");

assert.match(server, /function normalizeServerFlag\(flag = null, stableKey = ""\)[\s\S]*PLAYER_FLAG_CONFIG\.toStoredFlag\(flag, stableKey\)/);
assert.match(firebaseClient, /function cleanPlayerFlag[\s\S]*PLAYER_FLAG_CONFIG\.toStoredFlag/);
assert.match(rules, /hasOnly\(\['version', 'primary', 'secondary', 'symbolColor', 'pattern', 'symbol'\]\)/);
assert.match(rules, /!flag\.keys\(\)\.hasAny\(\['version'\]\) \|\| flag\.version == 2/);
assert.match(rules, /function validPlayerSaveFlag\(\)/);
assert.match(rules, /match \/presence\/\{uid\}[\s\S]*validOptionalPlayerFlag\(request\.resource\.data\)/);
for (const symbol of legacyOnlySymbols) assert.match(rules, new RegExp(`'${symbol}'`));

assert.match(index, /id="flagEditorSmallPreview"/);
assert.match(index, /data-flag-editor-tab="colors"/);
assert.match(index, /id="flagResetBtn"/);
assert.match(index, /id="flagRandomizeBtn"/);
assert.match(index, /id="flagDiscardDialog"/);
for (const source of [index, worker]) {
  assert.match(source, /functions\/playerFlagConfig\.js\?v=20260825-player-flags-audit-r1/);
  assert.match(source, /functions\/flagRenderer\.js\?v=20260819-player-flags-v2-r1/);
  assert.match(source, /player-flag-editor\.css\?v=20260819-player-flags-v2-r1/);
  assert.match(source, /game\.js\?v=20260904-layer1-travel-balance-r1/);
}
for (const source of [productionBuilder, productionValidator]) {
  assert.match(source, /functions\/flagRenderer\.js/);
  assert.match(source, /player-flag-editor\.css/);
  assert.match(source, /assets\/flag-symbols\/runtime\.svg/);
}
for (const token of ["Background Color", "Pattern Color", "Symbol Color", "30 symbol cards", "21 selectable symbol cards", "legacy-only symbols hidden from selector", "14 pattern cards", "HUD profile frame aperture", "14 HUD frame pattern cases", "HUD flag aperture clips rounded frame corners", "HUD visible paint resolves inside frame aperture", "HUD frame art remains unclipped", "computed visual checks"]) {
  assert.ok(qaPage.includes(token), `Player-flag visual QA is missing ${token}.`);
}
assert.match(qaPage, /version:\s*index % 2 \? 2 : 1/, "HUD visual QA no longer alternates stored v1 and v2 flags.");
assert.match(qaPage, /data-hud-case/, "HUD visual QA no longer renders flags inside the production profile frame.");
for (const token of ["Desktop · 1180 × 390", "Narrow landscape · 760 × 470", "Mobile portrait · 390 × 1080", "index.html?state=hud"]) {
  assert.ok(hudResponsiveQaPage.includes(token), `Responsive HUD-frame visual QA is missing ${token}.`);
}
for (const screenshot of ["hud-frame-before-live.png", "hud-frame-after-desktop.png", "hud-frame-after-narrow.png", "hud-frame-after-mobile.png"]) {
  const screenshotPath = path.join(root, "docs", "visual-qa", "player-flags", "screenshots", screenshot);
  assert.ok(fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 10000, `HUD-frame visual QA screenshot is missing or empty: ${screenshot}`);
}
assert.match(qaPage, /function renderSymbolOptions\(\)/, "Player-flag visual QA lacks live symbol selection wiring.");
assert.match(qaPage, /draft\.symbol = button\.dataset\.qaSymbol;[\s\S]*renderPreview\(\);[\s\S]*renderSymbolOptions\(\);/, "Player-flag visual QA does not repaint both previews and selected controls after a symbol change.");

console.log("Validated versioned player flags, shared renderer surfaces, persistence ordering, CSS isolation, Firestore schema, and QA coverage.");
