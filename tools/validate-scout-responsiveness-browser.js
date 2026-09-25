"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { extractFunction, clientSource } = require("./world-travel-test-fixtures");
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const root=path.resolve(__dirname,"..");
const stats=values=>{const v=[...values].sort((a,b)=>a-b);return {count:v.length,p50:v[Math.ceil(v.length*.5)-1],p95:v[Math.ceil(v.length*.95)-1]};};
async function main(){
  const browser=[process.env.CHROME_PATH,process.env.CROWNLANDS_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome","/usr/bin/chromium"].find(file=>file&&fs.existsSync(file));
  assert(browser,"Set CHROME_PATH for scouting browser checks");
  const server=createMapBenchmarkServer(),address=await server.listen();
  const artifacts=path.join(root,"release-artifacts/scouting-responsiveness");fs.mkdirSync(artifacts,{recursive:true});
  const base=execFileSync("git",["merge-base","HEAD","origin/main"],{cwd:root,encoding:"utf8"}).trim();
  const baseline=execFileSync("git",["show",`${base}:game.js`],{cwd:root,encoding:"utf8",maxBuffer:8*1024*1024});
  const replacements=["scoutTarget","renderScoutRequestFeedback","launchAutomaticServerScout","mergeServerReports","resolveServerArmyMission"];
  const functions=source=>replacements.map(name=>(source.includes(`async function ${name}(`)?"async ":"")+extractFunction(source,name)).join("\n");
  const evidence={base,scope:"Local browser with fixture server responses; no production traffic. Includes 80ms simulated acknowledgement; excludes travel.",viewports:[]};
  let session,client;
  try {
    session=await startBrowserSession(browser);
    client=await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"),client.send("Runtime.enable"),client.send("Network.enable")]);
    await client.send("Network.setBlockedURLs",{urls:["*googleapis.com*","*cloudfunctions.net*","*firebaseio.com*","*playcrownlands.com*"]});
    const evaluate=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;};
    for(const viewport of [{name:"desktop",width:1440,height:900,rate:1},{name:"mobile",width:844,height:390,rate:4},{name:"short-mobile",width:568,height:320,rate:4}]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});
      await client.send("Emulation.setCPUThrottlingRate",{rate:viewport.rate});
      await client.send("Page.navigate",{url:`${address.url}/__benchmark__/?scenario=A&visualMarches=0`});
      for(let i=0;i<120;i++) {const status=await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus()");if(status?.status==="error")throw Error(status.error);if(status?.status==="ready")break;await wait(250);}
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__.getStatus().status"),"ready");
      await evaluate(`(() => {
        // The fixture page is under /__benchmark__, while the real route worker
        // and its imports are served from the application root.
        cancelPendingRouteWorkerRequests();routeWorker?.terminate();routeWorker=null;routeWorkerUnavailable=false;
        history.replaceState(null,"","/");
        window.scoutQa={ originalApi:window.CrownlandsOnline, calls:0, seq:0, merges:0, resolveCalls:0 };
        const qa=scoutQa;
        qa.source=playerCities().find(c=>c.troops>0&&getCityRegionId(c)===getActiveMapRegionId());
        qa.target=state.cities.find(c=>c.owner!=="player"&&getCityRegionId(c)===getCityRegionId(qa.source)&&!isStronghold(c)&&!getMainCityScoutBlockReason(c,"player")&&!getClanFriendlyBlockReason(c));
        if(!qa.target||!qa.source)throw Error("Scouting fixture needs source and target");
        qa.nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(performance.now())));
        qa.reset=()=>{modal.close();state.attacks=[];pendingOutgoingMissions.clear();onlineArmiesByIsland.clear();rebuildOnlineArmies();pendingDirectScoutTargets.clear();
          resolvedOnlineArmyIds.clear();resolvingOnlineArmyIds.clear();scoutResolutionRequests.clear();scoutResolutionRetries.clear();
          state.scoutReports={};state.battleReports=[];appliedServerReportRevisions.clear();
          selectedTargetId=qa.target.id;selectedSourceId=null;selectedTowerMapId="";sendMode=false;cityLayer.querySelectorAll(".city-action-wheel,.gold-camp-action-wheel").forEach(n=>n.remove());
          renderSelectedForeignWheel(qa.target);};
        qa.movement=id=>({id,kind:"scout",worldId:ONLINE_WORLD_ID,resetGeneration:RESET_GENERATION,realmShardId:REALM_SHARD_ID,
          ownerKind:"player",ownerUid:getCurrentOnlineUid(),sourceType:qa.tower?"tower":"city",targetType:"city",troops:1,total:60,
          fromId:qa.source.id,toId:qa.target.id,fromName:qa.source.name,toName:qa.target.name,
          sourceRegionId:getCityRegionId(qa.source),targetRegionId:getCityRegionId(qa.target),
          launchedAtMs:Date.now(),arrivesAtMs:Date.now()+60000,path:[{x:qa.source.x,y:qa.source.y},{x:qa.target.x,y:qa.target.y}],
          pathSegments:[{regionId:getCityRegionId(qa.source),points:[{x:qa.source.x,y:qa.source.y},{x:qa.target.x,y:qa.target.y}],length:100}],
          routeRegionIds:[getCityRegionId(qa.source)],pathLength:100});
        qa.report=(target=qa.target,index=0)=>{const at=Date.now()+index;return {id:"scout-qa-"+target.id,uid:getCurrentOnlineUid(),type:"scout",
          cityId:target.id,cityName:target.name,regionId:getCityRegionId(target),targetType:"city",occurredAtMs:at,createdAtMs:at,
          scoutReport:{cityId:target.id,scoutedAtMs:at,expiresAtMs:at+600000,troops:4321,ownerTroops:4321,totalDefense:5617,cityLevel:target.level||1}};};
        window.CrownlandsOnline={...qa.originalApi,
          submitRecoverableArmyOrder:async (request,options)=>{qa.calls++;const id=request.armyId||request.army.id;options?.onPending?.({id});await new Promise(r=>setTimeout(r,80));return {movement:{...qa.movement(id),kind:request.army.kind},
            ...(qa.tower?{sourceTower:{id:qa.tower.id,ownTroops:99}}:{})};},
          getHoldingTowerState:async()=>{qa.towerRefreshFinished=false;await new Promise(r=>setTimeout(r,300));qa.towerRefreshFinished=true;throw Error("Fixture Tower refresh unavailable");},
          isRetryableArmySubmissionError:()=>true,
          resolveArmyOrder:async()=>{qa.resolveCalls++;await new Promise(r=>setTimeout(r,80));const report=qa.report();return {status:"resolved",kind:"scout",reports:[report]};},
          loadServerReports:async()=>[]
        };
        qa.reset();
      })()`);
      const row={...viewport,versions:{}};
      for(const [version,source] of [["before",baseline],["after",clientSource]]) {
        await evaluate(functions(source));
        const measurements=await evaluate(`(async()=>{
          const qa=scoutQa,pending=[],launch=[],report=[],arrival=[];let duplicateGuard=true,stableWheel=true;
          for(let i=0;i<10;i++) {
            qa.reset();await qa.nextFrame();const wheel=cityLayer.querySelector(".foreign-city-action-wheel");
            const beforeCalls=qa.calls,start=performance.now();const request=scoutTarget(qa.target);
            const pendingButton=cityLayer.querySelector(".wheel-scout");
            duplicateGuard&&=pendingButton.disabled&&pendingButton.getAttribute("aria-busy")==="true";
            stableWheel&&=wheel.isConnected;
            await scoutTarget(qa.target);pending.push(await qa.nextFrame()-start);await request;
            launch.push(performance.now()-start);duplicateGuard&&=qa.calls-beforeCalls===1;
            qa.reset();await qa.nextFrame();const received=performance.now();mergeServerReports([qa.report()],{notify:false});
            await qa.nextFrame();report.push(performance.now()-received);
            if(!getScoutReport(qa.target.id))throw Error("Authoritative report was lost");
          }
          for(let pass=0;pass<5;pass++) {
            qa.reset();await qa.nextFrame();const id="timing-"+ ++qa.seq;
            const movement=qa.movement(id);adoptServerArmyMovement(movement);
            const mission=state.attacks.find(a=>a.onlineId===id);
            mission.arrivesAtMs=Date.now()-1;mission.remaining=0;
            for(const army of onlineArmies)if(army.id===id){army.arrivesAtMs=mission.arrivesAtMs;army.remaining=0;}
            const start=performance.now();await resolveServerArmyMission(mission);await qa.nextFrame();
            arrival.push(performance.now()-start);
          }
          return {pending,launch,report,arrival,duplicateGuard,stableWheel};
        })()`);
        assert(measurements.duplicateGuard,`${viewport.name}/${version}: duplicate dispatch or missing busy feedback`);
        if(version==="after") assert(measurements.stableWheel,"Pending state rebuilt the action wheel");
        row.versions[version]={pendingMs:stats(measurements.pending),launchMs:stats(measurements.launch),reportMs:stats(measurements.report),arrivalMs:stats(measurements.arrival)};
      }
      // The accepted launch must finish even if its optional Tower refresh fails.
      const tower=await evaluate(`(async()=>{const qa=scoutQa;qa.reset();qa.tower=HOLDING_TOWER_DEFINITIONS[0];
        holdingTowerSnapshots.set(qa.tower.id,{...qa.tower,ownerMember:true,clanId:state.clanId,ownStationedTroops:100,garrison:[{uid:getCurrentOnlineUid(),troops:100}]});
        const start=performance.now();await scoutTarget(qa.target);const elapsed=performance.now()-start;
        const own=holdingTowerSnapshots.get(qa.tower.id).ownStationedTroops;
        const roster=holdingTowerSnapshots.get(qa.tower.id).garrison[0].troops;qa.tower=null;
        return {elapsed,own,roster,refreshFinished:qa.towerRefreshFinished,active:state.attacks.some(a=>a.toId===qa.target.id)};})()`);
      assert.equal(tower.own,99);assert.equal(tower.roster,99);assert(tower.active);assert.equal(tower.refreshFinished,false,"Accepted scout waited for optional Tower fetch");
      row.tower=tower;
      const burst=await evaluate(`(async()=>{const qa=scoutQa;qa.reset();const targets=[qa.target,...state.cities.filter(c=>c.owner!=="player"&&c.id!==qa.target.id)].slice(0,24);
        const node=cityLayer.querySelector(".city-node");const reports=targets.map((target,i)=>qa.report(target,i));
        reports.forEach(report=>mergeServerReports([report],{notify:false}));
        const merged=reports.every(report=>state.scoutReports[report.cityId]);await qa.nextFrame();
        showScoutReportModal(qa.target.id);await qa.nextFrame();const body=modalBody.querySelector(".report-body");
        body.scrollTop=120;const oldTop=body.scrollTop;const back=modalBody.querySelector("#battleReportBackBtn");back.focus({preventScroll:true});
        mergeServerReports([qa.report(qa.target,100)],{notify:false});await qa.nextFrame();
        return {count:targets.length,merged,mapNodeKept:node.isConnected,scroll:modalBody.querySelector(".report-body").scrollTop,
          oldTop,focus:document.activeElement.id,reportVisible:modal.open};})()`);
      assert(burst.merged);assert(burst.mapNodeKept);assert.equal(burst.scroll,burst.oldTop);assert.equal(burst.focus,"battleReportBackBtn");
      row.burst=burst;
      const shot=await client.send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(artifacts,`scout-report-${viewport.name}.png`),Buffer.from(shot.data,"base64"));
      const arrival=await evaluate(`(async()=>{const qa=scoutQa;qa.reset();const movement=qa.movement("arrival-"+ ++qa.seq);movement.arrivesAtMs=Date.now()+60000;
        adoptServerArmyMovement(movement);const mission=state.attacks.find(a=>a.onlineId===movement.id);mission.arrivesAtMs=Date.now()-1;mission.remaining=0; for(const army of onlineArmies) if(army.id===movement.id) {army.arrivesAtMs=mission.arrivesAtMs;army.remaining=0;}
        const start=performance.now();const pending=resolveServerArmyMission(mission);updateOutgoingAttackUi();
        const receiving=outgoingAttackTime.textContent;await pending;await qa.nextFrame();
        return {elapsed:performance.now()-start,receiving,report:Boolean(getScoutReport(qa.target.id))};})()`);
      assert.equal(arrival.receiving,"Receiving report…");assert(arrival.report);row.arrival=arrival;
      row.departure=await evaluate(`(async()=>{const qa=scoutQa;qa.reset();centerOnCity(qa.source.id);
        const id="visible-pending-"+ ++qa.seq, troops=qa.source.troops, gold=state.gold;
        const mission=beginPendingScoutDeparture(id,qa.target,qa.source);
        if(qa.source.troops!==troops||state.gold!==gold)throw Error("Preview spent resources");
        for(let i=0;i<180&&!mission.path.length;i++)await qa.nextFrame();
        if(!mission.path.length)throw Error("Preview route never became available: "+JSON.stringify({workerUnavailable:routeWorkerUnavailable,requests:routeWorkerRequests.size,job:Boolean(buildRouteWorkerJob(qa.source,qa.target))}));
        renderArmies(true);await qa.nextFrame();const token=armyTokenCache.get(id);
        if(!token||!token.textContent.includes("Pending"))throw Error("Pending token missing");
        const first=token.style.transform;for(let i=0;i<5;i++)await qa.nextFrame();
        const moved=token.style.transform!==first;
        if(getArmyTravelProgress(mission,getArmyClockNowMs()+600000)>.08)throw Error("Preview reached target");
        qa.pendingToken=token;qa.pendingId=id;
        return {moved,pending:token.classList.contains("pending-order"),routePoints:mission.path.length};})()`);
      assert(row.departure.moved);assert(row.departure.pending);
      const departureShot=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(artifacts,`scout-departure-${viewport.name}.png`),Buffer.from(departureShot.data,"base64"));
      row.departure.reconciled=await evaluate(`(async()=>{const qa=scoutQa;const before=qa.pendingToken.style.transform;
        adoptServerArmyMovement(qa.movement(qa.pendingId));
        if(qa.pendingToken.style.transform!==before)throw Error("Acceptance flashed the new position before blending");
        await qa.nextFrame();return !pendingOutgoingMissions.has(qa.pendingId)&&armyTokenCache.get(qa.pendingId)===qa.pendingToken
          &&!qa.pendingToken.classList.contains("pending-order");})()`);
      assert(row.departure.reconciled,"Accepted departure replaced or duplicated its token");
      row.regularMarch=await evaluate(`(async()=>{const qa=scoutQa;qa.reset();centerOnCity(qa.source.id);
        const mission={...qa.movement("regular-"+ ++qa.seq),owner:"player",kind:"attack",remaining:60};
        const node=cityLayer.querySelector(".city-node");
        const promise=publishOnlineArmyMovement(mission,{addLocalMissionOnAccept:true});
        const pending=pendingOutgoingMissions.size===1;await qa.nextFrame();await promise;await qa.nextFrame();
        return {pending,accepted:state.attacks.some(a=>a.onlineId===mission.onlineId),pendingCleared:!pendingOutgoingMissions.size,mapNodeKept:node.isConnected};})()`);
      assert(row.regularMarch.pending&&row.regularMarch.accepted&&row.regularMarch.pendingCleared&&row.regularMarch.mapNodeKept);
      if (!process.env.CI) assert(row.versions.after.pendingMs.p95<=100,`${viewport.name}: pending feedback exceeded 100ms`);
      if (!process.env.CI) assert(row.versions.after.reportMs.p95<=200,`${viewport.name}: report presentation exceeded 200ms`);
      evidence.viewports.push(row);
      fs.writeFileSync(path.join(artifacts,"browser-benchmark.json"),JSON.stringify(evidence,null,2));
      console.log(JSON.stringify(row));
    }
    console.log("Scouting browser passed: desktop/4x mobile pending feedback, duplicate taps, report bursts, focus/scroll, Tower refresh failure, and receiving-report status. Production endpoints blocked.");
  }finally{
    if(client)await client.send("Browser.close").catch(()=>{});
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
