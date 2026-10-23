# Clan Lost Holdings

Confirmed October 23, 2026. Implemented on `codex/clan-war-cities`;
the capture/return feature was verified live through PR #708 at build
`c28ca465aaf34db22c4440162881760db1190fb8`. The Lost Holdings naming and
location-icon refinement is confirmed on the same date and awaits its own publication.

## Behavior

The fifth Clan tab preserves the current parchment/burgundy window on desktop
and landscape phones. Each row identifies the city and map, original clanmate,
captor at the loss, current holder and Lost/Recovered state. The tab is named
**Lost Holdings** and uses the existing map-and-flag location icon. Location navigates
without sending an army. Normal attacks and their existing protections still
govern recapture, including weak-player protection. Listing a city grants no
extra attack, retaliation or capture permission. The recovering owner gets the
Return city action on the same row, to the right of the location icon, when the
open board refreshes. Other members see who recovered it. This feature adds no
ordinary-city rally exception.

Only the current recovering owner can voluntarily return a city, and both rulers
must remain current members of the same active clan. Officers cannot give away
another member's holdings. A confirmation identifies the recipient. The original
member receives the city at its current level, investment and wall state. Their
own remaining Shield deadline applies, including existing wall-repair eligibility.
The recovering player's troops march to the nearest eligible holding they own,
using the existing relinquishment safe-destination behavior and ordinary transfer
speed. No Stables bonus or instant troop donation applies. Allied reinforcements
are recalled by the existing ownership-change worker.

Main Cities/objectives cannot be returned. Incoming marches, assembled rally
troops and an active capture/retaliation no-abandon lock must clear first. A new
Main City designation is shown as a blocked return. Normal city capture remains
unchanged, including linked-account, former-clan, shield, power and neutral-cap
rules. A friendly restoration grants no XP, conquest credit, capture reward or
new neutral lineage; it does not damage walls or drop another level. This is a
specific restoration of a recorded loss, not arbitrary city gifting or daily
relinquishment to neutral ownership.

## Persistence and privacy

`functions/clan-war-cities.js` records actual regular-city captures in the same
transaction as combat settlement. Each private `clans/{clan}/warCities/{key}`
record is qualified by world, generation, shard, map and city. A subsequent loss
by a recovering clanmate preserves the original member's claim. Direct recovery
by the original member closes it. Stale requests carry a different loss token
and cannot return a later loss. Operation receipts under the sender serialize
retries without duplicating cities or marching troops. Both economies and
ownership-derived stats settle atomically.

The authenticated `clanWarCities` command returns at most 25 summaries per page,
checking current clan/roster membership and current city ownership on every read
and return. Raw records and receipts have no client read/write permission under
the existing default-deny adapters. No private troop numbers, profile inventory
or account fields enter public clan/city responses. Leaving, disbanding, realm
rollover and membership changes revoke access. Archived records are neither
modified nor surfaced in the current season. The open tab refreshes every five
seconds; closing it stops polling. Identity changes discard pending responses and
clear its in-memory board; errors clear stale entries. No localStorage board cache.

Tracking starts with captures after installation. Existing ownership events do
not reliably record clan membership at the time of loss, so no historical clan
claims or player-data backfill are inferred.

## Validation

- Shared adapter cases: original loss, recapture/re-loss lineage, direct recovery,
  membership and generation isolation, private summaries, bounded pagination,
  concurrent return retries and stale-loss rejection.
- Real PostgreSQL commands: three fictional players, actual combat loss and
  recapture, protected raid without a weak-player bypass, guarded return, matching
  Shield deadline, unchanged walls/level,
  preserved XP, both ownership stats, real return march and duplicate settlement.
- Source and built UI: 1440×900 mouse and 844×390 / 568×320 simulated touch;
  five-tab layout, shared location icon, same-row live recovery, safe location-only
  navigation, scrolling/focus, confirmation/cancellation, failed requests and
  old-session response rejection, and background/resume polling. Screenshots and measurements are generated in
  ignored `release-artifacts/war-cities/`.
- Selected existing combat, travel, relinquishment, Shield and Clan UI regressions
  are listed with exact-base dependency coverage in `validation-plan.json`.

The lazy Clan stylesheet stays below 90 KiB. The offline-shell addition remains bounded
at 8 KiB and introduces no artwork or dependencies. Board polling is confined to
the open tab, never the map rendering loop.

## Rollout

The supported production topology remains `core-expansion-v1`, backed by the local
PostgreSQL command adapter. The verified current realm before implementation was
`main-realm-2026-10` / `realm-2026-10` / `shard_0001`. No archived-world work or SQL
schema migration is needed; the document store persists new records on captures.
The retained Firestore index declaration covers the equivalent bounded query for
emulator/adapter compatibility; this does not authorize a Firebase deployment.

Install the reviewed `functions/index.js` and new `functions/clan-war-cities.js`
with the matching release manifest through the existing approved backend workflow,
then release the compatible client. Verify service health, source fingerprints,
authority epoch and the public build before calling the feature live. The static
publisher must hold the merged client until this backend is installed; do not
update its compatibility fingerprint merely to bypass the hold. An older backend
returns an unavailable state and cannot enable the return controls. Installation
needs separate authorization; merging alone neither installs nor deploys this
feature. No production ownership rewrite or database backup is part of this change.
