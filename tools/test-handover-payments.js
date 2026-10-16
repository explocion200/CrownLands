"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {readOrders,verify,ENDPOINTS}=require('./local-migration/verify_handover_payments');
const {encode}=require('../local-backend/values');
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crown-handover-payments-'));
 try{
  const order={id:'a'.repeat(64),status:'confirmed',sessionId:'cs_live_fixture',amountMinor:499,currency:'usd',priceId:'price_fixture'};
  const docs=[{name:'projects/crown-land-b15e0/databases/(default)/documents/crownPaymentOrders/'+order.id,fields:encode(order).mapValue.fields}];
  const page=Buffer.from(JSON.stringify(docs));fs.writeFileSync(path.join(dir,'documents-000000.json'),page,{mode:0o600});
  const manifest={project:'crown-land-b15e0',firestoreComplete:true,authComplete:true,expectedDocuments:1,exportedDocuments:1,
   pages:[{file:'documents-000000.json',bytes:page.length,sha256:crypto.createHash('sha256').update(page).digest('hex'),documents:1}]};
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
  const input=readOrders(dir);assert.equal(input.orders.length,1);
  const session={id:order.sessionId,livemode:true,mode:'payment',client_reference_id:order.id,metadata:{crownOrderId:order.id,purpose:'crownlands_crowns_live'},
   currency:'usd',amount_total:499,line_items:{has_more:false,data:[{price:{id:'price_fixture',tax_behavior:'inclusive'},quantity:1,amount_total:499}]},
   automatic_tax:{enabled:true,status:'complete'},total_details:{amount_discount:0,amount_shipping:0},payment_status:'paid',status:'complete',
   consent:{terms_of_service:'accepted'},payment_intent:'pi_fixture'};
  const calls=[];
  const providers=Object.fromEntries(['live','test'].map(mode=>[mode,{webhookEndpoints:{retrieve:async id=>{calls.push('endpoint');return {id,status:'enabled',url:'https://playcrownlands.com/api/payments/stripe/'+mode};}},
   checkout:{sessions:{retrieve:async id=>{calls.push('session');assert.equal(id,order.sessionId);return structuredClone(session);}}}}]));
  const receipt=await verify(input,providers);assert.equal(receipt.orders,1);assert.equal(receipt.unsettled,0);assert.equal(receipt.readOnly,true);assert.deepEqual(calls,['endpoint','session','endpoint']);
  session.payment_status='unpaid';await assert.rejects(verify(input,providers));session.payment_status='paid';
  session.metadata.purpose='another';await assert.rejects(verify(input,providers));session.metadata.purpose='crownlands_crowns_live';
  input.orders[0].order.status='awaiting_payment';await assert.rejects(verify(input,providers));input.orders[0].order.status='confirmed';
  input.orders[0].order.reviewRequired=true;await assert.rejects(verify(input,providers));delete input.orders[0].order.reviewRequired;
  providers.test.webhookEndpoints.retrieve=async()=>({id:ENDPOINTS.test,status:'enabled',url:'https://example.test/wrong'});await assert.rejects(verify(input,providers));
  fs.appendFileSync(path.join(dir,'documents-000000.json'),' ');assert.throws(()=>readOrders(dir));
  console.log('Final handover payments: exact snapshot, read-only provider checks, settlement/mode/purpose/review and endpoint refusal passed.');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
