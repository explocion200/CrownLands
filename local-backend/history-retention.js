"use strict";
const { Store } = require("./store");
const DAY = 86400000, RETENTION_MS = 7 * DAY;
const indexNames = ["history_complete_jobs", "history_processed_changes", "history_job_sources"];
const scope = body => ["resetGeneration", "worldId", "sharedRealmId", "resetReadinessStatus"].map(key => body?.[key] || "");
const schemaName = value => { if (!/^migration_game_[a-z0-9_]{1,30}$/.test(value)) throw Error("Invalid history schema"); return value; };
const fail = message => Object.assign(Error(message), { code: "history-maintenance-stopped" });
async function prepareHistoryIndexes(pool, name) {
  const s = schemaName(name), client = await pool.connect();
  try {
    await client.query("SET lock_timeout='2s'; SET statement_timeout='120s'");
    // Separate concurrent statements avoid a long blocking table lock. This is
    // an installation step, never a side effect of a dry-run or cleanup batch.
    await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS history_complete_jobs ON ${s}.work_jobs(finished_at,id)
      WHERE status='complete' AND (event<>'{}'::jsonb OR last_error_code IS NOT NULL)`);
    await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS history_processed_changes ON ${s}.changes(dispatched_at,id) WHERE dispatched_at IS NOT NULL`);
    await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS history_job_sources ON ${s}.work_jobs((event->>'changeId')) WHERE event ? 'changeId'`);
    await requireIndexes(client, s);
  } finally { await client.query("RESET lock_timeout; RESET statement_timeout").catch(() => {}); client.release(); }
}
async function requireIndexes(client, s) {
  const result = await client.query(`SELECT c.relname,i.indisvalid,t.relname AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_index i ON i.indexrelid=c.oid JOIN pg_class t ON t.oid=i.indrelid WHERE n.nspname=$1 AND c.relname=ANY($2::text[])`, [s,indexNames]);
  if (result.rows.length!==indexNames.length || result.rows.some(row=>!row.indisvalid || row.table_name!==(row.relname==="history_processed_changes"?"changes":"work_jobs"))) throw fail("Install and validate the retention indexes before running maintenance.");
}
async function realm(store, client) {
  const value=(await store.get(store.doc("realmConfig/current"),client)).data();
  if (!value?.resetGeneration || !value?.worldId || value.resetReadinessStatus!=="ready") throw fail("The current realm is not ready; maintenance stopped.");
  return scope(value);
}
function validateState(state, store, apply, now) {
  if (!state || state.version!==1 || state.schema!==store.schema || state.apply!==apply || !["jobs","changes","done"].includes(state.phase)
    || !Number.isFinite(Date.parse(state.startedAt)) || Date.parse(state.cutoff)!==Date.parse(state.startedAt)-RETENTION_MS
    || Date.parse(state.cutoff)>now-RETENTION_MS || !Array.isArray(state.realm) || state.realm.length!==4) throw fail("Invalid or incompatible maintenance checkpoint.");
  if (state.cursor && (!/^\d{1,19}$/.test(state.cursor.id) || !Number.isFinite(Date.parse(state.cursor.at)))) throw fail("Invalid maintenance cursor.");
  for (const kind of ["jobs","changes"]) for (const field of ["examined","eligible","protected","estimatedBytes","changed"])
    if (!Number.isSafeInteger(state.progress?.[kind]?.[field]) || state.progress[kind][field]<0) throw fail("Invalid maintenance progress.");
}
async function createHistoryRun(store, { apply=false, now=Date.now() }={}) {
  if (!(store instanceof Store) || typeof apply!=="boolean" || !Number.isSafeInteger(now)) throw Error("Invalid history run"); schemaName(store.schema);
  const progress=()=>({examined:0,eligible:0,protected:0,estimatedBytes:0,changed:0});
  const current=await realm(store);
  return {version:1,schema:store.schema,apply,startedAt:new Date(now).toISOString(),cutoff:new Date(now-RETENTION_MS).toISOString(),realm:current,
    phase:"jobs",cursor:null,progress:{jobs:progress(),changes:progress()}};
}
async function historyBatch(store, checkpoint, { apply=false, limit=apply?100:1000, now=Date.now(), signal }={}) {
  if (!(store instanceof Store)) throw Error("Invalid history store"); const s=schemaName(store.schema);
  validateState(checkpoint,store,apply,now);
  if (!Number.isInteger(limit)||limit<1||limit>(apply?200:2000)) throw fail("Invalid maintenance batch size.");
  signal?.throwIfAborted(); if (checkpoint.phase==="done") return checkpoint;
  const state=structuredClone(checkpoint), client=await store.pool.connect();
  try {
    await client.query(apply?"BEGIN ISOLATION LEVEL SERIALIZABLE":"BEGIN READ ONLY");
    await client.query("SET LOCAL lock_timeout='250ms'; SET LOCAL statement_timeout='5s'");
    await requireIndexes(client,s);
    if (JSON.stringify(await realm(store,client))!==JSON.stringify(state.realm)) throw fail("The active realm changed; maintenance stopped.");
    const backlog=(await client.query(`SELECT count(*) AS total FROM (SELECT id FROM ${s}.work_jobs WHERE status IN ('pending','running') LIMIT 1001) AS active`)).rows[0];
    if (Number(backlog.total)>1000) throw fail("Active job backlog exceeds 1,000; maintenance stopped.");
    const phase=state.phase, progress=state.progress[phase], cursor=state.cursor;
    const values=[state.cutoff,limit,...(cursor?[cursor.at,cursor.id]:[])];
    let rows, eligible;
    if (phase==="jobs") {
      rows=(await client.query(`SELECT id,finished_at::text AS at,GREATEST(0,pg_column_size(event)-pg_column_size('{}'::jsonb))+COALESCE(pg_column_size(last_error_code),0) AS bytes
        FROM ${s}.work_jobs WHERE status='complete' AND finished_at<$1 AND (event<>'{}'::jsonb OR last_error_code IS NOT NULL)
        ${cursor?"AND (finished_at,id)>($3::timestamptz,$4::bigint)":""} ORDER BY finished_at,id LIMIT $2${apply?" FOR UPDATE":""}`,values)).rows;
      eligible=rows;
      if (apply && rows.length) await client.query(`UPDATE ${s}.work_jobs SET event='{}'::jsonb,last_error_code=NULL WHERE id=ANY($1::bigint[])`,[rows.map(row=>row.id)]);
    } else {
      rows=(await client.query(`SELECT id,dispatched_at::text AS at,COALESCE(pg_column_size(before_body),0)+COALESCE(pg_column_size(after_body),0) AS bytes
        FROM ${s}.changes WHERE dispatched_at<$1 AND created_at<$1
        ${cursor?"AND (dispatched_at,id)>($3::timestamptz,$4::bigint)":""} ORDER BY dispatched_at,id LIMIT $2${apply?" FOR UPDATE":""}`,values)).rows;
      const protectedIds=new Set(rows.length?(await client.query(`SELECT DISTINCT event->>'changeId' AS id FROM ${s}.work_jobs
        WHERE event ? 'changeId' AND event->>'changeId'=ANY($1::text[])
        AND (status<>'complete' OR finished_at IS NULL OR finished_at >= $2)`,[rows.map(row=>String(row.id)),state.cutoff])).rows.map(row=>row.id):[]);
      eligible=rows.filter(row=>!protectedIds.has(String(row.id)));
      if (apply && eligible.length) await client.query(`DELETE FROM ${s}.changes WHERE id=ANY($1::bigint[])`,[eligible.map(row=>row.id)]);
    }
    signal?.throwIfAborted();
    // Bound all bookkeeping before committing. Errors and cancelled operations
    // roll back the whole batch; no automatic retry hides a pressure signal.
    progress.examined+=rows.length;progress.eligible+=eligible.length;progress.protected+=rows.length-eligible.length;
    progress.estimatedBytes+=eligible.reduce((sum,row)=>sum+Number(row.bytes),0);if(apply)progress.changed+=eligible.length;
    if (rows.length) state.cursor={at:String(rows.at(-1).at),id:String(rows.at(-1).id)};
    if (rows.length<limit) {state.phase=phase==="jobs"?"changes":"done";state.cursor=null;}
    validateState(state,store,apply,now);
    await client.query("COMMIT");return state;
  } catch(error) {await client.query("ROLLBACK").catch(()=>{});throw error;}
  finally {client.release();}
}
module.exports={RETENTION_MS,prepareHistoryIndexes,createHistoryRun,historyBatch};
