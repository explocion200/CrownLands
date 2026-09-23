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
   await ready('!document.getElementById("game").contentDocument.querySelector("#toast.visible")');
   assert(await ev(`document.getElementById("game").contentWindow.eval(${JSON.stringify(`WORLD_HOLDING_TOWERS.every(tower=>Object.values(CLAN_TOWER_BUILDING_PLACEMENT).every(place=>{const bounds=getHarvestBonusMapArtBounds(tower.regionId),x=tower.visualX+(place.x+.5-tower.anchorX)*tower.width,y=tower.visualY+(1-tower.anchorY+place.y)*tower.width,left=x-tower.width*.22,right=x+tower.width*.22,top=y-tower.width*.44;return bounds.some(r=>r.left<=left&&r.right>=right&&r.top<=top&&r.bottom>=y)&&!isHarvestBonusClearOfMapArt(x,y-tower.width*.22,bounds);}));`)})`),"Pickup exclusion does not cover the relocated buildings");
   await settings({layout:"proposed",sample:"owned",level:4});
   await ready('(()=>{const ground=document.getElementById("game").contentDocument.querySelector(".holding-tower-courtyard");return ground?.complete&&ground.naturalWidth>0;})()');
   const ground=await ev('(()=>{const d=document.getElementById("game").contentDocument,n=d.querySelector(".holding-tower-courtyard"),s=d.defaultView.getComputedStyle(n),c=d.createElement("canvas");c.width=n.naturalWidth;c.height=n.naturalHeight;const x=c.getContext("2d");x.drawImage(n,0,0);const pixels=x.getImageData(0,0,c.width,c.height).data;let transparent=0,soft=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>0&&pixels[i]<255)soft++;}return{src:n.getAttribute("src"),pointerEvents:s.pointerEvents,z:Number(s.zIndex),buildingZ:Number(d.defaultView.getComputedStyle(d.querySelector(".holding-tower-building-node")).zIndex),transparent:transparent/(pixels.length/4),soft:soft/(pixels.length/4),oldRoads:[...d.querySelectorAll(".holding-tower-courtyard")].some(i=>i.getAttribute("src")==="assets/clan-buildings/courtyard.webp")};})()');
   assert(!ground.oldRoads&&ground.src.endsWith("courtyard.webp?v=dirt-patches-v1"),"Old courtyard roads remain");
   assert(ground.pointerEvents==="none"&&ground.z<ground.buildingZ,"Ground blocks building controls");
   assert(ground.transparent>.3&&ground.soft>.01,"Dirt decal needs transparent gaps and soft edges");
   const proposed=await measures();await capture(width+"-compact-actions");
   assert.equal(proposed.buildings.length,4);
   assert(Math.abs(proposed.buildings[0].box.width/proposed.tower.width-.44)<.001,"Original building size changed");
   assert.equal(proposed.labels,0);assert.equal(proposed.dock,false);
   const checkActionRow=async(before,after)=>{
    assert.deepEqual(after.actions.map(a=>a.id).sort(),before.actions.map(a=>a.id).sort(),"Available actions changed");
    const row=[...after.actions].sort((a,b)=>a.box.x-b.box.x);
    assert.equal(row[Math.floor(row.length/2)].id,"info","Info should be centered");
    const bottom=Math.max(...after.buildings.map(n=>Math.max(n.box.y+n.box.height,n.label.y+n.label.height)));
    for(const [index,action]of row.entries()){
     const original=before.actions.find(a=>a.id===action.id);
     for(const key of["width","height","background","border","font","transform","text"])assert.deepEqual(action.box[key],original.box[key],action.id+" restyled: "+key);
     assert(action.box.width>=44&&action.box.height>=44,"Action touch target too small");
     assert(Math.abs(action.box.y-row[0].box.y)<.1,"Actions are not aligned");
     assert(action.box.y>=bottom+7.9,"Actions overlap the building labels");
     assert(action.box.x>=0&&action.box.x+action.box.width<=width&&action.box.y>=0&&action.box.y+action.box.height<=height,"Action outside viewport");
     if(index)assert(Math.abs(action.box.x-(row[index-1].box.x+row[index-1].box.width)-4)<.1,"Action gaps should be 4px");
     assert(await ev(`(()=>{const d=document.getElementById("game").contentDocument,n=d.querySelector('[data-clan-tower-map-action="${action.id}"]'),r=n.getBoundingClientRect();return n.contains(d.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`),"Action obscured: "+action.id);
    }
   };
   assert.deepEqual(proposed.actions.map(a=>a.id),["store","info","send"]);
   await checkActionRow(proposed,proposed);
   await ev('document.getElementById("game").contentWindow.eval("zoom*=.9;camera.x+=20;updateCameraTransform();")');
   await checkActionRow(proposed,await measures());
   await settings({layout:"proposed",sample:"owned",level:4});
   await click('[data-clan-tower-map-action="info"]',height<600);
   await ready('document.getElementById("game").contentDocument.querySelector("dialog[open]")!==null');
   await ev('document.getElementById("game").contentDocument.querySelector("dialog[open]").close()');
   await settings({layout:"proposed",sample:"owned",level:4});
   await click('[data-clan-tower-map-action="store"]',height<600);
   await ready('document.getElementById("game").contentDocument.querySelector("dialog[open]")!==null');
   await ev('document.getElementById("game").contentDocument.querySelector("dialog[open]").close()');
   await settings({layout:"proposed",sample:"owned",level:4});
   await click('[data-clan-tower-map-action="send"]',height<600);
   assert(await ev('document.getElementById("game").contentWindow.eval("sendMode && holdingTowerSendContext?.id === selectedSourceId")'),"Send did not enter destination selection");
   await settings({layout:"proposed",sample:"owned",level:4});
   const offsets={shop:[-.40,-.34],workshop:[.40,-.34],infirmary:[-.40,.26],training:[.40,.26]};
   for(const before of proposed.buildings){
    const [x,y]=offsets[before.id];
    assert(Math.abs((before.box.x+before.box.width/2-proposed.tower.x)/proposed.tower.width-(x+.5))<.001,"Building horizontal placement changed");
    assert(Math.abs((before.box.y+before.box.height-proposed.tower.y)/proposed.tower.width-(1+y))<.001,"Building vertical placement changed");
    assert(before.label.text.includes("Lv 4"),"Original level label missing");
    await click('[data-clan-building-id="'+before.id+'"]',height<600);
    await ready('document.getElementById("game").contentDocument.querySelector("dialog[open]")!==null');
    await ev('document.getElementById("game").contentDocument.querySelector("dialog[open]").close()');
    await settings({layout:"proposed",sample:"owned",level:4});
   }
   await settings({layout:"proposed",sample:"rival",level:4});const rivalAfter=await measures();
   assert.deepEqual(rivalAfter.actions.map(a=>a.id),["scout","info","rally-attack"]);await checkActionRow(rivalAfter,rivalAfter);await capture(width+"-rival-actions");
   await settings({layout:"proposed",sample:"unbuilt",level:4});
   assert.equal(await ev('document.getElementById("game").contentDocument.querySelectorAll(".holding-tower-courtyard").length'),0,"Unbuilt compound added a ground patch");
   records.push({width,height,towerSize:proposed.tower.width,buildingSize:proposed.buildings[0].box.width,approvedSizeAndPositions:true,pickupExclusion:true,compactActions:proposed.actions.map(a=>({id:a.id,x:a.box.x,y:a.box.y,size:a.box.width})),rivalActions:rivalAfter.actions.map(a=>a.id),ground,entries:true});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,"checks.json"),JSON.stringify({verifiedAt:new Date().toISOString(),records,errors},null,2));
  console.log(JSON.stringify({passed:true,records,errors},null,2));
 }finally{
  if(client){await client.send("Browser.close").catch(()=>{});client.close();}
  if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
  await server.close();
 }
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
