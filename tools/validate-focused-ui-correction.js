const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const index = read("index.html");
const styles = `${read("styles.css")}\n${read("interface-theme.css")}`;
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
assert.match(
  index,
  /id="outgoingAttackBtn"[\s\S]{0,260}?<span aria-hidden="true">&#10148;<\/span>/,
  "The Outgoing Marches button must use its original heavy forward arrow.",
);
assert.match(
  index,
  /id="incomingAttackBtn"[\s\S]{0,260}?<span aria-hidden="true">&#9876;<\/span>/,
  "The Incoming Attacks and Scouts button must use its original crossed-swords icon.",
);
assert.doesNotMatch(
  index,
  /id="(?:outgoing|incoming)AttackBtn"[\s\S]{0,260}?<use href="#cl-icon-(?:outgoing|incoming)">/,
  "The operation buttons still use the replacement diagonal-arrow SVGs.",
);
assert.match(
  styles,
  /\.fullscreen-btn\.active,\s*\n\.main-city-return\s*\{[\s\S]{0,420}?color:\s*var\(--cl-ivory\);[\s\S]{0,220}?background:\s*linear-gradient\(180deg,\s*#59534a,\s*#2b2925\);/,
  "Fullscreen exit and Home City controls must share the iron-and-ivory button treatment.",
);
assert.match(
  styles,
  /\.main-city-return \.main-city-return-arrow\s*\{\s*color:\s*var\(--cl-ivory\);\s*\}/,
  "The Home City direction arrow must use the fullscreen control's ivory icon color.",
);
assert.doesNotMatch(index, /login-brand-title/, "The login screen still renders a typed-over title layer.");
assert.match(
  styles,
  /\.setup-screen::before\s*\{[\s\S]*?width:\s*var\(--login-art-width\);[\s\S]*?height:\s*var\(--login-art-height\);[\s\S]*?border:\s*1px solid/,
  "The login artwork is missing its contained-image frame.",
);
assert.match(
  styles,
  /\.top-hud::before\s*\{[\s\S]*?left:\s*calc\(0px - max\(\.75rem, env\(safe-area-inset-left\)\)\);[\s\S]*?right:\s*calc\(0px - max\(\.75rem, env\(safe-area-inset-right\)\)\);[\s\S]*?background:\s*var\(--top-hud-shade\);/,
  "The main-game top shade must extend through both HUD safe-area offsets.",
);
assert.match(
  game,
  /class="city-wheel-action wheel-send"[\s\S]{0,320}?renderCrownlandsIcon\("forward"\)/,
  "The player-city Send action must use the restored forward arrow.",
);
assert.doesNotMatch(
  game,
  /class="city-wheel-action wheel-send"[\s\S]{0,320}?renderCrownlandsIcon\("outgoing"\)/,
  "The player-city Send action still uses the diagonal outgoing arrow.",
);
assert.match(
  styles,
  /\.city-wheel-action\s*\{[\s\S]{0,300}?background:\s*linear-gradient\(180deg,\s*#1e628a,\s*#082a46\);/,
  "The city action wheel must retain its former blue base palette.",
);
assert.match(
  styles,
  /\.wheel-send,\s*\n\.wheel-attack\s*\{[\s\S]{0,220}?background:\s*linear-gradient\(180deg,\s*var\(--ui-gold-bright\),\s*#a8691b\);/,
  "The city Send and Attack buttons must retain their former gold palette.",
);

const loginAsset = manifest.assets.find(asset => asset.id === "login-background");
assert.ok(loginAsset, "The optimized login background is missing from the manifest.");
assert.equal(loginAsset.source, "assets/game-menu-background.jpg");
assert.equal(loginAsset.width, 1448);
assert.equal(loginAsset.height, 1086);
assert.ok(fs.existsSync(path.join(root, loginAsset.output)), "The optimized login background does not exist.");
assert.ok(index.includes(loginAsset.output), "The login preload does not reference the manifest output.");
assert.ok(styles.includes(loginAsset.output), "The login screen does not reference the manifest output.");

console.log("Validated the focused login, HUD, Home City, and city-action-wheel corrections.");
