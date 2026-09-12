# Daily Login: persistent cycle approval draft

Status: **APPROVED FOR IMPLEMENTATION, MERGE AND DEPLOYMENT** on `codex/daily-login-cycle-draft`. The design page remains an isolated simulation. The approved rules are implemented in `functions/dailyLoginRewards.js`; the game uses `daily-login-ui.js` and `daily-login-ui.css`. Release evidence records deployment verification.

Open `index.html?viewport=landscape` through the existing preview server. Target sizes: desktop 1440 × 900, mobile landscape 844 × 390, small landscape 568 × 320. Window dimensions match the Shop/Bag cap of 1200 × 790, fitting the viewport with 12px margins. Portrait is not a design target. The draft changes only Daily Login; Quests and Achievements are separate future work.

## Confirmed user decisions

- Personal 28-day cycle, four complete weeks.
- Keep cycle progress across server/season resets, resuming after the last completed day.
- Use the existing Common Gear Box, which opens into three Common gear pieces; no new armor-only chest type.
- Mark the end of each week and give better rewards toward that point.
- Randomize each new cycle's reward arrangement.

## Approved schedule

The current 28-day track's total envelope is retained: **111 production hours of Gold, 111 production hours of troops, one of each of the six existing items, and four Common Gear Boxes**. Current source already adds one Gear Box to every seventh login claim; the new presentation makes these bundles visible. Removing expiry and repeating personal 28-day cycles changes calendar-time progression, even with the same per-cycle totals.

| Cycle days | Proposed bundle | Randomization constraints |
| --- | --- | --- |
| Days 1–4 of each week | 2–6h of Gold or troop production | Each week has two Gold and two troop days. For each resource, the eight early-week values across the cycle are 2, 3, 3, 4, 4, 5, 5, 6. |
| Days 5–6 of each week | 8–13h of production; six of these eight days also include an item | Each week has one Gold and one troop day. Each resource uses 8, 10, 12, 13 once. Day 6 always includes an item; two randomly chosen Day 5 slots also include an item. Each of the six existing items appears once per cycle. |
| Days 7, 14, 21, 28 | 16 or 20h of production **plus one Common Gear Box** | Two Gold and two troop milestones. Each resource uses 16 and 20 once. Chest days stay fixed and clearly marked. |

Every cycle has the same total envelope, while resource order, resource amounts within their bands, and item placements change. Later weeks are not required to be stronger than earlier weeks; each individual week has a clear end-of-week increase. All upcoming bundles are inspectable. Resource amounts shown in the draft use sample current base production and remain estimates until collected.

## Approved continuity and claim behavior

- A missed day pauses progress. Returning after seven days away earns one attendance day, not seven retroactive rewards.
- Preserve the existing cap of two earned rewards waiting for collection. Carry both these earned rewards and their original arrangement across seasons; do not expire them at a month boundary.
- Preserve the last UTC attendance and claim guards across a reset, so resetting or reconnecting does not create a second attendance credit for the same UTC day.
- Collect the oldest earned day first. If today's attendance was deferred by a full queue, claiming frees a slot for that day's attendance, as in the current system.
- Generate the next cycle only after the last reward in the active cycle is collected. Preserve the attendance guard at that boundary: finishing Day 28 cannot invent an extra attendance day. If a genuinely uncredited attendance day was deferred, it may fill the new cycle's freed slot.
- Carry the day and schedule through season reset even if the player has no new-world main city yet. Claiming still requires a valid owned main city. Resource rewards use the current world's base production at claim time, not stale city IDs or old-season balances.
- A cycle's arrangement cannot be rerolled by reopening, a calendar change, selecting a different realm, retrying a claim or resetting the season. The review-only “Preview a fresh cycle” control creates another synthetic example; it is not a proposed player reroll action.

## Verified current implementation and conflict

Audited against `beb9c1d537aa29d25e9b047240b127ca89459e6f`:

- `functions/index.js` has reward schema 3 and 28/29/30/31-day tracks loaded from `functions/economy-config.json`, mirrored into `economy-config.js`.
- `normalizeDailyLoginRewardState` changes `nextDay` to 1 and clears earned progress when the UTC month key changes.
- `createFreshResetPlayerProfile` separately overwrites Daily Login with `createDefaultDailyLoginRewardState()`. Removing only the month-bound UI would not solve season resets.
- `claimDailyLoginReward` resolves the fixed track from the month length, guards claims with the month and ordinal, validates an owned current-world main city, grants base-production rewards, and adds a Common Gear Box when `day % 7 === 0`.
- The current renderer in `game.js` shows the fixed monthly grid. The current validation in `tools/validate-daily-login-rewards.js` explicitly expects monthly rollover and reset-to-default behavior.
- The Master Specification's live monthly reset/expiry rule conflicts with the requested future design. Its Daily Login section now distinguishes live behavior from the user's confirmed replacement requirements.

## Integration contract

1. Introduce a versioned, account-owned cycle identity and persisted schedule, with server-generated randomness and transactional creation. This draft's seeded pseudorandom generator exists only to make review examples reproducible; it is not an authority or production randomness implementation.
2. Preserve the cycle, pending rewards and UTC attendance guard in every applicable current-realm seasonal profile transition. Audit global/account persistence and shard entry paths so changing realms cannot create independent duplicate attendance or rerolls.
3. Replace month-based claim guards with cycle identity and monotonically increasing claim ordinal. Keep atomic delivery, replay-safe receipts, valid main-city checks, and concurrency protection. Never trust a client-provided reward, seed or day.
4. Migration proposal: freeze and carry the currently stored 28–31-day track and pending progress as a transition cycle, finish it, then begin the first randomized 28-day cycle. This preserves existing Day 29–31 and queued entitlements rather than truncating them. Read raw saved state before the old monthly normalizer can discard it. Avoid re-crediting previous claims; preserve/translate stale-request rejection. This transition policy was included in the approved draft.
5. Integrate the approved presentation with the authoritative status/claim pathways; keep other reward tabs unchanged. Coordinate client and Functions release versions so old clients cannot submit monthly claims against a new cycle unnoticed.
6. Validate migration (including Day 29–31), rollover with pending/deferred attendance, duplicate and simultaneous claims, season reset on the same UTC day, month/leap-year changes, multi-device/shard entry, no-city recovery, Box persistence and 28-day completion. Required release gates apply to that gameplay/backend update.

## Draft verification

- `node docs/visual-qa/daily-login-cycle/validate-draft.cjs` checks 200 generated schedules, totals, all six items, four fixed chest milestones, weekly reward bands, deterministic active cycles, missed-day behavior, two-reward queue, season carry-over, new-city production, replay guards in the simulation, and full-cycle rollover.
- Browser review passed 15 combinations across the three target sizes, plus complete bundle selection, weekly navigation, claim visibility, queued claims, season reset/new-city recovery, cycle completion, and fresh cycle examples. See [recorded visual checks](./visual-checks.md).
- These checks validate the local draft, not production persistence, real account claims or server concurrency. No production scripts, configuration, data or backend functions are changed by this draft.

## Artwork

Reuse the approved six Shop illustrations and oak-and-iron Common Gear Box. All chest displays use `assets/icons/common-gear-chest-r1.svg`, the same closed-pose illustration used by the Bag and Shop item definition. Gold uses `assets/icons/royal-shop-gold-r1.svg`. `troops.svg` reproduces the established City Details engraved helmet path, with muted iron colors. No new generated art or image API was needed.

## Account and release integration

The existing `players/{uid}` document is global, outside realm generations and shards. Status and claim transactions use its protected `dailyLoginReward` field; season entry preserves it in `createFreshResetPlayerProfile`. No new collection or cross-shard copy is needed. The live pointer was verified as `main-realm-2026-09`, generation `realm-2026-09`, shared realm `shard_0001`. Only the current release is targeted. Schema-3 economy tables remain for transition schedules; active reward state uses schema 4. Older clients are rejected at the claim boundary without granting rewards.
