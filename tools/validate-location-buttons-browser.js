"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const root = path.resolve(__dirname, ".."), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const delivery = JSON.parse(fs.readFileSync(path.join(root, "docs/art-sources/location-button/delivery.json")));
const artwork = fs.readFileSync(path.join(root, delivery.output));
assert.equal(crypto.createHash("sha256").update(artwork).digest("hex"), delivery.sha256);
assert(artwork.length < 16 * 1024, "A tiny button must not download a large source image.");
async function main() {
  const browser = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(browser, "Set CHROME_PATH to Chromium.");
  const output = path.join(root, "release-artifacts/location-buttons"); fs.mkdirSync(output, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client; const errors = [], checks = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(m => client.send(m)));
    await client.send("Network.setBlockedURLs", { urls: ["https://*"] });
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const ev = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const ready = async expression => {
      for (let i = 0; i < 300; i++) { if (await ev(expression)) return; await pause(100); }
      throw Error("Timeout: " + expression);
    };
    const fixture = file => ev(fs.readFileSync(path.join(root, "docs/visual-qa", file), "utf8"));
    const inspect = async name => {
      await ready("[...document.querySelectorAll('button.location-icon-button')].some(b=>b.getBoundingClientRect().width>0)");
      await ev("Promise.all(modal.querySelector(':scope > .modal-card').getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))");
      const results = await ev(`(() => {
        const sheet = document.querySelector('link[href^="location-buttons.css"]').sheet;
        const buttons = [...document.querySelectorAll('button.location-icon-button')].filter(b=>b.getBoundingClientRect().width>0);
        const rect = e => {const r=e.getBoundingClientRect();return {width:r.width,height:r.height};};
        const rows = buttons.map(button=>({button, parent:button.parentElement,
          row:button.closest('article, .cll-row, .public-profile-footer, .atlas-toolbar, .recommendation, .daily-mission-recommendation, li') || button.parentElement}));
        // Compare the real screen's old CSS/markup with the new presentation in
        // one frame. Restore actual nodes (and their listeners), not innerHTML.
        sheet.disabled=true;
        const replacements=[];
        for(const wrapper of document.querySelectorAll('.atlas-location-shortcut, .rally-assembly-location')) {
          const button=wrapper.querySelector('button'), old=button.cloneNode(true);
          if(wrapper.classList.contains('atlas-location-shortcut')) {
            old.className='location-shortcut'+(wrapper.classList.contains('home')?' home':'');
            old.innerHTML=wrapper.firstElementChild.innerHTML;
          }
          wrapper.replaceWith(old);replacements.push({wrapper,old,button});
        }
        const before=rows.map(({button,parent,row})=>{
          const replacement=replacements.find(r=>r.button===button);
          return {button:rect(replacement?.old||button),parent:rect(replacement?.old.parentElement||parent),row:rect(row)};
        });
        replacements.forEach(({wrapper,old})=>old.replaceWith(wrapper));sheet.disabled=false;
        return rows.map(({button,parent,row},i)=>{
          const b=rect(button), p=rect(parent), r=rect(row), previous=before[i];
          const context=button.className;
          // Wrapper comparisons use their containing row, since the new sibling
          // text deliberately stays outside the square click target.
          const wrapped=parent.matches('.atlas-location-shortcut, .rally-assembly-location');
          return {context, before:previous, button:b, parent:p, row:r,
            square:Math.abs(b.width-b.height)<.01,
            fitsOldButton:b.width<=previous.button.width+1 && b.height<=previous.button.height+1,
            noGrowth:r.height<=previous.row.height+1 && r.width<=previous.row.width+1 && (wrapped || (p.height<=previous.parent.height+1 && p.width<=previous.parent.width+1)),
            art:getComputedStyle(button,'::after').backgroundImage.includes(${JSON.stringify(delivery.output)}),
            named:!!(button.getAttribute('aria-label')||button.textContent.trim()),title:!!button.title,
            disabled:button.disabled};
        });
      })()`);
      assert(results.length, name + " has no location buttons");
      for (const r of results) assert(r.square && r.fitsOldButton && r.noGrowth && r.art && r.named && r.title, name + ": " + JSON.stringify(r));
      checks.push({ name, buttons: results });
      console.log(`Checked ${name}: ${results.length} square location buttons.`);
      await ev("(()=>{const b=[...document.querySelectorAll('button.location-icon-button')].find(b=>b.getBoundingClientRect().width>0&&!b.disabled);if(b){b.scrollIntoView({block:'center'});b.focus({preventScroll:true});if(document.activeElement!==b)throw Error('Location button is not focusable');}toast.classList.remove('visible');})()");
      fs.writeFileSync(path.join(output, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    };
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width,height,deviceScaleFactor:1,mobile:false });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await ready("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
      await ev("__CROWNLANDS_BENCHMARK__.closeModal();levelUpRewardQueue.length=0;activeLevelUpReward=null;pendingOfflineRewardsSummary=null;supportsRealmActivity=()=>true");
      const alpha=await ev(`(async()=>{const i=new Image();i.src=${JSON.stringify(delivery.output)};await i.decode();const c=document.createElement('canvas');c.width=c.height=192;const x=c.getContext('2d');x.drawImage(i,0,0);const a=x.getImageData(0,0,192,192).data;return i.naturalWidth===192&&a[3]===0&&a.some((v,n)=>n%4===3&&v>0);})()`);
      assert(alpha, "Delivered art must decode at 192px and retain transparency.");
      await ev("showIslandSwitcherModal()"); await inspect(`atlas-${width}`);
      await fixture("battle-reports-ledger/runtime-fixture.js"); await inspect(`reports-${width}`);
      await ev("battleReportFilter='realm_activity';showLogModal({silentAudio:true})"); await inspect(`realm-${width}`);
      await fixture("battle-report-detail/runtime-fixture.js"); await inspect(`battle-${width}`);
      await fixture("scout-reports-ledger/runtime-fixture.js"); await inspect(`scout-${width}`);
      await fixture("kingdom-activity-marches/runtime-fixture.js"); await inspect(`marches-${width}`);
      await ev("__marchRuntimeReview.show('long')"); await inspect(`marches-long-${width}`);
      await ev(`(()=>{const city=state.cities.find(c=>c.owner==='player'), region=getCityRegionId(city);
        const stronghold={...city,kind:'stronghold',strongholdType:'gold',name:'Ironwatch'};
        const camp={...city,id:'location-qa-camp',name:'Golden Camp',campType:'gold',troops:500,payoutAtMs:Date.now()+60000};
        window.locationQaSnapshot={marches:[],rallies:[],reinforcements:[],camps:[camp],strongholds:[stronghold]};
        getActiveOperationsSnapshot=()=>locationQaSnapshot;activeOperationsTab='camps';showOutgoingAttacksModal();})()`);
      await inspect(`camps-${width}`);
      await ev("activeOperationsTab='strongholds';showOutgoingAttacksModal()"); await inspect(`strongholds-${width}`);
      await ev(`(()=>{state.clanId='location-clan';const city=state.cities.find(c=>c.owner==='player');
        locationQaSnapshot.rallies=[{id:'location-rally',clanId:state.clanId,status:'forming',leaderUid:getCurrentOnlineUid(),leaderName:'QA ruler',assemblyCityId:city.id,assemblyCityName:'Alderwatch Keep',assemblyRegionId:getCityRegionId(city),targetType:'city',targetId:city.id,targetName:'Target City',targetRegionId:getCityRegionId(city),participants:[{uid:getCurrentOnlineUid(),ownerName:'QA ruler',troops:500,status:'assembled',role:'leader'}]}];
        activeOperationsTab='rallies';showOutgoingAttacksModal();})()`); await inspect(`rallies-${width}`);
      await ev(`(()=>{const city=state.cities.find(c=>c.owner==='player'),region=getCityRegionId(city),uid=getCurrentOnlineUid();
        const base={kind:'reinforce',owner:'player',ownerUid:uid,targetOwnerUid:'location-ally',fromId:city.id,toId:city.id,fromName:'Home City',toName:'Allied Keep',sourceRegionId:region,targetRegionId:region,troops:500,remaining:60,total:120};
        locationQaSnapshot.reinforcements=[{...base,id:'location-march'},
          {...base,id:'location-stationed',stationed:true,targetId:city.id,targetName:'Allied Keep'},
          {...base,id:'location-defending',stationed:true,ownerUid:'location-ally',targetOwnerUid:uid,targetId:city.id,targetName:'Home City'}];
        activeOperationsTab='reinforcements';showOutgoingAttacksModal();})()`); await inspect(`reinforcements-${width}`);
      await ev(`(()=>{const target=playerCities()[0];getIncomingAttacks=()=>[{id:'location-threat',key:'location-threat',toId:target.id,fromId:target.id,owner:'enemy',ownerUid:'location-rival',attackerName:'Rival',fromName:'Greyhaven',kind:'attack',target, targetRegionId:getCityRegionId(target),troopVisibility:'estimate',troopEstimateMin:100,troopEstimateMax:1000,remaining:120}];showIncomingAttacksModal();})()`); await inspect(`incoming-${width}`);
      await fixture("public-player-profile/runtime-fixture.js"); await inspect(`profile-${width}`);
      await ev("PublicProfileReview.show('unavailable')"); await inspect(`profile-disabled-${width}`);
      await fixture("quests-ledger/samples.js");
      await fixture("quests-ledger/runtime-fixture.js");
      await ready("modalBody.querySelectorAll('[data-quest]').length===3");
      await ev("modalBody.querySelectorAll('[data-quest]')[1]?.click()");
      await ready("!!modalBody.querySelector('[data-map]')"); await inspect(`quests-${width}`);
      // Measure the older detail template without binding its unrelated optional estate actions.
      await ev("(()=>{const open=openDailyMissionModal;openDailyMissionModal=(...args)=>{open(...args);return false;};try{showDailyMissionDetails(dailyMissionState.missions[1].id);}finally{openDailyMissionModal=open;}})()"); await inspect(`quest-details-${width}`);
      await ev("modal.close();modal.className='modal';showCityListModal()"); await inspect(`city-list-${width}`);
      await ev(`(()=>{modal.close();modal.className='modal';const city=state.cities[0];
        modalBody.innerHTML=deedCampHistoryMarkup([{cityId:city.id,cityName:city.name,regionId:getCityRegionId(city),awardedAtMs:Date.now()}]);modal.showModal();})()`);
      await inspect(`deed-history-${width}`);
      await ev(`(()=>{modal.close();const target=state.cities.find(c=>c.owner!=='player');onlineCombatAuthorization={uid:getCurrentOnlineUid(),shieldExpiresAtMs:0,
        retaliation:[{id:'location-qa-retaliation',cityId:target.id,cityName:'Stoneward Keep',regionId:getCityRegionId(target),status:'available',capturedAtMs:Date.now(),expiresAtMs:Date.now()+86400000}]};
        renderCombatTimers();document.querySelector('#combatTimers details').open=true;})()`);
      await inspect(`retaliation-${width}`);
      console.log(`Location artwork and non-growing button/row geometry passed at ${width}x${height}.`);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "checks.json"), JSON.stringify(checks,null,2));
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}await server.close();
  }
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
