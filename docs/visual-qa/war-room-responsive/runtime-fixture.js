/* Fictional accounts only; exercises production War Room renderers and handlers. */
(async () => {
  if (location.hostname !== "127.0.0.1" || !window.__CROWNLANDS_BENCHMARK__) throw Error("Loopback benchmark required");
  while (document.documentElement.dataset.clanRuntimeReady !== "true") await new Promise(resolve => setTimeout(resolve, 50));
  const uid = getCurrentOnlineUid(), source = getAllOwnedCitiesForDisplay()[0], now = Date.now();
  window.warQA = { uid, source, calls: [], held: false, resolve: null };
  const baseApi = getOnlineApi();
  getOnlineApi = () => ({ ...baseApi,
    getBossRallyReadiness: async ({rallyId}) => {
      warQA.calls.push('readiness');
      const rally = onlineClanRallies.find(row => row.id === rallyId);
      return { rallyUpdatedAtMs: rally.updatedAtMs, participants: rally.participants.map(p => ({uid:p.uid,ready:true})) };
    },
    launchClanRally: async data => {
      warQA.calls.push('launch');
      if (warQA.held) await new Promise(resolve => { warQA.resolve = resolve; });
      return baseApi.launchClanRally(data);
    },
  });
  onlineClanRallies = Array.from({length:5}, (_, n) => ({
    id:`war-fixture-${n}`,clanId:state.clanId,status:'forming',leaderUid:uid,leaderName:'Aldric',
    targetName:['Clan Boss · Lv. 100','Greywatch Stronghold','Crown Citadel','Western Clan Tower','Eastwatch Stronghold'][n],
    targetType:n===0?'marauder':n===3?'tower':'city',targetBalanceVersion:2,targetId:`war-target-${n}`,targetRegionId:getCityRegionId(source),
    assemblyCityId:source.id,assemblyCityName:source.name,assemblyRegionId:getCityRegionId(source),assemblyX:source.x,assemblyY:source.y,updatedAtMs:now,
    participants:Array.from({length:n===0?5:20},(_,i)=>({
      uid:i?`war-member-${i}`:uid,ownerName:['Aldric','Rowan Ashford','Elowen Vale','Cedric Stone','Mira Fenwick'][i%5]+(i>4?` ${i}`:''),
      role:i?'ally':'leader',status:i===1||i===4?'inbound':'assembled',troops:[728000,22000000,6400000,2100000,4800000][i%5],arrivesAtMs:now+82000,
    })),
  }));
  selectedClanRallyId='';clanWarroomSheet='';activeClanMobileSection='warroom';renderClanView();
  toast.classList.remove('visible');
  document.documentElement.dataset.warReady='true';
})();
