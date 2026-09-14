/* Local actual-game UI review. Synthetic snapshots; never packaged for production. */
(async function () {
  if (!["127.0.0.1","localhost"].includes(location.hostname) || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline=Date.now()+60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now()>deadline) throw Error("Benchmark did not initialize");
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const target=state.cities.find(city=>city.owner !== "player") || state.cities[0], uid=getCurrentOnlineUid();
  const examples=["victory","defeat","held","breach","raid","rally","camp","camp-gold","camp-troops","camp-item","camp-city","citadel","long","legacy","unavailable","loading"];
  const snapshots=new Map();
  function make(sample) {
    const attack={ownerUid:uid,ownerName:"Aldric",ownerFlag:state.flag,startingTroops:80000,losses:20000,survivors:60000,effectivePower:122000,swordmasteryPercent:20,gearAttackStrengthPercent:2,powerBreakdown:{baseAttackPower:100000,swordmasteryBonusPower:20000,gearAttackStrengthBonusPower:2000}};
    const defense={ownerUid:"detail-opponent",ownerName:"Lady Maeve",ownerFlag:state.flag,startingTroops:15000,losses:15000,survivors:0,shieldwallDisciplinePercent:10,gearDefenderStrengthPercent:1,powerBreakdown:{baseTroopDefensePower:19500,baseDefenseBonusPower:0,shieldwallDisciplineBonusPower:1950,gearDefenderStrengthBonusPower:195}};
    const reinforcement={ownerUid:"detail-ally",ownerName:"Thane Rowan",startingTroops:5000,losses:5000,survivors:0,shieldwallDisciplinePercent:10,gearDefenderStrengthPercent:1,powerBreakdown:{baseTroopDefensePower:6500,baseDefenseBonusPower:0,shieldwallDisciplineBonusPower:650,gearDefenderStrengthBonusPower:65}};
    const snapshot={defenseCombatVersion:DEFENSE_COMBAT_VERSION,outcome:"victory",attacker:attack,defender:defense,reinforcements:[reinforcement],target:{name:"Thornfield",level:2,regionId:getCityRegionId(target),targetType:"city",fortifications:{stoneworksPercent:20,gearWallStrengthPercent:2}},siege:{startingIntegrityBps:10000,endingIntegrityBps:0,startingWallPower:35450,repairWindowMinutes:16},totals:{attackers:80000,defenders:20000,attackPower:122000,defensePower:66130,attackerLosses:20000,attackerSurvivors:60000,defenderLosses:20000,defenderSurvivors:0,defensePowerBreakdown:{baseWallPower:29058,stoneworksWallBonusPower:5811,gearWallStrengthBonusPower:581,personalObjectiveBonusPower:1300,sharedClanBonusPower:520}},gearEffects:{attacker:{attackStrength:{bonusPower:2000,bonusPercent:2,sourceLabel:"War Captain gear"},casualtyRecovery:{sourceLabel:"Barracks casualty recovery",gearRecoveredTroops:1000,gearPercent:5}},defender:{defenderStrength:{bonusPower:260,bonusPercent:1,sourceLabel:"Defensive Commander gear"},wallStrength:{bonusPower:581,bonusPercent:2}}}};
    const report={id:`detail-${sample}`,battleId:`detail-battle-${sample}`,type:"attack",outcome:"victory",cityId:target.id,cityName:"Thornfield",cityLevel:2,regionId:getCityRegionId(target),targetType:"city",opponentUid:"detail-opponent",opponentName:"Lady Maeve",opponentFlag:state.flag,occurredAtMs:Date.now()-840000,sentTroops:80000,survivors:60000,attackerLosses:20000,defenderLosses:20000,defendersLeft:0,totalDefense:66130,xpAwarded:850,goldAwarded:12000,fieldMedicsRecovered:6000,troopsAwarded:1500};
    if (["defeat","held","citadel"].includes(sample)) {
      Object.assign(report,{type:"defense",outcome:"lost",cityName:"Oakbridge",opponentName:"Lord Edric",goldAwarded:0,fieldMedicsRecovered:0,troopsAwarded:0});
      Object.assign(attack,{ownerUid:"detail-opponent",ownerName:"Lord Edric"}); Object.assign(defense,{ownerUid:uid,ownerName:"Aldric"}); snapshot.target.name=report.cityName;
    }
    if (sample === "held") { report.outcome="held"; snapshot.outcome="defeat"; Object.assign(snapshot.totals,{attackPower:30500,defenderLosses:0,defenderSurvivors:20000});snapshot.siege.endingIntegrityBps=1400; }
    if (sample === "breach") { report.outcome="breach"; snapshot.outcome="breach";snapshot.combatRule={id:"protected_breach",captureAllowed:false};Object.assign(snapshot.totals,{defenderLosses:0,defenderSurvivors:20000}); }
    if (sample === "raid") { report.outcome="raid";snapshot.combatRule={id:"protected_raid",captureAllowed:false};snapshot.siege.endingIntegrityBps=10000;snapshot.siege.repairWindowMinutes=0; }
    if (sample === "rally") { snapshot.target.strongholdType="attack"; snapshot.attackers=[{...attack,role:"leader",startingTroops:30000,losses:7500,survivors:22500,effectivePower:45750},{...attack,role:"participant",ownerUid:"detail-rally-ally",ownerName:"Thane Rowan",startingTroops:50000,losses:12500,survivors:37500,effectivePower:76250}]; }
    if (sample.startsWith("camp")) {
      report.targetType="camp";report.cityName="Warband Camp";Object.assign(snapshot.target,{name:report.cityName,targetType:"camp",fortifications:{}});snapshot.siege=null;snapshot.reinforcements=[];
      Object.assign(defense,{startingTroops:20000,ownerName:"Neutral garrison",ownerUid:"",powerBreakdown:{baseTroopDefensePower:20000,baseDefenseBonusPower:0},shieldwallDisciplinePercent:0,gearDefenderStrengthPercent:0});Object.assign(snapshot.totals,{defensePower:20000,defensePowerBreakdown:{}});snapshot.gearEffects.defender={};
      const type=sample.slice(5);
      if(type) { report.type="defense";report.outcome="held";report.battleId="";report.campReward={rewardType:type,amount:type === "gold" ? 20000 : type === "troops" ? 10000 : 1,...(type === "item" ? {itemId:"common_gear_box",itemName:"Common Gear Box",itemQuantity:1} : type === "city" ? {cityId:target.id,cityName:"Willowmere",cityRegionId:getCityRegionId(target),cityRegionName:"The Crownlands"} : {})}; }
    }
    if (sample === "citadel") { report.eventKind=CITADEL_ASSAULT_EVENT_KIND;Object.assign(attack,{ownerName:"Citadel Legion",ownerUid:""});snapshot.siege.wallDefenseIgnored=true;snapshot.siege.endingIntegrityBps=10000; }
    if (sample === "long") { report.cityName="The Watchtower of Saint Bartholomew";snapshot.target.name=report.cityName;attack.ownerName="Lady Eleonora of the Northern Marches";defense.ownerName="Lord Maximilian of the Silver Company";Object.assign(snapshot.totals,{attackers:8000000,defenders:2000000,attackPower:12200000,defensePower:6638000,attackerLosses:2000000,attackerSurvivors:6000000,defenderLosses:2000000}); }
    if (sample === "victory") report.launchCombatForecast={version:COMBAT_FORECAST_VERSION,status:"scouted",targetOwnerUid:defense.ownerUid,ownerTroops:10000,reinforcementTroops:0,defensePower:40000,powerRatio:3,expectedOutcome:"capture"};
    if (sample === "legacy") report.battleId="";
    snapshots.set(report.battleId,snapshot);
    return report;
  }
  const reports=examples.map(make);
  loadDetailedBattleSnapshot=async report=>{if(report.id === "detail-loading")return new Promise(()=>{});if(report.id === "detail-unavailable")throw Error("Example snapshot unavailable");return snapshots.get(report.battleId);};
  clearOnlineServerReportWatcher(); state.battleReports=reports;setOnlineReportSyncState("ready");
  const picker=document.createElement("select");picker.id="detailRuntimeExample";picker.setAttribute("aria-label","Runtime report example");picker.style="position:fixed;top:0;right:0;z-index:999999;height:22px;font:11px Arial;background:#e8dbb8;color:#352f23";
  picker.innerHTML=examples.map(name=>`<option value="${name}">${name}</option>`).join("");
  picker.addEventListener("change",()=>showBattleReportDetail(`detail-${picker.value}`));modal.append(picker);
  await showBattleReportDetail("detail-victory");
  document.documentElement.dataset.detailRuntimeReady="true";
})();
