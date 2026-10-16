"use strict";
const crypto=require('node:crypto');
const {FieldValue}=require('./store');
const {subscription,PREFIX,WebPushSender}=require('./web-push');
const {deliverNotificationOutbox}=require('../functions/notification-delivery');
const {isPolicy,GAME}=require('./deployment-policy');
class PermanentPush {
  constructor({store,keys,deployment}) {
    if(!isPolicy(deployment,GAME)||store.schema!==GAME)throw Error('Permanent notification activation required');
    this.store=store;this.deployment=deployment;this.keys=keys;this.sender=new WebPushSender({keys,deployment});
    this.stopped=false;this.pending=null;this.lastSuccess=0;this.failures=0;this.lastDeliveryFailure=0;
  }
  async send(notification,completed=[]) {
    await this.deployment.assertActive();
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(notification.defenderUid||''))throw Error('Invalid recipient');
    const tokens=await this.store.collection(`players/${notification.defenderUid}/notificationTokens`).where('enabled','==',true).limit(100).get();
    const result={deliveredTokenIds:[],completedTokenIds:[],retryError:null};
    for(const doc of tokens.docs) {
      if(this.stopped)throw Error('Notifications stopped');
      const value=doc.data();if(completed.includes(doc.id)||value.uid!==notification.defenderUid||!value.token?.startsWith(PREFIX))continue;
      try{subscription(value.token,this.keys.publicKey);}catch{continue;}
      const current=await doc.ref.get();if(!current.exists||current.data().enabled!==true||current.data().token!==value.token)continue;
      try {
        const topic=crypto.createHash('sha256').update(JSON.stringify([notification.armyId,notification.defenderUid])).digest('base64url').slice(0,32);
        const sent=await this.sender.send(value.token,notification,{topic});
        if(sent.accepted)result.deliveredTokenIds.push(doc.id);
        if(sent.gone)await this.store.runTransaction(async tx=>{const latest=await tx.get(doc.ref);if(latest.exists&&latest.data().token===value.token)tx.delete(doc.ref);});
        result.completedTokenIds.push(doc.id);
      }catch{this.lastDeliveryFailure=Date.now();result.retryError=Object.assign(Error('Notification delivery pending'),{code:'unavailable'});break;}
    }return result;
  }
  async tick(){if(this.stopped||this.pending)return;this.pending=(async()=>{try{await this.deployment.assertActive();
    const items=await this.store.collection('serverNotificationOutbox').where('type','==','incoming_army').where('status','in',['pending','processing']).orderBy('createdAtMs').limit(50).get();
    const doc=items.docs.find(d=>!(Number(d.data().deliveryLeaseUntilMs)>Date.now()));
    if(doc)await deliverNotificationOutbox(doc.ref,{db:this.store,send:(...args)=>this.send(...args),fieldValue:FieldValue});
    this.lastSuccess=Date.now();}catch{this.failures++;}})();try{await this.pending;}finally{this.pending=null;}}
  start(){const cycle=async()=>{await this.tick();if(!this.stopped)this.timer=setTimeout(cycle,2000);};this.timer=setTimeout(cycle,0);}
  async status(){return {healthy:!this.stopped&&Date.now()-this.lastSuccess<30000&&Date.now()-this.lastDeliveryFailure>300000,lastSuccessfulTick:this.lastSuccess?new Date(this.lastSuccess).toISOString():null,operationalFailures:this.failures};}
  stop(){this.stopped=true;clearTimeout(this.timer);this.sender.stop();}
  async settle(){await this.pending;}
}
module.exports={PermanentPush};
