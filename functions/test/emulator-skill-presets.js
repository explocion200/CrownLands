const { initializeApp } = require("firebase-admin/app");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");
const economyConfig = require("../economy-config.json");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

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
const zeroBuild = () => Object.fromEntries(SKILL_ORDER.map(skill => [skill, 0]));
const savedBuild = { ...zeroBuild(), swordmastery: 12, stoneworks: 7 };
const alternateBuild = { ...zeroBuild(), taxStewardship: 8, royalGranaries: 6 };
const getSkillMaxLevel = skill => Math.ceil(
  Number(economyConfig.skills[skill].maxPercent) / Number(economyConfig.skills[skill].percentPerLevel)
);
const getSpentSkillPoints = upgrades => SKILL_ORDER.reduce((total, skill) => {
  const level = Math.max(0, Math.min(getSkillMaxLevel(skill), Math.floor(Number(upgrades[skill]) || 0)));
  const finalTierLevels = Math.max(0, level - (getSkillMaxLevel(skill) - 5));
  return total + level + finalTierLevels;
}, 0);
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
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `skill-presets-${nonce}@example.test`,
      password: `Skill-Presets-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function invokeFunction(name, token, data = {}) {
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
  return {
    ok: response.ok && !body.error,
    result: body.result || null,
    error: body.error || null,
  };
}

async function callFunction(name, token, data = {}) {
  const response = await invokeFunction(name, token, data);
  if (!response.ok) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`);
  return response.result;
}

async function setBuild(profileRef, cityRef, { level, upgrades, gold }) {
  const nowMs = Date.now();
  const earned = Math.max(0, level - 1);
  const spent = getSpentSkillPoints(upgrades);
  await Promise.all([
    profileRef.set({
      character: { level, xp: 0, skillPoints: Math.max(0, earned - spent) },
      upgrades,
      gold,
      goldFloat: gold,
      economyUpdatedAtMs: nowMs,
    }, { merge: true }),
    cityRef.set({ productionUpdatedAtMs: nowMs }, { merge: true }),
  ]);
}

function presetMapValue() {
  return {
    mapValue: {
      fields: {
        modelVersion: { integerValue: "5" },
        activeSlot: { integerValue: "0" },
        slots: { arrayValue: { values: [] } },
      },
    },
  };
}

async function attemptClientPresetMutation(user) {
  const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/players/${user.uid}?updateMask.fieldPaths=skillPresets`;
  return fetch(url, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${user.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields: { skillPresets: presetMapValue() } }),
  });
}

async function attemptClientResetCreditMutation(user) {
  const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/players/${user.uid}?updateMask.fieldPaths=freeSkillResetCredits`;
  return fetch(url, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${user.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields: { freeSkillResetCredits: { integerValue: "99" } } }),
  });
}

function assertRejected(response, status, message) {
  assert(!response.ok && response.error?.status === status, `${message}: ${JSON.stringify(response)}`);
}

async function main() {
  const user = await createAuthUser();
  const claim = await callFunction("claimStartingCity", user.token, { playerName: "Preset Sentinel" });
  const profileRef = db.doc(`players/${user.uid}`);
  const cityRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
  let profile = (await profileRef.get()).data() || {};
  assert(profile.skillPresets?.slots?.length === 4, "A new profile did not receive all four default preset slots.");
  assert(profile.skillPresets.slots.every(slot => slot.saved === false), "A new profile began with a populated preset.");
  assert(Number(profile.skillPresets.activeSlot || 0) === 0, "A new profile began with an active preset.");
  assert(Number(profile.upgrades?.shieldwallDiscipline || 0) === 0, "A new profile did not normalize Shieldwall Discipline to Level 0.");
  assert(Number(profile.freeSkillResetGrantVersion || 0) === 2 && Number(profile.freeSkillResetCredits || 0) === 0, "A new profile incorrectly received a migration reset credit.");

  const clientMutation = await attemptClientPresetMutation(user);
  assert(clientMutation.status === 403, `A client directly changed skillPresets (HTTP ${clientMutation.status}).`);
  const resetCreditMutation = await attemptClientResetCreditMutation(user);
  assert(resetCreditMutation.status === 403, `A client directly changed freeSkillResetCredits (HTTP ${resetCreditMutation.status}).`);

  await setBuild(profileRef, cityRef, { level: 24, upgrades: savedBuild, gold: 2_000_000 });
  assertRejected(await invokeFunction("renameSkillPreset", user.token, { slot: 1, name: "War Build" }), "FAILED_PRECONDITION", "Preset 1 unlocked before Level 25");
  await setBuild(profileRef, cityRef, { level: 25, upgrades: savedBuild, gold: 2_000_000 });
  const renamed = await callFunction("renameSkillPreset", user.token, { slot: 1, name: "  War   Build  " });
  assert(renamed.skillPreset?.name === "War Build" && renamed.skillPreset?.goldCharged === 0, "Preset rename was not normalized and free.");
  assertRejected(await invokeFunction("renameSkillPreset", user.token, { slot: 1, name: "1234567890123456789012345" }), "INVALID_ARGUMENT", "A 25-character preset name was accepted");
  const firstSave = await callFunction("saveSkillPreset", user.token, { slot: 1 });
  assert(firstSave.skillPreset?.goldCharged === 0, "Saving a preset charged gold.");
  assert(SKILL_ORDER.every(skill => firstSave.skillPreset?.allocation?.[skill] === savedBuild[skill]), "Save did not snapshot all eight authoritative skills.");
  assert(Number(firstSave.currentUser?.skillPresets?.activeSlot || 0) === 1, "Saving did not mark the saved build as the sole active preset.");

  await setBuild(profileRef, cityRef, { level: 49, upgrades: savedBuild, gold: 2_000_000 });
  assertRejected(await invokeFunction("renameSkillPreset", user.token, { slot: 2, name: "Economy" }), "FAILED_PRECONDITION", "Preset 2 unlocked before Level 50");
  await setBuild(profileRef, cityRef, { level: 50, upgrades: savedBuild, gold: 2_000_000 });
  await callFunction("renameSkillPreset", user.token, { slot: 2, name: "Economy" });
  const duplicateSave = await callFunction("saveSkillPreset", user.token, { slot: 2 });
  assert(Number(duplicateSave.currentUser?.skillPresets?.activeSlot || 0) === 2, "Saving a duplicate allocation did not move the active preset to its tab.");
  await setBuild(profileRef, cityRef, { level: 74, upgrades: savedBuild, gold: 2_000_000 });
  assertRejected(await invokeFunction("renameSkillPreset", user.token, { slot: 3, name: "Marching" }), "FAILED_PRECONDITION", "Preset 3 unlocked before Level 75");
  await setBuild(profileRef, cityRef, { level: 75, upgrades: savedBuild, gold: 2_000_000 });
  await callFunction("renameSkillPreset", user.token, { slot: 3, name: "Marching" });
  await callFunction("saveSkillPreset", user.token, { slot: 3 });
  await setBuild(profileRef, cityRef, { level: 99, upgrades: savedBuild, gold: 2_000_000 });
  assertRejected(await invokeFunction("renameSkillPreset", user.token, { slot: 4, name: "Utility" }), "FAILED_PRECONDITION", "Preset 4 unlocked before Level 100");
  await setBuild(profileRef, cityRef, { level: 100, upgrades: alternateBuild, gold: 4_000_000 });
  await callFunction("renameSkillPreset", user.token, { slot: 4, name: "Utility" });
  await callFunction("saveSkillPreset", user.token, { slot: 4 });

  const duplicateApplies = await Promise.all([
    invokeFunction("applySkillPreset", user.token, { slot: 1 }),
    invokeFunction("applySkillPreset", user.token, { slot: 1 }),
  ]);
  assert(duplicateApplies.every(response => response.ok), `Duplicate apply requests failed: ${JSON.stringify(duplicateApplies)}`);
  const totalCharged = duplicateApplies.reduce((total, response) => total + Number(response.result?.skillPreset?.goldCharged || 0), 0);
  assert(totalCharged === Number(economyConfig.playerCosts.skillPresetApplyGold) * 2, `Two accepted applications charged ${totalCharged} gold.`);
  assert(duplicateApplies.filter(response => response.result?.skillPreset?.changed === true).length === 1, "Duplicate application changed the allocation more than once.");
  profile = (await profileRef.get()).data() || {};
  assert(SKILL_ORDER.every(skill => Number(profile.upgrades?.[skill] || 0) === savedBuild[skill]), "Applying did not restore the exact saved allocation.");
  assert(Number(profile.character?.skillPoints || 0) === 80, "Points earned after an earlier preset save were not left unspent at Level 100.");
  assert(Number(profile.gold || 0) >= 2_000_000 && Number(profile.gold || 0) < 2_000_020, `Two applications charged the wrong gold amount (${profile.gold}).`);
  assert(Number(profile.skillPresets?.activeSlot || 0) === 1, "Applying preset 1 did not make it the sole active preset.");
  const activeApply = await callFunction("applySkillPreset", user.token, { slot: 1 });
  assert(activeApply.skillPreset?.changed === false && activeApply.skillPreset?.goldCharged === Number(economyConfig.playerCosts.skillPresetApplyGold), "An already-active preset was not charged exactly once.");
  const duplicateAllocationApply = await callFunction("applySkillPreset", user.token, { slot: 2 });
  assert(duplicateAllocationApply.skillPreset?.changed === false && duplicateAllocationApply.skillPreset?.goldCharged === Number(economyConfig.playerCosts.skillPresetApplyGold), "An identical saved allocation was not charged exactly once.");
  assert(Number(duplicateAllocationApply.currentUser?.skillPresets?.activeSlot || 0) === 2, "Applying an identical saved allocation did not move the sole active marker to the requested tab.");
  const globalStats = (await db.doc(`players/${user.uid}/stats/global`).get()).data() || {};
  assert(Number(globalStats.updatedAtMs || 0) > 0, "Applying did not atomically refresh global statistics.");

  await profileRef.set({ gold: 2_000_000, goldFloat: 2_000_000 }, { merge: true });
  const reset = await callFunction("resetSkills", user.token);
  assert(Number(reset.currentUser?.skillPresets?.activeSlot || 0) === 0, "Reset Skills did not clear the active preset.");
  assert(reset.currentUser?.skillPresets?.slots?.filter(slot => slot.saved).length === 4, "Reset Skills overwrote a saved preset.");
  await setBuild(profileRef, cityRef, { level: 100, upgrades: savedBuild, gold: 2_000_000 });
  const reactivated = await callFunction("applySkillPreset", user.token, { slot: 1 });
  assert(Number(reactivated.currentUser?.skillPresets?.activeSlot || 0) === 1, "A matching allocation could not reactivate its preset.");
  assert(Number(reactivated.skillPreset?.goldCharged || 0) === Number(economyConfig.playerCosts.skillPresetApplyGold), "A matching allocation was not charged.");
  const batched = await callFunction("spendSkillPoints", user.token, {
    allocations: [
      { skillId: "guildCharters", points: 2 },
      { skillId: "marchOrders", points: 3 },
      { skillId: "guildCharters", points: 1 },
    ],
  });
  assert(Number(batched.currentUser?.upgrades?.guildCharters || 0) === 3, "A repeated batched skill allocation was not coalesced.");
  assert(Number(batched.currentUser?.upgrades?.marchOrders || 0) === 3, "A mixed batched skill allocation lost points.");
  assert(Number(batched.currentUser?.skillPresets?.activeSlot || 0) === 0, "A batched skill spend did not clear the active preset.");
  assert(batched.skillAllocations?.length === 2, "The batched skill receipt did not report normalized allocations.");
  const beforeInvalidBatch = (await profileRef.get()).data() || {};
  assertRejected(await invokeFunction("spendSkillPoints", user.token, {
    allocations: [
      { skillId: "royalGranaries", points: 1 },
      { skillId: "stoneworks", points: 99 },
    ],
  }), "FAILED_PRECONDITION", "An over-cap skill batch was accepted");
  const afterInvalidBatch = (await profileRef.get()).data() || {};
  assert(Number(afterInvalidBatch.upgrades?.royalGranaries || 0) === Number(beforeInvalidBatch.upgrades?.royalGranaries || 0), "A rejected batch partially spent a valid point.");
  const spent = await callFunction("spendSkillPoint", user.token, { skillId: "guildCharters" });
  assert(Number(spent.currentUser?.skillPresets?.activeSlot || 0) === 0, "Spending a skill point did not clear the active preset.");
  assert(spent.currentUser?.skillPresets?.slots?.filter(slot => slot.saved).length === 4, "Spending a skill point overwrote a saved preset.");

  const finalTierBuild = { ...zeroBuild(), guildCharters: 20 };
  await setBuild(profileRef, cityRef, { level: 100, upgrades: finalTierBuild, gold: 2_000_000 });
  const finalTierSpend = await callFunction("spendSkillPoint", user.token, { skillId: "guildCharters" });
  assert(Number(finalTierSpend.spentSkillPoints || 0) === 2, "The first of Guild Charters' final five levels did not cost 2 points.");
  assert(Number(finalTierSpend.currentUser?.upgrades?.guildCharters || 0) === 21, "The final-tier purchase did not improve Guild Charters by one level.");
  assert(Number(finalTierSpend.currentUser?.character?.skillPoints || 0) === 77, "The final-tier purchase did not deduct its weighted point cost.");
  await setBuild(profileRef, cityRef, { level: 22, upgrades: finalTierBuild, gold: 2_000_000 });
  assertRejected(
    await invokeFunction("spendSkillPoint", user.token, { skillId: "guildCharters" }),
    "FAILED_PRECONDITION",
    "A final-tier skill upgrade was accepted with only one available point"
  );

  await setBuild(profileRef, cityRef, { level: 6, upgrades: zeroBuild(), gold: 2_000_000 });
  const competingBatches = await Promise.all([
    invokeFunction("spendSkillPoints", user.token, { allocations: [{ skillId: "swordmastery", points: 5 }] }),
    invokeFunction("spendSkillPoints", user.token, { allocations: [{ skillId: "taxStewardship", points: 5 }] }),
  ]);
  assert(competingBatches.filter(response => response.ok).length === 1, `Concurrent batches did not consume the five available points exactly once: ${JSON.stringify(competingBatches)}`);
  profile = (await profileRef.get()).data() || {};
  assert(SKILL_ORDER.reduce((total, skill) => total + Number(profile.upgrades?.[skill] || 0), 0) === 5, "Concurrent skill batches partially or doubly spent points.");
  assert(Number(profile.character?.skillPoints || 0) === 0, "Concurrent skill batches left an incorrect available-point balance.");

  await setBuild(profileRef, cityRef, { level: 100, upgrades: alternateBuild, gold: 999_999 });
  const beforeInsufficient = (await profileRef.get()).data() || {};
  assertRejected(await invokeFunction("applySkillPreset", user.token, { slot: 1 }), "FAILED_PRECONDITION", "An unaffordable preset applied");
  const afterInsufficient = (await profileRef.get()).data() || {};
  assert(Number(afterInsufficient.gold || 0) === Number(beforeInsufficient.gold || 0), "A rejected application consumed gold.");
  assert(SKILL_ORDER.every(skill => Number(afterInsufficient.upgrades?.[skill] || 0) === alternateBuild[skill]), "A rejected application changed skills.");

  await profileRef.set({
    createdAtMs: Date.parse("2026-08-07T23:59:59.000Z"),
    createdAt: Timestamp.fromMillis(Date.parse("2026-08-07T23:59:59.000Z")),
    freeSkillResetGrantVersion: FieldValue.delete(),
    freeSkillResetCredits: FieldValue.delete(),
  }, { merge: true });
  await setBuild(profileRef, cityRef, { level: 100, upgrades: alternateBuild, gold: 1_000_000 });
  const paidLegacyApply = await callFunction("applySkillPreset", user.token, { slot: 1 });
  assert(paidLegacyApply.skillPreset?.changed === true && paidLegacyApply.skillPreset?.freeResetConsumed === false, "A preset application reported consuming a legacy credit.");
  assert(Number(paidLegacyApply.skillPreset?.goldCharged || 0) === 1_000_000 && Number(paidLegacyApply.currentUser?.gold || 0) === 0, "A legacy profile did not pay the preset price.");
  assert(Number(paidLegacyApply.currentUser?.freeSkillResetCredits || 0) === 0, "A v2 preset application revived a legacy or final-tier Reset Skills credit.");

  await setBuild(profileRef, cityRef, { level: 100, upgrades: savedBuild, gold: 1_000_000 });
  await profileRef.set({ freeSkillResetGrantVersion: 2, freeSkillResetCredits: 0 }, { merge: true });
  const concurrentResets = await Promise.all([
    invokeFunction("resetSkills", user.token),
    invokeFunction("resetSkills", user.token),
  ]);
  assert(concurrentResets.filter(response => response.ok).length === 1, `Concurrent paid resets did not settle exactly once: ${JSON.stringify(concurrentResets)}`);
  const successfulReset = concurrentResets.find(response => response.ok)?.result;
  assert(successfulReset?.freeResetConsumed === false && Number(successfulReset?.resetCost || 0) === 1_000_000, "The winning v2 reset did not charge the standard reset price.");
  profile = (await profileRef.get()).data() || {};
  assert(Number(profile.freeSkillResetCredits || 0) === 0 && Number(profile.gold || 0) === 0, "Concurrent reset settlement revived a credit or charged gold twice.");
  assert(SKILL_ORDER.every(skill => Number(profile.upgrades?.[skill] || 0) === 0), "Concurrent reset settlement left an allocated skill.");
  await setBuild(profileRef, cityRef, { level: 100, upgrades: alternateBuild, gold: 2_000_000 });

  const currentPresets = afterInsufficient.skillPresets;
  const makeStale = upgrades => ({
    ...currentPresets,
    slots: currentPresets.slots.map(slot => slot.slot === 1 ? { ...slot, saved: true, upgrades } : slot),
  });
  await profileRef.set({ skillPresets: makeStale({ ...zeroBuild(), swordmastery: 31 }), gold: 2_000_000, goldFloat: 2_000_000 }, { merge: true });
  assertRejected(await invokeFunction("applySkillPreset", user.token, { slot: 1 }), "FAILED_PRECONDITION", "An over-cap preset applied");
  await profileRef.set({ skillPresets: makeStale(Object.fromEntries(SKILL_ORDER.map(skill => [skill, 20]))) }, { merge: true });
  assertRejected(await invokeFunction("applySkillPreset", user.token, { slot: 1 }), "FAILED_PRECONDITION", "An over-budget preset applied");
  profile = (await profileRef.get()).data() || {};
  assert(Number(profile.gold || 0) >= 2_000_000, "A stale preset consumed gold.");
  assert(SKILL_ORDER.every(skill => Number(profile.upgrades?.[skill] || 0) === alternateBuild[skill]), "A stale preset changed the current allocation.");

  console.log("Emulator skill presets passed: final-tier double costs, four unlocks, unconditional paid applies, zeroed reset credits, one active slot, concurrency, and rejection safety.");
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
