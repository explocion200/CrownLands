"use strict";
// Administrative handover only. Uses the normal typed store for the one proxy
// configuration delta and preserves every historical/current game document.
const {Store}=require('../../local-backend/store');
const {GAME,AUTH}=require('../../local-backend/deployment-policy');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function validate(input){
 if(!input||! /^[a-f0-9]{32}$/.test(input.epoch||'')||!sha(input.verificationSha256)||!sha(input.sourceFenceSha256)
  ||!Number.isSafeInteger(input.documents)||input.documents<1||!Number.isSafeInteger(input.accounts)||input.accounts<1
  ||!Array.isArray(input.schedulers)||input.schedulers.length!==16||new Set(input.schedulers.map(s=>s.name)).size!==16)throw Error('Verified handover identity required');
 for(const s of input.schedulers)if(!/^[A-Za-z][A-Za-z0-9]{1,100}$/.test(s.name)||!sha(s.signature)||!Number.isSafeInteger(s.lastMinute)||s.lastMinute<0)throw Error('Reviewed schedule cursor required');
}
async function gate(client,input){
 validate(input);
 const {rows}=await client.query('SELECT * FROM crownlands_control.deployment WHERE singleton FOR UPDATE');
 const d=rows[0];
 if(rows.length!==1||d.epoch!==input.epoch||d.phase!=='maintenance'||d.activated_at!==null||d.firebase_fence_receipt!==null||d.snapshot_receipt!==input.verificationSha256)throw Error('Never-activated imported maintenance target required');
 const count=(await client.query(`SELECT (SELECT count(*) FROM ${GAME}.documents)::int AS documents,(SELECT count(*) FROM ${AUTH}.accounts)::int AS accounts`)).rows[0];
 if(count.documents!==input.documents||count.accounts!==input.accounts)throw Error('Imported row counts changed');
}
async function prepare(pool,input){
 const store=new Store({schema:GAME,pool});
 return store.runTransaction(async tx=>{
  await gate(tx.client,input);
  const pending=(await tx.client.query(`SELECT
   (SELECT count(*) FROM ${GAME}.work_schedules)+(SELECT count(*) FROM ${GAME}.work_jobs)+(SELECT count(*) FROM ${GAME}.changes)+
   (SELECT count(*) FROM ${AUTH}.auth_sessions)+(SELECT count(*) FROM ${AUTH}.auth_mail)+(SELECT count(*) FROM ${AUTH}.auth_actions) AS n`)).rows[0];
  if(Number(pending.n)!==0)throw Error('Prior preparation or runtime work preserved');
  for(const s of input.schedulers)await tx.client.query(`INSERT INTO ${GAME}.work_schedules(name,signature,last_minute) VALUES($1,$2,$3)`,[s.name,s.signature,s.lastMinute]);
  const ref=store.doc('realmSecurity/global/configuration/ipIngress'),before=await tx.get(ref);
  const changed=before.data()?.enabled===true&&(before.data().verified!==true||before.data().suffixLength!==1);
  if(changed)tx.set(ref,{verified:true,suffixLength:1},{merge:true});
  return {version:1,epoch:input.epoch,verificationSha256:input.verificationSha256,sourceFenceSha256:input.sourceFenceSha256,
   documents:input.documents,accounts:input.accounts,schedules:16,ingressAdjusted:changed,authorityActivated:false};
 });
}
async function activate(pool,input,prepared){
 validate(input);
 if(prepared?.epoch!==input.epoch||prepared.verificationSha256!==input.verificationSha256||prepared.documents!==input.documents
  ||prepared.accounts!==input.accounts||prepared.schedules!==16||typeof prepared.ingressAdjusted!=='boolean')throw Error('Matching database preparation required');
 const client=await pool.connect();
 try{await client.query('BEGIN');await gate(client,input);
  const schedules=(await client.query(`SELECT name,signature,last_minute FROM ${GAME}.work_schedules ORDER BY name`)).rows;
  const expected=[...input.schedulers].sort((a,b)=>a.name<b.name?-1:1);
  if(schedules.length!==16||schedules.some((s,i)=>s.name!==expected[i].name||s.signature!==expected[i].signature||Number(s.last_minute)!==expected[i].lastMinute))throw Error('Prepared scheduler cursor changed');
  const changes=(await client.query(`SELECT path FROM ${GAME}.changes`)).rows;
  if(changes.length!==(prepared.ingressAdjusted?1:0)||changes.some(c=>c.path!=='realmSecurity/global/configuration/ipIngress')
   ||Number((await client.query(`SELECT count(*) AS n FROM ${GAME}.work_jobs`)).rows[0].n)!==0)throw Error('Unexpected work before activation');
  await client.query('UPDATE crownlands_control.deployment SET phase=\'active\',firebase_fence_receipt=$1,activated_at=clock_timestamp() WHERE singleton',[input.sourceFenceSha256]);
  const result=(await client.query('SELECT phase,epoch,activated_at FROM crownlands_control.deployment WHERE singleton')).rows[0];
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
async function main(){
 const action=process.argv[2],input=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
 if(!['prepare','activate'].includes(action))throw Error('Explicit handover operation required');
 const {Pool}=require('../../local-backend/node_modules/pg'),pool=new Pool({host:'/var/run/postgresql',database:'crownlands_migration',max:2,statement_timeout:60000});
 try{if((await pool.query('SELECT current_user')).rows[0].current_user!=='postgres')throw Error('Administrator database identity required');
  console.log(JSON.stringify(action==='prepare'?await prepare(pool,input):await activate(pool,input,input.prepared)));
 }finally{await pool.end();}
}
if(require.main===module)main().catch(()=>{console.error('Database handover stopped; existing data and authority receipts were preserved.');process.exitCode=1;});
module.exports={validate,prepare,activate};
