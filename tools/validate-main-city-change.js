const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Could not isolate ${startMarker}.`);
  return source.slice(start, end);
}

const singleMainSource = sourceBetween(
  serverSource,
  "function createSingleMainCityPatches",
  "function writeExtraCityPatches"
);
const sandbox = {
  safeString(value) {
    return String(value || "");
  },
  getCityEntryPath(entry) {
    return String(entry?.ref?.path || "");
  },
  isStronghold(city) {
    return city?.kind === "stronghold" || Boolean(city?.strongholdType);
  },
};
vm.createContext(sandbox);
vm.runInContext(`${singleMainSource}; this.createSingleMainCityPatches = createSingleMainCityPatches;`, sandbox);

const westOldMain = {
  ref: { path: "islands/main-west/cities/west_keep" },
  city: { id: "west_keep", regionId: "west", isMainCity: true },
};
const eastNewMain = {
  ref: { path: "islands/main-east/cities/east_watch" },
  city: { id: "east_watch", regionId: "east", isMainCity: false },
};
const northRegular = {
  ref: { path: "islands/main-north/cities/north_gate" },
  city: { id: "north_gate", regionId: "north", isMainCity: false },
};
const switchResult = sandbox.createSingleMainCityPatches(
  [westOldMain, eastNewMain, northRegular],
  eastNewMain.ref
);

assert.equal(switchResult.cityPatches.length, 2, "A switch must update the old and new main cities.");
assert.equal(westOldMain.city.isMainCity, false, "The previous main city must become a regular city.");
assert.equal(eastNewMain.city.isMainCity, true, "The selected city must become the only main city.");
assert.equal(northRegular.city.isMainCity, false, "Unrelated owned cities must remain regular.");
assert.equal(
  [westOldMain, eastNewMain, northRegular].filter(entry => entry.city.isMainCity).length,
  1,
  "Exactly one owned regular city must remain marked as the main city."
);
assert.equal(
  JSON.stringify(switchResult.cityUpdates.map(update => [update.id, update.regionId, update.isMainCity])),
  JSON.stringify([
    ["west_keep", "west", false],
    ["east_watch", "east", true],
  ]),
  "Cross-map city updates must identify both the demoted and promoted city."
);

assert.match(serverSource, /const MAIN_CITY_CHANGE_CITY_LIMIT = 30;/, "Server city-count cooldown boundary changed.");
assert.match(serverSource, /MAIN_CITY_CHANGE_SMALL_KINGDOM_COOLDOWN_MS = 7 \* 24 \* 60 \* 60 \* 1000;/, "Server 7-day cooldown is missing.");
assert.match(serverSource, /MAIN_CITY_CHANGE_LARGE_KINGDOM_COOLDOWN_MS = 14 \* 24 \* 60 \* 60 \* 1000;/, "Server 14-day cooldown is missing.");
assert.match(serverSource, /exports\.changeMainCity[\s\S]*?getOwnerUid\(targetEntry\.city\) !== uid \|\| isStronghold\(targetEntry\.city\)/, "Server must reject unowned cities and Strongholds.");
assert.match(serverSource, /exports\.changeMainCity[\s\S]*?mainCityId: targetEntry\.city\.id[\s\S]*?mainIslandId: targetIslandId[\s\S]*?mainRegionId: targetRegionId[\s\S]*?mainCityChangedAtMs: nowMs/, "Server must update every main-city profile pointer and the cooldown timestamp.");
assert.match(serverSource, /exports\.changeMainCity[\s\S]*?createSingleMainCityPatches\(economy\.cityEntries, targetEntry\.ref\)[\s\S]*?writePreparedEconomy/, "Server switch must atomically repair all owned city flags.");
assert.match(serverSource, /writeGlobalStatsFromEconomy[\s\S]*?mainCityId: stats\.mainCityId[\s\S]*?mainRegionId: stats\.mainRegionId[\s\S]*?mainIslandId: stats\.mainIslandId/, "Leaderboard/global stats must receive the new main-city location.");
assert.match(serverSource, /function isProtectedMainCity[\s\S]*?city\.isMainCity/, "Server combat protection must follow the authoritative main-city flag.");

assert.match(clientSource, /function changeMainCity[\s\S]*?state\.mainCityId = nextMainCityId[\s\S]*?normalizeSingleMainCityAssignment\(nextMainCityId/, "Client must apply the new main-city ID before normalizing city flags.");
assert.match(clientSource, /normalizeSingleMainCityAssignment[\s\S]*?const shouldBeMain = Boolean\(mainCityId && city\.id === mainCityId\)/, "Client must demote every loaded city except the selected main city.");
assert.match(clientSource, /onlineOwnedCitiesCache = onlineOwnedCitiesCache\.map[\s\S]*?city\.id === mainCityId && !isStronghold\(city\)/, "Cross-map owned-city cache must retain exactly one main city.");
assert.match(clientSource, /const mainCity = !stronghold[\s\S]*?city\.id === state\.mainCityId[\s\S]*?btn\.classList\.add\("main-city-node"\)/, "Map rendering must move the main-city marker to the selected owned city.");
assert.match(stylesSource, /\.city-node\.main-city-node \.city-art[\s\S]*?grayscale\(1\)[\s\S]*?brightness\(\.2\)/, "Main-city castle artwork must render black.");

console.log("Validated atomic main-city switching, cross-map pointers, one-main-city repair, cooldowns, protection, and black map markers.");
