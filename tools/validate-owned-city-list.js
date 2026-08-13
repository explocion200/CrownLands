const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const clientSource = fs.readFileSync(path.resolve(__dirname, "..", "firebaseClient.js"), "utf8");
const gameSource = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
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
assert.match(contrastStyles, /\.city-list-modal \.city-list-toolbar button :is\(span, small, \.cl-icon\)[\s\S]*?color:\s*inherit !important;/, "City-list sort text and icons can still become brown on dark buttons.");

console.log("Validated one-query cross-map owned-city loading and city-list refresh behavior.");
