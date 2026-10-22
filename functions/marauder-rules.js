(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrownlandsMarauders = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = 1;
  // Approved October 19 fixed values: level, defenders, Gold, XP, item bps, box bps, Uncommon upgrade bps.
  // Version 1 remains readable; stamina VERSION is independent of enemy balance.
  const BALANCE_VERSION = 2;
  // Frozen on departure, separately from the NPC's immutable balance version.
  const BOSS_REWARD_VERSION = 2;
  const BALANCE_V2 = Object.freeze([
    [1, 100, 5, 50, 100, 0, 0],
    [2, 127, 7, 84, 188, 0, 0],
    [3, 162, 10, 135, 277, 0, 0],
    [4, 206, 14, 202, 365, 0, 0],
    [5, 263, 20, 284, 454, 0, 0],
    [6, 335, 26, 383, 542, 0, 0],
    [7, 428, 35, 499, 631, 0, 0],
    [8, 545, 45, 631, 719, 0, 0],
    [9, 695, 59, 779, 808, 0, 0],
    [10, 885, 74, 945, 896, 0, 0],
    [11, 1052, 93, 1127, 985, 0, 0],
    [12, 1251, 116, 1327, 1073, 0, 0],
    [13, 1487, 143, 1543, 1162, 0, 0],
    [14, 1769, 175, 1777, 1250, 0, 0],
    [15, 2103, 213, 2028, 1338, 0, 0],
    [16, 2501, 258, 2296, 1427, 0, 0],
    [17, 2974, 314, 2581, 1515, 0, 0],
    [18, 3536, 375, 2884, 1604, 0, 0],
    [19, 4205, 449, 3204, 1692, 0, 0],
    [20, 5000, 537, 3542, 1781, 0, 0],
    [21, 5610, 640, 3897, 1869, 0, 0],
    [22, 6294, 757, 4270, 1958, 0, 0],
    [23, 7062, 896, 4660, 2046, 0, 0],
    [24, 7924, 1056, 5068, 2135, 0, 0],
    [25, 8891, 1243, 5493, 2223, 0, 0],
    [26, 9976, 1464, 6043, 2312, 0, 0],
    [27, 11193, 1713, 6647, 2400, 0, 0],
    [28, 12559, 2008, 7312, 2488, 0, 0],
    [29, 14091, 2347, 8043, 2577, 0, 0],
    [30, 15811, 2740, 8847, 2665, 0, 0],
    [31, 17740, 3191, 9732, 2754, 0, 0],
    [32, 19905, 3712, 10705, 2842, 0, 0],
    [33, 22334, 4315, 11776, 2931, 0, 0],
    [34, 25059, 5013, 12954, 3019, 0, 0],
    [35, 28117, 5813, 14249, 3108, 0, 0],
    [36, 31547, 6731, 15674, 3196, 0, 0],
    [37, 35397, 7784, 17241, 3285, 0, 0],
    [38, 39716, 9005, 18966, 3373, 0, 0],
    [39, 44562, 10398, 20862, 3462, 0, 0],
    [40, 50000, 12002, 22948, 3550, 0, 0],
    [41, 53992, 13840, 25243, 3638, 0, 0],
    [42, 58302, 15937, 27768, 3727, 0, 0],
    [43, 62957, 18349, 30545, 3815, 0, 0],
    [44, 67984, 21116, 33599, 3904, 0, 0],
    [45, 73412, 24273, 36959, 3992, 0, 0],
    [46, 79273, 27885, 40655, 4081, 0, 0],
    [47, 85602, 32014, 44721, 4169, 0, 0],
    [48, 92437, 36738, 49193, 4258, 0, 0],
    [49, 99817, 42137, 54112, 4346, 0, 0],
    [50, 107787, 48288, 59523, 4435, 0, 0],
    [51, 116393, 55670, 65476, 4523, 0, 0],
    [52, 125686, 65402, 72023, 4612, 0, 0],
    [53, 135720, 77474, 79226, 4700, 0, 0],
    [54, 146556, 92211, 87148, 4788, 0, 0],
    [55, 158258, 109993, 95863, 4877, 0, 0],
    [56, 170893, 131299, 105449, 4965, 0, 0],
    [57, 184537, 156750, 115994, 5054, 0, 0],
    [58, 199271, 186994, 127594, 5142, 0, 0],
    [59, 215181, 222843, 140353, 5231, 0, 0],
    [60, 232361, 265185, 154389, 5319, 0, 0],
    [61, 250913, 315101, 169828, 5408, 0, 0],
    [62, 270947, 373804, 186810, 5496, 0, 0],
    [63, 292579, 442716, 205491, 5585, 0, 0],
    [64, 315939, 523447, 226041, 5673, 0, 0],
    [65, 341164, 617870, 248645, 5762, 0, 0],
    [66, 368403, 728178, 273509, 5850, 0, 0],
    [67, 397816, 856799, 300860, 5938, 0, 0],
    [68, 429578, 1006615, 330946, 6027, 0, 0],
    [69, 463876, 1180872, 364041, 6115, 0, 0],
    [70, 500913, 1383329, 400445, 6204, 0, 0],
    [71, 540906, 1618274, 440490, 6292, 0, 0],
    [72, 584092, 1890702, 484539, 6381, 0, 0],
    [73, 630727, 2206170, 532993, 6469, 0, 0],
    [74, 681084, 2571209, 586292, 6558, 0, 0],
    [75, 735463, 2993242, 644921, 6646, 0, 0],
    [76, 794183, 3480661, 709414, 6735, 0, 0],
    [77, 857591, 4043230, 780355, 6823, 0, 0],
    [78, 926062, 4691949, 858391, 6912, 0, 0],
    [79, 1000000, 5439559, 944230, 7000, 0, 0],
    [80, 5000000, 33997243, 6491581, 8000, 6000, 0],
    [81, 5547847, 37722301, 7140740, 8100, 6150, 50],
    [82, 6155722, 41855516, 7854813, 8200, 6300, 100],
    [83, 6830201, 46441601, 8640295, 8300, 6450, 150],
    [84, 7578582, 51530179, 9504325, 8400, 6600, 200],
    [85, 8408964, 57176319, 10454757, 8500, 6750, 250],
    [86, 9330329, 63441093, 11500232, 8600, 6900, 300],
    [87, 10352649, 70392306, 12650256, 8700, 7050, 350],
    [88, 11486983, 78105152, 13915281, 8800, 7200, 400],
    [89, 12745606, 86663094, 15306810, 8900, 7350, 450],
    [90, 14142135, 96158722, 16837491, 9000, 7500, 500],
    [91, 15691681, 106694780, 18521240, 9100, 7650, 550],
    [92, 17411011, 118385276, 20373365, 9200, 7800, 600],
    [93, 19318726, 131356687, 22410701, 9300, 7950, 650],
    [94, 21435469, 145749372, 24651771, 9400, 8100, 700],
    [95, 23784142, 161719054, 27116948, 9500, 8250, 750],
    [96, 26390158, 179438526, 29828643, 9600, 8400, 800],
    [97, 29281713, 199099506, 32811507, 9700, 8550, 850],
    [98, 32490095, 220914735, 36092658, 9800, 8700, 900],
    [99, 36050018, 245120249, 39701923, 9900, 8850, 950],
    [100, 40000000, 271977950, 43672116, 10000, 9000, 1000],
  ].map(Object.freeze));
  const REFILL_VERSION = 3;
  const MAX_STAMINA = 100, HUNT_COST = 10, BOSS_HUNT_COST = 20, FULL_REFILL_PRICE = 30;
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
    return value === MAX_STAMINA ? 0 : FULL_REFILL_PRICE;
  }
  function balance(level, version = 1) {
    if (version !== 1 && version !== BALANCE_VERSION) fail("Unknown enemy balance version.");
    if (!Number.isInteger(level) || level < 1 || level > 100) fail("Invalid marauder level.");
    if (version === BALANCE_VERSION) {
      const row = BALANCE_V2[level - 1];
      return { version, level, classification: level >= 80 ? "boss" : "solo",
        defenders: row[1], gold: row[2], xp: row[3], itemChance: row[4] / 10000,
        itemChanceBps: row[4], boxChanceBps: row[5], uncommonUpgradeBps: row[6] };
    }
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
    // Retain the saved schema/timestamp, but elapsed time never grants stamina.
    return { version: VERSION, value: raw.value, recoveredAtMs: raw.recoveredAtMs,
      revision: raw.revision, paidDay: typeof raw.paidDay === "string" ? raw.paidDay : "" };
  }
  function changeStamina(raw, delta, now) {
    const state = stamina(raw, now);
    if (delta > 0) fail("Stamina can only be restored by a 30-Crown refill.");
    if (!Number.isInteger(delta) || state.value + delta < 0) fail(`Not enough stamina. This hunt costs ${Math.abs(delta)} stamina.`);
    return { ...state, value: Math.min(MAX_STAMINA, state.value + delta), revision: state.revision + 1 };
  }
  function view(raw, now) {
    const state = stamina(raw, now);
    return { ...state, max: MAX_STAMINA, hunts: Math.floor(state.value / HUNT_COST), bossHunts: Math.floor(state.value / BOSS_HUNT_COST), serverNowMs: now,
      nextPointAtMs: null, fullAtMs: state.value === MAX_STAMINA ? now : null,
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
  function bossEligibility(level, participants, rewardVersion = 1) {
    if (rewardVersion !== 1 && rewardVersion !== BOSS_REWARD_VERSION) fail("Unknown boss reward version.");
    const config = balance(level, BALANCE_VERSION);
    if (config.classification !== "boss") fail("Choose a clan boss.");
    const rows = participants.map(p => ({ uid: p.uid, attackPower: p.attackPower }));
    if (new Set(rows.map(p => p.uid)).size !== rows.length || rows.some(p => !p.uid
      || !Number.isSafeInteger(p.attackPower) || p.attackPower < 0)) fail("Invalid rally contributions.");
    const total = rows.reduce((sum, p) => sum + BigInt(p.attackPower), 0n);
    const maxSharePercent = ({ 2: 70, 3: 55, 4: 45, 5: 40 })[rows.length] || 0;
    const reason = rows.length < 2 ? "At least two assembled clan members are required."
      : rows.length > 5 ? "A boss rally allows at most five members, including the leader." : "";
    if (rewardVersion === BOSS_REWARD_VERSION) {
      const members = rows.map(p => ({ ...p, eligible: !reason && p.attackPower > 0,
        reason: reason || (p.attackPower > 0 ? "" : "Send at least one troop."), gold: config.gold, xp: config.xp }));
      return { rewardVersion, eligible: !reason && members.every(p => p.eligible), reason, members };
    }
    const gold = total ? allocate(config.gold, rows.map(p => ({ uid: p.uid, weight: p.attackPower }))) : {};
    const xp = total ? allocate(config.xp, rows.map(p => ({ uid: p.uid, weight: p.attackPower }))) : {};
    const members = rows.map(p => {
      const power = BigInt(p.attackPower);
      const minimumPower = Number((BigInt(config.defenders) + 9n) / 10n > (total + 9n) / 10n
        ? (BigInt(config.defenders) + 9n) / 10n : (total + 9n) / 10n);
      const error = power * 10n < BigInt(config.defenders) ? "Needs at least 10% of the boss's full defense in attack power."
        : power * 10n < total ? "Needs at least 10% of the assembled attack power."
        : maxSharePercent && power * 100n > total * BigInt(maxSharePercent) ? `Exceeds the ${maxSharePercent}% contribution limit for ${rows.length} members.` : "";
      return { ...p, minimumPower, sharePercent: total ? Number(power * 10000n / total) / 100 : 0,
        eligible: !reason && !error, reason: reason || error, gold: gold[p.uid] || 0, xp: xp[p.uid] || 0 };
    });
    return { eligible: !reason && members.every(p => p.eligible), reason, maxSharePercent, members };
  }
  function chooseItem(roll) {
    let threshold = roll * 100;
    return ITEMS.find(([, weight]) => (threshold -= weight) < 0)?.[0] || ITEMS[ITEMS.length - 1][0];
  }
  function rewards(level, remainingDefense, participants, rolls, version = 1, bossRewardVersion = 1) {
    const config = balance(level, version);
    const personalBoss = config.version === BALANCE_VERSION && config.classification === "boss"
      && bossRewardVersion === BOSS_REWARD_VERSION;
    if (bossRewardVersion !== 1 && !personalBoss) fail("Unknown boss reward version.");
    const weights = participants.map(entry => ({ uid: entry.uid, weight: entry.attackPower }));
    const totalAttack = weights.reduce((sum, entry) => sum + BigInt(entry.weight), 0n);
    if (!Number.isSafeInteger(remainingDefense) || remainingDefense < 1 || totalAttack <= BigInt(remainingDefense)) fail("Only a victorious army receives loot.");
    const damage = allocate(remainingDefense, weights);
    // Historical shared rewards use exact power weights, avoiding double rounding.
    // New boss departures grant the complete listed reward to every participant.
    const gold = personalBoss ? Object.fromEntries(weights.map(p => [p.uid, config.gold])) : allocate(config.gold, weights);
    const xp = personalBoss ? Object.fromEntries(weights.map(p => [p.uid, config.xp])) : allocate(config.xp, weights);
    const modern = config.version === BALANCE_VERSION;
    if (modern && (config.classification === "solo" ? participants.length !== 1
      : !bossEligibility(level, participants, bossRewardVersion).eligible)) fail("Invalid hunt contributions.");
    if (!Array.isArray(rolls) || rolls.length !== (modern ? participants.length * 4 : 3) || rolls.some(value => !Number.isFinite(value) || value < 0 || value >= 1)) fail("Invalid reward randomness.");
    if (modern) {
      const items = {}, gearBoxes = {};
      [...participants].sort((a, b) => a.uid < b.uid ? -1 : 1).forEach((p, i) => {
        const [itemRoll, kindRoll, boxRoll, rarityRoll] = rolls.slice(i * 4, i * 4 + 4);
        items[p.uid] = itemRoll < config.itemChanceBps / 10000 ? chooseItem(kindRoll) : null;
        gearBoxes[p.uid] = boxRoll < config.boxChanceBps / 10000
          ? rarityRoll < config.uncommonUpgradeBps / 10000 ? "uncommon" : "common" : null;
      });
      return { balanceVersion: version, ...(personalBoss ? { bossRewardVersion } : {}), damage, gold, xp, items, gearBoxes, rolls: [...rolls] };
    }
    let item = null, recipientUid = null;
    if (rolls[0] < config.itemChance) {
      let threshold = rolls[1] * 100;
      item = ITEMS.find(([, weight]) => (threshold -= weight) < 0)?.[0] || ITEMS[ITEMS.length - 1][0];
      let draw = rolls[2] * Number(totalAttack);
      recipientUid = [...weights].sort((a, b) => a.uid < b.uid ? -1 : 1).find(entry => (draw -= entry.weight) < 0)?.uid;
    }
    return { balanceVersion: VERSION, damage, gold, xp, item, recipientUid, rolls: [...rolls] };
  }
  return Object.freeze({ VERSION, BALANCE_VERSION, BOSS_REWARD_VERSION, BALANCE_V2, REFILL_VERSION, MAX_STAMINA, HUNT_COST, BOSS_HUNT_COST, FULL_REFILL_PRICE, ANCHORS, ITEMS,
    day, refillPrice, balance, slots, stamina, changeStamina, view, allocate, bossEligibility, rewards });
});
