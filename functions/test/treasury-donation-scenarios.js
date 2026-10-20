"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// The same callable scenarios run against CI emulators and isolated PostgreSQL.
module.exports = async function treasuryScenarios({ db, call, createActor, setIdentity, privateAccess }) {
  const seasons = require("../season-rewards");
  const previous = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
  if (seasons.supported(previous)) await seasons.arm(db, previous, seasons.seasonInfo(previous).startsAtMs + 1);
  const donor = await createActor(), other = await createActor(), excess = await createActor(), poor = await createActor();
  const realm = await call("getRealmInfo", donor);
  assert.equal(realm.worldTopology, "core-expansion-v1");
  const identity = { releaseId: realm.currentReleaseId, worldId: realm.worldId,
    resetGeneration: realm.resetGeneration, realmShardId: realm.sharedRealmId };
  setIdentity(identity);
  const today = new Date().toISOString().slice(0, 10), yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const clans = ["a", "b"].map(label => `treasury_${label}_${randomUUID()}`);
  const profile = actor => db.doc(`players/${actor.uid}`);
  const counter = actor => db.doc(`players/${actor.uid}/clanTreasuryDaily/${today}`);
  const treasury = clan => db.doc(`clans/${clan}/treasury/${identity.resetGeneration}`);
  const legacy = (clan, actor, day = today) => db.doc(`clans/${clan}/treasuryUsage/${identity.resetGeneration}_${day}_${actor.uid}`);
  const usage = (actor, amount, day = today) => ({ ...identity, uid: actor.uid, donationDayUtc: day,
    rawGoldPerHourSnapshot: 50000000, dailyDonationCap: 600000000, donatedToday: amount });
  const setClan = async (actor, clan) => {
    await db.doc(`clans/${clan}/members/${actor.uid}`).set({ ...identity, uid: actor.uid, clanId: clan,
      status: "active", role: "member", joinedAtMs: Date.now() - 7200000 });
    await profile(actor).update({ clanId: clan, clanRole: "member" });
  };
  for (const clan of clans) await db.doc(`clans/${clan}`).set({ ...identity, status: "active",
    leaderUid: donor.uid, name: "Treasury Fixture", tag: "TF", memberCount: 3 });
  for (const actor of [donor, other, excess, poor]) {
    await call("claimStartingCity", actor, { playerName: "Donor " + actor.uid.slice(-6) });
    await profile(actor).update({ gold: 1e9, goldFloat: 1e9, economyUpdatedAtMs: Date.now() });
    await setClan(actor, clans[0]);
  }
  await legacy(clans[0], donor).set(usage(donor, 100000000));
  await legacy(clans[1], donor).set(usage(donor, 50000000));
  await legacy(clans[0], donor, yesterday).set(usage(donor, 600000000, yesterday));
  await db.doc(`clans/${clans[0]}/treasuryUsage/archived_${donor.uid}`).set({ ...usage(donor, 600000000), worldId: "archived", resetGeneration: "old" });
  let status = await call("getClanTreasuryStatus", donor);
  assert.equal(status.allowance.dailyCap, 250000000);
  assert.equal(status.allowance.donatedToday, 150000000);
  assert.equal(status.allowance.remaining, 100000000);
  assert.equal((await counter(donor).get()).exists, false, "A status read wrote a daily counter");
  assert.equal(status.resetsAtMs, Date.parse(today + "T00:00:00Z") + 86400000);

  // The old receipt remains replayable with the NEW allowance, without a debit.
  const oldId = `old_${randomUUID()}`;
  await db.doc(`clans/${clans[0]}/treasuryReceipts/${identity.resetGeneration}_${identity.realmShardId}_${oldId}`).set({
    ...identity, actorUid: donor.uid, result: { ok: true, clanId: clans[0], donated: 100000000,
      allowance: { dailyCap: 600000000, donatedToday: 100000000, remaining: 500000000 } },
  });
  const replay = await call("donateClanTreasuryGold", donor, { amount: 100000000, operationId: oldId });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.allowance.remaining, 100000000);
  assert.equal((await profile(donor).get()).data().gold, 1e9);

  const attempts = [0, 1].map(() => ({ amount: 80000000, operationId: `race_${randomUUID()}` }));
  const raced = await Promise.allSettled(attempts.map(data => call("donateClanTreasuryGold", donor, data)));
  assert.equal(raced.filter(result => result.status === "fulfilled").length, 1, "Concurrent donations exceeded the cap");
  assert.match(raced.find(result => result.status === "rejected").reason.message, /allowance/i);
  const accepted = attempts[raced.findIndex(result => result.status === "fulfilled")];
  assert.equal((await counter(donor).get()).data().donatedToday, 230000000);
  assert.equal((await treasury(clans[0]).get()).data().balance, 80000000);
  // Imported counters are no longer added after the canonical player counter exists.
  await legacy(clans[1], donor).update({ donatedToday: 900000000 });
  status = await call("getClanTreasuryStatus", donor);
  assert.equal(status.allowance.remaining, 20000000);
  await call("donateClanTreasuryGold", donor, { amount: 20000000, operationId: `finish_${randomUUID()}` });
  const beforeSwitch = (await profile(donor).get()).data().gold;
  await setClan(donor, clans[1]);
  await db.doc(`clans/${clans[0]}`).update({ status: "disbanded" });
  assert.equal((await call("getClanTreasuryStatus", donor)).allowance.remaining, 0);
  const switchedReplay = await call("donateClanTreasuryGold", donor, accepted);
  assert.equal(switchedReplay.duplicate, true);
  assert.equal(switchedReplay.clanId, clans[0]);
  assert.equal((await profile(donor).get()).data().gold, beforeSwitch);
  await assert.rejects(call("donateClanTreasuryGold", donor, { amount: 1, operationId: randomUUID() }), /allowance/i);
  assert.equal((await treasury(clans[1]).get()).exists, false, "Clan switching credited the other Treasury");

  await setClan(other, clans[1]);
  await db.doc(`players/${other.uid}/clanTreasuryDaily/${yesterday}`).set({ version: 1, uid: other.uid,
    donationDayUtc: yesterday, donatedToday: 250000000 });
  await legacy(clans[1], other, yesterday).set(usage(other, 600000000, yesterday));
  status = await call("getClanTreasuryStatus", other);
  assert.equal(status.allowance.remaining, 250000000, "Yesterday's usage reduced today's allowance");
  for (const amount of [0, -1, 1.5, 250000001]) {
    await assert.rejects(call("donateClanTreasuryGold", other, { amount, operationId: randomUUID() }));
  }
  assert.equal((await counter(other).get()).exists, false, "Rejected donations consumed allowance");
  const duplicatePayload = { amount: 250000000, operationId: `double_${randomUUID()}` };
  const duplicates = await Promise.all([0, 1].map(() => call("donateClanTreasuryGold", other, duplicatePayload)));
  assert.equal(duplicates.filter(result => result.duplicate).length, 1);
  assert.equal((await counter(other).get()).data().donatedToday, 250000000);
  assert.equal((await treasury(clans[1]).get()).data().balance, 250000000);
  assert((await profile(other).get()).data().gold < 751000000, "Donation was not charged");

  await setClan(excess, clans[1]);
  await legacy(clans[0], excess).set(usage(excess, 300000000));
  status = await call("getClanTreasuryStatus", excess);
  assert.equal(status.allowance.donatedToday, 300000000, "Rollout erased donations above the new cap");
  assert.equal(status.allowance.remaining, 0);
  await assert.rejects(call("donateClanTreasuryGold", excess, { amount: 1, operationId: randomUUID() }), /allowance/i);
  assert.equal((await profile(excess).get()).data().gold, 1e9);
  // First-use races are also bounded by personal Gold, not just the daily limit.
  await setClan(poor, clans[1]);
  await profile(poor).update({ gold: 50000000, goldFloat: 50000000, economyUpdatedAtMs: Date.now() });
  const goldRace = await Promise.allSettled([0, 1].map(() => call("donateClanTreasuryGold", poor,
    { amount: 40000000, operationId: randomUUID() })));
  assert.equal(goldRace.filter(result => result.status === "fulfilled").length, 1);
  assert.match(goldRace.find(result => result.status === "rejected").reason.message, /not enough personal Gold/i);
  assert.equal((await counter(poor).get()).data().donatedToday, 40000000);
  assert.equal((await treasury(clans[1]).get()).data().balance, 290000000);
  // Account/day usage remains authoritative after a same-day realm rollover.
  await counter(poor).update({ worldId: "previous-world", resetGeneration: "previous-season", realmShardId: "previous-shard" });
  assert.equal((await call("getClanTreasuryStatus", poor)).allowance.remaining, 210000000);
  await db.doc(`clans/${clans[1]}/members/${poor.uid}`).delete();
  await assert.rejects(call("donateClanTreasuryGold", poor, { amount: 1, operationId: randomUUID() }), /membership/i);
  await privateAccess(other, donor, [counter(other).path, `players/${other.uid}/clanTreasuryReceipts/${duplicatePayload.operationId}`]);
  console.log("Treasury callable scenarios passed: fixed cap, legacy aggregation, clan changes, disbanding, UTC rollover, concurrency, replay and private counters.");
};
