"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const orders = ["templar", "hospitaller", "teutonic", "santiago"];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function gameChecks() {
  const assert = (value, message) => { if (!value) throw Error(message); };
  const ids = ["templar_city", "hospitaller_city", "teutonic_city", "santiago_city"];
  const C = COSMETIC_CATALOG, uid = "knight-qa";
  cosmeticUid = uid; cosmeticState = C.normalize({ crowns: 2400 });
  assert(cosmeticChoices('shop').length === 1, 'Old backend must not expose unsupported offers');
  applyCosmeticResult({ state: cosmeticState, availableOfferIds: C.OFFERS.map(item => item.id) });
  cosmeticOffset = Date.UTC(2026, 10, 15) - Date.now();
  getCurrentOnlineUid = () => uid; saveGame = () => {};
  const qa = window.knightQA = { purchases: 0, equips: 0 };
  getOnlineApi = () => ({ getUser: () => ({ uid }), getCosmeticsState: async () => ({ state: cosmeticState, serverNowMs: Date.UTC(2026,10,15), availableOfferIds: C.OFFERS.map(item => item.id) }), purchaseCosmetic: async request => {
    qa.purchases++; return C.purchase(cosmeticState, request, Date.UTC(2026, 10, 15));
  }, equipCosmetic: async request => { qa.equips++; return { state: C.equip(cosmeticState, request.category, request.itemId) }; } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  const city = state.cities.find(city => city.owner === "player" && !isStronghold(city));
  city.ownerUid = uid;
  for (const id of ids) {
    cosmeticSelected = id; openSkinShop(); await settle();
    assert(document.querySelector(`[data-skins-mode=shop] [data-skin-select="${id}"]`).textContent.includes("600 Crowns"), "Shop price");
    const oldSkin = cosmeticState.equipped.city, balance = cosmeticState.crowns;
    document.querySelector('[data-skins-mode=shop] [data-skin-action]').click();
    assert(document.querySelector('.skin-confirm').textContent.includes(String(balance - 600)), "Balance confirmation");
    document.querySelector('[data-skin-confirm]').click(); await settle();
    assert(cosmeticState.crowns === balance - 600 && cosmeticState.owned[id], "Server result unlocks for 600");
    assert(cosmeticState.equipped.city === oldSkin, "Purchase must not auto-equip");
    openMySkins(); cosmeticSelected = id; refreshCosmeticPanels(); await settle();
    for (let stage = 1; stage <= 5; stage++) {
      document.querySelector(`[data-skins-mode=profile] [data-skin-stage="${stage}"]`).click();
      const art = document.querySelector('.skin-detail [data-skin-preview-art]'); await art.decode();
      assert(art.getAttribute('src') === C.item(id).assets[stage], "Preview stage mapping");
      assert(Number(document.querySelector('.skin-detail .knight-city-effects').dataset.knightStage) === stage, "Stage-specific outskirts");
    }
    assert(!document.querySelector('.skins-grid .knight-city-effects'), "Grid thumbnails are static");
    document.querySelector('[data-skins-mode=profile] [data-skin-action]').click(); await settle();
    assert(cosmeticState.equipped.city === id, "Apply must equip selected order");
    const host = document.createElement('div'); document.body.append(host);
    const node = document.createElement('button'); node.className = 'city-node player';
    node.innerHTML = '<span class="city-castle stage-5"><img class="city-art"></span>'; host.append(node);
    for (const [level, stage] of [[1,1],[24,1],[25,2],[49,2],[50,3],[74,3],[75,4],[99,4],[100,5],[150,5]]) {
      const version = { ...city, level }; applyCosmeticCityNode(node, version);
      const art = node.querySelector('.city-art'); await art.decode();
      assert(art.getAttribute('src') === C.item(id).assets[stage], "Map boundary mapping");
      const layer = node.querySelector('.knight-city-effects'); applyCosmeticCityNode(node, version);
      assert(node.querySelector('.knight-city-effects') === layer, "Unchanged map render retains the canvas");
      assert(getComputedStyle(layer).pointerEvents === 'none', "Outskirts cannot intercept map input");
    }
    cosmeticOwnerAppearances.set('knight-remote', { city: id });
    applyCosmeticCityNode(node, { ...city, owner: 'enemy', ownerUid: 'knight-remote', level: 100 });
    assert(node.dataset.citySkin === id, "Remote owner skin");
    applyCosmeticCityNode(node, { ...city, owner: 'enemy', ownerUid: 'new-captor' });
    assert(!node.querySelector('.knight-city-effects'), "Capture removes previous owner effects");
    applyCosmeticCityNode(node, city); const image = node.querySelector('.city-art'); image.onerror();
    applyCosmeticCityNode(node, city); await image.decode();
    assert(image.getAttribute('src') === getCastleAsset(getCastleStage(city.level)) && !node.querySelector('.knight-city-effects'), "Missing art falls back without retry loop");
    assert(cosmeticState.owned[id] && cosmeticState.equipped.city === id, "Fallback retains ownership");
    cosmeticFailedCityArt.clear(); host.remove();
    const stronghold = document.createElement('div'); stronghold.innerHTML = '<img class="stronghold-art" src="unchanged.webp">';
    applyCosmeticCityNode(stronghold, { ...city, kind: 'stronghold' });
    assert(!stronghold.dataset.citySkin && !stronghold.querySelector('.knight-city-effects'), "Strongholds remain unchanged");
  }
  assert(qa.purchases === 4 && qa.equips === 4 && cosmeticState.crowns === 0, "Four independent purchases and Apply actions");
  modal.close(); closeProfileScreen();
  // Exercise mixed remote owners through the actual map renderer.
  const visible = new Set([...cityLayer.querySelectorAll('.city-node')].map(node => node.dataset.cityId));
  const cities = state.cities.filter(city => !isStronghold(city) && visible.has(city.id));
  assert(cities.length >= 10, 'Map fixture supplies ten visible regular cities');
  cities.slice(0,10).forEach((city, index) => {
    const ownerUid = 'knight-map-' + index;
    Object.assign(city, { owner: 'enemy', ownerUid, level: [1,25,50,75,100][index % 5] });
    cosmeticOwnerAppearances.set(ownerUid, { city: ids[index % 4] });
  });
  renderCities(true);
  for (const city of cities.slice(0,10)) {
    const node = cityLayer.querySelector(`[data-city-id="${city.id}"]`), id = cosmeticOwnerAppearances.get(city.ownerUid).city;
    assert(node?.querySelector('.city-art').getAttribute('src') === C.item(id).assets[getCastleStage(city.level)], 'Real map owner/stage mapping');
  }
  cosmeticSelected = 'templar_city'; openMySkins(); await settle();
  await Promise.all([...document.querySelectorAll('.skins-panel img')].map(image => image.decode()));
  await new Promise(resolve => setTimeout(resolve, 600));
  assert(document.querySelector('.skin-detail .knight-city-effects[data-skin-motion=active]'), 'Selected preview is animated');
  assert(!cityLayer.querySelector('.knight-city-effects[data-skin-motion=active]'), 'Profile pauses the map');
  assert(!cosmeticError, 'No handled transport error in the game fixture: ' + cosmeticError);
  return { purchases: qa.purchases, equips: qa.equips, stages: 20, mapCities: 10 };
}

function performanceFixture(url, root) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  return `<!doctype html><html><head><base href="${url}/"><style>${read('skins-ui.css')}
  body{margin:0}.city-node{position:absolute;width:60px;height:60px;border:0;background:none;padding:0}.city-castle{position:relative;display:block;width:100%;height:100%}.city-art{width:100%;height:100%}
  </style></head><body><div id="profileScreen"></div><dialog id="modal"></dialog><div id="skinsView"></div><div id="mapFrame" class="map-frame" style="position:fixed;inset:0;background:#afa579;overflow:hidden"><div id="cityLayer"></div></div>
  <script>${read('functions/cosmetics.js')}</script><script>${read('knight-city-effects.js')}</script><script>
  const durations=[]; let paintCalls=0; const effects=CrownlandsKnightCityEffects;
  globalThis.CrownlandsKnightCityEffects={...effects,paint(...args){const start=performance.now();effects.paint(...args);durations.push(performance.now()-start);paintCalls++;}};
  function getCastleStage(level){return Math.min(5,Math.floor(level/25)+1)} function getCastleAsset(){return CrownlandsCosmetics.item('halloween_city').assets[5]}
  function isStronghold(){return false} function getOnlineApi(){return null}
  </script><script>${read('skins-ui.js')}</script></body></html>`;
}

async function main() {
  const root = path.resolve(__dirname, '..'), output = path.join(root, 'release-artifacts/knight-order-city-skins'); fs.mkdirSync(output, { recursive:true });
  const server = createMapBenchmarkServer(), address = await server.listen(); let session, client;
  const errors = [], results = [];
  try {
    const browser = [process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(file => file && fs.existsSync(file));
    session = await startBrowserSession(browser); client = await CdpClient.connect(session.targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await Promise.all([client.send('Runtime.enable'),client.send('Page.enable'),client.send('Performance.enable')]);
    client.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const ev = async expression => { const result = await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    const wait = async expression => { for(let i=0;i<200;i++){if(await ev(expression))return;await delay(100);}throw Error('Timeout: '+expression); };
    for(const [width,height] of [[1440,900],[844,390]]) {
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await client.send('Page.navigate',{url:address.url+'/__benchmark__/?scenario=A&visualMarches=0'});
      await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
      const game = await ev(`(${gameChecks.toString()})()`);
      fs.writeFileSync(path.join(output,`game-profile-${width}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await ev("cosmeticState=COSMETIC_CATALOG.normalize({crowns:2400});openSkinShop(); cosmeticSelected='santiago_city';refreshCosmeticPanels()"); await delay(500);
      fs.writeFileSync(path.join(output,`game-shop-${width}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await client.send('Page.navigate',{url:address.url+'/__knight_motion__'}); await delay(100);
      const {frameTree}=await client.send('Page.getFrameTree');
      await client.send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:performanceFixture(address.url,root)});
      await wait("typeof applyCosmeticCityNode==='function'");
      await ev(`(async()=>{document.documentElement.dataset.animationMode='off';cosmeticUid='motion-qa';
        const ids=${JSON.stringify(orders.map(order=>order+'_city'))};
        for(let n=0;n<60;n++){const node=document.createElement('button');node.className='city-node';node.style.left=((n%10+.25)*innerWidth/10+(n>=40?innerWidth*2:0))+'px';node.style.top=((Math.floor(n/10)%4+.1)*innerHeight/4)+'px';node.innerHTML='<span class="city-castle"><img class="city-art"></span>';cityLayer.append(node);cosmeticState=COSMETIC_CATALOG.normalize({owned:{[ids[n%4]]:true},equipped:{city:ids[n%4]}});applyCosmeticCityNode(node,{id:'motion-'+n,level:[1,25,50,75,100][n%5],owner:'player',ownerUid:cosmeticUid});}
        await Promise.all([...cityLayer.querySelectorAll('img')].map(image=>image.decode()));})()`);
      await client.send('Emulation.setCPUThrottlingRate',{rate:4});
      const samples = [];
      for(const mode of ['off','full']) {
        await ev(`document.documentElement.dataset.animationMode='${mode}'`); await delay(400);
        await ev('durations.length=0;paintCalls=0');
        const before=(await client.send('Performance.getMetrics')).metrics.find(metric=>metric.name==='TaskDuration').value;
        const frames=await ev(`new Promise(resolve=>{const times=[];let start=performance.now(),last=start;function frame(now){times.push(now-last);last=now;if(now-start<2500)requestAnimationFrame(frame);else resolve(times.slice(1).sort((a,b)=>a-b));}requestAnimationFrame(frame)})`);
        const after=(await client.send('Performance.getMetrics')).metrics.find(metric=>metric.name==='TaskDuration').value;
        const stats=await ev(`({paintCalls,paintMeanMs:durations.reduce((a,b)=>a+b,0)/Math.max(1,durations.length),active:cityLayer.querySelectorAll('[data-skin-motion=active]').length,canvasBytes:[...cityLayer.querySelectorAll('canvas')].reduce((sum,c)=>sum+c.width*c.height*4,0)})`);
        samples.push({mode,frameP95Ms:frames[Math.floor(frames.length*.95)],taskMs:(after-before)*1000,...stats});
        if(mode==='full') {
          assert(stats.active>0 && stats.active<=(width<=1000?3:4),'Shared map animation slot limit');
          assert(stats.paintCalls>20 && stats.paintCalls<=stats.active*21*2.8,'Painting is capped at 20fps');
          assert(stats.canvasBytes<=(width<=1000?3:4)*256*256*4+240,'Idle canvas memory released');
          assert(stats.paintMeanMs<5,'Single-city painter averages under 5ms at 4x CPU throttle');
          assert(samples[1].frameP95Ms<=Math.max(33.4,samples[0].frameP95Ms+8.4),'Animation must stay within the frame regression budget');
        } else assert.equal(stats.paintCalls,0);
      }
      await client.send('Emulation.setCPUThrottlingRate',{rate:1});
      assert.equal(await ev("[...cityLayer.children].slice(40).filter(n=>n.querySelector('[data-skin-motion=active]')).length"),0,'Offscreen cities idle');
      const stopped=async(label)=>{await delay(150);const calls=await ev('paintCalls');await delay(200);assert.equal(await ev('paintCalls'),calls,label);};
      for(const className of ['camera-moving','zooming','low-zoom','crowded-map']) {
        await ev(`mapFrame.classList.add('${className}')`);await stopped(className);await ev(`mapFrame.classList.remove('${className}')`);
      }
      for(const mode of ['reduced','off']) {await ev(`document.documentElement.dataset.animationMode='${mode}'`);await stopped(mode);}
      await ev("document.documentElement.dataset.animationMode='full';profileScreen.classList.add('open')");await stopped('Covered by Profile');
      await ev("profileScreen.classList.remove('open');modal.showModal()");await stopped('Covered by modal');
      await ev("modal.close();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");await stopped('Hidden page');
      await ev("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");await delay(150);
      const calls=await ev('paintCalls');await delay(200);assert(await ev('paintCalls')>calls,'Motion resumes');
      await ev("[...cityLayer.children].forEach((node,n)=>node.style.left=(n<40?-innerWidth*2:(n%10+.25)*innerWidth/10)+'px')");await delay(350);
      assert.equal(await ev("[...cityLayer.children].slice(0,40).filter(n=>n.querySelector('[data-skin-motion=active]')).length"),0,'Panned-away cities release slots');
      assert(await ev("[...cityLayer.children].slice(40).some(n=>n.querySelector('[data-skin-motion=active]'))"),'Newly visible cities animate');
      await ev("cosmeticState=COSMETIC_CATALOG.normalize();[...cityLayer.children].forEach((node,n)=>applyCosmeticCityNode(node,{id:'motion-'+n,level:100,owner:'player',ownerUid:cosmeticUid}))");await stopped('Removing the last equipped skin stops the loop');
      assert.equal(await ev("cityLayer.querySelectorAll('.knight-city-effects').length"),0);
      await ev('cityLayer.replaceChildren()'); await stopped('Detached layers release painter');
      const row={width,height,cpuThrottle:4,cities:60,visible:40,offscreen:20,game,samples};results.push(row);console.log(JSON.stringify(row));
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'runtime-performance.json'),JSON.stringify({results,errors},null,2)+'\n');
    console.log('Knight city integration and motion budgets passed.');
  } finally {
    if(client){await client.send('Browser.close').catch(()=>{});client.close();}
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
