/* Exercise production presentation and dispatch with isolated data, without a backend or account. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "game.js"), "utf8");
function production(name, next) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  const end = source.indexOf(`function ${next}(`, start);
  assert(start >= 0 && end > start, `Locate production ${name}`);
  return source.slice(start, end).replace(/async\s*$/, "");
}
const actions = [];
const context = vm.createContext({
  state:{clanId:"house",clanRole:"leader"},clanMembers:[{uid:"self",role:"leader",displayName:"Aldric"},{uid:"ally",role:"member",displayName:"Rowan"}],
  clanApplications:[{uid:"applicant",displayName:"Bryn"}],clanApplicationsError:"",clanUiLoading:false,
  activeClanRewardSection:"gifts",selectedClanRallyId:"",selectedClanMemberUid:"",clanLedgerConfirmationOpen:false,
  renderClanGiftPanel:()=>"GIFT_CONTENT",renderClanQuestPanel:()=>"QUEST_CONTENT",renderClanTreasuryPanel:()=>"TREASURY_CONTENT",
  renderClanView:()=>{},clanContent:{querySelector:()=>null},focusClanNavigationButton:()=>{},setClanMobileSection:section=>actions.push(["section",section]),
  isClanSectionActive:()=>true,getCurrentOnlineUid:()=>"self",formatNumber:String,escapeHtml:value=>String(value).replaceAll('<','&lt;').replaceAll('"','&quot;'),
  cleanName:String,clanRoleLabel:String,normalizeTimestampMs:Number,formatClanMemberLastLogin:()=>"Recently",
  renderClanMemberFlag:()=>"FLAG",renderClanApplicantFlag:()=>"FLAG",renderPlayerNameLink:(uid,name)=>`<button data-player-profile-uid="${uid}">${name}</button>`,
  runClanAction:async(action,payload)=>actions.push([action,payload]),confirmClanLedgerAction:async()=>true,
  runClanSocialAction:(...args)=>actions.push(args),CLAN_RALLY_MIN_PARTICIPANTS:2,CLAN_RALLY_MAX_PARTICIPANTS:20,
  rallyActionRequests:new Set(),getRenderableArmies:()=>[],getOnlineArmyResolutionId:army=>army.id,isRecallHornEligible:()=>true,
  getRegionLabel:()=>"The Crown Marches",formatDuration:String,
});
for(const [name,next] of [
  ["isHoldingTowerTarget","getTroopOrderSourceById"],
  ["renderClanRosterMember","renderClanRenameEditor"], ["renderClanMembersPanel","renderClanRewardsPanel"],
  ["renderClanRewardsPanel","getClanRallyMinimumParticipants"], ["getClanRallyMinimumParticipants","getRallyParticipantForCurrentPlayer"], ["getRallyParticipantForCurrentPlayer","getClanRallyParticipantStatusLabel"],
  ["getClanRallyParticipantStatusLabel","renderClanRallyCard"], ["renderClanRallyCard","renderClanRallyPanel"],
  ["handleClanClick","updateProfileTabHeader"],
]) vm.runInContext(production(name,next),context);
const rallySource=fs.readFileSync(path.join(root,"rallies-activity-ui.js"),"utf8");
vm.runInContext(rallySource.slice(rallySource.indexOf("function renderRallyAssemblyLink("),rallySource.indexOf("async function focusClanRallyAssembly(")),context);
function button(action,extra={}) {return {disabled:false,dataset:{clanAction:action,...extra}};}
async function click(target) {await context.handleClanClick({target:{closest:()=>target},preventDefault(){}});}
async function main() {
  for(const [key,content] of [["gifts","GIFT_CONTENT"],["conquest","QUEST_CONTENT"],["treasury","TREASURY_CONTENT"]]) {
    await click(button("reward-section",{clanReward:key}));
    const html=context.renderClanRewardsPanel();
    assert(html.includes(content));
    assert.equal(["GIFT_CONTENT","QUEST_CONTENT","TREASURY_CONTENT"].filter(c=>html.includes(c)).length,1);
  }
  await click(button("reward-section",{clanReward:"invalid"}));assert.equal(context.activeClanRewardSection,"treasury");
  await click(button("section",{clanSection:"rewards",clanReward:"conquest"}));assert.equal(context.activeClanRewardSection,"conquest");
  await click(button("select-rally",{clanRally:"second"}));assert.equal(context.selectedClanRallyId,"second");
  context.selectedClanMemberUid="ally";
  assert.match(context.renderClanMembersPanel(true,true),/data-clan-action="promote"/);
  assert.match(context.renderClanMembersPanel(false,true),/data-clan-action="accept"/);
  assert.doesNotMatch(context.renderClanMembersPanel(false,true),/data-clan-action="promote"/);
  assert.doesNotMatch(context.renderClanMembersPanel(false,false),/data-clan-action="accept"/);
  assert.match(context.renderClanMembersPanel(false,false),/data-clan-action="leave"/);
  const rally={id:"rally",status:"forming",leaderUid:"self",targetName:'<script>bad</script>',participants:[{uid:"self",status:"assembled",troops:40000},{uid:"ally",status:"inbound",troops:20000}]};
  assert.equal(context.getClanRallyMinimumParticipants({kind:"holdingTower"}),3);
  rally.assemblyCityName='<script>assembly</script>';
  assert.match(context.renderClanRallyCard(rally),/data-rally-action="assembly"/);
  assert.match(context.renderClanRallyCard(rally),/data-rally-action="launch"[^>]*disabled/);
  assert.doesNotMatch(context.renderClanRallyCard(rally),/<script>/);
  rally.participants[1].status="assembled";
  assert.doesNotMatch(context.renderClanRallyCard(rally),/data-rally-action="launch"[^>]*disabled/);
  rally.targetType="tower";
  assert.equal(context.getClanRallyMinimumParticipants(rally),require("../functions/holding-towers").TOWER_MIN_RALLY_MEMBERS);
  assert.match(context.renderClanRallyCard(rally),/data-rally-action="launch"[^>]*disabled/);
  assert.match(context.renderClanRallyCard(rally),/Waiting for 3\+ Ready/);
  rally.participants.push({uid:"third",status:"inbound",troops:1});
  assert.match(context.renderClanRallyCard(rally),/data-rally-action="launch"[^>]*disabled/);
  rally.participants[2].status="assembled";
  assert.doesNotMatch(context.renderClanRallyCard(rally),/data-rally-action="launch"[^>]*disabled/);
  context.state.clanRole="member";rally.leaderUid="other";rally.participants=rally.participants.filter(p=>p.uid!=="self");
  assert.match(context.renderClanRallyCard(rally),/data-rally-action="join"/);
  assert.doesNotMatch(context.renderClanRallyCard(rally),/data-rally-action="launch"/);
  await click({...button("send-gift"),disabled:true});assert(!actions.some(a=>a[0]==="send-gift"));
  context.confirmClanLedgerAction=async()=>false;
  await click(button("kick",{memberId:"ally"}));assert(!actions.some(a=>a[0]==="kick"));
  context.confirmClanLedgerAction=async()=>{context.state.clanId="another-house";return true;};
  await click(button("kick",{memberId:"ally"}));assert(!actions.some(a=>a[0]==="kick"));
  context.state.clanId="house";context.confirmClanLedgerAction=async()=>true;
  await click(button("kick",{memberId:"ally"}));assert(actions.some(a=>a[0]==="kick"&&a[1].targetUid==="ally"));
  vm.runInContext(production("saveClanShieldEditor","formatClanProductionHours"),context);
  let notice="";
  context.getOnlineApi=()=>({updateClanProfile:()=>{throw Error("Unresolved migration must not write");}});
  context.clanShieldSaving=false;context.clanShieldUnresolvedFields=["charge"];
  context.showToast=text=>{notice=text;};
  await context.saveClanShieldEditor();
  assert.match(notice,/unmapped legacy charges/);
  const css=fs.readFileSync(path.join(root,"clan-ledger-ui.css"),"utf8");
  assert(css.includes('#profileScreen #clanContent .clan-section-panel.active'));
  for(const file of ['index.html','service-worker.js','tools/build-production-client.js','tools/generate-release-manifest.js','tools/validate-production-artifact.js']) assert(fs.readFileSync(path.join(root,file),'utf8').includes('clan-ledger-ui.css'),file);
  console.log("Validated Clan reward routing, roster permissions, rally readiness, escaped targets, confirmation cancellation, changed-clan safety, and release wiring.");
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
