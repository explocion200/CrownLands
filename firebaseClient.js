(function () {
  const FIREBASE_VERSION = "10.12.5";
  const REQUIRED_CONFIG_KEYS = ["apiKey", "authDomain", "projectId", "appId"];
  const ROYAL_PEACE_SHIELD_ITEM_ID = "shield_12h";
  const ROYAL_PEACE_SHIELD_COST = 175_000;

  const client = {
    configured: false,
    ready: false,
    user: null,
    error: null,
    app: null,
    auth: null,
    db: null,
    functions: null,
    messaging: null,
    provider: null,
    modules: null,
    initPromise: null,
    pushPromise: null,
    serviceWorkerRegistration: null,
    notificationToken: "",
    notificationTokenId: "",
    foregroundPushListenerReady: false,
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

  async function loadModules() {
    const [app, auth, firestore, functions] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-functions.js`),
    ]);
    return { app, auth, firestore, functions };
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
        client.auth = client.modules.auth.getAuth(client.app);
        client.db = client.modules.firestore.getFirestore(client.app);
        client.functions = client.modules.functions.getFunctions(client.app);
        client.provider = new client.modules.auth.GoogleAuthProvider();

        client.modules.auth.onAuthStateChanged(client.auth, user => {
          client.user = serializeUser(user);
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
    const result = await callable(sanitizeForFirestore(payload) || {});
    return result?.data || null;
  }

  async function sendArmyOrder(payload = {}) {
    return callServerFunction("sendArmyOrder", payload);
  }

  async function resolveArmyOrder(payload = {}) {
    return callServerFunction("resolveArmyOrder", payload);
  }

  async function collectEconomy(payload = {}) {
    return callServerFunction("collectEconomy", payload);
  }

  async function upgradeCity(payload = {}) {
    return callServerFunction("upgradeCity", payload);
  }

  async function relinquishCity(payload = {}) {
    return callServerFunction("relinquishCity", payload);
  }

  async function relocateMainCity(payload = {}) {
    return callServerFunction("relocateMainCity", payload);
  }

  async function activateInventoryItem(payload = {}) {
    return callServerFunction("activateInventoryItem", payload);
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
    const workerUrl = new URL("firebase-messaging-sw.js", window.location.href);
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
      playerName: String(options.playerName || client.user?.displayName || "Ruler").slice(0, 40),
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

  function rememberLogin() {
    savePlayerProfile({ lastLoginAt: Date.now() }).catch(error => {
      console.warn("Could not update login timestamp", error);
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
      rememberLogin();
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
    await client.modules.auth.signOut(client.auth);
    client.user = null;
    dispatch("auth", { user: null });
  }

  async function savePlayerProfile(profile = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return false;
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    const ref = doc(client.db, "players", uid);
    const cleanProfile = sanitizeForFirestore(profile);
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
      displayName: String(presence.displayName || client.user?.displayName || "Ruler").slice(0, 32),
      playerName: String(presence.playerName || presence.displayName || client.user?.displayName || "Ruler").slice(0, 32),
      islandId: String(presence.islandId || "main").slice(0, 64),
      mainCityId: String(presence.mainCityId || ""),
      mainRegionId: String(presence.mainRegionId || "").slice(0, 64),
      mainIslandId: String(presence.mainIslandId || "").slice(0, 64),
      cityCount: Math.max(0, Math.floor(Number(presence.cityCount) || 0)),
      kingPower: Math.max(0, Math.floor(Number(presence.kingPower) || 0)),
      flag: presence.flag || null,
      updatedAtMs: Math.max(0, Number(presence.updatedAtMs) || Date.now()),
    };
  }

  async function ensureMainIsland({ islandId = "main", cities = [], meta = {} } = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return false;
    const { collection, doc, getDoc, getDocs, setDoc, writeBatch, serverTimestamp } = client.modules.firestore;
    const islandRef = doc(client.db, "islands", islandId);
    const citySeeds = cities.map(cleanCitySeed);
    const islandSnap = await getDoc(islandRef);
    const islandData = islandSnap.exists() ? islandSnap.data() : {};
    const targetVersion = Number(meta.version) || 21;
    const targetCityCount = citySeeds.length;
    const targetRegularCityCount = citySeeds.filter(city => !(city.kind === "stronghold" || city.strongholdType)).length;
    const seededCityCount = Math.max(0, Number(islandData.seededCityCount) || 0);
    const layoutSeedVersion = Math.max(0, Number(islandData.layoutSeedVersion) || 0);
    const needsCitySeed = !islandSnap.exists()
      || seededCityCount < targetCityCount;
    const needsLayoutRefresh = islandSnap.exists() && layoutSeedVersion < targetVersion;

    if (islandSnap.exists() && !needsCitySeed && !needsLayoutRefresh && seededCityCount === targetCityCount) {
      return true;
    }

    if (!needsCitySeed && !needsLayoutRefresh) {
      try {
        await setDoc(islandRef, {
          id: islandId,
          version: targetVersion,
          cityCount: targetCityCount,
          regularCityCount: targetRegularCityCount,
          createdBy: islandData.createdBy || uid,
          updatedAt: serverTimestamp(),
          ...meta,
          layoutSeedVersion: targetVersion,
          seededCityCount: targetCityCount,
        }, { merge: true });
      } catch (error) {
        console.warn("Could not refresh island metadata; using existing seeded island.", error);
      }
      return true;
    }

    if (!islandSnap.exists()) {
      await setDoc(islandRef, {
        id: islandId,
        version: targetVersion,
        cityCount: targetCityCount,
        regularCityCount: targetRegularCityCount,
        createdBy: uid,
        updatedAt: serverTimestamp(),
        ...meta,
      }, { merge: true });
    }

    let existingCityIds = new Set();
    let existingCityDataById = new Map();
    let seedsToWrite = citySeeds;
    if (islandSnap.exists()) {
      const citiesSnap = await getDocs(collection(client.db, "islands", islandId, "cities"));
      existingCityIds = new Set(citiesSnap.docs.map(cityDoc => cityDoc.id));
      existingCityDataById = new Map(citiesSnap.docs.map(cityDoc => [cityDoc.id, cityDoc.data() || {}]));
      seedsToWrite = needsLayoutRefresh
        ? citySeeds
        : citySeeds.filter(city => !existingCityIds.has(city.id));
    }

    let batch = writeBatch(client.db);
    let writes = 0;
    for (const city of seedsToWrite) {
      const alreadyExists = existingCityIds.has(city.id);
      const existingCity = existingCityDataById.get(city.id) || {};
      const isStrongholdCity = city.kind === "stronghold" || Boolean(city.strongholdType);
      const existingOwnedByPlayer = existingCity.ownerKind === "player" || existingCity.owner === "player" || Boolean(existingCity.ownerUid);
      const shouldRefreshStrongholdDefense = isStrongholdCity && (!alreadyExists || (needsLayoutRefresh && !existingOwnedByPlayer));
      batch.set(doc(client.db, "islands", islandId, "cities", city.id), {
        ...cleanCityLayoutSeed(city),
        ...(shouldRefreshStrongholdDefense ? {
          level: Math.max(1, Math.floor(Number(city.level) || 1)),
          troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
          troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
        } : {}),
        ...(alreadyExists ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      writes += 1;
      if (writes >= 450) {
        await batch.commit();
        batch = writeBatch(client.db);
        writes = 0;
      }
    }
    if (writes > 0) await batch.commit();

    try {
      await setDoc(islandRef, {
        layoutSeedVersion: targetVersion,
        seededCityCount: targetCityCount,
        regularCityCount: targetRegularCityCount,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.warn("Could not refresh island seed metadata after setup.", error);
    }

    return true;
  }

  async function claimStartingCity({
    islandId = "main",
    candidateCityIds = [],
    playerName = "",
    flag = null,
    worldId = "",
    mainRegionId = "",
    minimumNeutralCities = 0,
  } = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return null;
    const { doc, runTransaction, serverTimestamp, increment } = client.modules.firestore;
    const playerRef = doc(client.db, "players", uid);
    const islandRef = doc(client.db, "islands", islandId);
    const uniqueCandidateIds = [...new Set(candidateCityIds.filter(Boolean))];
    const safePlayerName = String(playerName || client.user.displayName || "Ruler").slice(0, 32);
    const safeWorldId = String(worldId || "").slice(0, 64);
    const safeMainRegionId = String(mainRegionId || "").slice(0, 64);
    const neutralCityReserve = Math.max(0, Math.floor(Number(minimumNeutralCities) || 0));

    return runTransaction(client.db, async transaction => {
      const playerSnap = await transaction.get(playerRef);
      const playerData = playerSnap.exists() ? playerSnap.data() : {};
      const existingMainCityId = String(playerData.mainCityId || "");
      const existingMainIslandId = String(playerData.mainIslandId || "");
      const existingWorldId = String(playerData.worldId || "");
      const playerFlag = flag || playerData.flag || null;
      const playerWorldId = safeWorldId || playerData.worldId || "";
      const playerRegionId = safeMainRegionId || playerData.mainRegionId || "";
      const playerKingPower = Math.max(0, Math.floor(Number(playerData.kingPower) || 0));
      const writePlayerMainCity = cityId => {
        transaction.set(playerRef, {
          uid,
          displayName: client.user.displayName || "",
          email: client.user.email || "",
          photoURL: client.user.photoURL || "",
          playerName: safePlayerName,
          flag: playerFlag,
          worldId: playerWorldId,
          mainIslandId: islandId,
          mainRegionId: playerRegionId,
          mainCityId: cityId,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      };
      const writeCityOwner = (cityRef, cityData = {}, { includeTroops = false, minTroops = 0, setClaimedAt = false, troopsOverride = null } = {}) => {
        const hasTroopOverride = Number.isFinite(Number(troopsOverride));
        const baseTroops = hasTroopOverride ? Number(troopsOverride) : Number(cityData.troops);
        const baseTroopFloat = hasTroopOverride ? Number(troopsOverride) : (Number(cityData.troopFloat) || Number(cityData.troops));
        const troops = Math.max(minTroops, Math.floor(baseTroops || 0));
        const troopFloat = Math.max(minTroops, baseTroopFloat || 0);
        transaction.set(cityRef, {
          ownerKind: "player",
          ownerUid: uid,
          ownerName: safePlayerName,
          ownerFlag: playerFlag,
          ownerKingPower: playerKingPower,
          ...(includeTroops ? { troops, troopFloat } : {}),
          ...(setClaimedAt ? { claimedAt: cityData.claimedAt || serverTimestamp() } : {}),
          isMainCity: true,
          relinquishedAtMs: 0,
          relocatedAtMs: 0,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      };
      const countNewPlayerOnIsland = () => {
        transaction.set(islandRef, {
          playerCount: increment(1),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      };

      if (existingMainCityId && existingMainIslandId && existingMainIslandId !== islandId && (!safeWorldId || existingWorldId === safeWorldId)) {
        return {
          cityId: existingMainCityId,
          islandId: existingMainIslandId,
          mainRegionId: String(playerData.mainRegionId || ""),
          alreadyClaimed: true,
          redirected: true,
        };
      }

      if (playerData.mainIslandId === islandId && existingMainCityId) {
        const mainCityRef = doc(client.db, "islands", islandId, "cities", existingMainCityId);
        const mainCitySnap = await transaction.get(mainCityRef);
        if (!mainCitySnap.exists()) {
          // Continue below and claim a fresh city from the current world layout.
        } else {
          const mainCityData = mainCitySnap.data() || {};
          const mainOwnedByUser = mainCityData.ownerUid === uid;
          const mainClaimable = !mainCityData.ownerUid;
          if (mainOwnedByUser) {
            return {
              cityId: existingMainCityId,
              alreadyClaimed: true,
            };
          }
          writePlayerMainCity(existingMainCityId);
          writeCityOwner(mainCityRef, mainCityData, {
            includeTroops: true,
            minTroops: mainOwnedByUser ? 0 : mainClaimable ? 50 : 0,
            setClaimedAt: true,
            troopsOverride: !mainOwnedByUser && !mainClaimable ? 0 : null,
          });
          if (mainClaimable) countNewPlayerOnIsland();
          return {
            cityId: existingMainCityId,
            alreadyClaimed: mainOwnedByUser,
            repairedMainCity: !mainOwnedByUser && !mainClaimable,
          };
        }
      }

      for (const cityId of uniqueCandidateIds) {
        const cityRef = doc(client.db, "islands", islandId, "cities", cityId);
        const citySnap = await transaction.get(cityRef);
        if (!citySnap.exists()) continue;
        const data = citySnap.data() || {};
        if (data.ownerUid !== uid) continue;
        writePlayerMainCity(cityId);
        writeCityOwner(cityRef, data);
        return { cityId, alreadyClaimed: true };
      }

      let chosenRef = null;
      let chosenData = null;
      let chosenCityId = "";
      let neutralCityCount = 0;
      for (const cityId of uniqueCandidateIds) {
        const cityRef = doc(client.db, "islands", islandId, "cities", cityId);
        const citySnap = await transaction.get(cityRef);
        if (!citySnap.exists()) continue;
        const data = citySnap.data();
        const isStrongholdCity = data.kind === "stronghold" || Boolean(data.strongholdType);
        const ownerKind = data.ownerKind || data.owner || "neutral";
        const hasPlayerOwner = ownerKind === "player" && Boolean(data.ownerUid);
        const isNeutralRegularCity = !isStrongholdCity && !hasPlayerOwner && !data.ownerUid;
        if (isNeutralRegularCity) {
          neutralCityCount += 1;
        }
        if (!chosenRef && isNeutralRegularCity) {
          chosenRef = cityRef;
          chosenData = data;
          chosenCityId = cityId;
        }
      }

      if (neutralCityReserve > 0 && neutralCityCount < neutralCityReserve) {
        throw new Error(`That map needs at least ${neutralCityReserve} neutral cities before a new ruler can spawn there.`);
      }

      if (!chosenRef || !chosenData || !chosenCityId) {
        throw new Error("No unclaimed starting city is available.");
      }

      writePlayerMainCity(chosenCityId);
      writeCityOwner(chosenRef, chosenData, {
        includeTroops: true,
        minTroops: 50,
        setClaimedAt: true,
      });
      countNewPlayerOnIsland();

      return { cityId: chosenCityId, alreadyClaimed: false };
    });
  }

  async function savePlayerCities(islandId = "main", cities = []) {
    await init();
    const uid = requireSignedIn();
    if (!uid || !Array.isArray(cities) || !cities.length) return false;
    const { doc, writeBatch, serverTimestamp } = client.modules.firestore;
    const batch = writeBatch(client.db);

    for (const city of cities) {
      if (!city?.id) continue;
      batch.set(doc(client.db, "islands", islandId, "cities", city.id), {
        ...cleanCitySeed(city),
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
    await setDoc(doc(client.db, "islands", islandId, "cities", city.id), {
      ...cleanCitySeed(city),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
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
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }

  function cleanLeaderboardEntry(entry = {}) {
    return {
      uid: client.user?.uid || "",
      displayName: String(entry.displayName || entry.playerName || client.user?.displayName || "Ruler").slice(0, 32),
      playerName: String(entry.playerName || entry.displayName || client.user?.displayName || "Ruler").slice(0, 32),
      flag: entry.flag || null,
      kingPower: Math.max(0, Math.floor(Number(entry.kingPower) || 0)),
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
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    await setDoc(doc(client.db, "leaderboards", "kingPower", "entries", uid), {
      ...cleanLeaderboardEntry({ ...entry, updatedAtMs: Date.now() }),
      uid,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }

  async function loadKingPowerLeaderboard(limitCount = 100) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return [];
    const { collection, getDocs, query: firestoreQuery, orderBy, limit: firestoreLimit } = client.modules.firestore;
    const entriesRef = collection(client.db, "leaderboards", "kingPower", "entries");
    const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limitCount) || 100)));
    const queryRef = firestoreQuery && orderBy && firestoreLimit
      ? firestoreQuery(entriesRef, orderBy("kingPower", "desc"), firestoreLimit(safeLimit))
      : entriesRef;
    const snapshot = await getDocs(queryRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    const { collection, getDocs, query: firestoreQuery, where } = client.modules.firestore;
    if (!firestoreQuery || !where) return [];
    const uniqueIslandIds = [...new Set((Array.isArray(islandIds) ? islandIds : [])
      .map(islandId => String(islandId || "").trim())
      .filter(Boolean))];
    const results = [];
    for (const islandId of uniqueIslandIds) {
      const citiesRef = collection(client.db, "islands", islandId, "cities");
      const ownedRef = firestoreQuery(citiesRef, where("ownerUid", "==", uid));
      const snapshot = await getDocs(ownedRef);
      snapshot.docs.forEach(cityDoc => {
        results.push({ islandId, id: cityDoc.id, ...cityDoc.data() });
      });
    }
    return results;
  }

  async function loadServerReports(limitCount = 120) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return [];
    const { collection, getDocs, query: firestoreQuery, orderBy, limit } = client.modules.firestore;
    const reportsRef = collection(client.db, "players", uid, "serverReports");
    const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limitCount) || 120)));
    const reportsQuery = firestoreQuery && orderBy && limit
      ? firestoreQuery(reportsRef, orderBy("createdAtMs", "desc"), limit(safeLimit))
      : reportsRef;
    const snapshot = await getDocs(reportsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  function subscribeServerReports(handlers = {}) {
    if (!client.configured || !client.db || !client.user?.uid) return () => {};
    const { collection, onSnapshot, query: firestoreQuery, orderBy, limit } = client.modules.firestore;
    const reportsRef = collection(client.db, "players", client.user.uid, "serverReports");
    const reportsQuery = firestoreQuery && orderBy && limit
      ? firestoreQuery(reportsRef, orderBy("createdAtMs", "desc"), limit(120))
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
    savePlayerProfile,
    loadPlayerProfile,
    collectEconomy,
    upgradeCity,
    relinquishCity,
    relocateMainCity,
    purchaseShopItem,
    activateInventoryItem,
    saveGameSnapshot,
    loadGameSnapshot,
    sendArmyOrder,
    resolveArmyOrder,
    enablePushNotifications,
    registerPushNotifications,
    disablePushNotifications,
    ensureMainIsland,
    claimStartingCity,
    savePlayerCities,
    saveCityState,
    loadIslandCities,
    savePresence,
    saveKingPowerLeaderboardEntry,
    loadKingPowerLeaderboard,
    loadKingPowerPresenceLeaderboard,
    loadIslandCitySummary,
    loadOwnedCitiesAcrossIslands,
    loadServerReports,
    subscribeIsland,
    subscribeServerReports,
    isPushSupported,
    getNotificationPermission,
    requestNotificationPermission,
    hasNotificationVapidKey: () => Boolean(getNotificationVapidKey()),
    usesServerArmyAuthority: () => Boolean(client.functions && client.modules?.functions?.httpsCallable),
    usesServerEconomyAuthority,
    isConfigured: () => client.configured,
    isReady: () => client.ready,
    isSignedIn: () => Boolean(client.user?.uid),
    getUser: () => client.user,
    getLastError: () => client.error,
  };

  init();
})();
