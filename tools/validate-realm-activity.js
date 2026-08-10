const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const client = read("game.js");
const api = read("firebaseClient.js");
const server = read("functions/index.js");
const rules = read("firestore.rules");
const indexes = JSON.parse(read("firestore.indexes.json"));
const markup = read("index.html");
const styles = read("styles.css");
const packageJson = JSON.parse(read("functions/package.json"));

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} is missing.`);
  const nextFunction = source.indexOf("\nfunction ", start + marker.length);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

assert.match(server, /const REALM_ACTIVITY_VERSION = 1;/, "Realm Activity is not versioned.");
assert.match(server, /realmActivityVersion: REALM_ACTIVITY_VERSION/g, "Realm info does not advertise Realm Activity.");
const writer = functionBody(server, "writeRealmActivityCaptureEvent");
assert.match(writer, /!isStronghold\(target\)/, "Ordinary cities can enter Realm Activity.");
assert.match(writer, /STRONGHOLD_CAPTURED/, "Structured Stronghold events are missing.");
assert.match(writer, /CITADEL_CAPTURED/, "Structured Citadel events are missing.");
assert.match(writer, /objectiveId[\s\S]*?regionId[\s\S]*?x:[\s\S]*?y:/, "Realm events do not preserve objective location.");
assert.match(writer, /attackerPlayerId[\s\S]*?attackerClanId[\s\S]*?defenderPlayerId[\s\S]*?defenderClanId/, "Realm events do not preserve capture-time identities.");
assert.match(writer, /newKingPlayerId[\s\S]*?previousKingPlayerId/, "Citadel succession IDs are missing.");
assert.ok(
  (server.match(/writeRealmActivityCaptureEvent\(transaction/g) || []).length >= 3,
  "Direct and rally objective captures do not both write Realm Activity."
);
assert.doesNotMatch(writer, /liveMessage|Hear ye|All hail/, "The server stores presentation strings instead of structured event data.");

assert.match(api, /function subscribeRealmActivity[\s\S]*?realmEvents[\s\S]*?activity[\s\S]*?orderBy\("occurredAtMs", "desc"\)[\s\S]*?limit\(250\)/, "The bounded realtime Realm Activity subscription is missing.");
assert.match(api, /snapshot\.docChanges\(\)/, "Realtime Realm Activity changes are not exposed for live announcements.");
assert.match(api, /function markRealmAnnouncementSeen[\s\S]*?callServerFunction\("markRealmAnnouncementSeen"/, "The Realm announcement cursor callable is not exposed by the Firebase client.");
assert.match(rules, /match \/realmEvents\/\{resetGeneration\}\/activity\/\{eventId\}[\s\S]*?allow read:[\s\S]*?signedIn\(\)[\s\S]*?allow create, update, delete: if false;/, "Realm Activity rules are not authenticated and server-owned.");
assert.doesNotMatch(
  rules.slice(rules.indexOf("function validPlayerProfileUpdate"), rules.indexOf("function ownsCityOwnerIdentity")),
  /'realmAnnouncementSeenThroughMs'|'lastRealmAnnouncementEventId'/,
  "Players can write their own Realm announcement cursor."
);
assert.ok(indexes.indexes.some(index => (
  index.collectionGroup === "activity"
  && index.queryScope === "COLLECTION"
  && index.fields.some(field => field.fieldPath === "occurredAtMs" && field.order === "DESCENDING")
)), "The Realm Activity history index is missing.");

assert.match(markup, /id="realmAnnouncement"[\s\S]*?aria-live="assertive"/, "The live Realm announcement layer is missing.");
assert.match(styles, /\.realm-announcement,[\s\S]*?pointer-events:\s*none\s*!important/, "The Realm announcement can intercept gameplay input.");
assert.match(styles, /\.realm-announcement\.citadel[\s\S]*?\.realm-announcement-copy/, "Citadel announcements do not receive the royal visual treatment.");
assert.match(client, /realm_activity[\s\S]*?Realm Activity/, "Battle Reports does not expose the Realm Activity tab.");
assert.match(functionBody(client, "getUnreadReportCount"), /onlineRealmActivityEvents/, "Realm Activity does not contribute to the Reports unread badge.");
assert.match(functionBody(client, "enqueueRealmAnnouncement"), /CITADEL_CAPTURED[\s\S]*?aPriority[\s\S]*?occurredAtMs/, "The announcement queue does not prioritize Citadel events while preserving order.");
assert.match(functionBody(client, "focusRealmActivityTarget"), /switchOnlineIsland[\s\S]*?selectCity[\s\S]*?centerOnCity[\s\S]*?centerOnWorldPoint/, "View Location does not support cross-region objective and coordinate navigation.");
assert.match(functionBody(client, "mergeRealmActivitySnapshot"), /metadata\.fromCache[\s\S]*?type === "added"[\s\S]*?realmActivityLiveSinceMs/, "Initial or cached history can replay as a live announcement.");
assert.match(functionBody(client, "beginLoginPresentationSequence"), /mapReady:[\s\S]*?dailyResolved:[\s\S]*?welcomeResolved:[\s\S]*?realmCandidates:/, "The login presentation coordinator does not track each required completion state.");
assert.match(functionBody(client, "advanceLoginPresentationSequence"), /dailyResolved[\s\S]*?dailyFinished[\s\S]*?welcomeResolved[\s\S]*?welcomeFinished[\s\S]*?realmActivityAuthoritativeHydrated/, "Daily Login, Welcome Back, and Realm hydration are not sequenced explicitly.");
assert.match(functionBody(client, "finalizeLoginPresentationRealmCatchUp"), /CITADEL_CAPTURED[\s\S]*?markRealmAnnouncementSeen[\s\S]*?claimed/, "Realm catch-up does not prioritize Citadel events and claim the server-synced cursor.");
assert.match(server, /exports\.markRealmAnnouncementSeen\s*=\s*onCall[\s\S]*?realmAnnouncementSeenThroughMs[\s\S]*?lastRealmAnnouncementEventId[\s\S]*?claimed/, "The authoritative Realm announcement cursor callable is missing.");

const copySandbox = {
  CROWN_CITADEL_NAME: "Crown Citadel",
  renderPlayerNameLink(_id, name) {
    return name;
  },
  renderClanIdentityLink({ clanName }) {
    return clanName;
  },
  escapeHtml(value) {
    return String(value);
  },
};
vm.createContext(copySandbox);
["getRealmActivityObjectiveLabel", "formatRealmActivityParticipant", "getRealmActivityCopy"]
  .forEach(name => vm.runInContext(`${functionBody(client, name)}; this.${name} = ${name};`, copySandbox));

const strongholdEvent = {
  eventType: "STRONGHOLD_CAPTURED",
  strongholdType: "defense",
  objectiveName: "Ironwatch",
  attackerPlayerId: "arthur",
  attackerPlayerName: "Arthur",
  attackerClanId: "iron",
  attackerClanName: "Iron Legion",
  defenderPlayerId: "kael",
  defenderPlayerName: "Kael",
  defenderClanId: "wolves",
  defenderClanName: "Wolves",
};
const strongholdCopy = copySandbox.getRealmActivityCopy(strongholdEvent);
assert.equal(strongholdCopy.title, "THE DEFENSE STRONGHOLD HAS FALLEN");
assert.equal(strongholdCopy.body, "Arthur of Iron Legion has overthrown Kael of Wolves and seized control of the Defense Stronghold.");
assert.equal(strongholdCopy.liveMessage, "Arthur seized the Defense Stronghold.");
assert.doesNotMatch(strongholdCopy.liveMessage, /Iron Legion|Wolves/, "Live Stronghold announcements include clan text.");

const attackerClanOnly = copySandbox.getRealmActivityCopy({
  ...strongholdEvent,
  defenderClanId: "",
  defenderClanName: "",
});
assert.equal(attackerClanOnly.body, "Arthur of Iron Legion has overthrown Kael and seized control of the Defense Stronghold.");

const defenderClanOnly = copySandbox.getRealmActivityCopy({
  ...strongholdEvent,
  attackerClanId: "",
  attackerClanName: "",
});
assert.equal(defenderClanOnly.body, "Arthur has overthrown Kael of Wolves and seized control of the Defense Stronghold.");

const neitherClan = copySandbox.getRealmActivityCopy({
  ...strongholdEvent,
  attackerClanId: "",
  attackerClanName: "",
  defenderClanId: "",
  defenderClanName: "",
});
assert.equal(neitherClan.body, "Arthur has overthrown Kael and seized control of the Defense Stronghold.");

const neutralStronghold = copySandbox.getRealmActivityCopy({
  ...strongholdEvent,
  defenderPlayerId: "",
  defenderPlayerName: "",
  defenderClanId: "",
  defenderClanName: "",
});
assert.equal(neutralStronghold.body, "Arthur of Iron Legion has seized the unclaimed Defense Stronghold.");

const citadelCopy = copySandbox.getRealmActivityCopy({
  ...strongholdEvent,
  eventType: "CITADEL_CAPTURED",
  objectiveName: "Crown Citadel",
  strongholdType: "crown",
});
assert.equal(citadelCopy.title, "A NEW KING RISES");
assert.match(citadelCopy.body, /overthrown King Kael of Wolves/);
assert.equal(citadelCopy.closing, "All hail King Arthur, ruler of Crownlands!");
assert.equal(citadelCopy.liveMessage, "All hail King Arthur!");

const neutralCitadel = copySandbox.getRealmActivityCopy({
  ...strongholdEvent,
  eventType: "CITADEL_CAPTURED",
  defenderPlayerId: "",
  defenderPlayerName: "",
  defenderClanId: "",
  defenderClanName: "",
});
assert.match(neutralCitadel.body, /claimed the vacant throne/);
assert.doesNotMatch(neutralCitadel.body, /overthrown King/);

const queueSandbox = {
  activeRealmAnnouncement: { eventId: "currently-visible" },
  realmAnnouncementQueue: [],
  deliveredRealmAnnouncementEventIds: new Set(),
  normalizeRealmActivityEvent(event) {
    return event;
  },
  isLoginPresentationSequenceActive() {
    return false;
  },
  addLoginPresentationRealmCandidate() {
    return false;
  },
  showNextRealmAnnouncement() {},
};
vm.createContext(queueSandbox);
vm.runInContext(`${functionBody(client, "enqueueRealmAnnouncement")}; this.enqueueRealmAnnouncement = enqueueRealmAnnouncement;`, queueSandbox);
queueSandbox.enqueueRealmAnnouncement({ eventId: "stronghold-later", eventType: "STRONGHOLD_CAPTURED", occurredAtMs: 200 });
queueSandbox.enqueueRealmAnnouncement({ eventId: "citadel", eventType: "CITADEL_CAPTURED", occurredAtMs: 300 });
queueSandbox.enqueueRealmAnnouncement({ eventId: "stronghold-earlier", eventType: "STRONGHOLD_CAPTURED", occurredAtMs: 100 });
assert.deepEqual(
  Array.from(queueSandbox.realmAnnouncementQueue, event => event.eventId),
  ["citadel", "stronghold-earlier", "stronghold-later"],
  "Citadel events do not move ahead of waiting Strongholds or Stronghold FIFO order changed."
);

assert.ok(packageJson.scripts.test.includes("validate-realm-activity.js"), "Realm Activity validation is not part of the static release gate.");
console.log("Validated authoritative Realm Activity, medieval wording, live queue behavior, location navigation, rules, and bounded season history.");
