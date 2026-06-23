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

  function cleanCityOwner(city = {}) {
    const ownerUid = String(city.ownerUid || "").trim();
    const rawOwnerKind = city.ownerKind || city.owner || "neutral";
    const hasPlayerOwner = rawOwnerKind === "player" && ownerUid;
    return {
      ownerKind: hasPlayerOwner ? "player" : "neutral",
      ownerUid: hasPlayerOwner ? ownerUid : null,
      ownerName: hasPlayerOwner ? city.ownerName || "" : "",
      ownerFlag: hasPlayerOwner ? city.ownerFlag || null : null,
    };
  }

  function cleanCitySeed(city) {
    const owner = cleanCityOwner(city);
    return {
      id: city.id,
      name: city.name || city.id,
      x: Number(city.x) || 0,
      y: Number(city.y) || 0,
      startPool: city.startPool || "",
      regionId: city.regionId || city.startPool || "",
      ...owner,
      level: Math.max(1, Math.floor(Number(city.level) || 1)),
      troops: Math.max(0, Math.floor(Number(city.troops) || 0)),
      troopFloat: Math.max(0, Number(city.troopFloat) || Number(city.troops) || 0),
      defense: 1,
      investedGold: Math.max(0, Math.floor(Number(city.investedGold) || 0)),
      lastCapturedAt: city.lastCapturedAt ?? null,
      isMainCity: Boolean(city.isMainCity),
    };
  }

  function cleanCityLayoutSeed(city) {
    return {
      id: city.id,
      name: city.name || city.id,
      x: Number(city.x) || 0,
      y: Number(city.y) || 0,
      startPool: city.startPool || "",
      regionId: city.regionId || city.startPool || "",
      defense: 1,
    };
  }

  function cleanArmyMovement(army) {
    const path = Array.isArray(army?.path)
      ? army.path
          .map(point => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 }))
          .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
      : [];
    const pathSegments = Array.isArray(army?.pathSegments)
      ? army.pathSegments
          .map(segment => {
            const points = Array.isArray(segment?.points)
              ? segment.points
                  .map(point => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 }))
                  .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
              : [];
            if (points.length < 2) return null;
            return {
              regionId: String(segment.regionId || "").slice(0, 64),
              points,
              length: Math.max(0, Number(segment.length) || 0),
            };
          })
          .filter(Boolean)
      : [];
    const routeRegionIds = Array.isArray(army?.routeRegionIds)
      ? [...new Set(army.routeRegionIds.map(regionId => String(regionId || "").slice(0, 64)).filter(Boolean))]
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
      pathSegments,
      routeRegionIds,
      pathLength: Math.max(0, Number(army?.pathLength) || 0),
      targetOwnerAtLaunch: String(army?.targetOwnerAtLaunch || "neutral"),
      launchedAtMs: Math.max(0, Number(army?.launchedAtMs) || Date.now()),
      arrivesAtMs: Math.max(0, Number(army?.arrivesAtMs) || Date.now()),
      status: army?.status || "active",
    };
  }

  function cleanPresence(presence = {}) {
    return {
      uid: client.user?.uid || "",
      displayName: String(presence.displayName || client.user?.displayName || "Ruler").slice(0, 32),
      playerName: String(presence.playerName || presence.displayName || client.user?.displayName || "Ruler").slice(0, 32),
      islandId: String(presence.islandId || "main").slice(0, 64),
      mainCityId: String(presence.mainCityId || ""),
      cityCount: Math.max(0, Math.floor(Number(presence.cityCount) || 0)),
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
    const seededCityCount = Math.max(0, Number(islandData.seededCityCount) || 0);
    const layoutSeedVersion = Math.max(0, Number(islandData.layoutSeedVersion) || 0);
    const needsCitySeed = !islandSnap.exists()
      || seededCityCount < targetCityCount;

    if (islandSnap.exists() && !needsCitySeed && layoutSeedVersion >= targetVersion && seededCityCount === targetCityCount) {
      return true;
    }

    if (!needsCitySeed) {
      try {
        await setDoc(islandRef, {
          id: islandId,
          version: targetVersion,
          cityCount: targetCityCount,
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
        createdBy: uid,
        updatedAt: serverTimestamp(),
        ...meta,
      }, { merge: true });
    }

    let seedsToWrite = citySeeds;
    if (islandSnap.exists()) {
      const citiesSnap = await getDocs(collection(client.db, "islands", islandId, "cities"));
      const existingCityIds = new Set(citiesSnap.docs.map(cityDoc => cityDoc.id));
      seedsToWrite = citySeeds.filter(city => !existingCityIds.has(city.id));
    }

    let batch = writeBatch(client.db);
    let writes = 0;
    for (const city of seedsToWrite) {
      batch.set(doc(client.db, "islands", islandId, "cities", city.id), {
        ...cleanCityLayoutSeed(city),
        createdAt: serverTimestamp(),
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

    return runTransaction(client.db, async transaction => {
      const playerSnap = await transaction.get(playerRef);
      const playerData = playerSnap.exists() ? playerSnap.data() : {};
      const existingMainCityId = String(playerData.mainCityId || "");
      const existingMainIslandId = String(playerData.mainIslandId || "");
      const existingWorldId = String(playerData.worldId || "");
      const playerFlag = flag || playerData.flag || null;
      const playerWorldId = safeWorldId || playerData.worldId || "";
      const playerRegionId = safeMainRegionId || playerData.mainRegionId || "";
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
          ...(includeTroops ? { troops, troopFloat } : {}),
          ...(setClaimedAt ? { claimedAt: cityData.claimedAt || serverTimestamp() } : {}),
          isMainCity: true,
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
      for (const cityId of uniqueCandidateIds) {
        const cityRef = doc(client.db, "islands", islandId, "cities", cityId);
        const citySnap = await transaction.get(cityRef);
        if (!citySnap.exists()) continue;
        const data = citySnap.data();
        if (!data.ownerUid) {
          chosenRef = cityRef;
          chosenData = data;
          chosenCityId = cityId;
          break;
        }
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
    const { doc, deleteDoc, setDoc, serverTimestamp } = client.modules.firestore;
    const armyRef = doc(client.db, "islands", islandId, "armies", safeArmyId);
    if (deleteDoc) {
      try {
        await deleteDoc(armyRef);
        return true;
      } catch (error) {
        console.warn("Could not delete resolved army; marking it resolved instead.", error);
      }
    }
    await setDoc(armyRef, {
      status: "resolved",
      resolvedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
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

  async function loadIslandCitySummary(islandId = "main") {
    await init();
    const uid = requireSignedIn();
    if (!uid || !islandId) return null;
    const { collection, doc, getDoc, getDocs, query: firestoreQuery, where } = client.modules.firestore;
    const citiesRef = collection(client.db, "islands", islandId, "cities");
    const playerCitiesRef = firestoreQuery && where
      ? firestoreQuery(citiesRef, where("ownerKind", "==", "player"))
      : citiesRef;
    const [islandSnap, snapshot] = await Promise.all([
      getDoc(doc(client.db, "islands", islandId)),
      getDocs(playerCitiesRef),
    ]);
    const islandData = islandSnap.exists() ? islandSnap.data() : {};
    const owners = new Set();
    const rivalOwners = new Set();
    let playerHeldCityCount = 0;
    let ownCityCount = 0;
    let rivalCityCount = 0;

    snapshot.docs.forEach(cityDoc => {
      const city = cityDoc.data() || {};
      if (city.kind === "stronghold" || city.strongholdType) return;
      const ownerKind = city.ownerKind || city.owner || "neutral";
      const ownerUid = String(city.ownerUid || "");
      if (ownerKind !== "player" || !ownerUid) return;
      playerHeldCityCount += 1;
      owners.add(ownerUid);
      if (ownerUid === uid) {
        ownCityCount += 1;
      } else {
        rivalCityCount += 1;
        rivalOwners.add(ownerUid);
      }
    });

    return {
      islandId,
      cityCount: Math.max(0, Number(islandData.cityCount) || snapshot.size),
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
    saveGameSnapshot,
    loadGameSnapshot,
    ensureMainIsland,
    claimStartingCity,
    savePlayerCities,
    saveCityState,
    loadIslandCities,
    saveArmyMovement,
    deleteArmyMovement,
    savePresence,
    loadIslandCitySummary,
    loadOwnedCitiesAcrossIslands,
    subscribeIsland,
    isConfigured: () => client.configured,
    isReady: () => client.ready,
    isSignedIn: () => Boolean(client.user?.uid),
    getUser: () => client.user,
    getLastError: () => client.error,
  };

  init();
})();
