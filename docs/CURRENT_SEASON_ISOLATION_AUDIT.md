# Current-season isolation audit — October 23, 2026

## Scope and observed release

Owner request: keep test/old-season data out of current gameplay and retain only previously approved carryover. No new persistence or gameplay policy is introduced.

The read-only production check used `local-live` build `a624354778aff53442282a28db59ef7082e4447c`, PostgreSQL game schema `migration_game_live`, and the authoritative `realmConfig/current` pointer: `realm-2026-10`, `main-realm-2026-10`, canonical `shard_0001`, readiness `ready`. Client/server release contracts select monthly-shared `core-expansion-v1`; the July fallback identifiers in the files are not the live pointer. Archived worlds were not changed or reinitialized.

## Live evidence

- Public game/auth routing goes to permanent services on loopback ports 9291/9290. The active rehearsal services use separate identities and schemas. PostgreSQL denies both rehearsal roles access to the live game schema/table, and denies the live game/worker roles read access to preview game schemas. Names such as `functions/`, `migration_*` and shared fixture geometry helpers alone do not identify which backend or data source is live.
- All 5,045 cities, 12 camps, 763 NPC records and 80,755 public map-army records under current map parents matched the October generation, world and shard. Army records include retained inactive history; this is not a concurrent army count.
- All five current Clan standings matched scope. Of 171 Kingdom standings documents, 166 matched; five were empty or partial clan-identity projections without seasonal scores/identity metadata. Existing scoped Kingdom queries exclude those five. They were not deleted or assigned fabricated scores.
- No current profile had the checked `fixture-`, `sample-`, `emulator-`, `test-` ID prefixes or `@example.test` email suffix. This is a bounded signature check, not proof of every account's provenance.
- Dormant older profiles and 34 older/unscoped Camp-progress records remain physically stored. Retention is not gameplay carryover: normal starting-city admission replaces seasonal profile state; current-season queries exclude archived gameplay. The 96 current Camp-progress records all had shard metadata.
- Stripe test checkout uses `crownPaymentSandbox`, never the playable cosmetics/Crown wallet. Its existing boundary tests passed. This audit did not submit payments or send messages.

All production queries were read-only, bounded/indexed and returned scope aggregates or allowlisted metadata. No balances, ownership, troops, historical records or private account contents were rewritten or exported.

## Hardened read paths

The audit found defenses missing from individual direct-read paths even though normal UI queries already filter seasons:

1. Local map-object reads now require both a current map path and current record metadata. A current owner field cannot make a foreign map path readable. Missing objects remain valid missing responses.
2. Fixed-ID Camp progress rejects older/wrong-world/wrong-shard records. Current pre-shard Camp/presence records remain compatible only inside their current world/generation. The Camp UI displays no current progress for denied old records; network/server errors still propagate for retry.
3. Clan standings validate record scope as well as the board path.
4. Combat/public identity lookup rebuilds a misplaced standing only from an eligible current profile, and checks scope again before returning it. A historical/malformed standing cannot supply current power or a Main City.

The same local permissions protect ordinary document reads, query rows and batched watch responses. A denied seasonal watcher does not suppress an unrelated authorized account watcher. Existing authenticated area reads already require current membership, project allowed fields and invalidate views on realm/permission changes.

## Carryover checked against confirmed rules

| Preserved | Reset or unavailable as current progression |
| --- | --- |
| Name, full flag, account creation, notification preferences; technical authentication/session state | World Gold, city ownership/levels, garrisons, armies, reinforcements, camps/objectives and their benefits |
| Clan identity/heraldry, roster and roles | Treasury balance/ledger, clan seasonal power/activity, gifts, goals, rallies, Tower buildings and private intelligence |
| Gear instances, equipment, levels/progression and unopened Common/Uncommon boxes | Normal Bag consumables, active item effects, seasonal purchase usage, personal battle/scout reports |
| Crowns, cosmetics/selections, receipts and current UTC-day allowances | Seasonal Hero XP/levels/skills/presets and achievements/rewards |
| All twenty estate buildings, materials, jobs/deposits/receipts, champions and approved estate progression | Guild world-Gold/troop rewards cannot be claimed into a different realm; permanent estate rewards follow their separate existing rules |
| Daily Login cycle/pending earned rewards; account stamina/refill history under the separate UTC-day rules | A season change must not grant an extra daily allowance/refill or repeat a claim |
| Friends, blocks, preferences, private conversation contacts and retained messages under existing retention/access rules | Historic location links cannot navigate into a new season |
| Read-only final-season standings and explicit one-time seasonal Gear awards | Archived standings are not active scores |

Existing fixed-deadline administrative production exclusions also retain their original expiry as explicitly required by the Master Specification. Their presence is not a test bonus and this audit does not restart/remove them. No additional carryover was added.

The older reset-status table in the Master Specification predates the implemented estate and public-ranking systems. Its `PLANNED` entries are historical status, not a reason to erase approved permanent progress.

## Validation and rollout

The targeted validation plan covers real PostgreSQL starting-city rollover/retry, seasonal reset versus permanent stores, forged/misplaced standings, denied direct/list/watch reads, current Camp results and failed network reads. Existing reset/clan/Gear and combat-authorization emulator suites remain required. Real local-reader tests exercise 112 areas and the 24-case visibility matrix; permanent-service tests use an independent PostgreSQL cluster. Payment tests use mocked Stripe transport. Camp browser validation covers 1440×900, 844×390 and 568×320 with fictional data.

The reset-source validator's filter-order assumption was corrected: an immediately preceding `worldId` filter scopes the same query as a following one. No runtime Treasury query or gameplay rule changed.

This feature requires a compatible backend/client installation; a merge does not deploy it. No database migration, archive cleanup or player-data rewrite is required. Keep the automatic publisher's backend compatibility hold. After required exact-head checks and merge, obtain applicable installation approval, install the matching game/worker runtime with the established installer, release the matching client, and verify installed/public build identities, source hashes and health. Existing clients keep their own Camp scope filter during transition. Current-season rejection is authoritative on the server.

The read-only audit is a point-in-time check. It does not claim a future monthly production rollover has executed, identify every possible historical test account, or authorize deleting dormant profiles, archived worlds or the five incomplete standings.
