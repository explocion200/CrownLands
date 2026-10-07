# Crownlands estate economy — detailed draft

Status: **PROPOSED BALANCE, October 7, 2026.** The owner confirmed the twenty fixed buildings, Level 100 maximum, Gold-only initial construction, materials for later upgrades, Crown supply purchases, four permanent officer-building tracks and Alehouse champion recruitment/recovery/meals. The owner also confirmed that equipment building unlocks refer to **existing rarity tiers**, not new sets. Every numerical cost, prerequisite, recipe, timer, capacity, quest, purchase limit and milestone below is a review proposal. The Master Specification remains authoritative for confirmed behavior.

This update adds the resource ledger and design documentation. It does **not** implement gathering, spending, construction, saved levels, champion quests, shop catalogs or new equipment gates. Production shows actual available Gold/Crowns and unavailable material balances as a dash; the local review displays explicitly labeled sample balances. Existing artwork, fixed plots, twenty-building directory, camera, Back to Realm and equipment returns remain intact.

Read [all 100 level rows](LEVEL_TABLES.md), [the arithmetic and session review](BALANCE_REVIEW.md) and [the reproducible design inputs](draft-config.json). Run `node tools/audit-estate-economy-draft.js --write` to reproduce the level/review documents. Those files are development documents, excluded from production configuration.

## 1. The player loop

Build the raw-material sites with Gold, collect Timber/Stone/Ore/Grain, and construct the processing chain. Turn Timber into Planks, Ore and fuel into Iron, Planks and Iron into Tools, and Grain into Food. Upgrade production, storage and the Builders' Yard so more projects can run while away. Use the seasonal city to support a guild and invest spare supplies in permanent equipment-building milestones. Spend Food on champion expeditions and preparation rather than treating it as a second unrestricted currency.

All sites stay on their approved plots. A building starts surveyed, changes to foundations/scaffolding during construction, and becomes completed at its first level. Later upgrades retain the old building and show restrained construction activity within the same footprint; the old level keeps working until completion. The UI shows completed level, target level, reserved costs and server completion time separately. An upgrade never immediately grants its future production.

The six current completed buildings retain Level 1 on migration; there is no retroactive bill. The fourteen surveyed plots require their proposed Gold fee. Each brand-new season begins with the same six-completed/fourteen-surveyed layout, except the four officer buildings keep their earned levels. An initial construction fee is always Gold-only; no site requires materials to build its first level. Gold-only does not remove a completed-building prerequisite.

## 2. Materials, recipes and output

Each player has one estate. Capturing more world cities does not create extra estate mines or multiply material production. World Gold, troops, skill bonuses, equipment bonuses, missions and regular-city upgrade rules keep their existing behavior. These materials do not strengthen walls or armies directly and are not lootable through a city attack in this first draft.

| Material | Building | Level 1 gross output / hour | Recipe per output | Purpose |
|---|---|---:|---|---|
| Timber | Forester's Lodge | 100 | None | Basic construction; Sawmill and Smithy inputs |
| Stone | Quarry | 80 | None | Foundations and building upgrades |
| Iron Ore | Mine | 60 | None | Smithy feedstock |
| Grain | Farmstead | 80 | None | Food processing; farm/granary upgrades |
| Planks | Sawmill | 20 | 2 Timber → 1 Plank | Construction from target Level 11 |
| Iron | Smithy | 16 | 3 Ore + 1 Timber → 1 Iron | Construction from target Level 26 |
| Tools | Workshop | 4 | 1 Plank + 1 Iron → 1 Tool | Construction from target Level 51; advanced expeditions |
| Food | Windmill | 24 | 2 Grain → 1 Food | Champions, meals and relevant building upgrades |

The Windmill represents milling and its attached food-preparation operation; Food is one abstract provision unit. Flour is intentionally not an additional stock or counter in this draft. There is no additional Coal, Leather, Water or Stone Block chain to maintain.

For every producer, `gross hourly output = base output × (1 + 0.16 × (level − 1))`. Levels 1/25/50/75/100 multiply output by 1 / 4.84 / 8.84 / 12.84 / 16.84. This is additive growth, not repeated compounding. Every production level provides a benefit, while its relative percentage gain gradually falls.

At equal Level 1 with every processor running, sustainable net stocks grow by **44 Timber, 80 Stone, 12 Ore, 32 Grain, 16 Planks, 12 Iron, 4 Tools and 24 Food per hour**. Gross output and net output must have distinct UI labels; showing 100 Timber/hour while hiding its 56/hour factory consumption would mislead players.

Processors have On/Pause and an optional raw-stock reserve. The free default is On with no reserve; a player can preserve construction Timber or expedition Grain without demolishing a building. A processor stops when inputs run out or its output storage fills. It never burns inputs for discarded output. Unequal levels can starve an advanced factory; show the limiting input, recommend its source, and allow pausing. Fractional production remains in server settlement carries; owned/spendable stocks are whole units. Offline settlement must reproduce the same constrained recipes and caps as continuous play, even when inputs become available or storage fills during the interval.

## 3. Storage and offline play

Before constructing storage, every material has a 500-unit starter reserve. It makes first construction possible without a material prerequisite cycle, but it is not intended for a full day unattended. The onboarding guide recommends Storehouse and Granary immediately.

- Storehouse capacity **per** Timber/Stone/Ore/Planks/Iron/Tools stock: `3,200 + 170L + 16L²`.
- Granary capacity **per** Grain/Food stock: `2,400 + 130L + 14L²`.
- Separate pools prevent a mountain of Stone from stopping food production. These do not cap the existing Gold or Crown wallet.
- At matched producer/storage levels, both formulas hold at least 24 hours of gross Timber/Grain output across all 100 levels. The formulas cannot guarantee that headroom when production is substantially ahead of storage.
- Production continues while away until its storage or inputs limit it. There is no additional daily collection quota, mandatory manual collection or Crown-only offline extension.
- Full storage pauses further production; existing stock is not destroyed. Show amount/capacity, net hourly change, estimated time to full and input warnings in a resource ledger.
- Resource rewards and supply purchases are quoted against free capacity. A Crown purchase that cannot fit is rejected before charging; show a smaller valid purchase. No silent paid overflow, negative stock or forced replacement.

## 4. All twenty buildings and their rewards

All have maximum Level 100. Except Great Hall, each first construction requires Great Hall 1; additional prerequisites in the table are **Level 1 completed buildings**. The six starter structures do not need to be rebuilt or repaid when initially granted. Their reference fees below only describe a hypothetical new construction quote. A permanent building's original level and equipment access remain available through a season restart.

| Building | Reference L1 Gold / minutes | Additional first-build prerequisite | What improves and why to upgrade |
|---|---:|---|---|
| Great Hall | 200 / 8 | None; starter completed | Raises seasonal building ceiling to `min(100, Hall + 5)`; estate planning and visible mastery progress. It has no extra world production or combat bonus. |
| Treasury | 150 / 6 | Starter completed | Permanent Master of Coin rarity research; Common 1, Uncommon 25, Rare 50, Epic 75, Legendary 100. |
| Barracks | 150 / 6 | Starter completed | Permanent War Captain rarity research at the same milestones. |
| Gatehouse | 175 / 6 | Starter completed | Permanent Defensive Commander rarity research at the same milestones. Remains a wall-connected structure. |
| Royal Stables | 150 / 6 | Starter completed | Permanent Cavalry Master rarity research at the same milestones. Its service yard remains distinct from Wagon Yard. |
| Alehouse | 100 / 6 | Starter completed | Stronger recruit offers, faster quest recovery and improved optional meals. |
| Guild Master | 150 / 8 | Alehouse | Champion roster, parties, concurrent expeditions, quest tiers and training ceiling. |
| Forester's Lodge | 75 / 4 | None | More Timber, making both direct upgrades and processing sustainable. |
| Quarry | 75 / 4 | None | More Stone for construction. |
| Mine | 90 / 5 | None | More Ore to feed Iron and Tools. |
| Farmstead | 75 / 4 | None | More Grain for Food and farm/storage growth. |
| Sawmill | 100 / 6 | Forester's Lodge | Faster Plank processing; consumes inputs at the same unchanged recipe ratio. |
| Smithy | 110 / 6 | Mine, Forester's Lodge | Faster Iron processing; does not replace the existing officer equipment screen or two-copy Gear rules. |
| Workshop | 120 / 6 | Sawmill, Smithy | Faster Tool production for late construction and advanced quests. |
| Windmill | 90 / 6 | Farmstead | Faster Food processing; optional sail motion only after construction and a separate approved animation pass. |
| Storehouse | 75 / 5 | None | Larger independent non-food stockpiles and longer unattended gathering. |
| Granary | 75 / 5 | None | Larger Grain/Food reserves, preventing meals from sharing construction storage. |
| Builders' Yard | 100 / 6 | None | One active project initially, two at Level 10, three at Level 50; smooth timer reduction reaching 30% at Level 100. |
| Wagon Yard | 100 / 6 | None | Optional Crown building-supply deliveries; wider selection and larger per-order delivery capacity. No free freight multiplier or passive resource income. |
| Market | 100 / 6 | None | Optional Crown Grain/Food deliveries; larger per-order capacity. No unrestricted Gold-for-material exchange or player trading. |

The fourteen plots total **1,335 Gold** before world-city spending. At the configured minimum raw Main City rate of 285 Gold/hour and a 100-Gold starting balance, collecting that amount alone takes about 4.33 hours; construction is an additional scheduling constraint. The draft does not assume players spend all Gold on the estate. Existing city upgrades can change their income and choices.

Seasonal building upgrades obey Hall+5, so leveling the Hall opens room rather than forcing every building to match it first. The Hall has no completed-level prerequisite from another building beyond having the necessary materials, preventing a circular lock. The four permanent officer tracks have **no seasonal Hall ceiling**; a reset never demotes a building or disables earned gear. Materials still make higher permanent levels harder early in a fresh season.

## 5. Upgrade requirements for every level

All exact rows are in [LEVEL_TABLES.md](LEVEL_TABLES.md). These definitions cover any of the twenty buildings at any target level, using its factor/weights in the review configuration:

| Target levels | Base material units U | Required input families |
|---|---|---|
| 1 | No materials | Fixed Gold fee only |
| 2–10 | `2 + 0.30L` | Timber, Stone; Grain/Food only for relevant themes |
| 11–25 | `4 + 0.40L` | Add Planks |
| 26–50 | `8 + 0.70L` | Add Iron |
| 51–75 | `18 + L` | Add Tools |
| 76–100 | `36 + 1.35L` | Same families, rising amounts; no surprise final-only resource |

`amount for each active material = ceil(U × building resource weight × building factor × permanence factor)`.

Default weights are Timber 1, Stone 1, Planks 0.65, Iron 0.45, Tools 0.12, Grain/Food 0. Building themes modify them: Gatehouse uses more Stone, Stables more Timber and some Food, Guild/Alehouse consume Food, extraction sites require more Tools, Farm/Granary need some Grain. [draft-config.json](draft-config.json) lists every building's exact weights. Ore is a processing ingredient rather than an additional universal upgrade bill. Permanent officers have permanence factor **2**; all other sites use **1**. The building factor ranges from 0.8 for basic extraction to 1.8 for the Hall.

For target Level 2 and above:

- Gold hours `H(L) = 0.05 + 0.003L + 0.00007L²`.
- Gold fee `ceil(G × H(L) × building factor × permanence factor)`, where G is **current raw Main City base Gold/hour**, excluding gear, skills and temporary effects, with minimum 285. The protected Main City rate provides a simple reference that does not increase just because the player captures another city. No persistent high-water price or price inflation after an unrelated conquest is introduced.
- Base upgrade minutes `T(L) = 1 + 0.45L + 0.0105L²`.
- Final timer `ceil(T(L) × building factor × permanence factor × (1 − 0.30 × (BuildersLevel − 1)/99))`.
- Gold and material fees remain separate. More world Gold cannot buy unlimited materials or skip build timers. Officer item crafting fees remain the exact existing fixed fees; this formula applies only to **estate building levels**.

For example, Treasury 24→25 requires **28 Timber, 28 Stone and 19 Planks**, plus `ceil(0.3375 × G)` Gold. Its timer at Builders' Yard 25 is **35 minutes**. Completing it unlocks the Uncommon promotion entitlement for that officer if it was not already earned; it grants no item and consumes no equipment copies.

New input-family boundaries intentionally add depth, but the UI warns before reaching 11/26/51 and points to the needed processor. All processors can be constructed at Level 1 with Gold and raw-site prerequisites, before their products become mandatory. No recipe unlock may demand its own future product. Review the step increases during playtesting; smoothing amounts across boundaries is preferable if the first crafted-material upgrade feels like a wall.

## 6. Construction scheduling and useful sessions

One base construction slot exists before Builders' Yard is built. Projects reserve their entire quoted Gold/material cost atomically when confirmed. The proposed free queue supports **30 total active/pending projects**, with at most **five consecutive levels per building**. A five-level batch displays every level, cumulative costs and finish estimates; if it cannot be fully afforded, offer an explicitly smaller batch. It never silently spends future income or autoraises the requested target.

Pending reservations are held in escrow. Their materials still occupy storage capacity until the job starts, and cannot be reused for recruitment, meals, quests or another building. Gold is removed from the spendable world balance once when escrowed. Starting consumes the reservation without charging again. This makes exact cancellation refunds fit without an overflow exploit. The arithmetic model debits costs when queued and has no cancellation/reservation-capacity behavior, so this small storage difference needs a gameplay settlement test rather than a claim of model coverage.

Only one project per building can run at a time. Pending projects run offline when a construction slot and their confirmed prerequisites are available. Separate buildings can run in parallel at the unlocked slot count. Players may reorder or cancel not-started projects for an exact refund of their reservation; a started job is committed and its costs cannot be refunded after receiving production benefits. Cancellation never grants a future level. A full queue disables confirmation before any charge.

Snapshot the quoted material/Gold bill and the actual start-time duration. A later Builders' Yard upgrade shortens newly starting jobs, not timers already running. A change in Main City Gold production before confirmation invalidates the quote rather than changing an accepted charge. The building keeps producing at its completed level during its upgrade. Free batches and uninterrupted offline queues are essential to avoid demanding hourly taps.

Before a scheduled reset, reject new jobs or batches whose conservative queue completion estimate would cross the reset boundary; do not charge first and discard later. Show the boundary and which smaller batch will finish in time. Unstarted queue reservations must be refunded before generation closure. Forced/manual reset handling, especially paid-material reservations, needs an explicit migration/refund design before gameplay release. The review simulation's reset treatment is an abstraction, not that transaction implementation.

## 7. Permanent equipment-building milestones

Each officer building researches existing tiers: **Level 1 Common; 25 Uncommon; 50 Rare; 75 Epic; 100 Legendary**. Intermediate levels fill visible progress toward the next tier; they do not introduce separate Gold/troop/wall/march multipliers. Actual combat or production power still comes from owned, upgraded and equipped Gear under Section 11.

Future promotion above an officer's highest earned entitlement checks that officer building's milestone. Viewing, equipping, unequipping and upgrading levels **within an already earned rarity** remain available regardless of the estate's current season. Migration records at least the highest tier represented by existing owned/equipped items and authoritative progression/receipts, and never demotes items. Inventory normalization, duplicate rules, two-to-one consumption, exact fixed Gold fees, existing caps and idempotent upgrade receipts remain unchanged. No material is added to the item-crafting bill by this draft.

The exact entitlement migration must be approved and tested before gates are enforced. An offline user, old client, unopened existing chest or delayed request must not unexpectedly lose earned access. A Legendary unlock is permission to progress, not a free Legendary loadout.

**Unresolved reward bottleneck:** the existing copy rule requires 1,048,576 Common Level 1 equivalents for one Legendary Level 1 piece. This estate design does not remove that rule. To make later rarity unlocks feel useful, separately review legitimate targeted-copy or tier-matched acquisition sources. Higher-tier Guild drops would change existing Gear acquisition policy and require an explicit new decision; none are enabled here. Do not call the complete gear economy balanced on the strength of construction timing alone.

## 8. Alehouse, champions, meals and the Guild Master

This is a new **champion expedition** system, distinct from current Daily Missions, Hero progression and their Quest ledger. Champions provide estate expedition utility; they do not join world armies or add unreviewed combat bonuses in this first draft. Champion roster, XP, recovery, Food and seasonal guild state reset under the existing persistence policy. Extending champion permanence would require a separate confirmed allowlist change.

Alehouse offers three recruits with a free refresh once per UTC day. No reroll spend or Crown-only champion is proposed. Keep chosen offers stable across reopening and devices. Proposed recruit qualities unlock at Alehouse 1/25/50/75/100: Common/Uncommon/Rare/Epic/Legendary **champion quality**, separate from item rarity ownership. Charge respectively **0.20 / 0.50 / 1 / 2 / 4 hours of raw Main City Gold**. Never spend before the recruit, roster capacity and quote are validated. The first Common recruit can be a one-time onboarding grant if separately approved; it is not an assumed funding source in the balance audit.

Guild roster capacity is `6 + floor(18 × (L−1)/99)`, ending at 24. Champion training level cannot exceed Guild level. Party size is two initially, three at Guild 25, four at Guild 50. Concurrent expeditions are one initially, two at 25, three at 60. The final roster supports twelve active and twelve resting champions rather than forcing recovery purchases. Upgrading never removes a champion or interrupts a party.

Proposed recruit starting level is `min(Guild level, 1 + floor((Alehouse level−1)/2))`, ending at 50 at Alehouse 100. This gives upgraded recruitment a useful head start while retaining quest training. Each daily refresh guarantees one offer at the highest unlocked quality, one at the preceding quality when available, and one Common offer; there is no hidden rarity reroll requirement. Each champion has one initial expedition stat: `power = floor(champion level × (1 + 0.25 × qualityIndex))`, with qualityIndex 0–4. Proposed minimum total party power for Common/Uncommon/Rare/Epic/Legendary quests is **2 / 60 / 160 / 320 / 600**, with minimum party sizes **2 / 2 / 3 / 4 / 4**. Three or four stronger recruits can meet higher requirements sooner; four Rare Level 100 champions can meet the final threshold, so Legendary recruitment is helpful rather than mandatory.

XP to advance from champion level L is `20 + 4L`. Every participating champion earns `20 × durationHours × questTierMultiplier` XP, with multipliers **1 / 3 / 6 / 10 / 16**; XP is not divided by party size. Level ups retain excess XP, stop at the current Guild training ceiling and never exceed 100. Retain ceiling-blocked XP until a Guild upgrade rather than silently discard it. These are champion-only values, unrelated to existing Hero XP, and remain unvalidated quest-pacing proposals. A suitable party completes for the quoted reward; an unsuitable party is blocked before Food is spent. There is no power-dependent random failure or unbounded over-power reward multiplier.

Quest tiers unlock at Guild 1/25/50/75/100. A higher tier also needs the corresponding **Alehouse recruit-quality milestone**, giving both buildings a purpose. Use clear estimated suitability, fixed duration, costs, rewards and an expiry before the seasonal boundary. A champion can belong to only one expedition and cannot be used while recovering. No champion death, equipment destruction or unrevealed failure odds are proposed: the first version completes a valid expedition for its stated reward. Stronger champions improve suitability for higher tiers; a richer trait system and validation of power/XP pacing need a dedicated champion review.

Offer **2-, 4- and 8-hour** expeditions to fit short visits and overnight play. Snapshot material-production reference rates at launch. One expedition rewards a **shared budget** of respectively **0.5 / 1.2 / 2.4 hours** of sustainable net production, allocated across at most two selected non-food materials (not that many hours of every material). Treat the rate as the lesser of the relevant completed supply-chain levels, so an advanced Workshop cannot imply impossible upstream throughput. Food/Grain do not drop from their own expedition loop; no Crown, world troops or higher-rarity Gear drops are included by default.

Base Food fee equals `ceil(0.15 × durationHours × quoted net Food/hour)`; Rare and higher also require `ceil(0.05 × durationHours × quoted net Tools/hour)`. With no Food source, direct the player to Farmstead/Windmill; paid deliveries are never a prerequisite. Quote all reserves and rewards once, bind them to the launched expedition and return/claim exactly once. The arithmetic audit currently excludes expeditions, so these yields and sinks need a second simulated/playtested pass before acceptance.

Returned rewards remain in a bounded pending ledger until they fit; never silently discard them because gathering filled storage during the quest. Allow partial material claims with transaction receipts and keep the remainder. Permit at most six pending reward parcels; a full ledger blocks new launches before Food is charged. Completing frees the expedition slot and starts recovery independently of claiming. Unclaimed seasonal parcels expire at the announced reset boundary; display that expiry before launch and reject quests that would finish across it.

Base recovery is **30 / 60 / 120 minutes** for 2-/4-/8-hour expeditions. Alehouse reduces it smoothly by `0.35 × (L−1)/99`, reaching 35% at 100, with a minimum 10 minutes. Recover automatically while away. Recovery is not a spending prompt.

Preparation meals are optional and use the estate's Food:

| Meal | Alehouse unlock | Extra Food cost, as hours of quoted net Food | Expedition benefit |
|---|---:|---:|---|
| Trail bread | 10 | 0.05 | +5% material reward |
| Hearty stew | 25 | 0.12 | +8% reward and −5% recovery |
| Guild feast | 50 | 0.25 | +12% reward and −10% recovery |

One meal per expedition; effects do not stack. Apply reward rounding once to the complete budget and combine recovery reductions additively with a total 45% cap. Food remains a meaningful sink, with a free no-meal option. Meals must not repay their own ingredients through guaranteed Food drops.

## 9. Wagon Yard and Market Crown supplies

Both are optional delivery catalogs, never required to finish the building tree. Wagon Yard supplies Timber/Stone/Ore/Planks/Iron/Tools; Market supplies Grain/Food. Require the corresponding producer and necessary processors to be completed before quoting a resource, so a paid pack cannot bypass the Gold-only bootstrap or recipe chain.

Use a **shared account allowance of one production-hour equivalent per UTC day** across both catalogs. A supply quantity is `floor(conservative sustainable reference output/hour × purchased hour fraction)` for **one selected resource**. Multiple-resource packs split the same hour budget. Calculate reference output using the relevant chain's lowest level and unchanged recipe ratios; stopping a factory or equipping Gear must not raise the supply quote. Capacity must fit the complete quantity. Reject zero-quantity packs.

Price is **20 Crowns per hour-equivalent**, rounded up per order. Proposed presets: quarter hour 5 Crowns, half hour 10, one hour 20. Each delivery building's per-order maximum grows from 0.25 hour at Level 1 to 1 hour at Level 100: `0.25 + 0.75 × (L−1)/99`; offer only presets at or below that maximum. Every level increases the supported delivery amount; catalog access adds Planks/Iron at Wagon 25 and Tools at 50, still requiring their free processors. Market always offers Grain/Food after their sources exist. Purchase entitlements, family unlocks and throughput limits must be server-defined.

Under the equal-level reference, one paid resource-hour is at most 4.17% of that resource's 24-hour net production. This cap bounds the supplement; it does not prove PvP fairness, since concentrating supplies into a bottleneck can save more elapsed construction time. Existing free Crown pickup allowances and the Crown cash pack remain unchanged. No direct rarity unlock, timer skip, extra builder slot, paid champion or permanent production multiplier is offered.

Crowns persist; delivered materials are seasonal. Before purchase, show price, exact quantities, post-purchase balances, capacity, remaining daily hour allowance and the season expiry. Disable purchases in the final 24 hours of the season in this first draft, avoiding a new paid-expiry edge case while refund handling is reviewed. Clock rollover, reconnect, two catalogs, parallel devices and receipt replays cannot recreate the shared allowance or duplicate a delivery.

## 10. Counters and building UI

The top ledger is centered below the existing estate header, with **Gold, Crowns, Timber, Stone, Iron Ore, Grain, Planks, Iron, Tools and Food**. It uses warm parchment, fine engraved-style pictograms, small names and tabular amounts. On small screens it forms two centered rows rather than covering the map or introducing a sideways scrolling wallet. The map refits below it, retaining its 1448 × 1086 coordinate space.

Compact K/M/B/T text is only presentation. Hover/keyboard focus exposes the exact whole quantity and unavailable/preview status; spending always uses authoritative exact quantities. Unknown and zero differ. The local art/real-UI fixtures clearly label sample balances and restore them through equipment round trips. The production renderer reads actual Gold and loaded Crown snapshots, observes existing HUD updates and disconnects the observer on disposal; it adds no resource polling or ambient animation loop.

When gameplay exists, activating a counter opens a resource ledger showing owned/reserved/available amounts, capacity, gross production, factory consumption, net production, time to full, source/processor links and current blocking reason. This ledger interaction is **planned**, not implemented by the display-only counter update. Resource updates patch amounts rather than remounting the estate or moving its camera.

Construction panels show current/next perks, prerequisites, exact costs with deficits, production consequences, free queue occupancy, completion time, season boundary and an explicit Build/Upgrade action. Four officer sites retain direct equipment activation; add building research controls within that officer window or through its directory detail rather than replacing the approved click behavior. This integration needs a follow-up UI implementation. Disabled actions explain the missing source, stocks, Hall level, queue or reset deadline.

## 11. Server authority and implementation sequence

No production backend collections or commands for these materials exist in this branch. The following are **required future contracts**, not claims about current APIs:

1. A generation-scoped estate record for seasonal buildings, materials, fractional settlement carries, processing preferences, queues, champions and expeditions; a separate explicit account persistence record for the four officer levels/earned entitlements. Do not use ordinary client profile saves for either.
2. Replay-safe transactions for construction, cancellation, processing settings, recruitment, expedition launch/claim and Crown deliveries. Validate owner, active realm/generation, feature/schema version, quote identity, expected revision and capacity before any writes. No client completion timestamp, quantity, discount, level or reward is trusted.
3. Lazy bounded settlement on relevant authoritative actions/reads, with deterministic input/output limits and historical rate transitions. Scheduled work can complete queues/expeditions without requiring an online tab; broadcasts should coalesce instead of adding a per-player polling loop.
4. Lock/reserve materials and Gold once. Receipts retain accepted quotes; retry an uncertain accepted request with its original ID. Rejection does not manufacture a local refund, and reconnection cannot duplicate jobs, recruits, quest rewards or Crown spending.
5. Validate batching and simultaneous build/quest/purchase activity against the same stocks. Paid deliveries use the existing permanent Crown authority and one shared daily ledger. Archived or mismatched generations cannot spend current materials or overwrite new-season state.
6. Migration must preserve all existing Gear, new markers, slot ownership and grandfathered rarity access. Season reset carries only the explicitly confirmed officer progression; champion permanence, intermediate reward receipts and paid reservation handling need separate decisions.

Suggested delivery stages: **A** counters/draft (this update); **B** raw materials, storage, Gold-only builds and replay-safe queues; **C** factories, all level curves and reset migration; **D** officer rarity entitlements with grandfathering and confirmed acquisition policy; **E** champion roster/quests/meals; **F** Crown catalogs only after free economy, shared caps and refund/expiry tests pass. No merge of stage A implies later stages work.

## 12. Balance review and acceptance before gameplay release

The audit checks registry coverage, no prerequisite cycle, all 100 monotonic material/production rows, sustainable recipes, nonnegative inventory, storage caps, single-job affordability, 24-hour matched-level storage, queue concurrency and Crown hour bounds. It compares uninterrupted strategies, three visits per day with batches and monthly resets. See [BALANCE_REVIEW.md](BALANCE_REVIEW.md) for reproduced results and assumptions. Gold competition, startup rebuilding, champion sinks, quest returns, human decisions and payment concentration are not yet validated by this model.

The revised model reaches all seasonal buildings at 100 in about **25.02 days** with continuous seasonal-first scheduling and **27.79 days** with three evenly spaced visits per day. All twenty take **33.30 uninterrupted days** under the latter policy. With simulated monthly resets retaining only officer levels, all twenty first coincide at 100 around **day 57.92**, in the second season. These estimates assume all twenty sites initially L1 and affordable Gold; actual players can be slower. They are not published timers or progression promises. Prioritizing selected buildings is encouraged; maximuming every site is not required for normal play.

The separate Gold audit exposes a newcomer constraint: at a constant 285 Gold/hour, taking all sixteen seasonal sites from 1 to 100 costs **197,303 Gold**, or **28.85 days of the Main City's entire income**. All twenty cost **297,327 Gold**, or **43.47 income-days**, before first builds, recruitment, Gear or world-city spending. Spending half of that single-city income doubles those funding lower bounds. Gold accrues alongside construction, so these days are not added to the material model. Extra kingdom income changes affordability, while raising Main City production also changes future quotes. Selected milestones should remain rewarding for low-income players; tune fees after testing that cohort rather than promise a 28-day maximum to everyone.

Before approving gameplay balance, test newcomers with starter Gold, returning players with retained officers, wealthy kingdoms, sparse twice-daily visits, long absences, uneven factories and full storage. Include meal/no-meal and Crown/no-Crown cohorts. Measure time to first useful construction, first expedition, first rarity entitlement, percentage of stalled projects, wasted production, session workload and progress lost at reset. Check that every input appears in a meaningful source/sink, no positive crafting cycle exists, paid supply cannot bypass prerequisites, and earned equipment remains usable.

Open approval decisions: these numerical formulas; the Hall+5 ceiling; paid caps/prices/expiry; exact officer entitlement migration; higher-tier Gear acquisition; champion quality/traits; seasonal roster policy versus any new permanence request; advanced quest recipes/rewards; cancellation and forced-reset refunds. Arithmetic consistency and a rewarding-looking progression draft are useful evidence, **not a claim that the complete economy has been playtested or is live**.
