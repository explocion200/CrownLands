(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrownlandsMarauders = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = 1;
  const REFILL_VERSION = 2;
  const MAX_STAMINA = 100, HUNT_COST = 10, RECOVERY_MS = 12 * 60 * 1000, FULL_REFILL_PRICE = 30;
  const ANCHORS = Object.freeze([
    [1, 100, 100, 20], [20, 10000, 5000, 500], [40, 100000, 50000, 2500],
    [60, 1000000, 500000, 10000], [79, 10000000, 5000000, 25000],
    [80, 20000000, 10000000, 50000], [90, 50000000, 25000000, 100000],
    [100, 100000000, 50000000, 200000],
  ].map(Object.freeze));
  const ITEMS = Object.freeze([
    ["war_drums_30m", 35], ["veil_of_silence_30m", 25], ["swift_march_order", 18],
    ["royal_tax_decree_30m", 12], ["recall_horn", 8], ["shield_12h", 2],
  ].map(Object.freeze));
  function fail(message) { const error = new Error(message); error.code = "failed-precondition"; throw error; }
  const day = now => new Date(now).toISOString().slice(0, 10);
  function refillPrice(value) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_STAMINA) fail("Invalid stamina value.");
    return Math.ceil((MAX_STAMINA - value) * FULL_REFILL_PRICE / MAX_STAMINA);
  }
  function balance(level) {
    if (!Number.isInteger(level) || level < 1 || level > 100) fail("Invalid marauder level.");
    const upper = ANCHORS.find(row => row[0] >= level);
    const lower = ANCHORS[Math.max(0, ANCHORS.indexOf(upper) - 1)];
    const values = upper[0] === level ? upper.slice(1) : upper.slice(1).map((value, i) =>
      Math.floor(lower[i + 1] * Math.pow(value / lower[i + 1], (level - lower[0]) / (upper[0] - lower[0]))));
    return { version: VERSION, level, classification: level >= 80 ? "boss" : "solo",
      defenders: values[0], gold: values[1], xp: values[2],
      itemChance: level >= 80 ? .20 + (level - 80) * .10 / 20 : .02 + (level - 1) * .08 / 78 };
  }
  function slots(region) {
    if (region?.permanentCore === true) return [{ slot: 0, min: 80, max: 100, classification: "boss" }];
    if (region?.permanentCore !== false) return [];
    return [{ slot: 0, classification: "solo", min: 1, max: 10 },
      { slot: 1, classification: "solo", min: 11, max: 79 }];
  }
  function stamina(raw, now) {
    if (!Number.isSafeInteger(now) || now < 0) fail("Invalid server time.");
    if (raw == null) return { version: VERSION, value: MAX_STAMINA, recoveredAtMs: now, revision: 0, paidDay: "" };
    if (raw.version !== VERSION || !Number.isInteger(raw.value) || raw.value < 0 || raw.value > MAX_STAMINA
      || !Number.isSafeInteger(raw.recoveredAtMs) || raw.recoveredAtMs < 0
      || !Number.isSafeInteger(raw.revision) || raw.revision < 0) fail("Stamina state is unavailable. Please retry later.");
    const elapsed = Math.max(0, now - raw.recoveredAtMs);
    const recovered = Math.floor(elapsed / RECOVERY_MS);
    const value = Math.min(MAX_STAMINA, raw.value + recovered);
    return { version: VERSION, value, recoveredAtMs: value === MAX_STAMINA ? now : raw.recoveredAtMs + recovered * RECOVERY_MS,
      revision: raw.revision, paidDay: typeof raw.paidDay === "string" ? raw.paidDay : "" };
  }
  function changeStamina(raw, delta, now) {
    const state = stamina(raw, now);
    if (!Number.isInteger(delta) || state.value + delta < 0) fail("Not enough stamina. A hunt costs 10 stamina.");
    return { ...state, value: Math.min(MAX_STAMINA, state.value + delta), revision: state.revision + 1 };
  }
  function view(raw, now) {
    const state = stamina(raw, now);
    return { ...state, max: MAX_STAMINA, hunts: Math.floor(state.value / HUNT_COST), serverNowMs: now,
      nextPointAtMs: state.value < MAX_STAMINA ? state.recoveredAtMs + RECOVERY_MS : null,
      fullAtMs: state.value < MAX_STAMINA ? state.recoveredAtMs + (MAX_STAMINA - state.value) * RECOVERY_MS : now,
      paidRefillsToday: state.paidDay === day(now) ? 1 : 0,
      resetsAtMs: Date.parse(day(now)) + 86400000 };
  }
  // Largest remainders, with UID tie breaks, conserve whole pools. BigInt prevents
  // precision loss when very large armies compete for a small reward pool.
  function allocate(pool, entries) {
    if (!Number.isSafeInteger(pool) || pool < 0) fail("Invalid reward pool.");
    const sorted = entries.map(entry => ({ uid: String(entry.uid), weight: entry.weight }))
      .sort((a, b) => a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
    if (new Set(sorted.map(entry => entry.uid)).size !== sorted.length
      || sorted.some(entry => !entry.uid || !Number.isSafeInteger(entry.weight) || entry.weight < 0)) fail("Invalid damage contributions.");
    const total = sorted.reduce((sum, entry) => sum + BigInt(entry.weight), 0n);
    if (!total) { if (pool) fail("A reward requires damage contributions."); return Object.fromEntries(sorted.map(entry => [entry.uid, 0])); }
    const shares = sorted.map(entry => ({ ...entry, amount: Number(BigInt(pool) * BigInt(entry.weight) / total),
      remainder: BigInt(pool) * BigInt(entry.weight) % total }));
    const leftover = pool - shares.reduce((sum, entry) => sum + entry.amount, 0);
    const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? (a.uid < b.uid ? -1 : 1) : a.remainder > b.remainder ? -1 : 1);
    for (let i = 0; i < leftover; i++) ranked[i].amount++;
    return Object.fromEntries(shares.map(entry => [entry.uid, entry.amount]));
  }
  function rewards(level, remainingDefense, participants, rolls) {
    const config = balance(level);
    const weights = participants.map(entry => ({ uid: entry.uid, weight: entry.attackPower }));
    const totalAttack = weights.reduce((sum, entry) => sum + BigInt(entry.weight), 0n);
    if (!Number.isSafeInteger(remainingDefense) || remainingDefense < 1 || totalAttack <= BigInt(remainingDefense)) fail("Only a victorious army receives loot.");
    const damage = allocate(remainingDefense, weights);
    // Reward weights retain the exact proportional damage, avoiding a second
    // rounding bias when a participant's share is less than one defense point.
    const gold = allocate(config.gold, weights), xp = allocate(config.xp, weights);
    if (!Array.isArray(rolls) || rolls.length !== 3 || rolls.some(value => !Number.isFinite(value) || value < 0 || value >= 1)) fail("Invalid reward randomness.");
    let item = null, recipientUid = null;
    if (rolls[0] < config.itemChance) {
      let threshold = rolls[1] * 100;
      item = ITEMS.find(([, weight]) => (threshold -= weight) < 0)?.[0] || ITEMS[ITEMS.length - 1][0];
      let draw = rolls[2] * Number(totalAttack);
      recipientUid = [...weights].sort((a, b) => a.uid < b.uid ? -1 : 1).find(entry => (draw -= entry.weight) < 0)?.uid;
    }
    return { balanceVersion: VERSION, damage, gold, xp, item, recipientUid, rolls: [...rolls] };
  }
  return Object.freeze({ VERSION, REFILL_VERSION, MAX_STAMINA, HUNT_COST, RECOVERY_MS, FULL_REFILL_PRICE, ANCHORS, ITEMS,
    day, refillPrice, balance, slots, stamina, changeStamina, view, allocate, rewards });
});
