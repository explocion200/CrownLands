const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatEmulatorHost(host, port) {
  const value = String(host || "127.0.0.1").trim();
  const formatted = value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
  return `${formatted}:${port}`;
}

async function resolveFunctionsHost() {
  if (configuredFunctionsHost) return configuredFunctionsHost;
  if (!functionsHostPromise) {
    functionsHostPromise = (async () => {
      const hubHost = String(process.env.FIREBASE_EMULATOR_HUB || "").trim();
      if (!hubHost) return "127.0.0.1:5001";
      const response = await fetch(`http://${hubHost}/emulators`);
      if (!response.ok) throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
      const emulators = await response.json();
      const functions = emulators?.functions || {};
      const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
      const host = functions.host || listen?.address;
      const port = Number(functions.port || listen?.port);
      if (!host || !Number.isInteger(port) || port < 1) throw new Error("Functions emulator was not discovered.");
      return formatEmulatorHost(host, port);
    })();
  }
  return functionsHostPromise;
}

async function createAuthUser() {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `scout-lifecycle-${nonce}@example.test`,
      password: `Scout-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function invokeCallable(name, token, data = {}) {
  const host = await resolveFunctionsHost();
  const response = await fetch(`http://${host}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

function successfulScout(id, cityId, createdAtMs, expiresAtMs, troops) {
  return {
    id,
    uid: "filled-after-claim",
    type: "scout",
    outcome: "scout",
    cityId,
    cityName: cityId,
    createdAtMs,
    expiresAtMs,
    troopCount: troops,
    totalDefense: troops,
    summary: `Scout revealed ${troops} troops at ${cityId}.`,
    scoutReport: { troops, totalDefense: troops, scoutedAtMs: createdAtMs, expiresAtMs },
  };
}

async function main() {
  const user = await createAuthUser();
  await invokeCallable("claimStartingCity", user.token, { playerName: "Scout Sentinel" });
  const profileRef = db.doc(`players/${user.uid}`);
  const nowMs = Date.now();
  const activeUntilMs = nowMs + 9 * 60 * 1000;
  const old = successfulScout("legacy-a", "target-a", nowMs - 90_000, activeUntilMs, 100);
  const newest = successfulScout("current-a", "target-a", nowMs - 30_000, activeUntilMs, 250);
  const other = successfulScout("current-b", "target-b", nowMs - 20_000, activeUntilMs, 300);
  const expired = successfulScout("expired", "target-expired", nowMs - 600_000, nowMs, 999999);
  [old, newest, other, expired].forEach(report => { report.uid = user.uid; });
  const blockedNotice = {
    id: "blocked-notice",
    uid: user.uid,
    type: "scout",
    outcome: "scout",
    cityId: "target-a",
    createdAtMs: nowMs - 10_000,
    troopCount: 0,
    totalDefense: 0,
    summary: "Scouts were turned away.",
  };

  await profileRef.set({
    scoutReports: {
      "target-a": newest.scoutReport,
      "target-expired": expired.scoutReport,
    },
    battleReports: [old, newest, other, expired, blockedNotice],
    economyUpdatedAtMs: nowMs,
  }, { merge: true });

  await invokeCallable("collectEconomy", user.token);
  const profile = (await profileRef.get()).data() || {};
  assert(profile.scoutReports?.["target-a"]?.troops === 250, "Active scout intelligence was removed or changed.");
  assert(!profile.scoutReports?.["target-expired"], "Scout intelligence remained valid at expiresAtMs.");
  const reports = Array.isArray(profile.battleReports) ? profile.battleReports : [];
  const targetAIntel = reports.filter(report => report.cityId === "target-a" && report.scoutReport);
  assert(targetAIntel.length === 1 && targetAIntel[0].id === "current-a", "The newest successful target report did not replace the older snapshot.");
  assert(reports.some(report => report.id === "current-b"), "An independent target report was incorrectly pruned.");
  assert(reports.some(report => report.id === "blocked-notice"), "A blocked non-intelligence notice was incorrectly removed.");
  assert(!reports.some(report => report.id === "expired"), "Expired exact intelligence remained in Battle Reports.");

  console.log("Emulator scout lifecycle passed: exact expiry, replacement, independent targets, and notice preservation.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
