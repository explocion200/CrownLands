# Leaderboard podium and Field of Glory

Status: **DESIGN DRAFT — pending user review.** Branch: `codex/leaderboard-podium-draft`. No live leaderboard, combat, score, schema, release setting or production asset has changed. This does not implement seasonal kill tracking.

## Review

Serve the repository root locally and open `/docs/visual-qa/leaderboard-podium/index.html`. The review wrapper provides desktop (1366 × 820), landscape mobile (844 × 390), and small landscape (568 × 320) previews. `preview.html?section=glory` opens the game-sized view directly. Tabs, keyboard navigation, current-rank lookup, profile-preview notices, refresh, scoring notes, Close/Escape and reopen work with fictional in-memory data.

The user's two supplied reference images establish the podium arrangement and personal-standing card. This draft uses Crownlands' parchment, burgundy cloth, olive ink and restrained ceremonial metal. Existing flag charges, the packaged clan heraldry renderer and the current illustrated crown supply the artwork. No external assets, generated art, fonts or services are required.

The three tabs are **Top 100 Kingdoms → Top Clans → Field of Glory**. The proposed medieval title is paired with the clear score label **PvP kills** and the explanation **Enemy troops defeated · this season**.

- The top three appear in visual order 2 / 1 / 3, with first place raised in the centre. Reading order remains 1 / 2 / 3.
- Player podiums use heraldic flags; clans use their shields. Live integration must use saved identity, not the sample choices.
- The list starts at fourth; podium entries are not duplicated below it. Fewer than three entries do not create fictional placeholders.
- Full totals remain visible. Gold, silver and bronze indicate rank; there are no new rank rewards or permanent titles.
- Your standing comes only from a published entry. An absent entry says “Not in the Top 100”; it does not invent a global rank or insert a local score.
- Tabs and personal standing remain visible while the podium and rows scroll together. List headings stick while scrolling. On short screens the redundant section heading is removed so scores have room.
- Example controls cover first-place personal rank, long names/large totals, unranked, two entries, loading, empty, failure and signed-out states.

This proposes a podium addition to the approved September 16 ledger in Master Specification sections 13 and 16. Existing Kingdom and Clan score rules remain intact. The Master Specification is deliberately unchanged while the new presentation and scoring details await confirmation.

## Proposed seasonal PvP accounting — not implemented

The user has requested a player ranking of total PvP kills accumulated during the season. The following is the proposed precise contract, not an assertion about current live behavior.

| Question | Proposed rule |
| --- | --- |
| What is a kill? | One enemy **player-owned troop defeated**, not one player, city, battle or point of wall damage. Count raw defeated troops before recovery provisionally; the user has been asked whether recovered troops should count. |
| Attack and defense | Credit both sides for qualifying enemy troop losses, whether they win or lose. |
| Battle locations | Eligible player casualties at cities, Clan Towers, occupied Camps and Strongholds/Citadel. Filter ownership per troop contribution at resolution; a player-held objective can still contain neutral troops. |
| Exclusions | Neutral/NPC defenders, own troops, friendly/same-clan encounters, travel, donations, production and wounded-troop recovery. Do not multiply kills by XP bonuses or troop strength. |
| Shared battles | Divide the eligible pool among actual participants using authoritative effective attack/defense contributions. Use deterministic integer rounding; the sum of awarded credit must equal the eligible pool. Never give every participant the full battle total. Exact weighting needs approval and a resolver audit. |
| Season | Credit the season in which the authoritative battle resolves. Save the season identity with the event. Retries cannot move old credit into a new season. Start a separate current-season total at rollover. |
| Realm | Follow existing world/reset-generation/shard boundaries and access rules, rather than exposing other realms through a client filter. |
| Ordering | Highest total first. Proposed tie-break: earliest server time reaching that total, then a stable internal key. Do not change existing power-board tie behavior in this update. |
| Identity | Total follows the player, surviving name/flag/clan changes. Display current authorized public identity. |
| Rewards | No new rewards, combat modifiers, King Power contribution or attack-range effect. |
| History | Plan final read-only seasonal snapshots consistently with the existing history policy; final locking/archive infrastructure is still planned in the current specification. |

Server integration should create a deterministic battle-credit event in the authoritative battle transaction, or use a transactional outbox with an idempotent consumer if extra participant writes would exceed transaction limits. The event and per-recipient application key must include the season and battle identity. A retry/reconnect/duplicate trigger must not increment twice, and every eligible participant must receive exactly one allocation. The client only reads rankings.

Audit every resolver before adding tracking, including solo city fights, rallies, Clan Tower battles, reinforcements and player-held objectives. Keep neutral and player losses separate, and use actual casualty allocations rather than XP credit, estimated scouting figures or report text. This draft does not claim all existing paths already expose the required per-player values.

For a mid-season release, do not claim totals cover earlier fighting unless a complete authoritative history can be verified and backfilled idempotently. Prefer starting at the next season, or clearly label the tracking start date for a partial first season. Battle reports alone are not assumed to be a complete durable history. Season-wide farming/moderation policy also needs a decision; this proposal introduces no hidden cooldowns, kill multipliers or per-opponent caps.

## Repository evidence

Reviewed on base `d736d0d3e52be6d67d893c4c895cfb8ef36a78e9`:

- Master Specification §§13, 16, 17, 18; Crownlands Art Bible; existing `docs/visual-qa/leaderboards-ledger/`.
- `game.js`: `showLeaderboardModal`, `setLeaderboardTab`, `renderLeaderboardRows`, `refreshClanLeaderboardRows`. Current tabs are Kingdoms and Clans, with saved power totals.
- `functions/index.js`: combat outputs include `attackerLosses`, `defenderLosses`, `killedAttackers`, `killedDefenders`; tower resolution allocates casualties through `allocateDefenderLosses`; rallies have participant contributions and `allocateRallyAttackXp`. That XP allocator is evidence of shared contribution data, not a new kills rule.
- The rally city path already apportions `defenderLosses` for `BATTLE_RESOLVED` daily-mission events. Those events are not evidence that a complete seasonal PvP leaderboard exists.

## Validation and integration boundary

Local Chromium review checks all three categories at each supported viewport, all eight alternative fixture states, the 2/1/3 visual order, unique ranks, no horizontal overflow, rank lookup, keyboard tabs, scoring-note dismissal, refresh recovery and close/reopen. Asset requests stay local; no Firebase or player data is accessed. Detailed results and screenshots are in the ignored `release-artifacts/leaderboard-podium/` directory; see [visual-checks.md](visual-checks.md).

The affected validation plan selects the production-artifact validator to confirm existing shipping paths/build budgets remain valid. The draft is under `docs/` and excluded from the production client. No backend/emulator suites are selected because no authoritative runtime code changes.

Before runtime implementation, confirm the proposed name/presentation, recovered-troop policy, shared-credit weighting, tie-break and first-season start policy. Then implement counting and querying with focused combat, recovery, season isolation, rules/index, duplicate delivery and landscape UI tests. This draft requires no deployment.
