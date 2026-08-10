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
    mapReady: true,
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

function createAdvanceContext(sequence) {
  const actions = [];
  const context = {
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
  vm.runInContext(functionSource("advanceLoginPresentationSequence"), context);
  return { context, actions };
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
