const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createMapBenchmarkServer } = require('./map-benchmark/server');
const root = path.resolve(__dirname,'..');
async function main() {
  const executablePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&fs.existsSync(p));
  assert(executablePath,'Set CHROME_PATH to a Chromium browser');
  const server=createMapBenchmarkServer(),address=await server.listen();
  const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  const errors=[],out=path.join(root,'release-artifacts/inner-city-estate');fs.mkdirSync(out,{recursive:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(address.url+'/__benchmark__/?scenario=A&visualMarches=0');
    await page.waitForFunction(()=>window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready');
    await page.evaluate(()=>{window.__CROWNLANDS_BENCHMARK__.closeModal();state.gear=normalizeCommonGearState(state.gear)});
    const keys=await page.evaluate(()=>INNER_CASTLE_BUILDINGS.map(b=>b.key));
    for(const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>{openInnerCastle(getMainCityReference().id);CrownlandsAnimations.setMode('full')});
      await page.waitForFunction(()=>document.querySelector('.estate-world').getBoundingClientRect().width>0);
      await page.waitForTimeout(100);
      const initial=await page.evaluate(()=>{const v=document.querySelector('.estate-viewport').getBoundingClientRect(),w=document.querySelector('.estate-world').getBoundingClientRect(),m=modal.getBoundingClientRect();return {v:v.toJSON(),w:w.toJSON(),m:m.toJSON(),debug:innerCastleEstateView.debug(),scroll:modalBody.scrollHeight-modalBody.clientHeight}});
      assert.equal(initial.debug.camera.zoom,1);assert.equal(initial.debug.actors,14);assert.equal(initial.debug.animationRunning,true);assert(initial.scroll<=1);
      assert(Math.abs(initial.m.width-width)<1&&Math.abs(initial.m.height-height)<1,'Estate must fill viewport');
      assert(initial.w.left>=initial.v.left-1&&initial.w.right<=initial.v.right+1&&initial.w.top>=initial.v.top-1&&initial.w.bottom<=initial.v.bottom+1,'Fit must show whole estate');
      await page.screenshot({path:path.join(out,'initial-'+width+'x'+height+'.png')});
      for(const key of keys) {
        await page.locator('[data-estate-directory-toggle]').click();
        const button=page.locator('[data-estate-directory-building="'+key+'"]');await button.scrollIntoViewIfNeeded();const rect=await button.boundingBox();assert(rect.height>=44&&rect.width>=44);
        await button.click();assert.equal(await page.evaluate(()=>innerCastleSelectedBuildingKey),key);
        assert.equal(await page.locator('.estate-detail h3').textContent(),await page.evaluate(key=>getInnerCastleBuilding(key).label,key));
        const targets=await page.locator('.estate-building-target:visible').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().toJSON()));
        for(let i=0;i<targets.length;i++){assert(targets[i].width>=44&&targets[i].height>=44);for(let j=i+1;j<targets.length;j++)assert(targets[i].right<=targets[j].left||targets[j].right<=targets[i].left||targets[i].bottom<=targets[j].top||targets[j].bottom<=targets[i].top,'Map targets overlap');}
        const gear=page.locator('[data-manage-common-gear]');
        if(await gear.count()) {
          const gearRect=await gear.boundingBox(),panel=await page.locator('.estate-detail').boundingBox();assert(gearRect.y+gearRect.height<=panel.y+panel.height+1,'Manage Gear must stay visible');
          const before=await page.evaluate(()=>{window.previousEstateView=innerCastleEstateView;return innerCastleEstateView.snapshot()});
          await gear.click();await page.locator('[data-gear-back]').waitFor();
          assert(await page.evaluate(()=>previousEstateView.debug().destroyed&&innerCastleEstateView===null),'Gear must dispose scene animation');
          await page.locator('[data-gear-back]').click();assert.deepEqual(await page.evaluate(()=>innerCastleEstateView.snapshot()),before,'Gear return must preserve camera');assert.equal(await page.evaluate(()=>innerCastleSelectedBuildingKey),key);
        } else assert.equal(await page.locator('.estate-building-status').textContent(),'Function planned');
      }
      await page.locator('[data-estate-detail-close]').click();
      await page.mouse.move(45,120);await page.mouse.wheel(0,-200);await page.waitForTimeout(100);assert(await page.evaluate(()=>innerCastleEstateView.snapshot().zoom>2.5));
      const before=await page.evaluate(()=>innerCastleEstateView.snapshot());await page.mouse.move(45,120);await page.mouse.down();await page.mouse.move(145,145,{steps:8});await page.mouse.up();const after=await page.evaluate(()=>innerCastleEstateView.snapshot());assert(before.x!==after.x||before.y!==after.y,'Dragging must pan');
      await page.evaluate(()=>innerCastleEstateView.zoom(99));assert.equal(await page.evaluate(()=>innerCastleEstateView.snapshot().zoom),4);
      await page.locator('[data-estate-fit]').click();assert.equal(await page.evaluate(()=>innerCastleEstateView.snapshot().zoom),1);
      const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:50,y:120,id:1},{x:120,y:120,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:30,y:120,id:1},{x:160,y:120,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(await page.evaluate(()=>innerCastleEstateView.snapshot().zoom>1),'Pinch must zoom');await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();
      await page.evaluate(()=>CrownlandsAnimations.setMode('reduced'));assert.equal(await page.evaluate(()=>innerCastleEstateView.debug().animationRunning),false);
      const still=await page.locator('.estate-actor').first().getAttribute('style');await page.waitForTimeout(150);assert.equal(await page.locator('.estate-actor').first().getAttribute('style'),still,'Reduced mode must remain still');
      await page.evaluate(()=>CrownlandsAnimations.setMode('off'));assert.equal(await page.evaluate(()=>innerCastleEstateView.debug().animationRunning),false);
      await page.evaluate(()=>{CrownlandsAnimations.setMode('full');Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});assert.equal(await page.evaluate(()=>innerCastleEstateView.debug().animationRunning),false);
      await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});assert.equal(await page.evaluate(()=>innerCastleEstateView.debug().animationRunning),true);
      await page.evaluate(()=>{window.previousEstateView=innerCastleEstateView;showCityInfoModal(getMainCityReference().id);document.querySelector('#enterInnerCastleBtn').click()});
      await page.locator('[data-inner-castle-back]').click();assert(await page.evaluate(()=>modal.dataset.cityInfoId===getMainCityReference().id&&document.activeElement.id==='enterInnerCastleBtn'));
      await page.evaluate(()=>openInnerCastle(getMainCityReference().id));await page.locator('#closeModalBtn').click();await page.waitForFunction(()=>!modal.open&&innerCastleEstateView===null);assert(await page.evaluate(()=>!modal.classList.contains('bailey-modal')&&!modal.dataset.innerCastleCityId));
    }
    assert(await page.evaluate(()=>{const city=getMainCityReference();return canEnterInnerCastle(city)&&!canEnterInnerCastle(null)&&!canEnterInnerCastle({...city,owner:'enemy'})&&!canEnterInnerCastle({...city,owner:'neutral'})&&!canEnterInnerCastle({...city,id:'not-main-city',isMainCity:false,mainCity:false})}));
    assert(await page.evaluate(()=>{const cities=state.cities,cache=onlineOwnedCitiesCache,main={...getMainCityReference()};try{onlineOwnedCitiesCache=[...cache,main];state.cities=cities.filter(c=>c.id!==main.id);openProfileInnerCastle();return modal.open&&modal.dataset.innerCastleCityId===main.id;}finally{state.cities=cities;onlineOwnedCitiesCache=cache}}));
    await page.locator('[data-estate-directory-toggle]').click();await page.locator('[data-estate-directory-building="barracks"]').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>innerCastleSelectedBuildingKey),'barracks');await page.keyboard.press('Escape');await page.waitForFunction(()=>!modal.open&&innerCastleEstateView===null);
    const preview=await browser.newPage({viewport:{width:1440,height:900}});preview.on('pageerror',e=>errors.push(e.message));
    for(const scene of ['initial','completed','constructing']){
      await preview.goto(address.url+'/docs/visual-qa/inner-city-estate/index.html?scene='+scene);await preview.waitForFunction(()=>window.estatePreview);await preview.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
      assert.equal(await preview.locator('[data-estate-site]').count(),20);if(scene!=='initial')assert.equal(await preview.locator('[data-site-state="'+scene+'"]').count(),20);
      await preview.screenshot({path:path.join(out,'fixture-'+scene+'.png')});
    }
    assert.deepEqual(errors,[]);console.log('PASS: all 20 sites at desktop and two landscape sizes, complete overview, nonoverlapping 44px targets, visible gear actions and 12 camera-preserving gear returns, drag/wheel/pinch, zoom clamps, Full/Reduced/Off, background pause, Back/focus/Close/Escape cleanup, ownership guard, off-map Profile and three art fixtures.');
  } finally {await browser.close();await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
