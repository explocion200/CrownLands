"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto"),http=require("node:http");
const {createFixture}=require("./map-benchmark/seamless/live-test-fixture"),{createLiveServer,ENTRY}=require("./map-benchmark/seamless/live-server");
const {createCohortAccess}=require("./map-benchmark/seamless/cohort-access");
const {AuthService}=require("../local-backend/auth"),{COOKIE}=require("../local-backend/auth-http"),{createLocalPassword}=require("../local-backend/passwords");
async function main(){
  const f=await createFixture({players:3,appearances:true});let server;
  try{
    const auth=new AuthService({store:f.store,rateKey:crypto.randomBytes(32)});await auth.initialize();const sessions=[];
    for(const [i,g]of f.grants.entries()){
      const password=crypto.randomBytes(24).toString('base64url'),email=`cohort-${i}@example.test`;
      await f.store.pool.query(`INSERT INTO ${f.store.schema}.accounts(uid,body) VALUES($1,$2)`,[g.uid,{localId:g.uid,email,emailVerified:true,localPassword:await createLocalPassword(password)}]);
      sessions.push(await auth.passwordSignIn(email,password,'127.0.0.1'));
    }
    let now=Date.now();const options={auth,allowedUids:f.grants.slice(0,2).map(g=>g.uid),origin:'https://pilot.example',subnet:'192.168.1.0/24',expiresAt:now+60000,clock:()=>now};
    for(const invalid of[{origin:'http://pilot.example'},{allowedUids:[]},{allowedUids:Array(6).fill('fixture')},{subnet:'0.0.0.0/0'},{expiresAt:now+3600001}])assert.throws(()=>createCohortAccess({...options,...invalid}));
    const cohort=createCohortAccess(options);assert.equal(cohort.accepts({socket:{remoteAddress:'203.0.113.1'},headers:{'x-forwarded-proto':'https','x-crownlands-client-ip':'192.168.1.7'}}),false);
    server=await createLiveServer({reader:f.reader,cohort,clock:()=>now});const address=await server.listen();
    const base={host:'pilot.example',origin:options.origin,'x-forwarded-proto':'https','x-crownlands-client-ip':'192.168.1.7'};
    // Node's fetch replaces Host; use HTTP to exercise the same header contract
    // that a deliberately installed loopback HTTPS proxy would forward.
    const request=(i,route=ENTRY+'catalog',extra={},method='GET')=>new Promise((resolve,reject)=>{
      const req=http.request(address.localUrl+route,{method,headers:{...base,...(i==null?{}:{cookie:COOKIE+'='+sessions[i].token}),...extra}},res=>{
        const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
      });req.on('error',reject);req.end();
    });
    assert.equal((await request(null)).status,401);assert.equal((await request(2)).status,403);
    assert.equal((await request(0,undefined,{'x-crownlands-client-ip':'203.0.113.7'})).status,403);
    assert.equal((await request(0,undefined,{'x-forwarded-proto':'http'})).status,403);
    assert.equal((await request(0,undefined,{origin:'https://outside.example'})).status,403);
    const before=(await f.store.pool.query(`SELECT count(*)::int AS sessions FROM ${f.store.schema}.auth_sessions`)).rows[0];
    for(const i of[0,1]){const result=await request(i);assert.equal(result.status,200);assert.equal((await result.json()).cohortReadOnly,true);}
    const home=f.reader.manifest.homeSectionId,route=ENTRY+'changes?'+new URLSearchParams({realm:f.reader.manifest.realmId,ids:home,uid:f.grants[2].uid});
    const own=await(await request(0,route)).json(),other=await(await request(1,route)).json(),city=own.objects.upsert.find(o=>o.kind==='castle'&&o.troopVisibility==='exact');
    assert.ok(city);assert.equal(other.objects.upsert.find(o=>o.key===city.key).troopVisibility,'hidden');
    for(const denied of[ENTRY+'login',ENTRY+'logout','/api/local-game/v1/call/sendArmy','/local-auth/v1/login'])assert.equal((await request(0,denied,{},'POST')).status,405);
    const html=await(await request(0,ENTRY)).text();assert.ok(html.includes('crownlands-private-preview-origin'));assert.ok(!html.includes('id="password"'));
    assert.deepEqual((await f.store.pool.query(`SELECT count(*)::int AS sessions FROM ${f.store.schema}.auth_sessions`)).rows[0],before,'Pilot created/replaced a normal game session');
    await f.store.pool.query(`UPDATE ${f.store.schema}.accounts SET body=body||'{"disabled":true}'::jsonb WHERE uid=$1`,[f.grants[0].uid]);assert.equal((await request(0)).status,401);
    // Revoke after the data read but before its response leaves the server.
    now+=1000;const read=f.reader.read.bind(f.reader);f.reader.read=async(...args)=>{const result=await read(...args);await auth.signOut(sessions[1].token);return result;};
    assert.equal((await request(1,route)).status,401);f.reader.read=read;
    assert.equal((await request(1)).status,401);
    now+=61000;assert.equal((await request(2)).status,410);
    console.log('Prepared private pilot: existing AuthService sessions, two allowed viewers, third-account denial, fresh revocation, HTTPS/proxy/subnet/expiry checks and no sign-in/game mutations passed. No route was installed.');
  }finally{await server?.close();await f.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
