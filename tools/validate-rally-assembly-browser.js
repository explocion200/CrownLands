"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Transformed DOMRects can report 44 CSS pixels as 43.999996 on Linux Chromium.
// Tolerate floating-point noise only, not a materially undersized touch target.
const minimumMeasuredTargetHeight = 44 - 0.001;
const artifacts = path.resolve(__dirname, "../release-artifacts/rally-assembly");
async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
    await client.send("Network.setBlockedURLs", { urls: ["https://*", "http://*.googleapis.com/*"] });
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 240; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error(`Timed out: ${expression}; ${JSON.stringify(await evaluate('({toast:toast.textContent,modal:modalBody.textContent.slice(0,600),source:selectedSourceId,last:lastSelectedOwnedCityId,errors:window.__rallyQaErrors})'))}`);
    };
    const click = async expression => {
      const point = await evaluate(`(() => {
        const button=${expression},r=button.getBoundingClientRect();
        const x=r.left+r.width/2,y=r.top+r.height/2;
        return {x,y,height:r.height,hit:button.contains(document.elementFromPoint(x,y))};
      })()`);
      assert(point.height >= minimumMeasuredTargetHeight && point.hit, `${expression}: ${JSON.stringify(point)}`);
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 });
    };
    const screenshot = async name => {
      await evaluate('toast.classList.remove("visible")');
      await evaluate('Promise.all(document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{})))');
      const result = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, name + ".png"), Buffer.from(result.data, "base64"));
    };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
      const fixture = await evaluate(`(() => {
        window.__CROWNLANDS_BENCHMARK__.closeModal();
        state.clanId='assembly-clan';state.clanRole='leader';state.character.level=50;
        const api=getOnlineApi();
        getOnlineApi=()=>({...api,createClanRally:async()=>({ok:true}),previewArmyRoute:async request=>{
          const from=getArmyTargetById(request.fromId),to=getArmyTargetById(request.toId);
          return {points:[{x:from.x,y:from.y},{x:to.x,y:to.y}],durationMs:60000,requestedTroops:request.requestedTroops};
        }});
        window.assemblyCity=playerCities().find(city=>!isStronghold(city));
        assemblyCity.name='Alderwatch';assemblyCity.troops=600;assemblyCity.troopFloat=600;assemblyCity.ownerUid=getCurrentOnlineUid();
        // The benchmark replaces live objectives with ordinary city fixtures.
        // Exercise both real objective render paths on two isolated fixture cities.
        state.cities.filter(city=>city.owner!=='player' && getCityRegionId(city)===getCityRegionId(assemblyCity)).slice(0,2).forEach((city,index)=>{
          city.kind='stronghold';city.strongholdType=index?'crown':'fortress';city.name=index?'Crown Citadel':'Westwatch Stronghold';
        });
        window.assemblyRally={id:'assembly-rally',status:'forming',clanId:state.clanId,leaderUid:getCurrentOnlineUid(),leaderName:state.playerName,
          assemblyCityId:assemblyCity.id,assemblyCityName:assemblyCity.name,assemblyRegionId:getCityRegionId(assemblyCity),assemblyType:'city',
          targetType:'city',targetId:CROWN_CITADEL_ID,targetName:'Crown Citadel',targetRegionId:getCityRegionId(CROWN_CITADEL_ID),
          participants:[{uid:getCurrentOnlineUid(),ownerName:state.playerName,troops:400,status:'assembled',role:'leader'},
            {uid:'ally-ready',ownerName:'Ally One',troops:150,status:'assembled'},
            {uid:'ally-inbound',ownerName:'Ally Two',troops:250,status:'inbound'}]};
        onlineClanRallies=[assemblyRally];
        return {cityId:assemblyCity.id,targets:state.cities.filter(city=>isStronghold(city) && getCityRegionId(city)===getCityRegionId(assemblyCity)).map(city=>({id:city.id,citadel:isCrownCitadel(city)}))};
      })()`);
      for (const citadel of [false, true]) {
        const target = fixture.targets.find(target => target.citadel === citadel);
        assert(target, "Missing objective fixture");
        await evaluate(`(() => {
          if(modal.open)modal.close();clearSelection(false);
          selectCity(assemblyCity.id);
          const target=cityById(${JSON.stringify(target.id)});target.owner='neutral';target.ownerUid='';target.clanId='';
          selectCity(target.id);
          const action=cityLayer.querySelector('.camp-rally-action');if(!action)throw Error('Missing Rally map action');
          action.click();
        })()`);
        await ready('modal.open && !!modalBody.querySelector("[data-order-kind=rally_create]")');
        assert.deepEqual(await evaluate(`({source:selectedSourceId,max:Number(modalBody.querySelector('#rallyTroopNumber').max),heading:modalBody.querySelector('h2').textContent})`),
          { source: fixture.cityId, max: 600, heading: "Create Rally" });
        assert(!await evaluate('!!modalBody.querySelector("select")'), "Rally unexpectedly asks for a city");
        await ready('!modalBody.querySelector("#troopSliderConfirm").disabled');
        const layout = await evaluate(`(() => {const r=modal.getBoundingClientRect();return {inside:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:modalBody.scrollWidth>modalBody.clientWidth+1};})()`);
        assert(layout.inside && !layout.overflow, JSON.stringify(layout));
        await screenshot(`create-${citadel ? "citadel" : "stronghold"}-${width}`);
      }
      await evaluate(`(() => {
        modal.close();clearSelection(false);zoom=1;selectCity(assemblyCity.id);centerOnCity(assemblyCity.id);
        releaseSelectionRenderDelay();renderCities(true);
      })()`);
      await ready(`!!cityLayer.querySelector('[data-city-id="${fixture.cityId}"] .city-rally-count')`);
      assert.deepEqual(await evaluate(`(() => {const node=cityLayer.querySelector('[data-city-id="${fixture.cityId}"]');return {troops:node.querySelector('.city-army-count').textContent,rally:node.querySelector('.city-rally-count').textContent,raw:assemblyCity.troops};})()`),
        { troops: "1.1K troops", rally: "550 rally ready250 inbound", raw: 600 });
      await screenshot(`assembly-map-${width}`);
      await evaluate('showCityInfoModal(assemblyCity.id)');
      assert.match(await evaluate('modalBody.querySelector(".city-rally-assembly").textContent'), /550 ready here.*250 inbound/);
      assert.equal(await evaluate('modalBody.querySelector("[data-cd-value=troops]").textContent'), "600");
      await evaluate('modalBody.querySelector(".city-rally-assembly").scrollIntoView({block:"center"})');
      assert(await evaluate('(() => {const r=modalBody.querySelector(".city-rally-assembly").getBoundingClientRect(),ledger=modalBody.querySelector(".cd-ledger").getBoundingClientRect();return r.top>=ledger.top-1&&r.bottom<=ledger.bottom+1;})()'));
      await screenshot(`assembly-info-${width}`);
      await evaluate('assemblyRally.participants[2].status="assembled";upsertClanRallySnapshot(assemblyRally)');
      assert.match(await evaluate('modalBody.querySelector(".city-rally-assembly").textContent'), /800 ready here.*0 inbound/);
      await evaluate('assemblyRally.status="launched";upsertClanRallySnapshot(assemblyRally)');
      assert(await evaluate('modalBody.querySelector(".city-rally-assembly").hidden'));
      await evaluate('assemblyRally.status="forming";upsertClanRallySnapshot(assemblyRally)');
      assert(!await evaluate('modalBody.querySelector(".city-rally-assembly").hidden'));
      for (const target of fixture.targets) {
        await evaluate(`(() => {
          const holding=cityById(${JSON.stringify(target.id)});holding.owner='player';holding.ownerUid=getCurrentOnlineUid();
          assemblyRally.assemblyCityId=holding.id;showCityInfoModal(holding.id);
        })()`);
        assert.match(await evaluate('modalBody.querySelector(".details-column > .city-rally-assembly").textContent'), /800 ready here/);
        await evaluate('modalBody.querySelector(".city-rally-assembly").scrollIntoView({block:"center"})');
        await screenshot(`assembly-${target.citadel ? "citadel" : "stronghold"}-info-${width}`);
      }
      await evaluate('assemblyRally.assemblyCityId=assemblyCity.id');
      for (const visit of ["cold", "warm"]) {
        assert.equal(await evaluate('document.querySelector("link[data-optional-ui-style=clan]").dataset.ready === "true"'), visit === "warm", "Exercise both first-load and already-loaded Clan styles.");
        await evaluate(`(() => {
          modal.close();clanSnapshot={id:state.clanId,name:'Assembly Test Clan',tag:'ATC',memberCount:3,status:'active',leaderUid:getCurrentOnlineUid()};
          activeProfileTab='clan';
          profileView.hidden=true;skillsView.hidden=true;settingsView.hidden=true;flagEditorView.hidden=true;clanView.hidden=false;
          profileScreen.classList.add('open','clan-active');profileScreen.setAttribute('aria-hidden','false');
          updateProfileTabHeader();renderClanView();
        })()`);
        // The first render waits for optional Clan styles, then initializes clan
        // navigation. Choose a tab only after that real navigation is available.
        await ready(`clanContent.querySelector("#clanSectionTabWarroom")?.getBoundingClientRect().height >= ${minimumMeasuredTargetHeight}`);
        await click('clanContent.querySelector("#clanSectionTabOverview")');
        await ready('clanContent.querySelector("#clanSectionTabOverview")?.getAttribute("aria-selected") === "true"');
        await click('clanContent.querySelector("#clanSectionTabWarroom")');
        await ready(`clanContent.querySelector("#clanSectionTabWarroom")?.getAttribute("aria-selected") === "true" && clanContent.querySelector("[data-rally-action=assembly]")?.getBoundingClientRect().height >= ${minimumMeasuredTargetHeight}`);
        await evaluate('clanContent.querySelector("[data-rally-action=assembly]").scrollIntoView({block:"center"})');
        await screenshot(`war-room-${visit}-${width}`);
        await click('clanContent.querySelector("[data-rally-action=assembly]")');
        await ready(`!profileScreen.classList.contains('open') && selectedSourceId===${JSON.stringify(fixture.cityId)}`);
      }
      await evaluate('activeOperationsTab="rallies";showOutgoingAttacksModal()');
      await ready('modal.open && !!modalBody.querySelector("[data-rally-action=assembly]")');
      await evaluate('modalBody.querySelector("[data-rally-action=assembly]").scrollIntoView({block:"center"})');
      await screenshot(`activity-rally-${width}`);
      assert(await evaluate(`(() => {const r=modalBody.querySelector("[data-rally-action=assembly]").getBoundingClientRect();return r.height>=${minimumMeasuredTargetHeight}&&r.left>=0&&r.right<=innerWidth;})()`));
      await evaluate('modalBody.querySelector("[data-rally-action=assembly]").click()');
      await ready('!modal.open');
      // Both launch entry points accept a Ready quorum while an ally is still inbound.
      await evaluate('assemblyRally.participants[2].status="inbound"');
      assert(await evaluate(`(() => {
        for(const activity of [false,true]) {
          const root=document.createElement('div');root.innerHTML=renderClanRallyCard(assemblyRally,activity);
          if(root.querySelector('[data-rally-action=launch]').disabled)return false;
          assemblyRally.participants[1].status='inbound';root.innerHTML=renderClanRallyCard(assemblyRally,activity);
          if(!root.querySelector('[data-rally-action=launch]').disabled)return false;
          assemblyRally.participants[1].status='assembled';
          assemblyRally.targetType='tower';root.innerHTML=renderClanRallyCard(assemblyRally,activity);
          if(!root.querySelector('[data-rally-action=launch]').disabled)return false;
          assemblyRally.targetType='city';
        }
        return true;
      })()`), 'Launch readiness must count arrived rulers, preserving target minimums');
      await evaluate('window.earlyLaunchChoice=confirmClanRallyAction(assemblyRally,"launch");void 0');
      assert.match(await evaluate('modalBody.textContent'), /incoming contributions will turn back now/);
      assert(!await evaluate('modalBody.querySelector("[data-rally-confirm=accept]").disabled'));
      await screenshot(`early-launch-${width}`);
      await evaluate('modalBody.querySelector("[data-rally-confirm=cancel]").scrollIntoView({block:"center"})');
      await click('modalBody.querySelector("[data-rally-confirm=cancel]")');
      await evaluate('modal.close()');
      assert.equal(await evaluate('earlyLaunchChoice'),false);
      // A failed/stale reservation must never grant extra sendable troops.
      await evaluate('beginSendMode(assemblyCity.id)');
      assert.equal(await evaluate('getTroopOrderSourceById(selectedSourceId).troops'), 600);
      await evaluate(`(() => {
        if(modal.open)modal.close();clearSelection(false);
        window.joinAssembly=state.cities.find(city=>city.owner!=='player' && getCityRegionId(city)===getCityRegionId(assemblyCity));
        joinAssembly.name='Ally Assembly';joinAssembly.ownerUid='rally-creator';joinAssembly.clanId=state.clanId;
        window.joinRally={...assemblyRally,id:'join-rally',leaderUid:'rally-creator',leaderName:'Rally Creator',
          assemblyCityId:joinAssembly.id,assemblyCityName:joinAssembly.name,assemblyRegionId:getCityRegionId(joinAssembly),
          assemblyX:joinAssembly.x,assemblyY:joinAssembly.y,
          participants:[{uid:'rally-creator',ownerName:'Rally Creator',troops:300,status:'assembled',role:'leader'}]};
        onlineClanRallies=[joinRally];window.joinRequests=[];
        window.savedSourceCity=playerCities().find(city=>city.id!==assemblyCity.id);
        window.savedRallyProfile={...getPlayerProfileSnapshot(),uid:getCurrentOnlineUid(),
          clanId:state.clanId,clanName:clanSnapshot.name,clanTag:clanSnapshot.tag,clanRole:'leader',
          lastSelectedOwnedCityId:savedSourceCity.id};
        const api=getOnlineApi();getOnlineApi=()=>({...api,
          loadPlayerProfile:()=>new Promise(resolve=>{window.resolveRallyProfile=()=>resolve(savedRallyProfile);}),
          loadClan:async()=>clanSnapshot,loadClanMembers:async()=>[],loadClanApplications:async()=>[],
          joinClanRally:async request=>{
            joinRequests.push(request);
            return {ok:true,rally:{...joinRally,participants:[...joinRally.participants,
              {uid:getCurrentOnlineUid(),ownerName:state.playerName,troops:request.army.troops,status:'inbound'}]}};
        }});
      })()`);
      assert(await evaluate(`(() => {
        lastSelectedOwnedCityId='';applyOnlineProfileSnapshot(savedRallyProfile);
        return lastSelectedOwnedCityId===savedSourceCity.id;
      })()`), "Initial profile hydration must still restore the saved city selection");
      // The same membership and authority rules must hold on both entry points.
      assert(await evaluate(`(() => {
        for(const activity of [false,true]) {
          const has=action=>renderClanRallyCard(joinRally,activity).includes('data-rally-action="'+action+'"');
          for(const role of ['member','officer','leader']) {
            state.clanRole=role;
            if(!has('join') || has('launch')!==(role==='leader') || has('cancel')!==(role==='leader'))return false;
          }
          for(const status of ['inbound','assembled']) {
            joinRally.participants.push({uid:getCurrentOnlineUid(),troops:100,status});
            if(has('join') || !has('withdraw') || !has('launch') || !has('cancel'))return false;
            joinRally.participants.pop();
          }
          const creator=joinRally.leaderUid;joinRally.leaderUid=getCurrentOnlineUid();
          if(has('join') || has('withdraw') || !has('launch') || !has('cancel'))return false;
          joinRally.leaderUid=creator;
          const saved=joinRally.participants;
          joinRally.participants=Array.from({length:CLAN_RALLY_MAX_PARTICIPANTS},(_,i)=>({uid:'other-'+i,status:'assembled',troops:1}));
          if(has('join'))return false;
          joinRally.participants=saved;joinRally.status='launched';
          if(has('join') || has('launch'))return false;
          joinRally.status='forming';rallyActionRequests.add('join:'+joinRally.id);
          const root=document.createElement('div');root.innerHTML=renderClanRallyCard(joinRally,activity);
          if(!root.querySelector('[data-rally-action=join]').disabled)return false;
          rallyActionRequests.clear();
        }
        return true;
      })()`), "Joining must be independent of leadership, while existing contribution and capacity limits remain enforced");
      for (const entry of ["clan", "activity"]) {
        await evaluate(`(() => {
          if(modal.open)modal.close();clearSelection(false);onlineClanRallies=[joinRally];
          window.resolveRallyProfile=null;
          state.clanRole='member';
          if(${JSON.stringify(entry)}==='clan') {
            selectCity(assemblyCity.id);selectCity(joinAssembly.id);showClanHub();
          } else {
            closeProfileScreen({force:true});selectCity(savedSourceCity.id);
            window.pendingRallyProfileRefresh=refreshClanState({silent:true});
            // A new map selection while the profile request is pending also wins.
            selectCity(assemblyCity.id);selectCity(joinAssembly.id);
          }
        })()`);
        await ready('clanUiLoading && typeof resolveRallyProfile === "function"');
        await evaluate('resolveRallyProfile()');
        await ready('!clanUiLoading');
        assert.equal(await evaluate('lastSelectedOwnedCityId'), fixture.cityId,
          "Refreshing the Clan profile must preserve the latest session selection, including selections made during the request");
        assert.equal(await evaluate('state.clanRole'), 'leader', "Clan membership must still refresh from the profile");
        await evaluate(`${JSON.stringify(entry)}==='clan' ? setClanMobileSection('warroom') : (activeOperationsTab='rallies',showOutgoingAttacksModal())`);
        const root = entry === "clan" ? "clanContent" : "modalBody";
        await ready(`${root}.querySelector('[data-rally-action=join]')?.getBoundingClientRect().height >= ${minimumMeasuredTargetHeight}`);
        assert.match(await evaluate(`${root}.textContent`), /From Alderwatch. Choose how many troops to send/);
        assert(await evaluate(`Array.from(${root}.querySelectorAll('.clan-rally-card footer button, .rally-actions button')).every(button=>{
          const r=button.getBoundingClientRect();return r.height>=${minimumMeasuredTargetHeight}&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;
        })`), "Join, Launch and Cancel must stay visible at every viewport");
        if (entry === "activity") assert(await evaluate(`(() => {
          const buttons=Array.from(modalBody.querySelectorAll('.rally-actions button'));
          return buttons.every(button=>Math.abs(button.getBoundingClientRect().top-buttons[0].getBoundingClientRect().top)<1)
            && modalBody.querySelector('.rally-scroll').clientHeight>=50;
        })()`), "Leader controls must share a row and leave room for rally details");
        await screenshot(`join-${entry}-${width}`);
        const before = await evaluate('joinRequests.length');
        await click(`${root}.querySelector('[data-rally-action=join]')`);
        await ready('modal.open && !!modalBody.querySelector("[data-order-kind=rally_join]") && !modalBody.querySelector("#troopSliderConfirm").disabled');
        assert.deepEqual(await evaluate('({source:selectedSourceId,max:Number(modalBody.querySelector("#rallyTroopNumber").max),requests:joinRequests.length})'),
          {source:fixture.cityId,max:600,requests:before}, "Join chooses the remembered city but waits for troop confirmation");
        assert(await evaluate('(() => {const r=modal.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&modalBody.scrollWidth<=modalBody.clientWidth+1;})()'));
        await screenshot(`join-picker-${entry}-${width}`);
        await evaluate('(() => {const input=modalBody.querySelector("#rallyTroopNumber");input.value="137";input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));})()');
        await ready('!modalBody.querySelector("#troopSliderConfirm").disabled');
        await click('modalBody.querySelector("#troopSliderConfirm")');
        await ready(`joinRequests.length === ${before + 1} && !rallyActionRequests.has('join:'+joinRally.id)`);
        assert.deepEqual(await evaluate('({source:joinRequests.at(-1).army.fromId,target:joinRequests.at(-1).army.toId,troops:joinRequests.at(-1).army.troops,rally:joinRequests.at(-1).rallyId})'),
          {source:fixture.cityId,target:await evaluate('joinAssembly.id'),troops:137,rally:'join-rally'});
      }
      for (const unavailable of ["unselected", "empty", "lost"]) {
        const before = await evaluate('joinRequests.length');
        const result = await evaluate(`(async () => {
          if(modal.open)modal.close();closeProfileScreen({force:true});clearSelection(false);onlineClanRallies=[joinRally];
          selectCity(assemblyCity.id);
          if(${JSON.stringify(unavailable)}==='unselected')lastSelectedOwnedCityId='';
          if(${JSON.stringify(unavailable)}==='empty')assemblyCity.troops=assemblyCity.troopFloat=0;
          if(${JSON.stringify(unavailable)}==='lost')assemblyCity.owner='enemy';
          const refresh=refreshClanState({silent:true});resolveRallyProfile();await refresh;
          // Keep the empty fixture and assertion in one turn, before production ticks.
          beginJoinClanRallyContribution(joinRally);
          return {open:modal.open,requests:joinRequests.length,message:toast.textContent};
        })()`);
        assert.deepEqual({open:result.open,requests:result.requests}, {open:false,requests:before},
          `An unavailable (${unavailable}) selection must never fall back to the older saved city after refreshing`);
        assert.match(result.message, /Select an owned city.*Join Rally/);
        await evaluate('assemblyCity.owner="player";assemblyCity.troops=assemblyCity.troopFloat=600');
      }
      console.log(`Rally creation, assembly, leadership/join controls and confirmed joins from both panels passed at ${width}x${height}.`);
    }
    assert.deepEqual(errors, []);
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
