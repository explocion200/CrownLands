"use strict";
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { clientSource, extractFunction } = require("./world-travel-test-fixtures");
const noop = () => {};
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  let now = 1000000, scope = "player:realm:session", renders = 0;
  const s = {
    Date: { now: () => now }, console: { warn: noop }, window: { setTimeout: noop },
    state: {}, KING_POWER_AUTHORITY_VERSION: 12, ENEMY_POWER_BAND_STABILIZE_MS: 3000,
    ATTACK_PROTECTION_ASSAULT_MIN_RATIO: 2, ATTACK_PROTECTION_RAID_MIN_RATIO: 2.5,
    PLAYER_IDENTITY_CACHE_STALE_MS: 300000, PLAYER_IDENTITY_LOOKUP_BATCH_SIZE: 30,
    playerIdentityCache: new Map(), enemyPowerBandCache: new Map(), playerIdentityLookupMisses: new Map(),
    playerIdentityLookupQueue: new Set(), playerIdentityLookupInFlight: false,
    getOnlineSessionRequestScope: () => scope, getCurrentOnlineUid: () => "self",
    normalizePowerValue: v => Math.max(0, Math.floor(Number(v) || 0)),
    normalizeTimestampMs: v => Math.max(0, Number(v) || 0), timestampToMs: v => Number(v) || 0,
    normalizeFlag: v => v || null, getFlagSignature: v => JSON.stringify(v), cleanName: v => v,
    getKnownCityId: v => v || "", getRegionIdFromOnlineIslandId: v => v || "", normalizeRegionId: v => v || "",
    isStronghold: city => city.kind === "stronghold", isClanAllyCity: city => !!city.ally,
    getGlobalStatsSnapshot: () => s.stats, getKingPower: () => s.stats.kingPower,
    getAuthoritativeCityOwnerKingPowerSnapshot: city => s.playerIdentityCache.get(city.ownerUid)?.kingPower || 0,
    scheduleEnemyPowerBandCommit: noop, canonicalizeVisiblePlayerIdentities: () => false,
    renderCities: () => renders++, renderPaths: noop, renderArmies: noop,
    updateIncomingAttackUi: noop, updateOutgoingAttackUi: noop,
    withTimeout: promise => promise,
    stats: { kingPower: 200000, version: 12, updatedAtMs: now },
  };
  vm.createContext(s);
  for (const name of ["getEnemyCityPowerBand", "getAuthoritativePlayerPowerBandSnapshot", "getAuthoritativeEnemyPowerBandSnapshot", "clearEnemyPowerBandPending", "getStableEnemyCityPowerBand", "getEnemyCityPowerBandLabel", "normalizePlayerIdentity", "getPlayerIdentitySignature", "shouldReplacePlayerIdentity", "rememberPlayerIdentity", "rememberPlayerIdentities", "refreshMissingPlayerPowerIdentities", "refreshQueuedPlayerIdentities"]) {
    vm.runInContext((clientSource.includes(`async function ${name}(`) ? "async " : "") + extractFunction(clientSource, name), s);
  }
  return { s, advance: ms => now += ms, changeSession: () => scope += ":new", renders: () => renders };
}
const row = (uid, power, version = 12, updatedAtMs = 1000000) => ({ uid, kingPower: power, kingPowerVersion: version, updatedAtMs });
async function main() {
  const f = fixture(), { s } = f, city = { owner: "enemy", ownerUid: "weak" };
  assert.equal(s.getStableEnemyCityPowerBand(city), "unknown", "Missing power was falsely advertised as in range");
  assert.match(s.getEnemyCityPowerBandLabel("unknown"), /not yet verified/);
  for (const [own, enemy, band] of [[199999,100000,"in-range"],[200000,100000,"protected"],[249999,100000,"protected"],[250000,100000,"protected"],[100000,100000,"in-range"],[100000,100001,"overpowering"],[0,100000,"unknown"],[100000,0,"unknown"]]) {
    assert.equal(s.getEnemyCityPowerBand(city, own, enemy), band);
  }
  s.rememberPlayerIdentity(row("weak", 900000, 11), { force: true });
  assert.equal(s.getStableEnemyCityPowerBand(city), "unknown", "Legacy power must not become a red strength classification");
  s.rememberPlayerIdentity(row("weak", 100000), { force: true });
  assert.equal(s.getStableEnemyCityPowerBand(city), "protected");
  assert.match(s.getEnemyCityPowerBandLabel("protected", city), /two-stage/);
  s.stats.kingPower = 250000;
  s.getStableEnemyCityPowerBand(city);
  assert.match(s.getEnemyCityPowerBandLabel("protected", city), /raid only/);
  s.stats = { kingPower: 50000, version: 12, updatedAtMs: 1000100 };
  assert.equal(s.getStableEnemyCityPowerBand(city), "protected");
  f.advance(2999); assert.equal(s.getStableEnemyCityPowerBand(city), "protected");
  f.advance(1); assert.equal(s.getStableEnemyCityPowerBand(city), "overpowering");
  s.stats = { kingPower: 900000, version: 12, updatedAtMs: 999999 };
  assert.equal(s.getStableEnemyCityPowerBand(city), "overpowering", "Older power snapshot reverted a confirmed band");
  assert.equal(s.getStableEnemyCityPowerBand({ ...city, ally: true }), "");
  assert.equal(s.getStableEnemyCityPowerBand({ ...city, kind: "stronghold" }), "");

  const queued = fixture(), q = queued.s, waiting = [], calls = [];
  q.playerIdentityLookupQueue = new Set(["one", "two", "three", "valid"]);
  q.getOnlineApi = () => ({ isSignedIn: () => true,
    loadPlayerIdentities: async () => [row("one", 1, 11), row("two", 1, 11), row("valid", 100000)],
    getCombatPlayerIdentity: ({ uid }) => { calls.push(uid); return new Promise(resolve => waiting.push({ uid, resolve })); },
  });
  const refresh = q.refreshQueuedPlayerIdentities(); await drain();
  assert.equal(calls.length, 2, "Power repair must have only two outstanding requests");
  assert(queued.renders() > 0, "Ready leaderboard rows waited for the stale-player repair");
  waiting.find(r => r.uid === "two").resolve(row("two", 100000)); await drain();
  assert.equal(q.getStableEnemyCityPowerBand({ ...city, ownerUid: "two" }), "protected");
  assert.equal(calls.length, 3, "One stalled repair blocked the other worker");
  waiting.find(r => r.uid === "three").resolve(row("three", 300000));
  waiting.find(r => r.uid === "one").resolve(row("one", 100000)); await refresh;
  assert(!calls.includes("valid"));
  assert.equal(q.playerIdentityLookupInFlight, false);

  const failed = fixture(), e = failed.s; let attempts = 0;
  const api = { getCombatPlayerIdentity: async () => { attempts++; throw Error("unavailable"); } };
  await e.refreshMissingPlayerPowerIdentities(["missing"], api, e.getOnlineSessionRequestScope());
  await e.refreshMissingPlayerPowerIdentities(["missing"], api, e.getOnlineSessionRequestScope());
  assert.equal(attempts, 1, "Failed power lookup retried on every render");
  failed.advance(300001);
  await e.refreshMissingPlayerPowerIdentities(["missing"], api, e.getOnlineSessionRequestScope());
  assert.equal(attempts, 2);
  assert.equal(e.getStableEnemyCityPowerBand({ ...city, ownerUid: "missing" }), "unknown");

  const legacyRetry = fixture(), l = legacyRetry.s; let repairs = 0;
  l.getOnlineApi = () => ({ isSignedIn: () => true,
    loadPlayerIdentities: async () => [row("legacy", 100000, 11)],
    getCombatPlayerIdentity: async () => { repairs++; throw Error("unavailable"); },
  });
  for (let i = 0; i < 3; i++) {
    l.playerIdentityLookupQueue.add("legacy");
    await l.refreshQueuedPlayerIdentities();
    legacyRetry.advance(1000);
  }
  assert.equal(repairs, 1, "Rereading a legacy row erased its failed power repair cooldown");
  legacyRetry.advance(297001);
  l.playerIdentityLookupQueue.add("legacy");
  await l.refreshQueuedPlayerIdentities();
  assert.equal(repairs, 2, "Legacy rereads kept extending the repair cooldown forever");

  for (const stage of ["leaderboard", "repair"]) {
    const stale = fixture(), x = stale.s; let release;
    x.playerIdentityLookupQueue.add("late");
    x.getOnlineApi = () => ({ isSignedIn: () => true,
      loadPlayerIdentities: () => stage === "leaderboard" ? new Promise(r => release = r) : Promise.resolve([]),
      getCombatPlayerIdentity: () => new Promise(r => release = r),
    });
    const task = x.refreshQueuedPlayerIdentities(); await drain(); stale.changeSession();
    release(stage === "leaderboard" ? [row("late", 100000)] : row("late", 100000)); await task;
    assert.equal(x.playerIdentityCache.size, 0, `${stage}: old session changed displayed power`);
    assert.equal(stale.renders(), 0);
    assert.equal(x.playerIdentityLookupInFlight, false);
  }
  console.log("Validated King Power color boundaries, unknown/legacy data, stabilization, bounded authoritative repair, failures and stale sessions.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
