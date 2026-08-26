const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
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

const SKILL_POINT_SYSTEM_VERSION = 2;
const SKILL_POINT_SYSTEM_RESET_ID = "skill-point-system-v2";
const SKILL_ORDER = [
  "swordmastery",
  "shieldwallDiscipline",
  "stoneworks",
  "taxStewardship",
  "royalGranaries",
  "guildCharters",
  "marchOrders",
  "fieldMedics",
];
let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatEmulatorHost(host, port) {
  const normalizedHost = String(host || "127.0.0.1").trim();
  const formattedHost = normalizedHost.includes(":") && !normalizedHost.startsWith("[")
    ? `[${normalizedHost}]`
    : normalizedHost;
  return `${formattedHost}:${port}`;
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
      if (!host || !Number.isInteger(port) || port < 1) {
        throw new Error("Firebase Emulator Hub did not report a running Functions emulator.");
      }
      return formatEmulatorHost(host, port);
    })();
  }
  return functionsHostPromise;
}

async function createAuthUser() {
  const nonce = crypto.randomBytes(6).toString("hex");
  const email = `skill-reset-${nonce}@example.test`;
  const password = `Skill-Reset-${nonce}-Pass!`;
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken, email, password };
}

async function createStatsAdmin() {
  const user = await createAuthUser();
  await getAuth().setCustomUserClaims(user.uid, { statsAdmin: true });
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator admin sign-in failed: ${JSON.stringify(body)}`);
  return { uid: user.uid, token: body.idToken };
}

async function callFunction(name, token, data = {}) {
  const functionsHost = await resolveFunctionsHost();
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
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
  if (!response.ok || body.error) {
    throw new Error(`${name} failed: ${JSON.stringify(body.error || body)}`);
  }
  return body.result || null;
}

function populatedPresets() {
  const zeroBuild = Object.fromEntries(SKILL_ORDER.map(skill => [skill, 0]));
  return {
    modelVersion: 4,
    activeSlot: 3,
    slots: [
      { slot: 1, unlockLevel: 25, name: "Attack", saved: true, upgrades: { ...zeroBuild, swordmastery: 20 }, spentPoints: 20, savedAtMs: 100 },
      { slot: 2, unlockLevel: 50, name: "Defense", saved: true, upgrades: { ...zeroBuild, stoneworks: 20 }, spentPoints: 20, savedAtMs: 200 },
      { slot: 3, unlockLevel: 75, name: "Broken", saved: true, upgrades: { swordmastery: 999, attack: 999 }, spentPoints: 1998, savedAtMs: 300 },
      { slot: 4, unlockLevel: 100, name: "Partial", saved: true, upgrades: { taxStewardship: 10 }, spentPoints: 10, savedAtMs: 400 },
    ],
  };
}

async function main() {
  const user = await createAuthUser();
  const claim = await callFunction("claimStartingCity", user.token, { playerName: "Skill Reset Sentinel" });
  const profileRef = db.doc(`players/${user.uid}`);
  const cityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);

  let profile = (await profileRef.get()).data() || {};
  assert(Number(profile.skillPointSystemVersion || 0) === SKILL_POINT_SYSTEM_VERSION, "A new player did not start on the current skill point system.");
  assert(SKILL_ORDER.every(skill => Number(profile.upgrades?.[skill] || 0) === 0), "A new player started with allocated skills.");
  assert(profile.skillPresets?.slots?.length === 4 && profile.skillPresets.slots.every(slot => !slot.saved), "A new player started with populated presets.");

  const nowMs = Date.now();
  await Promise.all([
    profileRef.set({
      character: { level: 60, xp: 17, skillPoints: 999 },
      upgrades: {
        swordmastery: 11,
        stoneworks: 7,
        attack: 23,
        income: 19,
        striker: 21,
        prosperous: 18,
        guardian: 17,
        rusher: 16,
        fearless: 15,
      },
      skillPresets: populatedPresets(),
      skillPointSystemVersion: FieldValue.delete(),
      skillPointSystemResetAtMs: FieldValue.delete(),
      freeSkillResetGrantVersion: 0,
      freeSkillResetCredits: 5,
      migrationSentinel: { inventoryKept: true, currencyKept: 12345 },
      gold: 12_345,
      goldFloat: 12_345,
      economyUpdatedAtMs: nowMs,
    }, { merge: true }),
    cityRef.set({ productionUpdatedAtMs: nowMs }, { merge: true }),
  ]);

  const firstSync = await callFunction("syncSkillPointSystem", user.token);
  assert(firstSync.skillPointSystemReset?.applied === true, "An existing player was not reset.");
  assert(Number(firstSync.skillPointSystemReset?.previousVersion || 0) === 0, "The reset did not report the old version.");
  assert(Number(firstSync.skillPointSystemReset?.version || 0) === SKILL_POINT_SYSTEM_VERSION, "The reset did not report the new version.");

  profile = (await profileRef.get()).data() || {};
  assert(Number(profile.skillPointSystemVersion || 0) === SKILL_POINT_SYSTEM_VERSION, "The reset marker was not stored.");
  assert(Number(profile.character?.level || 0) === 60 && Number(profile.character?.xp || 0) === 17, "Hero progression changed during the skill reset.");
  assert(Number(profile.character?.skillPoints || 0) === 59, "Unspent points were not recalculated from Hero Level 60.");
  assert(SKILL_ORDER.every(skill => Number(profile.upgrades?.[skill] || 0) === 0), "Canonical skill allocations were not cleared.");
  assert(!["attack", "income", "striker", "prosperous", "guardian", "rusher", "fearless"].some(key => (
    Object.prototype.hasOwnProperty.call(profile.upgrades || {}, key)
  )), "Legacy skill keys survived the reset.");
  assert(profile.skillPresets?.activeSlot === 0, "The active preset was not cleared.");
  assert(profile.skillPresets?.slots?.length === 4 && profile.skillPresets.slots.every(slot => (
    slot.saved === false && slot.upgrades === null && Number(slot.spentPoints || 0) === 0
  )), "Saved or corrupted presets survived the reset.");
  assert(Number(profile.freeSkillResetGrantVersion || 0) === 2 && Number(profile.freeSkillResetCredits || 0) === 0, "Legacy reset credits survived the migration.");
  assert(profile.migrationSentinel?.inventoryKept === true && Number(profile.gold || 0) >= 12_345, "Unrelated player data changed during the reset.");

  const backupRef = db.doc(`maintenanceBackups/${SKILL_POINT_SYSTEM_RESET_ID}/players/${user.uid}`);
  const firstBackup = (await backupRef.get()).data() || {};
  assert(Number(firstBackup.upgrades?.swordmastery || 0) === 23, "The rollback backup did not preserve the pre-reset skill allocation.");
  assert(firstBackup.skillPresets?.slots?.length === 4, "The rollback backup did not preserve the old presets.");

  await callFunction("spendSkillPoints", user.token, {
    allocations: [{ skillId: "swordmastery", points: 2 }],
  });
  await callFunction("saveSkillPreset", user.token, { slot: 1 });
  const secondSync = await callFunction("syncSkillPointSystem", user.token);
  assert(secondSync.skillPointSystemReset?.applied === false, "A repeated sync reset the player again.");

  profile = (await profileRef.get()).data() || {};
  assert(Number(profile.upgrades?.swordmastery || 0) === 2, "A repeated sync removed newly assigned points.");
  assert(Number(profile.character?.skillPoints || 0) === 57, "A repeated sync changed the new unspent-point balance.");
  assert(profile.skillPresets?.slots?.[0]?.saved === true, "A repeated sync erased a newly saved preset.");
  const secondBackup = (await backupRef.get()).data() || {};
  assert(Number(secondBackup.backedUpAtMs || 0) === Number(firstBackup.backedUpAtMs || 0), "A repeated sync overwrote the original rollback backup.");

  const statsAdmin = await createStatsAdmin();
  const rollback = await callFunction("rollbackPlayerSkillPointSystem", statsAdmin.token, {
    uid: user.uid,
    confirm: SKILL_POINT_SYSTEM_RESET_ID,
  });
  assert(Number(rollback.currentUser?.skillPointSystemVersion || 0) === SKILL_POINT_SYSTEM_VERSION, "Rollback removed the current system marker.");
  assert(Number(rollback.currentUser?.freeSkillResetCredits || 0) === 0, "Rollback response revived a legacy reset credit.");

  profile = (await profileRef.get()).data() || {};
  assert(Number(profile.upgrades?.swordmastery || 0) === 23, "Rollback did not restore the normalized pre-reset allocation.");
  assert(profile.skillPresets?.slots?.[0]?.saved === true && profile.skillPresets.slots[0].name === "Attack", "Rollback did not restore the backed-up presets.");
  assert(Number(profile.freeSkillResetCredits || 0) === 0, "Rollback persisted a legacy reset credit on a v2 profile.");
  assert(profile.migrationSentinel?.inventoryKept === true && Number(profile.gold || 0) >= 12_345, "Rollback changed unrelated player data.");

  const postRollbackSync = await callFunction("syncSkillPointSystem", user.token);
  assert(postRollbackSync.skillPointSystemReset?.applied === false, "A sync reset the player again after rollback.");
  profile = (await profileRef.get()).data() || {};
  assert(Number(profile.upgrades?.swordmastery || 0) === 23, "Post-rollback sync removed the restored allocation.");
  assert(Number(profile.freeSkillResetCredits || 0) === 0, "Post-rollback sync revived a legacy reset credit.");

  console.log("Validated the versioned skill reset, point refund, preset clearing, legacy cleanup, backup, rollback, and idempotency.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
