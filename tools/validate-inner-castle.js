const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const gameSource = `${read("game.js")}\n${read("common-gear-ui.js")}`;
const stylesSource = `${read("styles.css")}\n${read("interface-theme.css")}\n${read("common-gear-ui.css")}`;
const indexSource = read("index.html");
const workerSource = read("service-worker.js");
const serverSource = read("functions/index.js");
const firebaseSource = read("firebaseClient.js");
const browserEconomySource = read("economy-config.js");
const serverEconomySource = read("functions/economy-config.json");
const visualQaSource = read("docs/visual-qa/inner-castle-alert/index.html");
const profileVisualQaSource = read("docs/visual-qa/profile-inner-castle/index.html");
const functionsPackage = JSON.parse(read("functions/package.json"));
const optimizedArtManifest = JSON.parse(read("assets/optimized/manifest.json"));

function optimizedAssetEntry(id) {
  const entry = optimizedArtManifest.assets.find(asset => asset.id === id);
  assert.ok(entry, `Missing optimized artwork manifest entry: ${id}.`);
  return entry;
}

function optimizedAsset(id) {
  return optimizedAssetEntry(id).output;
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function getPngMetadata(buffer) {
  assert.equal(buffer.toString("hex", 0, 8), "89504e470d0a1a0a", "PNG is missing its signature.");
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR", "PNG is missing its IHDR chunk.");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

function getWebpMetadata(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", "WebP is missing its RIFF header.");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP", "WebP is missing its WEBP format header.");
  let offset = 12;
  let hasAlpha = false;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (chunkType === "VP8X") {
      hasAlpha = Boolean(buffer[dataOffset] & 0x10);
      return {
        width: readUInt24LE(buffer, dataOffset + 4) + 1,
        height: readUInt24LE(buffer, dataOffset + 7) + 1,
        hasAlpha,
      };
    }
    if (chunkType === "VP8 ") {
      assert.equal(buffer.toString("hex", dataOffset + 3, dataOffset + 6), "9d012a", "Invalid lossy WebP frame.");
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
        hasAlpha,
      };
    }
    if (chunkType === "VP8L") {
      assert.equal(buffer[dataOffset], 0x2f, "Invalid lossless WebP frame.");
      const b1 = buffer[dataOffset + 1];
      const b2 = buffer[dataOffset + 2];
      const b3 = buffer[dataOffset + 3];
      const b4 = buffer[dataOffset + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
        hasAlpha: Boolean(b4 & 0x10),
      };
    }
    if (chunkType === "ALPH") hasAlpha = true;
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  throw new Error("WebP does not contain a supported frame.");
}

const BUILD_ID = "20260827-instant-cross-map-city-upgrades-r1";
const STYLE_BUILD_ID = "20260827-instant-cross-map-city-upgrades-r1";
const GAME_BUILD_ID = "20260827-instant-cross-map-city-upgrades-r1";
const GEAR_UI_BUILD_ID = "20260825-gear-upgrade-consumption-r1";
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
const ART_STANDARDS = [
  {
    id: "inner-castle-hub",
    source: "assets/inner-castle/inner-castle-hub.png",
    sourceWidth: 1448,
    sourceHeight: 1086,
    runtimeWidth: 1280,
    runtimeHeight: 960,
  },
  ...BUILDINGS.map(building => ({
    id: `inner-castle-${building.key}`,
    source: `assets/inner-castle/${building.key}.png`,
    sourceWidth: 1254,
    sourceHeight: 1254,
    runtimeWidth: 512,
    runtimeHeight: 512,
  })),
];
const HOTSPOTS = new Map([
  ["treasury", { left: 19, top: 24 }],
  ["great-hall", { left: 50, top: 20 }],
  ["barracks", { left: 81, top: 25 }],
  ["alehouse", { left: 19, top: 57 }],
  ["gatehouse", { left: 50, top: 75 }],
  ["royal-stables", { left: 81, top: 58 }],
]);

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
  const expectedHotspot = HOTSPOTS.get(building.key);
  assert.match(entrySource, new RegExp(`\\bleft\\s*:\\s*${expectedHotspot.left}\\b`), `${building.label} left hotspot drifted.`);
  assert.match(entrySource, new RegExp(`\\btop\\s*:\\s*${expectedHotspot.top}\\b`), `${building.label} top hotspot drifted.`);
}

for (const standard of ART_STANDARDS) {
  const sourcePath = path.join(root, standard.source);
  assert.ok(fs.existsSync(sourcePath), `Missing Inner Castle source master: ${standard.source}.`);
  const sourceMeta = getPngMetadata(fs.readFileSync(sourcePath));
  assert.equal(sourceMeta.width, standard.sourceWidth, `${standard.source} source width must remain canonical.`);
  assert.equal(sourceMeta.height, standard.sourceHeight, `${standard.source} source height must remain canonical.`);
  assert.equal(sourceMeta.colorType, 2, `${standard.source} should remain an opaque scene PNG, not a transparent token.`);
  const optimized = optimizedAssetEntry(standard.id);
  assert.equal(optimized.category, "inner-castle", `${standard.id} must stay in the inner-castle optimized category.`);
  assert.equal(optimized.source, standard.source, `${standard.id} manifest source drifted.`);
  assert.equal(optimized.width, standard.runtimeWidth, `${standard.id} optimized width must remain canonical.`);
  assert.equal(optimized.height, standard.runtimeHeight, `${standard.id} optimized height must remain canonical.`);
  assert.equal(optimized.hasAlpha, false, `${standard.id} must stay an opaque runtime scene.`);
  assert.ok(fs.existsSync(path.join(root, optimized.output)), `${standard.id} optimized output is missing.`);
  const encoded = getWebpMetadata(fs.readFileSync(path.join(root, optimized.output)));
  assert.equal(encoded.width, standard.runtimeWidth, `${standard.id} encoded WebP width drifted.`);
  assert.equal(encoded.height, standard.runtimeHeight, `${standard.id} encoded WebP height drifted.`);
  assert.equal(encoded.hasAlpha, false, `${standard.id} encoded WebP should remain opaque.`);
}

const guardSource = extractFunction(gameSource, "canEnterInnerCastle");
assert.match(guardSource, /city\.owner\s*===\s*["']player["']/, "Inner Castle entry must require an owned city.");
assert.match(guardSource, /!\s*isStronghold\(city\)/, "Strongholds must not expose the Inner Castle.");
assert.match(guardSource, /isMainCityForList\(city\)/, "Inner Castle entry must use the canonical main-city helper.");

const profileButtonMatch = indexSource.match(
  /<section class="kingdom-overview"[\s\S]*?<div class="kingdom-stat-grid">([\s\S]*?)<\/div>\s*<div class="profile-inner-castle-actions">\s*<button id="profileInnerCastleBtn" class="profile-inner-castle-btn" type="button">Inner Castle<\/button>/
);
assert.ok(profileButtonMatch, "Profile Overview must place the Inner Castle button directly after the six-stat grid.");
assert.equal((profileButtonMatch[1].match(/class="kingdom-stat(?:\s|\")/g) || []).length, 6, "Profile Overview must retain all six Kingdom statistics before the Inner Castle button.");
assert.ok(indexSource.indexOf('id="profileInnerCastleBtn"') < indexSource.indexOf('class="profile-achievement-summary"'), "The Inner Castle button must remain above the Achievements section.");

const profileOpenSource = extractFunction(gameSource, "openProfileInnerCastle");
assert.match(profileOpenSource, /getMainCityReference\(\)/, "The Profile entry must use the canonical main-city reference.");
assert.match(profileOpenSource, /closeProfileScreen\(\{\s*force:\s*true\s*\}\)/, "The Profile overlay must close before the Inner Castle opens.");
assert.match(profileOpenSource, /openInnerCastle\(mainCity\.id\)/, "The Profile entry must reuse the existing Inner Castle opener.");
assert.ok(profileOpenSource.indexOf("closeProfileScreen") < profileOpenSource.indexOf("openInnerCastle"), "Profile must close before opening the shared Inner Castle modal.");
assert.match(gameSource, /profileInnerCastleBtn\.addEventListener\(["']click["'],\s*openProfileInnerCastle\)/, "The Profile Inner Castle button is not wired to its transition handler.");

const cityResolverSource = extractFunction(gameSource, "getInnerCastleCity");
assert.match(cityResolverSource, /cityById\(id\)/, "Inner Castle city resolution must prefer the loaded city.");
assert.match(cityResolverSource, /getMainCityReference\(\)/, "Inner Castle city resolution must support an off-map cached main city.");
assert.match(cityResolverSource, /mainCity\?\.id\s*===\s*id/, "The cached fallback must never resolve a city other than the main city.");

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

const renderedPlaqueStart = renderSource.indexOf('<span class="inner-castle-hotspot-plaque">');
const renderedTitleStart = renderSource.indexOf('<span class="inner-castle-hotspot-title">', renderedPlaqueStart);
const renderedTitleEnd = renderSource.indexOf("</span>", renderedTitleStart);
const renderedAlertStart = renderSource.indexOf("inner-castle-hotspot-alert", renderedPlaqueStart);
const renderedPlaqueEnd = renderSource.indexOf("</button>", renderedTitleEnd + 7);
assert.ok(renderedPlaqueStart >= 0, "Inner Castle hotspots must render an unclipped plaque wrapper.");
assert.ok(renderedTitleStart > renderedPlaqueStart, "The clipped title must be inside the plaque wrapper.");
assert.ok(renderedTitleEnd > renderedTitleStart, "The Inner Castle title span is malformed.");
assert.ok(renderedAlertStart > renderedTitleEnd, "The alert must be a sibling after the clipped title, not a descendant of it.");
assert.ok(renderedPlaqueEnd > renderedAlertStart, "The alert must remain inside the unclipped plaque wrapper.");
assert.doesNotMatch(
  renderSource.slice(renderedTitleStart, renderedTitleEnd),
  /inner-castle-hotspot-alert/,
  "The clipped title must never contain the Inner Castle alert."
);
assert.match(previewSource, /data-manage-common-gear/, "Supported Inner Castle buildings must open their Common Gear screen.");
assert.match(previewSource, /Not yet available/, "Great Hall and Alehouse must remain explicitly unavailable.");

assert.match(stylesSource, /\.profile-inner-castle-actions\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?\}/, "The Profile Inner Castle action must be centered below the stats.");
assert.match(stylesSource, /\.profile-inner-castle-btn\s*\{(?=[^}]*width:\s*min\(220px, 72%\))(?=[^}]*min-height:\s*40px)(?=[^}]*text-transform:\s*uppercase)[^}]*\}/s, "The Profile Inner Castle button must remain a compact medieval control.");
assert.match(stylesSource, /@media \(max-width:\s*900px\) and \(orientation:\s*landscape\)[\s\S]*?\.profile-inner-castle-btn\s*\{[^}]*min-height:\s*34px;/, "Mobile landscape must compact the Inner Castle button without hiding it.");

for (const label of ["King Power", "Cities", "Gold", "Troops", "Gold production", "Troops production"]) {
  assert.ok(profileVisualQaSource.includes(`>${label}<`), `Profile visual QA is missing ${label}.`);
}
assert.match(profileVisualQaSource, /profile-inner-castle-actions[\s\S]*?>Inner Castle<\/button>/, "Profile visual QA is missing the centered Inner Castle action.");
assert.ok(profileVisualQaSource.indexOf("profile-inner-castle-actions") < profileVisualQaSource.indexOf("profile-achievement-summary"), "Profile visual QA must keep Achievements below the Inner Castle action.");
assert.match(profileVisualQaSource, /variant["']\)\s*===\s*["']before["']/, "Profile visual QA must retain a before-state comparison.");
assert.ok(profileVisualQaSource.indexOf("profile-theme.css") < profileVisualQaSource.indexOf("crownlands-palette.css"), "Profile visual QA must exercise the production theme cascade.");

const selectSource = extractFunction(gameSource, "selectInnerCastleBuilding");
assert.match(selectSource, /getInnerCastleBuilding\(buildingKey\)/, "Building selection must resolve through the registry.");

const cleanupSource = extractFunction(gameSource, "clearInnerCastleModalState");
assert.match(cleanupSource, /delete modal\.dataset\.innerCastleCityId/, "Modal cleanup must clear the Inner Castle city ID.");
assert.match(cleanupSource, /modal\.classList\.remove\([^)]*["']inner-castle-modal["']/, "Modal cleanup must restore the shared dialog layout.");
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

assert.match(serverSource, /exports\.equipCommonGear\s*=/, "Inner Castle gear equipment must be server-authoritative.");
assert.match(firebaseSource, /equipCommonGear/, "Firebase client must expose the Inner Castle gear callable.");
for (const [label, source] of [["browser economy config", browserEconomySource], ["server economy config", serverEconomySource]]) {
  assert.doesNotMatch(source, /inner[\s_-]*castle/i, `${label} must not contain presentation-only Inner Castle data.`);
}

assert.match(stylesSource, /\.inner-castle-modal\b/, "The expanded Inner Castle modal styles are missing.");
assert.match(
  stylesSource,
  /\.inner-castle-hotspot\s*\{(?=[^}]*\bmin-width\s*:\s*44px\s*;)(?=[^}]*\bmin-height\s*:\s*44px\s*;)[^}]*\}/s,
  "Inner Castle hotspots must retain a minimum 44px by 44px interaction target."
);
assert.match(
  stylesSource,
  /\.inner-castle-hotspot-plaque\s*\{(?=[^}]*\bposition\s*:\s*relative)(?=[^}]*\bwidth\s*:\s*clamp\()(?=[^}]*\boverflow\s*:\s*visible)(?=[^}]*\bclip-path\s*:\s*none)[^}]*\}/s,
  "Inner Castle hotspots must use an unclipped, width-constrained plaque wrapper."
);
assert.match(
  stylesSource,
  /\.inner-castle-hotspot-title\s*\{(?=[^}]*\bwidth\s*:\s*100%)(?=[^}]*\bheight\s*:\s*100%)(?=[^}]*\bborder\s*:)(?=[^}]*\bclip-path\s*:\s*polygon\()(?=[^}]*\bbackground\s*:)[^}]*\}/s,
  "Inner Castle hotspot titles must retain the clipped polygon plaque face."
);
assert.match(
  stylesSource,
  /\.inner-castle-hotspot\.selected\s*>\s*\.inner-castle-hotspot-plaque\s*>\s*\.inner-castle-hotspot-title\s*\{(?=[^}]*\bcolor\s*:)(?=[^}]*\bbackground\s*:)[^}]*\}/s,
  "The selected Inner Castle hotspot must continue styling its title face."
);
assert.match(
  stylesSource,
  /\.inner-castle-hotspot:hover\s*>\s*\.inner-castle-hotspot-plaque\s*\{(?=[^}]*\btransform\s*:)(?=[^}]*\bfilter\s*:)[^}]*\}/s,
  "Inner Castle hotspot hover depth must remain on the plaque wrapper."
);
assert.match(
  stylesSource,
  /\.inner-castle-hotspot:focus-visible\s*>\s*\.inner-castle-hotspot-plaque\s*>\s*\.inner-castle-hotspot-title\s*\{(?=[^}]*\boutline\s*:)(?=[^}]*\boutline-offset\s*:)[^}]*\}/s,
  "Inner Castle hotspot keyboard focus must remain visible on the title face."
);
assert.match(
  stylesSource,
  /\.inner-castle-hotspot:active\s*>\s*\.inner-castle-hotspot-plaque,[\s\S]*?\.inner-castle-hotspot\.selected:active\s*>\s*\.inner-castle-hotspot-plaque\s*\{(?=[^}]*\btransform\s*:)[^}]*\}/s,
  "Inner Castle hotspot pressed depth must remain on the plaque wrapper."
);
assert.match(
  stylesSource,
  /#modal\.inner-castle-modal\s+\.inner-castle-hotspot[^}]*\bbackground\s*:\s*transparent\s*!important\s*;/s,
  "Inner Castle hotspot buttons must override the global parchment control backplate."
);
assert.match(
  stylesSource,
  /#modal\.inner-castle-modal\s+\.inner-castle-hotspot-title\s*\{(?=[^}]*\bcolor\s*:\s*#[0-9a-f]{6}\s*!important)(?=[^}]*\bbackground\s*:)[^}]*\}/is,
  "Default Inner Castle plaques must retain high-contrast light text on dark wood."
);
assert.match(
  stylesSource,
  /#modal\.inner-castle-modal\s+:is\([^)]*\.inner-castle-hotspot\.selected[^)]*\.inner-castle-hotspot\[aria-pressed=["']true["']\][^)]*\)\s+\.inner-castle-hotspot-title\s*\{(?=[^}]*\bcolor\s*:\s*#[0-9a-f]{6}\s*!important)(?=[^}]*\bbackground\s*:)[^}]*\}/is,
  "Selected Inner Castle plaques must retain high-contrast light text on burgundy."
);
assert.match(
  stylesSource,
  /\.inner-castle-hotspot-alert\s*\{(?=[^}]*\bbox-sizing\s*:\s*border-box)(?=[^}]*\btop\s*:\s*-6px)(?=[^}]*\bright\s*:\s*-20px)(?=[^}]*\bwidth\s*:\s*16px)(?=[^}]*\bheight\s*:\s*16px)(?=[^}]*\boverflow\s*:\s*visible)(?=[^}]*\bclip-path\s*:\s*none)(?=[^}]*\bborder-radius\s*:\s*50%)[^}]*\}/s,
  "Inner Castle new-gear notifications must render as fully visible 16px circular badges outside the title."
);
assert.doesNotMatch(stylesSource, /\.inner-castle-hotspot-alert\s*\{[^}]*\binset\s*:\s*-6px\s+-6px/s, "The clipped legacy alert inset must not return.");
assert.match(
  gameSource,
  /state\?\.gear\?\.newMarkers\?\.\[building\.key\][\s\S]*inner-castle-hotspot-alert[\s\S]*New gear/,
  "Inner Castle notification badges must remain driven by the existing newMarkers state."
);
assert.doesNotMatch(
  gameSource,
  /class="common-gear-alert"\s+aria-label="New gear"/,
  "Inner Castle markers must not reuse the globally paneled Common Gear alert class."
);

const clamp = (minimum, value, maximum) => Math.min(maximum, Math.max(minimum, value));
const alertSize = 16;
const alertGap = 4;
const responsiveGeometry = [
  { name: "desktop 1200x800", viewportWidth: 1200, sceneWidth: 640, plaqueWidth: clamp(72, 1200 * .08, 96), plaqueHeight: 30 },
  { name: "mobile landscape 844x390", viewportWidth: 844, sceneWidth: 390 * 4 / 3 - 160, plaqueWidth: clamp(58, 844 * .11, 80), plaqueHeight: 28 },
  { name: "narrow landscape 540x320", viewportWidth: 540, sceneWidth: 320 * 4 / 3 - 128, plaqueWidth: clamp(58, 540 * .11, 80), plaqueHeight: 28 },
];
for (const geometry of responsiveGeometry) {
  const titleRight = geometry.plaqueWidth;
  const alertLeft = geometry.plaqueWidth + alertGap;
  const alertRightFromHotspot = geometry.plaqueWidth / 2 + alertGap + alertSize;
  const availableRightSpace = geometry.sceneWidth * (1 - HOTSPOTS.get("royal-stables").left / 100);
  const alertTopFromScene = geometry.sceneWidth * .75 * (HOTSPOTS.get("great-hall").top / 100) - geometry.plaqueHeight / 2 - 6;
  assert.equal(alertLeft - titleRight, alertGap, `${geometry.name} must keep a 4px gap between title and alert.`);
  assert.ok(alertLeft >= titleRight, `${geometry.name} alert must not overlap title text.`);
  assert.ok(alertRightFromHotspot < availableRightSpace, `${geometry.name} must keep the full rightmost alert inside the scene.`);
  assert.ok(alertTopFromScene >= 0, `${geometry.name} must keep the full topmost alert inside the scene.`);
}

for (const building of BUILDINGS) {
  assert.match(
    visualQaSource,
    new RegExp(`data-inner-castle-building=["']${escapeRegExp(building.key)}["']`),
    `${building.label} is missing from the Inner Castle alert visual QA page.`
  );
}
for (const markedBuilding of ["treasury", "gatehouse", "royal-stables"]) {
  assert.match(
    visualQaSource,
    new RegExp(`data-inner-castle-building=["']${markedBuilding}["'][\\s\\S]*?inner-castle-hotspot-title[\\s\\S]*?</span>[\\s\\S]*?inner-castle-hotspot-alert[\\s\\S]*?</button>`),
    `${markedBuilding} must show an active sibling alert in the visual QA page.`
  );
}
assert.match(visualQaSource, />Royal Stables<\/span>/, "The long Royal Stables title must remain represented in visual QA.");
assert.match(indexSource, /<dialog id="modal" class="modal" aria-labelledby="modalTitle">/, "The shared modal must be labelled by its title.");
assert.match(indexSource, new RegExp(`name="crownlands-build" content="${BUILD_ID}"`), "The document build ID is stale.");
assert.match(indexSource, new RegExp(`styles\\.css\\?v=${STYLE_BUILD_ID}`), "The Inner Castle stylesheet cache tag is stale.");
assert.match(indexSource, new RegExp(`common-gear-ui\\.js\\?v=${GEAR_UI_BUILD_ID}`), "The Inner Castle UI cache tag is stale.");
assert.match(indexSource, new RegExp(`game\\.js\\?v=${GAME_BUILD_ID}`), "The Inner Castle game-script cache tag is stale.");
assert.match(workerSource, new RegExp(`const CACHE_VERSION = "${BUILD_ID}";`), "The service-worker cache version is stale.");
assert.match(workerSource, new RegExp(`/styles\\.css\\?v=${STYLE_BUILD_ID}`), "The service worker has the wrong stylesheet version.");
assert.match(workerSource, new RegExp(`/game\\.js\\?v=${GAME_BUILD_ID}`), "The service worker has the wrong game-script version.");

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

console.log("Validated the six-building Inner Castle hub, Profile Overview entry, unclipped alert geometry at desktop and two landscape widths, four server-authoritative gear screens, access guard, modal lifecycle, artwork delivery, and cache tags.");
