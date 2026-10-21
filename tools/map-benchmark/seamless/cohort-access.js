"use strict";
// Prepared integration boundary only; no public route or auth permission is
// installed here. Reuses AuthService.session(), never sign-in/account mutations.
const {cookies,COOKIE}=require("../../../local-backend/auth-http");
const {privateAddress,inSubnet}=require("./phone-server");
const capabilities=new WeakSet(),fail=(status,message)=>Object.assign(Error(message),{status});
function createCohortAccess({auth,allowedUids,origin,subnet,expiresAt,clock=Date.now}){
  const url=new URL(origin),uids=new Set(allowedUids);
  if(url.protocol!=="https:"||url.origin!==origin||!Array.isArray(allowedUids)||uids.size<1||uids.size>5||uids.size!==allowedUids.length
    ||allowedUids.some(uid=>typeof uid!=="string"||!uid||uid.length>128||uid.includes('/'))||typeof auth?.session!=="function"
    ||!Number.isFinite(expiresAt)||expiresAt<=clock()||expiresAt>clock()+3600000)throw Error("Explicit HTTPS pilot, 1–5 accounts and at most one hour required");
  const [network,prefix]=String(subnet).split('/');
  if(!privateAddress(network)||!/^\d+$/.test(prefix||'')||Number(prefix)<24||Number(prefix)>32||!inSubnet(network,subnet))throw Error("A narrow private test subnet is required");
  let active=0;
  const capability=Object.freeze({origin,expiresAt,valid:()=>clock()<expiresAt,
    accepts(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
      &&req.headers['x-forwarded-proto']==='https'&&inSubnet(req.headers['x-crownlands-client-ip'],subnet);},
    async authenticate(req){
      if(clock()>=expiresAt)throw fail(410,"Private pilot ended");
      if(active>=16)throw fail(429,"Private pilot busy; retry shortly");active++;
      try{const token=cookies(req.headers.cookie)[COOKIE],session=await auth.session(token);
        if(!session)return null;
        if(!uids.has(session.user.uid)||!session.user.emailVerified)throw fail(403,"This account is not in the private pilot");
        return{uid:session.user.uid,expiresAt};
      }finally{active--;}
    }});
  capabilities.add(capability);return capability;
}
module.exports={createCohortAccess,isCohort:value=>capabilities.has(value)};
