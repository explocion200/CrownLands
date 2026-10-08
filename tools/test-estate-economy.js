"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const E = require("../functions/estate-economy");
const S = require("../functions/estate-services");
const H = E.HOUR;
function all(level = 1, now = 0) {
  const s = E.initial(now); for (const key in s.levels) s.levels[key] = level; return s;
}
function near(a, b, tolerance = 1e-5) { assert(Math.abs(a - b) <= tolerance, a + " != " + b); }
function rich(s) { for (const key of E.KEYS) s.stock[key] = 1e9; return s; }
// Runtime bill parity with the independently generated, reviewed 2,000 rows.
const table = fs.readFileSync(require("node:path").join(__dirname, "../docs/estate-economy/LEVEL_TABLES.md"), "utf8");
assert(Object.keys(E.COSTS).length === 20);
for (const b of E.C.buildings) for (let level = 1; level <= 100; level++) {
  const quote = E.baseQuote(all(100), b.key, level, 285);
  assert.deepEqual(quote.materials, E.COSTS[b.key][level]);
  assert(Number.isSafeInteger(quote.gold) && quote.gold > 0);
  if (level === 1) assert.deepEqual(quote.materials, {});
  else assert(Object.values(quote.materials).every(x => Number.isSafeInteger(x) && x > 0));
}
const names = Object.fromEntries(require("../inner-city-estate").buildings.map(b => [b.label, b.key]));
let current, rows = 0;
for (const line of table.split(/\r?\n/)) {
  const heading = /^### (.+) — Levels 1–100$/.exec(line);
  if (heading) current = names[heading[1]];
  else if (current && /^\| \d+ \|/.test(line)) {
    const cells = line.split("|").slice(1, -1).map(x => x.trim() === "—" ? 0 : Number(x.trim().replaceAll(",", "")));
    const level = cells[0], quote = E.baseQuote(all(1), "great-hall", 1, 285);
    const materials = ["timber", "stone", "planks", "iron", "tools", "grain", "food"];
    materials.forEach((k, i) => assert.equal(E.COSTS[current][level][k] || 0, cells[i + 1]));
    const state = all(1); state.levels["great-hall"] = 100;
    const actual = E.baseQuote(state, current, level, 285);
    assert.equal(actual.gold, cells[8]); assert.equal(actual.durationMs / 60000, cells[9]); rows++;
  }
}
assert.equal(rows, 2000);
let s = E.initial(0);
assert.equal(Object.values(s.levels).filter(Boolean).length, 6);
E.settle(s, H * 24000); assert.deepEqual(s.stock, E.zero());
s = all(); E.settle(s, 24 * H);
for (const key of E.KEYS) near(s.stock[key], E.referenceRates(1)[key] * 24);
// Long absence and split visits produce the same result; no stock truncation.
for (let seed = 1; seed <= 40; seed++) {
  let random = seed;
  const next = () => ((random = (random * 1664525 + 1013904223) >>> 0) / 4294967296);
  const a = E.initial(0);
  for (const key in a.levels) a.levels[key] = Math.floor(next() * 101);
  for (const p of E.C.producers) a.processors[p.building] = next() > .2;
  for (const key of E.KEYS) { a.stock[key] = next() * E.capacity(a, key) * 1.1; a.reserves[key] = Math.floor(next() * E.capacity(a, key) * .3); }
  const b = structuredClone(a);
  E.settle(a, 400 * H);
  for (let t = 1; t <= 100; t++) E.settle(b, 4 * t * H);
  for (const key of E.KEYS) near(a.stock[key], b.stock[key], .001);
}
s = all(); s.stock.tools = E.capacity(s, "tools"); s.stock.planks = 100; s.stock.iron = 100;
s.processors.sawmill = false; s.processors.smithy = false;
E.settle(s, H); assert.equal(s.stock.planks, 100); assert.equal(s.stock.iron, 100);
s = E.initial(0); s.levels["foresters-lodge"] = 1; s.levels.sawmill = 100; s.reserves.timber = 100;
E.settle(s, H); near(s.stock.timber, 100); near(s.stock.planks, 0);
E.settle(s, 2 * H); near(s.stock.timber, 100); near(s.stock.planks, 50);
s = all(); s.stock.timber = 1e6; s.processors.sawmill = false; s.processors.smithy = false;
E.settle(s, 100 * H); assert.equal(s.stock.timber, 1e6);
// Paid jobs, sequential levels, concurrency, frozen durations and pause/resume.
s = rich(all(1)); s.levels["great-hall"] = 10;
let quote = E.constructionQuote(s, "quarry", 3);
const before = s.stock.stone, bill = quote.materials.stone;
E.fund(s, quote, "funded_001", 0); near(s.stock.stone, before - bill);
assert.equal(s.jobs.filter(j => j.status === "running").length, 1);
const last = s.jobs[2].id; E.pauseJob(s, last, true, 0);
assert.throws(() => E.pauseJob(s, s.jobs[0].id, true, 0), /Started/);
const events = []; E.settle(s, H * 100, job => events.push(job));
assert.equal(s.levels.quarry, 3); assert.equal(events.length, 2);
const stock = s.stock.stone; E.pauseJob(s, last, false, 100 * H); assert.equal(s.stock.stone, stock);
E.settle(s, H * 200, job => events.push(job)); assert.equal(s.levels.quarry, 4); assert.equal(events.length, 3);
E.settle(s, H * 300, job => events.push(job)); assert.equal(events.length, 3);
s = rich(all(1)); s.levels["great-hall"] = 25;
quote = E.baseQuote(s, "quarry", 2, 285);
E.deposit(s, "quarry", { stone: quote.materials.stone });
assert.equal(E.constructionQuote(s, "quarry").materials.stone, 0);
assert.throws(() => E.deposit(s, "quarry", { stone: 1 }), /exceeds/);
const stone = s.stock.stone;
E.fund(s, E.constructionQuote(s, "quarry"), "deposit_1", 0);
assert.equal(s.stock.stone, stone); assert.equal(s.deposits.quarry, undefined);
assert.throws(() => E.constructionQuote(all(1), "quarry"), /Great Hall/);
// A producer's new rate begins at completion, not at load or funding time.
s = all(); s.levels["great-hall"] = 10;
quote = E.constructionQuote(s, "quarry"); rich(s); E.fund(s, quote, "rate_test", 0);
s.stock = E.zero(); const deadline = s.jobs[0].completesAtMs;
E.settle(s, H); near(s.stock.stone, 80 * deadline / H + 92.8 * (1 - deadline / H));
// Commission recipes are fixed and bounded, never altered by pausing production.
for (const level of [1, 10, 11, 25, 26, 50, 51, 75, 100]) {
  s = all(level);
  for (const building of ["treasury", "barracks", "gatehouse", "royal-stables"]) {
    const q = S.commissionQuote(s, building, building.replace(/-/g, "_") + "_head");
    assert.equal(q.level, 1); assert(Object.values(q.materials).every(v => v > 0));
    const hours = Object.entries(q.materials).reduce((n, [k, v]) => n + v / E.referenceRates(level)[k], 0);
    assert(hours <= 4 + 1e-10 && hours > 3.9);
    s.processors.sawmill = false;
    assert.deepEqual(S.commissionQuote(s, building, q.family), q);
  }
}
const champion = (id, level = 100) => ({ id, level, quality: 4, xp: 0, active: true, questId: "", recoveryUntilMs: 0 });
s = rich(all(100));
const champions = Object.fromEntries(["champion_a", "champion_b", "champion_c", "champion_d"].map(id => [id, champion(id)]));
s.activeChampionIds = Object.keys(champions);
let previous = 0;
for (let tier = 0; tier <= 4; tier++) {
  const q = S.questQuote(s, { tier, hours: 8, championIds: s.activeChampionIds, resources: ["tools"], meal: "none" }, champions, 0);
  assert(q.rewards.tools >= previous); previous = q.rewards.tools;
  assert.equal(q.food, Math.ceil(.08 * E.quoteRate(s, "food")));
  assert(Object.values(q.training).every(x => x.credited === 0));
}
quote = S.questQuote(s, { tier: 4, hours: 8, championIds: s.activeChampionIds, resources: ["timber"], meal: "feast" }, champions, 0);
S.launchQuest(s, quote, "quest_one", champions, 0);
assert.throws(() => S.questQuote(s, { ...quote, resources: ["stone"] }, champions, 0), /busy|occupied/);
S.settleQuests(s, champions, 9 * H);
assert.equal(s.quests.length, 0); assert.equal(s.parcels.length, 1);
assert.equal(champions.champion_a.recoveryUntilMs, 8 * H + quote.recoveryMs);
S.settleQuests(s, champions, 30 * H); assert.equal(s.parcels.length, 1);
assert.throws(() => S.claimParcel(s, "quest_one"), /storage/);
s.stock.timber = E.capacity(s, "timber") - 1;
assert.deepEqual(S.claimParcel(s, "quest_one"), { timber: 1 }); assert.equal(s.parcels[0].rewards.timber, quote.rewards.timber - 1);
assert.equal(s.questUsage.day, "1970-01-01");
const trained = S.train(champion("champion_new", 1), 10000, 1);
assert.equal(trained.credited, 4); assert.equal(trained.champion.xp, 4);
assert.equal(S.train(trained.champion, 10000, 1).credited, 0);
assert.equal(S.train(trained.champion, 0, 2).champion.level, 2);
const oldBank = { ...champion("champion_old", 1), xp: 50000 };
assert.equal(S.train(oldBank, 100, 1).champion.xp, 50000);
assert.equal(S.train(oldBank, 0, 100).champion.level, 100);
s = all(100); const pack = S.supplyQuote(s, "timber", 1, 0);
assert.equal(pack.crowns, 20); s.supplyUsage = { day: pack.day, hours: 1 };
assert.throws(() => S.supplyQuote(s, "grain", .25, 0), /allowance/);
assert(S.supplyQuote(s, "grain", .25, 24 * H));
console.log("Estate rules passed: prices, continuous production, storage/reserves, long absences, funded jobs, commissions, quests, XP and shared supplies.");
