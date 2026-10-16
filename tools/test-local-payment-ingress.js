"use strict";
const assert=require('node:assert/strict'),http=require('node:http');
const Stripe=require('../functions/node_modules/stripe');
const {createIngress,UPSTREAM}=require('../local-backend/payment-ingress');
const {createServer,response}=require('../local-backend/operations-http');
async function listen(s){await new Promise(r=>s.listen(0,'127.0.0.1',r));}
function request(s,path,raw='',headers={},method='POST'){
 return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:s.address().port,path,method,headers:{Host:'playcrownlands.com','Content-Type':'application/json',...headers}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});r.on('error',reject);r.end(raw);});
}
(async()=>{
 let phase='standby',upstreamStatus=200,throwUpstream=false,requests=[],records=[];
 const secrets={test:'whsec_syntheticTest123',live:'whsec_syntheticLive123'};
 const ingress=createIngress({secrets,control:()=>({phase}),record:v=>records.push(v),fetchImpl:async(url,options)=>{
  requests.push({url,options});assert.equal(options.redirect,'error');assert(options.signal);if(throwUpstream)throw Error('private-provider-error');return new Response(null,{status:upstreamStatus});
 }});
 const post=async(mode='test',extra={},header={})=>{const raw=JSON.stringify({id:'evt_private_fixture',type:'migration.test',livemode:mode==='live',data:{object:{}},...extra},null,2);
  const signature=Stripe.webhooks.generateTestHeaderString({payload:raw,secret:secrets[mode]});
  return {raw,signature,result:await request(ingress.server,'/api/payments/stripe/'+mode,raw,{'Stripe-Signature':signature,...header})};};
 let status={recordedAt:new Date().toISOString(),components:{database:{healthy:true,private:'must not expose'}}};const health=createServer({read:()=>status});
 try{
  await listen(ingress.server);await listen(health);
  for(const mode of ['test','live']){const p=await post(mode);assert.equal(p.result.status,200);assert.equal(requests.at(-1).url,UPSTREAM[mode]);assert.equal(requests.at(-1).options.body.toString(),p.raw);assert.equal(requests.at(-1).options.headers['Stripe-Signature'],p.signature);}
  const count=requests.length;
  for(const p of [await post('test',{livemode:true}),await post('test',{account:'acct_other'}),await post('test',{}, {'Stripe-Signature':'wrong'}),await post('test',{}, {'Host':'other.test'})])assert(p.result.status>=400);
  assert.equal(requests.length,count);
  assert.equal((await request(ingress.server,'/api/payments/stripe/test','x'.repeat(262145),{'Stripe-Signature':'wrong'})).status,400);
  phase='maintenance';assert.equal((await post()).result.status,503);assert.equal(requests.length,count);
  phase='active';assert.equal((await post()).result.status,200);assert.equal(requests.at(-1).url,'http://127.0.0.1:9293/api/local-payments/stripe/test');assert.equal(requests.at(-1).options.headers.Host,'playcrownlands.com');
  for(const code of [302,400,500,503]){upstreamStatus=code;assert.equal((await post()).result.status,503);}
  throwUpstream=true;assert.equal((await post()).result.status,503);assert(!JSON.stringify(records).includes('private'));assert.equal(ingress.status().pendingFailures.length,1);
  const restarted=createIngress({secrets,initialState:ingress.status()});assert.equal(restarted.status().pendingFailures.length,1);
  throwUpstream=false;upstreamStatus=200;assert.equal((await post('test',{id:'evt_unrelated_success'})).result.status,200);assert.equal(ingress.status().pendingFailures.length,1);
  throwUpstream=false;upstreamStatus=200;assert.equal((await post()).result.status,200);assert(ingress.status().lastSuccessAt>=ingress.status().lastFailureAt);assert.equal(ingress.status().pendingFailures.length,0);
  assert.equal((await request(health,'/service-healthz/database','',{},'GET')).status,200);
  status.components.database.healthy=false;assert.equal((await request(health,'/service-healthz/database','',{},'GET')).status,503);
  status.components.database.healthy=true;status.recordedAt=new Date(Date.now()-91000).toISOString();const stale=await request(health,'/service-healthz/database','',{},'GET');assert.equal(stale.status,503);assert(!stale.body.includes('private'));
  assert.equal(response({recordedAt:new Date(Date.now()+10000).toISOString(),components:{database:{healthy:true}}},'database'),false);
  assert.equal((await request(health,'/service-healthz/private','',{},'GET')).status,404);
  console.log('Payment ingress and health: signed raw-byte forwarding to one authority, mode/host/body rejection, maintenance, upstream failure/retry, sanitized and stale health passed.');
 }finally{await Promise.all([ingress.server,health].map(s=>new Promise(r=>s.close(r))));}
})().catch(e=>{console.error(e);process.exitCode=1;});
