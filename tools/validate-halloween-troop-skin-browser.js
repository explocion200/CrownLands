"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup() {
  modal.close(); closeProfileScreen(); setAnimationModePreference("full");
  const uid = getCurrentOnlineUid() || "troop-skin-owner"; getCurrentOnlineUid = () => uid; cosmeticUid = uid;
  cosmeticState = COSMETIC_CATALOG.normalize({ crowns: 1000 });
  cosmeticOffset = Date.UTC(2026, 9, 15) - Date.now();
  cosmeticOwnerAppearances.set("troop-skin-rival", { troops: "halloween_troops" });
  getOnlineApi = () => ({
    getUser: () => ({ uid }), getCosmeticsState: async () => ({ state: cosmeticState }),
    equipCosmetic: async request => ({ state: COSMETIC_CATALOG.equip(cosmeticState, request.category, request.itemId) }),
    purchaseCosmetic: async request => COSMETIC_CATALOG.purchase(cosmeticState, request, Date.UTC(2026, 9, 15)),
  });
  const region = getActiveMapRegionId(), b = getActiveMapBounds(), cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
  const now = getArmyClockNowMs();
  window.__troopQA = { uid, region, cx, cy, now, clock: now, cities: state.cities };
  getArmyClockNowMs = () => __troopQA.clock;
  state.attacks = []; pendingOutgoingMissions.clear(); onlineArmiesByIsland.clear(); onlineArmies = []; resolvedOnlineArmyIds.clear();
  centerOnWorldPoint({ x: cx, y: cy }); setZoomAroundPoint(1.1, innerWidth / 2, innerHeight / 2);
  __troopQA.base = {
    id: "skin-test-march", owner: "player", ownerKind: "player", ownerUid: uid, ownerName: "Lantern Guard",
    status: "active", kind: "attack", launchKind: "attack", viewerAccess: "owner", troopVisibility: "exact", troops: 12500,
    sourceRegionId: region, targetRegionId: region, fromId: "qa-thornford", toId: "qa-wyvern", fromName: "Thornford", toName: "Wyvernhollow",
    launchedAtMs: now - 60000, arrivesAtMs: now + 60000, total: 120, remaining: 60,
    pathSegments: [{ regionId: region, points: [{ x: cx - 200, y: cy }, { x: cx + 200, y: cy }], length: 400 }],
  };
  __troopQA.render = (patch = {}) => { onlineArmies = [{ ...__troopQA.base, ...patch }]; renderArmies(true); return armyTokenCache.get(onlineArmies[0].id); };
  __troopQA.render();
}
async function checks() {
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const C = COSMETIC_CATALOG, qa = __troopQA;
  // Purchase is separate from Apply, and the already-running march updates in place.
  const original = armyTokenCache.get(qa.base.id);
  const before = [original.className, original.querySelector(".army-token-count").textContent, original.querySelector(".army-token-time").textContent];
  check(!original.querySelector(".troop-skin-sprite"), "Default has no extra sprite");
  cosmeticCategory = "troops"; cosmeticSelected = "halloween_troops"; openSkinShop();
  cosmeticConfirmation = C.quote("halloween_troops", cosmeticState, cosmeticNow());
  await submitCosmeticPurchase();
  check(cosmeticState.crowns === 700 && cosmeticState.owned.halloween_troops, "Purchase must cost 300 Crowns");
  check(!cosmeticState.equipped.troops, "Purchase must not equip");
  cosmeticSelected = "halloween_troops"; cosmeticCategory = "troops"; openMySkins();
  check(!cosmeticState.equipped.troops, "Selecting a skin must not equip");
  await equipSelectedCosmetic(); modal.close(); closeProfileScreen();
  check(await CrownlandsTroopSkins.ready() === "ready", "Production atlas must decode");
  const token = qa.render();
  check(token === original && token.querySelector(".troop-skin-sprite"), "Apply must reuse the existing troop node");
  check(JSON.stringify(before) === JSON.stringify([token.className, token.querySelector(".army-token-count").textContent, token.querySelector(".army-token-time").textContent]), "Skin must preserve mission information and relationship class");
  const layer = token.querySelector(".troop-skin-sprite"), image = layer.querySelector("img");
  await image.decode(); check(image.naturalWidth === 640 && image.naturalHeight === 1280, "Use the optimized shared atlas");
  const directions = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  for (let row = 0; row < 8; row++) {
    const [dx, dy] = directions[row], points = [{ x: qa.cx-dx*200, y: qa.cy-dy*200 }, { x: qa.cx+dx*200, y: qa.cy+dy*200 }];
    const pathSegments = [{ regionId: qa.region, points, length: routeLength(points) }];
    qa.render({ pathSegments });
    check(Number(layer.style.getPropertyValue("--troop-row")) === row, "Wrong direction " + row);
    qa.render({ pathSegments, returning: true, recalledAtMs: qa.now-60000, returnStartProgress: 1 });
    check(Number(layer.style.getPropertyValue("--troop-row")) === (row+4)%8, "Wrong return direction " + row);
  }
  // A right-angle route must turn using its current segment, including across map segments.
  const bent = [{ x:qa.cx-100,y:qa.cy }, { x:qa.cx,y:qa.cy }, { x:qa.cx,y:qa.cy+100 }];
  qa.clock = qa.now-30000;
  qa.render({ pathSegments:[{regionId:qa.region,points:bent,length:200}] });
  check(Number(layer.style.getPropertyValue("--troop-row")) === 2, "First segment east");
  qa.clock = qa.now+30000; renderVisibleArmyMotion();
  check(Number(layer.style.getPropertyValue("--troop-row")) === 4, "Turn south");
  const heading={dx:0,dy:1};
  const zeroStart=[{x:0,y:0},{x:0,y:0},{x:-100,y:0}];
  const zeroPoint=pointAlongRoute(zeroStart,0,heading);
  check(zeroPoint.x===0&&zeroPoint.y===0&&heading.dx===-100&&heading.dy===0,'Duplicate start points preserve position and west heading');
  const crossing=[{regionId:qa.region,points:[{x:0,y:0},{x:100,y:0}],length:100},{regionId:'qa-next-region',points:[{x:0,y:0},{x:0,y:-100}],length:100}];
  const crossed=getMissionPointAtProgress(qa.base,.75,crossing,heading);
  check(crossed.regionId==='qa-next-region'&&crossed.point.y===-50&&heading.dx===0&&heading.dy===-100,'Map-segment crossing must preserve position and face north');
  qa.clock = qa.now; qa.render();
  const observer = new MutationObserver(()=>{});
  observer.observe(layer,{attributes:true,childList:true,subtree:true});
  for (let n=0;n<30;n++) { qa.render(); renderVisibleArmyMotion(); }
  check(observer.takeRecords().length===0 && token.querySelector(".troop-skin-sprite")===layer, "Steady movement must not rebuild or mutate the sprite");
  observer.disconnect();
  qa.render({ kind:"scout", launchKind:"scout",troops:1 });
  check(!token.querySelector(".troop-skin-sprite") && token.querySelector(".army-token-icon svg"), "Scouts retain their distinct icon");
  qa.render({ owner:"enemy",ownerUid:"troop-skin-rival",viewerAccess:"observer",kind:"transfer",launchKind:"transfer",troopVisibility:"hidden" });
  check(token.querySelector(".troop-skin-sprite") && token.querySelector(".army-token-count").hidden, "Remote skin must preserve hidden counts");
  qa.render({ owner:"enemy",ownerUid:"troop-skin-rival",viewerAccess:"observer",troopVisibility:"estimate",troops:null,troopEstimateLabel:"100–499",troopEstimateMin:100,troopEstimateMax:499 });
  check(token.querySelector(".army-token-count").textContent==="100–499","Estimated count must remain an estimate");
  qa.render({ owner:"enemy",ownerUid:"troop-skin-rival",rallyAttack:true });
  check(token.querySelector(".troop-skin-sprite"), "Rally uses leader appearance");
  cosmeticOwnerAppearances.set("troop-skin-rival",{troops:""}); qa.render({owner:"enemy",ownerUid:"troop-skin-rival"});
  check(!token.querySelector(".troop-skin-sprite"),"Remote Default removes skin");
  qa.render();
  cosmeticSelected="halloween_troops"; openMySkins();
  document.querySelector('[data-skin-select="default_troops"]').click(); await equipSelectedCosmetic();
  check(!cosmeticState.equipped.troops && !token.querySelector(".troop-skin-sprite"),"Default Apply restores original marker");
  cosmeticSelected="halloween_troops"; await equipSelectedCosmetic(); closeProfileScreen(); modal.close(); qa.render();
  return { directions:8,returns:8,purchaseApplyDefault:true,privacy:true,scout:true,rally:true,stableNodes:true };
}
function crowded(skin) {
  const qa=__troopQA;
  const started=performance.now(); getArmyClockNowMs=()=>qa.now+performance.now()-started;
  cosmeticState=COSMETIC_CATALOG.equip(cosmeticState,"troops",skin?"halloween_troops":"");
  const spacing=innerWidth<1000?42:68;
  state.cities=[...qa.cities];
  onlineArmies=Array.from({length:120},(_,n)=>{
    const x=qa.cx+((n%10)-4.5)*spacing+(n>=80?10000:0),y=qa.cy+(Math.floor(n/10)%8-3.5)*28;
    const fromId='skin-source-'+n,toId='skin-target-'+n;
    state.cities.push({...qa.cities[0],id:fromId,x:x-120,y},{...qa.cities[1],id:toId,x:x+120,y});
    return {...qa.base,id:"skin-load-"+n,fromId,toId,pathSegments:[{regionId:qa.region,points:[{x:x-120,y},{x:x+120,y}],length:240}]};
  });
  renderArmies(true);
  return {requested:120,rendered:armyTokenCache.size};
}
async function main() {
  const server=createMapBenchmarkServer(),address=await server.listen(),root=path.resolve(__dirname,".."),out=path.join(root,"release-artifacts/halloween-troop-skin");
  fs.mkdirSync(out,{recursive:true}); let session,client; const errors=[],results=[],requests=[];
  try {
    const browser=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));
    session=await startBrowserSession(browser);client=await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
    await Promise.all(["Runtime.enable","Page.enable","Network.enable","Performance.enable"].map(m=>client.send(m)));
    client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
    client.on("Network.requestWillBeSent",e=>{if(e.request.url.includes("halloween-troops-640"))requests.push(e.request.url)});
    const evaluate=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
    const metrics=async()=>Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map(m=>[m.name,m.value]));
    for(const [width,height] of [[1440,900],[844,390]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});
      for(let n=0;n<400&&!await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");n++)await delay(100);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"),"ready");
      await evaluate("("+setup.toString()+")()");await delay(700);
      const behavior=await evaluate("("+checks.toString()+")()");await delay(350);
      assert(await evaluate("document.querySelector('.troop-skin-sprite').getBoundingClientRect().width>40"),"Map art must be readable");
      let screenshot=await client.send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(out,"map-"+width+".png"),Buffer.from(screenshot.data,"base64"));
      await evaluate("cosmeticCategory='troops';cosmeticSelected='halloween_troops';openMySkins()");await delay(300);
      assert(await evaluate("document.querySelector('.skin-detail .troop-skin-sprite')?.getAnimations({subtree:true}).some(a=>a.playState==='running')"),"Selected preview must animate");
      assert.equal(await evaluate("armyLayer.getAnimations({subtree:true}).filter(a=>a.animationName==='halloweenTroopWalk'&&a.playState==='running').length"),0,"Covered map must stop");
      screenshot=await client.send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(out,"profile-"+width+".png"),Buffer.from(screenshot.data,"base64"));
      await evaluate("closeProfileScreen();modal.close()");
      const samples=[];
      for(const scope of ['complete-map','march-renderer']) {
      // Measure the actual march renderer independently of the benchmark's world simulation.
      // The complete-map samples above remain in the report, including their baseline slowdown.
      if(scope==='march-renderer') { await evaluate("frame=()=>{}"); await delay(200); }
      for(const skin of [false,true]) {
        const population=await evaluate("("+crowded.toString()+")("+skin+")");await delay(350);
        // Exercise full decorative load as well as the real crowded-map freeze.
        await evaluate("mapFrame.classList.remove('crowded-map','low-zoom')");
        await client.send("Emulation.setCPUThrottlingRate",{rate:4});
        const before=await metrics();
        const frames=await evaluate("new Promise(resolve=>{const intervals=[];let last=performance.now(),start=last,refresh=last;const tick=now=>{intervals.push(now-last);last=now;"+(scope==='march-renderer'?"if(now-refresh>=140){renderArmies(true);refresh=now}renderVisibleArmyMotion();":"")+"if(now-start<3000)requestAnimationFrame(tick);else resolve(intervals.slice(1).sort((a,b)=>a-b))};requestAnimationFrame(tick)})");
        const after=await metrics();
        const active=await evaluate("armyLayer.getAnimations({subtree:true}).filter(a=>a.animationName==='halloweenTroopWalk'&&a.playState==='running').length");
        samples.push({scope,skin,...population,active,frameP95Ms:frames[Math.floor(frames.length*.95)],taskMs:(after.TaskDuration-before.TaskDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000});
        assert(active<=(width<=1000?6:8),"Animation count must be bounded");if(skin&&scope==='march-renderer')assert(active>0,"Stress case must exercise animation: "+JSON.stringify(samples));
        assert(await evaluate("armyTokenCache.size<120"),"Offscreen armies must remain culled");
        await client.send("Emulation.setCPUThrottlingRate",{rate:1});
      }
      }
      const running="armyLayer.getAnimations({subtree:true}).filter(a=>a.animationName==='halloweenTroopWalk'&&a.playState==='running').length";
      for(const state of ["camera-moving","zooming","low-zoom","crowded-map"]) {
        await evaluate("mapFrame.classList.add('"+state+"')");await delay(50);assert.equal(await evaluate(running),0,state+" must pause walking");
        await evaluate("mapFrame.classList.remove('"+state+"')");
      }
      for(const mode of ["off","reduced"]) {await evaluate("setAnimationModePreference('"+mode+"')");await delay(50);assert.equal(await evaluate(running),0);}
      await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await evaluate("setAnimationModePreference('auto')");await delay(100);assert.equal(await evaluate(running),0,'System reduced motion must pause walking');
      await client.send('Emulation.setEmulatedMedia',{features:[]});
      await evaluate("setAnimationModePreference('full');Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
      assert.equal(await evaluate(running),0,"Background motion must stop");
      await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));onlineArmies=[];renderArmies(true)");
      await delay(150);assert.equal(await evaluate("armyLayer.querySelectorAll('.troop-skin-sprite').length"),0,"Departed armies must release their nodes");
      results.push({width,height,cpuThrottle:4,behavior,samples});console.log(JSON.stringify(results.at(-1)));
    }
    assert.deepEqual(errors,[]);
    assert(requests.length<=2,"Atlas should load once per document, not once per army");
    const atlasRequests=requests.length;
    await client.send('Network.setCacheDisabled',{cacheDisabled:true});
    await client.send('Network.setBlockedURLs',{urls:['*halloween-troops-640*']});
    await client.send('Page.navigate',{url:address.url+'/__benchmark__/?scenario=A&visualMarches=0'});
    for(let n=0;n<400&&!await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");n++)await delay(100);
    await evaluate('('+setup.toString()+')()');await delay(700);
    const fallback=await evaluate("(async()=>{cosmeticState=COSMETIC_CATALOG.normalize({owned:{halloween_troops:true},equipped:{troops:'halloween_troops'}});const t=__troopQA.render();await CrownlandsTroopSkins.ready();return document.documentElement.dataset.troopArt==='failed'&&getComputedStyle(t.querySelector('.troop-skin-sprite')).display==='none'&&t.querySelector('.army-token-count').textContent==='12K'&&!!cosmeticState.owned.halloween_troops&&cosmeticState.equipped.troops==='halloween_troops'})()");
    assert(fallback,'Missing art must preserve the standard badge and ownership');
    assert.deepEqual(errors,[]);
    // Also isolate decorative rendering from the deliberately overloaded full-map fixture.
    await client.send('Network.setBlockedURLs',{urls:[]});
    await client.send('Network.setCacheDisabled',{cacheDisabled:false});
    const decoration=[];
    const styles=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]).filter(href=>!href.startsWith('http'));
    const html=`<!doctype html><html><head><base href="${address.url}/">${styles.map(href=>`<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="profileScreen"></div><dialog id="modal"></dialog><div id="skinsView"></div><div id="cityLayer"></div><div id="armyLayer" class="map-frame" style="position:fixed;inset:0;width:100vw;height:100vh;background:#a7a45b;overflow:hidden"></div>${['functions/cosmetics.js','troop-skins.js','skins-ui.js'].map(file=>`<script>${fs.readFileSync(path.join(root,file),'utf8')}</script>`).join('')}</body></html>`;
    for(const [width,height] of [[1440,900],[844,390]]) {
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await client.send('Page.navigate',{url:address.url+'/__troop_motion_fixture__'});await delay(200);
      const {frameTree}=await client.send('Page.getFrameTree');
      await client.send('Page.setDocumentContent',{frameId:frameTree.frame.id,html});
      for(let n=0;n<100&&!await evaluate("typeof createCosmeticMotion==='function'");n++)await delay(100);
      await evaluate("document.documentElement.dataset.animationMode='full';window.motion=createCosmeticMotion();window.tokens=Array.from({length:120},(_,n)=>{const t=document.createElement('span');t.className='army-token player';t.textContent='⚔ 12K 1M';t.style.left=((n%10+.5)*innerWidth/10+(n>=80?innerWidth*2:0))+'px';t.style.top=((Math.floor(n/10)%8+.8)*innerHeight/8)+'px';armyLayer.append(t);return t})");
      for(const rate of [1,4]) for(const skin of [false,true]) {
        await evaluate("tokens.forEach(t=>CrownlandsTroopSkins.apply(t,"+(skin?"'halloween_troops'":"''")+",motion));"+(skin?"CrownlandsTroopSkins.ready()":"void 0"));
        await delay(400);await client.send('Emulation.setCPUThrottlingRate',{rate});
        const before=await metrics();
        const times=await evaluate("new Promise(resolve=>{let start=performance.now(),last=start;const times=[];function tick(now){times.push(now-last);last=now;tokens.forEach(t=>{t.style.transform='translateX('+Math.sin((now-start)/800)*12+'px)';CrownlandsTroopSkins.face(t,1,0)});if(now-start<3000)requestAnimationFrame(tick);else resolve(times.slice(1).sort((a,b)=>a-b))}requestAnimationFrame(tick)})");
        const after=await metrics(),active=await evaluate("armyLayer.getAnimations({subtree:true}).filter(a=>a.playState==='running').length");
        assert(active<=(width<=1000?6:8));if(skin)assert(active>0);
        assert.equal(await evaluate("tokens.slice(80).flatMap(t=>t.getAnimations({subtree:true})).filter(a=>a.playState==='running').length"),0);
        decoration.push({width,height,skin,cpuThrottle:rate,visible:80,offscreen:40,active,frameP95Ms:times[Math.floor(times.length*.95)],taskMs:(after.TaskDuration-before.TaskDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000});
        await client.send('Emulation.setCPUThrottlingRate',{rate:1});
      }
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({decoration}));
    fs.writeFileSync(path.join(out,"validation.json"),JSON.stringify({results,decoration,atlasRequests,fallback,errors},null,2)+"\n");
    console.log("Halloween troop integration passed.");
  }finally{
    if(client){await client.send("Browser.close").catch(()=>{});client.close()}
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath)}
    await server.close();
  }
}
module.exports = { setup, crowded };
if (require.main === module) main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1});
