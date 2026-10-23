"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Store, Timestamp } = require("../local-backend/store");
const { Access, PROFILE_UPDATE, PROFILE_CREATE_DENIED } = require("../local-backend/access");

(async () => {
  const rules = fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8").replace(/\r\n/g, "\n");
  // A permission/rule change must explicitly revisit the port and its cases.
  assert.equal(crypto.createHash("sha256").update(rules).digest("hex"), "2a941faa654b27c18ab45bd4a9dd2c88e035a8ad6912baef8bc9a86554fb4040");
  const quoted = text => [...text.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(PROFILE_UPDATE, quoted(/function validPlayerProfileUpdate[\s\S]*?affected\.hasOnly\(\[([^]*?)\]/.exec(rules)[1]));
  assert.deepEqual(PROFILE_CREATE_DENIED, quoted(/function validPlayerProfileCreate[\s\S]*?&& !request\.resource\.data\.keys\(\)\.hasAny\(\[([^]*?)\]/.exec(rules)[1]));
  const schema = "migration_access_" + crypto.randomBytes(5).toString("hex"), db = new Store({ schema });
  const uid = "fixture-owner", other = "fixture-other", auth = { uid, token: { firebase: { sign_in_provider: "google.com" } } };
  const scope = { resetGeneration: "realm-2026-10", worldId: "main-realm-2026-10", realmShardId: "shard_0001" };
  const board = "realm-2026-10--shard_0001", island = "main-realm-2026-10--shard_0001--fixture";
  const flag = { version: 2, primary: "#123456", secondary: "#654321", pattern: "split", symbol: "crown" };
  const profile = { ...scope, uid, clanId: "house", playerName: "Fixture", flag, identityRevision: 1, gold: 1234, activeSession: { version: 2, sessionId: "fixture-winning-session" } };
  const now = Date.parse("2026-10-15T12:00:00Z");
  const read = (target, data, method = "get", identity = auth) => db.runTransaction(async tx => {
    const access = await new Access({ store: db, transaction: tx, auth: identity, now }).initialize();
    return Boolean(await access.canRead(target, data, method));
  });
  const write = (target, before, after) => db.runTransaction(async tx => {
    const access = await new Access({ store: db, transaction: tx, auth, now }).initialize();
    return Boolean(await access.canWrite(target, before, after));
  });
  try {
    await db.initialize(); await db.doc("realmConfig/current").set(scope); await db.doc("players/" + uid).set(profile);
    await db.doc("clans/house").set({ ...scope, status: "active" });
    await db.doc(`clans/house/members/${uid}`).set({ ...scope, uid, status: "active", role: "member" });
    assert.equal(await read("players/" + uid, profile), true); assert.equal(await read("players/" + other, profile), false);
    await assert.rejects(read("realmConfig/current", scope, "get", null), { code: "permission-denied" });
    await assert.rejects(read("realmConfig/current", scope, "get", { uid, token: { firebase: { sign_in_provider: "password" }, email_verified: false } }), { code: "permission-denied" });
    for (const collection of ["estate", "estateChampions", "estateReceipts", "estateQuotes", "estateContracts", "estateGuildReports", "cosmetics", "cosmeticReceipts", "stamina", "staminaReceipts", "notificationTokens"]) {
      assert.equal(await read(`players/${uid}/${collection}/fixture`, undefined), true);
      assert.equal(await read(`players/${other}/${collection}/fixture`, {}), false);
    }
    for (const collection of ["incomingArmies", "serverReports", "stats", "dailyMissions", "seasonalAchievements", "serverMembership", "retaliationWindows"]) {
      assert.equal(await read(`players/${uid}/${collection}/fixture`, scope), true);
      assert.equal(await read(`players/${uid}/${collection}/fixture`, { ...scope, realmShardId: "shard_0002" }), false);
      assert.equal(await read(`players/${other}/${collection}/fixture`, scope), false);
    }
    assert(await read(`players/${uid}/objectiveStats/goldCamp`, undefined));
    assert.equal(await read(`players/${uid}/objectiveStats/goldCamp`, {}, "list"), false);
    assert(await read(`players/${uid}/saves/default-${scope.resetGeneration}`, {}));
    assert.equal(await read(`players/${uid}/saves/default-realm-2026-09`, {}), false);
    for (const root of ["leaderboards", "pvpLeaderboards", "crownCitadelReigns", "strongholdLegacies"]) {
      assert(await read(`${root}/${board}/entries/${other}`, scope));
      assert.equal(await read(`${root}/realm-2026-09--shard_0001/entries/${other}`, scope), false);
    }
    assert(await read(`realmEvents/${board}/activity/fixture`, scope));
    assert(await read(`realmGenerations/${scope.resetGeneration}/expansion/current`, {}));
    assert.equal(await read(`realmGenerations/${scope.resetGeneration}/assignments/${other}`, scope), false);
    assert(await read(`islands/${island}/cities/fixture`, scope));
    assert.equal(await read(`islands/${island}/reports/fixture_hold_private`, {}), false);
    assert.equal(await read(`islands/old/cities/fixture`, { ...scope, ownerUid: uid }), false, "Local owner reads also require the current island path");
    assert.equal(await read(`islands/old/cities/fixture`, { ...scope, ownerUid: other }), false);
    // Paths and record metadata must agree. Exercise every direct/list path
    // that previously trusted a current-looking container on its own.
    for (const target of [
      ...["cities", "camps", "marauders", "armies", "presence"].map(c => `islands/${island}/${c}/fixture`),
      `clanLeaderboards/${board}/entries/house`,
      `players/${uid}/objectiveStats/goldCamp`,
    ]) {
      assert(await read(target, scope), target);
      for (const foreign of [{ ...scope, resetGeneration: "realm-2026-09" },
        { ...scope, worldId: "test-world" }, { ...scope, realmShardId: "shard_0002" }, {}]) {
        assert.equal(await read(target, foreign), false, target + " foreign record");
        assert.equal(await read(target, foreign, "list"), false, target + " foreign list");
      }
    }
    const preShard = { resetGeneration: scope.resetGeneration, worldId: scope.worldId };
    assert(await read(`players/${uid}/objectiveStats/goldCamp`, preShard));
    assert(await read(`islands/${island}/presence/${uid}`, preShard));
    assert(await read("armies/fixture", { ...scope, ownerUid: other, participantUids: [uid] }));
    assert.equal(await read("armies/fixture", { ...scope, ownerUid: other }), false);
    assert(await read("reinforcements/fixture", { ...scope, ownerUid: other, targetOwnerUid: uid, status: "stationed" }));
    assert.equal(await read("reinforcements/fixture", { ...scope, ownerUid: uid, status: "moving" }), false);
    assert(await read(`battleSnapshots/${board}/entries/fixture`, { ...scope, participantUids: [uid] }));
    assert.equal(await read(`battleSnapshots/${board}/entries/fixture`, { ...scope, participantUids: [other] }), false);
    for (const target of ["serverConfig/private", "serverRateLimits/fixture", "realmSecurity/fixture/installation/private", "pvpKillEvents/fixture/events/private", "seasonResults/realm-2026-09/boards/players", `players/${uid}/rewardedAds/private`, `clans/house/treasuryReceipts/private`]) assert.equal(await read(target, scope), false, target);
    assert(await read(`clans/house/applications/${uid}`, scope));
    assert.equal(await read(`clans/house/applications/${other}`, scope), false);
    await db.doc(`clans/house/members/${uid}`).update({ role: "officer" });
    assert(await read(`clans/house/applications/${other}`, scope));
    assert(await read(`clans/house/questProgress/week`, undefined));
    assert.equal(await read(`clans/house/questProgress/week`, undefined, "list"), false);
    const quest = { ...scope, questPeriodId: "week", weekStartAt: Timestamp.fromMillis(now - 1), weekEndAt: Timestamp.fromMillis(now + 1) };
    assert(await read(`clans/house/questProgress/week`, quest));
    assert.equal(await read(`clans/house/questProgress/week`, { ...quest, weekEndAt: Timestamp.fromMillis(now) }), false);
    assert(await read(`clans/house/messages/fixture`, { ...scope, status: "visible" }));
    assert.equal(await read(`clans/house/messages/fixture`, { ...scope, status: "hidden" }), false);
    await db.doc(`clans/house/members/${uid}`).update({ status: "removed" });
    assert.equal(await read(`clans/house/messages/fixture`, { ...scope, status: "visible" }), false);
    assert.equal(await write("players/" + uid, profile, { ...profile, gold: 9999999 }), false);
    assert.equal(await write("players/" + uid, profile, { ...profile, activeSession: { version: 2, sessionId: "attacker" } }), false);
    assert(await write("players/" + uid, profile, { ...profile, marchPercent: 50 }));
    assert(await write("players/" + uid, profile, { ...profile, playerName: "Changed", identityRevision: 2 }));
    assert.equal(await write("players/" + uid, profile, { ...profile, playerName: "Changed", identityRevision: 1 }), false);
    assert.equal(await write("players/" + uid, profile, { ...profile, playerName: "Changed", identityRevision: 2, marchPercent: 50 }), false);
    assert.equal(await write("players/" + uid, undefined, { uid, gold: 1 }), false);
    assert.equal(await write("players/" + uid, undefined, { uid, activeSession: [] }), false);
    assert(await write("players/" + uid, undefined, { uid, playerName: "New", flag }));
    assert.equal(await write(`players/${uid}/saves/default-${scope.resetGeneration}`, {}, { state: { playerName: "Stale" } }), false);
    assert(await write(`players/${uid}/saves/default-${scope.resetGeneration}`, {}, { state: { playerName: profile.playerName, flag } }));
    const premium = { ...flag, symbol: "halloween-pumpkin" };
    assert.equal(await write("players/" + uid, profile, { ...profile, flag: premium, identityRevision: 2 }), false);
    await db.doc(`players/${uid}/cosmetics/state`).set({ owned: { halloween_pumpkin: true } });
    assert(await write("players/" + uid, profile, { ...profile, flag: premium, identityRevision: 2 }));
    const city = { ownerUid: uid, ownerName: "Fixture", troops: 10 };
    assert(await write(`islands/${island}/cities/fixture`, city, { ...city, ownerName: "Changed" }));
    assert.equal(await write(`islands/${island}/cities/fixture`, city, { ...city, troops: 999 }), false);
    assert.equal(await write(`islands/${island}/cities/fixture`, undefined, city), false);
    assert(await write(`islands/${island}/presence/${uid}`, undefined, { flag }));
    assert.equal(await write(`islands/${island}/presence/${other}`, undefined, { flag }), false);
    assert.equal(await write("serverConfig/private", {}, { enabled: true }), false);
    await db.runTransaction(async tx => {
      const access = await new Access({ store: db, transaction: tx, auth }).initialize();
      const symbols = quoted(/&& flag\.symbol in \[([^]*?)\]/.exec(rules)[1]);
      const patterns = quoted(/&& flag\.pattern in \[([^]*?)\]/.exec(rules)[1]);
      for (const symbol of symbols.filter(key => !key.startsWith("halloween-"))) assert(await access.flag({ ...flag, symbol }), symbol);
      for (const pattern of patterns) assert(await access.flag({ ...flag, pattern }), pattern);
      for (const invalid of [{ ...flag, version: 1 }, { ...flag, pattern: "unknown" }, { ...flag, symbol: "unknown" }, { ...flag, extra: true }, { ...flag, primary: "red" }]) assert.equal(await access.flag(invalid), false);
    });
    await db.doc("players/" + uid).delete();
    assert.equal(await write(`players/${uid}/saves/default-${scope.resetGeneration}`, undefined, { state: {} }), false);
    console.log("Local permissions: pinned Firestore policy, own/private/current-realm reads, clan revocation, hidden messages, battle participants, protected economy/session writes and identity/cosmetic/save rules passed.");
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
})().catch(error => { console.error("Local permission integration failed:", error.message); process.exitCode = 1; });
