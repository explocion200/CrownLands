"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/city-details");

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
    for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }, { name: "narrow", width: 320, height: 740 }, { name: "landscape", width: 844, height: 390 }, { name: "short", width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      for (let i = 0; i < 480 && !await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"); i++) await wait(250);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"), "ready");
      // All state and network substitutions are confined to this isolated fixture.
      await evaluate(`(() => {
        window.__CROWNLANDS_BENCHMARK__.closeModal();
        window.cdQaCity = state.cities.find(c => c.owner === 'player' && !isStronghold(c));
        cdQaCity.name='Wyvernmarket Mead'; cdQaCity.level=24; cdQaCity.troops=18240; cdQaCity.troopFloat=18240;
        state.gold=500000;
        showCityInfoModal(cdQaCity.id);
        toast.classList.remove('visible');
      })()`);
      await wait(250);
      const selectedPoint = await evaluate(`(() => {const r=modalBody.querySelector('[aria-pressed="true"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...selectedPoint });
      assert.equal(await evaluate("getComputedStyle(modalBody.querySelector('[aria-pressed=\"true\"]')).backgroundColor"), "rgb(102, 92, 62)", "Hover must retain the selected amount's contrast.");
      await screenshot(`ready-${viewport.name}`);
      const layout = await evaluate(`(() => {
        const r=modal.getBoundingClientRect(), ledger=modalBody.querySelector('.cd-ledger');
        const footer=modalBody.querySelector('.cd-actions').getBoundingClientRect();
        const buttons=[...modalBody.querySelectorAll('.cd-actions button')];
        return { bounds:{x:r.x,y:r.y,width:r.width,height:r.height}, overflow:modalBody.scrollWidth>modalBody.clientWidth+1||ledger.scrollWidth>ledger.clientWidth+1, footerVisible:footer.top>=r.top&&footer.bottom<=r.bottom+1, targets:buttons.map(b=>b.getBoundingClientRect().height), paper:getComputedStyle(modal).backgroundColor, art:modalBody.querySelector('[data-cd-art]').naturalWidth>0, ledgerHeight:ledger.clientHeight };
      })()`);
      assert(layout.bounds.x >= 0 && layout.bounds.y >= 0 && layout.bounds.height <= viewport.height, JSON.stringify(layout));
      assert(!layout.overflow && layout.footerVisible && layout.targets.every(n => n >= 44) && layout.art && layout.ledgerHeight >= 55, JSON.stringify(layout));
      assert.equal(layout.paper, "rgb(242, 232, 205)");
      assert.equal(Math.round(layout.bounds.width), Math.min(1040, viewport.width - 24), "City Details must match the City List window width.");
      assert.equal(Math.round(layout.bounds.height), Math.min(790, viewport.height - 24), "City Details must match the City List window height.");
      assert(await evaluate("modalBody.querySelector('.cd-actions').getBoundingClientRect().left >= modalBody.querySelector('.cd-ledger').getBoundingClientRect().right - 1"), "Development must remain beside city information, including on phones.");
      await evaluate(`(() => {
        document.getElementById('cdDefencesTab').click();
        document.getElementById('cdDefencesTab').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
        if(document.getElementById('cdOverview').hidden || document.activeElement.id!=='cdOverviewTab')throw Error('Tab keyboard navigation failed');
        window.cdQaButton=modalBody.querySelector('.cd-upgrade');
        window.cdQaLedger=modalBody.querySelector('.cd-ledger');
        cdQaLedger.scrollTop=100;window.cdQaScroll=cdQaLedger.scrollTop;
        modalBody.querySelector('[data-cd-amount="1"]').click();cdQaButton.focus();
        window.cdQaGold=Math.floor(state.gold);
        state.gold=1;patchCityUpgradeUi(new Set(['different-region:different-city']));
        if(!cdQaButton.disabled || !document.getElementById('cdFeedback').textContent.includes('more gold'))throw Error('Affordability did not update');
        if(modalBody.querySelector('.cd-upgrade')!==cdQaButton || document.activeElement!==cdQaButton || cdQaLedger.scrollTop!==cdQaScroll)throw Error('Patching replaced controls, focus, or scroll');
      })()`);
      await screenshot(`insufficient-${viewport.name}`);
      await evaluate(`(() => {
        state.gold=cdQaGold;patchCityUpgradeUi();
        window.cdQaAuthority=usesServerEconomyAuthority;
        window.cdQaModes=supportsAuthoritativeCityUpgradeModes;
        window.cdQaSchedule=scheduleInstantEconomyFlush;
        usesServerEconomyAuthority=()=>true;supportsAuthoritativeCityUpgradeModes=()=>true;scheduleInstantEconomyFlush=()=>{};
        window.cdQaCost=getMultiLevelCost(cdQaCity,5);
        cdQaButton.click();patchCityUpgradeUi();
        if(getPendingCityUpgradeCount(cdQaCity)!==5 || getProjectedGold()!==cdQaGold-cdQaCost || cdQaCity.level!==24)throw Error('Exact +5 did not reserve authoritative projection');
        if(cdQaButton.disabled || modalBody.querySelector('[data-cd-value="level"]').textContent!=='29')throw Error('Pending feedback blocked affordable input or lost projected level');
        cdQaButton.click();patchCityUpgradeUi();
        if(getPendingCityUpgradeCount(cdQaCity)!==10 || modalBody.querySelector('[data-cd-value="level"]').textContent!=='34')throw Error('Repeated +5 lost queue projection');
      })()`);
      await screenshot(`pending-${viewport.name}`);
      await evaluate(`(async () => {
        const action=instantEconomyActions[0];
        const execute=executeInstantEconomyAction, refresh=refreshInstantEconomyAfterFailure;
        executeInstantEconomyAction=async()=>{throw Error('Controlled city upgrade rejection');};
        refreshInstantEconomyAfterFailure=async()=>{
          instantEconomySyncRecovery={generation:instantEconomyGeneration,actionKey:action.key};patchCityUpgradeUi();
          if(!cdQaButton.disabled || !document.getElementById('cdFeedback').textContent.includes('Refreshing confirmed'))throw Error('Recovery presented a settled balance');
          instantEconomySyncRecovery=null;return true;
        };
        try {await flushInstantEconomyActions();}finally {executeInstantEconomyAction=execute;refreshInstantEconomyAfterFailure=refresh;}
        patchCityUpgradeUi();
        if(getPendingCityUpgradeCount(cdQaCity)!==0)throw Error('Rejected dependent actions remained queued');
        if(!document.getElementById('cdFeedback').textContent.includes('not confirmed') || modalBody.querySelector('[data-cd-value="level"]').textContent!=='24')throw Error('Rejection did not roll back');
        if(cdQaLedger.scrollTop!==cdQaScroll)throw Error('Recovery moved the ledger');
      })()`);
      await screenshot(`error-${viewport.name}`);
      await evaluate(`(() => {
        const blockers=getIncomingUpgradeBlockers;
        getIncomingUpgradeBlockers=()=>[{remaining:60}];
        try {patchCityUpgradeUi();if(!cdQaButton.disabled || !document.getElementById('cdFeedback').textContent.includes('Incoming attack'))throw Error('Incoming attack did not explain the blocked action');}
        finally {getIncomingUpgradeBlockers=blockers;}
        patchCityUpgradeUi();
        modalBody.querySelector('[data-cd-amount="2"]').click();
        const max=getCityUpgradeOptionState(cdQaCity).options[2];
        if(cdQaButton.dataset.cityUpgradeMode!=='max' || Number(cdQaButton.dataset.cityUpgradeLevels)!==max.levels)throw Error('MAX did not use projected affordability');
        modalBody.querySelector('[data-cd-amount="0"]').click();
        document.getElementById('cdDefencesTab').click();patchCityUpgradeUi();
        if(document.getElementById('cdDefences').hidden)throw Error('Patching changed the selected tab');
        document.getElementById('cdOverviewTab').click();
      })()`);
      await evaluate(`(() => {
        usesServerEconomyAuthority=cdQaAuthority;supportsAuthoritativeCityUpgradeModes=cdQaModes;scheduleInstantEconomyFlush=cdQaSchedule;
        const root=modalBody.querySelector('.cd-panel');delete root.dataset.cdFailure;
        cdQaCity.level=29;
        setCityListUpgradeFeedback({cityId:cdQaCity.id,regionId:getCityRegionId(cdQaCity),startingLevel:24,finalLevel:29,upgraded:5});
        patchCityUpgradeUi();
        if(!document.getElementById('cdFeedback').textContent.includes('Level 29 reached'))throw Error('Confirmed receipt missing');
        cdQaLedger.scrollTop=0;
      })()`);
      await screenshot(`success-${viewport.name}`);
      await evaluate("document.getElementById('cdDefencesTab').click()");
      await screenshot(`defences-${viewport.name}`);
      const castleEntry = await evaluate(`(() => {
        const main=getMainCityReference();
        const other=state.cities.find(c=>c.id!==main.id&&!isStronghold(c)&&!isCrownCitadel(c));
        const saved={owner:other.owner,ownerUid:other.ownerUid};
        const checks=[];
        for(const owner of ['player','neutral','enemy','ally']) {
          other.owner=owner;other.ownerUid=owner==='player'?getCurrentOnlineUid():'fixture-other';
          for(const inspected of owner==='player'?[main,other]:[other]) {
            showCityInfoModal(inspected.id);
            const entry=document.getElementById('enterInnerCastleBtn');
            if(owner!=='player') {if(entry)throw Error('Foreign city exposed Inner Castle entry');checks.push({owner,entry:false});continue;}
            if(!entry||modalBody.querySelectorAll('#enterInnerCastleBtn').length!==1)throw Error('Missing or duplicate Inner Castle shortcut');
            if(owner==='player')document.getElementById('cdDefencesTab').click();
            if(!entry.getClientRects().length||entry.closest('[role="tabpanel"]'))throw Error('Shortcut must remain available outside the tabs');
            entry.click();
            if(!modal.classList.contains('inner-castle-modal')||modal.dataset.innerCastleCityId!==main.id||!modalBody.querySelector('.bailey-shell'))throw Error('Shortcut did not open the player Main City Inner Castle');
            modalBody.querySelector('[data-inner-castle-back]').click();
            if(modal.dataset.cityInfoId!==inspected.id||document.activeElement.id!=='enterInnerCastleBtn'||modal.dataset.innerCastleReturnCityId)throw Error('Back did not restore the inspected city and focus');
            checks.push({owner,main:inspected.id===main.id});
          }
        }
        Object.assign(other,saved);
        return checks;
      })()`);
      const privacy = await evaluate(`(() => {
        modal.close();
        const foreign=state.cities.find(c=>c.owner!=='player'&&!isStronghold(c)&&!isCrownCitadel(c));
        foreign.owner='enemy';foreign.ownerUid='fixture-rival';delete state.scoutReports[foreign.id];
        showCityInfoModal(foreign.id);
        return { upgrade:Boolean(modalBody.querySelector('[data-city-upgrade-mode]')), unknown:modalBody.textContent.includes('Unknown'), scoutRequired:modalBody.textContent.includes('Not available') };
      })()`);
      assert(!privacy.upgrade && privacy.unknown && privacy.scoutRequired, JSON.stringify(privacy));
      await screenshot(`foreign-${viewport.name}`);
      const isolation = await evaluate(`(() => {
        modal.close();
        const stronghold=state.cities.find(isStronghold)||state.cities.find(c=>c.owner!=='player');stronghold.kind='stronghold';showCityInfoModal(stronghold.id);
        const before=[modal,modalTitle,modalBody,modal.querySelector('.modal-card')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return [s.backgroundColor,s.color,s.fontFamily,r.width,r.height];});
        const hasCityDetails=Boolean(modalBody.querySelector('.cd-panel'));
        const sheet=[...document.styleSheets].find(s=>s.href?.includes('/city-details-ui.css'));sheet.disabled=true;
        const after=[modal,modalTitle,modalBody,modal.querySelector('.modal-card')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return [s.backgroundColor,s.color,s.fontFamily,r.width,r.height];});
        sheet.disabled=false;return {hasCityDetails,equal:JSON.stringify(before)===JSON.stringify(after)};
      })()`);
      assert(!isolation.hasCityDetails && isolation.equal, JSON.stringify(isolation));
      results.push({ viewport: viewport.name, layout, castleEntry, privacy, isolation });
      console.log(JSON.stringify(results.at(-1)));
    }
    assert.deepEqual(errors, [], "Uncaught errors occurred in City Details.");
    fs.writeFileSync(path.join(artifacts, "browser-validation.json"), JSON.stringify({ results, errors }, null, 2));
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
