"use strict";
// Account-owned estate rules. Only the service may commit these transitions.
const C = require("./estate-config.json");
const HOUR = 3600000, EPS = 1e-7;
const VERSION = "estate-economy-1";
const KEYS = C.producers.map(p => p.output);
const BUILDINGS = Object.fromEntries(C.buildings.map(b => [b.key, b]));
const PRODUCERS = Object.fromEntries(C.producers.map(p => [p.output, p]));
const zero = () => Object.fromEntries(KEYS.map(k => [k, 0]));
const sum = values => values.reduce((a, b) => a + b, 0);
const poly = (terms, level) => sum(terms.map((v, i) => v * level ** i));
const multiplier = level => level > 0 ? 1 + C.productionGrowth * (level - 1) : 0;
function fail(message, code = "failed-precondition") { throw Object.assign(new Error(message), { code }); }
function integer(value, min, max, message) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(message, "invalid-argument");
  return value;
}
function referenceRates(level) {
  const rates = zero();
  for (const p of C.producers) {
    const amount = p.basePerHour * multiplier(level);
    rates[p.output] += amount;
    for (const [key, ratio] of Object.entries(p.inputs)) rates[key] -= amount * ratio;
  }
  return rates;
}
function allocate(total, levels, band, timer = false) {
  const p = C.progression;
  const weights = levels.map(level => band.min === 2
    ? timer ? Math.max(p.onboarding.timerMinimumWeight, Math.min(1, (level - 2) / p.onboarding.timerRampLevels))
      : ((level - 1) / 24) ** p.onboarding.materialExponent
    : 1 + p.withinBandGrowth * (level - band.min) / (band.max - band.min));
  const minimum = band.min === 2 ? 1 : 0;
  const amounts = weights.map(weight => minimum + Math.floor((total - minimum * levels.length) * weight / sum(weights)));
  const remainder = total - sum(amounts);
  return amounts.map((v, i) => v + (i >= levels.length - remainder ? 1 : 0));
}
const COSTS = {}, MINUTES = {};
for (const band of C.progression.bands) {
  const levels = Array.from({ length: band.max - band.min + 1 }, (_, i) => band.min + i);
  const times = allocate(Math.round(band.seasons * C.seasonDays * 1440 * C.progression.constructionShare), levels, band, true);
  levels.forEach((level, i) => { MINUTES[level] = times[i]; });
  const rates = referenceRates(band.referenceProducerLevel);
  for (const b of C.buildings) {
    COSTS[b.key] ||= { 1: {} };
    const weights = { ...C.defaultWeights, ...b.weights };
    const active = level => C.stages.find(s => level >= s.min && level <= s.max).active.filter(k => weights[k] > 0);
    const used = [...new Set(levels.flatMap(active))], max = Math.max(...used.map(k => weights[k]));
    levels.forEach(level => { COSTS[b.key][level] = {}; });
    for (const key of used) {
      const budget = Math.floor(rates[key] * C.seasonDays * 24 * C.progression.productionShare);
      const total = Math.ceil(budget * band.seasons * (weights[key] / max));
      const eligible = levels.filter(level => active(level).includes(key));
      const amounts = allocate(total, eligible, band);
      eligible.forEach((level, i) => { COSTS[b.key][level][key] = amounts[i]; });
    }
  }
}
function initial(now) {
  return {
    schemaVersion: 1, revision: 0, settledAtMs: now,
    levels: Object.fromEntries(C.buildings.map(b => [b.key, C.initialCompleted.includes(b.key) ? 1 : 0])),
    stock: zero(), processors: {}, reserves: zero(), deposits: {}, jobs: [], productionOrders: {}, productionPolicyVersion: 1,
    commissions: {}, quests: [], parcels: [], activeChampionIds: [], entitlements: {},
    supplyUsage: { day: "", hours: 0 }, questUsage: { day: "", hours: 0 },
  };
}
function normalize(raw, now) {
  if (!raw) return initial(now);
  if (raw.schemaVersion !== 1) fail("This estate needs a compatible game version.");
  // Never silently clamp/truncate saved property or higher schema data.
  const state = structuredClone(raw);
  if (state.productionOrders === undefined) state.productionOrders = {};
  if (state.productionPolicyVersion !== undefined && state.productionPolicyVersion !== 1) fail("This estate needs a compatible production version.");
  if (!state.productionOrders || typeof state.productionOrders !== "object" || Array.isArray(state.productionOrders)) fail("Invalid production ledger.");
  for (const [key, order] of Object.entries(state.productionOrders)) {
    const producer = C.producers.find(p => p.building === key && Object.keys(p.inputs).length);
    if (!producer || order.building !== key || order.output !== producer.output || !["running", "ready"].includes(order.status)) fail("Invalid production order.");
    integer(order.quantity, 1, Number.MAX_SAFE_INTEGER, "Invalid production quantity.");
    integer(order.delivered, 0, order.quantity, "Invalid production delivery.");
    if (!Number.isFinite(order.durationMs) || order.durationMs <= 0 || !Number.isFinite(order.startedAtMs)
      || !Number.isFinite(order.completesAtMs) || order.completesAtMs !== order.startedAtMs + order.durationMs) fail("Invalid production timer.");
  }
  integer(state.revision, 0, Number.MAX_SAFE_INTEGER, "Invalid estate revision.");
  if (!Number.isFinite(state.settledAtMs) || state.settledAtMs < 0 || state.settledAtMs > now) fail("Invalid estate clock.");
  for (const key of Object.keys(BUILDINGS)) integer(state.levels[key], 0, 100, "Invalid saved building level.");
  for (const key of KEYS) {
    if (!Number.isFinite(state.stock[key]) || state.stock[key] < 0 || state.stock[key] > Number.MAX_SAFE_INTEGER)
      fail("Invalid saved material stock.");
  }
  if (!Array.isArray(state.jobs) || state.jobs.length > 30) fail("Invalid construction ledger.");
  return state;
}
function capacity(state, key) {
  const food = ["grain", "food"].includes(key);
  const store = state.levels[food ? "granary" : "storehouse"];
  const extra = state.levels[food ? "market" : "wagon-yard"];
  return (store ? poly(food ? C.granaryCapacity : C.storehouseCapacity, store) : C.startingCapacity)
    + (extra ? poly(food ? C.rules.marketCapacityBonus : C.rules.wagonCapacityBonus, extra) : 0);
}
function slots(state) {
  const level = state.levels["builders-yard"];
  return level >= 50 ? 3 : level >= 10 ? 2 : 1;
}
function pendingProduction(state, key) {
  return sum(Object.values(state.productionOrders || {}).filter(o => o.output === key).map(o => o.quantity - o.delivered));
}
function storageSpace(state, key) {
  return Math.max(0, capacity(state, key) - state.stock[key] - pendingProduction(state, key));
}
function productionRecipe(state, building) {
  const p = C.producers.find(p => p.building === building && Object.keys(p.inputs).length);
  if (!p) fail("Choose a material-processing building.", "invalid-argument");
  const ratePerHour = p.basePerHour * multiplier(state.levels[building]);
  const maxQuantity = !ratePerHour || state.productionOrders?.[building] ? 0 : Math.max(0, Math.min(
    Math.floor(storageSpace(state, p.output) + EPS),
    ...Object.entries(p.inputs).map(([k, ratio]) => Math.floor((state.stock[k] - (state.reserves[k] || 0) + EPS) / ratio))));
  return { building, output: p.output, inputs: { ...p.inputs }, ratePerHour, maxQuantity };
}
function productionQuote(state, building, quantity) {
  const recipe = productionRecipe(state, building);
  integer(quantity, 1, Number.MAX_SAFE_INTEGER, "Choose a whole production quantity from 1 to Max.");
  if (!recipe.ratePerHour) fail("Construct this processing building first.");
  if (state.productionOrders?.[building]) fail("Finish this building’s production before starting another batch.");
  if (quantity > recipe.maxQuantity) fail("Not enough usable materials or output storage for this batch.");
  return { action: "produce", building, output: recipe.output, quantity,
    materials: Object.fromEntries(Object.entries(recipe.inputs).map(([k, ratio]) => [k, ratio * quantity])),
    durationMs: Math.ceil(quantity / recipe.ratePerHour * HOUR), ratePerHour: recipe.ratePerHour, version: "estate-production-1" };
}
function startProduction(state, quote, requestId, now) {
  const fresh = productionQuote(state, quote.building, quote.quantity);
  if (JSON.stringify(fresh) !== JSON.stringify(quote)) fail("Production changed. Review the current recipe and time.");
  spend(state, quote.materials);
  state.productionOrders ||= {};
  state.productionOrders[quote.building] = { ...quote, id: requestId, delivered: 0, status: "running", startedAtMs: now, completesAtMs: now + quote.durationMs };
}
function deliverProduction(state) {
  for (const [key, order] of Object.entries(state.productionOrders || {})) {
    if (order.status !== "ready") continue;
    const amount = Math.min(order.quantity - order.delivered, Math.max(0, Math.floor(capacity(state, order.output) - state.stock[order.output] + EPS)));
    state.stock[order.output] += amount; order.delivered += amount;
    if (order.delivered === order.quantity) delete state.productionOrders[key];
  }
}
function buildingPrerequisites(state, key, target) {
  const building = Object.hasOwn(BUILDINGS, key) ? BUILDINGS[key] : null;
  if (!building) fail("Unknown estate building.", "invalid-argument");
  integer(target, 1, 100, "Building level must be 1–100.");
  const required = key === "great-hall" ? [] : [{ building: "great-hall", requiredLevel: target }];
  required.push(...building.requires1.map(building => ({ building, requiredLevel: 1 })));
  return required.map(row => ({ ...row, currentLevel: state.levels[row.building] }))
    .filter(row => row.currentLevel < row.requiredLevel);
}
function checkBuilding(state, key, target) {
  const missing = buildingPrerequisites(state, key, target)[0];
  if (missing) fail(missing.building === "great-hall" ? "Upgrade the Great Hall first." : "Construct " + missing.building + " first.");
  return BUILDINGS[key];
}
function baseQuote(state, key, target, rawGoldPerHour) {
  const b = checkBuilding(state, key, target);
  const credit = state.deposits[key];
  const sameCredit = credit?.target === target;
  const materials = sameCredit ? credit.materials : COSTS[key][target];
  const deposited = sameCredit ? credit.deposited : {};
  const remaining = Object.fromEntries(Object.entries(materials).map(([k, v]) => [k, v - (deposited[k] || 0)]));
  if(!Number.isFinite(rawGoldPerHour)||rawGoldPerHour<0)fail("Gold income requires a fresh server quote.");
  const gold = target === 1 ? b.gold1 : Math.ceil(Math.max(285, rawGoldPerHour) * poly(C.upgradeGoldHours, target) * b.factor * b.goldFactor);
  integer(gold,1,Number.MAX_SAFE_INTEGER,"Gold cost exceeds the supported balance.");
  const minutes = target === 1 ? b.minutes1 : Math.ceil(MINUTES[target] * (1 - C.builderReductionAt100 * Math.max(0, state.levels["builders-yard"] - 1) / 99));
  return { building: key, target, version: sameCredit ? credit.version : VERSION, materials: { ...materials },
    deposited: { ...deposited }, remaining, gold, durationMs: minutes * 60000 };
}
function constructionQuote(state, key, count = 1, rawGoldPerHour = 285) {
  integer(count, 1, 1, "Start one level at a time; upgrades cannot be queued.");
  if (!Object.hasOwn(BUILDINGS, key)) fail("Unknown estate building.", "invalid-argument");
  if (state.jobs.length >= 30) fail("Finish previously paid work before starting another building.");
  const existing = state.jobs.filter(job => job.building === key);
  if (existing.length) fail("Finish this building's paid work before its next upgrade.");
  const start = state.levels[key] + 1;
  const jobs = Array.from({ length: count }, (_, i) => baseQuote(state, key, start + i, rawGoldPerHour));
  return { action: "fund", building: key, count, jobs, gold: sum(jobs.map(job => job.gold)),
    materials: jobs.reduce((out, job) => { for (const [k, v] of Object.entries(job.remaining)) out[k] = (out[k] || 0) + v; return out; }, {}),
    nonrefundable: true };
}
// Presentation uses the same next-level quote rules as spending; this creates
// no quote receipts, deposits or new work.
function upgradeOverview(state, gold, rawGoldPerHour) {
  if (!Number.isFinite(gold) || gold < 0) fail("Gold balance requires a fresh server update.");
  const busy = state.jobs.filter(j => j.status === "running").length >= slots(state);
  return Object.fromEntries(C.buildings.map(b => {
    const level = state.levels[b.key], job = state.jobs.find(j => j.building === b.key);
    if (job) return [b.key, { status: job.status === "running" ? "constructing" : "paid", ready: false, reason: "Finish this building’s paid work first." }];
    if (level >= 100) return [b.key, { status: "maximum", ready: false, reason: "Maximum level reached." }];
    try {
      const bill = constructionQuote(state, b.key, 1, rawGoldPerHour).jobs[0];
      const available = Object.entries(bill.remaining).every(([k, v]) => v <= Math.floor(state.stock[k] + EPS));
      const status = !available ? "materials" : gold < bill.gold ? "gold" : busy ? "builders" : "ready";
      const reason = !available ? "Gather the remaining materials."
        : status === "gold" ? "More Gold needed." : status === "builders" ? "Waiting for a free builder." : "Ready to review and start.";
      return [b.key, { status, unbuilt: !level, ready: status === "ready", reason, bill }];
    } catch (error) {
      if (!error.code) throw error;
      return [b.key, { status: "blocked", unbuilt: !level, ready: false, reason: error.message }];
    }
  }));
}
function spend(state, amounts) {
  if (!amounts || typeof amounts !== "object" || Array.isArray(amounts)) fail("Invalid material amount.", "invalid-argument");
  for (const [key, value] of Object.entries(amounts)) {
    if (!KEYS.includes(key)) fail("Unknown material.", "invalid-argument");
    integer(value, 0, Number.MAX_SAFE_INTEGER, "Material amounts must be whole units.");
    if (value > Math.floor(state.stock[key] + EPS)) fail("Not enough " + key + ".");
  }
  for (const [key, value] of Object.entries(amounts)) state.stock[key] = Math.max(0, state.stock[key] - value);
}
function fund(state, quote, requestId, now) {
  if (quote.count !== 1 || quote.jobs.length !== 1) fail("Upgrades cannot be queued.");
  const job = quote.jobs[0], key = quote.building;
  if (job.building !== key || job.target !== state.levels[key] + 1 || state.jobs.some(j => j.building === key))
    fail("Finish this building's paid work before its next upgrade.");
  if (state.jobs.filter(j => j.status === "running").length >= slots(state)) fail("All builders are busy. Start this upgrade when a builder is free.");
  if (state.jobs.length >= 30) fail("Finish previously paid work before starting another building.");
  const bill = baseQuote(state, key, job.target, 285);
  // Saved deposits retain their price version and credit. Charge only the
  // remaining whole-unit bill, after every start condition has passed.
  spend(state, bill.remaining);
  // New work starts immediately. Retain the settlement path for contracts paid
  // before queues were retired; those prices, timers and receipts remain valid.
  state.jobs.push({ ...job, id: requestId + "_0", status: "running", fundedAtMs: now, startedAtMs: now, completesAtMs: now + job.durationMs });
  delete state.deposits[quote.building];
}
function startJobs(state, now) {
  let available = slots(state) - state.jobs.filter(job => job.status === "running").length;
  for (const job of state.jobs) {
    if (!available) break;
    if (job.status !== "queued" || job.target !== state.levels[job.building] + 1) continue;
    if (state.jobs.some(other => other.building === job.building && other.status === "running")) continue;
    // A funded contract keeps its reviewed price and duration across revisions.
    job.status = "running"; job.startedAtMs = now; job.completesAtMs = now + job.durationMs; available--;
  }
}
function pauseJob(state, id, paused, now) {
  const job = state.jobs.find(job => job.id === id);
  if (!job) fail("That construction contract is no longer pending.");
  if (job.status === "running") fail("Started construction cannot be paused or refunded.");
  job.status = paused ? "paused" : "queued";
  startJobs(state, now);
}
// Small bounded flow program: max productive utilization subject to recipe,
// storage and reserve constraints. Origin is feasible, so a slack basis suffices.
// Bland's entering/leaving rules keep degenerate full/empty chains deterministic.
function flows(state, legacy = false) {
  const producers = C.producers, n = producers.length, constraints = [];
  const add = (row, bound) => constraints.push({ row, bound });
  producers.forEach((p, i) => {
    const row = Array(n).fill(0); row[i] = 1;
    // Gathering stays automatic; recipes never consume stocks without an
    // explicitly paid, finite production batch.
    add(row, (!legacy && Object.keys(p.inputs).length) || state.processors[p.building] === false ? 0 : p.basePerHour * multiplier(state.levels[p.building]));
  });
  for (const key of KEYS) {
    const net = producers.map(p => (p.output === key ? 1 : 0) - (p.inputs[key] || 0));
    if (state.stock[key] >= capacity(state, key) - EPS) add(net, 0);
    if (state.stock[key] <= (state.reserves[key] || 0) + EPS) add(net.map(v => -v), 0);
    if (state.stock[key] < (state.reserves[key] || 0) - EPS)
      add(producers.map(p => p.inputs[key] || 0), 0);
  }
  const m = constraints.length, width = n + m, basis = constraints.map((_, i) => n + i);
  const table = constraints.map(({ row, bound }, i) => [...row, ...Array.from({ length: m }, (_, j) => +(i === j)), bound]);
  table.push([...producers.map(p => -1 / p.basePerHour), ...Array(m).fill(0), 0]);
  for (let iteration = 0; ; iteration++) {
    const entering = table[m].findIndex((v, j) => j < width && v < -1e-10);
    if (entering < 0) break;
    if (iteration > 512) fail("Estate production did not converge.", "internal");
    let leaving = -1, ratio = Infinity;
    for (let i = 0; i < m; i++) {
      if (table[i][entering] <= 1e-10) continue;
      const next = table[i][width] / table[i][entering];
      if (next < ratio - 1e-9 || (Math.abs(next - ratio) <= 1e-9 && (leaving < 0 || basis[i] < basis[leaving]))) {
        leaving = i; ratio = next;
      }
    }
    if (leaving < 0) fail("Unbounded estate production.", "internal");
    const pivot = table[leaving][entering];
    table[leaving] = table[leaving].map(v => v / pivot);
    for (let i = 0; i <= m; i++) if (i !== leaving) {
      const factor = table[i][entering];
      table[i] = table[i].map((v, j) => v - factor * table[leaving][j]);
    }
    basis[leaving] = entering;
  }
  const rates = Array(n).fill(0);
  basis.forEach((variable, row) => { if (variable < n) rates[variable] = Math.max(0, table[row][width]); });
  const production = Object.fromEntries(producers.map((p, i) => [p.output, rates[i]])), consumption = zero();
  for (const p of producers) for (const [key, ratio] of Object.entries(p.inputs)) consumption[key] += production[p.output] * ratio;
  return { production, consumption, net: Object.fromEntries(KEYS.map(k => [k, production[k] - consumption[k]])) };
}
function produceUntil(state, until, legacy = false) {
  let remaining = Math.max(0, until - state.settledAtMs) / HOUR;
  for (let steps = 0; remaining > 1e-12; steps++) {
    if (steps > 256) fail("Estate settlement requires support.", "internal");
    const { net } = flows(state, legacy);
    let dt = remaining;
    for (const key of KEYS) {
      if (net[key] > EPS && state.stock[key] < capacity(state, key) - EPS)
        dt = Math.min(dt, (capacity(state, key) - state.stock[key]) / net[key]);
      if (net[key] > EPS && state.stock[key] < (state.reserves[key] || 0) - EPS)
        dt = Math.min(dt, (state.reserves[key] - state.stock[key]) / net[key]);
      if (net[key] < -EPS && state.stock[key] > (state.reserves[key] || 0) + EPS)
        dt = Math.min(dt, (state.stock[key] - (state.reserves[key] || 0)) / -net[key]);
    }
    if (!(dt > 0)) fail("Estate settlement stalled.", "internal");
    for (const key of KEYS) {
      const previous = state.stock[key], limit = Math.max(previous, capacity(state, key));
      state.stock[key] = Math.max(0, Math.min(limit, previous + net[key] * dt));
      if (Math.abs(state.stock[key] - Math.round(state.stock[key])) < 1e-8) state.stock[key] = Math.round(state.stock[key]);
    }
    remaining -= dt;
  }
  state.settledAtMs = until;
}
function settle(state, now, onComplete = () => {}) {
  if (now < state.settledAtMs) fail("Estate time cannot move backwards.");
  // Honor the old account's accrued interval once, then retire automatic
  // processing. New estates start in manual mode; migration never starts a batch.
  const legacy = state.productionPolicyVersion === undefined;
  startJobs(state, state.settledAtMs);
  for (;;) {
    const due = state.jobs.filter(job => job.status === "running" && job.completesAtMs <= now)
      .sort((a, b) => a.completesAtMs - b.completesAtMs);
    const production = Object.values(state.productionOrders || {}).filter(o => o.status === "running" && o.completesAtMs <= now);
    if (!due.length && !production.length) break;
    const deadline = Math.min(due[0]?.completesAtMs ?? Infinity, ...production.map(o => o.completesAtMs));
    produceUntil(state, deadline, legacy);
    for (const job of due.filter(job => job.completesAtMs === deadline)) {
      if (state.levels[job.building] !== job.target - 1) fail("Construction target is inconsistent.", "internal");
      state.levels[job.building] = job.target;
      state.jobs = state.jobs.filter(other => other.id !== job.id);
      onComplete({ ...job, status: "completed" });
    }
    for (const order of production.filter(o => o.completesAtMs === deadline)) order.status = "ready";
    deliverProduction(state);
    startJobs(state, deadline);
  }
  produceUntil(state, now, legacy);
  deliverProduction(state);
  state.productionPolicyVersion = 1;
  return state;
}
function chainLevel(state, resource, seen = new Set()) {
  if (seen.has(resource)) fail("Invalid recipe chain.", "internal");
  const p = PRODUCERS[resource];
  if (!p) fail("Unknown material.", "invalid-argument");
  return Math.min(state.levels[p.building], ...Object.keys(p.inputs).map(key => chainLevel(state, key, new Set(seen).add(resource))));
}
function quoteRate(state, resource) {
  const level = chainLevel(state, resource);
  return level > 0 ? referenceRates(level)[resource] : 0;
}
function rarityIndex(level) { return level >= 100 ? 4 : level >= 75 ? 3 : level >= 50 ? 2 : level >= 25 ? 1 : 0; }
function benefit(key, level) {
  if (!level) return "Build this permanent estate service.";
  const p = C.producers.find(p => p.building === key);
  if (p) return (p.basePerHour * multiplier(level)).toFixed(2) + " " + p.output + "/hour capacity";
  if (["treasury", "barracks", "gatehouse", "royal-stables"].includes(key))
    return C.gearMilestones[rarityIndex(level)][1] + " commissions · " + (168 - 96 * (level - 1) / 99).toFixed(1) + " hours";
  if (key === "great-hall") return "Other buildings may reach Level " + level;
  if (key === "builders-yard") return (level >= 50 ? 3 : level >= 10 ? 2 : 1) + " builders · " + (30 * (level - 1) / 99).toFixed(2) + "% shorter new contracts";
  if (key === "alehouse") return C.gearMilestones[rarityIndex(level)][1] + " recruits · " + (35 * (level - 1) / 99).toFixed(2) + "% faster recovery";
  if (key === "guild-master") return "Champion Level " + level + " · " + (6 + Math.floor(18 * (level - 1) / 99)) + " active roster";
  const terms = key === "storehouse" ? C.storehouseCapacity : key === "granary" ? C.granaryCapacity
    : key === "wagon-yard" ? C.rules.wagonCapacityBonus : C.rules.marketCapacityBonus;
  return poly(terms, level).toLocaleString("en-US") + " capacity per " + (["market", "granary"].includes(key) ? "food stock" : "building material");
}
function snapshot(state, now) {
  const flow = flows(state);
  // Rates are valid only until an input reserve, storage cap or construction
  // deadline changes them. Clients may animate counters within this boundary;
  // every spend still settles and validates against server state.
  let horizon = Infinity;
  for (const key of KEYS) {
    const rate = flow.net[key], stock = state.stock[key], reserve = state.reserves[key] || 0;
    if (rate > EPS) {
      if (stock < capacity(state, key) - EPS) horizon = Math.min(horizon, (capacity(state, key) - stock) / rate * HOUR);
      if (stock < reserve - EPS) horizon = Math.min(horizon, (reserve - stock) / rate * HOUR);
    }
    if (rate < -EPS && stock > reserve + EPS) horizon = Math.min(horizon, (stock - reserve) / -rate * HOUR);
  }
  for (const job of state.jobs) if (job.status === "running") horizon = Math.min(horizon, Math.max(0, job.completesAtMs - now));
  for (const order of Object.values(state.productionOrders || {})) if (order.status === "running") horizon = Math.min(horizon, Math.max(0, order.completesAtMs - now));
  return { ...structuredClone(state), serverNowMs: now, version: VERSION, constructionPolicy: "pay-on-start", productionPolicy: "manual-batches", slots: slots(state),
    productionRecipes: Object.fromEntries(C.producers.filter(p => Object.keys(p.inputs).length).map(p => [p.building, productionRecipe(state, p.building)])),
    buildingPrerequisites: Object.fromEntries(C.buildings.map(b => [b.key, state.levels[b.key] >= 100 ? []
      : buildingPrerequisites(state, b.key, state.levels[b.key] + 1)])),
    projection: { stock: { ...state.stock }, net: flow.net, untilMs: Number.isFinite(horizon) ? now + horizon : null },
    stock: Object.fromEntries(KEYS.map(k => [k, Math.floor(state.stock[k] + EPS)])),
    resources: Object.fromEntries(KEYS.map(k => [k, { available: Math.floor(state.stock[k] + EPS),
      capacity: capacity(state, k), gross: flow.production[k], consumed: flow.consumption[k], net: flow.net[k],
      reserved: sum(Object.values(state.deposits).map(project => project.deposited[k] || 0)),
      source: PRODUCERS[k].building, inputs: PRODUCERS[k].inputs,
      pendingProduction: pendingProduction(state, k), storageSpace: storageSpace(state, k),
      status: !state.levels[PRODUCERS[k].building] ? "Source not built" : Object.keys(PRODUCERS[k].inputs).length
        ? state.productionOrders?.[PRODUCERS[k].building]?.status === "running" ? "Production in progress"
          : state.productionOrders?.[PRODUCERS[k].building] ? "Production ready; needs storage" : state.stock[k] >= capacity(state,k)-EPS ? "Storage full" : "Choose production"
        : state.stock[k] >= capacity(state,k)-EPS ? "Storage full" : "Producing", timeToFullHours: flow.net[k] > EPS ? Math.max(0, capacity(state, k) - state.stock[k]) / flow.net[k] : null }])),
    benefits: Object.fromEntries(C.buildings.map(b => [b.key, { current: benefit(b.key, state.levels[b.key]),
      next: state.levels[b.key] < 100 ? benefit(b.key, state.levels[b.key] + 1) : "Maximum level" }])) };
}
module.exports = { C, HOUR, EPS, VERSION, KEYS, BUILDINGS, PRODUCERS, COSTS, MINUTES, zero, fail, integer, multiplier,
  referenceRates, initial, normalize, capacity, slots, buildingPrerequisites, constructionQuote, baseQuote, spend, fund, pauseJob,
  pendingProduction, storageSpace, productionRecipe, productionQuote, startProduction,
  flows, settle, chainLevel, quoteRate, rarityIndex, benefit, snapshot, upgradeOverview };
