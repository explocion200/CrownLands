const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "game.js"), "utf8");

function functionSource(name) {
  const asyncMarker = `async function ${name}`;
  const regularMarker = `function ${name}`;
  const asyncStart = source.indexOf(asyncMarker);
  const marker = asyncStart === -1 ? regularMarker : asyncMarker;
  const start = asyncStart === -1 ? source.indexOf(regularMarker) : asyncStart;
  assert.notEqual(start, -1, `${name} is missing.`);
  const next = source.indexOf("\nfunction ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function createSequence(overrides = {}) {
  return {
    generation: 1,
    kind: "login",
    mapReady: true,
    seasonResolved: true,
    seasonFinished: true,
    seasonOpen: false,
    dailyResolved: true,
    dailyRequired: false,
    dailyOpen: false,
    dailyFinished: true,
    welcomeResolved: true,
    welcomeOpen: false,
    welcomeFinished: true,
    realmCandidates: new Map(),
    deferredLiveEvents: new Map(),
    batchEventIds: new Set(),
    finalizing: false,
    finished: false,
    ...overrides,
  };
}

assert.match(
  functionSource("startFromInput"),
  /beginLoginPresentationSequence[\s\S]*?startLoginPresentationDailyRefresh\(presentationGeneration\)[\s\S]*?markLoginPresentationMapReady\(presentationGeneration\)/,
  "Fresh realm entry does not start and release the event-driven presentation sequence."
);
assert.match(
  functionSource("synchronizeForegroundGame"),
  /beginLoginPresentationSequence[\s\S]*?startLoginPresentationDailyRefresh\(presentationGeneration\)[\s\S]*?markLoginPresentationMapReady\(presentationGeneration\)/,
  "Foreground resume does not use the same event-driven presentation sequence."
);
assert.match(
  functionSource("performServerEconomyRefresh"),
  /resolveLoginPresentationWelcomePhase\(options\.presentationGeneration\)[\s\S]*?catch[\s\S]*?resolveLoginPresentationWelcomePhase\(options\.presentationGeneration\)/,
  "Welcome Back does not resolve the presentation phase on both success and failure."
);

function createAdvanceContext(sequence, { stored = new Map(), storageUnavailable = false } = {}) {
  const actions = [];
  const seasonOptions = [];
  const context = {
    testUid: "fixture-player",
    RESET_GENERATION: "realm-2026-10",
    seasonRewardAutoOpenUsed: new Set(),
    getCurrentOnlineUid: () => context.testUid,
    window: { localStorage: {
      getItem: key => { if (storageUnavailable) throw Error("Storage unavailable"); return stored.get(key); },
      setItem: (key, value) => { if (storageUnavailable) throw Error("Storage unavailable"); stored.set(key, value); },
    } },
    showSeasonRewardsPanel: options => { seasonOptions.push(options); actions.push("season"); return true; },
    loginPresentationGeneration: 1,
    loginPresentationSequence: sequence,
    realmActivityAuthoritativeHydrated: true,
    dailyLoginRewardStatus: { eligible: true },
    pendingOfflineRewardsSummary: { goldGained: 10 },
    modal: { open: false },
    profileScreen: { classList: { contains: () => false } },
    document: { visibilityState: "visible" },
    hasDailyLoginAutoOpenBeenUsed: () => false,
    maybeAutoOpenDailyLoginRewards: () => {
      actions.push("daily");
      return true;
    },
    showPendingOfflineRewardsSummary: () => {
      actions.push("welcome");
      return true;
    },
    finalizeLoginPresentationRealmCatchUp: () => {
      actions.push("realm");
      return true;
    },
  };
  vm.createContext(context);
  vm.runInContext(functionSource("isLoginPresentationSequenceActive"), context);
  for (const name of ["getSeasonRewardAutoOpenKey", "hasSeasonRewardAutoOpenBeenUsed", "markSeasonRewardAutoOpenUsed", "advanceLoginPresentationSequence"]) {
    vm.runInContext(functionSource(name), context);
  }
  return { context, actions, seasonOptions };
}

{
  const sequence = createSequence({
    dailyRequired: true,
    dailyFinished: false,
    welcomeFinished: false,
  });
  const { context, actions } = createAdvanceContext(sequence);
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, ["daily"], "Welcome Back or Realm Activity bypassed Daily Login.");
  sequence.dailyOpen = false;
  sequence.dailyFinished = true;
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, ["daily", "welcome"], "Realm Activity bypassed Welcome Back.");
  sequence.welcomeOpen = false;
  sequence.welcomeFinished = true;
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, ["daily", "welcome", "realm"], "Realm Activity did not follow the completed login sequence.");
}

{
  const sequence = createSequence({ seasonResolved: false, seasonFinished: false, dailyRequired: true, dailyFinished: false,
    seasonStatus: { seasonId: "realm-2026-09", status: "ready", award: { claimed: false } } });
  const { context, actions } = createAdvanceContext(sequence);
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, [], "Login must await the season reward status.");
  sequence.seasonResolved = true;
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, ["season"], "Last Season Rewards must precede Daily Login.");
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, ["season"], "Repeated callbacks must not reopen season results.");
  sequence.seasonFinished = true; sequence.seasonOpen = false;
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, ["season", "daily"]);
}

for (const scenario of [
  { name: "failed lookup", status: { loadFailed: true }, expectedSeason: "" },
  { name: "pending finalization", status: { seasonId: "realm-2026-09", status: "finalizing", participated: true }, expectedSeason: "realm-2026-09" },
  { name: "older unclaimed award", status: { seasonId: "realm-2026-10", status: "ready", pendingSeasons: ["realm-2026-09"] }, expectedSeason: "realm-2026-09" },
]) {
  const sequence = createSequence({ mapReady: false, seasonFinished: false, seasonStatus: scenario.status, dailyRequired: true, dailyFinished: false, welcomeFinished: false });
  const { context, actions, seasonOptions } = createAdvanceContext(sequence);
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, [], `${scenario.name}: rewards must wait for the kingdom to load.`);
  sequence.mapReady = true;
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, ["season"], `${scenario.name}: show the season pop-up before Daily Login.`);
  assert.equal(seasonOptions[0].seasonId, scenario.expectedSeason);
  assert.equal(seasonOptions[0].view, "results");
  assert.equal(seasonOptions[0].login, true);
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, ["season"], `${scenario.name}: no duplicate pop-up.`);
  vm.runInContext(functionSource("completeLoginPresentationModal"), context);
  context.completeLoginPresentationModal("season");
  assert.deepEqual(actions, ["season", "daily"], `${scenario.name}: dismissal releases Daily Login.`);
  context.completeLoginPresentationModal("daily");
  assert.deepEqual(actions, ["season", "daily", "welcome"]);
}

// Presentation memory survives a new JS context (reload/relogin), while earned
// rewards remain unclaimed and another account/season gets its own first notice.
{
  const stored = new Map();
  const status = { seasonId: "realm-2026-09", status: "ready", award: { claimed: false } };
  const first = createAdvanceContext(createSequence({ seasonFinished: false, seasonStatus: status }), { stored });
  first.context.advanceLoginPresentationSequence();
  assert.deepEqual(first.actions, ["season"]);
  const next = createAdvanceContext(createSequence({ seasonFinished: false, seasonStatus: status, dailyRequired: true, dailyFinished: false, welcomeFinished: false }), { stored });
  next.context.advanceLoginPresentationSequence();
  assert.deepEqual(next.actions, ["daily"], "Reload/relogin must skip the already-presented season and release Daily Login.");
  assert.equal(status.award.claimed, false, "Remembering presentation cannot claim rewards.");
  vm.runInContext(functionSource("completeLoginPresentationModal"), next.context);
  next.context.completeLoginPresentationModal("daily");
  assert.deepEqual(next.actions, ["daily", "welcome"]);
  for (const scope of [{ testUid: "another-player" }, { RESET_GENERATION: "realm-2026-11" }]) {
    const other = createAdvanceContext(createSequence({ seasonFinished: false, seasonStatus: status }), { stored });
    Object.assign(other.context, scope);
    other.context.advanceLoginPresentationSequence();
    assert.deepEqual(other.actions, ["season"], "Another player or season must receive its own reminder, even for older outstanding awards.");
  }
}
for (const blocked of [{ mapReady: false }, { kind: "resume" }]) {
  const sequence = createSequence({ seasonFinished: false, seasonStatus: { loadFailed: true }, ...blocked });
  const { context, actions } = createAdvanceContext(sequence);
  context.advanceLoginPresentationSequence();
  assert(!actions.includes("season"), "Resume or an unloaded kingdom must not open the login reminder.");
  assert.equal(context.hasSeasonRewardAutoOpenBeenUsed(), false, "Skipped presentation must not consume the reminder.");
}
{
  const status = { seasonId: "realm-2026-09", status: "finalizing", participated: true };
  const first = createAdvanceContext(createSequence({ seasonFinished: false, seasonStatus: status }), { storageUnavailable: true });
  first.context.advanceLoginPresentationSequence();
  first.context.loginPresentationSequence = createSequence({ seasonFinished: false, seasonStatus: status });
  first.context.advanceLoginPresentationSequence();
  assert.deepEqual(first.actions, ["season", "realm"], "Unavailable storage still remembers within the page.");
}
{
  const { context, actions } = createAdvanceContext(createSequence({ seasonFinished: false, seasonStatus: { loadFailed: true } }));
  context.showSeasonRewardsPanel = () => false;
  context.advanceLoginPresentationSequence();
  assert.equal(context.hasSeasonRewardAutoOpenBeenUsed(), false, "A panel that could not open must not consume the reminder.");
  assert.deepEqual(actions, ["realm"], "A missing panel must not stall the login sequence.");
  assert.equal(context.loginPresentationSequence.seasonOpen, false);
  context.testUid = "";
  assert.equal(context.hasSeasonRewardAutoOpenBeenUsed(), true, "Signed-out pages cannot store an anonymous reminder.");
}

for (const status of [
  { status: "ready", award: { claimed: true } },
  { status: "ready", participated: true, award: null },
  { status: "not-started", pendingSeasons: [] },
]) {
  const sequence = createSequence({ seasonFinished: false, seasonStatus: status });
  const { context, actions } = createAdvanceContext(sequence);
  context.advanceLoginPresentationSequence(sequence);
  assert.deepEqual(actions, ["realm"], "Claimed awards and confirmed non-winners must not receive a reward pop-up.");
}

for (const scenario of [
  { name: "daily-only", dailyRequired: true, dailyFinished: false, welcomeFinished: true, first: "daily" },
  { name: "welcome-only", dailyRequired: false, dailyFinished: true, welcomeFinished: false, first: "welcome" },
  { name: "neither", dailyRequired: false, dailyFinished: true, welcomeFinished: true, first: "realm" },
]) {
  const sequence = createSequence(scenario);
  const { context, actions } = createAdvanceContext(sequence);
  context.advanceLoginPresentationSequence(sequence);
  assert.equal(actions[0], scenario.first, `${scenario.name} did not begin with ${scenario.first}.`);
}

async function validateCatchUpPriority() {
  const selectedEvents = [];
  let callablePayload = null;
  const stronghold = { eventId: "stronghold-newer", eventType: "STRONGHOLD_CAPTURED", occurredAtMs: 300 };
  const citadel = { eventId: "citadel-older", eventType: "CITADEL_CAPTURED", occurredAtMs: 200 };
  const sequence = createSequence({
    realmCandidates: new Map([[stronghold.eventId, stronghold], [citadel.eventId, citadel]]),
  });
  const context = {
    loginPresentationGeneration: 1,
    loginPresentationSequence: sequence,
    state: { realmAnnouncementSeenThroughMs: 100, lastRealmAnnouncementEventId: "" },
    deliveredRealmAnnouncementEventIds: new Set(),
    normalizeTimestampMs: value => Math.max(0, Math.floor(Number(value) || 0)),
    getLoginPresentationRealmFloorMs: () => 100,
    getOnlineApi: () => ({
      isSignedIn: () => true,
      markRealmAnnouncementSeen: async payload => {
        callablePayload = payload;
        return {
          claimed: true,
          eventId: payload.eventId,
          realmAnnouncementSeenThroughMs: payload.seenThroughMs,
          lastRealmAnnouncementEventId: payload.eventId,
        };
      },
    }),
    enqueueRealmAnnouncement: event => {
      selectedEvents.push(event);
      return true;
    },
    showNextRealmAnnouncement() {},
    console,
    String,
    Math,
    Map,
    Set,
  };
  vm.createContext(context);
  for (const name of [
    "isLoginPresentationSequenceActive",
    "finishLoginPresentationSequence",
    "finalizeLoginPresentationRealmCatchUp",
  ]) {
    vm.runInContext(functionSource(name), context);
  }
  await context.finalizeLoginPresentationRealmCatchUp(sequence);
  assert.equal(callablePayload.eventId, citadel.eventId, "The latest unseen Citadel did not outrank a newer Stronghold.");
  assert.equal(callablePayload.seenThroughMs, stronghold.occurredAtMs, "The catch-up batch did not consume every represented unseen event.");
  assert.equal(selectedEvents.length, 1, "The login catch-up displayed more than one Realm announcement.");
  assert.equal(selectedEvents[0].eventId, citadel.eventId, "The claimed Citadel event was not displayed.");
}

validateCatchUpPriority()
  .then(() => console.log("Validated Daily Login, Welcome Back, Realm catch-up ordering, and Citadel priority."))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
