"use strict";
// Real renderers with isolated benchmark data. No production account or writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { installBagFixture } = require("./validate-item-bag-browser");
const dailyModel = require("../functions/dailyLoginRewards");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to a Chromium browser.");
  const server = createMapBenchmarkServer();
  const address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/ui-refresh");
  fs.mkdirSync(artifacts, { recursive: true });
  let session, client;
  const errors = [], results = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 500; i++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error(`Timed out: ${expression}`);
    };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'");
      await evaluate(`(async () => {
        __CROWNLANDS_BENCHMARK__.closeModal();
        await Promise.all(['clan','treasury','bag'].map(loadOptionalUiStyle));
        refreshClanState=async()=>{};
        updateEconomy=()=>{};
        state.character.level=76; state.clanId=''; clanSnapshot=null; clanSearchResults=[]; clanUiLoading=false;
        profileScreen.classList.add('open'); showProfileClan();
        activeClanBrowserSection='create'; renderClanView();
      })()`);
      await wait("!!clanContent.querySelector('[data-clan-form=\"create\"]')");
      const clanDraft = await evaluate(`(() => {
        const form=clanContent.querySelector('[data-clan-form="create"]');
        form.elements.name.value='Northern Watch'; form.elements.tag.value='NTH';
        form.elements.description.value='An unfinished clan description'; form.elements.admissionMode.value='open';
        const search=clanContent.querySelector('[name="search"]'); search.value='Alder';
        form.elements.name.focus(); form.elements.name.setSelectionRange(3,8);
        const scroller=clanContent.querySelector('#clanBrowserCreatePanel'); scroller.scrollTop=120;
        const before=scroller.scrollTop;
        clanUiLoading=true; renderClanView(); clanUiLoading=false; renderClanView();
        const updated=clanContent.querySelector('[data-clan-form="create"]');
        return { name:updated.elements.name.value, tag:updated.elements.tag.value, description:updated.elements.description.value,
          mode:updated.elements.admissionMode.value, search:clanContent.querySelector('[name="search"]').value,
          focused:document.activeElement===updated.elements.name, selection:[updated.elements.name.selectionStart,updated.elements.name.selectionEnd],
          scroll:clanContent.querySelector('#clanBrowserCreatePanel').scrollTop===before };
      })()`);
      assert.deepEqual(clanDraft, { name:"Northern Watch", tag:"NTH", description:"An unfinished clan description", mode:"open", search:"Alder", focused:true, selection:[3,8], scroll:true });
      await evaluate(`(() => {const script=document.createElement('script');script.src='docs/visual-qa/clan-overview/runtime-fixture.js';document.body.append(script);})()`);
      await wait("document.documentElement.dataset.clanRuntimeReady === 'true'");
      const clanMembers = await evaluate(`(() => {
        activeClanMobileSection='members'; renderClanView();
        const member=clanContent.querySelectorAll('[data-clan-action="select-member"]')[4];member.focus({preventScroll:true});
        const roster=clanContent.querySelector('.clan-roster'); roster.scrollTop=200;
        const before=roster.scrollTop;
        renderClanView();
        if(!before || clanContent.querySelector('.clan-roster').scrollTop!==before || document.activeElement.dataset.memberId!==member.dataset.memberId)throw Error('Clan roster lost scroll or focused member');
        activeClanMobileSection='rewards'; activeClanRewardSection='gifts'; renderClanView();
        const activity=[...clanContent.querySelectorAll('.scroll-region,.activity-scroll')].find(element=>element.getClientRects().length && element.scrollHeight>element.clientHeight);
        if(!activity)throw Error('Expected a scrolling clan rewards ledger');activity.scrollTop=100;
        const activityClass=activity.className;
        const previous=activity.scrollTop; renderClanView();
        if([...clanContent.querySelectorAll('.scroll-region,.activity-scroll')].find(element=>element.className===activityClass && element.getClientRects().length).scrollTop!==previous)throw Error('Clan gift activity lost scroll');
        state.clanId=''; clanSnapshot=null; renderClanView();
        if(clanContent.querySelector('[name="name"]').value!=='')throw Error('Clan browser leaked a prior clan/session draft');
        profileScreen.classList.remove('open');
        return {roster:before,activity:previous};
      })()`);
      await evaluate(`(() => {
        window.refreshQaHolding=state.cities.find(isStronghold)||state.cities.find(city=>city.owner!=='player');
        refreshQaHolding.kind='stronghold';
        showCityInfoModal(refreshQaHolding.id);
      })()`);
      await delay(100);
      const holdings = await evaluate(`(() => {
        const tab=modalBody.querySelector('[data-stronghold-info-tab="legacy"]'); tab.click(); tab.focus();
        refreshClanRelationshipPresentation();
        if(modalBody.querySelector('[aria-selected="true"]').id!==tab.id || document.activeElement.id!==tab.id)throw Error('Stronghold refresh reset tab/focus');
        modalBody.querySelector('[data-stronghold-info-tab="overview"]').click();
        modalBody.querySelectorAll('.detail-fold').forEach(fold=>fold.open=true);
        const scroll=modalBody.querySelector('.details-column');scroll.scrollTop=90;const before=scroll.scrollTop;
        showCityInfoModal(refreshQaHolding.id);
        if([...modalBody.querySelectorAll('.detail-fold')].some(fold=>!fold.open)||modalBody.querySelector('.details-column').scrollTop!==before)throw Error('Stronghold refresh collapsed details or moved scroll');
        const citadel={...refreshQaHolding,id:CROWN_CITADEL_ID};showCrownCitadelInfoModal(citadel);
        modalBody.querySelector('[data-citadel-info-tab="reigns"]').click();
        showCrownCitadelInfoModal(citadel);
        if(modalBody.querySelector('[aria-selected="true"]').dataset.citadelInfoTab!=='reigns')throw Error('Citadel refresh reset tab');
        showCityInfoModal(refreshQaHolding.id);
        if(modalBody.querySelector('[aria-selected="true"]').dataset.strongholdInfoTab!=='overview')throw Error('Holding state leaked to another target');
        modal.close();return {scroll:before};
      })()`);
      await evaluate(`(${installBagFixture.toString()})()`);
      await wait("!!modalBody.querySelector('.ib-bag-shell')");
      await delay(100);
      const bag = await evaluate(`(() => {
        const longItem=SHOP_ITEMS.find(item=>item.id===WAR_DRUMS_ITEM_ID);
        longItem.description+=' Long fixture description to exercise overflow.'.repeat(60);
        selectedInventoryItemId=longItem.id;selectedInventoryEntryKey=longItem.id;showInventoryModal();
        const selected=selectedInventoryEntryKey;
        const detail=modalBody.querySelector('.ib-selection-scroll');detail.scrollTop=100;
        detail.focus({preventScroll:true});const before=detail.scrollTop;
        state.shopItems[WAR_DRUMS_ITEM_ID]+=1;showInventoryModal();
        if(!before || selectedInventoryEntryKey!==selected || modalBody.querySelector('.ib-selection-scroll').scrollTop!==before || document.activeElement!==modalBody.querySelector('.ib-selection-scroll'))throw Error('Item Bag refresh lost selection, scroll or focus');
        // Synthetic definitions exercise real pagination without changing shipped items.
        const base=SHOP_ITEMS[0];
        for(let i=0;i<10;i++){const id='refresh-qa-'+i;SHOP_ITEMS.push({...base,id,label:'Refresh fixture '+i});state.shopItems[id]=3;}
        showInventoryModal();setInventoryPage(1);const entry=getInventoryPageModel().entries[0];
        selectedInventoryItemId=entry.id;selectedInventoryEntryKey=entry.entryKey;showInventoryModal();
        state.shopItems[WAR_DRUMS_ITEM_ID]+=1;showInventoryModal();
        if(selectedInventoryPage!==1 || selectedInventoryEntryKey!==entry.entryKey)throw Error('Unrelated inventory refresh changed page');
        // A removed final page must still clamp to a valid page.
        for(let i=0;i<10;i++)state.shopItems['refresh-qa-'+i]=0;
        showInventoryModal();if(selectedInventoryPage!==0)throw Error('Removed inventory page was retained');
        modal.close();return {scroll:before,pagePreserved:true,removedPageClamped:true};
      })()`);
      const gear = [];
      for (const building of ["treasury", "barracks", "gatehouse", "royal-stables"]) {
        await evaluate(`(() => {
          const building=${JSON.stringify(building)};
          state.gear=COMMON_GEAR.createDefaultState();
          for(const slot of COMMON_GEAR.SLOTS){
            const definition=COMMON_GEAR.DEFINITIONS.find(item=>item.buildingId===building&&item.slot===slot&&item.rarity==='common');
            const id='refresh-gear-'+slot;
            state.gear.instances[id]=COMMON_GEAR.normalizeInstance({instanceId:id,gearKey:definition.gearKey,level:2});
            state.gear.equipped[building][slot]=id;
          }
          showCommonGearBuilding(building);if(!modal.open)modal.showModal();
        })()`);
        await wait("!!modalBody.querySelector('[data-gear-panel=\"details\"]') && !modalBody.querySelector('.optional-ui-loading')");
        await delay(100);
        gear.push(await evaluate(`(() => {
          const details=modalBody.querySelector('[data-gear-panel="details"]');
          details.focus({preventScroll:true});details.scrollTop=110;const before=details.scrollTop;
          const selected=selectedCommonGearInstanceId;
          renderCommonGearBuilding(${JSON.stringify(building)});
          if(selectedCommonGearInstanceId!==selected || modalBody.querySelector('[data-gear-panel="details"]').scrollTop!==before || document.activeElement!==modalBody.querySelector('[data-gear-panel="details"]'))throw Error('Gear refresh lost selection, focus or details scroll');
          modal.close();return {building:${JSON.stringify(building)},scroll:before};
        })()`));
      }
      const dailyStatus = dailyModel.status(dailyModel.sync({}).state);
      await evaluate(`(() => {
        dailyLoginRewardStatus=normalizeDailyLoginRewardStatus(${JSON.stringify(dailyStatus)});
        dailyLoginRewardStatusLoading=false;dailyLoginRewardClaimInFlight=false;
        modal.className='modal daily-login-reward-modal';modal.showModal();
        activeDailyRewardModalTab='rewards';renderDailyLoginRewardModal();
      })()`);
      await wait("!!modalBody.querySelector('.daily-shell')");
      await delay(100);
      const daily = await evaluate(`(() => {
        modalBody.querySelector('[data-week="3"]').click();
        const day=modalBody.querySelector('[data-day][aria-pressed="true"]').dataset.day;
        modalBody.querySelector('[data-week="3"]').focus({preventScroll:true});
        const scroll=modalBody.querySelector('#detailScroll');scroll.scrollTop=100;const before=scroll.scrollTop;
        renderDailyLoginRewardModal();
        if(modalBody.querySelector('[data-day][aria-pressed="true"]').dataset.day!==day || document.activeElement.dataset.week!=='3' || modalBody.querySelector('#detailScroll').scrollTop!==before)throw Error('Daily Login refresh lost week, focus or scroll');
        dailyLoginRewardStatus={...dailyLoginRewardStatus,cycleId:'new-fixture-cycle',nextDay:1};renderDailyLoginRewardModal();
        if(modalBody.querySelector('[data-day][aria-pressed="true"]').dataset.day!=='1')throw Error('Daily selection leaked to a new reward cycle');
        modal.close();return {day,scroll:before,newCycleReset:true};
      })()`);
      results.push({width,height,clanDraft,clanMembers,holdings,bag,gear,daily});
      console.log(JSON.stringify(results.at(-1)));
    }
    assert.deepEqual(errors, [], "Unexpected browser errors");
    fs.writeFileSync(path.join(artifacts,"validation.json"),JSON.stringify({results,errors},null,2));
  } finally {
    if(client)await client.send("Browser.close").catch(()=>{});
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
