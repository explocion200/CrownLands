const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const clientSource = fs.readFileSync(path.resolve(__dirname, "..", "firebaseClient.js"), "utf8");
const gameSource = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
const controllerSource = fs.readFileSync(path.resolve(__dirname, "..", "instant-economy-actions.js"), "utf8");
const styles = fs.readFileSync(path.resolve(__dirname, "..", "styles.css"), "utf8");
const actionButtons = fs.readFileSync(path.resolve(__dirname, "..", "action-buttons.css"), "utf8");
const contrastStyles = fs.readFileSync(path.resolve(__dirname, "..", "ui-contrast-correction.css"), "utf8");
const indexSource = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

const loaderStart = clientSource.indexOf("async function loadOwnedCitiesAcrossIslands");
const loaderEnd = clientSource.indexOf("async function loadServerReports", loaderStart);
assert.ok(loaderStart >= 0 && loaderEnd > loaderStart, "Owned-city loader must exist.");
const loaderSource = clientSource.slice(loaderStart, loaderEnd);

assert.match(loaderSource, /collectionGroup\(client\.db, "cities"\)/, "Owned cities must load with one collection-group query.");
assert.match(loaderSource, /where\("ownerUid", "==", uid\)/, "Owned-city query must be scoped to the signed-in player.");
assert.match(loaderSource, /cityDoc\.ref\?\.parent\?\.parent\?\.id/, "Owned-city results must retain their island ID.");
assert.match(gameSource, /const refreshPromise = refreshAllOwnedCities\(true\);/, "Opening the city list must request a fresh server roster before rendering.");
assert.match(gameSource, /Syncing full city roster\.\.\./, "An incomplete roster must show a syncing state.");
assert.match(gameSource, /data-city-list-sort="level"[\s\S]*?data-city-list-sort="troops"/, "City list must retain Level and Troops sort controls.");
assert.match(gameSource, /function getOwnedCitySnapshotForUpgrade[\s\S]*?getAllOwnedCitiesForDisplay/, "Direct city upgrades must resolve owned cities outside the active map.");
assert.match(gameSource, /function getCityUpgradeOptionState[\s\S]*?makeExactOption\("\+1"[\s\S]*?makeExactOption\("\+5"[\s\S]*?label: "MAX"/, "City Info and City List must share +1, +5, and MAX option state.");
assert.match(gameSource, /const optionState = stronghold \? null : getCityUpgradeOptionState\(city\)/, "Stronghold rows must omit city-upgrade controls.");
assert.match(gameSource, /class="city-list-actions"[\s\S]*?renderCityListUpgradeButton[\s\S]*?class="city-list-info"/, "Regular city rows must place upgrade controls before Info.");
assert.match(gameSource, /data-city-upgrade-region=/, "City-list upgrade controls must retain their map binding.");
assert.doesNotMatch(controllerSource, /already has an upgrade pending/, "A pending city upgrade still blocks rapid follow-up actions.");
assert.doesNotMatch(controllerSource, /serverCityUpgradePreviewIds/, "City XP previews are still started before queued actions reach the server.");
assert.match(controllerSource, /function queueServerCityUpgrade[\s\S]*?getProjectedAffordableCityUpgradeLevels[\s\S]*?coalesce:\s*mode === "legacy"[\s\S]*?reservedGold:/, "Authoritative +1, +5, and MAX actions must reserve projected Gold as independent queue entries.");
assert.match(controllerSource, /async function executeInstantCityUpgrade[\s\S]*?getCityUpgradeXpPreview[\s\S]*?const submitUpgrade[\s\S]*?await submitUpgrade/, "Each city XP preview must run when its queued action reaches the front.");
assert.match(controllerSource, /function discardQueuedCityUpgradeActions[\s\S]*?instantEconomyActions\.splice[\s\S]*?if \(action\.type === "city"\) discardQueuedCityUpgradeActions\(action\.key\)/, "A declined or rejected action must clear dependent requests for that city.");
assert.match(gameSource, /const displayedLevel = optionState\?\.currentLevel[\s\S]*?getPendingCityUpgradeCount[\s\S]*?class="city-list-row[\s\S]*?upgrade-syncing[\s\S]*?formatNumber\(displayedLevel\)/, "City List rows must show the projected level with a nonblocking syncing state.");
const levelButtonSource = gameSource.match(/function renderCityLevelUpButton[\s\S]*?(?=function renderCityLevelUpAction)/)?.[0] || "";
assert.doesNotMatch(levelButtonSource, /pending|aria-disabled|aria-busy/, "Pending state must not disable individual +1, +5, or MAX controls.");
assert.match(gameSource, /function compareCityListEntries[\s\S]*?getCityUpgradeStableSortLevel/, "Level sorting must remain stable until a city's queue settles.");
assert.match(controllerSource, /renderCityList: false,[\s\S]*?cityUpgradeFeedback: result\?\.replayed \? null[\s\S]*?startingLevel: clampCityLevel\(authoritativeFinalLevel - upgraded\)[\s\S]*?finalLevel: authoritativeFinalLevel/, "City-list success feedback must be derived from the authoritative upgrade receipt and deferred until pending state clears.");
assert.match(controllerSource, /if \(!result\?\.replayed\) \{[\s\S]*?playGameSound\("level_up"[\s\S]*?playCityUpgradeAnimation/, "Idempotent replay responses must not repeat success logs, audio, or animation.");

const economyApplyStart = gameSource.indexOf("function applyServerEconomyResult");
const economyApplyEnd = gameSource.indexOf("function mergeServerEconomyRefreshOptions", economyApplyStart);
assert.ok(economyApplyStart >= 0 && economyApplyEnd > economyApplyStart, "Server economy result application must exist.");
const economyApplySource = gameSource.slice(economyApplyStart, economyApplyEnd);
assert.ok(
  economyApplySource.indexOf("applyServerCityUpdates(result.cityUpdates)") < economyApplySource.indexOf("setCityListUpgradeFeedback(options.cityUpgradeFeedback)"),
  "Authoritative city updates must reach active-map and off-map caches before success feedback is registered."
);
assert.match(economyApplySource, /result\.replayed !== true[\s\S]*?options\.renderCityList !== false/, "Economy reconciliation must suppress duplicate replay feedback and support one post-pending city-list render.");
assert.match(gameSource, /data-city-list-row-key=[\s\S]*?city-list-upgrade-result" role="status"/, "The upgraded city row must expose a stable identity and an accessible level-change result.");
assert.match(gameSource, /consumeCityListUpgradeRevealKey\(\)[\s\S]*?cities\.findIndex[\s\S]*?Math\.floor\(revealIndex \/ CITY_LIST_PAGE_SIZE\)/, "Sorting or pagination must keep the confirmed city visible after its level changes.");
assert.match(gameSource, /captureCityListFocus\(\)[\s\S]*?previousScrollTop[\s\S]*?ensureCityListRowVisible[\s\S]*?restoreCityListFocus/, "City-list reconciliation must preserve scroll and keyboard focus around the upgraded row.");
assert.match(styles, /\.city-list-row\.upgrade-confirmed[\s\S]*?@keyframes crownlandsCityListUpgradeConfirmed[\s\S]*?prefers-reduced-motion: reduce/, "Confirmed city upgrades need a brief reduced-motion-safe row highlight.");
assert.match(gameSource, /cl-action-button cl-action-level[\s\S]*?renderCrownlandsIcon\("arrow-up"\)/, "The selected-city map action must use its dedicated arrow-up treatment.");
assert.match(indexSource, /id="cl-icon-arrow-up"/, "The dedicated map Level arrow glyph is missing.");
assert.match(actionButtons, /\.cl-action-button\.cl-action-level[\s\S]*?--cl-action-bg:\s*var\(--cl-action-level-bg\)/, "The selected-city Level action is missing its gold button treatment.");
assert.match(indexSource, /styles\.css\?v=20260827-skill-controls-live-refunds-r1[\s\S]*?instant-economy-actions\.js\?v=20260827-skill-controls-live-refunds-r1[\s\S]*?game\.js\?v=20260827-skill-controls-live-refunds-r1/, "Changed city-list client assets must use one cache-busting release token.");
assert.match(styles, /@media \(max-width: 600px\) and \(orientation: landscape\)[\s\S]*?\.city-list-art,[\s\S]*?display: none;[\s\S]*?\.city-list-upgrade \{ min-width: 40px; width: 40px; height: 40px;/, "The 540px layout must preserve 40px controls by hiding decorative row content.");
assert.match(contrastStyles, /\.city-list-modal \.city-list-toolbar button :is\(span, small, \.cl-icon\)[\s\S]*?color:\s*inherit !important;/, "City-list sort text and icons can still become brown on dark buttons.");

console.log("Validated cross-map loading, optimistic queue feedback, replay safety, focus retention, and the gold map upgrade action.");
