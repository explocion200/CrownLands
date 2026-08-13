const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const game = read("game.js");
const styles = `${read("styles.css")}\n${read("interface-theme.css")}`;
const publicStyles = read("site-info.css");
const editorStyles = read("tools/map-editor/styles.css");
const editorHud = read("tools/map-editor/hud-editor.js");
const serviceWorker = read("service-worker.js");
const indexHtml = read("index.html");
const cacheVersion = indexHtml.match(/<meta\s+name="crownlands-build"\s+content="([^"]+)"/)?.[1] || "";
assert.ok(cacheVersion, "The game HTML must expose its deployed build ID.");

assert.match(publicStyles, /--page-parchment:\s*#d7c69d/);
assert.match(publicStyles, /--page-burgundy:\s*#6d2d35/);
assert.match(publicStyles, /\.content-section,[\s\S]*repeating-linear-gradient/);
assert.match(publicStyles, /@media \(max-width:\s*480px\)/);
assert.match(publicStyles, /max-height:\s*500px\)[\s\S]*orientation:\s*landscape/);
assert.doesNotMatch(publicStyles, /backdrop-filter/);
assert.doesNotMatch(publicStyles, /border-radius:\s*(?:1[0-9]|2[0-9]|999)px/);

assert.match(game, /const FLAG_DYE_TREATMENTS = Object\.freeze/);
assert.match(game, /element\.style\.setProperty\("--flag-primary", primaryDye\.display\)/);
assert.match(game, /data-flag-color="\$\{color\}"/);
assert.match(game, /FLAG_COLORS\.includes\(flag\?\.primary\)/);
assert.match(game, /FLAG_COLORS\.includes\(flag\?\.secondary\)/);
assert.match(game, /clan-shield-planks/);
assert.match(game, /async function saveFlagEditor\(\)/);
assert.match(game, /syncPlayerIdentityToAllOwnedCities/);
assert.match(game, /async function saveClanShieldEditor\(\)/);
assert.match(game, /updateClanProfile\(\{ shield \}\)/);
assert.match(styles, /Pass 4B: secondary heraldry workspaces and dispatch states/);
assert.match(styles, /--flag-swatch/);
assert.match(`${publicStyles}\n${styles}`, /\.patch-note-post\.is-current[\s\S]*border-left:\s*7px solid var\(--page-burgundy\)/);
assert.doesNotMatch(styles, /\.setup-card::after/, "The login card must not render a decorative status orb.");

assert.match(serviceWorker, new RegExp(cacheVersion));
assert.match(indexHtml, new RegExp(cacheVersion));

const publicColorVariables = vm.runInNewContext(`(() => {
  const match = ${JSON.stringify(publicStyles)}.match(/:root\\s*\\{([\\s\\S]*?)\\}/);
  return match ? match[1] : "";
})()`);
assert.doesNotMatch(publicColorVariables, /#061321|#0b2237|#79d6e8|#9bd8ff/);

assert.match(editorStyles, /--bg:\s*#201711/);
const editorComponentCatalog = editorHud.slice(editorHud.indexOf("const COMPONENTS"), editorHud.indexOf("const COMPONENT_MAP"));
assert.doesNotMatch(editorComponentCatalog, /[♔⛶⌂➤⚔]/u);

console.log("Pass 4B visual validation passed: public materials, heraldry data compatibility, persistence paths, secondary states, and retained editor styling are intact.");
