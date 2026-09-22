const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const client = read("game.js");
function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const end = source.indexOf("\nfunction ", start + 9);
  return source.slice(start, end < 0 ? source.length : end);
}
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const context = vm.createContext({
  window: {}, escapeHtml: esc, formatNumber: value => String(value),
  getRegionLabel: region => region, clamp: (n,min,max) => Math.min(max,Math.max(min,n)),
  formatWallIntegrity: value => `${value / 100}%`, renderCrownlandsIcon: () => "",
  renderBattleKingdomFlag: key => `<span data-battle-participant-flag="${esc(key)}"></span>`,
  renderPlayerNameLink: (uid,name) => `<strong data-player-uid="${esc(uid)}">${esc(name)}</strong>`,
  getBattleReportTypeLabel: type => `${type} report`, renderBattleReportAge: () => '<time data-report-occurred-at-ms="123">14m ago</time>',
  renderBattleReportLocateButton: (_report,cls) => `<button class="${cls}" data-report-jump="target">Map</button>`,
  getBattleReportCampReward: report => report.campReward || null,
  getShopItemById: () => null, renderItemIcon: () => "",
});
for (const name of ["formatBattleReportValue","getBattleTargetTypeLabel","getDetailedBattleSideParticipants"]) vm.runInContext(functionSource(client,name),context);
vm.runInContext(functionSource(read("common-gear-ui.js"),"getBattleSideBonusEntries"),context);
vm.runInContext(read("battle-report-detail-ui.js"),context);
const ui = context.window.CrownlandsBattleReportUI;
const attacker = {role:"attacker",flagKey:"attacker",primary:{ownerUid:"a",ownerName:'Aldric <script>alert("x")</script>'},participantSummary:"2 attacking armies",startingTroops:80000,basePower:100000,basePowerHelp:"1.25 base per troop",finalPower:122000,losses:20000,survivors:60000,skillLabel:"Swordmastery",skillBonusPower:20000,skillPercentText:"+20%",gearLabel:"War Captain gear",gearBonusPower:2000,gearPercentText:"+2%",casualtyRecovery:{sourceLabel:"Barracks casualty recovery",gearRecoveredTroops:1000,gearPercent:5}};
const defender = {role:"defender",flagKey:"defender",primary:{ownerUid:"d",ownerName:"Maeve"},participantSummary:"1 garrison + 1 reinforcements",startingTroops:20000,basePower:26000,basePowerHelp:"1.30 base per soldier",finalPower:66130,losses:20000,survivors:0,wallPower:35450,wallHelp:"Stoneworks +5811 · Gatehouse gear +581",wallAfter:"Breached — 0%",reinforcementCount:1,reinforcementTroops:5000,skillLabel:"Shieldwall Discipline",skillBonusPower:2600,skillPercentText:"+10%",personalObjectiveBonusPower:1300,sharedClanBonusPower:520,wallStoneworksPower:5811,wallStoneworksPercent:20,gearLabel:"Defensive Commander gear",gearBonusPower:260,gearPercentText:"+1%",wallGearPower:581,wallGearPercent:2};
const options = {report:{type:"attack",cityName:"Thornfield",xpAwarded:850,goldAwarded:12000,fieldMedicsRecovered:6000,troopsAwarded:1500},badge:{tone:"victory",label:"VICTORY"},left:attacker,right:defender,defender,viewerRole:"attacker",target:{name:"Thornfield & Watch",targetType:"city",level:2,regionId:"Northgate"},siege:{startingIntegrityBps:10000,endingIntegrityBps:0,repairWindowMinutes:16},resultLabel:"Captured the holding"};
const before=JSON.stringify(options), html=ui.render(options);
assert.equal(JSON.stringify(options),before,"Rendering mutates settled report values");
for(const text of ["122000","66130","80000","60000","35450","5000","Swordmastery","Shieldwall Discipline","Personal objective support","Clan objective support","Stoneworks","War Captain gear","Defensive Commander gear","Gatehouse wall gear","+1000 recovered","16 minute repair window","+850","+12000","+6000","+1500","75% combined cap"]) assert(html.includes(text),`Missing recorded field: ${text}`);
assert(html.includes("Thornfield &amp; Watch"));
assert(html.includes("&lt;script&gt;"));
assert(!html.includes("<script>"),"Ruler content injected markup");
assert(html.includes('data-report-jump="target"') && html.includes('data-report-occurred-at-ms="123"'),"Navigation or age hooks lost");
const defenseHtml=ui.render({...options,report:{...options.report,type:"defense"},left:defender,right:attacker,viewerRole:"defender",badge:{tone:"defeat",label:"DEFEAT"}});
assert(defenseHtml.indexOf('data-player-uid="d"')<defenseHtml.indexOf('data-player-uid="a"'),"Defense viewer is not on the left");
assert(defenseHtml.includes("#defense-defeat"),"Defensive defeat lost the red shield");
assert(ui.render({...options,report:{type:"defense"},badge:{tone:"victory",label:"HELD"}}).includes('#defense"'),"Held defense lost its olive shield");
const legacy=ui.render({...options,left:{...attacker,basePower:"Not recorded",bonusRecorded:false,gearBonusPower:0,casualtyRecovery:null},message:"Participant statistics unavailable"});
assert(legacy.includes("Not recorded") && legacy.includes("Participant statistics unavailable"));
const rally=ui.render({...options,snapshot:{attackers:[{ownerName:"Aldric",ownerUid:"a",role:"leader",startingTroops:30000,losses:7500,survivors:22500,effectivePower:45750},{ownerName:"Rowan",ownerUid:"r",role:"participant",startingTroops:50000,losses:12500,survivors:37500,effectivePower:76250}]}});
for(const text of ["Rally creator","Clan participant","45750","76250","22500","37500"]) assert(rally.includes(text),text);
for(const [reward,expected] of [
  [{rewardType:"gold",amount:27000},["+27000"]],
  [{rewardType:"troops",amount:11000},["+11000"]],
  [{rewardType:"city",cityName:"Willowmere",cityRegionName:"The Crownlands"},["Willowmere","The Crownlands"]],
  [{rewardType:"item",itemId:"common_gear_box",itemName:"Common Gear Box",itemQuantity:2},["Common Gear Box","×2","item-common-gear-box-192x192-d31500be5747.webp"]],
]) {
  const camp=ui.render({...options,report:{...options.report,campReward:reward},target:{targetType:"camp",name:"Warband Camp"},right:{...defender,wallFree:true},defender:{...defender,wallFree:true}});
  for(const text of expected) assert(camp.includes(text),`Camp reward: ${text}`);
  assert(!camp.includes('id="battleDetail-walls"') && !camp.includes("Wall power at battle"),"Camp invented wall details");
  assert(!camp.includes("+850"),"Camp payout duplicated generic rewards");
}
const forecast='<details class="battle-forecast-changes"><summary>Defense changed after scouting</summary></details>';
assert(ui.render({...options,forecast}).includes(forecast),"Existing forecast disclosure lost");
const loading=ui.loading({type:"attack",cityName:"Thornfield"},options.badge);
assert(loading.includes('role="status"') && loading.includes('id="battleReportBackBtn"') && loading.includes("data-detail-close"));
assert(!loading.includes("data-report-jump") && !loading.includes("122000"),"Loading fabricated settled data");
console.log("Validated full-report values, viewer order, escaping, historical fallback, gear, rally, all camp rewards, red defense shield, and navigation hooks.");
const towerSnapshot = require("./validate-clan-tower-battle-reports").snapshot;
for (const viewerUid of towerSnapshot.participantUids) {
  const before = JSON.stringify(towerSnapshot);
  const result = ui.render({...options, snapshot:towerSnapshot, target:towerSnapshot.target,
    viewerUid, viewerRole:viewerUid.startsWith("attacker") ? "attacker" : "defender"});
  assert.equal(JSON.stringify(towerSnapshot),before,"Personal ordering changed the shared snapshot");
  assert.equal(/data-tower-participant="([^"]+)"/.exec(result)[1],viewerUid);
  assert(result.indexOf('data-detail-section="participants"') < result.indexOf('data-detail-section="summary"'));
  assert.equal((result.match(/data-tower-participant=/g)||[]).length,6);
  for (const text of ["You","Attack power","Defense power","Casualties","19,292","5,000 defense power separately"]) assert(result.includes(text),text);
  assert(!result.includes('data-detail-section="rally"'),"Tower participants were duplicated as a second rally roster");
}
