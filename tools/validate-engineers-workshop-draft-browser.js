"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const B=require("../clan-tower-buildings");
const directory=path.resolve(__dirname,"../release-artifacts/engineers-workshop");fs.mkdirSync(directory,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const server=createMapBenchmarkServer(),address=await server.listen();let browser,client;const errors=[],failedAssets=[],records=[];
 try{
  const executable=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(file=>file&&fs.existsSync(file));assert(executable,"Set CHROME_PATH to Chromium.");
  browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(target=>target.type==="page").webSocketDebuggerUrl);
  await client.send("Page.enable");await client.send("Runtime.enable");await client.send("Network.enable");
  client.on("Runtime.exceptionThrown",event=>errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
  client.on("Network.responseReceived",event=>{if(event.response.status>=400)failedAssets.push({url:event.response.url,status:event.response.status});});
  const evaluate=async expression=>{const result=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error("Preview not ready: "+expression+JSON.stringify(errors));};
  const capture=async name=>fs.writeFileSync(path.join(directory,name+".png"),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  const measure=()=>evaluate(`(()=>{const r=dialog.getBoundingClientRect(),button=$("#upgrade"),b=button.getBoundingClientRect(),c=$("#closeWorkshop").getBoundingClientRect();return{fits:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,footerVisible:b.y>=0&&b.bottom<=innerHeight&&b.height>=44,buttonHit:button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),closeVisible:c.y>=0&&c.bottom<=innerHeight,overflow:[...document.querySelectorAll(".window-header,.building-panel,.detail-scroll:not([hidden]),.upgrade-footer")].some(n=>n.scrollWidth>n.clientWidth+1),art:$("#buildingArt").getAttribute("src")};})()`);
  for(const[width,height]of[[1440,900],[844,390],[568,320]]){
   await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:height<600});
   await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/engineers-workshop/preview.html"});
   await wait('document.documentElement?.dataset.workshopReady==="true"&&[...document.images].every(image=>image.complete&&image.naturalWidth)');
   const result=await measure();assert(result.fits&&result.footerVisible&&result.buttonHit&&result.closeVisible&&!result.overflow,JSON.stringify({width,height,result}));
   assert.equal(result.art,B.art("workshop",4));assert.equal(await evaluate('$("#currentBenefit").textContent'),"20%");assert.equal(await evaluate('$("#nextBenefit").textContent'),"25%");
   await capture(width+"-overview");
   await evaluate('$("#tab-levels").click()');assert.equal(await evaluate('document.querySelectorAll(".levels-table tbody tr").length'),10);assert(!(await measure()).overflow);
   await evaluate('$(".levels-table tbody tr:last-child").scrollIntoView({block:"nearest"})');
   assert(await evaluate('(()=>{const r=$(".levels-table tbody tr:last-child").getBoundingClientRect(),p=$("#levelsPanel").getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom+1;})()'),"Level 10 cannot be reached");
   assert((await measure()).footerVisible);await capture(width+"-levels");
   await evaluate('reset(4,"ready");$("#upgrade").click();$("#upgrade").click()');await delay(550);
   assert.deepEqual(await evaluate('({balance:model.treasury,level:model.level,target:model.project.target,current:$("#currentBenefit").textContent})'),{balance:4260000000-B.cost(5),level:4,target:5,current:"20%"});
   assert(await evaluate('$("#upgrade").disabled'));await capture(width+"-upgrading");
   for(const sample of["paused","attack","damage","other","low","member","unavailable"]){
    await evaluate(`reset(4,${JSON.stringify(sample)})`);assert(await evaluate('$("#upgrade").disabled'),sample+" should block an upgrade");
    const state=await measure();assert(state.footerVisible&&state.fits&&!state.overflow,JSON.stringify({width,sample,state}));
    assert.equal(await evaluate('$("#currentBenefit").textContent'),"20%");
    if(sample==="paused"){
     const before=await evaluate('model.project.remaining');await delay(100);assert.equal(await evaluate('model.project.remaining'),before);
     assert(await evaluate('$("#overviewPanel").firstElementChild.classList.contains("paused")'),"Pause reason must appear first");await capture(width+"-paused");
    }
   }
   await evaluate('$("[data-retry]").click()');assert(!await evaluate('$("#upgrade").disabled'));
   await evaluate('reset(4,"error");$("#upgrade").click()');await delay(550);assert.equal(await evaluate('model.treasury'),4260000000);assert(await evaluate('model.failed&&$("#upgradeNote").textContent.includes("No Gold was spent")'));
   await evaluate('$("#upgrade").click()');await delay(550);assert.equal(await evaluate('model.treasury'),4260000000-B.cost(5));
   await evaluate('reset(4,"ready");$("#upgrade").click();reset(7,"ready")');await delay(550);assert.equal(await evaluate('model.project'),null);assert.equal(await evaluate('model.treasury'),4260000000);
   for(const level of[0,1,7,10]){
    await evaluate(`reset(${level},"ready")`);await wait('[...document.images].every(image=>image.complete&&image.naturalWidth)');
    assert.equal(await evaluate('$("#currentBenefit").textContent'),B.bonus("workshop",level)+"%");assert.equal(await evaluate('$("#buildingArt").getAttribute("src")'),B.art("workshop",level));
    assert((await measure()).footerVisible);if(level===10)assert(await evaluate('$("#upgrade").disabled'));
   }
   await evaluate('reset(4,"ready");close();$("#reopen").click()');assert(await evaluate('dialog.open'));
   records.push({width,height,...result,levelsReachable:true,blockedStates:true,sampleUpgrade:true,errorRecovery:true});
  }
  await client.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/engineers-workshop/index.html?viewport=landscape&level=4"});
  await wait('document.getElementById("preview")?.contentDocument?.documentElement?.dataset.workshopReady==="true"');
  assert.equal(await evaluate('getComputedStyle(document.getElementById("preview")).transform'),"none");
  await evaluate('document.querySelector("[data-viewport=small]").click();document.getElementById("sample").value="paused";document.getElementById("sample").dispatchEvent(new Event("change"))');
  await wait('document.getElementById("preview").contentDocument.querySelector(".project-card.paused")!==null');
  assert.equal(await evaluate('document.getElementById("preview").getBoundingClientRect().width'),568);
  assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
  fs.writeFileSync(path.join(directory,"checks.json"),JSON.stringify({verifiedAt:new Date().toISOString(),records,errors,failedAssets},null,2));
  console.log(JSON.stringify({passed:true,viewports:records.length,states:10,errors,failedAssets}));
 }finally{
  if(client){await client.send("Browser.close").catch(()=>{});client.close();}
  if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
  await server.close();
 }
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
