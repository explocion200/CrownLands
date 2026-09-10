const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'release-artifacts/inner-castle-overview');
const { CdpClient } = require(path.join(root, 'tools/map-benchmark/cdp-client'));
const { createMapBenchmarkServer } = require(path.join(root, 'tools/map-benchmark/server'));
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require(path.join(root, 'tools/validate-focused-browser-smoke'));
async function main() {
  const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(file => file && fs.existsSync(file));
  assert(browser, 'Set CHROME_PATH to a Chromium browser.');
  fs.mkdirSync(out, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client; const report = [], errors = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    client.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails));
    await client.send('Runtime.enable'); await client.send('Page.enable');
    const evaluate = async expression => {
      const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
      return r.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 480; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 125));
      }
      throw Error('Timed out: ' + expression);
    };
    const click = async selector => {
      const point = await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect();if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')!==b)throw Error('Control is obscured: '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    };
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send('Page.navigate', { url: address.url + '/__benchmark__/?scenario=A&visualMarches=0' });
    await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
    await evaluate(`(async()=>{window.__CROWNLANDS_BENCHMARK__.closeModal();await new Promise(r=>setTimeout(r,50));getMainCityReference().name='Wyvernmarket Mead';state.gear=normalizeCommonGearState(state.gear);openInnerCastle(getMainCityReference().id);})()`);
    const keys = await evaluate('INNER_CASTLE_BUILDINGS.map(b=>b.key)');
    for (const [width, height] of [[1440,900],[1280,720],[844,390],[667,375],[568,320],[932,430]]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      for (const key of keys) {
        await evaluate(`state.gear.newMarkers[${JSON.stringify(key)}]=Boolean(COMMON_GEAR.BUILDINGS[${JSON.stringify(key)}]);renderInnerCastle(getMainCityReference().id);`);
        await click(`.bailey-pin[data-inner-castle-building="${key}"]`);
        await evaluate("Promise.all([...document.querySelectorAll('.bailey-shell img')].map(i=>i.decode()))");
        const data = await evaluate(`(()=>{
          const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
          const tray=document.querySelector('.bailey-detail-tray'), scene=document.querySelector('.bailey-scene');
          return {titleDisplay:getComputedStyle(modalTitle).display,signColor:getComputedStyle(document.querySelector(".bailey-pin-name")).color,image:rect(document.querySelector('.bailey-building-art')),heading:rect(document.querySelector('.bailey-building-heading')),copy:rect(document.querySelector('.bailey-building-copy')),button:rect(document.querySelector('.bailey-manage')),tray:rect(tray),scene:rect(scene),modal:rect(modal),scrollTop:tray.scrollTop,scrollHeight:tray.scrollHeight,clientHeight:tray.clientHeight,bodyOverflow:modalBody.scrollHeight-modalBody.clientHeight,notice:modal.textContent.includes('Building functions and upgrades'),backParent:document.querySelector('[data-inner-castle-back]').parentElement.className,backCount:document.querySelectorAll('[data-inner-castle-back]').length,closeCount:document.querySelectorAll('#closeModalBtn').length,selected:innerCastleSelectedBuildingKey,pressed:[...modal.querySelectorAll('[aria-pressed=true]')].map(b=>b.dataset.innerCastleBuilding),pins:[...modal.querySelectorAll('.bailey-pin')].map(b=>({key:b.dataset.innerCastleBuilding,rect:rect(b),anchor:INNER_CASTLE_BUILDINGS.find(a=>a.key===b.dataset.innerCastleBuilding).hotspot})),description:document.querySelector('.bailey-role').textContent,status:document.querySelector('.bailey-status').textContent};
        })()`);
        fs.writeFileSync(path.join(out, 'integration-latest.json'), JSON.stringify({width,height,key,...data},null,2));
        const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(out, `runtime-${width}x${height}-${key}.png`), Buffer.from(screenshot.data, 'base64'));
        assert.equal(data.titleDisplay,"none"); assert.equal(data.signColor,"rgb(255, 240, 206)");
        assert.equal(data.selected,key); assert.deepEqual(data.pressed,[key,key]); assert.equal(data.notice,false);
        assert.equal(data.scrollTop,0); assert(data.scrollHeight<=data.clientHeight+1,`${width} ${key} detail needs scrolling`);
        assert(data.bodyOverflow<=1); assert(data.image.width>=50); assert(data.image.y>=data.heading.bottom-1);
        assert(data.copy.y>=data.image.bottom-1); assert(data.copy.bottom<=data.tray.bottom);
        assert(Math.abs(data.image.x+data.image.width/2-data.copy.x-data.copy.width/2)<1);
        assert.equal(data.backParent,height<=550?'bailey-header':'bailey-footer'); assert.equal(data.backCount,1); assert.equal(data.closeCount,1);
        assert(data.modal.x>=0&&data.modal.y>=0&&data.modal.right<=width&&data.modal.bottom<=height);
        for(const pin of data.pins){
          assert(pin.rect.height>=44&&pin.rect.width>=44);
          const x=(pin.rect.x+pin.rect.width/2-data.scene.x-1)/(data.scene.width-2)*100;
          const y=(pin.rect.y+pin.rect.height/2-data.scene.y-1)/(data.scene.height-2)*100;
          assert(Math.abs(x-pin.anchor.left)<0.1&&Math.abs(y-pin.anchor.top)<0.1,`${width} ${pin.key} anchor moved`);
        }
        if(data.button){
          assert(data.button.y>=data.copy.bottom); assert(data.button.bottom<=data.tray.bottom); assert(data.button.height>=44);
          await click('.bailey-manage');
          assert(await evaluate(`modal.classList.contains('common-gear-building-modal')&&!modal.classList.contains('bailey-modal')&&modal.dataset.commonGearBuildingId===${JSON.stringify(key)}`));
          // The existing equipment screen has its own independent scrolling design.
          await evaluate("document.querySelector('[data-gear-back]').click()");
          assert(await evaluate(`modal.classList.contains('bailey-modal')&&innerCastleSelectedBuildingKey===${JSON.stringify(key)}&&!state.gear.newMarkers[${JSON.stringify(key)}]`));
        }else assert.equal(data.status,'Not yet available');
        report.push({width,height,key,...data});
      }
      if(height>550){await click('.bailey-directory [data-inner-castle-building="treasury"]');assert.equal(await evaluate('innerCastleSelectedBuildingKey'),'treasury');}
    }
    // Return to the inspected owned city and restore keyboard focus.
    await evaluate(`showCityInfoModal(getMainCityReference().id);document.querySelector('#enterInnerCastleBtn').click()`);
    await click('[data-inner-castle-back]');
    assert(await evaluate("modal.dataset.cityInfoId===getMainCityReference().id&&!modal.classList.contains('bailey-modal')&&document.activeElement.id==='enterInnerCastleBtn'"));
    await evaluate('openInnerCastle(getMainCityReference().id)'); await click('#closeModalBtn');
    await wait("!modal.open&&!modal.classList.contains('bailey-modal')&&!modal.dataset.innerCastleCityId");
    // Entry guard is unchanged for regular, foreign, neutral, and stronghold cities.
    assert(await evaluate(`(()=>{const city=getMainCityReference();return canEnterInnerCastle(city)&&!canEnterInnerCastle(null)&&!canEnterInnerCastle({...city,owner:'enemy'})&&!canEnterInnerCastle({...city,owner:'neutral'})&&!canEnterInnerCastle({...city,id:'not-main-city',isMainCity:false,mainCity:false});})()`));
    // Exercise Profile's cached Main City path while that city is absent from the loaded region.
    assert(await evaluate(`(()=>{
      const cities=state.cities, cache=onlineOwnedCitiesCache, main={...getMainCityReference()};
      try {
        onlineOwnedCitiesCache=[...cache,main];state.cities=cities.filter(city=>city.id!==main.id);
        if(cityById(main.id))throw Error('Off-map fixture still has the Main City loaded');
        openProfileInnerCastle();
        return modal.open&&modal.classList.contains('bailey-modal')&&modal.dataset.innerCastleCityId===main.id;
      } finally {state.cities=cities;onlineOwnedCitiesCache=cache;}
    })()`));
    const ax=await client.send('Accessibility.getFullAXTree');
    assert(ax.nodes.some(node=>node.role?.value==='dialog'&&node.name?.value==='Wyvernmarket Mead — Inner Castle'),'Dialog must retain its accessible name');
    // Use real keyboard input to select another building and dismiss the shared modal.
    await evaluate(`document.querySelector('.bailey-pin[data-inner-castle-building="barracks"]').focus()`);
    assert.equal(await evaluate('document.activeElement.dataset.innerCastleBuilding'),'barracks');
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert.equal(await evaluate('innerCastleSelectedBuildingKey'),'barracks');
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await wait("!modal.open&&!modal.classList.contains('bailey-modal')");
    assert.equal(errors.length,0,JSON.stringify(errors));
    fs.writeFileSync(path.join(out,'integration.json'),JSON.stringify({states:report,errors},null,2));
    console.log('PASS: actual game runtime, 36 building states across six desktop/landscape sizes, 36 scene pointer selections with fixed anchors, 24 gear round trips, desktop directory, Back/focus restoration, Close cleanup, ownership guard, off-map Profile entry, dialog accessible name, keyboard selection/Escape, sign contrast, no detail scrolling or browser exceptions.');
  } finally {
    if(client)await client.send('Browser.close').catch(()=>{});
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
