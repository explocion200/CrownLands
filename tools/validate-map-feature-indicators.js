"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const towerUi = fs.readFileSync(path.join(root, "holding-tower-ui.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(towerUi, context);
const classify = (regionId, tower = false, camp = false) => context.window.CROWNLANDS_HOLDING_TOWER_UI.createMapFeaturePresentation(
  regionId,
  tower ? [{ regionId }] : [],
  { campCount: camp ? 1 : 0 }
);
const combined = classify("tower-camp", true, true);
assert.equal(combined.hasClanTower, true);
assert.equal(combined.hasCamp, true);
assert.equal(combined.classNames.trim(), "has-clan-tower has-camp", "Combined Clan Tower and camp maps must retain both visual states.");
assert.equal(Array.from(combined.ariaPhrases).join("|"), "contains a Clan Tower|contains a camp", "Combined map indicators must retain both accessible states.");
assert.match(combined.markup, /clan-tower[\s\S]*?title="Clan Tower"[\s\S]*?class="island-map-feature-badge camp"[\s\S]*?title="Camp"/, "Combined map badges must show Tower and Camp without replacing either state.");
assert.equal(classify("tower-only", true).hasClanTower, true);
assert.equal(classify("camp-only", false, true).hasCamp, true);

const tileSource = game.slice(game.indexOf("function renderIslandMapTile"), game.indexOf("function renderIslandSwitcherModalContent"));
assert.match(tileSource, /feature\.classNames[\s\S]*?feature\.markup/, "Map tiles need independent Tower and Camp presentation.");
assert.match(towerUi, /ariaPhrases:[\s\S]*?contains a Clan Tower[\s\S]*?contains a camp/, "Map tiles need accessible Tower and Camp relationship text.");
assert.match(towerUi, /mapFeatureLegend[\s\S]*?Clan Tower[\s\S]*?Camp/, "The map picker is missing its non-color-only feature legend.");
assert.match(game, /updateIslandMapTileSummariesInPlace[\s\S]*?islandMapFeatures\(regionId\)\.ariaPhrases/, "Live map-summary refreshes must preserve accessible feature labels.");
assert.match(game, /setProperty\("--island-map-indicator-scale"/, "Map feature strokes must remain readable while the picker zoom changes.");
assert.match(styles, /\.island-map-icon\.has-clan-tower \.island-map-feature-trim::before[\s\S]*?border: calc\(5px \* var\(--island-map-indicator-scale, 1\)\) solid #59d47a/, "Clan Tower maps need a zoom-stable green outer trim.");
assert.match(styles, /\.island-map-icon\.has-camp \.island-map-feature-trim::after[\s\S]*?border: calc\(4px \* var\(--island-map-indicator-scale, 1\)\) solid #f5d889/, "Camp maps need a zoom-stable light-gold inner trim.");
assert.match(styles, /\.island-map-feature-badges[\s\S]*?\.island-map-feature-badge\.camp/, "Text badges must keep combined map states distinct at supported zoom levels.");

console.log("Validated Clan Tower, camp, combined trim, badge, legend, and accessible map indicator states.");
