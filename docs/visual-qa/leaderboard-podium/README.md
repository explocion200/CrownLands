# Leaderboard podium and Field of Glory

Approved September 28, 2026; implemented on `codex/leaderboard-podium-draft`. Deployment is verified separately. The original prototype remains available under this directory; it uses fictional data and is excluded from production builds.

## Approved presentation

Tabs appear as **Top 100 Kingdoms → Top Clans → Field of Glory**. All three boards use parchment, burgundy and restrained gold/silver/bronze, with existing saved flags and clan heraldry. The first three entries appear in visual order 2 / 1 / 3, first place raised in the centre, with accessible reading order 1 / 2 / 3. The remaining list begins at fourth. Full totals and existing ruler/clan profile links remain available.

Personal standing comes only from a published Top 100 entry. Find my rank scrolls to it without inserting a local score. Fewer entries produce fewer podium places. Loading, failure, empty, signed-out and unranked states do not retain a stale personal score. Tabs and the footer remain fixed; podium and rows scroll together. Desktop and landscape mobile use the real game modal, not a scaled image.

## Authoritative seasonal scoring

The approved contract is in Master Specification §13. One kill means one enemy player-owned troop defeated before recovery, credited on attack or defense regardless of victory. Neutral troops, wall damage, self/friendly encounters, travel, donations and production do not count. Recovery and XP bonuses do not alter kills.

`functions/pvp-leaderboard.js` uses the immutable battle snapshot's actual per-player losses and effective combat contributions. Solo city and royal-holding battles, rallies, occupied Camps and Clan Towers share the existing detailed snapshot writer. The scripted NPC Citadel assault is excluded. Shared battles allocate integer credit by largest remainder, with stable UID rounding. City defense includes its owner's wall contribution; clan Tower walls are not assigned to one member.

The authoritative battle transaction creates one private `pvpKillEvents/{realmStorageId}/events/{battleId}` event alongside the report. `applyPvpKillEvent` applies every recipient in a separate transaction, marks the event processed in that same transaction and retries failures. This durable receipt must not expire: deleting it would weaken replay protection. Scoring changes no player profile, Gold, troops, gear, XP or King Power. Arrival handling and existing schedulers keep their settings.

Totals live separately in `pvpLeaderboards/{realmStorageId}/entries/{uid}` and cannot be overwritten by ordinary power-board/profile publication. Scope is the battle's world, generation and shard, including delayed events after rollover. Ranking sorts kills descending, the last credited battle time ascending, then document ID. The last battle time is the maximum timestamp across credited events, so out-of-order processing does not alter tie results.

The client reads at most 100 rows, then joins current public identity in chunks of at most 30. Scores are canonical even after name/flag/clan changes or city loss. Missing public identity uses the existing generic ruler fallback. Requests are rejected after account, session activation, generation or realm changes. Rankings load on tab selection or Refresh; no polling/subscription is added.

The first season is partial. The footer labels its first recorded eligible battle date and excludes earlier fighting. No invented backfill is performed. The next season starts separately at zero. Final locking/archive infrastructure and rewards remain unchanged/planned. No per-opponent cap is introduced.

## Verification

- `tools/test-pvp-leaderboard.js`: casualty conservation, shared rounding, neutral/self/friendly exclusions, recovery independence, walls and original event scope.
- `tools/test-pvp-leaderboard-client.js`: scoped bounded queries, identity chunks, canonical scores, empty results and account/session/world/generation guards.
- `functions/test/emulator-pvp-leaderboard.js`: actual event-trigger delivery, duplicate/concurrent consumers, unchanged economy, rollover/delayed events, and client read/write authorization.
- Existing city gear/recovery and Clan Tower combat emulator suites now assert the authoritative outbox credits against actual resolution snapshots, including retries and simultaneous captures.
- `tools/validate-leaderboard-podium-browser.js`: actual game at 1366×820, 844×390 and 568×320; all tabs, 2/1/3 order, 100 unique ranks, full totals, scrolling, keyboard, refresh, empty/failure/few-entry states and detached-modal responses. Synthetic fixture data only.
- Production artifact and asset budget checks bound the client increase to 24 KiB, with no new art, font, library or startup request. Presentation files have a scoped 12 KiB increment; startup cache remains within its existing budget.

Local evidence is under ignored `release-artifacts/leaderboard-live/`. GitHub must pass Static validation, Multiplayer emulator validation and Validate on the exact PR revision before merge.

## Release order

1. Validate the exact feature revision and verify the live realm pointer is unchanged.
2. Deploy the additive Firestore indexes/rules and wait for indexes to be ready.
3. Deploy `applyPvpKillEvent` before updating battle writers. Then update all actual combat entry points and verify their revisions. No historical data migration is required.
4. Merge only after all required checks pass. Verify the production frontend's merged commit and matching source manifest, rules/indexes, trigger and combat revisions. Synchronize and verify local main.
5. Read-only production queries/logs can verify infrastructure without generating synthetic player battles. First real battle credit and physical-device feel require observation separately; do not claim them from fixture tests.

The original review is served at `/docs/visual-qa/leaderboard-podium/index.html`. Its sample names/totals are never production data. No itch.io publication is part of this web/backend release.
