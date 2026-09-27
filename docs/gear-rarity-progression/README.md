# Gear rarity progression

**26 September 2026 · IMPLEMENTED — PENDING RELEASE.** Rarity progression, reviewed art, crafting prices and non-production caps are implemented on this branch. Production caps remain deferred; no deployment is claimed.

The user confirmed the five colors/rarities, upward crafting from existing gear, and better artwork at each tier. The accepted working direction uses **100% total attack** and **75% total recovery**. Higher rarities come only from upgrading the current Common gear upward; separate higher-rarity drops, rewards and purchases are outside this update. The user explicitly retained matching duplicates for every level after reviewing the material growth; this requirement is settled. The accepted curves and prices below are implemented pending release.

## 1. Crafting rules

- Common (gray/white) → Uncommon (green) → Rare (blue) → Epic (purple) → Legendary (orange/gold). Poor and Unique are alternate labels, not extra tiers.
- Five levels per rarity. Two identical items of the same officer, slot, rarity and level produce one next-level item. At Level 5 they produce Level 1 of the next rarity. Legendary Level 5 is the endpoint.
- Confirmed September 26: the two-item requirement applies at every rarity, including Levels 1→2 through 4→5. Gold is an additional cost, never a replacement for the matching copy. The proposed Gold-only leveling alternative was declined.
- Continue from each player's existing items and levels. Two Common Level 5 copies become one Uncommon Level 1; two Uncommon Level 5 copies become one Rare Level 1, continuing through Epic to Legendary. Keep existing Common Box sources and their three Level 1 Common pieces. Higher rarity is earned through crafting, never rolled directly from a box or awarded by a new reward source in this update.
- Preserve all Common Level 1–5 bonuses and existing Common crafting prices. Existing item IDs, acquired gear, equipment selection, boxes and persistence survive the update.
- Consume the selected target and one unequipped matching copy atomically. If the target was equipped, equip the new result automatically. Never consume a second equipped item as material.
- Intrinsic bonuses increase at every step, including promotions. A player's final output can remain unchanged at a category cap; the preview must show both the intrinsic improvement and the amount actually applied.
- Keep the current roles and stat scopes. A rarity adds no new stat or set bonus. Gear is still personal and not tradable.

## 2. Per-piece and complete-loadout bonuses

Each cell below is the **maximum for one item at Level 5**. Armor means head, chest, pants, boots, gloves and belt. Treasury's seven Main City pieces also include its Ledger. Values are percentage points, not multipliers compounded per item.

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

## 3. Total caps and contribution scopes

These are final ceilings **after all applicable contributors** (except the explicitly deferred production rows), not promises that every player reaches them. A +100% power/output bonus means twice base power/output; 75% recovery instead means returning 75 of every 100 eligible casualties. City level changes the base and does not consume a percentage cap.

| Category | Cap | Contributors and order |
|---|---:|---|
| Attack strength | +100% (2x base) | Swordmastery up to 60 + equipped sword up to 30 + Training Grounds up to 10 for rallies launched from that Clan Tower. Solo maximum from these sources is +90%. |
| Defending soldier strength | +100% (2x base) | Shieldwall Discipline up to 60 + applicable shield up to 30 + the defending ruler's objective bonuses. Apply per defending army, before summing armies. |
| Regular-city wall strength | +150% (2.5x base) | Stoneworks up to 75 + six armor pieces totaling up to 75. Does not multiply soldier defense or add another physical wall per reinforcer. |
| Troop production (DEFERRED) | +200% (3x base) | Royal Granaries up to 75 + gear up to 60 + personal/shared objectives + War Drums 30 while active. |
| Main City Gold (DEFERRED) | +250% (3.5x base) | Tax Stewardship up to 75 + seven pieces totaling 70 + chain 20 + personal/shared objectives + Royal Tax Decree 50 while active. |
| Other regular-city Gold (DEFERRED) | +200% (3x base) | Tax Stewardship up to 75 + chain 20 + personal/shared objectives + Royal Tax Decree 50 while active. |
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

These are Gold prices, not timers. Crafting completes atomically after acceptance. The full cost includes crafting both inputs at every earlier step; it is not the sum of one column of prices.

**Acquisition is confirmed: upgrade existing gear upward.** Keep two matching inputs for every upgrade and promotion. The earlier recommendation to add higher-rarity rewards is withdrawn. Preserve existing boxes and their explicit Common-only pool when expanding the catalog; do not introduce new reward types, currencies, drop odds or shop stock.

| Target | Matching Common Level 1 equivalents | Matching Common Level 5 equivalents |
|---|---:|---:|
| Uncommon Level 1 | 32 | 2 |
| Rare Level 1 | 1,024 | 64 |
| Epic Level 1 | 32,768 | 2,048 |
| Legendary Level 1 | 1,048,576 | 65,536 |
| Legendary Level 5 | 16,777,216 | 1,048,576 |

These are total material equivalents for one exact family, not additional items demanded from a player who already owns part of the crafting tree. Existing crafted levels retain their full progress. Gold remains additional.

**Duplicate requirements are settled; retain the material-growth figures for transparency.** With uniformly random selection among 32 families, obtaining enough of one chosen family for Legendary Level 5 takes approximately 536,870,912 total Common item draws in expectation, before Gold. This is mathematical supply demand, not a forecast of player engagement or a measured drop rate. The user explicitly chose to keep two matching inputs at every step after the Gold-only leveling alternative was presented. Do not treat changing duplicate requirements as an outstanding decision or prerequisite for implementation. Keep current Common supply and five levels per rarity; any future change needs a new explicit direction.

## 5. Implementation and release boundaries

Implemented on `codex/gear-rarity-progression`, pending review and authorized release:

- All 160 definitions and reviewed art variants, with existing Common keys and levels preserved. Artwork from PR #372 is included; the combined progression PR supersedes that separate art-only diff.
- Transactions consume exactly two matching inputs and Gold, create a new identity, transfer equipped state, and retain target-bound replay receipts. Uncertain client retries keep the same request ID and price; session changes invalidate pending UI callbacks.
- Schema v3 accepts earlier Common inventories without truncation and preserves unsupported records. The server refuses future schemas. Opening a box checks the 2,000-item limit and a conservative 900,000-byte profile budget before committing; failure preserves the box. Upgrades can reduce an already-full bag.
- Attack, per-army city defense, city walls, movement, recovery and new city repair use the caps above. Existing march snapshots and repair deadlines remain unchanged. City shield bonuses retain their destination-owner scope for allied troops. No new Gatehouse shield benefit is added to Clan Tower defenders.
- **Production caps are deferred.** Higher-rarity production gear is active, but current additive production and exact offline objective/timed-item accounting remain intact. The proposed 200/250/200 percent ceilings are a design study, not runtime behavior. A later change needs bounded exact interval accounting and separate approval.
- Four officer screens show current/result rarity, level, artwork, cost and intrinsic bonus. Contextual equipped previews show applicable final caps and applied improvement. Tower-only bonuses depend on the battle location and are described separately. Art loads on demand: 320 small derivatives total 7,326,712 bytes; source masters are excluded from production and no rarity art is added to startup precache.
- The new release ID requires old active-realm clients to refresh, with an additional schema capability guard for promotions and higher-rarity loadout changes. The active topology, realm generation, server instance settings and reward sources are unchanged.

## 6. Validation and release

The exact affected test selection is in [`validation-plan.json`](../../validation-plan.json). Focused validation covers all 800 item values, 768 upgrades, 128 promotions, material eligibility, equipment transfer, cap edge cases, lossless inventories and Common-only rewards. Browser coverage includes all five rarity previews for each officer on desktop and small landscape mobile, 44px actions, confirmation focus, lost-response retries and stale sessions. Selected emulator suites cover authoritative economy/concurrency, season persistence, gear battle reports, Tower battles, rallies and travel.

The three required GitHub checks must pass on the final commit before this PR is ready. No merge, deployment or production player-data mutation is authorized by this implementation request. Large-inventory measurements and the reproducible fixture are recorded in [visual QA](../visual-qa/gear-rarities/README.md).

Deploy the compatible backend and matching frontend together after release authorization; verify backend/frontend manifests and the active realm pointer. Check promotion errors, retry rates, transaction duration, profile size and inventory conservation. Do not roll back to code that cannot read schema v3. To stop new promotions safely, use a reviewed server guard while retaining v3 reads/equipment support and earned inventory; never downgrade or discard player gear.

## 7. Reproduce and review

- `node tools/validate-gear-progression-proposal.js --write` regenerates all numeric tables. Its production-cap scenarios are explicitly deferred design calculations.
- `node tools/validate-gear-rarities.js` checks runtime/catalog parity with those curves and costs.
- [Proposal data](proposal.json), [calculator](model.js), [all numbers](CALCULATED_REVIEW.md), [Master Specification](../CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md).

Branch: `codex/gear-rarity-progression`. Pull request: [#373](https://github.com/explocion200/CrownLands/pull/373). Status: implementation complete; release gated by the required PR checks; not merged or deployed.
