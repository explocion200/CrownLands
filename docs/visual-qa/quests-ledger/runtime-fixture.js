/* Local benchmark only. Exercises the actual renderer/action wiring with synthetic receipts. */
(async function () {
  if (!['127.0.0.1','localhost'].includes(location.hostname) || !window.__CROWNLANDS_BENCHMARK__) throw Error('Local benchmark required');
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== 'ready') {
    if (Date.now() > deadline) throw Error('Benchmark did not initialize');
    await new Promise(resolve => setTimeout(resolve,100));
  }
  const params = new URLSearchParams(location.search), sample = params.get('sample') || 'mixed';
  let current = structuredClone(window.QuestReviewSamples.standard);
  current.resetsAtMs = Date.now() + 8*3600000; current.serverTimeMs = Date.now();
  current.missions.forEach((m,i)=>{m.progress=i===1?0:m.target;m.completedAtMs=i===1?0:Date.now();m.claimedAtMs=i===2?Date.now():0;});
  if (sample === 'last' || sample === 'legacy') {
    current.missions.forEach((m,i)=>{m.progress=m.target;m.completedAtMs=Date.now();m.claimedAtMs=i<2?Date.now():0;});
    if(sample === 'legacy') current.allCompletedGearBoxAwardedAtMs=Date.now();
  }
  saveGame=()=>{};queueOnlineSave=()=>{};supportsDailyMissions=()=>true;
  window.questRuntimeCalls=[];
  let fail = params.get('error') === '1';
  const dailySample = await (await fetch('/docs/visual-qa/daily-login-cycle/runtime-sample.json')).json();
  dailyLoginRewardStatus = normalizeDailyLoginRewardStatus({...dailySample,nextDay:7,earnedThroughDay:7,nextClaimOrdinal:7,pendingCount:1,eligible:true});
  getOnlineApi=()=>({isSignedIn:()=>true,getDailyMissionStatus:async()=>({dailyMissionState:current,serverTimeMs:Date.now()}),
    getDailyLoginRewardStatus:async()=>({dailyLoginRewardStatus}),
    claimDailyMissionReward:async request=>{
      window.questRuntimeCalls.push({action:'claim',...request});
      await new Promise(resolve=>setTimeout(resolve,250));
      if(fail){fail=false;throw Error('Connection interrupted. Please retry.');}
      const m=current.missions.find(m=>m.id===request.missionId);
      if(!m||m.progress<m.target)throw Error('Quest not complete');
      const replayed=Boolean(m.claimedAtMs);m.claimedAtMs=Date.now();
      const box=!current.allCompletedGearBoxAwardedAtMs&&current.missions.every(m=>m.claimedAtMs)?1:0;
      if(box)current.allCompletedGearBoxAwardedAtMs=Date.now();
      return {claimed:true,replayed,receipt:{rewardType:m.reward.type,lockedAmount:m.reward.lockedAmount,commonGearBoxes:box},dailyMissionState:structuredClone(current)};
    },rerollDailyMission:async request=>{
      window.questRuntimeCalls.push({action:'replace',...request});
      const index=current.missions.findIndex(m=>m.id===request.missionId);
      const replacement=window.QuestReviewSamples.replacements.standard[request.missionId];
      if(index<0||!current.rerollsRemaining||!replacement)throw Error('Replacement unavailable');
      current.missions[index]=structuredClone(replacement);current.rerollsRemaining=0;
      return {rerolled:true,dailyMissionState:structuredClone(current)};
    }});
  dailyMissionState=normalizeDailyMissionState(current);dailyMissionStatusLoading=false;dailyMissionError='';
  showDailyLoginRewardsModal({initialTab:'quests',skipRefresh:true});
  document.documentElement.dataset.questRuntimeReady='true';
})();
