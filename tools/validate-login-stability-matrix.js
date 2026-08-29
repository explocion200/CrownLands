"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(ROOT_DIR, "game.js"), "utf8");
const firebaseClient = fs.readFileSync(path.join(ROOT_DIR, "firebaseClient.js"), "utf8");

function functionSource(source, name) {
  const startPattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = startPattern.exec(source);
  assert.ok(match, `${name} is missing.`);
  const remainder = source.slice(match.index + match[0].length);
  const nextFunction = /\n\s*(?:async\s+)?function\s+[A-Za-z0-9_]+\s*\(/.exec(remainder);
  return source.slice(match.index, nextFunction ? match.index + match[0].length + nextFunction.index : source.length);
}

const signIn = functionSource(game, "handleGoogleSignIn");
const signOut = functionSource(game, "handleGoogleSignOut");
const signInErrors = functionSource(game, "getGoogleSignInErrorDetail");
const clientPopup = functionSource(firebaseClient, "signInWithGoogle");
const clientRedirect = functionSource(firebaseClient, "signInWithGoogleRedirect");
const activateSession = functionSource(firebaseClient, "activateCurrentSession");
const replaceSession = functionSource(firebaseClient, "signOutForSessionReplacement");
const watchSession = functionSource(firebaseClient, "startActiveSessionWatcher");

assert.match(signIn, /googleSignInBtn\.disabled = true[\s\S]*await api\.signInWithGoogle/, "Repeated popup clicks are not blocked synchronously before the first await.");
assert.match(signIn, /useRedirect[\s\S]*await api\.signInWithGoogleRedirect\(\)[\s\S]*await api\.signInWithGoogle\(\)/, "Popup and explicit redirect paths are not both reachable.");
assert.match(signIn, /catch \(error\)[\s\S]*getGoogleSignInErrorDetail[\s\S]*finally[\s\S]*googleSignInBtn\.disabled = false/, "Login failures do not restore an actionable retry state.");
assert.match(clientPopup, /signInWithPopup[\s\S]*shouldUseRedirectFallback[\s\S]*signInWithGoogleRedirect/, "Blocked or unsupported popups do not fall back to redirect.");
assert.match(clientRedirect, /client\.redirectError = null[\s\S]*signInWithRedirect/, "Redirect startup does not clear stale errors before navigation.");
assert.match(firebaseClient, /getRedirectResult\(client\.auth\)[\s\S]*source: "google-redirect"/, "Redirect completion is not resumed during Firebase startup.");

for (const code of [
  "auth/popup-closed-by-user",
  "auth/popup-blocked",
  "auth/unauthorized-domain",
  "auth/network-request-failed",
  "auth/web-storage-unsupported",
]) {
  assert.ok(signInErrors.includes(code), `Actionable login mapping is missing ${code}.`);
}

assert.match(firebaseClient, /try \{[\s\S]*sessionStorage\?\.getItem\(ACTIVE_SESSION_STORAGE_KEY\)[\s\S]*catch \(_(?:error)?\)/, "Unavailable session storage is not contained.");
assert.match(activateSession, /activeSessionActivationPromise\) return client\.activeSessionActivationPromise/, "Concurrent session activation is not coalesced.");
assert.match(activateSession, /permission-denied[\s\S]*activeSessionActivationBlockedUid[\s\S]*scheduleActiveSessionRetry/, "Permanent and transient session activation failures are not separated.");
assert.match(watchSession, /remoteSessionId === localSessionId[\s\S]*activeSessionWatcherReady = true[\s\S]*remoteLoginAtMs <= localLoginAtMs[\s\S]*signOutForSessionReplacement/, "Stale initial snapshots and newer-session replacement are not distinguished.");
assert.match(replaceSession, /sessionReplacementInFlight[\s\S]*stopActiveSessionWatcher[\s\S]*clearActivePresence[\s\S]*signOut[\s\S]*sessionReplacementInFlight = false/, "Session replacement is not serialized and cleaned up.");

assert.match(signOut, /waitForPendingOnlineWrites\(5000\)[\s\S]*flushOnlineSave\(true\)[\s\S]*disconnectOnlineWorld\(\)[\s\S]*leaveSelectedGameServer\(\)[\s\S]*api\.signOut\(\)/, "Sign-out does not bound pending work and clean up in order.");
assert.match(firebaseClient, /onAuthStateChanged[\s\S]*dispatch\("auth", \{ user: client\.user/, "Expired authentication is not propagated to the game lifecycle.");
assert.match(game, /window\.addEventListener\("pagehide", disposeOnlineChat\)/, "Page exit does not dispose chat listeners.");
assert.match(game, /window\.addEventListener\("crownlands:session-replaced", handleOnlineSessionReplaced\)/, "The game does not handle another tab replacing the active session.");

console.log("Login stability matrix validation passed: popup, redirect, repeated-click, storage, sign-out, auth expiry, and session replacement guards verified.");
