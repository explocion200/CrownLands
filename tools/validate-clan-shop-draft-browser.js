const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {CdpClient}=require('./map-benchmark/cdp-client');
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require('./validate-focused-browser-smoke');
const {createMapBenchmarkServer}=require('./map-benchmark/server');
const dir=path.join(__dirname,'../release-artifacts/clan-shop-draft');fs.mkdirSync(dir,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const server=createMapBenchmarkServer(),address=await server.listen();let browser,client;const errors=[],records=[];
try{
 const executable=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));assert(executable,'Set CHROME_PATH to Chromium.');browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await client.send('Page.enable');await client.send('Runtime.enable');
 client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 const ev=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const capture=async name=>fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 for(const [width,height]of[[1440,900],[844,390],[568,320]]){
  await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:height<600});
  await client.send('Page.navigate',{url:address.url+'/docs/visual-qa/clan-shop/preview.html'});
  for(let i=0;i<150;i++){if(await ev('document.documentElement.dataset.clanShopReady==="true"&&[...document.images].every(i=>i.complete&&i.naturalWidth)'))break;await delay(100);}
  const measure=()=>ev(`(()=>{const r=dialog.getBoundingClientRect(),b=$('#purchase').getBoundingClientRect();return{width:innerWidth,height:innerHeight,fits:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,bodyOverflow:document.body.scrollWidth>innerWidth,panels:[...document.querySelectorAll('.catalogue,.selection-scroll,.purchase-footer')].every(n=>n.scrollWidth<=n.clientWidth+1),items:document.querySelectorAll('[data-item]').length,buyVisible:b.top>=0&&b.bottom<=innerHeight&&b.height>=44,buyHit:$('#purchase').contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)};})()`);
  const result=await measure();assert(result.fits&&!result.bodyOverflow&&result.panels&&result.buyVisible&&result.buyHit,JSON.stringify(result));assert.equal(result.items,7);assert.deepEqual(result.broken,[]);
  await capture(width+'-wares');
  for(const id of ['recall_horn','swift_march_order','royal_tax_decree_30m','war_drums_30m','veil_of_silence_30m','common_gear_box','shield_12h']){
   await ev(`select(${JSON.stringify(id)},true)`);assert(await ev(`document.querySelector('[data-item="${id}"]').getBoundingClientRect().height>=44`));assert((await measure()).buyVisible);
  }
  await ev(`$('#purchase').click()`);assert.equal(await ev('model.section'),'upgrades');await capture(width+'-upgrades');
  const upgrade=await ev(`(()=>{const b=$('#upgradeShop').getBoundingClientRect();return{visible:b.top>=0&&b.bottom<=innerHeight&&b.height>=44,overflow:[...document.querySelectorAll('.building-summary,.upgrade-scroll,.upgrade-footer')].some(n=>n.scrollWidth>n.clientWidth+1),levels:document.querySelectorAll('.unlock-table tbody tr').length};})()`);
  assert(upgrade.visible&&!upgrade.overflow,JSON.stringify(upgrade));assert.equal(upgrade.levels,10);
  await ev('reset(9,"ready");select("common_gear_box");$("#purchase").click();$("#purchase").click()');await delay(650);
  assert.deepEqual(await ev('({gold:model.gold,owned:model.owned.common_gear_box,remaining:chosen().remaining})'),{gold:4740000,owned:4,remaining:0});
  await ev('reset(9,"error");$("#purchase").click()');await delay(650);assert.equal(await ev('model.gold'),5000000);assert(await ev('model.feedback.includes("No Gold was spent")'));
  await ev('$("#purchase").click()');await delay(650);assert.equal(await ev('model.gold'),4740000);
  await ev('reset(10,"ready");$("#purchase").click()');await delay(650);assert(await ev('model.usage.shieldReadyAtMs>Date.now()+71*3600000'));assert(await ev('$("#purchase").disabled'));
  for(const sample of ['new','low','spent','member','paused','loading','unavailable']){
   await ev(`reset(9,${JSON.stringify(sample)})`);assert((await measure()).buyVisible);
   if(['new','low','spent','loading'].includes(sample))assert(await ev('$("#purchase").disabled'));
   if(sample==='member'||sample==='paused'){await ev('section("upgrades")');assert(await ev('$("#upgradeShop").disabled'));}
  }
  await ev('reset(0,"ready")');assert.equal(await ev('rows().filter(i=>i.unlocked).length'),0);await ev('$("#purchase").click()');assert.equal(await ev('model.section'),'upgrades');
  await ev('reset(9,"ready");close();$("#reopen").click()');assert(await ev('dialog.open'));
  records.push({...result,upgrade,purchases:true,limits:true,states:true});
 }
 await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await client.send('Page.navigate',{url:address.url+'/docs/visual-qa/clan-shop/index.html?viewport=landscape&level=10'});
 for(let i=0;i<150;i++){if(await ev('document.querySelector("#preview")?.contentDocument?.documentElement.dataset.clanShopReady==="true"'))break;await delay(100);}
 assert.equal(await ev('document.querySelector("#preview").style.width'),'844px');
 await ev('document.querySelector("[data-viewport=small]").click()');assert.equal(await ev('document.querySelector("#preview").style.width'),'568px');
 await ev('document.querySelector("#level").value="2";document.querySelector("#level").dispatchEvent(new Event("change"))');await delay(150);
 assert.equal(await ev('document.querySelector("#preview").contentDocument.querySelector("#shopLevel").textContent'),'Level 2');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'checks.json'),JSON.stringify({verifiedAt:new Date().toISOString(),records,errors},null,2));console.log(JSON.stringify({passed:true,viewports:records.length,reviewControls:true,records},null,2));
}finally{if(client){await client.send('Browser.close').catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
