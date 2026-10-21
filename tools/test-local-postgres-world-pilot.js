'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {createGameplayPilot}=require('./map-benchmark/seamless/gameplay-pilot');
const {createLiveServer,ENTRY}=require('./map-benchmark/seamless/live-server');
const {CdpClient}=require('./map-benchmark/cdp-client');
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require('./validate-focused-browser-smoke');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const p=await createGameplayPilot(),grants=p.players.map(u=>({uid:u.uid,key:crypto.randomBytes(32).toString('base64url'),expiresAt:Date.now()+3600000}));
 let server;const browsers=[],clients=[],errors=[],external=[],measurements=[];
 const output=path.resolve('release-artifacts/continuous-gameplay-pilot');fs.mkdirSync(output,{recursive:true});
 try{
  server=await createLiveServer({reader:p.reader,commands:p,grants});const address=await server.listen();
  const cookies=[];
  for(const g of grants){const r=await fetch(address.url+ENTRY+'login',{method:'POST',headers:{origin:address.url,'content-type':'application/json'},body:JSON.stringify({key:g.key})});assert.equal(r.status,200);cookies.push(r.headers.get('set-cookie').split(';')[0]);}
  const request=async(i,name,data={},extra={})=>{const r=await fetch(address.url+ENTRY+'command',{method:'POST',headers:{origin:address.url,'content-type':'application/json',cookie:cookies[i],...extra},body:JSON.stringify({name,data})});return{status:r.status,body:await r.json()};};
  const key=c=>c.regionId+':'+c.id, uid=p.players[0].uid, source=p.pair[0], enemy=p.pair[1];
  const initial=await request(0,'options',{key:key(source)});assert.equal(initial.status,200);assert(initial.body.nearby.some(c=>c.key===key(enemy)),'Cross-edge scout omitted');assert.equal(initial.body.costs.regroup,require("../functions/economy-config.json").playerCosts.regroupGold);
  assert.equal((await request(0,'options',{}, {origin:'https://attacker.invalid'})).status,403);
  assert.equal((await request(0,'options',{}, {cookie:''})).status,401);
  assert.equal((await request(0,'claimStartingCity')).status,405);
  assert.equal((await request(1,'options',{key:key(source)})).body.nearby.length,0);
  const requestId='pilot_test_'+crypto.randomBytes(8).toString('hex');
  const scoutData={requestId,sourceRegionId:source.regionId,sourceCityId:source.id,targets:[{regionId:enemy.regionId,cityId:enemy.id}]};
  const scout=await request(0,'sendNearbyScouts',scoutData);assert.equal(scout.status,200,JSON.stringify(scout));
  assert.deepEqual((await request(0,'sendNearbyScouts',scoutData)).body,scout.body);
  const movement=(await p.store.doc('armies/'+scout.body.movementIds[0]).get()).data();
  assert.equal(movement.targetRegionId,enemy.regionId);assert(movement.pathSegments.every(s=>s.routingVersion==='open-world-draft-v1'));
  assert.equal((await request(1,'sendNearbyScouts',{...scoutData,requestId:requestId+'other'})).status,403);
  const distant=(await p.store.collectionGroup('cities').where('ownerUid','==',uid).get()).docs.map(d=>({id:d.id,...d.data()})).find(c=>p.routing.distance(c,source,p.context())>680);
  if(distant){const r=await request(0,'sendRegroupOrders',{requestId:requestId+'far',targetRegionId:source.regionId,targetCityId:source.id,sources:[{regionId:distant.regionId,cityId:distant.id}]});assert.equal(r.status,409);}
  await p.cityRef(enemy).update({ownerUid:uid,ownerKind:'player',ownerName:'Pilot Rowan',troops:200,troopFloat:200});
  const regroup=await request(0,'sendRegroupOrders',{requestId:requestId+'regroup',targetRegionId:source.regionId,targetCityId:source.id,sources:[{regionId:enemy.regionId,cityId:enemy.id}]});assert.equal(regroup.status,200,JSON.stringify(regroup));
  assert.equal((await p.store.doc('armies/'+regroup.body.movementIds[0]).get()).data().sourceRegionId,enemy.regionId);
  const regroupOptions=(await request(0,'options',{key:key(source)})).body;assert(!regroupOptions.regroup.some(c=>c.key===key(enemy)),'Empty city still selectable');
  // Boundary units and generated sections: template-local coordinates must not
  // collapse two different sections to distance zero.
  const section=p.reader.manifest.sections.at(-1),template=p.reader.sections.get(section.templateId);
  const {imageToGame}=require('./map-benchmark/seamless/live-catalog');
  const point={...imageToGame(section,{x:700,y:500}),regionId:section.id};
  if(template&&template.id!==section.id)assert(p.routing.distance(point,{...point,regionId:template.id},p.context())>680);
  const a={...imageToGame(section,{x:600,y:500}),regionId:section.id};
  const scale=p.reader.display.geometry.unitsPerPixel;
  assert(Math.abs(p.routing.distance(a,{...imageToGame(section,{x:600+420/scale,y:500}),regionId:section.id},p.context())-420)<1e-6);
  const action=(from,to,kind,id='pilot_'+crypto.randomBytes(8).toString('hex'))=>({armyId:id,sourceRegionId:from.regionId,targetRegionId:to.regionId,army:{id,fromId:from.id,toId:to.id,sourceRegionId:from.regionId,targetRegionId:to.regionId,kind,troops:10,requestedTroops:10}});
  const target=p.assignments.find(([,u])=>u.uid===p.players[1].uid)[0];
  const support=await request(0,'sendArmyOrder',action(source,target,'reinforce'));assert.equal(support.status,200,JSON.stringify(support));
  await p.store.doc('armies/'+support.body.movementId).update({arrivesAtMs:Date.now()-1000});await p.settle();
  const stationed=(await request(0,'options')).body.stationed;assert(stationed.length);
  assert.equal((await request(0,'returnClanReinforcement',{reinforcementId:stationed[0].id})).status,200);
  const objectiveMap=require('../functions/core-expansion-world-layout.json').maps.find(m=>m.objectives.length);
  const objective={...objectiveMap.objectives[0],regionId:objectiveMap.id};
  const rallyOrder=action(source,objective,'attack');rallyOrder.rallyId=rallyOrder.armyId;
  const rally=await request(0,'createClanRally',rallyOrder);assert.equal(rally.status,200,JSON.stringify(rally));assert(rally.body.rallyId);
  const joint=action(target,source,'rally_join');Object.assign(joint,{clanId:'pilot-clan',rallyId:rally.body.rallyId});
  const joined=await request(1,'joinClanRally',joint);assert.equal(joined.status,200,JSON.stringify(joined));
  if(joined.body.movementId){await p.store.doc('armies/'+joined.body.movementId).update({arrivesAtMs:Date.now()-1000});await p.settle();}
  assert((await request(1,'options')).body.rallies.some(r=>r.id===rally.body.rallyId&&r.joined));
  assert.equal((await request(1,'launchClanRally',{clanId:'pilot-clan',rallyId:rally.body.rallyId})).status,403);
  const withdrawn=await request(1,'withdrawClanRallyContribution',{clanId:'pilot-clan',rallyId:rally.body.rallyId});assert.equal(withdrawn.status,200,JSON.stringify(withdrawn));
  const cancelled=await request(0,'cancelClanRally',{clanId:'pilot-clan',rallyId:rally.body.rallyId});assert.equal(cancelled.status,200,JSON.stringify(cancelled));await p.settle();
  for(const d of (await p.store.collection('armies').where('status','==','active').get()).docs)await d.ref.update({arrivesAtMs:Date.now()-1000});await p.settle();
  const launchOrder=action(source,objective,'attack');launchOrder.rallyId=launchOrder.armyId;
  assert.equal((await request(0,'createClanRally',launchOrder)).status,200);
  const secondJoin=action(target,source,'rally_join');Object.assign(secondJoin,{clanId:'pilot-clan',rallyId:launchOrder.rallyId});
  const secondJoined=await request(1,'joinClanRally',secondJoin);assert.equal(secondJoined.status,200);
  if(secondJoined.body.movementId){await p.store.doc('armies/'+secondJoined.body.movementId).update({arrivesAtMs:Date.now()-1000});await p.settle();}
  const launched=await request(0,'launchClanRally',{clanId:'pilot-clan',rallyId:launchOrder.rallyId});assert.equal(launched.status,200,JSON.stringify(launched));
  const bad=await request(0,'sendNearbyScouts',{...scoutData,requestId:requestId+'bad',targets:[...scoutData.targets,...scoutData.targets]});assert.equal(bad.status,400);
  const deniedInactive=await request(0,'sendRegroupOrders',{requestId:requestId+'inactive',targetRegionId:source.regionId,targetCityId:source.id,sources:[{regionId:'new-lands-l99-p999',cityId:enemy.id}]});assert(deniedInactive.status>=400);
  // A temporary route-worker error must permit retrying exactly the same order.
  const retryOrder=action(source,p.assignments[1][0],'transfer'),calculate=p.routing.calculate;
  const troopsBefore=(await p.cityRef(source).get()).data().troops;
  p.routing.calculate=async()=>{throw Object.assign(Error('Private worker busy; retry'),{code:'unavailable'});};
  try{assert.equal((await request(0,'sendArmyOrder',retryOrder)).status,503);}finally{p.routing.calculate=calculate;}
  assert.equal((await p.cityRef(source).get()).data().troops,troopsBefore);assert(!(await p.store.doc('armies/'+retryOrder.armyId).get()).exists);
  assert.equal((await request(0,'sendArmyOrder',retryOrder)).status,200);
  // Browser tests use independent authenticated profiles, real HTTP commands,
  // throttled mobile viewports and same-origin network assertions.
  const evaluate=async(i,fn,arg)=>{const r=await clients[i].send('Runtime.evaluate',{expression:`(${fn.toString()})(${JSON.stringify(arg)||'undefined'})`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async(i,fn)=>{for(let n=0;n<150;n++){if(await evaluate(i,fn).catch(()=>false))return;await sleep(100);}throw Error('Browser condition timed out '+fn+' '+await evaluate(i,()=>document.body.innerText));};
  for(let i=0;i<2;i++){
   const browser=await startBrowserSession(process.env.CHROME_PATH||'/usr/bin/google-chrome');browsers.push(browser);
   const client=await CdpClient.connect(browser.targets.find(t=>t.type==='page').webSocketDebuggerUrl);clients.push(client);
   for(const d of ['Page','Runtime','Network'])await client.send(d+'.enable');
   client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));client.on('Network.requestWillBeSent',e=>{if(!e.request.url.startsWith(address.url+'/')&&!/^(blob:|data:)/.test(e.request.url))external.push(e.request.url);});
   await client.send('Network.setCookie',{name:cookies[i].split('=')[0],value:cookies[i].split('=')[1],url:address.url,httpOnly:true,sameSite:'Strict'});
   await client.send('Page.navigate',{url:address.entry});await wait(i,()=>window.seamlessPreview?.gameplay?.options&&seamlessPreview.snapshot().feed.objects>0);
  }
  assert.notEqual(await evaluate(0,()=>seamlessPreview.gameplay.options.viewer),await evaluate(1,()=>seamlessPreview.gameplay.options.viewer));
  const sources=p.assignments.filter(([,u])=>u.uid===uid).map(([c])=>c);
  const pick=async(c)=>{await evaluate(0,key=>{const g=seamlessPreview.gameplay;const own=g.options.owned.find(c=>c.key===key);g.source=own;g.invalidate();g.update();},key(c));};
  await pick(source);
  const destination=sources[1];
  await evaluate(0,key=>seamlessPreview.select(key),key(destination));
  await evaluate(0,()=>document.getElementById('pilot-preview').click());await wait(0,()=>!!seamlessPreview.gameplay.previewResult);
  await evaluate(0,()=>document.getElementById('pilot-send').click());await wait(0,()=>!seamlessPreview.gameplay.busy&&document.getElementById('pilot-status').textContent.includes('accepted'));
  const ownMarch=(await p.store.collection('armies').where('ownerUid','==',uid).where('kind','==','transfer').get()).docs.filter(d=>d.data().toId===destination.id).sort((a,b)=>b.data().launchedAtMs-a.data().launchedAtMs)[0];
  assert(ownMarch,'Browser did not launch a real command');
  const march=ownMarch.data(), projected=p.reader.march(ownMarch.id,march,march.routeRegionIds,Date.now());assert(projected.body.openWorldRoute);
  assert.equal(projected.route.points[0].x,p.reader.object(source.id,'cities',(await p.cityRef(source).get()).data(),p.reader.sections.get(source.regionId)).x);
  // Simulated progress is a test-only write; the pilot itself uses real times.
  await ownMarch.ref.update({launchedAtMs:Date.now()-10000,arrivesAtMs:Date.now()+10000,total:20});
  assert.equal((await request(0,'useRecallHorn',{armyId:ownMarch.id})).status,200);
  const recalled=(await ownMarch.ref.get()).data();const dto=p.reader.march(ownMarch.id,recalled,recalled.routeRegionIds,Date.now()).body;
  assert(dto.returning&&dto.returnStartProgress>0&&dto.returnStartProgress<1);
  for(const snapshot of (await p.store.collection('armies').where('status','==','active').get()).docs)await snapshot.ref.update({arrivesAtMs:Date.now()-1000});
  await p.settle();assert.equal((await ownMarch.ref.get()).data().status,'resolved');
  for(const [width,height]of[[1440,900],[844,390],[568,320]]){
   await clients[0].send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000});await clients[0].send('Emulation.setCPUThrottlingRate',{rate:width<1000?4:1});
   await evaluate(0,()=>seamlessPreview.home());await sleep(1200);
   await evaluate(0,key=>seamlessPreview.select(key),key(source));
   assert.equal(await evaluate(0,()=>{const a=document.querySelector('.pilot-console').getBoundingClientRect(),b=document.getElementById('inspector').getBoundingClientRect();return a.right>b.left&&a.bottom>b.top;}),false,'Panels overlap');
   assert.equal(await evaluate(0,()=>document.documentElement.scrollWidth>innerWidth),false);
   const pt=await evaluate(0,()=>{const e=document.getElementById('pilot-toggle');e.scrollIntoView();const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
   if(width<1000){await clients[0].send('Emulation.setTouchEmulationEnabled',{enabled:true});await clients[0].send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});await clients[0].send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await clients[0].send('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button:'left',clickCount:1});await clients[0].send('Input.dispatchMouseEvent',{type:'mouseReleased',...pt,button:'left',clickCount:1});}
   assert.equal(await evaluate(0,()=>document.getElementById('pilot-body').hidden),true);await evaluate(0,()=>document.getElementById('pilot-toggle').click());
   const timing=await evaluate(0,async()=>{const base=seamlessPreview.snapshot().camera;seamlessPreview.resetMetrics();const t=performance.now();await new Promise(resolve=>{function frame(now){const n=(now-t)/1000;seamlessPreview.view(base.x+Math.sin(n)*350,base.y+Math.cos(n)*180,base.zoom);if(n<4)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});const s=seamlessPreview.snapshot(),f=s.frameTimes.slice().sort((a,b)=>a-b);return{fps:1000/(f.reduce((a,b)=>a+b,0)/f.length),p95:f[Math.floor(f.length*.95)],nodes:s.nodes,listeners:s.listeners,assets:s.assets};});measurements.push({width,height,...timing});
   assert(timing.assets.full<=4&&timing.assets.thumbnails<=16&&timing.assets.peakRequests<=2);assert.equal(timing.assets.failed,0);
   await clients[0].send('Emulation.setCPUThrottlingRate',{rate:1});
   fs.writeFileSync(path.join(output,`pilot-${width}.png`),Buffer.from((await clients[0].send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  // Fresh ownership checks deny a previously valid source without a troop loss.
  await p.cityRef(source).update({ownerUid:p.players[1].uid});
  const denied=await request(0,'sendNearbyScouts',{...scoutData,requestId:requestId+'lost'});assert.equal(denied.status,403);
  grants[0].expiresAt=Date.now()-1; // server copied grant values; revoke using session logout
  await fetch(address.url+ENTRY+'logout',{method:'POST',headers:{origin:address.url,'content-type':'application/json',cookie:cookies[0]},body:'{}'});
  assert.equal((await request(0,'options')).status,401);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(p.metrics.settlementErrors,0);assert(measurements.every(m=>m.listeners===measurements[0].listeners));
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,sections:112,measurements,metrics:p.metrics},null,2));console.log(JSON.stringify({passed:true,measurements,commands:p.metrics.commands,resolved:p.metrics.resolved}));
 }finally{for(const c of clients){await c.send('Browser.close').catch(()=>{});c.close();}for(const b of browsers){if(!await waitForProcessExit(b.browserProcess)){b.browserProcess.kill('SIGKILL');await waitForProcessExit(b.browserProcess);}await removeBrowserProfile(b.profilePath);}await server?.close();await p.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
