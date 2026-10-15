"use strict";
const http=require('node:http'),fs=require('node:fs');
const NAMES=['database','workers','email','notifications','payments','services'];
function response(status,name,now=Date.now()) {
  const fresh=status&&Number.isFinite(Date.parse(status.recordedAt))&&now-Date.parse(status.recordedAt)>=-5000&&now-Date.parse(status.recordedAt)<90000;
  return fresh&&status.components?.[name]?.healthy===true;
}
function createServer({read=()=>JSON.parse(fs.readFileSync('/var/lib/crownlands-operations/status.json','utf8')),now=Date.now}={}) {
  return http.createServer({maxHeaderSize:4096,requestTimeout:5000,headersTimeout:3000},(req,res)=>{
    const name=/^\/service-healthz\/(database|workers|email|notifications|payments|services)$/.exec(req.url)?.[1];
    let ok=false;try{ok=response(read(),name,now());}catch{/* Missing, stale or corrupt state is unhealthy. */}
    const valid=req.method==='GET'&&req.headers.host==='playcrownlands.com'&&NAMES.includes(name);
    res.writeHead(valid?(ok?200:503):404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});
    res.end(valid?(ok?'Crownlands service ready.':'Crownlands service needs attention.'):'Not found');
  });
}
if(require.main===module){const s=createServer();s.listen(9295,'127.0.0.1');const stop=()=>s.close(()=>process.exit(0));process.once('SIGTERM',stop);process.once('SIGINT',stop);}
module.exports={NAMES,response,createServer};
