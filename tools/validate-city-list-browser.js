"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/city-list-ledger");

async function main() {
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(browser, "Set CHROME_PATH to a Chromium browser.");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer();
  const address = await server.listen();
  let session, client;
  const errors = [], results = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const screenshot = async name => {
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, `${name}.png`), Buffer.from(shot.data, "base64"));
    };
    for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }, { name: "landscape", width: 844, height: 390 }, { name: "short", width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      for (let i = 0; i < 480 && !await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"); i++) await wait(250);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"), "ready");
      // Every state/network substitution below is confined to the isolated fixture.
      await evaluate(`(async () => {
        window.__CROWNLANDS_BENCHMARK__.closeModal();
        window.clQaCity=state.cities.find(c=>c.owner==='player'&&!isStronghold(c));
        clQaCity.name='Wyvernmarket Mead';clQaCity.level=24;clQaCity.troops=18240;
        state.gold=500000;
        await refreshAllOwnedCities(true);
        showCityListModal();
        await refreshAllOwnedCities(true);
        renderCityListModal();toast.classList.remove('visible');
      })()`);
      await wait(300);
      await screenshot(`runtime-${viewport.name}`);
      const layout = await evaluate(`(() => {
        const r=modal.getBoundingClientRect(), rows=modalBody.querySelector('.city-list-rows'),footer=modalBody.querySelector('.cll-footer').getBoundingClientRect();
        return {bounds:{x:r.x,y:r.y,width:r.width,height:r.height}, overflow:modalBody.scrollWidth>modalBody.clientWidth+1||rows.scrollWidth>rows.clientWidth+1, footerVisible:footer.top>=r.top&&footer.bottom<=r.bottom+1, rowHeight:rows.clientHeight, targets:[...modalBody.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height), art:[...rows.querySelectorAll('img')].every(i=>i.naturalWidth>0), paper:getComputedStyle(modal).backgroundColor, count:rows.children.length};
      })()`);
      assert(layout.bounds.x >= 0 && layout.bounds.y >= 0 && layout.bounds.height <= viewport.height, JSON.stringify(layout));
      assert(!layout.overflow && layout.footerVisible && layout.rowHeight >= 80 && layout.targets.every(n => n >= 44) && layout.art, JSON.stringify(layout));
      assert.equal(layout.paper, "rgb(242, 232, 205)");
      assert.equal(Math.round(layout.bounds.width), Math.min(1040, viewport.width - 24));
      assert.equal(layout.count, 5, "The ledger must retain five holdings per page.");
      await evaluate(`(() => {
        window.clQaRows=modalBody.querySelector('.city-list-rows');
        window.clQaOrder=[...clQaRows.children].map(r=>r.dataset.cityListRowKey).join(',');
        window.clQaRow=[...clQaRows.children].find(r=>r.dataset.cityListRowKey===getCityListRowKey(clQaCity));
        if(!clQaRow)throw Error('Fixture main city missing from first page');
        window.clQaProduction=clQaRow.querySelector('.cll-production').textContent;
        if(!clQaProduction.includes(cityDetailsNumber(getCityStats(clQaCity).goldProductionPerHour)))throw Error('Production differs from confirmed stats');
        if(clQaRow.querySelector('.cll-garrison strong').textContent!=='18,240')throw Error('Garrison must be exact');
        const options=getCityUpgradeOptionState(clQaCity).options;
        [...clQaRow.querySelectorAll('.city-list-upgrade')].forEach((b,i)=>{if(Number.isFinite(options[i].cost)&&b.querySelector('small').textContent!==cityDetailsNumber(options[i].cost)+'g')throw Error('Displayed cost differs from real option');});
        window.clQaAuthority=usesServerEconomyAuthority;window.clQaModes=supportsAuthoritativeCityUpgradeModes;window.clQaSchedule=scheduleInstantEconomyFlush;
        usesServerEconomyAuthority=()=>true;supportsAuthoritativeCityUpgradeModes=()=>true;scheduleInstantEconomyFlush=()=>{};
        window.clQaCost=getMultiLevelCost(clQaCity,5);window.clQaGold=Math.floor(state.gold);
        clQaRows.scrollTop=60;window.clQaScroll=clQaRows.scrollTop;
        const plus5=clQaRow.querySelector('[data-city-upgrade-levels="5"]');plus5.focus({preventScroll:true});plus5.click();
        patchCityListUpgradeRows(new Set([getCityListRowKey(clQaCity)]));
        if(getPendingCityUpgradeCount(clQaCity)!==5||getProjectedGold()!==clQaGold-clQaCost||clQaCity.level!==24)throw Error('Exact +5 lost projection');
        if(document.activeElement.dataset.cityUpgradeLevels!=='5'||document.activeElement.disabled)throw Error('Focus or rapid +5 input lost');
        document.activeElement.click();patchCityListUpgradeRows(new Set([getCityListRowKey(clQaCity)]));
        if(getPendingCityUpgradeCount(clQaCity)!==10||!clQaRows.firstElementChild.querySelector('.cll-level').textContent.includes('34'))throw Error('Repeated +5 lost projected level');
        if(modalBody.querySelector('[data-city-list-gold]').textContent!==cityDetailsNumber(getProjectedGold()))throw Error('Treasury is stale');
        if(clQaRows.firstElementChild.querySelector('.cll-production').textContent!==clQaProduction)throw Error('Unconfirmed production was presented as settled');
        if([...clQaRows.children].map(r=>r.dataset.cityListRowKey).join(',')!==clQaOrder||clQaRows.scrollTop!==clQaScroll)throw Error('Projection reordered or scrolled the roster');
        renderCityListModal();clQaRows=modalBody.querySelector('.city-list-rows');
        if(document.activeElement.dataset.cityUpgradeLevels!=='5'||clQaRows.scrollTop!==clQaScroll||[...clQaRows.children].map(r=>r.dataset.cityListRowKey).join(',')!==clQaOrder)throw Error('Roster refresh lost focus, scroll, or order');
      })()`);
      await screenshot(`runtime-pending-${viewport.name}`);
      await evaluate(`(async () => {
        const action=instantEconomyActions[0],execute=executeInstantEconomyAction,refresh=refreshInstantEconomyAfterFailure;
        executeInstantEconomyAction=async()=>{throw Error('Controlled city upgrade rejection');};
        refreshInstantEconomyAfterFailure=async()=>{
          instantEconomySyncRecovery={generation:instantEconomyGeneration,actionKey:action.key};patchCityListUpgradeRows(new Set([action.key]));
          if([...modalBody.querySelectorAll('.city-list-upgrade')].some(b=>!b.disabled)||!modalBody.querySelector('.city-list-upgrade').title.includes('Refreshing confirmed'))throw Error('Recovery left spend controls active');
          if(modalBody.querySelector('[data-city-list-gold]').textContent!=='Syncing…')throw Error('Recovery presented an unconfirmed balance');
          instantEconomySyncRecovery=null;return true;
        };
        try {await flushInstantEconomyActions();}finally {executeInstantEconomyAction=execute;refreshInstantEconomyAfterFailure=refresh;}
        patchCityListUpgradeRows();
        if(getPendingCityUpgradeCount(clQaCity)!==0||!clQaRows.firstElementChild.querySelector('.cll-level').textContent.includes('24'))throw Error('Rejected actions did not roll back');
        if(clQaRows.scrollTop!==clQaScroll)throw Error('Recovery scrolled the roster');
        state.gold=1;
        const stable=clQaRows.firstElementChild;
        patchCityListUpgradeRows(new Set(['off-page:city']));
        if(modalBody.querySelector('[data-city-list-gold]').textContent!=='1'||[...modalBody.querySelectorAll('.city-list-upgrade')].some(b=>!b.disabled)||clQaRows.firstElementChild!==stable)throw Error('Off-page Gold update left stale affordability or rebuilt unaffected rows');
        state.gold=clQaGold;patchCityListUpgradeRows();
        const max=clQaRows.firstElementChild.querySelector('[data-city-upgrade-mode="max"]');
        if(Number(max.dataset.cityUpgradeLevels)!==getCityUpgradeOptionState(clQaCity).options[2].levels)throw Error('MAX lost real affordability');
        const blockers=getIncomingUpgradeBlockers;getIncomingUpgradeBlockers=()=>[{remaining:60}];
        try {patchCityListUpgradeRows();if([...clQaRows.querySelectorAll('.city-list-upgrade')].some(b=>!b.disabled)||!clQaRows.textContent.includes('Incoming'))throw Error('Incoming blocker missing');}finally {getIncomingUpgradeBlockers=blockers;}
        usesServerEconomyAuthority=clQaAuthority;supportsAuthoritativeCityUpgradeModes=clQaModes;scheduleInstantEconomyFlush=clQaSchedule;
        clQaCity.level=29;setCityListUpgradeFeedback({cityId:clQaCity.id,regionId:getCityRegionId(clQaCity),startingLevel:24,finalLevel:29,upgraded:5});patchCityListUpgradeRows();
        if(!clQaRows.firstElementChild.querySelector('[role="status"]')?.textContent.includes('29'))throw Error('Authoritative receipt missing');
        modalBody.querySelector('[data-city-list-page="next"]').click();
        if(cityListPage!==1)throw Error('Next page failed');
        const pageKeys=[...modalBody.querySelectorAll('[data-city-list-row-key]')].map(r=>r.dataset.cityListRowKey).join(',');
        patchCityListUpgradeRows(new Set([getCityListRowKey(clQaCity)]));renderCityListModal();
        if(cityListPage!==1||[...modalBody.querySelectorAll('[data-city-list-row-key]')].map(r=>r.dataset.cityListRowKey).join(',')!==pageKeys)throw Error('Off-page settlement moved pagination');
        modalBody.querySelector('[data-city-list-sort="troops"]').click();
        if(cityListPage!==0||cityListSortKey!=='troops')throw Error('Explicit sort failed');
      })()`);
      const states = await evaluate(`(() => {
        const roster=getAllOwnedCitiesForDisplay,online=isOnlineWorldActive,refresh=refreshAllOwnedCities;
        const saved=[onlineOwnedCitiesCacheComplete,onlineOwnedCitiesRefreshError,onlineOwnedCitiesRefreshInFlight];
        isOnlineWorldActive=()=>true;onlineOwnedCitiesCacheComplete=false;onlineOwnedCitiesRefreshError='Controlled roster failure';onlineOwnedCitiesRefreshInFlight=false;
        renderCityListModal();
        if(!modalBody.querySelector('[role="alert"]')||!modalBody.querySelector('[data-city-list-sync-retry]'))throw Error('Incomplete roster not disclosed');
        let retried=false;refreshAllOwnedCities=()=>{retried=true;onlineOwnedCitiesRefreshInFlight=true;return Promise.resolve(false);};
        modalBody.querySelector('[data-city-list-sync-retry]').click();
        if(!retried||!modalBody.textContent.includes('Syncing full city roster...'))throw Error('Retry did not sync');
        getAllOwnedCitiesForDisplay=()=>[];renderCityListModal();
        if(!modalBody.textContent.includes('Waiting for your roster')||modalBody.textContent.includes('No cities owned yet'))throw Error('Unloaded roster presented as empty ownership');
        onlineOwnedCitiesCacheComplete=true;onlineOwnedCitiesRefreshInFlight=false;onlineOwnedCitiesRefreshError='';renderCityListModal();
        if(!modalBody.textContent.includes('No cities owned yet'))throw Error('Empty roster missing');
        const sh={...clQaCity,kind:'stronghold'};const holder=document.createElement('div');holder.innerHTML=renderCityListRow(sh);
        if(holder.querySelector('.city-list-upgrade')||!holder.querySelector('.cll-production').textContent.includes('Owner bonus'))throw Error('Stronghold received regular upgrades');
        getAllOwnedCitiesForDisplay=roster;isOnlineWorldActive=online;refreshAllOwnedCities=refresh;
        [onlineOwnedCitiesCacheComplete,onlineOwnedCitiesRefreshError,onlineOwnedCitiesRefreshInFlight]=saved;
        renderCityListModal();return {incomplete:true,retry:true,empty:true,stronghold:true};
      })()`);
      const navigation = await evaluate(`(async () => {
        const city=getAllOwnedCitiesForDisplay().find(c=>getCityRegionId(c)!==getActiveMapRegionId());
        if(!city)throw Error('Fixture needs an off-map holding');
        await openCityListInfo(city.id,getCityRegionId(city));
        if(getActiveMapRegionId()!==getCityRegionId(city)||modal.dataset.cityInfoId!==city.id)throw Error('Off-map info navigation failed');
        for(let i=0;i<50&&isMapInteractionBlocked();i++)await new Promise(resolve=>setTimeout(resolve,100));
        await focusCityListLocation(clQaCity.id,getCityRegionId(clQaCity));
        if(getActiveMapRegionId()!==getCityRegionId(clQaCity)||modal.open)throw Error('Locate did not navigate back: '+JSON.stringify({active:getActiveMapRegionId(),target:getCityRegionId(clQaCity),open:modal.open,blocked:isMapInteractionBlocked()}));
        showCityInfoModal(clQaCity.id);
        const sample=()=>[modal,modalTitle,modalBody].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return [s.backgroundColor,s.color,r.width,r.height];});
        const before=sample(),sheet=[...document.styleSheets].find(s=>s.href?.includes('/city-list-ui.css'));sheet.disabled=true;
        const after=sample();sheet.disabled=false;
        if(JSON.stringify(before)!==JSON.stringify(after))throw Error('City List styling leaked into City Details');
        return {offMapInfo:true,locate:true,isolated:true};
      })()`);
      results.push({ viewport: viewport.name, layout, states, navigation });
      console.log(JSON.stringify(results.at(-1)));
    }
    assert.deepEqual(errors, [], "Uncaught errors occurred in City List.");
    fs.writeFileSync(path.join(artifacts, "runtime-browser-validation.json"), JSON.stringify({ results, errors }, null, 2));
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
