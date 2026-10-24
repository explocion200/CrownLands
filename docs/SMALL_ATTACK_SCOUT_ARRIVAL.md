# Small attacks resolving as scouts

October 24, 2026. Branch: `codex/small-attack-scout-arrival`.
Status: implemented; focused PostgreSQL and static checks passed. Required PR checks
and merge remain pending. Not deployed.

An outbound player attack with 1–49 soldiers resolves as scouting when it reaches
an enemy regular city whose authoritative level is at least 61. The target level
and ownership are read at arrival, including upgrades during the journey. A
50-soldier attack or a level-60 target continues to use the existing siege rules.

The accepted order stays an attack throughout travel. Its route, timestamps,
launch permissions, offensive Shield cooldown and Shield removal are unchanged.
Current allies, Main Cities, Peace Shields and revoked retaliation retain their
existing blocking/return behavior. Non-city objectives, neutral targets, combined
Rallies and automatic hostile return/transfer conversions are excluded.

The existing scout settlement writes the private snapshot, its original ten-minute
expiry and the defender's disclosure. It applies Veil of Silence at arrival and
cannot reach wall/garrison damage, capture, battle XP or reward settlement.
Successful scouting consumes one soldier. Surplus troops receive a deterministic,
separate safe return order along the accepted route. Veil-blocked parties return
all soldiers. Return settlement uses the existing source/Main City fallback.
The original attack is resolved atomically with the report and return creation;
concurrent retries cannot create another return or restart the intelligence timer.
Retaliation is released, not spent, because combat did not occur.

The existing client handles `kind: scout`, scout reports and a returned `movement`
without a new UI or public API. The completed attack retains its launch kind;
its result records `convertedFromAttack`, `scoutTroopsUsed` and `returnArmyId`.
These optional fields require no migration. Private intelligence stays out of
public island report projections. Existing accepted journeys retain their timing;
qualifying attacks still travelling when the backend is installed use the new
arrival rule. Completed orders are never reinterpreted.

Validation uses fictional accounts only:

- Passed: pure boundaries and excluded orders/target types.
- Passed locally: shared actual-command cases against disposable PostgreSQL with current
  continuous routing. The same cases are selected for the scouting/Veil emulator suite in CI.
- Arrival level changes, 1/49/50 soldiers, private report expiry/replacement,
  duplicate dispatch and concurrent settlement, unchanged walls/defenders/XP,
  safe surplus returns, Veil, Shields, Main Cities, recalls, neutral targets and
  ownership/clan changes, and releasing retaliation without spending or extending it.
- Existing scouting report lifecycle, rendering, continuous-city intelligence,
  siege, Peace Shield and departure-snapshot validators passed for shared consumers.
- Passed: reused scout report and arrival presentation at 1440×900, 844×390 and
  568×320 (the landscape fixtures used 4× CPU throttling). Production endpoints
  were blocked. Evidence is in `release-artifacts/scouting-responsiveness/`.
  No client layout was changed.

Release: `functions/index.js` is authoritative in the installed PostgreSQL local
backend through `functions/platform.js`; this is not a Firebase deployment.
The current contract uses monthly shared realms and `core-expansion-v1`.
No catalog, archived generation, production player record or schema is rewritten.
Merge under standing authorization after exact-head required checks. The automatic
publisher must retain its backend compatibility hold until an explicitly approved
home-server runtime installation has passed preflight and verification. Installation
must include the game service and worker so online and offline arrivals agree.
Verify the installed source fingerprint, health/authority epoch and published build
before describing the rule as live. Rollback restores the reviewed prior runtime;
existing scout results and safe return orders remain compatible.
