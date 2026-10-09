# Estate economy repair — approval and implementation

**Owner approved October 8, 2026. Implementation is pending PR validation and coordinated release. Nothing in this document establishes a production deployment.** The approved contract is recorded in the Master Specification; [README.md](README.md) now describes the implemented rules. [readiness-proposal.json](readiness-proposal.json) retains the reviewed parameter set, with explicit approval status.

## Accepted repairs

**October 8 follow-up:** the owner replaced new funded batches/queues with external map upgrade controls, permanent deposits and one explicitly started next level after full deposits, Gold and builder availability. See the current [economy guide](README.md) and Master Specification. This repair record retains the original paid-contract design as history; already purchased work keeps its rights. The regenerated shared-account review now models manual starts and idle builders between visits.

**October 9 follow-up — LIVE — WEB:** the owner removed new material deposits. PR #502's matching backend/web release is verified at build `f7c063eb33c43c583debd334bbc036832955a5cc`; FM-2 records deployment, validation and channel/manual limits. The external requirements panel shows resources, construction time and next-level benefits, with Build/Upgrade and Cancel. Explicit start spends Gold and remaining loose materials together; saved older credit/receipts and funded jobs remain honored. Costs, rewards, builder slots and no-queue rules are unchanged. This historical repair record does not authorize creating new deposits; use the current [economy guide](README.md) and Master Specification.

| Finding | Approved repair | Implementation |
|---|---|---|
| First upgrade required days of stock | Squared first-band material allocation; nine-minute Level 2 timer | Exact band totals retained and all 2,000 runtime rows independently compared |
| Empty officer levels and impractical high-tier acquisition | One selected-family, tier-matched commission per officer; seven-day to three-day duration | Material-funded orders, inventory-full retention and once-only claims |
| Empty paid-shop levels | Wagon capacity 15L + 8L² per non-food stock; Market 12L + 6L² per food stock | Free capacity at every completed level, without Crown spending |
| Hall 96–100 had no purpose | Other targets cannot exceed completed Hall level | Server-checked quotes and funding; no circular Hall prerequisite |
| Higher quest tiers had worse net rewards | Tier yield 0.009/0.0135/0.018/0.0225/0.027 per elapsed hour; no Rare+ Tool fee | Whole-unit quotations and zero-output rejection |
| Excessive quest resource injection | Shared 2.4 resource-hours/account/UTC day including meals | Reserve at launch, retain quoted day/rewards through resets |
| Champions leveled too quickly | 4L XP costs, 20 XP/hour, multipliers 1/1.1/1.2/1.3/1.4; recruits start at most 10 | Guild ceiling, one-level bank, exact retained-XP preview and permanent prior XP |
| Full roster prevented useful recruiting | Unlimited owned bench, bounded active roster | Paginated champion records; idle transfers; no ownership deletion |
| Gold funding across resets was ambiguous | Permanent nonrefundable job contracts | Atomic Gold/material debit; pause/resume without refunds or second payment |
| No recurring endgame material purpose | Four normalized material hours per commission | Published fixed category recipes, saved output/price/duration, original Gear fees unchanged |

The higher-rarity commission source is an explicitly approved exception to the prior acquisition policy. It does not remove the two-matching-copy item rule, reduce fixed item Gold fees or grant a free set. Veteran access is migrated from owned equipment, retained upgrade receipts, unopened/prior Uncommon chests, seasonal chest awards and existing entitlements. New commissions follow completed building milestones even for veterans.

## Persistence and transaction contract

The estate uses account-owned subcollections independent of seasonal profile replacement. Initial six completed sites are granted once. Material fractions, levels, processor settings, reserved deposits, funded work, champion identities/XP, quest/recovery deadlines, rewards and receipts persist.

1. A five-minute quote identifies exact targets/version, deposits, additional materials, Gold, durations and permanent-credit terms. It binds account revision and current realm/shard.
2. Acceptance consumes the quote once and atomically debits authoritative seasonal Gold, permanent stocks or the existing Crown wallet as applicable. Server routes do not trust client prices.
3. Removing unstarted work pauses a paid contract. All credit and its duration remain bound to that building/target; no wallet refund, cross-project transfer or new charge on resume.
4. Matching old-world retries return the accepted receipt before compatibility rejection. New expired-world spending fails. An independently retried request cannot consume an already accepted quote.
5. Settlement runs through production boundaries and construction deadlines in chronological order. Completion grants one level once. Old production remains active until the deadline. Full storage or blocked factories cannot burn inputs for discarded output.
6. Quests reserve daily budgets at launch, award quoted XP once and retain partial material parcels. Full Gear bags retain completed commissions. Daily shop/recruitment/quest receipts are not reset by a season change.

## Evidence

- **Rule tests:** all 2,000 prices/timers match the reviewed tables; all 1,980 upgrades change a service. Positive/nondecreasing bills, exact eighty band totals, first-build prerequisites, reserves, storage, recipe conservation, long-absence partition equivalence, frozen construction contracts, partial parcels, XP banking and commission recipes are checked.
- **Combined simulation:** six cohorts use actual runtime settlement, earned supply chains and Hall/builder/storage levels, one/three daily visits, funded queues, optional quests/meals, commission spending and optional Crown supplies. See [REWARD_REVIEW.md](REWARD_REVIEW.md). This replaces the older factory-only claim of readiness. Prices remain individual resource-equivalent targets, not a full-account ten-season guarantee.
- **Estate emulator:** exercises the real authenticated callable routes and Gold authority, concurrent requests/quotes, old-world retries, permanent-credit retention, once-only completion, Gear entitlement migration, full-bag claim retention, roster/bench, quest claims/recovery, shared Crown allowance and denied client writes. Tests use emulator accounts only.
- **Browser:** desktop and 844×390 landscape panels, permanent-credit confirmation, lost-acknowledgment retry, in-place construction/counter updates, resource ledgers, original Gear entry/return, camera restoration, Escape and cleanup. The existing broader estate suite also covers all 20 sites, three landscape sizes, touch/mouse/keyboard navigation and 68 Gear return paths.
- **Delivery:** production artifact and asset budgets include the deferred estate controls. The authenticated Firebase client grows by roughly 0.9KiB for four routes and the account-scoped state listener, bounded by a 161 KiB limit. The 4.28MiB installation-cache cap remains unchanged; the new management panel is deferred.

These are local evidence categories, not a substitute for the required checks on the final PR commit. The arithmetic JSON intentionally does not certify deployment readiness by itself.

## Coordinated publication checklist

The release contract is crownlands-2026-10-08-estate-economy-v1. Its active monthly shared core-expansion topology is unchanged. Publish the matching backend, Firestore rules and client together after authorized merge/deployment; verify the exact build and named channel. Preserve the existing publication hold until the new backend is verified. A rollback must retain estate subcollections, pending contracts and commissioned items; older servers must not destructively normalize newer schemas.

Before calling this ready to merge, require current main plus Static validation, Multiplayer emulator validation and Validate on the final commit. After an authorized merge, synchronize and verify local main. After authorized publication, verify manifests and affected authenticated flows on the named channel. Physical-device touch feel, long-term pacing and player satisfaction remain manual playtest items. No production mutation is authorized by test fixtures.

Reproduce with node tools/test-estate-economy.js; node tools/validate-estate-economy-draft.js; node tools/validate-estate-readiness-proposal.js; node tools/validate-estate-reward-review.js; node tools/validate-estate-economy-browser.js. Selected integration suites are recorded in validation-plan.json.
