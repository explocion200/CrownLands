"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const root=path.resolve(__dirname,".."),assets={};
for(const key of["bag","shop","cities","map","leaderboard","daily-reward","profile-frame"]){
 const approved=fs.readFileSync(path.join(root,"docs/visual-qa/main-screen-art/art/hud-"+key+"-r1.webp"));
 const hash=crypto.createHash("sha256").update(approved).digest("hex").slice(0,12),size=key==="profile-frame"?"512x400":"384x384";
 assets[key]="assets/optimized/hud-"+key+"-ink-"+size+"-"+hash+".webp";
 assert.deepEqual(fs.readFileSync(path.join(root,assets[key])),approved,"Runtime artwork differs from approved draft");
 assert(!fs.readFileSync(path.join(root,"service-worker.js"),"utf8").includes(assets[key]),"HUD artwork must use the existing runtime cache, not increase the install preload");
}
assert(fs.readFileSync(path.join(root,"service-worker.js"),"utf8").includes('/main-screen-art-ui.css?v='),"HUD stylesheet missing from offline shell");
(async()=>{
 const server=createMapBenchmarkServer(),address=await server.listen();let browser,client;
 const artifacts=path.join(root,"release-artifacts/main-screen-art-game");fs.mkdirSync(artifacts,{recursive:true});
 const errors=[],failedAssets=[],records=[];
 try{
  const executable=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));assert(executable);
  browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await client.send("Page.enable");await client.send("Runtime.enable");await client.send("Network.enable");
  client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  client.on("Network.responseReceived",e=>{if(e.response.status>=400&&["Image","Stylesheet","Script"].includes(e.type))failedAssets.push(e.response.url);});
  const ev=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<700;i++){if(await ev(expression))return;await delay(80);}throw Error("Timeout: "+expression+JSON.stringify(errors));};
  const shot=async name=>fs.writeFileSync(path.join(artifacts,name+".png"),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  // Wait for finite hover/focus color transitions before comparing static HUD styles.
  const layout=()=>ev(`(async()=>{const ids=['profileBtn','leaderboardBtn','clanHudBtn','dailyLoginRewardBtn','inventoryBtn','shopBtn','cityListBtn','islandSwitchBtn','chatToggleBtn','logBtn','fullscreenBtn'];await Promise.all(ids.flatMap(id=>document.getElementById(id).getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))));return ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),s=getComputedStyle(e);return{id,width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),fits:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,background:s.backgroundImage,color:s.color,border:s.borderColor};});})()`);
  const click=async id=>{const r=await ev(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...r});await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...r});};
  await client.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick"});
  await wait(`document.documentElement?.dataset.crownlandsBenchmarkReady==='true'`);
  assert(await ev(`document.body.classList.contains('hud-illustrated')&&!window.HudArtDraft`),"Actual game must use production art without preview injection");
  await ev(`window.hudArtExpected=${JSON.stringify(assets)};void 0`);
  await wait(`[['bag','#inventoryBtn img'],['shop','#shopBtn img'],['cities','#cityListBtn img'],['map','#islandSwitchBtn img'],['leaderboard','#leaderboardBtn img'],['daily-reward','#dailyLoginRewardBtn img']].every(([key,selector])=>{const i=document.querySelector(selector);return i.src.endsWith(hudArtExpected[key])&&i.complete&&i.naturalWidth===384;})`);
  assert(await ev(`getComputedStyle(document.getElementById('profileBtn'),'::before').backgroundImage.includes(hudArtExpected['profile-frame'])`));
  assert.equal(await ev(`document.querySelector('#logBtn .report-icon use').getAttribute('href')`),"assets/icons/battle-reports-ledger-r1.svg#dispatch");
  for(const[width,height]of[[1440,900],[844,390],[568,320]]){
   await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});await delay(180);
   await ev(`__CROWNLANDS_BENCHMARK__.setVisualZoom(1)`);
   const art=await layout();assert(art.every(c=>c.fits&&c.hit),JSON.stringify({width,art}));
   const inset=await ev(`['.profile-action-row','.profile-gold','#logBtn'].map(s=>document.querySelector(s).getBoundingClientRect().left)`);
   assert.deepEqual(inset,[12,12,12],"Production player row and Gold must align with Reports");
   await ev(`document.body.classList.remove('hud-illustrated')`);assert.deepEqual(await layout(),art,"Artwork skin changes HUD geometry or original colors");
   await ev(`document.body.classList.add('hud-illustrated')`);await shot(width+"-integrated");
   await ev(`__CROWNLANDS_BENCHMARK__.setVisualZoom(2.2)`);assert.deepEqual(await layout(),art,"Zoom changes main-screen controls");
   await click("chatToggleBtn");await wait(`document.getElementById('quickChat').hidden`);await click("chatToggleBtn");await wait(`!document.getElementById('quickChat').hidden`);
   // Actual pointer clicks hit the existing handlers with the replacement art.
   for(const id of["inventoryBtn","shopBtn","cityListBtn","islandSwitchBtn","leaderboardBtn","dailyLoginRewardBtn","logBtn"]){
    await click(id);await wait(`document.getElementById('modal').open`);await ev(`__CROWNLANDS_BENCHMARK__.closeModal()`);await delay(50);
   }
   await click("profileBtn");await wait(`document.getElementById('profileScreen').classList.contains('open')`);await ev(`document.getElementById('profileCloseBtn').click()`);
   records.push({width,height,actualNavigation:true,geometryAndColorsPreserved:true,zoomIndependent:true,reportsAlignedInset:inset[0]});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
  fs.writeFileSync(path.join(artifacts,"checks.json"),JSON.stringify({passed:true,assets,records,errors,failedAssets},null,2));console.log(JSON.stringify({passed:true,records,errors,failedAssets}));
 }finally{if(client){await client.send("Browser.close").catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
