# Gear rarity progression

**29 September 2026 · UPDATED BONUSES — PENDING RELEASE.** Rarity progression, reviewed art, crafting prices and non-production caps are implemented on this branch. Production caps remain deferred; no deployment is claimed.

The user confirmed the five colors/rarities, upward crafting from existing gear, and better artwork at each tier. The September 29 approved gear budgets use **+200% total attack** and **90% total recovery**, with locked skill values and every gear maximum reserved for Legendary Level 5. Higher rarities come only from upgrading the current Common gear upward; separate higher-rarity drops, rewards and purchases are outside this update. The user explicitly retained matching duplicates for every level after reviewing the material growth; this requirement is settled. The accepted curves and prices below are implemented pending release.

## 1. Crafting rules

- Common (gray/white) → Uncommon (green) → Rare (blue) → Epic (purple) → Legendary (orange/gold). Poor and Unique are alternate labels, not extra tiers.
- Five levels per rarity. Two identical items of the same officer, slot, rarity and level produce one next-level item. At Level 5 they produce Level 1 of the next rarity. Legendary Level 5 is the endpoint.
- Confirmed September 26: the two-item requirement applies at every rarity, including Levels 1→2 through 4→5. Gold is an additional cost, never a replacement for the matching copy. The proposed Gold-only leveling alternative was declined.
- Continue from each player's existing items and levels. Two Common Level 5 copies become one Uncommon Level 1; two Uncommon Level 5 copies become one Rare Level 1, continuing through Epic to Legendary. Keep existing Common Box sources and their three Level 1 Common pieces. Higher rarity is earned through crafting, never rolled directly from a box or awarded by a new reward source in this update.
- Preserve all Common Level 1–5 bonuses. The September 27 fixed-Gold revision starts at 100,000 Gold and ends at 50 billion Gold for Legendary Level 4→5. Existing item IDs, acquired gear, equipment selection, boxes and persistence survive the update.
- Consume the selected target and one unequipped matching copy atomically. If the target was equipped, equip the new result automatically. Never consume a second equipped item as material.
- Intrinsic bonuses increase at every step, including promotions. A player's final output can remain unchanged at a category cap; the preview must show both the intrinsic improvement and the amount actually applied.
- Keep the current roles and stat scopes. A rarity adds no new stat or set bonus. Gear is still personal and not tradable.

## 2. Per-piece and complete-loadout bonuses

Each cell is the **maximum for one item at Level 5**, in percentage points. Armor has six slots: head, chest, pants, boots, gloves and belt. Every level and promotion increases the intrinsic bonus; only Legendary Level 5 reaches the last column.

| Officer / equipment | Effect | Common | Uncommon | Rare | Epic | Legendary |
|---|---|---:|---:|---:|---:|---:|
| War Captain: each armor piece | All-city troop production | 1.5% | 3% | 6% | 10% | 15% |
| War Captain: sword | Attack strength | 1.5% | 10% | 30% | 60% | 100% |
| War Captain: medallion | Casualty recovery | 1.5% | 5% | 12% | 25% | 40% |
| Master of Coin: each armor piece | Main City Gold | 1.5% | 3% | 6% | 10% | 15% |
| Master of Coin: Ledger | Main City Gold | 1.5% | 3% | 5% | 7.5% | 10% |
| Master of Coin: chain | All-city Gold | 1.5% | 8% | 20% | 45% | 70% |
| Cavalry Master: each armor piece | Transfer/reinforcement speed | 1.5% | 3% | 5% | 7.5% | 10% |
| Cavalry Master: lance | Attack/rally speed | 1.5% | 8% | 20% | 40% | 60% |
| Cavalry Master: pendant | Scout speed | 1.5% | 10% | 30% | 65% | 110% |
| Defensive Commander: chest and pants, each | Regular-city wall strength | 1.5% | 4% | 8% | 13% | 20% |
| Defensive Commander: other armor, each | Regular-city wall strength | 1.5% | 3% | 6% | 10% | 15% |
| Defensive Commander: shield | Defending soldier strength | 1.5% | 8% | 20% | 40% | 60% |
| Defensive Commander: seal | Reduction to new regular-city repair time | 1.5% | 6% | 15% | 30% | 50% |

Common retains 0.25 / 0.50 / 0.80 / 1.15 / 1.50%. Each later rarity uses five equal increments from the prior rarity's maximum, rounded to two decimals. For example, Legendary swords give 68 / 76 / 84 / 92 / 100%; Legendary medallions give 28 / 31 / 34 / 37 / 40%. See [every level and all 32 pieces](CALCULATED_REVIEW.md).

A complete Legendary Level 5 loadout gives **90% troop production**, **100% Main City Gold plus 70% all-city Gold (170% combined in the Main City)**, **60% friendly movement**, and **100% wall strength**. The wall set is 20 + 20 + 15 + 15 + 15 + 15. These totals require all contributing pieces at Legendary Level 5. Existing inventories keep their IDs, rarities, levels and equipped state and immediately use the revised definitions; no item loses bonus.

## 3. Total caps and contribution scopes

The fixed skill maximum is 100% for Swordmastery, Shieldwall Discipline, Stoneworks, Tax Stewardship, Royal Granaries and March Orders; Field Medics and Guild Charters stay at 50%. Every skill level costs one point. The gear revision leaves these values unchanged.

| Category | Combined cap | Current contributors |
|---|---:|---|
| Attack strength | +200% (3x base) | Swordmastery 100 + sword 100. Current Tower rally Training Grounds also feeds this cap until its planned replacement. |
| City defending soldiers | +200% (3x base) | Shieldwall 100 + shield 60 + applicable objectives. Apply the cap per army before summing. |
| Regular-city walls | +200% (3x base) | Stoneworks 100 + armor set 100. Reinforcements do not add extra walls. |
| Army march speed | +200% (3x base speed) | March Orders 100 + objectives + friendly armor 60 or lance 60, according to order kind. |
| Scout speed | +250% (3.5x base speed) | March Orders 100 + objectives + pendant 110. |
| Casualty recovery | 90% | Field Medics 50 + medallion 40. Existing Tower Infirmary recovery also remains subject to this ceiling until its planned replacement. |
| New regular-city repair reduction | 50% | Seal 50. Existing repair deadlines remain intact. |

Movement now adds skill, objective and gear percentages: speed multiplier = 1 + their sum / 100, then applies the order's cap. Existing launched marches keep their stored timing. Swift March Order retains its separate one-use effect and minimum remaining time. Travel floors and rally slowest-participant rules remain unchanged. Base troop attack stays 1.25 and defense stays 1.30.

**Remaining balance work:** proposed total production ceilings are +250% troops, +350% Main City Gold and +250% other-city Gold. They remain deferred: runtime production still adds skill, gear, objectives and active War Drums (+30%) or Royal Tax Decree (+50%) through the existing offline accounting. This update does not implement the proposed objective budgets of 40% defense/speed and 30% production. Current objective percentages and ownership/sharing rules remain in effect. Do not describe these proposed allowances as currently obtainable bonuses.

The user plans to replace Clan attack/recovery bonuses with other castle benefits. This gear update supplies the full attack and recovery budgets through personal skills and Legendary gear; replacement building mechanics remain separate. Guild Charters plus objective city-upgrade reduction retains the existing 85% runtime ceiling; the proposed 60% combined limit is separate work. Engineers' Workshop retains its own 50% Tower construction/paid-repair reduction. Gear does not directly multiply King Power.

## 4. Costs and attainability

**September 27, 2026: confirmed fixed Gold prices, implemented pending release.** This replaces the September 26 production-hour pricing. All amounts below are Gold per action and apply equally to all gear families, slots and officers. Production, city count, skills, gear, temporary boosts and objectives do not affect the fee.

| Rarity being upgraded | 1→2 | 2→3 | 3→4 | 4→5 | 5→next rarity 1 |
|---|---:|---:|---:|---:|---:|
| Common | 100,000 | 170,000 | 300,000 | 500,000 | 850,000 |
| Uncommon | 1,500,000 | 2,500,000 | 4,000,000 | 7,000,000 | 50,000,000 |
| Rare | 100,000,000 | 200,000,000 | 350,000,000 | 600,000,000 | 1,000,000,000 |
| Epic | 1,500,000,000 | 2,500,000,000 | 4,000,000,000 | 6,000,000,000 | 9,000,000,000 |
| Legendary | 14,000,000,000 | 22,000,000,000 | 34,000,000,000 | 50,000,000,000 | Maximum |

Every action still consumes two matching pieces of the same family, rarity and level. Legendary Level 5 is terminal. Common Level 1 acquisition and Gear Box pricing are separate. Crafting completes atomically after acceptance. Full-path Gold totals include crafting both inputs at every earlier step and exclude acquiring the starting pieces. Existing items and historical receipts retain their progress and charges; no refunds or migration occur.

The server requires the exact quoted price before a new upgrade can spend Gold. Missing, malformed or outdated quotes reject without changing items or Gold and ask the player to refresh. Committed request IDs replay their original receipt with no new charge, including receipts from before this price revision. Release the client and upgrade Function together; a price mismatch during rollout fails before mutation.

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

The September 29 bonus revision is on `codex/skill-point-efficiency`, pending review and authorized release:

- All 160 definitions and reviewed art variants, with existing Common keys and levels preserved. Artwork from PR #372 is included; the combined progression PR supersedes that separate art-only diff.
- Transactions consume exactly two matching inputs and Gold, create a new identity, transfer equipped state, and retain target-bound replay receipts. Uncertain client retries keep the same request ID and price; session changes invalidate pending UI callbacks.
- Schema v3 accepts earlier Common inventories without truncation and preserves unsupported records. The server refuses future schemas. Opening a box checks the 2,000-item limit and a conservative 900,000-byte profile budget before committing; failure preserves the box. Upgrades can reduce an already-full bag.
- Attack, per-army city defense, city walls, movement, recovery and new city repair use the caps above. Existing march snapshots and repair deadlines remain unchanged. City shield bonuses retain their destination-owner scope for allied troops. No new Gatehouse shield benefit is added to Clan Tower defenders.
- **Production caps are deferred.** Higher-rarity production gear is active, but current additive production and exact offline objective/timed-item accounting remain intact. The proposed 250/350/250 percent ceilings are a design study, not runtime behavior. A later change needs bounded exact interval accounting and separate approval.
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

Branch: `codex/skill-point-efficiency`. Pull request: [#402](https://github.com/explocion200/CrownLands/pull/402). Updated gear bonuses are not merged or deployed.
