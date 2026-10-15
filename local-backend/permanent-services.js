"use strict";
const fs=require('node:fs'),path=require('node:path');
const {Pool}=require('pg');const {Store}=require('./store');
const {COMPONENTS,GAME,AUTH,readControl,privateJson,createPolicy}=require('./deployment-policy');
const {AuthService}=require('./auth');
const {WorkerDiagnostics}=require('./worker-diagnostics');
const PORTS={auth:9290,game:9291,payments:9293};
function validateConfig(c,role){if(!COMPONENTS.includes(role)||!c||c.version!==1||c.role!==role||c.origin!=='https://playcrownlands.com'
  ||c.schema!==(['auth','mail'].includes(role)?AUTH:GAME))throw Error('Invalid permanent service configuration');return c;}
function writeStatus(directory,value){const file=path.join(directory,'status.json');fs.writeFileSync(file+'.next',JSON.stringify(value),{mode:0o600});fs.renameSync(file+'.next',file);}
async function start(role,{credentials=process.env.CREDENTIALS_DIRECTORY,directory=process.env.STATE_DIRECTORY,control=readControl,connect=options=>new Pool(options),ports=PORTS}={}) {
  if(!credentials||!directory)throw Error('System credentials and state required');
  const config=validateConfig(privateJson(path.join(credentials,'config')),role),initial=require('./deployment-policy').validateControl(control());
  let pool,store,loop,server,timer,stopping=false;const diagnostics=new WorkerDiagnostics();
  const report=async()=>{const c=require('./deployment-policy').validateControl(control());if(c.phase!==initial.phase||c.epoch!==initial.epoch){await stop();return;}
    let status={healthy:true};if(loop)status=await loop.status();
    if(pool)await pool.query('SELECT 1');
    writeStatus(directory,{...status,component:role,phase:initial.phase,recordedAt:new Date().toISOString(),...(role==='worker'?{handlerLogs:diagnostics.snapshot()}:{})});
    if(!stopping)timer=setTimeout(()=>report().catch(()=>{process.exitCode=1;void stop();}),5000);};
  const stop=async()=>{if(stopping)return;stopping=true;clearTimeout(timer);loop?.stop();
    setTimeout(()=>process.exit(1),20000).unref();
    if(server)await new Promise(resolve=>server.close(resolve));await loop?.settle();await pool?.end();};
  process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
  if(initial.phase!=='active'){await report();return {stop,standby:true};}
  pool=connect({host:'/var/run/postgresql',database:'crownlands_migration',max:role==='game'?12:role==='auth'?6:3,
    application_name:'crownlands-'+role,connectionTimeoutMillis:5000,statement_timeout:30000,idle_in_transaction_session_timeout:35000,
    options:'-c crownlands.runtime_epoch='+initial.epoch});
  pool.on('error',()=>{process.exitCode=1;void stop();});
  store=new Store({schema:config.schema,pool});const policy=createPolicy({store,epoch:initial.epoch,read:control});
  await policy.assertActive();
  const privilege=(await pool.query(`SELECT current_user AS name,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,has_schema_privilege(current_user,$1,'CREATE') AS creates FROM pg_roles r WHERE rolname=current_user`,[store.schema])).rows[0];
  if(!privilege||privilege.name!=='crownlands-'+role||Object.entries(privilege).some(([k,v])=>k!=='name'&&v!==false))throw Error('Restricted runtime identity required');
  if(role==='auth'||role==='game') {
    const authStore=role==='auth'?store:new Store({schema:AUTH,pool});
    const auth=new AuthService({store:authStore,origin:config.origin,rateKey:Buffer.from(config.rateKey,'base64url'),hashConfig:config.hashConfig,google:config.google,allowRegistration:role==='auth'});
    if(role==='auth'){
      await auth.initialize({createTables:false});
      server=require('./auth-http').createAuthServer({auth,trustLoopbackProxy:true,beforeRoute:async()=>{await policy.assertActive();return false;}});
    }else{
      process.env.CROWNLANDS_BACKEND='postgres-local';require('./permanent-platform').configure({store,config,deployment:policy});
      const game=require('../functions');server=require('./game-http').createGameServer({store,auth,routes:require('./platform').describe(game),deployment:policy});
    }
  }else if(role==='worker'){
    diagnostics.capture();process.env.CROWNLANDS_BACKEND='postgres-local';require('./permanent-platform').configure({store,config,deployment:policy});
    const routes=require('./platform').describe(require('../functions'));
    const {JobQueue}=require('./jobs'),{WorkerLoop,privateWorkerRoutes}=require('./worker-loop');
    const queue=new JobQueue({store,routes:privateWorkerRoutes(routes),maxActive:2});loop=new WorkerLoop({queue,deployment:policy});
  }else if(role==='mail'){
    const {ResendRehearsalSender}=require('./auth-mail');
    const sender=new ResendRehearsalSender({apiKey:config.apiKey,deployment:policy});
    loop=new (require('./auth-mail-loop').AuthMailLoop)({store,sender,deployment:policy});
  }else if(role==='push')loop=new (require('./permanent-push').PermanentPush)({store,keys:config.keys,deployment:policy});
  else if(role==='payments'){
    const Stripe=require('../functions/node_modules/stripe');const providers={};
    for(const mode of ['test','live']){const item=config[mode];if(!new RegExp('^sk_'+mode+'_[A-Za-z0-9]+$').test(item?.key||''))throw Error('Payment mode key mismatch');
      const client=new Stripe(item.key,{maxNetworkRetries:1,timeout:10000});
      const service=mode==='live'?require('../functions/crown-live-payments-service').createLiveCrownPaymentsService({db:store,stripe:()=>client}):require('../functions/crown-payments-service').createCrownPaymentsService({db:store,stripe:()=>client});
      providers[mode]={verify:(raw,signature)=>Stripe.webhooks.constructEvent(raw,signature,item.webhookSecret),reconcile:id=>service.reconcile(id),...(mode==='live'?{review:e=>service.review(e)}:{})};}
    server=require('./payment-webhooks').createPaymentWebhookServer({store,...providers,deployment:policy,isEnabled:()=>policy.isActive()});
  }
  if(server)await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(ports[role],'127.0.0.1',resolve);});
  loop?.start();await report();return {stop,store,server,loop,standby:false};
}
if(require.main===module)start(process.argv[2]).catch(()=>{console.error('Permanent Crownlands service could not start; private details suppressed.');process.exit(1);});
module.exports={PORTS,validateConfig,writeStatus,start};
