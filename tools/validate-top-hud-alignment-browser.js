const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {CdpClient}=require('./map-benchmark/cdp-client');
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require('./validate-focused-browser-smoke');
const {createMapBenchmarkServer}=require('./map-benchmark/server');
const artifacts=path.resolve(__dirname,'../release-artifacts/top-hud-alignment');fs.mkdirSync(artifacts,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const server=createMapBenchmarkServer(),address=await server.listen();let browser,client;const records=[],errors=[],failed=[];try{
 browser=await startBrowserSession('C:/Program Files/Google/Chrome/Application/chrome.exe');client=await CdpClient.connect(browser.targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await client.send('Page.enable');await client.send('Runtime.enable');await client.send('Network.enable');
 client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 client.on('Network.responseReceived',e=>{if(e.response.status>=400&&['Script','Image','Stylesheet'].includes(e.type))failed.push(e.response.url);});
 const ev=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const shot=async name=>fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await client.send('Page.navigate',{url:address.url+'/docs/visual-qa/top-hud-alignment/preview.html?look=current&guide=off'});
 let ready=false;for(let i=0;i<500;i++){ready=await ev('document.documentElement?.dataset.hudAlignmentReady==="true"');if(ready)break;await pause(100);}assert(ready,JSON.stringify(errors));
 await ev('window.gameWindow=document.getElementById("game").contentWindow;void 0');
 const layout=()=>ev(`(()=>{const d=gameWindow.document;return ['.profile-action-row','.profile-gold','#profileBtn','#leaderboardBtn','#clanHudBtn','#dailyLoginRewardBtn'].map(selector=>{const e=d.querySelector(selector),r=e.getBoundingClientRect(),s=gameWindow.getComputedStyle(e);return {selector,x:r.x,y:r.y,width:r.width,height:r.height,background:s.backgroundImage,color:s.color,hit:e.contains(d.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});})()`);
 for(const [width,height] of [[1440,900],[844,390],[568,320]]){
  await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(150);
  await ev('gameWindow.HudAlignmentDraft.apply({look:"current",zoom:1,guide:false})');await pause(100);const before=await layout();await shot(width+'-current');
  await ev('gameWindow.HudAlignmentDraft.apply({look:"draft",zoom:1,guide:false})');await pause(100);const after=await layout();await shot(width+'-draft');
  for(let i=0;i<after.length;i++){const original=before[i],changed=after[i];assert.deepEqual({...changed,x:original.x},{...original},'Unexpected geometry, color or target change: '+width+' '+changed.selector);assert.equal(changed.x,original.x+(changed.selector==='.profile-gold'?0:-7));}
  assert.equal(after[0].x,after[1].x);assert(after.every(r=>r.x>=0));assert(after.slice(2).every(r=>r.hit));
  await ev('gameWindow.HudAlignmentDraft.apply({look:"draft",zoom:2.2,guide:true})');await pause(100);assert.deepEqual(await layout(),after,'Zoom changed HUD alignment');await shot(width+'-guide');
  records.push({width,height,beforeLeft:before[0].x,alignedLeft:after[0].x,goldLeft:after[1].x,buttonSizesUnchanged:true,hitTargets:true,zoomIndependent:true});
 }
 // Verify the review controls keep the nested preview at its chosen native size.
 await client.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
 await client.send('Page.navigate',{url:address.url+'/docs/visual-qa/top-hud-alignment/index.html?viewport=desktop'});
 ready=false;for(let i=0;i<500;i++){ready=await ev('document.getElementById("preview")?.contentDocument?.documentElement?.dataset.hudAlignmentReady==="true"');if(ready)break;await pause(100);}assert(ready);
 await ev('window.alignmentGame=document.getElementById("preview").contentWindow.document.getElementById("game").contentWindow;document.querySelector("[data-viewport=landscape]").click();document.querySelector("[data-look=current]").click();void 0');
 await pause(200);
 assert.deepEqual(await ev('({width:document.getElementById("preview").clientWidth,height:document.getElementById("preview").clientHeight,difference:alignmentGame.HudAlignmentDraft.measure().difference})'),{width:844,height:390,difference:7});
 await ev('document.querySelector("[data-look=draft]").click();document.getElementById("guide").click();void 0');await pause(100);
 assert.equal(await ev('alignmentGame.HudAlignmentDraft.measure().difference'),0);
 assert(await ev('alignmentGame.document.getElementById("hudAlignmentGuide").hidden'));
 await shot('review-landscape');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);fs.writeFileSync(path.join(artifacts,'checks.json'),JSON.stringify({passed:true,records,errors,failed},null,2));console.log(JSON.stringify({passed:true,records,errors,failed}));
}finally{if(client){await client.send('Browser.close').catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
