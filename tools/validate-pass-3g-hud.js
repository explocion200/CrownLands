const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

const html = read("index.html");
const css = `${read("styles.css")}\n${read("interface-theme.css")}`;
const game = read("game.js");
const worker = read("service-worker.js");
const publicHome = read("home.html");
const publicGuides = read("guides.html");
const manifest = JSON.parse(read("assets/optimized/manifest.json"));
const pwa = JSON.parse(read("manifest.webmanifest"));
const assets = new Map(manifest.assets.map(asset => [asset.id, asset]));
const buildIdMatch = html.match(/<meta name="crownlands-build" content="([^"]+)"/);
if (!buildIdMatch) throw new Error("Current Crownlands build id is missing from index.html");
const buildId = buildIdMatch[1];

const expected = new Map([
  ["loading-ring", [256, 256]], ["loading-crown", [256, 256]],
  ["hud-leaderboard", [192, 192]], ["hud-city-list", [192, 192]], ["hud-map", [192, 192]],
  ["hud-shop", [192, 192]], ["hud-bag", [192, 192]], ["hud-report", [192, 192]],
  ["hud-achievements", [192, 192]], ["hud-profile-frame", [256, 200]],
  ["hud-map-switch-arrow", [192, 212]], ["daily-reward", [160, 160]],
]);

const pngMetadata = relativePath => {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    throw new Error(`Invalid PNG signature: ${relativePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
    hasTransparencyChunk: buffer.includes(Buffer.from("tRNS")),
  };
};

for (const [id, [width, height]] of expected) {
  const asset = assets.get(id);
  if (!asset) throw new Error(`Missing optimized Pass 3G asset: ${id}`);
  if (asset.width !== width || asset.height !== height || asset.hasAlpha !== true) {
    throw new Error(`Invalid ${id} canvas: ${asset.width}x${asset.height}, alpha=${asset.hasAlpha}`);
  }
  if (!fs.existsSync(path.join(root, asset.output))) throw new Error(`Missing optimized output: ${asset.output}`);
  if (![html, css, game, worker, publicHome, publicGuides].some(source => source.includes(asset.output))) {
    throw new Error(`No runtime reference found for ${id}: ${asset.output}`);
  }
}

requireMatch(html, new RegExp(buildId), "Pass 3G build id is missing from index.html");
requireMatch(worker, new RegExp(`CACHE_VERSION = "${buildId}"`), "Service worker cache was not advanced for Pass 3G");
requireMatch(html, /theme-color" content="#5a262b"/, "Browser theme color does not match the installed identity");
requireMatch(css, /dailyRewardLedgerLift[\s\S]*operationDispatchPulse[\s\S]*loadingCrownSettle/, "Pass 3G physical HUD states are incomplete");
requireMatch(html, /crownlands-favicon-32\.png/, "The dedicated Crownlands favicon is not linked");
requireMatch(game, /hud-map-switch-arrow-192x212-[a-f0-9]+\.webp/, "Map switch arrow did not retain the 192x212 runtime canvas");

for (const icon of pwa.icons) {
  const relativePath = icon.src.replace(/^\//, "");
  const iconPath = path.join(root, relativePath);
  if (!fs.existsSync(iconPath)) throw new Error(`Missing PWA icon: ${icon.src}`);
  const [expectedWidth, expectedHeight] = icon.sizes.split("x").map(Number);
  const metadata = pngMetadata(relativePath);
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    throw new Error(`Invalid PWA icon dimensions for ${icon.src}: ${metadata.width}x${metadata.height}`);
  }
  if ([4, 6].includes(metadata.colorType) || metadata.hasTransparencyChunk) {
    throw new Error(`PWA icon must remain opaque: ${icon.src}`);
  }
}
const favicon = pngMetadata("assets/icons/crownlands-favicon-32.png");
if (favicon.width !== 32 || favicon.height !== 32) throw new Error("The Crownlands favicon is not 32x32");
if (pwa.background_color !== "#17110d" || pwa.theme_color !== "#5a262b") {
  throw new Error("PWA colors do not match the Pass 3G Crownlands identity");
}

const visibleRuntime = [html, game].join("\n");
const bannedEmoji = /[⚔🐎🔭👑🛡🏰📜🎵🔊🔇]/u;
if (bannedEmoji.test(visibleRuntime)) throw new Error("A visible emoji gameplay icon remains in the main runtime");

console.log("Pass 3G HUD, loading, navigation, icon, and PWA identity validation passed.");
