"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
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
    await Promise.all(["Page.enable", "Runtime.enable"].map(method => client.send(method)));
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
      await evaluate(`(() => {
        modal.close();clanSnapshot={id:state.clanId,name:'Assembly Test Clan',tag:'ATC',memberCount:3,status:'active',leaderUid:getCurrentOnlineUid()};
        activeProfileTab='clan';activeClanMobileSection='warroom';
        profileView.hidden=true;skillsView.hidden=true;settingsView.hidden=true;flagEditorView.hidden=true;clanView.hidden=false;
        profileScreen.classList.add('open','clan-active');profileScreen.setAttribute('aria-hidden','false');
        renderClanView();setClanMobileSection('warroom');
      })()`);
      await ready('!!clanContent.querySelector("[data-rally-action=assembly]")');
      await evaluate('clanContent.querySelector("[data-rally-action=assembly]").scrollIntoView({block:"center"})');
      await screenshot(`war-room-${width}`);
      const point = await evaluate(`(() => {const button=clanContent.querySelector('[data-rally-action=assembly]'),r=button.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,height:r.height,hit:button.contains(document.elementFromPoint(x,y))};})()`);
      assert(point.height >= 44 && point.hit, JSON.stringify(point));
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 });
      await ready(`!profileScreen.classList.contains('open') && selectedSourceId===${JSON.stringify(fixture.cityId)}`);
      await evaluate('activeOperationsTab="rallies";showOutgoingAttacksModal()');
      await ready('modal.open && !!modalBody.querySelector("[data-rally-action=assembly]")');
      await evaluate('modalBody.querySelector("[data-rally-action=assembly]").scrollIntoView({block:"center"})');
      await screenshot(`activity-rally-${width}`);
      assert(await evaluate('(() => {const r=modalBody.querySelector("[data-rally-action=assembly]").getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth;})()'));
      await evaluate('modalBody.querySelector("[data-rally-action=assembly]").click()');
      await ready('!modal.open');
      // A failed/stale reservation must never grant extra sendable troops.
      await evaluate('beginSendMode(assemblyCity.id)');
      assert.equal(await evaluate('getTroopOrderSourceById(selectedSourceId).troops'), 600);
      console.log(`Rally source, assembly counts, live arrivals/launch and War Room map navigation passed at ${width}x${height}.`);
    }
    assert.deepEqual(errors, []);
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
