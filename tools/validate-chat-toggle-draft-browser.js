"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const root=path.resolve(__dirname,".."),output=path.join(root,"release-artifacts/chat-toggle-draft");
(async()=>{
 const server=createMapBenchmarkServer(),address=await server.listen();let browser,client;
 const errors=[],failed=[],writes=[],records=[];fs.mkdirSync(output,{recursive:true});
 try{
  let executable=[process.env.CHROME_PATH,"/usr/bin/google-chrome","/usr/bin/chromium","C:/Program Files/Google/Chrome/Application/chrome.exe"].find(p=>p&&fs.existsSync(p));
  if(!executable){try{const p=require("playwright").chromium.executablePath();if(fs.existsSync(p))executable=p;}catch{}}
  assert(executable,"Chromium required");browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await Promise.all(["Page.enable","Runtime.enable","Network.enable"].map(method=>client.send(method)));
  client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  client.on("Network.responseReceived",e=>{if(e.response.status>=400&&["Document","Script","Image","Stylesheet"].includes(e.type))failed.push(e.response.url);});
  client.on("Network.requestWillBeSent",e=>{if(!["GET","HEAD"].includes(e.request.method))writes.push(e.request.url);});
  const ev=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<600;i++){if(await ev(expression))return;await pause(50);}throw Error("Preview timeout: "+expression+JSON.stringify(errors));};
  const shot=async name=>fs.writeFileSync(path.join(output,name+".png"),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  await client.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/chat-toggle-image-draft/preview.html"});
  await client.send("Page.bringToFront");await wait("document.documentElement?.dataset.chatDraftReady==='true'");
  await ev("window.draftGame=document.getElementById('game').contentWindow;void 0");
  const measure=()=>ev(`(()=>{const w=draftGame,d=w.document,b=d.getElementById('chatToggleBtn'),r=b.getBoundingClientRect(),s=w.getComputedStyle(b);return{x:r.x,y:r.y,width:r.width,height:r.height,hit:b.contains(d.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),expanded:b.getAttribute('aria-expanded'),label:b.getAttribute('aria-label'),quickHidden:d.getElementById('quickChat').hidden,background:s.backgroundColor,border:s.borderWidth,shadow:s.boxShadow,unread:w.getComputedStyle(d.getElementById('chatToggleUnread')).display!=='none',images:[...b.querySelectorAll('.chat-image-draft,.chat-toggle-image')].map(i=>{const a=i.getBoundingClientRect();return{visible:w.getComputedStyle(i).display!=='none',source:i.getAttribute('src'),decoded:i.complete&&i.naturalWidth>100,transform:w.getComputedStyle(i).transform,fits:a.x>=r.x&&a.right<=r.right&&a.y>=r.y&&a.bottom<=r.bottom};})};})()`);
  const geometry=b=>[b.x,b.y,b.width,b.height];
  const press=async touch=>{const b=await measure(),point={x:b.x+b.width/2,y:b.y+b.height/2};if(touch){await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});}else{await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...point});await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...point});}};
  for(const[width,height]of[[1440,900],[844,390],[568,320]]){
   await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
   await ev("draftGame.ChatImageDraft.apply({look:'current',open:false,unread:false})");await pause(180);const baseline=await measure();
   assert(baseline.images.every(i=>!i.visible));
   for(const open of [false,true]){
    await ev(`draftGame.ChatImageDraft.apply({look:'draft',open:${open},unread:true})`);await pause(180);const current=await measure();
    assert.deepEqual(geometry(current),geometry(baseline));assert.equal(current.width,56);assert.equal(current.height,56);assert(current.hit);
    assert.equal(current.expanded,String(open));assert.equal(current.quickHidden,!open);assert.equal(current.label,open?"Collapse chat":"Open chat");
    assert.equal(current.background,"rgba(0, 0, 0, 0)");assert.equal(current.shadow,"none");assert.equal(current.border,"0px");assert(current.unread);
    const visible=current.images.filter(i=>i.visible);assert.equal(visible.length,1);assert(visible[0].decoded&&visible[0].fits);assert.equal(visible[0].transform,"none","Text must never be mirrored or rotated");assert(visible[0].source.endsWith(open?"chat-right-r2.png":"chat-left-r2.png"));
    await shot(width+(open?"-open":"-closed"));records.push({width,height,open,geometry:geometry(current)});
   }
   await press(false);await wait("draftGame.document.getElementById('quickChat').hidden");
   await ev("draftGame.document.getElementById('chatToggleBtn').focus()");
   await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",text:"\r",windowsVirtualKeyCode:13});await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
   await wait("!draftGame.document.getElementById('quickChat').hidden");
   if(width<1000){await client.send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});await press(true);await wait("draftGame.document.getElementById('quickChat').hidden");await press(true);await wait("!draftGame.document.getElementById('quickChat').hidden");await client.send("Emulation.setTouchEmulationEnabled",{enabled:false});}
   await ev("draftGame.ChatImageDraft.apply({look:'draft',open:false,unread:false})");assert(!(await measure()).unread);
  }
  for(const direction of ["left","right"]){const png=fs.readFileSync(path.join(root,`docs/visual-qa/chat-toggle-image-draft/images/chat-${direction}-r2.png`));assert.equal(png.subarray(1,4).toString(),"PNG");assert.equal(png[25],6,"RGBA source required");}
  for(const file of ["index.html","main-screen-art-ui.css","service-worker.js","game.js","chat-ui.js","chat.css"])assert(!fs.readFileSync(path.join(root,file),"utf8").includes("chat-toggle-image-draft"),"Unapproved draft leaked into production: "+file);
  // Exercise the user-facing review controls and capture the approval view.
  await client.send("Emulation.setDeviceMetricsOverride",{width:1200,height:860,deviceScaleFactor:1,mobile:false});
  await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/chat-toggle-image-draft/index.html?open=true"});await wait("document.documentElement?.dataset.chatReviewReady==='true'");await pause(300);
  await shot("approval-preview");
  await ev("document.querySelector('[data-open=\"false\"]').click()");await wait("document.getElementById('preview').contentWindow.document.getElementById('game').contentWindow.document.getElementById('quickChat').hidden");
  await ev("document.querySelector('[data-look=\"current\"]').click()");await wait("!document.getElementById('preview').contentWindow.document.getElementById('game').contentWindow.document.documentElement.classList.contains('chat-button-draft')");
  // Exercise production HTML/CSS without the review overlay or image injection.
  const runtime=JSON.parse(fs.readFileSync(path.join(root,"docs/visual-qa/chat-toggle-image-draft/images/runtime-assets.json"),"utf8"));
  assert.equal(runtime.length,2);assert(runtime.reduce((sum,a)=>sum+a.bytes,0)<24*1024);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"assets/optimized/manifest.json"),"utf8"));
  for(const asset of runtime){
   const hash=p=>crypto.createHash("sha256").update(fs.readFileSync(path.join(root,p))).digest("hex");
   assert.equal(hash(asset.source),asset.sourceSha256);assert.equal(hash(asset.output),asset.sha256);
   assert.deepEqual(manifest.assets.find(a=>a.id===asset.id),asset);
   assert(!fs.readFileSync(path.join(root,"service-worker.js"),"utf8").includes(asset.output),"Use runtime caching, not install preloading");
  }
  await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0&chatMode=closed"});
  await wait("document.documentElement?.dataset.crownlandsBenchmarkReady==='true'");
  await ev("window.draftGame=window;__CROWNLANDS_BENCHMARK__.closeModal();pendingOfflineRewardsSummary=null;toast.classList.remove('visible');void 0");
  await ev("Promise.all([...document.querySelectorAll('.chat-toggle-image')].map(i=>i.decode())).then(()=>true)");
  const production=[];
  for(const[width,height]of[[1440,900],[844,390],[568,320]]){
   await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
   for(const open of [false,true]){
    await ev(`CrownlandsChat.init().setMode(${JSON.stringify(open?"quick":"closed")});document.getElementById('chatToggleUnread').hidden=false;void 0`);await pause(180);
    const current=await measure(),visible=current.images.filter(i=>i.visible);
    assert.deepEqual(geometry(current),records.find(r=>r.width===width).geometry);assert(current.hit);
    assert.equal(current.expanded,String(open));assert.equal(current.quickHidden,!open);assert.equal(current.label,open?"Collapse chat":"Open chat");
    assert.equal(current.background,"rgba(0, 0, 0, 0)");assert.equal(current.shadow,"none");assert.equal(current.border,"0px");assert(current.unread);
    assert.equal(visible.length,1);assert(visible[0].decoded&&visible[0].fits);assert.equal(visible[0].transform,"none");
    assert.equal(visible[0].source,runtime.find(a=>a.id===`hud-chat-${open?"right":"left"}-labeled`).output);
    assert(await ev(`(()=>{const i=[...document.querySelectorAll('.chat-toggle-image')].find(i=>getComputedStyle(i).display!=='none'),c=document.createElement('canvas');c.width=c.height=192;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,1,1).data[3]===0&&x.getImageData(96,160,1,1).data[3]>240;})()`),"Transparent art and solid ribbon required");
    await shot(`production-${width}-${open?"open":"closed"}`);production.push({width,open,geometry:geometry(current)});
   }
   await press(false);await wait("document.getElementById('quickChat').hidden");
   await ev("document.getElementById('chatToggleBtn').focus()");
   await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
   await ev("document.getElementById('chatToggleBtn').focus()");assert(await ev("document.getElementById('chatToggleBtn').matches(':focus-visible')&&getComputedStyle(document.getElementById('chatToggleBtn')).outlineStyle==='solid'"));
   for(const key of ["Enter"," "]){
    const code=key==="Enter"?"Enter":"Space",n=key==="Enter"?13:32;
    await client.send("Input.dispatchKeyEvent",{type:"keyDown",key,code,text:key==="Enter"?"\r":" ",windowsVirtualKeyCode:n});await client.send("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode:n});
    await wait(`document.getElementById('quickChat').hidden===${key!=="Enter"}`);
   }
   if(width<1000){await client.send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});await press(true);await wait("!document.getElementById('quickChat').hidden");await press(true);await wait("document.getElementById('quickChat').hidden");await client.send("Emulation.setTouchEmulationEnabled",{enabled:false});}
   const before=geometry(await measure());await ev("__CROWNLANDS_BENCHMARK__.setVisualZoom(2.2)");assert.deepEqual(geometry(await measure()),before);await ev("__CROWNLANDS_BENCHMARK__.setVisualZoom(1)");
   await ev("document.getElementById('chatToggleUnread').hidden=true");assert(!(await measure()).unread);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(writes,[]);
  const result={passed:true,records,production,originalGeometry:true,mouse:true,keyboard:true,touch:true,unread:true,reviewControls:true,noNetworkWrites:true,errors,failed};fs.writeFileSync(path.join(output,"checks.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(client){await client.send("Browser.close").catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
