const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const client = read("firebaseClient.js");
const game = read("game.js");
const index = read("index.html");
const worker = read("service-worker.js");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

requireMatch(client, /getRedirectResult\(client\.auth\)/, "Redirected Google login results are not completed on startup.");
requireMatch(client, /async function signInWithGoogleRedirect[\s\S]*signInWithRedirect\(client\.auth, client\.provider\)/, "Explicit redirect sign-in is missing.");
requireMatch(client, /signInWithGoogleRedirect,[\s\S]*getLastError:\s*\(\)\s*=>\s*client\.redirectError\s*\|\|\s*client\.error/, "Redirect login recovery is not exposed to the game client.");
requireMatch(game, /GOOGLE_SIGN_IN_POPUP_GRACE_MS\s*=\s*12_000/, "Popup recovery is not bounded.");
requireMatch(game, /armGoogleSignInRedirectFallback[\s\S]*Continue sign-in in this tab/, "A stalled popup does not expose redirect recovery.");
requireMatch(game, /getGoogleSignInErrorDetail[\s\S]*auth\/unauthorized-domain[\s\S]*auth\/network-request-failed[\s\S]*auth\/web-storage-unsupported/, "Player-facing authentication diagnostics are incomplete.");
requireMatch(game, /handleGoogleSignIn[\s\S]*api\.signInWithGoogleRedirect\(\)[\s\S]*api\.signInWithGoogle\(\)/, "The login handler does not support both redirect and popup paths.");
requireMatch(client, /activeSessionActivationPromise[\s\S]*activeSessionActivationBlockedUid[\s\S]*activeSessionRetryAtMs/, "Session activation is not deduplicated or circuit-broken.");
requireMatch(client, /async function activateCurrentSession[\s\S]*if \(client\.activeSessionActivationPromise\) return client\.activeSessionActivationPromise[\s\S]*permission-denied[\s\S]*scheduleActiveSessionRetry/, "Session activation does not coalesce duplicate calls and separate permanent from transient failures.");
requireMatch(client, /await setDoc\([\s\S]*client\.activeSessionSnapshot = activeSession;[\s\S]*startActiveSessionWatcher\(uid\);[\s\S]*return activeSession;/, "The replacement watcher must start only after the new session is registered.");
requireMatch(client, /if \(remoteSessionId === localSessionId\) \{[\s\S]*client\.activeSessionWatcherReady = true;[\s\S]*if \(!client\.activeSessionWatcherReady\) \{[\s\S]*remoteLoginAtMs <= localLoginAtMs\) return;[\s\S]*signOutForSessionReplacement\(activeSession\);/, "The replacement watcher does not ignore an initial stale profile snapshot while preserving newer-session replacement.");
requireMatch(game, /function stripServerEconomyProfileFields[\s\S]*clientWritableFields[\s\S]*lastSeenAtMs/, "Authoritative cloud-profile saves are not restricted to an explicit client-owned allowlist.");
requireMatch(game, /async function flushOnlineSave[\s\S]*Promise\.allSettled[\s\S]*isPermanentOnlineSaveError[\s\S]*target\.blocked = true[\s\S]*scheduleOnlineSaveRetry/, "Cloud saves do not isolate endpoints, circuit-break permission failures, and back off transient failures.");
requireMatch(game, /if \(onlineSaveInFlight\) return onlineSavePromise \|\| false/, "Forced cloud flushes do not share the active save request.");

const firebaseClientBuildId = "20260818-global-clan-chat-r1";
const gameBuildId = "20260819-targeted-ui-contrast-r1";
for (const [label, source] of [["index", index], ["service worker", worker]]) {
  requireMatch(source, new RegExp(firebaseClientBuildId), `The ${label} does not carry the login-resilience cache version.`);
  requireMatch(source, /firebaseClient\.js\?v=20260818-global-clan-chat-r1/, `The ${label} does not refresh the Firebase client.`);
  requireMatch(source, new RegExp(`game\\.js\\?v=${gameBuildId}`), `The ${label} does not refresh the login UI.`);
}

console.log("Validated bounded Google popup recovery, redirect completion, actionable errors, and cache refresh.");
