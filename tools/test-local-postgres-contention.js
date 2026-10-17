"use strict";
// Independent PostgreSQL cluster, synthetic kingdoms only; never connects to
// the live socket, loads account credentials, or sends provider requests.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { Pool } = require('../local-backend/node_modules/pg');
const { Store, FieldValue } = require('../local-backend/store');
const { HttpsError } = require('../local-backend/platform');
const { extractFunction } = require('./world-travel-test-fixtures');
const settings = fs.readFileSync(path.join(__dirname, 'local-migration/postgresql-crownlands.conf'), 'utf8');
const expected = { max_pred_locks_per_transaction: 1024, max_pred_locks_per_relation: 512, max_pred_locks_per_page: 16 };
const parsed = Object.fromEntries(settings.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
  const match = /^(max_pred_locks_per_(?:transaction|relation|page)) = (\d+)$/.exec(l); assert(match, 'Only reviewed predicate limits may change'); return [match[1], +match[2]];
}));
assert.deepEqual(parsed, expected);
const delay = ms => new Promise(r => setTimeout(r, ms));
async function cleanupChecks(db) {
  const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
  const names = ['inactivityMaintenanceRef', 'isInactivityJobLocked', 'isInactivityLifecycleBlockingPlayer', 'isCurrentInactivityMembership', 'isCurrentInactivityAsset', 'getInactivityTargetStage', 'beginInactivePlayerMaintenance'];
  const scope = { worldId: 'fixture-current', resetGeneration: 'fixture-generation' }, day = 86400000, now = Date.now();
  const begin = new Function('db', 'FieldValue', 'HttpsError', 'safeString', 'safeNumber', 'runTransactionWithInfrastructureRetry', 'ONLINE_WORLD_ID', 'RESET_GENERATION', 'INACTIVITY_SURRENDER_MS', 'INACTIVITY_REMOVAL_MS', 'INACTIVITY_JOB_LEASE_MS', 'INACTIVITY_POLICY_VERSION',
    names.map(n => (source.includes(`async function ${n}(`) ? 'async ' : '') + extractFunction(source, n)).join('\n') + '\nreturn beginInactivePlayerMaintenance;')(
    db, FieldValue, HttpsError, (v, n) => String(v || '').slice(0, n), (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback,
    action => db.runTransaction(action), scope.worldId, scope.resetGeneration, 15 * day, 20 * day, 20 * 60000, 1);
  const old = { worldId: 'fixture-previous', resetGeneration: 'fixture-previous-generation', gold: 431, gear: { preserved: true } };
  const error = 'Enter the current Crownlands realm; your profile must belong to the current Crownlands world before using gameplay.';
  const membership = { ...scope, status: 'active', lastSeenAtMs: now - 16 * day, inactivityStage: 'surrender-failed' };
  const failed = { ...scope, uid: 'stale', status: 'failed', stage: 'surrendering', lastError: error, leaseUntilMs: 0,
    releasedCities: 0, releasedCamps: 0, consolidatedTroops: 0, canceledArmies: 0, returnedReinforcements: 0 };
  const profile = db.doc('players/stale'), member = profile.collection('serverMembership').doc('current');
  const receipt = db.doc(`realmMaintenance/${scope.resetGeneration}/inactivePlayers/stale`);
  const asset = db.doc('islands/current/cities/preserved');
  await profile.set(old); await member.set(membership); await receipt.set(failed); await asset.set({ ...scope, ownerUid: 'stale', troops: 500 });
  const profileBefore = (await profile.get()).body, assetBefore = (await asset.get()).body;
  const results = await Promise.all([begin('stale', 'surrendering', now), begin('stale', 'surrendering', now)]);
  assert(results.every(r => !r.acquired && r.reason === 'profile-realm-mismatch'));
  assert.equal((await receipt.get()).data().status, 'skipped');
  assert.equal((await receipt.get()).data().lastError, error, 'Failure evidence must remain');
  assert.equal((await member.get()).data().inactivityStage, undefined);
  assert.deepEqual((await profile.get()).body, profileBefore); assert.deepEqual((await asset.get()).body, assetBefore);
  const count = () => db.pool.query(`SELECT count(*)::int AS n FROM ${db.schema}.changes`);
  const prior = (await count()).rows[0].n; await begin('stale', 'surrendering', now);
  assert.equal((await count()).rows[0].n, prior, 'Repeated skip must not rewrite state');
  for (const patch of [{ releasedCities: 1 }, { consolidatedTroops: 5 }, { canceledArmies: 1 }, { returnedReinforcements: 1 }, { releasedCamps: 1 }, { lastError: 'another fault' }, { stage: 'removing' }, { status: 'processing' }]) {
    await receipt.set({ ...failed, ...patch }); const before = (await receipt.get()).body;
    await assert.rejects(begin('stale', 'surrendering', now), /requires current-realm review/);
    assert.deepEqual((await receipt.get()).body, before);
  }
  await receipt.set({ ...failed, status: 'processing', leaseUntilMs: now + 60000 });
  assert.equal((await begin('stale', 'surrendering', now)).reason, 'locked');
  await receipt.delete(); await profile.delete();
  assert.equal((await begin('stale', 'surrendering', now)).reason, 'profile-realm-mismatch');
  assert.equal((await receipt.get()).exists, false, 'Missing profile must not create a maintenance job');
  await profile.set({ ...scope, gold: 50 }); await member.set(membership);
  const acquired = await begin('stale', 'surrendering', now); assert(acquired.acquired);
  assert.equal((await receipt.get()).data().status, 'processing');
  assert.equal((await begin('stale', 'surrendering', now)).reason, 'locked');
  await receipt.delete(); await member.update({ lastSeenAtMs: now });
  assert.equal((await begin('stale', 'surrendering', now)).reason, 'activity-renewed');
  await member.set({ ...membership, ...old });
  assert.equal((await begin('stale', 'surrendering', now)).reason, 'realm-changed');
}
async function contentionRound(db) {
  const a = await db.pool.connect(), b = await db.pool.connect();
  const locks = async c => (await c.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=pg_backend_pid() AND mode='SIReadLock' AND locktype='relation' AND relation=$1::regclass", [db.schema + '.documents'])).rows[0].n;
  try {
    for (const c of [a, b]) await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    for (const [c, owner] of [[a, 'aaa'], [b, 'zzz']]) {
      const q = db.compile(db.collection('cities').where('ownerUid', '==', owner));
      const r = await c.query(q.text, q.values); assert.equal(r.rowCount, 228);
    }
    const relationLocks = [await locks(a), await locks(b)], outcomes = [];
    // Both clients write only their own kingdoms after their read snapshots.
    for (const [c, owner] of [[a, 'aaa'], [b, 'zzz']]) {
      try {
        await c.query(`UPDATE ${db.schema}.documents SET source_sha256=source_sha256||'x' WHERE path=$1`, ['cities/' + owner + '-0001']);
        await c.query('COMMIT'); outcomes.push('committed');
      } catch (e) { assert.equal(e.code, '40001'); await c.query('ROLLBACK'); outcomes.push('serialization-retry'); }
    }
    return { relationLocks, outcomes };
  } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
}
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-contention-'));
  const bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const run = (name, args) => execFileSync(path.join(bin, name), args, { stdio: 'pipe', timeout: 30000 });
  let started = false, db;
  const pool = () => new Pool({ host: dir, user: 'postgres', database: 'crownlands_migration', max: 12, statement_timeout: 10000 });
  try {
    run('initdb', ['-D', path.join(dir, 'data'), '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-instructions']);
    run('pg_ctl', ['-D', path.join(dir, 'data'), '-l', path.join(dir, 'log'), '-o', "-h '' -k " + dir, '-w', 'start']); started = true;
    const admin = new Pool({ host: dir, user: 'postgres', database: 'postgres' }); await admin.query('CREATE DATABASE crownlands_migration'); await admin.end();
    db = new Store({ schema: 'migration_game_contention', pool: pool() }); await db.initialize();
    // One heap page per synthetic city prevents shared rows from being mistaken
    // for the table-promotion regression. Every owner uses disjoint data.
    await db.pool.query(`ALTER TABLE ${db.schema}.documents ALTER COLUMN body SET STORAGE PLAIN;
      INSERT INTO ${db.schema}.documents(path,collection_id,parent_path,body,source_sha256)
      SELECT 'cities/'||owner||'-'||lpad(n::text,4,'0'),'cities','',jsonb_build_object('fields',jsonb_build_object('ownerUid',jsonb_build_object('stringValue',owner),'padding',jsonb_build_object('stringValue',repeat('p',4000)))),'fixture'
      FROM unnest(ARRAY['aaa','middle','zzz']) owner CROSS JOIN generate_series(1,228) n;
      CREATE INDEX fixture_owner ON ${db.schema}.documents (${db.schema}.query_sort_key(body#>'{fields,ownerUid}')) WHERE collection_id='cities';
      ANALYZE ${db.schema}.documents;`);
    const before = await contentionRound(db);
    assert.deepEqual(before.relationLocks, [1, 1], 'Baseline must reproduce table-wide dependency promotion');
    assert(before.outcomes.includes('serialization-retry'), 'Baseline must reproduce a false conflict');
    await db.close(); db = null;
    fs.appendFileSync(path.join(dir, 'data/postgresql.conf'), '\n' + settings);
    run('pg_ctl', ['-D', path.join(dir, 'data'), '-m', 'fast', '-w', 'restart', '-l', path.join(dir, 'log')]);
    db = new Store({ schema: 'migration_game_contention', pool: pool() });
    for (const [name, value] of Object.entries(expected)) assert.equal(+(await db.pool.query('SHOW ' + name)).rows[0][name], value);
    const after = [];
    for (let i = 0; i < 5; i++) { const result = await contentionRound(db); after.push(result); assert.deepEqual(result.relationLocks, [0, 0]); assert.deepEqual(result.outcomes, ['committed', 'committed']); }
    // True conflicting writers still retry and cannot double-spend.
    const wallet = db.doc('wallets/owner'), receipt = db.doc('receipts/once'); await wallet.set({ balance: 100 });
    let attempts = 0;
    await Promise.all(Array.from({ length: 6 }, () => db.runTransaction(async tx => {
      attempts++; const [w, r] = await tx.getAll(wallet, receipt); if (r.exists) return;
      await delay(10); tx.update(wallet, { balance: w.data().balance - 10 }); tx.create(receipt, { paid: true });
    })));
    assert(attempts > 6); assert.equal((await wallet.get()).data().balance, 90);
    assert.equal((await db.pool.query(`SELECT count(*)::int AS n FROM ${db.schema}.changes WHERE path='receipts/once'`)).rows[0].n, 1);
    // A real cross-document dependency cycle must still reject write skew.
    const guards = [db.doc('guards/a'), db.doc('guards/b')];
    for (const ref of guards) await ref.set({ onDuty: true });
    let arrivals = 0, release; const bothRead = new Promise(resolve => { release = resolve; });
    await Promise.all(guards.map(ref => db.runTransaction(async tx => {
      const snapshots = await tx.getAll(...guards);
      if (++arrivals === 2) release();
      if (arrivals <= 2) await bothRead;
      if (snapshots.filter(s => s.data().onDuty).length > 1) tx.update(ref, { onDuty: false });
    })));
    assert.equal((await db.getAll(...guards)).filter(s => s.data().onDuty).length, 1);
    await cleanupChecks(db);
    console.log(JSON.stringify({ before, after, realConflictAttempts: attempts }));
    console.log('Serializable tuning and inactivity scope passed: unrelated kingdoms avoid retries; real conflicts, exact-once spending, profile preservation, failed-preflight recovery and partial-cleanup fences retained.');
  } finally {
    await db?.close(); if (started) run('pg_ctl', ['-D', path.join(dir, 'data'), '-m', 'fast', '-w', 'stop']); fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
