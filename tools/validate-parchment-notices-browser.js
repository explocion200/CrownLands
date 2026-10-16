"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const server=createMapBenchmarkServer(),address=await server.listen(),output=path.resolve(__dirname,"../release-artifacts/restored-notice-style");
 fs.mkdirSync(output,{recursive:true});let browser,client;const errors=[],failed=[],writes=[],records=[];
 try{
  const executable=[process.env.CHROME_PATH,"/usr/bin/google-chrome","/usr/bin/chromium","C:/Program Files/Google/Chrome/Application/chrome.exe"].find(p=>p&&fs.existsSync(p));assert(executable,"Chromium required");
  browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await Promise.all(["Page.enable","Runtime.enable","Network.enable"].map(method=>client.send(method)));
  client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  client.on("Network.responseReceived",e=>{if(e.response.status>=400&&["Document","Script","Image","Stylesheet"].includes(e.type))failed.push(e.response.url);});
  client.on("Network.requestWillBeSent",e=>{if(!["GET","HEAD"].includes(e.request.method))writes.push(e.request.url);});
  const ev=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<600;i++){if(await ev(expression))return;await pause(50);}throw Error("Timeout: "+expression);};
  const shot=async name=>fs.writeFileSync(path.join(output,name+".png"),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  const measure=id=>ev(`(()=>{const e=document.getElementById(${JSON.stringify(id)}),s=getComputedStyle(e),r=e.getBoundingClientRect();return{hidden:e.hidden,rect:[r.x,r.y,r.width,r.height],hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),background:s.backgroundColor,image:s.backgroundImage,blur:s.backdropFilter,shadow:s.boxShadow,border:s.borderWidth,outline:s.outlineStyle,color:s.color,text:e.textContent.trim(),aria:e.getAttribute('aria-label'),labels:[...e.querySelectorAll('.nav-btn-heading,.nav-btn-label')].filter(l=>getComputedStyle(l).visibility!=='hidden').map(l=>{const a=l.getBoundingClientRect();return{color:getComputedStyle(l).color,fits:a.x>=r.x&&a.right<=r.right&&a.y>=r.y&&a.bottom<=r.bottom};})};})()`);
  const point=async id=>{const r=(await measure(id)).rect;return{x:r[0]+r[2]/2,y:r[1]+r[3]/2};};
  const click=async id=>{const p=await point(id);await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...p});await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...p});};
  for(const[width,height]of[[1440,900],[844,390],[568,320]]){
   await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
   await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&hudOperations=both&chatMode=quick"});
   await wait("document.documentElement?.dataset.crownlandsBenchmarkReady==='true'");
   await ev("__CROWNLANDS_BENCHMARK__.closeModal();pendingOfflineRewardsSummary=null;toast.classList.remove('visible');void 0");
   for(const mode of ["none","incoming","outgoing","both"]){
    await ev(`__CROWNLANDS_BENCHMARK__.setHudOperationState('${mode}')`);await pause(180);
    assert.equal((await measure("incomingAttackBtn")).hidden,!["incoming","both"].includes(mode));
    assert.equal((await measure("outgoingAttackBtn")).hidden,!["outgoing","both"].includes(mode));
   }
   const artwork=await ev(`(async()=>{const paths=['assets/icons/skills/atlas-v1/marchOrders.webp','assets/optimized/report-attack-ink-384x384-1e1a12b255a7.webp'];const result=[];for(const src of paths){const img=new Image();img.src=src;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);result.push({src,width:img.naturalWidth,height:img.naturalHeight,corner:ctx.getImageData(0,0,1,1).data[3],center:ctx.getImageData(canvas.width/2,canvas.height/2,1,1).data[3]});}return result;})()`);
   assert(artwork.every(a=>a.corner===0&&a.center>240),JSON.stringify(artwork));
   for(const[id,src]of[['outgoingAttackBtn',artwork[0].src],['incomingAttackBtn',artwork[1].src]]){
    assert(await ev(`(()=>{const img=document.querySelector('#${id} img.nav-btn-icon');return img?.getAttribute('src')==='${src}'&&img.complete&&img.naturalWidth>0&&img.alt==='';})()`));
    assert.equal(await ev(`document.getElementById('${id.replace('Btn','Count')}').textContent`),'1');
    assert.match(await ev(`document.getElementById('${id.replace('Btn','Time')}').textContent`),/\d+m/);
   }
   await ev("reportUnreadBadge.hidden=false;reportUnreadBadge.textContent='3';void 0");
   assert(await ev("(()=>{const e=document.getElementById('reportUnreadBadge'),r=e.getBoundingClientRect(),b=logBtn.getBoundingClientRect();return !e.hidden&&e.textContent==='3'&&r.width>0&&r.x>=b.x&&r.x<b.right;})()"));
   const chatBefore=(await measure("chatToggleBtn")).rect;
   assert.deepEqual(chatBefore,[width-(width===568?361:369),height-72,56,56]);
   for(const open of [false,true]){
    await ev(`CrownlandsChat.init().setMode('${open?"quick":"closed"}')`);
    for(const state of ["idle","hover","focus","press"]){
     if(state==="idle"){await client.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:0,y:0});await ev("document.activeElement.blur()");}
     if(state==="hover")await client.send("Input.dispatchMouseEvent",{type:"mouseMoved",...await point("chatToggleBtn")});
     if(state==="focus")await ev("document.getElementById('chatToggleBtn').focus()");
     if(state==="press")await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...await point("chatToggleBtn")});
     await pause(140);const c=await measure("chatToggleBtn");assert.equal(c.background,"rgba(0, 0, 0, 0)");assert.equal(c.image,"none");assert.equal(c.blur,"none","Inherited blur makes transparent artwork look filled");assert.equal(c.shadow,"none");assert.equal(c.border,"0px");
    }
    await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...await point("chatToggleBtn")});
   }
   for(const[id,ink]of[["logBtn","rgb(73, 53, 33)"],["incomingAttackBtn","rgb(123, 48, 52)"],["outgoingAttackBtn","rgb(54, 87, 106)"]]){
    const initial=await measure(id);assert(initial.hit&&!initial.hidden);assert.equal(initial.rect[0],12);assert.equal(initial.rect[2],98);assert(initial.rect[3]>=46&&initial.rect[3]<=54);
    for(const state of ["idle","hover","focus"]){
     await client.send("Input.dispatchMouseEvent",{type:"mouseMoved",...(state==="hover"?await point(id):{x:0,y:0})});
     if(state==="focus")await ev(`document.getElementById('${id}').focus()`);await pause(180);
     const n=await measure(id);assert(n.image.includes("linear-gradient"),id+" lost parchment on "+state);assert(!n.image.includes("url("));assert(n.shadow.includes("inset"));assert.equal(n.border,"2px");if(state==="focus")assert.notEqual(n.outline,"none");assert.equal(n.color,ink);assert(n.labels.every(l=>l.color===ink&&l.fits),JSON.stringify({id,state,n}));assert.deepEqual(n.rect,initial.rect);
    }
    for(const method of ["mouse","keyboard",...(width<1000?["touch"]:[])]){
     if(method==="mouse")await click(id);
     if(method==="keyboard"){
      await ev(`document.getElementById('${id}').focus()`);await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",text:"\r",windowsVirtualKeyCode:13});await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
     }
     if(method==="touch"){
      await client.send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[await point(id)]});await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
     }
     await wait("document.getElementById('modal').open");assert.match(await ev("document.getElementById('modalTitle').textContent"),id==="logBtn"?/Reports/:id==="incomingAttackBtn"?/Incoming/:/Kingdom Activity/);
     await ev("__CROWNLANDS_BENCHMARK__.closeModal()");await pause(120);
     if(method==="touch")await client.send("Emulation.setTouchEmulationEnabled",{enabled:false});
    }
   }
   await ev("CrownlandsChat.init().setMode('quick');document.activeElement.blur();void 0");await client.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:0,y:0});await pause(180);await shot("after-"+width);
   const before=(await measure("logBtn")).rect;await ev("__CROWNLANDS_BENCHMARK__.setVisualZoom(2.2)");assert.deepEqual((await measure("logBtn")).rect,before);assert.deepEqual((await measure("chatToggleBtn")).rect,chatBefore);
   records.push({width,height,chatTransparent:true,noticeGeometry:before,mouse:true,keyboard:true,touch:width<1000});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(writes,[]);
  fs.writeFileSync(path.join(output,"checks.json"),JSON.stringify({passed:true,records,errors,failed,writes},null,2));console.log(JSON.stringify({passed:true,records}));
 }finally{if(client){await client.send("Browser.close").catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
