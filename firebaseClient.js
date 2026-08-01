(function () {
  const FIREBASE_VERSION = "10.12.5";
  const REQUIRED_CONFIG_KEYS = ["apiKey", "authDomain", "projectId", "appId"];
  const ACTIVE_SESSION_STORAGE_KEY = "crownlands-active-session-id";
  const GAME_INSTALLATION_STORAGE_KEY = "crownlands-game-installation-id-v1";
  const GAME_INSTALLATION_REFRESH_MS = 6 * 60 * 60 * 1000;
  const PLAYER_NAME_MAX_LENGTH = 18;
  const DEFAULT_GAME_SERVER_ID = "crown-marches";
  const REALM_CONFIG = window.CROWNLANDS_REALM_CONFIG || {};
  const RESET_GENERATION = String(REALM_CONFIG.resetGeneration || "fresh-2026-07-26-server-reset");
  const ONLINE_WORLD_ID = String(REALM_CONFIG.worldId || `main-${RESET_GENERATION}`);
  const APP_RELEASE_ID = String(REALM_CONFIG.releaseId || "");
  const ROYAL_PEACE_SHIELD_ITEM_ID = "shield_12h";

  const client = {
    configured: false,
    ready: false,
    user: null,
    error: null,
    app: null,
    auth: null,
    db: null,
    functions: null,
    appCheck: null,
    messaging: null,
    provider: null,
    modules: null,
    initPromise: null,
    pushPromise: null,
    serviceWorkerRegistration: null,
    notificationToken: "",
    notificationTokenId: "",
    foregroundPushListenerReady: false,
    activeSessionId: "",
    activeSessionUnsubscribe: null,
    sessionReplacementInFlight: false,
    installationRegisteredAtMs: 0,
    installationRegistrationPromise: null,
  };

  function hasRealFirebaseConfig(config) {
    if (!config || typeof config !== "object") return false;
    return REQUIRED_CONFIG_KEYS.every(key => {
      const value = String(config[key] || "").trim();
      return value && !value.startsWith("PASTE_");
    });
  }

  function serializeUser(user) {
    if (!user) return null;
    return {
      uid: user.uid,
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
    };
  }

  function dispatch(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(`crownlands:${name}`, { detail }));
  }

  function cleanPlayerName(value, fallback = "Ruler") {
    const cleaned = String(value || "")
      .replace(/[^a-z0-9 _.-]/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, PLAYER_NAME_MAX_LENGTH);
    return cleaned || fallback;
  }

  function createSessionId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const random = window.crypto?.getRandomValues
      ? Array.from(window.crypto.getRandomValues(new Uint32Array(4))).map(value => value.toString(16)).join("")
      : Math.random().toString(36).slice(2);
    return `session-${Date.now().toString(36)}-${random}`;
  }

  function createGameInstallationId() {
    if (window.crypto?.randomUUID) return `installation-${window.crypto.randomUUID()}`;
    const random = window.crypto?.getRandomValues
      ? Array.from(window.crypto.getRandomValues(new Uint32Array(6))).map(value => value.toString(16).padStart(8, "0")).join("")
      : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    return `installation-${Date.now().toString(36)}-${random}`;
  }

  function getGameInstallationId() {
    try {
      let installationId = String(window.localStorage?.getItem(GAME_INSTALLATION_STORAGE_KEY) || "");
      if (!/^[a-zA-Z0-9_-]{20,160}$/.test(installationId)) {
        installationId = createGameInstallationId();
        window.localStorage?.setItem(GAME_INSTALLATION_STORAGE_KEY, installationId);
      }
      return installationId;
    } catch (_) {
      return createGameInstallationId();
    }
  }

  function getActiveSessionId() {
    if (client.activeSessionId) return client.activeSessionId;
    try {
      client.activeSessionId = window.sessionStorage?.getItem(ACTIVE_SESSION_STORAGE_KEY) || "";
      if (!client.activeSessionId) {
        client.activeSessionId = createSessionId();
        window.sessionStorage?.setItem(ACTIVE_SESSION_STORAGE_KEY, client.activeSessionId);
      }
    } catch (_) {
      client.activeSessionId = client.activeSessionId || createSessionId();
    }
    return client.activeSessionId;
  }

  function getSessionDeviceLabel() {
    const ua = String(navigator.userAgent || "");
    if (/ipad|tablet/i.test(ua)) return "tablet";
    if (/mobi|android|iphone|ipod/i.test(ua)) return "mobile";
    return "desktop";
  }

  function stopActiveSessionWatcher() {
    if (typeof client.activeSessionUnsubscribe === "function") {
      client.activeSessionUnsubscribe();
    }
    client.activeSessionUnsubscribe = null;
  }

  async function signOutForSessionReplacement(remoteSession = {}) {
    if (client.sessionReplacementInFlight) return;
    client.sessionReplacementInFlight = true;
    const replacedUser = client.user;
    stopActiveSessionWatcher();
    dispatch("session-replaced", { user: replacedUser, activeSession: remoteSession });
    try {
      await disablePushNotifications().catch(error => {
        console.warn("Could not disable notifications after session replacement", error);
      });
      if (client.auth && client.modules?.auth?.signOut) {
        await client.modules.auth.signOut(client.auth);
      }
    } catch (error) {
      console.warn("Could not sign out replaced session", error);
    } finally {
      client.user = null;
      client.sessionReplacementInFlight = false;
      dispatch("auth", { user: null, reason: "session-replaced" });
    }
  }

  function startActiveSessionWatcher(uid) {
    stopActiveSessionWatcher();
    if (!uid || !client.db || !client.modules?.firestore?.onSnapshot) return;
    const { doc, onSnapshot } = client.modules.firestore;
    client.activeSessionUnsubscribe = onSnapshot(
      doc(client.db, "players", uid),
      snapshot => {
        if (!snapshot.exists()) return;
        const profile = snapshot.data() || {};
        const isCurrentRealm = String(profile.resetGeneration || "") === RESET_GENERATION
          && String(profile.worldId || "") === ONLINE_WORLD_ID;
        dispatch("player-clan", {
          clanId: isCurrentRealm ? String(profile.clanId || "") : "",
          clanName: isCurrentRealm ? String(profile.clanName || "") : "",
          clanTag: isCurrentRealm ? String(profile.clanTag || "") : "",
          clanRole: isCurrentRealm ? String(profile.clanRole || "") : "",
          pendingClanApplicationId: isCurrentRealm ? String(profile.pendingClanApplicationId || "") : "",
          clanJoinCooldownUntilMs: isCurrentRealm ? timestampToMs(profile.clanJoinCooldownUntilMs) : 0,
        });
        dispatch("daily-login-reward", {
          state: isCurrentRealm && profile.dailyLoginReward && typeof profile.dailyLoginReward === "object"
            ? sanitizeForFirestore(profile.dailyLoginReward)
            : null,
        });
        const activeSession = profile.activeSession || {};
        const remoteSessionId = String(activeSession.id || "");
        const localSessionId = getActiveSessionId();
        if (!remoteSessionId || !localSessionId || remoteSessionId === localSessionId) return;
        signOutForSessionReplacement(activeSession);
      },
      error => {
        console.warn("Active session watcher failed", error);
      }
    );
  }

  async function activateCurrentSession(reason = "login") {
    await init();
    const uid = requireSignedIn();
    if (!uid) return null;
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    const now = Date.now();
    const activeSession = {
      id: getActiveSessionId(),
      device: getSessionDeviceLabel(),
      reason: String(reason || "login").slice(0, 32),
      userAgent: String(navigator.userAgent || "").slice(0, 180),
      loginAtMs: now,
      lastSeenAtMs: now,
    };
    await setDoc(doc(client.db, "players", uid), {
      uid,
      displayName: client.user?.displayName || "",
      email: client.user?.email || "",
      photoURL: client.user?.photoURL || "",
      activeSession,
      lastLoginAt: now,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    startActiveSessionWatcher(uid);
    return activeSession;
  }

  async function loadModules() {
    const [app, auth, firestore, functions, appCheck] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-functions.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-check.js`),
    ]);
    return { app, auth, firestore, functions, appCheck };
  }

  async function loadMessagingModule() {
    await init();
    if (client.modules?.messaging) return client.modules.messaging;
    const messaging = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging.js`);
    client.modules.messaging = messaging;
    return messaging;
  }

  async function init() {
    if (client.initPromise) return client.initPromise;

    client.initPromise = (async () => {
      const config = window.CROWNLANDS_FIREBASE_CONFIG;
      client.configured = hasRealFirebaseConfig(config);

      if (!client.configured) {
        client.ready = true;
        dispatch("online-ready", { configured: false });
        return client;
      }

      try {
        client.modules = await loadModules();
        client.app = client.modules.app.initializeApp(config);
        const appCheckSiteKey = String(config.appCheckSiteKey || "").trim();
        if (appCheckSiteKey && client.modules.appCheck?.initializeAppCheck) {
          client.appCheck = client.modules.appCheck.initializeAppCheck(client.app, {
            provider: new client.modules.appCheck.ReCaptchaEnterpriseProvider(appCheckSiteKey),
            isTokenAutoRefreshEnabled: true,
          });
        }
        client.auth = client.modules.auth.getAuth(client.app);
        client.db = client.modules.firestore.getFirestore(client.app);
        client.functions = client.modules.functions.getFunctions(client.app);
        client.provider = new client.modules.auth.GoogleAuthProvider();

        client.modules.auth.onAuthStateChanged(client.auth, user => {
          client.user = serializeUser(user);
          if (client.user?.uid && !client.sessionReplacementInFlight) {
            activateCurrentSession("auth-state").catch(error => {
              console.warn("Could not activate current session", error);
            });
            registerGameInstallation({ force: true }).catch(error => {
              console.warn("Could not register this Crownlands installation", error);
            });
          } else if (!client.user?.uid) {
            stopActiveSessionWatcher();
            client.installationRegisteredAtMs = 0;
          }
          dispatch("auth", { user: client.user });
        });

        client.ready = true;
        dispatch("online-ready", { configured: true });
      } catch (error) {
        client.error = error;
        client.ready = true;
        dispatch("online-error", { message: error.message || String(error) });
      }

      return client;
    })();

    return client.initPromise;
  }

  function requireSignedIn() {
    if (!client.configured || !client.db || !client.user?.uid) return null;
    return client.user.uid;
  }

  async function callServerFunction(name, payload = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) throw new Error("Sign in to use server multiplayer.");
    if (!client.functions || !client.modules?.functions?.httpsCallable) {
      throw new Error("Firebase Functions did not load.");
    }
    const callable = client.modules.functions.httpsCallable(client.functions, name);
    const result = await callable(sanitizeForFirestore({
      ...payload,
      clientReleaseId: APP_RELEASE_ID,
      clientResetGeneration: RESET_GENERATION,
      clientWorldId: ONLINE_WORLD_ID,
    }) || {});
    return result?.data || null;
  }

  async function callSensitiveServerFunction(name, payload = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) throw new Error("Sign in to use server multiplayer.");
    if (!client.appCheck) {
      throw new Error("Rewarded ads are waiting for Firebase App Check setup.");
    }
    if (!client.functions || !client.modules?.functions?.httpsCallable) {
      throw new Error("Firebase Functions did not load.");
    }
    const callable = client.modules.functions.httpsCallable(
      client.functions,
      name,
      { limitedUseAppCheckTokens: true }
    );
    const result = await callable(sanitizeForFirestore(payload) || {});
    return result?.data || null;
  }

  function createGameServerPayload(serverId = DEFAULT_GAME_SERVER_ID) {
    return {
      serverId: String(serverId || DEFAULT_GAME_SERVER_ID).slice(0, 64),
      sessionId: getActiveSessionId(),
      displayName: cleanPlayerName(client.user?.displayName || "Ruler"),
      releaseId: APP_RELEASE_ID,
      resetGeneration: RESET_GENERATION,
      worldId: ONLINE_WORLD_ID,
    };
  }

  async function registerGameInstallation({ force = false } = {}) {
    const nowMs = Date.now();
    if (
      !force
      && client.installationRegisteredAtMs
      && nowMs - client.installationRegisteredAtMs < GAME_INSTALLATION_REFRESH_MS
    ) {
      return {
        ok: true,
        cached: true,
        registeredAtMs: client.installationRegisteredAtMs,
      };
    }
    if (client.installationRegistrationPromise) return client.installationRegistrationPromise;
    client.installationRegistrationPromise = callServerFunction("registerGameInstallation", {
      installationId: getGameInstallationId(),
    }).then(result => {
      client.installationRegisteredAtMs = Math.max(
        nowMs,
        Number(result?.registeredAtMs) || 0
      );
      return result;
    }).finally(() => {
      client.installationRegistrationPromise = null;
    });
    return client.installationRegistrationPromise;
  }

  async function joinGameServer(serverId = DEFAULT_GAME_SERVER_ID) {
    return callServerFunction("joinGameServer", createGameServerPayload(serverId));
  }

  async function heartbeatGameServer(serverId = DEFAULT_GAME_SERVER_ID) {
    const result = await callServerFunction("heartbeatGameServer", createGameServerPayload(serverId));
    registerGameInstallation().catch(error => {
      console.warn("Could not refresh this Crownlands installation", error);
    });
    return result;
  }

  async function leaveGameServer(serverId = DEFAULT_GAME_SERVER_ID) {
    return callServerFunction("leaveGameServer", createGameServerPayload(serverId));
  }

  function subscribeGameServerMembership(handlers = {}) {
    if (!client.db || !client.modules?.firestore?.onSnapshot || !client.user?.uid) return null;
    const { doc, onSnapshot } = client.modules.firestore;
    return onSnapshot(
      doc(client.db, "players", client.user.uid, "serverMembership", "current"),
      snapshot => {
        if (typeof handlers.onMembership === "function") {
          const membership = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
          handlers.onMembership(
            membership?.resetGeneration === RESET_GENERATION && membership?.worldId === ONLINE_WORLD_ID
              ? membership
              : null
          );
        }
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error);
      }
    );
  }

  async function sendArmyOrder(payload = {}) {
    const result = await callServerFunction("sendArmyOrder", payload);
    if (result?.antiFarmPolicy?.blocked) {
      const error = new Error(result.message || "These kingdoms cannot attack each other right now.");
      error.code = "functions/failed-precondition";
      error.details = { antiFarmPolicy: result.antiFarmPolicy };
      throw error;
    }
    return result;
  }

  async function createClanRally(payload = {}) {
    return callServerFunction("createClanRally", payload);
  }

  async function joinClanRally(payload = {}) {
    return callServerFunction("joinClanRally", payload);
  }

  async function withdrawClanRallyContribution(payload = {}) {
    return callServerFunction("withdrawClanRallyContribution", payload);
  }

  async function launchClanRally(payload = {}) {
    const result = await callServerFunction("launchClanRally", payload);
    if (result?.antiFarmPolicy?.blocked) {
      const error = new Error(result.message || "These kingdoms cannot attack each other right now.");
      error.code = "functions/failed-precondition";
      error.details = { antiFarmPolicy: result.antiFarmPolicy };
      throw error;
    }
    return result;
  }

  async function cancelClanRally(payload = {}) {
    return callServerFunction("cancelClanRally", payload);
  }

  async function previewArmyProtection(payload = {}) {
    return callServerFunction("previewArmyProtection", payload);
  }

  async function resolveArmyOrder(payload = {}) {
    return callServerFunction("resolveArmyOrder", payload);
  }

  async function returnClanReinforcement(payload = {}) {
    return callServerFunction("returnClanReinforcement", payload);
  }

  async function resolveGoldCampPayout(payload = {}) {
    return callServerFunction("resolveGoldCampPayout", payload);
  }

  async function resolveRewardCampPayout(payload = {}) {
    return callServerFunction("resolveRewardCampPayout", payload);
  }

  async function recallRewardCampGarrison(payload = {}) {
    return callServerFunction("recallRewardCampGarrison", payload);
  }

  async function collectEconomy(payload = {}) {
    return callServerFunction("collectEconomy", {
      ...payload,
      sessionId: getActiveSessionId(),
    });
  }

  async function getDailyLoginRewardStatus(payload = {}) {
    return callServerFunction("getDailyLoginRewardStatus", payload);
  }

  async function claimDailyLoginReward(payload = {}) {
    return callServerFunction("claimDailyLoginReward", payload);
  }

  async function getRewardedAdStatus(payload = {}) {
    return callSensitiveServerFunction("getRewardedAdStatus", payload);
  }

  async function prepareRewardedAd(payload = {}) {
    return callSensitiveServerFunction("prepareRewardedAd", {
      ...payload,
      sessionId: getActiveSessionId(),
    });
  }

  async function claimRewardedAd(payload = {}) {
    return callSensitiveServerFunction("claimRewardedAd", {
      ...payload,
      sessionId: getActiveSessionId(),
    });
  }

  async function collectHarvestBonus(payload = {}) {
    return callServerFunction("collectHarvestBonus", payload);
  }

  async function reserveHarvestBonusSpawn(payload = {}) {
    return callServerFunction("reserveHarvestBonusSpawn", payload);
  }

  async function upgradeCity(payload = {}) {
    return callServerFunction("upgradeCity", payload);
  }

  async function spendSkillPoint(payload = {}) {
    return callServerFunction("spendSkillPoint", payload);
  }

  async function resetSkills(payload = {}) {
    return callServerFunction("resetSkills", payload);
  }

  async function repairMainCityAssignment(payload = {}) {
    return callServerFunction("repairMainCityAssignment", payload);
  }

  async function changeMainCity(payload = {}) {
    return callServerFunction("changeMainCity", payload);
  }

  async function syncPlayerIdentity(payload = {}) {
    return callServerFunction("syncPlayerIdentity", payload);
  }

  async function createClan(payload = {}) {
    return callServerFunction("createClan", payload);
  }

  async function updateClanProfile(payload = {}) {
    return callServerFunction("updateClanProfile", payload);
  }

  async function joinOpenClan(payload = {}) {
    return callServerFunction("joinOpenClan", payload);
  }

  async function applyToClan(payload = {}) {
    return callServerFunction("applyToClan", payload);
  }

  async function cancelClanApplication(payload = {}) {
    return callServerFunction("cancelClanApplication", payload);
  }

  async function reviewClanApplication(payload = {}) {
    return callServerFunction("reviewClanApplication", payload);
  }

  async function leaveClan(payload = {}) {
    return callServerFunction("leaveClan", payload);
  }

  async function kickClanMember(payload = {}) {
    return callServerFunction("kickClanMember", payload);
  }

  async function promoteClanMember(payload = {}) {
    return callServerFunction("promoteClanMember", payload);
  }

  async function demoteClanOfficer(payload = {}) {
    return callServerFunction("demoteClanOfficer", payload);
  }

  async function transferClanLeadership(payload = {}) {
    return callServerFunction("transferClanLeadership", payload);
  }

  async function claimInactiveClanLeadership(payload = {}) {
    return callServerFunction("claimInactiveClanLeadership", payload);
  }

  async function disbandClan(payload = {}) {
    return callServerFunction("disbandClan", payload);
  }

  async function sendClanGift(payload = {}) {
    return callServerFunction("sendClanGift", payload);
  }

  async function claimClanGiftPool(payload = {}) {
    return callServerFunction("claimClanGiftPool", payload);
  }

  async function claimClanQuestReward(payload = {}) {
    return callServerFunction("claimClanQuestReward", payload);
  }

  async function loadClan(clanId = "") {
    await init();
    if (!requireSignedIn() || !clanId) return null;
    const { doc, getDoc } = client.modules.firestore;
    const snapshot = await getDoc(doc(client.db, "clans", String(clanId).slice(0, 128)));
    if (!snapshot.exists()) return null;
    const clan = { id: snapshot.id, ...snapshot.data() };
    return clan.resetGeneration === RESET_GENERATION && clan.worldId === ONLINE_WORLD_ID ? clan : null;
  }

  async function searchClans(searchText = "", limitCount = 30) {
    await init();
    if (!requireSignedIn()) return [];
    const { collection, getDocs, query, where, orderBy, limit, startAt, endAt } = client.modules.firestore;
    const safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limitCount) || 30)));
    const normalized = String(searchText || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const base = collection(client.db, "clans");
    const clanQuery = normalized
      ? query(base, where("resetGeneration", "==", RESET_GENERATION), where("worldId", "==", ONLINE_WORLD_ID), where("status", "==", "active"), orderBy("normalizedName"), startAt(normalized), endAt(`${normalized}\uf8ff`), limit(safeLimit))
      : query(base, where("resetGeneration", "==", RESET_GENERATION), where("worldId", "==", ONLINE_WORLD_ID), where("status", "==", "active"), orderBy("normalizedName"), limit(safeLimit));
    const snapshot = await getDocs(clanQuery);
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  }

  async function loadClanMembers(clanId = "") {
    await init();
    if (!requireSignedIn() || !clanId) return [];
    const { collection, getDocs, query, where, orderBy } = client.modules.firestore;
    const snapshot = await getDocs(query(
      collection(client.db, "clans", clanId, "members"),
      where("resetGeneration", "==", RESET_GENERATION),
      where("worldId", "==", ONLINE_WORLD_ID),
      orderBy("joinedAtMs", "asc")
    ));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  }

  async function loadClanApplications(clanId = "") {
    await init();
    if (!requireSignedIn() || !clanId) return [];
    const { collection, getDocs, query, where, orderBy } = client.modules.firestore;
    const snapshot = await getDocs(query(
      collection(client.db, "clans", clanId, "applications"),
      where("resetGeneration", "==", RESET_GENERATION),
      where("worldId", "==", ONLINE_WORLD_ID),
      where("status", "==", "pending"),
      orderBy("createdAtMs", "asc")
    ));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  }

  async function loadClanLeaderboard(limitCount = 100) {
    await init();
    if (!requireSignedIn()) return [];
    const { collection, getDocs, query, orderBy, limit } = client.modules.firestore;
    const snapshot = await getDocs(query(
      collection(client.db, "clanLeaderboards", RESET_GENERATION, "entries"),
      orderBy("totalKingPower", "desc"),
      limit(Math.max(1, Math.min(100, Math.floor(Number(limitCount) || 100))))
    ));
    return snapshot.docs.map((item, index) => ({ id: item.id, rank: index + 1, ...item.data() }));
  }

  function subscribeClanSocialState(clanId = "", handlers = {}) {
    if (!client.db || !client.modules?.firestore?.onSnapshot || !client.user?.uid || !clanId) return () => {};
    const { doc, onSnapshot } = client.modules.firestore;
    const safeClanId = String(clanId).slice(0, 128);
    const unsubscribers = [
      onSnapshot(
        doc(client.db, "clans", safeClanId, "memberRewards", client.user.uid),
        snapshot => {
          if (typeof handlers.onMemberRewards === "function") {
            handlers.onMemberRewards(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
          }
        },
        error => {
          if (typeof handlers.onError === "function") handlers.onError(error, "memberRewards");
        }
      ),
      onSnapshot(
        doc(client.db, "clans", safeClanId, "worldBenefits", RESET_GENERATION),
        snapshot => {
          if (typeof handlers.onWorldBenefits === "function") {
            handlers.onWorldBenefits(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
          }
        },
        error => {
          if (typeof handlers.onError === "function") handlers.onError(error, "worldBenefits");
        }
      ),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  function subscribeClanQuestProgress(clanId = "", questPeriodId = "", handlers = {}) {
    if (
      !client.db
      || !client.modules?.firestore?.onSnapshot
      || !client.user?.uid
      || !clanId
      || !questPeriodId
    ) return () => {};
    const { doc, onSnapshot } = client.modules.firestore;
    const safeClanId = String(clanId).slice(0, 128);
    const safeQuestPeriodId = String(questPeriodId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160);
    return onSnapshot(
      doc(client.db, "clans", safeClanId, "questProgress", safeQuestPeriodId),
      snapshot => {
        if (typeof handlers.onQuestProgress === "function") {
          handlers.onQuestProgress(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        }
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error, "questProgress");
      }
    );
  }

  function subscribeClanApplications(clanId = "", handlers = {}) {
    if (!client.db || !client.modules?.firestore?.onSnapshot || !client.user?.uid || !clanId) return () => {};
    const { collection, onSnapshot, query, where, orderBy } = client.modules.firestore;
    const safeClanId = String(clanId).slice(0, 128);
    return onSnapshot(
      query(
        collection(client.db, "clans", safeClanId, "applications"),
        where("resetGeneration", "==", RESET_GENERATION),
        where("worldId", "==", ONLINE_WORLD_ID),
        where("status", "==", "pending"),
        orderBy("createdAtMs", "asc")
      ),
      snapshot => {
        const applications = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        if (typeof handlers.onApplications === "function") {
          handlers.onApplications(applications, snapshot.docChanges());
        }
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error);
      }
    );
  }

  function subscribeClanRallies(clanId = "", handlers = {}) {
    if (!client.db || !client.modules?.firestore?.onSnapshot || !client.user?.uid || !clanId) return () => {};
    const { collection, onSnapshot, query, where } = client.modules.firestore;
    const safeClanId = String(clanId).slice(0, 128);
    return onSnapshot(
      query(
        collection(client.db, "clans", safeClanId, "rallies"),
        where("resetGeneration", "==", RESET_GENERATION),
        where("worldId", "==", ONLINE_WORLD_ID),
        where("status", "in", ["forming", "launched", "recalling"])
      ),
      snapshot => {
        if (typeof handlers.onRallies !== "function") return;
        handlers.onRallies(
          snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .sort((left, right) => Number(right.createdAtMs || 0) - Number(left.createdAtMs || 0)),
          snapshot.docChanges().map(change => ({
            type: change.type,
            rally: { id: change.doc.id, ...change.doc.data() },
          }))
        );
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error, "rallies");
      }
    );
  }

  function subscribeClanState(clanId = "", handlers = {}) {
    if (!client.db || !client.modules?.firestore?.onSnapshot || !client.user?.uid || !clanId) return () => {};
    const { collection, doc, onSnapshot, query, where, orderBy } = client.modules.firestore;
    const safeClanId = String(clanId).slice(0, 128);
    const unsubscribers = [
      onSnapshot(
        doc(client.db, "clans", safeClanId),
        snapshot => {
          if (typeof handlers.onClan === "function") {
            handlers.onClan(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
          }
        },
        error => {
          if (typeof handlers.onError === "function") handlers.onError(error, "clan");
        }
      ),
      onSnapshot(
        query(
          collection(client.db, "clans", safeClanId, "members"),
          where("resetGeneration", "==", RESET_GENERATION),
          where("worldId", "==", ONLINE_WORLD_ID),
          orderBy("joinedAtMs", "asc")
        ),
        snapshot => {
          if (typeof handlers.onMembers !== "function") return;
          handlers.onMembers(
            snapshot.docs.map(item => ({ id: item.id, ...item.data() })),
            snapshot.docChanges().map(change => ({
              type: change.type,
              member: { id: change.doc.id, ...change.doc.data() },
            }))
          );
        },
        error => {
          if (typeof handlers.onError === "function") handlers.onError(error, "members");
        }
      ),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  async function recalculatePlayerGlobalStats(payload = {}) {
    return callServerFunction("recalculatePlayerGlobalStats", payload);
  }

  async function recalculateAllPlayerGlobalStats(payload = {}) {
    return callServerFunction("recalculateAllPlayerGlobalStats", payload);
  }

  async function getCombatPlayerIdentity(payload = {}) {
    return callServerFunction("getCombatPlayerIdentity", payload);
  }

  async function loadPublicPlayerProfile(uid = "") {
    const playerId = String(uid || "").trim().slice(0, 128);
    if (!playerId) throw new Error("Choose a player to inspect.");
    return callServerFunction("getCombatPlayerIdentity", { uid: playerId, includePublicProfile: true });
  }

  async function getRealmInfo() {
    return callServerFunction("getRealmInfo", {
      releaseId: APP_RELEASE_ID,
      resetGeneration: RESET_GENERATION,
      worldId: ONLINE_WORLD_ID,
    });
  }

  async function ensureMainIsland(payload = {}) {
    return callServerFunction("ensureMainIsland", payload);
  }

  async function claimStartingCity(payload = {}) {
    return callServerFunction("claimStartingCity", payload);
  }

  async function relinquishCity(payload = {}) {
    return callServerFunction("relinquishCity", payload);
  }

  async function activateInventoryItem(payload = {}) {
    return callServerFunction("activateInventoryItem", payload);
  }

  async function useSwiftMarchOrder(payload = {}) {
    return callServerFunction("useSwiftMarchOrder", payload);
  }

  async function useRecallHorn(payload = {}) {
    return callServerFunction("useRecallHorn", payload);
  }

  function usesServerEconomyAuthority() {
    return Boolean(client.functions && client.modules?.functions?.httpsCallable);
  }

  function getNotificationPermission() {
    if (!("Notification" in window)) return "unsupported";
    return window.Notification.permission || "default";
  }

  function getNotificationVapidKey() {
    const configKey = window.CROWNLANDS_FIREBASE_CONFIG?.vapidKey || window.CROWNLANDS_FIREBASE_VAPID_KEY || "";
    return String(configKey || "").trim();
  }

  function hasPushEnvironmentSupport() {
    return Boolean(
      window.isSecureContext
      && "Notification" in window
      && "serviceWorker" in navigator
      && "PushManager" in window
    );
  }

  function isPushSupported() {
    return Boolean(
      hasRealFirebaseConfig(window.CROWNLANDS_FIREBASE_CONFIG)
      && getNotificationVapidKey()
      && hasPushEnvironmentSupport()
    );
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) return "unsupported";
    const currentPermission = getNotificationPermission();
    if (currentPermission !== "default") return currentPermission;
    if (!window.Notification?.requestPermission) return currentPermission;
    const request = window.Notification.requestPermission.bind(window.Notification);
    if (request.length > 0) {
      return new Promise(resolve => request(resolve));
    }
    return request();
  }

  async function hashText(value) {
    const text = String(value || "");
    if (window.crypto?.subtle && window.TextEncoder) {
      const bytes = new TextEncoder().encode(text);
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
    }
    return btoa(text).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 180);
  }

  function normalizePushPayload(payload = {}) {
    const data = payload.data || {};
    const notification = payload.notification || {};
    return {
      title: notification.title || data.title || "",
      body: notification.body || data.body || "",
      kind: data.kind || "",
      type: data.type || "",
      cityId: data.cityId || "",
      armyId: data.armyId || "",
      arrivesAtMs: Number(data.arrivesAtMs) || 0,
      raw: payload,
    };
  }

  async function getServiceWorkerRegistration() {
    if (client.serviceWorkerRegistration) return client.serviceWorkerRegistration;
    if (!("serviceWorker" in navigator)) throw new Error("This browser does not support notifications.");
    const workerUrl = new URL("./service-worker.js", document.baseURI);
    client.serviceWorkerRegistration = await navigator.serviceWorker.register(workerUrl.href);
    return client.serviceWorkerRegistration;
  }

  async function ensureMessaging() {
    await init();
    if (!isPushSupported()) throw new Error("This browser cannot receive notifications.");
    const messagingModule = await loadMessagingModule();
    if (typeof messagingModule.isSupported === "function") {
      const supported = await messagingModule.isSupported();
      if (!supported) throw new Error("Firebase notifications are not supported in this browser.");
    }
    if (!client.messaging) {
      client.messaging = messagingModule.getMessaging(client.app);
    }
    if (!client.foregroundPushListenerReady && messagingModule.onMessage) {
      client.foregroundPushListenerReady = true;
      messagingModule.onMessage(client.messaging, payload => {
        dispatch("push-message", normalizePushPayload(payload));
      });
    }
    return client.messaging;
  }

  async function saveNotificationToken(token, options = {}) {
    const uid = requireSignedIn();
    if (!uid || !token) return null;
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    const tokenId = await hashText(token);
    await setDoc(doc(client.db, "players", uid, "notificationTokens", tokenId), {
      uid,
      token,
      platform: "web",
      userAgent: String(navigator.userAgent || "").slice(0, 240),
      playerName: cleanPlayerName(options.playerName || client.user?.displayName),
      enabled: true,
      lastSeenAtMs: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    client.notificationToken = token;
    client.notificationTokenId = tokenId;
    return tokenId;
  }

  async function removeNotificationToken(token = client.notificationToken, tokenId = client.notificationTokenId) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return false;
    const safeTokenId = tokenId || (token ? await hashText(token) : "");
    if (!safeTokenId) return false;
    const { deleteDoc, doc } = client.modules.firestore;
    await deleteDoc(doc(client.db, "players", uid, "notificationTokens", safeTokenId));
    if (safeTokenId === client.notificationTokenId) {
      client.notificationToken = "";
      client.notificationTokenId = "";
    }
    return true;
  }

  async function enablePushNotifications(options = {}) {
    if (!window.isSecureContext) throw new Error("Open the game with HTTPS to enable notifications.");
    if (!("Notification" in window)) throw new Error("This browser cannot receive notifications.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser cannot receive push notifications.");
    const vapidKey = getNotificationVapidKey();
    if (!vapidKey) throw new Error("Notifications are missing the web push key.");
    let permission = getNotificationPermission();
    if (permission === "default" && !options.skipPermissionRequest) {
      permission = await requestNotificationPermission();
    }
    if (permission !== "granted") throw new Error("Notifications are blocked in this browser.");
    await init();
    const uid = requireSignedIn();
    if (!uid) throw new Error("Sign in to enable notifications.");
    if (!isPushSupported()) throw new Error("This browser cannot receive notifications.");
    const messagingModule = await loadMessagingModule();
    const messaging = await ensureMessaging();
    const registration = await getServiceWorkerRegistration();
    const tokenOptions = { serviceWorkerRegistration: registration };
    if (vapidKey) tokenOptions.vapidKey = vapidKey;
    const token = await messagingModule.getToken(messaging, tokenOptions);
    if (!token) throw new Error("Could not register this browser for notifications.");
    const tokenId = await saveNotificationToken(token, options);
    dispatch("push-notifications", { enabled: true, tokenId });
    return { enabled: true, tokenId, permission };
  }

  async function registerPushNotifications(options = {}) {
    if (getNotificationPermission() !== "granted") return { enabled: false, permission: getNotificationPermission() };
    return enablePushNotifications(options);
  }

  async function disablePushNotifications() {
    await init();
    try {
      if (client.messaging && client.modules?.messaging?.deleteToken) {
        await client.modules.messaging.deleteToken(client.messaging);
      }
    } catch (error) {
      console.warn("Could not delete Firebase push token", error);
    }
    await removeNotificationToken().catch(error => {
      console.warn("Could not remove stored push token", error);
    });
    dispatch("push-notifications", { enabled: false });
    return true;
  }

  function normalizeShopItemsForPurchase(items = {}) {
    const normalized = items && typeof items === "object" ? { ...items } : {};
    normalized[ROYAL_PEACE_SHIELD_ITEM_ID] = Math.max(0, Math.floor(Number(normalized[ROYAL_PEACE_SHIELD_ITEM_ID]) || 0));
    return normalized;
  }

  function normalizeItemPurchaseCooldowns(cooldowns = {}) {
    return cooldowns && typeof cooldowns === "object" ? { ...cooldowns } : {};
  }

  function sanitizeForFirestore(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      return value.map(item => {
        const sanitized = sanitizeForFirestore(item);
        return sanitized === undefined ? null : sanitized;
      });
    }

    const sanitizedObject = {};
    Object.entries(value).forEach(([key, entry]) => {
      const sanitized = sanitizeForFirestore(entry);
      if (sanitized !== undefined) sanitizedObject[key] = sanitized;
    });
    return sanitizedObject;
  }

  async function rememberLogin(reason = "login") {
    return activateCurrentSession(reason).catch(error => {
      console.warn("Could not update login session", error);
      return null;
    });
  }

  function shouldUseRedirectFallback(error) {
    const code = String(error?.code || "");
    return code === "auth/popup-blocked"
      || code === "auth/cancelled-popup-request"
      || code === "auth/operation-not-supported-in-this-environment";
  }

  async function signInWithGoogle() {
    await init();
    if (!client.configured) {
      throw new Error("Firebase config is still using placeholder values.");
    }
    if (client.error) throw client.error;
    try {
      const result = await client.modules.auth.signInWithPopup(client.auth, client.provider);
      client.user = serializeUser(result.user);
      await rememberLogin("google-sign-in");
      return client.user;
    } catch (error) {
      if (shouldUseRedirectFallback(error) && client.modules.auth.signInWithRedirect) {
        await client.modules.auth.signInWithRedirect(client.auth, client.provider);
        return client.user;
      }
      throw error;
    }
  }

  async function signOut() {
    await init();
    if (!client.auth) return;
    await disablePushNotifications().catch(error => {
      console.warn("Could not disable notifications during sign-out", error);
    });
    stopActiveSessionWatcher();
    await client.modules.auth.signOut(client.auth);
    client.user = null;
    dispatch("auth", { user: null });
  }

  async function savePlayerProfile(profile = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return false;
    const { doc, setDoc, serverTimestamp, deleteField } = client.modules.firestore;
    const ref = doc(client.db, "players", uid);
    const cleanProfile = sanitizeForFirestore(profile);
    delete cleanProfile.mainCityId;
    delete cleanProfile.mainIslandId;
    delete cleanProfile.mainRegionId;
    delete cleanProfile.mainCityChangedAtMs;
    delete cleanProfile.lastCityRelinquishedAtMs;
    delete cleanProfile.dailyLoginReward;
    delete cleanProfile.inactivityNotice;
    delete cleanProfile.worldSlotResetAtMs;
    if (cleanProfile.shopItems && typeof cleanProfile.shopItems === "object" && deleteField) {
      cleanProfile.shopItems = {
        ...cleanProfile.shopItems,
        troop_boost_1h: deleteField(),
        anti_scout_1h: deleteField(),
      };
    }
    await setDoc(ref, {
      uid,
      displayName: client.user.displayName || "",
      email: client.user.email || "",
      photoURL: client.user.photoURL || "",
      ...cleanProfile,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }

  async function loadPlayerProfile() {
    await init();
    const uid = requireSignedIn();
    if (!uid) return null;
    const { doc, getDoc } = client.modules.firestore;
    const snap = await getDoc(doc(client.db, "players", uid));
    return snap.exists() ? snap.data() : null;
  }

  function timestampToMs(value) {
    if (!value) return 0;
    if (typeof value === "number") return Math.max(0, value);
    if (typeof value.toMillis === "function") return Math.max(0, value.toMillis());
    if (Number.isFinite(Number(value.seconds))) {
      return Math.max(0, Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1_000_000));
    }
    return 0;
  }

  function cleanGlobalStats(stats = {}) {
    if (!stats || typeof stats !== "object") return null;
    return {
      playerId: String(stats.playerId || stats.uid || client.user?.uid || "").slice(0, 128),
      uid: String(stats.uid || stats.playerId || client.user?.uid || "").slice(0, 128),
      worldId: String(stats.worldId || "").slice(0, 120),
      resetGeneration: String(stats.resetGeneration || "").slice(0, 120),
      version: Math.max(0, Math.floor(Number(stats.version) || 0)),
      kingPower: Math.max(0, Math.floor(Number(stats.kingPower) || 0)),
      baseKingPower: Math.max(0, Math.floor(Number(stats.baseKingPower ?? stats.kingPower) || 0)),
      kingPowerBonus: Math.max(0, Math.floor(Number(stats.kingPowerBonus) || 0)),
      totalCities: Math.max(0, Math.floor(Number(stats.totalCities) || 0)),
      totalTroops: Math.max(0, Math.floor(Number(stats.totalTroops) || 0)),
      totalCityTroops: Math.max(0, Math.floor(Number(stats.totalCityTroops) || 0)),
      totalCampTroops: Math.max(0, Math.floor(Number(stats.totalCampTroops) || 0)),
      totalMarchingTroops: Math.max(0, Math.floor(Number(stats.totalMarchingTroops) || 0)),
      totalReinforcementTroops: Math.max(0, Math.floor(Number(stats.totalReinforcementTroops) || 0)),
      totalCityLevels: Math.max(0, Math.floor(Number(stats.totalCityLevels) || 0)),
      totalVictoryPoints: Math.max(0, Math.floor(Number(stats.totalVictoryPoints) || 0)),
      strongholdCount: Math.max(0, Math.floor(Number(stats.strongholdCount) || 0)),
      cityCountsByRegion: Object.entries(stats.cityCountsByRegion || {}).reduce((counts, [regionId, count]) => {
        const key = String(regionId || "").slice(0, 120);
        if (key) counts[key] = Math.max(0, Math.floor(Number(count) || 0));
        return counts;
      }, {}),
      goldPerHour: Math.max(0, Math.floor(Number(stats.goldPerHour) || 0)),
      troopPerHour: Math.max(0, Math.floor(Number(stats.troopPerHour) || 0)),
      baseGoldPerHour: Math.max(0, Math.floor(Number(stats.baseGoldPerHour ?? stats.goldPerHour) || 0)),
      baseTroopPerHour: Math.max(0, Math.floor(Number(stats.baseTroopPerHour ?? stats.troopPerHour) || 0)),
      untimedGoldPerHour: Math.max(0, Math.floor(Number(stats.untimedGoldPerHour ?? stats.baseGoldPerHour ?? stats.goldPerHour) || 0)),
      untimedTroopPerHour: Math.max(0, Math.floor(Number(stats.untimedTroopPerHour ?? stats.baseTroopPerHour ?? stats.troopPerHour) || 0)),
      sustainableTroopPerHour: Math.max(0, Math.floor(Number(stats.sustainableTroopPerHour) || 0)),
      armyPower: Math.max(0, Math.floor(Number(stats.armyPower) || 0)),
      replacementPower: Math.max(0, Math.floor(Number(stats.replacementPower) || 0)),
      defensivePower: Math.max(0, Math.floor(Number(stats.defensivePower) || 0)),
      baseReplacementPower: Math.max(0, Math.floor(Number(stats.baseReplacementPower ?? stats.replacementPower) || 0)),
      baseDefensivePower: Math.max(0, Math.floor(Number(stats.baseDefensivePower ?? stats.defensivePower) || 0)),
      strongholdBonusesAuthoritative: stats.strongholdBonusesAuthoritative === true,
      strongholdBonusSource: String(stats.strongholdBonusSource || "").slice(0, 32),
      crownCitadelControlled: stats.crownCitadelControlled === true,
      strongholdGoldBonusPercent: Math.max(0, Math.floor(Number(stats.strongholdGoldBonusPercent) || 0)),
      strongholdTroopBonusPercent: Math.max(0, Math.floor(Number(stats.strongholdTroopBonusPercent) || 0)),
      strongholdMarchSpeedBonusPercent: Math.max(0, Math.floor(Number(stats.strongholdMarchSpeedBonusPercent) || 0)),
      strongholdDefenseBonusPercent: Math.max(0, Math.floor(Number(stats.strongholdDefenseBonusPercent) || 0)),
      strongholdUpgradeCostReductionPercent: Math.max(0, Math.floor(Number(stats.strongholdUpgradeCostReductionPercent) || 0)),
      personalStrongholdGoldBonusPercent: Math.max(0, Number(stats.personalStrongholdGoldBonusPercent) || 0),
      personalStrongholdTroopBonusPercent: Math.max(0, Number(stats.personalStrongholdTroopBonusPercent) || 0),
      personalStrongholdMarchSpeedBonusPercent: Math.max(0, Number(stats.personalStrongholdMarchSpeedBonusPercent) || 0),
      personalStrongholdDefenseBonusPercent: Math.max(0, Number(stats.personalStrongholdDefenseBonusPercent) || 0),
      personalStrongholdUpgradeCostReductionPercent: Math.max(0, Number(stats.personalStrongholdUpgradeCostReductionPercent) || 0),
      sharedClanGoldBonusPercent: Math.max(0, Number(stats.sharedClanGoldBonusPercent) || 0),
      sharedClanTroopBonusPercent: Math.max(0, Number(stats.sharedClanTroopBonusPercent) || 0),
      sharedClanMarchSpeedBonusPercent: Math.max(0, Number(stats.sharedClanMarchSpeedBonusPercent) || 0),
      sharedClanDefenseBonusPercent: Math.max(0, Number(stats.sharedClanDefenseBonusPercent) || 0),
      sharedClanUpgradeCostReductionPercent: Math.max(0, Number(stats.sharedClanUpgradeCostReductionPercent) || 0),
      clanCitadelBonusPercent: Math.max(0, Number(stats.clanCitadelBonusPercent) || 0),
      clanObjectiveBenefitRevision: Math.max(0, Math.floor(Number(stats.clanObjectiveBenefitRevision) || 0)),
      stationedTroopPower: Math.max(0, Math.floor(Number(stats.stationedTroopPower) || 0)),
      campTroopPower: Math.max(0, Math.floor(Number(stats.campTroopPower) || 0)),
      reinforcementTroopPower: Math.max(0, Math.floor(Number(stats.reinforcementTroopPower) || 0)),
      cityPower: Math.max(0, Math.floor(Number(stats.cityPower) || 0)),
      marchingPower: Math.max(0, Math.floor(Number(stats.marchingPower) || 0)),
      troopPower: Math.max(0, Math.floor(Number(stats.troopPower) || 0)),
      territoryPower: Math.max(0, Math.floor(Number(stats.territoryPower) || 0)),
      cityLevelPower: Math.max(0, Math.floor(Number(stats.cityLevelPower) || 0)),
      economicPower: Math.max(0, Math.floor(Number(stats.economicPower) || 0)),
      troopProductionPower: Math.max(0, Math.floor(Number(stats.troopProductionPower) || 0)),
      fortificationPower: Math.max(0, Math.floor(Number(stats.fortificationPower) || 0)),
      strongholdPower: Math.max(0, Math.floor(Number(stats.strongholdPower) || 0)),
      characterLevel: Math.max(1, Math.floor(Number(stats.characterLevel) || 1)),
      mainCityId: String(stats.mainCityId || "").slice(0, 96),
      mainIslandId: String(stats.mainIslandId || "").slice(0, 160),
      mainRegionId: String(stats.mainRegionId || "").slice(0, 120),
      updatedAtMs: Math.max(0, Math.floor(Number(stats.updatedAtMs) || timestampToMs(stats.updatedAt))),
    };
  }

  async function loadPlayerGlobalStats() {
    await init();
    const uid = requireSignedIn();
    if (!uid) return null;
    const { doc, getDoc } = client.modules.firestore;
    const snap = await getDoc(doc(client.db, "players", uid, "stats", "global"));
    if (!snap.exists()) return null;
    const stats = cleanGlobalStats({ id: snap.id, ...snap.data() });
    return stats?.resetGeneration === RESET_GENERATION && stats?.worldId === ONLINE_WORLD_ID ? stats : null;
  }

  async function loadRewardCampProgress(campType = "") {
    await init();
    const uid = requireSignedIn();
    if (!uid) return null;
    const normalizedType = String(campType || "").trim().toLowerCase();
    const objectiveId = normalizedType === "gold"
      ? "goldCamp"
      : normalizedType === "troops"
        ? "warbandCamp"
        : normalizedType === "items" || normalizedType === "item" || normalizedType === "relic"
          ? "relicCamp"
        : "";
    if (!objectiveId) throw new Error("Unknown reward camp type.");
    const { doc, getDoc } = client.modules.firestore;
    const snap = await getDoc(doc(client.db, "players", uid, "objectiveStats", objectiveId));
    const rawData = snap.exists() ? snap.data() || {} : {};
    const data = rawData.resetGeneration === RESET_GENERATION ? rawData : {};
    return {
      objectiveId,
      campType: normalizedType,
      date: String(data.date || "").slice(0, 10),
      count: Math.max(0, Math.floor(Number(data.count) || 0)),
      lastReward: Math.max(0, Math.floor(Number(data.lastReward) || 0)),
      lastCampId: String(data.lastCampId || "").slice(0, 120),
      lastClaimedAtMs: Math.max(0, Math.floor(Number(data.lastClaimedAtMs) || 0)),
      maxDailyRewards: Math.max(0, Math.floor(Number(data.maxDailyRewards) || 0)),
      rewards: (Array.isArray(data.rewards) ? data.rewards : []).slice(-5).map(entry => ({
        itemId: String(entry?.itemId || "").slice(0, 64),
        itemName: String(entry?.itemName || "Unknown item").slice(0, 80),
        rarity: String(entry?.rarity || "").slice(0, 24),
        awardedAtMs: Math.max(0, Math.floor(Number(entry?.awardedAtMs) || timestampToMs(entry?.awardedAt))),
        campId: String(entry?.campId || "").slice(0, 96),
        campName: String(entry?.campName || "Relic Camp").slice(0, 80),
      })).filter(entry => entry.itemId),
    };
  }

  async function loadRewardCampHistory({ islandId = "", campId = "", limitCount = 25 } = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return [];
    const safeIslandId = String(islandId || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const safeCampId = String(campId || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeIslandId || !safeCampId) throw new Error("Missing Deed Camp location.");
    const safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limitCount) || 25)));
    const { collection, getDocs, query: firestoreQuery, orderBy, limit } = client.modules.firestore;
    const historyRef = collection(client.db, "islands", safeIslandId, "camps", safeCampId, "rewardHistory");
    const historyQuery = firestoreQuery && orderBy && limit
      ? firestoreQuery(historyRef, orderBy("awardedAtMs", "desc"), limit(safeLimit))
      : historyRef;
    const snapshot = await getDocs(historyQuery);
    return snapshot.docs.slice(0, safeLimit).map(historyDoc => {
      const history = historyDoc.data() || {};
      return {
        id: historyDoc.id,
        campId: String(history.campId || safeCampId).slice(0, 96),
        cityId: String(history.cityId || "").slice(0, 96),
        cityName: String(history.cityName || "Unknown city").slice(0, 80),
        regionId: String(history.regionId || "").slice(0, 80),
        regionName: String(history.regionName || history.regionId || "Unknown map").slice(0, 80),
        awardedToPlayerId: String(history.awardedToPlayerId || "").slice(0, 128),
        awardedToDisplayName: cleanPlayerName(history.awardedToDisplayName || "Ruler"),
        awardedAtMs: Math.max(0, Math.floor(Number(history.awardedAtMs) || timestampToMs(history.awardedAt))),
        source: String(history.source || "").slice(0, 32),
      };
    }).filter(history => history.cityId && history.regionId && history.source === "deed_camp");
  }

  async function loadCrownCitadelReignLeaderboard(limitCount = 100) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return [];
    const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limitCount) || 100)));
    const { collection, getDocs, query: firestoreQuery, orderBy, limit } = client.modules.firestore;
    const reignsRef = collection(client.db, "crownCitadelReigns", RESET_GENERATION, "entries");
    const reignsQuery = firestoreQuery && orderBy && limit
      ? firestoreQuery(reignsRef, orderBy("totalHeldMs", "desc"), limit(safeLimit))
      : reignsRef;
    const snapshot = await getDocs(reignsQuery);
    return snapshot.docs.slice(0, safeLimit).map(reignDoc => {
      const reign = reignDoc.data() || {};
      return {
        id: reignDoc.id,
        playerId: String(reign.playerId || reignDoc.id).slice(0, 128),
        playerName: cleanPlayerName(reign.playerName || "Ruler"),
        playerFlag: reign.playerFlag || null,
        worldId: String(reign.worldId || "").slice(0, 120),
        resetGeneration: String(reign.resetGeneration || "").slice(0, 120),
        totalHeldMs: Math.max(0, Math.floor(Number(reign.totalHeldMs) || 0)),
        currentHeldSinceMs: Math.max(0, Math.floor(Number(reign.currentHeldSinceMs) || 0)),
        isCurrentHolder: Boolean(reign.isCurrentHolder),
        lastCapturedAtMs: Math.max(0, Math.floor(Number(reign.lastCapturedAtMs) || 0)),
        lastLostAtMs: Math.max(0, Math.floor(Number(reign.lastLostAtMs) || 0)),
        updatedAtMs: Math.max(0, Math.floor(Number(reign.updatedAtMs) || timestampToMs(reign.updatedAt))),
      };
    }).filter(reign => reign.playerId);
  }

  function subscribePlayerGlobalStats(handlers = {}) {
    if (!client.db || !client.modules?.firestore?.onSnapshot || !client.user?.uid) return null;
    const { doc, onSnapshot } = client.modules.firestore;
    return onSnapshot(
      doc(client.db, "players", client.user.uid, "stats", "global"),
      snapshot => {
        if (typeof handlers.onStats === "function") {
          const stats = snapshot.exists() ? cleanGlobalStats({ id: snapshot.id, ...snapshot.data() }) : null;
          handlers.onStats(
            stats?.resetGeneration === RESET_GENERATION && stats?.worldId === ONLINE_WORLD_ID
              ? stats
              : null
          );
        }
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error);
      }
    );
  }

  async function purchaseShopItem({ itemId = "", cost = 0 } = {}) {
    return callServerFunction("purchaseShopItem", { itemId, cost });
  }

  async function saveGameSnapshot(snapshot, slot = "default") {
    await init();
    const uid = requireSignedIn();
    if (!uid || !snapshot) return false;
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    const ref = doc(client.db, "players", uid, "saves", slot);
    const cleanSnapshot = sanitizeForFirestore(snapshot);
    await setDoc(ref, {
      version: Number(cleanSnapshot.version) || 0,
      playerName: cleanSnapshot.playerName || "",
      gameSeconds: Number(cleanSnapshot.gameSeconds) || 0,
      state: cleanSnapshot,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }

  async function loadGameSnapshot(slot = "default") {
    await init();
    const uid = requireSignedIn();
    if (!uid) return null;
    const { doc, getDoc } = client.modules.firestore;
    const snap = await getDoc(doc(client.db, "players", uid, "saves", slot));
    if (!snap.exists()) return null;
    return snap.data().state || null;
  }

  function cleanCityOwner(city = {}) {
    const ownerUid = String(city.ownerUid || "").trim();
    const rawOwnerKind = city.ownerKind || city.owner || "neutral";
    const hasPlayerOwner = rawOwnerKind === "player" && ownerUid;
    return {
      ownerKind: hasPlayerOwner ? "player" : "neutral",
      ownerUid: hasPlayerOwner ? ownerUid : null,
      ownerName: hasPlayerOwner ? city.ownerName || "" : "",
      ownerFlag: hasPlayerOwner ? city.ownerFlag || null : null,
      ownerKingPower: hasPlayerOwner ? Math.max(0, Math.floor(Number(city.ownerKingPower) || 0)) : 0,
      ownerShieldExpiresAtMs: hasPlayerOwner ? Math.max(0, Math.floor(Number(city.ownerShieldExpiresAtMs) || 0)) : 0,
    };
  }

  function cleanCitySeed(city) {
    const owner = cleanCityOwner(city);
    const isStronghold = city.kind === "stronghold" || Boolean(city.strongholdType);
    return {
      id: city.id,
      name: city.name || city.id,
      x: Number(city.x) || 0,
      y: Number(city.y) || 0,
      startPool: city.startPool || "",
      regionId: city.regionId || city.startPool || "",
      kind: isStronghold ? "stronghold" : "",
      strongholdType: isStronghold ? String(city.strongholdType || "").slice(0, 32) : "",
      bonus: isStronghold ? String(city.bonus || "").slice(0, 32) : "",
      bonusPercent: isStronghold ? Math.max(0, Math.floor(Number(city.bonusPercent) || 0)) : 0,
      size: isStronghold ? Math.max(0, Math.floor(Number(city.size) || 0)) : 0,
      artSrc: isStronghold ? String(city.artSrc || "").slice(0, 160) : "",
      startTroops: isStronghold ? Math.max(0, Math.floor(Number(city.startTroops) || Number(city.troops) || 0)) : 0,
      ...owner,
      level: Math.max(1, Math.floor(Number(city.level) || 1)),
      troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
      troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
      alliedReinforcementTroops: Math.max(0, Math.floor(Number(city.alliedReinforcementTroops) || 0)),
      defense: 1,
      investedGold: Math.max(0, Math.floor(Number(city.investedGold) || 0)),
      lastCapturedAt: city.lastCapturedAt ?? null,
      isMainCity: Boolean(city.isMainCity),
      relinquishedAtMs: Math.max(0, Math.floor(Number(city.relinquishedAtMs) || 0)),
      relocatedAtMs: Math.max(0, Math.floor(Number(city.relocatedAtMs) || 0)),
    };
  }

  function cleanCityLayoutSeed(city) {
    const isStronghold = city.kind === "stronghold" || Boolean(city.strongholdType);
    return {
      id: city.id,
      name: city.name || city.id,
      x: Number(city.x) || 0,
      y: Number(city.y) || 0,
      startPool: city.startPool || "",
      regionId: city.regionId || city.startPool || "",
      kind: isStronghold ? "stronghold" : "",
      strongholdType: isStronghold ? String(city.strongholdType || "").slice(0, 32) : "",
      bonus: isStronghold ? String(city.bonus || "").slice(0, 32) : "",
      bonusPercent: isStronghold ? Math.max(0, Math.floor(Number(city.bonusPercent) || 0)) : 0,
      size: isStronghold ? Math.max(0, Math.floor(Number(city.size) || 0)) : 0,
      artSrc: isStronghold ? String(city.artSrc || "").slice(0, 160) : "",
      startTroops: isStronghold ? Math.max(0, Math.floor(Number(city.startTroops) || Number(city.troops) || 0)) : 0,
      defense: 1,
    };
  }

  function cleanPresence(presence = {}) {
    return {
      uid: client.user?.uid || "",
      displayName: cleanPlayerName(presence.displayName || presence.playerName || client.user?.displayName),
      playerName: cleanPlayerName(presence.playerName || presence.displayName || client.user?.displayName),
      islandId: String(presence.islandId || "main").slice(0, 64),
      mainCityId: String(presence.mainCityId || ""),
      mainRegionId: String(presence.mainRegionId || "").slice(0, 64),
      mainIslandId: String(presence.mainIslandId || "").slice(0, 64),
      cityCount: Math.max(0, Math.floor(Number(presence.cityCount) || 0)),
      kingPower: Math.max(0, Math.floor(Number(presence.kingPower) || 0)),
      kingPowerVersion: Math.max(0, Math.floor(Number(presence.kingPowerVersion) || 0)),
      flag: presence.flag || null,
      updatedAtMs: Math.max(0, Number(presence.updatedAtMs) || Date.now()),
    };
  }

  async function savePlayerCities(islandId = "main", cities = []) {
    await init();
    const uid = requireSignedIn();
    if (!uid || !Array.isArray(cities) || !cities.length) return false;
    const { doc, writeBatch, serverTimestamp } = client.modules.firestore;
    const batch = writeBatch(client.db);

    for (const city of cities) {
      if (!city?.id) continue;
      const cityPatch = cleanCitySeed(city);
      delete cityPatch.isMainCity;
      batch.set(doc(client.db, "islands", islandId, "cities", city.id), {
        ...cityPatch,
        ownerKind: "player",
        ownerUid: uid,
        ownerName: city.ownerName || client.user.displayName || "Ruler",
        ownerFlag: city.ownerFlag || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    return true;
  }

  async function saveCityState(islandId = "main", city = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid || !city?.id) return false;
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    const cityPatch = cleanCitySeed(city);
    delete cityPatch.isMainCity;
    await setDoc(doc(client.db, "islands", islandId, "cities", city.id), {
      ...cityPatch,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }

  async function updateOwnedCityIdentityAcrossIslands(islandIds = [], identity = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return 0;
    const { collection, getDocs, query: firestoreQuery, where, writeBatch, serverTimestamp } = client.modules.firestore;
    if (!firestoreQuery || !where || !writeBatch) return 0;
    const uniqueIslandIds = [...new Set((Array.isArray(islandIds) ? islandIds : [])
      .map(islandId => String(islandId || "").trim())
      .filter(Boolean))];
    const ownerName = cleanPlayerName(identity.ownerName || identity.playerName || client.user?.displayName);
    const ownerFlag = identity.ownerFlag || identity.flag || null;
    let batch = writeBatch(client.db);
    let pendingWrites = 0;
    let updatedCount = 0;

    async function commitPendingBatch() {
      if (!pendingWrites) return;
      await batch.commit();
      batch = writeBatch(client.db);
      pendingWrites = 0;
    }

    for (const islandId of uniqueIslandIds) {
      const citiesRef = collection(client.db, "islands", islandId, "cities");
      const ownedRef = firestoreQuery(citiesRef, where("ownerUid", "==", uid));
      const snapshot = await getDocs(ownedRef);
      for (const cityDoc of snapshot.docs) {
        batch.set(cityDoc.ref, {
          ownerKind: "player",
          ownerUid: uid,
          ownerName,
          ownerFlag,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        pendingWrites += 1;
        updatedCount += 1;
        if (pendingWrites >= 450) await commitPendingBatch();
      }
    }

    await commitPendingBatch();
    return updatedCount;
  }

  async function loadIslandCities(islandId = "main") {
    await init();
    const uid = requireSignedIn();
    if (!uid || !islandId) return [];
    const { collection, getDocs } = client.modules.firestore;
    const snapshot = await getDocs(collection(client.db, "islands", islandId, "cities"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function savePresence(islandId = "main", presence = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return false;
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    await setDoc(doc(client.db, "islands", islandId, "presence", uid), {
      ...cleanPresence({ ...presence, islandId, updatedAtMs: Date.now() }),
      uid,
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }

  function cleanLeaderboardEntry(entry = {}) {
    return {
      uid: client.user?.uid || "",
      worldId: ONLINE_WORLD_ID,
      resetGeneration: RESET_GENERATION,
      displayName: cleanPlayerName(entry.displayName || entry.playerName || client.user?.displayName),
      playerName: cleanPlayerName(entry.playerName || entry.displayName || client.user?.displayName),
      flag: entry.flag || null,
      kingPower: Math.max(0, Math.floor(Number(entry.kingPower) || 0)),
      kingPowerVersion: Math.max(0, Math.floor(Number(entry.kingPowerVersion) || 0)),
      cityCount: Math.max(0, Math.floor(Number(entry.cityCount) || 0)),
      mainCityId: String(entry.mainCityId || "").slice(0, 80),
      mainRegionId: String(entry.mainRegionId || "").slice(0, 64),
      mainIslandId: String(entry.mainIslandId || "").slice(0, 64),
      updatedAtMs: Math.max(0, Number(entry.updatedAtMs) || Date.now()),
    };
  }

  async function saveKingPowerLeaderboardEntry(entry = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return false;
    cleanLeaderboardEntry(entry);
    return false;
  }

  async function loadKingPowerLeaderboard(limitCount = 100) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return [];
    const {
      collection,
      getDocs,
      query: firestoreQuery,
      where,
      orderBy,
      limit: firestoreLimit,
    } = client.modules.firestore;
    const entriesRef = collection(client.db, "leaderboards", RESET_GENERATION, "entries");
    const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limitCount) || 100)));
    const queryRef = firestoreQuery && where && orderBy && firestoreLimit
      ? firestoreQuery(
          entriesRef,
          where("resetGeneration", "==", RESET_GENERATION),
          where("worldId", "==", ONLINE_WORLD_ID),
          orderBy("kingPower", "desc"),
          firestoreLimit(safeLimit)
        )
      : entriesRef;
    const snapshot = await getDocs(queryRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function loadPlayerIdentities(uids = []) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return [];
    const { doc, getDoc } = client.modules.firestore;
    const uniqueUids = [...new Set((Array.isArray(uids) ? uids : [])
      .map(value => String(value || "").trim())
      .filter(Boolean))]
      .slice(0, 80);
    if (!uniqueUids.length) return [];
    const rows = await Promise.all(uniqueUids.map(identityUid => (
      getDoc(doc(client.db, "leaderboards", RESET_GENERATION, "entries", identityUid))
        .then(snapshot => (snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null))
        .catch(() => null)
    )));
    return rows.filter(Boolean);
  }

  async function loadKingPowerPresenceLeaderboard(islandIds = [], limitCount = 100) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return [];
    const { collection, getDocs } = client.modules.firestore;
    const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limitCount) || 100)));
    const uniqueIslandIds = [...new Set((Array.isArray(islandIds) ? islandIds : [])
      .map(islandId => String(islandId || "").trim())
      .filter(Boolean))];
    const byUid = new Map();

    for (const islandId of uniqueIslandIds) {
      const snapshot = await getDocs(collection(client.db, "islands", islandId, "presence"));
      snapshot.docs.forEach(presenceDoc => {
        const row = { id: presenceDoc.id, islandId, ...presenceDoc.data() };
        const rowUid = String(row.uid || row.id || "").trim();
        if (!rowUid) return;
        const existing = byUid.get(rowUid);
        const rowPower = Math.max(0, Math.floor(Number(row.kingPower) || 0));
        const rowUpdatedAtMs = Math.max(0, Number(row.updatedAtMs) || 0);
        const existingUpdatedAtMs = Math.max(0, Number(existing?.updatedAtMs) || 0);
        if (!existing || rowPower > Math.max(0, Number(existing.kingPower) || 0) || rowUpdatedAtMs > existingUpdatedAtMs) {
          byUid.set(rowUid, row);
        }
      });
    }

    return Array.from(byUid.values())
      .sort((a, b) => (Math.max(0, Number(b.kingPower) || 0) - Math.max(0, Number(a.kingPower) || 0))
        || (Math.max(0, Number(b.updatedAtMs) || 0) - Math.max(0, Number(a.updatedAtMs) || 0)))
      .slice(0, safeLimit);
  }

  async function loadIslandCitySummary(islandId = "main", options = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid || !islandId) return null;
    const { collection, doc, getDoc, getDocs, query: firestoreQuery, where } = client.modules.firestore;
    const citiesRef = collection(client.db, "islands", islandId, "cities");
    const includeNeutralCount = Boolean(options?.includeNeutralCount);
    const playerCitiesRef = !includeNeutralCount && firestoreQuery && where
      ? firestoreQuery(citiesRef, where("ownerKind", "==", "player"))
      : citiesRef;
    const [islandSnap, snapshot] = await Promise.all([
      getDoc(doc(client.db, "islands", islandId)),
      getDocs(playerCitiesRef),
    ]);
    const islandData = islandSnap.exists() ? islandSnap.data() : {};
    const owners = new Set();
    const rivalOwners = new Set();
    let regularCityCount = 0;
    let neutralCityCount = 0;
    let playerHeldCityCount = 0;
    let ownCityCount = 0;
    let rivalCityCount = 0;

    snapshot.docs.forEach(cityDoc => {
      const city = cityDoc.data() || {};
      if (city.kind === "stronghold" || city.strongholdType) return;
      if (includeNeutralCount) regularCityCount += 1;
      const ownerKind = city.ownerKind || city.owner || "neutral";
      const ownerUid = String(city.ownerUid || "");
      if (ownerKind !== "player" || !ownerUid) {
        if (includeNeutralCount) neutralCityCount += 1;
        return;
      }
      playerHeldCityCount += 1;
      owners.add(ownerUid);
      if (ownerUid === uid) {
        ownCityCount += 1;
      } else {
        rivalCityCount += 1;
        rivalOwners.add(ownerUid);
      }
    });
    const storedCityCount = Math.max(
      0,
      Number(islandData.cityCount) || 0,
      Number(islandData.seededCityCount) || 0
    );
    const isSeededIsland = islandSnap.exists() && (storedCityCount > 0 || snapshot.size > 0);

    return {
      islandId,
      cityCount: Math.max(storedCityCount, snapshot.size),
      regularCityCount: Math.max(0, Number(islandData.regularCityCount) || regularCityCount),
      neutralCityCount: includeNeutralCount && isSeededIsland ? neutralCityCount : undefined,
      playerHeldCityCount,
      ownCityCount,
      rivalCityCount,
      rulerCount: owners.size,
      rivalRulerCount: rivalOwners.size,
      updatedAtMs: Date.now(),
    };
  }

  async function loadOwnedCitiesAcrossIslands(islandIds = []) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return [];
    const {
      collection,
      collectionGroup,
      getDocs,
      query: firestoreQuery,
      where,
    } = client.modules.firestore;
    if (!firestoreQuery || !where) return [];
    const uniqueIslandIds = [...new Set((Array.isArray(islandIds) ? islandIds : [])
      .map(islandId => String(islandId || "").trim())
      .filter(Boolean))];

    if (collectionGroup) {
      const ownedRef = firestoreQuery(
        collectionGroup(client.db, "cities"),
        where("ownerUid", "==", uid),
        where("resetGeneration", "==", RESET_GENERATION),
        where("worldId", "==", ONLINE_WORLD_ID)
      );
      const snapshot = await getDocs(ownedRef);
      return snapshot.docs
        .map(cityDoc => {
          const city = cityDoc.data() || {};
          const islandId = String(cityDoc.ref?.parent?.parent?.id || city.islandId || "").trim();
          return { ...city, islandId, id: cityDoc.id };
        })
        .filter(city => !uniqueIslandIds.length || uniqueIslandIds.includes(city.islandId));
    }

    const snapshots = await Promise.all(uniqueIslandIds.map(async islandId => {
      const citiesRef = collection(client.db, "islands", islandId, "cities");
      const ownedRef = firestoreQuery(citiesRef, where("ownerUid", "==", uid));
      const snapshot = await getDocs(ownedRef);
      return snapshot.docs.map(cityDoc => ({ ...cityDoc.data(), islandId, id: cityDoc.id }));
    }));
    return snapshots.flat();
  }

  async function loadServerReports(limitCount = 120) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return [];
    const { collection, getDocs, query: firestoreQuery, where, orderBy, limit } = client.modules.firestore;
    const reportsRef = collection(client.db, "players", uid, "serverReports");
    const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limitCount) || 120)));
    const reportsQuery = firestoreQuery && orderBy && limit
      ? firestoreQuery(reportsRef, where("resetGeneration", "==", RESET_GENERATION), where("worldId", "==", ONLINE_WORLD_ID), orderBy("createdAtMs", "desc"), limit(safeLimit))
      : reportsRef;
    const snapshot = await getDocs(reportsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function loadBattleSnapshot(battleId = "") {
    await init();
    const uid = requireSignedIn();
    const safeBattleId = String(battleId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 160);
    if (!uid || !safeBattleId) return null;
    const { doc, getDoc } = client.modules.firestore;
    const snapshot = await getDoc(doc(
      client.db,
      "battleSnapshots",
      RESET_GENERATION,
      "entries",
      safeBattleId
    ));
    if (!snapshot.exists()) return null;
    const battle = { id: snapshot.id, ...snapshot.data() };
    return battle.resetGeneration === RESET_GENERATION && battle.worldId === ONLINE_WORLD_ID
      ? battle
      : null;
  }

  function subscribeServerReports(handlers = {}) {
    if (!client.configured || !client.db || !client.user?.uid) return () => {};
    const { collection, onSnapshot, query: firestoreQuery, where, orderBy, limit } = client.modules.firestore;
    const reportsRef = collection(client.db, "players", client.user.uid, "serverReports");
    const reportsQuery = firestoreQuery && orderBy && limit
      ? firestoreQuery(reportsRef, where("resetGeneration", "==", RESET_GENERATION), where("worldId", "==", ONLINE_WORLD_ID), orderBy("createdAtMs", "desc"), limit(120))
      : reportsRef;
    const unsubscribe = onSnapshot(
      reportsQuery,
      snapshot => {
        if (typeof handlers.onReports === "function") {
          handlers.onReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error, "serverReports");
      }
    );
    return unsubscribe;
  }

  function subscribePlayerArmies(handlers = {}) {
    if (!client.configured || !client.db || !client.user?.uid) return () => {};
    const { collection, onSnapshot, query: firestoreQuery, where } = client.modules.firestore;
    if (!collection || !onSnapshot || !firestoreQuery || !where) return () => {};

    const uid = client.user.uid;
    const rowsBySource = new Map([
      ["outgoing", new Map()],
      ["incoming", new Map()],
    ]);
    const emit = () => {
      if (typeof handlers.onArmies !== "function") return;
      const merged = new Map();
      rowsBySource.forEach(rows => rows.forEach((army, armyId) => merged.set(armyId, army)));
      handlers.onArmies([...merged.values()]);
    };
    const subscribeOutgoing = () => onSnapshot(
      firestoreQuery(
        collection(client.db, "armies"),
        where("ownerUid", "==", uid),
        where("resetGeneration", "==", RESET_GENERATION),
        where("worldId", "==", ONLINE_WORLD_ID),
        where("status", "==", "active")
      ),
      snapshot => {
        rowsBySource.set("outgoing", new Map(snapshot.docs.map(doc => [
          doc.id,
          {
            id: doc.id,
            islandId: doc.data()?.sourceRegionId || "",
            ...doc.data(),
            viewerAccess: "owner",
          },
        ])));
        emit();
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error, "outgoing");
      }
    );

    const subscribeIncoming = () => onSnapshot(
      collection(client.db, "players", uid, "incomingArmies"),
      snapshot => {
        rowsBySource.set("incoming", new Map(snapshot.docs
          .map(doc => ({
            id: doc.id,
            islandId: doc.data()?.sourceRegionId || "",
            ...doc.data(),
            viewerAccess: "target",
          }))
          .filter(army => (
            army.resetGeneration === RESET_GENERATION
            && army.worldId === ONLINE_WORLD_ID
            && army.status === "active"
          ))
          .map(army => [army.id, army])));
        emit();
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error, "incoming");
      }
    );

    const unsubscribers = [
      subscribeOutgoing(),
      subscribeIncoming(),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  function subscribePlayerReinforcements(handlers = {}) {
    if (!client.configured || !client.db || !client.user?.uid) return () => {};
    const { collection, onSnapshot, query: firestoreQuery, where } = client.modules.firestore;
    if (!collection || !onSnapshot || !firestoreQuery || !where) return () => {};
    const uid = client.user.uid;
    const rowsBySource = new Map([
      ["contributor", new Map()],
      ["holder", new Map()],
    ]);
    const emit = () => {
      if (typeof handlers.onReinforcements !== "function") return;
      const merged = new Map();
      rowsBySource.forEach(rows => rows.forEach((entry, id) => merged.set(id, entry)));
      handlers.onReinforcements([...merged.values()]);
    };
    const subscribe = (source, ownerField) => onSnapshot(
      firestoreQuery(
        collection(client.db, "reinforcements"),
        where(ownerField, "==", uid),
        where("resetGeneration", "==", RESET_GENERATION),
        where("worldId", "==", ONLINE_WORLD_ID),
        where("status", "==", "stationed")
      ),
      snapshot => {
        rowsBySource.set(source, new Map(snapshot.docs.map(doc => [
          doc.id,
          { id: doc.id, ...doc.data() },
        ])));
        emit();
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error, source);
      }
    );
    const unsubscribers = [
      subscribe("contributor", "ownerUid"),
      subscribe("holder", "targetOwnerUid"),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  function subscribePlayerCamps(handlers = {}) {
    if (!client.configured || !client.db || !client.user?.uid) return () => {};
    const { collectionGroup, onSnapshot, query: firestoreQuery, where } = client.modules.firestore;
    if (!collectionGroup || !onSnapshot || !firestoreQuery || !where) return () => {};

    const heldCampsRef = firestoreQuery(
      collectionGroup(client.db, "camps"),
      where("holderUid", "==", client.user.uid),
      where("resetGeneration", "==", RESET_GENERATION),
      where("worldId", "==", ONLINE_WORLD_ID)
    );
    return onSnapshot(
      heldCampsRef,
      snapshot => {
        if (typeof handlers.onCamps !== "function") return;
        handlers.onCamps(snapshot.docs.map(campDoc => {
          const camp = campDoc.data() || {};
          return {
            ...camp,
            id: campDoc.id,
            regionId: camp.regionId || "",
            islandId: camp.islandId || campDoc.ref?.parent?.parent?.id || "",
          };
        }));
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error, "heldCamps");
      }
    );
  }

  function subscribeCrownCitadel(islandId = "", citadelId = "", handlers = {}) {
    if (!client.configured || !client.db || !client.user?.uid || !islandId || !citadelId) return () => {};
    const { doc, onSnapshot } = client.modules.firestore;
    return onSnapshot(
      doc(client.db, "islands", islandId, "cities", citadelId),
      snapshot => {
        if (typeof handlers.onCitadel === "function") {
          handlers.onCitadel(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        }
      },
      error => {
        if (typeof handlers.onError === "function") handlers.onError(error, "crownCitadel");
      }
    );
  }

  function subscribeIsland(islandId, handlers = {}) {
    if (!client.configured || !client.db || !islandId) return () => {};
    const { collection, doc, onSnapshot, query: firestoreQuery, where } = client.modules.firestore;
    const unsubscribers = [];
    const onError = source => error => {
      if (typeof handlers.onError === "function") handlers.onError(error, source);
    };

    if (typeof handlers.onIsland === "function") {
      unsubscribers.push(onSnapshot(
        doc(client.db, "islands", islandId),
        snapshot => handlers.onIsland(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
        onError("island")
      ));
    }

    if (typeof handlers.onCities === "function") {
      unsubscribers.push(onSnapshot(
        collection(client.db, "islands", islandId, "cities"),
        snapshot => handlers.onCities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
        onError("cities")
      ));
    }

    if (typeof handlers.onCamps === "function") {
      unsubscribers.push(onSnapshot(
        collection(client.db, "islands", islandId, "camps"),
        snapshot => handlers.onCamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
        onError("camps")
      ));
    }

    if (typeof handlers.onArmies === "function") {
      const armiesRef = collection(client.db, "islands", islandId, "armies");
      const activeArmiesRef = firestoreQuery && where
        ? firestoreQuery(armiesRef, where("status", "==", "active"))
        : armiesRef;
      unsubscribers.push(onSnapshot(
        activeArmiesRef,
        snapshot => handlers.onArmies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
        onError("armies")
      ));
    }

    if (typeof handlers.onPresence === "function") {
      unsubscribers.push(onSnapshot(
        collection(client.db, "islands", islandId, "presence"),
        snapshot => handlers.onPresence(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
        onError("presence")
      ));
    }

    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  window.CrownlandsOnline = {
    init,
    signInWithGoogle,
    signOut,
    registerGameInstallation,
    joinGameServer,
    heartbeatGameServer,
    leaveGameServer,
    subscribeGameServerMembership,
    savePlayerProfile,
    loadPlayerProfile,
    collectEconomy,
    getDailyLoginRewardStatus,
    claimDailyLoginReward,
    getRewardedAdStatus,
    prepareRewardedAd,
    claimRewardedAd,
    reserveHarvestBonusSpawn,
    collectHarvestBonus,
    upgradeCity,
    spendSkillPoint,
    resetSkills,
    repairMainCityAssignment,
    changeMainCity,
    syncPlayerIdentity,
    createClan,
    updateClanProfile,
    joinOpenClan,
    applyToClan,
    cancelClanApplication,
    reviewClanApplication,
    leaveClan,
    kickClanMember,
    promoteClanMember,
    demoteClanOfficer,
    transferClanLeadership,
    claimInactiveClanLeadership,
    disbandClan,
    sendClanGift,
    claimClanGiftPool,
    claimClanQuestReward,
    loadClan,
    searchClans,
    loadClanMembers,
    loadClanApplications,
    loadClanLeaderboard,
    subscribeClanState,
    subscribeClanApplications,
    subscribeClanSocialState,
    subscribeClanQuestProgress,
    subscribeClanRallies,
    recalculatePlayerGlobalStats,
    recalculateAllPlayerGlobalStats,
    getCombatPlayerIdentity,
    loadPublicPlayerProfile,
    getRealmInfo,
    relinquishCity,
    purchaseShopItem,
    activateInventoryItem,
    useSwiftMarchOrder,
    useRecallHorn,
    saveGameSnapshot,
    loadGameSnapshot,
    loadPlayerGlobalStats,
    loadRewardCampProgress,
    loadRewardCampHistory,
    loadCrownCitadelReignLeaderboard,
    subscribePlayerGlobalStats,
    sendArmyOrder,
    createClanRally,
    joinClanRally,
    withdrawClanRallyContribution,
    launchClanRally,
    cancelClanRally,
    previewArmyProtection,
    resolveArmyOrder,
    returnClanReinforcement,
    resolveGoldCampPayout,
    resolveRewardCampPayout,
    recallRewardCampGarrison,
    enablePushNotifications,
    registerPushNotifications,
    disablePushNotifications,
    ensureMainIsland,
    claimStartingCity,
    savePlayerCities,
    saveCityState,
    updateOwnedCityIdentityAcrossIslands,
    loadIslandCities,
    savePresence,
    saveKingPowerLeaderboardEntry,
    loadKingPowerLeaderboard,
    loadPlayerIdentities,
    loadKingPowerPresenceLeaderboard,
    loadIslandCitySummary,
    loadOwnedCitiesAcrossIslands,
    loadServerReports,
    loadBattleSnapshot,
    subscribeIsland,
    subscribePlayerArmies,
    subscribePlayerReinforcements,
    subscribePlayerCamps,
    subscribeCrownCitadel,
    subscribeServerReports,
    isPushSupported,
    getNotificationPermission,
    requestNotificationPermission,
    hasNotificationVapidKey: () => Boolean(getNotificationVapidKey()),
    usesServerArmyAuthority: () => Boolean(client.functions && client.modules?.functions?.httpsCallable),
    usesServerEconomyAuthority,
    isRewardedAdSecurityReady: () => Boolean(client.appCheck),
    isConfigured: () => client.configured,
    isReady: () => client.ready,
    isSignedIn: () => Boolean(client.user?.uid),
    getUser: () => client.user,
    getLastError: () => client.error,
  };

  init();
})();
