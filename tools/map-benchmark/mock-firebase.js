(function installCrownlandsBenchmarkFirebaseAdapter() {
  "use strict";

  const fixture = window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  if (!fixture || location.hostname !== "127.0.0.1") {
    throw new Error("The Crownlands benchmark Firebase adapter is loopback-only.");
  }

  const activeListeners = new Map();
  const lifecycle = [];
  const eventTraffic = [];
  const writes = [];
  const islandHandlers = new Map();
  const chatMessages = {
    global: [
      { id: "benchmark-global-1", channel: "global", channelId: "global", senderUid: "benchmark-ally-1", senderDisplayName: "Lady Maeve", text: "The western road is clear.", createdAtMs: fixture.fixedEpochMs - 120000, status: "visible" },
      { id: "benchmark-global-2", channel: "global", channelId: "global", senderUid: "benchmark-ally-2", senderDisplayName: "Thane Rowan", text: "Scouts reached Ironfall Hills.", createdAtMs: fixture.fixedEpochMs - 60000, status: "visible" },
      { id: "benchmark-global-3", channel: "global", channelId: "global", senderUid: "benchmark-ally-3", senderDisplayName: "Queen Elinor", text: "Hold the eastern crossing.", createdAtMs: fixture.fixedEpochMs - 15000, status: "visible" },
    ],
    clan: [
      { id: "benchmark-clan-1", channel: "clan", channelId: "benchmark-clan", senderUid: "benchmark-ally-4", senderDisplayName: "Marshal Alden", text: "Reinforcements are ready.", createdAtMs: fixture.fixedEpochMs - 45000, status: "visible" },
    ],
  };
  let listenerSequence = 0;

  function recordEvent(source, documents, detail = {}) {
    eventTraffic.push({
      atMs: Date.now(),
      source,
      documentCount: Array.isArray(documents) ? documents.length : documents == null ? 0 : 1,
      ...detail,
    });
  }

  function subscribeLogical(key, category, count = 1) {
    const ids = [];
    for (let index = 0; index < count; index += 1) {
      const id = `listener-${++listenerSequence}`;
      const entry = { id, key: count > 1 ? `${key}.${index + 1}` : key, category, startedAtMs: Date.now() };
      activeListeners.set(id, entry);
      lifecycle.push({ action: "subscribe", ...entry });
      ids.push(id);
    }
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      ids.forEach(id => {
        const entry = activeListeners.get(id);
        if (!entry) return;
        activeListeners.delete(id);
        lifecycle.push({ action: "unsubscribe", ...entry, endedAtMs: Date.now() });
      });
    };
  }

  const baselineUnsubscribers = [
    subscribeLogical("session.active", "player/session"),
    subscribeLogical("player.dailyMission", "player/session"),
    subscribeLogical("player.seasonalAchievement", "player/session"),
  ];

  function regionIdFromIsland(islandId) {
    const suffix = String(islandId || "").split("-").pop();
    return fixture.citiesByRegion[suffix] ? suffix : fixture.primaryRegionId;
  }

  function listenerSnapshot() {
    const entries = [...activeListeners.values()];
    const categories = entries.reduce((result, entry) => {
      result[entry.category] = (result[entry.category] || 0) + 1;
      return result;
    }, {});
    const keyCounts = entries.reduce((result, entry) => {
      result[entry.key] = (result[entry.key] || 0) + 1;
      return result;
    }, {});
    return {
      active: entries.length,
      categories,
      duplicates: Object.entries(keyCounts).filter(([, count]) => count > 1).map(([key, count]) => ({ key, count })),
      entries,
      subscribedTotal: lifecycle.filter(entry => entry.action === "subscribe").length,
      unsubscribedTotal: lifecycle.filter(entry => entry.action === "unsubscribe").length,
    };
  }

  function emptySubscription(key, category, handlers, callbackName, payload = []) {
    const unsubscribe = subscribeLogical(key, category);
    queueMicrotask(() => {
      recordEvent(key, payload);
      handlers?.[callbackName]?.(payload);
    });
    return unsubscribe;
  }

  const membership = {
    serverId: "crown-marches",
    serverName: "The Crown Marches",
    status: "active",
    admittedAtMs: fixture.fixedEpochMs,
    lastSeenAtMs: fixture.fixedEpochMs,
    updatedAtMs: fixture.fixedEpochMs,
  };

  const api = {
    init: async () => true,
    isConfigured: () => true,
    isReady: () => true,
    isSignedIn: () => true,
    getUser: () => ({ ...fixture.player }),
    getLastError: () => null,
    usesServerArmyAuthority: () => true,
    usesServerEconomyAuthority: () => false,
    isRewardedAdSecurityReady: () => false,
    isPushSupported: () => false,
    getNotificationPermission: () => "denied",
    hasNotificationVapidKey: () => false,

    joinGameServer: async () => membership,
    heartbeatGameServer: async () => membership,
    leaveGameServer: async () => ({ ...membership, status: "left" }),
    subscribeGameServerMembership(handlers = {}) {
      const unsubscribe = subscribeLogical("session.gameServerMembership", "player/session");
      queueMicrotask(() => {
        recordEvent("session.gameServerMembership", membership);
        handlers.onMembership?.(membership);
      });
      return unsubscribe;
    },

    getRealmInfo: async () => ({
      releaseId: fixture.releaseConfig.releaseId,
      resetGeneration: fixture.releaseConfig.resetGeneration,
      worldId: fixture.releaseConfig.worldId,
      contractHash: fixture.releaseConfig.apiContractHash,
      serverBuildId: "phase-0-benchmark",
      serverTimeMs: Date.now(),
      authoritativeRoutesVersion: 1,
      bulkOrdersVersion: 1,
      siegeCombatVersion: 1,
      defenseCombatVersion: 1,
      realmActivityVersion: 1,
      dailyMissionVersion: 0,
      seasonalAchievementVersion: 0,
    }),
    loadPlayerProfile: async () => ({
      uid: fixture.player.uid,
      playerName: fixture.player.displayName,
      displayName: fixture.player.displayName,
      resetGeneration: fixture.releaseConfig.resetGeneration,
      worldId: fixture.releaseConfig.worldId,
      mainRegionId: fixture.primaryRegionId,
      mainIslandId: `${fixture.releaseConfig.worldId}-${fixture.primaryRegionId}`,
      mainCityId: `${fixture.primaryRegionId}_bench_001`,
      mainCityAssignmentVersion: 2,
      gold: 5000000,
      lastSeenAtMs: fixture.fixedEpochMs,
    }),
    loadGameSnapshot: async () => null,
    loadPlayerGlobalStats: async () => ({ victories: 12, defeats: 3, citiesCaptured: 20 }),
    loadIslandCitySummary: async islandId => {
      const regionId = regionIdFromIsland(islandId);
      const cities = fixture.citiesByRegion[regionId] || [];
      return { cityCount: cities.length, regularCityCount: cities.length, neutralCityCount: cities.filter(city => !city.ownerUid).length };
    },
    loadIslandCities: async islandId => fixture.citiesByRegion[regionIdFromIsland(islandId)] || [],
    loadOwnedCitiesAcrossIslands: async () => fixture.citiesByRegion[fixture.primaryRegionId].filter(city => city.ownerUid === fixture.player.uid),
    loadPlayerIdentities: async () => [],
    loadServerReports: async () => [],
    ensureMainIsland: async () => ({ seeded: true }),
    repairMainCityAssignment: async () => ({ currentUser: { mainCityId: `${fixture.primaryRegionId}_bench_001`, mainRegionId: fixture.primaryRegionId } }),

    subscribeIsland(islandId, handlers = {}) {
      const regionId = regionIdFromIsland(islandId);
      const cityRows = fixture.citiesByRegion[regionId] || [];
      const campRows = fixture.campsByRegion[regionId] || [];
      const unsubscribe = subscribeLogical(`region.${regionId}`, "region", 4);
      islandHandlers.set(islandId, handlers);
      queueMicrotask(() => {
        recordEvent(`region.${regionId}.cities`, cityRows);
        handlers.onCities?.(cityRows);
        recordEvent(`region.${regionId}.camps`, campRows);
        handlers.onCamps?.(campRows);
        recordEvent(`region.${regionId}.armies`, []);
        handlers.onArmies?.([]);
        const presence = [{ uid: fixture.player.uid, playerName: fixture.player.displayName, displayName: fixture.player.displayName, updatedAtMs: Date.now(), mainCityId: `${fixture.primaryRegionId}_bench_001` }];
        recordEvent(`region.${regionId}.presence`, presence);
        handlers.onPresence?.(presence, []);
      });
      return () => {
        islandHandlers.delete(islandId);
        unsubscribe();
      };
    },
    subscribePlayerArmies(handlers = {}) {
      const unsubscribe = subscribeLogical("player.armies", "player", 2);
      queueMicrotask(() => {
        recordEvent("player.armies.outgoing", []);
        recordEvent("player.armies.incoming", []);
        handlers.onArmies?.([], "outgoing");
      });
      return unsubscribe;
    },
    subscribePlayerReinforcements(handlers = {}) {
      const unsubscribe = subscribeLogical("player.reinforcements", "player", 2);
      queueMicrotask(() => {
        recordEvent("player.reinforcements", []);
        handlers.onReinforcements?.([]);
      });
      return unsubscribe;
    },
    subscribePlayerCamps: handlers => emptySubscription("player.heldCamps", "player", handlers, "onCamps", []),
    subscribeServerReports: handlers => emptySubscription("player.serverReports", "player", handlers, "onReports", []),
    subscribeRealmActivity: handlers => emptySubscription("global.realmActivity", "global", handlers, "onEvents", []),
    subscribeChatMessages({ channel = "global" } = {}, handlers = {}) {
      const normalizedChannel = channel === "clan" ? "clan" : "global";
      const unsubscribe = subscribeLogical(`chat.${normalizedChannel}`, "chat");
      queueMicrotask(() => {
        const messages = chatMessages[normalizedChannel];
        recordEvent(`chat.${normalizedChannel}`, messages);
        handlers.onMessages?.(messages, {
          initial: true,
          hasMore: false,
          changes: messages.map(message => ({ type: "added", message })),
        });
      });
      return unsubscribe;
    },
    loadOlderChatMessages: async () => [],
    subscribePlayerGlobalStats(handlers = {}) {
      const stats = { victories: 12, defeats: 3, citiesCaptured: 20 };
      const unsubscribe = subscribeLogical("player.globalStats", "player");
      queueMicrotask(() => {
        recordEvent("player.globalStats", stats);
        handlers.onStats?.(stats);
      });
      return unsubscribe;
    },
    subscribeCrownCitadel(_islandId, _citadelId, handlers = {}) {
      const unsubscribe = subscribeLogical("global.crownCitadel", "global");
      queueMicrotask(() => {
        recordEvent("global.crownCitadel", null);
        handlers.onCitadel?.(null);
      });
      return unsubscribe;
    },

    savePresence: async (islandId, payload) => {
      writes.push({ atMs: Date.now(), source: "presence", islandId, payloadSize: JSON.stringify(payload || {}).length });
      return true;
    },
    saveGameSnapshot: async () => true,
    savePlayerProfile: async () => true,
    savePlayerCities: async () => true,
    saveCityState: async () => true,
    saveKingPowerLeaderboardEntry: async () => true,
    updateOwnedCityIdentityAcrossIslands: async () => 0,
    syncPlayerIdentity: async () => true,
    loadClan: async () => null,
    loadClanMembers: async () => [],
    loadClanApplications: async () => [],
    loadClanLeaderboard: async () => [],
    searchClans: async () => [],

    sendArmyOrder: async () => ({ status: "accepted" }),
    resolveArmyOrder: async () => ({ status: "already-resolved" }),
    previewArmyRoute: async () => null,

    __emitIslandArmies(islandId, armies) {
      const handlers = islandHandlers.get(islandId);
      if (!handlers) return false;
      recordEvent(`region.${regionIdFromIsland(islandId)}.armies`, armies, { benchmarkUpdate: true });
      handlers.onArmies?.(armies);
      return true;
    },
    __getBenchmarkTelemetry() {
      return {
        listeners: listenerSnapshot(),
        lifecycle: [...lifecycle],
        eventTraffic: [...eventTraffic],
        writes: [...writes],
      };
    },
    __closeBaselineListeners() {
      baselineUnsubscribers.forEach(unsubscribe => unsubscribe());
    },
  };

  window.CrownlandsOnline = Object.freeze(api);
})();
