const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { CdpClient } = require(path.join(root, 'tools/map-benchmark/cdp-client'));
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require(path.join(root, 'tools/validate-focused-browser-smoke'));
const { createMapBenchmarkServer } = require(path.join(root, 'tools/map-benchmark/server'));
const output = path.join(__dirname, 'evidence');
fs.mkdirSync(output, {recursive:true});
(async () => {
 const server = createMapBenchmarkServer();
 const address = await server.listen();
 const session = await startBrowserSession('C:/Program Files/Google/Chrome/Application/chrome.exe');
 const client = await CdpClient.connect(session.targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 const failures = [], requests = [], checks = [];
 const evaluate = async expression => { const r=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value; };
 const pause = ms => new Promise(r=>setTimeout(r,ms));
 const click = async selector => {
  const b=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await client.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...b});
  await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...b});
 };
 const load = async (w,h,query='',file='frame.html') => {
  await client.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
  await client.send('Page.navigate',{url:`${address.url}/docs/visual-qa/atlas-ui-foundation/${file}?${query}`});
  await pause(350);
  await evaluate('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');
 };
 const shot = async name => { const s=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(s.data,'base64')); };
 try {
  await Promise.all(['Page.enable','Runtime.enable','Network.enable'].map(m=>client.send(m)));
  client.on('Runtime.exceptionThrown',e=>failures.push(e.exceptionDetails.text));
  client.on('Network.responseReceived',e=>{if(e.response.status>=400 && !e.response.url.endsWith('/favicon.ico'))failures.push(`${e.response.status} ${e.response.url}`)});
  client.on('Network.requestWillBeSent',e=>requests.push(e.request.url));
  for(const [w,h,label] of [[1440,900,'desktop'],[844,390,'landscape'],[568,320,'short']]) {
   await load(w,h,'view=city');
   const layout=await evaluate(`(()=>{const p=document.querySelector('#cityPanel'),b=document.querySelector('#upgradeButton').getBoundingClientRect();return {open:p.open,overflow:document.documentElement.scrollWidth>innerWidth,button:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),scroll:document.querySelector('#cityLedger').scrollHeight>document.querySelector('#cityLedger').clientHeight}})()`);
   assert.equal(layout.open,true);assert.equal(layout.overflow,false);assert.deepEqual(layout.broken,[]);assert(layout.button.bottom<=h&&layout.button.y>=0);
   await shot(label+'-city');
   await click('#innerCastle');
   assert.equal(await evaluate('document.querySelector("#notePanel").open'),true);
   await click('#closeNote');
   assert.equal(await evaluate('document.activeElement.id'),'innerCastle');
   await evaluate('document.querySelector("#cityLedger").scrollTop=0');
   await click('#defencesTab');
   assert.equal(await evaluate('document.querySelector("#defences").hidden'),false);
   await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});
   assert.equal(await evaluate('document.activeElement.id'),'overviewTab');
   await click('[data-amount="5"]');
   assert.equal(await evaluate('document.querySelector("#upgradeCost").textContent'),'3,200');
   await click('#upgradeButton');
   assert.equal(await evaluate('document.querySelector("#upgradeButton").disabled'),true);
   await pause(750);
   assert.equal(await evaluate('document.querySelector("#cityLevel").textContent'),'29');
   assert.equal(await evaluate('document.querySelector("#goldCount").textContent'),'81,420');
   await click('#closeCity');
   assert.equal(await evaluate('document.querySelector("#cityPanel").open'),false);
   await load(w,h,'view=map');
   await shot(label+'-map');
   const overlaps=await evaluate(`(()=>{const e=[...document.querySelectorAll('.nav-command,.map-tools button,.chat-strip')];const r=e.map(x=>x.getBoundingClientRect());const hits=[];for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++)if(Math.min(r[i].right,r[j].right)-Math.max(r[i].left,r[j].left)>1&&Math.min(r[i].bottom,r[j].bottom)-Math.max(r[i].top,r[j].top)>1)hits.push([e[i].id||e[i].textContent,e[j].id||e[j].textContent]);return hits})()`);
   assert.deepEqual(overlaps,[]);
   const beforeZoom=await evaluate('document.querySelector("#world").style.transform');
   await click('#zoomIn');
   assert.notEqual(await evaluate('document.querySelector("#world").style.transform'),beforeZoom);
   await click('#homeButton');
   assert.equal(await evaluate('document.querySelector("#world").style.transform'),beforeZoom);
   await click('#citiesButton');
   await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
   await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
   await pause(180);
   assert.equal(await evaluate('document.querySelector("#cityPanel").open'),false);
   assert.equal(await evaluate('document.activeElement.id'),'citiesButton');
   checks.push({viewport:`${w}x${h}`,layout,interaction:'scrolling to Inner Castle, nested note/focus restoration, tabs, arrow navigation, +5, pending lock, successful local update, close, Escape, non-overlapping map controls, zoom and home passed'});
  }
  for(const state of ['pending','success','error','disabled']) {
   await load(844,390,'view=city&state='+state);
   assert.equal(await evaluate('document.querySelector("#cityPanel").dataset.state'),state);
   if(['pending','disabled'].includes(state)) assert.equal(await evaluate('document.querySelector("#upgradeButton").disabled'),true);
   if(state==='error') {await click('#upgradeButton');await pause(750);assert.equal(await evaluate('document.querySelector("#goldCount").textContent'),'84,620');}
   await shot('state-'+state);checks.push({state,result:'passed'});
  }
  await load(844,390,'view=city');
  await click('#upgradeButton');await pause(750);
  assert.equal(await evaluate('document.querySelector("#cityLevel").textContent'),'25');
  assert.equal(await evaluate('document.querySelector("#goldCount").textContent'),'83,980');
  await click('[data-amount="max"]');await click('#upgradeButton');await pause(750);
  assert.equal(await evaluate('document.querySelector("#cityLevel").textContent'),'50');
  assert.equal(await evaluate('document.querySelector("#upgradeButton").disabled'),true);
  checks.push({interaction:'+1 succeeds; Max reaches sample cap and disables further upgrade',result:'passed'});
  await load(390,844,'view=city');
  assert.equal(await evaluate('document.querySelector("#cityPanel").open'),false);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".orientation")).display'),'flex');
  checks.push({viewport:'390x844',result:'orientation prompt visible; modal closed'});
  await load(1440,1050,'','index.html');await pause(450);await shot('review-desktop');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  await load(390,844,'','index.html');await pause(450);await shot('review-mobile');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  const external = requests.filter(url=>!url.startsWith(address.url));
  assert.deepEqual(external,[]);assert.deepEqual(failures,[]);
  const result = {date:new Date().toISOString(),browser:'Headless Chrome',checks,externalRequests:external,runtimeErrors:failures,limitations:['Synthetic data and outcomes; no backend validation','No physical touch-device, screen-reader or iOS Safari verification','Not a complete-game redesign; visual direction remains proposed']};
  fs.writeFileSync(path.join(output,'qa-results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
 } finally {
  await client.send('Browser.close').catch(()=>{});client.close();
  await waitForProcessExit(session.browserProcess,3000);
  if(session.browserProcess.exitCode===null)session.browserProcess.kill();
  const resolved=path.resolve(session.profilePath);
  assert(resolved.startsWith(path.join(require('node:os').tmpdir(),'crownlands-browser-smoke-')));
  await removeBrowserProfile(resolved);await server.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
