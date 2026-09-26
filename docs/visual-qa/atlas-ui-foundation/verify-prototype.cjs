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
  await evaluate('new Promise(resolve => document.readyState === "complete" ? resolve() : addEventListener("load", resolve, {once:true}))');
  await evaluate('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');
  await evaluate('Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})))');
 };
 const shot = async name => { const s=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(s.data,'base64')); };
 const actionBounds = () => evaluate(`['.city-actions','#upgradeButton','#actionFeedback'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})`);
 const checkReadability = async () => {
  const layout = await evaluate(`(()=>{
   const box = selector => document.querySelector(selector).getBoundingClientRect();
   const footer = document.querySelector('.city-actions'), ledger = document.querySelector('#cityLedger');
   const action = box('#upgradeButton'), label = box('#upgradeLabel'), price = box('.price'), hint = box('#upgradeHint'), feedback = box('#actionFeedback');
   const touch = [...document.querySelectorAll('.close-button,.ledger-tabs button,.upgrade-options button,#upgradeButton')].map(e=>({name:e.id||e.textContent,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}));
   return {footerFits:footer.scrollHeight<=footer.clientHeight && footer.scrollWidth<=footer.clientWidth,
    ledgerFits:ledger.scrollWidth<=ledger.clientWidth, hintVisible:hint.height>0,
    labelFits:label.right<=price.left && price.right<=action.right && label.bottom<=action.bottom,
    feedbackVisible:feedback.bottom<=innerHeight && feedback.top>=0, touch};
  })()`);
  assert.equal(layout.footerFits,true);assert.equal(layout.ledgerFits,true);assert.equal(layout.hintVisible,true);
  assert.equal(layout.labelFits,true);assert.equal(layout.feedbackVisible,true);
  for(const target of layout.touch) assert(target.height>=44 && target.width>=44,`${target.name}: touch target too small`);
  return layout;
 };
 try {
  await Promise.all(['Page.enable','Runtime.enable','Network.enable'].map(m=>client.send(m)));
  client.on('Runtime.exceptionThrown',e=>failures.push(e.exceptionDetails.text));
  client.on('Network.responseReceived',e=>{if(e.response.status>=400 && !e.response.url.endsWith('/favicon.ico'))failures.push(`${e.response.status} ${e.response.url}`)});
  client.on('Network.requestWillBeSent',e=>requests.push(e.request.url));
  for(const [w,h,label] of [[1440,900,'desktop'],[844,390,'landscape'],[568,320,'short']]) {
   await load(w,h);
   const layout=await evaluate(`(()=>{const p=document.querySelector('#cityPanel'),b=document.querySelector('#upgradeButton').getBoundingClientRect();return {open:p.open,overflow:document.documentElement.scrollWidth>innerWidth,button:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),scroll:document.querySelector('#cityLedger').scrollHeight>document.querySelector('#cityLedger').clientHeight}})()`);
   assert.equal(layout.open,true);assert.equal(layout.overflow,false);assert.deepEqual(layout.broken,[]);assert(layout.button.bottom<=h&&layout.button.y>=0);
   assert.equal(await evaluate('document.querySelectorAll("nav,.top-command,.activity-stack,.chat-strip,.map-city,.map-tools,[data-popover]").length'),0);
   assert.equal(await evaluate('document.querySelectorAll("dialog").length'),1);
   const readability = await checkReadability();
   await shot(label+'-city');
   if(label!=='desktop') {
    await evaluate('document.querySelector("#overview .ledger-stats").scrollIntoView({block:"start"})');
    await shot(label+'-ledger');
    await evaluate('document.querySelector("#cityLedger").scrollTop=0');
   }
   await click('#innerCastle');
   assert.equal(await evaluate('document.querySelector("#cityNotice").hidden'),false);
   assert.equal(await evaluate('document.activeElement.id'),'innerCastle');
   await evaluate('document.querySelector("#cityLedger").scrollTop=0');
   await click('#defencesTab');
   assert.equal(await evaluate('document.querySelector("#defences").hidden'),false);
   await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});
   assert.equal(await evaluate('document.activeElement.id'),'overviewTab');
   await click('[data-amount="max"]');
   assert.equal(await evaluate('document.querySelector("#upgradeHint").textContent'),'Level 24 → 50 · +26 levels');
   await checkReadability();
   const maxBounds=await actionBounds();
   await click('#upgradeButton');
   assert.equal(await evaluate('document.querySelector("#cityPanel").dataset.state'),'pending');
   await checkReadability();
   assert.deepEqual(await actionBounds(),maxBounds,`${w}x${h}: Max action moved while developing`);
   await pause(750);
   assert.equal(await evaluate('document.querySelector("#cityLevel").textContent'),'50');
   assert.deepEqual(await actionBounds(),maxBounds,`${w}x${h}: Max action moved on success`);
   await load(w,h);
   await click('[data-amount="5"]');
   assert.equal(await evaluate('document.querySelector("#upgradeCost").textContent'),'3,200');
   assert.equal(await evaluate('document.querySelector("#upgradeHint").textContent'),'Level 24 → 29 · +5 levels');
   await checkReadability();
   await click('#upgradeButton');
   assert.equal(await evaluate('document.querySelector("#upgradeButton").disabled'),true);
   await pause(750);
   assert.equal(await evaluate('document.querySelector("#cityLevel").textContent'),'29');
   assert.match(await evaluate('document.querySelector("#actionFeedback").textContent'),/81,420/);
   await click('#closeCity');
   assert.equal(await evaluate('document.querySelector("#cityPanel").open'),false);
   await click('#reopenCity');
   await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
   await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
   await pause(180);
   assert.equal(await evaluate('document.querySelector("#cityPanel").open'),false);
   assert.equal(await evaluate('document.activeElement.id'),'reopenCity');
   checks.push({viewport:`${w}x${h}`,layout,readability,interaction:'City Details only; scrolling to Inner Castle notice, tabs, arrow navigation, +5 and matching level preview, pending lock, local upgrade and affordability feedback, close/reopen and Escape focus restoration passed'});
  }
  for(const [w,h] of [[1440,900],[844,390],[568,320]]) {
   await load(w,h);
   const readyBounds=await actionBounds();
   for(const state of ['pending','success','error','disabled']) {
    await load(w,h,'state='+state);
    assert.equal(await evaluate('document.querySelector("#cityPanel").dataset.state'),state);
    assert.equal(await evaluate('document.querySelector("#upgradeButton").disabled'),['pending','disabled'].includes(state));
    assert.equal(await evaluate('document.querySelector("#upgradeButton").getAttribute("aria-busy")'),String(state==='pending'));
    const feedback=await evaluate(`({title:document.querySelector('#feedbackTitle').textContent,balance:document.querySelector('.feedback-balance').textContent,icon:document.querySelector('#feedbackIcon').dataset.renderedIcon,atomic:document.querySelector('#actionFeedback').getAttribute('aria-atomic')})`);
    const expected={pending:['Developing city…','Available: 84,620 gold','upgrade'],success:['Level 25 reached','Remaining: 83,980 gold','city'],error:['Upgrade failed','Gold unchanged: 84,620','ledger'],disabled:['Need 320 more gold','Available: 320 gold','coin']}[state];
    assert.deepEqual([feedback.title,feedback.balance,feedback.icon],expected);assert.equal(feedback.atomic,'true');
    await checkReadability();
    assert.deepEqual(await actionBounds(),readyBounds,`${w}x${h} ${state}: footer moved between states`);
    if(w===844) await shot('state-'+state);
    if(state==='pending') {
     assert.equal(await evaluate('[...document.querySelectorAll("[data-amount]")].every(b=>b.disabled)'),true);
     await click('#upgradeButton');await pause(750);
     assert.equal(await evaluate('document.querySelector("#cityLevel").textContent'),'24');
     assert.equal(await evaluate('document.querySelector("#availableGold").textContent'),'84,620');
    }
    if(state==='error') {
     assert.equal(await evaluate('document.querySelector("#upgradeLabel").textContent'),'Retry upgrade');
     await click('#upgradeButton');await pause(750);
     assert.match(await evaluate('document.querySelector("#actionFeedback").textContent'),/Gold unchanged: 84,620/);
     assert.equal(await evaluate('document.querySelector("#cityLevel").textContent'),'24');
     assert.equal(await evaluate('document.querySelector("#upgradeButton").disabled'),false);
    }
    if(state==='disabled') {
     await click('[data-amount="5"]');await checkReadability();
     assert.equal(await evaluate('document.querySelector("#feedbackTitle").textContent'),'Need 2,880 more gold');
     await click('[data-amount="max"]');await checkReadability();
     assert.equal(await evaluate('document.querySelector("#upgradeHint").textContent'),'Level 24 · No change');
     assert.equal(await evaluate('document.querySelector("#feedbackTitle").textContent'),'Need 320 more gold');
     assert.equal(await evaluate('document.querySelector("#upgradeCost").textContent'),'640');
     assert.equal(await evaluate('document.querySelector("#upgradeButton").disabled'),true);
    }
    checks.push({viewport:`${w}x${h}`,state,feedback,stableActionBounds:readyBounds,result:'passed'});
   }
  }
  await load(844,390);
  await click('#upgradeButton');await pause(750);
  assert.equal(await evaluate('document.querySelector("#cityLevel").textContent'),'25');
  assert.match(await evaluate('document.querySelector("#actionFeedback").textContent'),/83,980/);
  await click('[data-amount="max"]');await click('#upgradeButton');await pause(750);
  assert.equal(await evaluate('document.querySelector("#cityLevel").textContent'),'50');
  assert.equal(await evaluate('document.querySelector("#upgradeHint").textContent'),'City at level 50');
  assert.equal(await evaluate('document.querySelector("#upgradeButton").disabled'),true);
  checks.push({interaction:'+1 succeeds; Max reaches sample cap and disables further upgrade',result:'passed'});
  // Review evidence only: show the same city glyphs enlarged and at small size.
  const iconRows = await evaluate(`['coin','troops','wall','ledger','city','upgrade'].map(key => ({key, marks:document.querySelector('[data-icon="'+key+'"] svg').innerHTML}))`);
  const iconNames = ['Gold', 'Garrison', 'Walls', 'Invested gold', 'Inner Castle', 'Develop city'];
  const iconStyles = fs.readFileSync(path.join(__dirname, 'prototype.css'), 'utf8');
  const sharedIconStyles = iconStyles.slice(iconStyles.indexOf('.icon svg {'), iconStyles.indexOf('.small-caps {'));
  const iconSheet = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="230" viewBox="0 0 900 230">
    <style>${sharedIconStyles}text{font-family:Segoe UI,Arial,sans-serif;fill:#302c22}.caption{font-size:13px}.small-size .engraving-fine{display:none}</style>
    <rect width="900" height="230" fill="#f2e8cd"/>
    <text x="28" y="31" font-size="18" font-family="Georgia,serif">City Details · Woodcut icon study</text>
    <text x="28" y="52" font-size="11">Enlarged above · Compact 18px rendering below</text>
    ${iconRows.map((icon, index) => `<g class="icon" color="#746446" transform="translate(${28 + index * 145},70)">
      <svg x="28" width="64" height="64" viewBox="0 0 32 32">${icon.marks}</svg>
      <text class="caption" x="60" y="88" text-anchor="middle">${iconNames[index]}</text>
      <svg class="small-size" x="51" y="110" width="18" height="18" viewBox="0 0 32 32">${icon.marks}</svg>
    </g>`).join('')}
  </svg>`;
  fs.writeFileSync(path.join(output, 'icons-detail.svg'), iconSheet);
  await load(900,230,'','evidence/icons-detail.svg');
  await shot('icons-detail');
  await load(390,844);
  assert.equal(await evaluate('document.querySelector("#cityPanel").open'),false);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".orientation")).display'),'flex');
  assert.equal(await evaluate('document.querySelector("#previewSurface").inert'),true);
  checks.push({viewport:'390x844',result:'orientation prompt visible; modal closed; underlying preview inert'});
  await load(1440,1050,'','index.html');await pause(450);await shot('review-desktop');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  await load(390,844,'','index.html');await pause(450);await shot('review-mobile');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  const external = requests.filter(url=>!url.startsWith(address.url));
  assert.deepEqual(external,[]);assert.deepEqual(failures,[]);
  const result = {date:new Date().toISOString(),scope:'City Details only',browser:'Headless Chrome',checks,externalRequests:external,runtimeErrors:failures,limitations:['Synthetic data and outcomes; no backend validation','No physical touch-device, screen-reader or iOS Safari verification','City layout, colours and information retained by user request; design refinement continues']};
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
