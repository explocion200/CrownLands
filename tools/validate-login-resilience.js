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

const buildId = "20260809-daily-missions-v1";
for (const [label, source] of [["index", index], ["service worker", worker]]) {
  requireMatch(source, new RegExp(buildId), `The ${label} does not carry the login-resilience cache version.`);
  requireMatch(source, /firebaseClient\.js\?v=20260809-daily-missions-v1/, `The ${label} does not refresh the Firebase client.`);
  requireMatch(source, /game\.js\?v=20260809-daily-missions-v1/, `The ${label} does not refresh the login UI.`);
}

console.log("Validated bounded Google popup recovery, redirect completion, actionable errors, and cache refresh.");
