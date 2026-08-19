const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const config = require(path.join(root, "functions", "playerFlagConfig.js"));
const game = read("game.js");
const server = read("functions/index.js");
const index = read("index.html");
const styles = read("styles.css");

const expectedColors = [
  ["Crimson", "#A52A2A"], ["Oxblood", "#6E2025"], ["Burgundy", "#722F37"],
  ["Royal Blue", "#315A8A"], ["Deep Navy", "#243447"], ["Faded Azure", "#547A9A"],
  ["Forest Green", "#355E3B"], ["Moss Green", "#667A4A"], ["Dark Olive", "#4E5637"],
  ["Heraldic Gold", "#C69A45"], ["Old Gold", "#B58A3B"], ["Ochre", "#B98232"],
  ["Ivory", "#F2E2BF"], ["Bone", "#DDD0AE"], ["Silver / Light Stone", "#B9B4A8"],
  ["Charcoal", "#303436"], ["Dark Brown", "#4A3428"], ["Blackened Iron", "#202426"],
  ["Royal Purple", "#66536F"], ["Deep Plum", "#4E354F"],
];
const expectedPatterns = [
  "split", "diagonal", "band", "cross", "saltire", "chevron", "quartered",
  "pale", "chief", "bend", "fess", "pile", "canton", "invertedChevron",
];
const expectedSymbols = [
  "crown", "lion", "eagle", "double-eagle", "wolf", "stag", "boar", "bear",
  "horse", "dragon", "griffin", "raven", "falcon", "serpent", "crossed-swords",
  "battle-axe", "war-hammer", "spearhead", "gauntlet", "tower", "castle-gate",
  "fleur-de-lis", "oak-tree", "sunburst", "cross", "moon", "diamond", "guardian",
  "banner", "helm",
];

assert.deepEqual(config.COLORS.map(({ label, value }) => [label, value]), expectedColors, "The curated heraldic palette changed.");
assert.deepEqual(config.PATTERN_KEYS, expectedPatterns, "The supported heraldic patterns changed.");
assert.deepEqual(config.SYMBOL_KEYS, expectedSymbols, "The medieval symbol catalog changed.");
assert.equal(new Set(config.COLOR_VALUES).size, 20, "Flag colors must remain distinct.");
assert.equal(new Set(config.SYMBOL_KEYS).size, 30, "Flag symbol IDs must remain distinct.");

for (const pattern of expectedPatterns) {
  assert.ok(styles.includes(`.kingdom-flag.pattern-${pattern}`), `Missing rendering for ${pattern}.`);
}
for (const symbol of config.SYMBOLS) {
  assert.match(symbol.icon, /^flag-[a-z-]+$/, `${symbol.label} must use a dedicated heraldic icon.`);
  assert.equal((index.match(new RegExp(`id="cl-icon-${symbol.icon}"`, "g")) || []).length, 1, `${symbol.label} must have exactly one SVG sprite symbol.`);
}

assert.match(index, /functions\/playerFlagConfig\.js\?v=20260819-player-flags-v2-r1[\s\S]*functions\/flagRenderer\.js\?v=20260819-player-flags-v2-r1[\s\S]*firebaseClient\.js[\s\S]*game\.js/, "The shared flag config and renderer must load before persistence and gameplay.");
assert.match(game, /const PLAYER_FLAG_CONFIG = globalThis\.CrownlandsPlayerFlags/);
assert.match(server, /require\("\.\/playerFlagConfig\.js"\)/);
assert.match(game, /function createRandomFlag\(\)[\s\S]*PLAYER_FLAG_CONFIG\.createRandomFlag\(\)/);
assert.match(server, /function createRandomPlayerFlag\(\)[\s\S]*PLAYER_FLAG_CONFIG\.createRandomFlag/);

const variants = new Set();
for (let trial = 0; trial < 250; trial += 1) {
  const flag = config.createRandomFlag();
  assert.equal(flag.version, 2);
  assert.ok(config.COLOR_VALUES.includes(flag.primary));
  assert.ok(config.COLOR_VALUES.includes(flag.secondary));
  assert.notEqual(flag.primary, flag.secondary);
  assert.ok(config.COLOR_VALUES.includes(flag.symbolColor));
  assert.ok(config.PATTERN_KEYS.includes(flag.pattern));
  assert.ok(config.SYMBOL_KEYS.includes(flag.symbol));
  variants.add(JSON.stringify(flag));
}
assert.ok(variants.size > 100, "Starter flags do not provide enough random variation.");

const validOld = { primary: "#1f5f91", secondary: "#d3a62e", symbolColor: "#d9e2e8", pattern: "diagonal", symbol: "crown" };
assert.deepEqual(config.normalizeFlag(validOld, "player-a"), {
  version: 1,
  primary: "#1F5F91",
  secondary: "#D3A62E",
  symbolColor: "#D9E2E8",
  pattern: "diagonal",
  symbol: "crown",
}, "Valid historical colors and supported choices must be preserved.");

for (const [legacy, migrated] of Object.entries({
  castle: "tower", star: "sunburst", swords: "crossed-swords", fleur: "fleur-de-lis",
  sun: "sunburst", knight: "horse", tower: "tower", spire: "spearhead", keep: "castle-gate",
})) {
  assert.equal(config.normalizeFlag({ ...validOld, symbol: legacy }, "player-a").symbol, migrated, `${legacy} did not migrate to ${migrated}.`);
}

const corrupted = { primary: "parchment", secondary: null, iconColor: "#4a3428", patternId: "broken-pattern", symbolId: "deleted-symbol" };
const repairedA = config.normalizeFlag(corrupted, "stable-player");
const repairedB = config.normalizeFlag(corrupted, "stable-player");
assert.deepEqual(repairedA, repairedB, "Corrupt flag fallback must be deterministic per player.");
assert.match(repairedA.primary, /^#[0-9A-F]{6}$/);
assert.match(repairedA.secondary, /^#[0-9A-F]{6}$/);
assert.equal(repairedA.symbolColor, "#4A3428", "Icon-color aliases must migrate independently.");
assert.ok(config.PATTERN_KEYS.includes(repairedA.pattern));
assert.ok(config.SYMBOL_KEYS.includes(repairedA.symbol));
assert.notDeepEqual(config.normalizeFlag(corrupted, "another-player"), repairedA, "Stable IDs should distribute corrupt flags across the catalog.");

const aliases = config.normalizeFlag({
  primaryColor: "#A52A2A", accentColor: "#315A8A", chargeColor: "#F2E2BF",
  patternId: "saltire", icon: "flag-fleur",
}, "aliases");
assert.deepEqual(aliases, { version: 1, primary: "#A52A2A", secondary: "#315A8A", symbolColor: "#F2E2BF", pattern: "saltire", symbol: "fleur-de-lis" });

const oldestStoredShape = config.normalizeFlag({
  background: "#17324d", patternColor: "#d8bd78", emblemColor: "#ffffff",
  pattern: "split", emblem: "crown",
}, "oldest-shape");
assert.deepEqual(oldestStoredShape, { version: 1, primary: "#17324D", secondary: "#D8BD78", symbolColor: "#FFFFFF", pattern: "split", symbol: "crown" }, "The earliest persisted background/patternColor/emblem fields must migrate without losing valid choices.");

assert.match(server, /previous\.flag && typeof previous\.flag === "object"[\s\S]*normalizeServerFlag\(previous\.flag, uid\)[\s\S]*createRandomPlayerFlag\(\)/, "Fresh profiles must preserve and normalize existing flags before randomizing missing flags.");
assert.doesNotMatch(server, /requestData\.flag[\s\S]{0,300}createFreshResetPlayerProfile/, "Clients must not choose the authoritative starter flag.");
assert.match(index, /id="flagBackBtn"[\s\S]*?id="flagSaveBtn"/, "The flag editor must retain Cancel and Save Flag actions.");
assert.doesNotMatch(index, /id="flagExitBtn"/, "The redundant flag Exit action returned.");

console.log("Validated shared heraldic catalogs, random starter flags, and deterministic legacy migration.");
