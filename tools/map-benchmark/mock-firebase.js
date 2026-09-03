(function installCrownlandsBenchmarkFirebaseAdapter() {
  "use strict";

  const fixture = window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  if (!fixture || location.hostname !== "127.0.0.1") {
    throw new Error("The Crownlands benchmark Firebase adapter is loopback-only.");
  }

  const benchmarkMainRegionId = fixture.primaryRegionId;
  const benchmarkMainCity = (fixture.citiesByRegion[benchmarkMainRegionId] || [])
    .find(city => city.ownerUid === fixture.player.uid && city.isMainCity === true);
  if (!benchmarkMainCity?.id) {
    throw new Error("The Crownlands benchmark fixture is missing its player-owned main city.");
  }
  const benchmarkMainCityId = benchmarkMainCity.id;
  const benchmarkMainIslandId = `${fixture.releaseConfig.worldId}-${benchmarkMainRegionId}`;
  const benchmarkProfileStorageKey = `crownlands-benchmark-profile-${fixture.benchmarkSeed}-${fixture.scenario.id}`;
  const query = new URLSearchParams(location.search);
  const stabilityFault = String(query.get("stabilityFault") || "").trim();
  const stabilityFaultTarget = String(query.get("stabilityFaultTarget") || "").trim();
  const stabilityFaultDelayMs = Math.max(0, Math.min(15000, Math.floor(Number(query.get("stabilityFaultDelayMs")) || 0)));
  const stabilityFaultOnce = query.get("stabilityFaultOnce") !== "false";
  const consumedFaults = new Set();
  const phaseMarks = new Set();
  const benchmarkNow = () => globalThis.performance?.now?.() ?? Date.now();

  function markPhaseOnce(name, detail = {}) {
    if (phaseMarks.has(name)) return;
    phaseMarks.add(name);
    window.__CROWNLANDS_BENCHMARK_INSTRUMENTATION__?.markPhase?.(name, detail);
  }

  function readStoredProfile() {
    try {
      const raw = window.sessionStorage?.getItem(benchmarkProfileStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function writeStoredProfile(profile = null) {
    if (!profile || typeof profile !== "object") return false;
    try {
      const merged = { ...(readStoredProfile() || {}), ...profile };
      window.sessionStorage?.setItem(benchmarkProfileStorageKey, JSON.stringify(merged));
      return true;
    } catch (_error) {
      return false;
    }
  }

  const activeListeners = new Map();
  const lifecycle = [];
  const eventTraffic = [];
  const writes = [];
  const operations = [];
  const islandHandlers = new Map();
  const retiredIslandHandlers = new Map();
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
  markPhaseOnce("session-activation-ready");

  function regionIdFromIsland(islandId) {
    const value = String(islandId || "");
    const shardedPrefix = `${fixture.releaseConfig.worldId}--`;
    if (value.startsWith(shardedPrefix)) {
      const suffix = value.slice(shardedPrefix.length);
      const separatorIndex = suffix.indexOf("--");
      const regionId = separatorIndex > 0 ? suffix.slice(separatorIndex + 2) : "";
      if (fixture.citiesByRegion[regionId]) return regionId;
    }
    const legacyPrefix = `${fixture.releaseConfig.worldId}-`;
    const regionId = value.startsWith(legacyPrefix) ? value.slice(legacyPrefix.length) : "";
    return fixture.citiesByRegion[regionId] ? regionId : fixture.primaryRegionId;
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

  function shouldApplyFault(name) {
    if (!stabilityFault || (stabilityFaultTarget && stabilityFaultTarget !== name)) return false;
    if (stabilityFaultOnce && consumedFaults.has(name)) return false;
    consumedFaults.add(name);
    return true;
  }

  function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function scheduleSnapshot(name, callback) {
    const markedCallback = () => {
      if (name === "subscribeIsland") markPhaseOnce("first-city-snapshot");
      callback();
    };
    if (stabilityFault === "delayed-snapshot" && (!stabilityFaultTarget || stabilityFaultTarget === name)) {
      window.setTimeout(markedCallback, stabilityFaultDelayMs || 1000);
      return;
    }
    queueMicrotask(markedCallback);
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
    init: async () => {
      markPhaseOnce("firebase-initialized");
      return true;
    },
    isConfigured: () => true,
    isReady: () => true,
    isSignedIn: () => {
      markPhaseOnce("authentication-ready");
      return true;
    },
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
      ...fixture.realmContract,
      worldTopology: fixture.releaseConfig.worldTopology,
      serverBuildId: "phase-0-benchmark",
      serverTimeMs: Date.now(),
      authoritativeRoutesVersion: 1,
      bulkOrdersVersion: 1,
      siegeCombatVersion: 1,
      defenseCombatVersion: 1,
      realmActivityVersion: 1,
      dailyMissionVersion: 0,
      seasonalAchievementVersion: 0,
      capabilities: { ...(fixture.realmContract.capabilities || {}) },
    }),
    loadPlayerProfile: async () => ({
      uid: fixture.player.uid,
      playerName: fixture.player.displayName,
      displayName: fixture.player.displayName,
      resetGeneration: fixture.releaseConfig.resetGeneration,
      worldId: fixture.releaseConfig.worldId,
      mainRegionId: benchmarkMainRegionId,
      mainIslandId: benchmarkMainIslandId,
      mainCityId: benchmarkMainCityId,
      mainCityAssignmentVersion: 2,
      gold: 5000000,
      lastSeenAtMs: fixture.fixedEpochMs,
      ...(readStoredProfile() || {}),
    }),
    loadGameSnapshot: async () => readStoredProfile(),
    loadPlayerGlobalStats: async () => ({ victories: 12, defeats: 3, citiesCaptured: 20 }),
    loadIslandCitySummary: async islandId => {
      const regionId = regionIdFromIsland(islandId);
      const cities = fixture.citiesByRegion[regionId] || [];
      return { cityCount: cities.length, regularCityCount: cities.length, neutralCityCount: cities.filter(city => !city.ownerUid).length };
    },
    loadIslandCities: async islandId => fixture.citiesByRegion[regionIdFromIsland(islandId)] || [],
    loadOwnedCitiesAcrossIslands: async () => Object.entries(fixture.citiesByRegion).flatMap(([regionId, cities]) => (
      cities
        .filter(city => city.ownerUid === fixture.player.uid)
        .map(city => ({ ...city, islandId: `${fixture.releaseConfig.worldId}-${regionId}` }))
    )),
    loadPlayerIdentities: async () => [],
    loadServerReports: async () => [],
    ensureMainIsland: async () => ({ seeded: true }),
    repairMainCityAssignment: async () => ({
      ok: true,
      repairedMainCity: false,
      requiresStartingCityClaim: false,
      mainCityRecoveryStatus: "valid",
      currentUser: {
        mainCityId: benchmarkMainCityId,
        mainRegionId: benchmarkMainRegionId,
        mainIslandId: benchmarkMainIslandId,
      },
    }),

    subscribeIsland(islandId, handlers = {}) {
      const regionId = regionIdFromIsland(islandId);
      const cityRows = fixture.citiesByRegion[regionId] || [];
      const campRows = fixture.campsByRegion[regionId] || [];
      const unsubscribe = subscribeLogical(`region.${regionId}`, "region", 4);
      islandHandlers.set(islandId, handlers);
      retiredIslandHandlers.delete(islandId);
      scheduleSnapshot("subscribeIsland", () => {
        recordEvent(`region.${regionId}.cities`, cityRows);
        handlers.onCities?.(cityRows);
        recordEvent(`region.${regionId}.camps`, campRows);
        handlers.onCamps?.(campRows);
        recordEvent(`region.${regionId}.armies`, []);
        handlers.onArmies?.([]);
        const presence = [{ uid: fixture.player.uid, playerName: fixture.player.displayName, displayName: fixture.player.displayName, updatedAtMs: Date.now(), mainCityId: benchmarkMainCityId }];
        recordEvent(`region.${regionId}.presence`, presence);
        handlers.onPresence?.(presence, []);
      });
      return () => {
        const retiredHandlers = islandHandlers.get(islandId);
        if (retiredHandlers) retiredIslandHandlers.set(islandId, retiredHandlers);
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
    saveGameSnapshot: async profile => writeStoredProfile(profile),
    savePlayerProfile: async profile => writeStoredProfile(profile),
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
    __emitIslandError(islandId, source = "cities", message = "Injected realtime listener failure") {
      const handlers = islandHandlers.get(islandId);
      if (!handlers) return false;
      handlers.onError?.(new Error(String(message)), String(source));
      return true;
    },
    __emitRetiredIslandCities(islandId, cities = []) {
      const handlers = retiredIslandHandlers.get(islandId);
      if (!handlers) return false;
      handlers.onCities?.(cities);
      return true;
    },
    __getBenchmarkTelemetry() {
      return {
        listeners: listenerSnapshot(),
        lifecycle: [...lifecycle],
        eventTraffic: [...eventTraffic],
        writes: [...writes],
        operations: [...operations],
        storedProfile: readStoredProfile(),
      };
    },
    __closeBaselineListeners() {
      baselineUnsubscribers.forEach(unsubscribe => unsubscribe());
    },
  };

  [
    "getRealmInfo",
    "joinGameServer",
    "heartbeatGameServer",
    "loadPlayerProfile",
    "loadGameSnapshot",
    "loadPlayerGlobalStats",
    "repairMainCityAssignment",
    "ensureMainIsland",
    "loadIslandCities",
    "loadOwnedCitiesAcrossIslands",
  ].forEach(name => {
    const original = api[name];
    if (typeof original !== "function") return;
    api[name] = async function benchmarkOperation(...args) {
      const startedAt = benchmarkNow();
      try {
        const applyFault = shouldApplyFault(name);
        if (applyFault && stabilityFault === "slow-call") await delay(stabilityFaultDelayMs || 1000);
        if (applyFault && stabilityFault === "rejected-call") {
          throw new Error(`Injected ${name} rejection`);
        }
        const result = await original.apply(this, args);
        if (applyFault && stabilityFault === "response-loss") {
          throw new Error(`Injected ${name} response loss`);
        }
        operations.push({
          name,
          status: "fulfilled",
          durationMs: benchmarkNow() - startedAt,
          request: args[0] && typeof args[0] === "object" ? {
            islandId: String(args[0].islandId || ""),
            regionId: String(args[0].regionId || ""),
          } : typeof args[0] === "string" ? { value: args[0] } : null,
          result: result && typeof result === "object" ? {
            resetGeneration: String(result.resetGeneration || ""),
            mainRegionId: String(result.mainRegionId || result.currentUser?.mainRegionId || ""),
            mainCityId: String(result.mainCityId || result.currentUser?.mainCityId || ""),
            rowCount: Array.isArray(result) ? result.length : null,
          } : null,
        });
        if (name === "getRealmInfo") markPhaseOnce("realm-verified");
        if (name === "joinGameServer") markPhaseOnce("membership-joined");
        if (name === "loadPlayerProfile") markPhaseOnce("profile-loaded");
        return result;
      } catch (error) {
        operations.push({
          name,
          status: "rejected",
          durationMs: benchmarkNow() - startedAt,
          error: String(error?.message || error),
        });
        throw error;
      }
    };
  });

  window.CrownlandsOnline = Object.freeze(api);
})();
