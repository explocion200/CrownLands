#!/usr/bin/env node
"use strict";

// Public, read-only release check. Never accepts or consumes an email action code.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

function readClientConfig() {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "firebase-config.js"), "utf8"), scope);
  const config = scope.window.CROWNLANDS_FIREBASE_CONFIG;
  const project = JSON.parse(fs.readFileSync(path.join(root, ".firebaserc"), "utf8")).projects.default;
  if (!config || config.projectId !== project || config.authDomain !== `${project}.firebaseapp.com`
      || !config.apiKey || !config.appId) throw new Error("Email action hosting: client/project configuration is inconsistent.");
  return config;
}

async function checkHosting(config, { fetchImpl = fetch, attempts = 4, retryDelayMs = 1500,
  timeoutMs = 5000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!/^[a-z0-9-]+\.firebaseapp\.com$/.test(config.authDomain)) {
    throw new Error("Email action hosting: expected a Firebase-hosted auth domain.");
  }
  const origin = `https://${config.authDomain}`;
  async function get(route, mime) {
    let response;
    try {
      response = await fetchImpl(origin + route, {
        method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Do not echo transport errors, URLs, bodies, API keys or credentials.
      throw new Error(`Email action hosting: ${route} could not be read.`);
    }
    if (response.status !== 200) {
      throw new Error(`Email action hosting: ${route} returned HTTP ${response.status}; expected 200 without a redirect.`);
    }
    if (!mime.test(response.headers.get("content-type") || "")) {
      throw new Error(`Email action hosting: ${route} has an unexpected content type.`);
    }
    return response;
  }
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await get("/__/firebase/init.json", /^application\/json(?:;|$)/i);
      let actual;
      try { actual = await response.json(); } catch { throw new Error("Email action hosting: initialization JSON is invalid."); }
      for (const key of ["projectId", "appId", "authDomain", "apiKey"]) {
        if (!actual || typeof actual[key] !== "string" || actual[key] !== config[key]) {
          throw new Error(`Email action hosting: initialization ${key} does not match the game configuration.`);
        }
      }
      await get("/__/auth/action", /^text\/html(?:;|$)/i);
      await get("/__/auth/action.js", /^(?:application|text)\/javascript(?:;|$)/i);
      return { projectId: config.projectId, authDomain: config.authDomain, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await sleep(retryDelayMs);
    }
  }
  throw lastError;
}

async function main() {
  if (process.argv.length > 2) throw new Error("Usage: node tools/check-email-action-hosting.js (read-only)");
  const config = readClientConfig();
  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== config.projectId) {
    throw new Error("Email action hosting: deployment project differs from the game's Firebase project.");
  }
  const result = await checkHosting(config);
  console.log(`Email action hosting passed for ${result.authDomain}: matching initialization JSON and action assets. Mail delivery and valid-link completion still need release QA.`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { checkHosting, readClientConfig };
