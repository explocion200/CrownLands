"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { signUpVerifiedPlayer } = require("./auth-fixtures");
const { assertLocalEmulator } = require("./prepare-current-season-fixture");
const realm = require("../release-config.json");

assertLocalEmulator(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
assertLocalEmulator(authHost);
initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
let functionsHost;

async function invoke(name, user, data = {}) {
  if (!functionsHost) {
    functionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST;
    if (!functionsHost && process.env.FIREBASE_EMULATOR_HUB) {
      const response = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`);
      assert(response.ok, "Emulator discovery failed.");
      const functions = (await response.json()).functions;
      functionsHost = `${functions.host}:${functions.port}`;
    }
    functionsHost ||= "127.0.0.1:5001";
    assertLocalEmulator(functionsHost);
  }
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user.token}` } : {}) },
    body: JSON.stringify({ data: {
      ...data, clientReleaseId: realm.releaseId,
      clientResetGeneration: realm.resetGeneration, clientWorldId: realm.worldId,
    } }),
  });
  return response.json();
}

async function call(name, user, data) {
  const body = await invoke(name, user, data);
  assert(!body.error, `${name} failed: ${JSON.stringify(body.error)}`);
  assert.equal(body.result?.ok, true, `${name} did not confirm success.`);
  return body.result;
}

async function rejected(name, user, data, status, message) {
  const body = await invoke(name, user, data);
  assert.equal(body.error?.status, status, `${name}: ${JSON.stringify(body.error)}`);
  if (message) assert.match(body.error.message, message);
}

async function player(level, label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await signUpVerifiedPlayer(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `clan-level-${label}-${nonce}@example.test`, password: `Clan-${nonce}-Pass!`, returnSecureToken: true }),
  });
  assert(response.ok, "Auth emulator signup failed.");
  const body = await response.json();
  const user = { uid: body.localId, token: body.idToken };
  const claim = await invoke("claimStartingCity", user, { playerName: `Clan ${label}` });
  assert(!claim.error && claim.result?.cityId, `Starting city failed: ${JSON.stringify(claim.error)}`);
  user.ref = db.doc(`players/${user.uid}`);
  await user.ref.set({ character: { level, xp: 0, skillPoints: level - 1 }, gold: 200_000, goldFloat: 200_000 }, { merge: true });
  return user;
}

async function main() {
  const leader = await player(1, "Founder");
  const created = await call("createClan", leader, { name: "Level Free Clan", tag: "LFC", admissionMode: "open" });
  const clanId = created.clan.id;
  assert(clanId, "Clan creation must return its identity.");
  const clanRef = db.doc(`clans/${clanId}`);
  const founder = (await leader.ref.get()).data();
  assert.equal(founder.character.level, 1);
  assert.equal(founder.clanRole, "leader");
  assert(created.gold >= 100_000 && created.gold < 101_000, "Creation must still charge 100,000 Gold.");

  const members = [];
  for (const level of [1, 9, 10]) {
    const user = await player(level, `Member${level}`);
    await call("joinOpenClan", user, { clanId });
    const profile = (await user.ref.get()).data();
    const roster = (await db.doc(`clans/${clanId}/members/${user.uid}`).get()).data();
    assert.equal(profile.clanId, clanId);
    assert.equal(profile.character.level, level);
    assert.equal(roster.role, "member");
    members.push(user);
  }
  assert.equal((await clanRef.get()).data().memberCount, 4);
  await rejected("joinOpenClan", members[0], { clanId }, "FAILED_PRECONDITION", /already in a clan/);

  await call("updateClanProfile", leader, { clanId, admissionMode: "approval" });
  const applicant = await player(1, "Applicant");
  await rejected("joinOpenClan", applicant, { clanId }, "FAILED_PRECONDITION", /requires approval/);
  await call("applyToClan", applicant, { clanId });
  await call("applyToClan", applicant, { clanId });
  assert.equal((await clanRef.get()).data().memberCount, 4, "Applying must not grant membership.");
  assert.equal((await applicant.ref.get()).data().pendingClanApplicationId, clanId);
  await rejected("reviewClanApplication", members[1], { clanId, applicantUid: applicant.uid, accept: true }, "PERMISSION_DENIED");
  await call("reviewClanApplication", leader, { clanId, applicantUid: applicant.uid, accept: true });
  assert.equal((await applicant.ref.get()).data().clanId, clanId);
  assert.equal((await clanRef.get()).data().memberCount, 5);
  assert.equal((await db.doc(`clans/${clanId}/applications/${applicant.uid}`).get()).exists, false);

  await call("leaveClan", members[0], { clanId });
  for (const [name, data] of [
    ["applyToClan", { clanId }],
    ["createClan", { name: "Cooldown Clan", tag: "CDC" }],
  ]) await rejected(name, members[0], data, "FAILED_PRECONDITION", /wait before joining/);
  await call("updateClanProfile", leader, { clanId, admissionMode: "open" });
  await rejected("joinOpenClan", members[0], { clanId }, "FAILED_PRECONDITION", /wait before joining/);

  const outsider = await player(1, "Outsider");
  await clanRef.set({ memberCount: 30 }, { merge: true });
  await rejected("joinOpenClan", outsider, { clanId }, "RESOURCE_EXHAUSTED", /full/);
  await clanRef.set({ memberCount: 4 }, { merge: true });
  await outsider.ref.set({ gold: 0, goldFloat: 0 }, { merge: true });
  await rejected("createClan", outsider, { name: "Poor Clan", tag: "PRC" }, "FAILED_PRECONDITION", /costs 100,000 gold/);
  await outsider.ref.set({ resetGeneration: "archived-clan-test" }, { merge: true });
  await rejected("joinOpenClan", outsider, { clanId }, "FAILED_PRECONDITION", /current Crownlands world/);
  await rejected("createClan", outsider, { name: "Archived Clan", tag: "ARC" }, "FAILED_PRECONDITION", /current Crownlands world/);
  await call("updateClanProfile", leader, { clanId, admissionMode: "approval" });
  await rejected("applyToClan", outsider, { clanId }, "FAILED_PRECONDITION", /current Crownlands world/);
  for (const name of ["createClan", "joinOpenClan", "applyToClan"]) {
    await rejected(name, null, { clanId, name: "Unsigned Clan", tag: "UNC" }, "UNAUTHENTICATED");
  }
  console.log("Clan access passed at Levels 1, 9 and 10, including creation, open joining, approval/replay, roles, cost, capacity, departure cooldown, current realm and authentication.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
