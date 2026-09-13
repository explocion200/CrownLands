/* Actual-game review with synthetic data and in-memory services. Never included in release artifacts. */
(async function () {
  if (location.hostname !== "127.0.0.1" || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now() > deadline) throw Error("Benchmark did not initialize");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const query = new URLSearchParams(location.search), uid = getCurrentOnlineUid(), now = Date.now();
  const sample = query.get("sample"), role = query.get("role") || "leader";
  state.character.level = sample === "locked" ? 9 : 76;
  state.gold = sample === "poor" ? 1200 : 1850000;
  state.clanId = "review-house"; state.clanRole = role;
  state.clanName = "House of the Golden Stag"; state.clanTag = "STAG";
  clanSnapshot = { id:state.clanId, status:"active", name:state.clanName, tag:state.clanTag, description:"By oath and by oak, we hold the northern marches. Stand together, share the harvest, and answer the call of the realm.", totalKingPower:12864500, memberCount:26, admissionMode:"approval", shield: { ...CLAN_HERALDRY_CONFIG.DEFAULT_V2, charge:"stag", primary:"#304e3e", secondary:"#d8bd78" } };
  if (sample === "legacy") clanSnapshot.shield = { version:1, shape:"heater", division:"solid", primary:"#7a2638", secondary:"#d8bd78", symbol:"castle" };
  clanMembers = Array.from({length:26},(_,i)=>({uid:i ? `review-member-${i}` : uid,displayName:i ? ["Rowan Ashford","Elowen Vale","Cedric Stone","Mira Fenwick"][i%4]+(i>4?` ${i}`:"") : "Aldric",role:i===0?role:i<3?"officer":"member",kingPower:600000-i*11000,joinedAtMs:now-10*86400000,lastLoginAtMs:now-i*7200000,flag:state.flag}));
  clanApplications = [{uid:"review-applicant",displayName:"Bryn Oakheart",kingPower:152000,flag:state.flag},{uid:"review-applicant-2",displayName:"Owen Reed",kingPower:132000,flag:state.flag}];
  clanApplicationsError = sample === "applications-error" ? "Applications could not be loaded. Try again shortly." : "";
  clanMemberRewards = {pendingGiftGoldMinutes:150,lastGiftSentAtMs:sample === "cooldown"?now:0,giftCountSent:31,giftCountReceived:48,giftGoldMinutesClaimed:720,questClaims:{}};
  clanGiftActivity = {recentDonations:clanMembers.slice(1,11).map((m,i)=>({donorUid:m.uid,donorName:m.displayName,sentAtMs:now-(i+1)*3600000}))};
  getCurrentClanQuestProgress = () => ({captureCount:850,milestoneUnlocks:Object.fromEntries(CLAN_QUEST_REWARDS.filter(r=>r.captures<=850).map(r=>[r.id,now-86400000]))});
  const claims = {};
  getCurrentClanQuestClaims = () => claims;
  if (sample === "late") clanMembers[0].joinedAtMs = now;
  clanTreasuryClanId = state.clanId;
  clanTreasuryStatus = {treasury:{balance:264500,totalDonated:354500,totalSpent:90000},allowance:{dailyCap:360000,remaining:325000,donatedToday:35000,locked:true,rawGoldPerHourSnapshot:30000}};
  if(sample === "treasury-unavailable") clanTreasuryStatus=null;
  loadClanTreasuryStatus = async () => clanTreasuryStatus;
  const source = getAllOwnedCitiesForDisplay()[0];
  onlineClanRallies = [0,1,2].map((n)=>({id:`review-rally-${n}`,status:"forming",leaderUid:n?"review-member-1":uid,leaderName:n?"Rowan Ashford":"Aldric",targetId:`review-objective-${n}`,targetName:["Greywatch Stronghold","Crown Citadel","Western Stronghold"][n],targetRegionId:getCityRegionId(source),assemblyCityId:source.id,assemblyCityName:source.name,assemblyRegionId:getCityRegionId(source),assemblyX:source.x,assemblyY:source.y,participants:[{uid:n?"review-member-1":uid,ownerName:n?"Rowan Ashford":"Aldric",role:"leader",status:"assembled",troops:80000},{uid:"review-member-4",ownerName:"Cedric Stone",status:n===0&&sample!=="ready"?"inbound":"assembled",troops:50000,arrivesAtMs:now+240000}]}));
  if(sample === "empty") {onlineClanRallies=[];clanApplications=[];clanGiftActivity.recentDonations=[];clanMemberRewards.pendingGiftGoldMinutes=0;}
  refreshClanState = async () => {}; saveGame = () => {}; queueOnlineSave = () => {};
  const originalApi = getOnlineApi();
  const record = (name) => { document.documentElement.dataset.clanLastMockAction=name; };
  const api = {...originalApi,
    loadClan:async()=>clanSnapshot,loadClanMembers:async()=>clanMembers,
    joinClanRally:async()=>{record("joinClanRally");return {};},
    launchClanRally:async({rallyId})=>{record("launchClanRally");return {rally:{...onlineClanRallies.find(r=>r.id===rallyId),status:"launched"}};},
    cancelClanRally:async({rallyId})=>{record("cancelClanRally");return {rally:{...onlineClanRallies.find(r=>r.id===rallyId),status:"cancelled"}};},
    sendClanGift:async()=>{record("sendClanGift");return {recipientCount:25,memberRewards:{lastGiftSentAtMs:Date.now(),giftCountSent:32}};},
    claimClanGiftPool:async()=>{record("claimClanGiftPool");return {claimed:true,productionMinutes:150,reward:75000,gold:state.gold+75000,memberRewards:{pendingGiftGoldMinutes:0,giftGoldMinutesClaimed:870}};},
    claimClanQuestReward:async({rewardId})=>{record("claimClanQuestReward");claims[rewardId]=true;return {rewardId,rewardType:"gold",reward:15000,gold:state.gold+15000};},
    donateClanTreasuryGold:async({amount})=>{record("donateClanTreasuryGold");if(amount>clanTreasuryStatus.allowance.remaining||amount>state.gold)throw Error("Donation exceeds your available Gold or daily allowance.");return {balance:clanTreasuryStatus.treasury.balance+amount,totalDonated:clanTreasuryStatus.treasury.totalDonated+amount,totalSpent:90000,gold:state.gold-amount,allowance:{...clanTreasuryStatus.allowance,remaining:clanTreasuryStatus.allowance.remaining-amount,donatedToday:clanTreasuryStatus.allowance.donatedToday+amount}};},
    promoteClanMember:async({targetUid})=>{record("promoteClanMember");return {targetUid,role:"officer"};},
    demoteClanOfficer:async({targetUid})=>{record("demoteClanOfficer");return {targetUid,role:"member"};},
    reviewClanApplication:async({applicantUid,accept})=>{record("reviewClanApplication");const application=clanApplications.find(m=>m.uid===applicantUid);clanApplications=clanApplications.filter(m=>m.uid!==applicantUid);if(accept&&application)clanMembers.push({...application,role:"member",joinedAtMs:now});return {};},
    kickClanMember:async({targetUid})=>{record("kickClanMember");clanMembers=clanMembers.filter(m=>m.uid!==targetUid);return {};},
    updateClanProfile:async(data)=>{record("updateClanProfile");clanSnapshot={...clanSnapshot,...data,heraldryRevision:1};return {ok:true,nameChanged:!!data.name,gold:state.gold-(data.name?500000:0),clan:clanSnapshot};},
    searchClans:async()=>clanSearchResults,
    createClan:async(data)=>{record("createClan");state.clanId="review-created";state.clanRole="leader";clanSnapshot={...clanSnapshot,...data,id:state.clanId};return {clan:clanSnapshot,gold:state.gold-100000};}
  };
  getOnlineApi = () => api;
  clanSearchResults = Array.from({length:5},(_,i)=>({...clanSnapshot,id:`review-search-${i}`,name:["The Silver Wolves","House Emberfall","Keepers of the Vale","The Iron Oath","Dawnwatch"][i],tag:"ALLY",admissionMode:i%2?"open":"approval",memberCount:i===4?30:12+i}));
  if(sample === "discover" || sample === "create"){state.clanId="";clanSnapshot=null;}
  clanNavigationClanId = state.clanId;
  activeClanMobileSection = query.get("section") || "overview";
  activeClanRewardSection = query.get("reward") || "gifts";
  activeClanBrowserSection = sample === "create" ? "create" : "discover";
  clanUiLoading=false;
  showProfileScreen();showProfileClan();
  activeClanMobileSection = query.get("section") || "overview";
  activeClanBrowserSection = sample === "create" ? "create" : "discover";
  renderClanView();
  if (sample === "order") {
    // Route geometry is synthetic; the production order renderer and numeric/slider handlers run unchanged.
    const from = {...source, x:100, y:100, troops:80000};
    const target = {...source, id:"review-assembly", name:"Greywatch Keep", x:150, y:150, owner:"enemy", ownerUid:"review-member-1"};
    selectedTroopAmount=40000;
    scheduleAuthoritativeRoutePreviewRefresh = () => {};
    activeRallyOrderContext={mode:"join",rallyId:"review-rally-1",target};
    showTroopSliderModalWithRoute(from,target,{points:[{x:100,y:100},{x:150,y:150}],length:70,previewStatus:"authoritative",authoritativeDurationSeconds:240,authoritativeRequestedTroops:40000},{orderKind:"rally_join"});
  }
  document.documentElement.dataset.clanRuntimeReady="true";
})();
