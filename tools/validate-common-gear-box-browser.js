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
      __boxQA.reset=(count=5)=>{commonGearBoxView?.dispose();commonGearBoxSession=null;__boxQA.calls=[];__boxQA.mode='ok';__boxQA.uid='box-qa';__boxQA.gear=COMMON_GEAR.createDefaultState();__boxQA.gear.commonGearBoxes=count;__boxQA.gear.updatedAtMs=100;state.gear=normalizeCommonGearState(__boxQA.gear);showCommonGearBoxReveal();};
      getOnlineApi=()=>({getUser:()=>({uid:__boxQA.uid}),openCommonGearBox:async({requestId})=>{
        const q=__boxQA;q.calls.push(requestId);if(q.mode==='slow'){await new Promise(r=>q.resolve=r);q.mode='ok';}
        if(q.mode==='fail'){q.mode='ok';throw Error('Synthetic rejection');}
        if(q.gear.lastOpenRequestId===requestId)return{gear:structuredClone(q.gear),receipt:q.gear.lastOpenReceipt,replayed:true};
        if(!q.gear.commonGearBoxes)throw Error('No boxes');q.gear.commonGearBoxes--;const ids=[];
        for(let i=0;i<3;i++){const d=COMMON_GEAR.DEFINITIONS[(q.gear.updatedAtMs+i)%32],id='box-qa-'+q.gear.updatedAtMs+'-'+i;ids.push(id);q.gear.instances[id]=COMMON_GEAR.normalizeInstance({instanceId:id,gearKey:d.gearKey,level:1,acquiredAtMs:q.gear.updatedAtMs});}
        q.gear.updatedAtMs++;q.gear.lastOpenRequestId=requestId;q.gear.lastOpenReceipt={requestId,instanceIds:ids,openedAtMs:q.gear.updatedAtMs};
        if(q.mode==='lost'){q.mode='ok';throw Error('Lost response after commit');}
        return{gear:structuredClone(q.gear),receipt:q.gear.lastOpenReceipt};
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
    await evaluate('__boxQA.reset();__boxQA.mode="slow";void openOneCommonGearBox();renderCommonGearBuilding("royal-stables")');await paint();await evaluate('__boxQA.resolve()');await settled();assert(await evaluate("!!modal.querySelector('[data-royal-stables-officer]')"));
    // A more recent profile snapshot and a different signed-in owner must not be overwritten.
    await evaluate('__boxQA.reset();__boxQA.mode="slow";void openOneCommonGearBox();state.gear.updatedAtMs=999;state.gear.commonGearBoxes=8;__boxQA.resolve()');await settled();assert.equal(await evaluate('state.gear.commonGearBoxes'),8);
    await evaluate('__boxQA.reset();__boxQA.mode="slow";void openOneCommonGearBox();__boxQA.uid="other-user";__boxQA.resolve()');await settled();assert.equal(await evaluate('state.gear.commonGearBoxes'),5);
    await client.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:false});
    await evaluate('__boxQA.reset();setAnimationModePreference("full");void openOneCommonGearBox()');await wait('Number(commonGearBoxView?.chest.svg.dataset.open)>.2 && Number(commonGearBoxView?.chest.svg.dataset.open)<.98');await shot('runtime-opening-midpoint');await settled();
    for(const mode of ['reduced','off']){await evaluate(`__boxQA.reset();setAnimationModePreference('${mode}');void openOneCommonGearBox()`);await settled();assert.equal(await evaluate('Number(commonGearBoxView.chest.svg.dataset.open)'),1);}
    await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await evaluate('setAnimationModePreference("full");__boxQA.reset();void openOneCommonGearBox()');await settled();assert.equal(await evaluate('modal.dataset.motion'),'reduced');await client.send('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('__boxQA.reset();setAnimationModePreference("off");document.querySelector("#cgbChestArt").focus()');for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});await wait('__boxQA.calls.length===1');await settled();assert.equal(await evaluate('state.gear.commonGearBoxes'),4);
    await click('[data-cgb-action=castle]');assert(await evaluate("modal.classList.contains('bailey-modal')"));await evaluate('__boxQA.reset()');await click('[data-cgb-action=bag]');assert(await evaluate("modal.classList.contains('inventory-modal')"));
    await evaluate('getOnlineApi=window.__boxOriginalApi');assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'runtime-checks.json'),JSON.stringify({results,errors,interactions:'passed'},null,2));
    console.log('PASS: Gear Box 20 desktop/landscape states; chest/button/keyboard opening, 5-to-0 repeat, server counts and 3 rewards, duplicate-click guard, idempotent lost-response recovery, close/navigation/owner/freshness guards, motion preferences and visible controls.');
  } finally { if(client){await client.send('Browser.close').catch(()=>{});client.close();}if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}await server.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
