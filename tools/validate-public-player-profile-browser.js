"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const server=createMapBenchmarkServer(),address=await server.listen();
  let browser,client;const errors=[],results=[];
  const output=path.resolve(__dirname,"../release-artifacts/public-player-profile");fs.mkdirSync(output,{recursive:true});
  try{
    const executable=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));
    assert(executable,"Chromium required");browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
    await client.send("Page.enable");await client.send("Runtime.enable");client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
    const evaluate=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    const run=code=>evaluate(`document.getElementById("game").contentWindow.eval(${JSON.stringify(code)})`);
    await client.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await client.send("Page.navigate",{url:address.url+"/docs/visual-qa/public-player-profile/preview.html"});
    let ready=false;for(let i=0;i<400;i++){ready=await evaluate('document.documentElement?.dataset.publicProfileReady==="true"');if(ready)break;await delay(100);}assert(ready,"Profile fixture did not load");
    const catalog=require("../functions/core-expansion-region-catalog.json");
    const locations=catalog.regions.filter(r=>r.lifecycle==="active"&&r.permanentCore).flatMap(r=>JSON.parse(fs.readFileSync(path.resolve(__dirname,"..",r.regionDefinitionPath),"utf8")).cities.map(c=>({mainCityId:c.id,mainRegionId:r.id})));
    const normalized=await run(`(${JSON.stringify(locations)}).every(raw=>normalizePublicPlayerProfile({...raw,uid:'test'}).mainCityId===raw.mainCityId)`);
    assert(normalized,"Cold Core city IDs disappeared from public profiles");
    assert(await run(`(()=>{const p=PublicProfileReview.raw;return normalizePlayerIdentity({...p,mainRegionId:'',mainIslandId:getOnlineIslandId(p.mainRegionId)}).mainCityId===p.mainCityId})()`),"Island-only identity fallback failed");
    for(const [width,height] of [[1440,900],[844,390],[568,320]]){
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:height<600});
      for(const sample of ["standard","large","independent","unavailable"]){
        await run(`PublicProfileReview.show(${JSON.stringify(sample)})`);await delay(160);
        const layout=await run(`(()=>{const r=modal.getBoundingClientRect(),body=modalBody,button=body.querySelector('[data-public-main-city]'),b=button.getBoundingClientRect(),cols=[...body.querySelectorAll('.public-profile-section')].map(n=>n.getBoundingClientRect()),flag=body.querySelector('#publicPlayerFlag');return {open:modal.open,width:r.width,height:r.height,left:r.left,top:r.top,bottom:r.bottom,viewportHeight:innerHeight,viewportWidth:innerWidth,overflow:body.scrollWidth>body.clientWidth+1,columns:cols.every(c=>Math.abs(c.top-cols[0].top)<2),buttonVisible:b.bottom<=innerHeight&&b.top>=0,disabled:button.disabled,flag:!!flag.querySelector('svg'),text:body.textContent,brokenImages:[...body.querySelectorAll('img')].filter(n=>!n.complete||!n.naturalWidth).length}})()`);
        assert(layout.open&&!layout.overflow&&layout.columns,JSON.stringify({width,height,sample,layout}));
        assert(layout.left>=0&&layout.top>=0&&layout.bottom<=height+1,"Profile leaves viewport");
        if(sample==="standard"){const shot=await client.send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(output,`${width}x${height}.png`),Buffer.from(shot.data,"base64"));}
        if(sample!=="large")assert(layout.buttonVisible,`Main City requires scrolling: ${JSON.stringify({width,height,sample,layout})}`);
        assert.equal(layout.disabled,sample==="unavailable");assert.equal(layout.brokenImages,0);assert(layout.text.includes("Estimated troops"));
        if(sample==="independent")assert(layout.text.includes("Unavailable")&&layout.text.includes("Not in a clan"));
        results.push({width,height,sample,layout});
      }
    }
    await run("PublicProfileReview.show('failure')");
    await run("modalBody.querySelector('[data-public-main-city]').click()");await delay(150);
    assert(await run("modal.open && !modalBody.querySelector('[data-public-main-city]').disabled && modalBody.querySelector('.public-profile-location-status').textContent.includes('could not load')"),"Failed navigation must preserve profile and retry");
    // Actual uncached cross-map navigation through the benchmark's mock online API.
    await run("PublicProfileReview.show('standard')");
    const navigation=await run(`(async()=>{const target=PublicProfileReview.raw;const before={active:getActiveMapRegionId(),knownWithoutRegion:getKnownCityId(target.mainCityId),profileOpen:profileScreen.classList.contains('open')};const result=await focusPublicPlayerMainCity(target.mainCityId,target.mainRegionId);await new Promise(r=>setTimeout(r,150));return {before,result,active:getActiveMapRegionId(),target:selectedTargetId||selectedSourceId,modalOpen:modal.open,profileOpen:profileScreen.classList.contains('open'),expected:target.mainCityId,region:target.mainRegionId}})()`);
    assert(navigation.before.profileOpen);assert(navigation.result,JSON.stringify(navigation));assert.equal(navigation.target,navigation.expected);assert.equal(navigation.active,navigation.region);assert(!navigation.modalOpen&&!navigation.profileOpen,"Location stayed behind Profile");
    const sameMap=await run(`(async()=>{await PublicProfileReview.show();const original=switchOnlineIsland;switchOnlineIsland=()=>{throw Error('Unexpected map switch')};try{return await focusPublicPlayerMainCity(PublicProfileReview.raw.mainCityId,PublicProfileReview.raw.mainRegionId)}finally{switchOnlineIsland=original}})()`);
    assert(sameMap,"Current-map location should not need another connection");
    const missing=await run(`(async()=>{await PublicProfileReview.show();const original=cityById;cityById=()=>null;try{const success=await focusPublicPlayerMainCity(PublicProfileReview.raw.mainCityId,PublicProfileReview.raw.mainRegionId);return !success&&modal.open&&modalBody.querySelector('.public-profile-location-status').textContent.includes('no longer available')}finally{cityById=original}})()`);
    assert(missing,"Missing target should retain the profile with recovery feedback");
    // Exercise the real click handler and prevent duplicate requests while in flight.
    const pending=await run(`(async()=>{await PublicProfileReview.show();const saved=switchOnlineIsland;let release,calls=0;const current=getActiveMapRegionId();const other=Object.values(REGION_CATALOG_SUMMARIES_BY_ID instanceof Map?Object.fromEntries(REGION_CATALOG_SUMMARIES_BY_ID):{}).find(r=>r.id!==current);const button=modalBody.querySelector('[data-public-main-city]');button.dataset.publicMainRegion=other.id;switchOnlineIsland=async()=>{calls++;return new Promise(r=>release=r)};try{button.click();button.click();const disabled=button.disabled;const busy=publicPlayerLocationPending;release(false);await new Promise(r=>setTimeout(r,100));return {calls,disabled,busy,retry:!button.disabled,open:modal.open}}finally{switchOnlineIsland=saved}})()`);
    assert.deepEqual(pending,{calls:1,disabled:true,busy:true,retry:true,open:true});
    // Stale completion must not select a city or close a replacement destination.
    const stale=await run(`(async()=>{await PublicProfileReview.show();const saved=switchOnlineIsland,active=getActiveMapRegionId;let release;const before=selectedTargetId;getActiveMapRegionId=()=> 'not-the-destination';switchOnlineIsland=()=>new Promise(r=>release=r);try{const task=focusPublicPlayerMainCity(PublicProfileReview.raw.mainCityId,PublicProfileReview.raw.mainRegionId);publicPlayerProfileRequestId++;modalTitle.textContent='Replacement';release(false);await task;return modal.open&&modalTitle.textContent==='Replacement'&&selectedTargetId===before;}finally{switchOnlineIsland=saved;getActiveMapRegionId=active}})()`);
    assert(stale,"Stale profile navigation affected replacement panel");
    const accountChanged=await run(`(async()=>{await PublicProfileReview.show();const saved=switchOnlineIsland,active=getActiveMapRegionId,uid=getCurrentOnlineUid;let switched=false;getActiveMapRegionId=()=>switched?PublicProfileReview.raw.mainRegionId:'not-the-destination';switchOnlineIsland=async()=>{switched=true;getCurrentOnlineUid=()=> 'different-account';return true};try{const result=await focusPublicPlayerMainCity(PublicProfileReview.raw.mainCityId,PublicProfileReview.raw.mainRegionId);return !result&&modal.open;}finally{switchOnlineIsland=saved;getActiveMapRegionId=active;getCurrentOnlineUid=uid}})()`);
    assert(accountChanged,"Account change must cancel stale location selection");
    await run("PublicProfileReview.show();");await run("modalBody.querySelector('[data-public-clan-id]').click()");await delay(150);
    assert(await run("!!modalBody.querySelector('.public-clan-details')&&!modalBody.querySelector('.public-player-profile')"),"Clan affiliation link broken");
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,"verification.json"),JSON.stringify({coldCoreCities:locations.length,results,navigation,pending,stale,errors},null,2));
    console.log(`Validated ${locations.length} Core locations, public-profile layout at three sizes, estimates, clan links, actual cross-map navigation, failure/retry, duplicate prevention and stale response protection.`);
  }finally{
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
