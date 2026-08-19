const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const index = read("index.html");
const styles = `${read("styles.css")}\n${read("interface-theme.css")}\n${read("ui-contrast-correction.css")}\n${read("action-buttons.css")}`;
const game = read("game.js");
const layoutRuntime = read("ui-layout-runtime.js");
const benchmarkRuntime = read("tools/map-benchmark/injected-runtime.js");
const benchmarkFirebase = read("tools/map-benchmark/mock-firebase.js");
const manifest = JSON.parse(read("assets/optimized/manifest.json"));

assert.match(
  index,
  /id="mainCityReturnBtn"[\s\S]*?main-city-return-arrow[^>]*>[\s\S]*?&#9658;[\s\S]*?main-city-return-house[^>]*>[\s\S]*?&#8962;/,
  "The Main City return control must use the restored arrow and home symbols.",
);
assert.match(
  index,
  /<div class="resource-bar">[\s\S]{0,500}?id="mainCityReturnBtn"[\s\S]{0,500}?id="fullscreenBtn"/,
  "Home must start immediately before fullscreen in the top-right control group.",
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
  game,
  /if \(!isHomeIslandActive\) \{[\s\S]{0,220}?setMainCityReturnHudMode\(true\)[\s\S]{0,220}?mainCityReturnBtn\.hidden = false/,
  "Leaving the Home City map must show the Home control in HUD mode.",
);
assert.match(
  game,
  /resourceBar\?\.classList\.toggle\("has-home-return"[\s\S]{0,700}?resourceBar\.querySelector\("#fullscreenBtn"\)[\s\S]{0,180}?insertBefore\(mainCityReturnBtn, fullscreenControl/,
  "HUD mode must place Home immediately before the fullscreen control.",
);
assert.match(
  game,
  /modeChanged[\s\S]{0,900}?window\.dispatchEvent\(new Event\("crownlands:ui-layout-refresh"\)\)/,
  "Changing Home modes must immediately reposition the combined top-right control group.",
);
assert.match(
  styles,
  /\.resource-bar\.has-home-return \.fullscreen-btn\s*\{[\s\S]{0,520}?position:\s*static !important[\s\S]{0,520}?width:\s*var\(--hud-corner-control-width, 38px\) !important[\s\S]{0,180}?height:\s*var\(--hud-corner-control-height, 38px\) !important[\s\S]{0,220}?transform:\s*none !important[\s\S]*?\.main-city-return\.hud-home-return\s*\{[\s\S]{0,520}?position:\s*static !important[\s\S]{0,520}?width:\s*var\(--hud-corner-control-width, 38px\) !important[\s\S]{0,180}?height:\s*var\(--hud-corner-control-height, 38px\) !important[\s\S]{0,220}?transform:\s*none !important/,
  "Home and fullscreen must both participate in the same top-right flex row while off the home map.",
);
assert.match(
  game,
  /function getMainCityRegionId\(\)\s*\{[\s\S]{0,260}?state\?\.online\?\.mainRegionId[\s\S]{0,180}?getCityRegionId\(state\.mainCityId\)/,
  "The server-confirmed home region must take priority when deciding whether Home belongs beside fullscreen.",
);
assert.match(
  layoutRuntime,
  /id === "returnHome" && element\.classList\.contains\("hud-home-return"\)/,
  "The layout runtime must not reposition the off-map Home control.",
);
assert.match(
  layoutRuntime,
  /id === "fullscreen"[\s\S]{0,420}?resourceBar\?\.classList\.contains\("has-home-return"\)[\s\S]{0,420}?layoutElement = resourceBar/,
  "The HUD runtime must position the combined Home/fullscreen group from the fullscreen editor slot.",
);
assert.match(
  layoutRuntime,
  /window\.addEventListener\("crownlands:ui-layout-refresh", applyLayout\)/,
  "The HUD runtime must reapply layout immediately when Home enters or leaves the corner group.",
);
assert.match(
  index,
  /id="outgoingAttackBtn"[\s\S]{0,300}?<span[^>]*aria-hidden="true">&#10148;<\/span>/,
  "The Outgoing Marches button must use its original heavy forward arrow.",
);
assert.match(
  index,
  /id="incomingAttackBtn"[\s\S]{0,300}?<span[^>]*aria-hidden="true">&#9876;<\/span>/,
  "The Incoming Attacks and Scouts button must use its original crossed-swords icon.",
);
assert.doesNotMatch(
  index,
  /id="(?:outgoing|incoming)AttackBtn"[\s\S]{0,260}?<use href="#cl-icon-(?:outgoing|incoming)">/,
  "The operation buttons still use the replacement diagonal-arrow SVGs.",
);
assert.match(
  layoutRuntime,
  /function restoreOperationAlertStack\(\)[\s\S]*?nav\.appendChild\(incoming\);[\s\S]*?nav\.appendChild\(outgoing\);[\s\S]*?nav\.appendChild\(reports\);/,
  "The HUD runtime must restore Incoming and Outgoing above the Reports anchor in deterministic order.",
);
assert.match(
  layoutRuntime,
  /id === "outgoingMarch" \|\| id === "incomingMarch"\) return;/,
  "Outgoing and Incoming alerts must not be repositioned independently from Reports.",
);
assert.match(
  styles,
  /\.bottom-nav\s*\{[\s\S]{0,420}?--cl-operation-stack-gap:\s*9px;[\s\S]{0,420}?flex-direction:\s*column;[\s\S]{0,420}?gap:\s*var\(--cl-operation-stack-gap\) !important;[\s\S]*?\.bottom-nav \.incoming-attack-btn\s*\{\s*order:\s*1;[\s\S]*?\.bottom-nav \.outgoing-attack-btn\s*\{\s*order:\s*2;[\s\S]*?\.bottom-nav \.report-nav-btn\s*\{\s*order:\s*3;[\s\S]*?flex:\s*0 0 46px;/,
  "The operation controls must form a 9px vertical Incoming, Outgoing, Reports stack.",
);
assert.doesNotMatch(
  styles,
  /\.bottom-nav:has\(\.(?:incoming|outgoing)-attack-btn:not\(\[hidden\]\)\)[\s\S]{0,180}?width:/,
  "Movement visibility must not expand the Reports group horizontally.",
);
assert.match(
  styles,
  /\/\* === V9 LANDSCAPE \/ HORIZONTAL LAYOUT === \*\/[\s\S]{0,240}?\.phone-shell\s*\{[\s\S]{0,240}?overflow:\s*clip;/,
  "The landscape shell must not become a focus-scroll container and shift fixed HUD anchors.",
);
assert.match(
  index,
  /id="incomingAttackBtn"[\s\S]{0,900}?id="outgoingAttackBtn"[\s\S]{0,900}?id="logBtn"/,
  "The operation controls must preserve visual and accessibility order in the document.",
);
assert.match(
  benchmarkRuntime,
  /function setHudOperationState\(mode = "none"\)[\s\S]{0,900}?emitVisualQaArmies\(armies\)[\s\S]{0,240}?updateIncomingAttackUi\(\);[\s\S]{0,120}?updateOutgoingAttackUi\(\);/,
  "Real-game visual QA must exercise the movement render path.",
);
assert.doesNotMatch(
  benchmarkRuntime.match(/function setHudOperationState[\s\S]*?\n  \}/)?.[0] || "",
  /(?:incomingAttackBtn|outgoingAttackBtn)\.hidden\s*=/,
  "Real-game visual QA must not fake movement visibility with direct DOM toggles.",
);
assert.match(
  benchmarkFirebase,
  /subscribeChatMessages[\s\S]{0,700}?subscribeLogical\(`chat\.\$\{normalizedChannel\}`[\s\S]{0,700}?handlers\.onMessages/,
  "The real-game HUD harness must retain deterministic Global and Clan subscription coverage.",
);
[
  "01-desktop-reports-only.jpg",
  "02-desktop-movement-stack.jpg",
  "03-844-reports-quick-peek.jpg",
  "04-844-incoming-quick-peek.jpg",
  "05-844-outgoing-quick-peek.jpg",
  "06-844-both-quick-peek.jpg",
  "07-568-reports-quick-state.jpg",
  "08-568-both-quick-state.jpg",
  "09-844-full-hud-both-and-chat.jpg",
].forEach(fileName => assert.ok(
  fs.existsSync(path.join(root, "docs/visual-qa/hud-movement-stack/screenshots", fileName)),
  `Missing HUD movement-stack screenshot ${fileName}.`,
));
assert.match(
  styles,
  /grid-template-rows:\s*22px 10px 9px;[\s\S]*?font-variant-numeric:\s*tabular-nums;/,
  "Outgoing and Incoming labels and timers must share aligned rows and stable timer widths.",
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
  /class="city-wheel-action cl-action-button cl-action-send wheel-send"[\s\S]{0,320}?renderCrownlandsIcon\("forward"\)/,
  "The player-city Send action must use the restored forward arrow.",
);
assert.doesNotMatch(
  game,
  /class="city-wheel-action cl-action-button cl-action-send wheel-send"[\s\S]{0,320}?renderCrownlandsIcon\("outgoing"\)/,
  "The player-city Send action still uses the diagonal outgoing arrow.",
);
assert.match(
  styles,
  /--cl-action-size:\s*64px;[\s\S]*?:is\(\.city-wheel-action, \.gold-camp-wheel-action\)\.cl-action-button\s*\{[\s\S]*?width:\s*var\(--cl-action-size\) !important;/,
  "City and objective actions must share one physical button construction.",
);
assert.match(
  styles,
  /--cl-action-send-bg:\s*linear-gradient\(180deg, #5f7888, #3e5664\);[\s\S]*?--cl-action-attack-bg:\s*linear-gradient\(180deg, #9b4a42, #6d2927\);/,
  "City Send and Attack actions must use the approved faded-blue and attack-red variants.",
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
