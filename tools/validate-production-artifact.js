const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const ITCH_DOCUMENT_URL = new URL("https://html-classic.itch.zone/html/18910922/index.html");
const ITCH_DIRECTORY_PATH = new URL(".", ITCH_DOCUMENT_URL).pathname;
const required = [
  "index.html", "styles.css", "interface-theme.css", "common-gear-ui.css", "common-gear-ui.js", "ui-contrast-correction.css", "profile-theme.css", "crownlands-palette.css", "action-buttons.css", "mobile-viewport.css", "player-flag-editor.css", "clan-heraldry-v2.css", "chat.css", "chat-ui.js", "game.js", "base-cities.js", "instant-economy-actions.js", "firebaseClient.js", "animation-manager.js", "release-manifest.js",
  "home.html", "world.html", "community.html", "guides.html", "how-to-play.html", "updates.html", "support.html", "privacy.html", "terms.html", "game-rules.html", "sitemap.xml", "robots.txt", "site-info.css", "public-site.js",
  "roadmap.html", "roadmap.css", "roadmap-data.js", "roadmap.js",
  "assets/map-editor-data.js", "assets/flag-symbols/runtime.svg", "assets/clan-heraldry/art-set-v1/manifest.json", "assets/clan-heraldry/art-set-v1/charges-full.svg", "assets/clan-heraldry/art-set-v1/charges-micro.svg", "assets/worlds/world_01/map-manifest.json", "audio/manifest.json", "functions/clanQuestPeriod.js", "functions/playerFlagConfig.js", "functions/flagRenderer.js", "functions/clanHeraldryConfig.js", "functions/clanHeraldryAssets.js", "functions/clanHeraldryLegacyV1.js", "functions/clanHeraldryRenderer.js",
  "artifact-manifest.json",
];
const forbidden = [
  "tools", "functions/index.js", "functions/package.json", "assets/camps",
  "assets/castles", "assets/inner-castle", "assets/optimized/manifest.json",
  "assets/worlds/world_01/regions", "assets/worlds/world_01/world-layout.json",
];

for (const relativePath of required) {
  if (!fs.existsSync(path.join(dist, relativePath))) throw new Error(`Production artifact is missing ${relativePath}.`);
}
for (const relativePath of forbidden) {
  if (fs.existsSync(path.join(dist, relativePath))) throw new Error(`Production artifact includes forbidden source data ${relativePath}.`);
}

const heraldryManifest = JSON.parse(fs.readFileSync(
  path.join(dist, "assets", "clan-heraldry", "art-set-v1", "manifest.json"),
  "utf8",
));
const expectedHeraldryCharges = [
  "none", "crown", "lion", "eagle", "dragon", "wolf", "stag", "bear", "crossed-swords",
  "gauntlet", "fleur-de-lis", "oak-tree", "war-horn", "battering-ram", "fortress-keep", "watchtower", "portcullis",
];
if (JSON.stringify(heraldryManifest.stableChargeIds) !== JSON.stringify(expectedHeraldryCharges)) {
  throw new Error("Production clan heraldry manifest must contain the final 16-charge catalog plus none.");
}
if (JSON.stringify(heraldryManifest).includes("artworkPending")) {
  throw new Error("Production clan heraldry manifest must not contain pending artwork state.");
}

const productionMapManifest = JSON.parse(fs.readFileSync(
  path.join(dist, "assets", "worlds", "world_01", "map-manifest.json"),
  "utf8",
));
if (productionMapManifest.maps?.length !== 20 || productionMapManifest.editableSourcesExcluded !== true) {
  throw new Error("Production map manifest must contain 20 immutable runtime entries without editable sources.");
}
for (const entry of productionMapManifest.maps) {
  if (entry.source || !/^assets\/worlds\/world_01\/maps\/versioned\/[\w-]+-[0-9a-f]{12}\.webp$/.test(entry.output || "")) {
    throw new Error(`${entry.id || "Unknown region"} has an invalid production gameplay map entry.`);
  }
}

const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolutePath);
    else files.push(absolutePath);
  }
}
collect(dist);
if (files.some(filePath => path.extname(filePath).toLowerCase() === ".wav")) {
  throw new Error("Production artifact contains WAV source masters.");
}
const totalBytes = files.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
if (totalBytes > 25 * 1024 * 1024) {
  throw new Error(`Production artifact exceeds 25 MiB (${(totalBytes / 1024 / 1024).toFixed(2)} MiB).`);
}

for (const absolutePath of files.filter(filePath => /\.(?:html|css|js|json)$/i.test(filePath))) {
  if (absolutePath.endsWith(`${path.sep}audio${path.sep}manifest.json`)) continue;
  const source = fs.readFileSync(absolutePath, "utf8");
  for (const match of source.matchAll(/["'(]((?:\/?assets|\/?audio)\/[A-Za-z0-9_./-]+)(?:\?[^"')\s]*)?["')]/g)) {
    const requested = match[1].replace(/^\//, "");
    if (requested.endsWith("/")) continue;
    if (!fs.existsSync(path.join(dist, requested))) {
      throw new Error(`${path.relative(dist, absolutePath)} references missing runtime asset ${requested}.`);
    }
  }
}

const productionIndex = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const rootBaseTag = productionIndex.match(/<base\b[^>]*\bhref\s*=\s*(["'])\/\1[^>]*>/i);
if (rootBaseTag) {
  throw new Error("Production index must not set <base href=\"/\">; itch serves the game from an upload subdirectory.");
}

const baseHrefMatch = productionIndex.match(/<base\b[^>]*\bhref\s*=\s*(["'])([^"']+)\1[^>]*>/i);
if (!baseHrefMatch || baseHrefMatch[2] !== "./") {
  throw new Error("Production index must use a directory-relative <base href=\"./\"> for itch uploads.");
}
if (!/document\.getElementById\(["']crownlandsBase["']\)\.href\s*=\s*["']\/["']/.test(productionIndex)) {
  throw new Error("Production index must preserve the Netlify /play/ rewrite by switching its base to the site root.");
}
const effectiveDocumentUrl = baseHrefMatch
  ? new URL(baseHrefMatch[2], ITCH_DOCUMENT_URL)
  : ITCH_DOCUMENT_URL;
const indexedRuntimeFiles = new Set();
const resourceAttributes = [
  ["link", "href"],
  ["script", "src"],
  ["img", "src"],
  ["source", "src"],
];

for (const [tagName, attributeName] of resourceAttributes) {
  const attributePattern = new RegExp(
    `<${tagName}\\b[^>]*\\b${attributeName}\\s*=\\s*(["'])([^"']+)\\1`,
    "gi",
  );
  for (const match of productionIndex.matchAll(attributePattern)) {
    const requestedUrl = match[2].trim();
    if (
      !requestedUrl
      || requestedUrl.startsWith("#")
      || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(requestedUrl)
    ) {
      continue;
    }

    const resolvedUrl = new URL(requestedUrl, effectiveDocumentUrl);
    if (
      resolvedUrl.origin !== ITCH_DOCUMENT_URL.origin
      || !resolvedUrl.pathname.startsWith(ITCH_DIRECTORY_PATH)
    ) {
      throw new Error(
        `Production index ${tagName}[${attributeName}] ${requestedUrl} escapes the itch upload directory (${resolvedUrl.href}).`,
      );
    }

    const relativePath = decodeURIComponent(resolvedUrl.pathname.slice(ITCH_DIRECTORY_PATH.length));
    const localPath = path.resolve(dist, relativePath.replace(/\//g, path.sep));
    if (!localPath.startsWith(`${dist}${path.sep}`) || !fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) {
      throw new Error(
        `Production index ${tagName}[${attributeName}] ${requestedUrl} does not resolve to a packaged file from an itch upload subdirectory.`,
      );
    }
    indexedRuntimeFiles.add(relativePath);
  }
}

for (const coreFile of ["styles.css", "firebaseClient.js", "game.js", "assets/map-editor-data.js"]) {
  if (!indexedRuntimeFiles.has(coreFile)) {
    throw new Error(`Production index did not expose required itch-relative runtime file ${coreFile}.`);
  }
}

console.log(
  `Production artifact validation passed (${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; ${indexedRuntimeFiles.size} itch-relative index resources).`,
);
