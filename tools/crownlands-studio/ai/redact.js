"use strict";

const SECRET_PATTERNS = Object.freeze([
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_OPENAI_KEY]"],
  [/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_GOOGLE_KEY]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]"],
  [/\b((?:API_?KEY|TOKEN|SECRET|PASSWORD|PRIVATE_?KEY|CLIENT_?SECRET)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]"],
]);

function redactSecrets(value, maxLength = 16000) {
  let text = String(value ?? "");
  for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement);
  if (text.length > maxLength) text = `${text.slice(0, maxLength)}\n[OUTPUT TRUNCATED]`;
  return text;
}

module.exports = { redactSecrets };
