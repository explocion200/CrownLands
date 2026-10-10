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
const innerCityArt=JSON.parse(fs.readFileSync(path.join(root,"assets/optimized/manifest.json"),"utf8")).assets.find(a=>a.id==="hud-inner-city-ink");
assert(innerCityArt&&innerCityArt.hasAlpha&&innerCityArt.width===192&&innerCityArt.height===192);
assets["inner-city"]=innerCityArt.output;
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root,innerCityArt.output))).digest("hex"),innerCityArt.sha256);
const provenance=JSON.parse(fs.readFileSync(path.join(root,"docs/art-sources/inner-city-hud/provenance.json"),"utf8"));
const source=fs.readFileSync(path.join(root,innerCityArt.source));
assert.equal(crypto.createHash("sha256").update(source).digest("hex"),provenance.sourceSha256);
assert.deepEqual([source.readUInt32BE(16),source.readUInt32BE(20)],provenance.sourceDimensions);
assert.equal(provenance.runtimeSha256,innerCityArt.sha256);
assert(!fs.readFileSync(path.join(root,"service-worker.js"),"utf8").includes(innerCityArt.output),"The shortcut artwork must use the runtime cache");
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
  const wait=async expression=>{for(let i=0;i<700;i++){if(await ev(expression))return;await delay(80);}throw Error("Timeout: "+expression+JSON.stringify({errors,state:await ev(`({focus:document.activeElement?.id,hasFocus:document.hasFocus(),modal:document.getElementById('modal').open,title:document.getElementById('modalTitle').textContent})`)}));};
  const shot=async name=>fs.writeFileSync(path.join(artifacts,name+".png"),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  // Wait for finite hover/focus color transitions before comparing static HUD styles.
  const layout=()=>ev(`(async()=>{const ids=['profileBtn','leaderboardBtn','clanHudBtn','dailyLoginRewardBtn','innerCityHudBtn','inventoryBtn','shopBtn','cityListBtn','islandSwitchBtn','chatToggleBtn','logBtn','fullscreenBtn'];await Promise.all(ids.flatMap(id=>document.getElementById(id).getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))));return ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),s=getComputedStyle(e);return{id,width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),fits:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,background:s.backgroundImage,color:s.color,border:s.borderColor};});})()`);
  const click=async id=>{const r=await ev(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...r});await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...r});};
  await client.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick"});
  await client.send("Page.bringToFront");
  await wait(`document.documentElement?.dataset.crownlandsBenchmarkReady==='true'`);
  assert(await ev(`document.body.classList.contains('hud-illustrated')&&!window.HudArtDraft`),"Actual game must use production art without preview injection");
  await ev(`window.hudArtExpected=${JSON.stringify(assets)};void 0`);
  await wait(`[['bag','#inventoryBtn img'],['shop','#shopBtn img'],['cities','#cityListBtn img'],['map','#islandSwitchBtn img'],['leaderboard','#leaderboardBtn img'],['daily-reward','#dailyLoginRewardBtn img']].every(([key,selector])=>{const i=document.querySelector(selector);return i.src.endsWith(hudArtExpected[key])&&i.complete&&i.naturalWidth===384;})`);
  assert(await ev(`getComputedStyle(document.getElementById('profileBtn'),'::before').backgroundImage.includes(hudArtExpected['profile-frame'])`));
  assert.equal(await ev(`document.querySelector('#logBtn .report-icon use').getAttribute('href')`),"assets/icons/battle-reports-ledger-r1.svg#dispatch");
  await wait(`document.querySelector('#innerCityHudBtn img').complete&&document.querySelector('#innerCityHudBtn img').naturalWidth===192`);
  assert(await ev(`(()=>{const i=document.querySelector('#innerCityHudBtn img'),c=document.createElement('canvas');c.width=c.height=192;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return ctx.getImageData(0,0,1,1).data[3]===0&&ctx.getImageData(96,96,1,1).data[3]>240;})()`),"Shortcut artwork must preserve transparent padding and a solid castle");
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
   assert(await ev(`(()=>{const b=document.getElementById('innerCityHudBtn'),r=b.getBoundingClientRect(),d=document.getElementById('dailyLoginRewardBtn').getBoundingClientRect();return b.previousElementSibling.id==='dailyLoginRewardBtn'&&r.left>=d.right&&Math.abs(r.top+r.height/2-d.top-d.height/2)<1&&r.width>=44&&r.height>=44&&b.getAttribute('aria-label')==='Open Inner Castle';})()`),"Inner Castle must stay adjacent to Dailies with a usable target");
   const realmBefore=await ev(`({region:getActiveMapRegionId(),transform:document.getElementById('mapWorld').style.transform})`);
   const readyEstate=()=>wait(`document.getElementById('modal').open&&document.querySelector('.estate-viewport')&&document.querySelectorAll('[data-estate-site]').length===20`);
   const backRealm=async()=>{await ev(`document.querySelector('[data-inner-castle-back]').click()`);await wait(`!document.getElementById('modal').open`);assert.deepEqual(await ev(`({region:getActiveMapRegionId(),transform:document.getElementById('mapWorld').style.transform})`),realmBefore,"Shortcut must retain the realm region and camera");assert(await ev(`document.activeElement.id==='mapFrame'&&!innerCastleEstateView`),"Back must focus the realm and dispose the estate");await delay(80);};
   await click("innerCityHudBtn");await readyEstate();await backRealm();
   // The desktop Profile leaves this HUD target exposed; on small screens the
   // Profile intentionally covers the map controls and offers its own entry.
   if(width===1440){
    await click("profileBtn");await wait(`document.getElementById('profileScreen').classList.contains('open')`);await click("innerCityHudBtn");await readyEstate();assert(await ev(`!document.getElementById('profileScreen').classList.contains('open')`),"An open desktop Profile must not consume the shortcut tap");await backRealm();
    const savedFlag=await ev(`getFlagEditorSignature(state.flag)`);
    await click("profileBtn");await ev(`document.getElementById('profileFlagBtn').click();document.querySelector('#flagPrimaryColors [aria-pressed="false"]').click()`);
    assert(await ev(`isFlagEditorDirty()`));await click("innerCityHudBtn");await wait(`document.getElementById('flagDiscardDialog').open`);
    await click("flagStayEditingBtn");await wait(`!document.getElementById('flagDiscardDialog').open`);assert(await ev(`isFlagEditorDirty()&&!document.getElementById('modal').open`),"Stay Editing must retain the draft");
    await click("innerCityHudBtn");await wait(`document.getElementById('flagDiscardDialog').open`);await click("flagDiscardChangesBtn");await readyEstate();assert.equal(await ev(`getFlagEditorSignature(state.flag)`),savedFlag);await backRealm();
    const originalHeroLevel=await ev(`state.character.level`);
    await click("profileBtn");await ev(`state.character.level=25;document.getElementById('skillsTabBtn').click();document.querySelector('[data-skill-preset-slot="1"]').click();const input=document.getElementById('skillPresetNameInput');input.value='Unsaved QA';input.dispatchEvent(new Event('input',{bubbles:true}))`);
    assert(await ev(`isSelectedSkillPresetDraftDirty()`));await click("innerCityHudBtn");await wait(`document.getElementById('skillPresetExitDialog').open`);
    await ev(`document.querySelector('#skillPresetExitDialog [value="cancel"]').click()`);await wait(`!document.getElementById('skillPresetExitDialog').open`);assert(await ev(`isSelectedSkillPresetDraftDirty()&&!document.getElementById('modal').open`),"Cancel must retain the preset draft");
    await click("innerCityHudBtn");await wait(`document.getElementById('skillPresetExitDialog').open`);await ev(`document.querySelector('#skillPresetExitDialog [value="discard"]').click()`);await readyEstate();await backRealm();await ev(`state.character.level=${originalHeroLevel}`);
   }
   for(const [key,code,vk]of[['Enter','Enter',13],[' ','Space',32]]){console.log(`Inner Castle keyboard: ${width}x${height} ${code}`);await ev(`document.getElementById('innerCityHudBtn').focus()`);const text=key==='Enter'?'\r':' ';await client.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,text,unmodifiedText:text,windowsVirtualKeyCode:vk});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});await readyEstate();await backRealm();}
   if(width<1000){await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});const p=await ev(`(()=>{const r=document.getElementById('innerCityHudBtn').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await readyEstate();await backRealm();await client.send('Emulation.setTouchEmulationEnabled',{enabled:false});}
   await ev(`window.hudShortcutMainId=state.mainCityId;state.mainCityId=''`);await click("innerCityHudBtn");assert(await ev(`!document.getElementById('modal').open`),"Unavailable Main City must not open another estate");await ev(`state.mainCityId=hudShortcutMainId`);
   records.push({width,height,actualNavigation:true,innerCityShortcut:{adjacent:true,mouse:true,keyboard:true,touch:width<1000,exposedProfileEntry:width===1440,unsavedProfileGuards:width===1440,realmCameraRetained:true,unavailableCityGuard:true},geometryAndColorsPreserved:true,zoomIndependent:true,reportsAlignedInset:inset[0]});
  }
  await ev(`switchOnlineIsland(__CROWNLANDS_BENCHMARK__.fixture.neighborRegionId,{fromMapPicker:true})`);await wait(`getActiveMapRegionId()===__CROWNLANDS_BENCHMARK__.fixture.neighborRegionId&&!isMapInteractionBlocked()`);
  assert(await ev(`getCityRegionId(state.mainCityId)!==getActiveMapRegionId()`),"Off-map case must actually view another region");
  const awayCamera=await ev(`({region:getActiveMapRegionId(),camera:{...camera},zoom})`);
  await click("innerCityHudBtn");await wait(`document.getElementById('modal').open&&document.querySelector('.estate-viewport')&&document.querySelectorAll('[data-estate-site]').length===20`);
  assert(await ev(`document.getElementById('modal').dataset.innerCastleCityId===state.mainCityId`),"Shortcut must resolve the player's off-map Main City");
  await ev(`document.querySelector('[data-inner-castle-back]').click()`);assert.deepEqual(await ev(`({region:getActiveMapRegionId(),camera:{...camera},zoom})`),awayCamera,"Off-map entry must not move the realm camera");
  assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
  fs.writeFileSync(path.join(artifacts,"checks.json"),JSON.stringify({passed:true,assets,records,offMapEntry:true,errors,failedAssets},null,2));console.log(JSON.stringify({passed:true,records,offMapEntry:true,errors,failedAssets}));
 }finally{if(client){await client.send("Browser.close").catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
