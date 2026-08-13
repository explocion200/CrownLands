const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "game.js");
const serverPath = path.join(root, "functions", "index.js");
const gameSource = fs.readFileSync(gamePath, "utf8");
const serverSource = fs.readFileSync(serverPath, "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.match(indexSource, /id="flagSaveBtn"[\s\S]*?id="flagBackBtn"/, "The flag editor must retain Save Flag and Back actions.");
assert.doesNotMatch(indexSource, /id="flagExitBtn"|>\s*Exit\s*<\/button>/, "The flag editor still includes a redundant Exit action.");
assert.doesNotMatch(gameSource, /flagExitBtn/, "The removed flag Exit action still has client bindings.");
assert.match(stylesSource, /\.flag-editor-actions\s*\{[^}]*grid-template-columns:\s*1\.5fr\s+1fr/, "The flag editor action row must use its two-button layout.");

const colors = [
  "#1f5f91",
  "#b23a35",
  "#2f7a4a",
  "#6d4aa2",
  "#d3a62e",
  "#202a38",
  "#d9e2e8",
  "#8d5a2f",
];
const patterns = [
  "split",
  "diagonal",
  "band",
  "cross",
  "saltire",
  "chevron",
  "quartered",
  "pale",
  "chief",
  "bend",
];
const symbols = [
  "crown",
  "castle",
  "star",
  "swords",
  "fleur",
  "cross",
  "sun",
  "moon",
  "knight",
  "tower",
  "diamond",
  "spire",
];
const defaultFlag = {
  primary: "#1f5f91",
  secondary: "#d3a62e",
  pattern: "diagonal",
  symbol: "crown",
};

const flagSymbolCatalog = gameSource.slice(
  gameSource.indexOf("const FLAG_SYMBOLS = ["),
  gameSource.indexOf("const CLAN_SHIELD_COLORS"),
);
for (const [key, label, icon] of [
  ["castle", "Castle", "flag-castle"],
  ["star", "Star", "flag-star"],
  ["fleur", "Fleur-de-lis", "flag-fleur"],
  ["cross", "Pilgrim Cross", "flag-cross"],
  ["sun", "Sun", "flag-sun"],
  ["moon", "Crescent Moon", "flag-moon"],
  ["knight", "Warhorse", "flag-horse"],
  ["tower", "Watchtower", "flag-tower"],
  ["diamond", "Heraldic Lozenge", "flag-lozenge"],
  ["spire", "Spearhead", "flag-spearhead"],
]) {
  assert.ok(
    flagSymbolCatalog.includes(`{ key: "${key}", label: "${label}", icon: "${icon}" }`),
    `${label} does not use its medieval heraldry icon.`,
  );
  assert.ok(indexSource.includes(`id="cl-icon-${icon}"`), `${label} is missing its SVG symbol.`);
}
assert.doesNotMatch(flagSymbolCatalog, /icon:\s*"(?:transfer|scout|gold|achievements|check)"/, "Flag charges still borrow mismatched gameplay icons.");

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

function assertStarterFlag(flag, label) {
  assert.ok(colors.includes(flag?.primary), `${label} has an invalid primary color.`);
  assert.ok(colors.includes(flag?.secondary), `${label} has an invalid secondary color.`);
  assert.notEqual(flag.primary, flag.secondary, `${label} uses one color for both flag fields.`);
  assert.ok(patterns.includes(flag?.pattern), `${label} has an invalid pattern.`);
  assert.ok(symbols.includes(flag?.symbol), `${label} has an invalid symbol.`);
  assert.notEqual(
    JSON.stringify(flag),
    JSON.stringify(defaultFlag),
    `${label} fell back to the shared default flag.`
  );
}

const serverFunction = extractFunction(serverSource, "createRandomPlayerFlag");
const serverContext = {
  Object,
  PLAYER_FLAG_COLORS: colors,
  PLAYER_FLAG_PATTERNS: patterns,
  PLAYER_FLAG_SYMBOLS: symbols,
  DEFAULT_PLAYER_FLAG: defaultFlag,
  crypto: require("node:crypto"),
};
vm.createContext(serverContext);
vm.runInContext(serverFunction, serverContext, { filename: serverPath });

const serverVariants = new Set();
for (let trial = 0; trial < 250; trial += 1) {
  const flag = serverContext.createRandomPlayerFlag();
  assertStarterFlag(flag, `Server flag ${trial + 1}`);
  serverVariants.add(JSON.stringify(flag));
}
assert.ok(serverVariants.size > 1, "Server starter flag generation produced no variation.");

const forcedServerChoices = [0, 3, 1, 0];
const forcedServerContext = {
  Object,
  PLAYER_FLAG_COLORS: colors,
  PLAYER_FLAG_PATTERNS: patterns,
  PLAYER_FLAG_SYMBOLS: symbols,
  DEFAULT_PLAYER_FLAG: defaultFlag,
  crypto: {
    randomInt: () => forcedServerChoices.shift(),
  },
};
vm.createContext(forcedServerContext);
vm.runInContext(serverFunction, forcedServerContext, { filename: serverPath });
assertStarterFlag(
  forcedServerContext.createRandomPlayerFlag(),
  "Server exact-default collision fallback"
);

const clientFunction = extractFunction(gameSource, "createRandomFlag");
const randomFromFunction = extractFunction(gameSource, "randomFrom");
const forcedClientChoices = [0, 0.5, 0.1, 0];
const clientMath = Object.create(Math);
clientMath.random = () => forcedClientChoices.shift();
const clientContext = {
  Math: clientMath,
  Object,
  FLAG_COLORS: colors,
  FLAG_PATTERNS: patterns.map(key => ({ key })),
  FLAG_SYMBOLS: symbols.map(key => ({ key })),
  createDefaultFlag: () => ({ ...defaultFlag }),
};
vm.createContext(clientContext);
vm.runInContext(`${randomFromFunction}\n${clientFunction}`, clientContext, { filename: gamePath });
assertStarterFlag(
  clientContext.createRandomFlag(),
  "Client exact-default collision fallback"
);

const freshProfileFunction = extractFunction(serverSource, "createFreshResetPlayerProfile");
assert.match(
  freshProfileFunction,
  /previous\.flag\s*\|\|\s*createRandomPlayerFlag\(\)/,
  "Fresh profile creation does not preserve stored flags before generating a new one."
);
assert.doesNotMatch(
  freshProfileFunction,
  /requestData\.flag/,
  "A first-time client can still choose or submit the authoritative starter flag."
);
assert.match(
  extractFunction(gameSource, "setupOnlineWorld"),
  /flag:\s*profile\.flag\s*&&\s*typeof profile\.flag === "object"[\s\S]*?if \(archivedProfileIdentity\.flag\) state\.flag = archivedProfileIdentity\.flag;/,
  "An empty sign-in profile can still replace the browser's random starter flag with the shared default."
);

console.log("Validated server-authoritative random starter flags and shared-default avoidance.");
