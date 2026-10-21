'use strict';
// Explicitly started only when testers are ready; no system service is installed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {createGameplayPilot}=require('./map-benchmark/seamless/gameplay-pilot');
const {createLiveServer}=require('./map-benchmark/seamless/live-server');
async function main(){
 if(!process.argv.includes('--start'))throw Error('Use --start when the sample-account pilot is ready to begin.');
 const host=process.argv.find(a=>a.startsWith('--host='))?.slice(7)||'127.0.0.1';
 const port=Number(process.argv.find(a=>a.startsWith('--port='))?.slice(7)||8804);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Choose an unprivileged port');
 const iface=Object.values(os.networkInterfaces()).flat().find(i=>i.family==='IPv4'&&i.address===host);
 if(!iface)throw Error('Choose an address on this computer');
 const pilot=await createGameplayPilot();let server,timer,closed=false;
 const folder=path.resolve('release-artifacts/continuous-gameplay-pilot-session');fs.mkdirSync(folder,{recursive:true,mode:0o700});fs.chmodSync(folder,0o700);
 const file=path.join(folder,`session-${port}.json`);
 if(fs.existsSync(file)){await pilot.close();throw Error('An existing pilot session file needs review before starting another session');}
 async function close(){if(closed)return;closed=true;clearTimeout(timer);try{await server?.close();await pilot.close();}finally{fs.rmSync(file,{force:true});}}
 try{
  const expiresAt=Date.now()+3600000,grants=pilot.players.map(u=>({uid:u.uid,key:crypto.randomBytes(32).toString('base64url'),expiresAt}));
  server=await createLiveServer({reader:pilot.reader,commands:pilot,grants,host,subnet:iface.cidr});
  const address=await server.listen(port);
  fs.writeFileSync(file,JSON.stringify({url:address.entry,expiresAt,schema:pilot.store.schema,accounts:grants.map((g,i)=>({name:pilot.players[i].name,key:g.key}))},null,2),{flag:'wx',mode:0o600});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void close());
  timer=setTimeout(()=>void close(),Math.max(1,expiresAt-Date.now()));
  console.log(`Private sample gameplay pilot: ${address.entry}\nTwo temporary account keys: ${file}\nExpires in one hour. No production accounts, commands, backups or external integrations.`);
 }catch(error){await close();throw error;}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
