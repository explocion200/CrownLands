"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {createMapBenchmarkServer}=require("./map-benchmark/server");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
function fixture() {
  const C=COSMETIC_CATALOG, uid="cosmetic-fixture";
  const qa=window.__skinQA={ purchases:0,equips:0,requests:[],mode:"ok", receipts:new Map() };
  qa.wallet=C.normalize({crowns:2000}); cosmeticUid=uid; cosmeticState=qa.wallet;
  cosmeticOffset=Date.UTC(2026,9,12)-Date.now();
  getCurrentOnlineUid=()=>uid; saveGame=()=>{}; syncPlayerIdentityToAllOwnedCities=async()=>{};
  qa.api={getUser:()=>({uid}),getCosmeticsState:async()=>({state:qa.wallet,serverNowMs:Date.UTC(2026,9,12)}),purchaseCosmetic:async request=>{
    qa.requests.push(request); const old=qa.receipts.get(request.requestId);
    if(old)return {state:qa.wallet,receipt:old,replayed:true};
    const result=C.purchase(qa.wallet,request,Date.UTC(2026,9,12)); qa.wallet=result.state;qa.receipts.set(request.requestId,result.receipt);qa.purchases++;
    if(qa.mode==="lost"){qa.mode="ok";throw Error("Connection lost after purchase");} return result;
  },equipCosmetic:async request=>{qa.equips++;qa.wallet=C.equip(qa.wallet,request.category,request.itemId);return{state:qa.wallet};}};
  getOnlineApi=()=>qa.api;
  const city=state.cities.find(city=>city.owner==="player"); if(city)city.ownerUid=uid;
  cosmeticCategory="all";cosmeticSelected="halloween_city";cosmeticOpenShopRequested=true;showShopModal();
}
function appearanceChecks() {
  const saved = cosmeticState;
  cosmeticState = COSMETIC_CATALOG.normalize({ ...saved, equipped: { city: "halloween_city", troops: "halloween_troops", border: "halloween_border" } });
  const city = { ...state.cities.find(city => city.owner === "player"), ownerUid: cosmeticUid };
  const node = document.createElement("div");
  applyCosmeticCityNode(node, city);
  const own = [node.dataset.citySkin, node.dataset.flagBorder];
  applyCosmeticCityNode(node, { ...city, kind: "stronghold" });
  const stronghold = [node.dataset.citySkin, node.dataset.flagBorder];
  applyCosmeticCityNode(node, { ...city, owner: "enemy", ownerUid: "capturing-ruler" });
  const captured = [node.dataset.citySkin, node.dataset.flagBorder];
  cosmeticOwnerAppearances.set("capturing-ruler", { city: "halloween_city", troops: "halloween_troops" });
  applyCosmeticCityNode(node, { ...city, owner: "enemy", ownerUid: "capturing-ruler" });
  const remote = node.dataset.citySkin;
  const attack = { id: "skin-army", owner: "player", ownerUid: cosmeticUid, kind: "attack", troops: 123, remaining: 60, fromId: city.id, toId: city.id };
  const token = createArmyTokenElement(attack);
  cosmeticState = saved;
  updateArmyTokenElement(token, attack, { x: 100, y: 100 }, city);
  const before = [token.className, token.querySelector(".army-token-count").textContent, token.querySelector(".army-token-time").textContent, token.querySelector(".army-token-icon").textContent];
  cosmeticState = COSMETIC_CATALOG.equip(saved, "troops", "halloween_troops");
  updateArmyTokenElement(token, attack, { x: 100, y: 100 }, city);
  const troop = token.dataset.troopSkin;
  const after = [token.className, token.querySelector(".army-token-count").textContent, token.querySelector(".army-token-time").textContent, token.querySelector(".army-token-icon").textContent];
  updateArmyTokenElement(token, { ...attack, kind: "scout" }, { x: 100, y: 100 }, city);
  const scout = [token.dataset.troopSkin, !!token.querySelector(".army-token-icon svg")];
  updateArmyTokenElement(token, { ...attack, owner: "enemy", ownerUid: "capturing-ruler", kind: "rally" }, { x: 100, y: 100 }, city);
  const rally = token.dataset.troopSkin;
  cosmeticState = saved;
  return { own, stronghold, captured, remote, before, after, troop, scout, rally };
}
function profileFrame() {
 const frame=getComputedStyle(profileScreen),title=getComputedStyle(document.getElementById('profileScreenTitle'));
 return {width:frame.width,height:frame.height,paper:frame.backgroundColor,border:frame.borderColor,shadow:frame.boxShadow,
   titleFont:title.fontFamily,active:getComputedStyle(profileScreen.querySelector('.profile-tabs button.active')).backgroundColor};
}
function profileControls() {
 const panel=document.querySelector('[data-skins-mode=profile]');
 const controls=[...profileScreen.querySelectorAll('.profile-tabs button,#profileCloseBtn'),...panel.querySelectorAll('.skins-filters button,[data-skin-earn],[data-skin-browse]')];
 return {controls:controls.map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{name:e.id||e.textContent,visible:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,hit:e===hit||e.contains(hit)};}),
   titleWidth:document.getElementById('profileScreenTitle').getBoundingClientRect().width,
   overflow:panel.scrollHeight>panel.clientHeight+1||panel.scrollWidth>panel.clientWidth+1};
}
async function main(){
 const browser=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));assert(browser,"Chromium required");
 const server=createMapBenchmarkServer(),address=await server.listen();let session,client;const errors=[];
 const out=path.resolve(__dirname,"../release-artifacts/halloween-skins");fs.mkdirSync(out,{recursive:true});
 try{
  session=await startBrowserSession(browser);client=await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await client.send("Runtime.enable");await client.send("Page.enable");client.on("Runtime.exceptionThrown",event=>errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
  const evaluate=async expression=>{const result=await client.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const wait=async expression=>{for(let i=0;i<400;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,125));}throw Error("Timed out: "+expression);};
  const click=async selector=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing or disabled '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});e.click();})()`);};
  const tap=async selector=>{
    await evaluate('Promise.all(profileScreen.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing or disabled control');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(hit!==e&&!e.contains(hit))throw Error('Control is obscured: '+${JSON.stringify(selector)});return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
  await evaluate(`(${fixture.toString()})()`);await wait("!!document.querySelector('[data-skins-mode=shop]')");
  await click('[data-skin-action]');
  await evaluate('cosmeticState={...cosmeticState,crowns:10};refreshCosmeticPanels()');
  assert.equal(await evaluate('cosmeticConfirmation'),null,"A changed wallet must dismiss an unaffordable confirmation");
  await evaluate('cosmeticState=__skinQA.wallet;refreshCosmeticPanels()');
  await click('[data-skin-action]');assert.equal(await evaluate('cosmeticConfirmation.price'),600);await click('[data-skin-confirm]');await wait('!cosmeticBusy');
  assert.equal(await evaluate('cosmeticState.crowns'),1400);assert.equal(await evaluate('cosmeticState.equipped.city'),"");
  assert.equal(await evaluate('document.getElementById("crownsBalance").title'),"1,400 Crowns","Confirmed spending must update the map counter");
  await click('[data-skin-select="halloween_collection"]');assert.equal(await evaluate('COSMETIC_CATALOG.quote(cosmeticSelected,cosmeticState,cosmeticNow()).price'),720);
  await evaluate('__skinQA.mode="lost"');await click('[data-skin-action]');await click('[data-skin-confirm]');await wait('!cosmeticBusy');assert.equal(await evaluate('!!cosmeticPendingPurchase'),true);
  await click('[data-skin-reload]');await wait('!cosmeticBusy');assert.equal(await evaluate('__skinQA.purchases'),2);assert.equal(await evaluate('cosmeticState.crowns'),680);assert.equal(await evaluate('__skinQA.requests[1].requestId===__skinQA.requests[2].requestId'),true);
  assert.equal(await evaluate('document.getElementById("crownsText").textContent'),"680","A reconciled purchase must update the counter once");
  const appearances = await evaluate(`(${appearanceChecks.toString()})()`);
  assert.deepEqual(appearances.own,["halloween_city","halloween_border"]);
  assert.deepEqual(appearances.stronghold,["",""]);assert.deepEqual(appearances.captured,["",""]);
  assert.equal(appearances.remote,"halloween_city");assert.deepEqual(appearances.before,appearances.after);
  assert.equal(appearances.troop,"halloween_troops");assert.deepEqual(appearances.scout,["",true]);assert.equal(appearances.rally,"halloween_troops");
  const flagPreview = await evaluate(`(()=>{
    const saved=state.flag,selection=cosmeticSelected;state.flag={...saved,pattern:'split'};cosmeticCategory='flag';refreshCosmeticPanels();
    const flag=document.querySelector('[data-skins-mode=shop] [data-skin-flag-symbol]');
    const pattern=getComputedStyle(flag,'::before'),symbol=getComputedStyle(flag.querySelector('.flag-symbol'));
    const result={pattern:flag.classList.contains('pattern-split'),content:pattern.content,left:pattern.left,color:symbol.color,expected:state.flag.symbolColor};
    state.flag=saved;cosmeticCategory='all';cosmeticSelected=selection;refreshCosmeticPanels();return result;
  })()`);
  assert(flagPreview.pattern&&flagPreview.content!=='none'&&parseFloat(flagPreview.left)>0,"Flag preview must render the saved two-color pattern");
  const rgb=flagPreview.expected.replace('#','').match(/../g).map(hex=>parseInt(hex,16));
  assert.equal(flagPreview.color,`rgb(${rgb.join(', ')})`,"Flag preview must retain the saved symbol color");
  await click('[data-skin-browse]');await wait('activeProfileTab==="skins"');await click('[data-skin-select="halloween_city"]');await click('[data-skin-action]');await wait('!cosmeticBusy');assert.equal(await evaluate('cosmeticState.equipped.city'),"halloween_city");
  await evaluate('renderCities(true)');assert(await evaluate('!!document.querySelector(".city-node[data-city-skin=halloween_city]")'));
  await click('[data-skin-select="default_city"]');await click('[data-skin-action]');await wait('!cosmeticBusy');assert.equal(await evaluate('cosmeticState.equipped.city'),"");
  for(const [width,height] of [[1440,900],[844,390],[568,320],[568,280]]){
    await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate('showProfileScreen()');
    const reference=await evaluate(`(${profileFrame.toString()})()`);
    for(const mode of ["profile","shop"]){
      await evaluate(mode==="profile"?'openMySkins()':'openSkinShop()');await wait(`!!document.querySelector('[data-skins-mode=${mode}]')`);
      await evaluate('new Promise(r=>setTimeout(r,450))');
      const metrics=await evaluate(`(()=>{const e=document.querySelector('[data-skins-mode=${mode}]'),r=e.getBoundingClientRect();return{width:r.width,left:r.left,right:r.right,scroll:e.scrollWidth,client:e.clientWidth}})()`);
      assert(metrics.left>=-1&&metrics.right<=width+1,JSON.stringify(metrics));assert(metrics.scroll<=metrics.client+2,"Skins horizontal overflow");
      if(mode==='profile'){
        assert.deepEqual(await evaluate(`(${profileFrame.toString()})()`),reference,'Skins must share the Profile frame and typography');
        for(const category of ['flag','troops','border','city']){
          await tap(`[data-skins-mode=profile] [data-skin-category="${category}"]`);
          await click('[data-skins-mode=profile] .skin-card:last-child');
          const controls=await evaluate(`(${profileControls.toString()})()`);
          assert(!controls.overflow&&controls.titleWidth>0&&controls.controls.every(e=>e.visible&&e.hit),`Profile controls hidden at ${width}x${height}: ${JSON.stringify(controls)}`);
          if(category==='flag'){
            const color=await evaluate(`(()=>{const e=document.querySelector('[data-skins-mode=profile] .skin-flag-preview');return{actual:getComputedStyle(e.querySelector('.flag-symbol')).color,expected:state.flag.symbolColor};})()`);
            assert.equal(color.actual,`rgb(${color.expected.replace('#','').match(/../g).map(n=>parseInt(n,16)).join(', ')})`,'Profile theme must preserve flag colors');
            await tap('[data-skin-editor]');assert(await evaluate('!flagEditorView.hidden'));
            await click('#skinsTabBtn');
          }
        }
        await tap('[data-skins-mode=profile] [data-skin-action]');await wait('!cosmeticBusy');
        assert.equal(await evaluate('cosmeticState.equipped.city'),'halloween_city');
        await click('[data-skins-mode=profile] [data-skin-select=default_city]');
        await tap('[data-skins-mode=profile] [data-skin-action]');await wait('!cosmeticBusy');
        assert.equal(await evaluate('cosmeticState.equipped.city'),'');
        await click('[data-skins-mode=profile] [data-skin-select=halloween_city]');
        await evaluate("document.querySelector('[data-skins-mode=profile] .skin-detail').scrollTop=0");
        await evaluate('cosmeticError="Could not load your collection. Check your connection and retry.";refreshCosmeticPanels()');
        assert(await evaluate('getComputedStyle(document.querySelector("[data-skins-mode=profile]")).overflowY==="auto" && document.querySelector("[data-skins-mode=profile] .skins-body").clientHeight>=100'),'Error messages must preserve scrollable access to the collection');
        await tap('[data-skins-mode=profile] [data-skin-reload]');await wait('!cosmeticError');
        await evaluate('cosmeticState=null;refreshCosmeticPanels()');
        assert(await evaluate('document.querySelector("[data-skins-mode=profile] [data-skin-action]").disabled && getComputedStyle(document.querySelector("[data-skins-mode=profile]")).overflowY==="auto"'),'Loading must remain readable and prevent premature equip');
        await evaluate('applyCosmeticResult({state:__skinQA.wallet});document.querySelector("[data-skins-mode=profile]").scrollTop=0');
      }else assert(await evaluate('!profileScreen.classList.contains("open") && getComputedStyle(profileScreen).pointerEvents==="none"'),'The closed profile must not cover Shop');
      const footer=await evaluate(`(()=>{const e=document.querySelector('[data-skins-mode=${mode}] [data-skin-browse]');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),panel=e.closest('.skins-panel').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{top:r.top,bottom:r.bottom,panelBottom:panel.bottom,clickable:e===hit||e.contains(hit)}})()`);
      assert(footer.top>=0&&footer.bottom<=Math.min(height,footer.panelBottom)+1&&footer.clickable,`${mode} footer inaccessible at ${width}x${height}: ${JSON.stringify(footer)}`);
      const screenshot=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`${mode}-${width}x${height}.png`),Buffer.from(screenshot.data,'base64'));
      if(mode==='profile'){
        await tap('#profileTabBtn');assert(await evaluate('activeProfileTab==="profile"'));
        assert.deepEqual(await evaluate(`(${profileFrame.toString()})()`),reference,'Returning to Profile must preserve its theme');
        await tap('#skillsTabBtn');assert(await evaluate('activeProfileTab==="skills"'));
        await tap('#settingsTabBtn');assert(await evaluate('activeProfileTab==="settings"'));
        await tap('#skinsTabBtn');await tap('#profileCloseBtn');
        await wait('!profileScreen.classList.contains("open") && getComputedStyle(profileScreen).visibility==="hidden" && getComputedStyle(profileScreen).pointerEvents==="none"');
      }
    }
  }
  await evaluate('cosmeticOffset=Date.UTC(2026,10,1)-Date.now();cosmeticState=COSMETIC_CATALOG.normalize();cosmeticSelected="halloween_city";refreshCosmeticPanels()');
  assert(await evaluate('document.querySelector("[data-skins-mode=shop] [data-skin-action]").disabled'));
  await click('[data-rs-section="provisions"]');assert(await evaluate('!!document.querySelector(".rs-shop-selection")'));
  assert.deepEqual(errors,[]);console.log("Cosmetics browser passed: purchase, bundle, uncertain receipt retry, equip/default, map appearance, sale closure and desktop/landscape layouts.");
 }finally{if(client){await client.send("Browser.close").catch(()=>{});client.close();}if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}await server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
