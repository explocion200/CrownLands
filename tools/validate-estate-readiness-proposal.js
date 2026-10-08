"use strict";
// Approved arithmetic evidence. Runtime configuration is independently validated.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(__dirname, "../docs/estate-economy");
const p = JSON.parse(fs.readFileSync(path.join(dir, "readiness-proposal.json"), "utf8"));
const c = JSON.parse(fs.readFileSync(path.join(dir, "draft-config.json"), "utf8"));
const sum = values => values.reduce((a, b) => a + b, 0);
const poly = (terms, l) => sum(terms.map((v, i) => v * l ** i));
const fmt = n => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const officers = new Set(["treasury", "barracks", "gatehouse", "royal-stables"]);
const commissionHours = l => p.officerCommission.baseHours + (p.officerCommission.hoursAt100 - p.officerCommission.baseHours) * (l - 1) / 99;
function benefit(key, l) {
  if (officers.has(key)) return [commissionHours(l), c.gearMilestones.filter(([n]) => n <= l).length];
  const producer = c.producers.find(x => x.building === key);
  if (producer) return [producer.basePerHour * (1 + c.productionGrowth * (l - 1))];
  if (key === "great-hall") return [Math.min(100, l + p.hallLead)];
  if (key === "market") return [poly(p.marketCapacityBonus, l)];
  if (key === "wagon-yard") return [poly(p.wagonCapacityBonus, l)];
  if (key === "storehouse") return [poly(c.storehouseCapacity, l)];
  if (key === "granary") return [poly(c.granaryCapacity, l)];
  if (key === "guild-master") return [l];
  if (key === "alehouse") return [0.35 * (l - 1) / 99];
  if (key === "builders-yard") return [c.builderReductionAt100 * (l - 1) / 99];
  throw Error("No proposed reward for " + key);
}
assert.equal(p.hallLead, 0);
assert.equal(p.officerCommission.higherRarityAcquisitionExceptionApproved, true);
const rewardChecks = c.buildings.map(b => {
  for (let l = 2; l <= 100; l++) assert.notDeepEqual(benefit(b.key, l), benefit(b.key, l - 1), b.key + " empty proposed upgrade " + l);
  return { key: b.key, changingLevels: 99 };
});
assert.equal(rewardChecks.length, 20);
assert.equal(commissionHours(1), 168);assert.equal(commissionHours(100), 72);
const fullOfficerSetDays = (2 ** 4) * 8 * commissionHours(100) / 24;
assert.equal(fullOfficerSetDays, 384);
const commissionDemandHoursPerDay = officers.size * p.officerCommission.materialProductionHours * 24 / commissionHours(100);
assert(commissionDemandHoursPerDay / 24 <= 0.25);
const q = p.quest;
const questRows = q.rewardHoursPerElapsedHour.map((rate, tier) => {
  const toolFee = tier >= 2 ? q.advancedToolHoursPerElapsedHour : 0;
  return { tier, rate, afterToolFee: rate - toolFee, foodFee: q.foodHoursPerElapsedHour };
});
for (let i = 1; i < questRows.length; i++) assert(questRows[i].afterToolFee > questRows[i - 1].afterToolFee, "Higher tier is worse after Tool fees");
// Check whole-unit quotes too: an extra ceil-rounded Tool fee can overwhelm
// the entire early reward even when a continuous-rate comparison looks fair.
assert.equal(q.advancedToolHoursPerElapsedHour, 0);
for(let level=1;level<=100;level++)for(const hours of q.durations){
 const rates=Object.fromEntries(c.producers.map(x=>[x.output,0]));
 for(const producer of c.producers){const gross=producer.basePerHour*(1+c.productionGrowth*(level-1));rates[producer.output]+=gross;for(const [k,v] of Object.entries(producer.inputs))rates[k]-=gross*v;}
 for(const resource of ["timber","stone","ore","planks","iron","tools"]){
  const rewards=q.rewardHoursPerElapsedHour.map(rate=>Math.floor(rates[resource]*hours*rate));
  for(let tier=1;tier<rewards.length;tier++)assert(rewards[tier]>=rewards[tier-1],"Integer quest quote makes a higher tier worse");
 }
}
const maxQuestHoursPerDay = q.maxParties * 24 * Math.max(...q.rewardHoursPerElapsedHour) * (1 + q.maxMealBonus);
assert(maxQuestHoursPerDay <= q.sharedHoursPerUtcDay);
assert(maxQuestHoursPerDay / 24 < 0.10);
const xpTotal = sum(Array.from({ length: 99 }, (_, i) => p.champion.xpCostPerCurrentLevel * (i + 1)));
assert.equal(p.champion.bankedLevelLimit, 1);
const xpHours = xpTotal / (p.champion.xpPerHour * Math.max(...p.champion.tierXpMultipliers));
const recruitLevel = (alehouse, guild) => Math.min(guild, 1 + Math.floor((alehouse - 1) / p.champion.recruitLevelStep));
assert.equal(recruitLevel(100, 100), 10);
assert(recruitLevel(100, 5) <= 5);
assert(xpHours / 8 > 85 && xpHours / 8 < 95);
function grantXp(state, amount) {
  assert(Number.isInteger(amount) && amount >= 0);
  const next = structuredClone(state);
  let remaining = amount, awarded = 0;
  while (remaining > 0 && next.level < 100) {
    const need = p.champion.xpCostPerCurrentLevel * next.level;
    const room = need - next.xp;
    const take = Math.min(room, remaining);next.xp += take;remaining -= take;awarded += take;
    if (next.xp < need || next.level >= next.guild) break;
    next.level++;next.xp = 0;
  }
  return { ...next, awarded, unavailable: remaining };
}
const capped = grantXp({ level: 25, guild: 25, xp: 0 }, 10000);
assert.equal(capped.level, 25);assert.equal(capped.xp, 100);assert.equal(capped.awarded, 100);
const raised = grantXp({ level: capped.level, guild: 26, xp: capped.xp }, 1);
assert.equal(raised.level, 26);assert.equal(raised.xp, 1);
assert.equal(grantXp({ level: 100, guild: 100, xp: 0 }, 100).awarded, 0);
// A proposed transaction contract, not a substitute for Firestore concurrency/reset tests.
const initial = () => ({ realm: "oct", gold: 100, stock: 80, level: 1, job: null, receipts: {}, completed: [] });
function fund(state, request) {
  const signature = JSON.stringify(request), prior = state.receipts[request.id];
  if (prior) { assert.equal(prior, signature);return state; }
  assert.equal(request.realm, state.realm);assert.equal(request.target, state.level + 1);
  assert.equal(request.costVersion, "test-v1");assert(!state.job);
  assert.equal(request.gold, 60);assert.equal(request.materials, 40);
  assert(state.gold >= request.gold && state.stock >= request.materials);
  const next = structuredClone(state);
  next.gold -= request.gold;next.stock -= request.materials;
  next.job = { id: request.id, target: request.target, paidGold: request.gold, materials: request.materials, costVersion: request.costVersion, duration: 60, state: "paused" };
  next.receipts[request.id] = signature;return next;
}
function start(state, now) {
  assert(state.job && state.job.state === "paused");
  const next = structuredClone(state);next.job.state = "running";next.job.endsAt = now + next.job.duration;return next;
}
function complete(state, now) {
  if (!state.job) return state;
  if (state.job.state !== "running" || now < state.job.endsAt) return state;
  const next = structuredClone(state);
  assert.equal(next.job.target, next.level + 1);
  assert(!next.completed.includes(next.job.id));next.completed.push(next.job.id);
  next.level = next.job.target;next.job = null;return next;
}
const request = { id: "one", realm: "oct", target: 2, costVersion: "test-v1", gold: 60, materials: 40 };
let state = fund(initial(), request);assert.equal(state.gold, 40);assert.equal(state.stock, 40);
const receipt = JSON.stringify(state);
assert.strictEqual(fund(state, request), state);
for (const bad of [{ ...request, materials: 41 }, { ...request, id: "two" }, { ...request, realm: "nov" }]) {
  assert.throws(() => fund(state, bad));assert.equal(JSON.stringify(state), receipt);
}
state = { ...state, realm: "nov", gold: 100 };
assert.strictEqual(fund(state, request), state);
assert.throws(() => fund(state, { ...request, id: "stale" }));
assert.equal(state.job.paidGold, 60);assert.equal(state.gold, 100);
const paused = structuredClone(state);
assert.equal(paused.job.state, "paused");assert.equal(paused.job.materials, 40);
state = start(paused, 500);assert.equal(state.gold, 100);assert.equal(state.stock, 40);
assert.strictEqual(complete(state, 559), state);
state = { ...state, realm: "dec", gold: 100 };
state = complete(state, 560);assert.equal(state.level, 2);assert.equal(state.gold, 100);
assert.strictEqual(complete(state, 999), state);assert.equal(state.completed.length, 1);
const report = {
  status: "PASS: approved arithmetic and transaction-contract fixtures",
  gameplayDeploymentReady: false,
  reasons: ["Arithmetic evidence alone does not certify release readiness", "Required PR checks, coordinated publication and production smoke verification are separate gates", "Physical-device pacing and touch QA remain manual"],
  proposedChangingUpgrades: rewardChecks,
  maxQuestHoursPerDay, maxQuestPercent: maxQuestHoursPerDay / 24 * 100,
  championXpTotal: xpTotal, championFastestQuestHours: xpHours, championDaysAtEightHours: xpHours / 8,
  officerLegendarySetDaysAfterUnlock: fullOfficerSetDays,
  fourCommissionResourceHoursPerDay: commissionDemandHoursPerDay,
};
if (process.argv.includes("--write")) fs.writeFileSync(path.join(dir, "READINESS_RESULTS.json"), JSON.stringify(report, null, 2) + "\n");
else assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "READINESS_RESULTS.json"), "utf8")), report, "Stale readiness proposal results");
console.log(JSON.stringify({ status: report.status, gameplayDeploymentReady: false, changingBuildingLevels: rewardChecks.length * 99, maxQuestPercent: fmt(report.maxQuestPercent), championDaysAtEightHours: fmt(report.championDaysAtEightHours), officerLegendarySetDaysAfterUnlock: fullOfficerSetDays }, null, 2));
