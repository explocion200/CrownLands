"use strict";
// Permanent HTTPS ingress. During migration exactly one authority receives each
// event: Firebase before cutover, the fenced local payment service afterwards.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Stripe = require("../functions/node_modules/stripe");
const { readControl, privateJson } = require("./deployment-policy");
const UPSTREAM = Object.freeze({
  test: "https://us-central1-crown-land-b15e0.cloudfunctions.net/stripeCrownTestWebhook",
  live: "https://us-central1-crown-land-b15e0.cloudfunctions.net/stripeCrownLiveWebhook",
});
// Node fetch normalizes Host for loopback; use the HTTP transport explicitly so
// the local authority receives the original public-host security boundary.
function forward(url,options) {
  if(!url.startsWith('http://127.0.0.1:9293/'))return fetch(url,options);
  return new Promise((resolve,reject)=>{const req=http.request(url,{method:options.method,headers:options.headers,signal:options.signal},res=>{
    res.resume();res.once('error',reject);res.once('end',()=>resolve({status:res.statusCode}));
  });req.once('error',reject);req.end(options.body);});
}
function createIngress({ secrets, control = readControl, fetchImpl = forward, now = Date.now, record = () => {}, initialState }) {
  if (Object.keys(secrets || {}).sort().join() !== "live,test"
    || Object.values(secrets).some(value => !/^whsec_[A-Za-z0-9]{8,250}$/.test(value))) throw Error("Both webhook signing secrets are required");
  let active = 0;
  const pending = new Set(initialState?.pendingFailures || []);
  if(pending.size>10000 || [...pending].some(v=>!/^([a-f0-9]{64})$/.test(v)))throw Error("Invalid private delivery journal");
  const state = { ready: true, accepted: 0, failed: 0, rejected: 0, lastFailureAt: null, lastSuccessAt: null, journalOverflow: initialState?.journalOverflow === true };
  const snapshot=()=>({...state,pendingFailures:[...pending],inFlight:active,recordedAt:new Date(now()).toISOString()});
  const server = http.createServer({ maxHeaderSize: 8192, headersTimeout: 10000, requestTimeout: 15000 }, async (req, res) => {
    req.on("error", () => {});
    const send = (status, text) => { if (!res.destroyed && !res.writableEnded) { res.writeHead(status, {
      "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'", Connection: "close", ...(status === 503 ? { "Retry-After": "10" } : {}),
    }); res.end(text); } };
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers.host !== "playcrownlands.com") return send(421,"Unexpected host");
    if (req.method === "GET" && req.url === "/internal/health") return send(state.ready?200:503,"Payment ingress ready.");
    const mode = /^\/api\/payments\/stripe\/(test|live)$/.exec(req.url)?.[1];
    if (!mode) return send(404,"Not found");
    if (req.method !== "POST") return send(405,"POST required");
    const occurrences = name => req.rawHeaders.filter((v,i) => i % 2 === 0 && v.toLowerCase() === name).length;
    if (occurrences("host") !== 1 || occurrences("stripe-signature") !== 1 || typeof req.headers['stripe-signature'] !== 'string'
      || req.headers['stripe-signature'].length > 2048 || req.headers['content-type']?.split(';')[0].trim() !== 'application/json'
      || req.headers['content-encoding']) return send(400,"Invalid request");
    if (active >= 8) return send(503,"Payment service busy");
    active++;
    let bodyTimer, verified = false, eventHash;
    try {
      const raw = await new Promise((resolve,reject) => {
        const chunks=[];let size=0;
        const cleanup=()=>{clearTimeout(bodyTimer);req.off('data',chunk);req.off('end',end);req.off('aborted',aborted);req.off('error',aborted);};
        const fail=()=>{cleanup();req.resume();reject(Error('Invalid body'));};
        const chunk=b=>{size+=b.length;if(size>262144)fail();else chunks.push(b);};
        const end=()=>{cleanup();resolve(Buffer.concat(chunks));};const aborted=()=>fail();
        bodyTimer=setTimeout(fail,5000);req.on('data',chunk);req.once('end',end);req.once('aborted',aborted);req.once('error',aborted);
      });
      let event;
      try { event=Stripe.webhooks.constructEvent(raw,req.headers['stripe-signature'],secrets[mode]); }
      catch { state.rejected++;return send(400,"Invalid Stripe signature"); }
      if (!/^evt_[A-Za-z0-9_]{1,150}$/.test(event.id||'') || event.account || event.livemode !== (mode === 'live')) { state.rejected++;return send(400,"Unexpected payment mode"); }
      verified=true;eventHash=crypto.createHash('sha256').update(mode+':'+event.id).digest('hex');
      if(pending.size<10000)pending.add(eventHash);else state.journalOverflow=true;record(snapshot());
      const selected=control();
      if (selected.phase === 'maintenance') throw Error('Payment processing paused');
      if (!['active','standby'].includes(selected.phase)) throw Error('Invalid authority');
      const url=selected.phase === 'active' ? `http://127.0.0.1:9293/api/local-payments/stripe/${mode}` : UPSTREAM[mode];
      const response=await fetchImpl(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Stripe-Signature':req.headers['stripe-signature'],...(selected.phase === 'active'?{Host:'playcrownlands.com'}:{})},body:raw,signal:AbortSignal.timeout(12000)});
      // Never expose provider bodies, signatures, event IDs or payment data.
      await response.body?.cancel();
      if (response.status<200 || response.status>=300) throw Error('Authority did not acknowledge');
      pending.delete(eventHash);state.accepted++;state.lastSuccessAt=new Date(now()).toISOString();record(snapshot());send(200,'Received');
    } catch { if(verified){if(pending.size<10000)pending.add(eventHash);else state.journalOverflow=true;state.failed++;state.lastFailureAt=new Date(now()).toISOString();send(503,'Payment processing pending');}else send(400,'Invalid payment request'); }
    finally {clearTimeout(bodyTimer);active--;try{record(snapshot());}catch{state.ready=false;}}
  });
  server.keepAliveTimeout=1000;server.maxRequestsPerSocket=20;
  return {server,status:snapshot};
}
function readSecrets(file) { return privateJson(file,8192); }
async function start() {
  const credentials=process.env.CREDENTIALS_DIRECTORY,state=process.env.STATE_DIRECTORY;
  if(!credentials || !state)throw Error('System credentials and state required');
  const record=value=>{const next=path.join(state,'status.json.next');fs.writeFileSync(next,JSON.stringify(value),{mode:0o600});fs.renameSync(next,path.join(state,'status.json'));};
  const prior=path.join(state,'status.json');let initialState;
  if(fs.existsSync(prior)){if(fs.statSync(prior).size>1000000)throw Error('Delivery journal requires review');initialState=privateJson(prior,1000000);}
  const ingress=createIngress({secrets:readSecrets(path.join(credentials,'secrets')),record,initialState});
  await new Promise((resolve,reject)=>{ingress.server.once('error',reject);ingress.server.listen(9294,'127.0.0.1',resolve);});
  const timer=setInterval(()=>record(ingress.status()),5000);record(ingress.status());
  const stop=()=>{clearInterval(timer);ingress.server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),15000).unref();};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
if(require.main===module)start().catch(()=>{console.error('Payment ingress could not start; sensitive details suppressed.');process.exitCode=1;});
module.exports={UPSTREAM,createIngress,readSecrets,forward};
