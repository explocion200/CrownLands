const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const client = read("firebaseClient.js");
const game = read("game.js");
const server = read("functions/index.js");
const worker = read("service-worker.js");
const rules = read("firestore.rules");

function extractFunction(source, name) {
  const regularStart = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 && (regularStart < 0 || asyncStart < regularStart)
    ? asyncStart
    : regularStart;
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      parametersEnd = index;
      break;
    }
  }
  assert.ok(parametersEnd >= 0, `Could not parse ${name} parameters.`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function sourceSection(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `Missing source section ${startText}.`);
  return source.slice(start, end);
}

const registrationState = extractFunction(client, "getPushRegistrationState");
assert.match(registrationState, /status:[\s\S]*?enabled:[\s\S]*?tokenId:[\s\S]*?error:/, "The client does not expose truthful push-registration state.");
assert.match(client, /pushRegistrationStatus:\s*"idle"[\s\S]*?setPushRegistrationState\("registering"\)[\s\S]*?setPushRegistrationState\("enabled"\)[\s\S]*?setPushRegistrationState\("error"/, "Push registration does not publish its complete lifecycle.");
assert.match(extractFunction(client, "saveNotificationToken"), /installationId,[\s\S]*?removeInstallationNotificationTokenDocs\(uid, \{ keepTokenId: tokenId \}\)/, "Token rotation does not bind and clean tokens by browser installation.");
assert.match(extractFunction(client, "removeNotificationToken"), /removeInstallationNotificationTokenDocs\(uid\)/, "Turning notifications off cannot clean a rotated token after reload.");
assert.match(client, /getPushRegistrationState,[\s\S]*?hasNotificationVapidKey/, "Push-registration state is not exported to the game UI.");

const pushUi = extractFunction(game, "updatePushAlertsUi");
assert.match(pushUi, /getPushRegistrationState[\s\S]*?registration\.enabled[\s\S]*?Connecting…[\s\S]*?Retry needed/, "Notification settings can still claim success from permission alone.");
assert.match(extractFunction(game, "refreshPushAlertRegistration"), /!getPushNotificationsPreference\(\)[\s\S]*?disablePushNotifications/, "A saved Off preference does not remove a stale server token after reload.");
assert.match(game, /addEventListener\("crownlands:push-notifications", updatePushAlertsUi\)/, "The settings UI does not react to asynchronous registration changes.");

assert.match(worker, /onBackgroundMessage\(payload => \{[\s\S]*?return self\.registration\.showNotification/, "The background worker does not keep notification display alive.");
assert.match(worker, /normalizedClientPath === normalizedTargetPath[\s\S]*?clients\.openWindow\(url\)/, "Notification clicks can still focus a non-game tab instead of opening the game.");
assert.match(extractFunction(worker, "getNotificationOpenUrl"), /notificationCity[\s\S]*?notificationRegion/, "A cold notification click loses its city target while opening the game.");
assert.match(extractFunction(game, "handleServiceWorkerUpdateMessage"), /pendingPushNotificationTarget[\s\S]*?focusPendingPushNotificationTarget/, "An alert clicked on the login screen is discarded before the kingdom loads.");
assert.match(extractFunction(game, "startFromInput"), /readPendingPushNotificationTarget[\s\S]*?focusPendingPushNotificationTarget/, "Cold-start notification targets are not consumed after the kingdom loads.");
assert.match(server, /url:\s*"\/play\/"/, "Incoming alerts do not target the playable game route.");
assert.doesNotMatch(extractFunction(server, "sendIncomingArmyNotification"), /fcmOptions:\s*\{[\s\S]*?link:/, "Web push still sends a relative Firebase click link, which Firebase rejects.");

const invalidTokenSandbox = {};
vm.createContext(invalidTokenSandbox);
vm.runInContext(`${extractFunction(server, "isInvalidMessagingTokenError")}; this.check = isInvalidMessagingTokenError;`, invalidTokenSandbox);
assert.equal(invalidTokenSandbox.check({ code: "messaging/registration-token-not-registered" }), true);
assert.equal(invalidTokenSandbox.check({ code: "messaging/invalid-registration-token" }), true);
assert.equal(invalidTokenSandbox.check({ code: "messaging/invalid-argument", message: "Webpush link must be an HTTPS URL" }), false, "A message-format error would delete a valid browser token.");
assert.equal(invalidTokenSandbox.check({ code: "messaging/invalid-argument", message: "Invalid registration token" }), true);

const outbox = extractFunction(server, "queueIncomingArmyNotification");
assert.match(outbox, /incoming_\$\{armyId\}_\$\{defenderUid\}/, "Retargeted attacks reuse another defender's outbox id.");
assert.match(sourceSection(server, "exports.sendNearbyScouts", "exports.sendRegroupOrders"), /notifications\.forEach[\s\S]*?queueIncomingArmyNotification\(transaction, notification\.armyId/, "Bulk scouts bypass the retryable notification outbox.");
assert.match(extractFunction(server, "refreshActiveArmyTargetOwner"), /queueIncomingArmyNotification\(batch, armyDoc\.id[\s\S]*?await batch\.commit\(\)/, "Retargeted attacks do not atomically queue their new-defender alert.");
assert.equal((server.match(/sendIncomingArmyNotification\(/g) || []).length, 2, "A launch path still sends push directly instead of using the outbox.");

assert.match(rules, /match \/notificationTokens\/\{tokenId\}[\s\S]*?token\.size\(\) >= 20[\s\S]*?installationId\.size\(\) <= 160/, "Notification token writes are not size-bounded or installation-aware.");

console.log("Validated truthful notification settings, durable outbox delivery, safe token cleanup, and game-route clicks.");
