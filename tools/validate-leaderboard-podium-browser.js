"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const inspectPlayerBanners=require("./player-banner-browser-checks");
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const server=createMapBenchmarkServer(),address=await server.listen();
 const executable=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));
 assert(executable,"Set CHROME_PATH to Chromium.");
 const out=path.resolve(__dirname,"../release-artifacts/leaderboard-live");fs.mkdirSync(out,{recursive:true});
 const errors=[];let session,client;
 try{
 session=await startBrowserSession(executable);
 client=await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
 await client.send("Runtime.enable");await client.send("Page.enable");
 await client.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
 client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails?.exception?.description||e.exceptionDetails?.text));
 const evaluate=async expression=>{
  const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
 };
 const ready=async expression=>{for(let i=0;i<240;i++){if(await evaluate(expression))return;await wait(125);}throw Error("Timed out: "+expression);};
 const open=async params=>{
  await evaluate("if(document.documentElement)delete document.documentElement.dataset.ledgerQa");
  await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0&"+params});
  await ready('document.documentElement?.dataset.ledgerQa==="ready"');
 };
 for(const [width,height] of [[1366,820],[844,390],[568,320]]){
  await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
  await open("ledgerUi=players");
  for(const [tab,id] of [["players","leaderboardRows"],["clans","clanLeaderboardRows"],["glory","pvpLeaderboardRows"]]){
   await evaluate(`document.querySelector('[data-leaderboard-tab="${tab}"]').click()`);
   await ready(`document.querySelectorAll('#${id} .leaderboard-row').length===100`);
   if(tab!=="clans"){
    const banners=await evaluate(`(${inspectPlayerBanners})(document.querySelector('[data-leaderboard-panel="${tab}"]'))`);
    assert(banners.length>=100&&banners.every(result=>result==="ok"),`Banner rendering at ${width}: ${JSON.stringify(banners)}`);
    const refreshed=await evaluate(`(() => {
     const uid=getCurrentOnlineUid(),flag={version:2,primary:'#C69A45',secondary:'#202426',symbolColor:'#F2E2BF',pattern:'cross',symbol:'wolf'};
     FlagRenderer.refresh(uid,flag);
     const copies=[...document.querySelectorAll('[data-leaderboard-panel="${tab}"] [data-flag-stable-key]')].filter(n=>n.dataset.flagStableKey===uid);
     return copies.length===2&&copies.every(n=>n.classList.contains('pattern-cross')&&n.querySelector('[data-flag-symbol="wolf"]')&&n.style.getPropertyValue('--flag-primary')==='#C69A45');
    })()`);
    assert(refreshed,"Saved flag refresh missed the player row or personal standing");
   }
   const layout=await evaluate(`(() => {
    const l=document.getElementById('${id}'),p=l.closest('[data-leaderboard-panel]'),m=document.querySelector('#modal');
    const champions=[...l.querySelectorAll('.leaderboard-champion')],box=l.getBoundingClientRect();
    return {champions:champions.length,rows:l.querySelectorAll(':scope>.leaderboard-row').length,
     first:l.querySelector(':scope>.leaderboard-row .leaderboard-rank').textContent,
     overflow:m.scrollWidth>m.clientWidth+1||l.scrollWidth>l.clientWidth+1,
     positions:champions.map(r=>r.getBoundingClientRect().left),
     scoresFit:champions.every(r=>{const s=r.querySelector('.leaderboard-power');return s.scrollWidth<=s.clientWidth+1}),
     score:champions[0].querySelector('.leaderboard-power strong').textContent,
     podiumVisible:champions.every(r=>r.getBoundingClientRect().bottom<=box.bottom+1),
     findVisible:p.querySelector('[data-find-rank]').getBoundingClientRect().bottom<=box.bottom+1};
   })()`);
   const shot=await client.send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(out,tab+"-"+width+".png"),Buffer.from(shot.data,"base64"));
   assert.equal(layout.champions,3);assert.equal(layout.rows,97);assert.equal(layout.first,"4");
   assert(!layout.overflow&&layout.scoresFit,JSON.stringify(layout));
   assert(layout.positions[1]<layout.positions[0]&&layout.positions[0]<layout.positions[2]);
   assert(layout.podiumVisible&&layout.findVisible,`Initial podium/standing clipped at ${width}: ${JSON.stringify(layout)}`);
   if(tab==="glory")assert.equal(layout.score,"23,456,700");
   await evaluate(`document.querySelector('[data-leaderboard-panel="${tab}"] [data-find-rank]').click()`);
   await ready(`document.activeElement?.classList.contains('current')&&document.getElementById('${id}').scrollTop>0`);
   await evaluate("document.querySelector('#leaderboardRefreshBtn').click()");
   await ready(`document.querySelectorAll('#${id} .leaderboard-champion').length===3`);
   assert.equal(await evaluate(`document.querySelectorAll('#${id} .leaderboard-columns').length`),1);
  }
  await evaluate(`document.querySelector('[data-leaderboard-tab="glory"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('[data-leaderboard-tab="players"]').getAttribute('aria-selected')`),"true");
 }
 await open("ledgerUi=glory&sample=empty");
 await ready("document.querySelector('#pvpLeaderboardRows .leaderboard-empty')!==null");
 assert.equal(await evaluate("document.querySelectorAll('#pvpLeaderboardRows .leaderboard-champion').length"),0);
 await evaluate(`window.CrownlandsOnline.loadPvpLeaderboard=async()=>{throw Error('Synthetic failure');};document.querySelector('#leaderboardRefreshBtn').click()`);
 await ready("document.querySelector('#leaderboardGloryPanel .leaderboard-standing').textContent==='Standing unavailable.'");
 await evaluate(`window.CrownlandsOnline.loadPvpLeaderboard=async()=>({entries:[
  {uid:getCurrentOnlineUid(),displayName:'Current champion',pvpKills:321},
  {uid:'runner-up',displayName:'Runner up',pvpKills:123}],trackingStartedAtMs:1});document.querySelector('#leaderboardRefreshBtn').click()`);
 await ready("document.querySelectorAll('#pvpLeaderboardRows .leaderboard-champion').length===2");
 assert.equal(await evaluate("document.querySelectorAll('#pvpLeaderboardRows>.leaderboard-row').length"),0);
 assert.equal(await evaluate("document.querySelector('#leaderboardGloryPanel .leaderboard-standing>strong').textContent"),"#1");
 await evaluate(`window.CrownlandsOnline.loadPvpLeaderboard=()=>new Promise(resolve=>window.resolveOldGlory=resolve);document.querySelector('#leaderboardRefreshBtn').click()`);
 await evaluate(`showLeaderboardModal();window.resolveOldGlory({entries:[{uid:'obsolete',displayName:'Obsolete response',pvpKills:999}],trackingStartedAtMs:1})`);
 await wait(100);assert.equal(await evaluate("document.body.textContent.includes('Obsolete response')"),false);
 assert.deepEqual(errors,[]);
 console.log("Live leaderboard passed desktop/mobile podium, full totals, 100 unique ranks, scroll/focus, refresh, keyboard, empty/failure/few-entry states and stale-modal guards.");
 }finally{
  if(client)await client.send("Browser.close").catch(()=>{});
  if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
  await server.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
