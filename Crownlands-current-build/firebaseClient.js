(function () {
  const FIREBASE_VERSION = "10.12.5";
  const REQUIRED_CONFIG_KEYS = ["apiKey", "authDomain", "projectId", "appId"];

  const client = {
    configured: false,
    ready: false,
    user: null,
    error: null,
    app: null,
    auth: null,
    db: null,
    provider: null,
    modules: null,
    initPromise: null,
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
    const [app, auth, firestore] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    ]);
    return { app, auth, firestore };
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

  async function signInWithGoogle() {
    await init();
    if (!client.configured) {
      throw new Error("Firebase config is still using placeholder values.");
    }
    if (client.error) throw client.error;
    const result = await client.modules.auth.signInWithPopup(client.auth, client.provider);
    client.user = serializeUser(result.user);
    await savePlayerProfile({ lastLoginAt: Date.now() });
    return client.user;
  }

  async function signOut() {
    await init();
    if (!client.auth) return;
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
    await setDoc(ref, {
      uid,
      displayName: client.user.displayName || "",
      email: client.user.email || "",
      photoURL: client.user.photoURL || "",
      ...profile,
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

  async function saveGameSnapshot(snapshot, slot = "default") {
    await init();
    const uid = requireSignedIn();
    if (!uid || !snapshot) return false;
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    const ref = doc(client.db, "players", uid, "saves", slot);
    await setDoc(ref, {
      version: Number(snapshot.version) || 0,
      playerName: snapshot.playerName || "",
      gameSeconds: Number(snapshot.gameSeconds) || 0,
      state: snapshot,
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

  function cleanCitySeed(city) {
    return {
      id: city.id,
      name: city.name || city.id,
      x: Number(city.x) || 0,
      y: Number(city.y) || 0,
      startPool: city.startPool || "",
      ownerKind: city.ownerKind || "neutral",
      ownerUid: city.ownerUid || null,
      ownerName: city.ownerName || "",
      ownerFlag: city.ownerFlag || null,
      level: Math.max(1, Math.floor(Number(city.level) || 1)),
      troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
      troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
      defense: 1,
      investedGold: Math.max(0, Math.floor(Number(city.investedGold) || 0)),
      lastCapturedAt: city.lastCapturedAt ?? null,
      isMainCity: Boolean(city.isMainCity),
    };
  }

  function cleanArmyMovement(army) {
    const path = Array.isArray(army?.path)
      ? army.path
          .map(point => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 }))
          .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
      : [];
    return {
      id: String(army?.id || "").slice(0, 96),
      ownerKind: army?.ownerKind || "player",
      ownerUid: army?.ownerUid || client.user?.uid || null,
      ownerName: String(army?.ownerName || client.user?.displayName || "Ruler").slice(0, 32),
      ownerFlag: army?.ownerFlag || null,
      kind: ["attack", "transfer", "scout"].includes(army?.kind) ? army.kind : "attack",
      fromId: String(army?.fromId || ""),
      toId: String(army?.toId || ""),
      fromName: String(army?.fromName || "").slice(0, 40),
      toName: String(army?.toName || "").slice(0, 40),
      troops: Math.max(0, Math.floor(Number(army?.troops) || 0)),
      total: Math.max(0.1, Number(army?.total) || 0.1),
      path,
      pathLength: Math.max(0, Number(army?.pathLength) || 0),
      targetOwnerAtLaunch: String(army?.targetOwnerAtLaunch || "neutral"),
      launchedAtMs: Math.max(0, Number(army?.launchedAtMs) || Date.now()),
      arrivesAtMs: Math.max(0, Number(army?.arrivesAtMs) || Date.now()),
      status: army?.status || "active",
    };
  }

  async function ensureMainIsland({ islandId = "main", cities = [], meta = {} } = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return false;
    const { collection, doc, getDocs, setDoc, writeBatch, serverTimestamp } = client.modules.firestore;
    const islandRef = doc(client.db, "islands", islandId);
    const citySeeds = cities.map(cleanCitySeed);

    await setDoc(islandRef, {
      id: islandId,
      version: Number(meta.version) || 21,
      cityCount: citySeeds.length,
      createdBy: uid,
      updatedAt: serverTimestamp(),
      ...meta,
    }, { merge: true });

    const existingCityIds = new Set();
    const citySnapshot = await getDocs(collection(client.db, "islands", islandId, "cities"));
    citySnapshot.forEach(cityDoc => existingCityIds.add(cityDoc.id));

    let batch = writeBatch(client.db);
    let writes = 0;
    for (const city of citySeeds) {
      if (existingCityIds.has(city.id)) continue;
      batch.set(doc(client.db, "islands", islandId, "cities", city.id), {
        ...city,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writes += 1;
      if (writes >= 450) {
        await batch.commit();
        batch = writeBatch(client.db);
        writes = 0;
      }
    }
    if (writes > 0) await batch.commit();

    return true;
  }

  async function claimStartingCity({
    islandId = "main",
    candidateCityIds = [],
    playerName = "",
    flag = null,
  } = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid) return null;
    const { doc, runTransaction, serverTimestamp, increment } = client.modules.firestore;
    const playerRef = doc(client.db, "players", uid);
    const islandRef = doc(client.db, "islands", islandId);
    const uniqueCandidateIds = [...new Set(candidateCityIds.filter(Boolean))];
    const safePlayerName = String(playerName || client.user.displayName || "Ruler").slice(0, 32);

    return runTransaction(client.db, async transaction => {
      const playerSnap = await transaction.get(playerRef);
      const playerData = playerSnap.exists() ? playerSnap.data() : {};
      const existingMainCityId = String(playerData.mainCityId || "");
      if (playerData.mainIslandId === islandId && existingMainCityId && uniqueCandidateIds.includes(existingMainCityId)) {
        const mainCityRef = doc(client.db, "islands", islandId, "cities", existingMainCityId);
        const mainCitySnap = await transaction.get(mainCityRef);
        if (!mainCitySnap.exists()) {
          // Continue below and claim a fresh city from the current world layout.
        } else {
        transaction.set(playerRef, {
          playerName: safePlayerName,
          flag: flag || playerData.flag || null,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        transaction.set(mainCityRef, {
          ownerKind: "player",
          ownerUid: uid,
          ownerName: safePlayerName,
          ownerFlag: flag || playerData.flag || null,
          isMainCity: true,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        return { cityId: existingMainCityId, alreadyClaimed: true };
        }
      }

      let chosenRef = null;
      let chosenData = null;
      for (const cityId of uniqueCandidateIds) {
        const cityRef = doc(client.db, "islands", islandId, "cities", cityId);
        const citySnap = await transaction.get(cityRef);
        if (!citySnap.exists()) continue;
        const data = citySnap.data();
        if (!data.ownerUid && (data.ownerKind || "neutral") === "neutral") {
          chosenRef = cityRef;
          chosenData = data;
          break;
        }
      }

      if (!chosenRef || !chosenData) {
        throw new Error("No unclaimed starting city is available.");
      }

      transaction.set(playerRef, {
        uid,
        displayName: client.user.displayName || "",
        email: client.user.email || "",
        photoURL: client.user.photoURL || "",
        playerName: safePlayerName,
        flag: flag || null,
        mainIslandId: islandId,
        mainCityId: chosenData.id,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      transaction.set(chosenRef, {
        ownerKind: "player",
        ownerUid: uid,
        ownerName: safePlayerName,
        ownerFlag: flag || null,
        troops: Math.max(50, Math.floor(Number(chosenData.troops) || 0)),
        troopFloat: Math.max(50, Number(chosenData.troopFloat) || Number(chosenData.troops) || 0),
        isMainCity: true,
        claimedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      transaction.set(islandRef, {
        playerCount: increment(1),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      return { cityId: chosenData.id, alreadyClaimed: false };
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

  async function saveArmyMovement(islandId = "main", army = {}) {
    await init();
    const uid = requireSignedIn();
    if (!uid || !army?.id) return false;
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    const cleanArmy = cleanArmyMovement({ ...army, ownerUid: uid });
    if (!cleanArmy.id || !cleanArmy.fromId || !cleanArmy.toId) return false;
    await setDoc(doc(client.db, "islands", islandId, "armies", cleanArmy.id), {
      ...cleanArmy,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }

  async function deleteArmyMovement(islandId = "main", armyId = "") {
    await init();
    const uid = requireSignedIn();
    const safeArmyId = String(armyId || "");
    if (!uid || !safeArmyId) return false;
    const { doc, setDoc, serverTimestamp } = client.modules.firestore;
    await setDoc(doc(client.db, "islands", islandId, "armies", safeArmyId), {
      status: "resolved",
      resolvedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }

  function subscribeIsland(islandId, handlers = {}) {
    if (!client.configured || !client.db || !islandId) return () => {};
    const { collection, doc, onSnapshot } = client.modules.firestore;
    const unsubscribers = [];

    if (typeof handlers.onIsland === "function") {
      unsubscribers.push(onSnapshot(
        doc(client.db, "islands", islandId),
        snapshot => handlers.onIsland(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)
      ));
    }

    if (typeof handlers.onCities === "function") {
      unsubscribers.push(onSnapshot(
        collection(client.db, "islands", islandId, "cities"),
        snapshot => handlers.onCities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      ));
    }

    if (typeof handlers.onArmies === "function") {
      unsubscribers.push(onSnapshot(
        collection(client.db, "islands", islandId, "armies"),
        snapshot => handlers.onArmies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
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
    saveGameSnapshot,
    loadGameSnapshot,
    ensureMainIsland,
    claimStartingCity,
    savePlayerCities,
    saveCityState,
    saveArmyMovement,
    deleteArmyMovement,
    subscribeIsland,
    isConfigured: () => client.configured,
    isReady: () => client.ready,
    isSignedIn: () => Boolean(client.user?.uid),
    getUser: () => client.user,
    getLastError: () => client.error,
  };

  init();
})();
