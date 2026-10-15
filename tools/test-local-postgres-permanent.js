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
   const result=await request(active.server.address().port,endpoint);assert.equal(result.status,role==='payments'?404:200);
   if(role!=='payments')assert.deepEqual(JSON.parse(result.body),{ready:true,rehearsal:false,protocol:1,epoch});}
  if(role==='auth'){
   const port=active.server.address().port;
   for(const headers of [{},{'X-Crownlands-Deployment':'wrong'}])assert.equal((await request(port,'/local-auth/v1/session',{headers})).status,503);
   assert.equal((await request(port,'/local-auth/v1/session',{headers:{'X-Crownlands-Deployment':epoch}})).status,200);
   const page=await request(port,'/local-auth/action');assert(page.body.toString().includes(epoch));assert(page.body.toString().includes('Return to Crownlands'));assert(!page.body.toString().includes('Private account test'));
  }
  if(role==='game'){
   const port=active.server.address().port;
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
  const account={localId:'permanent-fixture',email:'permanent@example.test',emailVerified:true,
   providerUserInfo:[{providerId:'password',email:'permanent@example.test'}],localPassword:await require('../local-backend/passwords').createLocalPassword('Synthetic password 2026')};
  await pool.query(`INSERT INTO ${AUTH}.accounts(uid,body) VALUES($1,$2)`,[account.localId,account]);
  const scope={resetGeneration:'realm-2026-10',worldId:'main-realm-2026-10',realmShardId:'shard_0001'};
  await fixtureStore.doc('realmConfig/current').set(scope);await fixtureStore.doc('players/'+account.localId).set({...scope,uid:account.localId,marchPercent:70});
  for(const r of schedules)await pool.query(`INSERT INTO ${GAME}.work_schedules(name,signature,last_minute) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[r.name,r.signature,Math.floor(Date.now()/60000)+10]);
  for(const role of COMPONENTS){execFileSync(process.execPath,[__filename,'--child',directory,role],{stdio:'inherit',timeout:25000,env:{...process.env,CROWNLANDS_BACKEND:''}});}
  console.log('Permanent services: private PostgreSQL cluster, restricted roles, standby, all six active startups, real production browser password sign-in/read/save/logout, denied cross-player/economy writes, epoch/maintenance and concurrent authority fencing passed.');
 }finally{await pool?.end().catch(()=>{});if(started)run('pg_ctl',['-D',path.join(directory,'data'),'-m','immediate','-w','stop']);fs.rmSync(directory,{recursive:true,force:true});}
}
(process.argv[2]==='--child'?child(process.argv[3],process.argv[4]):main()).catch(e=>{console.error(e);process.exitCode=1;});
