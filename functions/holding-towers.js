"use strict";

const MODEL_VERSION = 1;
const TOWER_ACCESS_PROBATION_MS = 24 * 60 * 60 * 1000;
const TOWER_NEUTRAL_DEFENDERS = 10_000_000;
const TOWER_MIN_RALLY_MEMBERS = 5;
const TOWER_UPGRADE_MULTIPLIER = 5;
const TOWER_UPGRADE_DURATION_MS = 10 * 60 * 1000;
const TOWER_UPGRADE_QUEUE_LIMIT = 10;
const TOWER_CONQUEST_LEVEL_LOSS = 5;
const TOWER_VEIL_DURATION_MS = 10 * 60 * 1000;
const TOWER_VEIL_DAILY_LIMIT = 3;
const TOWER_DONATION_HOURS = 12;
const WALL_FULL_INTEGRITY_BPS = 10_000;
const MANAGER_ROLES = Object.freeze(["leader", "officer"]);

const TOWERS = Object.freeze([
  Object.freeze({
    id: "core-v2-holding-tower-1",
    name: "Ravenwatch Tower",
    quadrant: "north-west",
    regionId: "core-v2-north-west-holding-tower-m1-m1",
    reservedX: 736,
    reservedY: 552,
  }),
  Object.freeze({
    id: "core-v2-holding-tower-2",
    name: "Highguard Tower",
    quadrant: "north-east",
    regionId: "core-v2-north-east-holding-tower-p1-m1",
    reservedX: 734,
    reservedY: 555,
  }),
  Object.freeze({
    id: "core-v2-holding-tower-3",
    name: "Blackthorn Tower",
    quadrant: "south-west",
    regionId: "core-v2-south-west-holding-tower-m1-p1",
    reservedX: 724,
    reservedY: 543,
  }),
  Object.freeze({
    id: "core-v2-holding-tower-4",
    name: "Stoneward Tower",
    quadrant: "south-east",
    regionId: "core-v2-south-east-holding-tower-p1-p1",
    reservedX: 736,
    reservedY: 555,
  }),
]);

const TOWER_BY_ID = new Map(TOWERS.map(tower => [tower.id, tower]));

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return Math.max(0, Math.floor(value.toMillis()));
  if (typeof value.seconds === "number") {
    return Math.max(0, Math.floor(value.seconds * 1000 + finiteNumber(value.nanoseconds) / 1_000_000));
  }
  return Math.max(0, Math.floor(finiteNumber(value)));
}

function clampInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.min(maximum, Math.max(minimum, Math.floor(finiteNumber(value, minimum))));
}

function requireSafePositiveInteger(value, label = "value") {
  const normalized = Math.floor(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
  return normalized;
}

function safeAdd(left, right, label = "value") {
  const result = clampInteger(left) + clampInteger(right);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds the supported safe-integer range.`);
  return result;
}

function safeMultiply(left, right, label = "value") {
  const result = finiteNumber(left) * finiteNumber(right);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} exceeds the supported safe-integer range.`);
  }
  return Math.max(0, Math.floor(result + 0.000001));
}

function getTowerDefinition(towerId = "") {
  return TOWER_BY_ID.get(String(towerId || "")) || null;
}

function requireTowerDefinition(towerId = "") {
  const tower = getTowerDefinition(towerId);
  if (!tower) throw new RangeError("Unknown Holding Tower.");
  return tower;
}

function getUtcDateKey(nowMs = Date.now()) {
  return new Date(Math.max(0, finiteNumber(nowMs, Date.now()))).toISOString().slice(0, 10);
}

function getNextUtcDayStartMs(nowMs = Date.now()) {
  const now = new Date(Math.max(0, finiteNumber(nowMs, Date.now())));
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function createNeutralTowerState(towerId, {
  worldId = "",
  resetGeneration = "",
  nowMs = Date.now(),
} = {}) {
  const tower = requireTowerDefinition(towerId);
  const createdAtMs = Math.max(0, Math.floor(finiteNumber(nowMs, Date.now())));
  return {
    id: tower.id,
    modelVersion: MODEL_VERSION,
    worldId: String(worldId || ""),
    resetGeneration: String(resetGeneration || ""),
    name: tower.name,
    quadrant: tower.quadrant,
    regionId: tower.regionId,
    x: tower.reservedX,
    y: tower.reservedY,
    ownerKind: "neutral",
    clanId: "",
    clanName: "",
    clanTag: "",
    clanEmblem: null,
    wallLevel: 1,
    wallIntegrityBps: WALL_FULL_INTEGRITY_BPS,
    neutralDefenders: TOWER_NEUTRAL_DEFENDERS,
    upgradeQueue: [],
    repair: null,
    veil: null,
    veilUsage: { utcDate: getUtcDateKey(createdAtMs), count: 0 },
    incomingRallyIds: [],
    attackBlocked: false,
    ownershipRevision: 0,
    createdAtMs,
    updatedAtMs: createdAtMs,
  };
}

function normalizeQueue(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .map((entry, index) => {
      const targetLevel = clampInteger(entry?.targetLevel, 2);
      const fromLevel = clampInteger(entry?.fromLevel, 1);
      if (targetLevel !== fromLevel + 1) return null;
      return {
        id: String(entry?.id || `upgrade_${targetLevel}_${index}`),
        fromLevel,
        targetLevel,
        cost: clampInteger(entry?.cost),
        queuedAtMs: timestampToMs(entry?.queuedAtMs),
        remainingMs: clampInteger(entry?.remainingMs, 0, TOWER_UPGRADE_DURATION_MS),
        progressStartedAtMs: timestampToMs(entry?.progressStartedAtMs),
      };
    })
    .filter(Boolean)
    .slice(0, TOWER_UPGRADE_QUEUE_LIMIT);
}

function normalizeTowerState(raw = {}, nowMs = Date.now()) {
  const definition = requireTowerDefinition(raw.id);
  const currentTimeMs = Math.max(0, Math.floor(finiteNumber(nowMs, Date.now())));
  const ownerKind = raw.ownerKind === "clan" && String(raw.clanId || "") ? "clan" : "neutral";
  const incomingRallyIds = [...new Set((Array.isArray(raw.incomingRallyIds) ? raw.incomingRallyIds : [])
    .map(value => String(value || ""))
    .filter(Boolean))];
  const repair = raw.repair && typeof raw.repair === "object"
    ? {
      id: String(raw.repair.id || ""),
      paidCost: clampInteger(raw.repair.paidCost),
      startIntegrityBps: clampInteger(raw.repair.startIntegrityBps, 0, WALL_FULL_INTEGRITY_BPS),
      startedAtMs: timestampToMs(raw.repair.startedAtMs),
      completeAtMs: timestampToMs(raw.repair.completeAtMs),
      baseWindowMinutes: clampInteger(raw.repair.baseWindowMinutes),
      startedByUid: String(raw.repair.startedByUid || ""),
      clanId: String(raw.repair.clanId || ""),
    }
    : null;
  const usageDate = String(raw.veilUsage?.utcDate || "");
  const veilUsage = usageDate === getUtcDateKey(currentTimeMs)
    ? { utcDate: usageDate, count: clampInteger(raw.veilUsage?.count, 0, TOWER_VEIL_DAILY_LIMIT) }
    : { utcDate: getUtcDateKey(currentTimeMs), count: 0 };
  const veilExpiresAtMs = timestampToMs(raw.veil?.expiresAtMs);
  const veil = veilExpiresAtMs > currentTimeMs
    ? {
      id: String(raw.veil?.id || ""),
      clanId: String(raw.veil?.clanId || ""),
      activatedByUid: String(raw.veil?.activatedByUid || ""),
      activatedAtMs: timestampToMs(raw.veil?.activatedAtMs),
      expiresAtMs: veilExpiresAtMs,
      paidCost: clampInteger(raw.veil?.paidCost),
    }
    : null;
  return {
    ...raw,
    id: definition.id,
    modelVersion: MODEL_VERSION,
    name: definition.name,
    quadrant: definition.quadrant,
    regionId: definition.regionId,
    x: definition.reservedX,
    y: definition.reservedY,
    ownerKind,
    clanId: ownerKind === "clan" ? String(raw.clanId || "") : "",
    clanName: ownerKind === "clan" ? String(raw.clanName || "") : "",
    clanTag: ownerKind === "clan" ? String(raw.clanTag || "") : "",
    clanEmblem: ownerKind === "clan" ? raw.clanEmblem || null : null,
    wallLevel: Math.max(1, clampInteger(raw.wallLevel, 1)),
    wallIntegrityBps: clampInteger(raw.wallIntegrityBps, 0, WALL_FULL_INTEGRITY_BPS),
    neutralDefenders: ownerKind === "neutral"
      ? clampInteger(raw.neutralDefenders, 0)
      : 0,
    upgradeQueue: normalizeQueue(raw.upgradeQueue),
    repair,
    veil,
    veilUsage,
    incomingRallyIds,
    attackBlocked: incomingRallyIds.length > 0 || raw.attackBlocked === true,
    ownershipRevision: clampInteger(raw.ownershipRevision),
    updatedAtMs: timestampToMs(raw.updatedAtMs) || currentTimeMs,
  };
}

function materializeRepair(state, nowMs) {
  if (!state.repair) return state;
  const repair = state.repair;
  if (!repair.startedAtMs || repair.completeAtMs <= repair.startedAtMs) {
    return { ...state, repair: null };
  }
  if (nowMs >= repair.completeAtMs) {
    return { ...state, wallIntegrityBps: WALL_FULL_INTEGRITY_BPS, repair: null };
  }
  const progress = Math.min(1, Math.max(0, (nowMs - repair.startedAtMs) / (repair.completeAtMs - repair.startedAtMs)));
  const integrity = repair.startIntegrityBps
    + Math.floor((WALL_FULL_INTEGRITY_BPS - repair.startIntegrityBps) * progress);
  return { ...state, wallIntegrityBps: clampInteger(integrity, repair.startIntegrityBps, WALL_FULL_INTEGRITY_BPS) };
}

function materializeUpgradeQueue(state, nowMs) {
  const queue = state.upgradeQueue.map(entry => ({ ...entry }));
  let wallLevel = state.wallLevel;
  const canProgress = !state.attackBlocked
    && state.wallIntegrityBps === WALL_FULL_INTEGRITY_BPS
    && !state.repair;
  if (!queue.length) return { ...state, upgradeQueue: queue };
  if (!canProgress) {
    const active = queue[0];
    if (active.progressStartedAtMs) {
      const elapsed = Math.max(0, nowMs - active.progressStartedAtMs);
      active.remainingMs = Math.max(1, (active.remainingMs || TOWER_UPGRADE_DURATION_MS) - elapsed);
      active.progressStartedAtMs = 0;
    }
    return { ...state, upgradeQueue: queue };
  }

  let cursorMs = nowMs;
  while (queue.length) {
    const active = queue[0];
    const remainingMs = active.remainingMs || TOWER_UPGRADE_DURATION_MS;
    const startedAtMs = active.progressStartedAtMs || cursorMs;
    const completeAtMs = startedAtMs + remainingMs;
    if (completeAtMs > nowMs) {
      active.remainingMs = remainingMs;
      active.progressStartedAtMs = startedAtMs;
      break;
    }
    wallLevel = active.targetLevel;
    queue.shift();
    cursorMs = completeAtMs;
  }
  if (queue.length && !queue[0].progressStartedAtMs) queue[0].progressStartedAtMs = cursorMs;
  return { ...state, wallLevel, upgradeQueue: queue };
}

function materializeTowerState(raw = {}, nowMs = Date.now()) {
  const currentTimeMs = Math.max(0, Math.floor(finiteNumber(nowMs, Date.now())));
  let state = normalizeTowerState(raw, currentTimeMs);
  state = materializeRepair(state, currentTimeMs);
  state = materializeUpgradeQueue(state, currentTimeMs);
  return { ...state, updatedAtMs: currentTimeMs };
}

function getMembershipJoinedAtMs(member = {}) {
  return Math.max(timestampToMs(member.joinedAtMs), timestampToMs(member.joinedAt));
}

function isEligibleMember(member = {}, nowMs = Date.now(), clanId = "") {
  if (!member || typeof member !== "object") return false;
  if (clanId && String(member.clanId || "") && String(member.clanId) !== String(clanId)) return false;
  if (member.status && member.status !== "active") return false;
  const joinedAtMs = getMembershipJoinedAtMs(member);
  return joinedAtMs > 0 && Math.max(0, finiteNumber(nowMs, Date.now())) - joinedAtMs >= TOWER_ACCESS_PROBATION_MS;
}

function getEligibility(member = {}, nowMs = Date.now(), clanId = "") {
  const joinedAtMs = getMembershipJoinedAtMs(member);
  const eligibleAtMs = joinedAtMs ? joinedAtMs + TOWER_ACCESS_PROBATION_MS : 0;
  const eligible = isEligibleMember(member, nowMs, clanId);
  return {
    eligible,
    joinedAtMs,
    eligibleAtMs,
    remainingMs: eligible ? 0 : Math.max(0, eligibleAtMs - Math.max(0, finiteNumber(nowMs, Date.now()))),
  };
}

function getEligibleScoutTowerOrigins({
  towers = [],
  garrisonsByTowerId = new Map(),
  clanId = "",
  member = null,
  uid = "",
  nowMs = Date.now(),
  worldId = "",
  resetGeneration = "",
  worldActive = true,
} = {}) {
  const currentClanId = String(clanId || "");
  const playerUid = String(uid || "");
  if (!worldActive || !currentClanId || !playerUid || !isEligibleMember(member, nowMs, currentClanId)) return [];

  const lookupGarrison = towerId => garrisonsByTowerId instanceof Map
    ? garrisonsByTowerId.get(towerId)
    : garrisonsByTowerId?.[towerId];
  return (Array.isArray(towers) ? towers : []).flatMap(rawTower => {
    const towerId = String(rawTower?.id || "");
    const definition = getTowerDefinition(towerId);
    if (!definition || rawTower?.ownerKind !== "clan" || String(rawTower?.clanId || "") !== currentClanId) return [];
    if (worldId && String(rawTower?.worldId || "") !== String(worldId)) return [];
    if (resetGeneration && String(rawTower?.resetGeneration || "") !== String(resetGeneration)) return [];

    const garrison = lookupGarrison(towerId) || {};
    const troops = clampInteger(garrison?.troops);
    if (troops < 1) return [];
    if (garrison?.uid && String(garrison.uid) !== playerUid) return [];
    if (garrison?.towerId && String(garrison.towerId) !== towerId) return [];
    if (garrison?.clanId && String(garrison.clanId) !== currentClanId) return [];
    if (worldId && String(garrison?.worldId || "") !== String(worldId)) return [];
    if (resetGeneration && String(garrison?.resetGeneration || "") !== String(resetGeneration)) return [];

    return [{
      ...rawTower,
      id: towerId,
      name: String(rawTower?.name || definition.name || towerId),
      regionId: String(rawTower?.regionId || definition.regionId || ""),
      x: finiteNumber(rawTower?.x, definition.reservedX),
      y: finiteNumber(rawTower?.y, definition.reservedY),
      sourceType: "tower",
      troops,
      garrison,
    }];
  });
}

function compareStableText(left = "", right = "") {
  const first = String(left || "");
  const second = String(right || "");
  return first === second ? 0 : first < second ? -1 : 1;
}

function selectClosestScoutOrigin(candidates = [], target = {}, buildRoute) {
  if (typeof buildRoute !== "function") throw new TypeError("An authoritative scout route builder is required.");
  const routed = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const sourceType = candidate?.sourceType === "tower" ? "tower" : "city";
    if (!candidate?.id || !candidate?.regionId || clampInteger(candidate?.troops) < 1) continue;
    try {
      const route = buildRoute(candidate, target);
      if (!route || !(finiteNumber(route.pathLength) > 0)) continue;
      routed.push({ ...candidate, sourceType, route });
    } catch (_error) {
      // An unreachable origin is not eligible; other authoritative routes may still succeed.
    }
  }
  routed.sort((left, right) => (
    finiteNumber(left.route?.pathLength, Number.POSITIVE_INFINITY)
      - finiteNumber(right.route?.pathLength, Number.POSITIVE_INFINITY)
    // Stable equal-distance rule: City before Tower, then region and id in lexical order.
    || (left.sourceType === right.sourceType ? 0 : left.sourceType === "city" ? -1 : 1)
    || compareStableText(left.regionId, right.regionId)
    || compareStableText(left.id, right.id)
  ));
  return routed[0] || null;
}

function validateTowerRallyParticipants(participants = [], membersByUid = new Map(), nowMs = Date.now(), clanId = "") {
  const byUid = new Map();
  for (const participant of Array.isArray(participants) ? participants : []) {
    const uid = String(participant?.uid || participant?.ownerUid || "");
    const troops = clampInteger(participant?.troops);
    if (!uid || troops < 1 || byUid.has(uid)) continue;
    const member = membersByUid instanceof Map ? membersByUid.get(uid) : membersByUid?.[uid];
    if (!isEligibleMember(member, nowMs, clanId)) continue;
    byUid.set(uid, { uid, troops, participant });
  }
  const contributors = [...byUid.values()];
  return {
    valid: contributors.length >= TOWER_MIN_RALLY_MEMBERS,
    required: TOWER_MIN_RALLY_MEMBERS,
    count: contributors.length,
    contributors,
  };
}

function getDonationAllowance(rawBaseGoldPerHour, donatedToday = 0, options = {}) {
  const rawGoldPerHour = clampInteger(rawBaseGoldPerHour);
  const dailyCap = safeMultiply(rawGoldPerHour, TOWER_DONATION_HOURS, "daily donation cap");
  const donated = clampInteger(donatedToday, 0, dailyCap);
  const locked = options.locked !== false;
  return {
    donationDayUtc: String(options.donationDayUtc || ""),
    rawGoldPerHourSnapshot: locked ? rawGoldPerHour : null,
    previewRawGoldPerHour: locked ? null : rawGoldPerHour,
    dailyCap,
    donatedToday: donated,
    remaining: Math.max(0, dailyCap - donated),
    locked,
    preview: !locked,
  };
}

function normalizeDonationUsage(rawUsage = {}, donationDayUtc = "") {
  const day = String(donationDayUtc || "");
  const storedDay = String(rawUsage?.donationDayUtc || rawUsage?.utcDate || "");
  if (!day || storedDay !== day) {
    return {
      donationDayUtc: day,
      rawGoldPerHourSnapshot: null,
      dailyDonationCap: null,
      donatedToday: 0,
      locked: false,
    };
  }
  const hasCanonicalSnapshot = Object.prototype.hasOwnProperty.call(rawUsage || {}, "rawGoldPerHourSnapshot");
  const hasLegacySnapshot = Object.prototype.hasOwnProperty.call(rawUsage || {}, "rawBaseGoldPerHour");
  if (!hasCanonicalSnapshot && !hasLegacySnapshot) {
    return {
      donationDayUtc: day,
      rawGoldPerHourSnapshot: null,
      dailyDonationCap: null,
      donatedToday: 0,
      locked: false,
    };
  }
  const rawGoldPerHourSnapshot = clampInteger(
    hasCanonicalSnapshot ? rawUsage.rawGoldPerHourSnapshot : rawUsage.rawBaseGoldPerHour
  );
  const dailyDonationCap = safeMultiply(
    rawGoldPerHourSnapshot,
    TOWER_DONATION_HOURS,
    "daily donation cap"
  );
  const donatedToday = clampInteger(
    rawUsage?.donatedToday ?? rawUsage?.donated,
    0,
    dailyDonationCap
  );
  return {
    donationDayUtc: day,
    rawGoldPerHourSnapshot,
    dailyDonationCap,
    donatedToday,
    locked: true,
  };
}

function getDonationAllowanceForUsage(rawUsage, currentRawBaseGoldPerHour, donationDayUtc) {
  const usage = normalizeDonationUsage(rawUsage, donationDayUtc);
  if (usage.locked) {
    return getDonationAllowance(usage.rawGoldPerHourSnapshot, usage.donatedToday, {
      donationDayUtc,
      locked: true,
    });
  }
  return getDonationAllowance(currentRawBaseGoldPerHour, 0, {
    donationDayUtc,
    locked: false,
  });
}

function applyTreasuryDonation({
  usage = {},
  currentRawBaseGoldPerHour = 0,
  donationDayUtc = "",
  amount = 0,
  personalGold = 0,
  treasury = {},
} = {}) {
  const donation = requireSafePositiveInteger(amount, "donation");
  const normalizedUsage = normalizeDonationUsage(usage, donationDayUtc);
  const rawGoldPerHourSnapshot = normalizedUsage.locked
    ? normalizedUsage.rawGoldPerHourSnapshot
    : clampInteger(currentRawBaseGoldPerHour);
  const allowanceBefore = getDonationAllowance(
    rawGoldPerHourSnapshot,
    normalizedUsage.donatedToday,
    { donationDayUtc, locked: true }
  );
  if (donation > allowanceBefore.remaining) throw new Error("daily-donation-cap-exceeded");
  const availablePersonalGold = finiteNumber(personalGold, -1);
  if (availablePersonalGold < donation) throw new Error("insufficient-personal-gold");
  const balance = safeAdd(treasury?.balance, donation, "Clan Treasury balance");
  const totalDonated = safeAdd(treasury?.totalDonated, donation, "Clan Treasury donated total");
  const donatedToday = safeAdd(normalizedUsage.donatedToday, donation, "daily donation total");
  const allowance = getDonationAllowance(rawGoldPerHourSnapshot, donatedToday, {
    donationDayUtc,
    locked: true,
  });
  return {
    usage: {
      donationDayUtc,
      rawGoldPerHourSnapshot,
      dailyDonationCap: allowance.dailyCap,
      donatedToday,
    },
    allowance,
    personalGold: availablePersonalGold - donation,
    treasury: {
      balance,
      totalDonated,
      totalSpent: clampInteger(treasury?.totalSpent),
    },
  };
}

function getEquivalentCityWallCost(level, canonicalCityUpgradeCost) {
  const wallLevel = requireSafePositiveInteger(level, "wallLevel");
  if (typeof canonicalCityUpgradeCost !== "function") throw new TypeError("A canonical city-wall cost function is required.");
  const cost = canonicalCityUpgradeCost(wallLevel);
  if (!Number.isSafeInteger(cost) || cost < 0) throw new RangeError("The canonical city-wall cost is outside the safe-integer range.");
  return cost;
}

function getTowerWallUpgradeCost(level, canonicalCityUpgradeCost) {
  return safeMultiply(
    getEquivalentCityWallCost(level, canonicalCityUpgradeCost),
    TOWER_UPGRADE_MULTIPLIER,
    "Tower wall upgrade cost"
  );
}

function getTowerVeilCost(level, canonicalCityUpgradeCost) {
  return getEquivalentCityWallCost(level, canonicalCityUpgradeCost);
}

function getTowerRepairCost(level, integrityBps, canonicalCityUpgradeCost) {
  const equivalentCost = getEquivalentCityWallCost(level, canonicalCityUpgradeCost);
  const fullRepairCost = safeMultiply(equivalentCost, TOWER_UPGRADE_MULTIPLIER, "Tower full repair cost");
  const missingBps = WALL_FULL_INTEGRITY_BPS - clampInteger(integrityBps, 0, WALL_FULL_INTEGRITY_BPS);
  const proportional = Math.ceil(fullRepairCost * missingBps / WALL_FULL_INTEGRITY_BPS - 1e-9);
  return Math.min(fullRepairCost, Math.max(0, proportional));
}

function queueWallUpgrades(rawState, count, treasuryBalance, canonicalCityUpgradeCost, nowMs = Date.now(), operationId = "") {
  const state = materializeTowerState(rawState, nowMs);
  const levels = requireSafePositiveInteger(count, "count");
  if (levels > TOWER_UPGRADE_QUEUE_LIMIT) throw new RangeError("At most 10 Tower wall levels may be queued at once.");
  if (state.attackBlocked) throw new Error("tower-under-rally-attack");
  if (state.wallIntegrityBps !== WALL_FULL_INTEGRITY_BPS || state.repair) throw new Error("tower-wall-damaged");
  if (state.upgradeQueue.length + levels > TOWER_UPGRADE_QUEUE_LIMIT) throw new Error("tower-upgrade-queue-full");

  const queue = state.upgradeQueue.map(entry => ({ ...entry }));
  let level = queue.length ? queue[queue.length - 1].targetLevel : state.wallLevel;
  let totalCost = 0;
  for (let index = 0; index < levels; index += 1) {
    const targetLevel = level + 1;
    if (!Number.isSafeInteger(targetLevel)) throw new RangeError("Tower wall level exceeds the safe-integer range.");
    const cost = getTowerWallUpgradeCost(level, canonicalCityUpgradeCost);
    totalCost = safeAdd(totalCost, cost, "Tower upgrade purchase");
    queue.push({
      id: `${String(operationId || "upgrade")}_${index + 1}_${targetLevel}`,
      fromLevel: level,
      targetLevel,
      cost,
      queuedAtMs: Math.max(0, Math.floor(finiteNumber(nowMs, Date.now()))),
      remainingMs: TOWER_UPGRADE_DURATION_MS,
      progressStartedAtMs: 0,
    });
    level = targetLevel;
  }
  const balance = clampInteger(treasuryBalance);
  if (balance < totalCost) throw new Error("insufficient-clan-treasury");
  if (!state.upgradeQueue.length && queue.length) queue[0].progressStartedAtMs = Math.max(0, Math.floor(finiteNumber(nowMs, Date.now())));
  return {
    state: { ...state, upgradeQueue: queue, updatedAtMs: nowMs },
    totalCost,
    treasuryBalance: balance - totalCost,
  };
}

function startPaidRepair(rawState, treasuryBalance, canonicalCityUpgradeCost, getBaseRepairWindowMinutes, actor, nowMs = Date.now(), operationId = "") {
  const state = materializeTowerState(rawState, nowMs);
  if (state.attackBlocked) throw new Error("tower-under-rally-attack");
  if (state.repair) throw new Error("tower-repair-active");
  if (state.wallIntegrityBps >= WALL_FULL_INTEGRITY_BPS) throw new Error("tower-wall-full");
  const cost = getTowerRepairCost(state.wallLevel, state.wallIntegrityBps, canonicalCityUpgradeCost);
  const balance = clampInteger(treasuryBalance);
  if (balance < cost) throw new Error("insufficient-clan-treasury");
  if (typeof getBaseRepairWindowMinutes !== "function") throw new TypeError("A canonical base repair-rate function is required.");
  const baseWindowMinutes = requireSafePositiveInteger(getBaseRepairWindowMinutes(state.wallLevel), "baseRepairWindowMinutes");
  const missingBps = WALL_FULL_INTEGRITY_BPS - state.wallIntegrityBps;
  const durationMs = Math.max(1, Math.round(baseWindowMinutes * 60_000 * missingBps / WALL_FULL_INTEGRITY_BPS));
  const repair = {
    id: String(operationId || `repair_${nowMs}`),
    paidCost: cost,
    startIntegrityBps: state.wallIntegrityBps,
    startedAtMs: nowMs,
    completeAtMs: nowMs + durationMs,
    baseWindowMinutes,
    startedByUid: String(actor?.uid || ""),
    clanId: state.clanId,
  };
  return {
    state: { ...state, repair, updatedAtMs: nowMs },
    cost,
    treasuryBalance: balance - cost,
  };
}

function activateVeil(rawState, treasuryBalance, canonicalCityUpgradeCost, actor, nowMs = Date.now(), operationId = "") {
  const state = materializeTowerState(rawState, nowMs);
  if (state.ownerKind !== "clan" || !state.clanId) throw new Error("tower-not-clan-owned");
  if (state.veil) throw new Error("tower-veil-active");
  if (state.veilUsage.count >= TOWER_VEIL_DAILY_LIMIT) throw new Error("tower-veil-daily-limit");
  const cost = getTowerVeilCost(state.wallLevel, canonicalCityUpgradeCost);
  const balance = clampInteger(treasuryBalance);
  if (balance < cost) throw new Error("insufficient-clan-treasury");
  return {
    state: {
      ...state,
      veil: {
        id: String(operationId || `veil_${nowMs}`),
        clanId: state.clanId,
        activatedByUid: String(actor?.uid || ""),
        activatedAtMs: nowMs,
        expiresAtMs: nowMs + TOWER_VEIL_DURATION_MS,
        paidCost: cost,
      },
      veilUsage: { utcDate: getUtcDateKey(nowMs), count: state.veilUsage.count + 1 },
      updatedAtMs: nowMs,
    },
    cost,
    treasuryBalance: balance - cost,
  };
}

function applyTowerBattleDamage(rawState, endingIntegrityBps, nowMs = Date.now()) {
  const state = materializeTowerState(rawState, nowMs);
  const integrity = clampInteger(endingIntegrityBps, 0, WALL_FULL_INTEGRITY_BPS);
  return {
    ...state,
    wallIntegrityBps: integrity,
    repair: null,
    updatedAtMs: nowMs,
  };
}

function conquerTower(rawState, clan = {}, nowMs = Date.now()) {
  const state = materializeTowerState(rawState, nowMs);
  const clanId = String(clan.id || clan.clanId || "");
  if (!clanId) throw new RangeError("A winning clan is required.");
  return {
    ...state,
    ownerKind: "clan",
    clanId,
    clanName: String(clan.name || clan.clanName || ""),
    clanTag: String(clan.tag || clan.clanTag || ""),
    clanEmblem: clan.emblem || clan.shield || null,
    wallLevel: Math.max(1, state.wallLevel - TOWER_CONQUEST_LEVEL_LOSS),
    wallIntegrityBps: 0,
    neutralDefenders: 0,
    upgradeQueue: [],
    repair: null,
    veil: null,
    incomingRallyIds: [],
    attackBlocked: false,
    ownershipRevision: safeAdd(state.ownershipRevision, 1, "Tower ownership revision"),
    capturedAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

function addGarrisonTroops(garrisons = {}, uid = "", troops = 0) {
  const playerUid = String(uid || "");
  if (!playerUid) throw new RangeError("A garrison owner is required.");
  const amount = requireSafePositiveInteger(troops, "troops");
  const current = clampInteger(garrisons?.[playerUid]?.troops ?? garrisons?.[playerUid]);
  return {
    ...garrisons,
    [playerUid]: { ...(garrisons?.[playerUid] || {}), uid: playerUid, troops: safeAdd(current, amount, "Tower garrison") },
  };
}

function withdrawGarrisonTroops(garrisons = {}, actorUid = "", ownerUid = "", troops = 0) {
  const actor = String(actorUid || "");
  const owner = String(ownerUid || "");
  if (!actor || actor !== owner) throw new Error("cannot-withdraw-another-members-troops");
  const amount = requireSafePositiveInteger(troops, "troops");
  const current = clampInteger(garrisons?.[owner]?.troops ?? garrisons?.[owner]);
  if (amount > current) throw new Error("insufficient-tower-garrison");
  const next = { ...garrisons };
  const remaining = current - amount;
  if (remaining > 0) next[owner] = { ...(garrisons?.[owner] || {}), uid: owner, troops: remaining };
  else delete next[owner];
  return next;
}

function getCombinedGarrisonTroops(garrisons = {}) {
  return Object.values(garrisons || {}).reduce((total, entry) => (
    safeAdd(total, clampInteger(entry?.troops ?? entry), "combined Tower garrison")
  ), 0);
}

module.exports = Object.freeze({
  MODEL_VERSION,
  TOWER_ACCESS_PROBATION_MS,
  TOWER_NEUTRAL_DEFENDERS,
  TOWER_MIN_RALLY_MEMBERS,
  TOWER_UPGRADE_MULTIPLIER,
  TOWER_UPGRADE_DURATION_MS,
  TOWER_UPGRADE_QUEUE_LIMIT,
  TOWER_CONQUEST_LEVEL_LOSS,
  TOWER_VEIL_DURATION_MS,
  TOWER_VEIL_DAILY_LIMIT,
  TOWER_DONATION_HOURS,
  WALL_FULL_INTEGRITY_BPS,
  MANAGER_ROLES,
  TOWERS,
  getTowerDefinition,
  requireTowerDefinition,
  getUtcDateKey,
  getNextUtcDayStartMs,
  createNeutralTowerState,
  normalizeTowerState,
  materializeTowerState,
  getMembershipJoinedAtMs,
  isEligibleMember,
  getEligibility,
  getEligibleScoutTowerOrigins,
  selectClosestScoutOrigin,
  validateTowerRallyParticipants,
  getDonationAllowance,
  normalizeDonationUsage,
  getDonationAllowanceForUsage,
  applyTreasuryDonation,
  getEquivalentCityWallCost,
  getTowerWallUpgradeCost,
  getTowerVeilCost,
  getTowerRepairCost,
  queueWallUpgrades,
  startPaidRepair,
  activateVeil,
  applyTowerBattleDamage,
  conquerTower,
  addGarrisonTroops,
  withdrawGarrisonTroops,
  getCombinedGarrisonTroops,
});
