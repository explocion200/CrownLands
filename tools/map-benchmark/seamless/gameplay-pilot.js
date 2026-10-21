"use strict";
// Explicit development factory. Never imports production credentials or data.
const crypto = require("node:crypto");
const { Store } = require("../../../local-backend/store");
const { createPlatform } = require("../../../local-backend/platform");
const { Pool } = require("../../../local-backend/node_modules/pg");
const { createTravelFixture, canonicalCity } = require("../../world-travel-test-fixtures");
const { createCommandRouting } = require("./command-routing");
const { LiveReader } = require("./live-reader");
const Policy = require("../../../functions/authoritative-route-policy");
const pilots = new WeakSet();
const callableNames = new Set(["previewArmyRoute", "sendArmyOrder", "sendNearbyScouts", "sendRegroupOrders", "useRecallHorn", "returnClanReinforcement", "createClanRally", "joinClanRally", "launchClanRally", "cancelClanRally", "withdrawClanRallyContribution"]);
const fail = (status, message) => Object.assign(Error(message), { status });

async function createGameplayPilot() {
  if (process.env.CROWNLANDS_BACKEND || process.env.FIRESTORE_EMULATOR_HOST || require.cache[require.resolve("../../../functions")]) throw Error("Start the pilot in a fresh development process");
  const schema = "migration_game_worldtest_" + crypto.randomBytes(6).toString("hex");
  const store = new Store({ schema }), routing = createCommandRouting();
  const platformPath = require.resolve("../../../functions/platform");
  const previousPlatform = require.cache[platformPath];
  require.cache[platformPath] = { id: platformPath, filename: platformPath, loaded: true, exports: createPlatform({ store, privateWorldRouting: routing }) };
  const game = require("../../../functions");
  const players = ["Rowan", "Alder"].map(name => ({ uid: "pilot_" + crypto.randomBytes(8).toString("hex"), name }));
  let identity, reader, readPool, ticking, timer, closed = false;
  const active = new Set(), metrics = { commands: 0, failures: 0, resolved: 0, settlementErrors: 0, durations: [] };
  const call = (name, uid, data = {}) => game[name]({ auth: { uid, token: { email_verified: true, firebase: { sign_in_provider: "password" } } },
    data: { ...data, clientReleaseId: identity?.releaseId, clientWorldId: identity?.worldId, clientResetGeneration: identity?.resetGeneration, clientRealmShardId: identity?.realmShardId } });
  const island = region => `islands/${identity.worldId}--${identity.realmShardId}--${region}`;
  const cityRef = c => store.doc(`${island(c.regionId)}/cities/${c.id}`);
  const context = () => ({ ...identity, sharedRealmId: identity.realmShardId, activeRegionIds: fixture.activeRegionIds });
  const fixture = createTravelFixture(87);
  async function close() {
    if (closed) return; closed = true; clearInterval(timer);
    await ticking; while (active.size) await new Promise(resolve => setTimeout(resolve, 25));
    await routing.close(); await readPool?.end();
    await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await store.close();
    delete require.cache[require.resolve("../../../functions")];
    if (previousPlatform) require.cache[platformPath] = previousPlatform; else delete require.cache[platformPath];
  }
  try {
    await store.initialize();
    const seasons = require("../../../functions/season-rewards"), prior = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
    await seasons.arm(store, prior, seasons.seasonInfo(prior).startsAtMs + 1);
    const realm = await call("getRealmInfo", players[0].uid);
    identity = { releaseId: realm.currentReleaseId, worldId: realm.worldId, resetGeneration: realm.resetGeneration, realmShardId: realm.sharedRealmId };
    for (const player of players) await call("claimStartingCity", player.uid, { playerName: "Pilot " + player.name });
    await store.doc(`realmGenerations/${identity.resetGeneration}/expansion/current`).set({ activeRegionIds: fixture.activeRegionIds,
      admittingRegionIds: fixture.activeRegionIds, nextActivationOrdinal: fixture.activeRegionIds.length }, { merge: true });
    readPool = new Pool({ host: "/var/run/postgresql", database: "crownlands_migration", max: 2, connectionTimeoutMillis: 250,
      options: "-c default_transaction_read_only=on", application_name: "world-command-pilot-reader" });
    reader = new LiveReader({ pool: readPool, schema, openWorld: true }); await reader.initialize(players[0].uid);
    const cities = [];
    for (const section of reader.manifest.sections) {
      const map = fixture.scope.getServerWorldMap(section.id);
      for (let i = 0; i < map.cities.length; i++) cities.push(canonicalCity(fixture.planner, section.id, i));
    }
    // Preserve the fictional accounts' claimed Main Cities. Everything else is
    // independently created from current catalog definitions, never a live copy.
    const existing = await store.collectionGroup("cities").get();
    const main = new Set(existing.docs.filter(d => d.data().ownerUid).map(d => d.ref.path));
    for (let i = 0; i < cities.length; i += 150) {
      const batch = store.batch();
      for (const c of cities.slice(i, i + 150)) if (!main.has(cityRef(c).path)) batch.set(cityRef(c), { ...c, ...identity,
        ownerKind: "neutral", ownerUid: "", ownerName: "Neutral", level: 1, troops: 5, troopFloat: 5, isMainCity: false, productionUpdatedAtMs: Date.now() });
      await batch.commit();
    }
    const home = reader.sections.get(reader.manifest.homeSectionId);
    const east = reader.manifest.sections.find(s => s.gridX === home.gridX + 1 && s.gridY === home.gridY);
    let pair, distance = Infinity;
    for (const a of cities.filter(c => c.regionId === home.id)) for (const b of cities.filter(c => c.regionId === east.id)) {
      const d = routing.distance(a, b, context()); if (d < distance) { distance = d; pair = [a, b]; }
    }
    if (distance > Policy.NEARBY_SCOUT_RADIUS) throw Error("No cross-edge pilot fixture");
    const nearby = cities.filter(c => c.id !== pair[0].id && c.id !== pair[1].id && routing.distance(c, pair[0], context()) <= Policy.REGROUP_RADIUS)
      .sort((a, b) => routing.distance(a, pair[0], context()) - routing.distance(b, pair[0], context()));
    if (nearby.length < 4) throw Error("Not enough pilot neighbours");
    const assignments = [[pair[0], players[0]], [nearby[0], players[0]], [nearby[1], players[1]], [nearby[2], players[1]]];
    for (const [c, p] of assignments) await cityRef(c).set({ ...c, ...identity, ownerUid: p.uid, ownerKind: "player", owner: "player", ownerName: "Pilot " + p.name,
      level: 1, troops: 50000, troopFloat: 50000, isMainCity: false, productionUpdatedAtMs: Date.now() }, { merge: true });
    const clanId = "pilot-clan";
    await store.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: players[0].uid, memberCount: 2, name: "Pilot clan", tag: "TEST" });
    for (const [i, p] of players.entries()) {
      await store.doc(`clans/${clanId}/members/${p.uid}`).set({ ...identity, clanId, uid: p.uid, status: "active", role: i ? "member" : "leader" });
      await store.doc(`players/${p.uid}`).update({ clanId, clanRole: i ? "member" : "leader", itemEffects: {}, shopItems: { recall_horn: 50 }, gold: 10000000, goldFloat: 10000000 });
    }
    routing.setEnabled(true);
    reader.manifest = { ...reader.manifest, gameplayPilot: true, label: "Private gameplay pilot — sample accounts" };
    const pilot = { reader, store, routing, players, identity, metrics, pair, assignments, cityRef, context, close, routes: require("../../../local-backend/platform").describe(game),
      async execute(uid, name, data = {}, { nativeUi = false } = {}) {
        if (closed || !players.some(p => p.uid === uid)) throw fail(403, "Test session ended");
        if (!data || typeof data !== "object" || Array.isArray(data)) throw fail(400, "Invalid command data");
        if (active.has(uid) || active.size >= 2) throw fail(429, "Order pending; retry shortly");
        active.add(uid); const started = performance.now();
        try {
          if (name === "options") return await options(uid, data);
          if (!callableNames.has(name)) throw fail(405, "This command is not available in the pilot");
          const result = await call(name, uid, data); metrics.commands++;
          // The normal UI rehearsal uses the callable envelope from this isolated
          // factory. No production platform can construct this capability.
          if (nativeUi) return result;
          // Only return fields needed by the pilot, never full profiles/reports.
          return name === "previewArmyRoute" ? { durationMs: result.durationMs, pathLength: result.length, segments: result.segments }
            : { ok: result.ok, movementId: result.movement?.id, rallyId: result.rally?.id, movementIds: result.armies?.map(m => m.id), cost: result.cost };
        } catch (error) { metrics.failures++; throw error; }
        finally { active.delete(uid); metrics.durations.push(performance.now() - started); if (metrics.durations.length > 1000) metrics.durations.shift(); }
      },
      async settle() {
        const armies = await store.collection("armies").where("status", "==", "active").get();
        for (const snapshot of armies.docs.slice(0, 100)) {
          const army = snapshot.data();
          if (army.arrivesAtMs > Date.now() || !players.some(p => p.uid === army.ownerUid)) continue;
          try { await call("resolveArmyOrder", army.ownerUid, { armyId: snapshot.id, routeRegionIds: army.routeRegionIds }); metrics.resolved++; }
          catch { metrics.settlementErrors++; }
        }
        const receipts = await store.collection(`rallyBattleReceipts/${identity.resetGeneration}--${identity.realmShardId}/entries`).where("status", "!=", "settled").get();
        for (const snapshot of receipts.docs.slice(0, 20)) try { await game.settleRallyBattle({ data: snapshot, params: { receiptId: snapshot.id } }); } catch { metrics.settlementErrors++; }
      },
    };
    async function options(uid, data) {
      // Collection-group city queries also include economy/index rows. Only
      // authoritative current-realm island documents can be order endpoints.
      const inRealm = d => d.ref.path === `${island(d.data().regionId)}/cities/${d.id}` && reader.sections.has(d.data().regionId);
      const owned = (await store.collectionGroup("cities").where("worldId", "==", identity.worldId).where("ownerUid", "==", uid).get()).docs.filter(inRealm).map(d => ({ id: d.id, ...d.data() }));
      const key = c => c.regionId + ":" + c.id;
      const anchor = owned.find(c => key(c) === data.key);
      const nearbyDocs = anchor ? (await Promise.all(routing.nearbySections(anchor, Policy.NEARBY_SCOUT_RADIUS, context()).map(id => store.collection(`${island(id)}/cities`).get()))).flatMap(s => s.docs).filter(inRealm) : [];
      const dto = c => ({ key: key(c), id: c.id, regionId: c.regionId, name: c.name,
        ...(c.ownerUid === uid ? { troops: Math.floor(c.troops) } : {}), ...(anchor ? { distance: routing.distance(anchor, c, context()) } : {}) });
      const profile = (await store.doc(`players/${uid}`).get()).data();
      const pending = (await store.collection("armies").where("ownerUid", "==", uid).where("status", "==", "active").get()).docs.map(d => ({ id: d.id, ...d.data() }));
      const targets = new Set(pending.filter(m => m.kind === "scout" && !m.returning).map(m => m.targetRegionId + ":" + m.toId));
      const ally = new Set(players.filter(p => p.uid !== uid).map(p => p.uid));
      const nearby = anchor ? nearbyDocs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.ownerUid !== uid && !ally.has(c.ownerUid) && !c.isMainCity && !targets.has(key(c)) && routing.distance(anchor, c, context()) <= Policy.NEARBY_SCOUT_RADIUS).map(dto).sort((a,b) => a.distance-b.distance || a.key.localeCompare(b.key)).slice(0, Policy.MAX_NEARBY_SCOUT_TARGETS) : [];
      const regroup = anchor ? owned.filter(c => key(c) !== key(anchor) && c.troops >= 1 && routing.distance(anchor,c,context()) <= Policy.REGROUP_RADIUS).map(dto).sort((a,b) => a.distance-b.distance || a.key.localeCompare(b.key)).slice(0, Policy.MAX_REGROUP_SOURCES) : [];
      const stationed = (await store.collection("reinforcements").where("ownerUid", "==", uid).where("status", "==", "stationed").get()).docs;
      const rallies = (await store.collection(`clans/${profile.clanId}/rallies`).get()).docs.filter(d => ["forming","launched","recalling"].includes(d.data().status));
      return { rallies: rallies.map(d => ({id:d.id,clanId:profile.clanId,name:d.data().targetName||"Rally",status:d.data().status,leader:d.data().leaderUid===uid,joined:(d.data().participants||[]).some(p=>p.uid===uid)})), viewer: players.find(p => p.uid === uid).name, gold: Math.floor(profile.gold), owned: owned.map(dto), nearby, regroup,
        costs: {nearby: require("../../../functions/economy-config.json").playerCosts.nearbyScoutGold,regroup:require("../../../functions/economy-config.json").playerCosts.regroupGold},
        radii: { nearby: Policy.NEARBY_SCOUT_RADIUS, regroup: Policy.REGROUP_RADIUS },
        marches: pending.map(m => ({ id: m.id, name: `${m.fromName} → ${m.toName}`, kind: m.kind, returning: !!m.returning, arrivesAtMs: m.arrivesAtMs })),
        stationed: stationed.map(d => ({ id: d.id, name: d.data().targetCityName || d.data().targetId || "Allied city" })) };
    }
    pilots.add(pilot);
    timer = setInterval(() => { if (!ticking && !closed) ticking = pilot.settle().catch(() => { metrics.settlementErrors++; }).finally(() => { ticking = null; }); }, 1000);
    timer.unref(); return pilot;
  } catch (error) { await close(); throw error; }
}
module.exports = { createGameplayPilot, isGameplayPilot: p => pilots.has(p) };
