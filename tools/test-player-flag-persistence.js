const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const PLAYER_FLAG_CONFIG = require(path.join(root, "functions", "playerFlagConfig.js"));

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const saveFlagEditor = extractFunction(game, "saveFlagEditor");
const baseline = {
  version: 1,
  primary: "#315A8A",
  secondary: "#C69A45",
  symbolColor: "#F2E2BF",
  pattern: "chevron",
  symbol: "lion",
};
const draft = { ...baseline, pattern: "saltire" };

function createHarness(api) {
  const sandbox = {
    PLAYER_FLAG_CONFIG,
    testApi: api,
    Promise,
    console: { warn() {} },
  };
  vm.runInNewContext(`
    let state = { playerName: "Flag Test", online: { islandId: "main-test-region" } };
    let flagDraft = ${JSON.stringify(draft)};
    let flagSavedBaseline = ${JSON.stringify(baseline)};
    let flagSaveInFlight = false;
    const flagEditorSaveStatus = { textContent: "", dataset: {} };
    const ONLINE_SAVE_SLOT = "default-test";
    let commitCount = 0;
    let renderCount = 0;
    let localSaveCount = 0;
    let lastCommittedFlag = null;
    function isFlagEditorDirty() { return JSON.stringify(flagDraft) !== JSON.stringify(flagSavedBaseline); }
    function getCurrentOnlineUid() { return "test-uid"; }
    function getOnlineApi() { return testApi; }
    function getPlayerCloudStateSnapshot() { return { playerName: state.playerName, flag: state.flag }; }
    function stripServerEconomyProfileFields(value) { return value; }
    function getKingPowerLeaderboardSnapshot() { return { mainCityId: "city-a", mainRegionId: "region-a", mainIslandId: "main-region-a" }; }
    function getKingPower() { return 123; }
    function getActiveOnlineRegionId() { return "region-a"; }
    function getOnlineIslandId(regionId) { return "main-" + regionId; }
    function getOnlinePresenceSnapshot() { return { playerName: state.playerName, flag: state.flag }; }
    function applyGlobalStatsSnapshot() {}
    function commitSavedPlayerFlag(flag) { commitCount += 1; lastCommittedFlag = flag; state.flag = flag; }
    function saveGame() { localSaveCount += 1; }
    function renderFlagEditor() { renderCount += 1; }
    function showToast() {}
    ${saveFlagEditor}
    globalThis.harness = {
      invoke: saveFlagEditor,
      read: () => ({
        commitCount,
        renderCount,
        localSaveCount,
        lastCommittedFlag,
        draft: { ...flagDraft },
        baseline: { ...flagSavedBaseline },
        saveInFlight: flagSaveInFlight,
        status: flagEditorSaveStatus.textContent,
      }),
    };
  `, sandbox);
  return sandbox.harness;
}

function createSuccessfulApi(calls, profileSave = async () => true) {
  return {
    isSignedIn: () => true,
    savePlayerProfile: async value => { calls.profile += 1; return profileSave(value); },
    syncPlayerIdentity: async () => { calls.identity += 1; return { ok: true }; },
    saveGameSnapshot: async () => { calls.snapshot += 1; return true; },
    savePresence: async () => { calls.presence += 1; return true; },
  };
}

async function testSuccessfulSave() {
  const calls = { profile: 0, identity: 0, snapshot: 0, presence: 0 };
  const harness = createHarness(createSuccessfulApi(calls));
  await harness.invoke();
  const result = harness.read();
  assert.deepEqual(calls, { profile: 1, identity: 1, snapshot: 1, presence: 1 });
  assert.equal(result.commitCount, 1);
  assert.equal(result.lastCommittedFlag.version, 2);
  assert.equal(result.status, "Saved everywhere");
  assert.equal(result.saveInFlight, false);
}

async function testFailureThenRetry() {
  const calls = { profile: 0, identity: 0, snapshot: 0, presence: 0 };
  let fail = true;
  const harness = createHarness(createSuccessfulApi(calls, async () => {
    if (fail) throw new Error("offline");
    return true;
  }));
  await harness.invoke();
  const failed = harness.read();
  assert.equal(failed.commitCount, 0, "A failed save committed local state.");
  assert.equal(failed.draft.pattern, draft.pattern, "A failed save discarded the draft.");
  assert.equal(failed.status, "Save failed — retry");
  fail = false;
  await harness.invoke();
  const retried = harness.read();
  assert.equal(retried.commitCount, 1);
  assert.equal(retried.status, "Saved everywhere");
}

async function testRepeatedTapGuard() {
  const calls = { profile: 0, identity: 0, snapshot: 0, presence: 0 };
  let resolveProfile;
  const profilePending = new Promise(resolve => { resolveProfile = resolve; });
  const harness = createHarness(createSuccessfulApi(calls, () => profilePending));
  const first = harness.invoke();
  const repeated = harness.invoke();
  assert.equal(harness.read().saveInFlight, true);
  assert.deepEqual(calls, { profile: 1, identity: 1, snapshot: 1, presence: 1 }, "A repeated tap started duplicate writes.");
  resolveProfile(true);
  await Promise.all([first, repeated]);
  assert.equal(harness.read().commitCount, 1);
}

Promise.resolve()
  .then(testSuccessfulSave)
  .then(testFailureThenRetry)
  .then(testRepeatedTapGuard)
  .then(() => console.log("Player flag persistence passed: success, failure/retry, and repeated-tap writes are safe."))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
