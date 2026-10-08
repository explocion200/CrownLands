# Estate economy readiness repair plan

Status: **REVIEW CANDIDATE — gameplay deployment is not ready.** October 8, 2026 UTC.

The estate UI is already live at build d84754fc1f92. The current task repairs the proposed economy and makes the remaining decisions concrete. It does not deploy new prices, grant materials, change existing Gear rules or implement server transactions. [Master Specification](../CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md) remains the authority for confirmed rules.

The approved commitments remain: twenty permanent buildings, maximum Level 100, Gold-only first construction, persistent materials/deposits/work/champions, and individual 1/3/6/10-season resource targets at 50% production. World Gold remains seasonal. No new world combat or production bonus is included.

## What is fixed in the draft now

The earlier nearly flat first band charged about 83.4 hours of half-share starter production for Level 2. Draft 4 moves that band's cost toward later levels:

- Level 2 now needs less than one hour of half-share Level 1 net material production for every building; its base timer is nine minutes. Gold, missing producers, prerequisites and competing projects can still delay it.
- The exact material totals in all eighty building/band combinations are unchanged. First construction stays Gold-only. The 6/12/18/24 base construction-day totals per band are unchanged.
- Every material bill and construction timer remains nondecreasing, including band transitions. Recipes still consume real inputs; production continues during construction.
- Focused reference milestones remain around 30.31 / 90.68 / 181.12 / 301.57 days. These assume paid supporting infrastructure and an available slot; they are not promises for a fresh account or twenty simultaneous projects.
- Fixtures now test small Level 2 installments and Level 25 bills above starter storage, including invalid deposits, replay, retained credit and completion across modeled resets.

See [the full level tables](LEVEL_TABLES.md), [reference timing](BALANCE_REVIEW.md) and [shared-account review](REWARD_REVIEW.md). At three visits daily, the illustrative all-building policy reaches all Level 25 around day 216; at one daily visit without pre-funded queues, around day 362. The latter is slightly slower than the old draft despite cheaper first upgrades: visit/queue scheduling matters. This is not an offline-balance acceptance claim.

## Proposed repairs requiring a design decision

The following candidate replaces the older reward/quest recommendations only if accepted. Its inputs are [readiness-proposal.json](readiness-proposal.json); [READINESS_RESULTS.json](READINESS_RESULTS.json) records reproducible arithmetic checks. The ordinary reward review intentionally continues to flag the unapproved baseline rewards.

| Review finding | Concrete candidate repair | Review status |
|---|---|---|
| Empty officer levels; impractical higher-rarity acquisition | Add one material-funded commission per officer, providing a selected family at Level 1 of the highest rarity unlocked by that building's completed milestone. Each building level reduces its commission duration from seven days at L1 to three days at L100. | New acquisition exception; explicit approval required |
| Slow early progression | Squared first-band material ramp and shorter early timers, preserving exact band budgets. | Applied and tested in draft 4 |
| Empty Market/Wagon Yard levels | Add free storage reserves at every level, available without spending Crowns. Retain the optional paid catalogs and their shared daily limit. | Proposed |
| Hall 96–100 has no reward | Other buildings may reach the completed Great Hall level, replacing Hall+5. Every Hall level then opens the next level across the estate; Hall 100 opens 100. | Proposed; whole-account dependency cost must be reviewed |
| Higher quest tiers become worse | Scale resource yield with tier; remove the additional Rare+ Tool fee. Test integer quotes as well as continuous rates. | Proposed and numerically checked |
| Champions train too quickly | Reduce tier XP multipliers, revise XP costs and recruitment head starts, and bound XP waiting at the Guild ceiling. | Proposed and numerically checked |
| Excessive quest resource injection | Reduce resource hours per quest and keep a shared account budget including meal bonuses. | Proposed; combined account simulation still needed |
| Seasonal Gold reservation ambiguity | Funding purchases a permanent job contract. Removing an unstarted job pauses it with all paid credit; resuming never charges again. No refund to a current or expired realm wallet. | Proposed transaction contract; model fixtures only |
| No repeatable endgame material use | Officer commissions provide ongoing material demand for actual equipment progress without changing the two-copy upgrade rule or fixed item Gold fees. | Depends on commission approval |
| Full roster blocks improved recruits | Keep every acquired champion permanently on a bench; cap only the active expedition roster. Let idle champions change active/bench position freely. | Proposed; storage and ownership implementation required |

## Officer commissions and recurring material demand

This is the main conflict to decide before implementation. Section 11 currently permits earning higher rarities through upgrades, with the specifically approved day-30 Uncommon chest exception. Commissioned Uncommon/Rare/Epic/Legendary pieces would add another acquisition exception. The two matching inputs per upgrade/promotion and all fixed item Gold fees would remain unchanged. Nothing in this proposal enables that exception.

Proposed behavior:

- Each officer building offers one concurrent commission for an explicitly selected existing item family belonging to that officer. The output is one Level 1 piece at a quoted rarity unlocked by that building milestone; no random reroll, paid speed-up or guaranteed full set.
- Duration in hours is 168 − 96 × (buildingLevel−1)/99. Every level improves a usable service between rarity milestones.
- Each order consumes a total four material-production-hour equivalents, allocated among a published non-food recipe. Use fixed, versioned reference rates and the completed officer level; do not make prices chase a player's current live income or reward pausing factories.
- Exact per-family material recipes and processor prerequisites must be specified before coding purchase/claim. This model tests the budget envelope, not an executable recipe catalog. No commission may be free or require a circular missing source.
- Snapshot the output, recipe, duration and entitlement when accepted. Inventory-full completion keeps a claimable receipt; it must not destroy an item, reroll it, charge again or block unrelated construction.
- At L100, four continuously running officers consume up to 5.33 normalized resource-hours daily in total: 22.22% of a 24-hour reference production budget before recipe distribution. This competes with building upgrades instead of printing free Gear.
- Starting after a Legendary entitlement with no stock, a complete eight-slot Legendary L5 set needs 128 Legendary L1 copies. One three-day officer commission slot therefore needs 384 commission-days, plus the existing Gold fees. Other acquisition or stock shortens this; the figure is not a live player completion forecast.

Commission availability follows the new building milestones even for veterans; previously owned higher-rarity equipment retains its existing viewing, equipping and upgrade access. The existing Gear system must remain usable while this is reviewed. Do not enable new rarity gates until higher-tier inventory, unopened boxes, pending authoritative grants and existing entitlements have been migrated and tested without revoking access.

## Useful storage and Hall levels

The candidate adds separate capacity to the existing stores, not a new resource or income source:

- Wagon Yard adds 15L + 8L² units of capacity to each of Timber, Stone, Ore, Planks, Iron and Tools.
- Market adds 12L + 6L² units to each of Grain and Food.
- At Level 100 these are 81,500 and 61,200 extra units per applicable stock. Every level adds capacity, including for players who never spend Crowns. Existing stocks are never deleted when reading/migrating capacity.
- Crown delivery prices remain the existing proposed 20 Crowns per hour equivalent, with a shared one-hour account limit per UTC day. Removing a click restriction alone is not counted as a level reward.
- Replace the proposed Hall+5 gate with otherBuildingLevel ≤ completedHallLevel. The Hall itself needs no other building-level prerequisite, preserving a non-circular path from the initial six structures.

This changes the shared progression route: a focused officer must also develop the Hall and relevant supply chain. Preserve the approved per-building resource-equivalent language; do not present a ten-season full-account guarantee.

## Quest and champion candidate

For Common through Legendary, use resource-hour rewards per elapsed quest hour of **0.009 / 0.0135 / 0.018 / 0.0225 / 0.027**. These replace the old 0.5/1.2/2.4-hour per-duration rewards. Keep 2-, 4- and 8-hour choices and at most three active parties.

Food costs 0.01 × duration × quoted net Food/hour, rounded up. Remove the additional Rare+ Tool charge: at weak production, rounding that fee up to one Tool can outweigh an entire short quest's reward. Tools remain useful for construction and the proposed commission recipes. At a fixed duration/supply chain, higher quest tiers have equal or greater whole-unit material returns and the same Food fee. Reject zero-output material choices before spending; show a longer quest or another available material.

Keep a shared 2.4 resource-hour UTC-day allowance, including meal bonuses and all parties/resources. Reserve the quoted allowance at launch, retain its originating UTC-day receipt across resets and never refill it because a realm generation changed. Returning or claiming an old quest cannot spend a fresh allowance or reprice the payout. The daily accounting is still a required backend test.

Three continuously rotated Legendary parties with the strongest +12% meal yield at most **2.17728 resource-hours/day**, or **9.072%** of one resource's reference daily output before caps, integer rounding and player availability. The budget is split when selecting multiple resources; it is not awarded once per material. Meal quotes must show their actual rounded benefit; do not sell a reward-only meal that changes no payable reward. Food/Grain do not drop from their own feeding loop.

Champion XP to advance from L is **4L**. Base XP is **20/hour**, with tier multipliers **1 / 1.1 / 1.2 / 1.3 / 1.4**. Recruit starting level is min(GuildLevel, 1 + floor((AlehouseLevel−1)/10)), ending at 10 instead of 50.

- The complete L1→100 curve is 19,800 XP. At the fastest eligible quest rate it takes 707.14 quest-hours: about 88.39 days at eight quest-hours/day, or 44.20 at sixteen. These are XP-only bounds excluding recovery, Guild ceilings, recruiting and party eligibility, not a forced calendar wait.
- Bank at most one next level of XP at the Guild training ceiling. Show the exact credit available before launch; further training is paused, and the preview must not promise XP it cannot retain. Previously earned XP must never be deleted by a migration.
- At champion 100 no XP is awarded; higher-tier material returns still have value.
- Keep the existing proposed 6→24 active-roster curve, but retain every owned champion outside that cap. Only idle champions may change active/bench status; quests/recovery retain their identities and deadlines. No forced dismissal, seasonal deletion or sale back into world Gold.
- Ownership records need pagination separate from the bounded active roster. A daily recruitment offer and its claim receipt survive reopening, device changes and season reset.

Optional Crown supplies and quests can accelerate a chosen project. Their combined effect, commission spending and the stricter Hall gate must be simulated together before freezing prices; the factory-only reference is not that simulation.

## Funded jobs across seasons

The candidate removes the ambiguous refund path:

1. Quote exact target level, version, material credit already deposited, additional materials, Gold and duration. Explicitly disclose that a funded project cannot return its payment to the wallet.
2. Atomically debit the active realm's Gold and available materials once and create a durable account-owned funded contract/receipt. Existing deposits count once toward that same bill.
3. Removing an unstarted contract from the queue changes it to paused. Keep its Gold/material credit, quote and target; resuming the same contract costs nothing. Started work cannot be cancelled for a refund.
4. Realm reset changes the world wallet but never the funded contract. A matching retry returns the original receipt; a new spend against an expired realm is rejected.
5. A server deadline completes exactly one next level. Duplicate callbacks, two devices, a reset and a balance revision cannot grant the level twice or charge the job again. Preserve the versioned price and duration rather than silently repricing funded work.

The review fixtures exercise payment conservation, atomic rejection, matching/mismatched retries, paid-credit retention, no wallet refund across two resets, start without another charge and once-only deadline completion. They are not Firestore tests. Partial material deposits still require the production transaction, ownership, quote and revision guards.

## Deployment readiness

**Ready now:** the deployed presentation; the revised draft tables and reproducible proposal review can be merged as development documentation after their PR checks pass.

**Not ready:** resource production, construction, saving levels, deposits, queue progression, Gear entitlements/commissions, champions, quests and Crown supply purchases. No estate gameplay service currently implements these contracts.

Before enabling gameplay:

- Confirm the new acquisition exception, intermediate rewards, Hall gate and irreversible funded-job rule; promote only accepted decisions into the Master Specification.
- Complete fixed commission recipes and a combined account simulation including funded queues, one/three daily visits, uneven infrastructure, quest returns, meals and optional Crown supplies.
- Implement server-owned settlement/storage and versioned durable jobs using the existing world Gold authority. Verify chronological completion, processor starvation/reserves, overflow, fractional carry, long absences, replay and seasonal isolation with relevant emulator tests.
- Add real snapshots and construction/upgrade panels without changing the approved map, resource-counter layout or equipment entry/return.
- Verify new-account initialization, retained six starter structures, reconnect/two devices, stale clients and cross-season migration. No production balances should be written for testing.
- Run desktop/mobile/browser checks and authenticated QA using a designated test account; physical-device behavior remains a separate manual check.

Reproduce: node tools/validate-estate-economy-draft.js; node tools/validate-estate-reward-review.js; node tools/validate-estate-readiness-proposal.js. A successful model check must never be reported as deployed gameplay or as proof that every economy choice has been accepted.
