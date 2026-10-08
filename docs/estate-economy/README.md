# Permanent Inner Castle economy

**Approved October 8, 2026; implemented on codex/estate-economy-readiness, pending release.** Approval includes the repair plan’s new Gear acquisition exception, Hall gate, useful storage rewards, champion/quest revisions and nonrefundable funded contracts. The [Master Specification](../CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md) is authoritative. Existing deployed presentation remains separate from this unreleased gameplay implementation.

All twenty buildings and eight material stocks persist across seasons, along with fractional production, processor preferences, deposits, paid contracts, queues, champions, XP, recovery, expeditions, pending rewards and receipts. World Gold remains seasonal. One account has one estate; capturing cities does not duplicate estate factories. Materials add no direct army, wall or world production bonus and are not raid loot.

## Buildings and progression

All buildings cap at Level 100. The six original structures are granted at Level 1 once; fourteen surveyed plots start unbuilt. First construction is Gold-only. Every later upgrade uses gathered materials and Gold. Other buildings may fund targets only at or below the **completed Great Hall level**; the Hall has no building-level dependency. Completed benefits remain active throughout upgrades.

| Building | Initial state or construction | Additional first-build prerequisites | Level 100 service |
|---|---|---|---|
| Great Hall | Starter Level 1 | None | Other buildings may reach Level 100 |
| Treasury | Starter Level 1 | Great Hall 1 | legendary commissions · 72.0 hours |
| Barracks | Starter Level 1 | Great Hall 1 | legendary commissions · 72.0 hours |
| Gatehouse | Starter Level 1 | Great Hall 1 | legendary commissions · 72.0 hours |
| Royal Stables | Starter Level 1 | Great Hall 1 | legendary commissions · 72.0 hours |
| Alehouse | Starter Level 1 | Great Hall 1 | legendary recruits · 35.00% faster recovery |
| Guild Master | 150 Gold / 8 min | Alehouse | Champion Level 100 · 24 active roster |
| Forester’s Lodge | 75 Gold / 4 min | Great Hall 1 | 1684.00 timber/hour capacity |
| Quarry | 75 Gold / 4 min | Great Hall 1 | 1347.20 stone/hour capacity |
| Mine | 90 Gold / 5 min | Great Hall 1 | 1010.40 ore/hour capacity |
| Farmstead | 75 Gold / 4 min | Great Hall 1 | 1347.20 grain/hour capacity |
| Storehouse | 75 Gold / 5 min | Great Hall 1 | 180,200 capacity per building material |
| Granary | 75 Gold / 5 min | Great Hall 1 | 155,400 capacity per food stock |
| Sawmill | 100 Gold / 6 min | Forester’s Lodge | 336.80 planks/hour capacity |
| Smithy | 110 Gold / 6 min | Mine, Forester’s Lodge | 269.44 iron/hour capacity |
| Workshop | 120 Gold / 6 min | Sawmill, Smithy | 67.36 tools/hour capacity |
| Windmill | 90 Gold / 6 min | Farmstead | 404.16 food/hour capacity |
| Builders’ Yard | 100 Gold / 6 min | Great Hall 1 | 3 builders · 30.00% shorter new contracts |
| Wagon Yard | 100 Gold / 6 min | Great Hall 1 | 81,500 capacity per building material |
| Market | 100 Gold / 6 min | Great Hall 1 | 61,200 capacity per food stock |

Fourteen first builds total 1,335 Gold. With 100 starting Gold and 285 raw Gold/hour, cash alone takes about 4.33 hours, before construction scheduling and other world spending. Every one of the 1,980 later upgrades changes production, storage, training, recovery, construction speed, commission speed or another building’s permitted level. Actual usefulness depends on the player’s supply chain and priorities.

## Materials and production

| Material | Producer | Level 1 gross/hour | Inputs per output |
|---|---|---:|---|
| Timber | Forester’s Lodge | 100 | None |
| Stone | Quarry | 80 | None |
| Iron Ore | Mine | 60 | None |
| Grain | Farmstead | 80 | None |
| Planks | Sawmill | 20 | 2 Timber |
| Iron | Smithy | 16 | 3 Ore + 1 Timber |
| Tools | Workshop | 4 | 1 Plank + 1 Iron |
| Food | Windmill | 24 | 2 Grain |

Gross production multiplies by 1 + 0.16 × (L−1): 1 / 4.84 / 8.84 / 12.84 / 16.84 at Levels 1/25/50/75/100. At equal Level 1 with every processor operating, net/hour is 44 Timber, 80 Stone, 12 Ore, 32 Grain, 16 Planks, 12 Iron, 4 Tools and 24 Food.

Factories have On/Pause and shared input-stock reserves. Production stops at missing input, reserve or full output boundaries without discarding consumed inputs. Fractional quantities remain saved; only whole units are spendable. Offline settlement advances chronologically through those boundaries and paid construction deadlines, switching to new rates only when levels complete. There is no offline tax, daily collection quota or paid collection extension.

Each stock begins with 500 capacity. Storehouse replaces that base with 3,200 + 170L + 16L² per non-food material; Granary with 2,400 + 130L + 14L² per Grain/Food. Wagon Yard separately adds 15L + 8L² to every non-food stock; Market adds 12L + 6L² to Grain/Food. These bonuses require no Crowns. Existing over-capacity stocks are retained; further production waits for space.

## Exact upgrade prices and timers

[LEVEL_TABLES.md](LEVEL_TABLES.md) contains all 2,000 level rows and eighty band totals. Runtime tests independently compare every material amount, Gold quote at the reference rate and base minute against those tables. The reviewed arithmetic inputs are [draft-config.json](draft-config.json); executable server inputs are functions/estate-config.json, version estate-economy-1.

| Target band | Added reference seasons | Cumulative | Reference producer level | Total base construction days |
|---|---:|---:|---:|---:|
| 2–25 | 1 | 1 | 13 | 6 |
| 26–50 | 2 | 3 | 38 | 12 |
| 51–75 | 3 | 6 | 63 | 18 |
| 76–100 | 4 | 10 | 88 | 24 |

A reference season is 30 days. Each individual building’s bill is calibrated to 50% of sustainable net material output from already-paid supporting infrastructure. These are resource equivalents, not calendar locks or a ten-season promise for all twenty buildings together. Support upgrades, Hall levels, other projects and optional services share the same materials.

For each material, B = floor(reference net/hour × 720 × 0.50). Its whole-band bill is ceil(B × added seasons × theme weight / highest active theme weight). First-band shares use ((target−1)/24)² on eligible levels, reserve one unit per level, floor weighted shares, and allocate leftovers to the final levels. Later bands rise linearly by 10%. Every material bill and timer remains nondecreasing.

Timber/Stone and themed Grain/Food begin at target 2, Planks at 11, Iron at 26 and Tools at 51. Ore feeds processing. The first upgrade’s base timer is nine minutes. First-band timer weights are max(0.02, min(1, (target−2)/8)), reserving one minute per level; later bands retain their gentle rise. Builders’ Yard reduces **newly funded** timers by up to 30%; accepted durations never change afterward. Gathering continues during construction.

Gold for target L≥2 is ceil(G × (0.05 + 0.003L + 0.00007L²) × building factor × goldFactor), with G equal to current raw Main City Gold/hour, minimum 285. Gear/skill/timed production bonuses and additional cities do not inflate G. goldFactor remains 2 for the four officers, Alehouse and Guild, 1 for other buildings. Level 1 uses the fixed listed fee. Item Gear fees remain separate.

## Deposits and funded queues

A material deposit is credit for one building’s next level and price version. Quote required/deposited/remaining amounts, accept positive whole units only, and reject overpayment. Credit can exceed ordinary storage capacity. There is one partial next-level project per building; a building with already funded work cannot open another partial deposit project.

Fully funding work purchases a permanent contract. The review shows each target, all additional materials, credited deposits, Gold and duration. The player explicitly accepts that payments are **nonrefundable and nontransferable**. Gold and available materials leave their wallets atomically once; existing deposits count once. Started work cannot be cancelled. Unstarted work can be paused and resumed without a second payment. A reset cannot convert that credit back into seasonal Gold.

One builder is available initially, two at Builders’ Yard 10, three at 50. At most thirty contracts are retained, including paused work; at most five consecutive levels per building are funded, with one running at a time. Players may review an affordable batch of one to five levels. Queues spend no future income and continue offline/across seasons at their snapshotted prices and durations. Matching old-world retries return their original receipt; new old-world spending fails. Each completion grants exactly one next level.

## Gear buildings and commissions

Treasury, Barracks, Gatehouse and Royal Stables unlock Common/Uncommon/Rare/Epic/Legendary at completed Levels 1/25/50/75/100. Their original click-to-Gear screens remain available; the building seal opens upgrades and commissions. Back, X, Escape and equipment round trips retain the estate camera and selection.

Each officer can commission one chosen existing family at a time. Output is one Level 1 item at that building’s unlocked rarity. Duration is 168 − 96 × (L−1)/99 hours, from seven days to three; every level improves this service. No reroll, paid acceleration or free complete set is granted. Existing two-copy item upgrades/promotions and fixed Gold prices remain unchanged.

Commission material shares follow the family’s existing category:

| Category | Timber | Stone | Planks | Iron | Tools |
|---|---:|---:|---:|---:|---:|
| Armor | 30% | 35% | 20% | 10% | 5% |
| Weapon or Treasury tool | 45% | 10% | 15% | 25% | 5% |
| Necklace | 15% | 50% | 10% | 20% | 5% |

Planks enter at officer 11, Iron at 26, Tools at 51; earlier shares redistribute among unlocked materials. Each required material needs its completed source/processor chain. Quantity = floor(4 × fixed net reference output at the completed officer level × normalized share). Whole-unit rounding keeps the bill just below four normalized material hours. Pausing a factory does not lower its price. Recipe, family, output, rarity, price version and duration are saved on acceptance. Full Gear bags retain the same completed item until it can be claimed.

Promotion access preserves the highest earned tier per officer from owned items, retained upgrade receipts and saved estate entitlements. Unopened Uncommon chests, prior chest-opening receipts and authoritative pending/claimed seasonal Uncommon chest grants preserve at least Uncommon access for every potential officer. New commissions still follow completed building milestones. Viewing/equipping and upgrades within an earned rarity remain available; future schemas fail without destructive normalization. New promotions above earned access require the matching building milestone.

## Champions, recovery and expeditions

Champion ownership is permanent with an unlimited paginated bench. The active roster limit is 6 + floor(18 × (GuildL−1)/99), reaching 24. Idle champions may move between roster and bench free; active quests/recovery retain their identities and deadlines. A full roster sends recruits to the bench. No dismissal, seasonal deletion, death or Gold resale exists.

The Alehouse provides three stable offers per UTC day: highest unlocked quality, previous quality (or Common), and Common. Quality milestones are 1/25/50/75/100. Gold fees are 0.20/0.50/1/2/4 raw Main City hours. Starting level is min(GuildL, 1 + floor((AlehouseL−1)/10)), maximum 10. Offers and claims survive reopening, devices and resets. No free first champion or paid reroll is assumed.

Champion power is floor(level × (1 + 0.25 × quality index)). Guild party size is 2 initially, 3 at 25, 4 at 50; concurrent parties 1 initially, 2 at 25, 3 at 60. Quest tiers require Guild and Alehouse 1/25/50/75/100, party sizes 2/2/3/4/4 and power 2/60/160/320/600.

Choose 2/4/8 hours and one or two non-food material rewards. The budget is divided between chosen resources, using sustainable reference output at each completed chain’s limiting level. Tier reward-hours per elapsed hour are 0.009/0.0135/0.018/0.0225/0.027. Food costs ceil(0.01 × duration × quoted net Food/hour); there is **no additional Tool fee**. Reject zero-output choices before charging and explain that a longer journey or another material is needed. Higher tiers never lower rounded returns at equal duration/supply.

All parties/materials/meals share 2.4 resource-hours per UTC day. Reserve at launch and preserve the original day’s quote through resets. Reward parcels persist; at most six pending parcels plus active quests are allowed. Completion awards quoted XP once, frees the expedition slot and begins recovery independently of claiming. Claims fill available storage and retain the remainder.

XP to advance from L is 4L. Base XP is 20/hour with tier multipliers 1/1.1/1.2/1.3/1.4. Guild level caps training; bank at most one next level and preview exact credit before launch. Previously earned excess XP is preserved. Level 100 earns no new XP. L1→100 requires 19,800 XP, or 707.14 fastest eligible quest-hours before Guild/party/recovery limits.

Base recovery is 30/60/120 minutes for 2/4/8-hour quests. Alehouse reduces it smoothly to 35% at 100; minimum 10 minutes. Optional meals: Trail bread at 10 costs 0.05 Food-hours for +5% reward; Hearty stew at 25 costs 0.12 for +8% reward/−5% recovery; Guild feast at 50 costs 0.25 for +12%/−10%. One meal, maximum 45% combined recovery reduction. Show actual rounded payouts; reject reward-only bread if it changes none. Meals cannot repay themselves with Food or Grain loot.

## Optional Crown supplies

Wagon Yard offers non-food materials; Market offers Grain/Food. Require completed sources/processors. Wagon adds Planks/Iron at 25 and Tools at 50. Per-order size grows from 0.25 hour at 1 to 1 hour at 100: 0.25 + 0.75×(L−1)/99. Offer quarter/half/one-hour presets only when permitted.

Both stores share **one production-hour equivalent per account per UTC day**. Price is 20 Crowns/hour, rounded up. Use floor(reference net output at the completed chain’s limiting level × purchased hours). Pausing factories cannot improve a quote. Reject zero or overflowing orders before payment. Wallet, material credit and usage update in one transaction, with persistent receipts. Resetting a realm never refills the allowance. Supplies buy no builder slots, champions, rarity gates or timer skips.

## Runtime, UI and release gates

Server authority lives in functions/estate-economy.js, estate-services.js and estate-service.js. Account state is players/{uid}/estate/state; paginated champions, quotes, action receipts and contracts use separate estate subcollections. Firestore rules permit owner reads and no client writes. The four callable routes are getEstateState, getEstateQuote, commitEstateAction and getEstateChampions. Current realm/session checks apply before new actions; matching durable replay is checked before rejecting an old realm. Five-minute quotes bind revision and realm and can be consumed only once.

The map retains its approved 1448×1086 artwork and positions. Resources patch in place; a resource opens its ledger. Building panels show current/next benefits, prices, deposits, builder occupancy and server deadlines. Construction artwork changes within the fixed footprint. New UI code/styles load only when opening the online estate. Completion checks/listeners are disposed or paused when the map closes; opening equipment retains camera/selection. The original static development fixtures remain isolated from player state.

Run tools/test-estate-economy.js, tools/validate-estate-economy-draft.js, tools/validate-estate-readiness-proposal.js and tools/validate-estate-reward-review.js. See [REWARD_REVIEW.md](REWARD_REVIEW.md) for six shared-account cohorts including queues, uneven infrastructure, one/three daily visits, meals, quests, commissions and optional supplies. The estate emulator covers real Gold/Crown transactions, concurrency, reset persistence, migration and denied client writes; browser tests cover desktop/landscape and Gear returns. A coordinated release must publish the matching backend, rules and client, verify its manifest and smoke-test the named channel. No production data is changed by local/emulator tests. Physical-device pacing and touch feel still require manual playtesting.
