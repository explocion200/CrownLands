const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath));
const text = relativePath => read(relativePath).toString("utf8");
const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const manifest = JSON.parse(text("assets/optimized/manifest.json")).assets;
const buildId = "20260812-pre-pass-4a-gameplay-maps-r2";

const exactSources = [
  ["assets/leaderboard-icon.png", "docs/visual-qa/pass-3g/old-assets/leaderboard-icon.png"],
  ["assets/daily-reward-icon-cutout.webp", "docs/visual-qa/pass-3g/old-assets/daily-reward-icon-cutout.webp"],
  ["assets/profile-hud-frame.png", "docs/visual-qa/pass-3g/old-assets/profile-hud-frame.png"],
  ["assets/report-icon.png", "docs/visual-qa/pass-3g/old-assets/report-icon.png"],
  ["assets/map-transition-clouds.png", "docs/visual-qa/pass-4a/old-assets/map-transition-clouds.png"],
];

for (const [active, archived] of exactSources) {
  assert(fs.existsSync(path.join(root, active)), `${active} is missing.`);
  assert(fs.existsSync(path.join(root, archived)), `${archived} rollback source is missing.`);
  assert.equal(sha256(read(active)), sha256(read(archived)), `${active} is not an exact rollback match.`);
}

const requiredManifestSources = exactSources.map(([active]) => active);
for (const source of requiredManifestSources) {
  const asset = manifest.find(entry => entry.source === source);
  assert(asset, `${source} has no optimized manifest entry.`);
  assert(fs.existsSync(path.join(root, asset.output)), `${asset.output} is missing.`);
  assert.equal(sha256(read(asset.output)), asset.sha256, `${asset.output} hash differs from the manifest.`);
}

const css = `${text("styles.css")}\n${text("interface-theme.css")}`;
const html = text("index.html");
const game = text("game.js");
const worker = text("service-worker.js");
const transition = manifest.find(entry => entry.source === "assets/map-transition-clouds.png");
assert(html.includes(transition.output) && css.includes(transition.output), "Transition cloud runtime references are stale.");
assert(css.includes("rgba(216, 199, 161, .58)"), "Warm map-arrow highlight is missing.");
assert(css.includes("rgba(203, 183, 143, .1)"), "Warm map-arrow bloom is missing.");
assert(css.includes(".profile-action-row") && css.includes("background: transparent"), "Top HUD transparency correction is missing.");
assert(css.includes("#f1e6cc") && css.includes("#211c16"), "Readability tokens are missing from the correction layer.");
assert(game.includes('class="send-icon" aria-hidden="true">${renderCrownlandsIcon(commandIcon)}'), "Troop confirmation does not use the Crownlands SVG icon wrapper.");
assert(html.includes(buildId), "index.html does not contain the Pass 4A-R build id.");
assert(worker.includes(`CACHE_VERSION = "${buildId}"`), "service-worker.js does not contain the Pass 4A-R cache id.");

const staleHashes = ["803e3d04d3d6", "dd344c3a942e", "484a9b8f8760", "0bfa8a7a8094", "c3f1dcb583ef"];
const runtimeText = [html, css, game, worker].join("\n");
for (const hash of staleHashes) assert(!runtimeText.includes(hash), `Stale rejected asset hash ${hash} remains in runtime sources.`);

console.log("Pass 4A-R correction validation passed: exact source rollbacks, optimized mappings, warm arrow treatment, transparent HUD controls, readability tokens, and cache id are current.");
