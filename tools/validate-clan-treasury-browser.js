"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const server=createMapBenchmarkServer(),address=await server.listen();let browser,client;
 const artifacts=path.resolve(__dirname,"../release-artifacts/clan-treasury-game");fs.mkdirSync(artifacts,{recursive:true});
 const errors=[],records=[];
 try{
  const executable=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));assert(executable);
  browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await client.send("Page.enable");await client.send("Runtime.enable");client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  const ev=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<700;i++){if(await ev(expression))return;await delay(80);}throw Error("Timeout: "+expression+JSON.stringify(errors));};
  const screenshot=async name=>fs.writeFileSync(path.join(artifacts,name+".png"),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  for(const [width,height]of[[1440,900],[844,390],[568,320]]){
   await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:height<600});
   await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0&section=rewards&reward=treasury"});
   await wait('document.documentElement?.dataset.crownlandsBenchmarkReady==="true"');
   await ev(`(()=>{const s=document.createElement('script');s.src='docs/visual-qa/clan-overview/runtime-fixture.js';document.body.append(s)})()`);
   await wait('document.documentElement?.dataset.clanRuntimeReady==="true"');
   await ev(`(()=>{
    window.ctq={calls:[],fail:false,hold:false};const api=getOnlineApi();updateEconomy=()=>{};refreshServerEconomy=async()=>{if(ctq.nextGold!==undefined)state.gold=ctq.nextGold;};
    window.ctReset=()=>{clanTreasuryView={};clanTreasuryDonationRequest=null;state.gold=32400000;clanTreasuryStatus={clanId:state.clanId,treasury:{balance:84250000,totalDonated:134250000,totalSpent:50000000,revision:1},allowance:{remaining:18000000,dailyCap:24000000,donatedToday:6000000,locked:true,rawGoldPerHourSnapshot:2000000}};clanTreasuryClanId=state.clanId;clanContent.querySelector('.clan-treasury-ui')?.remove();renderClanView();};
    getOnlineApi=()=>({...api,donateClanTreasuryGold:async payload=>{ctq.calls.push(payload);if(ctq.hold)await new Promise(r=>ctq.release=r);if(ctq.fail){ctq.fail=false;throw Error('Donation could not be confirmed. Retry.');}const t=clanTreasuryStatus.treasury,a=clanTreasuryStatus.allowance;ctq.nextGold=state.gold-payload.amount;return{clanId:state.clanId,balance:t.balance+payload.amount,totalDonated:t.totalDonated+payload.amount,totalSpent:t.totalSpent,revision:t.revision+1,allowance:{...a,locked:true,remaining:a.remaining-payload.amount,donatedToday:a.donatedToday+payload.amount}};}});
    ctReset();
   })()`);
   await wait(`!!document.querySelector('.clan-treasury-ui') && [...document.querySelectorAll('.clan-treasury-ui img')].every(img=>img.complete)`);
   await ev('document.fonts.ready');await delay(150);
   const layout=await ev(`(()=>{const p=document.querySelector('.clan-treasury-ui'),b=p.querySelector('#ct-reviewDonation'),r=b.getBoundingClientRect();return{visible:r.top>=0&&r.bottom<=innerHeight&&r.height>=44,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),overflow:[p,...p.querySelectorAll('.scroll-panel')].some(n=>n.scrollWidth>n.clientWidth+1),art:[...p.querySelectorAll('img')].every(n=>n.complete&&n.naturalWidth)}})()`);
   await screenshot(width+'-overview');assert(layout.visible&&layout.hit&&!layout.overflow&&layout.art,JSON.stringify({width,...layout}));
   assert(await ev(`(()=>{const input=document.querySelector('#ct-amount'),slider=document.querySelector('#ct-amountSlider');return[input,slider].every(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});})()`), 'Amount input and slider must be visible before scrolling.');
   await ev(`document.querySelector('#ct-amount').value='1234567';document.querySelector('#ct-amount').dispatchEvent(new Event('input'));document.querySelector('.donation-panel').scrollTop=9999;document.querySelector('.treasury-rules').open=true;renderClanView()`);
   assert.equal(await ev(`document.querySelector('#ct-amount').value`),'1234567');assert(await ev(`document.querySelector('.treasury-rules').open`));
   assert.equal(await ev(`document.querySelector('#ct-personalAfter').textContent`),'31,165,433');
   await ev(`document.querySelector('#ct-max').click();document.querySelector('#ct-reviewDonation').click()`);
   await wait(`!!document.querySelector('.clan-treasury-confirmation[open]')`);await screenshot(width+'-confirmation');
   assert(await ev(`document.querySelector('.clan-treasury-confirmation').textContent.includes('18,000,000')`));
   await ev(`document.querySelector('.clan-treasury-confirmation button[value=cancel]').click()`);await wait('!clanLedgerConfirmationOpen');assert.equal(await ev('ctq.calls.length'),0);
   await ev(`ctq.hold=true;document.querySelector('#ct-reviewDonation').click()`);await wait(`!!document.querySelector('.clan-treasury-confirmation[open]')`);
   await ev(`document.querySelector('.clan-treasury-confirmation button[value=accept]').click()`);await wait('clanTreasuryActionInFlight');
   await ev('void donateClanTreasuryFromPanel()');assert.equal(await ev('ctq.calls.length'),1);
   assert(await ev(`document.querySelector('#ct-reviewDonation').disabled`));assert.equal(await ev('state.gold'),32400000);
   await ev('ctq.hold=false;ctq.release()');await wait('!clanTreasuryActionInFlight');
   assert.equal(await ev('state.gold'),14400000);assert.equal(await ev('clanTreasuryStatus.treasury.balance'),102250000);
   assert(await ev(`document.querySelector('#ct-feedback').textContent.includes('18,000,000 Gold donated')`));
   await screenshot(width+'-success');
   await ev('ctReset();ctq.fail=true');await ev(`document.querySelector('#ct-reviewDonation').click()`);await wait(`!!document.querySelector('.clan-treasury-confirmation[open]')`);
   await ev(`document.querySelector('.clan-treasury-confirmation button[value=accept]').click()`);await wait('!clanTreasuryActionInFlight && ctq.calls.length===2');
   assert.equal(await ev('state.gold'),32400000);assert.equal(await ev(`document.querySelector('#ct-reviewDonation').textContent`),'Review & retry');
   await ev(`document.querySelector('#ct-reviewDonation').click()`);await wait(`!!document.querySelector('.clan-treasury-confirmation[open]')`);
   await ev(`document.querySelector('.clan-treasury-confirmation button[value=accept]').click()`);await wait('!clanTreasuryActionInFlight && ctq.calls.length===3');
   assert.equal(await ev('ctq.calls[1].operationId'),await ev('ctq.calls[2].operationId'));
   for(const invalid of ['0','-1','1.5','999999999']){
    await ev(`document.querySelector('#ct-amount').value=${JSON.stringify(invalid)};document.querySelector('#ct-amount').dispatchEvent(new Event('input'))`);
    assert(await ev(`document.querySelector('#ct-reviewDonation').disabled`));
   }
   // Changes while confirmation is open require reviewing again, with no request sent.
   await ev(`ctReset();document.querySelector('#ct-reviewDonation').click()`);await wait(`!!document.querySelector('.clan-treasury-confirmation[open]')`);
   await ev(`state.gold=1;document.querySelector('.clan-treasury-confirmation button[value=accept]').click()`);await wait('!clanLedgerConfirmationOpen');
   assert.equal(await ev('ctq.calls.length'),3);
   await ev('clanTreasuryStatus=null;renderClanView()');assert.equal(await ev(`document.querySelector('#ct-reviewDonation').textContent`),'Retry connection');
   await screenshot(width+'-unavailable');
   // Leaving the clan cancels any pending confirmation.
   await ev(`ctReset();document.querySelector('#ct-reviewDonation').click()`);await wait(`!!document.querySelector('.clan-treasury-confirmation[open]')`);
   await ev('resetClanTreasuryState()');await wait('!clanLedgerConfirmationOpen');assert(!await ev(`!!document.querySelector('.clan-treasury-confirmation[open]')`));
   await ev(`ctReset();document.querySelector('#ct-back').click()`);
   assert.equal(await ev('activeClanRewardSection'),'gifts');
   assert(await ev(`getComputedStyle(document.querySelector('.clan-section-nav')).display!=='none'`));
   await ev(`document.querySelector('[data-clan-reward=treasury]').click()`);
   assert(await ev(`!!document.querySelector('.clan-treasury-ui')`));
   records.push({width,height,...layout});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(artifacts,'checks.json'),JSON.stringify({records,errors},null,2));console.log(JSON.stringify({passed:true,viewports:records.length,errors}));
 }finally{if(client){await client.send('Browser.close').catch(()=>{});client.close();}if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}await server.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
