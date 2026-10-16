"use strict";
// Read-only Stripe reconciliation of the exact final snapshot. No purchase,
// refund, event replay, webhook probe, or fulfillment call is made here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {decode}=require('../../local-backend/values');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const ROOT='projects/crown-land-b15e0/databases/(default)/documents/';
const ENDPOINTS={test:'we_1UNHL9KuUcvmAfUInrLGS6Ll',live:'we_1UNLi6KuUcvmAfUIMJ3qFzkz'};
function privateFile(file,maximum=64*1024*1024){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>maximum)throw Error('Private evidence required');return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
function readOrders(directory){
 const raw=privateFile(path.join(directory,'manifest.json')),manifest=JSON.parse(raw);
 if(manifest.project!=='crown-land-b15e0'||!manifest.firestoreComplete||!manifest.authComplete||manifest.expectedDocuments!==manifest.exportedDocuments)throw Error('Complete snapshot required');
 const orders=[],seen=new Set();let count=0;
 for(const page of manifest.pages){
  if(!/^documents-[0-9]{6}\.json$/.test(page.file))throw Error('Unexpected snapshot page');
  const bytes=privateFile(path.join(directory,page.file));if(bytes.length!==page.bytes||hash(bytes)!==page.sha256)throw Error('Snapshot page changed');
  const documents=JSON.parse(bytes);if(documents.length!==page.documents)throw Error('Snapshot page count mismatch');
  count+=documents.length;
  for(const doc of documents){
   if(!doc.name.startsWith(ROOT))throw Error('Foreign snapshot document');
   const match=/^(crownPaymentTestOrders|crownPaymentOrders)\/([a-f0-9]{64})$/.exec(doc.name.slice(ROOT.length));
   if(!match)continue;
   if(seen.has(doc.name))throw Error('Duplicate purchase order');seen.add(doc.name);
   const order=decode({mapValue:{fields:doc.fields||{}}});
   if(order.id!==match[2]||!['confirmed','expired'].includes(order.status)||order.reviewRequired===true)throw Error('Unsettled or changed Crown purchase');
   orders.push({mode:match[1]==='crownPaymentOrders'?'live':'test',order});
  }
 }
 if(count!==manifest.expectedDocuments)throw Error('Incomplete snapshot inventory');
 return {orders,snapshotManifestSha256:hash(raw)};
}
async function verify(input,providers){
 const summary=[];
 for(const mode of ['live','test']){
  const stripe=providers[mode],endpoint=await stripe.webhookEndpoints.retrieve(ENDPOINTS[mode]);
  if(endpoint.id!==ENDPOINTS[mode]||endpoint.url!=='https://playcrownlands.com/api/payments/stripe/'+mode||endpoint.status!=='enabled')throw Error('Payment endpoint changed');
  let verified=0,expiredWithoutSession=0;
  for(const {order} of input.orders.filter(o=>o.mode===mode)){
   if(!['confirmed','expired'].includes(order.status)||order.reviewRequired===true)throw Error('Purchase needs reconciliation');
   if(!order.sessionId){if(order.status!=='expired')throw Error('Missing paid Checkout');expiredWithoutSession++;continue;}
   if(!new RegExp('^cs_'+mode+'_[A-Za-z0-9]+$').test(order.sessionId))throw Error('Checkout mode mismatch');
   const session=await stripe.checkout.sessions.retrieve(order.sessionId,{expand:['line_items']});
   require('../../functions/'+(mode==='live'?'crown-live-payments':'crown-payments')).validateSession(session,order);
   if((order.status==='confirmed'&&(session.status!=='complete'||session.payment_status!=='paid'))||
      (order.status==='expired'&&session.status!=='expired'))throw Error('Provider settlement differs from saved order');
   verified++;
  }
  summary.push({mode,sessionsVerified:verified,expiredWithoutSession});
 }
 return {version:1,recordedAt:new Date().toISOString(),snapshotManifestSha256:input.snapshotManifestSha256,
  endpointsVerified:['live','test'],orders:input.orders.length,unsettled:0,readOnly:true,summary};
}
async function main(){
 const [directory,output]=process.argv.slice(2),base=path.join(require('node:os').homedir(),'.local/share/crownlands');
 if(!directory||!output||![directory,output].every(f=>path.isAbsolute(f)&&f.startsWith(base+path.sep))||fs.existsSync(output))throw Error('New private handover paths required');
 const input=readOrders(directory),Stripe=require('../../functions/node_modules/stripe'),providers={};
 for(const mode of ['live','test']){
  const key=privateFile(path.join(base,'firebase-migration-20261015/secrets/STRIPE_CROWNS_'+mode.toUpperCase()+'_SECRET_KEY'),8192).toString().trim();
  if(!key.startsWith('sk_'+mode+'_'))throw Error('Payment credential mode mismatch');
  providers[mode]=new Stripe(key,{maxNetworkRetries:0,timeout:15000});
 }
 const report=await verify(input,providers);
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({orders:report.orders,unsettled:report.unsettled,readOnly:true}));
}
if(require.main===module)main().catch(()=>{console.error('Read-only final purchase check stopped; no purchase, fulfillment or provider settings changed.');process.exitCode=1;});
module.exports={readOrders,verify,ENDPOINTS};
