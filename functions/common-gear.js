(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CROWNLANDS_COMMON_GEAR = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const RARITY = "common";
  const MAX_LEVEL = 5;
  const BOX_REVEAL_COUNT = 3;
  const SHOP_DAILY_LIMIT = 1;
  const SHOP_PRICE_HOURS = 1;
  const RELIC_BONUS_CHANCE_PERCENT = 1;
  const CASUALTY_RECOVERY_CAP_PERCENT = 75;
  const BONUS_BY_LEVEL = Object.freeze({ 1: 0.25, 2: 0.5, 3: 0.8, 4: 1.15, 5: 1.5 });
  const UPGRADE_BY_LEVEL = Object.freeze({
    1: Object.freeze({ duplicates: 1, baseGoldHours: 0.5 }),
    2: Object.freeze({ duplicates: 1, baseGoldHours: 1 }),
    3: Object.freeze({ duplicates: 1, baseGoldHours: 2 }),
    4: Object.freeze({ duplicates: 1, baseGoldHours: 4 }),
  });
  const SLOTS = Object.freeze(["head", "chest", "pants", "boots", "gloves", "belt", "weapon", "necklace"]);
  const ARMOR_SLOTS = new Set(["head", "chest", "pants", "boots", "gloves", "belt"]);
  const BUILDINGS = Object.freeze({
    barracks: Object.freeze({
      id: "barracks",
      name: "Barracks",
      characterRole: "War Captain",
      gender: "male",
      characterArt: "assets/optimized/gear-war-captain-768x1024-874eece78b2b.webp",
    }),
    treasury: Object.freeze({
      id: "treasury",
      name: "Treasury",
      characterRole: "Master of Coin",
      gender: "male",
      characterArt: "assets/optimized/gear-master-of-coin-768x1024-c419371e4af4.webp",
    }),
    "royal-stables": Object.freeze({
      id: "royal-stables",
      name: "Royal Stables",
      characterRole: "Cavalry Master",
      gender: "male",
      characterArt: "assets/optimized/gear-cavalry-master-768x1024-8fb4bc09583d.webp",
    }),
    gatehouse: Object.freeze({
      id: "gatehouse",
      name: "Gatehouse",
      characterRole: "Defensive Commander",
      gender: "male",
      characterArt: "assets/optimized/gear-defensive-commander-768x1024-d70e34617770.webp",
    }),
  });

  const NAMES = Object.freeze({
    barracks: Object.freeze({
      head: "War Captain's Iron Helm",
      chest: "War Captain's Scale Cuirass",
      pants: "War Captain's Battle Greaves",
      boots: "War Captain's Marching Boots",
      gloves: "War Captain's Officer Gauntlets",
      belt: "War Captain's Campaign Belt",
      weapon: "War Captain's Officer Sword",
      necklace: "War Captain's Valor Medallion",
    }),
    treasury: Object.freeze({
      head: "Master of Coin's Velvet Cap",
      chest: "Master of Coin's Counting Robe",
      pants: "Master of Coin's Court Breeches",
      boots: "Master of Coin's Sealed Shoes",
      gloves: "Master of Coin's Ledger Gloves",
      belt: "Master of Coin's Tax Sash",
      weapon: "Master of Coin's Royal Ledger",
      necklace: "Master of Coin's Treasury Chain",
    }),
    "royal-stables": Object.freeze({
      head: "Cavalry Master's Riding Helm",
      chest: "Cavalry Master's Brigandine",
      pants: "Cavalry Master's Riding Breeches",
      boots: "Cavalry Master's Silver Spurs",
      gloves: "Cavalry Master's Rein Gloves",
      belt: "Cavalry Master's Courier Belt",
      weapon: "Cavalry Master's Lance",
      necklace: "Cavalry Master's Wayfinder Pendant",
    }),
    gatehouse: Object.freeze({
      head: "Defensive Commander's Wallwarden Helm",
      chest: "Defensive Commander's Guard Cuirass",
      pants: "Defensive Commander's Gate Legguards",
      boots: "Defensive Commander's Mason Boots",
      gloves: "Defensive Commander's Repair Gauntlets",
      belt: "Defensive Commander's Key Belt",
      weapon: "Defensive Commander's Fortress Shield",
      necklace: "Defensive Commander's Masonry Seal",
    }),
  });

  const ART = Object.freeze({
    barracks: Object.freeze({
      head: "assets/optimized/gear-barracks-head-192x192-ddfca042092e.webp",
      chest: "assets/optimized/gear-barracks-chest-192x192-5bf7f2f81d43.webp",
      pants: "assets/optimized/gear-barracks-pants-192x192-aa7681a0d218.webp",
      boots: "assets/optimized/gear-barracks-boots-192x192-31f6f4acf5a8.webp",
      gloves: "assets/optimized/gear-barracks-gloves-192x192-3650d294bb20.webp",
      belt: "assets/optimized/gear-barracks-belt-192x192-22c149def2a2.webp",
      weapon: "assets/optimized/gear-barracks-weapon-192x192-b7b87ac61ab5.webp",
      necklace: "assets/optimized/gear-barracks-necklace-192x192-cb826e33fc7c.webp",
    }),
    treasury: Object.freeze({
      head: "assets/optimized/gear-treasury-head-192x192-59a799630050.webp",
      chest: "assets/optimized/gear-treasury-chest-192x192-8282ca8e8c95.webp",
      pants: "assets/optimized/gear-treasury-pants-192x192-815cef42162e.webp",
      boots: "assets/optimized/gear-treasury-boots-192x192-48fc893bf662.webp",
      gloves: "assets/optimized/gear-treasury-gloves-192x192-29229880978c.webp",
      belt: "assets/optimized/gear-treasury-belt-192x192-320ede3cd1c6.webp",
      weapon: "assets/optimized/gear-treasury-weapon-192x192-a0b3ce1bda06.webp",
      necklace: "assets/optimized/gear-treasury-necklace-192x192-3b8ab65f56c8.webp",
    }),
    "royal-stables": Object.freeze({
      head: "assets/optimized/gear-royal-stables-head-192x192-f1b0833a9acc.webp",
      chest: "assets/optimized/gear-royal-stables-chest-192x192-776cca04e358.webp",
      pants: "assets/optimized/gear-royal-stables-pants-192x192-c51b1877bfbb.webp",
      boots: "assets/optimized/gear-royal-stables-boots-192x192-4878bf5c812e.webp",
      gloves: "assets/optimized/gear-royal-stables-gloves-192x192-be3b5af1f591.webp",
      belt: "assets/optimized/gear-royal-stables-belt-192x192-9c96454e7d12.webp",
      weapon: "assets/optimized/gear-royal-stables-weapon-192x192-41b2b4d9099a.webp",
      necklace: "assets/optimized/gear-royal-stables-necklace-192x192-7e68b4ce42ec.webp",
    }),
    gatehouse: Object.freeze({
      head: "assets/optimized/gear-gatehouse-head-192x192-9b6a2150f2a2.webp",
      chest: "assets/optimized/gear-gatehouse-chest-192x192-11e03cd6c3d7.webp",
      pants: "assets/optimized/gear-gatehouse-pants-192x192-8c7aa54422f0.webp",
      boots: "assets/optimized/gear-gatehouse-boots-192x192-219020eda9de.webp",
      gloves: "assets/optimized/gear-gatehouse-gloves-192x192-1f3d86bddd0e.webp",
      belt: "assets/optimized/gear-gatehouse-belt-192x192-e86b7289c8d4.webp",
      weapon: "assets/optimized/gear-gatehouse-weapon-192x192-13df55207b92.webp",
      necklace: "assets/optimized/gear-gatehouse-necklace-192x192-3218af1d5559.webp",
    }),
  });

  function getEffect(buildingId, slot) {
    if (buildingId === "barracks") {
      if (ARMOR_SLOTS.has(slot)) return ["troopProductionAllCities", "troop production in all owned cities"];
      if (slot === "weapon") return ["attackStrength", "attack strength for all attacks"];
      return ["casualtyEfficiency", "casualty recovery with Field Medics (75% combined cap; recovered troops return to the main city)"];
    }
    if (buildingId === "treasury") {
      if (slot === "necklace") return ["goldProductionAllCities", "gold production in all owned cities"];
      return ["goldProductionMainCity", "gold production in the main city"];
    }
    if (buildingId === "royal-stables") {
      if (ARMOR_SLOTS.has(slot)) return ["ownedMarchSpeed", "owned-city transfer and reinforcement speed"];
      if (slot === "weapon") return ["enemyMarchSpeed", "attack and rally march speed"];
      return ["scoutSpeed", "scout speed"];
    }
    if (ARMOR_SLOTS.has(slot)) return ["wallStrength", "wall strength in all owned cities"];
    if (slot === "weapon") return ["defenderStrength", "defending soldier strength in all owned cities"];
    return ["wallRepairSpeed", "reduction to repair time added by new wall damage"];
  }

  const DEFINITIONS = Object.freeze(Object.values(BUILDINGS).flatMap(building => (
    SLOTS.map(slot => {
      const [statType, statLabel] = getEffect(building.id, slot);
      return Object.freeze({
        gearKey: `${building.id.replace(/-/g, "_")}_${slot}_common_01`,
        gearName: NAMES[building.id][slot],
        art: ART[building.id][slot],
        buildingId: building.id,
        buildingName: building.name,
        characterRole: building.characterRole,
        slot,
        category: ARMOR_SLOTS.has(slot) ? "armor" : slot === "weapon" ? "weapon" : "jewelry",
        rarity: RARITY,
        maxLevel: MAX_LEVEL,
        statType,
        statScope: statType,
        statLabel,
        bonusByLevel: BONUS_BY_LEVEL,
        isToolInsteadOfWeapon: building.id === "treasury" && slot === "weapon",
      });
    })
  )));
  const DEFINITIONS_BY_KEY = new Map(DEFINITIONS.map(definition => [definition.gearKey, definition]));

  function timestampToMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return Math.max(0, value.toMillis());
    if (Number.isFinite(Number(value))) return Math.max(0, Math.floor(Number(value)));
    if (Number.isFinite(Number(value.seconds))) {
      return Math.max(0, Math.floor(Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1000000));
    }
    return 0;
  }

  function cleanId(value, maximum = 128) {
    return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, maximum);
  }

  function createEmptyEquipped() {
    return Object.fromEntries(Object.keys(BUILDINGS).map(buildingId => [
      buildingId,
      Object.fromEntries(SLOTS.map(slot => [slot, ""])),
    ]));
  }

  function createDefaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      commonGearBoxes: 0,
      instances: {},
      equipped: createEmptyEquipped(),
      newMarkers: Object.fromEntries(Object.keys(BUILDINGS).map(buildingId => [buildingId, false])),
      shopPurchase: { utcDate: "", purchaseCount: 0 },
      lastOpenRequestId: "",
      lastOpenReceipt: null,
      updatedAtMs: 0,
    };
  }

  function normalizeInstance(raw, fallbackId = "") {
    if (!raw || typeof raw !== "object") return null;
    const instanceId = cleanId(raw.instanceId || raw.id || fallbackId, 128);
    const gearKey = cleanId(raw.gearKey, 128);
    const definition = DEFINITIONS_BY_KEY.get(gearKey);
    if (!instanceId || !definition) return null;
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(raw.level) || 1)));
    return {
      instanceId,
      gearKey,
      buildingId: definition.buildingId,
      slot: definition.slot,
      rarity: RARITY,
      level,
      isEquipped: false,
      isNew: raw.isNew === true,
      acquiredAtMs: timestampToMs(raw.acquiredAtMs || raw.acquiredAt),
      upgradedAtMs: timestampToMs(raw.upgradedAtMs || raw.upgradedAt),
    };
  }

  function normalizeState(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const state = createDefaultState();
    state.commonGearBoxes = Math.max(0, Math.min(9999, Math.floor(Number(source.commonGearBoxes) || 0)));
    Object.entries(source.instances && typeof source.instances === "object" ? source.instances : {})
      .slice(0, 2000)
      .forEach(([instanceId, value]) => {
        const instance = normalizeInstance(value, instanceId);
        if (instance) state.instances[instance.instanceId] = instance;
      });
    Object.keys(BUILDINGS).forEach(buildingId => {
      SLOTS.forEach(slot => {
        const instanceId = cleanId(source.equipped?.[buildingId]?.[slot], 128);
        const instance = state.instances[instanceId];
        if (!instance || instance.buildingId !== buildingId || instance.slot !== slot) return;
        state.equipped[buildingId][slot] = instanceId;
        instance.isEquipped = true;
      });
      state.newMarkers[buildingId] = source.newMarkers?.[buildingId] === true
        || Object.values(state.instances).some(instance => instance.buildingId === buildingId && instance.isNew);
    });
    const purchaseDate = String(source.shopPurchase?.utcDate || "").slice(0, 10);
    state.shopPurchase = {
      utcDate: /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? purchaseDate : "",
      purchaseCount: Math.max(0, Math.min(SHOP_DAILY_LIMIT, Math.floor(Number(source.shopPurchase?.purchaseCount) || 0))),
    };
    state.lastOpenRequestId = cleanId(source.lastOpenRequestId, 96);
    const receipt = source.lastOpenReceipt && typeof source.lastOpenReceipt === "object" ? source.lastOpenReceipt : null;
    state.lastOpenReceipt = receipt ? {
      requestId: cleanId(receipt.requestId, 96),
      openedAtMs: timestampToMs(receipt.openedAtMs),
      instanceIds: (Array.isArray(receipt.instanceIds) ? receipt.instanceIds : []).map(id => cleanId(id, 128)).filter(id => state.instances[id]).slice(0, BOX_REVEAL_COUNT),
    } : null;
    state.updatedAtMs = timestampToMs(source.updatedAtMs || source.updatedAt);
    return state;
  }

  function getDefinition(gearKey) {
    return DEFINITIONS_BY_KEY.get(String(gearKey || "")) || null;
  }

  function getBonusPercent(instance) {
    return BONUS_BY_LEVEL[Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(instance?.level) || 1)))] || BONUS_BY_LEVEL[1];
  }

  function getBonuses(profileOrGear) {
    const gear = normalizeState(profileOrGear?.gear || profileOrGear);
    const bonuses = {
      troopProductionAllCities: 0,
      attackStrength: 0,
      casualtyEfficiency: 0,
      goldProductionMainCity: 0,
      goldProductionAllCities: 0,
      ownedMarchSpeed: 0,
      enemyMarchSpeed: 0,
      scoutSpeed: 0,
      wallStrength: 0,
      defenderStrength: 0,
      wallRepairSpeed: 0,
    };
    Object.values(gear.equipped).forEach(slots => Object.values(slots).forEach(instanceId => {
      const instance = gear.instances[instanceId];
      const definition = instance ? getDefinition(instance.gearKey) : null;
      if (!definition || !Object.prototype.hasOwnProperty.call(bonuses, definition.statType)) return;
      bonuses[definition.statType] += getBonusPercent(instance);
    }));
    Object.keys(bonuses).forEach(key => { bonuses[key] = Number(bonuses[key].toFixed(2)); });
    return bonuses;
  }

  function getUpgradeRequirement(level) {
    const normalizedLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1)));
    return UPGRADE_BY_LEVEL[normalizedLevel] || null;
  }

  function getUpgradeMaterialInstances(target, instances = []) {
    if (!target || typeof target !== "object") return [];
    const candidates = Array.isArray(instances)
      ? instances
      : Object.values(instances && typeof instances === "object" ? instances : {});
    return candidates
      .filter(candidate => candidate
        && candidate.instanceId !== target.instanceId
        && candidate.gearKey === target.gearKey
        && candidate.level === target.level
        && !candidate.isEquipped)
      .sort((a, b) => a.acquiredAtMs - b.acquiredAtMs || a.instanceId.localeCompare(b.instanceId));
  }

  return Object.freeze({
    SCHEMA_VERSION,
    RARITY,
    MAX_LEVEL,
    BOX_REVEAL_COUNT,
    SHOP_DAILY_LIMIT,
    SHOP_PRICE_HOURS,
    RELIC_BONUS_CHANCE_PERCENT,
    CASUALTY_RECOVERY_CAP_PERCENT,
    BONUS_BY_LEVEL,
    UPGRADE_BY_LEVEL,
    SLOTS,
    BUILDINGS,
    DEFINITIONS,
    createDefaultState,
    normalizeState,
    normalizeInstance,
    normalizeInstance,
    getDefinition,
    getBonusPercent,
    getBonuses,
    getUpgradeRequirement,
    getUpgradeMaterialInstances,
  });
});
