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
const expectedStoredFlag = { ...draft, version: 2 };

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
    savePlayerProfile: async value => {
      calls.profile.push(value);
      return profileSave(value);
    },
    syncPlayerIdentity: async value => {
      calls.identity.push(value);
      return { ok: true };
    },
    saveGameSnapshot: async (value, slot) => {
      calls.snapshot.push({ value, slot });
      return true;
    },
    savePresence: async (islandId, value) => {
      calls.presence.push({ islandId, value });
      return true;
    },
  };
}

function createCalls() {
  return { profile: [], identity: [], snapshot: [], presence: [] };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertExactDestinationFlags(calls, invocation = 0) {
  assert.deepEqual(plain(calls.profile[invocation].flag), expectedStoredFlag, "Profile received a different flag payload.");
  assert.deepEqual(plain(calls.identity[invocation].ownerFlag), expectedStoredFlag, "Identity sync received a different flag payload.");
  assert.deepEqual(plain(calls.snapshot[invocation].value.flag), expectedStoredFlag, "Cloud save received a different flag payload.");
  assert.equal(calls.snapshot[invocation].slot, "default-test", "Cloud save used the wrong slot.");
  assert.deepEqual(plain(calls.presence[invocation].value.flag), expectedStoredFlag, "Presence received a different flag payload.");
  assert.equal(calls.presence[invocation].islandId, "main-test-region", "Presence used the wrong island.");
}

async function testSuccessfulSave() {
  const calls = createCalls();
  const harness = createHarness(createSuccessfulApi(calls));
  await harness.invoke();
  const result = harness.read();
  assert.deepEqual(Object.fromEntries(Object.entries(calls).map(([key, values]) => [key, values.length])), {
    profile: 1, identity: 1, snapshot: 1, presence: 1,
  });
  assertExactDestinationFlags(calls);
  assert.equal(result.commitCount, 1);
  assert.deepEqual(plain(result.lastCommittedFlag), expectedStoredFlag);
  assert.deepEqual(plain(result.baseline), expectedStoredFlag);
  assert.deepEqual(plain(result.draft), expectedStoredFlag);
  assert.equal(result.status, "Saved everywhere");
  assert.equal(result.saveInFlight, false);
  assert.equal(result.localSaveCount, 0, "An online save also wrote the local-only save path.");
  assert.equal(result.renderCount, 2, "The editor did not render both saving and settled states.");
}

async function testFailureThenRetry() {
  const calls = createCalls();
  let fail = true;
  const harness = createHarness(createSuccessfulApi(calls, async () => {
    if (fail) throw new Error("offline");
    return true;
  }));
  await harness.invoke();
  const failed = harness.read();
  assert.equal(failed.commitCount, 0, "A failed save committed local state.");
  assert.equal(failed.draft.pattern, draft.pattern, "A failed save discarded the draft.");
  assert.deepEqual(plain(failed.baseline), baseline, "A failed save changed the saved baseline.");
  assert.equal(failed.status, "Save failed — retry");
  assert.equal(failed.saveInFlight, false);
  assertExactDestinationFlags(calls);
  fail = false;
  await harness.invoke();
  const retried = harness.read();
  assert.equal(retried.commitCount, 1);
  assert.deepEqual(plain(retried.lastCommittedFlag), expectedStoredFlag);
  assert.equal(retried.status, "Saved everywhere");
  assertExactDestinationFlags(calls, 1);
}

async function testRepeatedTapGuard() {
  const calls = createCalls();
  let resolveProfile;
  const profilePending = new Promise(resolve => { resolveProfile = resolve; });
  const harness = createHarness(createSuccessfulApi(calls, () => profilePending));
  const first = harness.invoke();
  const repeated = harness.invoke();
  assert.equal(harness.read().saveInFlight, true);
  assert.deepEqual(Object.fromEntries(Object.entries(calls).map(([key, values]) => [key, values.length])), {
    profile: 1, identity: 1, snapshot: 1, presence: 1,
  }, "A repeated tap started duplicate writes.");
  assertExactDestinationFlags(calls);
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
