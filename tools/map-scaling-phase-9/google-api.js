"use strict";

const path = require("node:path");

const FIREBASE_TOOLS_AUTH = path.resolve(
  __dirname,
  "../../functions/node_modules/firebase-tools/lib/auth",
);

function firebaseCliAuth() {
  return require(FIREBASE_TOOLS_AUTH);
}

async function accessToken() {
  const auth = firebaseCliAuth();
  const account = auth.getGlobalDefaultAccount?.();
  if (!account?.tokens?.refresh_token) {
    const error = new Error("Firebase CLI authentication is required; run firebase login --reauth.");
    error.code = "firebase-auth-required";
    throw error;
  }
  const tokens = await auth.getAccessToken(account.tokens.refresh_token, []);
  if (!tokens?.access_token) throw new Error("Firebase CLI did not return an access token.");
  return { token: tokens.access_token, email: account.user?.email || "" };
}

async function googleRequest(url, options = {}) {
  const auth = await accessToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${auth.token}`);
  if (options.quotaProjectId) headers.set("x-goog-user-project", String(options.quotaProjectId));
  if (options.body !== undefined && !(options.body instanceof Uint8Array) && !Buffer.isBuffer(options.body)) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  const body = options.body === undefined
    ? undefined
    : (options.body instanceof Uint8Array || Buffer.isBuffer(options.body))
      ? options.body
      : JSON.stringify(options.body);
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body,
  });
  const raw = await response.text();
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }
  if (!response.ok && !options.allowStatuses?.includes(response.status)) {
    const message = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    const error = new Error(`Google API ${response.status} ${response.statusText}: ${message.slice(0, 4000)}`);
    error.code = "google-api-failed";
    error.status = response.status;
    error.response = parsed;
    throw error;
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
    operatorEmail: auth.email,
  };
}

async function waitForOperation(url, operation, options = {}) {
  if (!operation?.name || operation.done === true) return operation;
  const deadline = Date.now() + (options.timeoutMs || 180000);
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, options.pollMs || 2000));
    const current = await googleRequest(`${url}/${operation.name}`);
    if (current.body?.done === true) {
      if (current.body.error) throw new Error(`Google operation failed: ${JSON.stringify(current.body.error)}`);
      return current.body;
    }
  }
  throw new Error(`Timed out waiting for ${operation.name}.`);
}

module.exports = Object.freeze({
  accessToken,
  googleRequest,
  waitForOperation,
});
