const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const emulatorSource = fs.readFileSync(
  path.join(root, "functions", "test", "emulator-main-city-recovery.js"),
  "utf8"
);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const decisionSource = sourceBetween(
  gameSource,
  "function resolveMainCityRecoveryResult",
  "async function setupOnlineWorld"
);
const decisionSandbox = {
  getKnownCityId: value => (/^[a-z0-9_-]+$/i.test(String(value || "")) ? String(value) : ""),
  normalizeRegionId: value => String(value || "west"),
  getCityRegionId: cityId => String(cityId || "").split("_city_")[0] || "west",
  getOnlineIslandId: regionId => `main-${regionId}`,
};
vm.createContext(decisionSandbox);
vm.runInContext(`${decisionSource}; this.resolveMainCityRecoveryResult = resolveMainCityRecoveryResult;`, decisionSandbox);
const decide = decisionSandbox.resolveMainCityRecoveryResult;

assert.deepEqual(
  JSON.parse(JSON.stringify(decide({
    requiresStartingCityClaim: true,
    mainCityRecoveryStatus: "claim-required",
    recoveryReason: "no-valid-owned-regular-city",
  }))),
  { status: "claim-required", mainCityId: "", mainRegionId: "", mainIslandId: "" },
  "The explicit no-city result did not enter the starting-city claim path."
);
assert.equal(decide({
  ok: true,
  requiresStartingCityClaim: false,
  mainCityRecoveryStatus: "repaired",
  currentUser: {
    mainCityId: "region_11_city_002",
    mainRegionId: "region_11",
    mainIslandId: "main-region_11",
  },
}).status, "repaired", "A repaired city was not accepted.");
assert.equal(decide({
  ok: true,
  requiresStartingCityClaim: false,
  mainCityRecoveryStatus: "valid",
  currentUser: {
    mainCityId: "region_11_city_001",
    mainRegionId: "region_11",
    mainIslandId: "main-region_11",
  },
}).status, "valid", "A valid existing city was not accepted.");
assert.throws(
  () => decide({ requiresStartingCityClaim: true, mainCityRecoveryStatus: "claim-required" }),
  /authoritative recovery result/i,
  "An incomplete claim marker could trigger a fresh seasonal claim."
);
assert.throws(
  () => decide({ ok: false, error: "timeout" }),
  /authoritative recovery result/i,
  "A transient or incomplete response could trigger a fresh seasonal claim."
);
assert.throws(
  () => decide({ ok: true, currentUser: { mainCityId: "region_11_city_001" } }, "cached_city"),
  /authoritative recovery result/i,
  "An incomplete response could be accepted through a cached main-city pointer."
);

const setupSource = sourceBetween(gameSource, "async function setupOnlineWorld", "function startOnlineSetupInBackground");
assert.match(
  setupSource,
  /if \(hasCurrentProfile && !api\.repairMainCityAssignment\)[\s\S]*?throw new Error/,
  "Current profiles do not fail closed when main-city verification is unavailable."
);
assert.match(
  setupSource,
  /recovery\.status === "claim-required"[\s\S]*?needsMainCityClaim = true[\s\S]*?mainCityId: ""/,
  "The client does not clear stale pointers before an authoritative replacement claim."
);
assert.match(
  setupSource,
  /catch \(error\)[\s\S]*?Could not verify main city during online setup[\s\S]*?throw error/,
  "A verification timeout or infrastructure failure can still fall through into gameplay or a claim."
);

const serverRecoverySource = sourceBetween(
  serverSource,
  "async function recoverCurrentSeasonMainCity",
  "function createSingleMainCityPatches"
);
assert.match(
  serverRecoverySource,
  /assertCurrentPlayerProfile[\s\S]*?collectionGroup\("cities"\)[\s\S]*?ownerUid[\s\S]*?resetGeneration[\s\S]*?worldId/,
  "Server recovery does not scope candidates to the authenticated current-season player."
);
assert.match(
  serverRecoverySource,
  /!regularEntries\.length[\s\S]*?requiresStartingCityClaim: true[\s\S]*?no-valid-owned-regular-city/,
  "Server recovery does not expose an explicit no-valid-city result."
);
assert.doesNotMatch(
  sourceBetween(serverSource, "exports.repairMainCityAssignment =", "exports.changeMainCity ="),
  /prepareEconomyCollection|writePreparedEconomy/,
  "Recovery discovery can still collect or mutate the seasonal economy."
);
assert.match(
  sourceBetween(serverSource, "async function claimFreshStartingCity", "exports.claimStartingCity ="),
  /if \(currentProfile\)[\s\S]*?recoverCurrentSeasonMainCity[\s\S]*?if \(!recovery\.requiresStartingCityClaim\)[\s\S]*?alreadyClaimed: true[\s\S]*?createFreshResetPlayerProfile/,
  "Starting-city claim can reset a current profile before attempting owned-city recovery."
);

for (const evidence of [
  "archived player",
  "false main-city flag",
  "multiple main-city flags",
  "stale main-city pointer",
  "another player's city",
  "stronghold",
  "no valid regular city",
  "preserved recovery state",
  "collectEconomy",
]) {
  assert.ok(emulatorSource.includes(evidence), `The recovery emulator test lacks ${evidence} coverage.`);
}

console.log("Main-city recovery validation passed.");
