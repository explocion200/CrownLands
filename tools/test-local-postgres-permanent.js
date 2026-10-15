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
async function child(directory,role){
 const config={version:1,role,schema:['auth','mail'].includes(role)?AUTH:GAME,origin:'https://playcrownlands.com',rateKey:Buffer.alloc(32,1).toString('base64url')};
 if(role==='game'||role==='worker')config.secrets={LINKED_ACCOUNT_IP_HMAC_KEY:'synthetic'.repeat(8)};
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
  assert.equal(active.standby,false);assert.equal(connected,1);
  if(active.server){const endpoint=role==='auth'?'/local-auth/health':role==='game'?'/api/local-game/health':'/invalid';
   const code=await new Promise((resolve,reject)=>{const req=require('node:http').request({host:'127.0.0.1',port:active.server.address().port,path:endpoint,headers:{Host:'playcrownlands.com','X-Crownlands-Client-IP':'203.0.113.2'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});assert.equal(code,role==='payments'?404:200);}
  if(active.loop){await pause(250);await active.loop.settle();const value=await active.loop.status();assert.equal(value.stopped??false,false);if(role==='worker')assert.equal(value.operationalFailures,0);else assert.equal(value.healthy,true);}
  await assert.rejects(active.store.pool.query('UPDATE crownlands_control.deployment SET phase=\'standby\''),e=>e.code==='42501');
  await assert.rejects(active.store.pool.query('CREATE TABLE '+config.schema+'.forbidden(id int)'),e=>e.code==='42501');
 }finally{await active.stop();}
}
async function main(){
 execFileSync('python3',[path.join(__dirname,'local-migration/test_permanent_operations.py')],{stdio:'inherit'});
 assert.throws(()=>validateControl({...control,extra:true}));assert.throws(()=>validateControl({...control,epoch:'bad'}));assert(!isPolicy({schema:GAME},GAME));
 for(const role of [...COMPONENTS,'payment-ingress','operations']){const s=unit(role);assert(s.includes('ProtectSystem=strict'));assert(s.includes('User=crownlands-'+role));assert(!s.includes('sudo'));}
 const source='(crownlands_routes) {\n\t\thandle /backup-healthz {\n\t\t}\n}';assert(caddy(source).includes('/api/payments/stripe/*'));assert.throws(()=>caddy(caddy(source)));
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
  const runtime=new Pool({host:directory,user:'crownlands-game',database:'crownlands_migration',options:'-c crownlands.runtime_epoch='+epoch});
  try{
   const policy=createPolicy({store:{schema:GAME,pool:runtime},epoch,read:()=>control});await assert.rejects(policy.assertActive());
   control.phase='active';await assert.rejects(policy.assertActive());
   await assert.rejects(runtime.query(`INSERT INTO ${GAME}.documents VALUES('fixture/blocked','fixture','','{}','')`),e=>e.code==='55000');
   await assert.rejects(pool.query("UPDATE crownlands_control.deployment SET phase='active'"),e=>e.code==='23514');
   await pool.query("UPDATE crownlands_control.deployment SET phase='active',snapshot_receipt=$1,firebase_fence_receipt=$1,activated_at=clock_timestamp()",['1'.repeat(64)]);await policy.assertActive();
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
  for(const r of schedules)await pool.query(`INSERT INTO ${GAME}.work_schedules(name,signature,last_minute) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[r.name,r.signature,Math.floor(Date.now()/60000)+10]);
  for(const role of COMPONENTS){execFileSync(process.execPath,[__filename,'--child',directory,role],{stdio:'inherit',timeout:25000,env:{...process.env,CROWNLANDS_BACKEND:''}});}
  console.log('Permanent services: private PostgreSQL cluster, empty-only schemas, runtime grants, standby without DB/provider IO, all six active startups, active receipts and concurrent authority fencing passed.');
 }finally{await pool?.end().catch(()=>{});if(started)run('pg_ctl',['-D',path.join(directory,'data'),'-m','immediate','-w','stop']);fs.rmSync(directory,{recursive:true,force:true});}
}
(process.argv[2]==='--child'?child(process.argv[3],process.argv[4]):main()).catch(e=>{console.error(e);process.exitCode=1;});
