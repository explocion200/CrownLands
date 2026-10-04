/* Actual Gear Box UI with synthetic authoritative receipts; no production account or writes. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { CdpClient } = require('./map-benchmark/cdp-client');
const { createMapBenchmarkServer } = require('./map-benchmark/server');
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require('./validate-focused-browser-smoke');
const out = path.resolve(__dirname, '../release-artifacts/common-gear-box');
async function main() {
  const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
  assert(browser, 'A Chromium browser is required.'); fs.mkdirSync(out, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client; const errors = [], results = [];
  try {
    session = await startBrowserSession(browser); client = await CdpClient.connect(session.targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await client.send('Runtime.enable'); await client.send('Page.enable');
    client.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const evaluate = async expression => { const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
    const wait = async expression => { for (let i = 0; i < 480; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 125)); } throw Error('Timed out: ' + expression); };
    const paint = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const shot = async name => { const s = await client.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(s.data, 'base64')); };
    const click = async selector => { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')!==e)throw Error('Obscured '+${JSON.stringify(selector)});return{x:r.x+r.width/2,y:r.y+r.height/2}})()`); for (const type of ['mousePressed', 'mouseReleased']) await client.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 }); await paint(); };
    await client.send('Page.navigate', { url: address.url + '/__benchmark__/?scenario=A&visualMarches=0' });
    await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
    await evaluate(`(()=>{
      window.__boxOriginalApi=getOnlineApi;window.__boxQA={calls:[],mode:'ok',uid:'box-qa',gear:null};
      __boxQA.reset=(count=5,boxType="common")=>{commonGearBoxView?.dispose();commonGearBoxSession=null;__boxQA.calls=[];__boxQA.mode='ok';__boxQA.uid='box-qa';__boxQA.gear=COMMON_GEAR.createDefaultState();__boxQA.gear.commonGearBoxes=count;__boxQA.gear.uncommonGearBoxes=count;__boxQA.gear.updatedAtMs=100;state.gear=normalizeCommonGearState(__boxQA.gear);showCommonGearBoxReveal(null,boxType);};
      getOnlineApi=()=>({getUser:()=>({uid:__boxQA.uid}),openCommonGearBox:async({requestId,boxType="common"})=>{
        const q=__boxQA,countField=boxType==="uncommon"?"uncommonGearBoxes":"commonGearBoxes",requestField=boxType==="uncommon"?"lastUncommonOpenRequestId":"lastOpenRequestId",receiptField=boxType==="uncommon"?"lastUncommonOpenReceipt":"lastOpenReceipt";q.calls.push(requestId);if(q.mode==='slow'){await new Promise(r=>q.resolve=r);q.mode='ok';}
        if(q.mode==='fail'){q.mode='ok';throw Error('Synthetic rejection');}
        if(q.gear[requestField]===requestId)return{gear:structuredClone(q.gear),receipt:q.gear[receiptField],replayed:true};
        if(!q.gear[countField])throw Error('No boxes');q.gear[countField]--;const ids=[];
        for(let i=0;i<3;i++){const pool=COMMON_GEAR.DEFINITIONS.filter(d=>d.rarity===(boxType==="uncommon"&&i===0?"uncommon":"common")),d=pool[(q.gear.updatedAtMs+i)%32],id='box-qa-'+q.gear.updatedAtMs+'-'+i;ids.push(id);q.gear.instances[id]=COMMON_GEAR.normalizeInstance({instanceId:id,gearKey:d.gearKey,level:1,acquiredAtMs:q.gear.updatedAtMs});}
        q.gear.updatedAtMs++;q.gear[requestField]=requestId;q.gear[receiptField]={requestId,boxType,instanceIds:ids,openedAtMs:q.gear.updatedAtMs};
        if(q.mode==='lost'){q.mode='ok';throw Error('Lost response after commit');}
        return{gear:structuredClone(q.gear),receipt:q.gear[receiptField]};
      }});setAnimationModePreference('off');__boxQA.reset();
    })()`);
    const settled = () => wait('!commonGearBoxSession.busy');
    for (const [width, height] of [[1440,900],[1024,768],[844,390],[667,375],[568,320]]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await evaluate('__boxQA.reset()'); await paint();
      for (const phase of ['ready','rewards','last','empty']) {
        if (phase === 'rewards') { await click('#cgbChestArt'); await settled(); assert.equal(await evaluate('__boxQA.calls.length'),1); }
        if (phase === 'last') { await evaluate('__boxQA.reset(1);void openOneCommonGearBox()'); await settled(); }
        if (phase === 'empty') await evaluate('__boxQA.reset(0)');
        await paint(); await evaluate("Promise.all([...modal.querySelectorAll('img')].map(i=>i.decode()))");
        const data = await evaluate(`(()=>{const r=modal.getBoundingClientRect(),buttons=[...modal.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return{label:e.textContent||e.ariaLabel,w:b.width,h:b.height,inside:b.x>=r.x&&b.y>=r.y&&b.right<=r.right+1&&b.bottom<=r.bottom+1}});return{within:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,overflow:modalBody.scrollHeight-modalBody.clientHeight,buttons,count:state.gear.commonGearBoxes,cards:modal.querySelectorAll('.cgb-reward-card').length,gray:[...modal.querySelectorAll('.cgb-reward-card')].every(e=>getComputedStyle(e).backgroundColor==='rgb(217, 218, 214)')}})()`);
        results.push({ width,height,phase,...data });
        await shot(`runtime-${width}x${height}-${phase}`);
        assert(data.within && data.overflow<=1,JSON.stringify(results.at(-1)));assert(data.buttons.every(b=>b.w>=44&&b.h>=44&&b.inside),JSON.stringify(results.at(-1)));
        if (['rewards','last'].includes(phase)) { assert.equal(data.cards,3);assert(data.gray); }
      }
    }
    await evaluate('__boxQA.reset();__boxQA.mode="slow";void openOneCommonGearBox();void openOneCommonGearBox()');assert.equal(await evaluate('__boxQA.calls.length'),1);assert(await evaluate("document.querySelector('#cgbChestArt').disabled && document.querySelector('.cgb-footer-actions [data-cgb-action=open]').disabled"));await evaluate('__boxQA.resolve()');await settled();
    for(let count=3;count>=0;count--){await click('.cgb-footer-actions [data-cgb-action=open]');await settled();assert.equal(await evaluate('state.gear.commonGearBoxes'),count);}
    assert.equal(await evaluate('Object.keys(state.gear.instances).length'),15);assert.equal(await evaluate('new Set(__boxQA.calls).size'),5);assert.equal(await evaluate("!!modal.querySelector('.cgb-footer-actions [data-cgb-action=open]')"),false);
    // Lost responses retry the same operation, including after dismissing/reopening.
    await evaluate('__boxQA.reset(1);__boxQA.mode="lost";void openOneCommonGearBox()');await settled();assert(await evaluate('!!commonGearBoxSession.error'));await click('#closeModalBtn');await paint();await evaluate('showCommonGearBoxReveal()');await click('#cgbChestArt');await settled();assert.equal(await evaluate('state.gear.commonGearBoxes'),0);assert.equal(await evaluate('Object.keys(state.gear.instances).length'),3);assert.equal(await evaluate('new Set(__boxQA.calls).size'),1);
    // Failed repeated opening keeps the existing reward; recovery remains visible at zero boxes.
    await evaluate('__boxQA.reset(2);void openOneCommonGearBox()');await settled();await evaluate('__boxQA.mode="lost";void openOneCommonGearBox()');await settled();assert(await evaluate("document.querySelector('.cgb-stored-mark.cgb-error').getClientRects().length>0"));await evaluate('state.gear=normalizeCommonGearState(__boxQA.gear);renderCommonGearBoxState()');await click('.cgb-footer-actions [data-cgb-action=open]');await settled();assert.equal(await evaluate('state.gear.commonGearBoxes'),0);assert.equal(await evaluate('Object.keys(state.gear.instances).length'),6);
    // Late results cannot reopen a closed modal or replace another panel.
    await evaluate('__boxQA.reset();__boxQA.mode="slow";void openOneCommonGearBox()');await click('#closeModalBtn');await paint();await evaluate('__boxQA.resolve()');await settled();assert.equal(await evaluate('modal.open'),false);assert.equal(await evaluate('state.gear.commonGearBoxes'),4);await evaluate('showCommonGearBoxReveal()');assert.equal(await evaluate("modal.querySelectorAll('.cgb-reward-card').length"),3);
    await evaluate('__boxQA.reset();__boxQA.mode="slow";void openOneCommonGearBox();renderCommonGearBuilding("royal-stables")');await paint();await evaluate('__boxQA.resolve()');await settled();
    // The receipt may settle while the destination's scripts are still loading.
    // Keep that race, then wait for the real destination instead of two frames.
    await wait("!!modal.querySelector('[data-royal-stables-officer]')");
    assert.equal(await evaluate("modal.dataset.commonGearBuildingId"), "royal-stables");
    assert.equal(await evaluate("!!modal.querySelector('#cgbChestArt')"), false, "A late chest receipt replaced the destination.");
    // A more recent profile snapshot and a different signed-in owner must not be overwritten.
    await evaluate('__boxQA.reset();__boxQA.mode="slow";void openOneCommonGearBox();state.gear.updatedAtMs=999;state.gear.commonGearBoxes=8;__boxQA.resolve()');await settled();assert.equal(await evaluate('state.gear.commonGearBoxes'),8);
    await evaluate('__boxQA.reset();__boxQA.mode="slow";void openOneCommonGearBox();__boxQA.uid="other-user";__boxQA.resolve()');await settled();assert.equal(await evaluate('state.gear.commonGearBoxes'),5);
    await client.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:false});
    await evaluate('__boxQA.reset();setAnimationModePreference("full");void openOneCommonGearBox()');await wait('Number(commonGearBoxView?.chest.svg.dataset.open)>.2 && Number(commonGearBoxView?.chest.svg.dataset.open)<.98');await shot('runtime-opening-midpoint');await settled();
    for(const mode of ['reduced','off']){await evaluate(`__boxQA.reset();setAnimationModePreference('${mode}');void openOneCommonGearBox()`);await settled();assert.equal(await evaluate('Number(commonGearBoxView.chest.svg.dataset.open)'),1);}
    await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await evaluate('setAnimationModePreference("full");__boxQA.reset();void openOneCommonGearBox()');await settled();assert.equal(await evaluate('modal.dataset.motion'),'reduced');await client.send('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('__boxQA.reset();setAnimationModePreference("off");document.querySelector("#cgbChestArt").focus()');for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});await wait('__boxQA.calls.length===1');await settled();assert.equal(await evaluate('state.gear.commonGearBoxes'),4);
    await click('[data-cgb-action=castle]');assert(await evaluate("modal.classList.contains('bailey-modal')"));await evaluate('__boxQA.reset()');await click('[data-cgb-action=bag]');assert(await evaluate("modal.classList.contains('inventory-modal')"));
    // Exercise the real mixer and the confirmed opening boundary, including delayed responses.
    await wait('window.CrownlandsAudio?.ready');
    await evaluate(`(()=>{
      window.__boxOriginalSound=playGameSound;
      __boxQA.soundCalls=[];__boxQA.soundStarts=[];
      playGameSound=(id,options)=>{
        if(id==='gear_box_open'){
          if(__boxQA.soundError)throw Error('Synthetic audio failure');
          __boxQA.soundCalls.push({open:Number(commonGearBoxView.chest.svg.dataset.open),at:performance.now()});
        }
        return __boxOriginalSound(id,options);
      };
      __boxQA.originalRecord=crownlandsAudio.recordEffectStart;
      crownlandsAudio.recordEffectStart=function(asset,gain){
        if(asset.id==='gear_box_open')__boxQA.soundStarts.push(performance.now());
        return __boxQA.originalRecord.call(this,asset,gain);
      };
    })()`);
    for (const [width,height] of [[1440,900],[844,390]]) {
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      // Earlier fast UI scenarios also play this cue. Let it finish naturally
      // before testing a new start; the mixer intentionally allows only one copy.
      await wait('![...crownlandsAudio.activeEffects].some(effect=>effect.audioId==="gear_box_open") && !crownlandsAudio.pendingEffectCounts.get("gear_box_open")');
      await evaluate('__boxQA.reset();setAnimationModePreference("full");__boxQA.mode="slow";__boxQA.soundCalls=[];__boxQA.soundStarts=[]');
      await click('#cgbChestArt');
      assert.equal(await evaluate('__boxQA.soundCalls.length'),0,'No chest cue before confirmation');
      await evaluate('crownlandsAudio.prepareEffect("gear_box_open")');
      await evaluate('__boxQA.resolve()');
      await wait('__boxQA.soundStarts.length===1');
      await wait('Number(commonGearBoxView.chest.svg.dataset.open)>.2 && Number(commonGearBoxView.chest.svg.dataset.open)<1');
      const timing=await evaluate('({call:__boxQA.soundCalls[0],started:__boxQA.soundStarts[0],gain:crownlandsAudio.lastEffectBaseGain,musicPaused:crownlandsAudio.currentMusic?.paused})');
      assert.equal(timing.call.open,0,'Sound starts with the closed lid');
      assert(timing.started-timing.call.at<200,'Prepared sound must start promptly with the lid');
      assert.equal(timing.gain,1);
      assert.equal(timing.musicPaused,false,'Music continues through the chest sound');
      await settled();assert.equal(await evaluate('__boxQA.soundCalls.length'),1);
      results.push({width,height,audio:'passed',latencyMs:timing.started-timing.call.at});
    }
    for (const scenario of ['closed','replaced','owner','hidden','muted','audio-failed','preload-failed','reduced','off']) {
      await evaluate(`__boxQA.reset();__boxQA.soundCalls=[];__boxQA.soundStarts=[];__boxQA.mode='slow';setAnimationModePreference(${JSON.stringify(['reduced','off'].includes(scenario)?scenario:'full')})`);
      if(scenario==='muted')await evaluate('crownlandsAudio.setEffectsMuted(true)');
      if(scenario==='audio-failed')await evaluate('__boxQA.soundError=true');
      if(scenario==='preload-failed')await evaluate('__boxQA.originalPrepare=crownlandsAudio.prepareEffect;crownlandsAudio.prepareEffect=()=>{throw Error("Synthetic preload failure")}');
      await evaluate('void openOneCommonGearBox();void openOneCommonGearBox()');
      assert.equal(await evaluate('__boxQA.calls.length'),1,'Repeated input sends one request');
      if(scenario==='closed')await evaluate('modal.close()');
      if(scenario==='replaced')await evaluate('renderCommonGearBuilding("royal-stables")');
      if(scenario==='owner')await evaluate('__boxQA.uid="another-user"');
      if(scenario==='hidden')await evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true})');
      await evaluate('__boxQA.resolve()');
      await settled();
      if(scenario==='hidden')await evaluate('delete document.hidden');
      const expectedSilent=['closed','replaced','owner','hidden','audio-failed'].includes(scenario);
      assert.equal(await evaluate('__boxQA.soundCalls.length'),expectedSilent?0:1,scenario);
      if(scenario==='muted'){
        assert.equal(await evaluate('__boxQA.soundStarts.length'),0,'Muted opening creates no audio source');
        await evaluate('crownlandsAudio.setEffectsMuted(false)');
      }
      if(scenario==='audio-failed')await evaluate('__boxQA.soundError=false');
      if(scenario==='preload-failed')await evaluate('crownlandsAudio.prepareEffect=__boxQA.originalPrepare');
      if(['audio-failed','preload-failed','reduced','off'].includes(scenario)){
        assert.equal(await evaluate('state.gear.commonGearBoxes'),4,scenario);
        assert.equal(await evaluate('commonGearBoxSession.error'),'',scenario);
        assert.equal(await evaluate("modal.querySelectorAll('.cgb-reward-card').length"),3,scenario);
      }
    }
    for(const mode of ['fail','lost']){
      await evaluate(`__boxQA.reset();__boxQA.soundCalls=[];__boxQA.mode=${JSON.stringify(mode)};void openOneCommonGearBox()`);await settled();
      assert.equal(await evaluate('__boxQA.soundCalls.length'),0,mode+' response stays silent');
      assert(await evaluate('!!commonGearBoxSession.error'));
      if(mode==='lost'){
        await evaluate('void openOneCommonGearBox()');await settled();
        assert.equal(await evaluate('__boxQA.soundCalls.length'),1,'Recovered opening is presented once');
        await evaluate('showCommonGearBoxReveal()');assert.equal(await evaluate('__boxQA.soundCalls.length'),1,'Reopening revealed rewards is silent');
      }
    }
    for(const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await evaluate('__boxQA.reset(2,"uncommon");setAnimationModePreference("full");__boxQA.soundCalls=[];__boxQA.soundStarts=[]');
      await paint(); await shot(`uncommon-${width}x${height}-ready`);
      assert.equal(await evaluate('commonGearBoxView.chest.svg.querySelector("polygon").getAttribute("fill")'),'#6f8753');
      await click('#cgbChestArt');await settled();
      assert.equal(await evaluate('__boxQA.soundCalls.length'),1);
      assert.deepEqual(await evaluate('commonGearBoxSession.items.map(i=>i.rarity).sort()'),['common','common','uncommon']);
      assert.equal(await evaluate('state.gear.uncommonGearBoxes'),1);
      assert.equal(await evaluate('state.gear.commonGearBoxes'),2);
      assert.equal(await evaluate(`getComputedStyle(modal.querySelector('[data-rarity="uncommon"].cgb-reward-card')).backgroundColor`),'rgb(199, 210, 180)');
      assert(await evaluate('modalBody.scrollHeight<=modalBody.clientHeight+1'));
      await evaluate('Promise.all(modal.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');
      await shot(`uncommon-${width}x${height}-rewards`);
      await evaluate('showInventoryModal()');
      await wait(`!!modal.querySelector('[data-inventory-select="uncommon_gear_box"]')`);
      await click('[data-inventory-select="uncommon_gear_box"]');
      assert(await evaluate(`modal.querySelector('[data-inventory-use="uncommon_gear_box"]').textContent.includes("Open")`));
      await shot(`uncommon-${width}x${height}-bag`);
      await click('[data-inventory-use="uncommon_gear_box"]');
      assert.equal(await evaluate('commonGearBoxSession.boxType'),'uncommon');
    }
    await evaluate('__boxQA.reset(2,"uncommon");__boxQA.mode="lost";void openOneCommonGearBox()');await settled();
    const lostGreenId=await evaluate('commonGearBoxSession.requestId');
    await evaluate('showCommonGearBoxReveal();void openOneCommonGearBox()');await settled();
    await evaluate('showCommonGearBoxReveal(null,"uncommon");void openOneCommonGearBox()');await settled();
    assert.equal(await evaluate('__boxQA.calls.at(-1)'),lostGreenId);
    assert.equal(await evaluate('state.gear.uncommonGearBoxes'),1);
    assert.equal(await evaluate('Object.keys(state.gear.instances).length'),6);

    // Real Daily Login and Bag rendering against the new server schedule.
    const dailyModel=require('../functions/dailyLoginRewards');
    const dailySample=dailyModel.status(dailyModel.sync({}).state);
    for(const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const day of [10,30]) {
        const sample={...dailySample,nextDay:day,earnedThroughDay:day,nextClaimOrdinal:day,totalClaims:day-1,pendingCount:1,eligible:true};
        await evaluate(`commonGearBoxView?.dispose();modal.className="modal";dailyLoginRewardStatus=normalizeDailyLoginRewardStatus(${JSON.stringify(sample)});dailyLoginRewardStatusLoading=false;dailyLoginRewardClaimInFlight=false;showDailyLoginRewardsModal({skipRefresh:true})`);
        await paint();
        await evaluate('Promise.all([...modal.querySelectorAll("img")].map(i=>i.decode()))');
        const text=await evaluate('modal.querySelector(".bundle").textContent');
        if(day===10)assert(text.includes('Veil of Silence')&&text.includes('Royal Peace Shield'),text);
        else assert(text.includes('Uncommon Gear Box')&&text.includes('One Uncommon + two Common'),text);
        assert.equal(await evaluate('modal.querySelectorAll("#weekNav button").length'),5);
        assert(await evaluate('(()=>{const r=modal.getBoundingClientRect(),b=modal.querySelector("#claimButton").getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&b.bottom<=r.bottom&&b.height>=44&&modalBody.scrollHeight<=modalBody.clientHeight+1})()'));
        await shot(`daily-${width}x${height}-day${day}`);
      }
    }
    for(const extension of ['mp3','ogg','wav']){
      const duration=await evaluate(`fetch('audio/rewards/gear_box_open.${extension}').then(r=>{if(!r.ok)throw Error('Missing codec');return r.arrayBuffer()}).then(b=>crownlandsAudio.effectContext.decodeAudioData(b)).then(b=>b.duration)`);
      assert(duration>.9&&duration<1.05,extension+' retains the short opening');
    }
    await evaluate('getOnlineApi=window.__boxOriginalApi;playGameSound=window.__boxOriginalSound;crownlandsAudio.recordEffectStart=__boxQA.originalRecord');assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'runtime-checks.json'),JSON.stringify({results,errors,interactions:'passed',audio:'passed'},null,2));
    console.log('PASS: Common and Uncommon Gear Boxes on desktop/landscape; exact mixed rarity reveal, separate Bag counts, cross-type retry recovery, opening audio and motion guards; day 10 and day 30 in the five-week Daily Login ledger.');
  } finally { if(client){await client.send('Browser.close').catch(()=>{});client.close();}if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}await server.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
