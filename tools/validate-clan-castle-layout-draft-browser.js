"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const delay=ms=>new Promise(r=>setTimeout(r,ms)),dir=path.resolve(__dirname,"../release-artifacts/clan-castle-layout");
fs.mkdirSync(dir,{recursive:true});
(async()=>{
 const server=createMapBenchmarkServer(),address=await server.listen();let browser,client;const errors=[],records=[];
 try{
  const executable=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));
  assert(executable,"Set CHROME_PATH to Chromium.");browser=await startBrowserSession(executable);
  client=await CdpClient.connect(browser.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await client.send("Page.enable");await client.send("Runtime.enable");
  client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  const ev=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const ready=async expression=>{for(let i=0;i<180;i++){if(await ev(expression))return;await delay(100);}console.log(await ev('({loading:document.getElementById("loading").textContent,child:{...document.getElementById("game").contentDocument.documentElement.dataset},review:document.getElementById("game").contentWindow.CrownlandsCastlePositionReview,loadingHidden:document.getElementById("loading").hidden,scripts:[...document.getElementById("game").contentDocument.scripts].slice(-3).map(s=>s.src)})'));throw Error("Not ready: "+expression+" "+JSON.stringify(errors));};
  const capture=async name=>fs.writeFileSync(path.join(dir,name+".png"),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  const measures=()=>ev(`(()=>{const d=document.getElementById("game").contentDocument,w=d.defaultView;const measure=n=>{const r=n.getBoundingClientRect(),s=w.getComputedStyle(n);return{x:r.x,y:r.y,width:Math.round(r.width*100)/100,height:Math.round(r.height*100)/100,background:s.background,border:s.border,font:s.font,transform:s.transform,text:n.textContent};};return{tower:measure(d.querySelector(".holding-tower-node")),buildings:[...d.querySelectorAll(".holding-tower-building-node")].map(n=>({id:n.dataset.clanBuildingId,box:measure(n),label:measure(n.querySelector(".ctb-map-label")),art:n.querySelector("img").getAttribute("src")})),actions:[...d.querySelectorAll("[data-clan-tower-map-action]")].map(n=>({id:n.dataset.clanTowerMapAction,box:measure(n)})),labels:d.querySelectorAll(".building-sign").length,dock:d.querySelector(".detail-dock")!==null};})()`);
  const settings=async value=>{await ev(`document.getElementById("game").contentWindow.CrownlandsCastlePositionReview.settings(${JSON.stringify(value)})`);await delay(200);};
  const click=async(selector,touch)=>{
   const p=await ev(`(()=>{const d=document.getElementById("game").contentDocument,n=d.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:n.contains(d.elementFromPoint(x,y)),width:r.width,height:r.height};})()`);
   assert(p.hit,"Blocked target "+selector+JSON.stringify(p));
   if(touch){await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:p.x,y:p.y}]});await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});}
   else{await client.send("Input.dispatchMouseEvent",{type:"mousePressed",x:p.x,y:p.y,button:"left",clickCount:1});await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:p.x,y:p.y,button:"left",clickCount:1});}
  };
  for(const[width,height]of[[1440,900],[844,390],[568,320]]){
   await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:height<600});
   await client.send("Emulation.setTouchEmulationEnabled",{enabled:height<600});
   await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/clan-castle-layout/preview.html"});
   await ready('document.getElementById("game")?.contentWindow?.CrownlandsCastlePositionReview?.tower&&document.getElementById("game").contentDocument.querySelectorAll(".holding-tower-building-node").length===4');
   await ready('[...document.getElementById("game").contentDocument.querySelectorAll(".holding-tower-building-node>img,.holding-tower-art")].every(i=>i.complete&&i.naturalWidth)');
   await settings({layout:"current",sample:"owned",level:4});const current=await measures();await capture(width+"-current");
   await settings({layout:"proposed",sample:"owned",level:4});
   await ready('(()=>{const ground=document.getElementById("game").contentDocument.querySelector("[data-castle-dirt-patches]");return ground?.complete&&ground.naturalWidth>0;})()');
   const ground=await ev('(()=>{const d=document.getElementById("game").contentDocument,n=d.querySelector("[data-castle-dirt-patches]"),s=d.defaultView.getComputedStyle(n),c=d.createElement("canvas");c.width=n.naturalWidth;c.height=n.naturalHeight;const x=c.getContext("2d");x.drawImage(n,0,0);const pixels=x.getImageData(0,0,c.width,c.height).data;let transparent=0,soft=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>0&&pixels[i]<255)soft++;}return{src:n.getAttribute("src"),pointerEvents:s.pointerEvents,z:Number(s.zIndex),buildingZ:Number(d.defaultView.getComputedStyle(d.querySelector(".holding-tower-building-node")).zIndex),transparent:transparent/(pixels.length/4),soft:soft/(pixels.length/4),oldRoads:[...d.querySelectorAll(".holding-tower-courtyard")].some(i=>i.getAttribute("src")==="assets/clan-buildings/courtyard.webp")};})()');
   assert(!ground.oldRoads&&ground.src.endsWith("dirt-patches-v1.png"),"Old courtyard roads remain");
   assert(ground.pointerEvents==="none"&&ground.z<ground.buildingZ,"Ground blocks building controls");
   assert(ground.transparent>.3&&ground.soft>.01,"Dirt decal needs transparent gaps and soft edges");
   const proposed=await measures();await capture(width+"-dirt-patches");
   for(const key of["width","height","background","border","font","transform","text"])assert.deepEqual(proposed.tower[key],current.tower[key],"Tower changed: "+key);
   assert.equal(proposed.labels,0);assert.equal(proposed.dock,false);
   assert.deepEqual(proposed.actions,current.actions,"Map controls moved or restyled");
   for(const before of current.buildings){
    const after=proposed.buildings.find(n=>n.id===before.id);assert.equal(before.art,after.art);
    for(const key of["width","height","background","border","font","transform","text"])assert.deepEqual(after.box[key],before.box[key],before.id+" changed: "+key);
    for(const key of["width","height","background","border","font","transform","text"]){if(typeof after.label[key]==="number")assert(Math.abs(after.label[key]-before.label[key])<.05,before.id+" label changed: "+key);else assert.deepEqual(after.label[key],before.label[key],before.id+" label changed: "+key);}
    assert(after.box.y<before.box.y,"Building was not moved higher: "+before.id);
    await click('[data-clan-building-id="'+before.id+'"]',height<600);
    await ready('document.getElementById("game").contentDocument.querySelector("dialog[open]")!==null');
    await ev('document.getElementById("game").contentDocument.querySelector("dialog[open]").close()');
    await settings({layout:"proposed",sample:"owned",level:4});
   }
   await settings({layout:"proposed",sample:"unbuilt",level:4});
   assert.equal(await ev('document.getElementById("game").contentDocument.querySelectorAll(".holding-tower-courtyard").length'),0,"Unbuilt compound added a ground patch");
   records.push({width,height,towerSize:proposed.tower.width,buildingSize:proposed.buildings[0].box.width,sizeAndStyleParity:true,buildingPositionsOnly:true,ground,entries:true});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,"checks.json"),JSON.stringify({verifiedAt:new Date().toISOString(),records,errors},null,2));
  console.log(JSON.stringify({passed:true,records,errors},null,2));
 }finally{
  if(client){await client.send("Browser.close").catch(()=>{});client.close();}
  if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
  await server.close();
 }
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
