const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const gameSource = read("game.js");
const stylesSource = read("styles.css");
const indexSource = read("index.html");
const workerSource = read("service-worker.js");
const serverSource = read("functions/index.js");
const firebaseSource = read("firebaseClient.js");
const browserEconomySource = read("economy-config.js");
const serverEconomySource = read("functions/economy-config.json");
const functionsPackage = JSON.parse(read("functions/package.json"));
const optimizedArtManifest = JSON.parse(read("assets/optimized/manifest.json"));

function optimizedAsset(id) {
  const output = optimizedArtManifest.assets.find(asset => asset.id === id)?.output;
  assert.ok(output, `Missing optimized artwork manifest entry: ${id}.`);
  return output;
}

const BUILD_ID = "20260810-daily-mission-camp-fix-v1";
const HUB_ART_SRC = optimizedAsset("inner-castle-hub");
const BUILDINGS = [
  {
    key: "royal-stables",
    label: "Royal Stables",
    role: "Movement / march speed",
    artSrc: optimizedAsset("inner-castle-royal-stables"),
  },
  {
    key: "alehouse",
    label: "Alehouse",
    role: "Morale / recovery / small boosts",
    artSrc: optimizedAsset("inner-castle-alehouse"),
  },
  {
    key: "treasury",
    label: "Treasury",
    role: "Gold storage / gold production",
    artSrc: optimizedAsset("inner-castle-treasury"),
  },
  {
    key: "great-hall",
    label: "Great Hall",
    role: "Ruler power / kingdom upgrades",
    artSrc: optimizedAsset("inner-castle-great-hall"),
  },
  {
    key: "barracks",
    label: "Barracks",
    role: "Troop production / military strength",
    artSrc: optimizedAsset("inner-castle-barracks"),
  },
  {
    key: "gatehouse",
    label: "Gatehouse",
    role: "City defense / wall strength",
    artSrc: optimizedAsset("inner-castle-gatehouse"),
  },
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}().`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

function extractConstantStatement(source, name) {
  const start = source.indexOf(`const ${name}`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const equals = source.indexOf("=", start);
  assert.ok(equals > start, `Missing ${name} initializer.`);

  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let depth = 0;
  for (let index = equals + 1; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && nextCharacter === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "/" && nextCharacter === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) depth += 1;
    if (")]}".includes(character)) depth -= 1;
    if (character === ";" && depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not isolate ${name}.`);
}

function requireLiteral(source, field, value, message) {
  const pattern = new RegExp(`\\b${escapeRegExp(field)}\\s*:\\s*["']${escapeRegExp(value)}["']`);
  assert.match(source, pattern, message);
}

const hubStatement = extractConstantStatement(gameSource, "INNER_CASTLE_HUB_ART_SRC");
assert.ok(hubStatement.includes(JSON.stringify(HUB_ART_SRC)), "The Inner Castle hub must use the approved asset path.");

const registrySource = extractConstantStatement(gameSource, "INNER_CASTLE_BUILDINGS");
assert.equal(
  (registrySource.match(/\bkey\s*:/g) || []).length,
  BUILDINGS.length,
  "The Inner Castle registry must contain exactly six buildings."
);
for (const building of BUILDINGS) {
  const entryStart = registrySource.search(new RegExp(`\\bkey\\s*:\\s*["']${escapeRegExp(building.key)}["']`));
  assert.ok(entryStart >= 0, `Missing ${building.label} from the Inner Castle registry.`);
  const nextKey = registrySource.slice(entryStart + 1).search(/\bkey\s*:/);
  const entrySource = registrySource.slice(
    entryStart,
    nextKey >= 0 ? entryStart + 1 + nextKey : registrySource.length
  );
  requireLiteral(entrySource, "label", building.label, `${building.label} has the wrong display label.`);
  requireLiteral(entrySource, "role", building.role, `${building.label} has the wrong placeholder role.`);
  requireLiteral(entrySource, "artSrc", building.artSrc, `${building.label} has the wrong card-art path.`);
  assert.match(entrySource, /\bhotspot\s*:/, `${building.label} is missing hotspot coordinates.`);
  assert.match(entrySource, /\bleft\s*:\s*\d+(?:\.\d+)?/, `${building.label} is missing a numeric left hotspot coordinate.`);
  assert.match(entrySource, /\btop\s*:\s*\d+(?:\.\d+)?/, `${building.label} is missing a numeric top hotspot coordinate.`);
}

const guardSource = extractFunction(gameSource, "canEnterInnerCastle");
assert.match(guardSource, /city\.owner\s*===\s*["']player["']/, "Inner Castle entry must require an owned city.");
assert.match(guardSource, /!\s*isStronghold\(city\)/, "Strongholds must not expose the Inner Castle.");
assert.match(guardSource, /isMainCityForList\(city\)/, "Inner Castle entry must use the canonical main-city helper.");

const cityInfoSource = extractFunction(gameSource, "showCityInfoModal");
assert.match(cityInfoSource, /canEnterInnerCastle\(city\)/, "City details must gate the Inner Castle CTA.");
assert.match(cityInfoSource, /id=["']enterInnerCastleBtn["']/, "City details are missing the Inner Castle CTA.");
assert.match(cityInfoSource, /data-enter-inner-castle=/, "The Inner Castle CTA is missing its city target.");
assert.match(cityInfoSource, />\s*Enter Inner Castle\s*</, "The Inner Castle CTA label changed.");
assert.match(
  cityInfoSource,
  /openInnerCastle\((?:city\.id|event\.currentTarget\.dataset\.enterInnerCastle)\)/,
  "The Inner Castle CTA is not wired to the selected city."
);

const openSource = extractFunction(gameSource, "openInnerCastle");
assert.match(openSource, /canEnterInnerCastle\(city\)/, "The Inner Castle open function must enforce its entry guard.");
assert.match(openSource, /delete modal\.dataset\.cityInfoId/, "Opening the Inner Castle must clear city-info modal state.");
assert.match(openSource, /modal\.dataset\.innerCastleCityId\s*=\s*city\.id/, "Opening the Inner Castle must retain a separate originating city ID.");
assert.match(openSource, /modal\.classList\.add\(["']inner-castle-modal["']\)/, "Opening the Inner Castle must enable its expanded modal layout.");
assert.match(openSource, /renderInnerCastle\(city\.id\)/, "Opening the Inner Castle must render its hub.");
assert.match(
  openSource,
  /querySelector\(["']\[data-inner-castle-building\]\[aria-pressed=[^)]*\)[\s\S]*?\.focus\(\)/,
  "Opening the Inner Castle must move focus to the selected building hotspot."
);

const renderSource = extractFunction(gameSource, "renderInnerCastle");
const previewSource = extractFunction(gameSource, "renderInnerCastlePreview");
assert.match(renderSource, /Inner Castle/, "The Inner Castle title is missing.");
assert.match(renderSource, /aria-live=["']polite["']/, "The building preview must announce selection changes.");
assert.match(renderSource, /aria-pressed=/, "Building hotspots must expose their selected state.");
assert.match(renderSource, /data-inner-castle-back/, "The hub must provide a Back to City Details action.");
assert.match(renderSource, /Back to City Details/, "The hub back action has the wrong label.");
assert.match(renderSource, /showCityInfoModal\((?:cityId|originCityId)\)/, "The hub back action must restore the originating city details.");
assert.match(
  renderSource,
  /querySelector\(["']#enterInnerCastleBtn["']\)\?\.focus\(\)/,
  "Returning to city details must restore focus to the Inner Castle entry action."
);
assert.match(previewSource, /Details coming soon/, "Building previews must remain explicit placeholders.");

const selectSource = extractFunction(gameSource, "selectInnerCastleBuilding");
assert.match(selectSource, /getInnerCastleBuilding\(buildingKey\)/, "Building selection must resolve through the registry.");

const cleanupSource = extractFunction(gameSource, "clearInnerCastleModalState");
assert.match(cleanupSource, /delete modal\.dataset\.innerCastleCityId/, "Modal cleanup must clear the Inner Castle city ID.");
assert.match(cleanupSource, /modal\.classList\.remove\(["']inner-castle-modal["']\)/, "Modal cleanup must restore the shared dialog layout.");
assert.match(
  gameSource,
  /modal\.addEventListener\(["']close["'][\s\S]*?clearInnerCastleModalState\(\)/,
  "Closing the shared dialog must clean up Inner Castle state."
);

const featureSource = [guardSource, openSource, renderSource, previewSource, selectSource, cleanupSource].join("\n");
assert.doesNotMatch(
  featureSource,
  /\b(?:saveGame|flushOnlineSave|getOnlineApi|callServerFunction|changeMainCity|spendGold|deductGold)\s*\(/,
  "The placeholder Inner Castle must not persist state or call economy/server actions."
);
assert.doesNotMatch(
  featureSource,
  /\b(?:gold|troops|production|defense|walls|marchSpeed|morale)\s*(?:\+\+|--|[+\-*/]?=)/,
  "The placeholder Inner Castle must not mutate gameplay stats."
);

for (const [label, source] of [
  ["Functions", serverSource],
  ["Firebase client", firebaseSource],
  ["browser economy config", browserEconomySource],
  ["server economy config", serverEconomySource],
]) {
  assert.doesNotMatch(source, /inner[\s_-]*castle/i, `${label} must not add Inner Castle persistence or economy hooks.`);
}

assert.match(stylesSource, /\.inner-castle-modal\b/, "The expanded Inner Castle modal styles are missing.");
assert.match(
  stylesSource,
  /\.inner-castle-hotspot\s*\{(?=[^}]*\bmin-width\s*:\s*44px\s*;)(?=[^}]*\bmin-height\s*:\s*44px\s*;)[^}]*\}/s,
  "Inner Castle hotspots must retain a minimum 44px by 44px interaction target."
);
assert.match(
  stylesSource,
  /\.inner-castle-hotspot\s*>\s*span\s*\{(?=[^}]*(?:\bwidth\s*:\s*(?:min|clamp)\(|\bmax-width\s*:))(?=[^}]*\bborder\s*:)(?=[^}]*\bbackground\s*:)[^}]*\}/s,
  "Inner Castle hotspot labels must use a compact, width-constrained plaque span."
);
assert.match(
  stylesSource,
  /\.inner-castle-hotspot(?:\.selected|\[aria-pressed=["']true["']\])\s*>\s*span\s*\{(?=[^}]*\bcolor\s*:)(?=[^}]*\bbackground\s*:)[^}]*\}/s,
  "The selected Inner Castle hotspot must style its plaque span."
);
assert.match(indexSource, /<dialog id="modal" class="modal" aria-labelledby="modalTitle">/, "The shared modal must be labelled by its title.");
assert.match(indexSource, new RegExp(`name="crownlands-build" content="${BUILD_ID}"`), "The document build ID is stale.");
assert.match(indexSource, new RegExp(`styles\\.css\\?v=${BUILD_ID}`), "The Inner Castle stylesheet cache tag is stale.");
assert.match(indexSource, new RegExp(`game\\.js\\?v=${BUILD_ID}`), "The Inner Castle game-script cache tag is stale.");
assert.match(workerSource, new RegExp(`const CACHE_VERSION = "${BUILD_ID}";`), "The service-worker cache version is stale.");
assert.match(workerSource, new RegExp(`/styles\\.css\\?v=${BUILD_ID}`), "The service worker has the wrong stylesheet version.");
assert.match(workerSource, new RegExp(`/game\\.js\\?v=${BUILD_ID}`), "The service worker has the wrong game-script version.");

const staticCacheStart = workerSource.indexOf("const STATIC_CACHE_URLS");
const staticCacheEnd = workerSource.indexOf("];", staticCacheStart);
assert.ok(staticCacheStart >= 0 && staticCacheEnd > staticCacheStart, "Could not isolate the service-worker precache.");
const staticCacheSource = workerSource.slice(staticCacheStart, staticCacheEnd);
for (const assetPath of [HUB_ART_SRC, ...BUILDINGS.map(building => building.artSrc)]) {
  assert.ok(fs.existsSync(path.join(root, assetPath)), `Missing Inner Castle artwork: ${assetPath}.`);
  assert.ok(!staticCacheSource.includes(assetPath), `${assetPath} must load through the runtime cache, not the install precache.`);
}
assert.match(workerSource, /url\.pathname\.startsWith\(["']\/assets\/["']\)/, "The runtime cache must continue to cover Inner Castle artwork.");
assert.match(
  functionsPackage.scripts?.test || "",
  /node \.\.\/tools\/validate-inner-castle\.js/,
  "The Inner Castle validator is not registered in the Functions test chain."
);

console.log("Validated the six-building client-only Inner Castle hub, canonical access guard, modal lifecycle, artwork delivery, and release cache tags.");
