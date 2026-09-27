/* Reproduce large-inventory rendering with synthetic gear, local APIs and 4x CPU throttling. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const G=require('../common-gear');
const {CdpClient}=require('../tools/map-benchmark/cdp-client');
const {createMapBenchmarkServer}=require('../tools/map-benchmark/server');
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require('../tools/validate-focused-browser-smoke');
(async()=>{const server=createMapBenchmarkServer(),address=await server.listen();let session,client;try{
 const browser=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));assert(browser,'Chromium required');session=await startBrowserSession(browser);client=await CdpClient.connect(session.targets.find(t=>t.type==='page').webSocketDebuggerUrl);await client.send('Runtime.enable');await client.send('Page.enable');
 const ev=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 await client.send('Page.navigate',{url:address.url+'/__benchmark__/?scenario=A&visualMarches=0'});
 for(let i=0;i<480;i++){if(await ev("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'"))break;await new Promise(r=>setTimeout(r,125));}
 assert(await ev("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'"),'Benchmark did not start');
 await ev("window.__CROWNLANDS_BENCHMARK__.closeModal();state.gold=1e15;authoritativeShopPricing={rawBaseGoldPerHour:48000};void 0");
 await client.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:false});await client.send('Emulation.setCPUThrottlingRate',{rate:4});
 await ev("window.__gearRateCalls=0;window.__gearOriginalRate=getHarvestBonusBaseRates;getHarvestBonusBaseRates=(...args)=>{__gearRateCalls++;return __gearOriginalRate(...args)};void 0");
 const results=[];
 for(const count of [32,2000]){
 const g=G.createDefaultState();for(let i=0;i<count;i++){const id='perf-'+i,d=G.DEFINITIONS[i%G.DEFINITIONS.length];g.instances[id]=G.normalizeInstance({instanceId:id,gearKey:d.gearKey,level:Math.floor(i/G.DEFINITIONS.length)%5+1});}
 await ev(`state.gear=normalizeCommonGearState(${JSON.stringify(g)});selectedCommonGearInstanceId='perf-0';selectedCommonGearSlot='head';void 0`);
 const times=[];for(let i=0;i<3;i++)times.push(await ev("(()=>{const start=performance.now();renderCommonGearBuilding('barracks');modal.getBoundingClientRect();return performance.now()-start})()"));results.push({count,cpuThrottle:4,viewport:'844x390',renderAndLayoutMs:times});assert.equal(await ev('__gearRateCalls'),0,'Authoritative pricing must not rescan city production');assert.equal(await ev("createCommonGearViewModel('barracks').upgradeGold"),24000);}
 await ev("authoritativeShopPricing=null;__gearRateCalls=0;renderCommonGearBuilding('barracks');void 0");assert.equal(await ev('__gearRateCalls'),1,'Fallback production must be calculated once for the whole inventory');
 fs.mkdirSync(path.join(root,'release-artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'release-artifacts/gear-inventory-perf.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{if(client)await client.send('Browser.close').catch(()=>{});if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}await server.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
