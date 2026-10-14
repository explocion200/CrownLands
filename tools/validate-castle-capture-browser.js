"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { CdpClient } = require("./map-benchmark/cdp-client");
if (process.env.CROWNLANDS_CAPTURE_BUILT) {
  // Test data and mocked authority come from source; all served client files
  // come from dist. Server-only source is intentionally absent from dist.
  require("./map-benchmark/fixtures");
  process.env.CROWNLANDS_BENCHMARK_ROOT = process.env.CROWNLANDS_CAPTURE_BUILT;
}
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function validateAttacks(evaluate, client, width, height, output) {
  // Exercise the actual target registries and renderers with a nearby sample of
  // each target family, including NPCs already marked defeated by the server.
  const kinds = await evaluate(`(() => {
    const city = captureFixture, regionId = getActiveMapRegionId();
    const camp = WORLD_CAMPS.find(c => getCampTargetById(c.id));
    if (!camp) throw Error('Camp fixture missing');
    Object.assign(camp, { regionId, x: city.x + 75, y: city.y });
    const tower = { id:'attack-test-tower', name:'Attack test tower', kind:'holdingTower', targetType:'tower',
      regionId, x:city.x-75,y:city.y,visualX:city.x-75,visualY:city.y,width:100,anchorX:.5,anchorY:.969,artSrc:CLAN_TOWER_MAP_ART };
    WORLD_HOLDING_TOWERS.push(tower);
    const npc = {id:'attack-test-npc',spawnId:'attack-test-spawn',worldId:ONLINE_WORLD_ID,resetGeneration:RESET_GENERATION,
      regionId,x:city.x,y:city.y+70,name:'Marauder',targetType:'marauder',classification:'solo',status:'defeated',level:25,respawnAtMs:Date.now()+600000};
    const boss = {...npc,id:'attack-test-boss',spawnId:'attack-test-boss-spawn',classification:'boss',x:city.x+70,status:'active'};
    applyOnlineMarauders([npc,boss],regionId);
    renderCities(true);
    window.attackFixtures = [city,getCampTargetById(camp.id),tower,npc,boss];
    window.readAttackTest = time => {
      const effect=document.querySelector('.crownlands-vfx--city-attack');
      if(!effect) throw Error('Attack missing: '+JSON.stringify({debug:CrownlandsAnimations.getDebugState(),region:getActiveMapRegionId(),seen:[...seenWorldAnimationEventIds.keys()],targets:attackFixtures.map(t=>({id:t.id,region:getCityRegionId(t),resolved:!!getCombatAnimationTarget(t.id,t.spawnId),node:!!cityLayer.querySelector('[data-city-id="'+t.id+'"], [data-render-camp-id="'+t.id+'"], [data-holding-tower-id="'+t.id+'"], [data-marauder-id="'+t.id+'"]')}))}));
      effect.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=time;});
      const target=attackFixtures.find(t=>t.id===effect.dataset.targetId);
      const node=cityLayer.querySelector('[data-city-id="'+target.id+'"], [data-render-camp-id="'+target.id+'"], [data-holding-tower-id="'+target.id+'"], [data-marauder-id="'+target.id+'"]');
      const art=node.querySelector('.city-castle,.stronghold-building,.camp-art,.holding-tower-art') || node.querySelector('.marauder-node > img');
      const a=art.getBoundingClientRect(),b=effect.getBoundingClientRect();
      const swords=[...effect.querySelectorAll('[class*="__part--capture-sword-"]')];
      return {swords:swords.length,opacity:swords.map(s=>Number(getComputedStyle(s).opacity)),
        names:swords.map(s=>getComputedStyle(s).animationName),transforms:swords.map(s=>getComputedStyle(s).transform),
        flag:!!effect.querySelector('.capture-owner-cloth,.crownlands-vfx__part--capture-drape,.crownlands-vfx__part--capture-pulse'),
        particles:effect.querySelectorAll('.crownlands-vfx__particle').length,duration:effect.style.getPropertyValue('--vfx-duration'),
        sizeDelta:Math.abs(a.width-b.width),centerDelta:Math.abs(a.x+a.width/2-b.x-b.width/2)+Math.abs(a.y+a.height/2-b.y-b.height/2),
        count:document.querySelectorAll('.crownlands-vfx--city-attack').length};
    };
    return attackFixtures.map(t=>t.targetType||'city');
  })()`);
  await delay(250);
  for (let index = 0; index < kinds.length; index++) {
    await evaluate(`(() => {
      CrownlandsAnimations.clearAll(); CrownlandsAnimations.setMode('full');
      const target=attackFixtures[${index}],id='attack-full-${index}';
      playCityAttackAnimation(target,{eventId:id,targetSpawnId:target.spawnId});
      playCityAttackAnimation(target,{eventId:id,targetSpawnId:target.spawnId});
    })()`);
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    for (const contact of [610, 1020, 1440]) {
      const result = await evaluate(`readAttackTest(${contact})`);
      assert.equal(result.swords, 2); assert.equal(result.count, 1); assert.equal(result.flag, false);
      assert.equal(result.duration, '2100ms');
      assert(result.opacity.every(value => value > .9), JSON.stringify({kind:kinds[index],contact,result}));
      assert(result.names.every(name => name === 'crownlandsCaptureSword'));
      assert(result.sizeDelta < 2 && result.centerDelta < 2, JSON.stringify({kind:kinds[index],result}));
    }
    const shot = await client.send('Page.captureScreenshot', {format:'png'});
    fs.writeFileSync(path.join(output, `attack-${index}-${kinds[index]}-${width}x${height}.png`), Buffer.from(shot.data,'base64'));
  }
  // A defeated spawn still receives its battle; a replacement spawn must not.
  await evaluate(`CrownlandsAnimations.clearAll(); playCityAttackAnimation(attackFixtures[3],{eventId:'stale-spawn',targetSpawnId:'older-spawn'});`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-attack').length"), 0);
  await evaluate(`(() => {
    const target=attackFixtures[0];
    playCityAttackAnimation({...target,regionId:'another-map'},{eventId:'off-map'});
    playCityAttackAnimation(target,{eventId:'old-session'}); onlineSessionGeneration+=1;
  })()`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-attack').length"), 0);
  await evaluate('onlineSessionGeneration-=1');
  // Reports and callable results converge on the same effect ID, for all target families.
  for (let index = 0; index < kinds.length; index++) {
    await evaluate(`(() => {
      CrownlandsAnimations.clearAll(); deedRewardReportsVfxHydrated=true;
      const t=attackFixtures[${index}], report={id:'combat-report-${index}',battleId:'combat-battle-${index}',type:'attack',outcome:'defeat',
        cityId:t.id,regionId:t.regionId,targetType:t.targetType||'city',targetSpawnId:t.spawnId,occurredAtMs:Date.now()};
      mergeServerReports([report]);
      applyServerArmyResult({kind:'attack',targetType:report.targetType,targetId:t.id,targetSpawnId:t.spawnId,reports:[report]});
    })()`);
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const result = await evaluate('readAttackTest(610)');
    assert.equal(result.count,1); assert.equal(result.flag,false);
  }
  await evaluate(`(() => {
    CrownlandsAnimations.clearAll();
    const report={id:'legion-defense',type:'defense',eventKind:CITADEL_ASSAULT_EVENT_KIND,outcome:'damaged',cityId:captureFixture.id,regionId:getActiveMapRegionId(),occurredAtMs:Date.now()};
    mergeServerReports([report]); mergeServerReports([report]);
  })()`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal((await evaluate('readAttackTest(610)')).count,1);
  await evaluate(`(() => {
    CrownlandsAnimations.clearAll();
    mergeServerReports([{id:'blocked-order',type:'attack',outcome:'defeat',cityId:captureFixture.id,occurredAtMs:Date.now()}]);
    mergeServerReports([{id:'scout-order',type:'scout',battleId:'not-combat',outcome:'scout',cityId:captureFixture.id,occurredAtMs:Date.now()}]);
    deedRewardReportsVfxHydrated=false;
    mergeServerReports([{id:'historical-combat',battleId:'historical-combat',type:'attack',outcome:'victory',cityId:captureFixture.id,occurredAtMs:Date.now()-60000}],{authoritative:true});
  })()`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-attack').length"),0);
  await evaluate(`CrownlandsAnimations.setMode('reduced');playCityAttackAnimation(captureFixture,{eventId:'attack-reduced'})`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const reduced = await evaluate('readAttackTest(100)'), reducedLater = await evaluate('readAttackTest(250)');
  assert.equal(reduced.swords,2); assert.equal(reduced.flag,false); assert.equal(reduced.particles,0);
  assert.equal(reduced.duration,'360ms'); assert.deepEqual(reduced.transforms,reducedLater.transforms);
  assert(reduced.names.every(name=>name==='crownlandsCaptureReduced'));
  await delay(650);
  assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-attack').length"),0);
  await evaluate(`CrownlandsAnimations.setMode('off');playCityAttackAnimation(captureFixture,{eventId:'attack-off'})`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-attack').length"),0);
  // Promote a battle to a capture without resetting the swords; also cover the reverse order.
  await evaluate(`CrownlandsAnimations.setMode('full');playCityAttackAnimation(captureFixture,{eventId:'promoted-battle'});`);
  await delay(180);
  await evaluate(`playCityCaptureAnimation(captureBefore,captureAfter,{eventId:'promoted-capture',combatId:'promoted-battle'});`);
  await delay(300);
  const promotion=await evaluate(`(() => {const e=document.querySelector('.crownlands-vfx--city-capture');return {captures:!!e,attacks:document.querySelectorAll('.crownlands-vfx--city-attack').length,time:e?.querySelector('.crownlands-vfx__part--capture-sword-left').getAnimations()[0]?.currentTime};})()`);
  assert(promotion.captures && promotion.attacks===0 && promotion.time>350,JSON.stringify(promotion));
  await evaluate(`CrownlandsAnimations.clearAll();playCityCaptureAnimation(captureBefore,captureAfter,{eventId:'capture-first',combatId:'late-battle'});`);
  await delay(300);
  await evaluate(`playCityAttackAnimation(captureFixture,{eventId:'late-battle'});`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-attack').length"),0);
  assert.equal(await evaluate("CrownlandsAnimations.activeDedupe.has('city-attack:late-battle')"),false,'A coalesced attack must not leak a lifecycle key.');
  await evaluate(`playCityAttackAnimation(captureFixture,{eventId:'different-battle'});`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-attack').length"),1,'A separate attack must still animate.');
  await delay(2400);
  assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-attack').length"),0,'Attack watchdog must remove even paused effects.');
  await evaluate('CrownlandsAnimations.clearAll()');
  return {kinds,reduced,promotion};
}

async function main() {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.resolve(__dirname, "../release-artifacts/castle-capture", process.env.CROWNLANDS_BENCHMARK_ROOT ? "built" : "source");
  fs.mkdirSync(output, { recursive: true });
  let session, client;
  const results = [], errors = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Runtime.consoleAPICalled", event => { if (event.type === "warning" || event.type === "error") console.log(event.args.map(arg => arg.description || arg.value).join(" ")); });
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=B` });
      for (let i = 0; i < 600 && !await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"); i++) await delay(100);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"), "ready");
      await evaluate(`(() => {
        __CROWNLANDS_BENCHMARK__.closeModal();
        selectedSourceId = selectedTargetId = null; sendMode = false;
        const dimensions=getActiveMapDimensions();
        const distance=city=>{const p=worldToMapPoint(city);return Math.hypot(p.x-dimensions.width/2,p.y-dimensions.height/2);};
        window.captureFixture = state.cities.filter(city => city.owner === 'enemy' && !isStronghold(city)).sort((a,b)=>distance(a)-distance(b))[0];
        captureFixture.level = 150;
        captureFixture.ownerFlag = normalizeFlag({primary:'#7d3434',secondary:'#d6b96b',symbolColor:'#eee5cc',pattern:'quartered',symbol:'lion'},captureFixture.ownerUid);
        renderCities(true); zoom = 2; centerOnCity(captureFixture.id);
        CrownlandsAnimations.clearAll(); CrownlandsAnimations.setMode('full');
        window.captureBefore = {...getCityVfxSnapshot(captureFixture),ownerUid:'previous-ruler',ownerFlag:null};
        window.captureAfter = {...getCityVfxSnapshot(captureFixture),lastCapturedAtMs:Date.now()};
        window.startCaptureTest = id => playCityCaptureAnimation(captureBefore,captureAfter,{eventId:id});
        window.seekCaptureTest = time => {
          const effect = document.querySelector('.crownlands-vfx--city-capture');
          if (!effect) throw Error('Capture effect missing: '+JSON.stringify({mode:getEffectiveAnimationMode(),after:captureAfter,actual:cityById(captureAfter.id)?.ownerUid,target:!!cityLayer.querySelector('[data-city-id="'+captureAfter.id+'"]'),anchor:getWorldAnimationAnchor(captureFixture),seen:[...seenWorldAnimationEventIds.keys()],stats:CrownlandsAnimations.getDebugState()}));
          effect.getAnimations({subtree:true}).forEach(animation => {animation.pause();animation.currentTime=time;});
          return effect;
        };
      })()`);
      await delay(300);
      const attacks = await validateAttacks(evaluate, client, width, height, output);
      await evaluate("startCaptureTest('capture-full');startCaptureTest('capture-full')");
      for (let i=0;i<30 && !await evaluate("!!document.querySelector('.crownlands-vfx--city-capture')");i++) await delay(100);
      const full = await evaluate(`(() => {
        const effect=seekCaptureTest(610), flag=effect.querySelector('.capture-owner-cloth');
        const sword=effect.querySelector('.crownlands-vfx__part--capture-sword-left');
        const art=cityLayer.querySelector('[data-city-id="'+captureFixture.id+'"] .city-art');
        const a=art.getBoundingClientRect(), b=effect.getBoundingClientRect();
        return {count:document.querySelectorAll('.crownlands-vfx--city-capture').length,swords:effect.querySelectorAll('[class*="__part--capture-sword-"]').length,
          swordOpacity:Number(getComputedStyle(sword).opacity),symbol:flag.querySelector('.flag-symbol').dataset.flagSymbol,
          expectedSymbol:normalizeFlag(captureAfter.ownerFlag,captureAfter.ownerUid).symbol,
          primary:flag.style.getPropertyValue('--flag-primary'),expectedPrimary:captureAfter.ownerFlag.primary,
          pattern:flag.classList.contains('pattern-'+captureAfter.ownerFlag.pattern),stableKey:flag.dataset.flagStableKey,ownerUid:captureAfter.ownerUid,
          sizeDelta:Math.abs(a.width-b.width),centerDelta:Math.abs(a.x+a.width/2-b.x-b.width/2)+Math.abs(a.y+a.height/2-b.y-b.height/2),
          pointerEvents:getComputedStyle(effect).pointerEvents,ariaHidden:effect.getAttribute('aria-hidden'),duration:effect.style.getPropertyValue('--vfx-duration')};
      })()`);
      assert.equal(full.count, 1, "Duplicate capture receipts must coalesce.");
      assert.equal(full.swords, 2); assert(full.swordOpacity > .9);
      assert.equal(full.symbol, full.expectedSymbol); assert.equal(full.primary, full.expectedPrimary);
      assert(full.pattern); assert.equal(full.stableKey, full.ownerUid);
      assert(full.sizeDelta < 2 && full.centerDelta < 2, JSON.stringify(full));
      assert.equal(full.pointerEvents, "none"); assert.equal(full.ariaHidden, "true"); assert.equal(full.duration, "4000ms");
      let shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `clash-${width}x${height}.png`), Buffer.from(shot.data, "base64"));
      const drape = await evaluate(`(() => {const effect=seekCaptureTest(2800),d=effect.querySelector('.crownlands-vfx__part--capture-drape');return {opacity:getComputedStyle(d).opacity,clip:getComputedStyle(d).clipPath,swordOpacity:getComputedStyle(effect.querySelector('.crownlands-vfx__part--capture-sword-left')).opacity};})()`);
      assert.equal(drape.opacity, "1"); assert.match(drape.clip, /^inset\((?:0(?:px|%)?\s*)+\)$/); assert.equal(drape.swordOpacity, "0");
      shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `drape-${width}x${height}.png`), Buffer.from(shot.data, "base64"));
      await evaluate("CrownlandsAnimations.cancelScope('map:'+captureAfter.regionId)");
      assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-capture').length"), 0);
      assert.equal(await evaluate("mapVfxLayer.classList.contains('crownlands-capture-active')"), false);
      await evaluate("CrownlandsAnimations.setMode('reduced');startCaptureTest('capture-reduced')");
      for (let i=0;i<30 && !await evaluate("!!document.querySelector('.crownlands-vfx--city-capture')");i++) await delay(50);
      const reduced = await evaluate(`(() => {const effect=seekCaptureTest(200);return {swords:effect.querySelectorAll('[class*="__part--capture-sword-"]').length,particles:effect.querySelectorAll('.crownlands-vfx__particle').length,clothAnimation:getComputedStyle(effect.querySelector('.capture-owner-cloth')).animationName,duration:effect.style.getPropertyValue('--vfx-duration'),flag:!!effect.querySelector('.flag-symbol svg')};})()`);
      assert.deepEqual(reduced, {swords:0,particles:0,clothAnimation:"none",duration:"520ms",flag:true});
      await delay(850);
      assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-capture').length"), 0, "Capture watchdog must remove nodes.");
      await evaluate("CrownlandsAnimations.setMode('off');startCaptureTest('capture-off')");
      await delay(280);
      assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-capture').length"), 0);
      // Hydration, old events, Deed awards, other maps and superseded owners never animate.
      await evaluate(`(() => {
        CrownlandsAnimations.setMode('full');
        const previous=new Map([[captureFixture.id,captureBefore]]);
        emitOnlineCityStateAnimations(previous,[{...captureFixture,lastCapturedAtMs:Date.now()}],false);
        emitOnlineCityStateAnimations(previous,[{...captureFixture,lastCapturedAtMs:Date.now()-120000}],true);
        playCityCaptureAnimation(captureBefore,{...captureAfter,neutralClaimSource:'deed_camp'},{eventId:'deed'});
        playCityCaptureAnimation(captureBefore,{...captureAfter,regionId:'another-map'},{eventId:'elsewhere'});
        playCityCaptureAnimation(captureBefore,{...captureAfter,ownerUid:'superseded-owner'},{eventId:'superseded'});
      })()`);
      await delay(300);
      assert.equal(await evaluate("document.querySelectorAll('.crownlands-vfx--city-capture').length"), 0);
      await evaluate("CrownlandsAnimations.setMode('auto')");
      await client.send("Emulation.setEmulatedMedia", { features: [{name:"prefers-reduced-motion",value:"reduce"}] });
      assert.equal(await evaluate("CrownlandsAnimations.getEffectiveMode()"), "reduced");
      await client.send("Emulation.setEmulatedMedia", { features: [{name:"prefers-reduced-motion",value:"no-preference"}] });
      results.push({width,height,attacks,full,drape,reduced});
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,"validation.json"),JSON.stringify({results,errors},null,2));
    console.log("Combat/capture passed: all target families, report/result deduplication, Legion defense, three shared sword strikes, capture-only heraldry, anchoring, stale-event guards, motion modes and cleanup at three viewports.");
  } finally {
    if (client) {await client.send("Browser.close").catch(()=>{});client.close();}
    if (session) {if (!await waitForProcessExit(session.browserProcess)) {session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().then(() => {
  if (process.env.CROWNLANDS_BENCHMARK_ROOT) return;
  const dist = path.resolve(__dirname, "../dist");
  assert(fs.existsSync(path.join(dist, "animation-manager.js")), "Build the production client before checking its delivered animation.");
  const result = spawnSync(process.execPath, [__filename], { stdio: "inherit", windowsHide: true,
    env: { ...process.env, CROWNLANDS_CAPTURE_BUILT: dist } });
  assert.equal(result.status, 0, "The shipped animation must pass the same capture behavior checks.");
}).catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
