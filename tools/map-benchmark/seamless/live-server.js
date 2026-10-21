"use strict";
// Loopback preview with expiring owner grants or an explicitly prepared pilot
// session verifier. No login proxy or external route is installed by this file.
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),crypto=require("node:crypto"),zlib=require("node:zlib");
const {Pool}=require("../../../local-backend/node_modules/pg");
const {LiveReader,fail}=require("./live-reader");
const {ROOT,fixture,overview}=require("./live-catalog");
const {appearanceAssets}=require("./live-appearance-assets");
const {prepareTerrain}=require("./live-terrain");
const {isCohort}=require("./cohort-access");
const {createRouteService}=require("./open-route-service");
const {inSubnet,privateAddress}=require("./phone-server");
const ENTRY="/__benchmark__/seamless/";
const TYPES={".webp":"image/webp",".png":"image/png",".svg":"image/svg+xml",".js":"text/javascript",".css":"text/css"};
const HEADERS={"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","cross-origin-resource-policy":"same-origin",
  "content-security-policy":"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
const digest=token=>crypto.createHash("sha256").update(token).digest("hex");
function readGrant(file){
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.mode&0o077||stat.size>4096)throw Error("Private operator grant required");
    const grant=JSON.parse(fs.readFileSync(fd,"utf8"));
    if(grant.version!==1||typeof grant.uid!=="string"||!grant.uid||grant.uid.includes("/")||!Number.isFinite(grant.expiresAt)||grant.expiresAt<=Date.now()||grant.expiresAt>Date.now()+7200000
       || !/^[A-Za-z0-9_-]{43}$/.test(grant.key||""))throw Error("Valid expiring owner grant required");return grant;
  }finally{fs.closeSync(fd);}
}
async function createLiveServer({reader,grants=[],cohort=null,valid=()=>true,atlas,clock=Date.now,commands=null,host="127.0.0.1",subnet="127.0.0.0/8"}){
  if(cohort?!isCohort(cohort)||grants.length:!Array.isArray(grants)||!grants.length||grants.length>128)throw Error("Explicit private viewers required");
  if(commands && (!require("./gameplay-pilot").isGameplayPilot(commands)||commands.reader!==reader||cohort||grants.some(g=>!commands.players.some(p=>p.uid===g.uid))))throw Error("Isolated gameplay pilot required");
  if(host!=="127.0.0.1"&&(!commands||!privateAddress(host)||!inSubnet(host,subnet)||grants.some(g=>g.expiresAt>clock()+3600000)))throw Error("One-hour private-network gameplay pilot required");
  const terrain=await prepareTerrain(reader.manifest);reader.manifest=terrain.manifest;
  if(cohort)reader.manifest={...reader.manifest,cohortReadOnly:true};
  const allowed=new Map(grants.map(g=>[digest(g.key),{uid:g.uid,expiresAt:g.expiresAt}])),sessions=new Map(),recent=new Map();
  const assets=new Map(),sessionsPerViewer=new Map();let origin,cookieName,closed=false,timer;
  const routeService=reader.openWorld&&!commands?createRouteService(reader.display.geometry):null,routeRecent=new Map();
  const appearance=appearanceAssets(ROOT);
  for(const name of ["model.js","assets.js","feed.js","delta-feed.js","sprite-layer.js","preview.js","preview.css","live-login.js","appearance.js"])
    assets.set("/tools/map-benchmark/seamless/"+name,path.join(__dirname,name));
  for(const name of ["playerFlagConfig.js","flagRenderer.js"])assets.set("/functions/"+name,path.join(ROOT,"functions",name));
  if(commands)assets.set("/tools/map-benchmark/seamless/gameplay-controls.js",path.join(__dirname,"gameplay-controls.js"));
  if(routeService)assets.set("/tools/map-benchmark/seamless/route-preview.js",path.join(__dirname,"route-preview.js"));
  function add(asset){if(!/^(assets\/|tools\/map-benchmark\/seamless\/terrain\/)[a-zA-Z0-9_./-]+\.(webp|png|svg)$/.test(asset||"")||asset.includes(".."))return;
    if(assets.has("/"+asset))return;
    const file=fs.realpathSync(terrain.files.get(asset)||path.join(ROOT,asset));if(!file.startsWith(ROOT+path.sep))throw Error("Unexpected asset path");assets.set("/"+asset,file);}
  for(const s of reader.manifest.sections){add(s.terrain);add(s.thumbnail);}for(const o of fixture.objects)add(o.asset);for(const m of fixture.marches)add(m.asset);
  atlas ||= await overview(reader.manifest,asset=>terrain.files.get(asset)||path.join(ROOT,asset));
  function send(req,res,status,value,type="application/json",headers={}){
    let bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==="string"?value:JSON.stringify(value));
    if(/\bgzip\b/.test(req.headers["accept-encoding"]||"")&&bytes.length>1024&&type!=="image/webp"){bytes=zlib.gzipSync(bytes,{level:1});headers["content-encoding"]="gzip";}
    res.writeHead(status,{...HEADERS,...headers,"content-type":type,"content-length":bytes.length,Vary:"Accept-Encoding"});res.end(req.method==="HEAD"?undefined:bytes);
  }
  async function session(req){if(cohort)return cohort.authenticate(req);
    const token=(req.headers.cookie||"").split(/;\s*/).find(c=>c.startsWith(cookieName+"="))?.slice(cookieName.length+1)||"";const key=digest(token),value=sessions.get(key);
    if(!value||value.expiresAt<=clock()||!valid()){sessions.delete(key);return null;}return {...value,key};}
  const login=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private read-only map</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/tools/map-benchmark/seamless/preview.css"><script defer src="/tools/map-benchmark/seamless/live-login.js"></script></head><body class="fixture-login"><main><h1>Private game preview</h1><p>Read-only view of the current game. No orders can be sent.</p><form id="reader-login"><label>Temporary preview key<input id="key" type="password" autocomplete="off" required></label><button>Open private preview</button></form><p id="login-status" role="status">Use the private key prepared on this computer. This is not your game password.</p></main></body></html>`;
  const server=http.createServer(async(req,res)=>{
    try{
      if(closed||!valid()||(cohort&&!cohort.valid()))throw fail(410,"Private reader has ended");
      if((cohort?!cohort.accepts(req):!(host==="127.0.0.1"?req.socket.remoteAddress==="127.0.0.1":inSubnet(req.socket.remoteAddress,subnet)))||req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin)||req.headers["sec-fetch-site"]==="cross-site")throw fail(403,"Local same-origin access required");
      if(!req.url?.startsWith("/")||req.url.startsWith("//")||req.url.length>8192)throw fail(400,"Invalid request");
      const url=new URL(req.url,origin);
      if(req.method==="POST"&&commands&&url.pathname===ENTRY+"command"){
        if(req.headers.origin!==origin||req.headers["content-type"]!=="application/json")throw fail(403,"Same-origin JSON required");
        const s=await session(req);if(!s)throw fail(401,"Test session ended");
        let body="";for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)throw fail(413,"Request too large");}
        let data;try{data=JSON.parse(body);}catch{throw fail(400,"Invalid command");}
        if((await session(req))?.uid!==s.uid)throw fail(401,"Test session ended");
        try{const result=await commands.execute(s.uid,data.name,data.data);send(req,res,200,result);}
        catch(error){const status=error.status||({"permission-denied":403,"unauthenticated":401,"not-found":404,"invalid-argument":400,"failed-precondition":409,"already-exists":409,"resource-exhausted":429,"unavailable":503}[error.code]);throw fail(status||503,status?error.message:"Private command temporarily unavailable; retry the same order");}
        return;
      }
      if(req.method==="POST"){
        if(cohort)throw fail(405,"Private pilot cannot change accounts or game data");
        if(![ENTRY+"login",ENTRY+"logout"].includes(url.pathname))throw fail(405,"Read-only preview");
        if(req.headers.origin!==origin||req.headers["content-type"]!=="application/json")throw fail(403,"Same-origin JSON required");
        if(url.pathname.endsWith("logout")){const s=await session(req);if(s)sessions.delete(s.key);send(req,res,200,{ok:true},undefined,{"set-cookie":`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`});return;}
        let body="";for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048)throw fail(413,"Request too large");}
        const data=JSON.parse(body),grant=typeof data.key==="string"?allowed.get(digest(data.key)):null;
        if(!grant||grant.expiresAt<=clock())throw fail(401,"Private key not accepted");
        const token=crypto.randomBytes(32).toString("base64url"),key=digest(token);
        if(sessionsPerViewer.has(grant.uid))sessions.delete(sessionsPerViewer.get(grant.uid));
        sessions.set(key,grant);sessionsPerViewer.set(grant.uid,key);
        send(req,res,200,{ok:true},undefined,{"set-cookie":`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((grant.expiresAt-clock())/1000)}`});return;
      }
      if(!["GET","HEAD"].includes(req.method))throw fail(405,"Read-only preview");
      if(url.pathname===ENTRY+"login"){send(req,res,200,cohort?'<!doctype html><title>Private Crownlands pilot</title><h1>Private read-only pilot</h1><p>Sign in to Crownlands normally, then return here. Only the selected test accounts can enter.</p><a href="/play/">Open Crownlands</a>':commands?login.replace("Read-only view of the current game. No orders can be sent.","Private gameplay pilot. Sample accounts and troops only; your live game is not connected."):login,"text/html");return;}
      // Owner mode has two public login resources. Pilot mode instead verifies
      // an existing normal session; neither mode proxies sign-in operations.
      const s=await session(req),loginAsset=!cohort&&["/tools/map-benchmark/seamless/live-login.js","/tools/map-benchmark/seamless/preview.css"].includes(url.pathname);
      if(!s&&!loginAsset){send(req,res,url.pathname===ENTRY?302:401,{error:"Open the private preview first"},undefined,url.pathname===ENTRY?{location:ENTRY+"login"}:{});return;}
      if(assets.has(url.pathname)){const file=assets.get(url.pathname);send(req,res,200,fs.readFileSync(file),TYPES[path.extname(file)]);return;}
      if(url.pathname===ENTRY+"flags.css"){send(req,res,200,appearance.css,"text/css");return;}
      if(url.pathname==="/"+reader.manifest.overviewAsset){send(req,res,200,atlas,"image/webp");return;}
      if(url.pathname===ENTRY){const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8").replace("<head>",'<head><meta name="crownlands-stage-three" content="private"><link rel="stylesheet" href="/__benchmark__/seamless/flags.css"><script defer src="/functions/playerFlagConfig.js"></script><script defer src="/functions/flagRenderer.js"></script><script defer src="/tools/map-benchmark/seamless/appearance.js"></script>')
        .replace('</head>',`${(cohort||commands)?`<meta name="crownlands-private-preview-origin" content="${origin}">`:""}${commands?'<script defer src="/tools/map-benchmark/seamless/gameplay-controls.js"></script>':""}${routeService?'<script defer src="/tools/map-benchmark/seamless/route-preview.js"></script>':""}</head>`)
        .replace('<body>','<body>'+appearance.svg.replace('<svg ', '<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden" '))
        .replace('<script defer src="/tools/map-benchmark/seamless/preview.js">','<script defer src="/tools/map-benchmark/seamless/delta-feed.js"></script><script defer src="/tools/map-benchmark/seamless/preview.js">');send(req,res,200,html,"text/html");return;}
      if(url.pathname===ENTRY+"catalog"){await reader.initialize(s.uid);if((await session(req))?.uid!==s.uid)throw fail(401,"Private grant ended");send(req,res,200,reader.manifest);return;}
      if(url.pathname===ENTRY+"route"&&routeService){
        if(url.searchParams.get("realm")!==reader.manifest.realmId)throw fail(400,"Wrong realm");
        if(clock()-(routeRecent.get(s.uid)||0)<1000)throw fail(429,"Wait briefly before testing another route");routeRecent.set(s.uid,clock());
        const [from,to]=await reader.routeEndpoints(s.uid,url.searchParams.get("from"),url.searchParams.get("to"));
        const result=await routeService.route({x:from.x,y:from.y},{x:to.x,y:to.y});
        // Revalidate realm, membership, endpoints and session after worker time.
        const fresh=await reader.routeEndpoints(s.uid,from.key,to.key);
        if(JSON.stringify(fresh)!==JSON.stringify([from,to]))throw fail(409,"Locations changed; select them again");
        if((await session(req))?.uid!==s.uid)throw fail(401,"Private grant ended");
        send(req,res,result.status==="busy"?429:200,{...result,from,to,previewOnly:true});return;
      }
      if(url.pathname!==ENTRY+"changes")throw fail(404,"Not a preview route");
      if(url.searchParams.get("realm")!==reader.manifest.realmId)throw fail(400,"Wrong realm");
      if(clock()-(recent.get(s.uid)||0)<850)throw fail(429,"Poll at most once per second");recent.set(s.uid,clock());
      const revision=url.searchParams.get("revision"),epoch=url.searchParams.get("epoch");
      if(revision!==null&&!/^\d{1,12}$/.test(revision))throw fail(400,"Invalid cursor");
      const result=await reader.read(s.uid,(url.searchParams.get("ids")||"").split(","),revision===null?null:{revision:Number(revision),epoch});
      if((await session(req))?.uid!==s.uid)throw fail(401,"Private grant ended");
      for(const item of [...result.objects.upsert,...result.marches.upsert])add(item.asset);
      send(req,res,200,result);
    }catch(error){if(!res.headersSent)send(req,res,error.status||503,{error:error.status?error.message:"Private reader temporarily unavailable"},undefined,error.status===429?{"retry-after":"1"}:{});else res.destroy();}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxConnections=128;
  return {reader,server,async listen(port=0){await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,host,resolve);});const localUrl=`http://${host}:${server.address().port}`;origin=cohort?.origin||localUrl;cookieName="world_reader_"+server.address().port;
    timer=setTimeout(()=>{void this.close();},Math.max(1,(cohort?.expiresAt||Math.min(...grants.map(g=>g.expiresAt)))-clock()));timer.unref();return{url:origin,localUrl,entry:origin+ENTRY+"?catalog=full"};},
  async close(){if(closed)return;closed=true;clearTimeout(timer);sessions.clear();await routeService?.close();server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));}};
}
async function main(){
  const file=process.argv.find(a=>a.startsWith("--grant="))?.slice(8),grant=readGrant(file),port=Number(process.argv.find(a=>a.startsWith("--port="))?.slice(7)||8802);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error("Unprivileged port required");
  const pool=new Pool({host:"/var/run/postgresql",database:"crownlands_migration",max:2,application_name:"crownlands-world-reader",connectionTimeoutMillis:250,
    options:"-c role=crownlands-world-reader -c default_transaction_read_only=on -c statement_timeout=1500 -c idle_in_transaction_session_timeout=3000"});
  const {readControl}=require("../../../local-backend/deployment-policy");
  const control=readControl();if(control.phase!=="active")throw Error("Current local game must be active");
  let server;
  try{
    const r=(await pool.query("SELECT current_user AS role,current_setting('transaction_read_only') AS readonly")).rows[0];
    if(r.role!=="crownlands-world-reader"||r.readonly!=="on")throw Error("Restricted read-only database role required");
    const reader=new LiveReader({pool,openWorld:process.argv.includes("--open-world")});await reader.initialize(grant.uid);
    server=await createLiveServer({reader,grants:[grant],valid:()=>{try{return JSON.stringify(readGrant(file))===JSON.stringify(grant)&&JSON.stringify(readControl())===JSON.stringify(control);}catch{return false;}}});
    const address=await server.listen(port);console.log(`Private read-only game preview: ${address.entry}\n${reader.manifest.sections.length} active sections. No game writes or production route changes.`);
    const stop=async()=>{await server.close();await pool.end();};for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>{void stop();});
    setTimeout(()=>{void stop();},grant.expiresAt-Date.now()).unref();
  }catch(error){await server?.close();await pool.end();throw error;}
}
if(require.main===module)main().catch(()=>{console.error("Private reader stopped. Check its grant, role and current realm; private details suppressed.");process.exitCode=1;});
module.exports={createLiveServer,readGrant,ENTRY};
