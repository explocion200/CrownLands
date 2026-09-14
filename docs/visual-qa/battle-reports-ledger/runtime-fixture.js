/* Local actual-game review. Never loaded by the production client. */
(async function () {
  if (!["127.0.0.1", "localhost"].includes(location.hostname) || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now() > deadline) throw Error("Benchmark did not initialize");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const now = Date.now();
  const city = state.cities.find(city => city.owner !== "player") || state.cities[0];
  const fixtureReports = [
    ["scout","scout","Ravenwatch",14200], ["attack","victory","Thornfield",35000],
    ["defense","held","Greenwood",24000], ["defense","defeat","Oakbridge",18000],
    ["scout","scout","Willowmere",1], ["attack","breach","Stonegate",46000],
    ["attack","raid","Blackhollow",21000], ["defense","breached","Briarford",32500],
    ["attack","victory","Warband Camp",8500], ["defense","lost","The Watchtower of Saint Bartholomew",1280000],
  ].map(([type,outcome,cityName,troops],i)=>({
    id:`ledger-review-${i}`,type,outcome,cityId:city.id,regionId:getCityRegionId(city),cityName,cityLevel:16+i,
    targetType:i===8?"camp":"city",troopCount:troops,sentTroops:troops,defendersLeft:1800,survivors:2200,
    opponentName:i===9?"Lady Eleonora of the Northern Marches":["Lady Maeve","Lord Edric","Thane Rowan"][i%3],
    opponentUid:"benchmark-opponent",occurredAtMs:now-(i+1)*60000,createdAtMs:now-(i+1)*60000,
    scoutPerspective:i===4?"defender":"",expiresAtMs:i===0?now+8*60000:0,
    summary:i===0?"Scout revealed the garrison.":"",
  }));
  state.battleReports=fixtureReports;
  state.reportsViewedAtMs=now-4*60000;reportsViewedPendingAtMs=0;
  battleReportFilter="all";
  onlineRealmActivityEvents=[{eventId:"ledger-realm-1",eventType:"CITADEL_CAPTURED",objectiveId:city.id,objectiveName:"Crown Citadel",regionId:getCityRegionId(city),attackerPlayerId:"benchmark-opponent",attackerPlayerName:"Aldric",attackerClanId:"example-clan",attackerClanName:"The Ashen Stag",defenderPlayerId:"example-defender",defenderPlayerName:"Osric",defenderClanId:"example-clan-2",defenderClanName:"Iron Oath",occurredAtMs:now-240000}];
  clearOnlineServerReportWatcher();
  setOnlineReportSyncState("ready");
  showLogModal({silentAudio:true});
  document.addEventListener("keydown",event=>{
    if(!event.altKey||!event.ctrlKey)return;
    if(event.code==="KeyR")showLogModal({silentAudio:true,preserveScrollTop:getBattleReportListScrollTop()});
    if(event.code==="KeyD")setOnlineReportSyncState("ready");
    if(event.code==="KeyE"){state.battleReports=[];showLogModal({silentAudio:true});}
    if(event.code==="KeyS"){state.battleReports=fixtureReports;showLogModal({silentAudio:true});}
  });
  const controls=document.createElement("div");
  controls.id="reportsRuntimeControls";
  controls.style="position:fixed;bottom:0;left:0;z-index:999999;background:#e8dbb8;padding:3px;display:flex;gap:5px";
  for(const [label,action] of [
    ["Open reports",()=>showLogModal({silentAudio:true})],
    ["Refresh list",()=>showLogModal({silentAudio:true,preserveScrollTop:getBattleReportListScrollTop()})],
    ["Empty",()=>{state.battleReports=[];showLogModal({silentAudio:true});}],
    ["Restore examples",()=>{state.battleReports=fixtureReports;showLogModal({silentAudio:true});}],
    ["Reconnect",()=>setOnlineReportSyncState("reconnecting")],
  ]) { const button=document.createElement("button");button.textContent=label;button.onclick=action;controls.append(button); }
  document.body.append(controls);
  document.documentElement.dataset.reportsRuntimeReady="true";
})();
