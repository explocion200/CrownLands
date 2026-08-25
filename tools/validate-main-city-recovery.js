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
  withTimeout: (promise, timeoutMs, message) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]),
};
vm.createContext(decisionSandbox);
vm.runInContext(
  `${decisionSource}; this.resolveMainCityRecoveryResult = resolveMainCityRecoveryResult; this.requestAuthoritativeMainCityRecovery = requestAuthoritativeMainCityRecovery;`,
  decisionSandbox
);
const decide = decisionSandbox.resolveMainCityRecoveryResult;
const requestRecovery = decisionSandbox.requestAuthoritativeMainCityRecovery;

assert.deepEqual(
  JSON.parse(JSON.stringify(decide({
    ok: true,
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
  () => decide({
    ok: false,
    requiresStartingCityClaim: true,
    mainCityRecoveryStatus: "claim-required",
    recoveryReason: "no-valid-owned-regular-city",
  }),
  /authoritative recovery result/i,
  "An unsuccessful response carrying claim markers could trigger a fresh seasonal claim."
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

const syncSource = sourceBetween(
  gameSource,
  "async function syncSingleMainCityAssignmentToOnline",
  "function getMainCityChangeCooldownDurationMs"
);
assert.doesNotMatch(
  syncSource,
  /result\?\.currentUser\?\.mainCityId\) \|\| getKnownCityId\(mainCityId\)/,
  "The secondary recovery consumer still accepts a cached main-city fallback."
);
assert.match(
  syncSource,
  /requestAuthoritativeMainCityRecovery[\s\S]*?recovery\.status === "claim-required"[\s\S]*?disconnectOnlineWorld\(\)[\s\S]*?startOnlineSetupInBackground\(\)/,
  "The secondary recovery consumer does not fail closed through the normal setup flow."
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
assert.match(
  serverRecoverySource,
  /statsProjectionChanged[\s\S]*?leaderboardProjectionChanged[\s\S]*?recoveryChanged/,
  "Recovery does not compare existing projections independently."
);
assert.match(
  serverRecoverySource,
  /if \(statsProjectionChanged\)[\s\S]*?transaction\.set\(statsRef[\s\S]*?if \(leaderboardProjectionChanged\)[\s\S]*?transaction\.set\(leaderboardRef/,
  "Recovery does not persist independently stale projections."
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
  "stale Global Stats projection",
  "stale leaderboard projection",
  "both projections stale",
  "missing projection documents",
  "already-correct projections",
  "collectEconomy",
]) {
  assert.ok(emulatorSource.includes(evidence), `The recovery emulator test lacks ${evidence} coverage.`);
}

async function validateAuthoritativeRecoveryRequests() {
  const validResult = {
    ok: true,
    requiresStartingCityClaim: false,
    mainCityRecoveryStatus: "valid",
    currentUser: { mainCityId: "region_11_city_001", mainRegionId: "region_11" },
  };
  const valid = await requestRecovery({ repairMainCityAssignment: async () => validResult }, "cached_city", 50);
  assert.equal(valid.recovery.status, "valid", "The shared request helper rejected a valid result.");

  const repaired = await requestRecovery({ repairMainCityAssignment: async () => ({
    ...validResult,
    mainCityRecoveryStatus: "repaired",
  }) }, "cached_city", 50);
  assert.equal(repaired.recovery.status, "repaired", "The shared request helper rejected a repaired result.");

  const claimRequired = await requestRecovery({ repairMainCityAssignment: async () => ({
    ok: true,
    requiresStartingCityClaim: true,
    mainCityRecoveryStatus: "claim-required",
    recoveryReason: "no-valid-owned-regular-city",
  }) }, "cached_city", 50);
  assert.equal(claimRequired.recovery.status, "claim-required", "The shared request helper rejected an authoritative no-city result.");

  await assert.rejects(
    requestRecovery({ repairMainCityAssignment: async () => ({
      ok: false,
      requiresStartingCityClaim: true,
      mainCityRecoveryStatus: "claim-required",
      recoveryReason: "no-valid-owned-regular-city",
    }) }, "cached_city", 50),
    /authoritative recovery result/i,
    "The shared request helper accepted an unsuccessful claim marker."
  );
  await assert.rejects(
    requestRecovery({ repairMainCityAssignment: async () => ({ ok: true }) }, "cached_city", 50),
    /authoritative recovery result/i,
    "The shared request helper accepted an incomplete result."
  );
  await assert.rejects(
    requestRecovery({ repairMainCityAssignment: async () => Promise.reject(new Error("service unavailable")) }, "cached_city", 50),
    /service unavailable/i,
    "The shared request helper swallowed a rejected recovery call."
  );
  await assert.rejects(
    requestRecovery({ repairMainCityAssignment: () => new Promise(() => {}) }, "cached_city", 2),
    /taking too long/i,
    "The shared request helper did not fail closed on timeout."
  );
}

function createSyncSandbox() {
  const sandbox = {
    state: null,
    response: null,
    forceTimeout: false,
    disconnects: 0,
    restarts: 0,
    applied: 0,
    normalized: [],
    isOnlineWorldActive: () => true,
    getKnownCityId: value => (/^[a-z0-9_-]+$/i.test(String(value || "")) ? String(value) : ""),
    normalizeRegionId: value => String(value || "west"),
    getCityRegionId: cityId => String(cityId || "").split("_city_")[0] || "west",
    getOnlineIslandId: regionId => `main-${regionId}`,
    refreshAllOwnedCities: async () => true,
    applyServerEconomyResult: () => { sandbox.applied += 1; },
    normalizeSingleMainCityAssignment: cityId => { sandbox.normalized.push(cityId); },
    disconnectOnlineWorld: () => { sandbox.disconnects += 1; },
    startOnlineSetupInBackground: () => { sandbox.restarts += 1; },
    withTimeout: async (promise, _timeoutMs, message) => {
      if (sandbox.forceTimeout) throw new Error(message);
      return promise;
    },
  };
  sandbox.api = {
    isSignedIn: () => true,
    repairMainCityAssignment: async () => sandbox.response,
  };
  sandbox.getOnlineApi = () => sandbox.api;
  vm.createContext(sandbox);
  vm.runInContext(
    `${decisionSource}\n${syncSource}; this.syncSingleMainCityAssignmentToOnline = syncSingleMainCityAssignmentToOnline;`,
    sandbox
  );
  return sandbox;
}

function resetSyncSandbox(sandbox, response) {
  sandbox.state = {
    mainCityId: "cached_city",
    online: {
      mainCityId: "cached_city",
      mainRegionId: "west",
      mainIslandId: "main-west",
    },
  };
  sandbox.response = response;
  sandbox.forceTimeout = false;
  sandbox.disconnects = 0;
  sandbox.restarts = 0;
  sandbox.applied = 0;
  sandbox.normalized = [];
  sandbox.api.repairMainCityAssignment = async () => sandbox.response;
}

async function validateSecondaryRecoveryConsumer() {
  const sandbox = createSyncSandbox();
  for (const status of ["valid", "repaired"]) {
    resetSyncSandbox(sandbox, {
      ok: true,
      requiresStartingCityClaim: false,
      mainCityRecoveryStatus: status,
      currentUser: {
        mainCityId: "region_11_city_001",
        mainRegionId: "region_11",
        mainIslandId: "main-region_11",
      },
    });
    assert.equal(await sandbox.syncSingleMainCityAssignmentToOnline("cached_city"), true);
    assert.equal(sandbox.state.mainCityId, "region_11_city_001");
    assert.equal(sandbox.disconnects, 0);
  }

  resetSyncSandbox(sandbox, {
    ok: true,
    requiresStartingCityClaim: true,
    mainCityRecoveryStatus: "claim-required",
    recoveryReason: "no-valid-owned-regular-city",
  });
  await assert.rejects(
    sandbox.syncSingleMainCityAssignmentToOnline("cached_city"),
    /No valid current-season main city/i
  );
  assert.equal(sandbox.state.mainCityId, "", "The no-city result retained a cached main city.");
  assert.equal(sandbox.state.online, null, "The no-city result retained an online world connection.");
  assert.equal(sandbox.disconnects, 1);
  assert.equal(sandbox.restarts, 1);

  for (const response of [
    {
      ok: false,
      requiresStartingCityClaim: true,
      mainCityRecoveryStatus: "claim-required",
      recoveryReason: "no-valid-owned-regular-city",
    },
    { ok: true },
  ]) {
    resetSyncSandbox(sandbox, response);
    await assert.rejects(
      sandbox.syncSingleMainCityAssignmentToOnline("cached_city"),
      /authoritative recovery result/i
    );
    assert.equal(sandbox.state.online, null, "A malformed result retained an online world connection.");
    assert.equal(sandbox.disconnects, 1);
    assert.equal(sandbox.restarts, 1);
  }

  resetSyncSandbox(sandbox, null);
  sandbox.api.repairMainCityAssignment = async () => Promise.reject(new Error("service unavailable"));
  await assert.rejects(sandbox.syncSingleMainCityAssignmentToOnline("cached_city"), /service unavailable/i);
  assert.equal(sandbox.state.online, null);
  assert.equal(sandbox.disconnects, 1);
  assert.equal(sandbox.restarts, 1);

  resetSyncSandbox(sandbox, null);
  sandbox.forceTimeout = true;
  await assert.rejects(sandbox.syncSingleMainCityAssignmentToOnline("cached_city"), /taking too long/i);
  assert.equal(sandbox.state.online, null);
  assert.equal(sandbox.disconnects, 1);
  assert.equal(sandbox.restarts, 1);
}

Promise.all([
  validateAuthoritativeRecoveryRequests(),
  validateSecondaryRecoveryConsumer(),
])
  .then(() => console.log("Main-city recovery validation passed."))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
