const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const index = read("index.html");
const styles = read("styles.css");
const game = read("game.js");
const manifest = JSON.parse(read("assets/optimized/manifest.json"));

assert.match(
  index,
  /id="mainCityReturnBtn"[\s\S]*?main-city-return-arrow[^>]*>[\s\S]*?&#9658;[\s\S]*?main-city-return-house[^>]*>[\s\S]*?&#8962;/,
  "The Main City return control must use the restored arrow and home symbols.",
);
assert.doesNotMatch(
  index,
  /id="mainCityReturnBtn"[\s\S]*?assets\/icons\/crownlands-icon-192\.png/,
  "The Main City return control still uses the PWA icon.",
);
assert.match(
  game,
  /mainCityReturnBtn\.addEventListener\("click", returnToMainCity\)/,
  "The Main City return behavior must remain wired to returnToMainCity.",
);
assert.doesNotMatch(index, /login-brand-title/, "The login screen still renders a typed-over title layer.");
assert.match(
  styles,
  /\.setup-screen::before\s*\{[\s\S]*?width:\s*var\(--login-art-width\);[\s\S]*?height:\s*var\(--login-art-height\);[\s\S]*?border:\s*1px solid/,
  "The login artwork is missing its contained-image frame.",
);

const loginAsset = manifest.assets.find(asset => asset.id === "login-background");
assert.ok(loginAsset, "The optimized login background is missing from the manifest.");
assert.equal(loginAsset.source, "assets/game-menu-background.jpg");
assert.equal(loginAsset.width, 1448);
assert.equal(loginAsset.height, 1086);
assert.ok(fs.existsSync(path.join(root, loginAsset.output)), "The optimized login background does not exist.");
assert.ok(index.includes(loginAsset.output), "The login preload does not reference the manifest output.");
assert.ok(styles.includes(loginAsset.output), "The login screen does not reference the manifest output.");

console.log("Validated the restored Home City icon, preserved return behavior, baked login title, and responsive artwork frame.");
