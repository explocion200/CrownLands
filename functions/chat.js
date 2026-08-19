const crypto = require("node:crypto");

const CHAT_SCHEMA_VERSION = 1;
const CHAT_MESSAGE_MAX_LENGTH = 250;
const CHAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CHAT_REQUEST_RETENTION_MS = 24 * 60 * 60 * 1000;
const CHAT_SEND_COOLDOWN_MS = 3 * 1000;
const CHAT_CHANNELS = Object.freeze(["global", "clan"]);

function normalizeChatChannel(value = "") {
  const channel = String(value || "").trim().toLowerCase();
  return CHAT_CHANNELS.includes(channel) ? channel : "";
}

function normalizeChatRequestId(value = "") {
  const requestId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{12,96}$/.test(requestId) ? requestId : "";
}

function normalizeChatText(value) {
  if (typeof value !== "string") return { ok: false, reason: "Message text is required." };
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/\t/g, " ")
    .trim();
  const length = Array.from(text).length;
  if (!length) return { ok: false, reason: "Enter a message before sending." };
  if (length > CHAT_MESSAGE_MAX_LENGTH) {
    return { ok: false, reason: `Messages can be up to ${CHAT_MESSAGE_MAX_LENGTH} characters.` };
  }
  return { ok: true, text, length };
}

function chatRequestSignature({ uid = "", channel = "", clanId = "", text = "" } = {}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([String(uid), String(channel), String(clanId), String(text)]))
    .digest("hex");
}

function chatMessageId(uid = "", requestId = "") {
  return crypto
    .createHash("sha256")
    .update(`${String(uid)}|${String(requestId)}`)
    .digest("hex")
    .slice(0, 40);
}

function evaluateChatSendCooldown(raw = {}, nowMs = Date.now()) {
  const lastMessageAtMs = Math.max(0, Math.floor(Number(raw.lastMessageAtMs) || 0));
  if (lastMessageAtMs && nowMs - lastMessageAtMs < CHAT_SEND_COOLDOWN_MS) {
    const retryAfterMs = CHAT_SEND_COOLDOWN_MS - (nowMs - lastMessageAtMs);
    return {
      ok: false,
      retryAfterMs,
      cooldownUntilMs: nowMs + retryAfterMs,
      reason: `Wait ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s before sending again.`,
    };
  }

  return {
    ok: true,
    cooldownUntilMs: nowMs + CHAT_SEND_COOLDOWN_MS,
    next: {
      lastMessageAtMs: nowMs,
      cooldownUntilMs: nowMs + CHAT_SEND_COOLDOWN_MS,
    },
  };
}

module.exports = Object.freeze({
  CHAT_SCHEMA_VERSION,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_RETENTION_MS,
  CHAT_REQUEST_RETENTION_MS,
  CHAT_SEND_COOLDOWN_MS,
  CHAT_CHANNELS,
  normalizeChatChannel,
  normalizeChatRequestId,
  normalizeChatText,
  chatRequestSignature,
  chatMessageId,
  evaluateChatSendCooldown,
});
