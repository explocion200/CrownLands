"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const server=createMapBenchmarkServer(),address=await server.listen();let browser,client;
 const artifacts=path.resolve(__dirname,"../release-artifacts/main-screen-art");fs.mkdirSync(artifacts,{recursive:true});
 const errors=[],failedAssets=[],records=[];
 try{
  const executable=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));assert(executable);
  browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await client.send("Page.enable");await client.send("Runtime.enable");await client.send("Network.enable");
  client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  client.on("Network.responseReceived",e=>{if(e.response.status>=400&&["Image","Stylesheet","Script"].includes(e.type))failedAssets.push(e.response.url);});
  const ev=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<700;i++){if(await ev(expression))return;await delay(100);}throw Error("Timeout: "+expression+JSON.stringify(errors));};
  const shot=async name=>fs.writeFileSync(path.join(artifacts,name+".png"),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  const measure=()=>ev(`(()=>{const w=document.getElementById('game').contentWindow,d=w.document,ids=['profileBtn','leaderboardBtn','clanHudBtn','dailyLoginRewardBtn','inventoryBtn','shopBtn','cityListBtn','islandSwitchBtn','chatToggleBtn','logBtn','fullscreenBtn'];return{controls:ids.map(id=>{const e=d.getElementById(id),r=e.getBoundingClientRect();return{id,x:r.x,y:r.y,w:r.width,h:r.height,hit:e.contains(d.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),fits:r.x>=-1&&r.y>=-1&&r.right<=w.innerWidth+1&&r.bottom<=w.innerHeight+1};}),chat:{height:d.getElementById('quickChat').getBoundingClientRect().height,background:w.getComputedStyle(d.getElementById('quickChat')).backgroundImage},flag:d.getElementById('hudKingdomFlag').outerHTML,timerWidth:d.getElementById('combatTimers').getBoundingClientRect().width};})()`);
  await client.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/main-screen-art/preview.html"});
  await wait(`document.documentElement.dataset.hudArtReady==='true' && document.getElementById('game').contentDocument.documentElement.dataset.hudArtApplied==='true'`);
  await ev(`window.mapDraft=document.getElementById('game').contentWindow;void 0`);
  await wait(`mapDraft.HudArtDraft.assets.every(a=>[...mapDraft.document.images].some(i=>i.src.endsWith(a.asset)&&i.complete&&i.naturalWidth>0))`);
  for(const[width,height]of[[1440,900],[844,390],[568,320]]){
   await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});await delay(250);
   await ev(`mapDraft.HudArtDraft.apply({look:'current',sample:'active',zoom:1})`);await delay(150);
   const before=await measure();await shot(width+"-current");
   await ev(`mapDraft.HudArtDraft.apply({look:'draft',sample:'active',zoom:1})`);await delay(250);
   const after=await measure();await shot(width+"-draft");
   assert(await ev(`['incomingAttackBtn','outgoingAttackBtn'].every(id=>!mapDraft.document.getElementById(id).hidden)`),"Active fixture must show incoming and outgoing controls");
   assert.deepEqual(after.controls.map(({id,x,y,w,h})=>({id,x,y,w,h})),before.controls.map(({id,x,y,w,h})=>({id,x,y,w,h})),"Draft changed control geometry");
   assert.deepEqual(after.chat,before.chat,"Mini-chat size/transparency changed");assert.equal(after.flag,before.flag,"Saved heraldry changed");assert.equal(after.timerWidth,before.timerWidth);
   assert(after.controls.every(c=>c.fits&&c.hit),JSON.stringify({width,controls:after.controls}));
   await ev(`mapDraft.HudArtDraft.apply({look:'draft',sample:'active',zoom:2.2})`);
   const zoomed=await measure();assert.deepEqual(zoomed.controls.map(({id,w,h})=>({id,w,h})),after.controls.map(({id,w,h})=>({id,w,h})),"Map zoom resized HUD controls");
   await ev(`mapDraft.document.getElementById('chatToggleBtn').click()`);await delay(100);
   assert(await ev(`mapDraft.document.getElementById('quickChat').hidden`),"Chat arrow did not collapse preview");
   await ev(`mapDraft.document.getElementById('chatToggleBtn').click()`);await delay(100);
   assert(!await ev(`mapDraft.document.getElementById('quickChat').hidden`),"Chat arrow did not expand preview");
   await ev(`mapDraft.HudArtDraft.apply({look:'draft',sample:'protected',zoom:1})`);await delay(150);await shot(width+"-protected");
   assert.equal(await ev(`mapDraft.document.querySelectorAll('.effect-status-badge:not([hidden])').length`),4);
   await ev(`mapDraft.HudArtDraft.apply({look:'draft',sample:'quiet',zoom:1})`);await delay(150);
   assert.equal(await ev(`mapDraft.document.querySelectorAll('.effect-status-badge:not([hidden])').length`),0);
   await shot(width+"-quiet");records.push({width,height,geometryPreserved:true,chatPreserved:true,flagsPreserved:true,zoomIndependent:true,controlsHit:true});
  }
  // The review shell switches real, unscaled viewport dimensions and both looks.
  await client.send("Emulation.setDeviceMetricsOverride",{width:1520,height:1100,deviceScaleFactor:1,mobile:false});
  await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/main-screen-art/index.html?viewport=landscape"});
  await wait(`document.getElementById('preview')?.contentDocument?.documentElement.dataset.hudArtReady==='true'`);
  await ev(`window.reviewFrame=document.getElementById('preview');window.reviewMap=reviewFrame.contentWindow.document.getElementById('game').contentWindow;void 0`);
  await wait(`reviewMap.document.documentElement.dataset.hudArtApplied==='true'`);
  assert.equal(await ev(`reviewFrame.clientWidth`),844);
  await ev(`document.querySelector('[data-look=current]').click()`);await wait(`reviewMap.document.documentElement.dataset.hudArtLook==='current'`);
  await ev(`document.querySelector('[data-look=draft]').click();document.getElementById('sample').value='protected';document.getElementById('sample').dispatchEvent(new Event('change'))`);
  await wait(`reviewMap.document.documentElement.dataset.hudArtLook==='draft'&&reviewMap.document.querySelectorAll('.effect-status-badge:not([hidden])').length===4`);
  await ev(`document.querySelector('[data-viewport=small]').click()`);await delay(200);
  assert.equal(await ev(`reviewFrame.clientWidth`),568);assert.equal(await ev(`reviewMap.innerWidth`),568);
  await ev(`document.querySelector('[data-viewport=landscape]').click()`);await delay(200);await shot("review-landscape");
  assert(await ev(`[...document.querySelectorAll('#artGrid img')].every(i=>i.complete&&i.naturalWidth>0)`));
  assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
  fs.writeFileSync(path.join(artifacts,"checks.json"),JSON.stringify({passed:true,records,errors,failedAssets},null,2));console.log(JSON.stringify({passed:true,records,errors,failedAssets}));
 }finally{if(client){await client.send("Browser.close").catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
