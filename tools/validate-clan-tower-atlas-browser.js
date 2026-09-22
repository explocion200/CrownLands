"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {CdpClient}=require('./map-benchmark/cdp-client');
const {createMapBenchmarkServer}=require('./map-benchmark/server');
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require('./validate-focused-browser-smoke');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const executable=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(file=>file&&fs.existsSync(file));
 assert(executable,'Set CHROME_PATH to Chromium.');
 const server=createMapBenchmarkServer(),address=await server.listen(),artifacts=path.resolve(__dirname,'../release-artifacts/clan-tower-atlas');
 fs.mkdirSync(artifacts,{recursive:true});let browser,client;const errors=[];
 try{
  browser=await startBrowserSession(executable);client=await CdpClient.connect(browser.targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await Promise.all(['Page.enable','Runtime.enable'].map(method=>client.send(method)));
  client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  const evaluate=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const ready=async expression=>{for(let i=0;i<240;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timed out: '+expression);};
  for(const [width,height] of [[1440,900],[844,390],[568,320]]){
   await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:height<600});
   await client.send('Page.navigate',{url:`${address.url}/__benchmark__/?scenario=A&visualMarches=0&ledgerUi=maps&towerFlags=1`});
   await ready('document.documentElement?.dataset.ledgerQa === "ready"');
   await evaluate(`(() => {
     const picker=getIslandMapPickerElement(),region=WORLD_REGIONS.find(r=>r.id===HOLDING_TOWER_DEFINITIONS[0].regionId),pos=getIslandMapPosition(region);
     const zoom=${width<600?0.7:1};getIslandMapPickerCameraController(picker).renderNow({x:picker.clientWidth/2-pos.x*zoom,y:picker.clientHeight/2-pos.y*zoom,zoom});
     window.atlasTile=()=>modalBody.querySelector('[data-island-region="'+region.id+'"]');
   })()`);
   await delay(180);
   const before=await evaluate(`(() => {
     const tile=atlasTile(),flag=tile.querySelector('.island-map-clan-flag'),r=flag.getBoundingClientRect(),p=getIslandMapPickerElement();
     const identity=getIslandMapTowerIdentity(tile.dataset.islandRegion);
     const expected=renderClanHeraldry(identity.emblem,{size:'small',variant:'full',instance:'atlas-'+tile.dataset.islandRegion,label:identity.name+' clan flag'});
     const normalized=document.createElement("span");normalized.innerHTML=expected;
     return {flags:modalBody.querySelectorAll('.island-map-clan-flag').length,neutral:modalBody.querySelectorAll('.neutral-tower-crest').length,
       ownCrest:tile.querySelectorAll('.neutral-tower-crest').length,aria:tile.getAttribute('aria-label'),full:flag.innerHTML===normalized.innerHTML,
       width:r.width,height:r.height,visible:r.top>=0&&r.bottom<=innerHeight,overflow:modal.scrollWidth>modal.clientWidth+1,
       pointer:getComputedStyle(flag).pointerEvents,zoom:p.dataset.islandMapZoom,html:flag.innerHTML};
   })()`);
   assert.equal(before.flags,3);assert.equal(before.neutral,1);assert.equal(before.ownCrest,0);
   assert(before.full&&before.visible&&!before.overflow,JSON.stringify(before));assert(before.width>=30&&before.height>=30);assert.equal(before.pointer,'none');assert.match(before.aria,/Amber Wardens/);
   const layers=await evaluate(`(() => {
     const legend=modalBody.querySelector('.island-map-feature-legend');
     const crests=Array.from(modalBody.querySelectorAll('.feature-crest'));
     return {legend:legend.getBoundingClientRect().height>0&&['Clan Tower','Camp','Stronghold / Citadel'].every(name=>legend.textContent.includes(name)),
       badgesHidden:Array.from(modalBody.querySelectorAll('.island-map-feature-badges')).every(node=>getComputedStyle(node).display==='none'),
       icons:Array.from(modalBody.querySelectorAll('.stronghold-bonus-icon')).map(node=>node.getAttribute('href')),
       crown:Boolean(modalBody.querySelector('.crest-royal .citadel-crest')),camp:Boolean(modalBody.querySelector('.crest-camp')),
       foreground:crests.length>0&&crests.every(crest=>{
         const tile=crest.closest('.island-map-icon'),z=Number(getComputedStyle(crest).zIndex);
         const borders=[...tile.querySelectorAll('.feature-frame:not(.feature-crest),.island-map-feature-trim')].map(node=>Number(getComputedStyle(node).zIndex)||0);
         borders.push(Number(getComputedStyle(tile,'::before').zIndex)||0,Number(getComputedStyle(tile,'::after').zIndex)||0);
         return z>Math.max(...borders)&&getComputedStyle(crest).pointerEvents==='none';
       })};
   })()`);
   assert(layers.legend&&layers.badgesHidden&&layers.foreground&&layers.crown&&layers.camp,JSON.stringify(layers));
   assert.equal(new Set(layers.icons).size,4,'Keep all four Stronghold specialization icons in the foreground');
   fs.writeFileSync(path.join(artifacts,`${width}x${height}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
   // Live published edits update without rebuilding the tile or resetting its camera.
   await evaluate(`window.atlasOldTile=atlasTile();window.atlasOldCamera=getIslandMapPickerElement().getAttribute('style');
     applyHoldingTowerClanSnapshot(HOLDING_TOWER_DEFINITIONS[0].id,atlasTowerQa.clans[0].id,{...atlasTowerQa.clans[0],name:'Amber & Oak <Guard>',heraldryRevision:4,shield:{...atlasTowerQa.shield,chargeLayout:'single',primary:'#385f41'}});`);
   const edited=await evaluate(`({same:atlasOldTile===atlasTile(),camera:atlasOldCamera===getIslandMapPickerElement().getAttribute('style'),html:atlasTile().querySelector('.island-map-clan-flag').innerHTML,aria:atlasTile().getAttribute('aria-label')})`);
   assert(edited.same&&edited.camera,JSON.stringify(edited));assert.notEqual(edited.html,before.html);assert.match(edited.aria,/Amber & Oak <Guard>/);
   await evaluate(`applyHoldingTowerClanSnapshot(HOLDING_TOWER_DEFINITIONS[0].id,atlasTowerQa.clans[0].id,{...atlasTowerQa.clans[0],name:"Amber & Oak <Guard>"});`);
   assert.equal(await evaluate(`atlasTile().querySelector('.island-map-clan-flag').innerHTML`),edited.html,'Stale heraldry overwrote a published edit');
   await evaluate(`applyHoldingTowerMapSnapshot(WORLD_HOLDING_TOWERS[0],{ownerKind:'clan',clanId:atlasTowerQa.clans[1].id,clanName:atlasTowerQa.clans[1].name,clanEmblem:atlasTowerQa.clans[1].shield,ownershipRevision:2});`);
   assert.match(await evaluate(`atlasTile().getAttribute('aria-label')`),/Raven Guard/);
   await evaluate(`applyHoldingTowerMapSnapshot(WORLD_HOLDING_TOWERS[0],null);`);
   assert.equal(await evaluate(`atlasTile().querySelectorAll('.island-map-clan-flag').length`),0);assert.equal(await evaluate(`atlasTile().querySelectorAll('.neutral-tower-crest').length`),1);
   await evaluate(`modalBody.querySelector('[data-atlas-fit]').click()`);await delay(160);
   assert(await evaluate(`Array.from(modalBody.querySelectorAll('.island-map-clan-flag')).every(f=>getComputedStyle(f).display!=='none'&&f.getBoundingClientRect().width>=15)`),'Whole-realm view hid owners');
   // Report outcome must not call a capped victory a capture or a held defense.
   assert.equal(await evaluate(`getBattleRuleLabel({combatRule:{id:'clan_tower_raid'}})`),'One Clan Tower per clan — attack allowed, capture disabled');
   assert.equal(await evaluate(`getViewerBattleResultLabel({combatRule:{id:'clan_tower_raid',captureAllowed:false},outcome:'victory'},'attacker')`),'Your side won \u2014 Tower ownership unchanged');
   assert.equal(await evaluate(`getViewerBattleResultLabel({combatRule:{id:'clan_tower_raid',captureAllowed:false},outcome:'victory'},'defender')`),'Opponent won \u2014 your clan keeps the Tower');
   console.log(`Clan Tower atlas ${width}x${height}: complete flags, neutral fallback, live edits/capture, camera preservation and overview passed.`);
  }
  assert.deepEqual(errors,[]);
 }finally{
  if(client){await client.send('Browser.close').catch(()=>{});client.close();}
  if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
  await server.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
