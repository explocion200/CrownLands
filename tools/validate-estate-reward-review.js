"use strict";
// Independent review of the proposed economy. Never loaded by the game.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const estate = require("../inner-city-estate");
const dir = path.join(__dirname, "../docs/estate-economy");
const config = JSON.parse(fs.readFileSync(path.join(dir, "draft-config.json"), "utf8"));
const source = fs.readFileSync(path.join(dir, "LEVEL_TABLES.md"), "utf8");
const design = fs.readFileSync(path.join(dir, "README.md"), "utf8");
for (const assumption of ["min(100, Hall + 5)", "6 + floor(18 × (L−1)/99)", "20 + 4L", "1 / 3 / 6 / 10 / 16", "0.5/1.2/2.4", "0.25 + 0.75 × (L−1)/99"])
  assert(design.includes(assumption), "Update the review's benefit/quest model after changing " + assumption);
const names = Object.fromEntries(estate.buildings.map(b => [b.key, b.label]));
const byName = Object.fromEntries(estate.buildings.map(b => [b.label, b.key]));
const byKey = Object.fromEntries(config.buildings.map(b => [b.key, b]));
const materials = ["timber", "stone", "planks", "iron", "tools", "grain", "food"];
const resources = config.producers.map(p => p.output);
const blank = () => Object.fromEntries(resources.map(r => [r, 0]));
const sum = values => values.reduce((a, b) => a + b, 0);
const mult = level => level ? 1 + config.productionGrowth * (level - 1) : 0;
const poly = (coefficients, level) => sum(coefficients.map((v, i) => v * level ** i));
const fmt = value => Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
const prices = {};
let current;
for (const line of source.split(/\r?\n/)) {
  const heading = /^### (.+) — Levels 1–100$/.exec(line);
  if (heading) { current = byName[heading[1]]; assert(current); prices[current] = {}; }
  else if (current && /^\| \d+ \|/.test(line)) {
    const cells = line.split("|").slice(1, -1).map(x => x.trim());
    assert.equal(cells.length, 10);
    const number = cell => cell === "—" ? 0 : Number(cell.replaceAll(",", ""));
    prices[current][number(cells[0])] = {
      materials: Object.fromEntries(materials.map((r, i) => [r, number(cells[i + 1])])),
      gold: number(cells[8]), minutes: number(cells[9]),
    };
  }
}
assert.equal(Object.keys(prices).length, 20);
for (const levels of Object.values(prices)) assert.equal(Object.keys(levels).length, 100);

function netRates(level) {
  const result = blank();
  for (const p of config.producers) {
    const quantity = p.basePerHour * mult(level);
    result[p.output] += quantity;
    for (const [r, amount] of Object.entries(p.inputs)) result[r] -= quantity * amount;
  }
  return result;
}
function capacity(resource, levels) {
  const food = ["grain", "food"].includes(resource);
  const level = levels[food ? "granary" : "storehouse"];
  return level ? poly(food ? config.granaryCapacity : config.storehouseCapacity, level) : config.startingCapacity;
}
const officers = ["treasury", "barracks", "gatehouse", "royal-stables"];
// Effective benefits from the CURRENT draft, not hypothetical replacement perks.
function benefit(key, level) {
  const producer = config.producers.find(p => p.building === key);
  if (producer) return [producer.basePerHour * mult(level)];
  if (officers.includes(key)) return [config.gearMilestones.filter(([l]) => l <= level).length];
  if (key === "great-hall") return [Math.min(100, level + 5)];
  if (key === "storehouse") return [poly(config.storehouseCapacity, level)];
  if (key === "granary") return [poly(config.granaryCapacity, level)];
  if (key === "builders-yard") return [config.builderReductionAt100 * (level - 1) / 99, config.buildersSlots.filter(([l]) => l <= level).at(-1)[1]];
  if (key === "alehouse") return [0.35 * (level - 1) / 99, 1 + Math.floor((level - 1) / 2)];
  if (key === "guild-master") return [level, 6 + Math.floor(18 * (level - 1) / 99)];
  if (["market", "wagon-yard"].includes(key)) {
    const maximum = 0.25 + 0.75 * (level - 1) / 99;
    const packs = [0.25, 0.5, 1].filter(h => h <= maximum + 1e-9);
    return [...packs, ...(key === "wagon-yard" ? [level >= 25, level >= 50] : [])];
  }
  throw new Error("Unreviewed building " + key);
}
const rewardRows = config.buildings.map(b => {
  const empty = [];
  for (let l = 2; l <= 100; l++) if (JSON.stringify(benefit(b.key, l)) === JSON.stringify(benefit(b.key, l - 1))) empty.push(l);
  return { key: b.key, empty };
});
const shopPackLevels = Array.from({ length: 99 }, (_, i) => i + 2).filter(l => JSON.stringify(benefit("market", l)) !== JSON.stringify(benefit("market", l - 1)));

// Whole-account example: one shared inventory, real source/processor levels,
// real first builds, storage, deposits, Hall gates and earned builder slots.
// This intentionally commits ALL available resources to building, making it
// a generous construction cohort, not twenty separate 50% production grants.
const order = ["foresters-lodge", "quarry", "storehouse", "farmstead", "granary", "mine", "sawmill", "smithy", "workshop", "windmill", "builders-yard", "guild-master", "wagon-yard", "market", "great-hall", ...officers, "alehouse"];
const initialStates = estate.createStates();
function simulateAccount(visitHours, stepMinutes = 10, maxDays = 3600) {
  const dt = stepMinutes / 60;
  assert.equal(visitHours * 60 % stepMinutes, 0);
  const levels = Object.fromEntries(config.buildings.map(b => [b.key, initialStates[b.key] === "completed" ? 1 : 0]));
  assert.equal(Object.values(levels).filter(l => l === 1).length, 6);
  const stock = blank(), made = blank(), inputs = blank(), committed = blank();
  const active = [], milestones = {}, snapshots = {}, completions = [];
  let funding = null, gold = 100, goldEarned = 0, goldSpent = 0, goldReset = 0, stoppedProduction = 0;
  const maxTicks = Math.ceil(maxDays * 24 / dt);
  for (let tick = 0; tick <= maxTicks; tick++) {
    const hour = tick * dt;
    for (let i = active.length - 1; i >= 0; i--) if (active[i].endsAt <= hour + 1e-8) {
      const job = active.splice(i, 1)[0];
      assert.equal(levels[job.key] + 1, job.target);
      levels[job.key] = job.target;
      completions.push({ key: job.key, level: job.target, day: hour / 24 });
    }
    for (const l of [1, 25, 50, 75, 100]) if (!milestones[l] && Object.values(levels).every(v => v >= l)) milestones[l] = hour / 24;
    for (const day of [1, 7, 30, 90, 180, 300]) if (!snapshots[day] && hour + 1e-8 >= day * 24) snapshots[day] = { ...levels };
    if (milestones[100]) break;
    if (tick && tick % (config.seasonDays * 24 / dt) === 0) {
      goldReset += gold - 100; gold = 100; // Model assumption: 100-Gold realm restart.
      // Estate inventory, funding, jobs, levels and deadlines stay untouched.
    }
    if (tick % (visitHours / dt) === 0) {
      const slots = levels["builders-yard"] ? config.buildersSlots.filter(([l]) => l <= levels["builders-yard"]).at(-1)[1] : 1;
      while (active.length < slots) {
        if (!funding) {
          const candidates = config.buildings.filter(b => levels[b.key] < 100 && !active.some(j => j.key === b.key) &&
            (b.key === "great-hall" || (levels["great-hall"] >= 1 && levels[b.key] + 1 <= levels["great-hall"] + 5)) &&
            (levels[b.key] > 0 || b.requires1.every(k => levels[k] >= 1)));
          candidates.sort((a, b) => levels[a.key] - levels[b.key] || order.indexOf(a.key) - order.indexOf(b.key));
          if (!candidates.length) break;
          const key = candidates[0].key;
          funding = { key, target: levels[key] + 1, deposited: blank() };
        }
        const bill = prices[funding.key][funding.target];
        for (const r of materials) {
          const amount = Math.min(Math.floor(stock[r] + 1e-9), bill.materials[r] - funding.deposited[r]);
          assert(amount >= 0);
          stock[r] -= amount; funding.deposited[r] += amount; committed[r] += amount;
        }
        if (gold + 1e-8 < bill.gold || materials.some(r => funding.deposited[r] < bill.materials[r])) break;
        const reduction = config.builderReductionAt100 * Math.max(0, levels["builders-yard"] - 1) / 99;
        active.push({ key: funding.key, target: funding.target, endsAt: hour + Math.ceil(bill.minutes * (1 - reduction)) / 60 });
        gold -= bill.gold; goldSpent += bill.gold; funding = null;
      }
    }
    if (tick === maxTicks) break;
    for (const p of config.producers) {
      const available = p.basePerHour * mult(levels[p.building]) * dt;
      let quantity = Math.min(available, Math.max(0, capacity(p.output, levels) - stock[p.output]));
      for (const [r, amount] of Object.entries(p.inputs)) quantity = Math.min(quantity, stock[r] / amount);
      quantity = Math.max(0, quantity);
      if (available > 0 && quantity < available - 1e-8) stoppedProduction += available - quantity;
      for (const [r, amount] of Object.entries(p.inputs)) { stock[r] -= quantity * amount; inputs[r] += quantity * amount; }
      stock[p.output] += quantity; made[p.output] += quantity;
    }
    for (const r of resources) assert(stock[r] >= -1e-7 && stock[r] <= capacity(r, levels) + 1e-7, r + " stock violation");
    gold += config.referenceGoldPerHour * dt; goldEarned += config.referenceGoldPerHour * dt;
  }
  for (const r of resources) assert(Math.abs(made[r] - inputs[r] - committed[r] - stock[r]) < 0.01, r + " conservation");
  assert(Math.abs(100 + goldEarned - goldSpent - goldReset - gold) < 0.01, "Gold conservation");
  for (const job of active) assert.equal(job.target, levels[job.key] + 1);
  return { visitHours, milestones, snapshots, levels, stoppedProduction, firstUpgrade: completions.find(x => x.level === 2), completions: completions.length };
}
const accounts = [simulateAccount(8), simulateAccount(24)];
const refined = simulateAccount(8, 5, 300);
assert.deepEqual(refined.snapshots[300], accounts[0].snapshots[300], "Account results depend materially on simulation step");

const net = netRates(1);
const bootstrap = config.buildings.map(b => ({ key: b.key, hours: Math.max(...materials.map(r => prices[b.key][2].materials[r] / (net[r] * config.progression.productionShare))) }));
const totalBills = blank();
for (const b of config.buildings) for (let l = 2; l <= 100; l++) for (const r of materials) totalBills[r] += prices[b.key][l].materials[r];
// With no quests or another Tool sink, count the entire construction demand.
const toolDemand = totalBills.tools;
const toolProductionDays = toolDemand / (netRates(100).tools * 24);
const foodQuest = [1, 2, 3].map(slots => ({ slots, foodPercent: slots * 0.15 * 100, toolPercent: slots * 0.05 * 100, rewardPercent: slots * 2.4 / 8 * 100 }));
const xpRequired = sum(Array.from({ length: 99 }, (_, i) => 20 + 4 * (i + 1)));
const partyPower = (n, level, quality) => n * Math.floor(level * (1 + 0.25 * quality));
assert.equal(partyPower(4, 100, 2), 600);
assert.equal(partyPower(4, 75, 3), 524);
assert.equal(partyPower(2, 25, 1), 62);
const lines = [
  "# Estate reward and whole-account review", "",
  "Review date: October 7, 2026. **The implemented presentation can pass validation while the proposed economy still fails reward readiness.** No live estate economy or player data is exercised here. This report audits the existing draft; recommendations below do not silently change approved gameplay or the cost tables.", "",
  "Reproduce with `node tools/validate-estate-reward-review.js --write`. The existing economy validator independently reproduces the source level tables. This second review consumes those exact 2,000 prices and checks effective benefits, shared-account production, visits, storage, prerequisites, material conservation and reward incentives.", "",
  "## Findings that block accepting gameplay balance", "",
  "1. **Officer buildings have 95 upgrades each without a new usable benefit.** Their four rarity gates are useful destinations, but a progress bar alone does not satisfy useful rewards at every step. Existing two-copy Gear rules are confirmed and must not be replaced. Legendary L1 still represents 1,048,576 Common L1 equivalents if built entirely from Common copies; existing Uncommon acquisition changes the mix but does not establish attainable late-tier rewards. Propose a separate, approved per-level reward/acquisition track and test actual drop supply before enforcing building gates.", "",
  "2. **A fresh account does not have the supporting factories assumed by the 1/3/6/10-season calibration.** The first paid material upgrades can take several days at Level 1 production. Funding all twenty buildings competes for the same stock. The full-account cohorts below replace any implication that a fresh estate follows twenty independent reference tracks. Decide whether the target remains a developed-estate resource equivalent or whether an onboarding cost ramp and revised allocation are needed; preserve total band budgets if redistributing early bills.", "",
  "3. **Most shop levels give no effective benefit.** With only 0.25/0.5/1-hour presets, the increasing per-order cap changes ordinary offers only at Levels " + shopPackLevels.join(" and ") + ". A Level 1 player can already buy four quarter-hour packs for the same 20 Crowns/day as Level 100. Raising the cap only reduces clicks. A custom quantity would remove rounding gaps but would not make ten seasons of investment valuable. Recommend meaningful earned catalog/value or estate-service benefits, including a reason for free players to upgrade; retain the shared purchase cap and obtain approval for any changed paid advantage.", "",
  "4. **Great Hall 96–100 has no mechanical reward.** Hall 95 already allows every other site to reach 100 under Hall+5. Propose a final Hall mastery reward or a revised late cap that reaches 100 only at Hall 100, without adding unapproved world-combat or production bonuses.", "",
  "5. **Higher quest tiers can be strictly worse for material gathering.** All tiers share the same 0.5/1.2/2.4-hour material reward. Rare+ adds a Tool fee without increasing that reward. The only tier-scaled reward is XP, which becomes useless when the party is maxed. Do not launch with a permanently better Common quest strategy: design bounded tier-specific rewards and rerun the material budget.", "",
  "6. **Champion training does not match the multi-season goal yet.** The current XP curve totals " + fmt(xpRequired) + " XP, only " + fmt(xpRequired / (20 * 16)) + " Legendary quest-hours before recovery if an eligible party can carry a recruit. Stored ceiling-blocked XP and recruits starting up to Level 50 further shorten training. Decide the intended champion training horizon, revise XP and recruit head starts together, and test veteran/new-champion parties.", "",
  "7. **Quest income is large enough to invalidate the construction-only timing claim.** Three continuously rotated 8-hour parties can add 90% of one selected resource's base production (100.8% with +12% meals), before caps and visits. Spending 50% of that boosted income is not the audited 50% of factory output. Treat expeditions as part of the shared budget, not an unmodeled extra.", "",
  "8. **Gold reservations across a reset lack an executable contract.** The draft retains funded queues while world Gold resets. A later-stage server design must bind paid/reserved Gold to durable job receipts and define cancellation/refunds without duplicating current-season Gold. No UI or arithmetic fixture proves this production behavior.", "",
  "9. **The material loop has no durable endgame purpose yet.** After the chosen buildings and champions reach their caps, expeditions mostly produce more building materials, while officer Gear still uses its separate Gold/copy economy. Full warehouses and Food spent to gather unneeded materials are not lasting rewards. Propose optional estate mastery, cosmetic projects or approved acquisition contracts with repeatable material demand; avoid adding an upkeep tax or unapproved army bonuses simply to consume surplus.", "",
  "10. **A full champion roster has no replacement/bench contract.** Recruitment checks the 24-champion maximum, but the draft defines no safe bench, dismissal or quality-improvement route. A player who filled the roster early can lose the benefit of newly unlocked recruits. Prefer separating permanent champion ownership from the active expedition roster, with clear activation limits; exact ownership/bench rules require design before implementation and must preserve acquired champions.", "",
  "## Effective level rewards", "",
  "Counts cover the 99 upgrades from Level 1 to 100. A changed stat is only a potential benefit: a faster processor is useful only when its inputs and demand support it, and storage matters when headroom is needed. No-benefit counts exclude aesthetic progress indicators.", "",
  "| Building | Upgrades with a changed usable rule | Upgrades with no changed usable rule |", "|---|---:|---:|",
];
for (const row of rewardRows) lines.push("| " + names[row.key] + " | " + (99 - row.empty.length) + " | " + row.empty.length + " |");
lines.push("", "## Shared-account cohorts", "",
  "Illustrative policies, not optimal play or live forecasts. Start with the actual six completed sites, fourteen unbuilt plots, zero materials, 100 Gold, 285 Gold/hour and a modeled 100-Gold restart every 30 days. All construction prices, actual producer levels and capacities come from the draft. Source and factory output settles in recipe order every ten minutes, pausing for missing input/full storage without destroying inputs. Buildings keep producing at the old level while upgrading.", "",
  "At each visit, build/upgrade the lowest-level eligible site, breaking ties in favor of sources, storage and processing. Fund one next-level project at a time; spend every available material on construction, with no competing world Gold spend, recruitment, quests, meals or Crown purchases. Earn builder slots normally; require Hall+5. Start affordable work when a slot is available, without prequeued batches. This is one reproducible shared-budget policy, not the former assumption of free supporting factories. A five-minute step run reproduces the three-visits cohort's day-300 levels.", "",
  "| Visits/day | All 20 first built, day | All 20 at 25, day | All 20 at 50, day | All 20 at 75, day | All 20 at 100, day |", "|---|---:|---:|---:|---:|---:|");
for (const a of accounts) lines.push("| " + 24 / a.visitHours + " | " + [1, 25, 50, 75, 100].map(l => a.milestones[l] ? fmt(a.milestones[l]) : ">3,600").join(" | ") + " |");
lines.push("", "| Cohort / day | Hall | Treasury | Forester | Quarry | Storehouse | Builders' Yard | Lowest / highest building |", "|---|---:|---:|---:|---:|---:|---:|---|");
for (const a of accounts) for (const day of [1, 7, 30, 90, 180, 300]) {
  const l = a.snapshots[day];
  lines.push("| " + 24 / a.visitHours + " visits / " + day + " | " + ["great-hall", "treasury", "foresters-lodge", "quarry", "storehouse", "builders-yard"].map(k => l[k]).join(" | ") + " | " + Math.min(...Object.values(l)) + " / " + Math.max(...Object.values(l)) + " |");
}
lines.push("", "These cohorts use 100% of available materials for estate building. Keeping half for other activities, choosing a different construction order, pausing processors, queuing funded work or adding quests changes the outcome. No date here is a hard wait requirement or an account-wide promise. Stored inventory and factories carry through every simulated rollover. Material and Gold conservation are asserted across the full run.", "",
  "## First-upgrade wait at an undeveloped supply chain", "",
  "Assume all sources/processors are already Level 1, empty stock, an available slot and 50% of sustainable net production. This isolates the material wait for Level 2, excluding first builds, competing projects and construction. Pausing unneeded processors can improve raw-material waits; the table is not a minimum.", "",
  "| Building | Material wait for Level 2, hours |", "|---|---:|");
for (const b of bootstrap) lines.push("| " + names[b.key] + " | " + fmt(b.hours) + " |");
lines.push("", "## Quest and supply checks", "",
  "| Concurrent 8-hour parties with continuous rotation | Food/day as % of daily Food output | Tool/day for Rare+ as % of daily Tools | Extra output of one chosen resource/day |", "|---|---:|---:|---:|");
for (const q of foodQuest) lines.push("| " + q.slots + " | " + fmt(q.foodPercent) + "% | " + fmt(q.toolPercent) + "% | " + fmt(q.rewardPercent) + "% |");
lines.push("", "These are ceiling scenarios using enough rested champions, immediate claiming, space for rewards and all reward budget on one material. Recovery does not enforce a per-account launch gap when alternate parties are available. Three rotating parties use twelve active champions and can be supported by the final roster of twenty-four. Fees round up in actual quotes. Meals add their own Food fees. Longer expeditions give 0.30 resource-hour per real hour; two-hour quests give 0.25. Tier fees need a commensurate reward at the same duration.", "",
  "- Two Uncommon Level 25 champions have power 62 and meet the 60-point tier threshold. Four Epic Level 75 champions have power 524 and meet the 320-point Epic requirement. Four Rare Level 100 champions reach 600, so Legendary-quality recruitment is not mandatory for Legendary quests. These thresholds are feasible, but feasibility does not establish reward value.",
  "- The full twenty-building Level 2–100 table consumes " + fmt(toolDemand) + " Tools, equal to only " + fmt(toolProductionDays) + " days of Level 100 Workshop net output. Production upgrades remain potentially useful for quests or speeding early supply, but long-term processor demand needs a sink/allocation review. This quantity is not an upgrade payback calculation.",
  "- The one-hour Crown allowance is 4.17% of one resource's daily factory output, shared across both stores. It is not 4.17% for every resource. If all paid supply goes to the chosen building while only half of free output is allocated there, it adds up to 8.33% to that allocated material budget before other limits. Spending across a reset must not renew the UTC-day allowance.", "",
  "## Recommended acceptance criteria", "",
  "- Show a real current/next benefit on every paid level. Officer sub-milestone rewards, late Hall rewards and shop utility need explicit designs before claiming this passes.",
  "- Keep the approved 1/3/6/10-season per-building resource direction. Reconcile a shared-account cohort, an early-session cost ramp and quest income with that direction before freezing prices. Exact recommendations remain proposals; this review does not alter the existing 2,000 bills.",
  "- Give every quest tier a reason to choose it after champion XP is capped. Cap total quest contribution to the construction budget; maintain an affordable Food reserve and a free no-meal option.",
  "- Tie champion training and recruitment head starts to a separately chosen multi-season horizon. Do not silently change settled officer Gear copy rules or grant new world combat bonuses.",
  "- Before gameplay release, implement and test authoritative material settlement, deposits, costs, queues, replay-safe completion, cross-season migration, champion actions and shop spending. The current estate UI is presentation, not that backend.", "",
  "## Verification scope", "",
  "This audit asserts generated-price completeness, nonnegative/capped inventories, recipe and deposit conservation, valid construction transitions, shared resources/earned builder slots, persistent estate state and simulation-step stability. Its successful execution means the review is reproducible; it deliberately reports unresolved reward failures. Separately run the existing estate browser suite against the delivered production script for selection, counters, navigation, camera, small-landscape layout and cleanup. Those fixtures cannot certify live saved economy transactions or physical-device touch behavior.", "");
const report = lines.join("\n");
const destination = path.join(dir, "REWARD_REVIEW.md");
if (process.argv.includes("--write")) fs.writeFileSync(destination, report);
else assert.equal(fs.readFileSync(destination, "utf8").replace(/\r\n/g, "\n"), report, "Stale reward review");
console.log(JSON.stringify({ validation: "PASS: reproducible review and conservation checks", gameplayBalance: "NOT READY: reward gaps require design decisions", rewardGaps: rewardRows.filter(r => r.empty.length).map(r => ({ building: r.key, emptyUpgrades: r.empty.length })), accounts: accounts.map(a => ({ visitsPerDay: 24 / a.visitHours, milestones: a.milestones, day300: a.snapshots[300] })) }, null, 2));
