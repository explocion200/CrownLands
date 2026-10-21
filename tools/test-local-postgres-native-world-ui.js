"use strict";
// Opt-in local integration: real game UI and handlers, disposable sample schema.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createGameplayPilot}=require("./map-benchmark/seamless/gameplay-pilot");
const {createNativeFixture}=require("./map-benchmark/seamless/native-fixture");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const pilot=await createGameplayPilot();let server,browser,client;
 const output=path.resolve("release-artifacts/continuous-native-ui");fs.mkdirSync(output,{recursive:true});
 const errors=[],external=[],results=[];
 try{
  const fixture=createNativeFixture(), uid=pilot.players[0].uid;
  fixture.player.uid=uid;fixture.player.displayName="Pilot Rowan";fixture.commandNonce=crypto.randomBytes(24).toString("hex");
  for(const [region,rows] of Object.entries(fixture.citiesByRegion))for(const row of rows){
    if(row.ownerUid){row.ownerUid=uid;row.ownerName=fixture.player.displayName;}
    const ref=pilot.cityRef({regionId:region,id:row.id});const existing=(await ref.get()).data();assert(existing);
    await ref.update({...row,troopFloat:row.troops});
  }
  const calls=[];
  server=createMapBenchmarkServer({nativeFixture:fixture,nativeCommand:async(name,data)=>{const r=await pilot.execute(uid,name,data,{nativeUi:true});calls.push({name,from:data.fromId||data.army?.fromId,to:data.toId||data.army?.toId,sourceRegion:data.sourceRegionId,targetRegion:data.targetRegionId});return r;}});
  const address=await server.listen();
  browser=await startBrowserSession(process.env.CHROME_PATH||"/usr/bin/google-chrome");
  client=await CdpClient.connect(browser.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  for(const d of ["Page","Runtime","Network"])await client.send(d+".enable");
  client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  client.on("Network.requestWillBeSent",e=>{if(!e.request.url.startsWith(address.url+"/")&&!/^(blob:|data:)/.test(e.request.url))external.push(e.request.url);});
  const evaluate=async(expression)=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async(expression)=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await sleep(100);}throw Error("Timed out: "+expression+"\n"+await evaluate("document.body.innerText"));};
  await client.send("Page.navigate",{url:address.url+"/__benchmark__/?nativeWorld=1"});
  await wait("!!window.nativeContinuousWorld");
  const source=fixture.citiesByRegion[fixture.primaryRegionId][0],target=fixture.citiesByRegion[fixture.neighborRegionId][4];
  const select=async(region,id)=>{await evaluate(`nativeContinuousWorld.view.select(${JSON.stringify(JSON.stringify([region,id]))})`);await wait("!nativeContinuousWorld.bridge.running");await sleep(100);};
  await select(fixture.primaryRegionId,source.id);
  assert.equal(await evaluate("selectedSourceId"),source.id);
  await wait('!!document.querySelector("#continuous-game-actions .wheel-send")');
  await evaluate('document.querySelector("#continuous-game-actions .wheel-info").click()');
  assert(await evaluate("modal.open"),"Original city info dialog did not open");
  await evaluate("modal.close()");
  await evaluate('document.querySelector("#continuous-game-actions .wheel-send").click()');
  assert(await evaluate("sendMode"));
  await select(fixture.neighborRegionId,target.id);
  assert.deepEqual(await evaluate("[selectedSourceId,selectedTargetId]"),[source.id,target.id]);
  await wait('modal.open && !!document.querySelector("#troopSliderConfirm")');
  await wait('!document.querySelector("#troopSliderConfirm").disabled');
  await evaluate('document.querySelector("#troopAmountSlider").value="2000";document.querySelector("#troopAmountSlider").dispatchEvent(new Event("input",{bubbles:true}))');
  await sleep(500);
  await evaluate('document.querySelector("#troopSliderConfirm").click()');
  for(let i=0;i<100&&!calls.some(c=>c.name==="sendArmyOrder");i++)await sleep(100);
  assert(calls.some(c=>c.name==="sendArmyOrder"&&c.from===source.id&&c.to===target.id&&c.targetRegion===fixture.neighborRegionId),"Native order did not reach the real handler: "+JSON.stringify(errors)+await evaluate("document.body.innerText.slice(-1600)"));
  const orders=await pilot.store.collection("armies").where("ownerUid","==",uid).where("status","==","active").get();
  assert(orders.docs.some(d=>d.data().fromId===source.id&&d.data().toId===target.id),"Real march not saved");
  for(const [width,height] of [[1440,900],[844,390],[568,320]]){
    await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<1000});
    await client.send("Emulation.setCPUThrottlingRate",{rate:width<1000?4:1});
    await evaluate("modal.close();sendMode=false;clearSelection(false);nativeContinuousWorld.view.home()");
    await select(fixture.primaryRegionId,source.id);await sleep(300);
    const boxes=await evaluate(`Array.from(document.querySelectorAll("#continuous-game-actions button:not([disabled])")).map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})`);
    assert(boxes.every(r=>r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height));
    await client.send("Page.bringToFront");
    const legacyCamera=await evaluate("JSON.stringify(camera)");
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:width*.6,y:height*.65,id:1}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:width*.6-75,y:height*.65-20,id:1}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    assert.equal(await evaluate("JSON.stringify(camera)"),legacyCamera,"Native map handler also consumed continuous touch drag");
    await evaluate("nativeContinuousWorld.view.resetMetrics()");
    for(let i=0;i<50;i++){await evaluate(`nativeContinuousWorld.view.view(${2000+i*18},${1000+i*5})`);await sleep(25);}
    const sample=await evaluate("nativeContinuousWorld.view.snapshot()");
    const times=sample.frameTimes.sort((a,b)=>a-b);results.push({width,height,frames:times.length,p95:times[Math.floor(times.length*.95)],fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),nodes:sample.nodes,assets:sample.assets});
    assert(sample.assets.full<=4);assert(sample.assets.peakRequests<=2);
    await evaluate("nativeContinuousWorld.view.home()");await select(fixture.primaryRegionId,source.id);await sleep(250);
    const shot=await client.send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(output,`native-${width}.png`),Buffer.from(shot.data,"base64"));
  }
  assert.equal(external.length,0,JSON.stringify(external));assert.equal(errors.length,0,errors.join("\n"));
  await evaluate("onlineSessionGeneration += 1");await wait("!window.nativeContinuousWorld");assert(await evaluate("!window.nativeContinuousWorld && !mapWorld.hidden"));
  fs.writeFileSync(path.join(output,"report.json"),JSON.stringify({results,calls,errors,external},null,2));
  console.log(JSON.stringify({results,calls}));
 }finally{
  client?.close();if(browser){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);await removeBrowserProfile(browser.profilePath);}
  await server?.close();await pilot.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
