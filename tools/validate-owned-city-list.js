const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const clientSource = fs.readFileSync(path.resolve(__dirname, "..", "firebaseClient.js"), "utf8");
const gameSource = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");

const loaderStart = clientSource.indexOf("async function loadOwnedCitiesAcrossIslands");
const loaderEnd = clientSource.indexOf("async function loadServerReports", loaderStart);
assert.ok(loaderStart >= 0 && loaderEnd > loaderStart, "Owned-city loader must exist.");
const loaderSource = clientSource.slice(loaderStart, loaderEnd);

assert.match(loaderSource, /collectionGroup\(client\.db, "cities"\)/, "Owned cities must load with one collection-group query.");
assert.match(loaderSource, /where\("ownerUid", "==", uid\)/, "Owned-city query must be scoped to the signed-in player.");
assert.match(loaderSource, /cityDoc\.ref\?\.parent\?\.parent\?\.id/, "Owned-city results must retain their island ID.");
assert.match(gameSource, /const refreshPromise = refreshAllOwnedCities\(true\);/, "Opening the city list must request a fresh server roster before rendering.");
assert.match(gameSource, /Syncing full city roster\.\.\./, "An incomplete roster must show a syncing state.");
assert.match(gameSource, /function getCityListSortArrow[\s\S]*?"&#8593;"[\s\S]*?"&#8595;"/, "City-list sort buttons must render ascending and descending arrows.");
assert.match(gameSource, /data-city-list-sort="level"[\s\S]*?city-list-sort-arrow[\s\S]*?data-city-list-sort="troops"[\s\S]*?city-list-sort-arrow/, "Both city-list sort buttons must display a direction arrow.");
assert.match(gameSource, /High to low[\s\S]*?Low to high[\s\S]*?Most to fewest[\s\S]*?Fewest to most/, "City-list sort labels must explain each arrow direction.");

console.log("Validated one-query cross-map owned-city loading, refresh behavior, and directional sort controls.");
