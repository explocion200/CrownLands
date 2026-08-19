const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const CHAT = require(path.join(root, "functions", "chat.js"));
const UI = require(path.join(root, "chat-ui.js"));

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requires(text, pattern, message) {
  assert.match(text, pattern, message);
}

assert.deepEqual(UI.CHAT_MODES, ["closed", "quick", "full"]);
assert.equal(UI.nextChatMode("closed", "toggle"), "quick");
assert.equal(UI.nextChatMode("quick", "toggle"), "closed");
assert.equal(UI.nextChatMode("quick", "full"), "full");
assert.equal(UI.nextChatMode("full", "minimize"), "quick");
assert.equal(UI.nextChatMode("full", "close"), "closed");

const openGeometry = UI.calculateQuickPanelGeometry({
  toggleRect: { left: 475, top: 318, height: 56 },
  viewportWidth: 844,
  viewportHeight: 390,
});
assert.deepEqual({
  visible: openGeometry.visible,
  left: openGeometry.left,
  right: openGeometry.right,
  top: openGeometry.top,
  width: openGeometry.width,
  messageLimit: openGeometry.messageLimit,
}, { visible: true, left: 106, right: 466, top: 314, width: 360, messageLimit: 3 });

const baseHudGeometry = UI.calculateQuickPanelGeometry({
  toggleRect: { left: 475, top: 318, height: 56 },
  viewportWidth: 844,
  viewportHeight: 390,
  blockerRects: [{ left: 12, right: 110, top: 332, bottom: 378 }],
});
assert.deepEqual({
  visible: baseHudGeometry.visible,
  left: baseHudGeometry.left,
  width: baseHudGeometry.width,
  availableWidth: baseHudGeometry.availableWidth,
  messageLimit: baseHudGeometry.messageLimit,
}, { visible: true, left: 119, width: 347, availableWidth: 347, messageLimit: 3 });

const oneMovementGeometry = UI.calculateQuickPanelGeometry({
  toggleRect: { left: 475, top: 318, height: 56 },
  viewportWidth: 844,
  viewportHeight: 390,
  blockerRects: [{ left: 12, right: 110, top: 277, bottom: 378 }],
});
assert.deepEqual({
  visible: oneMovementGeometry.visible,
  left: oneMovementGeometry.left,
  width: oneMovementGeometry.width,
  messageLimit: oneMovementGeometry.messageLimit,
}, { visible: true, left: 119, width: 347, messageLimit: 3 });

const bothMovementGeometry = UI.calculateQuickPanelGeometry({
  toggleRect: { left: 475, top: 318, height: 56 },
  viewportWidth: 844,
  viewportHeight: 390,
  blockerRects: [{ left: 12, right: 110, top: 222, bottom: 378 }],
});
assert.deepEqual({
  visible: bothMovementGeometry.visible,
  left: bothMovementGeometry.left,
  width: bothMovementGeometry.width,
  availableWidth: bothMovementGeometry.availableWidth,
  messageLimit: bothMovementGeometry.messageLimit,
}, { visible: true, left: 119, width: 347, availableWidth: 347, messageLimit: 3 });

const narrowGeometry = UI.calculateQuickPanelGeometry({
  toggleRect: { left: 207, top: 248, height: 56 },
  viewportWidth: 568,
  viewportHeight: 320,
  blockerRects: [{ left: 12, right: 110, top: 152, bottom: 308 }],
});
assert.equal(narrowGeometry.visible, false);
assert.equal(narrowGeometry.availableWidth, 79);
assert.equal(UI.CHAT_QUICK_MIN_READABLE_WIDTH, 160);

assert.equal(UI.CHAT_SEND_COOLDOWN_MS, 3000);
assert.equal(UI.chatCooldownRemainingMs({ retryAfterMs: 2300 }), 2300);
assert.equal(UI.chatCooldownRemainingMs({ details: { cooldownUntilMs: 13_000, serverNowMs: 11_200 } }), 1800);
let fakeNowMs = 10_000;
let scheduledTimer = null;
let clearedTimers = 0;
const cooldownChanges = [];
const cooldownTimer = UI.createChatCooldownTimer({
  now: () => fakeNowMs,
  setTimeout(callback, delay) {
    scheduledTimer = { callback, delay, id: Symbol("chat-timer") };
    return scheduledTimer.id;
  },
  clearTimeout() { clearedTimers += 1; },
  onChange: remainingMs => cooldownChanges.push(remainingMs),
});
assert.equal(cooldownTimer.start(3000), 3000);
assert.equal(cooldownTimer.diagnostics().cooldownTimerActive, true);
fakeNowMs = 12_050;
scheduledTimer.callback();
assert.equal(cooldownTimer.remainingMs(), 950);
cooldownTimer.stop();
assert.equal(cooldownTimer.diagnostics().cooldownTimerActive, false);
assert.equal(cooldownTimer.remainingMs(), 0);
assert(clearedTimers >= 1, "Cooldown timer was not cleaned up.");
assert.deepEqual(cooldownChanges, [3000, 950, 0]);

assert.equal(CHAT.normalizeChatChannel(" GLOBAL "), "global");
assert.equal(CHAT.normalizeChatChannel("trade"), "");
assert.equal(CHAT.normalizeChatText("  Hail\r\nrealm\u0000  ").text, "Hail\nrealm");
assert.equal(CHAT.normalizeChatText("royal\u202Ename").text, "royalname");
assert.equal(CHAT.normalizeChatText("   \n ").ok, false);
assert.equal(CHAT.normalizeChatText("x".repeat(250)).ok, true);
assert.equal(CHAT.normalizeChatText("x".repeat(251)).ok, false);
assert.equal(CHAT.normalizeChatRequestId("chat_1234567890"), "chat_1234567890");
assert.equal(CHAT.normalizeChatRequestId("short"), "");
assert.equal(CHAT.chatMessageId("uid", "chat_1234567890"), CHAT.chatMessageId("uid", "chat_1234567890"));
assert.notEqual(CHAT.chatMessageId("uid", "chat_1234567890"), CHAT.chatMessageId("other", "chat_1234567890"));

assert.equal(CHAT.CHAT_SEND_COOLDOWN_MS, 3000);
const firstCooldown = CHAT.evaluateChatSendCooldown({}, 10_000);
assert.equal(firstCooldown.ok, true);
assert.equal(firstCooldown.cooldownUntilMs, 13_000);
const immediateCooldown = CHAT.evaluateChatSendCooldown(firstCooldown.next, 10_001);
assert.equal(immediateCooldown.ok, false);
assert.equal(immediateCooldown.retryAfterMs, 2999);
assert.equal(CHAT.evaluateChatSendCooldown(firstCooldown.next, 12_999).ok, false);
assert.equal(CHAT.evaluateChatSendCooldown(firstCooldown.next, 13_000).ok, true);

const calls = [];
const unsubscribed = [];
const callbacks = [];
const fakeApi = {
  subscribeChatMessages(options, handlers) {
    const id = calls.length;
    calls.push({ ...options });
    callbacks.push(handlers);
    return () => unsubscribed.push(id);
  },
};
const delivered = [];
const manager = UI.createChatSubscriptionManager({
  onMessages: (channel, messages) => delivered.push({ channel, messages }),
});
manager.start(fakeApi, "player-1", "clan-a");
assert.equal(manager.diagnostics().globalListeners, 1);
assert.equal(manager.diagnostics().clanListeners, 1);
assert.deepEqual(calls.map(call => call.channel), ["global", "clan"]);
manager.start(fakeApi, "player-1", "clan-a");
assert.equal(calls.length, 2, "Starting the same session created duplicate listeners.");
manager.updateClan("clan-b");
assert.equal(calls.length, 3);
assert.deepEqual(unsubscribed, [1]);
callbacks[0].onMessages([{ id: "global-after-swap" }]);
callbacks[1].onMessages([{ id: "stale-clan" }]);
callbacks[2].onMessages([{ id: "current-clan" }]);
assert.deepEqual(delivered.map(item => item.channel), ["global", "clan"], "Clan switching invalidated Global or delivered stale Clan data.");
manager.stop();
assert.deepEqual(unsubscribed, [1, 0, 2]);
assert.equal(manager.diagnostics().totalListeners, 0);

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.textContent = "";
    this.listeners = {};
  }
  append(...children) { this.children.push(...children); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  setAttribute(name, value) { this[name] = value; }
}
const fakeDocument = { createElement: tagName => new FakeElement(tagName) };
const unsafeText = `<img src=x onerror="globalThis.pwned=true">`;
const rendered = UI.renderMessageElement(fakeDocument, {
  id: "unsafe",
  senderUid: "attacker",
  senderDisplayName: "<script>name</script>",
  text: unsafeText,
  createdAtMs: Date.now(),
});
assert.equal(rendered.children[1].textContent, unsafeText, "Message text was not rendered as inert text content.");
assert.equal(rendered.children[0].children[0].textContent, "<script>name</script>".slice(0, 18));

const server = source("functions/index.js");
const rules = source("firestore.rules");
const client = source("firebaseClient.js");
const ui = source("chat-ui.js");
const layoutRuntime = source("ui-layout-runtime.js");
const game = source("game.js");
const html = source("index.html");
const styles = source("chat.css");
const indexes = JSON.parse(source("firestore.indexes.json"));
const releaseManifestBuilder = source("tools/generate-release-manifest.js");
const visualFixture = source("docs/visual-qa/chat/index.html");

requires(server, /exports\.sendChatMessage\s*=\s*timedCallable\("sendChatMessage"/, "Chat must use an observable authenticated callable write path.");
requires(server, /assertChatPayloadDoesNotSpoofIdentity/, "Server-owned identity fields must be rejected.");
requires(server, /transaction\.get\(restrictionRef\)/, "Chat sends must enforce the moderation restriction record.");
requires(server, /transaction\.get\(db\.doc\(`clans\/\$\{clanId\}\/members\/\$\{uid\}`\)\)/, "Clan sends must verify membership server-side.");
requires(server, /CHAT\.evaluateChatSendCooldown/, "Chat sends must enforce the authoritative player cooldown.");
requires(server, /retryAfterMs:\s*CHAT\.CHAT_SEND_COOLDOWN_MS/, "Accepted chat responses must synchronize the client cooldown.");
requires(server, /transaction\.create\(messageRef/, "Chat messages must be server-created.");
requires(server, /expiresAtMs/, "Chat records must carry retention timestamps.");
requires(server, /exports\.cleanupExpiredChat\s*=\s*onSchedule/, "Chat retention must have scheduled cleanup.");
requires(rules, /match \/globalChat\/\{resetId\}\/messages\/\{messageId\}[\s\S]*?allow create, update, delete: if false;/, "Global Chat client writes must be denied.");
requires(rules, /match \/messages\/\{messageId\}[\s\S]*?clanMember\(clanId\)[\s\S]*?allow create, update, delete: if false;/, "Clan Chat must enforce membership and deny client writes.");
requires(rules, /data\.clanId == clanId/, "Clan reads must follow the player's current authoritative clan.");
requires(client, /function subscribeChatMessages[\s\S]*?onSnapshot/, "Chat must use bounded Firestore realtime listeners.");
requires(client, /const safeLimit = Math\.max\(1, Math\.min\(100,[\s\S]*?limit\(safeLimit\)/, "Initial chat reads must be bounded.");
requires(ui, /textContent\s*=\s*message\.text/, "User-authored chat content must use textContent.");
assert.doesNotMatch(ui, /\.innerHTML\s*=/, "Chat UI must not inject message HTML.");
requires(game, /function disposeOnlineChat[\s\S]*?CrownlandsChat\?\.dispose/, "Chat listeners must be disposed with the online session.");
requires(game, /crownlands:chat-player-profile/, "Chat sender names must open public profiles.");
requires(game, /function notifyMovementHudOccupancyChange[\s\S]*?crownlands:hud-occupancy-changed/, "Movement HUD visibility changes must trigger collision recalculation.");
requires(game, /incomingAttackBtn\.hidden\s*=\s*incoming\.length === 0;[\s\S]*?notifyMovementHudOccupancyChange\(incomingAttackBtn/, "Incoming HUD visibility changes must notify the chat collision runtime.");
requires(game, /outgoingAttackBtn\.hidden\s*=\s*total === 0;[\s\S]*?notifyMovementHudOccupancyChange\(outgoingAttackBtn/, "Outgoing HUD visibility changes must notify the chat collision runtime.");
for (const id of ["chatToggleBtn", "quickChat", "chatDialog", "chatMessageList", "chatMessageInput", "chatSendBtn"]) {
  requires(html, new RegExp(`id=["']${id}["']`), `Missing chat UI element #${id}.`);
}
requires(html, /data-chat-channel="global"/, "Global Chat tab is missing.");
requires(html, /data-chat-channel="clan"/, "Clan Chat tab is missing.");
requires(styles, /\.chat-toggle-btn[\s\S]*?width:\s*56px[\s\S]*?height:\s*56px/, "Chat HUD control must use the compact 56px footprint.");
requires(styles, /\.quick-chat\s*\{[\s\S]*?height:\s*64px[\s\S]*?overflow:\s*hidden/, "Quick Peek must remain a compact same-row HUD panel.");
requires(ui, /calculateQuickPanelGeometry[\s\S]*?blockerRects[\s\S]*?minimumReadableWidth[\s\S]*?messageLimit/, "Quick Peek must derive width and message count from measured HUD blockers.");
requires(ui, /crownlands:hud-occupancy-changed/, "Quick Peek must react to dynamic HUD occupancy without reopening chat.");
assert.doesNotMatch(ui, /requestAnimationFrame|setInterval/, "Quick Peek collision and cooldown handling must not use a persistent animation or polling loop.");
requires(ui, /createChatCooldownTimer[\s\S]*?clearTimer[\s\S]*?cooldown\.stop\(\)/, "Client cooldown timers must be explicitly cleaned up.");
requires(layoutRuntime, /function alignChatToBag[\s\S]*?bagRect\.left \+ chatRowGap[\s\S]*?centeredTop[\s\S]*?crownlands:ui-layout-applied/, "Chat must follow the unchanged Bag rectangle across responsive HUD breakpoints.");
requires(source("ui-layout-config.js"), /"chat":\s*\{[\s\S]*?"offsetX":\s*313[\s\S]*?"offsetY":\s*16[\s\S]*?"width":\s*56[\s\S]*?"height":\s*56[\s\S]*?"inventory":\s*\{[\s\S]*?"offsetX":\s*240[\s\S]*?"width":\s*64[\s\S]*?"height":\s*64/, "Chat must be centered beside the unchanged Bag geometry.");
requires(styles, /@media \(max-width: 900px\) and \(orientation: landscape\)[\s\S]*?grid-template-rows: auto auto minmax\(0, 1fr\) auto auto !important;/, "Landscape-phone Chat must override the shared two-row modal grid.");
assert(indexes.indexes.some(index => index.collectionGroup === "messages"
  && index.fields.some(field => field.fieldPath === "createdAtMs")), "Chat message index is missing.");
for (const collectionGroup of ["messages", "chatSendRequests"]) {
  assert(indexes.fieldOverrides.some(override => override.collectionGroup === collectionGroup
    && override.fieldPath === "expiresAtMs"
    && override.indexes.some(index => index.queryScope === "COLLECTION_GROUP")), `${collectionGroup} cleanup index is missing.`);
}
requires(releaseManifestBuilder, /"chat\.css", "chat-ui\.js"/, "Chat assets must participate in release integrity hashes.");
requires(visualFixture, /chat\.css[\s\S]*?chat-ui\.js[\s\S]*?fixture\.js/, "Chat visual QA must load the production styles and runtime.");

function jpegDimensions(buffer) {
  assert.equal(buffer.toString("hex", 0, 2), "ffd8", "Screenshot is not a JPEG.");
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) offset += 2;
    else offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  throw new Error("Screenshot JPEG dimensions could not be read.");
}

for (const [fileName, width, height] of [
  ["landscape-quick-none.jpg", 844, 390],
  ["landscape-quick-incoming.jpg", 844, 390],
  ["landscape-quick-outgoing.jpg", 844, 390],
  ["landscape-quick-both.jpg", 844, 390],
  ["narrow-quick-both.jpg", 568, 320],
  ["full-cooldown-start.jpg", 844, 390],
  ["full-cooldown-final-second.jpg", 844, 390],
  ["full-cooldown-ready.jpg", 844, 390],
]) {
  const dimensions = jpegDimensions(fs.readFileSync(path.join(root, "docs", "visual-qa", "chat", fileName)));
  assert.deepEqual(dimensions, { width, height }, `${fileName} has the wrong dimensions.`);
}

console.log("Chat validation passed: state machine, listener lifecycle, validation, safe rendering, security, retention, and integration contracts are present.");
