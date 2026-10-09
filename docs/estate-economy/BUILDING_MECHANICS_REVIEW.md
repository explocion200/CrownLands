# Inner Castle building and mechanics review

Reviewed October 8, 2026 on `codex/estate-building-mechanics-polish`, against the approved Master Specification, deployed estate rules and current client. This review and its service-screen fixes are **LIVE — WEB** from [PR #493](https://github.com/explocion200/CrownLands/pull/493), verified at build `50a795d98beb55c276f2c1c55ff02778bb6db4a4`, Netlify deploy `6ac820fc75ca410008642d8b`, published October 8 at `23:05:43.010 UTC`. All three required GitHub checks, 55 staged and 165 public-file comparisons, exact staged desktop/landscape service interactions and public startup passed; [Master Specification FM-2](../CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md#fm-2-current-production-snapshot) records the full evidence. They preserve the approved economy, artwork, fixed positions and map controls.

## What every building contributes

**October 9 follow-up — LIVE — WEB**, verified at build `101d435ef095abcb392631dca1d28f908839337f` from [PR #506](https://github.com/explocion200/CrownLands/pull/506): Material processors now use player-started quantities rather than automatic recipe consumption. The economy guide and Master Specification record the 1-to-Max controls, fixed paid batches and unchanged capacity rates. The prior release evidence above remains historical; FM-2 records matching backend/Focused web publication, exact staged production checks and remaining signed-in/device limits.

| Building | Function | Reward for leveling |
|---|---|---|
| Great Hall | Sets every other building’s completed-level ceiling | Every level makes that level available elsewhere; the Hall has no dependency on other building levels |
| Treasury | Master of Coin Gear and chosen-family commissions | Shorter commissions every level; existing rarity tiers at 1 / 25 / 50 / 75 / 100 |
| Barracks | War Captain Gear and commissions | Same rarity milestones and gradually shorter commissions |
| Gatehouse | Defensive Commander Gear and commissions | Same rarity milestones and gradually shorter commissions; separate from the walls’ map artwork and estate material economy |
| Royal Stables | Cavalry Master Gear and commissions | Same rarity milestones and gradually shorter commissions |
| Alehouse | Three stable daily recruitment offers; recovery and preparation meals | Recovery improves each level, recruit starting level improves in steps, quality at rarity milestones; meals at 10 / 25 / 50 |
| Guild Master | Permanent champion bench, active roster, parties, expeditions and reward claims | Raises champion training ceiling each level; active roster grows from 6 to 24, party size at 25 / 50 and concurrent expeditions at 25 / 60 |
| Forester’s Lodge | Produces Timber | More Timber capacity each level; supplies construction, commissions, Sawmill and Smithy |
| Quarry | Produces Stone | More Stone capacity each level for construction and commissions |
| Mine | Produces Iron Ore | More ore capacity each level; feeds the Smithy |
| Farmstead | Produces Grain | More Grain capacity each level; feeds the Windmill and themed construction costs |
| Sawmill | Chosen batches: 2 Timber → 1 Plank | Faster new batches each level; supports construction, commissions and Tools |
| Smithy | Chosen batches: 3 Iron Ore + 1 Timber → 1 Iron | Faster new batches each level; supports construction, commissions and Tools |
| Workshop | Chosen batches: 1 Plank + 1 Iron → 1 Tool | Faster new batches each level for advanced construction and commissions |
| Windmill | Chosen batches: 2 Grain → 1 Food | Faster new batches each level for quests, meals and themed construction |
| Storehouse | Non-food stock capacity, separately for each material | More free storage every level, without truncating existing stock |
| Granary | Grain and Food capacity, separately | More free storage every level |
| Builders’ Yard | Builder availability and time reduction for new contracts | Gradually shorter new contracts; second builder at 10, third at 50; accepted timers stay fixed |
| Wagon Yard | Additional non-food storage and optional Crown supplies | More free storage every level; Planks/Iron packs at 25, Tools at 50; half-hour packs at 34 and one-hour packs at 100 |
| Market | Additional Grain/Food storage and optional Crown supplies | More free storage every level; same pack-size progression; shares the Wagon Yard’s daily allowance |

Gross resource/processing capacity increases by 16% of its Level 1 rate per completed level. Raw gathering continues up to storage. Processing requires an explicit quantity and Start production; Max respects ingredients, shared input reserves and space reserved for the output. New building levels shorten new batches; accepted batches keep their timers. Storage expansions and service milestones are not world-city production or direct combat bonuses. Officer equipment retains its existing effects and two-copy upgrade rules.

## Construction and the economy loop

The numbered construction steps retain the October 8 review context. October 9 replaced new material deposits with direct Build/Upgrade payment; use [the economy guide](README.md#build-and-upgrade) for current construction rules and the pending manual-production follow-up.

1. The six original buildings start at Level 1; the other fourteen need a first Gold-only build. Build raw-material sources, storage and processing chains to begin permanent growth.
2. Select a plot, then use its external Upgrade button. Review the next level’s required, deposited, remaining and available materials, seasonal Gold, timer and current/next benefit.
3. Deposit chosen whole units into that exact building and next target. Credit cannot be refunded or transferred, and it survives seasons. A deposit never starts work.
4. When the full material bill, Gold, prerequisites and a builder are available, review and explicitly start one level. Gold and credit are consumed once. New upgrades cannot be queued; already paid legacy contracts retain their rights and terms.
5. Existing completed benefits remain active during construction. A server-confirmed completion changes the level and production; a locally expired countdown cannot grant a level.
6. Turn surplus materials into officer commissions or expedition preparation. Recruit permanent champions at the Alehouse, manage them at the Guild Master and claim rewards into available storage; excess parcel rewards remain claimable.

Every building, loose material, fractional stock, deposit, ongoing estate timer and acquired champion persists. World Gold remains seasonal. Market and Wagon Yard together allow one production-hour supply pack budget per UTC day; quests share their existing 2.4 resource-hour allowance. These allowances do not refresh on a season restart.

## Concrete presentation fixes

- Correct obsolete queue, material-output and Gear-set descriptions. Service screens show actual building roles and current benefits.
- Show production status and ingredient recipes, individual storage totals and direct material-ledger access. Visiting an unbuilt source through a ledger cannot expose its service actions.
- Explain rarity, meal, quest and supply unlocks. Disable locked tiers, meals, delivery sizes/materials, exhausted daily supplies, unfinished commission claims and unavailable champion transfers.
- Show champion quality/power, active-roster occupancy, expedition capacity and selected party requirements. Bench buttons are separate from selection labels, so a transfer control does not toggle a party checkbox.
- Preserve inputs, party selections, accepted consent, scroll position and the exact keyboard control across ordinary refreshes. Preserve service drafts when returning from review; discard them after a successful commit. Newly unavailable champions are deselected, and numeric drafts respect refreshed deposit limits.
- Name the exact building and next level in permanent deposit confirmation. Refresh upgrade requirements on Back from review; show a useful prerequisite failure instead of an endless loading message.
- Refresh at a UTC-day boundary for daily services even when no construction or production boundary is pending. Reuse the existing deadline scheduler and hidden-scene cleanup; no new polling loop.
- Allow deadline settlement while an officer’s commission window is open over Gear, keeping the map suspended. Closing restores focus to the current commission opener even if a Gear refresh replaced its element, and stops hidden-scene deadlines again.

## Validation and remaining review limits

The existing economy-rule tests pass for all 2,000 level rows, continuous production, capacity/reserves, long absences, manual starts and legacy work, commissions, quests, champion XP, shared supplies and retry clocks. The reward and arithmetic reviews also pass; none proves player satisfaction.

Expanded runtime browser checks cover all twenty plots, deposits and retry, exact-target consent, construction timers, Gear returns, locked/unlocked services, party power, busy champions, storage ledgers, recipes, field/focus preservation, commission readiness, unbuilt service guards and the UTC-day refresh. Checks run at 1440×900, 844×390 and 568×320, alongside estate registry/geometry and production-build validation. Required GitHub checks establish PR readiness separately.

The 1 / 3 / 6 / 10 reference-season budgets apply to each building individually at 50% of developed supporting production. They are not a ten-season promise for all twenty buildings sharing an account. The updated [shared-account simulation](REWARD_REVIEW.md) explicitly starts manual batches at visits and reaches the full Level 100 estate in roughly 2,121–2,356 simulated days across its visit/service cohorts; Gold affordability and the documented cohort assumptions limit that estimate. Quest rewards help modestly, and commissioning competes for the same materials. No recipe rates, building prices or construction timers changed. Human long-term pacing, authenticated production play and physical-device checks remain necessary before claiming those experiences are verified.
