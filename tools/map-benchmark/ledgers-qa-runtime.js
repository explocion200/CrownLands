/* Synthetic UI integration fixtures. Appended only by the loopback benchmark server. */
(function installLedgerUiQa() {
  "use strict";
  const query = new URLSearchParams(location.search);
  const surface = query.get('ledgerUi');
  if (!surface) return;
  if (location.hostname !== '127.0.0.1') throw Error('Ledger QA requires the loopback fixture.');
  const run = async () => {
    const started = performance.now();
    while (window.__CROWNLANDS_BENCHMARK__?.getStatus().status !== 'ready') {
      if (performance.now() - started > 30000) throw Error('Ledger fixture did not become ready.');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    window.__CROWNLANDS_BENCHMARK__.closeModal();
    const uid = getCurrentOnlineUid();
    const mode = query.get('sample') || 'owned';
    const entries = Array.from({ length: 100 }, (_, i) => ({
      uid: i === 26 ? uid : `ledger-qa-${i}`, displayName: `Ruler ${i + 1} of Wyvernmarket`,
      kingPower: (100 - i) * 12845577, cityCount: 42 - i % 23, mainRegionId: getActiveOnlineRegionId(),
      updatedAtMs: Date.now() - 180000, kingPowerVersion: KING_POWER_AUTHORITY_VERSION,
      flag: state.flag, clanId: 'ledger-qa-clan', clanName: 'The Amber Wardens', clanTag: 'AMBR',
      worldId: ONLINE_WORLD_ID, resetGeneration: RESET_GENERATION,
    }));
    const clans = entries.map((entry, i) => ({ id: i === 26 ? 'ledger-qa-clan' : `ledger-clan-${i}`, name: `The Wardens of Greyfen ${i + 1}`, tag: 'WARD', memberCount: 18, totalKingPower: entry.kingPower * 3 }));
    const history = entries.map((entry, i) => ({ playerId: entry.uid, playerName: entry.displayName, totalHeldMs: (100 - i) * 3600000, worldId: ONLINE_WORLD_ID, resetGeneration: RESET_GENERATION }));
    window.CrownlandsOnline = { ...window.CrownlandsOnline,
      loadKingPowerLeaderboard: async () => mode === 'empty' ? [] : entries,
      loadKingPowerPresenceLeaderboard: async () => [],
      loadClanLeaderboard: async () => mode === 'empty' ? [] : clans,
      loadStrongholdLegacyLeaderboard: async strongholdId => mode === 'legacy-error' ? Promise.reject(Error('Synthetic ledger error')) : mode === 'legacy-empty' ? [] : history.map(row => ({ ...row, strongholdId })),
      loadCrownCitadelReignLeaderboard: async () => mode === 'legacy-error' ? Promise.reject(Error('Synthetic ledger error')) : mode === 'legacy-empty' ? [] : history,
    };
    if (surface === 'players' || surface === 'clans') {
      state.clanId = 'ledger-qa-clan';
      showLeaderboardModal();
      if (surface === 'clans') modalBody.querySelector('[data-leaderboard-tab="clans"]').click();
    } else if (surface === 'maps') {
      showIslandSwitcherModal();
    } else {
      const kind = query.get('holding') || 'gold';
      const names = { gold:'Aurum Keep', training:'Greybanner Hold', speed:'Swiftgate', defense:'Ironwatch', crown:'Crown Citadel' };
      const city = state.cities.find(isStronghold) || state.cities.find(c => c.owner === 'player');
      Object.assign(city, { kind:'stronghold', strongholdType:kind, name:names[kind], level:kind === 'crown' ? 100 : 50,
        owner:mode === 'enemy' || mode === 'ally' ? 'enemy' : mode === 'neutral' ? 'neutral' : 'player',
        ownerKind:mode === 'neutral' ? 'neutral' : 'player', ownerUid:mode === 'enemy' || mode === 'ally' ? 'ledger-foreign-ruler' : mode === 'neutral' ? '' : uid,
        ownerName:'Alden of the Amber Ward', troops:3250000, troopFloat:3250000, lastCapturedAtMs:Date.now() - 66420000,
      });
      if (kind === 'crown') { onlineCrownCitadelLoaded = true; onlineCrownCitadelSnapshot = city; }
      showCityInfoModal(city.id);
      if (mode.startsWith('legacy-')) modalBody.querySelectorAll('[role="tab"]')[1].click();
    }
    toast.classList.remove('visible');
    document.documentElement.dataset.ledgerQa = 'ready';
  };
  run().catch(error => { document.documentElement.dataset.ledgerQa = 'error'; console.error(error); });
})();
