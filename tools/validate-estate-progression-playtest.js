"use strict";

// Fresh-account journeys use shipped rules and earned supplies. No player data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../functions/estate-economy");
const S = require("../functions/estate-services");
const names = Object.fromEntries(require("../inner-city-estate").buildings.map(b => [b.key, b.label]));
const buildOrder = ["foresters-lodge", "quarry", "farmstead", "windmill", "guild-master", "mine",
  "storehouse", "granary", "sawmill", "smithy", "workshop", "builders-yard", "wagon-yard", "market"];
const priority = ["great-hall", ...E.C.producers.map(p => p.building), "storehouse", "granary",
  "builders-yard", "guild-master", "alehouse", ...Object.keys(E.BUILDINGS)];
const fmt = n => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const has = (s, bill) => Object.entries(bill).every(([k, n]) => Math.floor(s.stock[k] + E.EPS) >= n);

function journey(activeStart) {
  const state = E.initial(0), champions = {}, events = [], milestones = {}, days = {};
  let gold = 100, time = 0, serial = 0, commissionClaimed = false, launched = 0, batches = 0;
  const record = (key, text, hours) => {
    if (milestones[key] === undefined) { milestones[key] = hours; events.push({ hours, text }); }
  };
  // Six hours of five-minute visits, then three visits/day. This is an explicit
  // active-start scenario, not assumed behavior or automatic runtime scheduling.
  const visits = activeStart ? Array.from({ length: 73 }, (_, i) => i / 12) : [0];
  for (let h = 8; h <= 192; h += 8) visits.push(h);
  for (const hours of visits) {
    const now = hours * E.HOUR;
    gold += (hours - time) * 285; time = hours;
    const previous = { ...state.levels };
    E.settle(state, now); S.settleQuests(state, champions, now);
    for (const [key, level] of Object.entries(state.levels)) {
      if (level > previous[key]) {
        const job = events.findLast(e => e.building === key && e.target === level);
        record(`${key}:${level}`, `${names[key]} completed Level ${level}`, job?.deadlineHours ?? hours);
      }
    }
    for (const parcel of [...state.parcels]) {
      if (!Object.entries(parcel.rewards).some(([k, n]) => n > 0 && E.storageSpace(state, k) >= 1)) continue;
      const received = S.claimParcel(state, parcel.id);
      assert(Object.values(received).some(n => n > 0));
      record("first-claim", "First expedition rewards claimed", hours);
    }
    const commission = state.commissions.treasury;
    if (commission && commission.completesAtMs <= now) {
      // Gear insertion itself is covered by the transaction emulator. This
      // scenario records its accepted ready deadline, without inventing a Bag.
      record("commission-ready", "First Treasury commission ready", commission.completesAtMs / E.HOUR);
      delete state.commissions.treasury; commissionClaimed = true;
    }
    if (state.levels["guild-master"] && state.activeChampionIds.length < 2) {
      if (state.recruitOffers?.day !== S.utcDay(now)) state.recruitOffers = { day: S.utcDay(now), offers: S.offers(state, now, 285) };
      for (const offer of state.recruitOffers.offers) {
        if (offer.claimed || gold < offer.gold || state.activeChampionIds.length >= 2) continue;
        const id = "champion_" + offer.id;
        champions[id] = { id, name: offer.name, quality: offer.quality, level: offer.level, xp: 0, active: true, questId: "", recoveryUntilMs: 0 };
        state.activeChampionIds.push(id); offer.claimed = true; gold -= offer.gold;
      }
      if (state.activeChampionIds.length === 2) record("party", "Two permanent champions recruited", hours);
    }
    // One early commission is a deliberate material sink. Do not assume an
    // infinite Gold budget, free gear, Crowns, meals or advanced factories.
    if (!commissionClaimed && !state.commissions.treasury) {
      try {
        const q = S.commissionQuote(state, "treasury", "treasury_head");
        if (has(state, q.materials)) {
          E.spend(state, q.materials);
          state.commissions.treasury = { ...q, id: "first_commission", completesAtMs: now + q.durationMs };
          record("commission", "First Treasury commission funded", hours);
        }
      } catch (error) { assert.equal(error.code, "failed-precondition"); }
    }
    const available = state.activeChampionIds.filter(id => !champions[id].questId && champions[id].recoveryUntilMs <= now);
    if (available.length >= 2 && !state.quests.length) {
      try {
        const q = S.questQuote(state, { tier: 0, hours: 2, championIds: available.slice(0, 2), resources: ["stone"], meal: "none" }, champions, now);
        if (has(state, { food: q.food })) {
          S.launchQuest(state, q, "quest_" + (++serial), champions, now); launched++;
          record("first-quest", `First two-hour quest launched (${q.food} Food; ${q.rewards.stone} Stone; ${q.training[available[0]].credited} XP per champion)`, hours);
        }
      } catch (error) { assert.equal(error.code, "failed-precondition"); }
    }
    for (let attempts = 0; attempts < 40; attempts++) {
      const quotes = Object.keys(E.BUILDINGS).flatMap(key => {
        try { return [E.constructionQuote(state, key, 1, 285)]; }
        catch (error) { assert.equal(error.code, "failed-precondition"); return []; }
      }).sort((a, b) => a.jobs[0].target - b.jobs[0].target ||
        (a.jobs[0].target === 1 ? buildOrder.indexOf(a.building) - buildOrder.indexOf(b.building) : priority.indexOf(a.building) - priority.indexOf(b.building)));
      const q = quotes.find(q => gold >= q.gold && has(state, q.materials));
      if (!q) break;
      if (state.jobs.length >= E.slots(state)) break;
      const target = q.jobs[0].target;
      assert.equal(q.jobs.length, 1, "Each explicit start funds one building level");
      const stocks = { ...state.stock };
      gold -= q.gold; E.fund(state, q, "build_" + (++serial), now);
      for (const k of E.KEYS) assert.equal(state.stock[k], Math.max(0, stocks[k] - (q.materials[k] || 0)), "The explicit start pays exactly its quoted materials");
      assert.deepEqual(state.deposits, {}, "Fresh journeys never create deposits");
      if (target > 1) record("first-upgrade", "First directly paid upgrade started", hours);
      if (target === 1) assert.deepEqual(q.materials, {}, "First construction is Gold-only");
      events.push({ hours, building: q.building, target, deadlineHours: hours + q.jobs[0].durationMs / E.HOUR,
        text: `${names[q.building]} ${target === 1 ? "Build" : "Upgrade"} started: ${q.gold} Gold; ${fmt(q.jobs[0].durationMs / 60000)} min` });
    }
    // Pay one chosen finite batch per idle processor using only ingredients
    // already earned at this visit. Completed processors remain idle until
    // another visit; construction and services compete for the same stock.
    const nextVisitHours = activeStart && hours < 6 ? 1 / 12 : 8;
    for (const p of E.C.producers.filter(p => Object.keys(p.inputs).length)) {
      const recipe = E.productionRecipe(state, p.building);
      const quantity = Math.min(recipe.maxQuantity, Math.floor(recipe.ratePerHour * nextVisitHours));
      if (!quantity) continue;
      const q = E.productionQuote(state, p.building, quantity), stocks = { ...state.stock };
      E.startProduction(state, q, "production_" + (++serial), now); batches++;
      for (const k of E.KEYS) assert.equal(state.stock[k], Math.max(0, stocks[k] - (q.materials[k] || 0)), "Only current ingredients pay for a manual batch");
      record("first-production", "First manual material batch started", hours);
      if (p.building === "windmill") record("first-food", "First Food batch started", hours);
    }
    if (Object.values(state.levels).every(l => l >= 1)) record("all-built", "All twenty buildings completed", hours);
    for (const key of E.KEYS) assert(state.stock[key] >= 0 && state.stock[key] <= E.capacity(state, key) + .001);
    assert(gold >= 0); assert(state.jobs.length <= E.slots(state));
    for (const [key, level] of Object.entries(state.levels)) if (key !== "great-hall") assert(level <= state.levels["great-hall"]);
    if ([24, 168].includes(hours)) days[hours / 24] = { levels: { ...state.levels }, gold, launched, batches, champions: structuredClone(champions) };
  }
  assert(milestones["first-quest"] !== undefined && milestones["first-claim"] > milestones["first-quest"]);
  assert(milestones["first-upgrade"] !== undefined && days[7].levels["great-hall"] > 1);
  assert(batches > 0 && milestones["first-food"] <= milestones["first-quest"]);
  assert.equal(state.activeChampionIds.length, 2);
  assert(milestones["all-built"] <= 168);
  for (const c of Object.values(days[7].champions)) {
    assert(c.level <= days[7].levels["guild-master"]);
    if (activeStart) assert(c.level > 1, "Guild growth lets earned training advance");
    else assert.equal(c.level, 1, "Training respects the unchanged Guild ceiling");
  }
  // Serialization retains property and accepted deadlines; this is not a reset.
  const restored = E.normalize(JSON.parse(JSON.stringify(state)), time * E.HOUR);
  assert.deepEqual(restored, state);
  const after = structuredClone(state), championsAfter = structuredClone(champions);
  E.settle(after, time * E.HOUR); S.settleQuests(after, championsAfter, time * E.HOUR);
  assert.deepEqual(after, state, "Repeating settlement does not produce or claim twice");
  assert.deepEqual(championsAfter, champions, "Repeating settlement does not award XP or recovery twice");
  return { activeStart, milestones, days, batches, events: events.sort((a, b) => a.hours - b.hours) };
}

const journeys = [journey(true), journey(false)];
const lines = ["# Inner Castle progression playtest", "", "Review of the current direct-payment and manual-production economy, October 9, 2026. Reproduce with `node tools/validate-estate-progression-playtest.js`; use `--write` to refresh this report. These are isolated runtime-rule journeys, not authenticated production or physical-device results.", "",
  "## Fresh-account assumptions", "", "Start with six Level 1 buildings, fourteen unbuilt plots, zero materials and 100 Gold. Main City raw income stays at 285 Gold/hour; no city/Hero improvements, outside Gold rewards, purchases, grants or Crowns are assumed. Build the raw and Food chains first, recruit two Common champions, take two-hour Stone expeditions, fund one Common Treasury commission when affordable, then spread affordable upgrades across the estate. Starts pay the full current bill and Gold together; no deposits or upgrade queues are created. Raw supplies gather automatically. Each visit may pay one finite batch per idle processor, limited by current ingredients, reserves, output storage and one visit interval of capacity. No batch repeats or spends future gathering. All Hall gates, builders, fixed timers, storage, XP ceilings and recovery use the current runtime. Five-minute active visits last six hours in one scenario; the other visits every eight hours from the start. Simulate eight days to observe the earliest accepted commission readiness. These voluntary policies are examples, not optimal routes or automatic starts.", "",
  "## First-day and first-week results", "", "| Event (hours from first entry) | Active first six hours, then 3 visits/day | 3 visits/day throughout |", "|---|---:|---:|"];
for (const [key, label] of [["foresters-lodge:1", "Timber gathering begins"], ["first-food", "First Food batch started"], ["party", "Two champions recruited"], ["first-quest", "First quest launched"], ["first-claim", "First quest rewards claimed"], ["all-built", "All twenty buildings completed"], ["great-hall:2", "Great Hall Level 2 completed"], ["guild-master:2", "Guild Level 2 completed"], ["commission", "First Common commission funded"], ["commission-ready", "First commission ready"]])
  lines.push(`| ${label} | ${journeys.map(j => j.milestones[key] === undefined ? "Beyond day 8" : fmt(j.milestones[key])).join(" | ")} |`);
lines.push("", "| Scenario | Day | Completed buildings | Lowest / highest built level | Completed upgrades above Level 1 | Expeditions launched |", "|---|---:|---:|---|---:|---:|");
for (const j of journeys) for (const day of [1, 7]) {
  const d = j.days[day], built = Object.values(d.levels).filter(l => l > 0);
  lines.push(`| ${j.activeStart ? "Active start" : "3 daily visits"} | ${day} | ${built.length} / 20 | ${Math.min(...built)} / ${Math.max(...built)} | ${built.reduce((n, l) => n + l - 1, 0)} | ${d.launched} |`);
}
lines.push("", "## Reward and pacing findings", "",
  "- First construction activates a usable service or production chain after a short accepted timer. All fourteen first builds cost 1,335 Gold in total; cash competes with recruitment and world spending. Long intervals between visits delay the next explicit start even when a builder is free.",
  "- The first Hall upgrade requires 6 Timber and 18 Stone, then a nine-minute base timer. Processing and commissions compete for these same resources; review the external bill and production ledgers rather than treating gross factory capacity as available stock.",
  "- At Guild Level 1, a Common champion can bank only 4 XP. A two-hour quest advertises only retainable credit, and further quests at that ceiling may give zero new XP until the Guild grows. Raising the Guild allows banked training to advance; rewards and permanent ownership still matter. This training gate is a player-playtest priority.",
  "- Level 1 officer commissions take seven days after funding. Early commissioning offers a permanent goal, but is not an immediate first-session reward. Existing Gear acquisition and two-copy upgrades remain available under their existing rules.",
  "- The current six long-term manual-production cohorts are recorded in REWARD_REVIEW.md. These are assumption-dependent route estimates, not player forecasts. Individual 1/3/6/10-season reference budgets use developed support and 50% production; twenty projects share one stockpile. No cost, timer, reward or persistence change is approved by this review.", "",
  "## Signed-in QA and physical-device checklist", "",
  "Use an owner-approved dedicated QA account; record the build, starting building levels, visit cadence and outcomes without credentials, private IDs or account exports. Never edit server clocks or grant production stock to accelerate a test.", "",
  "1. Enter from Main City, fit the estate, select unbuilt Forester’s Lodge, inspect Gold-only Build requirements and confirm. Reopen while running; Build remains until accepted Level 1 completion. Check the fixed bottom caption and curved countdown.",
  "2. Complete Quarry and the Food chain as funds/builders allow. Choose one Food batch, compare 1-to-Max quantity with current Grain/reserves/space, inspect its bill and timer, then Start. Verify no repeat after completion and source/Back navigation without spending. Background/resume and reload should retain accepted construction, production orders and balances.",
  "3. Review Hall Level 2 from its external Upgrade control. Cancel first and verify no spending. When the full bill, seasonal Gold, prerequisites and a builder are available, Start directly from the displayed requirements. Confirm once-only material/Gold payment, no deposit/queue and retained older credit where present. Check current/next benefits and completion notice.",
  "4. Build Guild Master, recruit two offers at Alehouse, check active/bench capacity, power and the Guild XP ceiling. Review and launch a two-hour quest with real Food. Wait for the accepted deadline; check recovery, quoted XP, claimable materials, a second claim/retry, and partial claims if storage is full.",
  "5. Review and fund a Treasury commission only when its recipe is available. Return from Manage Gear using Back, X and Escape/system Back; preserve camera/selection. Review accepted ready time and claim when actually finished; check inventory and normal Gear upgrade fees/copies.",
  "6. On a physical phone in landscape, pan/pinch, select through the directory, use the production slider/exact amount/Max, background/resume and use Android/iOS Back. Verify that Start and production time remain visible, building/Gear returns preserve the estate, resource counters and fixed labels are readable, targets are usable and the page has no horizontal overflow.",
  "7. Record first-day/week achievements, blocked minutes and whether the next useful reward is understandable. Classify signed-in, real-device and satisfaction results separately from fixture/browser/model checks. Monthly persistence needs a real reset or the existing reset emulator; a local serialization check alone is not a reset test.", "",
  "## itch.io release gate", "",
  "Prepare from the exact currently verified web runtime, preserving its release manifest, active Core topology, all estate art and service scripts. Verify references, worker scope, desktop/small-landscape startup and backend compatibility before upload. Check the actual public Run game iframe and matching assets after publication; Butler channel status alone is insufficient. Record upload/build identity and update the Master Specification only after verification. See the separate [production playtest and release record](PLAYTEST_RELEASE_RECORD.md) for performed checks and remaining manual steps; simulation results above do not establish those outcomes.", "");
const report = lines.join("\n"), destination = path.join(__dirname, "../docs/estate-economy/PROGRESSION_PLAYTEST.md");
if (process.argv.includes("--write")) fs.writeFileSync(destination, report);
else assert.equal(fs.readFileSync(destination, "utf8").replace(/\r\n/g, "\n"), report, "Stale progression playtest report");
console.log(JSON.stringify({ status: "PASS: earned fresh-account progression journeys", journeys: journeys.map(({ activeStart, milestones, days }) => ({ activeStart, milestones, day1: days[1].levels, day7: days[7].levels })) }, null, 2));
