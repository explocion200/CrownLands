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
function crowded(skin) {
  const qa=__troopQA;
  const started=performance.now(); getArmyClockNowMs=()=>qa.now+performance.now()-started;
  // Keep a stale legacy choice in the fixture to verify the default renderer ignores it.
  cosmeticState={...cosmeticState,equipped:{...cosmeticState.equipped,troops:skin?"halloween_troops":""}};
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
// This suite now protects removal of the previously shipped troop skin.
async function main() {
 const server=createMapBenchmarkServer(),address=await server.listen();let session,client;const errors=[],requests=[];
 const out=path.resolve(__dirname,'../release-artifacts/city-only-skins');fs.mkdirSync(out,{recursive:true});
 try {
  const browser=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
  session=await startBrowserSession(browser);client=await CdpClient.connect(session.targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await Promise.all(['Runtime.enable','Page.enable','Network.enable'].map(m=>client.send(m)));
  client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  client.on('Network.requestWillBeSent',e=>{if(/halloween-(troops|flag-frame)-|(?:troop|city-flag)-skins\.(js|css)/.test(e.request.url))requests.push(e.request.url)});
  const evaluate=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  for(const [width,height] of [[1440,900],[844,390]]) {
   await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   await client.send('Page.navigate',{url:address.url+'/__benchmark__/?scenario=A&visualMarches=0'});
   for(let i=0;i<400&&!await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");i++)await delay(100);
   assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"),'ready');
   await evaluate('('+setup.toString()+')()');
   for(let i=0;i<100&&!await evaluate('!!__troopQA.render()');i++)await delay(50);
   assert(await evaluate('!!__troopQA.render()'),'The test march must appear after the camera settles');
   const result=await evaluate(`(()=>{
    const qa=__troopQA, before=qa.render();
    const info=()=>[before.className,before.querySelector('.army-token-count').textContent,before.querySelector('.army-token-time').textContent];
    const initial=info();
    cosmeticState={...cosmeticState,owned:{halloween_city:true,halloween_troops:true,halloween_border:true},equipped:{city:'halloween_city',troops:'halloween_troops',border:'halloween_border'}};
    const token=qa.render(), after=info();
    qa.render({owner:'enemy',ownerUid:'troop-skin-rival',viewerAccess:'observer',kind:'transfer',launchKind:'transfer',troopVisibility:'hidden'});
    const hidden=token.querySelector('.army-token-count').hidden;
    qa.render({owner:'enemy',ownerUid:'troop-skin-rival',viewerAccess:'observer',troopVisibility:'estimate',troops:null,troopEstimateLabel:'100–499',troopEstimateMin:100,troopEstimateMax:499});
    const estimate=token.querySelector('.army-token-count').textContent;
    qa.render({owner:'enemy',ownerUid:'troop-skin-rival',rallyAttack:true});
    const rally=!token.querySelector('.troop-skin-sprite');
    qa.render({kind:'scout',launchKind:'scout',troops:1});
    const scout=!!token.querySelector('.army-token-icon svg');qa.render();
    return {initial,after,same:before===token,hidden,estimate,rally,scout,noSprite:!token.querySelector('.troop-skin-sprite'),noRenderer:typeof CrownlandsTroopSkins==='undefined'&&typeof CrownlandsCityFlagSkins==='undefined'};
   })()`);
   assert.deepEqual(result.initial,result.after);assert(result.same&&result.hidden&&result.rally&&result.scout&&result.noSprite&&result.noRenderer);assert.equal(result.estimate,'100–499');
   await evaluate("cosmeticCategory='troops';cosmeticSelected='halloween_troops';openSkinShop()");
   for(let i=0;i<100&&!await evaluate("!!document.querySelector('[data-skins-mode=shop] [data-skin-select]')");i++)await delay(50);
   assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-skins-mode=shop] [data-skin-select]')].map(n=>n.dataset.skinSelect)"),['halloween_city']);
   await evaluate("cosmeticCategory='border';cosmeticSelected='halloween_border';openMySkins()");
   assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-skins-mode=profile] [data-skin-select]')].map(n=>n.dataset.skinSelect)"),['default_city','halloween_city']);
   const shot=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'profile-'+width+'.png'),Buffer.from(shot.data,'base64'));
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'Retired skin assets must never be requested');
  console.log('City-only retirement passed: stale own/remote/rally choices, scout/count privacy, unchanged troop info, city-only Shop/Profile and no retired network requests.');
 }finally{if(client){await client.send('Browser.close').catch(()=>{});client.close()}if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath)}await server.close()}
}
module.exports={setup,crowded};
if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1});
