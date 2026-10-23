"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {Store}=require("../local-backend/store"),{JobQueue}=require("../local-backend/jobs");
const {RETENTION_MS,createHistoryRun,historyBatch,prepareHistoryIndexes}=require("../local-backend/history-retention");
const {main}=require("./maintain-internal-history");
(async()=>{
  const db=new Store({schema:"migration_game_history_"+crypto.randomBytes(5).toString("hex")}),s=db.schema;
  const now=Date.now(),old=new Date(now-RETENTION_MS-86400000).toISOString(),cutoff=new Date(now-RETENTION_MS).toISOString();
  const scope={resetGeneration:"realm-2026-10",worldId:"main-realm-2026-10",sharedRealmId:"shard_0001",resetReadinessStatus:"ready"};
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"history-fixture-"));
  const dump=async()=>({documents:(await db.pool.query(`SELECT * FROM ${s}.documents ORDER BY path`)).rows,
    jobs:(await db.pool.query(`SELECT * FROM ${s}.work_jobs ORDER BY id`)).rows,changes:(await db.pool.query(`SELECT * FROM ${s}.changes ORDER BY id`)).rows});
  try {
    await db.initialize();await db.doc("realmConfig/current").set(scope);
    const queue=new JobQueue({store:db,routes:[]});await queue.initialize();
    for(const address of ["players/owner","players/owner/serverReports/report","players/owner/estateReceipts/reward","realmEvents/archive/activity/event","realmGenerations/archive/assignments/player"])
      await db.doc(address).set({privateSentinel:address,preserved:true});
    const insertChange=async({created=old,dispatched=old}={})=>(await db.pool.query(`INSERT INTO ${s}.changes(path,before_body,after_body,created_at,dispatched_at)
      VALUES('fixture/record',$1,$2,$3,$4) RETURNING id`,[{fields:{value:{stringValue:"debug-before".repeat(100)}}},{fields:{value:{stringValue:"debug-after".repeat(100)}}},created,dispatched])).rows[0].id;
    const ids={};ids.undispatched=await insertChange({dispatched:null});
    for(const status of ["pending","running","dead","recent","unfinished","old"]){
      ids[status]=await insertChange();
      await db.pool.query(`INSERT INTO ${s}.work_jobs(job_key,handler,kind,event,status,finished_at,last_error_code)
        VALUES($1,'Fixture','written',$2,$3,$4,'fixture-error')`,[status,{changeId:ids[status],params:{private:"debug".repeat(100)}},["recent","unfinished","old"].includes(status)?"complete":status,
        status==="unfinished"?null:status==="recent"?new Date(now).toISOString():old]);
    }
    ids.plain=await insertChange();ids.boundary=await insertChange({dispatched:cutoff});
    ids.newDispatch=await insertChange({dispatched:new Date(now).toISOString()});
    ids.newCreate=await insertChange({created:new Date(now).toISOString()});
    // Node Date truncates microseconds. Checkpoints must retain PostgreSQL's
    // original precision or a small dry-run batch repeats the same rows forever.
    ids.microA=await insertChange({dispatched:old.replace(/\.\d{3}Z$/,'.000123Z')});
    ids.microB=await insertChange({dispatched:old.replace(/\.\d{3}Z$/,'.000124Z')});
    const original=await dump();
    let estimate=await createHistoryRun(db,{now});let batches=0;
    while(estimate.phase!=="done"){estimate=await historyBatch(db,estimate,{limit:1,now});assert(++batches<30);}
    assert.equal(estimate.progress.jobs.eligible,1);assert.equal(estimate.progress.changes.eligible,4);assert.equal(estimate.progress.changes.protected,5);
    assert(estimate.progress.changes.estimatedBytes>0);assert.deepEqual(await dump(),original,"Dry run modified game data/history");
    await assert.rejects(historyBatch(db,estimate,{apply:true,now}),/checkpoint/);
    await assert.rejects(historyBatch(db,{...estimate,cutoff:new Date(now).toISOString()},{now}),/checkpoint/);
    await assert.rejects(main(["--schema",s,"--apply"]),/confirm-schema/);
    const result=await main(["--schema",s,"--checkpoint",path.join(temp,"dry.json")]);assert(!result.apply);assert.equal(result.phase,"done");
    assert.deepEqual(await dump(),original,"Default CLI performed cleanup");
    let apply=await createHistoryRun(db,{apply:true,now});
    const lock=await db.pool.connect();await lock.query("BEGIN");await lock.query(`SELECT id FROM ${s}.work_jobs WHERE job_key='old' FOR UPDATE`);
    await assert.rejects(historyBatch(db,apply,{apply:true,now}),error=>error.code==="55P03");
    await lock.query("ROLLBACK");lock.release();assert.deepEqual(await dump(),original,"Lock timeout partially committed a batch");
    const duringWrite=new AbortController(),connect=db.pool.connect;
    db.pool.connect=async function(){
      const client=await connect.call(this),query=client.query,release=client.release;
      client.query=function(...args){const result=query.apply(this,args);if(String(args[0]).startsWith(`UPDATE ${s}.work_jobs SET event=`))return result.then(value=>{duringWrite.abort();return value;});return result;};
      client.release=function(...args){client.query=query;client.release=release;return release.apply(this,args);};return client;
    };
    try {await assert.rejects(historyBatch(db,apply,{apply:true,now,signal:duringWrite.signal}),{name:"AbortError"});}
    finally {db.pool.connect=connect;}
    assert.deepEqual(await dump(),original,"Cancellation after SQL mutation did not roll back");
    apply=await historyBatch(db,apply,{apply:true,limit:1,now});
    fs.writeFileSync(path.join(temp,"apply.json"),JSON.stringify(apply));
    apply=JSON.parse(fs.readFileSync(path.join(temp,"apply.json"),"utf8"));
    const cancelled=new AbortController();cancelled.abort();await assert.rejects(historyBatch(db,apply,{apply:true,now,signal:cancelled.signal}),{name:"AbortError"});
    while(apply.phase!=="done")apply=await historyBatch(db,apply,{apply:true,limit:1,now});
    assert.equal(apply.progress.jobs.changed,1);assert.equal(apply.progress.changes.changed,4);
    const after=await dump();assert.deepEqual(after.documents,original.documents,"Primary/account/report/reward/gameplay/archive records changed");
    for(const name of ["undispatched","pending","running","dead","recent","unfinished","boundary","newDispatch","newCreate"])
      assert(after.changes.some(row=>row.id===ids[name]),"Protected change deleted: "+name);
    for(const name of ["old","plain","microA","microB"])assert(!after.changes.some(row=>row.id===ids[name]));
    const oldJob=after.jobs.find(job=>job.job_key==="old");assert.deepEqual(oldJob.event,{});assert.equal(oldJob.last_error_code,null);
    for(const job of after.jobs){const before=original.jobs.find(row=>row.id===job.id);for(const key of ["id","job_key","handler","kind","status","attempts","finished_at"])assert.deepEqual(job[key],before[key]);}
    const duplicate=await db.pool.query(`INSERT INTO ${s}.work_jobs(job_key,handler,kind,event) VALUES('old','Fixture','written','{}') ON CONFLICT(job_key) DO NOTHING`);assert.equal(duplicate.rowCount,0);
    const current=await createHistoryRun(db,{now});await db.doc("realmConfig/current").update({resetGeneration:"realm-2026-11"});
    await assert.rejects(historyBatch(db,current,{now}),/realm changed/);await db.doc("realmConfig/current").set(scope);
    await db.pool.query(`INSERT INTO ${s}.work_jobs(job_key,handler,kind,event) SELECT 'backlog:'||n,'Fixture','schedule','{}' FROM generate_series(1,1001) n`);
    await assert.rejects(historyBatch(db,await createHistoryRun(db,{now}),{now}),/backlog/);
    await db.pool.query(`DELETE FROM ${s}.work_jobs WHERE job_key LIKE 'backlog:%'`);
    await db.pool.query(`DROP INDEX ${s}.history_job_sources`);
    await assert.rejects(historyBatch(db,await createHistoryRun(db,{now}),{now}),/indexes/);
    await prepareHistoryIndexes(db.pool,s);
    console.log("Internal history: default dry-run, precise/resumable boundaries, active/dead/source protection, immutable primary/archive records, compact dedupe identities, retry safety, lock/backlog/realm/index/abort stops and bounded batches passed.");
  } finally {await db.pool.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);await db.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
