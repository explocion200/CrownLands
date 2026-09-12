"use strict";

const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const config = require("./economy-config.json").dailyLoginRewards;
const VERSION = 4;
const LIMIT = 2;
const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback;
const dayKey = now => new Date(now).toISOString().slice(0, 10);
const key = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";

function shuffled(values, randomInt = crypto.randomInt) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createSchedule(randomInt = crypto.randomInt) {
  const early = { gold: shuffled([2, 3, 3, 4, 4, 5, 5, 6], randomInt), troops: shuffled([2, 3, 3, 4, 4, 5, 5, 6], randomInt) };
  const late = { gold: shuffled([8, 10, 12, 13], randomInt), troops: shuffled([8, 10, 12, 13], randomInt) };
  const finals = shuffled([{ goldHours: 16 }, { goldHours: 20 }, { troopHours: 16 }, { troopHours: 20 }], randomInt);
  const extraItemWeeks = new Set(shuffled([0, 1, 2, 3], randomInt).slice(0, 2));
  const items = shuffled(config.itemOrder, randomInt);
  return Array.from({ length: 4 }, (_, week) => {
    const resources = [...shuffled(["gold", "gold", "troops", "troops"], randomInt), ...shuffled(["gold", "troops"], randomInt)];
    return Array.from({ length: 7 }, (_, offset) => {
      const resource = resources[offset];
      const hours = offset < 4 ? early[resource].pop() : offset < 6 ? late[resource].pop() : 0;
      return {
        day: week * 7 + offset + 1,
        goldHours: resource === "gold" ? hours : 0,
        troopHours: resource === "troops" ? hours : 0,
        ...(offset === 6 ? finals[week] : {}),
        items: offset === 5 || (offset === 4 && extraItemWeeks.has(week)) ? { [items.pop()]: 1 } : {},
        commonGearBoxes: offset === 6 ? 1 : 0,
      };
    });
  }).flat();
}

function legacySchedule(length) {
  const source = config.tracksByMonthLength[String(length)];
  const itemDays = new Map(source.itemDays.map((day, i) => [day, config.itemOrder[i]]));
  let gold = 0, troops = 0, resource = "gold";
  return Array.from({ length }, (_, i) => {
    const day = i + 1;
    const reward = { day, goldHours: 0, troopHours: 0, items: {}, commonGearBoxes: day % 7 === 0 ? 1 : 0 };
    if (itemDays.has(day)) reward.items[itemDays.get(day)] = 1;
    else {
      if (resource === "gold") reward.goldHours = source.goldHours[gold++];
      else reward.troopHours = source.troopHours[troops++];
      resource = resource === "gold" ? "troops" : "gold";
    }
    return reward;
  });
}

// This field lives on the global players/{uid} account, outside realm generations.
// A schedule is created only on first migration/creation or completed-cycle rollover.
function normalize(raw = {}, _nowMs = Date.now()) {
  raw = raw && typeof raw === "object" ? raw : {};
  // Old in-flight status handlers merge only the former flat fields. Keep the
  // authoritative cycle beneath a field those handlers never write.
  if (raw.activeCycle) {
    if (raw.activeCycle.schemaVersion !== VERSION) throw new Error("Unsupported saved daily reward cycle.");
    raw = raw.activeCycle;
  }
  const version = int(raw.schemaVersion);
  const oldProgress = version > 0 && (int(raw.nextDay) > 1 || int(raw.earnedThroughDay) > 0
    || int(raw.earnedThroughOrdinal) > 0 || int(raw.totalClaims) > 0 || key(raw.lastAttendanceDayKey));
  const cycle = Math.max(1, int(raw.cycle, 1));
  const totalClaims = int(raw.totalClaims);
  const nextClaimOrdinal = Math.max(1, totalClaims + 1, int(raw.nextClaimOrdinal, 1));
  let schedule, cycleId, transition, nextDay, earnedThroughDay;
  if (version >= VERSION) {
    if (!Array.isArray(raw.schedule) || raw.schedule.length < 28 || raw.schedule.length > 31 || !raw.cycleId) {
      throw new Error("Saved daily reward cycle is invalid; refusing to reroll it.");
    }
    schedule = raw.schedule;
    cycleId = raw.cycleId;
    transition = raw.transition === true;
    nextDay = Math.min(schedule.length + 1, Math.max(1, int(raw.nextDay, 1)));
    earnedThroughDay = Math.max(nextDay - 1, Math.min(schedule.length, nextDay + LIMIT - 1, int(raw.earnedThroughDay)));
  } else if (oldProgress) {
    let length = [28, 29, 30, 31].includes(int(raw.monthLengthDays)) ? int(raw.monthLengthDays) : 30;
    if (version === 3 && /^\d{4}-\d{2}$/.test(String(raw.monthKey || ""))) {
      const [year, month] = raw.monthKey.split("-").map(Number);
      if (month >= 1 && month <= 12) length = new Date(Date.UTC(year, month, 0)).getUTCDate();
    }
    schedule = legacySchedule(length);
    transition = true;
    cycleId = `transition-${crypto.createHash("sha256").update(JSON.stringify([raw.monthKey || "legacy", cycle, nextClaimOrdinal])).digest("hex").slice(0, 24)}`;
    nextDay = Math.min(length + 1, Math.max(1, int(raw.nextDay, ((nextClaimOrdinal - 1) % 30) + 1)));
    const legacyPending = Math.min(LIMIT, Math.max(0, int(raw.earnedThroughOrdinal) - nextClaimOrdinal + 1));
    earnedThroughDay = Math.max(nextDay - 1, Math.min(length, nextDay + LIMIT - 1,
      version === 3 ? int(raw.earnedThroughDay) : nextDay + legacyPending - 1));
  } else {
    schedule = createSchedule();
    cycleId = crypto.randomUUID();
    transition = false;
    nextDay = 1;
    earnedThroughDay = 0;
  }
  const state = {
    schemaVersion: VERSION, cycleId, cycle, transition, schedule,
    cycleLengthDays: schedule.length, monthLengthDays: schedule.length,
    monthKey: transition ? String(raw.monthKey || "") : "",
    nextDay, earnedThroughDay, nextClaimOrdinal, totalClaims,
    lastAttendanceDayKey: key(raw.lastAttendanceDayKey) || key(raw.lastClaimDayKey),
    deferredAttendanceDayKey: key(raw.deferredAttendanceDayKey),
    lastClaimDayKey: key(raw.lastClaimDayKey), lastClaimedAtMs: int(raw.lastClaimedAtMs),
    lastClaimRequestId: String(raw.lastClaimRequestId || "").slice(0, 96), lastReceipt: raw.lastReceipt || null,
  };
  if (nextDay > schedule.length) {
    state.cycle += 1;
    state.cycleId = crypto.randomUUID();
    state.schedule = createSchedule();
    state.transition = false;
    state.cycleLengthDays = state.monthLengthDays = 28;
    state.monthKey = "";
    state.nextDay = 1;
    state.earnedThroughDay = 0;
  }
  state.earnedThroughOrdinal = state.nextClaimOrdinal + state.earnedThroughDay - state.nextDay;
  return state;
}

function sync(raw = {}, nowMs = Date.now()) {
  const state = normalize(raw, nowMs);
  const today = dayKey(nowMs);
  if (state.deferredAttendanceDayKey !== today) state.deferredAttendanceDayKey = "";
  if (state.lastAttendanceDayKey !== today) {
    state.lastAttendanceDayKey = today;
    // Preserve a real uncredited visit even when the last cycle reward is queued.
    state.deferredAttendanceDayKey = today;
  }
  if (state.deferredAttendanceDayKey === today && pending(state) < LIMIT && state.earnedThroughDay < state.schedule.length) {
    state.earnedThroughDay += 1;
    state.deferredAttendanceDayKey = "";
  }
  state.earnedThroughOrdinal = state.nextClaimOrdinal + state.earnedThroughDay - state.nextDay;
  return { state, changed: !raw?.activeCycle || Object.entries(state).some(([field, value]) => !isDeepStrictEqual(raw.activeCycle[field], value)), dayKey: today, serverTimeMs: nowMs };
}

function pending(state) { return Math.max(0, state.earnedThroughDay - state.nextDay + 1); }
function status(raw, nowMs = Date.now()) {
  const state = normalize(raw, nowMs);
  const today = dayKey(nowMs);
  const count = pending(state);
  return { ...state, pendingCount: count, eligible: count > 0, queuedCount: Math.max(0, count - 1), maxPendingRewards: LIMIT,
    attendedToday: state.lastAttendanceDayKey === today, attendanceDeferred: state.deferredAttendanceDayKey === today,
    claimedToday: state.lastClaimDayKey === today, earnedThroughCycle: state.cycle, dayKey: today, serverTimeMs: nowMs,
    nextUtcUnlockAtMs: Date.parse(`${today}T00:00:00Z`) + 86400000 };
}

function store(state) { return { ...state, activeCycle: state }; }

module.exports = { VERSION, LIMIT, createSchedule, legacySchedule, normalize, sync, status, pending, store };
