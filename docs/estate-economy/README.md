# Crownlands estate economy — detailed draft

Status: **PROPOSED BALANCE, October 7, 2026.** The owner confirmed the twenty fixed buildings, Level 100 maximum, Gold-only first construction, material-funded upgrades, Crown supply catalogs, existing Gear rarity entitlements and champion recruitment/recovery/meals. The final follow-up confirms that **the entire Inner Castle persists across seasons**: all twenty buildings, all eight material stocks, deposited funding, construction/queues, champions, expeditions and earned estate rewards. Each building individually targets cumulative 1 / 3 / 6 / 10 seasons at Levels 25 / 50 / 75 / 100, using 50% of production toward that building. Exact reference production, quantities, timers, prerequisites, capacities, quest values and purchase limits below remain proposed. The Master Specification is authoritative for confirmed behavior.

This update adds the resource ledger and design documentation. It does **not** implement gathering, spending, construction, saved levels, champion quests, shop catalogs or new equipment gates. Production shows actual available Gold/Crowns and unavailable material balances as a dash; the local review displays explicitly labeled sample balances. Existing artwork, fixed plots, twenty-building directory, camera, Back to Realm and equipment returns remain intact.

Read [all 2,000 building-level rows](LEVEL_TABLES.md), [the arithmetic and timing review](BALANCE_REVIEW.md) and [the reproducible design inputs](draft-config.json). Run `node tools/validate-estate-economy-draft.js --write` to reproduce the level/review documents. Those files are development documents, excluded from production configuration.

## 1. The player loop

Construct the raw-material sites with Gold and collect Timber/Stone/Ore/Grain. Build the processing chain for Planks, Iron, Tools and Food. Develop production, storage and the Builders' Yard, deposit resources toward chosen projects and build permanent equipment/guild milestones. The whole estate develops across realm seasons; it is no longer a city rebuilt monthly. Spend Food on champions and meals while retaining enough supply for construction. Realm Gold and world progression follow their existing separate seasonal rules.

All sites stay on their approved plots. A building starts surveyed, changes to foundations/scaffolding during construction, and becomes completed at its first level. Later upgrades retain the old building and show restrained construction activity within the same footprint; the old level keeps working until completion. The UI shows completed level, target level, reserved costs and server completion time separately. An upgrade never immediately grants its future production.

Initial migration grants the six existing completed buildings at Level 1 without a retroactive bill; the fourteen surveyed plots still need their Gold-only first construction. This starting layout is used only once. Subsequent realm seasons preserve each building's unbuilt/completed/under-construction state and earned level, including the Great Hall and all outer buildings. Keep material stocks, processing settlement/preferences, deposits, quotes, queues, deadlines, champion progress and unclaimed estate rewards. No completed structure returns to a surveyed placeholder.

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

All have maximum Level 100. Except Great Hall, each first construction requires Great Hall 1; additional prerequisites in the table are **Level 1 completed buildings**. The six starter structures do not need to be rebuilt or repaid when initially granted. Their reference fees below only describe a hypothetical new construction quote. A permanent building's earned level and benefits remain available through a season restart.

| Building | Reference L1 Gold / minutes | Additional first-build prerequisite | What improves and why to upgrade |
|---|---:|---|---|
| Great Hall | 200 / 8 | None; starter completed | Raises the proposed estate upgrade ceiling to `min(100, Hall + 5)`; estate planning and visible mastery progress. It has no extra world production or combat bonus. |
| Treasury | 150 / 6 | Starter completed | Permanent Master of Coin rarity research; Common 1, Uncommon 25, Rare 50, Epic 75, Legendary 100. |
| Barracks | 150 / 6 | Starter completed | Permanent War Captain rarity research at the same milestones. |
| Gatehouse | 175 / 6 | Starter completed | Permanent Defensive Commander rarity research at the same milestones. Remains a wall-connected structure. |
| Royal Stables | 150 / 6 | Starter completed | Permanent Cavalry Master rarity research at the same milestones. Its service yard remains distinct from Wagon Yard. |
| Alehouse | 100 / 6 | Starter completed | Permanent recruitment quality, faster quest recovery and improved optional meal access. Meals consume persistent estate Food. |
| Guild Master | 150 / 8 | Alehouse | Permanent champion roster, parties, concurrent expeditions, quest tiers and training ceiling. Champions retain quality, levels and XP. |
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

Proposed prerequisite: upgrades of other buildings obey Hall+5, capped at 100. This keeps the persistent Great Hall useful without requiring every site to match it first. The Hall has no building-level prerequisite beyond Gold/materials, preventing circular locks. This replaces the earlier seasonal ceiling and six-building exemptions; it governs future construction, never revokes existing levels or benefits. Exact gate acceptance and migration need review. All completed levels persist.

## 5. Persistent material requirements and timers

The old seasonal cost formula and double-material multiplier are superseded for **all twenty buildings**. [LEVEL_TABLES.md](LEVEL_TABLES.md) now contains all 80 building-band bills and all 2,000 individual level rows, including Gold and timers. Level 1 remains Gold-only.

| Upgrade band | Additional resource seasons | Cumulative target | Reference producer level | Base timer per upgrade |
|---|---:|---:|---:|---|
| 2–25 | 1 | 1 | 13 | About 5.7–6.3 hours |
| 26–50 | 2 | 3 | 38 | About 11.0–12.1 hours |
| 51–75 | 3 | 6 | 63 | About 16.5–18.1 hours |
| 76–100 | 4 | 10 | 88 | About 21.9–24.2 hours |

A reference season is 30 days. Each chosen building is calibrated against **50% of each required material's sustainable net production**, after processor inputs. Reference producer levels 13/38/63/88 approximate the middle of each progression band. They are fixed design assumptions, not free supporting upgrades or prices based on the player's live income. A weak supply chain takes longer; saved stronger factories and existing stock can accelerate a project. Twenty buildings share one estate economy and cannot each independently spend the same 50% allocation.

For material r, define B(r) = floor(reference net output/hour × 720 × 0.50). A building's whole-band requirement is ceil(B(r) × additional seasons × resource theme weight / largest active theme weight). Themes favor Stone for fortifications, Timber for farm/wood structures, and provisions for selected buildings. The previous building factor and permanence multiplier do not apply to material bills. A band's limiting resource matches its stated season-equivalent budget; other resources vary by theme.

Split that bill across eligible upgrade levels with a 10% linear rise within the band. Round down each share and distribute leftover whole units to the final eligible levels, preserving exact totals and nondecreasing costs. Timber/Stone and relevant Grain/Food begin at Level 2; Planks at 11; Iron at 26; Tools at 51. Ore remains processing feedstock. Every processor can be built for Gold before its product becomes mandatory.

Construction totals a proposed 6/12/18/24 base days across the four bands, spread over their individual upgrades with the same gentle rise. Gathering continues during construction, so those days are not automatically added to ten seasons of collecting. The working proposal treats the milestone targets as approximate total progression time; a focused model checks this overlap. Builders' Yard shortens newly starting timers by up to 30%. There is no calendar-season lock. Timer allocation remains a review proposal.

Gold stays separate: for target L≥2, H(L) = 0.05 + 0.003L + 0.00007L²; charge ceil(G × H(L) × building factor × goldFactor). G is current raw Main City Gold/hour with minimum 285. Existing draft goldFactor values remain 2 for the four officers, Alehouse and Guild Master, and 1 for the other fourteen; persistence does not silently double their Gold fees. First construction uses its fixed Gold fee. Gold is paid when a funded upgrade starts; it is not permanently deposited. Existing Gear item fees and copy requirements are separate.

### Partial deposits

- Players choose the building's next level and explicitly deposit any available required materials, up to each remaining amount. Show required / deposited / remaining by material and a clear commitment confirmation. Depositing does not grant the level or start the timer.
- Each accepted amount leaves spendable stock once and becomes credit bound to that building, target level and cost version. The project can hold more than normal storage capacity; installments free ordinary capacity and cannot be spent twice.
- Proposed limit: one next-level funding project per building. It accepts only the exact materials still needed, never overpayment or unrestricted future-level stock. Level 100 accepts no further funding.
- Deposits cannot be withdrawn, traded or reassigned in this proposal. Removing a funded job from the queue retains its building credit. Ordinary loose stocks now persist too; deposits organize committed construction funding rather than serving as the only safe seasonal storage.
- At full funding, an explicit Start Upgrade action checks Gold, prerequisites and a free/queued construction slot. Consume funded credit exactly once as part of its durable construction contract; do not charge materials again. Preserve the quote, partial credit, funded job and completion receipt across resets or balance migrations.
- Funding details, refund policy and migration still require authoritative implementation and tests. The local ledger fixture only demonstrates conservation, replay and rollover invariants.

## 6. Construction scheduling and useful sessions

One construction slot exists before the Builders' Yard is built; its proposed Levels 10 and 50 unlock two and three slots. Keep the draft cap of 30 active/pending jobs and at most five consecutive levels of one building. One building runs only one upgrade at a time. Automatic production and previously confirmed queues continue offline.

Partial deposits fund only the next upgrade. A fully affordable multi-level batch can explicitly reserve later bills in a single reviewed quote; already-deposited credit is deducted from the first bill exactly once. This bounded batch is separate from unrestricted future-level deposits. Show every level, cumulative additional materials/Gold and expected completion; never silently spend future income.

Gold for accepted queued jobs is reserved once under the existing world currency authority. Material funding, cost versions, start-time duration snapshots and job IDs are permanent estate state. Removing an unstarted job retains its committed materials as building credit; exact handling of unspent Gold reservations across world resets requires a separate authoritative refund contract. Started jobs remain committed. A completed level keeps its benefit while upgrading.

**Realm rollover does not cancel or restart estate work.** Fully funded queues and running construction continue across the boundary with their original deadlines and receipts. Production settles for elapsed time under the saved historical rates; the old and new world contexts must not both credit it. Keep queues, deposits and stock in account-owned estate state. No deadline-based ban on late-season building deposits or construction applies.

Snapshots and server transactions must prevent a building from completing twice or receiving a new timer on every rollover. Manual reset, reconnect and delayed callbacks follow the same once-only contract. A later Builders' Yard upgrade affects only newly starting jobs, not deadlines already accepted.

## 7. Permanent equipment-building milestones

Each officer building researches existing tiers: **Level 1 Common; 25 Uncommon; 50 Rare; 75 Epic; 100 Legendary**. Intermediate levels fill visible progress toward the next tier; they do not introduce separate Gold/troop/wall/march multipliers. Actual combat or production power still comes from owned, upgraded and equipped Gear under Section 11.

Future promotion above an officer's highest earned entitlement checks that officer building's milestone. Viewing, equipping, unequipping and upgrading levels **within an already earned rarity** remain available regardless of the estate's current season. Migration records at least the highest tier represented by existing owned/equipped items and authoritative progression/receipts, and never demotes items. Inventory normalization, duplicate rules, two-to-one consumption, exact fixed Gold fees, existing caps and idempotent upgrade receipts remain unchanged. No material is added to the item-crafting bill by this draft.

The exact entitlement migration must be approved and tested before gates are enforced. An offline user, old client, unopened existing chest or delayed request must not unexpectedly lose earned access. A Legendary unlock is permission to progress, not a free Legendary loadout.

**Unresolved reward bottleneck:** the existing copy rule requires 1,048,576 Common Level 1 equivalents for one Legendary Level 1 piece. This estate design does not remove that rule. To make later rarity unlocks feel useful, separately review legitimate targeted-copy or tier-matched acquisition sources. Higher-tier Guild drops would change existing Gear acquisition policy and require an explicit new decision; none are enabled here. Do not call the complete gear economy balanced on the strength of construction timing alone.

## 8. Alehouse, champions, meals and the Guild Master

This is a new **champion expedition** system, distinct from Daily Missions, Hero progression and their Quest ledger. Champions provide estate expedition utility; no new world-army combat bonuses are proposed. All roster ownership, quality, levels/XP, guild and Alehouse benefits, recovery deadlines, active expeditions and earned/unclaimed rewards persist with the estate. Food and other materials persist as well. A rollover neither refreshes a champion nor restarts recovery or a quest; elapsed completion/rewards settle once.

Alehouse offers three recruits with a free refresh once per UTC day. No reroll spend or Crown-only champion is proposed. Keep chosen offers stable across reopening and devices. Proposed recruit qualities unlock at Alehouse 1/25/50/75/100: Common/Uncommon/Rare/Epic/Legendary **champion quality**, separate from item rarity ownership. Charge respectively **0.20 / 0.50 / 1 / 2 / 4 hours of raw Main City Gold**. Never spend before the recruit, roster capacity and quote are validated. The first Common recruit can be a one-time onboarding grant if separately approved; it is not an assumed funding source in the balance audit.

Guild roster capacity is `6 + floor(18 × (L−1)/99)`, ending at 24. Champion training level cannot exceed Guild level. Party size is two initially, three at Guild 25, four at Guild 50. Concurrent expeditions are one initially, two at 25, three at 60. The final roster supports twelve active and twelve resting champions rather than forcing recovery purchases. Upgrading never removes a champion or interrupts a party.

Proposed recruit starting level is `min(Guild level, 1 + floor((Alehouse level−1)/2))`, ending at 50 at Alehouse 100. This gives upgraded recruitment a useful head start while retaining quest training. Each daily refresh guarantees one offer at the highest unlocked quality, one at the preceding quality when available, and one Common offer; there is no hidden rarity reroll requirement. Each champion has one initial expedition stat: `power = floor(champion level × (1 + 0.25 × qualityIndex))`, with qualityIndex 0–4. Proposed minimum total party power for Common/Uncommon/Rare/Epic/Legendary quests is **2 / 60 / 160 / 320 / 600**, with minimum party sizes **2 / 2 / 3 / 4 / 4**. Three or four stronger recruits can meet higher requirements sooner; four Rare Level 100 champions can meet the final threshold, so Legendary recruitment is helpful rather than mandatory.

XP to advance from champion level L is `20 + 4L`. Every participating champion earns `20 × durationHours × questTierMultiplier` XP, with multipliers **1 / 3 / 6 / 10 / 16**; XP is not divided by party size. Level ups retain excess XP, stop at the current Guild training ceiling and never exceed 100. Retain ceiling-blocked XP until a Guild upgrade rather than silently discard it. These are champion-only values, unrelated to existing Hero XP, and remain unvalidated quest-pacing proposals. With permanent champions, the curve needs a multi-season progression review: its Level 1–100 total is only 21,780 XP, equivalent to 68.06 quest-hours at the highest proposed rate if a party can carry a new recruit. That is a pacing concern, not a promised completion time; high-level recruit offers also shorten training. Validate veteran parties, new recruits and blocked XP before accepting any XP curve. A suitable party completes for the quoted reward; an unsuitable party is blocked before Food is spent. There is no power-dependent random failure or unbounded over-power reward multiplier.

Quest tiers unlock at proposed Guild 1/25/50/75/100 and the corresponding Alehouse recruit-quality milestone. Both buildings persist, so these gates remain earned. Show suitability, costs, duration and rewards without a seasonal expiry. A champion belongs to only one expedition and cannot launch while recovering. No champion death, gear destruction or unrevealed random failure is proposed. A suitable party completes for its quote; quality/traits and XP pacing still need review.

Offer **2-, 4- and 8-hour** expeditions. Quote sustainable net output from the actual completed, persistent supply chain at launch. A shared reward budget of 0.5/1.2/2.4 production hours is allocated across at most two selected non-food materials. Use the limiting completed chain level and require real sources/processors. Retain the quote across a season change; factories are no longer rebuilt each month. Food/Grain do not drop from their own quest loop, and no world troops, Crowns or higher-rarity Gear drops are introduced by this draft.

Base Food fee equals `ceil(0.15 × durationHours × quoted net Food/hour)`; Rare and higher also require `ceil(0.05 × durationHours × quoted net Tools/hour)`. With no Food source, direct the player to Farmstead/Windmill; paid deliveries are never a prerequisite. Quote all reserves and rewards once, bind them to the launched expedition and return/claim exactly once. The arithmetic audit currently excludes expeditions, so these yields and sinks need a second simulated/playtested pass before acceptance.

Returned rewards stay in a bounded persistent pending ledger until they fit; allow partial claims with receipts and preserve the remainder. The six-parcel limit blocks new launches before charging when full. Completion frees the quest slot and begins recovery independently of claiming. Material parcels do not expire at reset, and quests may finish across a season boundary. Credit XP and materials once, even when a reset, retry and completion callback overlap.

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

Crowns and delivered estate materials persist. Show price, exact quantities, resulting balances, free capacity and remaining shared UTC-day allowance before purchase. Remove the former final-24-hours purchase ban and seasonal-expiry notice. Delivery receipts, purchased materials and the shared daily allowance remain valid across rollover; a season change must not grant another day's allowance. Quotes/refunds still require server validation.

## 10. Counters and building UI

The top ledger is centered below the existing estate header, with **Gold, Crowns, Timber, Stone, Iron Ore, Grain, Planks, Iron, Tools and Food**. It uses warm parchment, fine engraved-style pictograms, small names and tabular amounts. On small screens it forms two centered rows rather than covering the map or introducing a sideways scrolling wallet. The map refits below it, retaining its 1448 × 1086 coordinate space.

Compact K/M/B/T text is only presentation. Hover/keyboard focus exposes the exact whole quantity and unavailable/preview status; spending always uses authoritative exact quantities. Unknown and zero differ. The local art/real-UI fixtures clearly label sample balances and restore them through equipment round trips. The production renderer reads actual Gold and loaded Crown snapshots, observes existing HUD updates and disconnects the observer on disposal; it adds no resource polling or ambient animation loop.

When gameplay exists, activating a counter opens a resource ledger showing owned/reserved/available amounts, capacity, gross production, factory consumption, net production, time to full, source/processor links and current blocking reason. This ledger interaction is **planned**, not implemented by the display-only counter update. Resource updates patch amounts rather than remounting the estate or moving its camera.

Construction panels show current/next benefits, prerequisites, the full material bill, deposited/remaining amounts, Gold needed to start, queue occupancy and timer. Offer explicit Deposit Materials and Start Upgrade actions, with permanent-progress messaging and no seasonal-expiry warning. Four officer sites retain direct equipment entry; place building research within their window or directory detail. This is a future UI implementation; current counters remain display-only.

## 11. Server authority and implementation sequence

No production commands or collections implementing this estate economy exist in the branch. Required future contracts:

1. Account-owned estate state must contain all twenty building states/levels, material stocks and fractional settlement, processor preferences, funded projects/queues, champions, recovery/expeditions, rewards, catalog/recruitment state and durable receipts. Do not recreate it from defaults when a realm generation changes. Existing world Gold stays under its own realm authority; the estate Gold counter reads that wallet.
2. Validate owner, active realm context where relevant, schema/cost version, expected revision, resource availability, capacity and request ID before mutation. An operation that both pays realm Gold and starts a permanent estate job must atomically validate both scopes. Stale clients cannot spend current-world Gold or duplicate account estate credit.
3. Deposits move available materials into a versioned target project exactly once. A retry returns its receipt. Keep partial/full funding, quotes and job completion receipts through reset and balance migrations; no silent repricing of funded projects or double material charge.
4. Lazy production settlement and durable scheduled work must account for changing levels/rates, stock/input caps and offline time. A single effective deadline/settlement cursor survives rollover; old and new callbacks cannot both credit work. Subscribe/coalesce snapshots rather than add a per-player polling loop.
5. Construction, cancellation, quest launch/claim, recruitment, deposits and Crown deliveries share authoritative inventory constraints. Production can continue while queues run. Treat irreversible deposited credit separately from refundable unspent Gold reservations; decide exact cross-generation Gold refunds before release.
6. Migration preserves estate progress, current Gear and grandfathered rarity access. Extend reset tests to full stocks, partial deposits, queued/active jobs, quests spanning a boundary, pending rewards, XP, recovery, offer identity and shared daily shop allowance. Initial six-completed/fourteen-unbuilt migration runs once, never once per season.

Suggested delivery stages remain A counters/draft; B persistent materials/storage, Gold-only builds and deposits; C production, all level bills/timers and permanent job settlement; D officer rarity entitlements with safe existing-item migration; E persistent champions/quests/meals; F Crown catalogs after shared-cap/refund tests. Merging stage A does not implement later stages.

## 12. Balance review and acceptance before gameplay release

The revised audit checks all twenty permanent registry entries, acyclic recipes/prerequisites, all 2,000 material/Gold rows, monotonic costs/timers, exact band sums, storage/recipe conservation, partial-deposit invariants and persistent rollover examples. It replaces the former seasonal-rebuilding simulation and all-twenty completion dates. [BALANCE_REVIEW.md](BALANCE_REVIEW.md) records explicit assumptions and focused timing results.

At the fixed supporting-production references, the ideal focused model reaches Level 25 around day 30.26, Level 50 around day 90.65, Level 75 around day 181 and Level 100 around day 301–302. These totals include continued gathering during construction, with 50% of each material allocated to one track, an available slot, automatic deposits and affordable Gold. They exclude paying for the supporting buildings. The values are calibration evidence, not a promise for a fresh account or for all twenty buildings together.

The previous draft Gold fees remain separate from the material redesign. At constant Main City income of 285/hour, all twenty buildings' Level 2–100 Gold fees total 325,403, about 47.57 income-days before first builds, recruitment, Gear or world spending. It is a funding lower bound, not extra days to add to a ten-season material path. Realm Gold resets and fluctuating income make actual affordability a separate planning constraint.

Before accepting gameplay balance, simulate full accounts allocating one shared budget and limited construction slots among all twenty sites. Include the Gold-only bootstrap, Hall progression, producers/storage with uneven levels, sparse visits, missed time, saved materials, completed factories, deposits, three quest slots, meals and paid/free supply cohorts. Check how strong permanent estates affect a fresh realm without adding unapproved world bonuses. Measure time to useful early upgrades, sustained progress, queue stalls, stock waste and meaningful milestone rewards.

Open numerical decisions include reference production, material bills, the proposed timer allocation, Hall+5 gating, deposit commitment/refunds, cross-generation Gold reservations, Crown prices/caps, champion XP/traits, quest returns and Gear acquisition. Full estate persistence and each building's 1/3/6/10-season resource direction at 50% investment are confirmed. The timer draft currently interprets those milestones as approximate total collection-plus-construction targets. A complete account simulation and player testing are still needed; this is not live gameplay.
