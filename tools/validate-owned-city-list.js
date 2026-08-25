const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const clientSource = fs.readFileSync(path.resolve(__dirname, "..", "firebaseClient.js"), "utf8");
const gameSource = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
const controllerSource = fs.readFileSync(path.resolve(__dirname, "..", "instant-economy-actions.js"), "utf8");
const styles = fs.readFileSync(path.resolve(__dirname, "..", "styles.css"), "utf8");
const contrastStyles = fs.readFileSync(path.resolve(__dirname, "..", "ui-contrast-correction.css"), "utf8");

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
assert.match(controllerSource, /getPendingCityUpgradeAction[\s\S]*?already has an upgrade pending/, "Each city must reject overlapping upgrade requests while its action is pending.");
assert.match(styles, /@media \(max-width: 600px\) and \(orientation: landscape\)[\s\S]*?\.city-list-art,[\s\S]*?display: none;[\s\S]*?\.city-list-upgrade \{ min-width: 40px; width: 40px; height: 40px;/, "The 540px layout must preserve 40px controls by hiding decorative row content.");
assert.match(contrastStyles, /\.city-list-modal \.city-list-toolbar button :is\(span, small, \.cl-icon\)[\s\S]*?color:\s*inherit !important;/, "City-list sort text and icons can still become brown on dark buttons.");

console.log("Validated cross-map owned-city loading, shared upgrade controls, Stronghold exclusions, and compact responsive targets.");
