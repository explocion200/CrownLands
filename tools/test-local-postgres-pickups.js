"use strict";
// Exercise real pickup transactions in an isolated PostgreSQL rehearsal schema.
// External providers stay disabled; no live player data or credentials are used.
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  process.env.CROWNLANDS_BACKEND = 'postgres-rehearsal';
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = 'migration_game_pickups_' + crypto.randomBytes(4).toString('hex');
  const originalNow = Date.now; let now = Date.UTC(2026, 9, 16, 12); Date.now = () => now;
  const game = require('../functions'), db = require('../functions/platform').store;
  const uid = 'pickup-fixture', auth = { uid, token: { email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
  const profile = db.doc('players/' + uid);
  const originalLog=console.log, timings=[];
  console.log=(...args)=>{if(args[0]==='crownlands_operation')timings.push(args[1]);else originalLog(...args);};
  try {
    await db.initialize();
    const R = require('../functions/season-rewards'), prior = R.seasonInfo('realm-2026-09');
    await R.arm(db, prior.seasonId, prior.startsAtMs+1);
    const realm = await game.getRealmInfo({ auth, data: {} });
    const client = { clientReleaseId: require('../functions/release-config.json').releaseId, clientWorldId: realm.worldId, clientResetGeneration: realm.resetGeneration, clientRealmShardId: realm.realmShardId };
    const call = (name,data={}) => game[name]({auth,data:{...client,...data}});
    const claim = await call('claimStartingCity',{playerName:'Pickup Fixture'});
    const mainRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`);
    const p = (await profile.get()).data(), scope = { worldId: realm.worldId, resetGeneration: realm.resetGeneration, realmShardId: realm.realmShardId };
    const mainRegion = p.mainRegionId;
    const core = require('../functions/core-expansion-world-layout.json').maps.flatMap(map => map.cities.map(city => ({ ...city, regionId: map.id }))).slice(0,227);
    const refs = [mainRef];
    for (const city of core) {
      const ref = db.doc(`islands/${require('../functions/realmTopology').buildIslandId(realm.worldId,city.regionId,realm.realmShardId)}/cities/${city.id}`);
      refs.push(ref); await ref.set({ ...city, ...scope, ownerUid: uid, ownerKind: 'player', ownerId: uid, owner: 'player', isMainCity: false, level: 20, troops: 1000, troopFloat: 1000, productionUpdatedAtMs: now - 600000 });
    }
    const mainSeed = (await mainRef.get()).data();
    const cursor = async () => (await db.pool.query(`SELECT coalesce(max(id),0) AS id FROM ${db.schema}.changes`)).rows[0].id;
    const changes = async from => (await db.pool.query(`SELECT path FROM ${db.schema}.changes WHERE id>$1`, [from])).rows.map(row => row.path);
    const date = new Date(now).toISOString().slice(0,10);
    async function seed(type, suffix='') {
      now += 1000;
      const id = 'fixture-' + type + suffix;
      for (const ref of refs) await ref.update({ troops: 1000, troopFloat: 1000, productionUpdatedAtMs: now-600000 });
      await mainRef.update({ level:20, isMainCity:true });
      await profile.set({ ...p, gold:1000, goldFloat:1000, economyUpdatedAtMs:now-600000,
        harvestBonuses:[{id,type,regionId:mainRegion,x:500,y:500,createdAtMs:now}],
        daily:{date,harvestedBonuses:0,harvestedGoldBonuses:0,harvestedTroopBonuses:0,harvestedCrownBonuses:0} });
      return {bonusId:id,type};
    }
    const reports=[];
    for (const type of ['gold','troops','crowns']) {
      const input=await seed(type), beforeCities=await db.getAll(...refs), from=await cursor();
      const start=performance.now(), result=await call('collectHarvestBonus',input);
      const writes=(await changes(from)).filter(path=>/^islands\/[^/]+\/cities\//.test(path));
      reports.push({type,durationMs:Math.round(performance.now()-start),cityCount:result.production.cityCount,cityWrites:writes.length,reward:result.reward});
      console.log(JSON.stringify(reports.at(-1)));
      assert.equal(result.production.cityCount,228);
      assert.deepEqual(writes,type==='troops'?[mainRef.path]:[], 'Only the troop-reward city may be persisted');
      assert(result.reward>0); if(type==='crowns')assert.equal(result.reward,1);
      assert.equal(result.currentUser.harvestNextSpawnAtMs,now+120000);
      assert.equal(result.currentUser.harvestBonuses.length,0);
      const afterCities=await db.getAll(...refs);
      for(let i=type==='troops'?1:0;i<refs.length;i++)assert.deepEqual(afterCities[i].body,beforeCities[i].body,'Unrelated city was changed');
      const projectedMain=result.cityUpdates.filter(city=>city.id===mainSeed.id||city.id===claim.cityId).at(-1);
      assert(projectedMain && projectedMain.troops>1000,'Uncheckpointed production must still be returned');
      if(type==='troops') {
        assert.equal(afterCities[0].data().troops,projectedMain.troops);
        assert.equal(afterCities[0].data().productionUpdatedAtMs,now);
      }
      // Materializing the deferred cities at the same instant must preserve
      // projected troops, wallet totals and the already-recorded production.
      const settled=await call('collectEconomy');
      assert.equal(settled.currentUser.gold,result.currentUser.gold);
      assert.equal((await mainRef.get()).data().troops,projectedMain.troops);
      assert.equal(settled.production.goldGained,0);
      assert.equal(settled.production.troopsGained,0);
      for(const city of result.cityUpdates) {
        const later=settled.cityUpdates.find(c=>c.id===city.id&&c.regionId===city.regionId);
        if(later)assert.equal(later.troops,city.troops,'Deferred production was lost or doubled');
      }
      const replayFrom=await cursor();
      if(type==='crowns')assert.equal((await call('collectHarvestBonus',input)).replayed,true);
      else await assert.rejects(call('collectHarvestBonus',input),/expired/);
      assert.deepEqual(await changes(replayFrom),[],'Replay changed balances, receipts or production');
    }
    // Simultaneous clicks resolve the same reservation once. Crown replays
    // retain their existing receipt response; other types reject the loser.
    for(const type of ['gold','troops','crowns']) {
      const input=await seed(type,'-concurrent');
      const results=await Promise.allSettled([call('collectHarvestBonus',input),call('collectHarvestBonus',input)]);
      const rewards=results.filter(r=>r.status==='fulfilled'&&r.value.reward>0);
      assert.equal(rewards.length,1,'Duplicate pickup granted a second reward');
      if(type==='crowns')assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.replayed).length,1);
      else assert.equal(results.find(r=>r.status==='rejected')?.reason.code,'failed-precondition');
      assert.equal((await profile.get()).data().harvestBonuses.length,0);
    }
    // Invalid/capped claims must not save optional checkpoints or consume the
    // existing reservation, even when every city's production is overdue.
    for(const invalid of ['missing','expired','cap']) {
      const input=await seed('gold','-'+invalid);
      if(invalid==='missing')input.bonusId='missing';
      if(invalid==='expired')await profile.update({harvestBonuses:[{id:input.bonusId,type:'gold',regionId:mainRegion,x:500,y:500,createdAtMs:now-21*60000}]});
      if(invalid==='cap')await profile.update({'daily.harvestedGoldBonuses':30,'daily.harvestedBonuses':30});
      const before=(await profile.get()).body, from=await cursor();
      await assert.rejects(call('collectHarvestBonus',input),/expired|limit/);
      assert.deepEqual(await changes(from),[]);
      assert.deepEqual((await profile.get()).body,before);
    }
    // A mandatory main-city flag repair must still be written with budget zero.
    const repairInput=await seed('gold','-repair');await refs[1].update({isMainCity:true});
    await call('collectHarvestBonus',repairInput);assert.equal((await refs[1].get()).data().isMainCity,false);
    assert.equal((await mainRef.get()).data().isMainCity,true);
    const measured=timings.filter(t=>t.operation==='collectHarvestBonus'&&t.outcome==='ok'&&t.cityCount===228);
    assert(measured.length>=7 && measured.every(t=>Number.isFinite(t.phaseDurationMs.economyPreparation)&&t.transactionAttempts>=1),'Real pickup timings were not recorded');
    console.log('Pickup PostgreSQL checks passed: 228-city projection, bounded writes, deferred production, all reward types, concurrent replay, rejected claims and mandatory repairs.');

  } finally {
    Date.now = originalNow; console.log=originalLog; await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close();
  }
})().catch(e => { console.error(e); process.exitCode=1; });
