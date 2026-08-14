const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("mobile-viewport.css");
const index = read("index.html");
const worker = read("service-worker.js");
const game = read("game.js");
const builder = read("tools/build-production-client.js");
const manifestBuilder = read("tools/generate-release-manifest.js");
const artifactValidator = read("tools/validate-production-artifact.js");
const budgetValidator = read("tools/validate-asset-performance-budgets.js");
const visualIndex = read("docs/visual-qa/mobile-viewport/index.html");
const visualFrame = read("docs/visual-qa/mobile-viewport/frame.html");

assert.ok(Buffer.byteLength(css) <= 16 * 1024, "The mobile viewport layer exceeds its 16 KiB budget.");
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, "The mobile viewport CSS has unbalanced braces.");

assert.match(css, /--cl-mobile-ui-top:\s*max\([^;]*env\(safe-area-inset-top/, "Mobile UI does not respect the top safe area.");
assert.match(css, /--cl-mobile-ui-bottom:\s*max\([^;]*env\(safe-area-inset-bottom/, "Mobile UI does not respect the bottom safe area.");
assert.match(css, /--cl-mobile-ui-height:\s*calc\(100dvh/, "Mobile UI is not bounded to the dynamic viewport.");
assert.match(css, /@supports not \(height: 100dvh\)[\s\S]*?100vh/, "Older mobile browsers are missing a viewport-height fallback.");

assert.match(css, /\.modal:not\(\.level-up-reward-modal\) > \.modal-card[\s\S]*?max-height:\s*var\(--cl-mobile-ui-height\) !important;[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\);[\s\S]*?overflow:\s*hidden;/, "Shared modal cards are not constrained to a scrollable mobile grid.");
assert.match(css, /\.modal:not\(\.level-up-reward-modal\) > \.modal-card #modalBody[\s\S]*?overflow-y:\s*auto !important;[\s\S]*?-webkit-overflow-scrolling:\s*touch;[\s\S]*?scroll-padding-block:/, "Shared modal content cannot reliably scroll to its bottom edge on touch devices.");

for (const uiClass of [
  "daily-login-reward-modal",
  "inner-castle-modal",
  "common-gear-box-modal",
  "common-gear-building-modal",
]) assert.ok(css.includes(`.${uiClass}`), `${uiClass} is missing its hidden-overflow escape.`);

for (const profileView of [
  "profile-view",
  "profile-skills-view",
  "profile-settings-view",
  "clan-view",
  "flag-editor-view",
]) assert.ok(css.includes(`.${profileView}`), `${profileView} is missing shared mobile scrolling.`);

assert.match(css, /\.commander-panel\.visible[\s\S]*?max-height:\s*calc\(100dvh[\s\S]*?overflow-y:\s*auto;/, "The selected-objective panel can still extend below a short phone viewport.");
assert.match(css, /\.level-up-reward-modal \.level-up-reward-card[\s\S]*?max-height:\s*var\(--cl-mobile-ui-height\);/, "The level-up screen is not constrained to the mobile viewport.");
assert.match(css, /\.level-up-reward-modal \.level-up-reward-body[\s\S]*?overflow-y:\s*auto;/, "The level-up reward body is not scrollable.");

const modalClasses = new Set([
  ...game.matchAll(/modal\.classList\.add\("([^"]+-modal)"\)/g),
  ...game.matchAll(/modal\.className\s*=\s*"[^"]*?([a-z0-9-]+-modal)[^"]*"/g),
].map(match => match[1]));
assert.ok(modalClasses.size >= 20, "The reusable modal audit no longer covers the complete UI family.");
assert.ok(css.includes(".modal:not(.level-up-reward-modal)"), "Dynamic modal classes are not protected by the shared mobile rule.");

const releaseId = "20260814-readability-r38";
const styleTag = `mobile-viewport.css?v=${releaseId}`;
assert.ok(index.includes(styleTag), "The mobile viewport layer is not loaded by the game.");
assert.ok(index.indexOf(styleTag) > index.indexOf("action-buttons.css"), "The mobile viewport layer must load after every existing game theme.");
assert.ok(worker.includes(`/${styleTag}`), "The mobile viewport layer is missing from the offline shell.");
assert.ok(worker.includes(`CACHE_VERSION = "${releaseId}"`), "The mobile viewport release does not restart stale clients.");
for (const source of [builder, manifestBuilder, artifactValidator, budgetValidator]) {
  assert.ok(source.includes("mobile-viewport.css"), "The mobile viewport layer is missing from production packaging or budgets.");
}

assert.match(visualIndex, /iframe \{ width: 390px; height: 620px;/, "The visual QA matrix does not provide a real phone-sized CSS viewport.");
for (const target of ["reports", "daily", "profile", "gear"]) {
  assert.ok(visualIndex.includes(`frame.html#${target}`), `The visual QA matrix is missing its ${target} phone frame.`);
  assert.ok(visualFrame.includes(`id="${target}"`), `The visual QA frame is missing the ${target} screen.`);
}
assert.ok(visualFrame.indexOf("mobile-viewport.css") > visualFrame.indexOf("action-buttons.css"), "Visual QA does not exercise the final cascade order.");
assert.equal((visualFrame.match(/class="[^"]*qa-bottom/g) || []).length, 4, "Every long mobile QA screen needs a bottom-edge reachability marker.");

console.log(`Validated mobile viewport access for ${modalClasses.size} modal types, five Profile views, rewards, gear, Inner Castle, level-up, setup, and commander UI.`);
