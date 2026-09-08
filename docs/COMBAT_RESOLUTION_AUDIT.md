# Combat resolution audit — September 8, 2026

Baseline: `c8b56bb6a6c0cebf6a15c17dc5c4701a50ef400c`.
Feature branch: `codex/combat-resolution-audit`.

This audit covers launch-time Rally strength, overlapping battle resolution, troop accounting, and the relationship between scout forecasts and battle reports. The intended rules come from sections 5 and 9 of the [Master Specification](CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md). No new combat balance rule is introduced.

## Findings and changes

| Area | Finding | Result |
| --- | --- | --- |
| Rally attack strength | `getRallyAttackPackages` replaced stored attack skills and gear with live profiles at arrival. A regression reproduced a launched 125-power contribution becoming 212 power after a skill/gear change. | Preserve each participant's launch-time attack fields and the stored combined attack total. Current identity and Field Medics recovery still refresh at resolution. Stronghold, Citadel, and Holding Tower Rally resolution share this helper. |
| Overlapping arrivals | Army, target ownership, defending packages, and wall state are read and settled transactionally. Previously resolved armies exit before applying another battle. | Added actual callable contention tests for wall damage, duplicate resolution, two friendly-after-capture arrivals, and independently hostile competing attackers. No transaction rewrite is needed for the exercised scenarios. |
| Troop accounting | Reinforcement records and the target's aggregate garrison change atomically with combat or recall. Casualty recovery uses a separate transaction guarded by a pending settlement receipt. | Added conservation, recovery, recall-race, and replay assertions, plus deterministic casualty-allocation checks for 2, 3, 5, and 20 participants. |
| Forecast explanations | Attack reports retained the launch forecast, but the detailed report renderer did not compare it with the recorded battle. | Add an optional “Defense changed after scouting” disclosure to the attacker's detailed report. It compares recorded ownership, wall power, owner troops, reinforcement troops, and total defense using exact numbers. |

The forecast comparison describes observed differences. It does not infer whether a particular wall change came from repairs, an upgrade, another attack, or a bonus. Missing or invalid forecasts, defender views, and unchanged defense produce no comparison. Historical scout information remains a historical snapshot; current city state is not fetched to reconstruct past battles.

## Regression coverage

- `tools/validate-clan-rallies.js`: upgrading or removing skills and gear after launch cannot alter attack power; live casualty recovery remains intact; stored combined power is retained; integer casualty allocation conserves each participant's troops and is independent of input order.
- `functions/test/emulator-rally-lifecycle.js`: compare the saved launch package with the actual battle snapshot after changing the ally's skills and gear during travel. Existing capture, immediate counterattack, stale-return, 20-player launch, cancellation, and creator-departure coverage remains in place.
- `functions/test/emulator-battle-report-gear-effects.js`: distinct wall hits and duplicate resolution compete concurrently; a definite garrison hit produces attributable allied losses and Field Medics recovery; repeated resolution does not credit recovery again; recall competes with a further attack without losing or duplicating troops; two same-ruler attacks capture once and transfer the second army; two different rulers fight the owner and garrison left by the preceding battle.
- `tools/validate-combat-forecast.js`: report comparisons cover changed ownership, increased walls, depleted walls, changed garrisons, recalled reinforcements, unchanged defense, invalid intelligence, and defender privacy.
- Focused browser review: expand, scroll, and collapse the comparison using the actual game renderer and styles at 1440×900, 844×390, and 568×320. The comparison uses the existing parchment palette and has no horizontal overflow.

## Validation and release scope

Use Node.js 22 and the normal `pnpm run prepare-pr` gate, including static/browser validation and the complete multiplayer emulator suite. Required GitHub checks are `Static validation`, `Multiplayer emulator validation`, and `Validate`; their final results and deployment status belong in the pull request.

The focused combat tests use the repository's existing isolated emulator harness. They exercise shared combat implementation without changing any world topology or generation data. No production battle, player-data repair, migration, or reset is part of this audit. These tests cover specific adversarial interleavings, not every possible concurrent schedule. Merge and deployment must be verified separately before describing the corrections as live.
