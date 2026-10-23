"use strict";
// An independent PostgreSQL cluster with a private Unix socket. Never opens a
// TCP port or uses the machine's game database, real users or provider keys.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {Pool}=require('../local-backend/node_modules/pg');
const {COMPONENTS,GAME,AUTH,validateControl,createPolicy,isPolicy}=require('../local-backend/deployment-policy');
const {unit,caddy}=require('./local-migration/prepare_permanent_services');
const epoch='a'.repeat(32),control={version:1,phase:'standby',epoch};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function request(port,url,options={}) {
 return new Promise((resolve,reject)=>{const req=require('node:http').request({host:'127.0.0.1',port,path:url,method:options.method||'GET',
  headers:{Host:'playcrownlands.com',Origin:'https://playcrownlands.com','X-Crownlands-Client-IP':'203.0.113.2',...options.headers}},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  });req.on('error',reject);req.end(options.body);});
}
async function child(directory,role){
 const config={version:1,role,schema:['auth','mail'].includes(role)?AUTH:GAME,origin:'https://playcrownlands.com',rateKey:Buffer.alloc(32,1).toString('base64url')};
 if(role==='game'||role==='worker')config.secrets={LINKED_ACCOUNT_IP_HMAC_KEY:'synthetic'.repeat(8)};
 if(role==='game'||role==='worker')config.continuousWorld={protocol:1,enabled:false};
 if(role==='mail')config.apiKey='re_syntheticOnly123';
 if(role==='push')config.keys=require('../local-backend/node_modules/web-push').generateVAPIDKeys();
 if(role==='payments')for(const mode of ['test','live'])config[mode]={key:'sk_'+mode+'_syntheticOnly123',webhookSecret:'whsec_syntheticOnly123'};
 const folder=path.join(directory,role);fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'config'),JSON.stringify(config),{mode:0o600});
 const {start}=require('../local-backend/permanent-services');
 let connected=0;const options={credentials:folder,directory:folder,control:()=>control,ports:{auth:0,game:0,payments:0},connect:opts=>{connected++;return new Pool({...opts,host:directory,user:'crownlands-'+role});}};
 const standby=await start(role,options);assert(standby.standby);assert.equal(connected,0);assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'status.json'))).phase,'standby');await standby.stop();
 control.phase='active';
 const active=await start(role,options);
 try{
  assert.equal(active.standby,false);assert.equal(connected,['worker','game'].includes(role)?3:1);
  if(active.server){const endpoint=role==='auth'?'/local-auth/health':role==='game'?'/api/local-game/health':'/invalid';
   const result=await request(active.server.address().port,endpoint);assert.equal(result.status,role==='payments'?404:200);
   if(role!=='payments')assert.deepEqual(JSON.parse(result.body),{ready:true,rehearsal:false,protocol:1,epoch},'Preserve the publisher health identity contract');
   if(role==='game')assert.equal(result.headers['x-crownlands-capabilities'],'watch-revisions-v1');}
  if(role==='auth'){
   const port=active.server.address().port;
   for(const headers of [{},{'X-Crownlands-Deployment':'wrong'}])assert.equal((await request(port,'/local-auth/v1/session',{headers})).status,503);
   assert.equal((await request(port,'/local-auth/v1/session',{headers:{'X-Crownlands-Deployment':epoch}})).status,200);
   const page=await request(port,'/local-auth/action');assert(page.body.toString().includes(epoch));assert(page.body.toString().includes('Return to Crownlands'));assert(!page.body.toString().includes('Private account test'));
  }
  if(role==='game'){
   const listeners=await active.store.pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='crownlands-chat-events'");
   assert.equal(listeners.rows[0].count,1,'Chat uses one dedicated notification connection');
   assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'status.json'))).chatNotificationsConnected,true);
   const port=active.server.address().port;
   const archive=await request(port,'/api/season-rankings?season=realm-2026-09&board=players');
   assert.equal(archive.status,200);assert.match(archive.headers['cache-control'],/s-maxage=300/);
   assert.deepEqual(JSON.parse(archive.body).entries,[{rank:1,name:'Fixture ruler',score:123}]);
   assert(!archive.body.toString().includes('private-fixture'));
   assert.equal((await request(port,'/api/season-rankings?season=realm-2026-09&season=realm-2026-08')).status,400);
   assert.equal((await request(port,'/api/season-rankings?unknown=players')).status,400);
   assert.equal((await request(port,'/api/season-rankings',{method:'POST'})).status,405);
   control.phase='maintenance';assert.equal((await request(port,'/api/season-rankings')).status,503);control.phase='active';
   assert.equal((await request(port,'/api/local-game/v1/read',{method:'POST',body:'{}'})).status,503);
   const authFolder=path.join(directory,'auth'),authentication=await start('auth',{...options,credentials:authFolder,directory:authFolder,
    connect:opts=>new Pool({...opts,host:directory,user:'crownlands-auth'})});
   const jar=new Map();let client;
   try{
    const root={location:{origin:'https://playcrownlands.com',pathname:'/play/'},document:{hidden:false},
     CROWNLANDS_LOCAL_BACKEND:{mode:'production',protocol:1,ready:true,epoch},setTimeout,clearTimeout,setInterval,clearInterval,
     fetch:async(url,opts={})=>{const response=await request(url.startsWith('/local-auth/')?authentication.server.address().port:port,url,
      {...opts,headers:{...opts.headers,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}});
      for(const cookie of response.headers['set-cookie']||[]){const first=cookie.split(';')[0],index=first.indexOf('=');jar.set(first.slice(0,index),first.slice(index+1));}
      return new Response(response.body,{status:response.status,headers:response.headers});}};
    new Function('window',fs.readFileSync(path.join(__dirname,'../local-client.js'),'utf8'))(root);
    client=root.CrownlandsLocalBackend.create();
    const signed=await client.auth.signInWithEmailAndPassword(null,'permanent@example.test','Synthetic password 2026');assert.equal(signed.user.uid,'permanent-fixture');
    assert.deepEqual(await client.world.read('catalog'),{enabled:false,protocol:1});
    const f=client.firestore,db=f.getFirestore(),profile=f.doc(db,'players','permanent-fixture');
    assert.equal((await f.getDoc(profile)).data().marchPercent,70);
    await f.updateDoc(profile,{marchPercent:65});assert.equal((await f.getDoc(profile)).data().marchPercent,65);
    await assert.rejects(f.updateDoc(profile,{gold:999999}),{code:'permission-denied'});
    await assert.rejects(f.getDoc(f.doc(db,'players','someone-else')),{code:'permission-denied'});
    control.phase='maintenance';await assert.rejects(f.updateDoc(profile,{marchPercent:80}),{code:'unavailable'});control.phase='active';
    assert.equal((await f.getDoc(profile)).data().marchPercent,65);
    await client.auth.signOut();await assert.rejects(f.getDoc(profile),{code:'unauthenticated'});
   }finally{client?.dispose();await authentication.stop();}
  }
  if(active.loop){await pause(250);await active.loop.settle();const value=await active.loop.status();assert.equal(value.stopped??false,false);if(role==='worker')assert.equal(value.operationalFailures,0);else assert.equal(value.healthy,true);}
  if(role==='worker'){
   // Slow game transactions can occupy every worker connection. Its status
   // query must still reach PostgreSQL without timing out and stopping jobs.
   const held=[];
   try{
    for(let i=0;i<active.store.pool.options.max;i++)held.push(await active.store.pool.connect());
    await assert.doesNotReject(active.loop.status(),'Worker status must survive a saturated game pool');
    await pause(6000);
    const report=JSON.parse(fs.readFileSync(path.join(folder,'status.json')));
    assert(Date.now()-Date.parse(report.recordedAt)<3000,'Periodic status must remain fresh while game connections are busy');
    assert.equal(active.loop.stopped,false);
    assert.equal(active.loop.failures,0,'Authority and queue checks must also remain responsive');
    assert.equal(active.loop.queue.controlStore.pool.options.max,3);
    assert.equal(active.store.pool.options.max,12);
   }finally{for(const client of held)client.release();}
  }
  await assert.rejects(active.store.pool.query('UPDATE crownlands_control.deployment SET phase=\'standby\''),e=>e.code==='42501');
  await assert.rejects(active.store.pool.query('CREATE TABLE '+config.schema+'.forbidden(id int)'),e=>e.code==='42501');
 }finally{await active.stop();}
}
async function main(){
 execFileSync('python3',[path.join(__dirname,'local-migration/test_permanent_operations.py')],{stdio:'inherit'});
 assert.throws(()=>validateControl({...control,extra:true}));assert.throws(()=>validateControl({...control,epoch:'bad'}));assert(!isPolicy({schema:GAME},GAME));
 for(const role of [...COMPONENTS,'payment-ingress','operations']){const s=unit(role);assert(s.includes('ProtectSystem=strict'));assert(s.includes('User=crownlands-'+role));assert(!s.includes('sudo'));}
 const source='(crownlands_routes) {\n\t\thandle /backup-healthz {\n\t\t}\n}';assert(caddy(source).includes('/api/payments/stripe/*'));assert.throws(()=>caddy(caddy(source)));
 const routeFixture='(crownlands_routes) {\n\troute {\n'+['/local-auth/*','/api/local-game/*','@rankings'].map((name,i)=>`\t\thandle ${name} {\n\t\t\treverse_proxy ${i===2?'https://us-central1-crown-land-b15e0.cloudfunctions.net':'127.0.0.1:'+ (9190+i)}\n\t\t}\n`).join('')+'\t\thandle /api/payments/stripe/* {\n\t\t\treverse_proxy 127.0.0.1:9294\n\t\t}\n\t\troot * /srv/crownlands/current/game\n\t}\n}';
 const cutover=require('./local-migration/prepare_cutover_routes').prepare(routeFixture);
 assert(!cutover.active.includes('cloudfunctions.net'));assert(!cutover.active.includes(':9190'));assert(!cutover.active.includes(':9191'));
 assert(cutover.active.includes(':9294'));assert(cutover.active.includes('header_up X-Crownlands-Client-IP {remote_host}'));
 assert(cutover.maintenance.includes('503'));assert(cutover.maintenance.includes('Cache-Control "no-store"'));
 assert.throws(()=>require('./local-migration/prepare_cutover_routes').prepare(cutover.active));
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cl-permanent-'));const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();let started=false,pool;
 const run=(name,args)=>execFileSync(path.join(bin,name),args,{stdio:'pipe',timeout:30000});
 try{
  run('initdb',['-D',path.join(directory,'data'),'-U','postgres','--auth-local=trust','--auth-host=reject','--no-instructions']);
  run('pg_ctl',['-D',path.join(directory,'data'),'-l',path.join(directory,'log'),'-o',"-h '' -k "+directory,'-w','start']);started=true;
  let admin=new Pool({host:directory,user:'postgres',database:'postgres'});await admin.query('CREATE DATABASE crownlands_migration');await admin.end();
  pool=new Pool({host:directory,user:'postgres',database:'crownlands_migration'});
  for(const role of COMPONENTS)await pool.query('CREATE ROLE "crownlands-'+role+'" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION');
  // initialize closes its injected pool, matching production CLI lifecycle.
  await require('./local-migration/initialize_permanent_schema').initialize({pool,control:()=>control});
  pool=new Pool({host:directory,user:'postgres',database:'crownlands_migration'});
  // Rehearse the original empty cutover before applying the later compact-counter
  // migration. This cluster is disposable; the live game database is never used.
  await pool.query(`DROP TRIGGER maintain_job_totals ON ${GAME}.work_jobs; DROP TABLE ${GAME}.work_job_totals`);
  const maintenanceSql=options=>execFileSync('python3',['-c',
   'import sys; sys.path.insert(0,sys.argv[1]); import transfer_maintenance as t; print(t.database_sql(sys.argv[2],empty=sys.argv[3]=="yes",maintenance=sys.argv[4]=="yes"))',
   path.join(__dirname,'local-migration'),epoch,options.empty?'yes':'no',options.maintenance?'yes':'no'],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  const gateConnection=await pool.connect();
  try{
   await gateConnection.query(maintenanceSql({empty:true,maintenance:true}));
   assert.equal((await pool.query('SELECT phase FROM crownlands_control.deployment')).rows[0].phase,'maintenance');
   await pool.query(`INSERT INTO ${GAME}.documents VALUES('fixture/preserved','fixture','','{}','')`);
   await assert.rejects(gateConnection.query(maintenanceSql({empty:true,maintenance:true})),e=>e.code==='P0001');await gateConnection.query('ROLLBACK');
   assert.equal((await pool.query(`SELECT count(*) FROM ${GAME}.documents`)).rows[0].count,'1');
   await gateConnection.query(maintenanceSql({})); // Refresh after a reviewed import remains allowed.
   await pool.query(`DELETE FROM ${GAME}.documents; UPDATE crownlands_control.deployment SET phase='standby'`);
  }finally{gateConnection.release();}
  // Exercise the final copier against the same isolated permanent schemas.
  // No source API, private credential or running game database is involved.
  const stage='migration_final_0123456789ab',preserved=stage+'_before_restore';
  const manifest={expectedDocuments:2,authAccounts:1,readTime:'2026-10-15T00:00:00Z',manifestSha256:'3'.repeat(64)};
  const finalSql=options=>execFileSync('python3',['-c',
   'import sys,json;sys.path.insert(0,sys.argv[1]);import import_final_schema as f;print(f.import_sql(sys.argv[2],sys.argv[3],json.loads(sys.argv[4]),sys.argv[5]))',
   path.join(__dirname,'local-migration'),epoch,stage,JSON.stringify(options||manifest),'4'.repeat(64)],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  await pool.query(`CREATE SCHEMA ${stage};CREATE TABLE ${stage}.documents AS TABLE ${GAME}.documents WITH NO DATA;
   CREATE TABLE ${stage}.accounts AS TABLE ${AUTH}.accounts WITH NO DATA;CREATE TABLE ${stage}.receipt(body jsonb);
   UPDATE crownlands_control.deployment SET phase='maintenance'`);
  const realm={worldId:'main-realm-2026-10',resetGeneration:'realm-2026-10',sharedRealmId:'shard_0001'};
  const fields=Object.fromEntries(Object.entries(realm).map(([k,v])=>[k,{stringValue:v}]));
  await pool.query(`INSERT INTO ${stage}.documents VALUES($1,'realmConfig','',$2,$3),($4,'children','parents/missing',$5,$6)`,
   ['realmConfig/current',{fields},'5'.repeat(64),'parents/missing/children/fixture',{fields:{large:{integerValue:'9223372036854775807'},bytes:{bytesValue:'AAH/'},stamp:{timestampValue:'2026-10-15T00:00:00.123456789Z'}}},'6'.repeat(64)]);
  await pool.query(`INSERT INTO ${stage}.accounts VALUES('copied-fixture',$1)`,[{localId:'copied-fixture',passwordHash:'unchanged-synthetic',salt:'unchanged',providerUserInfo:[{providerId:'google.com',rawId:'synthetic-subject'}]}]);
  await pool.query(`INSERT INTO ${stage}.receipt VALUES($1)`,[{sourceProject:'crown-land-b15e0',readTime:manifest.readTime,snapshotManifestSha256:manifest.manifestSha256,documents:2,accounts:1,realm}]);
  await pool.query(`CREATE SCHEMA ${preserved};CREATE TABLE ${preserved}.documents AS TABLE ${stage}.documents;
   CREATE TABLE ${preserved}.accounts AS TABLE ${stage}.accounts;CREATE TABLE ${preserved}.receipt AS TABLE ${stage}.receipt`);
  const copyConnection=await pool.connect();
  try{
   await pool.query(`UPDATE ${stage}.accounts SET body=body||'{"changed":true}'::jsonb`);
   await assert.rejects(copyConnection.query(finalSql()),/Independent staging restore differs/);await copyConnection.query('ROLLBACK');
   assert.equal((await pool.query(`SELECT count(*) FROM ${AUTH}.accounts`)).rows[0].count,'0');
   await pool.query(`UPDATE ${stage}.accounts SET body=body-'changed'`);
   await assert.rejects(copyConnection.query(finalSql({...manifest,manifestSha256:'0'.repeat(64)})),/snapshot and staging differ/);await copyConnection.query('ROLLBACK');
   await pool.query(`INSERT INTO ${GAME}.documents VALUES('fixture/occupied','fixture','','{}','')`);
   await assert.rejects(copyConnection.query(finalSql()),/Existing permanent data preserved/);await copyConnection.query('ROLLBACK');
   assert.equal((await pool.query(`SELECT count(*) FROM ${GAME}.documents`)).rows[0].count,'1');
   await pool.query(`DELETE FROM ${GAME}.documents`);
   await copyConnection.query(finalSql());
   assert.equal((await pool.query(`SELECT count(*) FROM ${GAME}.documents`)).rows[0].count,'2');
   assert.equal((await pool.query(`SELECT count(*) FROM ${AUTH}.accounts`)).rows[0].count,'1');
   assert.equal((await pool.query(`SELECT count(*) FROM ${GAME}.changes`)).rows[0].count,'0');
   assert.equal((await pool.query(`SELECT count(*) FROM ${GAME}.work_jobs`)).rows[0].count,'0');
   assert.equal((await pool.query(`SELECT count(*) FROM ${GAME}.work_schedules`)).rows[0].count,'0');
   const fence=(await pool.query('SELECT * FROM crownlands_control.deployment')).rows[0];
   assert.equal(fence.phase,'maintenance');assert.equal(fence.snapshot_receipt,'4'.repeat(64));assert.equal(fence.firebase_fence_receipt,null);assert.equal(fence.activated_at,null);
   await assert.rejects(copyConnection.query(finalSql()),/Empty initial targets required/);await copyConnection.query('ROLLBACK');
  }finally{copyConnection.release();}
  // Complete the guarded administrative handover in this disposable cluster.
  // The root activation file and every production database remain untouched.
  const handover=require('./local-migration/prepare_live_handover');
  const ingressPath='realmSecurity/global/configuration/ipIngress';
  const ingressBody={name:'projects/crown-land-b15e0/databases/(default)/documents/'+ingressPath,
   fields:{enabled:{booleanValue:true},verified:{booleanValue:false},suffixLength:{integerValue:'2'},preserve:{stringValue:'original'}},
   createTime:'2026-10-15T00:00:00Z',updateTime:'2026-10-15T00:00:00Z'};
  await pool.query(`INSERT INTO ${GAME}.documents VALUES($1,'configuration','realmSecurity/global',$2,'fixture')`,[ingressPath,ingressBody]);
  const handoverInput={epoch,verificationSha256:'4'.repeat(64),sourceFenceSha256:'7'.repeat(64),documents:3,accounts:1,
   schedulers:Array.from({length:16},(_,i)=>({name:'scheduled'+String(i).padStart(2,'0'),signature:'8'.repeat(64),lastMinute:12345}))};
  await assert.rejects(handover.prepare(pool,{...handoverInput,verificationSha256:'9'.repeat(64)}),/maintenance target required/);
  assert.equal((await pool.query(`SELECT count(*) FROM ${GAME}.work_schedules`)).rows[0].count,'0');
  const prepared=await handover.prepare(pool,handoverInput);assert.equal(prepared.ingressAdjusted,true);assert.equal(prepared.authorityActivated,false);
  const adjusted=(await pool.query(`SELECT body FROM ${GAME}.documents WHERE path=$1`,[ingressPath])).rows[0].body;
  assert.equal(adjusted.fields.verified.booleanValue,true);assert.equal(adjusted.fields.suffixLength.integerValue,'1');assert.equal(adjusted.fields.preserve.stringValue,'original');
  assert.equal((await pool.query(`SELECT path FROM ${GAME}.changes`)).rows[0].path,ingressPath);
  await assert.rejects(handover.prepare(pool,handoverInput),/Prior preparation/);
  await pool.query(`UPDATE ${GAME}.work_schedules SET last_minute=12346 WHERE name='scheduled00'`);
  await assert.rejects(handover.activate(pool,handoverInput,prepared),/cursor changed/);
  assert.equal((await pool.query('SELECT phase FROM crownlands_control.deployment')).rows[0].phase,'maintenance');
  await pool.query(`UPDATE ${GAME}.work_schedules SET last_minute=12345 WHERE name='scheduled00'`);
  const activated=await handover.activate(pool,handoverInput,prepared);assert.equal(activated.phase,'active');assert(activated.activated_at);
  assert.equal((await pool.query('SELECT firebase_fence_receipt FROM crownlands_control.deployment')).rows[0].firebase_fence_receipt,handoverInput.sourceFenceSha256);
  await assert.rejects(handover.activate(pool,handoverInput,prepared),/maintenance target required/);
  // Remove only this test's synthetic fixtures, before testing active services.
  await pool.query(`DROP SCHEMA ${stage} CASCADE;DROP SCHEMA ${preserved} CASCADE;DELETE FROM ${GAME}.documents;DELETE FROM ${AUTH}.accounts;
   DELETE FROM ${GAME}.changes;DELETE FROM ${GAME}.work_schedules;
   UPDATE crownlands_control.deployment SET phase='standby',snapshot_receipt=NULL,firebase_fence_receipt=NULL,activated_at=NULL`);
  const runtime=new Pool({host:directory,user:'crownlands-game',database:'crownlands_migration',options:'-c crownlands.runtime_epoch='+epoch});
  try{
   const policy=createPolicy({store:{schema:GAME,pool:runtime},epoch,read:()=>control});await assert.rejects(policy.assertActive());
   control.phase='active';await assert.rejects(policy.assertActive());
   await assert.rejects(runtime.query(`INSERT INTO ${GAME}.documents VALUES('fixture/blocked','fixture','','{}','')`),e=>e.code==='55000');
   await assert.rejects(pool.query("UPDATE crownlands_control.deployment SET phase='active'"),e=>e.code==='23514');
   await pool.query("UPDATE crownlands_control.deployment SET phase='active',snapshot_receipt=$1,firebase_fence_receipt=$1,activated_at=clock_timestamp()",['1'.repeat(64)]);await policy.assertActive();
   const retired=await pool.connect();try{
    await assert.rejects(retired.query(maintenanceSql({maintenance:true})),e=>e.code==='P0001');await retired.query('ROLLBACK');
   }finally{retired.release();}
   const tx=await runtime.connect();await tx.query('BEGIN');await tx.query(`INSERT INTO ${GAME}.documents VALUES('fixture/committed','fixture','','{}','')`);
   let fenced=false;const fence=pool.query("UPDATE crownlands_control.deployment SET phase='maintenance'").then(()=>{fenced=true;});await pause(50);assert.equal(fenced,false);await tx.query('COMMIT');tx.release();await fence;
   await assert.rejects(runtime.query(`DELETE FROM ${GAME}.documents`),e=>e.code==='55000');
   await pool.query(`DELETE FROM ${GAME}.documents`);await pool.query("UPDATE crownlands_control.deployment SET phase='active'");
  }finally{await runtime.end();}
  // Worker fixture must be tested without real game schedules or external IO:
  // current-minute schedule rows stop startup from enqueueing historical work.
  process.env.CROWNLANDS_BACKEND='postgres-rehearsal';process.env.CROWNLANDS_REHEARSAL_SCHEMA=GAME;
  const routes=require('../local-backend/platform').describe(require('../functions'));
  const fixtureStore=new (require('../local-backend/store').Store)({schema:GAME,pool});const schedules=new (require('../local-backend/jobs').JobQueue)({store:fixtureStore,routes}).schedules;
  const migration=await pool.connect();
  try{
   await migration.query('BEGIN');
   await require('../local-backend/job-status').initializeJobStatus(migration,GAME);
   await migration.query(`GRANT SELECT,UPDATE(total) ON ${GAME}.work_job_totals TO "crownlands-worker";
    GRANT EXECUTE ON FUNCTION ${GAME}.update_job_totals() TO "crownlands-worker";
    CREATE TRIGGER runtime_write_fence BEFORE INSERT OR UPDATE OR DELETE ON ${GAME}.work_job_totals
    FOR EACH STATEMENT EXECUTE FUNCTION crownlands_control.fence_writes()`);
   await migration.query('COMMIT');
  }catch(error){await migration.query('ROLLBACK');throw error;}finally{migration.release();}
  const account={localId:'permanent-fixture',email:'permanent@example.test',emailVerified:true,
   providerUserInfo:[{providerId:'password',email:'permanent@example.test'}],localPassword:await require('../local-backend/passwords').createLocalPassword('Synthetic password 2026')};
  await pool.query(`INSERT INTO ${AUTH}.accounts(uid,body) VALUES($1,$2)`,[account.localId,account]);
  const scope={resetGeneration:'realm-2026-10',worldId:'main-realm-2026-10',realmShardId:'shard_0001'};
  await fixtureStore.doc('realmConfig/current').set(scope);await fixtureStore.doc('players/'+account.localId).set({...scope,uid:account.localId,marchPercent:70});
  await fixtureStore.doc('seasonResults/realm-2026-09').set({seasonId:'realm-2026-09',status:'ready'});
  await fixtureStore.doc('seasonResults/realm-2026-09/boards/players').set({entries:[{rank:1,playerName:'Fixture ruler',kingPower:123,uid:'private-fixture'}]});
  for(const r of schedules)await pool.query(`INSERT INTO ${GAME}.work_schedules(name,signature,last_minute) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[r.name,r.signature,Math.floor(Date.now()/60000)+10]);
  for(const role of COMPONENTS){execFileSync(process.execPath,[__filename,'--child',directory,role],{stdio:'inherit',timeout:25000,env:{...process.env,CROWNLANDS_BACKEND:''}});}
  console.log('Permanent services: private PostgreSQL cluster, restricted roles, standby, all six active startups, real production browser password sign-in/read/save/logout, denied cross-player/economy writes, epoch/maintenance and concurrent authority fencing passed.');
 }finally{await pool?.end().catch(()=>{});if(started)run('pg_ctl',['-D',path.join(directory,'data'),'-m','immediate','-w','stop']);fs.rmSync(directory,{recursive:true,force:true});}
}
(process.argv[2]==='--child'?child(process.argv[3],process.argv[4]):main()).catch(e=>{process.stderr.write(String(e.stack||e)+'\n');process.exitCode=1;});
