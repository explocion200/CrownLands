# Gear rarity progression — working proposal

**26 September 2026 · DRAFT · Gameplay is unchanged.** This branch contains a review model and implementation plan, not enabled rarities. PR #372 remains unmerged. The Master Specification is unchanged because the new numeric balance and reward rules still need confirmation.

The user confirmed the five colors/rarities and wants upward crafting, better artwork at each tier, bounded recovery, and attack bonuses that can reach 100%. This review uses **100% total attack** and **75% total recovery** as proposed defaults. Whether 100% meant gear alone, the final recovery ceiling, and the acquisition approach are pending answers.

## 1. Crafting proposal

- Common (gray/white) → Uncommon (green) → Rare (blue) → Epic (purple) → Legendary (orange/gold). Poor and Unique are alternate labels, not extra tiers.
- Five levels per rarity. Two identical items of the same officer, slot, rarity and level produce one next-level item. At Level 5 they produce Level 1 of the next rarity. Legendary Level 5 is the endpoint.
- Preserve all Common Level 1–5 bonuses and existing Common crafting prices. Existing item IDs, acquired gear, equipment selection, boxes and persistence survive the update.
- Consume the selected target and one unequipped matching copy atomically. If the target was equipped, equip the new result automatically. Never consume a second equipped item as material.
- Intrinsic bonuses increase at every step, including promotions. A player's final output can remain unchanged at a category cap; the preview must show both the intrinsic improvement and the amount actually applied.
- Keep the current roles and stat scopes. A rarity adds no new stat or set bonus. Gear is still personal and not tradable.

## 2. Per-piece and complete-loadout bonuses

Each cell below is the **maximum for one item at Level 5**. Armor means head, chest, pants, boots, gloves and belt. Treasury's seven Main City pieces also include its Ledger. Values are proposed percentage points, not multipliers compounded per item.

| Officer / equipment | Effect | Common | Uncommon | Rare | Epic | Legendary |
|---|---|---:|---:|---:|---:|---:|
| War Captain: each armor piece, six slots | Troop production, all owned regular cities | 1.5% | 3% | 5% | 7.5% | 10% |
| War Captain: sword | Attack strength | 1.5% | 5% | 12% | 20% | 30% |
| War Captain: medallion | Casualty recovery | 1.5% | 3% | 5% | 7.5% | 10% |
| Master of Coin: armor and Ledger, seven slots | Main City Gold production | 1.5% | 3% | 5% | 7.5% | 10% |
| Master of Coin: chain | All-city Gold production | 1.5% | 4% | 8% | 13% | 20% |
| Cavalry Master: each armor piece, six slots | Transfer/reinforcement speed | 1.5% | 3% | 5% | 7.5% | 10% |
| Cavalry Master: lance | Attack/rally travel speed | 1.5% | 5% | 12% | 20% | 30% |
| Cavalry Master: pendant | Scout speed | 1.5% | 6% | 15% | 30% | 50% |
| Defensive Commander: each armor piece, six slots | Regular-city wall strength | 1.5% | 3% | 5.5% | 8.5% | 12.5% |
| Defensive Commander: shield | Defending soldier strength | 1.5% | 5% | 12% | 20% | 30% |
| Defensive Commander: seal | Reduction to new regular-city wall repair time | 1.5% | 5% | 12% | 20% | 30% |

Common retains 0.25 / 0.50 / 0.80 / 1.15 / 1.50%. Within every later rarity, five equal increments connect the previous rarity's Level 5 bonus to the new maximum. Thus a green sword is 2.2 / 2.9 / 3.6 / 4.3 / 5%, and a green recovery medallion is 1.8 / 2.1 / 2.4 / 2.7 / 3%. See [every level and all 32 pieces](CALCULATED_REVIEW.md).

Maximum Legendary loadouts give 60% troop production, 70% Main City Gold plus the 20% all-city chain, 60% friendly movement, and 75% wall strength. Single weapons/jewelry use their individual values above. These are gear totals; the next section accounts for other sources.

## 3. Proposed total caps and exact contribution scopes

These are proposed final ceilings **after all applicable contributors**, not promises that every player reaches them. A +100% power/output bonus means twice base power/output; 75% recovery instead means returning 75 of every 100 eligible casualties. City level changes the base and does not consume a percentage cap.

| Category | Proposed cap | Contributors and order |
|---|---:|---|
| Attack strength | +100% (2x base) | Swordmastery up to 60 + equipped sword up to 30 + Training Grounds up to 10 for rallies launched from that Clan Tower. Solo maximum from these sources is +90%. |
| Defending soldier strength | +100% (2x base) | Shieldwall Discipline up to 60 + applicable shield up to 30 + the defending ruler's objective bonuses. Apply per defending army, before summing armies. |
| Regular-city wall strength | +150% (2.5x base) | Stoneworks up to 75 + six armor pieces totaling up to 75. Does not multiply soldier defense or add another physical wall per reinforcer. |
| Troop production | +200% (3x base) | Royal Granaries up to 75 + gear up to 60 + personal/shared objectives + War Drums 30 while active. |
| Main City Gold | +250% (3.5x base) | Tax Stewardship up to 75 + seven pieces totaling 70 + chain 20 + personal/shared objectives + Royal Tax Decree 50 while active. |
| Other regular-city Gold | +200% (3x base) | Tax Stewardship up to 75 + chain 20 + personal/shared objectives + Royal Tax Decree 50 while active. |
| March speed | +150% (2.5x base speed) | Preserve `(1 + March Orders/100) × (1 + objective speed/100) + applicable gear/100`, then cap at 2.5. March Orders max is 60; use friendly armor 60, lance 30, or scout pendant 50 according to order kind. |
| Ordinary casualty recovery | 75% hard ceiling; 60% attainable from proposed current sources | Field Medics up to 50 + medallion up to 10. Return actual credited troops to the Main City. |
| Clan Tower defender recovery | 75% | Field Medics 50 + personal medallion 10 + that Tower's Infirmary 15. The Infirmary adds nothing to attacking armies or ordinary-city defense. |
| New regular-city wall repair duration reduction | 50% hard ceiling; 30% attainable from proposed current sources | Seal up to 30; no current skill or objective call-site contribution was found. Do not retroactively shorten an existing repair deadline. |

**Unchanged separate systems:** Guild Charters (50%) plus applicable objective city-upgrade reduction retains its existing 85% ceiling and does not discount gear crafting. Engineers' Workshop reduces its own Tower wall construction/paid repair times by up to 50%; do not add the regular-city seal or change Tower construction. Gear adds no direct King Power percentage. Troop production changes eventual troop counts, which affect King Power through the existing accounting.

Swift March Order is an existing one-use exception that halves an eligible transfer's remaining time, with a one-second minimum. Keep it separate from the ongoing speed cap and keep its current eligibility. Ordinary computed travel floors remain 30 seconds, scouts 10 seconds, and rallies retain their slowest participant's launch-time speed. Faster speed is not the same as the same percentage reduction in duration.

**Objective accounting is not a flat 18% limit.** Current `combinePlayerObjectiveBonuses` can add several holdings. Normal strongholds contribute 8% in their category; the Citadel has 10% categories and a 10% city-upgrade discount. Clan sharing normally contributes half, removes duplicate self-benefit, and uses a different Citadel-controller policy. Preserve those ownership/sharing rules, calculate the applicable personal/shared total, then apply an approved final category cap. Objectives do not grant attack strength or casualty recovery. War Drums grants production, not combat attack.

## 4. Costs and attainability

Gold is charged as hours of the player's **current raw regular-city Gold production**, using the existing economy collection and pricing basis. Gear, skills, temporary boosts and objective bonuses do not increase the price or create a discount.

| Rarity being upgraded | 1→2 | 2→3 | 3→4 | 4→5 | 5→next rarity 1 |
|---|---:|---:|---:|---:|---:|
| Common | 0.5 h | 1 h | 2 h | 4 h | 8 h |
| Uncommon | 1 h | 2 h | 4 h | 8 h | 16 h |
| Rare | 2 h | 4 h | 8 h | 16 h | 32 h |
| Epic | 4 h | 8 h | 16 h | 32 h | 64 h |
| Legendary | 8 h | 16 h | 32 h | 64 h | Maximum |

These are proposed prices, not timers. Crafting completes atomically after acceptance. The full cost includes crafting both inputs at every earlier step; it is not the sum of one column of prices.

**Common-only drops cannot support a reasonable full five-tier progression:** Legendary Level 1 requires 1,048,576 matching Common Level 1 copies; Legendary Level 5 requires 16,777,216. With uniformly random selection among 32 families, obtaining enough of one chosen family takes approximately 536,870,912 total Common item draws in expectation, before considering Gold. This is mathematical supply demand, not a forecast of player engagement or a measured drop rate.

The recommended direction preserves two-item crafting and adds separately named higher-rarity rewards. Existing unopened Common Boxes must remain Common and keep their three-item promise. Do not silently add all 160 definitions to their existing random pool. Higher-rarity reward frequency, eligibility and choice are a required design step before release.

| Illustrative chosen Legendary Level 1 rewards per week | One chosen Legendary Level 5 | All 32 slots at Legendary Level 5 |
|---|---:|---:|
| 1 | 16 weeks | 512 weeks |
| 3 | 5⅓ weeks | 170⅔ weeks |
| 7 | 2²⁄₇ weeks | 73¹⁄₇ weeks |

The table assumes rewards can be selected by exact family, no previous inventory, and sufficient Gold. Random-slot rewards take longer for a chosen target. A Level 5 Legendary from matching Legendary Level 1 rewards also costs 256 fixed-rate raw-production hours to craft. These examples show why a reward cadence must be agreed; they do **not** authorize new daily/weekly rewards, shop stock, monetization, eligibility gates or random drop odds.

Alternatives awaiting the user's choice: spend Gold/materials for levels within a rarity and use duplicates only for promotions (changes the established mechanic and needs fair treatment of existing crafted items), or deliberately accept the full Common-only grind. Do not enable an incomplete acquisition design just because promotion code works.

## 5. Current implementation findings that affect the design

| Finding | Implementation requirement |
|---|---|
| The Master Specification and `COMMON_GEAR.CASUALTY_RECOVERY_CAP_PERCENT` currently say 90%. | Confirm the new ceiling explicitly before updating the spec, runtime, Infirmary text, report metadata and tests together. Current obtainable Common recovery is 51.5% ordinarily / 66.5% at a maximum Infirmary, using capped skills. |
| `normalizeInstance` forces `rarity: common`; only 32 Common keys exist. | Add explicit rarity-aware definitions and normalization. Preserve every existing Common key and never infer a rarity from untrusted client fields. |
| `openCommonGearBox` samples the entire `DEFINITIONS` array. | Use an explicit Common-only reward pool before expanding the catalog. Keep current boxes, purchases and replay receipts valid. |
| `normalizeState` silently takes the first 2,000 item entries. | Do not expand loot without inventory protection. Reject an over-cap open before consuming the box; grant durable unopened rewards when a bag is full. Never truncate an owned inventory during migration or save. Review document-byte limits as well as item count. |
| Clan Tower defense reads `gearBonuses.defenseStrength`, while gear exports `defenderStrength`. | There is a real field mismatch. Confirm whether the shield should apply to each owner's Tower troops; the item description currently says owned cities. Include a focused correction and scope test if approved, rather than claiming that Tower shield bonuses already work. |
| Regular-city defense applies the destination owner's shield bonus to owner and allied troops. | Preserve that scope; do not accidentally substitute each reinforcing ruler's shield. Cap each army with its own skill/objective contribution and applicable destination shield, retaining exact rounded totals. |
| Production accrual uses time-integrated shared objectives and separately adds timed item overlap. | Clip actual interval rates, not averaged objectives or just the current UI rate. The audit includes a counterexample where averaging before clipping over-credits. Preserve already-earned uncapped intervals before activation. |
| Attack snapshots and rally packages lock bonuses; defense resolves at arrival. | Preserve already-launched values and travel. Version the new cap policy so queued battles, retries and historical reports retain their recorded rules. |
| Existing upgrade receipts retain 24 recent operations and identify both consumed items. | Add previous/result rarity and definition metadata. Bind retries to the same target; consumed IDs must never be reusable, even after receipt eviction. |
| The live topology contract is `core-expansion-v1`; this audit read repository code only. | No archived-world edits or production-data changes. Confirm the authoritative current-realm pointer during the later deployment review, not by assuming an old generation ID. |

Adding a final cap can reduce current players' output where enough objectives stack. The [calculated review](CALCULATED_REVIEW.md) gives exact maximum-Common thresholds. Approval must cover that behavior; no observed production-player impact is claimed. Before release, run an aggregate impact audit against approved current-realm samples without logging player names, IDs or private intelligence.

## 6. Implementation sequence after balance decisions

1. **Confirm the rules.** Resolve the three pending direction choices, approve the curves/prices/caps, settle reward cadence and Tower shield scope. Add only confirmed rules to the Master Specification in the implementation PR.
2. **Shared catalog and compatibility.** Add five rarity definitions for each of the 32 item families, rarity-aware bonuses, next-result calculation, matching-material checks and bounded cap helpers. Keep callable names compatible where possible. Introduce an additive schema revision and minimum client/contract support so older clients cannot overwrite or hide newly promoted inventory. Existing unknown/future records must never be silently deleted.
3. **Authoritative crafting and rewards.** Inside the existing economy transaction, settle old production, validate ownership/materials, quote current raw-production Gold, consume exactly two items and Gold once, persist the result and replay receipt, and transfer an equipped slot. Insufficient Gold, wrong family/rarity/level, busy/concurrent/replayed requests and maximum-tier cases must preserve state. Persist new reward counters/unopened reward types across season resets according to the confirmed gear policy.
4. **All effect consumers.** Wire one reviewed rule set into solo/rally attack snapshots, army defense packages, wall strength/repair, recovery credit/report attribution, every production/accrual path, and every movement order including Tower, Nearby scouts, returns and reinforcements. Keep launch snapshots and existing timers immutable. Do not introduce separate UI-only caps.
5. **Offline economy correctness.** Current scalar shared-objective integrals cannot reconstruct capped intervals. Choose and validate a bounded durable representation before adding caps: for example, capped threshold integrals for the discrete objective percentages, or an interval ledger with compaction that preserves clipped sums. Benchmark its write/read size and transaction contention. Do not silently approximate or cap only online production. Activation settles the old-policy interval before starting new-policy accrual.
6. **UI and artwork.** Integrate the reviewed Common work from PR #372 and the remaining 128 artwork variants after validating the combined diff. Show rarity/level, both consumed items, exact price, next rarity/level/bonus, cap headroom and applied improvement. Use “Promote to Uncommon” at Common 5 and equivalent later transitions. Preserve selection, filter, focus, scroll, pending state and session guards. Defer larger images; no all-rarity preload.
7. **Staging and release.** Test current-realm fixtures and old-client behavior. Reconcile this branch with PR #372 through the safe workflow before release; neither PR is authorized for merge/deploy by this proposal. Require all three GitHub checks on the final implementation, then obtain release authorization. Deploy compatibility support before enabling new drops/promotions, verify frontend/backend versions, and compare errors, retries, transaction duration and inventory size. Rollback must disable new crafting safely without downgrading or deleting earned higher-rarity gear.

## 7. Affected validation for the eventual implementation

- 160 definitions, all 800 item/rarity/level values, four promotions per family, every source-to-cap combination, mixed-rarity loadouts, unchanged Common values and exact rounding.
- Concurrent promotions, lost acknowledgments/replays, receipt eviction, wrong/equipped material, insufficient Gold, full bag/near-limit document, partial failure, corrupt/future record handling and old-client requests.
- Equip/promote across Gold/troop accrual boundaries, timed item expiration, changing objectives/clans, offline production, Main City changes and interrupted sessions.
- Solo/rally/Tower battle snapshots, ordinary and Tower recovery, destination shield inheritance, shared physical walls, King Power conservation and report attribution under caps.
- City/Tower scouting, Nearby, friendly transfers, rally joins/launches/returns and Swift March eligibility/floors. Gear cannot recompute an army already underway.
- Desktop and landscape mobile: all rarity colors/art, promotion confirmation, errors, duplicate taps, keyboard/focus/scroll and slow/missing images.
- Season persistence for every rarity, level, equipment slot and unopened reward, plus rollback/compatibility fixtures. Benchmark large inventories and bounded offline-cap accounting.

Reuse affected existing suites such as `tools/validate-common-gear.js`, `tools/validate-gear-bonus-gameplay.js`, the four officer browser suites, chest browser suite, `functions/test/emulator-battle-report-gear-effects.js`, `emulator-economy-concurrency.js`, `emulator-world-travel.js`, `emulator-rally-lifecycle.js`, `emulator-rally-rules.js`, `emulator-clan-tower-battle-reports.js` and `emulator-reset-gate.js`; add focused missing coverage. Final selection belongs in the implementation's exact-base `validation-plan.json`. The current proposal runs only its own calculation audit.

## 8. Reproduce and review

- `node tools/audit-gear-progression.js` checks the review against the unchanged current Common definitions and source production functions.
- `node tools/audit-gear-progression.js --write` regenerates the calculated tables after editing the proposal/model.
- [Proposal data](proposal.json), [calculator](model.js), [all numbers](CALCULATED_REVIEW.md).
- Source basis: [`common-gear.js`](../../common-gear.js), [`functions/economy-config.json`](../../functions/economy-config.json), [`functions/index.js`](../../functions/index.js) (`getCityProductionStats`, `calculateDefenderArmyPackages`, `createHoldingTowerDefensePackages`, `combinePlayerObjectiveBonuses`, `addCommonGearMarchSpeed`, `createAttackCombatSnapshot`, `prepareEconomyCollection`, `upgradeCommonGear`), [`clan-tower-buildings.js`](../../clan-tower-buildings.js), [Master Specification](../CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md), [PR #372](https://github.com/explocion200/CrownLands/pull/372).

Branch: `codex/gear-rarity-progression`. No merge, production deployment, source-of-truth rule change or player-data mutation is part of this draft.
