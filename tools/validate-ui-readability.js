const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const index = read("index.html");
const css = read("readability.css");
const worker = read("service-worker.js");
const build = read("tools/build-production-client.js");
const releaseId = "20260819-player-flags-v2-r1";
const buildId = "20260825-shop-hourly-prices-r1";
const gameBuildId = "20260825-clan-shield-colors-r1";

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
  return .2126 * channel(channels[0]) + .7152 * channel(channels[1]) + .0722 * channel(channels[2]);
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

const dailyIndex = index.indexOf("daily-rewards.css");
const readabilityIndex = index.indexOf(`readability.css?v=${releaseId}`);
if (dailyIndex < 0 || readabilityIndex <= dailyIndex) {
  throw new Error("The readability contract must load after daily-rewards.css.");
}

requireMatch(index, new RegExp(`crownlands-build\" content=\"${buildId}`), "The page build stamp is stale.");
requireMatch(index, new RegExp(`game\\.js\\?v=${gameBuildId}`), "The game script cache stamp is stale.");
requireMatch(worker, new RegExp(`CACHE_VERSION = \"${buildId}\"`), "The service-worker cache version is stale.");
requireMatch(worker, new RegExp(`readability\\.css\\?v=${releaseId}`), "The service worker does not cache the readability contract.");
requireMatch(build, /"readability\.css"/, "The production client does not include readability.css.");

const requiredCoverage = [
  "--cl-readable-paper", ".profile-screen", ".audio-channel-card", ".shop-item",
  ".inventory-slot", ".troop-route-city", ".battle-report-card", ".camp-info-tab-panel",
  ".clan-panel", ".daily-mission-row", ".seasonal-achievement-row", ".toast",
  "[role=\"tooltip\"]", ".city-label", ".offline-reward-modal", "max-height: 560px"
];
for (const token of requiredCoverage) {
  if (!css.includes(token)) throw new Error(`Readability coverage is missing ${token}.`);
}

const braces = [...css].reduce((state, character) => {
  if (character === "{") state.open += 1;
  if (character === "}") state.close += 1;
  return state;
}, { open: 0, close: 0 });
if (braces.open !== braces.close) throw new Error("readability.css has unbalanced braces.");

const contrastPairs = [
  ["paper body", "#211a13", "#c1ae7f", 7],
  ["paper secondary", "#4f3f2d", "#c1ae7f", 4.5],
  ["dark body", "#f3ead5", "#2a1d14", 7],
  ["dark secondary", "#d2c3a3", "#2a1d14", 4.5],
  ["primary action", "#fff8e7", "#502226", 7],
  ["Welcome Back body", "#f4ead4", "#0b2031", 7],
  ["Welcome Back secondary", "#cad9df", "#0b2031", 4.5],
  ["Welcome Back action", "#fff8e8", "#542728", 7],
  ["Detailed Victory", "#fffdf5", "#58735f", 4.5],
  ["Detailed Defeat", "#fff9ef", "#62504d", 4.5],
  ["Incoming march text", "#fff8e8", "#8a3934", 4.5],
  ["Outgoing march text", "#fff8e8", "#3e5664", 4.5]
];

for (const [label, foreground, background, minimum] of contrastPairs) {
  const ratio = contrast(foreground, background);
  if (ratio < minimum) throw new Error(`${label} contrast ${ratio.toFixed(2)} is below ${minimum}.`);
  console.log(`${label}: ${ratio.toFixed(2)}:1`);
}

console.log("Validated final stylesheet order, screen-family coverage, balanced CSS, PWA delivery, and representative contrast ratios.");
