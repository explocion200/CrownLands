/* Local benchmark page only: synthetic status and API receipts, no production writes. */
(async function () {
  const sample = await (await fetch('/docs/visual-qa/daily-login-cycle/runtime-sample.json')).json();
  while (window.__CROWNLANDS_BENCHMARK__?.getStatus().status !== 'ready') await new Promise(resolve => setTimeout(resolve, 100));
  const params = new URLSearchParams(location.search);
  if(params.get('transition')) Object.assign(sample, {schedule: sample.transitionSchedule, transition: true, cycleId: 'transition-review', monthLengthDays: 31, cycleLengthDays: 31});
  const day = Math.max(1, Math.min(sample.schedule.length, Number(params.get('day')) || 7));
  let current = { ...sample, nextDay: day, earnedThroughDay: day, nextClaimOrdinal: day, totalClaims: day - 1,
    eligible: true, pendingCount: 1, dayKey: new Date().toISOString().slice(0,10), serverTimeMs: Date.now() };
  saveGame = () => {}; queueOnlineSave = () => {};
  isOnlineWorldActive = () => true;
  getCurrentOnlineUid = () => 'daily-login-local-review';
  getHarvestBonusBaseRates = () => ({ goldPerHour: 12500, troopsPerHour: 25000 });
  window.dailyLoginFixtureCalls = [];
  getOnlineApi = () => ({ isSignedIn: () => true, getDailyLoginRewardStatus: async () => ({ dailyLoginRewardStatus: current }),
    claimDailyLoginReward: async request => {
      window.dailyLoginFixtureCalls.push(request);
      if (params.get('error')) throw new Error('Connection interrupted. Try again.');
      if (request.expectedCycleId !== current.cycleId || request.expectedOrdinal !== current.nextClaimOrdinal) throw new Error('Stale reward');
      const reward = current.schedule[current.nextDay - 1];
      const receipt = { ...reward, cycle: current.cycle, cycleId: current.cycleId, monthLengthDays: 28,
        dayKey: current.dayKey, claimId: request.claimId, ordinal: current.nextClaimOrdinal, gold: reward.goldHours * 12500,
        troops: reward.troopHours * 25000, claimedAtMs: Date.now(), targetCityId: '' };
      current = { ...current, nextDay: Math.min(28, current.nextDay + 1), nextClaimOrdinal: current.nextClaimOrdinal + 1,
        pendingCount: 0, eligible: false, totalClaims: current.totalClaims + 1, lastReceipt: receipt };
      return { claimed: true, receipt, dailyLoginRewardStatus: current };
    } });
  dailyLoginRewardStatus = normalizeDailyLoginRewardStatus(current);
  dailyLoginRewardStatusLoading = false;
  dailyLoginRewardClaimInFlight = false;
  showDailyLoginRewardsModal({ skipRefresh: true });
})();
