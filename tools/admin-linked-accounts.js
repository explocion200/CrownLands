"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const policy = require("../functions/linked-account-policy");
const apiTools = require("./linked-account-admin-api");

function buildPlan({ pointer, profiles = [], cities = [], current, mode, reason, receipts = [], nowMs = Date.now() }) {
  assert(["confirm", "remove", "enable-ip"].includes(mode), "Choose confirm, remove or enable-ip.");
  assert(reason && reason.length <= 500, "Supply an operator reason.");
  const payload = { mode, reason, pointerVersion: pointer.updateTime,
    worldId: pointer.data.worldId, resetGeneration: pointer.data.resetGeneration, realmShardId: pointer.data.sharedRealmId };
  let document, data;
  if (mode === "enable-ip") {
    assert.equal(receipts.length, 2, "Two different-network verification receipts are required.");
    assert.equal(new Set(receipts.map(receipt => receipt.fingerprint)).size, 2, "Verify from different public networks.");
    for (const receipt of receipts) {
      assert.equal(receipt.project, "crown-land-b15e0");
      assert.equal(receipt.endpoint, apiTools.INGRESS_PROBE_ENDPOINT);
      assert.equal(receipt.verified, true);
      assert(receipt.checks >= 4 && receipt.checkedAtMs > nowMs - 86_400_000 && receipt.checkedAtMs <= nowMs);
      assert(/^[a-f0-9]{64}$/.test(receipt.fingerprint));
      assert(Number.isInteger(receipt.suffixLength) && receipt.suffixLength >= 1 && receipt.suffixLength <= 8);
    }
    assert.equal(receipts[0].suffixLength, receipts[1].suffixLength);
    document = `${policy.ROOT}/configuration/ipIngress`;
    data = { enabled: true, verified: true, suffixLength: receipts[0].suffixLength, reason,
      verificationReceipts: receipts, verifiedAtMs: nowMs };
    payload.receipts = receipts;
  } else {
    assert.equal(profiles.length, 2); assert.equal(cities.length, 2);
    const uids = profiles.map(profile => profile.name.split("/").at(-1));
    assert(policy.pairId(...uids), "Choose two different exact account IDs.");
    profiles.forEach((profile, i) => {
      assert.equal(profile.data.worldId, pointer.data.worldId);
      assert.equal(profile.data.resetGeneration, pointer.data.resetGeneration);
      assert.equal(profile.data.realmShardId, pointer.data.sharedRealmId);
      assert.equal(cities[i].data.ownerUid, uids[i]);
      assert.equal(cities[i].name.split("/").at(-1), profile.data.mainCityId);
    });
    document = policy.confirmedPath(...uids);
    data = { active: mode === "confirm", pairUids: uids.sort(), reason, updatedAtMs: nowMs };
    payload.identities = profiles.map((profile, i) => ({ uid: profile.name.split("/").at(-1),
      playerName: profile.data.playerName, mainCity: cities[i].data.name, profileVersion: profile.updateTime, cityVersion: cities[i].updateTime }));
  }
  payload.currentVersion = current?.updateTime || "absent";
  const planHash = policy.hash(JSON.stringify(payload));
  const update = { update: { name: document, fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, apiTools.encode(value)])) },
    currentDocument: current ? { updateTime: current.updateTime } : { exists: false } };
  return { document, data, update, planHash, payload };
}

async function main() {
  const { arg, connect, assertActive } = apiTools, api = await connect(arg("project")), mode = arg("mode");
  const pointer = await api.get("realmConfig/current");
  assertActive(pointer, { worldId: arg("world"), resetGeneration: arg("reset-generation"), sharedRealmId: arg("realm-shard") });
  const profiles = [], cities = [];
  if (mode !== "enable-ip") {
    for (const side of ["left", "right"]) {
      const uid = arg(`${side}-uid`); assert(/^[a-zA-Z0-9_-]{1,128}$/.test(uid), "Supply exact account IDs.");
      const profile = await api.get(`players/${uid}`); assert(profile, "Account not found.");
      profiles.push(profile);
      const region = profile.data.mainRegionId || profile.data.regionId;
      const city = await api.get(`islands/${pointer.data.worldId}--${pointer.data.sharedRealmId}--${region}/cities/${profile.data.mainCityId}`);
      assert(city, "Current Main City unavailable."); cities.push(city);
      assert.equal(city.data.name, arg(`${side}-main-city`), "Main City identity changed; review the account again.");
    }
  }
  const receipts = mode === "enable-ip" ? [arg("receipt-left"), arg("receipt-right")].map(file => JSON.parse(fs.readFileSync(file, "utf8"))) : [];
  const document = mode === "enable-ip" ? `${policy.ROOT}/configuration/ipIngress`
    : policy.confirmedPath(...profiles.map(profile => profile.name.split("/").at(-1)));
  const current = await api.get(document);
  const plan = buildPlan({ pointer, profiles, cities, current, mode, reason: arg("reason"), receipts });
  console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "dry-run", action: mode,
    accounts: profiles.map((profile, i) => ({ playerName: profile.data.playerName, mainCity: cities[i].data.name })), planHash: plan.planHash }, null, 2));
  if (!process.argv.includes("--apply")) return;
  assert(api.principalHash, "An identified administrator credential is required.");
  assert.equal(arg("confirm-plan-hash"), plan.planHash, "Plan changed; run a fresh dry run.");
  const auditDocument = `${policy.ROOT}/administrationAudit/${plan.planHash}`;
  const writes = [pointer, ...profiles, ...cities].map(doc => ({ verify: doc.name, currentDocument: { updateTime: doc.updateTime } }));
  writes.push({ ...plan.update, update: { ...plan.update.update, name: `${api.base}/${plan.document}` } });
  writes.push({ update: { name: `${api.base}/${auditDocument}`, fields: apiTools.encode({ action: mode,
    reason: arg("reason"), planHash: plan.planHash, principalHash: api.principalHash, occurredAtMs: Date.now(),
    ...(mode === "enable-ip" ? {} : { pairUids: plan.data.pairUids }) }).mapValue.fields }, currentDocument: { exists: false } });
  await api.commit(writes);
  const verified = await api.get(plan.document);
  assert.deepEqual(verified.data, plan.data, "Committed state verification failed.");
  console.log("Verified the reviewed security update. City ownership was not changed.");
}

module.exports = { buildPlan };
if (require.main === module) main().catch(() => { console.error("Security update stopped. Review exact identities, realm, versions and dry-run hash. Private data was not printed."); process.exitCode = 1; });
