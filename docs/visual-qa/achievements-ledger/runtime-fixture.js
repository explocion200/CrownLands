/* Local benchmark only: real game renderer and claim wiring, synthetic server responses. */
(async function () {
  if (!['127.0.0.1','localhost'].includes(location.hostname) || !window.__CROWNLANDS_BENCHMARK__) throw Error('Local benchmark required');
  const deadline=Date.now()+60000;
  while(window.__CROWNLANDS_BENCHMARK__.getStatus().status!=='ready'){
    if(Date.now()>deadline)throw Error('Benchmark did not initialize');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const params=new URLSearchParams(location.search);
  let current=structuredClone(window.AchievementReviewSamples.mixed),fail=params.has('fail');
  const now=new Date(Date.now());
  current.monthKey=now.toISOString().slice(0,7);
  current.seasonEndsAtMs=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1);current.serverTimeMs=Date.now();
  if(params.get('sample')==='item'){
    const item=current.achievements.find(a=>a.id==='master_of_strongholds');
    item.progress=item.target;item.completedAtMs=Date.now();item.lockedReward={...item.rewardSpec,lockedAmount:1};
  }
  if(params.get('sample')==='expired')current.seasonEndsAtMs=Date.now()-1;
  saveGame=()=>{};queueOnlineSave=()=>{};supportsSeasonalAchievements=()=>true;
  const dailySample=await(await fetch('/docs/visual-qa/daily-login-cycle/runtime-sample.json')).json();
  dailyLoginRewardStatus=normalizeDailyLoginRewardStatus(dailySample);
  dailyMissionState=normalizeDailyMissionState(window.QuestReviewSamples.standard);
  const events=document.createElement('output');events.id='achievementRuntimeEvents';events.hidden=true;document.body.append(events);
  let claimCalls=0;
  getOnlineApi=()=>({isSignedIn:()=>true,
    getDailyLoginRewardStatus:async()=>({dailyLoginRewardStatus}),
    getDailyMissionStatus:async()=>({dailyMissionState}),
    getSeasonalAchievementStatus:async()=>({seasonalAchievementState:structuredClone(current),serverTimeMs:Date.now()}),
    claimSeasonalAchievementReward:async request=>{
      claimCalls++;events.textContent=JSON.stringify({claimCalls,seasonId:request.seasonId,achievementId:request.achievementId,hasRequestId:Boolean(request.requestId)});
      await new Promise(resolve=>setTimeout(resolve,400));
      if(fail){fail=false;throw Error('Connection interrupted. Please retry.');}
      if(request.seasonId!==current.seasonId||Date.now()>=current.seasonEndsAtMs)throw Error('Season ended');
      const a=current.achievements.find(a=>a.id===request.achievementId);
      if(!a?.completedAtMs)throw Error('Achievement incomplete');
      const replayed=Boolean(a.claimedAtMs);a.claimedAtMs=Date.now();
      return {claimed:true,replayed,receipt:{...a.lockedReward,rewardType:a.lockedReward.type},seasonalAchievementState:structuredClone(current)};
    }
  });
  seasonalAchievementState=normalizeSeasonalAchievementState(current,Date.now());seasonalAchievementStatusLoading=false;seasonalAchievementError='';
  showDailyLoginRewardsModal({initialTab:'achievements',skipRefresh:true});
  document.documentElement.dataset.achievementRuntimeReady='true';
})();
